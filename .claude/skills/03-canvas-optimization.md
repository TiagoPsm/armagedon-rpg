# Canvas API Optimization

**Source:** [MDN - Optimizing Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)

## Descrição
Guia oficial Mozilla para otimizar renderização Canvas, OffscreenCanvas Workers, e high-DPI displays.

## Quando usar
- Performance-test da Mesa (FPS drops, stuttering)
- Refatorar `mesa-renderer-v2.js` ou `mesa-renderer-worker.js`
- Debug blur em telas 4K/Retina
- Otimizar rendering de 100+ tokens

## Técnicas críticas para Armagedom

### 1. Renderize diferenças, não tudo
```javascript
// ❌ ERRADO
ctx.clearRect(0, 0, canvas.width, canvas.height);
drawAllTokens();

// ✅ CORRETO
drawOnlyChangedTokens();
```

### 2. Múltiplas canvas layers (você já faz!)
- **Tokens layer** — muda frequentemente (tokens se movem)
- **Map layer** — muda raramente (fundo, grid)
- Cada uma em seu próprio canvas (composição mais rápida)

### 3. OffscreenCanvas Worker
Seu `mesa-renderer-worker.js` é correto. Cuidar:
- Não bloquear main thread com cálculos pesados ✅
- Usar `requestAnimationFrame()` (não `setInterval()`)
- Passar ImageBitmap de volta para main thread

### 4. High-DPI (Retina/4K)
```javascript
// ❌ ERRADO
canvas.style.width = "800px";
canvas.style.height = "600px";

// ✅ CORRETO
const dpr = window.devicePixelRatio || 1;
canvas.width = 800 * dpr;
canvas.height = 600 * dpr;
ctx.scale(dpr, dpr);
```

### 5. Evitar
- `shadowBlur` — muito custoso
- Renderização de texto em loop (usar textos separados se possível)
- `clearRect()` seguido de `fillRect()` — prefira `fillRect()` direto

## Checklist
- [ ] Renderizando apenas deltas?
- [ ] Dois canvas (tokens + map) ou um?
- [ ] OffscreenCanvas causando latência?
- [ ] High-DPI scaling correto?
- [ ] FPS stable em 60fps?

## Profiling
DevTools → Performance → Record → Identifique onde gasta tempo
