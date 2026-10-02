import { categoriaEntitySchema, Categoria } from "@mgoncalves/contracts";
import { logger } from "./logger";

// Same boundary-validation principle as postPersistence.ts's parsePostItem.
export function parseCategoriaItem(item: unknown, context: { requestId?: string | undefined; categoriaSlug?: string | undefined }): Categoria {
  const result = categoriaEntitySchema.safeParse(item);
  if (!result.success) {
    logger.error("categoria_item_invalid", { ...context, issues: result.error.issues.map((i) => i.path.join(".")) });
    throw new Error("Persisted categoria item failed validation");
  }
  return result.data;
}

// Fail-soft counterpart for a LIST of categorias (adminCategories'
// listCategorias()) — same reasoning as postPersistence.ts's
// parsePostListItems: one corrupted item in a Scan of a handful of
// categorias must not 500 the whole admin listing. Found missing during the
// Block 1 quality-axis audit (docs/book/cases/CASE-008): listCategorias()
// originally called the fail-loud parseCategoriaItem on every item, which
// would throw on the first bad one instead of dropping just that item.
export function parseCategoriaItems(items: unknown[], context: { requestId?: string | undefined }): Categoria[] {
  const parsed: Categoria[] = [];
  for (const item of items) {
    const result = categoriaEntitySchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    } else {
      logger.error("categoria_item_invalid", { ...context, issues: result.error.issues.map((i) => i.path.join(".")) });
    }
  }
  return parsed;
}
