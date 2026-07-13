import type { Schema, Struct } from '@strapi/strapi';

export interface EcommerceColor extends Struct.ComponentSchema {
  collectionName: 'components_ecommerce_colors';
  info: {
    displayName: 'Color';
  };
  attributes: {
    hex: Schema.Attribute.String;
    name: Schema.Attribute.String;
  };
}

export interface EcommerceSpec extends Struct.ComponentSchema {
  collectionName: 'components_ecommerce_specs';
  info: {
    displayName: 'Spec';
  };
  attributes: {
    key: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

export interface InstitutionalBanner extends Struct.ComponentSchema {
  collectionName: 'components_institutional_banners';
  info: {
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
    displayName: 'Benefit';
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
    displayName: 'Hero';
  };
  attributes: {
    ctaLabel: Schema.Attribute.String;
    ctaLink: Schema.Attribute.String;
    eyebrow: Schema.Attribute.String;
    headline: Schema.Attribute.String;
    headlineAccent: Schema.Attribute.String;
    headlineHighlight: Schema.Attribute.String;
    secondaryCtaLabel: Schema.Attribute.String;
    secondaryCtaLink: Schema.Attribute.String;
    subtext: Schema.Attribute.Text;
    trustBadges: Schema.Attribute.Component<'institutional.trust-badge', true>;
  };
}

export interface InstitutionalLink extends Struct.ComponentSchema {
  collectionName: 'components_institutional_links';
  info: {
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
    displayName: 'Link Column';
  };
  attributes: {
    links: Schema.Attribute.Component<'institutional.link', true>;
    title: Schema.Attribute.String;
  };
}

export interface InstitutionalStat extends Struct.ComponentSchema {
  collectionName: 'components_institutional_stats';
  info: {
    displayName: 'Stat';
  };
  attributes: {
    label: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

export interface InstitutionalStep extends Struct.ComponentSchema {
  collectionName: 'components_institutional_steps';
  info: {
    displayName: 'Step';
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
    displayName: 'Testimonial';
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
    displayName: 'Trust Badge';
  };
  attributes: {
    text: Schema.Attribute.String;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: '';
    displayName: 'Seo';
    icon: 'allergies';
    name: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'ecommerce.color': EcommerceColor;
      'ecommerce.spec': EcommerceSpec;
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
