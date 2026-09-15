import { randomBytes } from 'crypto';

import type { Context } from 'koa';

import { resolveOrderItems, type ProductLookup } from '../../../order/pricing';
import { serializeOrder, type OrderRecord } from '../../../order/serialize-order';
import {
  createAsaasCheckout,
  createAsaasCustomer,
  findAsaasPaymentByCheckoutSession,
  readAsaasConfigFromEnv,
  simulateAsaasPixPayment,
} from '../../../services/external/asaas.service';

function isSandboxAsaasConfig(apiUrl: string): boolean {
  return apiUrl.includes('sandbox');
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function frontendUrl(): string {
  const url = process.env.CHECKOUT_PUBLIC_URL || process.env.FRONTEND_PUBLIC_URL || 'http://localhost:3000';
  return trimTrailingSlash(url);
}

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

function generateOrderReference(): string {
  return randomBytes(5).toString('hex');
}

function readIdempotencyKey(ctx: Context): string | null {
  const key = ctx.get('Idempotency-Key').trim();
  return isUuidV4(key) ? key : null;
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function idempotencyScope(userId: number, key: string): string {
  return `${userId}:${key}`;
}

function hasSamePayload(order: OrderRecord, items: OrderRecord['items'], totalAmount: number): boolean {
  return order.totalAmount === totalAmount && JSON.stringify(order.items) === JSON.stringify(items);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint|duplicate/i.test(error.message);
}

function returnExistingOrder(ctx: Context, order: OrderRecord): void {
  ctx.status = 200;
  ctx.body = { ok: true, data: serializeOrder(order) };
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

    const idempotencyKey = readIdempotencyKey(ctx);
    if (!idempotencyKey) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' };
      return;
    }

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

    const orderQuery = strapi.db.query('api::order.order');
    const scope = idempotencyScope(userId, idempotencyKey);
    const existingOrder: OrderRecord | null = await orderQuery.findOne({
      where: { checkoutIdempotencyKey: scope },
    });

    if (existingOrder) {
      if (!hasSamePayload(existingOrder, pricing.items, pricing.totalAmount)) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_REUSED' };
        return;
      }

      returnExistingOrder(ctx, existingOrder);
      return;
    }

    let order: OrderRecord;
    try {
      order = await orderQuery.create({
        data: {
          user: userId,
          reference: generateOrderReference(),
          checkoutIdempotencyKey: scope,
          items: pricing.items,
          totalAmount: pricing.totalAmount,
          status: 'pending',
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const concurrentOrder: OrderRecord | null = await orderQuery.findOne({
        where: { checkoutIdempotencyKey: scope },
      });
      if (!concurrentOrder) throw error;

      if (!hasSamePayload(concurrentOrder, pricing.items, pricing.totalAmount)) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_REUSED' };
        return;
      }

      returnExistingOrder(ctx, concurrentOrder);
      return;
    }

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

      const base = frontendUrl();
      const checkoutResult = await createAsaasCheckout(asaasConfig, {
        idempotencyKey,
        customerId: asaasCustomerId,
        externalReference: order.reference,
        value: pricing.totalAmount,
        description: `Pedido #${order.id}`,
        successUrl: `${base}/pedidos/${order.reference}`,
        cancelUrl: `${base}/checkout`,
        expiredUrl: `${base}/checkout`,
      });

      if (!checkoutResult.ok) {
        return await failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
      }

      const updated: OrderRecord = await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: {
          asaasCheckoutId: checkoutResult.data.id,
          asaasInvoiceUrl: checkoutResult.data.link,
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

  async simulatePayment(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const asaasConfig = readAsaasConfigFromEnv();
    if (!isSandboxAsaasConfig(asaasConfig.apiUrl)) {
      ctx.status = 403;
      ctx.body = { ok: false, error: 'SANDBOX_ONLY' };
      return;
    }

    const reference = ctx.params.id;
    const order: OrderRecord | null = await strapi.db
      .query('api::order.order')
      .findOne({ where: { reference, user: userId } });

    if (!order) return ctx.notFound();

    if (order.status !== 'pending' || !order.asaasCheckoutId) {
      ctx.status = 409;
      ctx.body = { ok: false, error: 'ORDER_NOT_PENDING' };
      return;
    }

    const paymentResult = await findAsaasPaymentByCheckoutSession(asaasConfig, order.asaasCheckoutId);
    if (!paymentResult.ok) {
      ctx.status = 502;
      ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
      return;
    }

    if (!paymentResult.data) {
      ctx.status = 409;
      ctx.body = { ok: false, error: 'PAYMENT_NOT_READY' };
      return;
    }

    const confirmResult = await simulateAsaasPixPayment(asaasConfig, paymentResult.data.id);
    if (!confirmResult.ok) {
      ctx.status = 502;
      ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
      return;
    }

    ctx.body = { ok: true };
  },
};
