import { describe, expect, it, vi } from 'vitest';
import controller from './customer-profile';

function buildStrapi(overrides: {
  findOne?: any;
  create?: any;
  update?: any;
}) {
  return {
    db: {
      query: () => ({
        findOne: overrides.findOne ?? vi.fn().mockResolvedValue(null),
        create: overrides.create ?? vi.fn(),
        update: overrides.update ?? vi.fn(),
      }),
    },
  };
}

function buildCtx(userId: number | undefined, body: unknown = {}) {
  const ctx: any = {
    state: { user: userId ? { id: userId } : undefined },
    request: { body },
    status: 0,
    body: undefined,
    unauthorized: vi.fn(),
  };
  return ctx;
}

describe('customer-profile controller: me', () => {
  it('retorna 401 sem usuário autenticado', async () => {
    const ctx = buildCtx(undefined);
    (globalThis as any).strapi = buildStrapi({});
    await controller.me(ctx);
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('retorna null quando o perfil ainda não existe', async () => {
    const ctx = buildCtx(1);
    (globalThis as any).strapi = buildStrapi({ findOne: vi.fn().mockResolvedValue(null) });
    await controller.me(ctx);
    expect(ctx.body).toEqual({ ok: true, data: null });
  });

  it('serializa só os campos públicos, sem asaasCustomerId', async () => {
    const ctx = buildCtx(1);
    (globalThis as any).strapi = buildStrapi({
      findOne: vi.fn().mockResolvedValue({
        id: 9,
        cpfCnpj: '11144477735',
        phone: '11999999999',
        addressLine: 'Rua X',
        addressNumber: '10',
        addressComplement: '',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01310100',
        paymentProviderCustomerId: 'cus_123',
      }),
    });
    await controller.me(ctx);
    expect(ctx.body.data.asaasCustomerId).toBeUndefined();
    expect(ctx.body.data.cpfCnpj).toBe('11144477735');
  });
});

describe('customer-profile controller: updateMe', () => {
  it('retorna 401 sem usuário autenticado', async () => {
    const ctx = buildCtx(undefined);
    (globalThis as any).strapi = buildStrapi({});
    await controller.updateMe(ctx);
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('rejeita CPF inválido com 400 VALIDATION_ERROR', async () => {
    const ctx = buildCtx(1, {
      cpfCnpj: '00000000000',
      postalCode: '01310100',
      state: 'SP',
      addressLine: 'Rua X',
      addressNumber: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
    });
    (globalThis as any).strapi = buildStrapi({});
    await controller.updateMe(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body).toEqual({ ok: false, error: 'VALIDATION_ERROR' });
  });

  it('cria o perfil quando ainda não existe', async () => {
    const create = vi.fn().mockResolvedValue({
      cpfCnpj: '11144477735',
      phone: '',
      addressLine: 'Rua X',
      addressNumber: '10',
      addressComplement: '',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310100',
    });
    const ctx = buildCtx(1, {
      cpfCnpj: '111.444.777-35',
      postalCode: '01310-100',
      state: 'sp',
      addressLine: 'Rua X',
      addressNumber: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
    });
    (globalThis as any).strapi = buildStrapi({ findOne: vi.fn().mockResolvedValue(null), create });
    await controller.updateMe(ctx);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cpfCnpj: '11144477735', user: 1 }) })
    );
    expect(ctx.body.ok).toBe(true);
  });
});
