# Snapshot Automatico

> Gerado por `tools/update-obsidian-context.ps1` em 2026-06-13 16:02:54 -03:00.
> Nao edite esta nota manualmente; rode o script novamente para atualizar.

## Leitura Recomendada

1. [[00-INICIO]]
2. [[01-CONTEXTO-ATUAL]]
3. [[03-DECISOES]]
4. Nota da area em trabalho: [[06-FICHA]], [[07-MESA]], [[08-REGRAS]] ou [[05-DEPLOY]]

## Git

- Branch: `main`
- Ultimo commit: `c68ad67 2026-06-12 feat(mesa): jogador move o proprio token com trava global do mestre`

### Alteracoes Locais

```text
M  .claude/settings.local.json
M  .gitignore
M  DEPLOY_FREE.md
M  DEV_STATUS.md
M  README.md
M  SYSTEM_RULES.md
M  VISUAL_RULES.md
D  assets/sheet-fire-background.mp4
M  cloudflare/README.md
M  cloudflare/d1/schema.sql
M  cloudflare/src/characters.js
M  cloudflare/src/index.js
M  cloudflare/src/mesa-realtime.js
M  cloudflare/src/soul-progression.js
M  css/components.css
M  css/ficha.css
M  css/mesa.css
M  css/tokens.css
D  data/personagens.json
M  docs/obsidian/10-SNAPSHOT-AUTOMATICO.md
M  ficha.html
M  index.html
M  js/api.js
M  js/ficha-core.js
M  js/ficha-inventory.js
M  js/ficha-memories.js
M  js/ficha-soul.js
M  js/soul-essence.js
M  mesa.html
M  regras.html
D  render.yaml
D  server/.dockerignore
D  server/.env.example
D  server/Dockerfile
D  server/Procfile
D  server/README.md
D  server/package-lock.json
D  server/package.json
D  server/sql/schema.sql
D  server/src/app.js
D  server/src/config.js
D  server/src/db.js
D  server/src/middleware/auth.js
D  server/src/middleware/require-role.js
D  server/src/routes/auth.js
D  server/src/routes/characters.js
D  server/src/routes/directory.js
D  server/src/routes/rules.js
D  server/src/routes/suggestions.js
D  server/src/routes/transfers.js
D  server/src/services/characters.js
D  server/src/services/rules.js
D  server/src/services/suggestions.js
D  server/src/services/users.js
D  server/src/utils/async-handler.js
D  server/src/utils/http-error.js
D  server/src/utils/jwt.js
D  server/src/utils/password.js
D  server/src/utils/sheet.js
D  server/src/utils/soul-progression.js
M  sugestoes.html
M  test-worker.mjs
M  tests/ficha.spec.cjs
M  tests/mesa.spec.cjs
M  tools/audit-static.cjs
M  tools/build-pages.cjs
D  vecteezy_abstract-orange-fiery-sparks-and-smoke-from-a-bonfire-with_17782827.mp4
```

### Arquivos Modificados Sem Stage

```text
(nenhum)
```

### Arquivos Em Stage

```text
.claude/settings.local.json
.gitignore
DEPLOY_FREE.md
DEV_STATUS.md
README.md
SYSTEM_RULES.md
VISUAL_RULES.md
assets/sheet-fire-background.mp4
cloudflare/README.md
cloudflare/d1/schema.sql
cloudflare/src/characters.js
cloudflare/src/index.js
cloudflare/src/mesa-realtime.js
cloudflare/src/soul-progression.js
css/components.css
css/ficha.css
css/mesa.css
css/tokens.css
data/personagens.json
docs/obsidian/10-SNAPSHOT-AUTOMATICO.md
ficha.html
index.html
js/api.js
js/ficha-core.js
js/ficha-inventory.js
js/ficha-memories.js
js/ficha-soul.js
js/soul-essence.js
mesa.html
regras.html
render.yaml
server/.dockerignore
server/.env.example
server/Dockerfile
server/Procfile
server/README.md
server/package-lock.json
server/package.json
server/sql/schema.sql
server/src/app.js
server/src/config.js
server/src/db.js
server/src/middleware/auth.js
server/src/middleware/require-role.js
server/src/routes/auth.js
server/src/routes/characters.js
server/src/routes/directory.js
server/src/routes/rules.js
server/src/routes/suggestions.js
server/src/routes/transfers.js
server/src/services/characters.js
server/src/services/rules.js
server/src/services/suggestions.js
server/src/services/users.js
server/src/utils/async-handler.js
server/src/utils/http-error.js
server/src/utils/jwt.js
server/src/utils/password.js
server/src/utils/sheet.js
server/src/utils/soul-progression.js
sugestoes.html
test-worker.mjs
tests/ficha.spec.cjs
tests/mesa.spec.cjs
tools/audit-static.cjs
tools/build-pages.cjs
vecteezy_abstract-orange-fiery-sparks-and-smoke-from-a-bonfire-with_17782827.mp4
```

## Paginas Principais

- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- `sugestoes.html`

## Contagem Rapida

- JavaScript em `js/`: 29 arquivo(s)
- CSS em `css/`: 12 arquivo(s)
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
[dir]  docs
[dir]  js
[dir]  node_modules
[dir]  test-results
[dir]  tests
[dir]  tools
[file] .gitignore
[file] .nojekyll
[file] _headers
[file] apple-touch-icon.png
[file] apple-touch-icon.webp
[file] CLAUDE.md
[file] debug.log
[file] DEPLOY_FREE.md
[file] DEV_STATUS.md
[file] favicon.ico
[file] favicon.png
[file] favicon.webp
[file] ficha.html
[file] index.html
[file] Logo app.jpg
[file] Logo app.webp
[file] logo-rpg-armagedon.png
[file] logo-rpg-armagedon.webp
[file] logo-rpg-site.jpg
[file] logo-rpg-site.webp
[file] mesa.html
[file] package.json
[file] package-lock.json
[file] README.md
[file] regras.html
[file] sugestoes.html
[file] SYSTEM_RULES.md
[file] TESTES_MAPA.md
[file] test-worker.mjs
[file] VISUAL_RULES.md
```

## Maiores Arquivos Locais

Use esta lista para evitar publicar arquivos pesados sem necessidade.

```text
   18,23 MB  node_modules\@img\sharp-win32-x64\lib\libvips-42.dll
   13,08 MB  assets\sheet-fire-background.mp4
    1,33 MB  node_modules\playwright\lib\transform\babelBundleImpl.js
    1,03 MB  node_modules\terser\dist\bundle.min.js
    0,99 MB  assets\logo-rpg-armagedon.png
    0,92 MB  node_modules\playwright-core\types\types.d.ts
    0,78 MB  node_modules\playwright-core\types\protocol.d.ts
    0,73 MB  debug.log
    0,62 MB  node_modules\playwright-core\lib\mcpBundleImpl.js
    0,61 MB  node_modules\playwright-core\lib\vite\traceViewer\assets\defaultSettingsView-GTWI-W_B.js
    0,45 MB  node_modules\playwright-core\lib\utilsBundleImpl\index.js
    0,41 MB  node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64.node
```

## Comando De Atualizacao

```powershell
.\tools\update-obsidian-context.ps1
```
