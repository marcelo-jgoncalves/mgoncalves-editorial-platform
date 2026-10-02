import { autorEntitySchema, autorInputSchema } from './autor';

const VALID_AUTOR = {
  autor_id: 'marcelo-goncalves',
  nome_exibicao: 'Marcelo Gonçalves',
};

describe('autorEntitySchema', () => {
  it('accepts a minimal valid autor', () => {
    expect(autorEntitySchema.safeParse(VALID_AUTOR).success).toBe(true);
  });

  it('rejects an item missing autor_id (the real read-boundary gap this schema closes)', () => {
    const { autor_id, ...withoutId } = VALID_AUTOR;
    void autor_id;
    expect(autorEntitySchema.safeParse(withoutId).success).toBe(false);
  });

  it('rejects a non-string nome_exibicao', () => {
    expect(autorEntitySchema.safeParse({ ...VALID_AUTOR, nome_exibicao: 123 }).success).toBe(false);
  });

  it('accepts optional fields when present', () => {
    const result = autorEntitySchema.safeParse({
      ...VALID_AUTOR,
      bio: 'Bio curta',
      linkedin_url: 'https://linkedin.com/in/x',
      updated_at: '2026-10-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('autorInputSchema', () => {
  it('accepts a payload without autor_id (URL param takes precedence)', () => {
    const { autor_id, ...withoutId } = VALID_AUTOR;
    void autor_id;
    expect(autorInputSchema.safeParse(withoutId).success).toBe(true);
  });

  it('strips unknown fields instead of rejecting (anti-mass-assignment, same contract as postInputSchema)', () => {
    const result = autorInputSchema.safeParse({ ...VALID_AUTOR, admin_only_flag: true });
    expect(result.success).toBe(true);
    expect(result.success && (result.data as Record<string, unknown>).admin_only_flag).toBeUndefined();
  });
});
