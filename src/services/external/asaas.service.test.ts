import { afterEach, describe, expect, it, vi } from 'vitest';

import { testAsaasConnection } from './asaas.service';

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
