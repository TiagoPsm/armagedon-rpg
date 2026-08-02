# 📊 Smart Skill Feedback & Improvements Log

Este arquivo rastreia cada uso de skill e propostas de melhoria. Claude o lê periodicamente para otimizar as regras.

---

## 📈 Formato de Entrada

Cada skill use é registrada assim:

```markdown
### [DATA] - [SKILL] - [STATUS]

**Prompt do usuário:**
"exemplo do prompt que triggou a skill"

**Skill usada:**
01-code-review-frontend

**Apropriada?** ✅ Sim / ❌ Não / ⚠️ Parcial

**Feedback:**
- O que funcionou bem
- O que poderia melhorar
- Règras que falharam

**Proposta de melhoria:**
- Alterar regra X para incluir padrão Y
- Remover regra Z que deu falso positivo
- Adicionar novo trigger para situação W
```

---

## 📝 Log de Usos

### [2026-08-02] - 01-code-review-frontend - ✅ APROPRIADA (bug de event handling / camadas)

**Pedido:** "Faça uma verificação sobre o sistema de desenhos, não está sendo possível desenhar no board."

**O que funcionou:**
- A lente de *event handling* da skill levou direto à causa: hit-test de camadas, não lógica de desenho. O JS estava correto o tempo todo.
- Medir antes de teorizar (`elementsFromPoint` via Playwright) evitou palpite: ficou provado que `#mesaStage` estava acima do canvas.

**Aprendizado para a skill:** quando o sintoma for "o clique não faz nada", checar a PILHA de camadas (z-index + pointer-events) antes de ler o handler. Regressão clássica de mudança de z-index feita em outra etapa.

### [2026-06-16] - 03-page-architecture - ✅ APROPRIADA + SKILL APRIMORADA (faixa preta lateral)

**Trigger:**
User insistiu varias vezes (com screenshots) em "tirar a barra preta lateral" do painel da Mesa; pediu "use as skills que precisar" e depois "melhore a skill relacionada".

**Apropriada?** ✅ Sim

**Feedback:**
- A skill cobria padding/centralizacao, mas o caso real NAO era isso. Levou muitas iteracoes (gutter stable -> both-edges -> full-bleed -> simetrico) ate o usuario mandar um print com a tela cheia mostrando que a sidebar nao alcancava a borda direita.
- Causa raiz: `reset.css` tem `html { scrollbar-gutter: stable }` (global). Numa pagina `overflow: hidden` (Mesa) isso reserva ~10px de gutter VAZIO a direita = faixa preta. Diagnostico definitivo so veio do CONSOLE do navegador real do usuario (`innerWidth - clientWidth === 0` mas `innerWidth - sidebar.right === 10`), porque o viewport do preview headless reporta largura falsa.
- Licao: quando "faixa lateral" persiste apos mexer em padding/gutter da sidebar, suspeitar do ROOT (`html`) e do `scrollbar-gutter` herdado; medir documento vs janela; confiar no console do navegador REAL, nao no preview headless.

**Melhoria aplicada:**
- Novo padrao de erro em `03-page-architecture.md`: "Faixa preta lateral em pagina full-screen (gutter de scrollbar reservado)" com snippet de diagnostico (`innerWidth - clientWidth` vs `innerWidth - sidebar.right`) e o fix `html { overflow: hidden; scrollbar-gutter: auto }`.
- Item novo no checklist rapido (conteudo encosta nas duas bordas / checar `scrollbar-gutter` do html).

---

### [2026-06-16] - 03-page-architecture + 02-dark-mode-design-expert - ✅ APROPRIADAS + SKILL APRIMORADA

**Trigger:**
User pediu (com screenshot) para "tirar a aparência de coisa feita com IA" e reorganizar o cabecalho/hero do painel do jogador: status como bolinha, hierarquia de titulo legivel sem quebra, remover badge "Jogador", foto maior + nome centralizado. E explicitamente: "aprimore as skills que sejam relevantes".

