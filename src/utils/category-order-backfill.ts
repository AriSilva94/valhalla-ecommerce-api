import type { Core } from '@strapi/strapi';

const CATEGORY_UID = 'api::category.category';

export interface CategoryOrderRow {
  id: number;
  documentId: string;
  name: string;
  sortOrder?: number | null;
  order?: number | null;
}

export interface CategoryOrderPatch {
  documentId: string;
  sortOrder: number;
}

export function planLegacyOrderCopy(categories: CategoryOrderRow[]): CategoryOrderPatch[] {
  return categories
    .filter((c) => typeof c.sortOrder !== 'number' && typeof c.order === 'number')
    .map((c) => ({ documentId: c.documentId, sortOrder: c.order as number }));
}

export async function backfillCategoryOrder(
  strapi: Core.Strapi
): Promise<{ updated: number; total: number }> {
  const documents = strapi.documents(CATEGORY_UID);

  const read = (fields: string[]) =>
    documents.findMany({ fields: fields as never, limit: -1 }) as unknown as Promise<
      CategoryOrderRow[]
    >;

  let categories: CategoryOrderRow[];
  try {
    categories = await read(['id', 'documentId', 'name', 'sortOrder', 'order']);
  } catch {
    try {
      categories = await read(['id', 'documentId', 'name', 'sortOrder']);
    } catch (err) {
      strapi.log.warn(`Category order backfill skipped: ${(err as Error).message}`);
      return { updated: 0, total: 0 };
    }
  }

  const patches = planLegacyOrderCopy(categories ?? []);

  for (const patch of patches) {
    await documents.update({
      documentId: patch.documentId,
      data: { sortOrder: patch.sortOrder },
    });
  }

  return { updated: patches.length, total: (categories ?? []).length };
}
