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

`Observed fact`: ao ser perguntado se o conjunto de eixos estava completo antes de iniciar qualquer auditoria, a verificação (pesquisa externa sobre LGPD + inspeção direta do código) encontrou que o eixo de Privacidade havia sido cortado da versão inicial com base numa premissa não verificada ("sem dado pessoal sensível em volume"), quando na realidade o projeto já tinha, implementado, `ConsentBanner`/`ConsentModal`/`ConsentManager` com o fluxo completo de opt-in (banner, modal, armazenamento em `localStorage`, propagação via Google Consent Mode), páginas de política de privacidade/cookies/termos, e um `ContactForm` coletando dado pessoal.

`Limitation` (corrigido no Bloco 5, não na redação original desta seção): a primeira versão deste caso e de `joint-review-criteria.md` afirmou que o Google Analytics "já gatilha" por opt-in — leitura imprecisa feita sem abrir `frontend/lib/consent.ts` por completo. Ao auditar o Bloco 5 de verdade, o carregamento real do script do GA (`loadScriptsByConsent()`) mostrou estar inteiramente comentado, com measurement ID placeholder (`G-XXXXXXXXXX`) — não há rastreamento real ativo hoje, só a infraestrutura de consentimento (correta) pronta para quando for ligado. Corrigido em `joint-review-criteria.md` e aqui; registrado como exemplo de por que uma afirmação sobre comportamento de código precisa ser verificada por leitura completa do arquivo relevante, não por grep de nome de componente.

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

## 2.2 Bloco 2 (API backend síncrona) — Arquitetura, Qualidade de Engenharia, Segurança/AppSec

Marcelo pediu para submeter cada bloco a todos os eixos que fizerem sentido para ele, não só a um — a partir daqui o registro passa a ser por bloco (não por eixo isolado), já que um bloco de código real costuma acionar mais de um eixo na mesma leitura.

`Observed fact`: `cognitoJwt.ts` tinha um comentário afirmando uso em 2 lugares (`adminSession` + um fallback `Authorization: Bearer` em `adminAuthorizer`) — `adminAuthorizer` já tinha removido esse fallback (confirmado pelo próprio comentário do arquivo e por um teste que já afirmava isso explicitamente). `grep` confirmou só 1 uso real de `verifyIdToken`. Drift de documentação real, corrigido.

`AI inference`: achado mais significativo do bloco — `adminSessionStore.getSession()` existe especificamente para não confiar no TTL do DynamoDB ("best-effort housekeeping, pode levar até 48h para varrer", comentário do próprio arquivo), mas nenhum teste em todo o repositório cobria o cenário que essa checagem resolve: um item com `expires_at` no passado, ainda fisicamente presente na tabela. O teste existente do `adminAuthorizer` só cobria "item não existe" — um cenário diferente (e mais fácil) do que "item existe mas expirou". Esse é o tipo de achado que só aparece ao perguntar "o que esse comentário afirma, e isso tem prova?" eixo a eixo — exatamente o ponto central deste caso (§1).

**Correção aplicada**: comentário de `cognitoJwt.ts` corrigido; `backend/src/common/adminSessionStore.test.ts` novo, testando a corrida de expiração diretamente. `mediaUpload` (allowlist de Content-Type, `content-length-range` via presigned POST, sanitização de nome de arquivo, confirmado via Terraform que a rota exige o mesmo autorizador de cookie) e `adminSession`/`adminAuthorizer` (cookie `HttpOnly/Secure/SameSite=Strict`, SRP 100% client-side) não produziram achado novo — avaliação honesta, não achado forçado.

Nota pós-correção: 8.9/10. Commit `31d4604`.

## 2.3 Bloco 3 (Pipeline assíncrono/agendado) — nenhum achado novo

