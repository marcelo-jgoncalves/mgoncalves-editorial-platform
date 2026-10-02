# Divisão em blocos — Auditoria do eixo Arquitetura

Divisão da aplicação em blocos logicamente auditáveis para a primeira auditoria completa do eixo Arquitetura (`docs/engineering/standards/joint-review-criteria.md` §"Eixo: Arquitetura"), via protocolo de debate Claude↔Codex (`CLAUDE.md` §11). Cada bloco é auditado de forma independente, um de cada vez, até convergência (≥9.0 cego dos dois lados, sem arredondar) ou impedimento registrado que trave a nota.

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

## Registro de rodadas

Cada bloco tem sua própria subpasta (`block-N-<nome>/`) com os artefatos de cada rodada: proposta independente de Claude, prompt e saída do Codex, convergência, notas cegas. Resultado final de cada bloco é resumido na tabela abaixo.

| Bloco | Status | Nota final (Claude / Codex) | Rodadas |
|---|---|---|---|
| 1. Modelo de dados e contratos | em andamento | — | — |
| 2. API backend síncrona | pendente | — | — |
| 3. Pipeline assíncrono/agendado | pendente | — | — |
| 4. Infraestrutura (Terraform) | pendente | — | — |
| 5. Frontend público | pendente | — | — |
| 6. Admin SPA | pendente | — | — |
| 7. Subsistema editorial | pendente | — | — |
