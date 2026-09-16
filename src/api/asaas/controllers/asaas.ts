import { randomBytes } from 'crypto';

import type { Context } from 'koa';

import { readAsaasConfigFromEnv, testAsaasConnection } from '../../../services/external/asaas.service';
import { parseAsaasWebhook } from '../../../payment/webhook-events';

function isUniqueConstraintError(error: unknown): boolean {
  const databaseError = error as { code?: unknown; errno?: unknown; message?: unknown };
  return ['23505', 'ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE'].includes(String(databaseError?.code ?? '')) ||
    (String(databaseError?.code ?? '') === 'SQLITE_CONSTRAINT' && Number(databaseError?.errno) === 19) ||
    (typeof databaseError?.message === 'string' && /unique constraint|unique violation|duplicate key/i.test(databaseError.message));
}

export default {
  async test(ctx: Context) {
    const correlationId = ctx.request.header['x-request-id'] || randomBytes(6).toString('hex');
    const config = readAsaasConfigFromEnv();
    const result = await testAsaasConnection(config);

    let status: 200 | 502 | 503 | 504;
    let body: { ok: true } | { ok: false; error: string };

    if (result.ok) {
      status = 200;
      body = { ok: true };
    } else {
      status = result.status;
      body = { ok: false, error: result.code };
    }

    strapi.log.info(
      JSON.stringify({ route: '/asaas/test', status, correlationId })
    );

    ctx.status = status;
    ctx.body = body;
  },

  async webhook(ctx: Context) {
    const event = parseAsaasWebhook(ctx.request.body);
    if (!event) return (ctx.body = { ok: true });

    const eventQuery = strapi.db.query('api::payment-webhook-event.payment-webhook-event');
    try {
      await eventQuery.create({ data: { provider: event.provider, externalEventId: event.externalEventId, eventKey: `${event.provider}:${event.externalEventId}`, processingStatus: 'processed', processedAt: new Date().toISOString() } });
    } catch (error) {
      if (isUniqueConstraintError(error)) return (ctx.body = { ok: true });
      throw error;
    }

    const orderQuery = strapi.db.query('api::order.order');
    const order = event.externalReference
      ? await orderQuery.findOne({ where: { reference: event.externalReference } })
      : event.providerCheckoutId
        ? await orderQuery.findOne({ where: { providerCheckoutId: event.providerCheckoutId } })
        : await orderQuery.findOne({ where: { providerPaymentId: event.providerPaymentId } });

    if (order) {
      const data: Record<string, unknown> = { status: event.status };
      if (event.providerPaymentId && order.providerPaymentId !== event.providerPaymentId) data.providerPaymentId = event.providerPaymentId;
      const where = event.status === 'paid' ? { id: order.id } : { id: order.id, status: { $ne: 'paid' } };
      await orderQuery.update({ where, data });
    }

    ctx.status = 200;
    ctx.body = { ok: true };
  },
};
