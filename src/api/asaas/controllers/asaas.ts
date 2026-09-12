import { randomBytes } from 'crypto';

import { readAsaasConfigFromEnv, testAsaasConnection } from '../../../services/external/asaas.service';

/**
 * Thin controller: delegates the actual network call to the pure service
 * and maps its result to the HTTP response per spec. Logs only
 * { route, status, correlationId } — never headers, keys, or response body.
 */
export default {
  async test(ctx: any) {
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
};
