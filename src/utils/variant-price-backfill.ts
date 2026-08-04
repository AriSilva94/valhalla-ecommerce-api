import type { Core } from '@strapi/strapi';

// One-shot repair for the catalogue seeded by scripts/seed-catalog.js: it wrote
// 99.99 into basePrice *and* into every variant, expecting the client to enter
// the real prices in the admin. The admin only offered basePrice, so the real
// prices were typed there while the storefront kept reading variants[0].price —
// products showed 99.99 no matter what was saved. This carries each correction
// over to the variant, which is now the single source of truth.
//
// Runs at bootstrap, guarded by a core-store marker, so every environment
// repairs itself once on deploy and never again.

const PRODUCT_UID = 'api::product.product';
const PAGE_SIZE = 100;

export const MARKER_KEY = 'valhalla_variant_price_backfill_version';
export const BACKFILL_VERSION = 1;
export const PLACEHOLDER_PRICE = 99.99;

export interface BackfillVariant {
  id?: number;
  price?: number | string | null;
  [field: string]: unknown;
}

export interface BackfillProduct {
  documentId: string;
  name?: string;
  basePrice?: number | string | null;
  variants?: BackfillVariant[];
}

export interface BackfillPlanItem {
  documentId: string;
  name: string;
  basePrice: number;
  variants: BackfillVariant[];
}

function toPrice(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}

export function planVariantPriceBackfill(
  products: BackfillProduct[],
  placeholder: number = PLACEHOLDER_PRICE
): BackfillPlanItem[] {
  const plan: BackfillPlanItem[] = [];

  for (const product of products) {
    const variants = product.variants || [];
    const basePrice = toPrice(product.basePrice);

    // A basePrice still on the placeholder teaches nothing, and a variant that
    // already carries a real price is what the storefront shows — leave it.
    if (!variants.length || basePrice === null || basePrice === placeholder) continue;
    if (!variants.some((variant) => toPrice(variant.price) === placeholder)) continue;

    plan.push({
      documentId: product.documentId,
      name: product.name || product.documentId,
      basePrice,
      variants: variants.map((variant) =>
        toPrice(variant.price) === placeholder ? { ...variant, price: basePrice } : variant
      ),
    });
  }

  return plan;
}

async function readMarkerVersion(strapi: Core.Strapi): Promise<{ row: any; version: number }> {
  const coreStore = strapi.db.query('strapi::core-store');
  const row = await coreStore.findOne({ where: { key: MARKER_KEY } });
  if (!row) return { row: null, version: 0 };

  try {
    const value = JSON.parse(row.value);
    return { row, version: typeof value === 'number' ? value : 0 };
  } catch {
    strapi.log.warn(`[variant-price-backfill] marker inválido, tratando como versão 0: ${MARKER_KEY}`);
    return { row, version: 0 };
  }
}

async function findAllProducts(
  strapi: Core.Strapi,
  status: 'draft' | 'published'
): Promise<BackfillProduct[]> {
  const documents = strapi.documents(PRODUCT_UID);
  const products: BackfillProduct[] = [];

  for (let page = 1; ; page += 1) {
    const batch = (await documents.findMany({
      status,
      populate: { variants: true },
      pagination: { page, pageSize: PAGE_SIZE },
    } as never)) as unknown as BackfillProduct[];

    products.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return products;
}

export async function backfillVariantPrices(
  strapi: Core.Strapi
): Promise<{ updated: number; skipped: boolean }> {
  const { row: markerRow, version } = await readMarkerVersion(strapi);
  if (version >= BACKFILL_VERSION) return { updated: 0, skipped: true };

  const drafts = await findAllProducts(strapi, 'draft');
  const plan = planVariantPriceBackfill(drafts);
  const documents = strapi.documents(PRODUCT_UID);

  // Updating a document only touches its draft, so anything already live has to
  // be republished for the storefront to see the corrected price.
  const publishedIds = new Set(
    (await findAllProducts(strapi, 'published')).map((product) => product.documentId)
  );

  for (const item of plan) {
    await documents.update({
      documentId: item.documentId,
      data: { variants: item.variants },
    } as never);

    if (publishedIds.has(item.documentId)) {
      await documents.publish({ documentId: item.documentId } as never);
    }

    strapi.log.info(
      `[variant-price-backfill] ${item.name}: variação(ões) em ${PLACEHOLDER_PRICE} -> ${item.basePrice}`
    );
  }

  const coreStore = strapi.db.query('strapi::core-store');
  const data = {
    key: MARKER_KEY,
    value: JSON.stringify(BACKFILL_VERSION),
    type: 'number',
    environment: '',
    tag: '',
  };

  if (markerRow) await coreStore.update({ where: { id: markerRow.id }, data });
  else await coreStore.create({ data });

  if (plan.length) {
    strapi.log.info(`[variant-price-backfill] ${plan.length} produto(s) corrigido(s)`);
  }

  return { updated: plan.length, skipped: false };
}
