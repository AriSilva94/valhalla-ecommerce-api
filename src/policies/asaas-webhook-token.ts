import { timingSafeEqual } from 'crypto';

import type { Core } from '@strapi/strapi';

/**
 * Gates the Asaas payment webhook route with a constant-time comparison
 * against ASAAS_WEBHOOK_TOKEN, sent by Asaas in the `asaas-access-token`
 * header. This token is a separate secret from ASAAS_API_KEY and
 * ASAAS_TEST_TOKEN, and is never logged.
 */
export default (policyContext: Core.PolicyContext, _config: unknown, _opts: unknown): boolean => {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) return false;

  const headerValue = policyContext.request?.header?.['asaas-access-token'];
  if (typeof headerValue !== 'string' || headerValue.length === 0) return false;

  return constantTimeEquals(headerValue, expectedToken);
};

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
