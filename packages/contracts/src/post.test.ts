import { createPostInputSchema, updatePostInputSchema, postListItemSchema } from './post';

const BASE = {
  slug: 'meu-post',
  titulo: 'Meu Post',
  autor_id: 'marcelo-goncalves',
};

const FUTURE_DATE = '2099-01-01T10:00:00Z';

describe('createPostInputSchema', () => {
  it('accepts a minimal valid post', () => {
    expect(createPostInputSchema.safeParse(BASE).success).toBe(true);
  });

  it('defaults status to Rascunho when omitted', () => {
    const result = createPostInputSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    expect(result.success && result.data.status).toBe('Rascunho');
  });

  it('rejects a slug with uppercase or spaces', () => {
    expect(createPostInputSchema.safeParse({ ...BASE, slug: 'Meu Post' }).success).toBe(false);
  });

  it('accepts every real slug shape seen in production (alphanumeric segments joined by hyphens)', () => {
    const realSlugs = [
      'terraform-em-producao-as-licoes-que-so-um-incidente-real-ensina',
      'decima-primeira-pagina-para-teste-futuro-de-paginacao',
      'testeerroedicao',
    ];
    for (const slug of realSlugs) {
      expect(createPostInputSchema.safeParse({ ...BASE, slug }).success).toBe(true);
    }
  });

  it('rejects a slug longer than 200 chars', () => {
    expect(createPostInputSchema.safeParse({ ...BASE, slug: 'a'.repeat(201) }).success).toBe(false);
  });

  it('rejects titulo longer than 300 chars', () => {
    expect(createPostInputSchema.safeParse({ ...BASE, titulo: 'a'.repeat(301) }).success).toBe(false);
  });

  it('rejects tempo_leitura_min when not an integer', () => {
    expect(createPostInputSchema.safeParse({ ...BASE, tempo_leitura_min: 3.5 }).success).toBe(false);
  });

  it('rejects tempo_leitura_min of 0 or below', () => {
    expect(createPostInputSchema.safeParse({ ...BASE, tempo_leitura_min: 0 }).success).toBe(false);
  });

  it('rejects tempo_leitura_min above 180', () => {
    expect(createPostInputSchema.safeParse({ ...BASE, tempo_leitura_min: 181 }).success).toBe(false);
  });

  it('accepts data_publicacao in the admin datetime-local shape (no seconds, no timezone)', () => {
    const result = createPostInputSchema.safeParse({ ...BASE, data_publicacao: '2026-08-02T14:30' });
    expect(result.success).toBe(true);
  });

  it('rejects status "Programado" without data_publicacao_programada', () => {
    const result = createPostInputSchema.safeParse({ ...BASE, status: 'Programado' });
    expect(result.success).toBe(false);
  });

  it('accepts status "Programado" with a future data_publicacao_programada', () => {
    const result = createPostInputSchema.safeParse({
      ...BASE,
      status: 'Programado',
      data_publicacao_programada: FUTURE_DATE,
    });
    expect(result.success).toBe(true);
  });

  it('rejects status "Programado" with an unparseable data_publicacao_programada', () => {
    const result = createPostInputSchema.safeParse({
      ...BASE,
      status: 'Programado',
      data_publicacao_programada: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects status "Programado" with a past data_publicacao_programada', () => {
    const result = createPostInputSchema.safeParse({
      ...BASE,
      status: 'Programado',
      data_publicacao_programada: '2020-01-01T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('normalizes data_publicacao_programada to full UTC ISO 8601 on a scheduled post', () => {
    const result = createPostInputSchema.safeParse({
      ...BASE,
      status: 'Programado',
      data_publicacao_programada: FUTURE_DATE,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data_publicacao_programada).toBe(new Date(FUTURE_DATE).toISOString());
    }
  });

  it('does not require data_publicacao_programada for other statuses', () => {
    expect(createPostInputSchema.safeParse({ ...BASE, status: 'Rascunho' }).success).toBe(true);
    expect(createPostInputSchema.safeParse({ ...BASE, status: 'Publicado' }).success).toBe(true);
  });

  it('does not reject a past data_publicacao_programada when status is not Programado', () => {
    // A published post keeps whatever scheduled date it had before publishing
    // (postScheduler never clears the field): re-saving it must not 400.
    const result = createPostInputSchema.safeParse({
      ...BASE,
      status: 'Publicado',
      data_publicacao_programada: '2020-01-01T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a data_publicacao_programada without an explicit UTC offset (raw datetime-local shape)', () => {
    const result = createPostInputSchema.safeParse({
      ...BASE,
      status: 'Programado',
      data_publicacao_programada: '2099-01-01T10:00',
    });
    expect(result.success).toBe(false);
  });

  it('treats an empty data_publicacao_programada as absent instead of a format error', () => {
    const result = createPostInputSchema.safeParse({ ...BASE, data_publicacao_programada: '' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.data_publicacao_programada).toBeUndefined();
  });

  it('strips unknown fields (mass assignment protection)', () => {
    const result = createPostInputSchema.safeParse({ ...BASE, isAdmin: true });
    expect(result.success).toBe(true);
    expect((result as { data: Record<string, unknown> }).data.isAdmin).toBeUndefined();
  });

  it('strips a client-sent version instead of accepting it', () => {
    const result = createPostInputSchema.safeParse({ ...BASE, version: 7 });
    expect(result.success).toBe(true);
    expect((result as { data: Record<string, unknown> }).data.version).toBeUndefined();
  });
});

describe('updatePostInputSchema', () => {
  it('accepts a minimal valid post with version', () => {
    expect(updatePostInputSchema.safeParse({ ...BASE, version: 1 }).success).toBe(true);
  });

  it('rejects a post without version', () => {
    const result = updatePostInputSchema.safeParse(BASE);
    expect(result.success).toBe(false);
  });

  it('rejects a negative or non-integer version', () => {
    expect(updatePostInputSchema.safeParse({ ...BASE, version: -1 }).success).toBe(false);
    expect(updatePostInputSchema.safeParse({ ...BASE, version: 1.5 }).success).toBe(false);
  });

  it('rejects status "Programado" with a past data_publicacao_programada', () => {
    const result = updatePostInputSchema.safeParse({
      ...BASE,
      version: 1,
      status: 'Programado',
      data_publicacao_programada: '2020-01-01T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('does not default status when omitted (update keeps whatever the caller sends)', () => {
    const result = updatePostInputSchema.safeParse({ ...BASE, version: 1 });
    expect(result.success).toBe(true);
    expect(result.success && result.data.status).toBeUndefined();
  });

  it('rejects an unknown field instead of silently stripping it', () => {
    const result = updatePostInputSchema.safeParse({ ...BASE, version: 1, isAdmin: true });
    expect(result.success).toBe(false);
  });

  // Regression test: the schema used to require slug/titulo/autor_id
  // (inherited from basePostFields) even though savePost()'s merge logic
  // already treated an update as a genuine partial payload. A client sending
  // only the field it actually changed used to fail validation despite the
  // backend being able to handle it.
  it('accepts a genuinely partial payload with only version and one mutable field', () => {
    const result = updatePostInputSchema.safeParse({ version: 1, titulo: 'Novo título' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.titulo).toBe('Novo título');
    expect(result.success && result.data.slug).toBeUndefined();
    expect(result.success && result.data.autor_id).toBeUndefined();
  });

  it('accepts explicit null on subtitulo/imagem_lqip_base64 as a field-removal signal', () => {
    const result = updatePostInputSchema.safeParse({
      ...BASE,
      version: 1,
      subtitulo: null,
      imagem_lqip_base64: null,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.subtitulo).toBeNull();
    expect(result.success && result.data.imagem_lqip_base64).toBeNull();
  });
});

// Found during the Block 1 audit (docs/book/cases/CASE-008): GSI Query
// results (getPosts/index.ts) only project a subset of fields, so
// postEntitySchema can't validate them directly — this is the relaxed
// schema used instead, with only the 4 fields confirmed present in every
// one of the 4 GSIs' projections (infra/modules/dynamodb/main.tf) required.
describe('postListItemSchema', () => {
  it('accepts an item with only the 4 fields guaranteed by every GSI projection', () => {
    const result = postListItemSchema.safeParse({
      slug: 'meu-post',
      titulo: 'Meu Post',
      categoria_slug: 'aws',
      status: 'Publicado',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an item missing categoria_slug (real gap found before this schema existed)', () => {
    const result = postListItemSchema.safeParse({ slug: 'meu-post', titulo: 'Meu Post', status: 'Publicado' });
    expect(result.success).toBe(false);
  });

  it('rejects an item missing status', () => {
    const result = postListItemSchema.safeParse({ slug: 'meu-post', titulo: 'Meu Post', categoria_slug: 'aws' });
    expect(result.success).toBe(false);
  });

  it('accepts the optional GSI-specific fields when present, without requiring them', () => {
    const result = postListItemSchema.safeParse({
      slug: 'meu-post',
      titulo: 'Meu Post',
      categoria_slug: 'aws',
      status: 'Publicado',
      autor_id: 'marcelo-goncalves',
      version: 3,
      tempo_leitura_min: 5,
    });
    expect(result.success).toBe(true);
  });
});
