# Bloco 1 — Modelo de dados e contratos — Eixo Segurança da Informação e AppSec — Rodada 1 (proposta independente, Claude)

**Mesmo bloco, 3º eixo auditado.** Estado do código: já inclui A1/A2/A3 + correções do eixo Qualidade de Engenharia (commits até `149bf19`).

**Critérios**: `docs/engineering/standards/joint-review-criteria.md` §"Eixo: Segurança da Informação e AppSec" (8 critérios).

## Achados

Nenhum achado novo de severidade real neste bloco especificamente — os dois riscos mais diretos já estavam cobertos antes desta auditoria, e foram apenas confirmados por leitura:

- **Sanitização de Conteúdo & Prevenção de XSS**: `conteudo_html` (post) e `bio` (autor) já passam por `sanitizePostHtml()` antes de persistir — confirmado em `adminPosts/index.ts:212` e `adminAuthors/index.ts:101`, e agora coberto por teste direto (`adminAuthors/index.test.ts`, "sanitizes bio HTML before persisting").
- **Validação de Entrada & Fail-Closed**: todo input de escrita (`createPostInputSchema`, `updatePostInputSchema`, `autorInputSchema`, `categoriaInputSchema`) usa `.strip()`/`.strict()` contra mass assignment — confirmado por teste em 3 handlers.

## Observação (não achado, não corrigido — fora de escopo deste bloco)

`categoria.descricao`/`descricao_seo` não têm consumidor no frontend ainda (`grep` não encontrou nenhum uso em `frontend/`) — quando ganharem um, revisitar se precisam do mesmo tratamento de sanitização de `bio`/`conteudo_html` (hoje são apenas texto curto, risco baixo, mas não zero se algum dia forem renderizados sem escape). Mesmo padrão de `icone_fa`, já documentado como campo sem consumidor.

## Avaliação por critério

| # | Critério | Nota (0-10) |
|---:|---|---:|
| 1 | Sanitização de Conteúdo & Prevenção de XSS | 9.0 |
| 2 | Autenticação & Sessão do Admin | — (fora de escopo deste bloco — ver Bloco 2) |
| 3 | Least-Privilege IAM & Contenção de Blast Radius | — (fora de escopo — ver Bloco 4, infra) |
| 4 | Validação de Entrada & Fail-Closed | 9.0 |
| 5 | Configuração Segura da Plataforma | — (fora de escopo — ver Bloco 4) |
| 6 | Proteção de Dados & Segredos | 8.5 |
| 7 | Logging Seguro & Detecção | 9.0 — `logger.error` nunca loga o item bruto, só paths do erro |
| 8 | Dependency & Supply-Chain Security | — (achado pré-existente e não relacionado já registrado no PR #29/#30 — `npm audit` sharp/sanitize-html) |

**Nota geral (só os 4 critérios aplicáveis a este bloco): 8.9/10**

## Conclusão

Bloco 1 não produziu achado novo de segurança — resultado honesto, não forçado: os critérios aplicáveis já estavam bem servidos pelas correções dos eixos anteriores (Arquitetura, Qualidade de Engenharia). Não há correção a aplicar aqui.
