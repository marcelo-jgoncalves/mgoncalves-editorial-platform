---
id: CASE-008
title: "Os eixos de revisão como instrumento de qualidade deste projeto: o que estabelecê-los e auditar contra eles revela e corrige"
summary: "Caso vivo que acumula, eixo por eixo, o resultado real de qualidade produzido por ter um instrumento de avaliação formal (joint-review-criteria.md) e auditar o projeto contra ele — não a decisão de como os eixos foram desenhados, mas o que cada eixo, aplicado de verdade (inclusive contra pesquisa externa e código real), revela e o que isso corrige."
date_started: 2026-10-02
date_closed:
status: active
themes: [qualidade-de-engenharia, revisao-por-pares-ia, arquitetura-de-dados]
components: [processo-de-engenharia, backend, packages-contracts]
trigger_types: [architecture-decision, engineering-tradeoff]
related_commits: []
related_pull_requests: ["https://github.com/marcelo-jgoncalves/mgoncalves-editorial-platform/pull/29"]
related_files:
  - "../../engineering/standards/joint-review-criteria.md"
  - "../../engineering/reviews/blocks.md"
  - "../../../packages/contracts/src/autor.ts"
  - "../../../packages/contracts/src/categoria.ts"
  - "../../../frontend/components/consent/ConsentModal.tsx"
related_tests: []
related_pipelines: []
related_adrs: []
related_experiments: []
ai_tool: "Claude Code"
ai_model: "Claude Sonnet 5"
ai_autonomy_level: "4 — Full implementation cycle"
book_potential: high
review_after: 2026-11-02
last_reviewed:
baseline_ref: 189bad2
result_ref: not-applicable
evidence_files: []
---

<!--
Este caso é deliberadamente diferente de CASE-007: aquele documenta o PROTOCOLO (nota cega,
rodadas, Codex, impedimentos de execução) em uso pela primeira vez neste repositório. Este
caso documenta o INSTRUMENTO (os eixos em si, como régua de qualidade deste projeto
específico) e o resultado de qualidade real que aplicá-lo produz — atualizado conforme cada
eixo é auditado ou revisado, não fechado após uma única decisão de design.

Correção de escopo registrada (2026-10-02): a primeira versão deste caso tratava da
transposição 9→6 eixos como decisão de design em si. Marcelo redirecionou explicitamente:
"Eu não falo da transposição, mas sim do fato de estabelecer esses eixos para o projeto e
auditar segundo eles e o resultado que isso traz para a qualidade do projeto em si." — a
versão anterior foi substituída, não mantida como seção histórica, por não ter produzido
nenhum resultado registrado ainda no momento da correção.
-->

# Resumo do caso

`docs/engineering/standards/joint-review-criteria.md` estabeleceu eixos de qualidade de engenharia para este projeto. Este caso não registra como os eixos foram desenhados — registra o que acontece quando o projeto é de fato auditado contra eles, e quando os próprios eixos são confrontados com pesquisa externa e código real: que achados surgem, por terem um critério nomeado e pesado que não existia antes como regra explícita, e que correção de qualidade cada achado efetivamente produz.

# 1. Contexto

Antes de `joint-review-criteria.md` existir, este projeto não tinha uma lista explícita e pesada de critérios de arquitetura/qualidade contra a qual auditar deliberadamente. A hipótese deste caso é que nomear um critério explicitamente (ex. "Data Model & Consistency", "Consentimento Real Antes de Rastreamento") muda o que é efetivamente procurado e encontrado numa auditoria, comparado a uma revisão sem essa régua.

# 2. Resultado por eixo (atualizado conforme as auditorias avançam)

## 2.0 Antes do Bloco 1: o próprio processo de validar os eixos já corrigiu a régua

`Observed fact`: ao ser perguntado se o conjunto de eixos estava completo antes de iniciar qualquer auditoria, a verificação (pesquisa externa sobre LGPD + inspeção direta do código) encontrou que o eixo de Privacidade havia sido cortado da versão inicial com base numa premissa não verificada ("sem dado pessoal sensível em volume"), quando na realidade o projeto já tinha, implementado, `ConsentBanner`/`ConsentModal` gatilhando Google Analytics por opt-in, páginas de política de privacidade/cookies/termos, e um `ContactForm` coletando dado pessoal.

`AI inference`: isso é evidência direta de que o ato de *auditar a régua em si contra a realidade* (não só usá-la para auditar código) já produz correção de qualidade — o eixo de Privacidade foi restaurado, proporcional (4 critérios, não os 8 do projeto irmão), antes de qualquer bloco ser auditado. Ver `docs/engineering/standards/joint-review-criteria.md` §"Eixo: Privacidade e Conformidade de Dados do Visitante".

