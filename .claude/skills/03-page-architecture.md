# Page Architecture & Information Design

**Novo skill especializado em HIERARQUIA VISUAL, ARQUITETURA DE PÁGINA e ORGANIZAÇÃO ESTRUTURAL**

## Descrição

Especialista em:
- ✅ Hierarquia visual (título > subtítulo > conteúdo > ações)
- ✅ Organização de seções (sections, panels, cards)
- ✅ Balanceamento visual (weight distribution)
- ✅ Espaçamento & breathing room
- ✅ Fluxo de navegação (é intuitivo?)
- ✅ Estrutura de grid/layout de página

## Quando usar

Use quando:
- "Falta hierarquia visual"
- "Página fica confusa/desorganizada"
- "Não sei por onde começar"
- "Elementos estão desequilibrados"
- "Seções não têm estrutura clara"
- "Espaçamento inconsistente entre seções"
- "Fluxo de navegação não é intuitivo"

## Invocação

```
/page-architecture [página HTML ou seção específica]
```

---

## Checklist de Page Architecture

### Parte 1: Visual Hierarchy

**Objetivo:** Usuário olha pra página e IMEDIATAMENTE sabe:
1. Qual é o título principal?
2. Qual é o conteúdo secundário?
3. Qual é a ação principal?
4. Qual é informação complementar?

- [ ] **Títulos se destacam?**
  - `font-size: 1.25rem` ou maior (20px+)
  - `font-weight: 700` ou bold
  - `text-transform: uppercase` (diferencia de corpo)
  - `color: var(--text-primary)` (não soft)
  - `line-height: 1.2` (compacto, não espaçado)

- [ ] **Subtítulos são secundários?**
  - `font-size: 0.8-0.9rem` (menores que título)
  - `color: var(--text-soft)` (mais claro)
  - `line-height: 1.4` (mais respirado)
  - Aparecem logo abaixo do título com `gap: var(--sp-2)`

- [ ] **Conteúdo principal tem peso intermediário?**
  - `font-size: 0.95-1rem` (padrão)
  - `font-weight: 400-500` (normal a medium)
  - `color: var(--text-primary)` (claro)

- [ ] **Ações têm destaque apropriado?**
  - Botões: background color + padding + border-radius
  - Links: underline ou color diferente
  - Não devem competir visualmente com título

- [ ] **Labels & metadata são muted?**
  - `font-size: 0.7-0.75rem` (pequeno)
  - `text-transform: uppercase; letter-spacing: 0.05em` (compact)
  - `color: var(--text-soft)` (mais claro)

---

### Parte 2: Section Architecture

**Objetivo:** Página organizada em blocos lógicos, cada um claro e bem contido.

- [ ] **Seções têm containers claros?**
  - `.panel` ou `.card` com `border` + `background` + `padding`
  - Sem elementos "soltos" flutuando
  - Cada seção tem espaço visual bem definido

- [ ] **Seções têm headers?**
  - `.panel-header` com título + subtítulo
  - Header separado do corpo com `border-bottom`
  - Header agrupa informação descritiva

- [ ] **Seções têm conteúdo agrupado?**
  - `.panel-body` com gap consistente
  - Elementos dentro seguem hierarquia
  - Não há elementos perdidos/orfãos

- [ ] **Seções relacionadas agrupadas?**
  - "Criar" e "Listar" na mesma seção (separadas por divider)
  - Ou em panels adjacentes com mesmo visual
  - Usuário entende relação entre elas

- [ ] **Seções têm espaçamento consistente?**
  - `gap: var(--sp-6)` entre seções grandes
  - `gap: var(--sp-4)` entre elementos dentro de seção
  - Sem variação aleatória

---

### Parte 3: Grid & Layout Structure

**Objetivo:** Distribuição equilibrada de espaço, responsividade clara.

- [ ] **Layout usa grid apropriado?**
  - Seções em `display: grid; grid-template-columns: 1fr 1fr;` (2-col)?
  - Ou `flex-direction: column;` (1-col) conforme necessário?
  - Não há elementos "soltos" sem grid

- [ ] **Gaps entre colunas são iguais?**
  - `gap: var(--sp-8)` entre colunas (32px)
  - Ambas colunas ocupam mesmo espaço (`1fr 1fr`)
  - Sem disparidade visual

- [ ] **Breakpoints responsivos?**
  - `@media (max-width: 1024px)`: grid muda pra 1-col
  - `@media (max-width: 768px)`: ajustes de padding
  - Testado em 375px (mobile), 768px (tablet), 1280px (desktop)

- [ ] **Max-width apropriado?**
  - Página não é MUITO larga (3000px)
  - Content fica legível (máx 1200-1400px)
  - Ou full-width se design intencional

---

### Parte 4: Whitespace & Breathing Room

**Objetivo:** Página não parece apertada/sufocante; elementos têm espaço pra respirar.

- [ ] **Padding em containers?**
  - `.panel { padding: var(--sp-6); }` (24px = confortável)
  - Não `padding: 4px` (apertado)
  - Não sem padding (colado na borda)

