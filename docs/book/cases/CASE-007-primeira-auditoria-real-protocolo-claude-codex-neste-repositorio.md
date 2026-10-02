---
id: CASE-007
title: "Primeira aplicação real (prospectiva) do protocolo de debate Claude↔Codex neste repositório: auditoria dos 7 eixos de qualidade, bloco a bloco"
summary: "Registro em tempo real, não retrospectivo, de como o protocolo Claude↔Codex adaptado do expiration-tracker (CASE-005) se comporta na primeira auditoria real conduzida neste repositório: divisão em blocos auditáveis, proposta independente, crítica cruzada e nota cega, eixo por eixo, começando por Arquitetura."
date_started: 2026-10-02
date_closed:
status: active
themes: [colaboracao-multi-agente, tomada-de-decisao, revisao-por-pares-ia, qualidade-de-engenharia, arquitetura-de-dados]
components: [processo-de-engenharia, backend, packages-contracts, infra]
trigger_types: [architecture-decision, engineering-tradeoff]
related_commits: []
related_pull_requests: ["https://github.com/marcelo-jgoncalves/mgoncalves-editorial-platform/pull/29"]
related_files:
  - "../../engineering/standards/change-risk-scale.md"
  - "../../engineering/standards/quality-gate-tiers.md"
  - "../../engineering/standards/joint-review-criteria.md"
  - "../../engineering/standards/ai-governance.md"
  - "../../engineering/reviews/blocks.md"
  - "../../../packages/contracts/src/post.ts"
  - "../../../packages/contracts/src/autor.ts"
  - "../../../packages/contracts/src/categoria.ts"
  - "../../../backend/src/common/postPersistence.ts"
  - "../../../backend/src/functions/getAuthor/index.ts"
related_tests: []
related_pipelines: []
related_adrs: []
related_experiments: []
ai_tool: "Claude Code (orquestrador) + Codex CLI (segundo avaliador independente)"
ai_model: "Claude Sonnet 5; Codex CLI codex-cli 0.156.1"
ai_autonomy_level: "4 — Full implementation cycle"
book_potential: high
review_after: 2026-11-02
last_reviewed:
baseline_ref: 189bad2
result_ref: not-applicable
evidence_files: []
---

<!--
Este caso está ativo. Ele registra o raciocínio no momento em que o trabalho acontece,
não uma reconstrução posterior — distinto do CASE-005, que documentou retrospectivamente
o mesmo protocolo aplicado em outro repositório (expiration-tracker).
-->

# Resumo do caso

