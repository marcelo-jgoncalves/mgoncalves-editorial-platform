# Escala de risco de mudança

Régua concreta para decidir, sem depender de julgamento ad-hoc repetido a cada tarefa, quando uma mudança exige o protocolo de debate Claude↔Codex (`CLAUDE.md` §11) em vez de implementação direta. Adaptado (não copiado) do padrão equivalente usado no projeto irmão `expiration-tracker`, recalibrado para a complexidade real deste projeto: site de conteúdo/consultoria com subsistema editorial, sem multi-tenancy, sem dado pessoal sensível de usuário final além de formulário de contato.

| Nível | Exemplo neste projeto | Exige |
|---|---|---|
| 1 — Cosmético | Typo em comentário, formatação, token de cor/espaçamento, nome de variável local | Nada além do lint normal |
| 2 — Correção mecânica | Bug de teste, ajuste de import, versão de dependência sem mudança de comportamento, extrair componente duplicado sem mudar comportamento visível | Branch + PR normal (`git-and-review-workflow.md`), sem debate |
| 3 — Implementação de decisão já aprovada | Aplicar um componente/variante de design system já aprovado a uma tela nova, escrever handler que implementa um schema já fechado, migrar plano editorial para `schema_version` já definida | Julgamento de engenharia direto; judgment call não previsto registrado em `.project-context.md` |
| 4 — Judgment call de baixo risco/alta reversibilidade | Escolha de lib não crítica, nome de variável de ambiente, heurística interna sem contrato externo, ajuste de cache CloudFront não relacionado a segurança | Julgamento de engenharia direto + nota do porquê no PR |
| 5 — Muda contrato/schema, fronteira de módulo, política de segurança, ou é difícil de reverter | Novo campo/schema em `Post`/`Categoria`/`Autor` (`packages/contracts`), mudança de GSI do DynamoDB, novo endpoint público, mudança de CSP/CORS, nova regra do schema do subsistema editorial, novo fornecedor externo com acesso a dado do site | **Protocolo Claude↔Codex obrigatório** (`CLAUDE.md` §11), mínimo 3 rodadas, nota ≥9.0 de ambos, sem arredondar |
| 6 — Decisão arquitetural formal | Troca de stack (IaC, framework de frontend, provedor de hospedagem), mudança de modelo de dado fundamental do DynamoDB single-table, novo domínio de risco (autenticação de usuário final, pagamento, dado pessoal novo) | Protocolo Claude↔Codex **+ ADR** em `docs/engineering/decisions/` |

## Regra prática

Em caso de dúvida entre dois níveis adjacentes, tratar como o nível mais alto — o custo de uma rodada extra de debate é sempre menor que o custo de uma decisão nível 5-6 tomada sem revisão independente.

Isso não substitui o bom senso de engenharia de `CLAUDE.md` §2/§11 — é uma referência para calibrar esse julgamento de forma consistente entre sessões, não um sistema de pontuação a ser seguido cegamente.
