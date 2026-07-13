# E-commerce Content-Types Design

## Context

Frontend project (`C:\Users\ariov\Desktop\projetos\valhalla-ecommerce`, Next.js) currently has all data hardcoded in `app/lib/data.ts` and `app/components/Store.tsx` (products, categories, footer, FAQ, testimonials, etc). Goal: model equivalent Strapi content-types so this content becomes editable/CMS-driven instead of hardcoded.

Strapi project (`C:\Users\ariov\Desktop\projetos\valhalla-ecommerce-api`) currently only has the default Strapi "Blog" starter content-types (`article`, `author`, `category`, `global`, `about`), none of which are used by the frontend.

## Goals

- Model the full product catalog (products, categories, brands, tags, variants) with real per-SKU stock/price, since this is meant to be a real e-commerce, not a throwaway prototype.
- Model all institutional/site content currently hardcoded in the frontend (footer, homepage sections, FAQ, policies, about, contact, site settings).
- Remove unused blog scaffolding from the Strapi starter template.
- Design stock tracking so today's simple binary display ("Em estoque" / "Indisponível no momento") can evolve into real quantity-based tracking later without a schema migration.

## Out of scope

- Orders/checkout modeling (site checkout happens via WhatsApp handoff, not on-site payment — confirmed by frontend: no cart/payment backend exists).
- Multi-currency/i18n (site is BRL-only, `pt-BR` only).
- Blog feature (removed, not reintroduced — can be added later as a separate project if needed).

## Catalog

### Components (namespace `ecommerce`)

**`ecommerce.spec`**
| field | type |
|---|---|
| key | string |
| value | string |

**`ecommerce.color`**
| field | type |
|---|---|
| name | string |
| hex | string |

### Content-Type: `Brand` (collectionType)
| field | type | notes |
|---|---|---|
| name | string | |
| slug | uid (target: name) | |
| logo | media (single) | optional, no source data today |
| products | relation oneToMany → Product | mappedBy `brand` |

### Content-Type: `Category` (collectionType)
Reuses the `category` name freed up by removing the old blog category content-type.

| field | type | notes |
|---|---|---|
| name | string | |
| slug | uid (target: name) | |
| description | text | |
| image | media (single) | optional, no source data today |
| products | relation oneToMany → Product | mappedBy `category` |

### Content-Type: `Tag` (collectionType)
| field | type | notes |
|---|---|---|
| name | string | e.g. "Novo", "Promoção" |
| slug | uid (target: name) | |
| products | relation manyToMany → Product | |

### Content-Type: `Product` (collectionType)
Parent entity holding data shared across all sellable variations of a product.

| field | type | notes |
|---|---|---|
| name | string | |
| slug | uid (target: name) | |
| brand | relation manyToOne → Brand | |
| category | relation manyToOne → Category | |
| tags | relation manyToMany → Tag | |
| basePrice | decimal | reference price shown in listings/cards, entered independently by the admin (not auto-computed from variants — e.g. typically set to match the cheapest variant's price, but there's no enforced sync) |
| variantGroupLabel | string, nullable | e.g. "Armazenamento", "Memória", "Configuração" — label for the `configLabel` axis on variants |
| specs | component (repeatable) → `ecommerce.spec` | |
| description | richtext | |
| warranty | string | |
| mainImage | media (single) | |
| gallery | media (multiple) | |
| seo | component (single) → `shared.seo` | reuses existing component |
| variants | relation oneToMany → ProductVariant | mappedBy `product` |

### Content-Type: `ProductVariant` (collectionType)
One row = one purchasable SKU (a specific color + configuration combination).

| field | type | notes |
|---|---|---|
| product | relation manyToOne → Product | |
| sku | string, unique | real code for inventory/invoicing |
| color | component (single) → `ecommerce.color` | |
| configLabel | string | e.g. "256GB", "16GB/512GB" — value for the product's `variantGroupLabel` axis |
| price | decimal | |
| compareAtPrice | decimal, nullable | drives "old price" strikethrough / discount % |
| available | boolean, default true | **current source of truth for stock display**. Manual toggle: `true` → "Em estoque", `false` → "Indisponível no momento". |
| stockQuantity | integer, nullable | **reserved for future use**, not populated or read today. When real inventory tracking is introduced, populate this field and switch the availability rule to derive from quantity (e.g. `stockQuantity > 0`, or display exact/low-stock counts) — no schema change needed to make that switch. |
| image | media (single), optional | variant-specific photo override |

