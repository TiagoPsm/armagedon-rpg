# Front-End Performance Checklist

**Source:** [thedaviddias/Front-End-Performance-Checklist](https://github.com/thedaviddias/Front-End-Performance-Checklist) — ⭐ 17.3k stars

## Descrição
Checklist completa de performance para sites estáticos (seu caso: GitHub Pages + Cloudflare Workers).

## Quando usar
- Antes de cada deploy em `main`
- Auditoria antes de release de feature grande
- Validação de cache-busting (`?v=`)
- Otimização de bundle JS/CSS

## Checklist Armagedom (prioridade)

### 🔴 CRÍTICO
- [ ] Scripts carregam em ordem correta em `ficha.html` e `mesa.html`?
- [ ] `?v=` query strings atualizadas em `<script src>` e `<link>`?
- [ ] CSS minificado antes de deploy (`npm run build:pages`)?
- [ ] Sem console errors ou warnings?
- [ ] localStorage não é fonte primária (API é)?

### 🟡 IMPORTANTE
- [ ] Imagens comprimidas (logo fallback, tiles)?
- [ ] WebSocket latency aceitável para realtime (`mesa-realtime`)?
- [ ] Service Worker cacheando assets static?
- [ ] Lazy loading de imagens pesadas?

### 🟢 NICE-TO-HAVE
- [ ] Lighthouse score ≥90 em Performance
- [ ] Core Web Vitals green (LCP, CLS, FID)
- [ ] Prefetch de crítico apenas (`index.html`)

## Ferramentas
```powershell
npm run check:js          # Syntax check
npm run audit:static      # References, IDs duplicados
npm run build:pages       # Minifica para GitHub Pages
npx lighthouse https://armagedon-api.tiagopsm2008.workers.dev
```

## Arquivos a revisar
- `index.html`, `ficha.html`, `mesa.html` — scripts order, cache-busting
- `js/api.js` — WebSocket handling
- `cloudflare/wrangler.toml` — headers Cache-Control
- `css/` — minificação
