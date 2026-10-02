# Bloco 5 — Frontend público — Rodada 1 completa (proposta independente, Claude)

**Escopo**: todo `frontend/app/` e `frontend/components/` lido por completo ou varrido por grep dirigido a padrões de risco já confirmados nesta auditoria (`dangerouslySetInnerHTML`, geração de id, escape de URI/CDATA). Eixos: Arquitetura, Qualidade de Engenharia, Segurança/AppSec, Conteúdo Editorial, Privacidade.

## Achados corrigidos (4 bugs reais de código)

### F1/F2 — Afirmações de Privacidade não verificadas (GA/ContactForm)

Já registrados na Rodada 1 original deste bloco — ver seção correspondente em `CASE-008`.

### F3 — Ids de heading `<h2>` duplicados quebravam a navegação do sumário

`processFullPostContent()` não desambiguava ids — dois H2 com o mesmo texto colidiam, e `TableOfContents.tsx`'s `document.getElementById()` sempre resolve pro primeiro elemento com aquele id. Corrigido com sufixo numérico (`-1`, `-2`, ...). Commit `63e11cb`.

### F4 — RSS feed vulnerável a `]]>` fechando CDATA prematuramente

Baixo risco real (só o autor controla os campos), mas corrigido com o escape padrão. Commit `01f7ea1`.

### F5 — Link do Instagram sempre renderizava, mesmo sem URL configurada

`PostFooter.tsx` usava `|| '#'` em vez do padrão condicional já usado para LinkedIn/GitHub. Commit `71acf4b`.

## Achado registrado para decisão de Marcelo (não é bug de código, é escolha de produto/conteúdo)

### F6 — `NewsletterCTA.tsx` exibe números fabricados como se fossem reais

"2.4k inscritos", "42 edições", "0 spam" são valores hardcoded — não existe integração de newsletter real (`handleSubmit` tem `TODO: integrate with newsletter endpoint`, o e-mail enviado nunca é persistido ou transmitido a lugar nenhum). Isso é uma afirmação pública fabricada, ativa agora, num site de consultoria que constrói credibilidade com honestidade técnica. Não corrigido unilateralmente — decisão de conteúdo, não um bug com resposta técnica única.

### F7 — `AdsenseInArticle.tsx` mostra placeholder visível com texto de debug em todo post publicado

Com `ADSENSE_CONFIGURED = false` (estado atual), o componente renderiza uma caixa com borda tracejada e texto literal como `[ADSENSE IN-ARTICLE: post-in-article-300x250]` — sem `display: none`, visível a qualquer visitante real do blog hoje. Diferente dos outros achados de código, aqui existem opções de produto legítimas (esconder completamente vs. manter como guia visual de layout) — registrado para decisão, não alterado.

## Observação de baixa confiança, não tratada como achado confirmado

`CopyCodeLogic.tsx` usa `useEffect(() => {...}, [])` (roda só uma vez) para anexar botões de copiar aos blocos de código gerados pelo Shiki. Se o Next.js App Router preservar a instância do componente ao navegar entre `/post/a` e `/post/b` (incerto sem teste real em navegador), os blocos de código do segundo post poderiam não ganhar o botão. Não confirmado — registrado como `Open question`, não como bug, por disciplina de não afirmar sem verificar.

## Verificado sem achado novo (leitura completa ou varredura dirigida)

- **`post/[slug]/page.tsx`, `page.tsx` (home), `layout.tsx`, `sitemap.ts`, `robots.ts`**: lidos por completo — JSON-LD com escape correto (`json-ld.ts`, defesa documentada contra breakout de `</script>`), Consent Mode v2 inicializado antes de qualquer script de ads, `robots.ts` bloqueia corretamente o domínio de dev.
- **`artigos/page.tsx`, `busca/page.tsx`, `categoria/[slug]/page.tsx`, `todos-artigos/page.tsx`**: lidos por completo, paginação por token/stack correta, tratamento de erro consistente com a política de 2 níveis documentada em `lib/api.ts`.
- **`lib/api.ts`**: política de erro deliberada (conteúdo primário lança, conteúdo secundário degrada) já documentada e correta; retry com backoff para throttle do API Gateway já validado em sessões anteriores.
- **`ResponsiveImage.tsx`, `Pagination.tsx`, `PostCard.tsx`, `HeaderNav.tsx`, `Footer.tsx`, `ShareRail.tsx`, `CopyCodeLogic.tsx`, `NewsletterCTA.tsx` (fluxo, exceto F6)**: lidos por completo.
- **Varredura total de `dangerouslySetInnerHTML`** em `frontend/app`+`frontend/components`: todas as 12 ocorrências confirmadas seguras (JSON-LD escapado ou bio já sanitizada no backend, com `nosemgrep` documentando o porquê).
- **11 páginas de marketing** (`servicos`, `software`, `automacao`, `plataforma`, `sobre`, `inteligencia-artificial`, `o-projeto`): JSON-LD confirmado seguro em todas; não lidas linha a linha quanto a copy/conteúdo (fora do escopo de engenharia).

## Avaliação por critério

| Eixo | Critério | Nota |
|---|---|---:|
| Segurança/AppSec | Sanitização de Conteúdo & XSS | 9.0 (12/12 usos de `dangerouslySetInnerHTML` verificados) |
| Qualidade de Engenharia | Code Correctness | 8.0 → 9.0 após F3/F4/F5 |
| Privacidade | Consentimento Real Antes de Rastreamento | 8.0 (mecanismo correto, sem rastreamento real ativo ainda) |
| Conteúdo Editorial | Transparência & Confiabilidade do Conteúdo | 6.0 — F6/F7 são achados reais não corrigidos, pendentes de decisão |

**Nota geral: 8.2/10** — 4 bugs de código corrigidos; 2 achados de produto/conteúdo registrados para decisão, não escondidos.

## Commits

`63e11cb`, `01f7ea1`, `71acf4b` (mais os já registrados na rodada anterior do eixo Privacidade).
