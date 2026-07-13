# Strapi Data Seed — Design

## Context

The Strapi content model (Brand, Category, Tag, Product, ProductVariant, Homepage, SiteSettings, Faq, Policy — see `docs/superpowers/specs/2026-07-13-ecommerce-content-types-design.md`) is built and empty. The frontend at `C:\Users\ariov\Desktop\projetos\valhalla-ecommerce` has all real catalog/institutional content hardcoded in `app/lib/data.ts` (products, categories) and `app/components/Store.tsx` (footer, hero, benefits, steps, testimonials, FAQ, policies, about, contact) plus `app/layout.tsx` (SEO defaults). This phase moves that real content into Strapi via a one-off seed script, so the next phase (frontend integration, separate spec) has real data to render against.

## Goal

Populate every content-type with the real hardcoded content (minus images, which don't exist as assets yet — media fields stay empty) and enable public read access, so `GET http://localhost:1337/api/products` (etc.) returns real data with no auth.

## Out of scope

- Frontend integration (consuming this data, replacing hardcoded imports, real Next.js routes) — a separate spec/plan, done after this one.
- Images — no image assets exist in the frontend (all placeholders); media fields are left empty. Can be filled in later without any schema change.
- Anything not present in the current hardcoded frontend (e.g. no orders, no real inventory counts).

## Data source of truth

- `app/lib/data.ts` — `cats` (7 categories), `db` (18 products with nested colors/vars/specs), `WHATSAPP_NUMBER`.
- `app/components/Store.tsx` — `faqData` (6), `polData` (4), `benefits` (4), `steps` (3), `reviews`/testimonials (3), `brands` (9, flat list), hero section JSX, WhatsApp-channel banner JSX, footer JSX, about-page JSX, contact-page JSX.
- `app/layout.tsx` — SEO `title`/`description` defaults.

The full literal values were read directly from these files in this session and are transcribed as-is into the seed script (no paraphrasing) — the plan carries the literal data, this spec carries the mapping rules.

## Mapping rules

### Brand
One row per entry in `Store.tsx`'s flat `brands` array (9 total: Samsung, Apple, Xiaomi, Lenovo, Acer, JBL, Logitech, Baseus, Redragon). `logo` left empty.

### Category
One row per `cats` entry: `name` = `n`, `slug` = slugified `id` (already a clean lowercase slug, e.g. `smartphones`), `description` = `d`. `image` left empty.

### Tag
Exactly one row: `name: "Novo"`, `slug: "novo"`. This is the only tag value the hardcoded data actually uses (`Product.tag === "NOVO"`); everything else in the source (`offers`, `featured`, `launches`) is a computed slice, not a stored tag, matching the earlier content-model design decision.

### Product
One row per `db` entry: `name`, `basePrice = price`, `variantGroupLabel = vl`, `specs` (one `ecommerce.spec` component per `[k, v]` tuple), `description = desc`, `warranty = w`, `brand` (relation, matched by name), `category` (relation, matched by slug = `cat`), `tags` = `[Novo]` if `tag === "NOVO"` else `[]`. `mainImage`/`gallery` left empty.

### ProductVariant — cartesian generation

The source models color and config as two **independent** selectable axes per product (cart key is `productId|colorIndex|variantIndex`), not pre-combined SKUs. To populate the new `ProductVariant` collection (one row = one purchasable SKU), each product's variants are the **cartesian product of its `colors` and `vars` arrays**:

- `product`: relation to the parent Product
- `sku`: `` `VLH-${id.toUpperCase()}-${slugify(color.n)}-${slugify(variant.l)}` ``, where `slugify(x)` strips accents, uppercases, and replaces every run of non-alphanumeric characters with a single `-` (e.g. `slugify("Titânio Preto")` → `TITANIO-PRETO`, `slugify("256 GB")` → `256-GB`), giving a fully uppercase SKU like `VLH-S25U-TITANIO-PRETO-256-GB`
- `color`: `ecommerce.color` component — `{ name: color.n, hex: color.hex }`
- `configLabel`: `variant.l`
- `price`: `product.price + variant.d`
- `compareAtPrice`: `product.old ? product.old + variant.d : null` (mirrors the source's `pOldPriceF` calculation)
- `available`: `color.av && variant.av`
- `stockQuantity`: left `null` (unused today, per the content model's stock design)
- `image`: left empty

Roughly 90 ProductVariant rows total across the 18 products — exact count depends on each product's actual `colors.length × vars.length` and is computed by the script at seed time, not hardcoded.

### Homepage (single-type)

- `hero`: `eyebrow: "Oferta da semana"`, `headline: "GALAXY S25 ULTRA com desconto de R$ 700 à vista"` (the source's 3-line styled headline collapsed to one string), `subtext` = the hero paragraph, `ctaLabel: "Garanta o seu!"`, `ctaLink: "/p/s25u"`, `secondaryCtaLabel: "Explorar categorias"`, `secondaryCtaLink: "/categorias"`, `trustBadges`: 3 `institutional.trust-badge` rows (`"Produtos originais"`, `"Garantia de fábrica"`, `"Atendimento humano"`). `ctaLink`/`secondaryCtaLink` are a best-guess route path convention (product detail / categories index) since Phase B (frontend integration) hasn't finalized real routing yet — they're plain strings, trivially edited later if Phase B lands on different paths.
- `benefits`: the 4 `{i, t, d}` entries → `{icon, title, description}`.
- `steps`: the 3 `{n, t, d}` entries → `{number, title, description}`.
- `testimonials`: the 3 `{t, n, c}` entries → `{quote, authorName, authorLocation}`.
- `whatsappBanner`: `headline: "SIGA NOSSO CANAL NO WHATSAPP!"`, `text` = the banner paragraph, `buttonLabel: "Clique e siga nosso canal!"`, `buttonLink` = the precomputed `https://wa.me/559684235663?text=...` URL (same message the source's `waDirectUrl` builds).

### SiteSettings (single-type)

- `whatsappNumber: "559684235663"`, `showTopBar: true`, `topBarText` = the top-bar string, `showFab: true`.
- `footerTagline` = the footer tagline paragraph.
- `footerLinkColumns`: **only the "Institucional" column** (`Sobre a empresa → /sobre`, `Perguntas frequentes → /faq`, `Políticas da empresa → /politicas`, `Contato → /contato`). The source's footer "Categorias" column is dropped from this field — it's generated dynamically from live categories in the source (`navCats`), so the frontend integration phase will render it directly from the Category API instead of duplicating category names here. The source's "Página 404 (demo)" link is also dropped — it's a dev-only artifact of the fake-router, not real content.
- `footerLegalText` = the copyright/CNPJ/disclaimer line.
- `contactEmail`, `contactAddress`, `contactHours` = the three contact-page fields.
- `aboutEyebrow: "Sobre a empresa"`, `aboutHeadline: "Tecnologia de verdade, atendimento de gente."` (collapsed from 2 styled lines), `aboutText` = the about-page paragraph, `aboutStats`: the 3 stat cards (`+5 mil`/`100%`/`4,9★` + their labels).
- `aboutImage`: left empty.
- `defaultSeo`: `metaTitle`/`metaDescription` from `app/layout.tsx`'s `metadata.title`/`description`.

### Faq / Policy

One row per `faqData`/`polData` entry: `question`/`answer` and `title`/`body` respectively. `Faq.order` set to array index (0-based) so ordering is preserved without relying on creation order.

## Seed mechanism

This project already ships a Strapi-generated `scripts/seed.js` (wired to `npm run seed:example`) that follows Strapi's official example-seed pattern: boot Strapi in-process with `compileStrapi()` + `createStrapi(...).load()` (no HTTP server, no auth needed — the script runs *as* the app, with full internal access), seed content via `strapi.documents(uid).create({ data })`, set public permissions via `strapi.query('plugin::users-permissions.permission').create(...)`, then `app.destroy()` and exit. That file currently references the deleted blog content-types and `data/data.json` (also a blog-template leftover) — both are dead now that the blog content-types are gone.

This is strictly better than the REST-plus-token approach originally considered here: no API token needed at all (the earlier idea to use `STRAPI_SEED_API_TOKEN` for content creation and a separate `bootstrap()` hook for permissions is dropped — both jobs happen in this one in-process script instead, matching the codebase's existing convention). `STRAPI_SEED_API_TOKEN` in `.env` becomes unused; it's left in place (harmless) rather than removed, since revoking/deleting it is a separate concern from this seed.

**Plan:** rewrite `scripts/seed.js` in place (same file, same `npm run seed:example` wiring) to:
1. Call `setPublicPermissions` (same helper already in the file, generalized) for `find`/`findOne` on `brand`, `category`, `tag`, `product`, `product-variant`, `homepage`, `site-setting`, `faq`, `policy`.
2. Seed content in dependency order: Brand → Category → Tag → Product (with `brand`/`category`/`tags` relations set by looking up the just-created records) → ProductVariant (cartesian per product, `product` relation set) → Homepage (single-type, one `documents(...).create()` or `update()`) → SiteSettings (single-type) → Faq (×6) → Policy (×4).
3. Delete `data/data.json` (blog-template leftover, no longer referenced by anything once `seed.js` is rewritten).

Literal seed data (all 18 products with their real colors/vars/specs, the 7 categories, 9 brands, hero/hero-hero-copy/benefits/steps/testimonials/whatsapp-banner text, footer/contact/about text, the 6 FAQ and 4 policy entries) is embedded directly in `scripts/seed.js` as plain JS objects/arrays — transcribed verbatim from `app/lib/data.ts` and `app/components/Store.tsx` in the frontend project, not re-derived or paraphrased.

## Idempotency

Reuses the existing file's `isFirstRun()` pattern (a `strapi.store()` flag), so re-running `npm run seed:example` after the first successful run is a safe no-op with a clear log message, rather than silently duplicating records. Since this is a dev-only local seed (not a repeatable-per-environment migration), first-run-only is sufficient — there's no need for per-record existence checks on top of it.

## Verification

After running the script:
1. `GET /api/brands`, `/api/categories`, `/api/tags`, `/api/products`, `/api/product-variants`, `/api/homepage`, `/api/site-setting`, `/api/faqs`, `/api/policies` **without** any Authorization header — each must return `200` with the expected record count (9, 7, 1, 18, ~90, 1, 1, 6, 4) and non-empty fields, proving both the data and the public permissions are in place.
2. Spot-check one Product's relations resolve (`brand`, `category`, `tags`, `variants` all populated, not empty) via `GET /api/products/:id?populate=*`.
