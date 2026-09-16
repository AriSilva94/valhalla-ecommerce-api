import { createHash } from 'crypto';
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
const FINGERPRINT_QTY_ONE = createHash('sha256')
  .update(JSON.stringify({ items: [{ productSlug: 'iphone-15', qty: 1, variantSku: 'S1' }] }))
  .digest('hex');

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
  paymentProviderCustomerId: 'cus_existing',
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
      checkoutIdempotencyFingerprint: FINGERPRINT_QTY_ONE,
      items: [{ productSlug: 'iphone-15', productName: 'iPhone 15', variantSku: 'S1', colorName: 'Preto', configLabel: '128GB', unitPrice: 100, qty: 1 }],
      totalAmount: 100,
      status: 'pending',
      checkoutProcessingStatus: 'completed',
      paymentUrl: 'https://sandbox.asaas.com/checkout/existing',
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
        .mockResolvedValueOnce({ ...createdOrder, checkoutProcessingStatus: 'processing' })
        .mockRejectedValueOnce({ code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'orders.checkout_idempotency_scope' }),
      update: vi.fn().mockResolvedValue(createdOrder),
      findMany: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockImplementation(async () => {
        findOneCalls += 1;
        return findOneCalls > 2 ? { ...createdOrder, checkoutProcessingStatus: 'processing' } : null;
      }),
    };
    const base = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const originalQuery = base.db.query;
    base.db.query = ((uid: string) => uid === 'api::order.order' ? orderQuery : originalQuery(uid)) as any;
    (globalThis as any).strapi = base;
    (asaas.createAsaasCheckout as any).mockResolvedValue({ ok: true, data: { id: 'chk_1', link: 'https://sandbox.asaas.com/checkout/chk_1' } });

    const body = { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] };
    const first = controller.create(buildCtx(1, body, {}, { 'Idempotency-Key': key }));
    await vi.waitFor(() => expect(asaas.createAsaasCheckout).toHaveBeenCalledTimes(1));
    const second = controller.create(buildCtx(1, body, {}, { 'Idempotency-Key': key }));
    await Promise.all([first, second]);

    expect(orderQuery.create).toHaveBeenCalledTimes(2);
    expect(asaas.createAsaasCheckout).toHaveBeenCalledTimes(1);
  });

  it('retorna conflito quando a mesma chave é usada com payload diferente', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440002';
    const existingOrder = {
      id: 11,
      reference: 'different-payload',
      checkoutIdempotencyFingerprint: createHash('sha256').update(JSON.stringify({ items: [{ productSlug: 'iphone-15', qty: 2, variantSku: 'S1' }] })).digest('hex'),
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

  it('aguarda o checkout em andamento e retorna a mesma URL para requisições concorrentes', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440004';
    const processingOrder = {
      id: 12,
      reference: 'processing-order',
      checkoutIdempotencyKey: key,
      checkoutIdempotencyScope: `1:${key}`,
      checkoutIdempotencyFingerprint: FINGERPRINT_QTY_ONE,
      checkoutProcessingStatus: 'processing',
      items: [{ productSlug: 'iphone-15', productName: 'iPhone 15', variantSku: 'S1', colorName: 'Preto', configLabel: '128GB', unitPrice: 100, qty: 1 }],
      totalAmount: 100,
      status: 'pending',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const completedOrder = { ...processingOrder, checkoutProcessingStatus: 'completed', paymentUrl: 'https://sandbox.asaas.com/checkout/shared' };
    let resolveCheckout!: (value: any) => void;
    const checkoutBlocked = new Promise((resolve) => { resolveCheckout = resolve; });
    let findOneCalls = 0;
    const orderQuery = {
      create: vi.fn()
        .mockResolvedValueOnce(processingOrder)
        .mockRejectedValueOnce({ code: 'SQLITE_CONSTRAINT_UNIQUE', message: 'orders.checkout_idempotency_scope' }),
      update: vi.fn().mockResolvedValue(completedOrder),
      findMany: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockImplementation(async () => {
        findOneCalls += 1;
        return findOneCalls > 2 ? processingOrder : null;
      }),
    };
    const base = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const originalQuery = base.db.query;
    base.db.query = ((uid: string) => uid === 'api::order.order' ? orderQuery : originalQuery(uid)) as any;
    (globalThis as any).strapi = base;
    (asaas.createAsaasCheckout as any).mockReturnValue(checkoutBlocked.then(() => ({ ok: true, data: { id: 'chk_shared', link: 'https://sandbox.asaas.com/checkout/shared' } })));

    const body = { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] };
    const firstCtx = buildCtx(1, body, {}, { 'Idempotency-Key': key });
    const secondCtx = buildCtx(1, body, {}, { 'Idempotency-Key': key });
    const first = controller.create(firstCtx);
    await vi.waitFor(() => expect(asaas.createAsaasCheckout).toHaveBeenCalledTimes(1));
    const second = controller.create(secondCtx);
    await second;
    expect(secondCtx.status).toBe(409);
    expect(secondCtx.body).toEqual({ ok: false, error: 'CHECKOUT_IN_PROGRESS' });

    resolveCheckout(undefined);
    await Promise.all([first, second]);

    expect(asaas.createAsaasCheckout).toHaveBeenCalledTimes(1);
    expect(firstCtx.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkout/shared');
    expect(secondCtx.body.data).toBeUndefined();
  });

  it('retorna o resultado persistido mesmo quando o catálogo desapareceu no retry', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440005';
    const existingOrder = {
      id: 13,
      reference: 'catalog-gone',
      checkoutIdempotencyKey: key,
      checkoutIdempotencyScope: `1:${key}`,
      checkoutIdempotencyFingerprint: FINGERPRINT_QTY_ONE,
      checkoutProcessingStatus: 'completed',
      items: [{ productSlug: 'iphone-15', productName: 'iPhone 15', variantSku: 'S1', colorName: 'Preto', configLabel: '128GB', unitPrice: 100, qty: 1 }],
      totalAmount: 100,
      status: 'pending',
      paymentUrl: 'https://sandbox.asaas.com/checkout/persisted',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ profile: COMPLETE_PROFILE, existingOrder });
    strapiMock.db.query('api::product.product').findOne.mockRejectedValue(new Error('catalog unavailable'));
    (globalThis as any).strapi = strapiMock;
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] }, {}, { 'Idempotency-Key': key });

    await controller.create(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkout/persisted');
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
    expect(strapiMock.db.query('api::product.product').findOne).not.toHaveBeenCalled();
  });

  it('isola a mesma chave entre usuários diferentes', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440006';
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockResolvedValue({ ok: true, data: { id: 'chk_users', link: 'https://sandbox.asaas.com/checkout/users' } });
    const body = { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] };

    await controller.create(buildCtx(1, body, {}, { 'Idempotency-Key': key }));
    await controller.create(buildCtx(2, body, {}, { 'Idempotency-Key': key }));

    const createdData = strapiMock.db.query('api::order.order').create.mock.calls.map(([input]: any[]) => input.data);
    expect(createdData).toEqual([
      expect.objectContaining({ checkoutIdempotencyKey: key, checkoutIdempotencyScope: `1:${key}` }),
      expect.objectContaining({ checkoutIdempotencyKey: key, checkoutIdempotencyScope: `2:${key}` }),
    ]);
  });

  it('retorna resposta transitória para pedido processing sem checkout após timeout curto', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440007';
    const processingOrder = {
      id: 14,
      reference: 'stuck-processing',
      checkoutIdempotencyKey: key,
      checkoutIdempotencyScope: `1:${key}`,
      checkoutIdempotencyFingerprint: FINGERPRINT_QTY_ONE,
      checkoutProcessingStatus: 'processing',
      checkoutProcessingLeaseUntil: new Date(Date.now() + 60_000).toISOString(),
      items: [{ productSlug: 'iphone-15', productName: 'iPhone 15', variantSku: 'S1', colorName: 'Preto', configLabel: '128GB', unitPrice: 100, qty: 1 }],
      totalAmount: 100,
      status: 'pending',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ profile: COMPLETE_PROFILE, existingOrder: processingOrder });
    strapiMock.db.query('api::order.order').findOne.mockResolvedValue(processingOrder);
    (globalThis as any).strapi = strapiMock;
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] }, {}, { 'Idempotency-Key': key });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_IN_PROGRESS' });
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('rejeita campos extras no body e não os iguala no fingerprint', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440008';
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    (globalThis as any).strapi = strapiMock;
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }], coupon: 'PROMO' }, {}, { 'Idempotency-Key': key });

    await controller.create(ctx);

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ ok: false, error: 'INVALID_CHECKOUT_PAYLOAD' });
    expect(strapiMock.db.query('api::order.order').create).not.toHaveBeenCalled();
  });

  it('não normaliza qty decimal no fingerprint da mesma chave', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440009';
    const existingOrder = {
      id: 15,
      reference: 'decimal-fingerprint',
      checkoutIdempotencyFingerprint: createHash('sha256').update(JSON.stringify({ items: [{ productSlug: 'iphone-15', qty: 1, variantSku: 'S1' }] })).digest('hex'),
      checkoutProcessingStatus: 'completed',
      paymentUrl: 'https://sandbox.asaas.com/checkout/decimal',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ existingOrder });
    (globalThis as any).strapi = strapiMock;
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1.5 }] }, {}, { 'Idempotency-Key': key });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'IDEMPOTENCY_KEY_REUSED' });
    expect(strapiMock.db.query('api::product.product').findOne).not.toHaveBeenCalled();
  });

  it('exige reconciliação quando o lease persistido de processing expirou', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440012';
    const existingOrder = {
      id: 16,
      reference: 'expired-processing',
      checkoutIdempotencyFingerprint: FINGERPRINT_QTY_ONE,
      checkoutProcessingStatus: 'processing',
      checkoutProcessingLeaseUntil: new Date(Date.now() - 1_000).toISOString(),
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ existingOrder });
    (globalThis as any).strapi = strapiMock;
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] }, {}, { 'Idempotency-Key': key });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' });
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
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
      data: expect.objectContaining({ checkoutIdempotencyKey: VALID_KEY.toLowerCase(), checkoutIdempotencyScope: `1:${VALID_KEY.toLowerCase()}` }),
    });
    expect(asaas.createAsaasCheckout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        customerId: 'cus_existing',
        externalReference: 'abc123def4',
      })
    );
    expect(ctx.status).toBe(201);
    expect(ctx.body.ok).toBe(true);
    expect(ctx.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkoutSession/show/chk_1');
    expect(ctx.body.data.reference).toBe('abc123def4');
    expect(ctx.body.data.id).toBeUndefined();
  });

  it('mantém o pedido em reconciliação quando a criação do checkout falha', async () => {
    (asaas.createAsaasCheckout as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_RECONCILIATION_REQUIRED' });
    expect(strapiMock.db.query('api::order.order').update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ checkoutProcessingStatus: 'reconciliation_required' }),
    });
  });

  it('cria o customer na Asaas e persiste asaasCustomerId no perfil quando ainda não existe', async () => {
    (asaas.createAsaasCustomer as any).mockResolvedValue({ ok: true, data: { id: 'cus_new' } });
    (asaas.createAsaasCheckout as any).mockResolvedValue({
      ok: true,
      data: { id: 'chk_2', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_2' },
    });

    const profileWithoutCustomerId = { ...COMPLETE_PROFILE, paymentProviderCustomerId: undefined };
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: profileWithoutCustomerId });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(asaas.createAsaasCustomer).toHaveBeenCalled();
    expect(strapiMock.db.query('api::customer-profile.customer-profile').update).toHaveBeenCalledWith({
      where: { id: profileWithoutCustomerId.id },
      data: { paymentProviderCustomerId: 'cus_new' },
    });
    expect(ctx.status).toBe(201);
  });

  it('marca o pedido como failed quando a criação do customer na Asaas falha', async () => {
    (asaas.createAsaasCustomer as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });

    const profileWithoutCustomerId = { ...COMPLETE_PROFILE, paymentProviderCustomerId: undefined };
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: profileWithoutCustomerId });
    (globalThis as any).strapi = strapiMock;

    await controller.create(ctx);

    expect(ctx.status).toBe(502);
    expect(ctx.body).toEqual({ ok: false, error: 'ASAAS_UNAVAILABLE' });
    expect(strapiMock.db.query('api::order.order').update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'failed', checkoutProcessingStatus: 'failed' }),
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
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'paid', providerCheckoutId: 'chk_1' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'ORDER_NOT_PENDING' });
  });

  it('retorna 409 quando o pedido ainda não tem asaasCheckoutId', async () => {
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', providerCheckoutId: null });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(409);
  });

  it('retorna 409 PAYMENT_NOT_READY quando a Asaas ainda não gerou o pagamento', async () => {
    (asaas.findAsaasPaymentByCheckoutSession as any).mockResolvedValue({ ok: true, data: null });
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', providerCheckoutId: 'chk_1' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'PAYMENT_NOT_READY' });
  });

  it('chama simulateAsaasPixPayment com o pagamento achado e retorna ok:true', async () => {
    (asaas.findAsaasPaymentByCheckoutSession as any).mockResolvedValue({ ok: true, data: { id: 'pay_1' } });
    (asaas.simulateAsaasPixPayment as any).mockResolvedValue({ ok: true, data: { status: 'RECEIVED' } });
    const ctx = buildCtx(1, {}, { id: 'abc123def4' });
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', providerCheckoutId: 'chk_1' });
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
    const findOne = vi.fn().mockResolvedValue({ id: 1, status: 'pending', providerCheckoutId: 'chk_1' });
    (globalThis as any).strapi = { db: { query: () => ({ findOne }) } };

    await controller.simulatePayment(ctx);

    expect(ctx.status).toBe(502);
    expect(ctx.body).toEqual({ ok: false, error: 'ASAAS_UNAVAILABLE' });
  });
});