`Observed fact`: `postScheduler`, `postCounterReconciler` e `imageProcessor` já tinham passado por rodadas de auditoria anteriores (histórico em `docs/backlog.md`, ex. item #23 — job de reconciliação, item #59 — DLQ ausente já aceito como risco). A leitura completa deste bloco não encontrou lacuna nova de comportamento, teste ou documentação.

`AI inference`: isso é, em si, um dado relevante para a pergunta central deste caso (§6, critérios de aceitação) — nem todo bloco produz achado ao ser auditado por um eixo nomeado; um bloco que já recebeu atenção de engenharia repetida no passado tende a não produzir achado novo, o que é evidência de que a auditoria está discriminando sinal real (onde há lacuna, acha; onde não há, não força). Nota: 8.7/10, sem correção aplicada.

## 2.4 Bloco 4 (Infraestrutura) — amostragem declarada, não cobertura completa

`Limitation`: 10 módulos de Terraform é escopo grande demais para leitura exaustiva no tempo desta sessão — esta rodada amostrou as áreas de maior risco (IAM, CloudTrail/GuardDuty, CSP) em vez de ler os ~10 módulos inteiros. Registrado explicitamente como limitação (`capture-protocol.md` §12 — "registrar incerteza quando a evidência for incompleta"), não apresentado como auditoria completa por omissão.

`Observed fact`: a CSP do frontend usa `script-src 'self' 'unsafe-inline'`, uma fraqueza real de defesa-em-profundidade contra XSS — mas já é decisão documentada e justificada no próprio arquivo Terraform (migrar para nonce exigiria middleware por request). Não contado como achado novo por já estar sob decisão consciente, mas sinalizado para a crítica do Codex avaliar a proporcionalidade.

## 2.5 Bloco 5 (Frontend público) — achado de verificação, não de bug

Ver seção dedicada acima (achados P1/P2) — resumo: duas afirmações do próprio eixo de Privacidade ("Google Analytics já gatilha", "ContactForm já coleta dado") eram imprecisas, escritas sem ler a lógica completa de carregamento/envio. `loadScriptsByConsent()` tem o GA comentado; `submitContact()` é mock explícito. Corrigido nos critérios. Mesma classe de erro do achado "single-table" do Bloco 1 — padrão que já aparece 2 vezes nesta auditoria (`AI inference`: candidato real a princípio generalizável, ver seção 14).

## 2.6 Bloco 6 (Admin SPA) — 3 bugs reais, auditoria total (não por amostra)

Quando Marcelo pediu auditoria total (não por amostra), a releitura completa deste bloco — que na primeira passada só tinha coberto `auth.ts`/`api.ts`/router — encontrou 3 bugs funcionais reais que a amostra inicial não alcançou:

`Observed fact`: `sanitizeHtml.ts` (admin) tinha o mesmo tipo de gap do Bloco 5 — o comentário afirmava allowlist "idêntica" ao backend, mas faltava `ALLOWED_URI_REGEXP`, aceitando esquemas (`tel:`, `sms:`, `cid:`, `xmpp:`) que o backend rejeita. Baixo risco real (só afeta a pré-visualização local), mas a 4ª ocorrência do mesmo padrão de afirmação não verificada nesta auditoria.

`AI inference` verificada por teste direto: `DashboardView.vue`'s `bulkPublish()` chamava `postsApi.update(slug, { status: 'Publicado' })` sem o campo `version`, obrigatório em `updatePostInputSchema` — toda publicação em massa retornava 400 do backend. Bug real, não hipotético; não havia nenhum teste para `DashboardView.vue`.

`Observed fact` confirmado com teste real contra a função `sanitize-html` do próprio projeto: o editor Tiptap tinha `allowBase64: true`, que embute uma imagem colada/arrastada como `data:` URI — o backend então remove o `src` silenciosamente ao salvar (esquema `data:` fora de `ALLOWED_SCHEMES`), deixando uma tag `<img>` sem imagem no post publicado, sem nenhum erro visível ao autor. Esse é o achado mais severo dos três: perda silenciosa de dado numa ação de edição comum (colar um print).

**Correção aplicada aos 3**: comentário/esquema de URI corrigido (`31a23c3`), `bulkPublish()` corrigido com o mesmo padrão `?? 0` de `bulkDelete()` (`1492e5e`), `allowBase64` desabilitado forçando o pipeline real de upload (`b2afc12`).

**Achado de processo, não de produto**: os 3 bugs viviam exatamente nos arquivos que a primeira passada (por amostra, Rodada 1 original) tinha decidido não ler — `DashboardView.vue` e `useTiptapExtensions.ts` nunca tinham sido abertos antes desta rodada completa. Isso é evidência direta a favor do pedido de Marcelo: amostragem dirigida por risco percebido pode errar exatamente onde o risco real mora. Nota pós-correção: 8.4/10 (a lacuna estrutural de `@vue/test-utils` ausente no projeto permanece registrada, não fechada).

## 2.7 Bloco 7 (Subsistema editorial) — nenhum achado novo

Contexto relevante: já tinha passado por 2 rodadas de revisão cega via Codex CLI fora deste protocolo, na mesma sessão de trabalho — declarado, não escondido. `LIFECYCLE.md` consistente consigo mesmo e com os schemas satélite. Nota: 8.7/10.

## Resumo dos 7 blocos (todos concluídos do lado Claude)

| Bloco | Achado real | Nota |
|---|---|---:|
| 1. Modelo de dados | A1/A2/A3 corrigidos + bug real (listCategorias) | 9.1 |
| 2. API síncrona | Comentário obsoleto + lacuna de teste na expiração de sessão, ambos corrigidos | 8.9 |
| 3. Pipeline assíncrono | Nenhum | 8.7 |
| 4. Infraestrutura | Nenhum novo (amostra parcial declarada) | não calculada |
| 5. Frontend público | 2 afirmações de privacidade corrigidas (verificação, não bug) | não calculada |
| 6. Admin SPA | Nenhum | 8.8 |
| 7. Subsistema editorial | Nenhum (já hardenizado recentemente) | 8.7 |

Pendência comum a todos os 7: crítica cruzada real do Codex, bloqueada até 2026-10-03 15:20 — nenhum bloco está formalmente convergido pelo protocolo completo ainda, só auditado do lado Claude.

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

# 14. Princípio generalizável

Nomear e pesar um critério de qualidade muda o que uma auditoria de IA efetivamente procura — confirmado nos 7 blocos (§2.0-2.7): todo achado real corrigido (A1/A2/A3, Q1/Q2, S1/S2, P1/P2) foi encontrado perguntando "o critério X está satisfeito aqui?", não por leitura de código sem direção.

Um segundo princípio emergiu, não previsto na primeira versão deste caso: **uma afirmação sobre comportamento de código (não sobre sua existência) só é um fato depois de ler a lógica completa que produz esse comportamento, nunca a partir do nome/existência de um arquivo ou componente.** Apareceu duas vezes nesta mesma auditoria, em registros independentes: a premissa "single-table DynamoDB" (Bloco 1, CASE-007) e as premissas "GA já gatilha"/"ContactForm já coleta dado" (Bloco 5, P1/P2) — ambas escritas por inferir comportamento a partir de nome de arquivo/componente, corrigidas só ao ler a função que efetivamente executa o comportamento alegado (`loadScriptsByConsent()`, `submitContact()`). Duas ocorrências do mesmo tipo de erro, pela mesma IA, no mesmo caso, é sinal mais forte que uma ocorrência isolada — candidato real a virar regra operacional explícita (ex. "nunca afirmar que X 'já faz Y' sem citar a função que faz Y e confirmar que não está comentada/mockada"), não só um lembrete pontual.

# 15. Limites da conclusão

- Este caso cobre os 7 blocos do lado Claude (§2.0-2.7) — nenhum foi submetido à crítica cruzada real do Codex ainda (bloqueado por rate-limit até 2026-10-03 15:20). A convergência do protocolo completo (`CLAUDE.md` §11) não pode ser declarada só com a proposta de um lado.
- Os Blocos 4 e 5 foram auditados por amostragem declarada, não cobertura linha a linha completa — suas notas gerais não foram calculadas por honestidade (amostra insuficiente para uma média ponderada real).
- A validação das correções aplicadas (Blocos 1-2) foi confirmada por teste real (commits `ec2098b`, `59abf4a`, `9961031`, `149bf19`, `31d4604`) — mas o caso continua `active`, não `resolved`, até a rodada do Codex acontecer.

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
