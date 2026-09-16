import type { Context } from 'koa';
import { parseDeflowWebhook, verifyDeflowSignature } from '../../../payment/deflow-webhook';

function isUniqueConstraintError(error: unknown): boolean {
  const databaseError = error as { code?: unknown; errno?: unknown; message?: unknown };
  return ['23505', 'ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE'].includes(String(databaseError?.code ?? '')) ||
    (String(databaseError?.code ?? '') === 'SQLITE_CONSTRAINT' && Number(databaseError?.errno) === 19) ||
    (typeof databaseError?.message === 'string' && /unique constraint|unique violation|duplicate key/i.test(databaseError.message));
}

export default {
  async webhook(ctx: Context) {
    const request = ctx.request as Context['request'] & { rawBody?: string; body?: unknown };
    const rawBody = request.rawBody || (request.body as Record<symbol, unknown> | undefined)?.[Symbol.for('unparsedBody')] as string | undefined;
    const secret = process.env.DFLOW_WEBHOOK_SECRET;
    if (!rawBody || !secret || !verifyDeflowSignature(rawBody, ctx.get('DF-Signature'), secret)) {
      ctx.status = 401;
      ctx.body = { ok: false, error: 'INVALID_WEBHOOK_SIGNATURE' };
      return;
    }
    const event = parseDeflowWebhook(ctx.request.body);
    if (!event) {
      ctx.status = 400;
      ctx.body = { ok: false, error: 'INVALID_WEBHOOK' };
      return;
    }

    const eventQuery = strapi.db.query('api::payment-webhook-event.payment-webhook-event');
    try {
      await eventQuery.create({ data: { provider: event.provider, externalEventId: event.externalEventId, eventKey: `${event.provider}:${event.externalEventId}`, processingStatus: 'processed', processedAt: new Date().toISOString() } });
    } catch (error) {
      if (isUniqueConstraintError(error)) { ctx.body = { ok: true }; return; }
      throw error;
    }

    const orderQuery = strapi.db.query('api::order.order');
    const order = await orderQuery.findOne({ where: { providerCheckoutId: event.providerCheckoutId } });
    if (order) {
      await orderQuery.update({
        where: event.status === 'paid' ? { id: order.id } : { id: order.id, status: { $ne: 'paid' } },
        data: { status: event.status, providerPaymentId: event.providerPaymentId },
      });
    }
    ctx.status = 200;
    ctx.body = { ok: true };
  },
};
