import { describe, expect, it } from 'vitest';
import { resolveOrderItems, type ProductLookup } from './pricing';

const lookup: ProductLookup = async (slug) => {
  if (slug !== 'iphone-15') return null;
  return {
    name: 'iPhone 15',
    variants: [
      { sku: 'IP15-BLK-128', colorName: 'Preto', configLabel: '128GB', price: 5999, available: true },
      { sku: 'IP15-BLK-256', colorName: 'Preto', configLabel: '256GB', price: 6999, available: false },
    ],
  };
};

describe('resolveOrderItems', () => {
  it('retorna EMPTY_CART para lista vazia', async () => {
    const result = await resolveOrderItems([], lookup);
    expect(result).toEqual({ ok: false, error: 'EMPTY_CART' });
  });

  it('retorna EMPTY_CART quando não é um array', async () => {
    const result = await resolveOrderItems(null, lookup);
    expect(result).toEqual({ ok: false, error: 'EMPTY_CART' });
  });

  it('retorna INVALID_ITEM para item malformado', async () => {
    const result = await resolveOrderItems([{ productSlug: 'x' }], lookup);
    expect(result).toEqual({ ok: false, error: 'INVALID_ITEM' });
  });

  it('retorna PRODUCT_NOT_FOUND quando o slug não existe', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'nao-existe', variantSku: 'X', qty: 1 }],
      lookup
    );
    expect(result).toEqual({ ok: false, error: 'PRODUCT_NOT_FOUND' });
  });

  it('retorna VARIANT_NOT_FOUND quando o sku não bate', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'iphone-15', variantSku: 'INEXISTENTE', qty: 1 }],
      lookup
    );
    expect(result).toEqual({ ok: false, error: 'VARIANT_NOT_FOUND' });
  });

  it('retorna VARIANT_UNAVAILABLE para variante indisponível', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'iphone-15', variantSku: 'IP15-BLK-256', qty: 1 }],
      lookup
    );
    expect(result).toEqual({ ok: false, error: 'VARIANT_UNAVAILABLE' });
  });

  it('resolve preço do catálogo, ignora qualquer preço do cliente e soma o total', async () => {
    const result = await resolveOrderItems(
      [
        { productSlug: 'iphone-15', variantSku: 'IP15-BLK-128', qty: 2, unitPrice: 1 } as any,
      ],
      lookup
    );
    expect(result).toEqual({
      ok: true,
      items: [
        {
          productSlug: 'iphone-15',
          productName: 'iPhone 15',
          variantSku: 'IP15-BLK-128',
          colorName: 'Preto',
          configLabel: '128GB',
          unitPrice: 5999,
          qty: 2,
        },
      ],
      totalAmount: 11998,
    });
  });

  it('limita a quantidade entre 1 e 10', async () => {
    const result = await resolveOrderItems(
      [{ productSlug: 'iphone-15', variantSku: 'IP15-BLK-128', qty: 99 }],
      lookup
    );
    expect(result.ok && result.items[0].qty).toBe(10);
  });
});
