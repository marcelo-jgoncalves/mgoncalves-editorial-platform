import { categoriaEntitySchema, categoriaInputSchema } from './categoria';

const VALID_CATEGORIA = {
  categoria_slug: 'devops-automacao',
  nome: 'DevOps & Automação',
};

describe('categoriaEntitySchema', () => {
  it('accepts a minimal valid categoria', () => {
    expect(categoriaEntitySchema.safeParse(VALID_CATEGORIA).success).toBe(true);
  });

  it('rejects an item missing categoria_slug', () => {
    const { categoria_slug, ...withoutSlug } = VALID_CATEGORIA;
    void categoria_slug;
    expect(categoriaEntitySchema.safeParse(withoutSlug).success).toBe(false);
  });

  // Real drift found during the Block 1 audit (CASE-007/CASE-008): the admin
  // handler already accepted and persisted descricao_seo, but the old plain
  // TypeScript interface never declared it.
  it('accepts descricao_seo', () => {
    const result = categoriaEntitySchema.safeParse({ ...VALID_CATEGORIA, descricao_seo: 'Meta descrição' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.descricao_seo).toBe('Meta descrição');
  });

  it('accepts subcategorias and strips unknown fields within each one', () => {
    const result = categoriaEntitySchema.safeParse({
      ...VALID_CATEGORIA,
      subcategorias: [{ slug: 'iac', nome: 'Infraestrutura como código', extra: 'should be stripped' }],
    });
    expect(result.success).toBe(true);
    expect(result.success && (result.data.subcategorias?.[0] as Record<string, unknown>).extra).toBeUndefined();
  });
});

describe('categoriaInputSchema', () => {
  it('strips unknown top-level fields (anti-mass-assignment)', () => {
    const result = categoriaInputSchema.safeParse({ ...VALID_CATEGORIA, admin_only_flag: true });
    expect(result.success).toBe(true);
    expect(result.success && (result.data as Record<string, unknown>).admin_only_flag).toBeUndefined();
  });
});
