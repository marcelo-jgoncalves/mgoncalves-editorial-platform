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