**Correção aplicada**: 7º eixo adicionado (Consentimento Real Antes de Rastreamento, Política de Privacidade Corresponde ao Fluxo Real de Dado, Minimização e Propósito do Formulário de Contato, Canal de Direitos do Titular); critério de Segurança/AppSec sobre "Proteção de Dados" restrito à parte técnica para não duplicar o novo eixo.

## 2.1 Eixo: Arquitetura — Bloco 1 (Modelo de dados e contratos)

`Observed fact`: o critério "Data Model & Consistency" nomeia explicitamente "consistência do rigor de validação em runtime na fronteira entre os diferentes contratos". Avaliar o Bloco 1 contra esse critério nomeado levou a procurar, deliberadamente, se todo contrato (`Post`, `Autor`, `Categoria`) tinha o mesmo tratamento de validação — não uma leitura de código genérica.

`AI inference`: essa busca dirigida encontrou um achado real que uma leitura de código sem o critério nomeado plausivelmente não teria formulado como achado único e comparável — `Post` validado em runtime na fronteira (`postEntitySchema`/`parsePostItem`), `Autor`/`Categoria` sem nenhuma validação equivalente (`packages/contracts/src/autor.ts`, `categoria.ts` eram interfaces TypeScript puras; `backend/src/functions/getAuthor/index.ts:32` fazia `result.Item as Autor` direto).

**Correção aplicada** (evidência de antes/depois na seção 11): `autor.ts`/`categoria.ts` passaram a exportar `autorEntitySchema`/`categoriaEntitySchema` (Zod), com `parseAutorItem`/`parseCategoriaItem` aplicados nos pontos de leitura do DynamoDB, e os handlers `adminAuthors`/`adminCategories` passaram a consumir os schemas de input compartilhados do pacote em vez de duplicatas locais.

**Achado colateral real, corrigido junto**: `categoria.ts` não declarava `descricao_seo`, embora `adminCategories/index.ts` já aceitasse e persistisse esse campo — drift entre contrato e implementação, só visível ao escrever o schema Zod campo a campo contra o handler real.

**Achado A2 corrigido, com desenho próprio derivado de fatos, não de suposição**: resultados de GSI (`getPosts/index.ts`, 5 funções; `adminPosts/index.ts` `listPosts()`) eram devolvidos sem validação porque `postEntitySchema` exige campos que os GSIs não projetam. Antes de desenhar a correção, cruzei os `non_key_attributes` reais das 4 GSIs (`infra/modules/dynamodb/main.tf`) e descobri que só `slug`, `titulo`, `categoria_slug` e `status` aparecem garantidos em todas — exatamente os mesmos campos que `PostCardProps` (frontend) já tratava como obrigatórios, de forma independente. Isso virou `postListItemSchema` (derivado de `postEntitySchema.partial()`, nunca duplicado à mão). `searchPosts()` foi tratado à parte: faz `ScanCommand` na tabela inteira sem `ProjectionExpression`, então recebe o item completo e usa `postEntitySchema` diretamente, com o mesmo rigor de `getPost()`.

`AI inference`: a fronteira crítica aqui não é "validar ou não", é "falhar alto ou falhar manso" — um item corrompido numa página de 9 posts não pode derrubar a página inteira para todo visitante. `parsePostListItems`/`parseFullPostItems` descartam e logam o item inválido em vez de lançar exceção, diferente de `parsePostItem` (leitura de 1 item, onde falhar alto é o comportamento correto). Um teste novo prova isso diretamente: 3 itens, 1 malformado, a resposta final tem 2 — a listagem sobrevive.

**Achado A3 corrigido, com um resultado colateral não previsto**: `adminPosts/index.ts:179`/`:323` liam o item anterior via `as Post` (não `parsePostItem`) antes de um merge PATCH/delete. `Human decision`: Marcelo pediu explicitamente para corrigir, não documentar como pendência, quando perguntado — "Eu não quero que reverta" — depois de uma primeira tentativa ter sido revertida por quebrar 21 testes. A correção real não foi só trocar o cast: **21 testes de `adminPosts/index.test.ts` mockavam a leitura do item anterior com uma forma deliberadamente mínima (`{ status, e_projeto, version }`) que nunca batia com os campos obrigatórios reais de `postEntitySchema`** — passavam porque nada verificava isso em runtime antes. `AI inference`: isso é evidência de que a ausência de validação na fronteira não é neutra mesmo quando "nada quebra" — ela permite que a suíte de testes se acostume com uma forma de dado que não existe de verdade, até que algo finalmente a force a ser honesta. Corrigido espalhando `SAMPLE_POST` completo em cada fixture, sobrescrevendo só os campos que cada teste realmente exercita. 220/220 testes voltaram a passar depois do ajuste.

