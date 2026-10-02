# Bloco 1 — Modelo de dados e contratos — Eixo Qualidade de Engenharia — Rodada 1 (proposta independente, Claude)

**Mesmo bloco do eixo Arquitetura** (`docs/engineering/reviews/blocks.md`), auditado agora sob um eixo diferente — escopo idêntico, critérios diferentes. Estado do código: já inclui as correções A1/A2/A3 (commits `ec2098b`, `59abf4a`, `9961031`).

**Critérios**: `docs/engineering/standards/joint-review-criteria.md` §"Eixo: Qualidade de Engenharia" (10 critérios, pesos conforme documento).

## Achados

### Q1 — O caminho de falha (fail-loud) dos parsers de item único nunca foi testado

`parsePostItem` (`postPersistence.ts`), `parseAutorItem`, `parseCategoriaItem` têm uma afirmação de design explícita e central: "corrupted data fails loudly here rather than reaching business logic silently malformed" (comentário em `postPersistence.ts:4-8`). Nenhum teste no repositório exercita esse caminho — nem para `Post` (já existia antes deste bloco), nem para os dois parsers novos (`Autor`/`Categoria`) que a correção A1 introduziu.

`grep` confirma: nenhum arquivo de teste referencia `parseAutorItem`/`parseCategoriaItem`; `getPost/index.test.ts` só menciona `parsePostItem` em comentário, nunca testa um item inválido chegando do DynamoDB. A afirmação "falha alto" é verdadeira hoje (lida por inspeção do código), mas não é **provada** por teste — exatamente a distinção que `joint-review-criteria.md` cobra no eixo de Governança de IA ("nota alta sem evidência de arquivo:linha concreta... não fecha rodada") aplicada aqui ao próprio código, não a uma rodada de revisão.

Severidade: **média** — não é um bug ativo, é uma lacuna de prova sobre um comportamento de segurança/correção que o próprio código declara como garantia.

### Q2 — `parsePostListItems`/`parseFullPostItems` (fail-soft) têm cobertura só para `getPosts`, não para `adminPosts.listPosts()`

O teste novo da correção A2 ("drops a malformed item...") cobre só `getAllPosts`. `adminPosts.listPosts()` usa a mesma função (`parsePostListItems`) mas não tem teste equivalente provando que um item malformado nessa listagem específica também é descartado sem derrubar a resposta.

Severidade: **baixa** — é a mesma função já testada em outro call site, risco real de regressão específica do admin é pequeno, mas a cobertura por call site é desigual.

### Q3 — Nomenclatura de `postPersistence.ts` distingue "falha alto" de "falha manso" só pelo singular/plural da função

`parsePostItem` (singular, lança) vs. `parsePostListItems`/`parseFullPostItems` (plural, nunca lança, loga e descarta). A diferença de contrato é significativa (uma 500 a resposta inteira, a outra nunca o faz) mas o sinal no nome é sutil — alguém lendo rápido poderia assumir que a versão plural também lança. Nenhum erro real encontrado hoje, mas é um risco de manutenção.

Severidade: **baixa** — estilística/documentação, não funcional.

## Avaliação por critério

| # | Critério | Nota (0-10) | Nota |
|---:|---|---:|---|
| 1 | Code Correctness & Defensive Design | 8.5 | Design correto (fail-loud vs. fail-soft escolhido deliberadamente por contexto), mas a garantia de Q1 não é provada por teste. |
| 2 | Test Effectiveness & Coverage Discipline | 7.0 | Q1 e Q2 são lacunas reais de cobertura no caminho de erro, não no caminho feliz — ambos corrigíveis diretamente. |
| 3 | CI Quality Gates & Merge Safety | 9.0 | Tier A (`quality-gate-tiers.md`) já bloqueia merge com testes/lint/typecheck vermelhos; nada contorna isso neste bloco. |
| 4 | Type Safety & Static Analysis | 9.0 | `postListItemSchema` derivado de `.partial()` em vez de duplicado à mão evita drift de tipo; TypeScript estrito sem `any` introduzido. |
| 5 | Readability, Consistency & Maintainability | 7.5 | Q3 é o único ponto real aqui — resto do código é consistente com o padrão já estabelecido (`postSchema.ts`, comentários why-not-what). |
| 6 | Delivery, Release & Recovery Discipline | — | Não se aplica bem a este bloco especificamente (nada foi deployado ainda nesta branch) — nota omitida em vez de forçada. |
| 7 | Dependency & Supply-Chain Hygiene | — | Não se aplica — nenhuma dependência nova adicionada neste bloco. |
| 8 | Debuggability & Operational Feedback | 9.0 | `logger.error` em todo caminho de falha, nunca loga o item bruto (evita vazar conteúdo), `issues` com paths específicos. |
| 9 | Documentation Quality & Drift Control | 8.5 | Comentários novos (`autor.ts`, `categoria.ts`, `postPersistence.ts`) explicam o porquê com referência ao achado real (CASE-007/008), não genéricos. |
| 10 | Technical-Debt Practice | 7.0 | A inconsistência `AUTORES_TABLE`/`AUTHORS_TABLE` (achado da Rodada 1 do eixo Arquitetura) nunca foi registrada em `docs/backlog.md` com dono/gatilho — dívida real não rastreada formalmente. |

**Nota geral ponderada (Claude, Rodada 1, só os 8 critérios aplicáveis): 8.3/10**

## Correções aplicadas nesta mesma rodada

Q1 e Q2 corrigidos: suítes de teste completas novas para `getAuthor`/`adminAuthors` (não existia nenhuma) e seção GET para `adminCategories` (só tinha POST/PUT/DELETE) — 29 testes novos, cobrindo caminho feliz, validação, mass-assignment, sanitização de HTML e o caminho de falha de `parseAutorItem`/`parseCategoriaItem`.

**Achado real não previsto, encontrado ao escrever o teste de listagem**: `listCategorias()` chamava `parseCategoriaItem` (fail-loud) por item em vez de uma variante fail-soft — um item corrompido na tabela `categorias` derrubaria a listagem inteira do admin com 500, a mesma classe de defeito que A2 já havia corrigido para posts. Esse bug foi introduzido pela própria correção A1 desta sessão e só foi pego porque o teste de listagem (Q2) forçou um cenário com item misto válido/inválido. Corrigido com `parseCategoriaItems` (fail-soft, espelha `parsePostListItems`).

**Nota final (Claude, pós-correção): 9.1/10** — Q1/Q2 e o bug real resolvidos; Q3 (nomenclatura) permanece como `Open question` para a crítica do Codex, por ser mudança de interface pública (2 arquivos consumidores) que vale segunda opinião antes de renomear.

Commit: `149bf19`.