**Habilidades usadas:** 03-page-architecture (hierarquia/organizacao) + 02-dark-mode-design-expert (legibilidade/tokens)

**Apropriadas?** ✅ Sim

**Feedback:**
- 3 padroes reais e reutilizaveis sairam dessa tarefa, todos sobre "parecer menos generico/IA":
  1. Estado binario (em cena/fora) -> bolinha colorida, nao badge de texto
  2. Nao repetir a mesma info (papel ja estava no chip "Papel" + badge "Jogador" no hero)
  3. Fonte display decorativa (Cinzel Decorative) em titulo pequeno de sidebar estreita quebra e fica ilegivel -> usar fonte UI
- Verificacao util: medir `titleLines` no browser (altura/line-height) para garantir 1 linha

**Melhoria aplicada (FEITO nesta sessao):**
- ✅ `03-page-architecture.md`: 3 novos error-patterns ("estado binario como badge", "info repetida", "fonte display em titulo pequeno") + 3 itens no checklist GERAL
- Proposta p/ Tiago: adicionar trigger "parece feito com IA / generico" no SKILL_DISPATCHER apontando para 03 + 02

**Status:** ✅ IMPLEMENTADO (skill 03 aprimorada) — proposta de trigger aguardando aprovacao

---

### [2026-06-16] - 03-page-architecture + 02-dark-mode-design-expert - ✅ APROPRIADAS + FEEDBACK VISUAL

**Trigger:**
User forneceu screenshot do painel lateral do jogador na Mesa e pediu: "melhorar essa interface lateral e deixar melhor visualmente, mais organizado e de forma que faça sentido utilizar"

**Habilidades usadas:**
- 03-page-architecture (hierarquia, organizacao de secoes, fluxo/uso)
- 02-dark-mode-design-expert (polimento visual com tokens do tema)

**Apropriadas?** ✅ Sim — "mais organizado" + "faça sentido utilizar" mapeiam direto para page-architecture; "melhor visualmente" para dark-mode-design-expert

**Feedback:**
- Boa combinacao: 03 guiou a reestruturacao das vitais (label + leitura grande + barra + campos rotulados) e os titulos de secao com regua; 02 garantiu uso de tokens (`--fs-*`, `--accent`, `--bg-card`, cores de recurso life/integrity consistentes com a Ficha)
- Cuidado aplicado: componentes compartilhados com o inspetor (`.bar-preview`) NAO foram alterados globalmente — so override player-scoped. A skill 02b poderia reforcar essa regra ("ao mexer em CSS de um painel, checar se a classe e compartilhada com outra view antes de alterar")
- Sem falso positivo

**Dados do Exemplo:**
- Localizacao: painel lateral do jogador na Mesa (`renderPlayerSheetPanel`, `css/mesa-roster.css`)
- Problema: hierarquia fraca, vitais apertadas lado a lado, status verboso, muito espaco vazio
- Severidade: 🟡 melhoria de UX

**Proposta de Melhoria (para discutir com Tiago):**
- Adicionar trigger explicito em 03-page-architecture para "painel/sidebar" alem de "pagina"
- Adicionar nota em 02b: verificar se classe CSS e compartilhada entre views antes de editar (evitar regressao no inspetor)

**Status:** ⏳ Proposta registrada — aguardando aprovacao do Tiago

---

### [2026-06-15] - 02b-layout-integrity-checker - ✅ APROPRIADA + FEEDBACK VISUAL

**Trigger:**
User forneceu screenshot de problema visual: cards com espaço mal distribuído

**Habilidade usada:**
02b-layout-integrity-checker

**Apropriada?** ✅ Perfeita

**Feedback:**
- Skill foi ativada corretamente baseado em screenshot visual
- Identificou padrão de `align-items: flex-start` deixando espaço vazio
- Raiz do problema corretamente diagnosticada
- Fix proposto é prático e aplicável
- Adicionar novo checklist item para "espaço distribuído em containers"

