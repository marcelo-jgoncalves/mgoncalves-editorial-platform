import { autorEntitySchema, Autor } from "@mgoncalves/contracts";
import { logger } from "./logger";

// Same boundary-validation principle as postPersistence.ts's parsePostItem:
// a cast (`as Autor`) only tells the compiler to trust the shape, it proves
// nothing about the item actually read from DynamoDB.
export function parseAutorItem(item: unknown, context: { requestId?: string | undefined; autorId?: string | undefined }): Autor {
  const result = autorEntitySchema.safeParse(item);
  if (!result.success) {
    logger.error("autor_item_invalid", { ...context, issues: result.error.issues.map((i) => i.path.join(".")) });
    throw new Error("Persisted autor item failed validation");
  }
  return result.data;
}
