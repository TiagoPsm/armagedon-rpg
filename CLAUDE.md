# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Armagedom** (official spelling, with M; the API URL keeps "armagedon" for historical reasons) — static RPG campaign portal for a tabletop group. Frontend is plain HTML/CSS/JS with no bundler. The live API runs on Cloudflare Workers + D1. Realtime (Mesa scene sync) uses Cloudflare Durable Objects via WebSocket.

Owner: Tiago (TiagoPsm) — game master. Respond in **PT-BR**.

---

## Commands

```powershell
# Syntax check all JS files
npm run check:js

# Check for broken references, missing files, duplicate IDs in HTML
npm run audit:static

# Check that every open pendency lives in DEV_STATUS.md "Pendencias Vivas"
npm run audit:pendencias

# Check that every static visible button has an owner (data-armed / onclick)
npm run test:controles

# Build static artifact for GitHub Pages → _site/
npm run build:pages

# Run Playwright test suites
npm run test:mesa          # mesa unit/integration
npm run test:mesa:audit    # regressao dos 11 bugs da auditoria (permissoes, camada dm, sync)
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
| `ficha.html` | `js/ficha-core.js`, `js/ficha-sheet.js`, `js/ficha-master.js`, `js/ficha-inventory.js`, `js/ficha-memories.js`, `js/ficha-soul.js`, `js/ficha-dice.js`, `js/ficha-habs.js`, `js/ficha-passives.js`, `js/ficha-init.js` |
| `mesa.html` | `js/mesa-core.js`, `js/mesa-stage.js`, `js/mesa-roster.js`, `js/mesa-inspector.js`, `js/mesa-storage.js`, `js/mesa-drawing.js`, `js/mesa-select.js`, `js/mesa-map.js`, `js/mesa-grid.js`, `js/mesa-fog.js`, `js/mesa-ping.js`, `js/mesa-ruler.js`, `js/mesa-dice.js`, `js/mesa-scenes.js`, `js/mesa-initiative.js` |
| `regras.html` | `js/regras.js` |
| `sugestoes.html` | `js/sugestoes.js` |

### API and persistence

- `js/runtime-config.js` holds the live API base URL (`https://armagedon-api.tiagopsm2008.workers.dev/api`). Edit this to point to a different backend.
- `js/api.js` wraps all HTTP + WebSocket calls.
- Production data lives in **Cloudflare D1** (SQLite). `localStorage` is only a fallback/cache — never make it the primary source for a logged-in session.
- Mesa scene (`GET/PUT /api/mesa/scene`) and realtime (`GET /api/mesa/realtime` → WebSocket) are the two Mesa-specific API endpoints.

### Cloudflare Worker (`cloudflare/`)

- Entry: `cloudflare/src/index.js`
- Auth: JWT via `cloudflare/src/auth.js`; passwords use PBKDF2 with per-user salt (legacy sha256 hashes migrate on first valid login); master bootstrap via env secrets `MASTER_BOOTSTRAP_PASSWORD`, `PASSWORD_PEPPER`, `JWT_SECRET`; login rate-limited via D1 table `login_throttle`
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

- **Renderer**: tokens are rendered 100% in DOM (the Canvas/OffscreenCanvas renderer was removed in 2026-06-30, Etapa 33). Canvas is used only for drawings (`#mesaDrawCanvas`).
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

The pre-commit hook (`tools/install-obsidian-hooks.ps1`) regenerates `docs/obsidian/10-SNAPSHOT-AUTOMATICO.md` on every commit. That file is **gitignored** (since 2026-08-21): it is stamped with the previous commit, so it could never be part of the commit that regenerates it and left the tree dirty after every single commit. It is local context for Obsidian, not source.

### One list of open pendencies

**Every open pendency lives in the `## Pendencias Vivas` section at the top of `DEV_STATUS.md` — nowhere else.** Etapa blocks narrate what happened; they do not open pendencies. Closing an item means deleting it from that list and recording the closure in the etapa block that closed it.

Why: until 2026-08-16 each etapa wrote its own pendencies inside its own block, in a file that grows top-down, and nothing ever forced a later etapa to go back and close them. The result was 28 mentions scattered across 9 places in 6 formats, several dead for weeks — one listed "Etapa 7: player moves own token" as pending with the "Etapa Concluida — Etapa 7" section directly below it on the same screen. The `.md` rule above already existed and still failed four times, so this one is enforced by `npm run audit:pendencias`, not by memory.