- [ ] **Gaps entre elementos?**
  - Items em lista: `gap: var(--sp-2)` ou `var(--sp-3)`
  - Seções: `gap: var(--sp-6)`
  - Sem elementos colados

- [ ] **Line-height apropriada?**
  - Títulos: `line-height: 1.2` (compacto)
  - Corpo: `line-height: 1.4-1.6` (respirado)
  - Não muito apertado, não muito solto

- [ ] **Max-width em seções?**
  - Descrições/textos longos: `max-width: 350-400px`
  - Não ocupam toda largura (fica cansativo)
  - Fácil de ler

---

### Parte 5: Visual Balance & Weight Distribution

**Objetivo:** Página parece equilibrada; nenhum elemento é MUITO grande/pequeno em relação aos outros.

- [ ] **Proporções iguais entre seções?**
  - "Criar" seção: input + label + botão (altura total ~120px?)
  - "Listar" seção: lista com items (altura proporcional?)
  - Não uma seção é 5x maior que outra

- [ ] **Inputs e botões proporcionais?**
  - Input `padding: 8-12px` (altura 40-44px)
  - Botão `padding: 8-12px` (altura 40-44px)
  - Mesmo tamanho, não desequilibrado

- [ ] **Distribuição de elementos horizontal?**
  - Não tudo à esquerda (fica vazio à direita)
  - Usar `justify-content: space-between` quando apropriado
  - Elementos bem distribuídos

- [ ] **Cores com peso apropriado?**
  - Títulos: cor primária (branco em dark mode)
  - Subtítulos: cor soft (mais claro/muted)
  - Ações: cor accent (vermelho, destaca)
  - Não everything é bright/saturado

---

### Parte 6: Fluxo & Intuitibilidade

**Objetivo:** Usuário NUNCA fica confuso sobre o que fazer ou onde clicar.

- [ ] **Fluxo é claro?**
  - Usuário sabe: "Crio aqui" (form) → "Vejo lista aqui" (list) → "Gerencio aqui" (actions)
  - Sem ambiguidade
  - Ordem faz sentido

- [ ] **Seções têm labels/headers explicativos?**
  - "Criar Jogador" (claro o que é)
  - "Jogadores Ativos" (claro o que é)
  - "Ações" (claro ooque são botões)

- [ ] **Ações primárias se destacam?**
  - "Criar" botão é GRANDE e colorido
  - "Remover" botão é PEQUENO e less prominent
  - Usuário sabe qual clicar por padrão

- [ ] **Entrada/Saída é óbvia?**
  - Onde entra dados? Input form (óbvio)
  - Onde vê resultado? Lista abaixo (óbvio)
  - Onde gerencia? Ações ao lado de cada item (óbvio)

---

## Padrões Comuns de Erro (Procure por!)

### ❌ Falta Hierarquia Visual

```
ERRADO:
<h2 style="font-size: 0.9rem;">TITULO</h2>
<p style="font-size: 0.9rem;">Descrição</p>
<span style="font-size: 0.9rem;">Item</span>
<!-- Tudo mesmo tamanho! Não há hierarchy -->

CORRETO:
<h2 class="panel-title">TITULO</h2>           <!-- 1.25rem, bold, uppercase -->
<p class="panel-subtitle">Descrição</p>       <!-- 0.8rem, soft color -->
<span class="list-item-name">Item</span>      <!-- 0.95rem, primary color -->
```

### ❌ Seções Desorganizadas (sem containers)

```
ERRADO:
<section>
  <h2>Criar NPC</h2>
  <label>Nome</label>
  <input>
  <button>Criar</button>
  
  <h3>NPCs Existentes</h3>
  <div>NPC A</div>
  <div>NPC B</div>
</section>
<!-- Tudo misturado, sem structure -->

CORRETO:
<section class="panel">
  <div class="panel-header">
    <h2 class="panel-title">CRIAR NPC</h2>
    <p class="panel-subtitle">Descrição...</p>
  </div>
  
  <div class="panel-body">
    <form class="create-form">
      <!-- criar -->
    </form>
    
    <div class="divider"></div>
    
    <div>
      <!-- listar -->
    </div>
  </div>
</section>
```

### ❌ Layout desequilibrado (2 colunas de tamanhos diferentes)

```
ERRADO:
.section-group {
  grid-template-columns: 1fr 0.5fr;  /* Coluna 2 é menor! */
}

CORRETO:
.section-group {
  grid-template-columns: 1fr 1fr;    /* Ambas iguais */
}

/* Ou com gap consistente */
.section-group {
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-8);                  /* 32px entre */
}
```

### ❌ Espaçamento inconsistente

```
ERRADO:
.panel {
  padding: 10px;           /* Arbitrário */
  gap: 15px;              /* Aleatório */
}

.panel > * {
  margin-bottom: 20px;     /* Aleatório */
}

CORRETO:
.panel {
  padding: var(--sp-6);           /* 24px - consistente */
  gap: var(--sp-4);              /* 16px - consistente */
}

.panel > * {
  margin-bottom: 0;               /* Usar gap, não margin */
}
```

