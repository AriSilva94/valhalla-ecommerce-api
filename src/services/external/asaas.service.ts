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

export type AsaasApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AsaasErrorCode; status: 502 | 504 | 503 };

async function asaasRequest<T>(
  config: AsaasConfig,
  path: string,
  init: RequestInit
): Promise<AsaasApiResult<T>> {
  const { apiUrl, apiKey, timeoutMs, userAgent } = config;

  if (!apiKey) {
    return { ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 };
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 401) {
      return { ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 };
    }
    if (response.status === 403) {
      return { ok: false, code: 'ASAAS_FORBIDDEN', status: 502 };
    }
    if (!response.ok) {
      return { ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 };
    }

    const json = (await response.json()) as T;
    return { ok: true, data: json };
  } catch (error) {
    if (isTimeoutError(error)) {
      return { ok: false, code: 'ASAAS_TIMEOUT', status: 504 };
    }
    return { ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 };
  }
}

export type AsaasCustomerInput = {
  name: string;
  cpfCnpj: string;
  email: string;
  phone?: string;
  postalCode: string;
  addressNumber: string;
  address: string;
  complement?: string;
  province: string;
};

/** Cria um cliente na Asaas. Chamar só quando `customer-profile.asaasCustomerId` ainda não existir. */
export async function createAsaasCustomer(
  config: AsaasConfig,
  input: AsaasCustomerInput
): Promise<AsaasApiResult<{ id: string }>> {
  return asaasRequest<{ id: string }>(config, '/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type AsaasPixChargeInput = {
  customerId: string;
  value: number;
  description: string;
};

/** Cria uma cobrança Pix com vencimento hoje (Pix não expira por `dueDate`, mas pelo próprio QR code). */
export async function createAsaasPixCharge(
  config: AsaasConfig,
  input: AsaasPixChargeInput
): Promise<AsaasApiResult<{ id: string; invoiceUrl: string }>> {
  const dueDate = new Date().toISOString().slice(0, 10);
  return asaasRequest<{ id: string; invoiceUrl: string }>(config, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customerId,
      billingType: 'PIX',
      value: input.value,
      dueDate,
      description: input.description,
    }),
  });
}

export async function getAsaasPixQrCode(
  config: AsaasConfig,
  paymentId: string
): Promise<AsaasApiResult<{ encodedImage: string; payload: string; expirationDate: string }>> {
  return asaasRequest<{ encodedImage: string; payload: string; expirationDate: string }>(
    config,
    `/payments/${encodeURIComponent(paymentId)}/pixQrCode`,
    { method: 'GET' }
  );
}