## 2.2-2.7 Demais eixos

Pendente — preenchido conforme Qualidade de Engenharia, Engenharia de Contexto, Segurança/AppSec, Governança de IA, Conteúdo Editorial e Privacidade forem auditados.

# 6. Critérios de aceitação

Este caso produz sinal real (e não "teatro de rigor") se, eixo a eixo, pelo menos um achado comparável aos de §2.0/§2.1 for encontrado e corrigido ou claramente justificado como não encontrado. Um eixo que não produzir nenhum achado real deve ser registrado honestamente como tal, não forçado a parecer produtivo.

## 6.3 Obrigações de prova

| Mudança ou afirmação | Evidência exigida | Evidência obtida | Status |
|---|---|---|---|
| Validar os eixos contra a realidade (pesquisa + código), antes de auditar, já produz correção de qualidade na própria régua | 7º eixo adicionado com justificativa rastreável | Obtida — seção 2.0 | `satisfied` |
| Eixo Arquitetura, critério Data Model & Consistency, produz achado real e correção real | Diff do contrato antes/depois + handlers atualizados | Obtida — seção 11 | `satisfied` |
| A correção do Bloco 1 não quebrou o comportamento existente | Testes/typecheck/lint do pacote `contracts` e dos handlers afetados | Obtida — commit `ec2098b`: contracts 40/40 testes + typecheck limpo; backend 220/220 testes + lint + typecheck limpo; admin `vue-tsc --build` limpo | `satisfied` |
| Os outros eixos também produzem achado real comparável | Mesma estrutura de achado+correção para cada eixo | Pendente — eixos ainda não auditados | `pending` |

# 7. Participação da IA

| Classificação | Descrição | Referência |
|---|---|---|
| AI inference | Identificação de que o eixo de Privacidade fora cortado sobre premissa não verificada, ao validar a régua antes de auditar | Seção 2.0 |
| AI inference | Identificação do achado de assimetria de validação (Bloco 1), dirigida pelo critério nomeado do eixo | `docs/engineering/reviews/architecture-axis/block-1-modelo-de-dados/round1-claude-proposal.md` |
| AI implementation | 7º eixo em `joint-review-criteria.md`; schemas Zod de `Autor`/`Categoria`, `parseAutorItem`/`parseCategoriaItem`, atualização dos handlers | Commits desta sessão |

# 8. Participação humana

| Classificação | Descrição | Referência |
|---|---|---|
| Human decision | Pedido explícito de fechar a pergunta "os eixos atuais são suficientes?" com pesquisa externa antes de auditar qualquer bloco | "Antes de qualquer coisa temos que definir isso. Se necessário, pesquise na Internet.", nesta sessão, 2026-10-02 |
| Human decision | Aprovação do 7º eixo com os 4 critérios propostos, sem esperar rodada formal do protocolo (Codex indisponível) | Resposta direta a pergunta estruturada, mesma sessão |
| Human intervention | Correção do escopo deste próprio caso, de "decisão de transposição" para "resultado de qualidade" | "Eu não falo da transposição [...] o resultado que isso traz para a qualidade do projeto em si.", mesma sessão |
| Human intervention | Rejeição explícita do julgamento de engenharia da IA de reverter A3 depois que a correção quebrou 21 testes, exigindo consertar as fixtures em vez de recuar | "Você não é obrigado a fazer mudanças, apenas se as encontrar, precisamos já corrigir" seguido de "Eu não quero que reverta", mesma sessão |

# 11. Evidência de antes e depois

## Aplicabilidade
- Status: `required`
- Justificativa: há duas correções reais e comparáveis — (a) o eixo de Privacidade, ausente → presente; (b) os contratos de `Autor`/`Categoria`, sem validação → com validação.

## Referências

| Estado | Referência | Arquivo |
|---|---|---|
| Antes (eixos) | commit `c6fc78f`^ (antes do 7º eixo) | `docs/engineering/standards/joint-review-criteria.md` |
| Depois (eixos) | commit `c6fc78f` | mesmo arquivo |
| Antes (contratos) | commit `9a200d3` | `packages/contracts/src/autor.ts`, `categoria.ts` |
| Depois (contratos) | commit `ec2098b` | mesmos arquivos + `backend/src/common/{autorPersistence,categoriaPersistence}.ts` novos |

## Reprodução

