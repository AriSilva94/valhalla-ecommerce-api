import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  testAsaasConnection,
  createAsaasCustomer,
  createAsaasCheckout,
  cancelAsaasCheckout,
  findAsaasPaymentByCheckoutSession,
  simulateAsaasPixPayment,
} from './asaas.service';

const baseConfig = {
  apiUrl: 'https://api-sandbox.asaas.com/v3',
  apiKey: 'super-secret-api-key',
  timeoutMs: 10000,
  userAgent: 'Valhalla-Ecommerce/1.0 (Strapi; sandbox)',
};

describe('testAsaasConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna ok quando a resposta é 2xx', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await testAsaasConnection(baseConfig);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/customers?limit=1',
      expect.objectContaining({
        method: 'GET',
        headers: {
          access_token: baseConfig.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': baseConfig.userAgent,
        },
      })
    );
  });

  it('mapeia 401 para ASAAS_AUTH_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));

    const result = await testAsaasConnection(baseConfig);

    expect(result).toEqual({ ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 });
  });

  it('mapeia 403 para ASAAS_FORBIDDEN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));

    const result = await testAsaasConnection(baseConfig);

    expect(result).toEqual({ ok: false, code: 'ASAAS_FORBIDDEN', status: 502 });
  });

  it('mapeia timeout (AbortSignal.timeout) para ASAAS_TIMEOUT', async () => {
    const abortError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw abortError;
      })
    );

    const result = await testAsaasConnection(baseConfig);

    expect(result).toEqual({ ok: false, code: 'ASAAS_TIMEOUT', status: 504 });
  });

  it('mapeia erro de rede genérico para ASAAS_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const result = await testAsaasConnection(baseConfig);

    expect(result).toEqual({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });
  });

  it('falha fechado (ASAAS_AUTH_FAILED) sem chamar fetch quando a apiKey está ausente', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await testAsaasConnection({ ...baseConfig, apiKey: undefined });

    expect(result).toEqual({ ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falha fechado sem chamar fetch quando a apiKey está vazia', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await testAsaasConnection({ ...baseConfig, apiKey: '' });

    expect(result).toEqual({ ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nunca inclui a apiKey no resultado retornado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));

    const result = await testAsaasConnection(baseConfig);

    expect(JSON.stringify(result)).not.toContain(baseConfig.apiKey);
  });
});

const config = {
  apiUrl: 'https://api-sandbox.asaas.com/v3',
  apiKey: 'test-key',
  timeoutMs: 5000,
  userAgent: 'Test/1.0',
};

describe('createAsaasCustomer', () => {
  it('cria o cliente e retorna o id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cus_123' }),
    }) as any;

    const result = await createAsaasCustomer(config, {
      name: 'Fulano',
      cpfCnpj: '11144477735',
      email: 'fulano@example.com',
      postalCode: '01310100',
      addressNumber: '10',
      address: 'Rua X',
      province: 'Centro',
    });

    expect(result).toEqual({ ok: true, data: { id: 'cus_123' } });
  });

  it('mapeia 401 para ASAAS_AUTH_FAILED', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as any;
    const result = await createAsaasCustomer(config, {
      name: 'Fulano', cpfCnpj: '11144477735', email: 'x@x.com',
      postalCode: '01310100', addressNumber: '10', address: 'Rua X', province: 'Centro',
    });
    expect(result).toEqual({ ok: false, code: 'ASAAS_AUTH_FAILED', status: 502 });
  });
});

describe('createAsaasCheckout', () => {
  it('cria o checkout hospedado e retorna id + link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_123' }),
    });
    global.fetch = fetchMock as any;

    const result = await createAsaasCheckout(config, {
      customerId: 'cus_123',
      externalReference: 'abc123def4',
      value: 100,
      description: 'Pedido #1',
      successUrl: 'https://loja.example.com/pedidos/abc123def4',
      cancelUrl: 'https://loja.example.com/checkout',
      expiredUrl: 'https://loja.example.com/checkout',
    });

    expect(result).toEqual({
      ok: true,
      data: { id: 'chk_123', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_123' },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.asaas.com/v3/checkouts');
    const sentBody = JSON.parse(init.body);
    expect(sentBody).toEqual({
      billingTypes: ['PIX'],
      chargeTypes: ['DETACHED'],
      customer: 'cus_123',
      externalReference: 'abc123def4',
      callback: {
        successUrl: 'https://loja.example.com/pedidos/abc123def4',
        cancelUrl: 'https://loja.example.com/checkout',
        expiredUrl: 'https://loja.example.com/checkout',
      },
      items: [{ name: 'Pedido #1', quantity: 1, value: 100 }],
    });
  });

  it('mapeia falha para ASAAS_UNAVAILABLE', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
    const result = await createAsaasCheckout(config, {
      customerId: 'cus_123',
      externalReference: 'abc123def4',
      value: 100,
      description: 'Pedido #1',
      successUrl: 'https://loja.example.com/pedidos/abc123def4',
      cancelUrl: 'https://loja.example.com/checkout',
      expiredUrl: 'https://loja.example.com/checkout',
    });
    expect(result).toEqual({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });
  });
});

describe('cancelAsaasCheckout', () => {
  it('cancela o checkout pelo identificador conhecido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'CANCELED' }),
    });
    global.fetch = fetchMock as any;

    const result = await cancelAsaasCheckout(config, 'chk/123');

    expect(result).toEqual({ ok: true, data: { status: 'CANCELED' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/checkouts/chk%2F123/cancel',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('mantém a falha da Asaas sanitizada', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;

    await expect(cancelAsaasCheckout(config, 'chk_123')).resolves.toEqual({
      ok: false,
      code: 'ASAAS_UNAVAILABLE',
      status: 503,
    });
  });
});

describe('findAsaasPaymentByCheckoutSession', () => {
  it('retorna o primeiro pagamento vinculado ao checkout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'pay_123' }] }),
    });
    global.fetch = fetchMock as any;

    const result = await findAsaasPaymentByCheckoutSession(config, 'chk_123');

    expect(result).toEqual({ ok: true, data: { id: 'pay_123' } });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.asaas.com/v3/payments?checkoutSession=chk_123');
  });

  it('retorna null quando o checkout ainda não gerou pagamento', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }) as any;

    const result = await findAsaasPaymentByCheckoutSession(config, 'chk_123');

    expect(result).toEqual({ ok: true, data: null });
  });

  it('mapeia falha para ASAAS_UNAVAILABLE', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
    const result = await findAsaasPaymentByCheckoutSession(config, 'chk_123');
    expect(result).toEqual({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });
  });
});

describe('simulateAsaasPixPayment', () => {
  it('chama o endpoint sandbox de confirmação e retorna o status atualizado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'RECEIVED' }),
    });
    global.fetch = fetchMock as any;

    const result = await simulateAsaasPixPayment(config, 'pay_123');

    expect(result).toEqual({ ok: true, data: { status: 'RECEIVED' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api-sandbox.asaas.com/v3/sandbox/payment/pay_123/confirm');
    expect(init.method).toBe('POST');
  });

  it('mapeia falha para ASAAS_UNAVAILABLE', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) as any;
    const result = await simulateAsaasPixPayment(config, 'pay_123');
    expect(result).toEqual({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });
  });
});