Marcelo pediu, na mesma sessão que criou `docs/engineering/standards/{change-risk-scale,quality-gate-tiers,joint-review-criteria,ai-governance}.md` (PR #29, transposição adaptada do protocolo do `expiration-tracker`), que o protocolo fosse imediatamente usado de verdade: uma auditoria dos eixos de `joint-review-criteria.md` (6 no momento do pedido, corrigido para 7 antes do início do Bloco 1 — ver nota abaixo), um eixo por vez, cada eixo dividido antes em blocos logicamente auditáveis, cada bloco levado ao protocolo de nota cega até convergência ou impedimento. Este caso captura essa primeira execução real — diferente do CASE-005, que reconstruiu uma execução passada em outro repositório a partir de artefatos já prontos, este caso observa o processo acontecer.

# 1. Contexto

`CLAUDE.md` §11 (nova) e os 4 documentos de `docs/engineering/standards/` foram criados na sessão anterior, mas nunca usados operacionalmente neste repositório — só existiam como regra escrita. CASE-005 (ainda não commitado neste repositório, ver `Limitation` abaixo) já havia registrado uma pergunta em aberto sobre o protocolo original: "existe um ponto de retorno decrescente em que rodadas adicionais deixam de encontrar achados reais?" e "o protocolo se comporta de forma diferente aplicado a um projeto com característica distinta?" — este caso é a primeira oportunidade real de observar isso num projeto diferente (site de conteúdo, não SaaS multi-tenant).

`Human decision`: Marcelo definiu a ordem do trabalho explicitamente — dividir em blocos antes de auditar, auditar bloco a bloco (não o eixo inteiro de uma vez), aplicar o protocolo completo (proposta independente → crítica cruzada → nota cega) a cada bloco, e tratar tanto a convergência (≥9.0 cego, sem arredondar) quanto um eventual impedimento como paradas válidas.

# 2. Problema observado / pergunta de pesquisa

`Open question`: o protocolo (nota cega, limiar 9.0, eixos recalibrados) produz achados reais e calibrados quando aplicado a um projeto solo de conteúdo/consultoria, ou a estrutura de 9→6 eixos e a escala de risco adaptada perdem precisão na transposição?

`Observed fact`: a primeira leitura independente do Bloco 1 (modelo de dados e contratos: `packages/contracts/src/{post,autor,categoria}.ts` + `backend/src/common/{postSchema,dynamodb,postPersistence,postCounters,categorias}.ts`), antes de qualquer rodada do protocolo, já encontrou uma assimetria real: `Post` tem um schema Zod completo (`postEntitySchema`) e é validado em runtime na leitura do DynamoDB via `parsePostItem()` (`backend/src/common/postPersistence.ts:9-18`, cujo próprio comentário declara o princípio: "A cast (`as Post`) only tells the compiler to trust the shape, it proves nothing about the item actually read from DynamoDB [...] This validates at the boundary instead"). `Autor` e `Categoria` (`packages/contracts/src/autor.ts`, `categoria.ts`) são interfaces TypeScript puras, sem schema Zod e sem validação em runtime — `backend/src/functions/getAuthor/index.ts:32` lê o item do DynamoDB e faz `result.Item as Autor` diretamente, exatamente o padrão que o comentário de `postPersistence.ts` identifica como insuficiente.

`AI inference`: isso é candidato a achado real do Bloco 1 contra o critério "Data Model & Consistency" do eixo Arquitetura (`joint-review-criteria.md`) — o princípio "validar na fronteira, nunca confiar em `as Tipo`" está documentado e aplicado para `Post`, mas não para `Autor`/`Categoria`, uma inconsistência interna ao próprio bloco. Ainda não verificado se isso é uma lacuna real (dado nunca corrompido manualmente) ou um risco aceito implicitamente por falta de necessidade — a tabela de posts já teve 1 caso real de corrupção que motivou `parsePostItem` (ver `CASE-004`); não há evidência equivalente para `autores`/`categorias` ainda.

# 3. Modelo mental inicial

Hipótese de que o protocolo adaptado (eixos próprios, escala de risco própria, tiers de gate mapeados aos workflows reais) seria operacionalmente equivalente ao do `expiration-tracker` — a única incerteza genuína era se a *redução* de 9 para 6 eixos perderia sensibilidade a um tipo de achado que um eixo descartado (ex. Operações/SRE) capturaria e que os eixos atuais não cobrem — pergunta parcialmente respondida antes mesmo do Bloco 1: a checagem contra a realidade do código encontrou que Privacidade faltava, e foi adicionada como 7º eixo (ver nota abaixo).

# 4. Hipótese inicial

O Bloco 1 (modelo de dados e contratos) é o bloco de maior risco esperado do eixo Arquitetura, por ser a fonte única de verdade de schema consumida por todos os outros blocos (`blocks.md`, racional de ordenação) — a expectativa inicial é que a crítica cruzada do Codex encontre pelo menos um achado real de Data Model & Consistency, análogo ao papel que a crítica cruzada teve no caso do GSI3 do `expiration-tracker` (CASE-005).

# 5. Alternativas consideradas

## 5.1 Auditar o eixo inteiro de uma vez, sem dividir em blocos

### Vantagens
Menos overhead de coordenação, uma única rodada de proposta/crítica por eixo.

### Riscos
Um eixo como Arquitetura cobre 7 blocos estruturalmente distintos (dado, API síncrona, pipeline assíncrono, infra, frontend, admin, editorial) — uma crítica cruzada sobre o eixo inteiro de uma vez tende a produzir achados genéricos ou a enterrar um achado real específico de um bloco pequeno sob o volume dos outros 6.

### Motivo da rejeição
Instrução explícita de Marcelo: dividir antes de auditar, bloco a bloco. Hipótese de processo (ainda não testada): granularidade menor produz achados mais específicos e verificáveis, mesmo linha a linha do `joint-review-criteria.md`.

# 6. Riscos e critérios de aceitação

## 6.1 Riscos conhecidos
- Custo de tempo: 7 blocos × mínimo 1-3 rodadas cada, só para o primeiro dos agora 7 eixos — risco real de "teatro de rigor" se as rodadas pararem de produzir achados novos.
- Risco de a redução de eixos ocultar uma classe de achado real — materializado antes mesmo do Bloco 1: Privacidade foi cortada na primeira versão e precisou ser readicionada após pesquisa externa e inspeção de código (ver nota abaixo, `CASE-008`).

## 6.2 Critérios de aceitação
Para efeito deste caso, o protocolo é considerado bem-sucedido no Bloco 1 se: (a) a crítica cruzada do Codex confirma ou refuta o achado de assimetria Post/Autor-Categoria já observado de forma independente nesta seção antes de qualquer rodada; (b) pelo menos um achado da crítica cruzada é específico e verificável por arquivo:linha, não impressão geral de qualidade.

## 6.3 Obrigações de prova

| Mudança ou afirmação | Evidência exigida | Evidência obtida | Status |
|---|---|---|---|
| `Post` é validado em runtime na leitura, `Autor`/`Categoria` não são | Citação literal de `postPersistence.ts` e de `getAuthor/index.ts:32` | Obtida — citações na seção 2 acima | `satisfied` |
| Proposta independente de Claude para o Bloco 1 (9 critérios + achados A1-A3 + nota geral) | Documento próprio, sem input do Codex | Obtida — `docs/engineering/reviews/architecture-axis/block-1-modelo-de-dados/round1-claude-proposal.md`, nota 7.6/10 | `satisfied` |
| Proposta independente do Codex para o Bloco 1 | Documento próprio, sem ver a proposta de Claude antes do registro | **Bloqueada** — `codex exec` retornou `ERROR: You've hit your usage limit [...] try again at Oct 3rd, 2026 3:20 PM` (saída completa em `round1-codex-output-RATE-LIMITED.txt`) | `pending` |

# 7. Participação da IA

| Classificação | Descrição | Referência |
|---|---|---|
| AI proposal | Divisão da aplicação em 7 blocos auditáveis para o eixo Arquitetura | `docs/engineering/reviews/blocks.md` |
| AI inference | Achado inicial de assimetria de validação Post vs. Autor/Categoria, antes de qualquer rodada do protocolo | Seção 2 acima |

# 8. Participação humana

| Classificação | Descrição | Referência |
|---|---|---|
| Human decision | Definir a ordem do trabalho (dividir em blocos → auditar bloco a bloco → protocolo completo por bloco) e pedir a captura deste caso explicitamente | Pedido direto de Marcelo nesta sessão, 2026-10-02 |

# 9. Investigação e evolução

## 9.1 Evidências coletadas até o momento
Ver seção 2 (`Observed fact` sobre `postPersistence.ts`/`getAuthor/index.ts`).

## 9.2 Tentativas realizadas
- Divisão em 7 blocos do eixo Arquitetura (`blocks.md`).
- Leitura completa do Bloco 1 (9 arquivos, 446 linhas) como proposta independente de Claude, concluída e registrada (nota 7.6/10).
- Invocação de `codex exec --skip-git-repo-check` com o prompt da Rodada 1 (escopo do bloco + critérios, sem a proposta de Claude) — rodada em segundo plano.

## 9.3 Comportamento inesperado

`Observed fact`: a primeira tentativa real de invocar o Codex nesta auditoria retornou `ERROR: You've hit your usage limit [...] try again at Oct 3rd, 2026 3:20 PM` (saída completa preservada em `docs/engineering/reviews/architecture-axis/block-1-modelo-de-dados/round1-codex-output-RATE-LIMITED.txt`) — não uma falha de execução (trava/CPU zero, caso coberto por outra regra do protocolo), mas o próprio limite de uso da conta. `CLAUDE.md` §11 (escrito poucas horas antes, no mesmo PR que este caso audita) já previa exatamente este modo de falha ("Rate limit do Codex: não bloquear a sessão esperando [...] reagendar"), mas nunca tinha sido testado contra uma ocorrência real neste repositório.

`AI inference`: a janela de retomada (mais de 24h à frente) está fora do alcance de um reagendamento curto de sessão — a regra como escrita cobre bem o caso de uma espera de minutos/poucas horas, mas não distingue explicitamente esse caso de uma espera de mais de um dia, onde a ação prática correta é relatar o bloqueio ao humano e aguardar decisão, não tentar um mecanismo de wakeup automático. `Open question`: a regra deveria ganhar esse limiar explícito (ex. "> X horas → reportar e parar, não agendar"), ou isso já está implícito em "não bloquear a sessão esperando"?

# 10. Solução final

Pendente — caso ainda ativo. O Bloco 1 tem a proposta independente de Claude completa; a rodada do Codex está bloqueada por limite de uso externo até 2026-10-03 15:20, não por uma falha do processo ou do desenho do protocolo em si.

# 11. Evidência de antes e depois

## Aplicabilidade
- Status: `not-applicable` por ora — nenhuma correção foi aplicada ainda, só uma observação inicial antes da rodada formal. Esta seção será preenchida quando (e se) o Bloco 1 produzir uma mudança real, com referência de commit.

# 12. Evidências de validação

## 12.3 Evidências ausentes ou insuficientes
Nota cega de Claude e Codex para o Bloco 1 ainda não existe neste caso — será adicionada na próxima atualização.

# 13-16. Mudança do modelo mental / princípio generalizável / limites / questões em aberto

Pendente de preenchimento ao final do ciclo do Bloco 1 ou do eixo completo, conforme `capture-protocol.md` §7.3.

# 17. Potencial para o livro

## 17.1 Tema ou capítulo possível
Par direto do capítulo já identificado em CASE-005 ("desenho de protocolos de decisão multi-agente") — este caso adiciona o ângulo de **transposição de um protocolo para um segundo projeto com características diferentes**, observado em tempo real em vez de reconstruído.

## 17.2 Pergunta pedagógica central
Um protocolo de revisão por pares calibrado para um projeto (SaaS multi-tenant) continua produzindo sinal real quando adaptado — não copiado — para um projeto com perfil de risco distinto (site de conteúdo)? O que exatamente precisa ser recalibrado, e o que se mantém?

# 18. Referências

- `docs/engineering/standards/{change-risk-scale,quality-gate-tiers,joint-review-criteria,ai-governance}.md` — regras adaptadas sendo testadas por este caso.
- `docs/engineering/reviews/blocks.md` — divisão em blocos.
- `docs/book/cases/CASE-005-protocolo-nota-cega-claude-codex-blueprint.md` — caso irmão, retrospectivo, sobre o protocolo original no `expiration-tracker`.

# 19. Revisão posterior

| Campo | Registro |
|---|---|
| Data da revisão | (não realizada — caso recém-aberto) |
| Decisão ainda válida | — |
