---
status: active
owner: engineering
authority: normative
---

# Critérios de revisão conjunta Claude↔Codex, por eixo

Fonte única dos critérios de avaliação (nome, peso, definição) usados nas revisões conjuntas Claude↔Codex (`CLAUDE.md` §11). Achados de uma execução específica do protocolo (ex. uma proposta Rodada N de um PR) registram evidência de uma revisão pontual — nunca redefinem ou duplicam a tabela de pesos; apenas linkam para a seção correspondente aqui.

Adaptado (não copiado) do padrão equivalente do projeto irmão `expiration-tracker` — mesmas fontes normativas de origem (ISO/IEC 25010, AWS Well-Architected, ATAM, literatura de context engineering para dev assistido por IA), mas com **7 eixos** em vez de 9: este projeto não é multi-tenant e não tem obrigação contratual/jurídica de terceiro operando ainda — os eixos de Governança Jurídica/Contratual e Produto Multi-tenant do projeto irmão não têm correspondente proporcional aqui (`engineering-principles.md` — YAGNI). O eixo de produto do projeto irmão é substituído por um eixo próprio de conteúdo editorial, que é a unidade de risco real deste projeto.

**Privacidade não foi eliminada, foi recalibrada (achado real, 2026-10-02, ver `docs/book/cases/CASE-008-...md`)**: a primeira versão deste documento cortou o eixo de Privacidade/LGPD do projeto irmão assumindo "sem dado pessoal sensível em volume". Pesquisa externa (LGPD aplica-se a qualquer tratamento de dado pessoal independente do porte da empresa — a única flexibilização real para pequena empresa é a dispensa de nomear DPO formal) e inspeção direta do código (`frontend/components/consent/{ConsentBanner,ConsentModal}.tsx` já gatilha Google Analytics por opt-in real, `frontend/app/{politica-de-privacidade,politica-de-cookies,termos-de-uso}` já existem, `ContactForm.tsx` já coleta dado pessoal) mostraram que a premissa estava errada: a superfície de conformidade já existe e implementada, só não era auditada por nenhum dos 6 eixos. Um eixo próprio, proporcional (4 critérios, não os 8 do projeto irmão desenhados para uma SaaS com DSR/RIPD/subprocessador em escala), foi adicionado — ver "Eixo: Privacidade e Conformidade de Dados do Visitante" abaixo.

Cada eixo evolui apenas se o próprio critério se mostrar mal calibrado em uso real — registrar por que, junto com a mudança, sem reabrir a cada nova revisão sobre o mesmo eixo.

**Eixos formalizados (7)**: Arquitetura, Qualidade de Engenharia, Engenharia de Contexto, Segurança da Informação e AppSec, Governança de IA, Conteúdo Editorial e Experiência do Visitante, Privacidade e Conformidade de Dados do Visitante.

---

## Eixo: Arquitetura

| # | Critério | Peso | Definição |
|---:|---|---:|---|
| 1 | Domain Fit & Simplicity | 14% | A solução usa o mecanismo mais simples que resolve o problema real deste projeto (`engineering-principles.md`), sem sofisticação antecipada. |
| 2 | Data Model & Consistency | 16% | Coerência entre as 4 tabelas DynamoDB (`posts` com 5 GSIs, `autores`, `categorias`, `admin-sessions` — não é um desenho single-table), os contratos de schema (`packages/contracts`) e o schema dos planos editoriais; mudança de chave/GSI/schema é tratada como nível 5-6 (`change-risk-scale.md`). Inclui consistência do rigor de validação em runtime na fronteira entre os diferentes contratos. |
| 3 | Reliability & Fault Recovery | 12% | Comportamento sob falha de dependência externa (DynamoDB, S3, CloudFront, API Gateway) — retry/backoff já aplicado em `getPost()` é o precedente a seguir, não uma exceção. |
| 4 | Security & Privacy by Design | 14% | Decisões de arquitetura já nascem considerando CSP/CORS/IAM, não como camada adicionada depois. |
| 5 | Modifiability & Evolvability | 12% | Fronteira de módulo clara (`backend/src/functions/*`, `frontend/{app,components,lib}`, `admin/src/*`, `packages/contracts`) barata de estender sem reescrever. |
| 6 | Observability & Operability | 10% | Diagnóstico de falha real possível via CloudWatch/logs estruturados, sem depender de reprodução manual. |
| 7 | Cost & Resource Governance | 8% | Decisão de infra considera custo real (ex. throttle de API Gateway, concorrência reservada) antes de escalar capacidade. |
| 8 | Testability & Delivery Safety | 8% | Design permite prova via Tier A/B (`quality-gate-tiers.md`) sem depender só de verificação manual. |
| 9 | Architecture Governance & Traceability | 6% | Decisão nível 5-6 rastreável a um ADR ou registro equivalente em `docs/engineering/decisions/`. |

