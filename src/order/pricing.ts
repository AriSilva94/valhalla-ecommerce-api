export const MIN_QTY = 1;
export const MAX_QTY = 10;

export type OrderItemInput = { productSlug: string; variantSku: string; qty: number };

export type OrderItem = {
  productSlug: string;
  productName: string;
  variantSku: string;
  colorName: string;
  configLabel: string;
  unitPrice: number;
  qty: number;
};

export type ProductVariantLookup = {
  sku: string;
  colorName: string;
  configLabel: string;
  price: number;
  available: boolean;
};

export type ProductLookupResult = { name: string; variants: ProductVariantLookup[] };

export type ProductLookup = (productSlug: string) => Promise<ProductLookupResult | null>;

export type ResolveOrderItemsError =
  | 'EMPTY_CART'
  | 'INVALID_ITEM'
  | 'PRODUCT_NOT_FOUND'
  | 'VARIANT_NOT_FOUND'
  | 'VARIANT_UNAVAILABLE';

export type ResolveOrderItemsResult =
  | { ok: true; items: OrderItem[]; totalAmount: number }
  | { ok: false; error: ResolveOrderItemsError };

export async function resolveOrderItems(
  rawItems: unknown,
  lookup: ProductLookup
): Promise<ResolveOrderItemsResult> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'EMPTY_CART' };
  }

  const items: OrderItem[] = [];

  for (const raw of rawItems) {
    if (!isValidRawItem(raw)) {
      return { ok: false, error: 'INVALID_ITEM' };
    }

    const product = await lookup(raw.productSlug);
    if (!product) {
      return { ok: false, error: 'PRODUCT_NOT_FOUND' };
    }

    const variant = product.variants.find((v) => v.sku === raw.variantSku);
    if (!variant) {
      return { ok: false, error: 'VARIANT_NOT_FOUND' };
    }

    if (!variant.available) {
      return { ok: false, error: 'VARIANT_UNAVAILABLE' };
    }

    items.push({
      productSlug: raw.productSlug,
      productName: product.name,
      variantSku: variant.sku,
      colorName: variant.colorName,
      configLabel: variant.configLabel,
      unitPrice: variant.price,
      qty: clampQty(raw.qty),
    });
  }

  const totalAmount = roundCents(items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0));
  return { ok: true, items, totalAmount };
}

function clampQty(qty: number): number {
  return Math.max(MIN_QTY, Math.min(MAX_QTY, Math.trunc(qty)));
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidRawItem(value: unknown): value is OrderItemInput {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.productSlug === 'string' &&
    v.productSlug.length > 0 &&
    typeof v.variantSku === 'string' &&
    v.variantSku.length > 0 &&
    typeof v.qty === 'number' &&
    Number.isFinite(v.qty) &&
    v.qty >= 1
  );
}
