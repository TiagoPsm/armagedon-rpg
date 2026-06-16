# 🤖 Smart Skill Dispatcher — Seleção Automática de Skills

Este arquivo guia Claude a escolher a skill ideal baseado no seu prompt.

## Regras de Seleção Automática

### 🔍 **01-code-review-frontend.md**
Use quando o prompt menciona:
- "revise", "code review", "audit", "check code"
- Arquivos: `js/mesa-*.js`, `js/ficha-*.js`, `js/*-core.js`
- Padrões: memory leak, event handling, Canvas patterns
- Security: auth, PBKDF2, session management
- WebSocket cleanup, event delegation

**Exemplos:**
- "Revise o mesa-drawing.js"
- "Audit memory leaks em ficha-core.js"
- "Check Canvas rendering patterns"
- "Security review do auth.js"

---

### 🎨 **02-dark-mode-design-expert.md** (EXPANDIDA!)
Use quando o prompt menciona:
- "design", "visual", "theme", "contrast", "CSS"
- "texto quebrado", "texto estranho", "typo", "encoding"
- Padrões: dark mode, color variables, accessibility, text integrity
- Arquivos: `css/tokens.css`, `css/components.css`, `css/*.css`, `*.html`
- Problemas: blur em high-DPI, contrast WCAG, color consistency, **texto errado**

**Exemplos:**
- "Melhore o contraste do dark theme"
- "Audit CSS tokens para WCAG AA"
- "Refine paleta de cores carmesim"
- "Fix blur em telas Retina"
- "Procure por texto quebrado na página" ⭐
- "Existe algum typo ou texto estranho?" ⭐
- "Verifique integridade de mensagens de erro" ⭐

---

### 🎨 **02b-layout-integrity-checker.md** ⭐ (NOVO!)
Use quando o prompt menciona:
- "layout quebrado", "ficou assimétrico", "fora de lugar"
- "espaçamento inconsistente", "desalinhado", "mobile quebra"
- "cards não alinham", "grid está errado"
- Padrões: spacing consistency, responsive design, component alignment
- Arquivos: `css/ficha.css`, `css/components.css`, `*.html`
- Problemas: **layout/spacing/alignment issues**

**Exemplos:**
- "Página ficou quebrada"
- "Cards estão desalinhados"
- "Mobile não está responsivo"
- "Espaçamento inconsistente entre componentes"
- "Componentes fora de lugar" ⭐ NEW
- "Ficou assimétrico" ⭐ NEW

---

### 🏗️ **03-page-architecture.md** ⭐⭐ (NOVO!)
Use quando o prompt menciona:
- "falta hierarquia visual", "página confusa/desorganizada"
- "não sei por onde começar", "elementos desequilibrados"
- "seções sem estrutura", "fluxo não intuitivo"
- "falta organização visual", "navegação difícil"
- Padrões: visual hierarchy, section organization, page layout, information design
- Arquivos: estrutura geral da página, seções, panels, grids
- Problemas: **page-level architecture, hierarchy, balance, flow**

**Exemplos:**
- "Falta hierarquia visual na página"
- "Página fica confusa, não entendo por onde começar"
- "Elementos estão desequilibrados"
- "Seções não têm estrutura clara"
- "Fluxo de navegação não é intuitivo" ⭐
- "Espaçamento entre seções é inconsistente" ⭐

---

### ⚡ **04-canvas-optimization.md**
Use quando o prompt menciona:
- "performance", "FPS", "slow", "lag", "stutter"
- Arquivos: `mesa-renderer-v2.js`, `mesa-renderer-worker.js`, `mesa-drawing.js`
- Padrões: rendering, Canvas API, OffscreenCanvas, zoom/pan
- Problemas: frame drops, rendering bottleneck, memory spikes

**Exemplos:**
- "Mesa está lenta com 100 tokens"
- "Otimize rendering da Mesa"
- "FPS drops no zoom"
- "OffscreenCanvas está bloqueando main thread"

---

### 📊 **05-frontend-performance-checklist.md**
Use quando o prompt menciona:
- "deploy", "before release", "checklist", "audit", "quality"
- Arquivos: scripts order, `?v=` query strings, build output
- Padrões: build verification, cache-busting, minification
- Problemas: missing cache headers, script order wrong, console errors

**Exemplos:**
- "Checklist completo antes de fazer deploy"
- "Validate build para GitHub Pages"
- "Audit performance antes de release"
- "Verifique cache-busting nas scripts"

---

### 📈 **06-canvas-rendering-benchmark.md**
Use quando o prompt menciona:
- "benchmark", "profile", "measure", "FPS", "performance comparison"
- Investigação: Canvas API vs WebGL, memory usage, rendering time
- Problemas: cena complexa, muitos tokens, validar stack choice