## Eixo: Qualidade de Engenharia

Craft de código, disciplina de testes, rigor de CI, tooling, disciplina de documentação/processo — não redecide design de sistema (eixo de Arquitetura).

| # | Critério | Peso | Definição |
|---:|---|---:|---|
| 1 | Code Correctness & Defensive Design | 14% | Validação explícita, tratamento de falha, ausência de corrupção silenciosa de dado publicado. |
| 2 | Test Effectiveness & Coverage Discipline | 16% | Evidência crível de unit/integration focada em risco real (ex. contrato DynamoDB real via Tier A), não só contagem de linha coberta. |
| 3 | CI Quality Gates & Merge Safety | 12% | Enforcement determinístico dos checks obrigatórios (`quality-gate-tiers.md`), sem bypass informal. |
| 4 | Type Safety & Static Analysis | 10% | Uso efetivo de TypeScript estrito, ESLint, validação de schema contra dado real do DynamoDB. |
| 5 | Readability, Consistency & Maintainability | 10% | Código coeso, DRY/KISS/YAGNI aplicado com julgamento (`engineering-principles.md`), barato de modificar. |
| 6 | Delivery, Release & Recovery Discipline | 10% | Deploy real reproduzível (`cd.yml`), rollback possível, smoke test pós-deploy prova o caminho crítico. |
| 7 | Dependency & Supply-Chain Hygiene | 8% | Lockfile único, actions pinadas por SHA, `npm audit` triado com prazo de expiração explícito. |
| 8 | Debuggability & Operational Feedback | 6% | Erros acionáveis, logs suficientes para investigar falha sem acesso ao ambiente de produção real. |
| 9 | Documentation Quality & Drift Control | 8% | Documentação canônica (`docs/README.md`) e processo claros, com rigor proporcional a projeto solo — sem drift entre o que o doc diz e o que o código faz. |
| 10 | Technical-Debt Practice | 6% | Atalho registrado com dono e gatilho de reavaliação concreto, nunca "revisar depois" vago. |

## Eixo: Engenharia de Contexto

Avalia a qualidade do próprio sistema de documentação/contexto do projeto — não código, não arquitetura de sistema (eixos distintos, já cobertos acima).

| # | Critério | Peso | Definição |
|---:|---|---:|---|
| 1 | Canonicalidade, Autoridade & Não-Duplicação | 18% | Cada fato normativo tem exatamente uma fonte de verdade (`docs/README.md` §"Política de fonte canônica"); derivados referenciam em vez de copiar. |
| 2 | Clareza de Papéis & Proporcionalidade | 12% | Cada documento tem propósito/escopo/autoridade inequívocos, sem sobreposição relevante, proporcional ao tamanho real do projeto. |
| 3 | Context Routing & Progressive Disclosure | 16% | `CLAUDE.md` §3 permite carregar o menor conjunto suficiente de contexto por tipo de tarefa, sem exigir leitura de todo `docs/`. |
| 4 | Correspondência com a Realidade & Controle de Drift | 16% | `.project-context.md` e `docs/backlog.md` refletem o estado real (confirmado por `project-consistency-audit`), não a intenção desatualizada. |
| 5 | Lifecycle, Proveniência & Evolução do Conhecimento | 12% | Documentação histórica (`book/cases/`, `docs/archive/`) nunca tratada como estado atual; decisão supersedida é marcada, não apagada silenciosamente. |
| 6 | Rastreabilidade de Decisões & Triggers | 10% | Decisões caras, trabalho adiado e dívida técnica permanecem conectados, com gatilho de reavaliação verificável. |
| 7 | Higiene de Contexto & Sinal-Ruído | 8% | Só conhecimento durável é promovido a destino canônico; sem versões concorrentes ou documentos órfãos na raiz. |
| 8 | Auditabilidade do Sistema de Contexto | 8% | `project-consistency-audit` produz achados com lifecycle claro (aberto/corrigido/adiado), não impressão subjetiva. |