**Dados do Exemplo:**
- Localização: ficha.html - Master panel
- Problema: Cards (ACESSOS, CONTROLE, BESTIÁRIO) com espaço mal distribuído
- Tipo: mal-espaçado + desalinhado
- Severidade: 🟡 importante

**Proposta de Melhoria:**
- ✅ Adicionar novo item em "Parte 4: Componentes Específicos" ✓ (FEITO)
- ✅ Criar novo erro pattern "Espaço mal distribuído em containers" ✓ (FEITO)
- ✅ Incluir exemplos CSS de ANTES/DEPOIS ✓ (FEITO)

**Status:** ✅ IMPLEMENTADO — Skill melhorada com novo checklist + error pattern

---

### [2026-06-15] - 02-dark-mode-design-expert + 02b-layout-integrity-checker - ✅ APROPRIADAS + FEEDBACK VISUAL

**Trigger:**
User forneceu screenshot de problema visual: componentes desorganizados, botões sem identidade visual

**Habilidades usadas:**
- 02-dark-mode-design-expert (Parte 3 expandida: Identidade Visual)
- 02b-layout-integrity-checker (Parte 4 expandida: Componentes & Alinhamento)

**Apropriadas?** ✅ Muito apropriadas — cobrem ambos design e layout

**Feedback:**
- Dois problemas simultâneos: identidade visual (Skill 02) + organização estrutural (Skill 02b)
- Skill 02 identificou falta de diferenciação botão/link/input
- Skill 02b identificou falta de `.form-group` e desalinhamento de `.player-row`
- Propostas de fix muito práticas (CSS reutilizável + HTML estrutura)
- Recomendação: criar componentes CSS reutilizáveis (button, form-group, player-row)

**Dados do Exemplo:**
- Localização: ficha.html - Master panel (3 seções)
- Problemas:
  - Inputs soltos sem label/contenção
  - Botões (VER FICHA, Remover) parecem links
  - Nomes de jogadores em lista sem alinhamento clara
  - Ações (botões) desalinhadas nas linhas
- Tipo: quebrado + desalinhado + fora-de-lugar (identidade)
- Severidade: 🔴 crítica (afeta usabilidade)

**Melhorias Propostas & Implementadas:**

Skill 02 (dark-mode-design-expert):
- ✅ Nova "Parte 3: Identidade Visual de Componentes"
- ✅ Checklist para botões diferenciados
- ✅ Checklist para inputs estruturados
- ✅ Checklist para hierarquia visual clara

Skill 02b (layout-integrity-checker):
- ✅ Expandido "Parte 4: Componentes Específicos"
- ✅ Novo item: "Form groups organizados?"
- ✅ Novo item: "Player/NPC/Monster rows alinhadas?"
- ✅ Novo error pattern: "Componentes desorganizados"
- ✅ Exemplos CSS ANTES/DEPOIS (form-group, player-row, button)

**Recomendação Follow-up:**
Criar arquivo `css/components-form.css` e `css/components-list.css` com:
- `.form-group`, `.form-group label`, `.form-group input`
- `.button`, `.button--secondary`, `.button--danger`
- `.player-row`, `.player-actions`

Assim, qualquer novo form/list usa esses componentes reutilizáveis!

**Status:** ✅ IMPLEMENTADO — Skills 02 & 02b expandidas com novo checklist + error pattern + propostas de CSS reutilizável

---

### [2026-06-16] - 02-dark-mode-design-expert + 02b-layout-integrity-checker + NOVA SKILL - ✅ APROPRIADAS + FEEDBACK VISUAL

**Trigger:**
User forneceu screenshot de problema visual AMPLO: falta hierarquia visual, desequilíbrio, organização confusa

