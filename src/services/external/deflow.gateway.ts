import type { PaymentCheckout, PaymentCustomer, PaymentGateway, PaymentGatewayErrorCode, PaymentResult } from '../../payment/payment-gateway';

type DeflowConfig = {
  apiUrl: string;
  keyId: string | undefined;
  secret: string | undefined;
  passphrase: string | undefined;
  timeoutMs: number;
};

type DeflowDeposit = {
  id: string;
  status: string;
  qrCopyPaste?: string;
  qrImageUrl?: string;
};

function mapError(status: number, code?: string): PaymentGatewayErrorCode {
  if (status === 401) return 'AUTH_FAILED';
  if (status === 403) return 'FORBIDDEN';
  if (code === 'RATE_LIMIT_EXCEEDED' || code === 'BURST_EXCEEDED') return 'UNAVAILABLE';
  return 'UNAVAILABLE';
}

export function readDeflowConfigFromEnv(): DeflowConfig {
  return {
    apiUrl: (process.env.DFLOW_API_URL || 'https://api.deflow.exchange/v1').replace(/\/+$/, ''),
    keyId: process.env.DFLOW_KEY_ID,
    secret: process.env.DFLOW_SECRET,
    passphrase: process.env.DFLOW_PASSPHRASE,
    timeoutMs: Number(process.env.DFLOW_TIMEOUT_MS) || 10000,
  };
}

export class DeflowGateway implements PaymentGateway {
  constructor(private readonly config: DeflowConfig) {}

  providerName(): string { return 'deflow'; }

  async createCustomer(_input: PaymentCustomer): Promise<PaymentResult<{ id: string }>> {
    return { ok: true, data: { id: 'deflow-account' } };
  }

  async createCheckout(input: PaymentCheckout): Promise<PaymentResult<{ id: string; url: string | null; pixCopyPaste?: string | null; pixQrCodeUrl?: string | null }>> {
    const result = await this.request<DeflowDeposit>('/deposit/create', {
      method: 'POST',
      headers: { 'X-DF-Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ amountInCents: Math.round(input.value * 100), payerTaxNumber: input.payerTaxNumber }),
    });
    if (!result.ok) return result;
    return { ok: true, data: { id: result.data.id, url: null, pixCopyPaste: result.data.qrCopyPaste ?? null, pixQrCodeUrl: result.data.qrImageUrl ?? null } };
  }

  async findPayment(depositId: string): Promise<PaymentResult<{ id: string } | null>> {
    const result = await this.request<DeflowDeposit>(`/deposit-status/${encodeURIComponent(depositId)}`, { method: 'GET' });
    if (!result.ok) return result;
    return { ok: true, data: result.data.status ? { id: depositId } : null };
  }

  async simulatePayment(depositId: string): Promise<PaymentResult<{ status: string }>> {
    const result = await this.request<{ success?: boolean }> (`/sandbox/deposit/${encodeURIComponent(depositId)}/mark-paid`, { method: 'POST' });
    return result.ok ? { ok: true, data: { status: result.data.success ? 'depix_sent' : 'pending' } } : result;
  }

  isSandbox(): boolean { return this.config.keyId?.startsWith('dfk_test_') === true; }

  private async request<T>(path: string, init: RequestInit): Promise<PaymentResult<T>> {
    if (!this.config.keyId || !this.config.secret) return { ok: false, code: 'AUTH_FAILED' };
    try {
      const response = await fetch(`${this.config.apiUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.keyId}`,
          'X-DF-Secret': this.config.secret,
          ...(this.config.passphrase ? { 'X-DF-Passphrase': this.config.passphrase } : {}),
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      const payload = await response.json() as { data?: T; error?: { code?: string } };
      if (!response.ok || !payload.data) return { ok: false, code: mapError(response.status, payload.error?.code) };
      return { ok: true, data: payload.data };
    } catch {
      return { ok: false, code: 'TIMEOUT' };
    }
  }
}
