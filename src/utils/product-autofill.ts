const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function slugify(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface VariantLike {
  sku?: string | null;
  colorName?: string | null;
  configLabel?: string | null;
}

export function fillVariantSkus<T extends VariantLike>(
  productSlug: string,
  variants: T[],
  reservedSkus: Iterable<string> = []
): T[] {
  const used = new Set<string>(reservedSkus);
  const unique = (base: string): string => {
    let sku = base;
    let n = 2;
    while (used.has(sku)) sku = `${base}-${n++}`;
    used.add(sku);
    return sku;
  };

  return variants.map((v, i) => {
    if (v.sku && v.sku.trim()) {
      return { ...v, sku: unique(v.sku.trim()) };
    }
    const part = slugify(v.colorName || v.configLabel || 'var').toUpperCase() || 'VAR';
    const base = `${productSlug.toUpperCase()}-${part}-${i + 1}`;
    return { ...v, sku: unique(base) };
  });
}

interface PricedVariant {
  price?: number | string | null;
}

export function lowestVariantPrice(variants: PricedVariant[]): number | null {
  const prices = variants
    .map((variant) => variant?.price)
    .filter((price) => price !== null && price !== undefined && String(price).trim() !== '')
    .map(Number)
    .filter((price) => Number.isFinite(price));

  return prices.length ? Math.min(...prices) : null;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

export function buildSeoDefaults(
  name: string,
  description: string | null | undefined,
  existing?: { metaTitle?: string | null; metaDescription?: string | null } | null
): { metaTitle: string; metaDescription: string } {
  const metaTitle =
    existing?.metaTitle && existing.metaTitle.trim()
      ? existing.metaTitle
      : truncate(name, 60);
  const metaDescription =
    existing?.metaDescription && existing.metaDescription.trim()
      ? existing.metaDescription
      : truncate(stripMarkdown(description || ''), 155);
  return { metaTitle, metaDescription };
}
