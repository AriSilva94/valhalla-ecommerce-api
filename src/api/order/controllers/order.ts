import { createHash, randomBytes } from 'crypto';

import type { Context } from 'koa';

import {
  clearCheckoutRecoveryMarker,
  getCheckoutRecoveryMarker,
  getIdempotencyResult,
  releaseIdempotency,
  reserveIdempotency,
  saveCheckoutRecoveryMarker,
  saveIdempotencyResult,
} from '../../../order/idempotency';
import { resolveOrderItems, type ProductLookup } from '../../../order/pricing';
import { serializeOrder, type OrderRecord } from '../../../order/serialize-order';
import { getRedisConnection } from '../../../services/redis';
import {
  cancelAsaasCheckout,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMPLETE_CHECKOUT_RECOVERY_AGE_MS = 10 * 60 * 1000;

type OrderCreateResponse = {
  ok: true;
  data: ReturnType<typeof serializeOrder>;
};

function readIdempotencyKey(ctx: Context): string | null {
  const value = ctx.request.header['idempotency-key'];
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return code === '23505' || code === 'SQLITE_CONSTRAINT' || message.includes('unique');
}

function successResponse(order: OrderRecord): OrderCreateResponse {
  return { ok: true, data: serializeOrder(order) };
}

function hasCompletedAsaasCheckout(order: OrderRecord): boolean {
  return Boolean(order.asaasCheckoutId && order.asaasInvoiceUrl);
}

function isRecentIncompleteCheckout(order: OrderRecord): boolean {
  const createdAt = Date.parse(order.createdAt);
  return Number.isNaN(createdAt) || Date.now() - createdAt < INCOMPLETE_CHECKOUT_RECOVERY_AGE_MS;
}

function logCheckoutWarning(operation: string, userId: number, idempotencyKey: string, orderId?: number): void {
  const correlationId = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 12);
  const context = `operation=${operation} userId=${userId} idempotencyCorrelation=${correlationId}`;
  const message = orderId ? `checkout ${context} orderId=${orderId}` : `checkout ${context}`;
  const warn = strapi.log?.warn;

  if (typeof warn === 'function') {
    warn(message);
    return;
  }

  console.warn(message);
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
      ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED' };
      return;
    }

    const redis = getRedisConnection();
    const cachedResponse = await getIdempotencyResult<OrderCreateResponse>(redis, userId, idempotencyKey);
    if (cachedResponse) {
      ctx.status = 201;
      ctx.body = cachedResponse;
      return;
    }

    const recoveryMarker = await getCheckoutRecoveryMarker(redis, userId, idempotencyKey);
    if (recoveryMarker) {
      try {
        const cancellation = await cancelAsaasCheckout(readAsaasConfigFromEnv(), recoveryMarker.checkoutId);
        if (!cancellation.ok) {
          logCheckoutWarning('checkout-cancel-failed', userId, idempotencyKey);
          ctx.status = 503;
          ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
          return;
        }

        if (!(await clearCheckoutRecoveryMarker(redis, userId, idempotencyKey))) {
          logCheckoutWarning('checkout-recovery-marker-clear-failed', userId, idempotencyKey);
          ctx.status = 503;
          ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
          return;
        }
      } catch {
        logCheckoutWarning('checkout-cancel-failed', userId, idempotencyKey);
        ctx.status = 503;
        ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
        return;
      }
    }

    const reservation = await reserveIdempotency(redis, userId, idempotencyKey);
    if (reservation.status === 'in-progress') {
      ctx.status = 409;
      ctx.body = { ok: false, error: 'CHECKOUT_IN_PROGRESS' };
      return;
    }

    try {
      const orderRepository = strapi.db.query('api::order.order');
      const asaasConfig = readAsaasConfigFromEnv();
      const persistCheckout = async (order: OrderRecord, checkout: { id: string; link: string }) => {
        let updated: OrderRecord | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            updated = await orderRepository.update({
              where: { id: order.id, status: 'pending' },
              data: {
                asaasCheckoutId: checkout.id,
                asaasInvoiceUrl: checkout.link,
              },
            });
            break;
          } catch {
            logCheckoutWarning('checkout-persistence-failed', userId, idempotencyKey, order.id);
          }
        }
        return updated;
      };
      const markCheckoutRecovery = async (order: OrderRecord, checkoutId: string): Promise<boolean> => {
        try {
          const marked = await orderRepository.update({
            where: {
              id: order.id,
              status: 'pending',
              asaasCheckoutId: { $null: true },
              asaasInvoiceUrl: { $null: true },
            },
            data: {
              status: 'failed',
              asaasCheckoutId: checkoutId,
              checkoutRecoveryStatus: 'cancel_pending',
            },
          });
          return Boolean(marked);
        } catch {
          logCheckoutWarning('checkout-recovery-persistence-failed', userId, idempotencyKey, order.id);
          return false;
        }
      };
      const existingOrder: OrderRecord | null = await orderRepository.findOne({
        where: { user: userId, idempotencyKey },
      });
      let resumedOrder: OrderRecord | null = null;

      if (existingOrder) {
        if (existingOrder.checkoutRecoveryStatus === 'cancel_pending') {
          if (!existingOrder.asaasCheckoutId) {
            logCheckoutWarning('checkout-recovery-missing-id', userId, idempotencyKey, existingOrder.id);
            ctx.status = 503;
            ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
            return;
          }

          const cancellation = await cancelAsaasCheckout(asaasConfig, existingOrder.asaasCheckoutId);
          if (!cancellation.ok) {
            logCheckoutWarning('checkout-cancel-failed', userId, idempotencyKey, existingOrder.id);
            ctx.status = 503;
            ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
            return;
          }

          try {
            const recoveredOrder: OrderRecord = await orderRepository.update({
              where: {
                id: existingOrder.id,
                status: 'failed',
                asaasCheckoutId: existingOrder.asaasCheckoutId,
                checkoutRecoveryStatus: 'cancel_pending',
              },
              data: {
                status: 'pending',
                asaasCheckoutId: null,
                asaasInvoiceUrl: null,
                checkoutRecoveryStatus: null,
              },
            });
            if (reservation.status === 'reserved') {
              resumedOrder = recoveredOrder;
            } else {
              ctx.status = 409;
              ctx.body = { ok: false, error: 'CHECKOUT_IN_PROGRESS' };
              return;
            }
          } catch {
            logCheckoutWarning('checkout-recovery-persistence-failed', userId, idempotencyKey, existingOrder.id);
            ctx.status = 503;
            ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
            return;
          }
        } else if (existingOrder.status === 'failed') {
          ctx.status = 502;
          ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
          return;
        }

        if (!resumedOrder && !hasCompletedAsaasCheckout(existingOrder)) {
          if (existingOrder.status === 'pending') {
            if (isRecentIncompleteCheckout(existingOrder)) {
              if (reservation.status === 'reserved') {
                resumedOrder = existingOrder;
              } else {
                ctx.status = 409;
                ctx.body = { ok: false, error: 'CHECKOUT_IN_PROGRESS' };
                return;
              }
            } else {
              await orderRepository.update({
                where: {
                  id: existingOrder.id,
                  status: 'pending',
                  asaasCheckoutId: { $null: true },
                  asaasInvoiceUrl: { $null: true },
                },
                data: { status: 'failed' },
              });
              ctx.status = 409;
              ctx.body = { ok: false, error: 'CHECKOUT_RECOVERY_REQUIRED' };
              return;
            }
          } else {
            ctx.status = 502;
            ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
            return;
          }
        } else if (!resumedOrder) {
          const response = successResponse(existingOrder);
          ctx.status = 201;
          ctx.body = response;
          await saveIdempotencyResult(redis, userId, idempotencyKey, response);
          return;
        }
      }

      if (!resumedOrder) {
        const body = ctx.request.body as { items?: unknown };
        const pricing = await resolveOrderItems(body?.items, makeProductLookup());
        if (!pricing.ok) {
          ctx.status = 400;
          ctx.body = { ok: false, error: pricing.error };
          return;
        }

        try {
          resumedOrder = await orderRepository.create({
            data: {
              user: userId,
              reference: generateOrderReference(),
              idempotencyKey,
              items: pricing.items,
              totalAmount: pricing.totalAmount,
              status: 'pending',
            },
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error;
          }

          const duplicateOrder: OrderRecord | null = await orderRepository.findOne({
            where: { user: userId, idempotencyKey },
          });
          if (!duplicateOrder) {
            logCheckoutWarning('idempotency-key-conflict', userId, idempotencyKey);
            ctx.status = 409;
            ctx.body = { ok: false, error: 'IDEMPOTENCY_KEY_CONFLICT' };
            return;
          }

          if (duplicateOrder.status === 'failed') {
            ctx.status = 502;
            ctx.body = { ok: false, error: 'ASAAS_UNAVAILABLE' };
            return;
          }

          if (hasCompletedAsaasCheckout(duplicateOrder)) {
            const response = successResponse(duplicateOrder);
            ctx.status = 201;
            ctx.body = response;
            await saveIdempotencyResult(redis, userId, idempotencyKey, response);
            return;
          }

          if (duplicateOrder.status === 'pending' && !isRecentIncompleteCheckout(duplicateOrder)) {
            await orderRepository.update({
              where: {
                id: duplicateOrder.id,
                status: 'pending',
                asaasCheckoutId: { $null: true },
                asaasInvoiceUrl: { $null: true },
              },
              data: { status: 'failed' },
            });
            ctx.status = 409;
            ctx.body = { ok: false, error: 'CHECKOUT_RECOVERY_REQUIRED' };
            return;
          }

          ctx.status = 409;
          ctx.body = { ok: false, error: 'CHECKOUT_IN_PROGRESS' };
          return;
        }
      }

      const order = resumedOrder;
      if (!order) {
        ctx.status = 500;
        ctx.body = { ok: false, error: 'CHECKOUT_CREATION_FAILED' };
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
          customerId: asaasCustomerId,
          externalReference: order.reference,
          value: order.totalAmount,
          description: `Pedido #${order.id}`,
          successUrl: `${base}/pedidos/${order.reference}`,
          cancelUrl: `${base}/checkout`,
          expiredUrl: `${base}/checkout`,
        });

        if (!checkoutResult.ok) {
          return await failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
        }

        const updated = await persistCheckout(order, checkoutResult.data);
        if (!updated) {
          try {
            const cancellation = await cancelAsaasCheckout(asaasConfig, checkoutResult.data.id);
            if (cancellation.ok) {
              logCheckoutWarning('checkout-cancelled-after-persistence-failure', userId, idempotencyKey, order.id);
              ctx.status = 503;
              ctx.body = { ok: false, error: 'CHECKOUT_PERSISTENCE_FAILED' };
              return;
            }

            logCheckoutWarning('checkout-cancel-failed', userId, idempotencyKey, order.id);
          } catch {
            logCheckoutWarning('checkout-cancel-failed', userId, idempotencyKey, order.id);
          }

          const marked = await markCheckoutRecovery(order, checkoutResult.data.id);
          if (!marked) {
            const markerSaved = await saveCheckoutRecoveryMarker(redis, userId, idempotencyKey, checkoutResult.data.id);
            logCheckoutWarning(
              markerSaved ? 'checkout-recovery-marker-saved' : 'checkout-recovery-marker-unavailable',
              userId,
              idempotencyKey,
              order.id
            );
          }
          ctx.status = 503;
          ctx.body = { ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' };
          return;
        }

        const response = successResponse(updated);
        ctx.status = 201;
        ctx.body = response;
        await saveIdempotencyResult(redis, userId, idempotencyKey, response);
      } catch {
        return await failOrder(order.id, 'ASAAS_UNAVAILABLE', 502, ctx);
      }
    } finally {
      if (reservation.status === 'reserved') {
        await releaseIdempotency(redis, userId, idempotencyKey, reservation.owner);
      }
    }
  },

  async find(ctx: Context) {
    const userId = ctx.state.user?.id;
    if (!userId) return ctx.unauthorized();

    const rawPage = Number(ctx.request.query?.page ?? 1);
    const rawPageSize = Number(ctx.request.query?.pageSize ?? 20);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : 20;

    const orders: OrderRecord[] = await strapi.db
      .query('api::order.order')
      .findMany({ where: { user: userId }, orderBy: { createdAt: 'desc' }, limit: pageSize, offset: (page - 1) * pageSize });

    ctx.body = { ok: true, data: orders.map(serializeOrder), meta: { pagination: { page, pageSize, hasMore: orders.length === pageSize } } };
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