## Institutional

### Components (namespace `institutional`)

**`institutional.trust-badge`** — `text` (string)

**`institutional.hero`**
| field | type |
|---|---|
| eyebrow | string |
| headline | string |
| subtext | text |
| ctaLabel | string |
| ctaLink | string (plain URL/path, e.g. `/p/s25u` — not a Strapi relation, entered manually by whoever edits the homepage) |
| secondaryCtaLabel | string, optional |
| secondaryCtaLink | string, optional (same plain-string convention as `ctaLink`) |
| trustBadges | component (repeatable) → `trust-badge` |

**`institutional.benefit`** — `icon` (string), `title` (string), `description` (text)

**`institutional.step`** — `number` (string), `title` (string), `description` (text)

**`institutional.testimonial`** — `quote` (text), `authorName` (string), `authorLocation` (string)

**`institutional.banner`** — `headline` (string), `text` (text), `buttonLabel` (string), `buttonLink` (string, same plain-string convention as `hero.ctaLink`)

**`institutional.stat`** — `value` (string), `label` (string)

**`institutional.link`** — `label` (string), `url` (string)

**`institutional.link-column`** — `title` (string), `links` (component, repeatable → `link`)

### Content-Type: `Homepage` (singleType)
| field | type |
|---|---|
| hero | component (single) → `institutional.hero` |
| benefits | component (repeatable) → `institutional.benefit` |
| steps | component (repeatable) → `institutional.step` |
| testimonials | component (repeatable) → `institutional.testimonial` |
| whatsappBanner | component (single) → `institutional.banner` |

### Content-Type: `SiteSettings` (singleType)
| field | type | notes |
|---|---|---|
| whatsappNumber | string | |
| showTopBar | boolean | |
| topBarText | string | |
| showFab | boolean | |
| footerTagline | text | |
| footerLinkColumns | component (repeatable) → `institutional.link-column` | replaces hardcoded Categories/Institucional footer columns |
| footerLegalText | text | copyright, CNPJ, "images merely illustrative" disclaimer |
| contactEmail | string | |
| contactAddress | string | |
| contactHours | string | |
| aboutEyebrow | string | |
| aboutHeadline | string | |
| aboutText | richtext | |
| aboutStats | component (repeatable) → `institutional.stat` | |
| aboutImage | media (single) | |
| defaultSeo | component (single) → `shared.seo` | reuses existing component |

### Content-Type: `Faq` (collectionType)
| field | type |
|---|---|
| question | string |
| answer | richtext |
| order | integer, optional |

### Content-Type: `Policy` (collectionType)
| field | type |
|---|---|
| title | string |
| slug | uid (target: title) |
| body | richtext |

## Cleanup

Remove (unused by frontend, leftover from Strapi Blog starter template):
- Content-types: `article`, `author`, `category` (old blog version — replaced by new Product-facing `Category`), `about` (old singleType — replaced by `aboutX` fields in `SiteSettings`), `global` (old singleType — replaced by `SiteSettings`)
- Components: `shared.media`, `shared.quote`, `shared.rich-text`, `shared.slider` (only used by removed content-types' dynamic zones)
- Keep: `shared.seo` (reused by `Product.seo` and `SiteSettings.defaultSeo`)

## Key decisions (resolved during design)

- **Variants are a real collection-type (`ProductVariant`), not just components on `Product`.** Enables true per-SKU price/stock/SKU-code, matching how a real store needs to sell distinct color/config combinations independently. Trade-off accepted: more admin screens (create `Product`, then create each `ProductVariant` pointing to it).
- **Stock uses two fields (`available` boolean + `stockQuantity` nullable integer)** specifically so today's simple binary availability toggle can evolve into real quantity-based tracking later without any schema migration — just start populating `stockQuantity` and change the display rule.
- **Institutional content is grouped into 2 single-types (`Homepage`, `SiteSettings`) + 2 collection-types (`Faq`, `Policy`)** rather than one content-type per content block, to keep the admin UI manageable while still allowing FAQ/Policy entries to be added/removed freely.
- **Category/Tag/Brand are all separate content-types** (not free-text strings as in the current hardcoded frontend) to support real filtering/faceting and avoid duplicated data (the frontend currently has a duplicated hardcoded `brands` array separate from `Product.brand`).
