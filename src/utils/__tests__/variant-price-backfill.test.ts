import { describe, expect, it, vi } from 'vitest';

import {
  MARKER_KEY,
  PLACEHOLDER_PRICE,
  backfillVariantPrices,
  planVariantPriceBackfill,
} from '../variant-price-backfill';

// scripts/seed-catalog.js wrote 99.99 into both basePrice and every variant,
// expecting the client to correct it in the admin. The admin only exposed
// basePrice, so the corrections landed there while the storefront kept reading
// the untouched variant price. This moves those corrections to where the site
// actually reads them.
describe('planVariantPriceBackfill', () => {
  it('leva o preço corrigido no basePrice para a variação ainda no placeholder', () => {
    const plan = planVariantPriceBackfill(
      [
        {
          documentId: 'abc',
          name: 'Pasta Térmica',
          basePrice: 32,
          variants: [{ id: 1, sku: 'PASTA-1', price: PLACEHOLDER_PRICE }],
        },
      ],
      PLACEHOLDER_PRICE
    );

    expect(plan).toEqual([
      {
        documentId: 'abc',
        name: 'Pasta Térmica',
        basePrice: 32,
        variants: [{ id: 1, sku: 'PASTA-1', price: 32 }],
      },
    ]);
  });

  it('não mexe em produto cuja variação já tem preço real', () => {
    const plan = planVariantPriceBackfill(
      [
        {
          documentId: 'abc',
          name: 'Teclado',
          basePrice: PLACEHOLDER_PRICE,
          variants: [{ id: 1, price: 250 }],
        },
      ],
      PLACEHOLDER_PRICE
    );

    expect(plan).toEqual([]);
  });

  it('não mexe em produto que ainda está inteiro no placeholder', () => {
    const plan = planVariantPriceBackfill(
      [
        {
          documentId: 'abc',
          name: 'Gabinete',
          basePrice: PLACEHOLDER_PRICE,
          variants: [{ id: 1, price: PLACEHOLDER_PRICE }],
        },
      ],
      PLACEHOLDER_PRICE
    );

    expect(plan).toEqual([]);
  });

  it('preserva variações com preço próprio e corrige só as do placeholder', () => {
    const plan = planVariantPriceBackfill(
      [
        {
          documentId: 'abc',
          name: 'Fonte',
          basePrice: 289.9,
          variants: [
            { id: 1, configLabel: '500W', price: 289.9 },
            { id: 2, configLabel: '650W', price: PLACEHOLDER_PRICE },
          ],
        },
      ],
      PLACEHOLDER_PRICE
    );

    expect(plan[0].variants).toEqual([
      { id: 1, configLabel: '500W', price: 289.9 },
      { id: 2, configLabel: '650W', price: 289.9 },
    ]);
  });

  it('aceita preços em string, como vêm de um decimal serializado', () => {
    const plan = planVariantPriceBackfill(
      [
        {
          documentId: 'abc',
          name: 'Ventoinha',
          basePrice: '28.49',
          variants: [{ id: 1, price: '99.99' }],
        },
      ],
      PLACEHOLDER_PRICE
    );

    expect(plan[0].variants[0].price).toBe(28.49);
  });

  it('ignora produto sem variação e produto sem basePrice utilizável', () => {
    const plan = planVariantPriceBackfill(
      [
        { documentId: 'a', name: 'Sem variação', basePrice: 32, variants: [] },
        { documentId: 'b', name: 'Sem base', basePrice: null, variants: [{ id: 1, price: PLACEHOLDER_PRICE }] },
      ],
      PLACEHOLDER_PRICE
    );

    expect(plan).toEqual([]);
  });
});

interface FakeProduct {
  documentId: string;
  name: string;
  basePrice: number | string | null;
  variants: Array<Record<string, unknown>>;
}

function makeStrapi(drafts: FakeProduct[], publishedIds: string[] = []) {
  const rows = new Map<string, { id: number; key: string; value: string; type?: string }>();
  const coreStore = {
    findOne: vi.fn(async ({ where: { key } }: { where: { key: string } }) => rows.get(key)),
    update: vi.fn(async ({ where: { id }, data }: { where: { id: number }; data: any }) => {
      const existing = [...rows.values()].find((row) => row.id === id)!;
      rows.set(existing.key, { ...existing, ...data });
    }),
    create: vi.fn(async ({ data }: { data: any }) => {
      rows.set(data.key, { id: rows.size + 1, ...data });
    }),
  };

  const documents = {
    findMany: vi.fn(async ({ status }: { status: 'draft' | 'published' }) =>
      status === 'draft'
        ? drafts
        : drafts.filter((product) => publishedIds.includes(product.documentId))
    ),
    update: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
  };

  const strapi = {
    db: { query: vi.fn(() => coreStore) },
    documents: vi.fn(() => documents),
    log: { info: vi.fn(), warn: vi.fn() },
  };

  return { strapi: strapi as never, coreStore, documents, rows };
}

const editedProduct: FakeProduct = {
  documentId: 'abc',
  name: 'Pasta Térmica',
  basePrice: 32,
  variants: [{ id: 1, sku: 'PASTA-1', price: PLACEHOLDER_PRICE }],
};

describe('backfillVariantPrices', () => {
  it('grava a variação corrigida e republica o documento publicado', async () => {
    const harness = makeStrapi([editedProduct], ['abc']);

    const result = await backfillVariantPrices(harness.strapi);

    expect(result.updated).toBe(1);
    expect(harness.documents.update).toHaveBeenCalledWith({
      documentId: 'abc',
      data: { variants: [{ id: 1, sku: 'PASTA-1', price: 32 }] },
    });
    expect(harness.documents.publish).toHaveBeenCalledWith({ documentId: 'abc' });
    expect(harness.rows.get(MARKER_KEY)?.value).toBe(JSON.stringify(1));
  });

  it('não republica documento que só existe como rascunho', async () => {
    const harness = makeStrapi([editedProduct], []);

    await backfillVariantPrices(harness.strapi);

    expect(harness.documents.update).toHaveBeenCalledOnce();
    expect(harness.documents.publish).not.toHaveBeenCalled();
  });

  it('não roda de novo depois do marker gravado', async () => {
    const harness = makeStrapi([editedProduct], ['abc']);

    await backfillVariantPrices(harness.strapi);
    harness.documents.update.mockClear();
    harness.documents.publish.mockClear();

    const second = await backfillVariantPrices(harness.strapi);

    expect(second.updated).toBe(0);
    expect(harness.documents.update).not.toHaveBeenCalled();
    expect(harness.documents.publish).not.toHaveBeenCalled();
  });

  it('grava o marker mesmo quando não há nada a corrigir', async () => {
    const harness = makeStrapi([
      {
        documentId: 'xyz',
        name: 'Intocado',
        basePrice: PLACEHOLDER_PRICE,
        variants: [{ id: 1, price: PLACEHOLDER_PRICE }],
      },
    ]);

    const result = await backfillVariantPrices(harness.strapi);

    expect(result.updated).toBe(0);
    expect(harness.documents.update).not.toHaveBeenCalled();
    expect(harness.rows.get(MARKER_KEY)?.value).toBe(JSON.stringify(1));
  });
});
