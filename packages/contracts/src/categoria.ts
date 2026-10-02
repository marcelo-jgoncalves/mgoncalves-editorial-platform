import { z } from "zod";

export const subcategoriaSchema = z
  .object({
    slug: z.string(),
    nome: z.string(),
  })
  .strip();

export type Subcategoria = z.infer<typeof subcategoriaSchema>;

// Was a plain TypeScript interface until CASE-007 (docs/book/cases/) found
// the same validation gap as Autor (see autor.ts) — plus a real drift: the
// interface never declared `descricao_seo`, even though adminCategories'
// own local input schema already accepted and persisted it. A schema, not a
// hand-written interface, so a read from DynamoDB can be validated the same
// way (parseCategoriaItem in backend/src/common/categoriaPersistence.ts)
// instead of trusted via `as Categoria`.
export const categoriaEntitySchema = z.object({
  categoria_slug: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  // Edited by the admin form even though the public frontend doesn't
  // consume it yet (same rationale previously only in a code comment in
  // adminCategories/index.ts, now enforced by the shared contract).
  descricao_seo: z.string().optional(),
  macro_areas: z.array(z.string()).optional(), // grouping used in Articles filters: ia | devops | cloud | eng | bastidores
  subcategorias: z.array(subcategoriaSchema).optional(), // fixed sub-taxonomy, defined per category in the admin
  icone_fa: z.string().optional(), // no consumer in the public frontend yet
});

export type Categoria = z.infer<typeof categoriaEntitySchema>;

export const categoriaInputSchema = categoriaEntitySchema.strip();

export type CategoriaInput = z.infer<typeof categoriaInputSchema>;