Run it with the other checks before finishing an etapa. Historical blocks are exempt only when the heading itself carries a closure marker (`~~struck~~`, `FECHADA`, `RESOLVIDA`, `CUMPRIDA`, `MOVIDA`, `HISTORICO`) plus the date it was verified.

---

## Key Constraints

- **No localStorage as primary source in production.** If the API session exists, all reads/writes must go through the API.
- **Cache-busting**: when changing a JS or CSS file that is referenced in an HTML `<script src>` or `<link>`, update the `?v=` query string in the HTML file(s) that load it. The **published** site does not serve those tags: `npm run build:pages` concatenates most of them into `css/*-page.bundle.css` / `js/*-page.bundle.js`, whose `?v=` is a **content hash** computed at build time (since 2026-08-21, Etapa 118) — never touch it by hand. It used to be a constant bumped manually, it went stale, and the live site served an old CSS bundle with new HTML for days without a single test failing. `npm run test:build` guards it.
- **`data-armed="1"` on every static button you wire.** When a module attaches a listener to a button that ships in the HTML, it must also set `btn.dataset.armed = "1"` — including buttons served by a delegated handler, which leaves no trace on the element. A visible, enabled, static button with neither `onclick` nor `data-armed` is a silent no-op; `npm run test:controles` fails on it across all six pages. Dynamically rendered buttons are exempt: they are created by a module that is already alive, so they cannot be dead on arrival.
- **`integMax` is editable**: the Worker preserves the client-sent `integMax` and only clamps `integAtual` against it — do not recalculate it from `Alma` on the backend.
- **Skill fields**: always preserve `id`, `name`, `type`, `trigger`, `desc` when normalising a character sheet.
- **Monsters** have no `integMax`, no inventory, no faction.
- **Transfers** (items, memories) must use `DB.batch` in the Worker to avoid partial state.
- Do not commit automatically — always ask Tiago first.

---

## Smart Skill Dispatcher

**Available skills** (read `.claude/SKILL_DISPATCHER.md` for auto-selection rules):

1. **code-review-frontend** — Review JS/Canvas code for memory leaks, event handling, security
2. **dark-mode-design-expert** — Audit visual design, CSS variables, WCAG contrast, dark theme, text integrity
3. **layout-integrity-checker** — Check layout, spacing, alignment, responsiveness, component-level structure
4. **page-architecture** ⭐ — NEW! Page-level hierarchy, section organization, visual balance, information design, navigation flow
5. **canvas-optimization** — Optimize Canvas rendering, FPS, Mesa performance
6. **frontend-performance-checklist** — Pre-deployment audit, cache-busting, build validation
7. **canvas-rendering-benchmark** — Profile rendering, measure FPS, validate Canvas API sufficiency

**How it works:** When Tiago writes a prompt mentioning code review, design, performance, deployment, or profiling, read `.claude/SKILL_DISPATCHER.md` to identify which skill(s) apply. Then automatically read the corresponding `.claude/skills/NN-name.md` file and follow its pattern.

**Example:** If Tiago says "Revise o mesa-drawing.js", you automatically use `01-code-review-frontend.md`.

Always show which skill you're using: `✅ Usando skill: code-review-frontend`.

---

## Auto-Improving Skills System

**Skills learn and improve with every use!** Read `.claude/SKILL_IMPROVEMENTS.md` for the feedback log.

**Your responsibilities after each skill use:**

1. **Log the use:** Record in `.claude/SKILL_IMPROVEMENTS.md`:
   - Was the skill appropriate? (✅ / ⚠️ / ❌)
   - What worked / what didn't
   - Any false positives or edge cases

2. **Propose improvements** (after ~10 uses):
   - Identify patterns in mismatches
   - Suggest new rules or refined triggers
   - Update `SKILL_DISPATCHER.md` (with Tiago approval)

3. **Track versions:**
   - `SKILL_DISPATCHER_v1.0` → v1.1 → v1.2...
   - Keep changelog in comments

**Example improvement cycle:**
```
Use 1-5:  Log feedback
Use 6-10: Identify patterns ("skill X often triggers for Y")
Use 11:   Propose: "Add 'Y' as trigger for skill X"
Use 12:   If Tiago approves → Update SKILL_DISPATCHER.md v1.1
Use 13+:  Use refined rules
```

**Goal:** Skills get smarter the more you use them!
