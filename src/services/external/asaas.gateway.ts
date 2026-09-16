import {
  createAsaasCheckout,
  createAsaasCustomer,
  findAsaasPaymentByCheckoutSession,
  simulateAsaasPixPayment,
  type AsaasConfig,
} from './asaas.service';
import type {
  PaymentCustomer,
  PaymentGateway,
  PaymentCheckout,
  PaymentResult,
} from '../../payment/payment-gateway';

function mapError(code: string): 'AUTH_FAILED' | 'FORBIDDEN' | 'TIMEOUT' | 'UNAVAILABLE' {
  if (code === 'ASAAS_AUTH_FAILED') return 'AUTH_FAILED';
  if (code === 'ASAAS_FORBIDDEN') return 'FORBIDDEN';
  if (code === 'ASAAS_TIMEOUT') return 'TIMEOUT';
  return 'UNAVAILABLE';
}

export class AsaasGateway implements PaymentGateway {
  constructor(private readonly config: AsaasConfig) {}

  providerName(): string {
    return 'asaas';
  }

  async createCustomer(input: PaymentCustomer): Promise<PaymentResult<{ id: string }>> {
    const result = await createAsaasCustomer(this.config, input);
    return result.ok ? result : { ok: false, code: mapError(result.code) };
  }

  async createCheckout(input: PaymentCheckout): Promise<PaymentResult<{ id: string; url: string }>> {
    const result = await createAsaasCheckout(this.config, {
      ...input,
    });
    return result.ok
      ? { ok: true, data: { id: result.data.id, url: result.data.link } }
      : { ok: false, code: mapError(result.code) };
  }

  async findPayment(checkoutId: string): Promise<PaymentResult<{ id: string } | null>> {
    const result = await findAsaasPaymentByCheckoutSession(this.config, checkoutId);
    return result.ok ? result : { ok: false, code: mapError(result.code) };
  }

  async simulatePayment(paymentId: string): Promise<PaymentResult<{ status: string }>> {
    const result = await simulateAsaasPixPayment(this.config, paymentId);
    return result.ok ? result : { ok: false, code: mapError(result.code) };
  }

  isSandbox(): boolean {
    return this.config.apiUrl.includes('sandbox');
  }
}
