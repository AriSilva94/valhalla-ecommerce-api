import type { PaymentCustomer, PaymentGateway, PaymentCheckout } from './payment-gateway';
import { AsaasGateway } from '../services/external/asaas.gateway';
import { readAsaasConfigFromEnv } from '../services/external/asaas.service';
import { DeflowGateway, readDeflowConfigFromEnv } from '../services/external/deflow.gateway';

export class PaymentService {
  constructor(private readonly gateway: PaymentGateway) {}

  createCustomer(input: PaymentCustomer) {
    return this.gateway.createCustomer(input);
  }

  providerName() {
    return this.gateway.providerName();
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
  if ((process.env.PAYMENT_PROVIDER || 'asaas').toLowerCase() === 'deflow') {
    return new PaymentService(new DeflowGateway(readDeflowConfigFromEnv()));
  }
  return new PaymentService(new AsaasGateway(readAsaasConfigFromEnv()));
}
