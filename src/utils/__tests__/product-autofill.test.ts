import { describe, it, expect } from 'vitest';
import { slugify, fillVariantSkus, buildSeoDefaults } from '../product-autofill';

describe('slugify', () => {
  it('remove acentos, minúsculas, hífens', () => {
    expect(slugify('Cadeira Gamer Épica 220V')).toBe('cadeira-gamer-epica-220v');
  });
  it('colapsa separadores repetidos e bordas', () => {
    expect(slugify('  Aço -- Inox!  ')).toBe('aco-inox');
  });
});

describe('fillVariantSkus', () => {
  it('gera SKU de slug + cor + índice quando vazio', () => {
    const out = fillVariantSkus('cadeira-gamer', [
      { sku: '', colorName: 'Preto Fosco', configLabel: '' },
      { sku: null as any, colorName: 'Azul', configLabel: '' },
    ]);
    expect(out[0].sku).toBe('CADEIRA-GAMER-PRETO-FOSCO-1');
    expect(out[1].sku).toBe('CADEIRA-GAMER-AZUL-2');
  });
  it('usa configLabel quando não há cor, e VAR como fallback', () => {
    const out = fillVariantSkus('mesa', [
      { sku: '', colorName: '', configLabel: '128GB' },
      { sku: '', colorName: '', configLabel: '' },
    ]);
    expect(out[0].sku).toBe('MESA-128GB-1');
    expect(out[1].sku).toBe('MESA-VAR-2');
  });
  it('preserva SKU preenchido pelo usuário e evita duplicata', () => {
    const out = fillVariantSkus('mesa', [
      { sku: 'MEU-CODIGO', colorName: 'Preto', configLabel: '' },
      { sku: 'MEU-CODIGO', colorName: 'Azul', configLabel: '' },
    ]);
    expect(out[0].sku).toBe('MEU-CODIGO');
    expect(out[1].sku).toBe('MEU-CODIGO-2');
  });
  it('evita colisão de SKU manual e gerado com SKUs reservados', () => {
    const out = fillVariantSkus(
      'produto',
      [
        { sku: 'SKU-GLOBAL', colorName: 'Preto', configLabel: '' },
        { sku: '', colorName: 'Azul', configLabel: '' },
      ],
      new Set(['SKU-GLOBAL', 'PRODUTO-AZUL-2'])
    );
    expect(out[0].sku).toBe('SKU-GLOBAL-2');
    expect(out[1].sku).toBe('PRODUTO-AZUL-2-2');
  });
});

describe('buildSeoDefaults', () => {
  it('usa nome como metaTitle truncado em 60', () => {
    const seo = buildSeoDefaults('Produto X', 'Descrição simples.');
    expect(seo.metaTitle).toBe('Produto X');
  });
  it('remove markdown e trunca descrição em 155 chars', () => {
    const md = '# Título\n\n**Negrito** e [link](http://x.com). ' + 'a'.repeat(300);
    const seo = buildSeoDefaults('P', md);
    expect(seo.metaDescription.length).toBeLessThanOrEqual(155);
    expect(seo.metaDescription).not.toContain('#');
    expect(seo.metaDescription).not.toContain('**');
    expect(seo.metaDescription).not.toContain('](');
  });
  it('não sobrescreve valores existentes', () => {
    const seo = buildSeoDefaults('P', 'desc', { metaTitle: 'Manual', metaDescription: '' });
    expect(seo.metaTitle).toBe('Manual');
    expect(seo.metaDescription).toBe('desc');
  });
});
