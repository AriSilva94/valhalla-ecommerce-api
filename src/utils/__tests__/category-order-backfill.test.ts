import { describe, expect, it, vi } from 'vitest';

import { backfillCategoryOrder, planLegacyOrderCopy } from '../category-order-backfill';

describe('planLegacyOrderCopy', () => {
  it('copia o campo `order` legado para sortOrder quando sortOrder está vazio', () => {
    expect(
      planLegacyOrderCopy([
        { id: 1, documentId: 'a', name: 'Air Coolers', sortOrder: null, order: 3 },
        { id: 2, documentId: 'b', name: 'Fontes', sortOrder: null, order: 1 },
      ])
    ).toEqual([
      { documentId: 'a', sortOrder: 3 },
      { documentId: 'b', sortOrder: 1 },
    ]);
  });

  it('nunca mexe em quem já tem sortOrder — inclusive zero', () => {
    expect(
      planLegacyOrderCopy([
        { id: 1, documentId: 'a', name: 'Fontes', sortOrder: 0, order: 9 },
        { id: 2, documentId: 'b', name: 'Gabinetes', sortOrder: 5, order: 1 },
      ])
    ).toEqual([]);
  });

  it('sem campo legado e sem sortOrder, deixa para o plugin posicionar', () => {
    expect(
      planLegacyOrderCopy([{ id: 1, documentId: 'nova', name: 'Armazenamento', sortOrder: null }])
    ).toEqual([]);
  });

  it('preserva empates herdados em vez de reordenar por conta própria', () => {
    expect(
      planLegacyOrderCopy([
        { id: 1, documentId: 'a', name: 'Air Coolers', sortOrder: null, order: 1 },
        { id: 2, documentId: 'b', name: 'Armazenamento', sortOrder: null, order: 1 },
      ])
    ).toEqual([
      { documentId: 'a', sortOrder: 1 },
      { documentId: 'b', sortOrder: 1 },
    ]);
  });

  it('lista vazia não gera atualização', () => {
    expect(planLegacyOrderCopy([])).toEqual([]);
  });
});

describe('backfillCategoryOrder', () => {
  function strapiStub(categories: unknown[]) {
    const update = vi.fn(async () => ({}));
    return {
      update,
      strapi: {
        documents: () => ({
          findMany: async () => categories,
          update,
        }),
        log: { info: vi.fn(), warn: vi.fn() },
      },
    };
  }

  it('grava só quem herda valor do campo legado', async () => {
    const { strapi, update } = strapiStub([
      { id: 1, documentId: 'a', name: 'Gabinetes', sortOrder: 0 },
      { id: 2, documentId: 'b', name: 'Fontes', sortOrder: null, order: 7 },
    ]);

    const result = await backfillCategoryOrder(strapi as never);

    expect(result).toEqual({ updated: 1, total: 2 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ documentId: 'b', data: { sortOrder: 7 } });
  });

  it('base já migrada não sofre nenhuma escrita', async () => {
    const { strapi, update } = strapiStub([
      { id: 1, documentId: 'a', name: 'Fontes', sortOrder: 0 },
      { id: 2, documentId: 'b', name: 'Armazenamento', sortOrder: 1 },
    ]);

    const result = await backfillCategoryOrder(strapi as never);

    expect(result).toEqual({ updated: 0, total: 2 });
    expect(update).not.toHaveBeenCalled();
  });

  it('falha de leitura não derruba o boot', async () => {
    const strapi = {
      documents: () => ({
        findMany: async () => {
          throw new Error('db offline');
        },
        update: vi.fn(),
      }),
      log: { info: vi.fn(), warn: vi.fn() },
    };

    await expect(backfillCategoryOrder(strapi as never)).resolves.toEqual({
      updated: 0,
      total: 0,
    });
    expect(strapi.log.warn).toHaveBeenCalled();
  });

  it('campo legado fora do schema: lê de novo sem ele e não escreve nada', async () => {
    const update = vi.fn(async () => ({}));
    let calls = 0;
    const strapi = {
      documents: () => ({
        findMany: async ({ fields }: { fields: string[] }) => {
          calls += 1;
          if (fields.includes('order')) throw new Error('Invalid key order');
          return [{ id: 1, documentId: 'a', name: 'Fontes', sortOrder: null }];
        },
        update,
      }),
      log: { info: vi.fn(), warn: vi.fn() },
    };

    const result = await backfillCategoryOrder(strapi as never);

    expect(calls).toBe(2);
    expect(result).toEqual({ updated: 0, total: 1 });
    expect(update).not.toHaveBeenCalled();
  });
});
