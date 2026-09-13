import { timingSafeEqual } from 'crypto';

import type { Core } from '@strapi/strapi';

export default (policyContext: Core.PolicyContext, _config: unknown, _opts: unknown): boolean => {
  const expectedToken = process.env.ASAAS_TEST_TOKEN;

  if (!expectedToken) {
    return false;
  }

  const headerValue = policyContext.request?.header?.['x-internal-test-token'];

  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return false;
  }

  return constantTimeEquals(headerValue, expectedToken);
};

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