## Eixo: Segurança da Informação e AppSec

Avalia confidencialidade/integridade/disponibilidade do site e do admin diante de abuso intencional. Site público renderiza conteúdo rico vindo de um CMS próprio — XSS no pipeline de sanitização é o risco concreto mais próximo deste projeto, não hipotético.

| # | Critério | Peso | Definição |
|---:|---|---:|---|
| 1 | Sanitização de Conteúdo & Prevenção de XSS | 20% | Todo HTML gerado pelo editor (Tiptap) passa por `sanitize-html` com allowlist antes de ser servido publicamente; mudança no editor ou no sanitizer reabre esta avaliação. Maior peso do eixo — é o vetor mais direto de dano a um visitante real. |
| 2 | Autenticação & Sessão do Admin | 16% | Cognito JWT validado (assinatura/issuer/audience/expiração), sessão do admin não confia em claim fornecido pelo cliente. |
| 3 | Least-Privilege IAM & Contenção de Blast Radius | 14% | Cada Lambda com permissão mínima necessária (`infra/modules/lambda/`), sem grant implícito/curinga. |
| 4 | Validação de Entrada & Fail-Closed | 12% | Validação server-side por contrato Zod em toda borda (HTTP, admin); entrada inválida falha de modo fechado. |
| 5 | Configuração Segura da Plataforma | 12% | CloudFront/API Gateway/S3/Cognito com defaults seguros (CSP, CORS restrito, sem bucket público indevido). |
| 6 | Proteção de Dados & Segredos | 10% | Segredos fora de código/log/artefato; dado pessoal em trânsito/repouso protegido tecnicamente (criptografia, acesso restrito) — finalidade e minimização do dado são avaliadas no eixo de Privacidade, não duplicadas aqui. |
| 7 | Logging Seguro & Detecção | 8% | Falha de autorização/configuração produz log acionável, sem vazar detalhe interno ao cliente. |
| 8 | Dependency & Supply-Chain Security | 8% | `npm audit`, Semgrep, Gitleaks, Trivy rodando como gate real (`quality-gate-tiers.md`), não informacional. |

## Eixo: Governança de IA

Abrange Claude Code e Codex CLI construindo e operando o projeto. Avalia autoridade, supervisão, independência e proveniência — não a qualidade genérica do código gerado (eixo de Qualidade de Engenharia).

| # | Critério | Peso | Definição |
|---:|---|---:|---|
| 1 | Limites de Autoridade & Supervisão Humana | 22% | Ações permitidas/proibidas/sujeitas a decisão de Marcelo por agente, registradas em `docs/engineering/standards/ai-governance.md` §1. |
| 2 | Independência da Revisão & Segregação de Funções | 20% | Nota cega, mínimo de rodadas, mesmo agente nunca simula aprovação independente de si mesmo (`CLAUDE.md` §11) — controle central deste eixo. |
| 3 | Atribuição & Proveniência das Ações | 16% | Mudança relevante atribuível a agente/sessão/PR/decisão humana; sem autoria de IA no commit (`git-and-review-workflow.md`), mas rastreável internamente. |
| 4 | Avaliação de Correção, Limitações & Impacto | 16% | Nota alta sem evidência de arquivo:linha concreta, ou sem rodar o comando que prova o achado, não fecha rodada. |
| 5 | Proteção de Contexto no Uso de IA | 14% | Contexto enviado ao Codex limitado ao necessário para a tarefa; nenhum segredo real colado em prompt. |
| 6 | Incidentes de IA & Melhoria Contínua | 12% | Desvio real de comportamento do agente registrado em `ai-governance.md` §5 antes do fim da sessão em que ocorreu. |

