import type { Schema, Struct } from '@strapi/strapi';

export interface EcommerceSpec extends Struct.ComponentSchema {
  collectionName: 'components_ecommerce_specs';
  info: {
    description: 'Par caracter\u00EDstica \u2192 valor';
    displayName: 'Especifica\u00E7\u00E3o';
  };
  attributes: {
    key: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

export interface EcommerceVariant extends Struct.ComponentSchema {
  collectionName: 'components_ecommerce_variants';
  info: {
    description: 'Varia\u00E7\u00E3o de produto (cor/configura\u00E7\u00E3o) com pre\u00E7o pr\u00F3prio';
    displayName: 'Varia\u00E7\u00E3o';
  };
  attributes: {
    available: Schema.Attribute.Boolean &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<true>;
    colorHex: Schema.Attribute.String &
      Schema.Attribute.CustomField<
        'plugin::color-picker.color',
        {
          format: 'hex';
        }
      >;
    colorName: Schema.Attribute.String;
    compareAtPrice: Schema.Attribute.Decimal;
    configLabel: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'>;
    price: Schema.Attribute.Decimal & Schema.Attribute.Required;
    sku: Schema.Attribute.String;
    stockQuantity: Schema.Attribute.Integer;
  };
}

export interface InstitutionalBanner extends Struct.ComponentSchema {
  collectionName: 'components_institutional_banners';
  info: {
    description: 'Chamada institucional com texto, bot\u00E3o e link';
    displayName: 'Banner';
  };
  attributes: {
    buttonLabel: Schema.Attribute.String;
    buttonLink: Schema.Attribute.String;
    headline: Schema.Attribute.String;
    text: Schema.Attribute.Text;
  };
}

export interface InstitutionalBenefit extends Struct.ComponentSchema {
  collectionName: 'components_institutional_benefits';
  info: {
    description: 'Benef\u00EDcio ou diferencial apresentado ao cliente';
    displayName: 'Benef\u00EDcio';
  };
  attributes: {
    description: Schema.Attribute.Text;
    icon: Schema.Attribute.String;
    title: Schema.Attribute.String;
  };
}

export interface InstitutionalHero extends Struct.ComponentSchema {
  collectionName: 'components_institutional_heroes';
  info: {
    description: 'Conte\u00FAdo principal do topo da p\u00E1gina inicial';
    displayName: 'Destaque principal';
  };
  attributes: {
    ctaLabel: Schema.Attribute.String;
    ctaLink: Schema.Attribute.String;
    eyebrow: Schema.Attribute.String;
    headline: Schema.Attribute.String;
    headlineAccent: Schema.Attribute.String;
    headlineHighlight: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'>;
    secondaryCtaLabel: Schema.Attribute.String;
    secondaryCtaLink: Schema.Attribute.String;
    subtext: Schema.Attribute.Text;
    trustBadges: Schema.Attribute.Component<'institutional.trust-badge', true>;
  };
}

export interface InstitutionalLink extends Struct.ComponentSchema {
  collectionName: 'components_institutional_links';
  info: {
    description: 'Link de navega\u00E7\u00E3o com texto e destino';
    displayName: 'Link';
  };
  attributes: {
    label: Schema.Attribute.String;
    url: Schema.Attribute.String;
  };
}

export interface InstitutionalLinkColumn extends Struct.ComponentSchema {
  collectionName: 'components_institutional_link_columns';
  info: {
    description: 'Grupo de links exibido no rodap\u00E9';
    displayName: 'Coluna de links';
  };
  attributes: {
    links: Schema.Attribute.Component<'institutional.link', true>;
    title: Schema.Attribute.String;
  };
}

export interface InstitutionalStat extends Struct.ComponentSchema {
  collectionName: 'components_institutional_stats';
  info: {
    description: 'N\u00FAmero ou indicador exibido na se\u00E7\u00E3o Sobre';
    displayName: 'N\u00FAmero institucional';
  };
  attributes: {
    label: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

export interface InstitutionalStep extends Struct.ComponentSchema {
  collectionName: 'components_institutional_steps';
  info: {
    description: 'Etapa da se\u00E7\u00E3o Como funciona';
    displayName: 'Etapa';
  };
  attributes: {
    description: Schema.Attribute.Text;
    number: Schema.Attribute.String;
    title: Schema.Attribute.String;
  };
}

export interface InstitutionalTestimonial extends Struct.ComponentSchema {
  collectionName: 'components_institutional_testimonials';
  info: {
    description: 'Depoimento de cliente com nome e localiza\u00E7\u00E3o';
    displayName: 'Depoimento';
  };
  attributes: {
    authorLocation: Schema.Attribute.String;
    authorName: Schema.Attribute.String;
    quote: Schema.Attribute.Text;
  };
}

export interface InstitutionalTrustBadge extends Struct.ComponentSchema {
  collectionName: 'components_institutional_trust_badges';
  info: {
    description: 'Mensagem curta de confian\u00E7a exibida no destaque principal';
    displayName: 'Selo de confian\u00E7a';
  };
  attributes: {
    text: Schema.Attribute.String;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: 'T\u00EDtulo e descri\u00E7\u00E3o para buscadores \u2014 preenchido automaticamente se vazio';
    displayName: 'SEO';
    icon: 'allergies';
    name: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text;
    metaTitle: Schema.Attribute.String;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'ecommerce.spec': EcommerceSpec;
      'ecommerce.variant': EcommerceVariant;
      'institutional.banner': InstitutionalBanner;
      'institutional.benefit': InstitutionalBenefit;
      'institutional.hero': InstitutionalHero;
      'institutional.link': InstitutionalLink;
      'institutional.link-column': InstitutionalLinkColumn;
      'institutional.stat': InstitutionalStat;
      'institutional.step': InstitutionalStep;
      'institutional.testimonial': InstitutionalTestimonial;
      'institutional.trust-badge': InstitutionalTrustBadge;
      'shared.seo': SharedSeo;
    }
  }
}
