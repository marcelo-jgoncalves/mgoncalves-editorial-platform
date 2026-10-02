# Tiers de gate de qualidade

Dá nome explícito ao que o pipeline deste projeto já faz, para que "está testado" tenha um significado único em vez de ambíguo entre "passou o lint" e "foi verificado contra o ambiente real". Adaptado do padrão equivalente do `expiration-tracker`, simplificado para a realidade deste projeto: não há um tier manual de sandbox AWS separado, porque o próprio pipeline de deploy já verifica contra o ambiente real automaticamente a cada push em `develop`.

## Tier A — toda PR (`Pull Request Validation (CI)`, `.github/workflows/deploy.yml`, bloqueia merge)

`typecheck`, lint (ESLint), testes unitários (Jest/Vitest) de `backend`/`frontend`/`admin`/`packages/contracts`, testes de integração do backend contra DynamoDB Local (`test-backend-integration`), `npm audit --audit-level=high` por workspace, `terraform fmt`/`validate`/TFLint/Trivy config scan (quando há `.tf` tocado), validação de schema/lifecycle dos planos editoriais (quando aplicável).

**Vermelho aqui bloqueia merge, sem exceção.**

## Tier B — push em `develop` / deploy real (`Deploy Pipeline (CD)`, `.github/workflows/cd.yml`)

Repete os checks do Tier A (`cd.yml` não assume que o PR de origem rodou tudo) + Semgrep/Gitleaks (`security-scans`) + `terraform apply` real contra a conta `dev` + smoke test pós-deploy (curl nas rotas públicas/API + Playwright `e2e/smoke.spec.ts` contra o ambiente real recém-deployado).

**Vermelho aqui bloqueia o deploy** — o merge em `develop` já aconteceu, mas o estado publicado em `dev` não avança até o pipeline corrigir ou um push novo resolver.

## Regra de bloqueio

- Tier A vermelho: PR não mergeia.
- Tier B vermelho: `develop` teve merge, mas o ambiente `dev` não reflete a mudança — não declarar uma mudança "no ar" sem confirmar que o `Deploy Summary` do job `deploy-dev` rodou verde.
- Nenhuma mudança de nível 5-6 (`change-risk-scale.md`) é considerada validada só por Tier A verde quando o risco real está em comportamento só observável contra o ambiente publicado (ex. CSP, CORS, SigV4 de CloudFront) — aguardar o Tier B antes de fechar a tarefa.

## Política de exceção de vulnerabilidade

Toda exceção de `npm audit`/Trivy sem correção imediata precisa de dono, data de criação e data de expiração explícitas, registrada no PR ou em `docs/backlog.md` — uma exceção sem prazo de expiração não é uma exceção documentada, é uma vulnerabilidade escondida.
