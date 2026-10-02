import { postEntitySchema, postListItemSchema, Post, PostListItem } from "@mgoncalves/contracts";
import { logger } from "./logger";

// A cast (`as Post`) only tells the compiler to trust the shape, it proves
// nothing about the item actually read from DynamoDB (manual table edit,
// a field removed in a later schema version, partial write from a bug).
// This validates at the boundary instead, so corrupted data fails loudly
// here rather than reaching business logic silently malformed.
export function parsePostItem(item: unknown, context: { requestId?: string | undefined; slug?: string | undefined }): Post {
  const result = postEntitySchema.safeParse(item);
  if (!result.success) {
    // Never log the raw item: it may contain content fields, only the
    // identifier needed to locate the corrupted row.
    logger.error("post_item_invalid", { ...context, issues: result.error.issues.map((i) => i.path.join(".")) });
    throw new Error("Persisted post item failed validation");
  }
  return result.data;
}

// Fail-soft counterparts for a LIST of posts (getPosts/index.ts, adminPosts'
// listPosts()): a single corrupted item in a 9-item page is a reason to drop
// that one item and log it, not to 500 the whole listing for every visitor —
// the critical path (showing the other 8 real posts) must not be blocked by
// one bad row (docs/engineering/standards/engineering-principles.md #4,
// same reasoning already applied to the outbox/reconciliation pattern).

// For GSI Query results — only postListItemSchema applies, see its comment
// in packages/contracts/src/post.ts for why postEntitySchema can't be used
// here (GSI projections are partial).
export function parsePostListItems(items: unknown[], context: { requestId?: string | undefined }): PostListItem[] {
  const parsed: PostListItem[] = [];
  for (const item of items) {
    const result = postListItemSchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    } else {
      logger.error("post_list_item_invalid", { ...context, issues: result.error.issues.map((i) => i.path.join(".")) });
    }
  }
  return parsed;
}

// For full-table Scan results (searchPosts in getPosts/index.ts) — the Scan
// has no ProjectionExpression, so the complete item is returned and
// postEntitySchema (the same one parsePostItem enforces on a single read)
// applies directly, no relaxed schema needed.
export function parseFullPostItems(items: unknown[], context: { requestId?: string | undefined }): Post[] {
  const parsed: Post[] = [];
  for (const item of items) {
    const result = postEntitySchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    } else {
      logger.error("post_item_invalid", { ...context, issues: result.error.issues.map((i) => i.path.join(".")) });
    }
  }
  return parsed;
}
