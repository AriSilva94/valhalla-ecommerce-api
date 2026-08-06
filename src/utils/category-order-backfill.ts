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

// A ordenação das categorias é do plugin sortable-entries, que grava posições em
// `sortOrder` **a partir de zero**. Este util faz uma coisa só: herdar o valor do
// campo `order` antigo em bases que ainda não passaram pela migração.
//
// Deliberadamente NÃO renumera nem desempata:
//   - `sortOrder` já preenchido (inclusive 0) é posição válida do plugin — tratar
//     0 como vazio joga a primeira categoria para o fim no boot seguinte;
//   - categoria sem posição fica para o plugin colocar no fim, como ele faz;
//   - empate herdado do campo manual continua empatado — o front desempata por
//     nome e o admin resolve arrastando.
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
