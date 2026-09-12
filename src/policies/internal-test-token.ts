import { timingSafeEqual } from 'crypto';

import type { Core } from '@strapi/strapi';

/**
 * Strapi 5 custom policy. Signature verified against
 * node_modules/@strapi/types/dist/core/policy.d.ts:
 *   type PolicyHandler<TConfig> = (
 *     ctx: PolicyContext,
 *     cfg: TConfig,
 *     opts: { strapi: Strapi }
 *   ) => boolean | undefined;
 * (the context is passed directly, not wrapped as `{ ctx }`).
 *
 * Gates access to internal test/health-check routes with a constant-time
 * comparison against ASAAS_TEST_TOKEN. This token is a separate secret from
 * ASAAS_API_KEY and is never logged.
 */
export default (policyContext: Core.PolicyContext, _config: unknown, _opts: unknown): boolean => {
  const expectedToken = process.env.ASAAS_TEST_TOKEN;

  // Never allow when there is nothing configured to compare against.
  if (!expectedToken) {
    return false;
  }

  const headerValue = policyContext.request?.header?.['x-internal-test-token'];

  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return false;
  }

  return constantTimeEquals(headerValue, expectedToken);
};

/**
 * Constant-time string comparison. A length mismatch is checked and
 * short-circuited before calling timingSafeEqual (it requires equal-length
 * buffers), which is safe here: the only thing a length mismatch reveals is
 * the length of the guess, not any information about matching byte content.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
