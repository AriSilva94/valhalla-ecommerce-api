import { createHash, randomBytes } from 'crypto';

import type { Context } from 'koa';

import { resolveOrderItems, type ProductLookup } from '../../../order/pricing';
import { serializeOrder, type OrderRecord } from '../../../order/serialize-order';
import { createPaymentService } from '../../../payment/payment-service';

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
  const key = ctx.get('Idempotency-Key').trim().toLowerCase();
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

function isAcceptedCheckoutBody(value: unknown): value is { items?: unknown } {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => key === 'items');
}

function checkoutFingerprint(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex');
}

function hasSameFingerprint(order: OrderRecord, fingerprint: string): boolean {
  return Boolean(order.checkoutIdempotencyFingerprint) && order.checkoutIdempotencyFingerprint === fingerprint;
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

function isCompletedOrder(order: OrderRecord): boolean {
  return order.checkoutProcessingStatus === 'completed' &&
    typeof order.asaasInvoiceUrl === 'string' && order.asaasInvoiceUrl.length > 0;
}

function returnExistingOrder(ctx: Context, order: OrderRecord): void {
  ctx.status = 200;
  ctx.body = { ok: true, data: serializeOrder(order) };
}

type CheckoutDependencies = { profile: any; user: any };
const PROCESSING_LEASE_MS = 30_000;

async function markOrderFailed(orderId: number, errorCode = 'ASAAS_UNAVAILABLE'): Promise<OrderRecord> {
  return strapi.db.query('api::order.order').update({
    where: { id: orderId },
    data: { status: 'failed', checkoutProcessingStatus: 'failed', checkoutProcessingError: errorCode },
  });
}

async function markOrderForReconciliation(orderId: number): Promise<OrderRecord> {
  return strapi.db.query('api::order.order').update({
    where: { id: orderId },
    data: {
      checkoutProcessingStatus: 'reconciliation_required',
      checkoutProcessingError: 'CHECKOUT_RECONCILIATION_REQUIRED',
    },
  });
}

async function performCheckout(order: OrderRecord, dependencies: CheckoutDependencies): Promise<OrderRecord> {
  const { profile, user } = dependencies;
  const paymentService = createPaymentService();
  let checkoutCallStarted = false;

  try {
    let asaasCustomerId: string | undefined = profile.asaasCustomerId;
    if (!asaasCustomerId) {
      const customerResult = await paymentService.createCustomer({
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
    checkoutCallStarted = true;
    const checkoutResult = await paymentService.createCheckout({
      customerId: asaasCustomerId,
      externalReference: order.reference,
      value: order.totalAmount,
      description: `Pedido #${order.id}`,
      successUrl: `${base}/pedidos/${order.reference}`,
      cancelUrl: `${base}/checkout`,
      expiredUrl: `${base}/checkout`,
    });

    if (!checkoutResult.ok || !checkoutResult.data.url) return markOrderForReconciliation(order.id);

    const updated = await strapi.db.query('api::order.order').update({
      where: { id: order.id },
      data: {
        asaasCheckoutId: checkoutResult.data.id,
        asaasInvoiceUrl: checkoutResult.data.url,
        checkoutProcessingStatus: 'completed',
      },
    });
    return updated;
  } catch {
    return checkoutCallStarted ? markOrderForReconciliation(order.id) : markOrderFailed(order.id);
  }
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

    const body = ctx.request.body;
    if (!isAcceptedCheckoutBody(body)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'INVALID_CHECKOUT_PAYLOAD' };
      return;
    }
    const orderQuery = strapi.db.query('api::order.order');
    const scope = idempotencyScope(userId, idempotencyKey);
    const fingerprint = checkoutFingerprint(body);
    const existingOrder: OrderRecord | null = await orderQuery.findOne({
      where: { checkoutIdempotencyScope: scope },
    });

    if (existingOrder) {
      if (!existingOrder.checkoutIdempotencyFingerprint) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
        return;
      }
      if (!hasSameFingerprint(existingOrder, fingerprint)) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_REUSED' };
        return;
      }

      if (existingOrder.checkoutProcessingStatus === 'failed') {
        ctx.status = 502;
        ctx.body = { ok: false, error: existingOrder.checkoutProcessingError || 'ASAAS_UNAVAILABLE' };
        return;
      }

      if (existingOrder.checkoutProcessingStatus === 'processing') {
        const leaseUntil = existingOrder.checkoutProcessingLeaseUntil;
        ctx.status = 409;
        ctx.body = {
          ok: false,
          error: leaseUntil && Date.parse(leaseUntil) <= Date.now()
            ? 'CHECKOUT_RECONCILIATION_REQUIRED'
            : 'CHECKOUT_IN_PROGRESS',
        };
        return;
      }

      if (existingOrder.checkoutProcessingStatus === 'reconciliation_required') {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
        return;
      }

      if (isCompletedOrder(existingOrder)) returnExistingOrder(ctx, existingOrder);
      else {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
      }
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
          checkoutProcessingLeaseUntil: new Date(Date.now() + PROCESSING_LEASE_MS).toISOString(),
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

      if (!concurrentOrder.checkoutIdempotencyFingerprint) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
        return;
      }
      if (!hasSameFingerprint(concurrentOrder, fingerprint)) {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_REUSED' };
        return;
      }

      if (concurrentOrder.checkoutProcessingStatus === 'processing') {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'CHECKOUT_IN_PROGRESS' };
        return;
      }

      if (concurrentOrder.checkoutProcessingStatus === 'failed') {
        ctx.status = 502;
        ctx.body = { ok: false, error: concurrentOrder.checkoutProcessingError || 'ASAAS_UNAVAILABLE' };
        return;
      }

      if (concurrentOrder.checkoutProcessingStatus === 'reconciliation_required') {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
        return;
      }

      if (isCompletedOrder(concurrentOrder)) returnExistingOrder(ctx, concurrentOrder);
      else {
        ctx.status = 409;
        ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
      }
      return;
    }

    const processed = await performCheckout(order, { profile, user });
    if (processed.checkoutProcessingStatus === 'failed') {
      ctx.status = 502;
      ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
      return;
    }

    if (!isCompletedOrder(processed)) {
      ctx.status = 409;
      ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
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

    const paymentService = createPaymentService();
    if (!paymentService.isSandbox()) {
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

    const paymentResult = await paymentService.findPayment(order.asaasCheckoutId);
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

    const confirmResult = await paymentService.simulatePayment(paymentResult.data.id);
    if (!confirmResult.ok) {
      ctx.status = 502;
      ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
      return;
    }

    ctx.body = { ok: true };
  },
};
