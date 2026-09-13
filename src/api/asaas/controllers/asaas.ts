import { randomBytes } from 'crypto';

import type { Context } from 'koa';

import { mapAsaasEventToOrderStatus } from '../../../order/webhook-mapping';
import { readAsaasConfigFromEnv, testAsaasConnection } from '../../../services/external/asaas.service';

/**
 * Thin controller: delegates the actual network call to the pure service
 * and maps its result to the HTTP response per spec. Logs only
 * { route, status, correlationId } — never headers, keys, or response body.
 *
 * This is a hand-written (non-factory) controller, so there is no existing
 * `factories.createCoreController` precedent to follow (see
 * src/api/faq/controllers/faq.ts); `Context` is Strapi's own Koa-based
 * request/response context type.
 */
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
    const body = ctx.request.body as { event?: unknown; payment?: { id?: unknown } };
    const event = typeof body?.event === 'string' ? body.event : '';
    const paymentId = typeof body?.payment?.id === 'string' ? body.payment.id : '';

    const status = mapAsaasEventToOrderStatus(event);

    if (status && paymentId) {
      const order = await strapi.db
        .query('api::order.order')
        .findOne({ where: { asaasPaymentId: paymentId } });

      if (order) {
        await strapi.db.query('api::order.order').update({ where: { id: order.id }, data: { status } });
      }
    }

    ctx.status = 200;
    ctx.body = { ok: true };
  },
};
