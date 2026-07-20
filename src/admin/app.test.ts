import { describe, expect, it } from 'vitest';

import adminApp, { ptBRTranslations } from './app';

const auditedRuntimeTranslationIds = [
  'global.home',
  'content-manager.plugin.name',
  'widget.deploy-now.title',
  'HomePage.widget.deploy-now.title',
  'cloud.Plugin.name',
  'search.placeholder',
  'content-manager.containers.list.table-headers.status',
  'content-manager.containers.edit.header.more-actions',
  'content-manager.containers.edit.panels.default.more-actions',
  'content-manager.dnd.instructions',
  'content-manager.containers.edit.panels.default.title',
  'content-manager.containers.edit.title.new',
  'content-manager.containers.edit.tabs.draft',
  'content-manager.containers.edit.tabs.published',
  'content-manager.containers.edit.information.last-published.label',
  'content-manager.containers.List.draft',
  'content-manager.containers.List.published',
  'app.utils.published',
  'app.HeaderLayout.docLink.label',
  'Settings.profile.form.section.experience.mode.option-system-label',
  'tours.profile.title',
  'tours.profile.description',
  'tours.profile.reset',
  'tours.profile.notification.success.reset',
  'content-manager.widget.last-published.title',
  'content-manager.widget.last-published.no-data',
  'HomePage.widget.deploy-now.description',
  'HomePage.widget.deploy-now.button',
  'list.asset.at.finished',
] as const;

const knownFallbackTranslations = {
  Produto: 'Produto',
  Categoria: 'Categoria',
  Etiqueta: 'Etiqueta',
  Marca: 'Marca',
  'Pergunta Frequente': 'Pergunta Frequente',
  Política: 'Política',
  User: 'Usuário',
  'Configurações do Site': 'Configurações do Site',
  'Página Inicial': 'Página Inicial',
  'content-manager.content-types.api::product.product.mainImage': 'Imagem principal',
  'content-manager.content-types.api::product.product.name': 'Nome do produto',
  'content-manager.content-types.api::product.product.basePrice': 'Preço base (R$)',
  'content-manager.content-types.api::product.product.category': 'Categoria',
  'content-manager.content-types.api::product.product.brand': 'Marca',
  'content-manager.content-types.api::product.product.tags': 'Etiquetas',
  'content-manager.content-types.api::product.product.variantGroupLabel':
    'Título do grupo de variações',
  'content-manager.content-types.api::product.product.specs': 'Especificações',
  'content-manager.content-types.api::product.product.description': 'Descrição',
  'content-manager.content-types.api::product.product.warranty': 'Garantia',
  'content-manager.content-types.api::product.product.gallery': 'Galeria de imagens',
  'content-manager.content-types.api::product.product.seo': 'SEO (opcional)',
  'content-manager.content-types.api::product.product.variants': 'Variações',
  'content-manager.components.shared.seo.metaTitle': 'Título (SEO)',
  'content-manager.components.shared.seo.metaDescription': 'Descrição (SEO)',
  'content-manager.components.shared.seo.shareImage': 'Imagem de compartilhamento',
  'content-manager.components.ecommerce.variant.sku': 'Código (SKU)',
  'content-manager.components.ecommerce.variant.colorName': 'Nome da cor',
  'content-manager.components.ecommerce.variant.colorHex': 'Cor',
  'content-manager.components.ecommerce.variant.configLabel': 'Configuração',
  'content-manager.components.ecommerce.variant.price': 'Preço (R$)',
  'content-manager.components.ecommerce.variant.compareAtPrice': "Preço 'De' (R$)",
  'content-manager.components.ecommerce.variant.available': 'Disponível',
  'content-manager.components.ecommerce.variant.stockQuantity': 'Estoque',
  'content-manager.components.ecommerce.variant.image': 'Imagem da variação',
  'components.Blocks.blocks.bulletList': 'Lista com marcadores',
  'components.Blocks.blocks.numberList': 'Lista numerada',
};

describe('configuração pt-BR do admin', () => {
  it.each(auditedRuntimeTranslationIds)('sobrescreve o ID de runtime %s', (id) => {
    expect(ptBRTranslations[id]).toEqual(expect.any(String));
    expect(ptBRTranslations[id]).not.toHaveLength(0);
  });

  it('traduz os IDs sem valores ICU com textos literais', () => {
    expect(ptBRTranslations['HomePage.widget.deploy-now.title']).toBe(
      'Pronto para publicar?'
    );
    expect(ptBRTranslations['list.asset.at.finished']).toBe(
      'Mídias terminaram de carregar.'
    );
  });

  it('usa a variável ICU esperada pelo Strapi no texto de ajuda do idioma', () => {
    const help = ptBRTranslations[
      'Settings.profile.form.section.experience.interfaceLanguageHelp'
    ];

    expect(help).toBe(
      'As alterações de preferência se aplicam apenas a você. Mais informações estão disponíveis {here}.'
    );
    expect(help).not.toContain('{documentation}');
  });

  it('define os fallbacks conhecidos de content-types, campos e componentes', () => {
    expect(ptBRTranslations).toMatchObject(knownFallbackTranslations);
  });

  it('registra o mesmo mapa exportado na configuração padrão do admin', () => {
    expect(adminApp.config.translations['pt-BR']).toBe(ptBRTranslations);
  });
});