**Habilidades usadas:**
- 02-dark-mode-design-expert (Typography & Hierarchy)
- 02b-layout-integrity-checker (Estrutura & Alinhamento)
- ⭐ NOVA SKILL NECESSÁRIA: **03-page-architecture.md** (hierarquia, seções, padrão visual)

**Apropriadas?** ✅ Sim, mas identificou GAP: nenhuma skill atual aborda ARQUITETURA DE PÁGINA inteira

**Feedback:**
- Problema anterior era componente isolado (card, botão, input)
- Este problema é PÁGINA INTEIRA (hierarquia, balanceamento, estrutura)
- Requer skill separada focada em: layout de página, hierarquia visual, section architecture
- Problema é crítico porque afeta navegação e usabilidade geral

**Dados do Exemplo:**
- Localização: regras.html (ou página de management) - seções NPCS + MONSTROS
- Problemas identificados:
  - Falta hierarquia visual (título não se destaca)
  - Desequilíbrio (botão grande vs input pequeno)
  - Falta contenção (seções não são cards)
  - Espaçamento inconsistente
  - Labels desconectados de inputs
  - Lista desorganizada
  - Ações desalinhadas
  - Fluxo não intuitivo
- Tipo: quebrado + desalinhado + fora-de-lugar (escala de página)
- Severidade: 🔴 crítica (afeta usabilidade toda da página)

**Melhorias Propostas & Implementadas:**

Skill 02 (dark-mode-design-expert):
- ✅ Anotado: precisa adicionar "Parte 4: Typography & Hierarchy"
- ✅ Checklist: tamanhos de título/subtítulo/conteúdo

Skill 02b (layout-integrity-checker):
- ✅ Anotado: precisa adicionar "Parte 7: Page-level Layout"
- ✅ Checklist: grid de seções, gaps entre seções

⭐ Skill 03 (PAGE ARCHITECTURE) — NOVA SKILL A CRIAR:
- [ ] Quando usar: "hierarquia visual", "estrutura de página", "navegação confusa", "seções desorganizadas"
- [ ] Checklists:
  - Visual Hierarchy (título > subtítulo > conteúdo > ações)
  - Section Architecture (panels, cards, grouping)
  - Grid & Layout (2-col layout, responsive breakpoints)
  - Whitespace & Breathing Room (gaps, padding, breathing space)
  - Intuitiveness (fluxo claro: criar → listar → gerenciar)
  - Balance (visual weight distribution)

**Recomendação Follow-up:**
1. Criar `.claude/skills/03-page-architecture.md` (NOVA)
2. Adicionar triggers em `SKILL_DISPATCHER.md`
3. Atualizar CLAUDE.md com skill #6
4. Sistema passa a ter 6 skills ativas!

**Status:** ✅ IMPLEMENTADO — Exemplo 3 documentado com soluções detalhadas + nova skill identificada

---

### [2026-06-16] - 03-page-architecture.md - ✅ APROPRIADA + FEEDBACK VISUAL

**Trigger:**
User forneceu screenshot de "GRIMÓRIO DE REGRAS": espaço inutilizado, textos atropelando, espaçamentos irregulares

**Habilidade usada:**
03-page-architecture.md

**Apropriada?** ✅ Perfeita

**Feedback:**
- Skill 03 foi apropriada imediatamente
- Problema é claramente de arquitetura/layout de página
- Root causes bem identificáveis (falta de grid, falta de panels, empty states confusos)
- Solução é prática e aplicável com CSS grid + flexbox

**Dados do Exemplo:**
- Localização: regras.html - página inteira "GRIMÓRIO DE REGRAS"
- Problemas identificados:
  - Espaço muito inutilizado/vazio
  - Textos atropelando (layout confuso)
  - Hierarquia visual confusa
  - Espaçamentos irregulares (sem --sp-* scale)
  - Sem grid/flexbox claro
  - Inputs/labels desconectados
  - Empty states em posições estranhas
  - Sem contenção de seções
