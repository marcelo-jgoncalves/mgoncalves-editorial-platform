import { processFullPostContent, normalizeMediaImageSrc } from '@/lib/postUtils';

// Shiki is heavy and irrelevant to these tests: simple mock returning a fixed block
jest.mock('shiki', () => ({
  createHighlighter: jest.fn().mockResolvedValue({
    codeToHtml: () => '<pre><code>mocked</code></pre>',
  }),
}));

const PLACEHOLDER = '<div id="inject-ads-placeholder"></div>';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Generates flat HTML with n sections (h2 + p) preceded by an intro paragraph. */
function flatHtml(sections: number): string {
  const intro = '<p>Introdução.</p>';
  const body = Array.from({ length: sections }, (_, i) =>
    `<h2>Seção ${i + 1}</h2><p>Conteúdo ${i + 1}a.</p><p>Conteúdo ${i + 1}b.</p>`
  ).join('');
  return intro + body;
}

/** Wraps HTML in a single wrapper element. */
const wrap = (tag: string, html: string) => `<${tag}>${html}</${tag}>`;

// ─── placeholder injection ───────────────────────────────────────────────────

describe('injeção do inject-ads-placeholder', () => {
  it('injeta no HTML plano (múltiplos filhos diretos do body)', async () => {
    const { contentHtml } = await processFullPostContent(flatHtml(5));
    expect(contentHtml).toContain(PLACEHOLDER);
  });

  it('injeta quando o conteúdo está dentro de <article> (caso real do Tiptap)', async () => {
    const { contentHtml } = await processFullPostContent(wrap('article', flatHtml(5)));
    expect(contentHtml).toContain(PLACEHOLDER);
  });

  it('injeta quando o conteúdo está dentro de <div>', async () => {
    const { contentHtml } = await processFullPostContent(wrap('div', flatHtml(5)));
    expect(contentHtml).toContain(PLACEHOLDER);
  });

  it('injeta com wrapper duplo <div><article>', async () => {
    const { contentHtml } = await processFullPostContent(wrap('div', wrap('article', flatHtml(5))));
    expect(contentHtml).toContain(PLACEHOLDER);
  });

  it('injeta exatamente uma vez mesmo em posts longos', async () => {
    const { contentHtml } = await processFullPostContent(wrap('article', flatHtml(9)));
    const count = (contentHtml.match(/inject-ads-placeholder/g) || []).length;
    expect(count).toBe(1);
  });

  it('o placeholder pode ser encontrado pelo regex do renderFinalContent', async () => {
    const { contentHtml } = await processFullPostContent(wrap('article', flatHtml(5)));
    const regex = /(<div id="inject-.*-placeholder"><\/div>)/;
    expect(regex.test(contentHtml)).toBe(true);
  });
});

// ─── cases where it must NOT inject ──────────────────────────────────────────

describe('não injeta quando o conteúdo é insuficiente', () => {
  it('não injeta com apenas 2 elementos (guarda do último elemento)', async () => {
    const html = '<p>Para 1.</p><p>Para 2.</p>';
    const { contentHtml } = await processFullPostContent(html);
    expect(contentHtml).not.toContain(PLACEHOLDER);
  });

  it('não injeta com 3 elementos onde o do meio é heading e o último é guarda', async () => {
    const html = '<p>Intro.</p><h2>Título</h2><p>Final.</p>';
    const { contentHtml } = await processFullPostContent(html);
    expect(contentHtml).not.toContain(PLACEHOLDER);
  });
});

// ─── skips headings and images at the midpoint ───────────────────────────────

describe('pula headings e imagens no midpoint', () => {
  it('pula heading no midpoint e injeta após o próximo elemento elegível', async () => {
    // 6 elements: p p h2 p p p -> TARGET=3 (h2), skips ahead to p[4]
    const html = '<p>a</p><p>b</p><h2>Mid</h2><p>c</p><p>d</p><p>e</p>';
    const { contentHtml } = await processFullPostContent(html);
    expect(contentHtml).toContain(PLACEHOLDER);
    // The placeholder must appear AFTER the h2, not before
    const h2Pos = contentHtml.indexOf('<h2');
    const phPos = contentHtml.indexOf(PLACEHOLDER);
    expect(phPos).toBeGreaterThan(h2Pos);
  });

  it('pula figura com imagem no midpoint', async () => {
    const html =
      '<p>a</p><p>b</p>' +
      '<figure><img src="x.jpg" alt=""></figure>' +
      '<p>c</p><p>d</p><p>e</p>';
    const { contentHtml } = await processFullPostContent(html);
    expect(contentHtml).toContain(PLACEHOLDER);
    const figPos = contentHtml.indexOf('<figure');
    const phPos = contentHtml.indexOf(PLACEHOLDER);
    expect(phPos).toBeGreaterThan(figPos);
  });
});