```text
git diff c6fc78f~1..c6fc78f -- docs/engineering/standards/joint-review-criteria.md
git diff 9a200d3..ec2098b -- packages/contracts/src/autor.ts packages/contracts/src/categoria.ts
```

## Exemplo representativo 1 — eixo de Privacidade ausente → presente

### Antes
```text
**Eixos formalizados (6)**: Arquitetura, Qualidade de Engenharia, Engenharia de Contexto,
Segurança da Informação e AppSec, Governança de IA, Conteúdo Editorial e Experiência do
Visitante.
```

### Depois
```text
**Eixos formalizados (7)**: [...] Conteúdo Editorial e Experiência do Visitante,
Privacidade e Conformidade de Dados do Visitante.
```

### O que mudou
Um eixo inteiro, com 4 critérios pesados, passou a existir — não por preferência, mas porque a verificação contra pesquisa externa (LGPD) e código real (`ConsentModal.tsx`, páginas de política de privacidade) mostrou que a premissa que motivou o corte original era factualmente errada.

### Classificação da evidência
- `Observed fact`: os dois trechos são citações literais do arquivo nas duas versões.
- `Observed fact`: commit `ec2098b` (hash real, sem invenção antecipada, conforme `capture-protocol.md` §11.2).

## Exemplo representativo 2 — `autor.ts`

### Antes
```ts
export interface Autor {
  autor_id: string;
  nome_exibicao: string;
  // ... demais campos, sem validação em runtime em lugar nenhum
}
```

### Depois
```ts
export const autorEntitySchema = z.object({
  autor_id: z.string().min(1),
  nome_exibicao: z.string().min(1),
  // ...
});
export type Autor = z.infer<typeof autorEntitySchema>;
```

### O que mudou
`Autor` deixou de ser só um tipo de compilação e passou a ter uma forma verificável em runtime, consumida por `parseAutorItem` na leitura do DynamoDB — o mesmo tratamento que `Post` já tinha.

## Casos contrários ou de controle
Os eixos de Qualidade de Engenharia, Engenharia de Contexto, Governança de IA e Conteúdo Editorial, ao serem reavaliados na mesma rodada de verificação que restaurou Privacidade, não revelaram nenhuma lacuna comparável — nem todo eixo proposto estava mal calibrado, só o que tinha sido cortado sobre uma premissa não verificada.

# 15. Limites da conclusão

- Este caso cobre, até o momento, a verificação inicial da régua (§2.0) e 1 de 7 blocos de 1 eixo (§2.1) — não é evidência de que todo eixo produzirá um achado igualmente concreto.
- A validação da correção do Bloco 1 já foi confirmada (commit `ec2098b`, ver seção 6.3) — mas o caso continua `active`, não `resolved`, porque os outros 6 eixos ainda não foram auditados.

# 16. Questões em aberto

- Um eixo que não produz nenhum achado real em um bloco inteiro é evidência de boa qualidade já existente, ou de eixo mal calibrado para aquele tipo de código? Só a auditoria real dos próximos blocos/eixos permite distinguir isso.
- A calibração de pesos dentro dos eixos novos (Conteúdo Editorial, Privacidade) deveria passar pelo protocolo Claude↔Codex completo, em vez de ter sido decidida por julgamento direto de uma IA + aprovação humana? Candidato a rodada futura quando o Codex estiver disponível.

# 17. Potencial para o livro

## 17.1 Tema ou capítulo possível
Complementa CASE-007 (processo) com o ângulo de **resultado**: o que um instrumento de avaliação formal, nomeado e pesado — inclusive quando o próprio instrumento é auditado contra pesquisa externa e código real antes de ser usado — realmente muda no comportamento de busca por problemas.

## 17.2 Pergunta pedagógica central
Nomear e pesar um critério de qualidade (em vez de deixá-lo implícito em "bom senso de engenharia") muda, de forma mensurável, o que uma auditoria de IA efetivamente encontra — inclusive quando aplicado à própria lista de critérios?

# 18. Referências

- `docs/engineering/standards/joint-review-criteria.md` — os eixos sendo testados por este caso.
- `docs/book/cases/CASE-007-primeira-auditoria-real-protocolo-claude-codex-neste-repositorio.md` — caso irmão, sobre o mecanismo do protocolo em vez do resultado dos eixos.
- `docs/book/cases/CASE-006-calibracao-nove-eixos-full-audit.md` (projeto irmão, `expiration-tracker`) — como os 9 eixos originais foram calibrados via protocolo completo, contraste com o processo mais leve deste caso.

# 19. Revisão posterior

| Campo | Registro |
|---|---|
| Data da revisão | (não realizada — caso ativo, atualizado incrementalmente) |
| Decisão ainda válida | — |
