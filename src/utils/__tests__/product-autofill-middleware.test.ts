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