**Exemplos:**
- "Benchmark Canvas rendering com 200 tokens"
- "Profile FPS da Mesa"
- "Canvas API é suficiente ou precisa Three.js?"
- "Measure memory usage do renderizador"

---

## 🎯 Fluxo de Decisão

```
User digitou um prompt?
    ↓
Menciona "revise", "code review", "memory leak"?
    → Use 01-code-review-frontend
    ↓
Menciona "design", "theme", "contrast", "CSS", "text integrity"?
    → Use 02-dark-mode-design-expert
    ↓
Menciona "layout quebrado", "assimétrico", "espaçamento", "components"?
    → Use 02b-layout-integrity-checker
    ↓
Menciona "hierarquia", "confuso", "seções", "fluxo intuitivo", "desequilibrado"?
    → Use 03-page-architecture
    ↓
Menciona "lento", "FPS", "lag", "rendering", "optimiz"?
    → Use 04-canvas-optimization
    ↓
Menciona "deploy", "checklist", "antes de release", "audit"?
    → Use 05-frontend-performance-checklist
    ↓
Menciona "benchmark", "profile", "measure", "performance compare"?
    → Use 06-canvas-rendering-benchmark
    ↓
Nenhuma match? Use context:
    → Qual é a tarefa mais relevante?
    → Escolha a skill mais próxima
    → Se ambíguo, pergunte ao usuário
```

---

## 💡 Exemplos de Prompts Reais

### Exemplo 1: Code Review
```
"Revise o mesa-drawing.js para memory leaks"
→ Usa: 01-code-review-frontend
```

### Exemplo 2: Design Audit
```
"O contraste do texto em dark mode está ruim, melhore"
→ Usa: 02-dark-mode-design-expert
```

### Exemplo 3: Page Architecture Problem
```
"A página de NPCs está confusa, falta hierarquia"
→ Usa: 03-page-architecture
```

### Exemplo 4: Performance Problem
```
"Mesa trava quando zoom muito. Otimize"
→ Usa: 04-canvas-optimization
```

### Exemplo 5: Pre-deployment
```
"Faça audit completo antes eu fazer deploy"
→ Usa: 05-frontend-performance-checklist
```

### Exemplo 6: Investigation
```
"Canvas API é suficiente ou preciso Three.js para 300 tokens?"
→ Usa: 06-canvas-rendering-benchmark
```

---

## 🔧 Como Claude Usa Este Dispatcher

1. User digita um prompt
2. Claude lê `.claude/SKILL_DISPATCHER.md` (este arquivo)
3. Claude identifica qual skill aplica
4. Claude automaticamente lê o arquivo da skill
5. Claude executa a análise/revisão seguindo aquele padrão

**Nenhuma ação manual necessária!**

---

## 📝 Notas

- Este dispatcher é **inteligente** — se múltiplas skills se aplicam, Claude escolhe a mais relevante
- Se ambíguo, Claude pode pedir clarificação: "Você quer revisar código ou otimizar performance?"
- O dispatcher é um **guia**, não um bloqueio — Claude sempre pode usar múltiplas skills em sequência se fizer sentido

---

## 🎓 Para o Claude

**Leia isto toda vez que um user escrever um prompt. Use o fluxo de decisão acima para:**
1. Identificar qual skill é mais apropriada
2. Ler o arquivo `.claude/skills/NN-skill-name.md`
3. Executar a análise seguindo aquele padrão
4. Informar ao user qual skill foi usada: `✅ Usando skill: 01-code-review-frontend`

**Se múltiplas skills se aplicam:** combine-as em ordem de prioridade.

**Se nenhuma skill se aplicar:** processe o prompt normalmente, mas considere se alguma skill seria útil de todas formas.

---

## 🔄 Auto-Improvement Loop

**IMPORTANTE: Após cada skill execution:**

1. **Avalie:** A skill escolhida foi apropriada?
   - ✅ Perfeita → continue
   - ⚠️ Parcial → registre feedback
   - ❌ Errada → registre error case

2. **Registre em `.claude/SKILL_IMPROVEMENTS.md`:**
   ```markdown
   ### [2026-06-15] - 01-code-review-frontend - ✅ Apropriada
   
   **Prompt do usuário:**
   "Revise o mesa-drawing.js para memory leaks"
   
   **Apropriada?** ✅ Sim
   
   **Feedback:**
   - Skill escolhida corretamente
   - Padrão "memory leak" + filename match funcionou bem
   ```

3. **Periodicamente melhore:**
   - Após ~10 usos: analise padrões de erro
   - Proponha melhorias nas regras
   - Informe ao Tiago: "Identifiquei X melhorias nas skills"

4. **Aplique melhorias aprovadas:**
   - Atualize `SKILL_DISPATCHER.md` com novas regras
   - Documente versão (v1.0 → v1.1)
   - Mantenha histórico de mudanças

**Meta:** Skills ficam mais precisas com o tempo!
