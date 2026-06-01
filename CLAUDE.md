# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Armagedon** — static RPG campaign portal for a tabletop group. Frontend is plain HTML/CSS/JS with no bundler. The live API runs on Cloudflare Workers + D1. Realtime (Mesa scene sync) uses Cloudflare Durable Objects via WebSocket.

Owner: Tiago (TiagoPsm) — game master. Respond in **PT-BR**.

---

## Commands

```powershell
# Syntax check all JS files
npm run check:js

# Check for broken references, missing files, duplicate IDs in HTML
npm run audit:static

# Build static artifact for GitHub Pages → _site/
npm run build:pages

# Run Playwright test suites
npm run test:mesa          # mesa unit/integration
npm run test:ficha         # ficha unit/integration
npm run test:mesa:online   # smoke test against published site (needs env vars)
npm run perf:mesa          # performance regression

# Cloudflare deploy (dry-run first)
npx wrangler deploy --dry-run --config cloudflare/wrangler.toml
npx wrangler deploy --config cloudflare/wrangler.toml

# Update Obsidian context snapshot before a long session
.\tools\update-obsidian-context.ps1

# Install git hooks (updates snapshot on every commit automatically)
.\tools\install-obsidian-hooks.ps1

# Local static server
npx serve . --listen 8000
```

---

## Architecture

### No build step on the frontend

Scripts load via `<script src="...">` tags in order. **Script order in `ficha.html` and `mesa.html` is a contract** — do not reorder without tracing all global dependencies. Functions called by inline `onclick` handlers must stay globally scoped.

### Page → JS module mapping

| Page | Main JS files |
|---|---|
| `index.html` | `js/auth.js`, `js/api.js`, `js/ui.js` |
| `ficha.html` | `js/ficha-core.js`, `js/ficha-sheet.js`, `js/ficha-master.js`, `js/ficha-inventory.js`, `js/ficha-memories.js`, `js/ficha-soul.js`, `js/ficha-dice.js`, `js/ficha-init.js` |
| `mesa.html` | `js/mesa-core.js`, `js/mesa-stage.js`, `js/mesa-roster.js`, `js/mesa-inspector.js`, `js/mesa-storage.js`, `js/mesa-renderer-v2.js`, `js/mesa-drawing.js`, `js/mesa-select.js`, `js/mesa-map.js` |
| `regras.html` | `js/regras.js` |

### API and persistence

- `js/runtime-config.js` holds the live API base URL (`https://armagedon-api.tiagopsm2008.workers.dev/api`). Edit this to point to a different backend.
- `js/api.js` wraps all HTTP + WebSocket calls.
- Production data lives in **Cloudflare D1** (SQLite). `localStorage` is only a fallback/cache — never make it the primary source for a logged-in session.
- Mesa scene (`GET/PUT /api/mesa/scene`) and realtime (`GET /api/mesa/realtime` → WebSocket) are the two Mesa-specific API endpoints.

### Cloudflare Worker (`cloudflare/`)

- Entry: `cloudflare/src/index.js`
- Auth: JWT via `cloudflare/src/auth.js`; master bootstrap via env secret `ARMAGEDON_MASTER_PASSWORD`
- Sheet normalisation: `cloudflare/src/sheet.js` — must preserve skill `id`, `name`, `type`, `trigger`, `desc` and clamp Vida/Integridade before saving
- Mesa realtime: `cloudflare/src/mesa-realtime.js` — Durable Object `MesaRealtimeRoom`; binding `MESA_REALTIME`
- D1 schema: `cloudflare/d1/schema.sql`
- Deploy: `wrangler.toml` in `cloudflare/`

### CSS token system

- `css/tokens.css` — CSS custom properties (colours, spacing, typography)
- `css/reset.css` — base reset
- `css/components.css` — shared UI components
- Page-specific stylesheets: `css/mesa*.css`, `css/ficha*.css`, etc.
- Visual direction: **dark fantasy**, black + deep crimson, inspired by *Shadow Slave*. No animated backgrounds.

### Mesa Virtual specifics

- **Renderer**: Canvas + OffscreenCanvas Worker by default (`mesa-renderer-v2.js` / `mesa-renderer-worker.js`). DOM fallback activated by `localStorage.mesaRenderer = "dom"`.
- **Interaction modes** (`mesa-select.js`): `select` (rubber-band, click-select, selection box with 8 resize handles) and `move` (drag tokens, pan camera).
- **Drawing tools** (`mesa-drawing.js`): pencil, line, rect, ellipse, eraser. Coordinates stored as fractions (0–1) so they scale with zoom.
- **Layers**: tokens layer (default) and map layer — controlled via `data-active-layer` on `#mesaStageWrap`.
- **Zoom and pan**: handled in `mesa-map.js`; zoom state in `_stageZoom`, applied as CSS `transform: scale()` on `#mesaStageInner`.

### Roles

- `master`: sees full roster, can save scene, clear scene, manage all tokens
- `player`: sees shared stage + personal panel for own character only; cannot see available token roster

---

## Mandatory Documentation Rule

**Every change to the site must update the relevant `.md` files in the same step:**

| What changed | Update |
|---|---|
| Behaviour, architecture, main files, deploy | `DEV_STATUS.md` |
| Gameplay rules, permissions, persistence | `SYSTEM_RULES.md` |
| Visual decisions, CSS patterns | `VISUAL_RULES.md` |
| Worker, D1, routes, Cloudflare deploy | `cloudflare/README.md` |

The pre-commit hook (`tools/install-obsidian-hooks.ps1`) auto-updates `docs/obsidian/10-SNAPSHOT-AUTOMATICO.md` on every commit.

---

## Key Constraints

- **No localStorage as primary source in production.** If the API session exists, all reads/writes must go through the API.
- **Cache-busting**: when changing a JS or CSS file that is referenced in an HTML `<script src>` or `<link>`, update the `?v=` query string in the HTML file(s) that load it.
- **`integMax` is editable**: the Worker preserves the client-sent `integMax` and only clamps `integAtual` against it — do not recalculate it from `Alma` on the backend.
- **Skill fields**: always preserve `id`, `name`, `type`, `trigger`, `desc` when normalising a character sheet.
- **Monsters** have no `integMax`, no inventory, no faction.
- **Transfers** (items, memories) must use `DB.batch` in the Worker to avoid partial state.
- Do not commit automatically — always ask Tiago first.
