---
status: active
owner: Marcelo
authority: normative
---

# Governança de IA e controles internos

Complementa `CLAUDE.md` §11 (protocolo de debate Claude↔Codex) e `docs/engineering/standards/joint-review-criteria.md` §"Eixo: Governança de IA". Aquele eixo define O QUE é avaliado; este documento é onde os controles concretos (matriz de autoridade, inventário de uso, registro de incidentes) vivem como artefato durável. Adaptado do padrão equivalente do projeto irmão `expiration-tracker`, sem herdar o histórico de incidentes de lá — este registro começa vazio e cresce só com eventos reais observados neste projeto.

## 1. Matriz de autoridade — ações por agente (Claude Code, Codex CLI)

| Ação | Status | Base |
|---|---|---|
| Editar código/docs em branch própria, rodar testes/lint/typecheck | Permitido sem aprovação prévia | `CLAUDE.md` §2/§4 |
| Abrir, revisar e mergear o próprio PR (`develop`/`main`) | Permitido sem aprovação de uma segunda pessoa — sempre via PR, nunca push direto | `git-and-review-workflow.md` |
| Push direto em `develop` ou `main` | Proibido, mesmo para mudança pequena | `git-and-review-workflow.md`, achado `PCA-20260804-001` |
| Force-push, deletar branch protegida, bypassar CI (`--no-verify`) | Proibido | Git Safety Protocol (harness) |
| Editar `infra/` (Terraform) e workflows de CI/CD, rodar `terraform fmt/validate`/TFLint localmente | Permitido sem aprovação prévia, mesma autonomia de código normal | `CLAUDE.md` §8 |
| Rodar `terraform apply` real contra a conta AWS, ou qualquer ação de infra fora do fluxo padrão PR→CI→CD (`deploy-dev`) | Proibido por padrão — exige instrução explícita de Marcelo | `CLAUDE.md` §4 |
| Comandos AWS de escrita real fora do fluxo de CD (`aws s3 sync`, `aws cloudfront create-invalidation`, IAM) | Proibido por padrão — exige instrução explícita de Marcelo | `CLAUDE.md` §4 |
| Decisão nível 5-6 (`change-risk-scale.md`) | Requer protocolo `CLAUDE.md` §11 (nota cega, ≥3 rodadas, gate 9.0) **ou** decisão humana direta registrada com justificativa explícita de por que o protocolo foi dispensado (ver §2 abaixo) | `CLAUDE.md` §11 |
| Comunicação externa (e-mail, post público, contato com terceiro) | Não autorizado por padrão — site é consultoria real com clientes potenciais, diferente de um projeto pré-produção | N/A (registrar aqui se/quando surgir caso de uso real) |

Esta tabela é o ponto único de referência de autoridade — não substitui julgamento caso a caso, mas evita reconstruir as regras a cada sessão a partir de prompts dispersos.

## 2. Quando o protocolo `CLAUDE.md` §11 pode ser dispensado

O protocolo é dispensável para uma decisão nível 5-6 quando, e somente quando, todas as condições abaixo são verdadeiras — e registradas na própria decisão/ADR:

1. A escolha já foi feita diretamente por Marcelo (`CLAUDE.md` §1), não por um agente propondo e o outro validando.
2. A decisão documenta explicitamente que o protocolo foi dispensado e por quê (não fica implícito).
3. Alternativas tecnicamente viáveis continuam registradas (Options Considered) mesmo sem debate formal — para que uma revisão futura consiga avaliar se a decisão foi razoável mesmo sem rodada Claude↔Codex.

Uma decisão nível 5-6 que dispense o protocolo sem essas três condições registradas volta a ser tratada como pendência, não como exceção válida.

## 3. Inventário de casos de uso de IA

| Uso | Finalidade | Dados acessados | Impacto se errado | Autonomia | Reversibilidade | Aprovador |
|---|---|---|---|---|---|---|
| Claude Code — engenharia autônoma do repositório (código, infra, docs, testes) | Construir/manter o site e o subsistema editorial | Código-fonte, docs, histórico de decisões; dado real de contato de visitante (baixo volume, baixa sensibilidade) | Bug publicado, drift de documentação, decisão técnica ruim — mitigado por CI (`quality-gate-tiers.md`) e protocolo para nível 5-6 | Alta para níveis 1-4, incluindo abrir/mergear o próprio PR; baixa para nível 5-6 (requer protocolo ou decisão humana registrada, §2) | Alta — tudo em branch própria, revertível via Git; `develop`/`main` protegidos contra push direto | Autor (self-review/self-merge); Marcelo permanece aprovador de nível 5-6 sem protocolo (§2) e de qualquer ação de infra real fora do fluxo padrão |
| Codex CLI — revisor independente no protocolo Claude↔Codex | Segregação de funções: segunda opinião cega sobre decisões nível 5-6 | Mesmo escopo de leitura que Claude Code, escopado ao arquivo/contexto necessário (`--skip-git-repo-check`) | Revisão fraca/mal calibrada não seria pega — mitigado por nota cega + mínimo de rodadas + gate 9.0 sem arredondar | Somente leitura/avaliação — nunca escreve código diretamente no protocolo | Alta — output é só avaliação, não muda estado do sistema | Claude (interpreta/aplica achados) + Marcelo (decisão final) |

**Gatilho de reavaliação**: qualquer mudança de escopo de acesso (novo diretório liberado para edição autônoma, novo tipo de dado de visitante acessível, novo fornecedor de IA externo no produto) reabre este inventário.

## 4. Gestão de modelos e ferramentas

| Ferramenta | Fornecedor | Nota |
|---|---|---|
| Claude Code | Anthropic | Sem processo formal de avaliação de regressão ao trocar de versão de modelo — mudança de comportamento do fornecedor não é controle interno garantido. |
| Codex CLI | OpenAI | Invocado via `codex exec --skip-git-repo-check "<prompt>"`, rodado em background. Regras de uso seguro em ambiente Windows: ver `CLAUDE.md` §11. |

**Gatilho de reavaliação**: upgrade de CLI/modelo de qualquer ferramenta usada no protocolo — repetir uma rodada de nota cega num achado já conhecido antes de confiar no novo comportamento para uma decisão real.

## 5. Incidentes de IA (registro real, não de engenharia)

Distinto de falha de produto — aqui registram-se eventos onde o comportamento do próprio agente de IA (não do site) desviou do esperado: loop de auto-delegação sem progresso, overclaim de conclusão sem verificação funcional, bypass de regra de processo, etc.

Nenhum incidente registrado até o momento. Novo incidente segue o formato: data, o que aconteceu, impacto, contenção, causa raiz, ação corretiva, status — adicionado antes do fim da sessão em que ocorreu, não reconstruído depois por auditoria.

## 6. Proteção de contexto/dados no uso de IA

Regra mínima, proporcional ao estágio do projeto (site real, mas sem dado sensível de usuário final em volume):

- Nenhum segredo real (chave AWS, token, credencial) é colado em prompt — credenciais reais são referenciadas por nome/perfil (`claude-dev`), nunca por valor de chave secreta.
- Contexto enviado ao Codex CLI é limitado ao necessário para a tarefa (arquivos específicos listados no prompt, não o repositório inteiro).
- Dado de formulário de contato (quando existir volume relevante) reabre esta seção como prioridade antes do primeiro caso de uso de IA sobre esse dado.
