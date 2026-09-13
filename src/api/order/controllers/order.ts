import { randomBytes } from 'crypto';

import type { Context } from 'koa';

import { resolveOrderItems, type ProductLookup } from '../../../order/pricing';
import { toUtcIsoFromSaoPauloNaive } from '../../../order/pixExpiration';
import { serializeOrder, type OrderRecord } from '../../../order/serialize-order';
import {
  createAsaasCustomer,
  createAsaasPixCharge,
  getAsaasPixQrCode,
  readAsaasConfigFromEnv,
} from '../../../services/external/asaas.service';

function makeProductLookup(): ProductLookup {
  return async (productSlug: string) => {
    const product: any = await strapi.db
      .query('api::product.product')
      .findOne({ where: { slug: productSlug, publishedAt: { $notNull: true } }, populate: ['variants'] });

    if (!product) return null;

    return {
      name: product.name,
      variants: (product.variants || []).map((v: any) => ({
        sku: v.sku,
        colorName: v.colorName,
        configLabel: v.configLabel,
        price: Number(v.price ?? product.basePrice ?? 0),
        available: v.available !== false,
      })),
    };
  };
}

// Opaque, non-sequential public identifier — never the row's numeric id
// (see serialize-order.ts for why). 10 hex chars (40 bits) is unguessable
// enough for an order lookup gated behind the owning user's session anyway.
function generateOrderReference(): string {
  return randomBytes(5).toString('hex');
}

async function failOrder(orderId: number, code: string, status: number, ctx: Context) {
  await strapi.db.query('api::order.order').update({ where: { id: orderId }, data: { status: 'failed' } });
  ctx.status = status;
  ctx.body = { ok: false, error: code };
}

export default {
  async create(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const body = ctx.request.body as { items?: unknown };
    const pricing = await resolveOrderItems(body?.items, makeProductLookup());
    if (!pricing.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: pricing.error };
      return;
    }

    const profile: any = await strapi.db
      .query('api::customer-profile.customer-profile')
      .findOne({ where: { user: userId } });

    if (!profile || !profile.cpfCnpj || !profile.addressLine) {
      ctx.status = 422;
      ctx.body = { ok: false, error: 'PROFILE_INCOMPLETE' };
      return;
    }

    const user: any = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id: userId } });

    const order: OrderRecord = await strapi.db.query('api::order.order').create({
      data: {
        user: userId,
        reference: generateOrderReference(),
        items: pricing.items,
        totalAmount: pricing.totalAmount,
        status: 'pending',
      },
    });

    const asaasConfig = readAsaasConfigFromEnv();

    try {
      let asaasCustomerId: string | undefined = profile.asaasCustomerId;
      if (!asaasCustomerId) {
        const customerResult = await createAsaasCustomer(asaasConfig, {
          name: user.username,
          cpfCnpj: profile.cpfCnpj,
          email: user.email,
          phone: profile.phone || undefined,
          postalCode: profile.postalCode,
          addressNumber: profile.addressNumber,
          address: profile.addressLine,
          complement: profile.addressComplement || undefined,
          province: profile.neighborhood,
        });

        if (!customerResult.ok) {
          return await failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
        }

        asaasCustomerId = customerResult.data.id;
        await strapi.db
          .query('api::customer-profile.customer-profile')
          .update({ where: { id: profile.id }, data: { asaasCustomerId } });
      }

      const chargeResult = await createAsaasPixCharge(asaasConfig, {
        customerId: asaasCustomerId,
        value: pricing.totalAmount,
        description: `Pedido #${order.id} - Valhalla Tecnologia`,
      });

      if (!chargeResult.ok) {
        return await failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
      }

      const qrResult = await getAsaasPixQrCode(asaasConfig, chargeResult.data.id);
      if (!qrResult.ok) {
        return await failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
      }

      const updated: OrderRecord = await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: {
          asaasPaymentId: chargeResult.data.id,
          asaasInvoiceUrl: chargeResult.data.invoiceUrl,
          pixQrCodeImage: qrResult.data.encodedImage,
          pixCopyPaste: qrResult.data.payload,
          pixExpiration: toUtcIsoFromSaoPauloNaive(qrResult.data.expirationDate),
        },
      });

      ctx.status = 201;
      ctx.body = { ok: true, data: serializeOrder(updated) };
    } catch {
      return await failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
    }
  },

  async find(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const orders: OrderRecord[] = await strapi.db
      .query('api::order.order')
      .findMany({ where: { user: userId }, orderBy: { createdAt: 'desc' } });

    ctx.body = { ok: true, data: orders.map(serializeOrder) };
  },

  async findOne(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const reference = ctx.params.id;
    const order: OrderRecord | null = await strapi.db
      .query('api::order.order')
      .findOne({ where: { reference, user: userId } });

    if (!order) return ctx.notFound();

    ctx.body = { ok: true, data: serializeOrder(order) };
  },
};
