/**
 * Pure, testable service that checks server-side connectivity to Asaas
 * (payment provider) Sandbox without creating/mutating any resource.
 *
 * Follows the same pattern as src/auth/config.ts: pure functions that take
 * config as arguments (no direct `process.env` reads inside the logic), so
 * they can be unit-tested without a Strapi runtime.
 */

export type AsaasErrorCode =
  | 'ASAAS_AUTH_FAILED'
  | 'ASAAS_FORBIDDEN'
  | 'ASAAS_TIMEOUT'
  | 'ASAAS_UNAVAILABLE';

export type AsaasTestResult =
  | { ok: true }
  | { ok: false; code: AsaasErrorCode; status: 502 | 504 | 503 };

export type AsaasConfig = {
  apiUrl: string;
  apiKey: string | undefined;
  timeoutMs: number;
  userAgent: string;
};

const AUTH_FAILED_RESULT: AsaasTestResult = {
  ok: false,
  code: 'ASAAS_AUTH_FAILED',
  status: 502,
};

/**
 * Tests connectivity to Asaas by issuing a single read-only request
 * (`GET /customers?limit=1`). Never creates or mutates any Asaas resource.
 *
 * Fails closed: an absent/empty API key never reaches `fetch`.
 */
export async function testAsaasConnection(config: AsaasConfig): Promise<AsaasTestResult> {
  const { apiUrl, apiKey, timeoutMs, userAgent } = config;

  if (!apiKey) {
    return AUTH_FAILED_RESULT;
  }

  try {
    const response = await fetch(`${apiUrl}/customers?limit=1`, {
      method: 'GET',
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 401) {
      return AUTH_FAILED_RESULT;
    }

    if (response.status === 403) {
      return { ok: false, code: 'ASAAS_FORBIDDEN', status: 502 };
    }

    if (!response.ok) {
      return { ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 };
    }

    return { ok: true };
  } catch (error) {
    if (isTimeoutError(error)) {
      return { ok: false, code: 'ASAAS_TIMEOUT', status: 504 };
    }

    return { ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 };
  }
}

/**
 * `AbortSignal.timeout()` (used above) only ever produces a `DOMException`
 * with name `TimeoutError` (or `AbortError` if aborted for another reason)
 * on Node 20+, so there is no other timeout-signaling path in this file to
 * account for.
 */
function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/**
 * Thin wrapper that reads env at the call site (kept separate from the pure
 * logic above so the logic itself stays trivially unit-testable).
 */
export function readAsaasConfigFromEnv(): AsaasConfig {
  return {
    apiUrl: process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3',
    apiKey: process.env.ASAAS_API_KEY,
    timeoutMs: Number(process.env.ASAAS_TIMEOUT_MS) || 10000,
    userAgent: process.env.ASAAS_USER_AGENT || 'Valhalla-Ecommerce/1.0 (Strapi; sandbox)',
  };
}
