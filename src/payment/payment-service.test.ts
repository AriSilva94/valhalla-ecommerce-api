import { describe, expect, it, vi } from 'vitest';
import { createPaymentService, PaymentService } from './payment-service';
import type { PaymentGateway } from './payment-gateway';

describe('PaymentService', () => {
  it('seleciona Deflow pela configuração', () => {
    const previous = process.env.PAYMENT_PROVIDER;
    process.env.PAYMENT_PROVIDER = 'deflow';
    expect(createPaymentService().providerName()).toBe('deflow');
    if (previous === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previous;
  });

  it('delega criação ao gateway ativo', async () => {
    const gateway: PaymentGateway = {
      providerName: () => 'fake',
      createCustomer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'customer-1' } }),
      createCheckout: vi.fn(),
      findPayment: vi.fn(),
      simulatePayment: vi.fn(),
      isSandbox: () => false,
    };
    const service = new PaymentService(gateway);
    const input = { name: 'Cliente', cpfCnpj: '1', email: 'a@b.test', postalCode: '1', addressNumber: '1', address: 'Rua', province: 'Centro' };
    await expect(service.createCustomer(input)).resolves.toEqual({ ok: true, data: { id: 'customer-1' } });
    expect(gateway.createCustomer).toHaveBeenCalledWith(input);
  });

  it('preserva erro normalizado do gateway', async () => {
    const gateway: PaymentGateway = {
      providerName: () => 'fake',
      createCustomer: vi.fn().mockResolvedValue({ ok: false, code: 'TIMEOUT' }),
      createCheckout: vi.fn(),
      findPayment: vi.fn(),
      simulatePayment: vi.fn(),
      isSandbox: () => false,
    };
    await expect(new PaymentService(gateway).createCustomer({ name: 'Cliente', cpfCnpj: '1', email: 'a@b.test', postalCode: '1', addressNumber: '1', address: 'Rua', province: 'Centro' }))
      .resolves.toEqual({ ok: false, code: 'TIMEOUT' });
  });
});
