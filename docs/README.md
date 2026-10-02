# Documentação do projeto

Mapa de autoridade da documentação. Cada informação tem uma única fonte canônica — outros documentos apontam para ela via link, nunca copiam o conteúdo integralmente.

## Onde encontrar cada informação

| Preciso saber... | Consulte... |
|---|---|
| O objetivo do produto | `product/vision.md` |
| Como o sistema funciona | `architecture/system-overview.md` |
| Por que uma decisão foi tomada | `engineering/decisions/` |
| Quais experimentos foram feitos | `engineering/experiments/` |
| Quais padrões técnicos seguir (princípios, código, testes, IA, Git) | `engineering/standards/` |
| Quando o protocolo de debate Claude↔Codex é obrigatório | `engineering/standards/change-risk-scale.md` |
| Critérios de revisão conjunta Claude↔Codex, por eixo | `engineering/standards/joint-review-criteria.md` |
| Governança de IA (matriz de autoridade, incidentes) | `engineering/standards/ai-governance.md` |
| Como operar o sistema (ambientes, deploy, problemas conhecidos) | `operations/` |
| O que está pendente | `backlog.md` |
| Regras específicas de um componente | `frontend/README.md`, `backend/README.md`, `admin/README.md`, `infra/README.md` |
| Design system do frontend | `../frontend/docs/design-system.md` |
| Pipeline de imagens | `../frontend/docs/image-pipeline.md` |
| SEO | `../frontend/docs/seo.md` |
| Aprendizados históricos para o livro | `book/cases/` |
| Padrões extraídos de vários casos | `book/syntheses/` |
| Protocolo de captura de aprendizado | `book/capture-protocol.md` |
| Metodologia de auditoria de consistência do projeto | `engineering/audits/project-consistency-audit.md` |
| Relatórios e snapshots de auditorias anteriores | `engineering/audits/reports/`, `engineering/audits/snapshots/` |
| Prompts de engenharia reutilizáveis ou históricos | `engineering/prompts/` |
| Pacotes de instrução para uma mudança específica (work items) | `engineering/work-items/` |
| Planejamentos editoriais do blog (pauta/outline) | `../editorial/plans/` |
| Evidência ligada a um estudo de caso específico | `book/cases/evidence/CASE-NNN/` |
| Arquivo histórico ainda sem classificação | `archive/unclassified/` (área de triagem temporária, não destino permanente) |

## Política de fonte canônica

1. Toda informação relevante tem uma fonte canônica identificável.
2. Arquivos secundários usam links, não cópias.
3. `CLAUDE.md` aponta para detalhes, não os reproduz.
4. `.project-context.md` registra somente o necessário para continuidade da próxima sessão.
5. Informação histórica (`book/cases/`, Git) nunca é apresentada como estado atual.
6. Fatos deriváveis do código, lockfiles, Terraform ou workflows não são mantidos manualmente em documentação.
7. Quando houver conflito, a fonte canônica prevalece e a duplicação é removida.

Ver `CLAUDE.md`, seção "Regra de manutenção do CLAUDE.md", para o critério de o que pertence à constituição operacional versus a estas fontes.
