export type PaymentCustomer = {
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

export type PaymentCheckout = {
  customerId: string;
  externalReference: string;
  value: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
};

export type PaymentGatewayErrorCode = 'AUTH_FAILED' | 'FORBIDDEN' | 'TIMEOUT' | 'UNAVAILABLE';

export type PaymentResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PaymentGatewayErrorCode };

export interface PaymentGateway {
  providerName(): string;
  createCustomer(input: PaymentCustomer): Promise<PaymentResult<{ id: string }>>;
  createCheckout(input: PaymentCheckout): Promise<PaymentResult<{ id: string; url: string }>>;
  findPayment(checkoutId: string): Promise<PaymentResult<{ id: string } | null>>;
  simulatePayment(paymentId: string): Promise<PaymentResult<{ status: string }>>;
  isSandbox(): boolean;
}
