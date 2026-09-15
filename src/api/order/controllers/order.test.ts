import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/external/asaas.service', () => ({
  readAsaasConfigFromEnv: vi.fn(() => ({
    apiUrl: 'https://api-sandbox.asaas.com/v3',
    apiKey: 'secret-api-key',
    timeoutMs: 1000,
    userAgent: 'ua',
  })),
  createAsaasCustomer: vi.fn(),
  createAsaasCheckout: vi.fn(),
  cancelAsaasCheckout: vi.fn(async () => ({ ok: true, data: { status: 'CANCELED' } })),
  findAsaasPaymentByCheckoutSession: vi.fn(),
  simulateAsaasPixPayment: vi.fn(),
}));

vi.mock('../../../services/redis', () => ({
  getRedisConnection: vi.fn(() => null),
}));

vi.mock('../../../order/idempotency', () => ({
  getIdempotencyResult: vi.fn(async () => null),
  reserveIdempotency: vi.fn(async () => ({ status: 'unavailable' })),
  saveIdempotencyResult: vi.fn(async () => false),
  releaseIdempotency: vi.fn(async () => false),
}));

import controller from './order';
import * as asaas from '../../../services/external/asaas.service';
import * as idempotency from '../../../order/idempotency';
import * as redis from '../../../services/redis';

