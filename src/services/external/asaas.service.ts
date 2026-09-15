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

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

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

export async function createAsaasCustomer(
  config: AsaasConfig,
  input: AsaasCustomerInput
): Promise<AsaasApiResult<{ id: string }>> {
  return asaasRequest<{ id: string }>(config, '/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type AsaasCheckoutInput = {
  customerId: string;
  externalReference: string;
  value: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
};

export async function createAsaasCheckout(
  config: AsaasConfig,
  input: AsaasCheckoutInput
): Promise<AsaasApiResult<{ id: string; link: string }>> {
  return asaasRequest<{ id: string; link: string }>(config, '/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      billingTypes: ['PIX'],
      chargeTypes: ['DETACHED'],
      customer: input.customerId,
      externalReference: input.externalReference,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiredUrl: input.expiredUrl,
      },
      items: [{ name: input.description, quantity: 1, value: input.value }],
    }),
  });
}

export async function findAsaasCheckoutByExternalReference(
  config: AsaasConfig,
  externalReference: string
): Promise<AsaasApiResult<{ id: string; link: string } | null>> {
  const result = await asaasRequest<{ data: Array<{ id: string; link: string | null }> }>(
    config,
    `/checkouts?externalReference=${encodeURIComponent(externalReference)}`,
    { method: 'GET' }
  );
  if (!result.ok) return result;

  const checkouts = Array.isArray(result.data.data) ? result.data.data : [];
  const checkout = checkouts.find((candidate) => Boolean(candidate.id && candidate.link));
  return checkout?.link ? { ok: true, data: { id: checkout.id, link: checkout.link } } : { ok: true, data: null };
}

export async function findAsaasPaymentByCheckoutSession(
  config: AsaasConfig,
  checkoutSessionId: string
): Promise<AsaasApiResult<{ id: string } | null>> {
  const result = await asaasRequest<{ data: { id: string }[] }>(
    config,
    `/payments?checkoutSession=${encodeURIComponent(checkoutSessionId)}`,
    { method: 'GET' }
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.data[0] ?? null };
}

export async function simulateAsaasPixPayment(
  config: AsaasConfig,
  paymentId: string
): Promise<AsaasApiResult<{ status: string }>> {
  return asaasRequest<{ status: string }>(
    config,
    `/sandbox/payment/${encodeURIComponent(paymentId)}/confirm`,
    { method: 'POST' }
  );
}
