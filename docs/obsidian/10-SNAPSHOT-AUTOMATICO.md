# Snapshot Automatico

> Gerado por `tools/update-obsidian-context.ps1` em 2026-05-19 23:52:00 -03:00.
> Nao edite esta nota manualmente; rode o script novamente para atualizar.

## Leitura Recomendada

1. [[00-INICIO]]
2. [[01-CONTEXTO-ATUAL]]
3. [[03-DECISOES]]
4. Nota da area em trabalho: [[06-FICHA]], [[07-MESA]], [[08-REGRAS]] ou [[05-DEPLOY]]

## Git

- Branch: `main`
- Ultimo commit: `98eeec1 2026-05-12 Expande recursos da Ficha`

### Alteracoes Locais

```text
A  .claude/launch.json
A  .claude/settings.json
AM .claude/settings.local.json
M  cloudflare/d1/schema.sql
M  cloudflare/src/characters.js
M  cloudflare/src/index.js
M  cloudflare/src/mesa-realtime.js
M  cloudflare/src/sheet.js
M  cloudflare/src/soul-progression.js
M  css/ficha-base.css
M  css/ficha-dice-soul.css
M  css/ficha-inventory-memory.css
M  css/ficha-responsive.css
M  css/regras.css
M  css/ui.css
M  docs/obsidian/05-DEPLOY.md
M  docs/obsidian/10-SNAPSHOT-AUTOMATICO.md
M  ficha.html
M  index.html
M  js/api.js
M  js/auth.js
M  js/ficha-core.js
M  js/ficha-dice.js
M  js/ficha-init.js
M  js/ficha-inventory.js
M  js/ficha-sheet.js
M  js/ficha-soul.js
M  js/mesa-core.js
M  js/mesa-stage.js
M  js/regras.js
M  js/soul-essence.js
A  js/sugestoes.js
M  js/ui.js
M  mesa.html
M  regras.html
M  server/sql/schema.sql
M  server/src/app.js
M  server/src/routes/characters.js
M  server/src/routes/rules.js
A  server/src/routes/suggestions.js
M  server/src/services/characters.js
M  server/src/services/rules.js
A  server/src/services/suggestions.js
M  server/src/utils/sheet.js
A  server/src/utils/soul-progression.js
A  sugestoes.html
M  tests/ficha.spec.cjs
M  tools/audit-static.cjs
M  tools/build-pages.cjs
```

### Arquivos Modificados Sem Stage

```text
.claude/settings.local.json
```

### Arquivos Em Stage

```text
.claude/launch.json
.claude/settings.json
.claude/settings.local.json
cloudflare/d1/schema.sql
cloudflare/src/characters.js
cloudflare/src/index.js
cloudflare/src/mesa-realtime.js
cloudflare/src/sheet.js
cloudflare/src/soul-progression.js
css/ficha-base.css
css/ficha-dice-soul.css
css/ficha-inventory-memory.css
css/ficha-responsive.css
css/regras.css
css/ui.css
docs/obsidian/05-DEPLOY.md
docs/obsidian/10-SNAPSHOT-AUTOMATICO.md
ficha.html
index.html
js/api.js
js/auth.js
js/ficha-core.js
js/ficha-dice.js
js/ficha-init.js
js/ficha-inventory.js
js/ficha-sheet.js
js/ficha-soul.js
js/mesa-core.js
js/mesa-stage.js
js/regras.js
js/soul-essence.js
js/sugestoes.js
js/ui.js
mesa.html
regras.html
server/sql/schema.sql
server/src/app.js
server/src/routes/characters.js
server/src/routes/rules.js
server/src/routes/suggestions.js
server/src/services/characters.js
server/src/services/rules.js
server/src/services/suggestions.js
server/src/utils/sheet.js
server/src/utils/soul-progression.js
sugestoes.html
tests/ficha.spec.cjs
tools/audit-static.cjs
tools/build-pages.cjs
```

## Paginas Principais

- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- `sugestoes.html`

## Contagem Rapida

- JavaScript em `js/`: 29 arquivo(s)
- CSS em `css/`: 18 arquivo(s)
- Notas Obsidian: 11 arquivo(s)

## Notas Do Vault

- [[00-INICIO]]
- [[01-CONTEXTO-ATUAL]]
- [[02-ARQUITETURA]]
- [[03-DECISOES]]
- [[04-PENDENCIAS]]
- [[05-DEPLOY]]
- [[06-FICHA]]
- [[07-MESA]]
- [[08-REGRAS]]
- [[09-HISTORICO-DE-SESSOES]]
- [[10-SNAPSHOT-AUTOMATICO]]

## Estrutura De Raiz

```text
[dir]  .claude
[dir]  .githooks
[dir]  .github
[dir]  .wrangler
[dir]  _site
[dir]  assets
[dir]  cloudflare
[dir]  css
[dir]  data
[dir]  docs
[dir]  js
[dir]  node_modules
[dir]  server
[dir]  test-results
[dir]  tests
[dir]  tools
[file] .gitignore
[file] .nojekyll
[file] .server-err.log
[file] .server-out.log
[file] apple-touch-icon.png
[file] debug.log
[file] DEPLOY_FREE.md
[file] DEV_STATUS.md
[file] favicon.ico
[file] favicon.png
[file] ficha.html
[file] index.html
[file] Logo app.jpg
[file] logo-rpg-armagedon.png
[file] logo-rpg-site.jpg
[file] mesa.html
[file] package.json
[file] package-lock.json
[file] README.md
[file] regras.html
[file] render.yaml
[file] sugestoes.html
[file] SYSTEM_RULES.md
[file] vecteezy_abstract-orange-fiery-sparks-and-smoke-from-a-bonfire-with_17782827.mp4
[file] VISUAL_RULES.md
```

## Maiores Arquivos Locais

Use esta lista para evitar publicar arquivos pesados sem necessidade.

```text
   13,08 MB  vecteezy_abstract-orange-fiery-sparks-and-smoke-from-a-bonfire-with_17782827.mp4
   13,08 MB  assets\sheet-fire-background.mp4
    1,33 MB  node_modules\playwright\lib\transform\babelBundleImpl.js
    0,99 MB  assets\logo-rpg-armagedon.png
    0,99 MB  logo-rpg-armagedon.png
    0,99 MB  _site\logo-rpg-armagedon.png
    0,92 MB  node_modules\playwright-core\types\types.d.ts
    0,78 MB  node_modules\playwright-core\types\protocol.d.ts
    0,73 MB  debug.log
    0,62 MB  node_modules\playwright-core\lib\mcpBundleImpl.js
    0,61 MB  node_modules\playwright-core\lib\vite\traceViewer\assets\defaultSettingsView-GTWI-W_B.js
    0,45 MB  node_modules\playwright-core\lib\utilsBundleImpl\index.js
```

## Comando De Atualizacao

```powershell
.\tools\update-obsidian-context.ps1
```
