import type { PaymentCustomer, PaymentGateway, PaymentCheckout } from './payment-gateway';
import { AsaasGateway } from '../services/external/asaas.gateway';
import { readAsaasConfigFromEnv } from '../services/external/asaas.service';

export class PaymentService {
  constructor(private readonly gateway: PaymentGateway) {}

  createCustomer(input: PaymentCustomer) {
    return this.gateway.createCustomer(input);
  }

  createCheckout(input: PaymentCheckout) {
    return this.gateway.createCheckout(input);
  }

  findPayment(checkoutId: string) {
    return this.gateway.findPayment(checkoutId);
  }

  simulatePayment(paymentId: string) {
    return this.gateway.simulatePayment(paymentId);
  }

  isSandbox() {
    return this.gateway.isSandbox();
  }
}

export function createPaymentService(): PaymentService {
  return new PaymentService(new AsaasGateway(readAsaasConfigFromEnv()));
}
