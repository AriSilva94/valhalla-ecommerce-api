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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function checkoutFingerprint(rawItems: unknown): string {
  const normalized = Array.isArray(rawItems)
    ? rawItems.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const value = item as Record<string, unknown>;
        const qty = typeof value.qty === 'number' && Number.isFinite(value.qty)
          ? Math.max(1, Math.min(10, Math.trunc(value.qty)))
          : value.qty;
        return { productSlug: value.productSlug, variantSku: value.variantSku, qty };
      })
    : rawItems;
  return JSON.stringify(canonicalize(normalized));
}

function hasSameFingerprint(order: OrderRecord, fingerprint: string): boolean {
  return !order.checkoutIdempotencyFingerprint || order.checkoutIdempotencyFingerprint === fingerprint;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const databaseError = error as { code?: unknown; errno?: unknown; message?: unknown };
  const code = String(databaseError.code ?? '');
  const errno = Number(databaseError.errno);
  if (code === '23505' || code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  if (code === 'SQLITE_CONSTRAINT' && errno === 19) return true;
  return typeof databaseError.message === 'string' &&
    /unique constraint|unique violation|duplicate key|er_dup_entry/i.test(databaseError.message);
}

function returnExistingOrder(ctx: Context, order: OrderRecord): void {
  ctx.status = 200;
  ctx.body = { ok: true, data: serializeOrder(order) };
}

type CheckoutDependencies = { profile: any; user: any };

const checkoutInFlight = new Map<string, Promise<OrderRecord>>();

async function markOrderFailed(orderId: number): Promise<OrderRecord> {
  return strapi.db.query('api::order.order').update({
    where: { id: orderId },
    data: { status: 'failed', checkoutProcessingStatus: 'failed' },
  });
}

async function performCheckout(
  order: OrderRecord,
  dependencies: CheckoutDependencies,
  idempotencyKey: string
): Promise<OrderRecord> {
  const { profile, user } = dependencies;
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

      if (!customerResult.ok) return markOrderFailed(order.id);

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
      value: order.totalAmount,
      description: `Pedido #${order.id}`,
      successUrl: `${base}/pedidos/${order.reference}`,
      cancelUrl: `${base}/checkout`,
      expiredUrl: `${base}/checkout`,
    });

    if (!checkoutResult.ok) return markOrderFailed(order.id);

    return strapi.db.query('api::order.order').update({
      where: { id: order.id },
      data: {
        asaasCheckoutId: checkoutResult.data.id,
        asaasInvoiceUrl: checkoutResult.data.link,
        checkoutProcessingStatus: 'completed',
      },
    });
  } catch {
    return markOrderFailed(order.id);
  }
}

function startCheckout(
  scope: string,
  order: OrderRecord,
  dependencies: CheckoutDependencies,
  idempotencyKey: string
): Promise<OrderRecord> {
  const current = checkoutInFlight.get(scope);
  if (current) return current;

  const promise = Promise.resolve().then(() => performCheckout(order, dependencies, idempotencyKey));
  checkoutInFlight.set(scope, promise);
  void promise.then(
    () => { if (checkoutInFlight.get(scope) === promise) checkoutInFlight.delete(scope); },
    () => { if (checkoutInFlight.get(scope) === promise) checkoutInFlight.delete(scope); }
  );
  return promise;
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
    const orderQuery = strapi.db.query('api::order.order');
    const scope = idempotencyScope(userId, idempotencyKey);
    const fingerprint = checkoutFingerprint(body?.items);
    const existingOrder: OrderRecord | null = await orderQuery.findOne({
      where: { checkoutIdempotencyScope: scope },
    });

    if (existingOrder) {
      if (!hasSameFingerprint(existingOrder, fingerprint)) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_REUSED' };
        return;
      }

      if (existingOrder.checkoutProcessingStatus === 'processing') {
        const profile: any = await strapi.db
          .query('api::customer-profile.customer-profile')
          .findOne({ where: { user: userId } });
        const user: any = await strapi.db
          .query('plugin::users-permissions.user')
          .findOne({ where: { id: userId } });
        const processed = await startCheckout(scope, existingOrder, { profile, user }, idempotencyKey);
        if (processed.checkoutProcessingStatus === 'failed') {
          ctx.status = 502;
          ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
          return;
        }
        returnExistingOrder(ctx, processed);
        return;
      }

      returnExistingOrder(ctx, existingOrder);
      return;
    }

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

    let order: OrderRecord;
    try {
      order = await orderQuery.create({
        data: {
          user: userId,
          reference: generateOrderReference(),
          checkoutIdempotencyKey: idempotencyKey,
          checkoutIdempotencyScope: scope,
          checkoutIdempotencyFingerprint: fingerprint,
          checkoutProcessingStatus: 'processing',
          items: pricing.items,
          totalAmount: pricing.totalAmount,
          status: 'pending',
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const concurrentOrder: OrderRecord | null = await orderQuery.findOne({
        where: { checkoutIdempotencyScope: scope },
      });
      if (!concurrentOrder) throw error;

      if (!hasSameFingerprint(concurrentOrder, fingerprint)) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_REUSED' };
        return;
      }

      if (concurrentOrder.checkoutProcessingStatus === 'processing') {
        const inFlight = checkoutInFlight.get(scope);
        if (inFlight) {
          const processed = await inFlight;
          returnExistingOrder(ctx, processed);
          return;
        }
      }

      returnExistingOrder(ctx, concurrentOrder);
      return;
    }

    const processed = await startCheckout(scope, order, { profile, user }, idempotencyKey);
    if (processed.checkoutProcessingStatus === 'failed') {
      ctx.status = 502;
      ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
      return;
    }

    ctx.status = 201;
    ctx.body = { ok: true, data: serializeOrder(processed) };
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
