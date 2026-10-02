---
id: CASE-008
title: "De 9 para 6 eixos: recalibrar uma rubrica de revisão por pares ao transpô-la para um projeto com perfil de risco diferente"
summary: "Registro da decisão de reduzir os 9 eixos de joint-review-criteria.md do expiration-tracker para 6 eixos neste repositório — não por economia, mas porque 3 eixos (Privacidade/LGPD aprofundada, Governança Jurídica/Contratual, Produto Multi-tenant) não têm correspondente de risco real neste projeto, e um quarto eixo (Conteúdo Editorial) foi criado para substituir o de produto multi-tenant por uma unidade de risco que este projeto de fato tem."
date_started: 2026-10-02
date_closed: 2026-10-02
status: resolved
themes: [engenharia-de-contexto, tomada-de-decisao, qualidade-de-engenharia, revisao-por-pares-ia]
components: [processo-de-engenharia]
trigger_types: [architecture-decision, engineering-tradeoff]
related_commits: []
related_pull_requests: ["https://github.com/marcelo-jgoncalves/mgoncalves-editorial-platform/pull/29"]
related_files:
  - "../../engineering/standards/joint-review-criteria.md"
  - "../../engineering/standards/engineering-principles.md"
related_tests: []
related_pipelines: []
related_adrs: []
related_experiments: []
ai_tool: "Claude Code"
ai_model: "Claude Sonnet 5"
ai_autonomy_level: "2 — Planning"
book_potential: high
review_after: 2026-11-02
last_reviewed:
baseline_ref: not-applicable
result_ref: 812f670
evidence_files: []
---

<!--
Este caso documenta uma decisão de desenho já tomada e aprovada por Marcelo na mesma sessão.
Não é uma reconstrução de sessão anterior (diferente do CASE-005) nem uma observação de
processo em andamento (diferente do CASE-007, caso irmão desta mesma sessão) — é o registro
da decisão de calibração da rubrica em si, no momento em que ela foi tomada e questionada.
-->

# Resumo do caso