- Tipo: quebrado + espaço-inutilizado + atropelado
- Severidade: 🔴 crítica (página inteira parece inacabada)

**Melhorias Propostas & Implementadas:**

Skill 03 (page-architecture):
- ✅ Confirmou apropriabilidade da skill
- ✅ Exemplo real de uso bem-sucedido
- ✅ 8 root causes identificadas e explicadas
- ✅ Solução completa: HTML refatorado + CSS grid/flexbox
- ✅ 7 testes práticos diferentes inclusos
- ✅ Checklist com 40+ itens

**Recomendação Follow-up:**
- Skill 03 funciona perfeitamente para problemas de página inteira
- Pode ser usada para qualquer problema de "página confusa" / "espaço inutilizado"
- Sistema está bem equilibrado com skills 01-03 (Code, Design, Layout, Architecture), 04-06 (Performance, Canvas)

**Status:** ✅ IMPLEMENTADO — Exemplo 4 documentado com soluções detalhadas; Skill 03 validada como apropriada

---

### [2026-06-16] - 02b-layout-integrity-checker + 03-page-architecture - ✅ APROPRIADAS + FEEDBACK VISUAL

**Trigger:**
User forneceu screenshot: "Características e Efeitos Permanentes" seção "extremamente desorganizada e quebrada"

**Habilidades usadas:**
- 02b-layout-integrity-checker (component-level)
- 03-page-architecture (item structure)

**Apropriadas?** ✅ Sim, ambas

**Feedback:**
- Problema combina dois níveis: componente desorganizado (02b) + arquitetura de lista (03)
- Root causes claras: falta .effect-item card, falta .form-group, buttons desalinhados
- Solução prática: item card + form structure + expandable content + CSS grid

**Dados do Exemplo:**
- Localização: ficha.html - "CARACTERÍSTICAS E EFEITOS PERMANENTES"
- Problemas identificados:
  - Texto jogado junto (título, status, descrição)
  - Labels fora de lugar / desalinhados
  - Inputs/textareas sem estrutura
  - Botões (DUPLICAR, SUBIR, DESCER, X) desalinhados
  - Falta contenção visual de item (card)
  - Espaçamento irregular
  - Hierarquia visual quebrada
  - Form não segue padrão
  - Textarea sem altura definida
  - Responsividade não considerada
  - Sem estrutura de lista
- Tipo: quebrado + desorganizado + sem-estrutura
- Severidade: 🔴 crítica (usuário não consegue editar campos)

**Melhorias Propostas & Implementadas:**

Skill 02b (layout-integrity-checker):
- ✅ Novo checklist item: "Effect items estruturados em cards?"
- ✅ Novo error pattern: "Item desorganizado sem container"

Skill 03 (page-architecture):
- ✅ Novo checklist item: "Listas de items têm separadores visuais?"
- ✅ Novo checklist item: "Form fields seguem .form-group padrão?"
- ✅ Novo error pattern: "Expandable content layout"

**Solução Completa:**
- ✅ HTML refatorado com .effect-item card
- ✅ CSS grid (actions buttons), flexbox (form)
- ✅ Expandable/collapsible edit mode
- ✅ JavaScript logic (toggle, save, delete)
- ✅ Responsive design (desktop, tablet, mobile)
- ✅ 50+ item checklist

**Recomendação Follow-up:**
- Padrão .effect-item pode ser reutilizado para outras listas de items
- Expandable card é padrão valioso pra ficha (poderes, inventário, etc)

**Status:** ✅ IMPLEMENTADO — Exemplo 5 documentado com soluções detalhadas + padrão reutilizável identificado

---

## 🔍 Como Claude Melhora as Skills

### Ciclo de Melhoria Automática:

1. **Durante o uso:**
   - Claude usa uma skill
   - Após executar, analisa: "Esta skill foi apropriada?"
   - Se não, registra feedback aqui

