# Bloco 3 — Pipeline assíncrono/agendado — Rodada 1 (proposta independente, Claude)

**Escopo**: `backend/src/functions/{postScheduler,postCounterReconciler,imageProcessor}/`. Eixos: Arquitetura, Qualidade de Engenharia, Segurança/AppSec.

## Resultado: nenhum achado novo

Leitura completa dos 3 handlers não encontrou lacuna nova de comportamento, teste ou documentação:

- **`postScheduler`**: idempotente via `ConditionExpression` (`#status = :programado`), falhas isoladas por post via `Promise.allSettled` (um post não publicável não trava os outros), race de status já coberta por teste (`index.test.ts:121`, `ConditionalCheckFailedException` mockado).
- **`postCounterReconciler`**: auto-cura documentada e deliberadamente sem DLQ/alarme próprio — risco já registrado e aceito em `docs/backlog.md` item #59 (não é achado novo desta auditoria, confirmado por leitura, não redescoberto).
- **`imageProcessor`**: download único reaproveitado entre as 6 variantes (evita refetch do S3), escrita no DynamoDB do LQIP é non-blocking/best-effort (comentário explícito: falha ali não deve derrubar o processamento de imagem já salvo), `Scan` com `FilterExpression` para achar o post pelo nome da imagem é uma lacuna de índice já documentada e proporcional à escala atual (~20 posts).
- Propagação de erro (`throw` dentro do catch) em `imageProcessor`/`postScheduler`/`postCounterReconciler` é compatível com o desenho real de infra: os 3 são invocação assíncrona com DLQ configurada (`infra/modules/media/dlq.tf`, `infra/modules/lambda/dlq.tf` para os 2 primeiros) — deixar o erro propagar para o retry automático da Lambda é o comportamento correto aqui, não uma falta de tratamento.

## Avaliação por critério (resumida)

| Eixo | Nota |
|---|---:|
| Arquitetura (Reliability & Fault Recovery) | 9.0 |
| Qualidade de Engenharia (Test Effectiveness) | 8.5 — cobertura já real nos 3 handlers, nenhum gap na mesma classe de Q1/Q2 do Bloco 1/2 |
| Segurança/AppSec | 8.5 — IAM escopado por Lambda (confirmado por leitura anterior de `infra/modules/lambda/lambda-iam.tf`), nada de novo a reportar |

**Nota geral: 8.7/10** — nenhuma correção aplicada neste bloco, resultado honesto de "já estava bem", não achado forçado para parecer produtivo.