Ao transpor o protocolo de debate Claude↔Codex do `expiration-tracker` para este repositório (PR #29), a IA reduziu os 9 eixos de `joint-review-criteria.md` daquele projeto para 6 eixos aqui, substituindo o eixo de "Governança de Produto e Serviço Multi-tenant" por um eixo próprio de "Conteúdo Editorial e Experiência do Visitante" e eliminando os eixos de Privacidade/LGPD aprofundada e Governança Jurídica/Contratual/Terceiros. Marcelo questionou a redução diretamente ("Por que reduziu os eixos para apenas 6?") antes de aprová-la — o caso registra o raciocínio dado em resposta a essa pergunta, não uma justificativa reconstruída depois.

# 1. Contexto

`docs/engineering/standards/joint-review-criteria.md` do `expiration-tracker` define 9 eixos convergidos via protocolo Claude↔Codex, calibrados para um produto SaaS multi-tenant com dado pessoal sensível (CASE-006 daquele repositório documenta a calibração original). Este repositório (blog/site de consultoria) não é multi-tenant e não tem o mesmo perfil de dado pessoal — a transposição direta dos 9 eixos sem ajuste violaria o princípio 1 de `engineering-principles.md` ("sofisticação segue complexidade observada, não medo hipotético").

# 2. Problema observado

`Observed fact`: os 9 eixos do projeto irmão incluem "Privacidade e Governança de Dados" (8 critérios sobre DSR, retenção, RIPD, transferência internacional), "Governança Jurídica, Contratual e de Terceiros" (8 critérios sobre DPA, subprocessadores, termos de uso pré-lançamento) e "Governança de Produto e Serviço Multi-tenant" (8 critérios sobre lifecycle de tenant, crypto-shredding no offboarding, planos/quotas). Nenhum desses três eixos tem um correspondente de risco real neste projeto: não há múltiplos tenants, não há múltiplos fornecedores de dado de terceiro sob contrato, e o volume/sensibilidade de dado pessoal (só formulário de contato) não justifica 8 critérios dedicados.

`Human decision`: Marcelo perguntou diretamente "Por que reduziu os eixos para apenas 6?" antes de aprovar — não aceitou a redução sem explicação, forçando o raciocínio a ser tornado explícito em vez de ficar implícito na transposição.

# 3. Modelo mental inicial

Hipótese de que uma rubrica de revisão por pares não deveria ser copiada entre projetos por conveniência nem reduzida por economia de esforço — cada eixo precisa corresponder a uma classe de risco real e observável no projeto específico, o mesmo padrão de proporcionalidade que `engineering-principles.md` já aplica a mecanismo de código (ex. `TenantQuota` fixed-window em vez de sliding-window).

# 4. Hipótese inicial

Eixos sem correspondente de risco real deveriam ser removidos, não mantidos como "boilerplate" ou "futuro possível" — e um eixo removido que cobria uma dimensão de produto real (multi-tenant) deveria ser substituído por um eixo equivalente na dimensão de produto que este projeto de fato tem (conteúdo editorial), em vez de deixar essa dimensão sem cobertura nenhuma.

# 5. Alternativas consideradas

## 5.1 Manter os 9 eixos, com pesos baixos nos que não se aplicam

### Vantagens
Preserva paridade estrutural exata com o projeto irmão; nenhuma decisão de corte a defender.

### Riscos
Um eixo com peso baixo ainda aparece na rubrica como algo a avaliar a cada rodada — gera "teatro de rigor" (avaliar formalmente um critério de DSR/RIPD que não tem nenhum artefato real para examinar neste projeto) em vez de sinal real. Viola o mesmo princípio de proporcionalidade que motivou a redução.

### Motivo da rejeição
Peso baixo não resolve o problema: o custo de avaliar um eixo sem conteúdo real a cada rodada do protocolo persiste, só diluído.

## 5.2 Remover os 3 eixos sem substituto

### Vantagens
Mais simples — menos eixos, sem precisar desenhar um eixo novo.

### Riscos
A dimensão de produto/experiência do usuário final (que o eixo multi-tenant cobria no projeto irmão) é real neste projeto também — só que é outra dimensão (conteúdo editorial, SEO, performance percebida, acessibilidade). Removê-la sem substituto deixaria essa classe de risco real sem cobertura em nenhum eixo.

### Motivo da rejeição
Rejeitada parcialmente: aplicada aos dois eixos sem qualquer correspondente real (Privacidade/LGPD aprofundada, Jurídico/Contratual), mas não ao eixo de produto, que ganhou substituto.

# 6. Riscos e critérios de aceitação

## 6.1 Riscos conhecidos
- Uma classe de risco real pode ter sido descartada junto com um eixo removido, sem um substituto equivalente (ex.: nenhum aspecto de Operações/SRE sobrevive como eixo próprio — foi absorvido como critério dentro de Qualidade de Engenharia, não eliminado, mas com peso menor do que teria como eixo dedicado).
- A pergunta direta de Marcelo é, em si, o único controle de qualidade aplicado a esta decisão — não houve rodada formal do protocolo Claude↔Codex para a calibração dos eixos (diferente do projeto irmão, onde cada eixo foi convergido via protocolo completo, CASE-006).

## 6.2 Critérios de aceitação
A redução é aceita como bem calibrada se, nas primeiras auditorias reais (CASE-007, em andamento), nenhum achado real relevante ficar sem eixo nenhum para ser registrado — um achado órfão (que não se encaixa em nenhum dos 6 eixos) seria evidência de corte mal calibrado.

## 6.3 Obrigações de prova

| Mudança ou afirmação | Evidência exigida | Evidência obtida | Status |
|---|---|---|---|
| Os 3 eixos removidos não têm correspondente de risco real neste projeto | Inventário real de infra/dado (multi-tenant? LGPD? contrato de terceiro?) | Obtida — `infra/modules/dynamodb/main.tf` confirma ausência de particionamento por tenant; não há DPA/subprocessador sob contrato real ainda | `satisfied` |
| O eixo de Conteúdo Editorial cobre uma classe de risco real e observável | Existência de um pipeline/artefato real a avaliar | Obtida — `editorial/schema/`, `editorial/LIFECYCLE.md`, `contexto/auditoria-performance/` já existem como artefato real, não hipotético | `satisfied` |
| A redução não deixou um achado real sem eixo | Achado real de uma auditoria completa que não se encaixe em nenhum dos 6 eixos | **Pendente** — depende da conclusão de CASE-007/auditoria dos 6 eixos, ainda em andamento | `pending` |

# 7. Participação da IA

| Classificação | Descrição | Referência |
|---|---|---|
| AI proposal | Redução de 9 para 6 eixos + substituição do eixo multi-tenant por Conteúdo Editorial, como parte do PR #29 | `docs/engineering/standards/joint-review-criteria.md`, commit `d0cc431` |
| AI inference | Classificação de quais eixos têm/não têm correspondente de risco real neste projeto | Seção 2 acima |

# 8. Participação humana

| Classificação | Descrição | Referência |
|---|---|---|
| Human intervention | Marcelo questionou a redução diretamente antes de aceitá-la, em vez de aprovar silenciosamente | "Por que reduziu os eixos para apenas 6?", nesta sessão, 2026-10-02 |
| Human decision | Aprovação explícita dos ajustes após a explicação | "Entendi. Concordo com os ajustes.", mesma sessão |

# 9. Investigação e evolução

## 9.2 Tentativas realizadas
Única tentativa de desenho — não houve descarte de uma proposta intermediária antes desta, a redução 9→6 foi a primeira proposta apresentada a Marcelo.

## 9.5 Mudanças de escopo ou estratégia
Nenhuma — a pergunta de Marcelo pediu justificativa, não gerou uma segunda proposta diferente da primeira.

# 10. Solução final

6 eixos mantidos em `joint-review-criteria.md`: Arquitetura, Qualidade de Engenharia, Engenharia de Contexto, Segurança da Informação e AppSec, Governança de IA, Conteúdo Editorial e Experiência do Visitante — aprovados por Marcelo após explicação eixo a eixo do que foi cortado e por quê.

# 11. Evidência de antes e depois

## Aplicabilidade
- Status: `required`
- Justificativa: há uma transformação concreta e comparável (9 eixos de um documento → 6 eixos de outro), com arquivo de origem e arquivo de resultado ambos reais e acessíveis.

## Referências

| Estado | Referência | Arquivo ou escopo |
|---|---|---|
| Antes (9 eixos) | `expiration-tracker/docs/engineering/joint-review-criteria.md` (repositório irmão, fora deste) | Eixos: Arquitetura, Qualidade de Engenharia, Engenharia de Contexto, Segurança/AppSec, Privacidade/Dados, Operações/SRE, Governança de IA, Jurídico/Contratual, Produto Multi-tenant |
| Depois (6 eixos) | `docs/engineering/standards/joint-review-criteria.md`, commit `d0cc431` | Eixos: Arquitetura, Qualidade de Engenharia, Engenharia de Contexto, Segurança/AppSec, Governança de IA, Conteúdo Editorial e Experiência do Visitante |

## Reprodução

```text
Comparação entre repositórios, não reproduzível por um único `git diff` local:
diff <(sed -n '/^## Eixo/p' ../expiration-tracker/docs/engineering/joint-review-criteria.md) \
     <(sed -n '/^## Eixo/p' docs/engineering/standards/joint-review-criteria.md)
```

## Exemplo representativo — substituição do eixo de produto

### Antes (`expiration-tracker/docs/engineering/joint-review-criteria.md`)
```text
## Eixo: Governança de Produto e Serviço Multi-tenant
[...]
| 1 | Lifecycle Automatizado de Tenant | 18% | Onboarding/ativação/convite/mudança de
    plano/suspensão/offboarding como estados explícitos [...]
```

### Depois (`docs/engineering/standards/joint-review-criteria.md`)
```text
## Eixo: Conteúdo Editorial e Experiência do Visitante
[...]
| 1 | Integridade do Pipeline Editorial | 22% | Planos (`editorial/plans/`) seguem o
    schema/lifecycle vigente (`editorial/LIFECYCLE.md`); publicação não perde nem
    duplica conteúdo. |
```

### O que mudou
O critério de maior peso do eixo deixou de ser sobre lifecycle de tenant (que não existe neste projeto) e passou a ser sobre integridade do pipeline editorial (que existe e já tem schema/lifecycle formalizados, `editorial/LIFECYCLE.md`).

### Por que este exemplo foi escolhido
É a substituição mais direta — mesmo peso-líder (18%→22%) do eixo, mesma posição estrutural, risco completamente diferente.

### Classificação da evidência
- `Observed fact`: os dois trechos são citações literais dos respectivos arquivos.
- `AI inference`: a escolha de "Integridade do Pipeline Editorial" como critério equivalente de maior peso é uma decisão de design da IA, não uma convergência via protocolo Claude↔Codex (diferente de como os 9 eixos originais foram calibrados no projeto irmão, CASE-006) — ver `Limitation` abaixo.

## Casos contrários ou de controle
Três critérios do eixo de Segurança/AppSec do projeto irmão (isolamento multi-tenant, least-privilege IAM, integridade de pipeline assíncrono) foram adaptados, não removidos, porque IAM/fronteira de mensagem são riscos reais aqui também (Lambdas com permissão real, EventBridge/SQS do `postScheduler`/`imageProcessor`) — mostra que a redução não foi "cortar tudo que o projeto irmão tinha e este não tem exatamente igual", mas uma avaliação eixo a eixo e critério a critério.

## Evidência completa
- Diff reproduzível: `not-applicable` entre repositórios diferentes — ver "Reprodução" acima.
- Pacote de evidências: `not-applicable` — a comparação cabe nos exemplos acima, sem necessidade de pacote separado.

# 13. Mudança do modelo mental

## 13.1 Antes
Hipótese implícita inicial (não verbalizada antes da pergunta de Marcelo): transpor um protocolo de projeto irmão significa adaptar as regras de processo (nota cega, limiar, invocação do Codex) e também reduzir proporcionalmente os eixos de avaliação, sem que essa redução precisasse de uma defesa explícita eixo a eixo.

## 13.2 Depois
A pergunta direta de Marcelo forçou a tornar explícito, pela primeira vez, o critério usado para cada corte (nenhum risco real observável) e para a substituição (risco real diferente, mas real) — o próprio ato de ter que responder "por quê" por eixo revelou que a justificativa já existia implicitamente, só não tinha sido escrita antes de ser perguntada.

## 13.3 O que provocou a mudança
A pergunta "Por que reduziu os eixos para apenas 6?" — sem ela, a redução teria ficado registrada só como fato consumado no PR, sem o raciocínio eixo a eixo que agora está neste caso e no corpo do próprio `joint-review-criteria.md`.

# 14. Princípio generalizável

Transpor uma rubrica de revisão por pares entre dois projetos do mesmo autor não é um exercício de edição textual (trocar nomes, ajustar exemplos) — exige reavaliar, eixo a eixo e critério a critério, se a classe de risco que cada peso representa existe de verdade no projeto de destino. Um eixo sem correspondente de risco real deveria ser removido ou substituído, nunca mantido por paridade estrutural ou por economia de not ter que justificar o corte. A melhor forma de testar se essa reavaliação foi feita de verdade (e não só assumida) é alguém de fora do processo de edição perguntar "por que esse número, por que esses eixos" antes de aprovar — o mesmo papel que a crítica cruzada cega cumpre dentro do próprio protocolo Claude↔Codex, aplicado aqui pelo humano em vez de uma segunda IA.

# 15. Limites da conclusão

- A calibração dos 6 eixos (quais critérios, quais pesos) não passou pelo protocolo Claude↔Codex completo que calibrou os 9 eixos originais (CASE-006 do projeto irmão) — foi decisão de uma única IA, questionada e aprovada por Marcelo, não convergência de nota cega entre duas IAs independentes. `Limitation`: isso é uma diferença de rigor real entre este caso e seu par no projeto irmão, não deveria ser lido como equivalente.
- A obrigação de prova "a redução não deixou um achado real sem eixo" (§6.3) ainda está `pending` — este caso não pode concluir com segurança se a calibração está correta até a auditoria real dos 6 eixos (CASE-007) avançar o suficiente para testar isso.
- Não há, ainda, um exemplo de achado real que tenha testado especificamente os limites de um dos eixos novos (Conteúdo Editorial, Governança de IA simplificada) — a amostra de evidência de CASE-007 no momento em que este caso foi fechado cobre só parte do eixo Arquitetura.

# 16. Questões em aberto

- A calibração de pesos dentro do eixo de Conteúdo Editorial e Experiência do Visitante deveria passar pelo protocolo Claude↔Codex completo (como os 9 eixos originais passaram), em vez de ter sido decidida por julgamento direto de uma única IA? Candidato a rodada futura, se a auditoria real revelar um peso mal calibrado.
- Existe uma classe de risco real que nenhum dos 6 eixos cobre e que só vai aparecer quando o site tiver volume real de dado de contato/visitante (reabrindo a pergunta sobre o eixo de Privacidade removido)?

# 17. Potencial para o livro

## 17.1 Tema ou capítulo possível
Par direto de CASE-007 e do capítulo já identificado em CASE-005 — aqui o ângulo é especificamente **como recalibrar, não como copiar, um instrumento de avaliação entre dois contextos diferentes**, com o gatilho sendo uma pergunta humana direta ("por quê") como mecanismo de controle de qualidade da decisão de uma única IA.

## 17.2 Pergunta pedagógica central
Quando um framework de avaliação construído para um contexto é levado para outro, o que distingue uma adaptação real (critério por critério, com risco verificado) de uma adaptação superficial (troca de nomes, manutenção da estrutura por inércia)?

## 17.3 Elementos necessários
Os 2 trechos de antes/depois desta seção; a pergunta literal de Marcelo; a tabela de risco real vs. hipotético por eixo (seção 2); o caso irmão CASE-007 como teste empírico pendente da calibração.

# 18. Referências

- `docs/engineering/standards/joint-review-criteria.md` — resultado final dos 6 eixos.
- `docs/book/cases/CASE-006-calibracao-nove-eixos-full-audit.md` (projeto irmão, `expiration-tracker`) — como os 9 eixos originais foram calibrados via protocolo completo, contraste direto com o processo mais leve deste caso.
- `docs/book/cases/CASE-007-primeira-auditoria-real-protocolo-claude-codex-neste-repositorio.md` — teste empírico em andamento da calibração registrada aqui.

# 19. Revisão posterior

| Campo | Registro |
|---|---|
| Data da revisão | (não realizada — caso recém-fechado) |
| Decisão ainda válida | — |