function buildCtx(
  userId: number | undefined,
  body: unknown = {},
  params: Record<string, string> = {},
  idempotencyKey: string | undefined = 'fe5a0dc7-d204-4ab8-8e39-74191ee7b4f0'
) {
  return {
    state: { user: userId ? { id: userId } : undefined },
    request: { body, header: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {} },
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
      create: vi.fn().mockResolvedValue(opts.order ?? { id: 1, reference: 'abc123def4', createdAt: '2026-09-12T10:00:00.000Z' }),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 1, reference: 'abc123def4', createdAt: '2026-09-12T10:00:00.000Z', ...data })),
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

  it('exige uma Idempotency-Key UUID antes de consultar produtos ou a Asaas', async () => {
    const findProduct = vi.fn();
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] }, {}, '');
    (globalThis as any).strapi = { db: { query: () => ({ findOne: findProduct }) } };

    await controller.create(ctx);

    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(findProduct).not.toHaveBeenCalled();
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('retorna a resposta salva sem chamar a Asaas novamente', async () => {
    const response = {
      ok: true,
      data: {
        reference: 'abc123def4',
        items: [],
        totalAmount: 100,
        status: 'pending',
        checkoutUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_1',
        createdAt: '2026-09-12T10:00:00.000Z',
      },
    };
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(response);
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body).toEqual(response);
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('retorna CHECKOUT_IN_PROGRESS quando outra requisição possui a reserva', async () => {
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'in-progress' });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_IN_PROGRESS' });
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('reaproveita o pedido durável criado com a mesma chave', async () => {
    const existingOrder = {
      id: 1,
      reference: 'abc123def4',
      items: [],
      totalAmount: 100,
      status: 'pending',
      asaasCheckoutId: 'chk_1',
      asaasInvoiceUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_1',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ order: existingOrder });
    strapiMock.db.query('api::order.order').findOne.mockResolvedValue(existingOrder);
    (globalThis as any).strapi = strapiMock;
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'reserved', owner: 'owner-1' });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body).toEqual({ ok: true, data: expect.objectContaining({ reference: 'abc123def4' }) });
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
    expect(idempotency.saveIdempotencyResult).toHaveBeenCalled();
    expect(idempotency.releaseIdempotency).toHaveBeenCalledWith(expect.anything(), 1, expect.any(String), 'owner-1');
  });

  it('sinaliza recuperação manual para pedido pendente antigo sem checkout Asaas', async () => {
    const incompleteOrder = {
      id: 3,
      reference: 'interrupted',
      items: [],
      totalAmount: 100,
      status: 'pending',
      asaasCheckoutId: null,
      asaasInvoiceUrl: null,
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ order: incompleteOrder });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.findOne.mockResolvedValue(incompleteOrder);
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockClear();
    (idempotency.saveIdempotencyResult as any).mockClear();
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'reserved', owner: 'owner-interrupted' });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_RECOVERY_REQUIRED' });
    expect(orderRepository.update).toHaveBeenCalledWith({
      where: {
        id: 3,
        status: 'pending',
        asaasCheckoutId: { $null: true },
        asaasInvoiceUrl: { $null: true },
      },
      data: { status: 'failed' },
    });
    expect(idempotency.saveIdempotencyResult).not.toHaveBeenCalled();
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('retoma o pedido pendente recente sem checkout quando possui a reserva', async () => {
    const activeOrder = {
      id: 5,
      reference: 'active-checkout',
      items: [],
      totalAmount: 100,
      status: 'pending',
      asaasCheckoutId: null,
      asaasInvoiceUrl: null,
      createdAt: new Date().toISOString(),
    };
    const strapiMock = buildStrapiForCreate({ order: activeOrder, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.findOne.mockResolvedValue(activeOrder);
    (globalThis as any).strapi = strapiMock;
    (idempotency.saveIdempotencyResult as any).mockClear();
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'reserved', owner: 'owner-active' });
    (asaas.createAsaasCheckout as any).mockResolvedValue({
      ok: true,
      data: { id: 'chk_active', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_active' },
    });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkoutSession/show/chk_active');
    expect(asaas.createAsaasCheckout).toHaveBeenCalledTimes(1);
  });

  it('cancela checkout remoto após falha local e permite uma nova tentativa segura', async () => {
    const createdOrder = {
      id: 8,
      reference: 'replay-after-persist-failure',
      items: [],
      totalAmount: 100,
      status: 'pending',
      asaasCheckoutId: null,
      asaasInvoiceUrl: null,
      createdAt: new Date().toISOString(),
    };
    const retriedOrder = {
      ...createdOrder,
      asaasCheckoutId: 'chk_retry',
      asaasInvoiceUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_retry',
    };
    const strapiMock = buildStrapiForCreate({ order: createdOrder, product: PRODUCT, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(createdOrder);
    orderRepository.update
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(retriedOrder);
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockClear();
    (asaas.cancelAsaasCheckout as any).mockClear();
    (asaas.createAsaasCheckout as any)
      .mockResolvedValueOnce({
        ok: true,
        data: { id: 'chk_orphaned', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_orphaned' },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { id: 'chk_retry', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_retry' },
      });
    (idempotency.reserveIdempotency as any)
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockResolvedValueOnce({ status: 'reserved', owner: 'owner-retry' });
    (redis.getRedisConnection as any).mockReturnValueOnce({}).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const first = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    const second = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(first);
    await controller.create(second);

    expect(first.body).toEqual({ ok: false, error: 'CHECKOUT_PERSISTENCE_FAILED' });
    expect(second.status).toBe(201);
    expect(second.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkoutSession/show/chk_retry');
    expect(asaas.cancelAsaasCheckout).toHaveBeenCalledWith(expect.anything(), 'chk_orphaned');
    expect(asaas.createAsaasCheckout).toHaveBeenCalledTimes(2);
  });

  it('registra falha de cancelamento sem vazar credenciais', async () => {
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.update.mockRejectedValue(new Error('database unavailable'));
    strapiMock.log = { warn: vi.fn() };
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockResolvedValueOnce({
      ok: true,
      data: { id: 'chk_cancel_failure', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_cancel_failure' },
    });
    (asaas.cancelAsaasCheckout as any).mockResolvedValueOnce({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_PERSISTENCE_FAILED' });
    expect(asaas.cancelAsaasCheckout).toHaveBeenCalledWith(expect.anything(), 'chk_cancel_failure');
    expect(strapiMock.log.warn).toHaveBeenCalledWith(expect.stringContaining('checkout-cancel-failed'));
    expect(strapiMock.log.warn.mock.calls.flat().join(' ')).not.toContain('secret-api-key');
  });

  it('recupera condicionalmente o pedido pendente antigo sem checkout', async () => {
    const staleOrder = {
      id: 6,
      reference: 'stale-checkout',
      items: [],
      totalAmount: 100,
      status: 'pending',
      asaasCheckoutId: null,
      asaasInvoiceUrl: null,
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ order: staleOrder });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.findOne.mockResolvedValue(staleOrder);
    (globalThis as any).strapi = strapiMock;
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'reserved', owner: 'owner-stale' });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_RECOVERY_REQUIRED' });
    expect(orderRepository.update).toHaveBeenCalledWith({
      where: {
        id: 6,
        status: 'pending',
        asaasCheckoutId: { $null: true },
        asaasInvoiceUrl: { $null: true },
      },
      data: { status: 'failed' },
    });
  });

  it('retorna 422 PROFILE_INCOMPLETE sem perfil salvo', async () => {
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    (globalThis as any).strapi = buildStrapiForCreate({ product: PRODUCT, profile: null });
    await controller.create(ctx);
    expect(ctx.status).toBe(422);
    expect(ctx.body).toEqual({ ok: false, error: 'PROFILE_INCOMPLETE' });
  });

  it('cria o pedido e o checkout Asaas com perfil e asaasCustomerId já existentes', async () => {
    (asaas.createAsaasCheckout as any).mockResolvedValue({
      ok: true,
      data: { id: 'chk_1', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_1' },
    });

    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });
    (globalThis as any).strapi = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });

    await controller.create(ctx);

    expect(asaas.createAsaasCustomer).not.toHaveBeenCalled();
    expect(asaas.createAsaasCheckout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customerId: 'cus_existing', externalReference: 'abc123def4' })
    );
    expect(ctx.status).toBe(201);
    expect(ctx.body.ok).toBe(true);
    expect(ctx.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkoutSession/show/chk_1');
    expect(ctx.body.data.reference).toBe('abc123def4');
    expect(ctx.body.data.id).toBeUndefined();
    expect(idempotency.saveIdempotencyResult).toHaveBeenLastCalledWith(
      expect.any(Object),
      1,
      'fe5a0dc7-d204-4ab8-8e39-74191ee7b4f0',
      ctx.body
    );
  });

  it('relê o pedido quando a chave única sofre corrida de criação', async () => {
    const duplicateOrder = {
      id: 2,
      reference: 'race123456',
      items: [],
      totalAmount: 100,
      status: 'pending',
      asaasCheckoutId: 'chk_2',
      asaasInvoiceUrl: 'https://sandbox.asaas.com/checkoutSession/show/chk_2',
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicateOrder);
    orderRepository.create.mockRejectedValueOnce({ code: '23505' });
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockClear();
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'reserved', owner: 'owner-race' });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body).toEqual({ ok: true, data: expect.objectContaining({ reference: 'race123456' }) });
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('não retorna nem armazena pedido incompleto após corrida na chave única', async () => {
    const incompleteOrder = {
      id: 4,
      reference: 'race-interrupted',
      items: [],
      totalAmount: 100,
      status: 'pending',
      asaasCheckoutId: null,
      asaasInvoiceUrl: null,
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(incompleteOrder);
    orderRepository.create.mockRejectedValueOnce({ code: '23505' });
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockClear();
    (idempotency.saveIdempotencyResult as any).mockClear();
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'reserved', owner: 'owner-race-interrupted' });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_RECOVERY_REQUIRED' });
    expect(orderRepository.update).toHaveBeenCalledWith({
      where: {
        id: 4,
        status: 'pending',
        asaasCheckoutId: { $null: true },
        asaasInvoiceUrl: { $null: true },
      },
      data: { status: 'failed' },
    });
    expect(idempotency.saveIdempotencyResult).not.toHaveBeenCalled();
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
  });

  it('retorna conflito genérico quando a chave única pertence a outro usuário', async () => {
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.create.mockRejectedValueOnce({ code: '23505' });
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockClear();
    (idempotency.saveIdempotencyResult as any).mockClear();
    (redis.getRedisConnection as any).mockReturnValueOnce({});
    (idempotency.getIdempotencyResult as any).mockResolvedValueOnce(null);
    (idempotency.reserveIdempotency as any).mockResolvedValueOnce({ status: 'reserved', owner: 'owner-cross-user' });
    const ctx = buildCtx(2, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(409);
    expect(ctx.body).toEqual({ ok: false, error: 'IDEMPOTENCY_KEY_CONFLICT' });
    expect(asaas.createAsaasCheckout).not.toHaveBeenCalled();
    expect(idempotency.saveIdempotencyResult).not.toHaveBeenCalled();
  });

  it('retorna falha de persistência sem marcar o checkout remoto como falho', async () => {
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.update.mockRejectedValue(new Error('database unavailable'));
    strapiMock.log = { warn: vi.fn() };
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockResolvedValue({
      ok: true,
      data: { id: 'chk_persist', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_persist' },
    });
    (asaas.cancelAsaasCheckout as any).mockResolvedValueOnce({ ok: true, data: { status: 'CANCELED' } });
    (idempotency.saveIdempotencyResult as any).mockClear();
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(503);
    expect(ctx.body).toEqual({ ok: false, error: 'CHECKOUT_PERSISTENCE_FAILED' });
    expect(orderRepository.update).toHaveBeenCalledTimes(2);
    expect(asaas.cancelAsaasCheckout).toHaveBeenCalledWith(expect.anything(), 'chk_persist');
    expect(idempotency.saveIdempotencyResult).not.toHaveBeenCalled();
    expect(strapiMock.log.warn).toHaveBeenCalledWith(expect.stringContaining('checkout-persistence-failed'));
    expect(strapiMock.log.warn.mock.calls.flat().join(' ')).not.toContain('fe5a0dc7-d204-4ab8-8e39-74191ee7b4f0');
  });

  it('recupera a persistência do checkout remoto em uma nova tentativa local', async () => {
    const strapiMock = buildStrapiForCreate({ product: PRODUCT, profile: COMPLETE_PROFILE });
    const orderRepository = strapiMock.db.query('api::order.order');
    orderRepository.update.mockRejectedValueOnce(new Error('temporary database failure'));
    (globalThis as any).strapi = strapiMock;
    (asaas.createAsaasCheckout as any).mockResolvedValue({
      ok: true,
      data: { id: 'chk_recovered', link: 'https://sandbox.asaas.com/checkoutSession/show/chk_recovered' },
    });
    const ctx = buildCtx(1, { items: [{ productSlug: 'iphone-15', variantSku: 'S1', qty: 1 }] });

    await controller.create(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body.data.checkoutUrl).toBe('https://sandbox.asaas.com/checkoutSession/show/chk_recovered');
    expect(orderRepository.update).toHaveBeenCalledTimes(2);
  });

  it('marca o pedido como failed quando a criação do checkout falha', async () => {
    (asaas.createAsaasCheckout as any).mockResolvedValue({ ok: false, code: 'ASAAS_UNAVAILABLE', status: 503 });
    (idempotency.saveIdempotencyResult as any).mockClear();

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
    expect(idempotency.saveIdempotencyResult).not.toHaveBeenCalled();
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
