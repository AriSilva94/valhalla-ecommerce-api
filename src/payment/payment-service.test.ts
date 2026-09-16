import { describe, expect, it, vi } from 'vitest';
import { PaymentService } from './payment-service';
import type { PaymentGateway } from './payment-gateway';

describe('PaymentService', () => {
  it('delegates customer and checkout creation to the active gateway', async () => {
    const gateway: PaymentGateway = {
      createCustomer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'customer-1' } }),
      createCheckout: vi.fn().mockResolvedValue({ ok: true, data: { id: 'checkout-1', url: 'https://pay.test/1' } }),
    };
    const service = new PaymentService(gateway);
    const customer = { name: 'Cliente', cpfCnpj: '11144477735', email: 'cliente@test.com', postalCode: '01310100', addressNumber: '10', address: 'Rua X', province: 'Centro' };
    const checkout = { customerId: 'customer-1', externalReference: 'order-1', value: 100, description: 'Pedido', successUrl: 'https://site.test/sucesso', cancelUrl: 'https://site.test/cancelar', expiredUrl: 'https://site.test/expirado' };

    await expect(service.createCustomer(customer)).resolves.toEqual({ ok: true, data: { id: 'customer-1' } });
    await expect(service.createCheckout(checkout)).resolves.toEqual({ ok: true, data: { id: 'checkout-1', url: 'https://pay.test/1' } });
    expect(gateway.createCustomer).toHaveBeenCalledWith(customer);
    expect(gateway.createCheckout).toHaveBeenCalledWith(checkout);
  });

  it('preserves normalized gateway errors', async () => {
    const gateway: PaymentGateway = {
      createCustomer: vi.fn().mockResolvedValue({ ok: false, code: 'TIMEOUT' }),
      createCheckout: vi.fn(),
    };

    await expect(new PaymentService(gateway).createCustomer({ name: 'Cliente', cpfCnpj: '1', email: 'a@b.test', postalCode: '1', addressNumber: '1', address: 'Rua', province: 'Centro' }))
      .resolves.toEqual({ ok: false, code: 'TIMEOUT' });
  });
});