// ─── normalization of inline <img src> ───────────────────────────────────────

describe('normalizeMediaImageSrc', () => {
  it('adiciona -1280 em URL de /media/ sem sufixo de variante', () => {
    const src = 'https://dsns2wusdrj9z.cloudfront.net/media/1770091876478-ub9q0e-tools.webp';
    expect(normalizeMediaImageSrc(src)).toBe(
      'https://dsns2wusdrj9z.cloudfront.net/media/1770091876478-ub9q0e-tools-1280.webp'
    );
  });

  it('mantém URL que já tem sufixo -1280', () => {
    const src = 'https://dsns2wusdrj9z.cloudfront.net/media/abc-1280.webp';
    expect(normalizeMediaImageSrc(src)).toBe(src);
  });

  it('mantém URL que já tem sufixo -480 ou -768', () => {
    expect(normalizeMediaImageSrc('https://dsns2wusdrj9z.cloudfront.net/media/abc-480.avif'))
      .toBe('https://dsns2wusdrj9z.cloudfront.net/media/abc-480.avif');
    expect(normalizeMediaImageSrc('https://dsns2wusdrj9z.cloudfront.net/media/abc-768.webp'))
      .toBe('https://dsns2wusdrj9z.cloudfront.net/media/abc-768.webp');
  });

  it('não altera URLs que não são de /media/', () => {
    const src = '/static/foto-perfil-oculos.png';
    expect(normalizeMediaImageSrc(src)).toBe(src);
  });

  it('processFullPostContent corrige <img src> de /media/ sem variante no HTML final', async () => {
    const html =
      '<p>a</p><p>b</p>' +
      '<img src="https://dsns2wusdrj9z.cloudfront.net/media/abc.webp" alt="teste">' +
      '<p>c</p><p>d</p>';
    const { contentHtml } = await processFullPostContent(html);
    expect(contentHtml).toContain(
      'src="https://dsns2wusdrj9z.cloudfront.net/media/abc-1280.webp"'
    );
  });
});

// ─── heading extraction (TOC) ────────────────────────────────────────────────

describe('extração de headings (TOC)', () => {
  it('extrai texto e id do h2', async () => {
    const { headings } = await processFullPostContent('<p>intro</p><h2>Meu Título</h2><p>body</p><p>x</p>');
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Meu Título');
    expect(headings[0].id).toBe('meu-titulo');
  });

  it('normaliza acentos no id', async () => {
    const { headings } = await processFullPostContent('<p>a</p><h2>Configuração Avançada</h2><p>b</p><p>c</p>');
    expect(headings[0].id).toBe('configuracao-avancada');
  });

  it('retorna array vazio quando não há h2', async () => {
    const { headings } = await processFullPostContent('<p>Sem headings.</p>');
    expect(headings).toHaveLength(0);
  });

  it('injeta id no elemento h2 do HTML de saída', async () => {
    const { contentHtml } = await processFullPostContent('<p>a</p><h2>Seção Um</h2><p>b</p><p>c</p>');
    expect(contentHtml).toContain('<h2 id="secao-um"');
  });

  // Found during the Block 5 full audit (docs/book/cases/CASE-008): two H2s
  // with identical text (a real pattern, e.g. "Conclusão" reused across
  // sections of a longer post) used to collide on the same id, which is
  // invalid HTML and breaks TableOfContents.tsx's getElementById-based
  // click/scroll-spy (it always resolves to the FIRST element with that id).
  it('desambigua ids quando dois h2 têm o mesmo texto', async () => {
    const html = '<p>a</p><h2>Conclusão</h2><p>b</p><h2>Conclusão</h2><p>c</p><p>d</p>';
    const { headings, contentHtml } = await processFullPostContent(html);

    expect(headings).toHaveLength(2);
    expect(headings[0].id).toBe('conclusao');
    expect(headings[1].id).toBe('conclusao-1');
    expect(headings[0].id).not.toBe(headings[1].id);

    expect(contentHtml).toContain('id="conclusao"');
    expect(contentHtml).toContain('id="conclusao-1"');
  });

  it('desambigua 3+ ocorrências em sequência (conclusao, conclusao-1, conclusao-2)', async () => {
    const html = '<p>a</p><h2>X</h2><p>b</p><h2>X</h2><p>c</p><h2>X</h2><p>d</p><p>e</p>';
    const { headings } = await processFullPostContent(html);
    expect(headings.map((h) => h.id)).toEqual(['x', 'x-1', 'x-2']);
  });
});