### ❌ Inputs e Botões desproporcionais

```
ERRADO:
.form-group {
  display: flex;
  gap: 5px;
}

input {
  padding: 4px;     /* Muito pequeno */
  height: 24px;
}

button {
  padding: 16px;    /* Gigante! */
  height: 60px;     /* Desproporcionado */
}

CORRETO:
.form-group {
  display: flex;
  flex-direction: column;    /* Vertical, não horizontal */
  gap: var(--sp-3);
}

input {
  padding: var(--sp-2) var(--sp-3);   /* 8px 12px */
  height: 40px;                        /* 40-44px padrão */
}

button {
  padding: var(--sp-2) var(--sp-4);   /* 8px 16px */
  height: 40px;                        /* Mesmo que input */
}
```

### ❌ Fluxo não-intuitivo

```
ERRADO:
<div>
  <div>NPC A <button>Remover</button></div>
  <div>NPC B <button>Remover</button></div>
  
  <h2>Criar NPC</h2>        <!-- Lista ANTES do form! -->
  <input placeholder="Nome...">
  <button>Criar</button>
</div>

CORRETO:
<div class="panel">
  <div class="panel-header">
    <h2>CRIAR NPC</h2>       <!-- Form no topo -->
  </div>
  
  <form>
    <input placeholder="Nome...">
    <button>Criar</button>
  </form>
  
  <div class="divider"></div>
  
  <div>                      <!-- Lista abaixo -->
    <p>NPCs Criados</p>
    <div>NPC A <button>Remover</button></div>
    <div>NPC B <button>Remover</button></div>
  </div>
</div>
```

---

## Checklist de Verificação Rápida

Antes de commitar, pergunte-se:

```
HIERARQUIA:
[ ] Títulos são GRANDES (1.25rem+), BOLD (700), UPPERCASE?
[ ] Subtítulos são pequenos (0.8rem), soft color?
[ ] Conteúdo é intermediário (0.95rem), primary color?
[ ] Labels são tiny (0.7rem), uppercase, soft?

SEÇÕES:
[ ] Cada seção é um .panel com border/background?
[ ] Seções têm .panel-header com título + descrição?
[ ] Elementos dentro têm .panel-body com gap?
[ ] Seções relacionadas agrupadas logicamente?

GRID:
[ ] 2 colunas são iguais (1fr 1fr)?
[ ] Gaps são consistentes (var(--sp-*))
[ ] Responsividade: mobile (1-col), tablet (2-col), desktop (2-col)?

WHITESPACE:
[ ] Padding: var(--sp-6) (24px) em .panel?
[ ] Gaps: var(--sp-4) (16px) entre elementos?
[ ] Line-height: 1.2 (títulos), 1.4-1.6 (corpo)?

BALANCE:
[ ] Inputs e botões mesma altura (40px)?
[ ] Colunas ocupam espaço igual?
[ ] Nenhuma seção é 5x maior que outra?

FLUXO:
[ ] Usuário sabe "criar aqui" → "listar aqui" → "gerenciar aqui"?
[ ] Ordem de elementos faz sentido?
[ ] Ações primárias se destacam (botão grande/colorido)?

GERAL:
[ ] Página parece profissional e equilibrada?
[ ] Nenhum elemento "solto" ou desconectado?
[ ] Espaçamento é respirado, não apertado?
```

---

## Arquivos-chave

- `css/sections.css` — estrutura de seções, panels, grids
- `css/components-forms.css` — forms, buttons, inputs
- `regras.html` ou arquivo relevante — markup

---

## Como Debugar Page Architecture

### Ferramenta 1: DevTools Outline

```
1. F12 → Console
2. Paste:
   document.querySelectorAll('*').forEach(el => {
     el.style.border = '1px solid red';
   });
3. Agora TODOS elementos têm border vermelho
4. Procure por elementos "soltos" sem container
```

### Ferramenta 2: Fonte Grande Temporária

```
1. F12 → Styles
2. Adicione:
   body { font-size: 2rem; }
3. Títulos ficam GIGANTES, fácil ver se hierarchy existe
4. Remova depois
```

### Ferramenta 3: Responsive Design Mode

```
1. DevTools → Responsive Design Mode (Ctrl+Shift+M)
2. Testar: 375px (mobile), 768px (tablet), 1280px (desktop)
3. Verificar: grid quebra bem? Layout se adapta?
```

### Ferramenta 4: Color Picker

```
1. Inspecionar elemento
2. Ver cor exata: é var(--text-primary) ou var(--text-soft)?
3. Verificar hierarchy de cores
```

---

**Esta skill vai crescer com seus examples!**
Quando você enviar problemas de estrutura/hierarquia em VISUAL_FEEDBACK.md,
vou adicionar novos checklists aqui. 🚀
