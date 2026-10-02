# Divisão em blocos — Auditoria multi-eixo

Divisão da aplicação em blocos logicamente auditáveis, originalmente desenhada para o eixo Arquitetura mas reutilizada para os demais eixos de `docs/engineering/standards/joint-review-criteria.md` (a divisão em blocos é por fronteira de módulo real, não por eixo — faz sentido para qualquer eixo auditar o mesmo bloco). Cada bloco é auditado contra todo eixo que fizer sentido para ele (nem todo eixo se aplica a todo bloco — ex. Conteúdo Editorial não se aplica ao Bloco 1), via protocolo de debate Claude↔Codex (`CLAUDE.md` §11), até convergência (≥9.0 cego dos dois lados, sem arredondar) ou impedimento registrado que trave a nota.

Pastas de evidência por eixo: `docs/engineering/reviews/{architecture,quality,security,context,ai-governance,editorial,privacy}-axis/block-N-<nome>/`.

Critério de corte de bloco: fronteira de módulo real do repositório (não um corte artificial por tamanho) — cada bloco corresponde a uma unidade que já é tratada como coesa pelo próprio código (um diretório de domínio, uma camada de runtime).

## Blocos

| # | Bloco | Escopo (diretórios/arquivos) | Por que é uma unidade |
|---:|---|---|---|
| 1 | Modelo de dados e contratos | `packages/contracts/src/`, `backend/src/common/{postSchema,dynamodb,postPersistence,postCounters,categorias}.ts` | Fonte única de verdade do schema (Post/Categoria/Autor) e do acesso ao DynamoDB single-table — toda mudança de nível 5-6 em contrato/chave nasce aqui. |
| 2 | API backend síncrona | `backend/src/functions/{adminAuthorizer,adminAuthors,adminCategories,adminPosts,adminSession,getAuthor,getPost,getPosts,mediaUpload}/` | Handlers Lambda invocados via API Gateway, superfície HTTP pública e administrativa. |
| 3 | Pipeline assíncrono/agendado | `backend/src/functions/{imageProcessor,postCounterReconciler,postScheduler}/`, wiring de EventBridge em `infra/modules/lambda/`, `infra/modules/media/` | Trabalho disparado por evento/cron, não por requisição HTTP direta — classe de falha e de recuperação distinta do bloco 2. |
| 4 | Infraestrutura (Terraform) | `infra/modules/{api-gateway,cognito,dynamodb,finops,frontend,lambda,media,observability,security-monitoring,admin}/` | Topologia AWS real que hospeda todos os outros blocos — GSIs, IAM, CDN, Cognito. |
| 5 | Frontend público | `frontend/app/`, `frontend/components/`, `frontend/lib/` | Next.js/OpenNext, consumidor read-only da API pública. |
| 6 | Admin SPA | `admin/src/{components,composables,layouts,router,services,stores,views}/` | Vue SPA, único cliente autenticado da API administrativa. |
| 7 | Subsistema editorial | `editorial/schema/`, `editorial/LIFECYCLE.md`, validador (`scripts/` relacionados a `validate:editorial`) | Modelo de dado e máquina de estado própria (planos/outcomes/receipts), desacoplada do runtime AWS. |

## Ordem de execução

Sequencial, na ordem da tabela — bloco 1 primeiro porque os blocos 2-3 dependem do modelo de dado que ele define; bloco 4 depois de 2-3 porque a infra é avaliada contra o que ela hospeda; frontend/admin (5-6) e editorial (7) são os mais desacoplados do core de dado, avaliados por último.

## Eixos aplicáveis por bloco

Decidido por julgamento de engenharia a cada bloco (não todo eixo se aplica a todo bloco) — registrado aqui antes de auditar, não reconstruído depois.

| Bloco | Eixos que fazem sentido |
|---|---|
| 1. Modelo de dados e contratos | Arquitetura, Qualidade de Engenharia, Segurança/AppSec |
| 2. API backend síncrona | Arquitetura, Qualidade de Engenharia, Segurança/AppSec |
| 3. Pipeline assíncrono/agendado | Arquitetura, Qualidade de Engenharia, Segurança/AppSec |
| 4. Infraestrutura (Terraform) | Arquitetura, Segurança/AppSec, Qualidade de Engenharia |
| 5. Frontend público | Arquitetura, Qualidade de Engenharia, Segurança/AppSec, Conteúdo Editorial, Privacidade |
| 6. Admin SPA | Qualidade de Engenharia, Segurança/AppSec, Arquitetura |
| 7. Subsistema editorial | Engenharia de Contexto, Qualidade de Engenharia, Arquitetura |

