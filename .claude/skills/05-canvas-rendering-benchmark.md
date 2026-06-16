# Canvas Rendering Benchmark & Analysis

**Source:** [Shirajuki/js-game-rendering-benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark)

## Descrição
Benchmark que compara Canvas API vanilla vs Pixi.js vs Three.js vs Babylon.js vs Phaser.
Valida sua escolha de OffscreenCanvas + Canvas API.

## Quando usar
- Performance degrada com 200+ tokens?
- Considerando mudar para WebGL/Three.js?
- Profiling de FPS, memory, rendering time
- Justificar stack choice para refactor

## Cenários de teste para Armagedom

### 1. 100 tokens estáticos
```
✅ Canvas API puro — rápido, sem gargalo
```

### 2. 50 tokens animados (movimento + ataque)
```
✅ OffscreenCanvas Worker — off-main-thread
✅ Profiler: tempo de sync ImageBitmap?
```

### 3. Renderização de fundo + grid
```
✅ Separar em layer estática
❌ Não renderizar grid frame-a-frame
```

### 4. Drag & zoom 8x
```
✅ CSS `transform: scale()` em vez de Canvas rescale
✅ Profiler: scroll jank?
```

## Benchmark próprio (DIY)
```javascript
// Em mesa-renderer-v2.js ou mesa-init.js
const start = performance.now();
renderer.render(sceneData);
const fps = 1000 / (performance.now() - start);
console.log(`Rendering: ${fps.toFixed(1)} fps`);
```

## Red flags
- FPS < 30 em cenas 50+ tokens
- Memory crescente (memory leak?)
- Main thread bloqueado por Worker
- Zoom/pan com lag

## Checklist
- [ ] Baseline FPS medido com 50 tokens?
- [ ] Latência OffscreenCanvas + ImageBitmap?
- [ ] Canvas API é suficiente ou precisa Three.js?
- [ ] Memory profile estável por 10 min?
