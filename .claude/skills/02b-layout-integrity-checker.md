# Layout Integrity Checker

**Novo skill especializado em LAYOUT, SPACING e ALINHAMENTO**

## Descrição

Especialista em detectar:
- ✅ Componentes quebrados/desalinhados
- ✅ Espaçamento inconsistente
- ✅ Simetria visual
- ✅ Responsividade (mobile/tablet/desktop)
- ✅ Alinhamento de grids/flexbox
- ✅ Overflow/truncamento indevido

## Quando usar

Use quando:
- "Página ficou quebrada/assimétrica"
- "Componente está desalinhado"
- "Espaçamento inconsistente"
- "Mobile não fica bem"
- "Cards não alinham"
- "Texto está fora do lugar"

## Invocação

```
/layout-integrity-checker [arquivo HTML/CSS ou página]
```

---

## Checklist de Layout

### Parte 1: Alinhamento Visual

- [ ] **Grids consistentes?**
  - master-grid-players: 3 columns (desktop)
  - master-grid-creatures: 2 columns (desktop)
  - Buttons: alinhados horizontalmente?
  - Cards: mesma altura?

- [ ] **Flexbox correto?**
  - justify-content alinhado?
  - align-items alinhado?
  - gap (espaçamento) consistente?
  - flex-wrap comportando bem em mobile?

- [ ] **Padding/Margin simetricamente?**
  - Elemento A: padding-left 16px
  - Elemento B (sibling): padding-left também 16px?
  - Não há padding 8px e 16px misturado

### Parte 2: Espaçamento (Spacing Scale)

- [ ] **Usando --sp-* tokens?**
  - --sp-1 (4px), --sp-2 (8px), --sp-3 (12px), --sp-4 (16px)
  - Não há valores hardcoded (8px, 10px, 15px, etc)
  - Escala 4px consistente

- [ ] **Gap em grids consistente?**
  - Todos grids usam mesmo gap?
  - gap: var(--sp-4) em todo lugar?

- [ ] **Padding em cards/buttons/inputs?**
  - Button: padding 8px 16px? ou 12px 20px?
  - Input: padding 8px 12px em todo lugar?
  - Card: padding 16px (--sp-4) em todo lugar?

### Parte 3: Responsividade

- [ ] **Mobile (< 480px) quebra?**
  - Hero section: grid-template-columns: 1fr (mobile)?
  - Cards: ainda legíveis?
  - Texto: não trunca indevidamente?
  - Buttons: ainda clicáveis (48px minimum)?

- [ ] **Tablet (480-768px) fica bem?**
  - Grid columns ajustam?
  - Espaçamento reduz?
  - Nada overflow?

- [ ] **Desktop (> 768px) aproveita espaço?**
  - 3 columns de verdade
  - Espaçamento máximo

### Parte 4: Componentes Específicos

- [ ] **Master cards alinhadas?** ⭐ NOVO!
  - master-card-create, master-card-directory, master-card-access
  - Mesma altura? (`min-height` consistente)
  - Espaçamento entre elas: --sp-4 consistente?
  - **IMPORTANTE:** Conteúdo (title + desc) centralizado? (não comprimido no topo)
  - `align-items: center` (horizontal) + `justify-content: center` (vertical)?
  - Ou `align-items: flex-start` com padding top/bottom simétrico?

- [ ] **Form groups organizados?** ⭐ NOVO!
  - Inputs têm `.form-group` container?
  - Label + input alinhados (label acima ou lado)?
  - Padding entre form-groups: --sp-4 consistente?
  - Input height mínima 40-44px?
  - Inputs têm placeholder e label distinct?

- [ ] **Player/NPC/Monster rows alinhadas?** ⭐ NOVO!
  - Padding consistente (--sp-3 / --sp-4)
  - Altura mínima (não ficam muito pequenos)
  - Elementos alinhados em `flex: justify-content: space-between`?
  - Nome à esquerda, ações à direita?
  - Botões alinhados horizontalmente (gap consistente)?
  - Border-bottom separando linhas?

- [ ] **Form inputs?**
  - Altura: 40-44px (padrão)?
  - Padding: 8px 12px?
  - Label e input alinhados?
  - Erro message não quebra layout?

- [ ] **Buttons?**
  - Altura: 40px+ (touch target)?
  - Padding: 8px 16px ou similar?
  - Diferentes tipos (primary, danger) mesma altura?

### Parte 5: Overflow & Truncamento

- [ ] **Texto overflow?**
  - Player name muito longo = trunca ou wraps?
  - Npc name = wraps bem?
  - Monster name = comporta-se consistentemente?

- [ ] **Container overflow?**
  - Nada sai do viewport
  - Horizontal scroll só se necessário
  - Nenhum elemento escondido por overflow hidden

### Parte 6: Visual Symmetry

- [ ] **Cards/sections simétricas?**
  - master-stat boxes: mesma altura, mesma largura?
  - player-row items: espaçamento left = right?
  - form-group items: padding top = bottom?

- [ ] **Icones/badges centered?**
  - Em botões: ícone + texto alinhados?
  - Em labels: sem offset estranho?

---

## Padrões Comuns de Erro (Procure por!)

### ❌ Grid quebrado
```css
/* ERRADO */
.master-grid {
  grid-template-columns: 1fr 1fr 1fr;
  /* sem media query → mobile quebra */
}

/* CORRETO */
.master-grid {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  /* ou */
}

@media (max-width: 768px) {
  .master-grid {
    grid-template-columns: 1fr;
  }
}
```