2. **Após ~10 usos:**
   - Claude lê este arquivo
   - Identifica padrões em falhas
   - Propõe ajustes no dispatcher
   - Atualiza regras em `SKILL_DISPATCHER.md`

3. **Manutenção contínua:**
   - Skills evoluem baseado em uso real
   - Regras ficam mais precisas
   - False positives diminuem

---

## 📊 Estatísticas (monitoradas automaticamente)

*(Será preenchido por Claude)*

```
Skill uso frequencies:
- 01-code-review-frontend:        XX uses, YY% acerto
- 02-dark-mode-design-expert:     XX uses, YY% acerto
- 03-canvas-optimization:         XX uses, YY% acerto
- 04-frontend-performance-checklist: XX uses, YY% acerto
- 05-canvas-rendering-benchmark:  XX uses, YY% acerto

False positives (skill errada escolhida): XX
Successful auto-selections: XX
Manual overrides by user: XX
```

---

## 🎯 Triggers de Melhoria

Claude revisa este arquivo e propõe melhorias quando:

- ❌ Mesma skill falha >2x (regra precisa ajuste)
- 🔄 Múltiplas skills competem frequentemente (ambiguidade)
- ✨ Novo padrão de uso aparece (adicionar regra?)
- 🗑️ Skill nunca usada (regra irrelevante?)
- 📈 Alta taxa de acerto (regra está ótima!)

---

## 💡 Exemplos de Melhorias Propostas

### Proposta 1: Adicionar novo trigger
```
Skill: 03-canvas-optimization
Padrão observado: "tela inteira preta", "não renderiza nada"
Proposta: Adicionar "black screen", "not rendering" às regras
Status: ⏳ Aguardando aprovação
```

### Proposta 2: Remover falso positivo
```
Skill: 02-dark-mode-design-expert
Problema: Triggered para "design de database schema"
Proposta: Adicionar exclusão: NOT [database|schema|architecture]
Status: ⏳ Aguardando aprovação
```

### Proposta 3: Refinar ambiguidade
```
Skills: 03 vs 04 competem
Padrão: "performance" pode ser rendering OU build
Proposta: Se menciona "Mesa"/"rendering"→ 03, se "deploy"/"build"→ 04
Status: ⏳ Aguardando aprovação
```

---

## ✅ Como Aprovar Melhorias

Tiago (usuário) pode:

1. **Aceitar sugestão:**
   ```
   "Claude, aplique a proposta 1 de melhoria"
   ```
   → Claude atualiza `SKILL_DISPATCHER.md`

2. **Rejeitar:**
   ```
   "Não, essa regra não faz sentido"
   ```
   → Claude registra feedback e tenta novo approach

3. **Sugerir própria:**
   ```
   "Acho que essa skill deveria também trigger para X"
   ```
   → Claude adiciona à proposta e aguarda confirmação

---

## 🔐 Versioning

Cada melhoria gera uma "versão":
- `SKILL_DISPATCHER_v1.0` — inicial
- `SKILL_DISPATCHER_v1.1` — melhorias após 20 uses
- `SKILL_DISPATCHER_v1.2` — refinamento de ambiguidades
- etc.

Histórico mantido em `SKILL_DISPATCHER.md` com `<!-- v1.x changelog -->`.

---

## 🚀 Próximas Melhorias Propostas

*(Será preenchido conforme Claude identifica oportunidades)*

1. ⏳ [Aguardando dados de uso real]
2. ⏳ [Aguardando feedback do usuário]

---

## 📌 Notas

- **Não é automático demais:** Grandes mudanças sempre precisam de OK do Tiago
- **Feedback contínuo:** Pequenos ajustes podem ser aplicados silenciosamente
- **Histórico preservado:** Todas mudanças são rastreáveis
- **Reversível:** Se uma melhoria piorar, voltar é fácil

**Claude: Leia este arquivo periodicamente e proponha melhorias baseado em uso real!**
