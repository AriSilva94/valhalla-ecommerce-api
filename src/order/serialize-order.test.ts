import { describe, expect, it } from 'vitest';
import { serializeOrder } from './serialize-order';

describe('serializeOrder', () => {
  it('expõe os campos públicos, nunca asaasPaymentId, e nunca o id sequencial (só reference)', () => {
    const result = serializeOrder({
      id: 1,
      reference: 'abc123def4',
      items: [{ productSlug: 'x', productName: 'X', variantSku: 'S', colorName: 'C', configLabel: 'L', unitPrice: 10, qty: 2 }],
      totalAmount: 20,
      status: 'pending',
      providerPaymentId: 'pay_123',
      providerCheckoutId: 'chk_123',
      paymentUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_123',
      createdAt: '2026-09-12T10:00:00.000Z',
    });

    expect(result).toEqual({
      reference: 'abc123def4',
      items: [{ productSlug: 'x', productName: 'X', variantSku: 'S', colorName: 'C', configLabel: 'L', unitPrice: 10, qty: 2 }],
      totalAmount: 20,
      status: 'pending',
      checkoutUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_123',
      createdAt: '2026-09-12T10:00:00.000Z',
    });
    expect((result as any).asaasPaymentId).toBeUndefined();
    expect((result as any).asaasCheckoutId).toBeUndefined();
    expect((result as any).id).toBeUndefined();
  });
});
