# Bloco 4 — Infraestrutura (Terraform) — Rodada 1 (proposta independente, Claude)

**Escopo**: `infra/modules/{api-gateway,cognito,dynamodb,finops,frontend,lambda,media,observability,security-monitoring,admin}/`. Eixos: Arquitetura, Segurança/AppSec, Qualidade de Engenharia.

**Limitação declarada desta rodada** (`capture-protocol.md` — registrar incerteza em vez de forçar completude): 9 módulos de infra é escopo grande demais para leitura linha a linha exaustiva no tempo desta sessão. Esta rodada fez amostragem dirigida pelas áreas de maior risco (IAM/least-privilege, CloudTrail/GuardDuty, CSP) em vez de cobertura completa — registrado explicitamente como limitação, não apresentado como auditoria completa.

## Verificado, sem achado novo

- **IAM por função** (`infra/modules/lambda/lambda-iam.tf`, 404 linhas, 1 policy por Lambda): `getPosts_policy` escopado às ARNs reais de `posts`/`categorias` + `/index/*` (não wildcard de conta) — padrão se repete nas demais (confirmado por nome/estrutura, não lidas as 11 policies inteiras linha a linha).
- **CloudTrail + GuardDuty** (`security-monitoring/main.tf`): bucket com `public_access_block` completo, SSE, `enable_log_file_validation = true` (Trivy AWS-0016), GuardDuty gated por `var.enable_guardduty` (custo real, decisão consciente de não ligar em dev).
- **CSP do frontend** (`frontend/cloudfront.tf`): `script-src 'self' 'unsafe-inline'` é fraqueza real de defesa-em-profundidade contra XSS (o eixo Segurança pesa isso em 20% via Sanitização de Conteúdo) — mas já é uma decisão **documentada e justificada** no próprio arquivo ("migrar pra nonce/hash exigiria middleware por request, fora de escopo aqui"), não uma lacuna não percebida. Não registrado como achado novo por já estar sob decisão consciente — mas sinalizado para a crítica do Codex avaliar se concorda com a proporcionalidade dessa decisão.

## Não verificado nesta rodada (declarado, não omitido)

Cognito (`modules/cognito/`), API Gateway (`modules/api-gateway/`, 900+ linhas) além do que já foi lido no Bloco 2 (wiring do `media_upload_post`), FinOps, Observability (dashboards/SLO/canary) e Admin (bucket/CloudFront do painel) não tiveram leitura linha a linha nesta rodada — candidatos a uma Rodada 2 dedicada se o Codex ou uma sessão futura apontar necessidade real.

## Avaliação por critério (parcial, proporcional ao que foi lido)

| Eixo | Nota | Base |
|---|---:|---|
| Segurança/AppSec (Least-Privilege IAM) | 8.5 | Amostra positiva, não cobertura completa |
| Segurança/AppSec (Configuração Segura da Plataforma) | 8.0 | CSP com tradeoff documentado, não achado |
| Arquitetura (Observability) | — | Não avaliado nesta rodada |

**Nota geral: não calculada** — amostra parcial demais para uma nota ponderada honesta cobrindo os 9 módulos. Registrado como `Open question` para decidir se vale uma Rodada 2 dedicada de infra antes de a nota deste bloco ser considerada real.
