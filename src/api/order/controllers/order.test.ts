import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/external/asaas.service', () => ({
  readAsaasConfigFromEnv: () => ({ apiUrl: 'x', apiKey: 'k', timeoutMs: 1000, userAgent: 'ua' }),
  createAsaasCustomer: vi.fn(),
  createAsaasPixCharge: vi.fn(),
  getAsaasPixQrCode: vi.fn(),
}));

import controller from './order';
import * as asaas from '../../../services/external/asaas.service';

function buildCtx(userId: number | undefined, body: unknown = {}, params: Record<string, string> = {}) {
  return {
    state: { user: userId ? { id: userId } : undefined },
    request: { body },
    params,
    status: 0,
    body: undefined,
    unauthorized: vi.fn(),
    notFound: vi.fn(),
  } as any;
}

function buildStrapiForCreate(opts: {
  product?: any;
  profile?: any;
  user?: any;
  order?: any;
}) {
  const queries: Record<string, any> = {
    'api::product.product': { findOne: vi.fn().mockResolvedValue(opts.product ?? null) },
    'api::customer-profile.customer-profile': {
      findOne: vi.fn().mockResolvedValue(opts.profile ?? null),
      update: vi.fn().mockResolvedValue(undefined),
    },
    'plugin::users-permissions.user': {
      findOne: vi.fn().mockResolvedValue(opts.user ?? { id: 1, username: 'joe', email: 'joe@example.com' }),
    },
    'api::order.order': {
      create: vi.fn().mockResolvedValue(opts.order ?? { id: 1, createdAt: '2026-09-12T10:00:00.000Z' }),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 1, createdAt: '2026-09-12T10:00:00.000Z', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    },
  };
  return { db: { query: (uid: string) => queries[uid] } };
}

const COMPLETE_PROFILE = {
  id: 5,
  cpfCnpj: '11144477735',
  addressLine: 'Rua X',
  addressNumber: '10',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  postalCode: '01310100',
  asaasCustomerId: 'cus_existing',
};

const PRODUCT = {
  name: 'iPhone 15',
  variants: [{ sku: 'S1', colorName: 'Preto', configLabel: '128GB', price: 100, available: true }],
};

describe('order controller: create', () => {
  it('retorna 401 sem usuário', async () => {
    const ctx = buildCtx(undefined);
    (globalThis as any).strapi = buildStrapiForCreate({});
    await controller.create(ctx);
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('retorna 400 EMPTY_CART com items vazio', async () => {
    const ctx = buildCtx(1, { items: [] });
    (globalThis as any).strapi = buildStrapiForCreate({});
    await controller.create(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ ok: false, error: 'EMPTY_CART' });
  });

  it('retorna 422 PROFILE_INCOMPLETE sem perfil salvo', async () => {
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    (globalThis as any).strapi = buildStrapiForCreate({ product: PRODUCT, profile: null });
    await controller.create(ctx);
    expect(ctx.status).toBe(422);
    expect(ctx.body).toEqual({ ok: false, error: 'PROFILE_INCOMPLETE' });
  });

  it('cria o pedido e a cobrança Pix com perfil e asaasCustomerId já existentes', async () => {
    (asaas.createAsaasPixCharge as any).mockResolvedValue({
      ok: true,
      data: { id: 'pay_1', invoiceUrl: 'https://asaas.test/i/pay_1' },
    });
    (asaas.getAsaasPixQrCode as any).mockResolvedValue({
      ok: true,
      data: { encodedImage: 'b64', payload: 'copia-cola', expirationDate: '2026-09-13T00:00:00.000Z' },
    });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    (globalThis as any).strapi = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });

    await controller.create(ctx);

    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
    expect(ctx.status).toBe(201);
    expect(ctx.body.ok).toBe(true);
    expect(ctx.body.data.pixCopyPaste).toBe('copia-cola');
  });

  it('marca o pedido como failed quando a cobrança Pix falha', async () => {
    (asaas.createAsaasPixCharge as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(ctx.status).toBe(502);
    expect(ctx.body).toEqual({ ok: false, error: 'ASAAS_UNAVAILABLE' });
  });
});

describe('order controller: find/findOne', () => {
  it('find retorna só os pedidos do usuário autenticado', async () => {
    const ctx = buildCtx(1);
    const findMany = vi.fn().mockResolvedValue([]);
    (globalThis as any).strapi = { db: { query: () => ({ findMany }) } };
    await controller.find(ctx);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user: 1 }) })
    );
  });

  it('findOne retorna 404 quando o pedido não pertence ao usuário', async () => {
    const ctx = buildCtx(1, {}, { id: '99' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne: vi.fn().mockResolvedValue(null) }) } };
    await controller.findOne(ctx);
    expect(ctx.notFound).toHaveBeenCalled();
  });
});
