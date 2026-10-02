# Bloco 6 — Admin SPA — Rodada 1 completa (proposta independente, Claude)

**Escopo**: todo `admin/src/{stores,services,router,composables,components,views}` lido por completo ou varrido por grep dirigido (Tiptap toolbar/menu UI de baixo risco para os 3 eixos avaliados, confirmado sem uso de base64/API direta). Eixos: Qualidade de Engenharia, Segurança/AppSec, Arquitetura.

## Achados corrigidos (3 bugs reais)

### B1 — `sanitizeHtml.ts` (admin): gap de esquema de URI (já documentado na Rodada 1 anterior)

Ver `docs/book/cases/CASE-008`. Commit `31a23c3`.

### B2 — `bulkPublish()` nunca funcionava

`DashboardView.vue` chamava `postsApi.update(slug, { status: 'Publicado' })` sem `version` — campo obrigatório em `updatePostInputSchema` (`packages/contracts/src/post.ts:165`, sem `.optional()`). Toda tentativa de publicação em massa retornava 400 do backend. Bug real, reproduzível, não teórico — `DashboardView.vue` não tinha nenhum teste. Corrigido usando o mesmo fallback `?? 0` que `bulkDelete()` já usava corretamente. Commit `1492e5e`.

### B3 — `allowBase64: true` no editor causava perda silenciosa de imagem

Confirmado com teste direto contra a função real `sanitize-html` (não suposição): uma imagem colada/arrastada no editor (Tiptap embute como `data:` URI quando `allowBase64: true`) tem o `src` removido silenciosamente pelo sanitizador do backend ao salvar (`ALLOWED_SCHEMES` não inclui `data:`) — a tag `<img>` sobrevive sem `src`, a imagem fica quebrada no post publicado, sem nenhum erro mostrado ao autor. `ImageNode.vue` não trata esse caso. Corrigido desabilitando `allowBase64`, forçando todo upload pelo pipeline real (S3 presigned + `imageProcessor`). Commit `b2afc12`.

## Verificado sem achado novo

- **`stores/auth.ts`/`services/api.ts`/`router/`**: já cobertos na Rodada 1 anterior deste bloco — BFF consistente, sem `Authorization` header, caminho sempre relativo.
- **`LoginView.vue`**: fluxo simples, delega toda validação ao Cognito/backend; rate limit de login já garantido na infra (Bloco 2/4).
- **`UploadModal.vue`**: validação de tipo/tamanho client-side espelha a validação server-side já auditada (`mediaUpload`), defesa em profundidade correta, não redundância inútil.
- **`usePostForm.ts`** (362 linhas, lido por completo): tratamento cuidadoso de concorrência otimista, race de criação dupla, sincronização de versão pós-save — nenhum problema encontrado, nível de cuidado já alto.
- **`CategoriesView.vue`/`AuthorEditView.vue`**: CRUD direto, sem problema de validação ou de fluxo.
- **Composables** (`useToast`, `useEditorOutline`, `useDrawerFocusTrap`, `useEditableTitleSubtitle`): lidos por completo, lógica pequena e correta.
- **Extensões Tiptap** (`PullQuote.ts`, `ClosingFlourish.ts`): uso padrão e seguro da API de node spec do ProseMirror (array, não string), sem vetor de injeção.
- **Varredura de padrão de risco** (`v-html`, `innerHTML`, `localStorage`, `document.cookie`, base64, chamada de API direta) em todo o restante dos componentes Tiptap/toolbar: sem ocorrência além do já corrigido.

## Avaliação por critério

| Eixo | Critério | Nota |
|---|---|---:|
| Qualidade de Engenharia | Code Correctness & Defensive Design | 7.0 → 9.0 após B2/B3 (2 bugs funcionais reais corrigidos) |
| Qualidade de Engenharia | Test Effectiveness & Coverage Discipline | 6.5 — `DashboardView.vue` e `useTiptapExtensions.ts` ainda sem nenhum teste; `@vue/test-utils` não está configurado no projeto, lacuna estrutural real, não só pontual |
| Segurança/AppSec | Sanitização de Conteúdo & Prevenção de XSS | 9.0 após B1/B3 |
| Arquitetura | Security & Privacy by Design | 9.0 |

**Nota geral: 8.4/10** — 3 bugs reais corrigidos, mas a lacuna de cobertura de teste para componentes `.vue` (sem `@vue/test-utils`) é estrutural e não foi fechada nesta rodada — candidato real a item de follow-up.

## Commits

`31a23c3`, `1492e5e`, `b2afc12`.