Governança de IA não se aplica a nenhum bloco de código — é sobre o processo da própria IA, auditado separadamente (não por bloco).

## Registro de rodadas — Bloco 1 (concluído do lado Claude)

| Eixo | Status | Nota Claude | Codex |
|---|---|---|---|
| Arquitetura | A1/A2/A3 corrigidos (`ec2098b`, `59abf4a`, `9961031`) | 7.6→convergência pendente | bloqueado (rate-limit até 2026-10-03 15:20) |
| Qualidade de Engenharia | Q1/Q2 corrigidos + bug real achado e corrigido (`149bf19`) | 8.3→9.1 | bloqueado |
| Segurança/AppSec | Nenhum achado novo (já coberto pelos 2 eixos acima) | 8.9 | bloqueado |

## Registro de rodadas — Bloco 2 (concluído do lado Claude)

Eixos combinados num único documento (`block-2-api-sincrona/round1-claude-proposal.md`) por eficiência. Achados: comentário desatualizado em `cognitoJwt.ts` (corrigido), garantia central de expiração de sessão nunca testada diretamente (corrigido, `adminSessionStore.test.ts` novo). `mediaUpload`/`adminSession`/`adminAuthorizer` sem lacuna de comportamento real. Nota pós-correção: 8.9/10. Commit `31d4604`. Codex: bloqueado (mesma janela).

## Registro de rodadas — Bloco 3 (concluído do lado Claude)

Nenhum achado novo (`block-3-pipeline-assincrono/round1-claude-proposal.md`) — `postScheduler`/`postCounterReconciler`/`imageProcessor` já bem cobertos por rodadas de auditoria anteriores (histórico em `docs/backlog.md`). Resultado honesto, sem correção aplicada. Nota: 8.7/10.

## Registro de rodadas — Bloco 4 (parcial, amostragem declarada)

`block-4-infraestrutura/round1-claude-proposal.md` — IAM/CloudTrail/GuardDuty/CSP verificados por amostragem dirigida a risco, sem achado novo (CSP `unsafe-inline` já é decisão documentada, não lacuna). 6 dos 10 módulos não lidos linha a linha nesta rodada (declarado, não omitido) — nota geral não calculada por amostra insuficiente.

## Registro de rodadas — Bloco 5 (parcial, amostragem declarada)

`block-5-frontend-publico/round1-claude-proposal.md` — achado real de **verificação, não de bug**: `joint-review-criteria.md` afirmava que o Google Analytics "já gatilha" por opt-in e que o `ContactForm` "já coleta dado pessoal" — ambas escritas sem ler a lógica completa. Real: `loadScriptsByConsent()` tem o carregamento do GA inteiramente comentado (placeholder), e `submitContact()` é um mock explícito sem persistência. Corrigido nos próprios critérios. Amostra dirigida a consentimento/contato/privacidade, não ao bloco inteiro (SEO/performance/design system não lidos).

## Registro de rodadas — Bloco 6 (concluído do lado Claude)

`block-6-admin-spa/round1-claude-proposal.md` — nenhum achado novo (`stores/auth.ts`/`services/api.ts`/router já consistentes com o BFF auditado no Bloco 2, cobertura de teste já real). Nota: 8.8/10.

## Registro de rodadas — Bloco 7 (concluído do lado Claude)

`block-7-subsistema-editorial/round1-claude-proposal.md` — nenhum achado novo; subsistema já passou por 2 rodadas de revisão cega via Codex CLI fora deste protocolo, na mesma sessão de trabalho (contexto declarado, não escondido). Nota: 8.7/10.

## Todos os 7 blocos concluídos do lado Claude

Pendência única e comum a todos: a crítica cruzada real do Codex, bloqueada por rate-limit até 2026-10-03 15:20. Nenhum bloco pode ser considerado convergido pelo protocolo completo (`CLAUDE.md` §11) até essa rodada acontecer.