### ❌ Padding inconsistente
```css
/* ERRADO */
.card {
  padding: 16px; /* --sp-4 */
}

.card-title {
  padding-left: 8px; /* --sp-2 — inconsistente! */
}

/* CORRETO */
.card {
  padding: var(--sp-4);
}

.card-title {
  padding-left: var(--sp-4); /* consistente */
}
```

### ❌ Flexbox com alignment ruim
```css
/* ERRADO */
.player-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start; /* topo — logo deforma */
}

/* CORRETO */
.player-row {
  display: flex;
  justify-content: space-between;
  align-items: center; /* centro — fica bem */
}
```

### ❌ Espaço mal distribuído em containers (⭐ NOVO!)
```css
/* ERRADO */
.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;  /* ← Alinha topo, deixa vazio embaixo */
  padding: 16px;
  min-height: 180px;
  /* Resultado: texto comprimido, espaço desperdiçado */
}

/* CORRETO (Centralizado) */
.card {
  display: flex;
  flex-direction: column;
  align-items: center;       /* Centro horizontal */
  justify-content: center;   /* Centro vertical → distribui espaço */
  padding: var(--sp-4);
  min-height: 180px;
  gap: var(--sp-3);
}

/* CORRETO (Top-aligned com padding simétrico) */
.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: var(--sp-3) var(--sp-4); /* padding top = bottom */
  gap: var(--sp-2);
}
```

### ❌ Componentes desorganizados (inputs, botões, listas) (⭐ NOVO!)
```css
/* ERRADO */
<form>
  <input placeholder="Nome...">  /* Sem label, sem contenção */
  <input placeholder="Senha..."> /* Nenhuma estrutura */
  <button>Enviar</button>         /* Botão sem estilo diferenciado */
</form>

<ul>
  <li>jogador 1 <a>editar</a> <a>remover</a></li>  /* Links soltos, sem alinhamento */
  <li>jogador 2 <a>editar</a> <a>remover</a></li>  /* Alturas/spacing diferentes */
</ul>

/* CORRETO */
<form>
  <div class="form-group">
    <label for="name">Nome</label>
    <input id="name" placeholder="Nome...">  /* Label + input estruturado */
  </div>
  <div class="form-group">
    <label for="pass">Senha</label>
    <input id="pass" type="password" placeholder="Senha...">
  </div>
  <button class="button">Enviar</button>  /* Botão com estilo diferenciado */
</form>

<ul class="player-list">
  <li class="player-row">  /* Container estruturado */
    <span class="player-name">jogador 1</span>
    <div class="player-actions">
      <a class="button button--secondary">editar</a>
      <button class="button button--danger">remover</button>
    </div>
  </li>
</ul>

CSS:
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);           /* Label acima input */
  margin-bottom: var(--sp-4); /* Espaço entre grupos */
}

.player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;  /* Nome esquerda, ações direita */
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--card-border);  /* Separador visual */
}

.button {
  padding: var(--sp-2) var(--sp-4);     /* 8px 16px */
  background: var(--accent);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  /* Agora é visualmente diferente de links! */
}
```

### ❌ Mobile não considerado
```css
/* ERRADO */
.hero {
  grid-template-columns: 1fr auto;
  /* 2 columns em TUDO — mobile quebra */
}

/* CORRETO */
.hero {
  grid-template-columns: 1fr auto;
}

@media (max-width: 640px) {
  .hero {
    grid-template-columns: 1fr;
  }
}
```

---

## Checklist de Verificação Rápida

Antes de commitar, pergunte-se:

```
[ ] Todos padding/margin usam --sp-* tokens?
[ ] Mobile viewport (375px) fica bem?
[ ] Tablet viewport (768px) fica bem?
[ ] Desktop viewport (1280px) aproveita espaço?
[ ] Cards/buttons mesma altura?
[ ] Espaçamento simétrico?
[ ] Nada trunca/overflow indevidamente?
[ ] Texto não some ou fica invisível?
[ ] Grids têm media queries?
[ ] Touch targets >= 44px?
[ ] Responsividade testada em DevTools?
```

---

## Arquivos-chave

- `css/tokens.css` — spacing scale (--sp-1 até --sp-20)
- `css/ficha.css` — master grids, cards, layouts
- `ficha.html` — estrutura dos componentes
- `css/components.css` — buttons, inputs, forms
- `css/reset.css` — base styling

---

## Como Debugar Layout

### Ferramenta 1: DevTools
```
1. Abrir DevTools (F12)
2. Inspecionar elemento
3. Ver: padding, margin, gap, dimensions
4. Expandir elementos pra ver alinhamento
```

### Ferramenta 2: Responsive Mode
```
1. DevTools → Responsive Design Mode (Ctrl+Shift+M)
2. Testar: 375px (mobile), 768px (tablet), 1280px (desktop)
3. Procurar por: overflow, truncamento, quebra
```

### Ferramenta 3: Grid Overlay
```
1. DevTools → Enable Grid Overlay
2. Ver: grid lines, gaps, alinhamento
3. Verificar: colunas alinhadas?
```

---

**Esta skill vai crescer com seus examples!**
Quando você enviar problemas de layout em VISUAL_FEEDBACK.md,
vou adicionar novos checklists aqui. 🚀
