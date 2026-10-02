# Bloco 1 — Modelo de dados e contratos — Rodada 1 (proposta independente, Claude)

**Escopo auditado**: `packages/contracts/src/{post,autor,categoria,index}.ts`, `backend/src/common/{postSchema,dynamodb,postPersistence,postCounters,categorias}.ts`, e os pontos de leitura/escrita do DynamoDB que consomem esses contratos (`getPost`, `getPosts`, `adminPosts`, `adminAuthors`, `adminCategories`, `getAuthor`).

**Critérios**: `docs/engineering/standards/joint-review-criteria.md` §"Eixo: Arquitetura" (9 critérios, pesos conforme documento).

Esta proposta é independente — não foi mostrada ao Codex antes do registro.

## Achados

### A1 — Assimetria de validação em runtime na fronteira (Post vs. Autor/Categoria)

`backend/src/common/postPersistence.ts:4-8` declara o princípio explicitamente: "A cast (`as Post`) only tells the compiler to trust the shape, it proves nothing about the item actually read from DynamoDB [...] This validates at the boundary instead, so corrupted data fails loudly here rather than reaching business logic silently malformed." `Post` tem um schema Zod completo (`postEntitySchema`, `packages/contracts/src/post.ts:196-231`).

`Autor` (`packages/contracts/src/autor.ts`) e `Categoria`/`Subcategoria` (`packages/contracts/src/categoria.ts`) são interfaces TypeScript puras — nenhum schema Zod no pacote compartilhado. `backend/src/functions/getAuthor/index.ts:32` lê o item do DynamoDB e faz `result.Item as Autor` diretamente — exatamente o padrão que o comentário de `postPersistence.ts` identifica como insuficiente, aplicado ao tipo que não tem a mitigação.

**Nuance real**: a escrita (create/update) de Autor/Categoria *é* validada em runtime — mas via schemas Zod locais e duplicados em cada handler (`autorInputSchema` em `backend/src/functions/adminAuthors/index.ts:17-26`, `categoriaInputSchema` em `backend/src/functions/adminCategories/index.ts:17-26`), não no pacote compartilhado. Isso quebra o próprio objetivo declarado de `packages/contracts` como "fonte única de verdade" para os três tipos — hoje só é verdade para `Post`.

### A2 — Resultados de GSI/Scan devolvidos ao cliente público sem validação de schema

`backend/src/functions/getPosts/index.ts` (todas as 5 funções internas que fazem `Query`/`Scan`, ex. linhas 112/154/175/196/227) devolve `result.Items` diretamente na resposta HTTP pública, sem passar por `postEntitySchema`. `result.Items` não tem tipo genérico amarrado a `Post` — `attachCategoriaNome<T extends PostWithCategorySlug>` (`backend/src/common/categorias.ts:40`) infere `T` da forma solta do item, não força `Post`. Diferente de `getPost`/`index.ts:36` e `adminPosts/index.ts:148`, que chamam `parsePostItem()` corretamente.

Severidade real: **alta** para os GSIs com `projection_type = INCLUDE` (`StatusPorData`, `CategoriaPorData`, `ProjetoPorData_v2`, `PopularesPorData_v2` — `infra/modules/dynamodb/main.tf:94-148`) — esses índices só projetam um subconjunto de atributos; não há garantia estática nem em runtime de que o item retornado tem a forma que o cliente HTTP espera.

### A3 — Dois `GetCommand` em `adminPosts/index.ts` usam `as Post` em vez de `parsePostItem`

`adminPosts/index.ts:179` e `:323` fazem `(...).Item as Post | undefined` para ler o estado anterior antes de um update/delete (merge PATCH e cálculo de delta de contadores). Severidade **baixa**: o valor não é devolvido ao cliente sem passar antes pelo merge com `data` (já validado por `updatePostInputSchema`), e os únicos campos lidos de `existing` nesses dois pontos (`status`, `e_projeto`, `version`) são comparados como string/number, resilientes a um item malformado — mas ainda é inconsistente com o princípio declarado.

## Avaliação por critério

| # | Critério | Nota (0-10) | Nota |
|---:|---|---:|---|
| 1 | Domain Fit & Simplicity | 8.5 | Schema de `Post` é proporcional (sem sofisticação antecipada); duplicação do schema de Autor/Categoria entre handlers é o ponto fraco. |
| 2 | Data Model & Consistency | 6.5 | A1/A2 são achados reais de inconsistência de validação na fronteira — critério central deste bloco. |
| 3 | Reliability & Fault Recovery | 8.0 | Fora de escopo direto deste bloco (mais relevante ao Bloco 2/3), mas `getPostCounters`/`applyCounterDeltas` tratam ausência de item com default seguro. |
| 4 | Security & Privacy by Design | 8.0 | `.strict()`/`.strip()` em `createPostInputSchema`/`updatePostInputSchema` previnem mass assignment; mesmo padrão replicado em `autorInputSchema`/`categoriaInputSchema`. |
| 5 | Modifiability & Evolvability | 7.0 | Fronteira de módulo clara para `Post`; duplicação de schema de Autor/Categoria entre `packages/contracts` (tipo) e handlers (validação) aumenta custo de mudança futura (2 lugares para atualizar). |
| 6 | Observability & Operability | 8.5 | `parsePostItem` loga `post_item_invalid` com os paths do erro sem vazar o item (`postPersistence.ts:12-14`) — bom padrão, não replicado para Autor/Categoria por não existir o equivalente. |
| 7 | Cost & Resource Governance | 9.0 | `getPostCounters`/contador atômico evita `Select: COUNT` duplicado; `categorias.ts` justifica Scan por tabela pequena. Fora de escopo central deste bloco. |
| 8 | Testability & Delivery Safety | 7.5 | `post.test.ts` existe; não há teste equivalente para a ausência de validação de Autor/Categoria (não há o que testar, porque a validação de leitura não existe). |
| 9 | Architecture Governance & Traceability | 7.0 | Nenhum ADR/ registro explica por que Autor/Categoria não seguiram o mesmo padrão de `Post` — pode ser decisão consciente nunca documentada, ou lacuna não notada. |

**Nota geral ponderada (Claude, Rodada 1): 7.6/10**

## Pergunta em aberto para a crítica cruzada

A1/A2 são lacunas reais de engenharia, ou risco aceito implicitamente por falta de evidência de corrupção de dado em Autor/Categoria (diferente de Post, que já teve um incidente real — `CASE-004`)? Pedido ao Codex: avaliar essa pergunta de forma independente, com evidência própria, antes de qualquer rodada de convergência.
