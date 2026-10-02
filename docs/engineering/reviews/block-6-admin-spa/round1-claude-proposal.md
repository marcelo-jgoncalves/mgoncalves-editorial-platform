# Bloco 6 — Admin SPA — Rodada 1 (proposta independente, Claude)

**Escopo**: `admin/src/{stores/auth.ts,services/api.ts,router/}` priorizados (autenticação/sessão, mesmo corte de risco do Bloco 2). Eixos: Qualidade de Engenharia, Segurança/AppSec, Arquitetura.

## Resultado: nenhum achado novo

- **`stores/auth.ts`**: senha nunca sai do Amplify (SRP client-side); idToken trocado por sessão opaca e descartado (`signOut()` chamado logo após); nenhuma chamada da API usa `Authorization`, só `credentials: 'include'` — consistente com o BFF já auditado no Bloco 2.
- **`services/api.ts`**: caminho sempre relativo (nunca a URL absoluta do API Gateway — comentário explica por que isso quebraria o cookie em CORS cross-origin), 401/403 tratados como equivalentes (mesmo raciocínio do `adminAuthorizer`), mensagem de erro mascarada em produção (`import.meta.env.PROD`) sem esconder o `status` (necessário para o caller reagir a 409 de concorrência).
- **`router/`**: guarda de rota client-side chama `checkSession()` real (GET `/admin/session`) antes de decidir, não confia em estado client-side sozinho — enforcement real continua sendo o `adminAuthorizer` server-side, isso é só UX (evita flash de conteúdo protegido).
- **Cobertura de teste**: 17 testes em `api.test.ts`, 9 em `auth.test.ts` — já cobrem os casos de borda relevantes (401/403, mascaramento de erro em prod).

## Avaliação por critério (resumida)

| Eixo | Nota |
|---|---:|
| Segurança/AppSec (Autenticação & Sessão) | 9.0 |
| Qualidade de Engenharia (Test Effectiveness) | 8.5 |
| Arquitetura (Security by Design) | 9.0 |

**Nota geral: 8.8/10** — nenhuma correção aplicada, resultado honesto.
