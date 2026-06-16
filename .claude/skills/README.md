# 🎯 Skills Customizadas para Armagedom

Essas 5 skills foram selecionadas especificamente para melhorar a qualidade do seu projeto de RPG.

## 📋 Índice de Skills

| # | Skill | Foco | Quando usar |
|---|---|---|---|
| **1** | [01-code-review-frontend.md](01-code-review-frontend.md) | Code review JS/Canvas | Revisar `js/mesa-*.js`, `js/ficha-*.js` antes de commit |
| **2** | [02-dark-mode-design-expert.md](02-dark-mode-design-expert.md) | Dark theme + CSS variables | Auditar visual dark fantasy, contrast, tokens |
| **3** | [03-canvas-optimization.md](03-canvas-optimization.md) | Canvas API performance | Otimizar renderização da Mesa, OffscreenCanvas |
| **4** | [04-frontend-performance-checklist.md](04-frontend-performance-checklist.md) | Performance geral | Antes de deploy em `main` |
| **5** | [05-canvas-rendering-benchmark.md](05-canvas-rendering-benchmark.md) | Rendering profiling | Medir FPS, validar Canvas API suficiente |

---

## 🚀 Como usar

### Opção 1: Invocar direto
```bash
# Revisar um arquivo
/code-review js/mesa-renderer-v2.js

# Auditar design
/design:dark-mode-design-expert css/tokens.css

# Performance checklist
npm run build:pages
npm run check:js
```

### Opção 2: Solicitar Claude revisar
- "Faça um `/code-review` do `mesa-drawing.js`"
- "Melhore o contraste no dark theme usando `/dark-mode-design-expert`"
- "Otimize a renderização da Mesa com `/canvas-optimization`"

---

## 🎓 Workflow sugerido

### 1. **Hoje**: Code Review
```bash
/code-review "js/mesa-*.js"
```
Identifica memory leaks, event handling, Canvas patterns.

### 2. **Esta semana**: Dark Theme Audit
Revisar `css/tokens.css` e `css/components.css` contra WCAG AA.

### 3. **Antes de deploy**: Performance Checklist
```bash
npm run check:js
npm run audit:static
npm run build:pages
```

### 4. **Investigação**: Canvas Benchmark
Se Mesa trava com 100+ tokens, profile com DevTools.

---

## 📝 Notas

- **Sem dependências externas** — essas skills usam padrões vanilla JS
- **Integradas com seu CLAUDE.md** — respeitam constraints (ordem scripts, localStorage, etc)
- **Cloudflare-aware** — consideram Worker + D1 + Durable Objects

---

## 🔗 Referências originais

1. [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill)
2. [dark-mode-design-expert](https://github.com/curiositech/some_claude_skills)
3. [MDN Canvas Optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
4. [Front-End-Performance-Checklist](https://github.com/thedaviddias/Front-End-Performance-Checklist)
5. [js-game-rendering-benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark)
