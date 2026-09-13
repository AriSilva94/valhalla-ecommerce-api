import { describe, expect, it } from 'vitest';
import { serializeOrder } from './serialize-order';

describe('serializeOrder', () => {
  it('expõe os campos públicos e nunca asaasPaymentId', () => {
    const result = serializeOrder({
      id: 1,
      items: [{ productSlug: 'x', productName: 'X', variantSku: 'S', colorName: 'C', configLabel: 'L', unitPrice: 10, qty: 2 }],
      totalAmount: 20,
      status: 'pending',
      asaasPaymentId: 'pay_123',
      asaasInvoiceUrl: 'https://asaas.test/i/pay_123',
      pixQrCodeImage: 'base64',
      pixCopyPaste: 'copia-cola',
      pixExpiration: '2026-09-13T12:00:00.000Z',
      createdAt: '2026-09-12T10:00:00.000Z',
    });

    expect(result).toEqual({
      id: 1,
      items: [{ productSlug: 'x', productName: 'X', variantSku: 'S', colorName: 'C', configLabel: 'L', unitPrice: 10, qty: 2 }],
      totalAmount: 20,
      status: 'pending',
      asaasInvoiceUrl: 'https://asaas.test/i/pay_123',
      pixQrCodeImage: 'base64',
      pixCopyPaste: 'copia-cola',
      pixExpiration: '2026-09-13T12:00:00.000Z',
      createdAt: '2026-09-12T10:00:00.000Z',
    });
    expect((result as any).asaasPaymentId).toBeUndefined();
  });
});
