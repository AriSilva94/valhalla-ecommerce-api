import { randomBytes } from 'crypto';

import type { Context } from 'koa';

import { mapAsaasEventToOrderStatus } from '../../../order/webhook-mapping';
import { readAsaasConfigFromEnv, testAsaasConnection } from '../../../services/external/asaas.service';

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
    const body = ctx.request.body as {
      event?: unknown;
      payment?: { id?: unknown; externalReference?: unknown; checkoutSession?: unknown };
    };
    const event = typeof body?.event === 'string' ? body.event : '';
    const paymentId = typeof body?.payment?.id === 'string' ? body.payment.id : '';
    const externalReference =
      typeof body?.payment?.externalReference === 'string' ? body.payment.externalReference : '';
    const checkoutSession =
      typeof body?.payment?.checkoutSession === 'string' ? body.payment.checkoutSession : '';

    const status = mapAsaasEventToOrderStatus(event);

    if (status && (paymentId || externalReference || checkoutSession)) {
      const order = externalReference
        ? await strapi.db.query('api::order.order').findOne({ where: { reference: externalReference } })
        : checkoutSession
          ? await strapi.db.query('api::order.order').findOne({ where: { asaasCheckoutId: checkoutSession } })
          : await strapi.db.query('api::order.order').findOne({ where: { asaasPaymentId: paymentId } });

      if (order) {
        const data: Record<string, unknown> = { status };
        if (paymentId && order.asaasPaymentId !== paymentId) data.asaasPaymentId = paymentId;
        await strapi.db.query('api::order.order').update({ where: { id: order.id }, data });
      }
    }

    ctx.status = 200;
    ctx.body = { ok: true };
  },
};
