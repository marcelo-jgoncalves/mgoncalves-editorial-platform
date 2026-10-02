# Bloco 5 — Frontend público — Rodada 1 (proposta independente, Claude)

**Escopo**: `frontend/app/`, `frontend/components/`, `frontend/lib/`. Eixos: Arquitetura, Qualidade de Engenharia, Segurança/AppSec, Conteúdo Editorial e Experiência do Visitante, Privacidade e Conformidade de Dados do Visitante.

## Achados — correção de premissa do próprio eixo de Privacidade (não achado de bug, achado de verificação)

Ao auditar este bloco de verdade (não só por nome de componente), duas afirmações feitas na própria criação do eixo de Privacidade (`joint-review-criteria.md`, commit `c6fc78f`) se mostraram imprecisas — corrigidas nesta rodada, não deixadas incorretas:

### P1 — Google Analytics não está realmente ativo

`frontend/lib/consent.ts`'s `loadScriptsByConsent()` — a função que carregaria o script real do GA — está inteiramente comentada, com measurement ID placeholder (`G-XXXXXXXXXX`). `window.gtag` nunca é definido em lugar nenhum do código real. O mecanismo de consentimento (banner, modal, `localStorage`, propagação via Google Consent Mode) está correto e pronto, mas não há rastreamento real para ele gatilhar hoje.

### P2 — O formulário de contato não persiste nem transmite dado nenhum

`ContactForm.tsx`'s `submitContact()` é um mock explícito (comentário `TODO` no próprio arquivo: "replace with a real POST once the contact Lambda exists"). O dado digitado fica em estado React local, nunca é enviado a lugar nenhum, nunca persiste além do reload da página.

**Por que isso importa para o caso (CASE-008)**: as duas afirmações originais ("já gatilha Google Analytics por opt-in", "já coleta dado pessoal") foram escritas a partir da existência dos componentes/arquivos, não da leitura completa da lógica de carregamento/envio. É o mesmo tipo de erro do achado "single-table" do Bloco 1 (CASE-007) — uma afirmação sobre comportamento de código que não foi verificada linha a linha antes de ser escrita como fato. Corrigido em `joint-review-criteria.md` e `CASE-008`.

**Implicação prática, não um defeito**: como nada disso está ativo, o risco real de privacidade deste bloco hoje é baixo — mas os critérios 1 e 3 do eixo de Privacidade avaliam, na prática, a correção da *plumbing pronta para quando for ligada*, não um fluxo de dado real em produção. Isso deveria ser reavaliado como achado real assim que o GA ou a Lambda de contato forem efetivamente configurados (gatilho de reavaliação explícito).

## Verificado sem achado novo

- **Política de privacidade** (`politica-de-privacidade/page.tsx`): usa linguagem condicional correta ("mediante autorização", "quando autorizado pelo visitante") — não afirma rastreamento ativo que não existe, resultado honesto por leitura direta.
- **Acessibilidade do `ConsentModal`**: focus trap, `aria-modal`, `Escape` fecha, foco restaurado ao elemento anterior ao fechar — implementação correta por leitura.

## Avaliação por critério (parcial — não leu `frontend/app/` inteiro, priorizou consent/contato/privacidade)

| Eixo | Critério | Nota |
|---|---|---:|
| Privacidade | Consentimento Real Antes de Rastreamento | 8.0 — mecanismo correto, mas nada real para proteger ainda |
| Privacidade | Política de Privacidade Corresponde ao Fluxo Real | 9.0 |
| Privacidade | Minimização do Formulário de Contato | — não avaliável com segurança: formulário não persiste nada ainda |
| Privacidade | Canal de Direitos do Titular | não verificado nesta rodada |
| Conteúdo Editorial | Acessibilidade (amostra: `ConsentModal`) | 9.0 |

**Nota geral**: não calculada — amostra dirigida a consentimento/contato, não ao bloco inteiro (SEO, performance, design system, pipeline editorial no frontend não lidos nesta rodada). Mesma limitação declarada do Bloco 4.

## Correções aplicadas

`joint-review-criteria.md` (critérios 1 e 3 do eixo Privacidade) e `CASE-008` corrigidos para refletir o estado real (GA/contato ainda não ativos). Nenhuma mudança de código neste bloco — os achados são de verificação de afirmação, não de comportamento a corrigir.
