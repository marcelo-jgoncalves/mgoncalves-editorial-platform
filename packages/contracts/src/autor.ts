import { z } from "zod";

// Was a plain TypeScript interface until CASE-007 (docs/book/cases/) found
// that Post has runtime validation at every DynamoDB read boundary
// (postEntitySchema/parsePostItem) while Autor had none anywhere in the
// codebase, despite packages/contracts' own stated purpose of being the
// single source of truth across backend and admin. A schema, not a
// hand-written interface, so a read from DynamoDB can be validated the same
// way (parseAutorItem in backend/src/common/autorPersistence.ts) instead of
// trusted via `as Autor`.
export const autorEntitySchema = z.object({
  autor_id: z.string().min(1),
  nome_exibicao: z.string().min(1),
  bio: z.string().optional(),
  foto_avatar_url: z.string().optional(),
  foto_avatar_alt_text: z.string().optional(),
  linkedin_url: z.string().optional(),
  github_url: z.string().optional(),
  instagram_url: z.string().optional(),
  updated_at: z.string().optional(), // written by adminAuthors on every save, not consumed by any reader yet
});

export type Autor = z.infer<typeof autorEntitySchema>;

// Input contract for adminAuthors' create/update (PUT/POST). autor_id is
// optional here (the URL id param takes precedence, see adminAuthors/index.ts)
// but required on the persisted entity above once an id is actually assigned.
export const autorInputSchema = autorEntitySchema.partial({ autor_id: true }).strip();

export type AutorInput = z.infer<typeof autorInputSchema>;
