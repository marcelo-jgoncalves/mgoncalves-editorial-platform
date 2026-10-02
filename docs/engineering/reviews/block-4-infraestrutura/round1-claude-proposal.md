# Bloco 4 — Infraestrutura (Terraform) — Rodada 1 completa (proposta independente, Claude)

**Escopo**: 8 dos 10 módulos de `infra/modules/` lidos por completo (`api-gateway` 951 linhas, `cognito`, `finops`, `observability` — dashboard/SLO/canary —, `security-monitoring` — CloudTrail/GuardDuty —, `admin` — S3/CloudFront —, mais `dynamodb` e `media`, já cobertos por completo nos Blocos 1 e 3 respectivamente). `lambda` permanece com a política IAM amostrada por risco, não as 11 policies lidas linha a linha; `frontend/cloudfront.tf` com a seção de CSP verificada, demais recursos do módulo não relidos nesta rodada — cobertura genuinamente parcial nesses 2, declarada, não escondida. Eixos: Arquitetura, Segurança/AppSec, Qualidade de Engenharia.

## Achados corrigidos

### I1 — Comentário desatualizado em `api-gateway/main.tf` (mesma classe de S1/P1/P2)

O comentário de abertura do `aws_api_gateway_authorizer.admin_cookie_auth` ainda descrevia suporte a "Authorization Bearer (legado, mantido durante a transição)" — o fallback já tinha sido removido do código do `adminAuthorizer` (achado do Bloco 2). Terceira ocorrência do mesmo padrão de comentário não sincronizado com o código real nesta auditoria (depois de `cognitoJwt.ts` no Bloco 2 e das afirmações de GA/contato no Bloco 5) — reforça o princípio generalizável já registrado em `CASE-008` §14.

### I2 — `/admin/autores` (plural): recurso órfão no API Gateway

Declarado com o comentário "(plural - for create/list)", mas nenhum método/integração foi conectado a ele em lugar nenhum do arquivo. Confirmado contra o resto do código: a UI do admin não tem funcionalidade de listagem de autores (`AUTHOR_ID` fixo em `usePostForm.ts`/`AuthorEditView.vue`), e `authorsApi` (admin/src/services/api.ts) não tem `.list()`. Não é risco de segurança (API Gateway responde "Missing Authentication Token" padrão, igual a qualquer path não definido) — é infraestrutura morta ou scaffolding esquecido. Comentário corrigido para não afirmar uma funcionalidade que não existe; decisão de manter ou remover o recurso em si fica para Marcelo (mudança de infra, não só documentação).

## Verificado sem achado novo

- **Cognito**: política de senha 12 chars + complexidade (compensação documentada pela ausência de MFA, decisão já tomada em auditoria anterior), `ALLOW_USER_PASSWORD_AUTH` já removido, só SRP + refresh token, nenhum auto-cadastro.
- **FinOps**: SNS com KMS gerenciado, budget via console manual documentado (limitação real do provider Terraform, não omissão).
- **Admin (S3+CloudFront)**: bucket privado com OAC, versionamento habilitado, headers de segurança reais via resposta HTTP (não meta tags, que não funcionam para X-Frame-Options/HSTS), CSP com `unsafe-inline` em `style-src` justificado por dependência real do Tiptap/Tippy.js — mesma classe de decisão documentada do Bloco 4 anterior (frontend), não achado novo.
- **API Gateway** (951 linhas completas): todo endpoint `/admin/*` real (exceto `/admin/session`, que valida por dentro do handler, com razão documentada) usa `authorization = "CUSTOM"` consistentemente; CORS preflight unificado via `for_each` com `moved` blocks preservando estado; rate limit mais apertado no login (5 rps/10 burst) contra o throttle geral (100/200); trigger de redeploy via hash do arquivo inteiro (evita o bug documentado de esquecer um recurso na lista antiga).
- **Observability**: alarmes de burn-rate seguem o padrão real do Google SRE Workbook (multiwindow, multi-burn-rate, composite alarm evitando flapping), `treat_missing_data` escolhido corretamente em direções opostas para os dois casos (SLO de tráfego: `notBreaching` quando não há tráfego; canary: `breaching` quando o heartbeat não reporta — ausência de dado de monitoramento ativo é, em si, uma falha). Canary IAM escopado ao necessário, bucket de artefatos privado.
- **Security-monitoring**: CloudTrail com validação de arquivo de log habilitada, bucket com bloqueio público completo, GuardDuty gated por custo.

## Avaliação por critério

| Eixo | Critério | Nota |
|---|---|---:|
| Segurança/AppSec | Least-Privilege IAM | 9.0 |
| Segurança/AppSec | Configuração Segura da Plataforma | 8.5 |
| Qualidade de Engenharia | Documentation Quality & Drift Control | 8.0 (I1/I2 corrigidos, 3ª ocorrência do padrão de drift) |
| Arquitetura | Observability & Operability | 9.0 |
| Arquitetura | Architecture Governance & Traceability | 8.0 (I2, infra não rastreada a nenhuma decisão de produto) |

**Nota geral: 8.6/10** — 2 achados reais corrigidos (documentação), nenhum achado de segurança ativa.

## Commit

A ser referenciado no commit desta correção.
