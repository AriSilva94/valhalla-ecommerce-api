import { describe, expect, it } from 'vitest';

import { autofillProductData, createAsyncSerializer } from '../product-autofill-middleware';

const completeExisting = {
  name: 'Nome existente',
  slug: 'slug-manual',
  description: 'Descrição existente',
  seo: {
    id: 7,
    metaTitle: 'Título manual',
    metaDescription: 'Descrição manual',
    shareImage: { id: 9 },
  },
};

describe('autofillProductData', () => {
  it('não injeta slug ou SEO em patch de nome quando existentes estão completos', () => {
    const patch = { name: 'Novo nome' };

    expect(autofillProductData(patch, completeExisting)).toEqual({ name: 'Novo nome' });
    expect(patch).toEqual({ name: 'Novo nome' });
  });

  it('usa slug persistido para variantes sem injetar slug no patch', () => {
    const out = autofillProductData(
      { variants: [{ sku: '', colorName: 'Azul', configLabel: '' }] },
      completeExisting
    );

    expect(out.variants[0].sku).toBe('SLUG-MANUAL-AZUL-1');
    expect(out).not.toHaveProperty('slug');
    expect(out).not.toHaveProperty('seo');
  });

  it('mescla SEO parcial preservando campos persistidos e preenche somente o vazio', () => {
    const out = autofillProductData(
      { name: 'Novo nome', seo: { metaTitle: '' } },
      completeExisting
    );

    expect(out.seo).toEqual({
      id: 7,
      metaTitle: 'Novo nome',
      metaDescription: 'Descrição manual',
      shareImage: { id: 9 },
    });
  });

  it('preenche slug, variantes e SEO na criação', () => {
    const out = autofillProductData({
      name: 'Produto Novo',
      description: '**Descrição** nova.',
      variants: [{ sku: '', colorName: 'Preto', configLabel: '' }],
    });

    expect(out.slug).toBe('produto-novo');
    expect(out.variants[0].sku).toBe('PRODUTO-NOVO-PRETO-1');
    expect(out.seo).toMatchObject({
      metaTitle: 'Produto Novo',
      metaDescription: 'Descrição nova.',
    });
  });
});

// basePrice is only a fallback for the storefront: it reads variants[0].price
// and every product is required to have at least one variant, so an admin
// editing basePrice by hand changed nothing on the site. It is now derived from
// the variants and hidden from the admin form, which makes the variant price
// the single source of truth.
describe('autofillProductData: basePrice derivado das variações', () => {
  it('usa o menor preço entre as variações recebidas', () => {
    const out = autofillProductData({
      name: 'Produto Novo',
      variants: [
        { configLabel: '256GB', price: 149.9 },
        { configLabel: '128GB', price: 99.9 },
      ],
    });

    expect(out.basePrice).toBe(99.9);
  });

  it('sobrescreve o basePrice enviado, que nunca é a fonte da verdade', () => {
    const out = autofillProductData(
      { basePrice: 99.99, variants: [{ configLabel: 'Padrão', price: 32 }] },
      { name: 'Pasta Térmica', slug: 'pasta-termica' }
    );

    expect(out.basePrice).toBe(32);
  });

  it('aceita preço em string, como chega do REST', () => {
    const out = autofillProductData(
      { variants: [{ configLabel: 'Padrão', price: '28.49' }] },
      { name: 'Ventoinha', slug: 'ventoinha' }
    );

    expect(out.basePrice).toBe(28.49);
  });

  it('ignora variações sem preço utilizável', () => {
    const out = autofillProductData({
      name: 'Produto Novo',
      variants: [
        { configLabel: 'A', price: null },
        { configLabel: 'B', price: 45 },
      ],
    });

    expect(out.basePrice).toBe(45);
  });

  it('não toca no basePrice quando nenhuma variação tem preço', () => {
    const out = autofillProductData({
      name: 'Produto Novo',
      basePrice: 10,
      variants: [{ configLabel: 'A', price: undefined }],
    });

    expect(out.basePrice).toBe(10);
  });

  it('não injeta basePrice em patch que não mexe nas variações', () => {
    const out = autofillProductData(
      { warranty: '12 meses' },
      { name: 'Produto', slug: 'produto', variants: [{ price: 32 }] }
    );

    expect(out).not.toHaveProperty('basePrice');
  });
});

describe('createAsyncSerializer', () => {
  it('mantém somente uma escrita ativa e preserva a ordem', async () => {
    const serialize = createAsyncSerializer();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = serialize(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = serialize(async () => {
      events.push('second:start');
      events.push('second:end');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });
});
