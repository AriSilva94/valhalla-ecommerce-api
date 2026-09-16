import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsaasGateway } from './asaas.gateway';
import * as asaas from './asaas.service';

vi.mock('./asaas.service', async () => {
  const actual = await vi.importActual<typeof import('./asaas.service')>('./asaas.service');
  return { ...actual, createAsaasCustomer: vi.fn(), createAsaasCheckout: vi.fn() };
});

const config = { apiUrl: 'https://api-sandbox.asaas.com/v3', apiKey: 'key', timeoutMs: 1000, userAgent: 'test' };

describe('AsaasGateway', () => {
  beforeEach(() => vi.clearAllMocks());

  it('traduz customer e checkout para o contrato interno', async () => {
    vi.mocked(asaas.createAsaasCustomer).mockResolvedValue({ ok: true, data: { id: 'cus-1' } });
    vi.mocked(asaas.createAsaasCheckout).mockResolvedValue({ ok: true, data: { id: 'chk-1', link: 'https://asaas.test/chk-1' } });
    const gateway = new AsaasGateway(config);

    await expect(gateway.createCustomer({ name: 'Cliente', cpfCnpj: '1', email: 'a@b.test', postalCode: '1', addressNumber: '1', address: 'Rua', province: 'Centro' }))
      .resolves.toEqual({ ok: true, data: { id: 'cus-1' } });
    await expect(gateway.createCheckout({ idempotencyKey: '550e8400-e29b-41d4-a716-446655440010', payerTaxNumber: '11144477735', customerId: 'cus-1', externalReference: 'order-1', value: 100, description: 'Pedido', successUrl: 'https://site.test/s', cancelUrl: 'https://site.test/c', expiredUrl: 'https://site.test/e' }))
      .resolves.toEqual({ ok: true, data: { id: 'chk-1', url: 'https://asaas.test/chk-1' } });
  });

  it('normaliza erros do adapter', async () => {
    vi.mocked(asaas.createAsaasCheckout).mockResolvedValue({ ok: false, code: 'ASAAS_TIMEOUT', status: 504 });
    await expect(new AsaasGateway(config).createCheckout({ idempotencyKey: '550e8400-e29b-41d4-a716-446655440010', payerTaxNumber: '11144477735', customerId: 'cus-1', externalReference: 'order-1', value: 100, description: 'Pedido', successUrl: 'https://site.test/s', cancelUrl: 'https://site.test/c', expiredUrl: 'https://site.test/e' }))
      .resolves.toEqual({ ok: false, code: 'TIMEOUT' });
  });
});
