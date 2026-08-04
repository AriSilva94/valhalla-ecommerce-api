import type { Core } from '@strapi/strapi';

import { buildSeoDefaults, fillVariantSkus, lowestVariantPrice, slugify } from './product-autofill';

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const PRODUCT_UID = 'api::product.product';

export function createAsyncSerializer() {
  let tail: Promise<unknown> = Promise.resolve();

  return function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

const serializeProductWrite = createAsyncSerializer();

export function autofillProductData(
  data: Record<string, any>,
  existing?: Record<string, any> | null,
  reservedSkus: Iterable<string> = []
): Record<string, any> {
  const out = { ...data };
  const isCreate = !existing;
  const name = hasOwn(data, 'name') ? data.name : existing?.name;
  const description = hasOwn(data, 'description') ? data.description : existing?.description;

  if (isCreate && name && (!out.slug || !String(out.slug).trim())) {
    out.slug = slugify(name);
  } else if (
    !isCreate &&
    hasOwn(data, 'slug') &&
    name &&
    (!out.slug || !String(out.slug).trim())
  ) {
    out.slug = slugify(name);
  }

  const effectiveSlug = out.slug && String(out.slug).trim() ? out.slug : existing?.slug;
  if (Array.isArray(out.variants) && effectiveSlug) {
    out.variants = fillVariantSkus(effectiveSlug, out.variants, reservedSkus);
  }

  // Only recompute when the write actually carries variants: a patch that
  // touches an unrelated field must stay a patch of that field.
  if (Array.isArray(out.variants)) {
    const derivedBasePrice = lowestVariantPrice(out.variants);
    if (derivedBasePrice !== null) out.basePrice = derivedBasePrice;
  }

  const hasIncomingSeo = hasOwn(data, 'seo');
  const existingSeo = existing?.seo;
  const mergedSeo = { ...(existingSeo || {}), ...(data.seo || {}) };
  const seoIncomplete =
    !mergedSeo.metaTitle?.trim?.() || !mergedSeo.metaDescription?.trim?.();

  if (name && (isCreate || hasIncomingSeo || !existingSeo || seoIncomplete)) {
    out.seo = {
      ...mergedSeo,
      ...buildSeoDefaults(name, description, mergedSeo),
    };
  }

  return out;
}

async function findExistingProduct(
  strapi: Core.Strapi,
  documentId: string,
  locale?: string
): Promise<Record<string, any> | null> {
  const documents = strapi.documents(PRODUCT_UID);
  const selection = {
    documentId,
    locale,
    populate: {
      variants: {
        populate: ['image' as const],
      },
      seo: {
        populate: ['shareImage' as const],
      },
    },
  };

  const draft = await documents.findOne({ ...selection, status: 'draft' });
  if (draft) return draft;
  return documents.findOne({ ...selection, status: 'published' });
}

async function findReservedSkus(
  strapi: Core.Strapi,
  excludedDocumentId?: string
): Promise<Set<string>> {
  const documents = strapi.documents(PRODUCT_UID);
  const versions = await Promise.all(
    (['draft', 'published'] as const).map((status) =>
      documents.findMany({
        status,
        populate: {
          variants: {
            fields: ['sku'],
          },
        },
      })
    )
  );
  const reserved = new Set<string>();

  for (const product of versions.flat()) {
    if (product.documentId === excludedDocumentId) continue;
    for (const variant of product.variants || []) {
      if (variant.sku && variant.sku.trim()) reserved.add(variant.sku.trim());
    }
  }

  return reserved;
}

function withoutComponentId<T extends Record<string, any>>(component: T): Omit<T, 'id'> {
  const { id: _id, ...data } = component;
  return data;
}

function buildCloneData(
  source: Record<string, any>,
  incoming: Record<string, any>,
  reservedSkus: Iterable<string>
): Record<string, any> {
  const sourceSeo = source.seo ? withoutComponentId(source.seo) : null;
  const incomingSeo = incoming.seo || {};
  const effective = {
    name: source.name,
    slug: source.slug,
    description: source.description,
    ...incoming,
    variants: hasOwn(incoming, 'variants')
      ? incoming.variants
      : (source.variants || []).map(withoutComponentId),
    seo: { ...(sourceSeo || {}), ...incomingSeo },
  };

  effective.variants = (effective.variants || []).map(withoutComponentId);
  effective.seo = effective.seo ? withoutComponentId(effective.seo) : effective.seo;

  if (hasOwn(incoming, 'name') && !hasOwn(incoming, 'slug')) {
    delete effective.slug;
  }

  const autofilled = autofillProductData(effective, null, reservedSkus);
  const cloneData: Record<string, any> = {
    ...incoming,
    variants: autofilled.variants,
    seo: autofilled.seo,
  };

  if (hasOwn(incoming, 'slug') || (hasOwn(incoming, 'name') && autofilled.slug)) {
    cloneData.slug = autofilled.slug;
  }

  return cloneData;
}

export function registerProductAutofill(strapi: Core.Strapi): void {
  strapi.documents.use(async (context, next) => {
    if (context.uid !== PRODUCT_UID) {
      return next();
    }

    if (
      context.action !== 'create' &&
      context.action !== 'update' &&
      context.action !== 'clone'
    ) {
      return next();
    }

    return serializeProductWrite(async () => {
      const data = context.params.data || {};

      if (context.action === 'clone') {
        const source = await findExistingProduct(
          strapi,
          context.params.documentId,
          context.params.locale
        );
        if (!source) return next();

        const reservedSkus = await findReservedSkus(strapi);
        context.params.data = buildCloneData(
          source,
          data,
          reservedSkus
        ) as typeof context.params.data;
        return next();
      }

      const existing =
        context.action === 'update'
          ? await findExistingProduct(strapi, context.params.documentId, context.params.locale)
          : null;
      const reservedSkus = Array.isArray(data.variants)
        ? await findReservedSkus(
            strapi,
            context.action === 'update' ? context.params.documentId : undefined
          )
        : [];

      context.params.data = autofillProductData(data, existing, reservedSkus);
      return next();
    });
  });
}
