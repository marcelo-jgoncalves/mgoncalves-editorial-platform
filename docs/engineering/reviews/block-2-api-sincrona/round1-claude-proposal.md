# Bloco 2 — API backend síncrona — Rodada 1 (proposta independente, Claude)

**Escopo**: `backend/src/functions/{adminAuthorizer,adminAuthors,adminCategories,adminPosts,adminSession,getAuthor,getPost,getPosts,mediaUpload}/`. Eixos avaliados juntos neste documento (Arquitetura, Qualidade de Engenharia, Segurança/AppSec) por eficiência — a maior parte do escopo já foi lida a fundo no Bloco 1 (que corrigiu os pontos de validação de dado destes mesmos handlers); este bloco foca no que o Bloco 1 não cobriu: a camada de autenticação/sessão (`adminAuthorizer`, `adminSession`) e `mediaUpload`.

## Achados

### S1 — Comentário desatualizado em `cognitoJwt.ts` (corrigido)

Afirmava uso em 2 lugares (`adminSession` + fallback Bearer em `adminAuthorizer`); `adminAuthorizer` já tinha removido esse fallback (confirmado pelo próprio comentário do arquivo e por um teste que afirma isso explicitamente). `grep` confirmou só 1 uso real. Corrigido.

### S2 — Garantia central de expiração de sessão nunca testada diretamente (corrigido)

`adminSessionStore.getSession()` existe especificamente para não confiar no TTL do DynamoDB (best-effort, até 48h de atraso) — mas nenhum teste cobria o cenário que essa checagem manual resolve (item com `expires_at` no passado, ainda fisicamente presente na tabela). O teste do `adminAuthorizer` só cobria "item não existe". Novo `adminSessionStore.test.ts` testa a corrida diretamente.

## Avaliação do restante do bloco (sem achado novo)

- **`mediaUpload`**: allowlist de `Content-Type`, `content-length-range` via presigned POST (não `getSignedUrl`, que não suporta condição de tamanho), sanitização de nome de arquivo contra path traversal, e confirmado via Terraform (`infra/modules/api-gateway/main.tf:406-412`) que a rota exige `authorization = "CUSTOM"` com o mesmo `admin_cookie_auth` — nenhuma lacuna encontrada.
- **`adminSession`**: cookie `HttpOnly; Secure; SameSite=Strict`, sessão opaca (JWT nunca chega ao cliente como cookie), SRP continua 100% client-side (senha nunca chega ao Lambda) — desenho consistente com o BFF documentado.
- **`adminAuthorizer`**: `Deny` (nunca lança) em qualquer credencial ausente/inválida, cookie é a única via aceita — comportamento já teria sido testado antes desta rodada.
- **Handlers de dado** (`adminPosts`, `adminAuthors`, `adminCategories`, `getPost`, `getPosts`, `getAuthor`): já tiveram validação de fronteira e cobertura de teste tratadas a fundo no Bloco 1 — não reavaliados aqui para não duplicar achado.

## Avaliação por critério (eixos combinados, só os aplicáveis)

| Eixo | Critério mais relevante | Nota |
|---|---|---:|
| Segurança/AppSec | Autenticação & Sessão do Admin | 8.5 (S1/S2 eram lacunas de prova, não de comportamento — comportamento real já estava correto) |
| Segurança/AppSec | Validação de Entrada & Fail-Closed (`mediaUpload`) | 9.0 |
| Qualidade de Engenharia | Test Effectiveness & Coverage Discipline | 8.0 → 9.0 após S2 |
| Qualidade de Engenharia | Documentation Quality & Drift Control | 7.5 → 9.0 após S1 |
| Arquitetura | Security & Privacy by Design | 9.0 (BFF, cookie httpOnly, SRP client-side — decisões de arquitetura já nascem seguras) |

**Nota geral pós-correção: 8.9/10**

## Commit

`31d4604`.
