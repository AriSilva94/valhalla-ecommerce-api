import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/external/asaas.service', () => ({
  readAsaasConfigFromEnv: vi.fn(() => ({
    apiUrl: 'https://api-sandbox.asaas.com/v3',
    apiKey: 'k',
    timeoutMs: 1000,
    userAgent: 'ua',
  })),
  createAsaasCustomer: vi.fn(),
  createAsaasCheckout: vi.fn(),
  findAsaasPaymentByCheckoutSession: vi.fn(),
  simulateAsaasPixPayment: vi.fn(),
}));

import controller from './order';
import * as asaas from '../../../services/external/asaas.service';

const VALID_KEY = '550e8400-e29b-41d4-a716-446655440010';

function buildCtx(
  userId: number | undefined,
  body: unknown = {},
  params: Record<string, string> = {},
  headers: Record<string, string> = { 'Idempotency-Key': VALID_KEY }
) {
  return {
    state: { user: userId ? { id: userId } : undefined },
    request: { body },
    params,
    status: 0,
    body: undefined,
    get: (header: string) => headers[header] || headers[header.toLowerCase()] || '',
    unauthorized: vi.fn(),
    notFound: vi.fn(),
  } as any;
}

function buildStrapiForCreate(opts: {
  product?: any;
  profile?: any;
  user?: any;
  order?: any;
  existingOrder?: any;
  orderCreate?: any;
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
      create: vi.fn().mockResolvedValue(opts.orderCreate ?? opts.order ?? { id: 1, reference: 'abc123def4', createdAt: '2026-09-12T10:00:00.000Z' }),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 1, reference: 'abc123def4', createdAt: '2026-09-12T10:00:00.000Z', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(opts.existingOrder ?? null),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('retorna o pedido existente e não chama o gateway ao repetir a mesma operação', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440000';
    const existingOrder = {
      id: 9,
      reference: 'existing123',
      items: [{ productSlug: 'iphone-15', productName: 'iPhone 15', variantSku: 'S1', colorName: 'Preto', configLabel: '128GB', unitPrice: 100, qty: 1 }],
      totalAmount: 100,
      status: 'pending',
      asaasInvoiceUrl: 'https://sandbox.asaas.com/checkout/existing',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] }, {}, { 'Idempotency-Key': key });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE, existingOrder });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(strapiMock.db.query('api::order.order').create).not.toHaveBeenCalled();
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ ok: true, data: expect.objectContaining({ reference: 'existing123' }) });
  });

  it('não cria dois pedidos nem chama o gateway duas vezes em tentativas concorrentes', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440001';
    const createdOrder = {
      id: 10,
      reference: 'concurrent1',
      items: [{ productSlug: 'iphone-15', productName: 'iPhone 15', variantSku: 'S1', colorName: 'Preto', configLabel: '128GB', unitPrice: 100, qty: 1 }],
      totalAmount: 100,
      status: 'pending',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    let findOneCalls = 0;
    const orderQuery = {
      create: vi.fn()
        .mockResolvedValueOnce(createdOrder)
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed: orders.checkout_idempotency_key')),
      update: vi.fn().mockResolvedValue(createdOrder),
      findMany: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockImplementation(async () => {
        findOneCalls += 1;
        return findOneCalls > 2 ? createdOrder : null;
      }),
    };
    const base = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const originalQuery = base.db.query;
    base.db.query = ((uid: string) => uid === 'api::order.order' ? orderQuery : originalQuery(uid)) as any;
    (globalThis as any).strapi = base;
    (asaas.createAsaasCheckout as any).mockResolvedValue({ ok: true, data: { id: 'chk_1', link: 'https://sandbox.asaas.com/checkout/chk_1' } });

    const body = { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] };
    await Promise.all([
      controller.create(buildCtx(1, body, {}, { 'Idempotency-Key': key })),
      controller.create(buildCtx(1, body, {}, { 'Idempotency-Key': key })),
    ]);

    expect(orderQuery.create).toHaveBeenCalledTimes(2);
    expect(asaas.createAsaasCheckout).toHaveBeenCalledTimes(1);
  });

  it('retorna conflito quando a mesma chave é usada com payload diferente', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440002';
    const existingOrder = {
      id: 11,
      reference: 'different-payload',
      items: [{ productSlug: 'iphone-15', productName: 'iPhone 15', variantSku: 'S1', colorName: 'Preto', configLabel: '128GB', unitPrice: 100, qty: 2 }],
      totalAmount: 200,
      status: 'pending',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] }, {}, { 'Idempotency-Key': key });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE, existingOrder });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'IDEMPOTENCY_KEY_REUSED' });
    expect(strapiMock.db.query('api::order.order').create).not.toHaveBeenCalled();
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('retorna erro para chave ausente ou malformada sem criar pedido', async () => {
    for (const key of ['', 'not-a-uuid', '550e8400-e29b-11d4-a716-446655440003']) {
      const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] }, {}, { 'Idempotency-Key': key });
      const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
      (globalThis as any).strapi = strapiMock;

      await controller.create(ctx);

      expect(ctx.status).toBe(400);
      expect(ctx.body).toEqual({ ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
      expect(strapiMock.db.query('api::order.order').create).not.toHaveBeenCalled();
    }
  });

  it('cria o pedido e o checkout Asaas com perfil e asaasCustomerId já existentes', async () => {
    (asaas.createAsaasCheckout as any).mockResolvedValue({
      ok: true,
      data: { id: 'chk_1', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_1' },
    });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
    expect(strapiMock.db.query('api::order.order').create).toHaveBeenCalledWith({
      data: expect.objectContaining({ checkoutIdempotencyKey: `1:${VALID_KEY}` }),
    });
    expect(asaas.createAsaasCheckout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        customerId: 'cus_existing',
        externalReference: 'abc123def4',
        idempotencyKey: VALID_KEY,
      })
    );
    expect(ctx.status).toBe(201);
    expect(ctx.body.ok).toBe(true);
    expect(ctx.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkoutSession/show/chk_1');
    expect(ctx.body.data.reference).toBe('abc123def4');
    expect(ctx.body.data.id).toBeUndefined();
  });

  it('marca o pedido como failed quando a criação do checkout falha', async () => {
    (asaas.createAsaasCheckout as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(ctx.status).toBe(502);
    expect(ctx.body).toEqual({ ok: false, error: 'ASAAS_UNAVAILABLE' });
    expect(strapiMock.db.query('api::order.order').update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'failed' },
    });
  });

  it('cria o customer na Asaas e persiste asaasCustomerId no perfil quando ainda não existe', async () => {
    (asaas.createAsaasCustomer as any).mockResolvedValue({ ok: true, data: { id: 'cus_new' } });
    (asaas.createAsaasCheckout as any).mockResolvedValue({
      ok: true,
      data: { id: 'chk_2', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_2' },
    });

    const profileWithoutCustomerId = { ...COMPLETE_PROFILE, asaasCustomerId: undefined };
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: profileWithoutCustomerId });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(asaas.createAsaasCustomer).toHaveBeenCalled();
    expect(strapiMock.db.query('api::customer-profile.customer-profile').update).toHaveBeenCalledWith({
      where: { id: profileWithoutCustomerId.id },
      data: { asaasCustomerId: 'cus_new' },
    });
    expect(ctx.status).toBe(201);
  });

  it('marca o pedido como failed quando a criação do customer na Asaas falha', async () => {
    (asaas.createAsaasCustomer as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });

    const profileWithoutCustomerId = { ...COMPLETE_PROFILE, asaasCustomerId: undefined };
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: profileWithoutCustomerId });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(ctx.status).toBe(502);
    expect(ctx.body).toEqual({ ok: false, error: 'ASAAS_UNAVAILABLE' });
    expect(strapiMock.db.query('api::order.order').update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'failed' },
    });
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

  it('findOne busca pelo reference opaco, não pelo id sequencial, e retorna 404 se não achar', async () => {
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue(null);
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };
    await controller.findOne(ctx);
    expect(ctx.notFound).toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reference: 'abc123def4', user: 1 }) })
    );
  });
});