## Eixo: Conteúdo Editorial e Experiência do Visitante

Avalia o conteúdo e a jornada do visitante do site — substitui o eixo de "produto multi-tenant" do projeto irmão, que não tem correspondente aqui (este projeto não tem tenants, tem posts/categorias/autores e um pipeline editorial próprio).

| # | Critério | Peso | Definição |
|---:|---|---:|---|
| 1 | Integridade do Pipeline Editorial | 22% | Planos (`editorial/plans/`) seguem o schema/lifecycle vigente (`editorial/LIFECYCLE.md`); publicação não perde nem duplica conteúdo. |
| 2 | Correção de SEO & Metadados | 16% | Metadados, sitemap, structured data corretos — falha aqui tem custo de descoberta orgânica, não só estético. |
| 3 | Performance Percebida pelo Visitante | 16% | Core Web Vitals (LCP/CLS/TBT) dentro do orçamento já estabelecido em `contexto/auditoria-performance/`. |
| 4 | Acessibilidade | 14% | Navegação por teclado, contraste, semântica — página pública é o produto em si, não uma tela interna. |
| 5 | Consistência do Design System | 14% | Componente novo reutiliza o design system existente (`frontend/docs/design-system.md`) em vez de criar variação isolada. |
| 6 | Transparência de Autoria & Confiabilidade do Conteúdo | 10% | Autoria, data e revisão de conteúdo publicado são rastreáveis — relevante para um blog de autoridade técnica. |
| 7 | Administração & Operação sob a Ótica do Autor | 8% | O admin permite ao autor publicar/corrigir/despublicar com confiança, sem comportamento surpreendente (ex. falso-409 em saves consecutivos). |

## Eixo: Privacidade e Conformidade de Dados do Visitante

Avalia a conformidade legal e a finalidade do tratamento de dado pessoal do visitante — distinto do eixo de Segurança/AppSec (que cobre a proteção técnica, criptografia e controle de acesso do mesmo dado, não duplicado aqui). Adicionado em 2026-10-02 (ver nota acima e `CASE-008`) depois de confirmar, por pesquisa externa e inspeção de código, que a superfície já existe de verdade (consentimento de cookies/analytics, política de privacidade, formulário de contato) e não tinha nenhum eixo avaliando-a.

| # | Critério | Peso | Definição |
|---:|---|---:|---|
| 1 | Consentimento Real Antes de Rastreamento | 35% | Google Analytics (`ConsentModal.tsx`) só dispara após opt-in explícito e não pré-marcado; recusar/revogar o consentimento interrompe o rastreamento de fato, não apenas oculta o banner. Maior peso do eixo — é o ponto de falha mais direto e verificável tecnicamente. |
| 2 | Política de Privacidade Corresponde ao Fluxo Real de Dado | 30% | O texto publicado em `politica-de-privacidade` descreve com precisão o que o código de fato coleta/processa/compartilha (formulário de contato, cookies, analytics, provedores terceiros) — não uma política genérica desatualizada em relação ao código. |
| 3 | Minimização e Propósito do Formulário de Contato | 20% | Dado coletado em `ContactForm.tsx` tem finalidade clara e documentada, sem campo supérfluo, sem retenção indefinida sem justificativa. |
| 4 | Canal de Direitos do Titular | 15% | Existe forma real (e divulgada) de um titular pedir acesso/correção/exclusão do próprio dado — obrigatório mesmo para pequena empresa, mesmo com a dispensa de nomear um DPO formal. |

## Como adicionar um novo eixo

Não criar a tabela de critérios dentro do primeiro doc de auditoria do eixo novo. Seguir o mesmo procedimento de convergência independente (`CLAUDE.md` §11) e, ao final, adicionar aqui uma seção nova nesse mesmo formato — o registro de auditoria referencia a seção, não a duplica.
