import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeflowGateway } from './deflow.gateway';

const config = { apiUrl: 'https://api.deflow.exchange/v1', keyId: 'dfk_test_key', secret: 'secret', passphrase: undefined, timeoutMs: 1000 };
const input = { idempotencyKey: '550e8400-e29b-41d4-a716-446655440010', payerTaxNumber: '11144477735', customerId: 'unused', externalReference: 'order-1', value: 12.34, description: 'Pedido', successUrl: '', cancelUrl: '', expiredUrl: '' };

describe('DeflowGateway', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cria depósito com centavos, autenticação e idempotência e retorna QR', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { id: 'dep-1', status: 'pending', qrCopyPaste: 'pix-code', qrImageUrl: 'data:image/png;base64,qr' } }), { status: 201 }));
    const result = await new DeflowGateway(config).createCheckout(input);
    expect(result).toEqual({ ok: true, data: { id: 'dep-1', url: null, pixCopyPaste: 'pix-code', pixQrCodeUrl: 'data:image/png;base64,qr' } });
    expect(fetchMock).toHaveBeenCalledWith('https://api.deflow.exchange/v1/deposit/create', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer dfk_test_key', 'X-DF-Secret': 'secret', 'X-DF-Idempotency-Key': input.idempotencyKey }) }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ amountInCents: 1234, payerTaxNumber: input.payerTaxNumber });
  });

  it('só identifica chave de sandbox no modo sandbox', () => {
    expect(new DeflowGateway(config).isSandbox()).toBe(true);
    expect(new DeflowGateway({ ...config, keyId: 'dfk_live_key' }).isSandbox()).toBe(false);
  });
});