describe('order controller: simulatePayment', () => {
  it('retorna 401 sem usuário', async () => {
    const ctx = buildCtx(undefined, {}, { id: 'abc123def4' });
    await controller.simulatePayment(ctx);
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('retorna 403 SANDBOX_ONLY quando a config Asaas não é sandbox', async () => {
    (asaas.readAsaasConfigFromEnv as any).mockReturnValueOnce({
      apiUrl: 'https://api.asaas.com/v3',
      apiKey: 'k',
      timeoutMs: 1000,
      userAgent: 'ua',
    });
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne: vi.fn() }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(403);
    expect(ctx.body).toEqual({ ok: false, error: 'SANDBOX_ONLY' });
  });

  it('retorna 404 quando o pedido não pertence ao usuário', async () => {
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue(null);
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.notFound).toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reference: 'abc123def4', user: 1 }) })
    );
  });

  it('retorna 409 ORDER_NOT_PENDING quando o pedido já não está pending', async () => {
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'paid', asaasCheckoutId: 'chk_1' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'ORDER_NOT_PENDING' });
  });

  it('retorna 409 quando o pedido ainda não tem asaasCheckoutId', async () => {
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', asaasCheckoutId: null });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(409);
  });

  it('retorna 409 PAYMENT_NOT_READY quando a Asaas ainda não gerou o pagamento', async () => {
    (asaas.findAsaasPaymentByCheckoutSession as any).mockResolvedValue({ ok: true, data: null });
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', asaasCheckoutId: 'chk_1' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'PAYMENT_NOT_READY' });
  });

  it('chama simulateAsaasPixPayment com o pagamento achado e retorna ok:true', async () => {
    (asaas.findAsaasPaymentByCheckoutSession as any).mockResolvedValue({ ok: true, data: { id: 'pay_1' } });
    (asaas.simulateAsaasPixPayment as any).mockResolvedValue({ ok: true, data: { status: 'RECEIVED' } });
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', asaasCheckoutId: 'chk_1' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(asaas.findAsaasPaymentByCheckoutSession).toHaveBeenCalledWith(expect.anything(), 'chk_1');
    expect(asaas.simulateAsaasPixPayment).toHaveBeenCalledWith(expect.anything(), 'pay_1');
    expect(ctx.body).toEqual({ ok: true });
  });

  it('retorna 502 quando a Asaas falha ao confirmar', async () => {
    (asaas.findAsaasPaymentByCheckoutSession as any).mockResolvedValue({ ok: true, data: { id: 'pay_1' } });
    (asaas.simulateAsaasPixPayment as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', asaasCheckoutId: 'chk_1' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(502);
    expect(ctx.body).toEqual({ ok: false, error: 'ASAAS_UNAVAILABLE' });
  });
});
