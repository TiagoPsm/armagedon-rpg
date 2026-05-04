# Deploy

## Publicacao Atual

- Repositorio: `TiagoPsm/armagedon-rpg`
- Branch: `main`
- Site: `https://tiagopsm.github.io/armagedon-rpg/`
- Fonte do Pages: GitHub Actions (`build_type: workflow`)
- Workflow: `.github/workflows/pages.yml`

## Arquivos Publicados

O workflow prepara `_site` com:

- `index.html`
- `ficha.html`
- `mesa.html`
- `regras.html`
- `.nojekyll`
- logos e icones usados
- `css/`
- `js/`
- `data/` quando existir

Nao publicar:

- `assets/` inteiro
- MP4s nao usados
- backend `server/`
- arquivos de ambiente

## Validacao Antes de Deploy

Rodar:

```powershell
node --check js\ui.js
git diff --check
```

Para varredura completa, usar:

- `node --check` em todos os `.js`
- checar referencias locais em HTML/CSS
- checar IDs duplicados
- abrir as quatro paginas localmente
- validar console sem erros

Quando houver mudanca em `cloudflare/d1/schema.sql`, aplicar o schema no D1 remoto antes de depender da rota publicada. Para a Mesa oficial, a tabela necessaria e `mesa_scenes`.

## Validacao Apos Deploy

Confirmar:

- GitHub Actions terminou com sucesso
- paginas principais retornam HTTP 200
- `ficha.html` carrega cache bust atual da ficha
- paginas carregam `css/ui.css` e `js/ui.js` atuais
- URLs antigas de MP4 e `/assets/logo-rpg-armagedon.png` retornam 404

## Ultimo Deploy Confirmado

- Commit: `0c59efd13910681472aec0153ee43d1ee04c3483`
- Mensagem: `Otimiza visual e publicacao do site`
- Resultado: sucesso

## Deploy Cloudflare 2026-05-04

- Schema D1 aplicado no banco remoto `armagedon`.
- Tabela `mesa_scenes` confirmada.
- Worker `armagedon-api` publicado.
- Version ID: `44ddb8ef-776e-4bdc-841b-9dd171af1690`
- Validacao:
  - `GET /api/health`: HTTP 200
  - `GET /api/mesa/scene` sem sessao: HTTP 401

## Deploy GitHub Pages 2026-05-04

- Push na `main` publicado pelo workflow `Deploy GitHub Pages`.
- `mesa.html`: HTTP 200 com cache bust `2026-05-01-mesa-scene-1`.
- `js/mesa-core.js`: HTTP 200 e contem `getMesaScene`.
- `js/mesa-stage.js`: HTTP 200 e contem `saveMesaScene`.

## Proximo Deploy Pendente

- Nenhum deploy pendente para a base de persistencia da Mesa.
- Proxima etapa de produto: validacao logada de mestre/jogador e depois realtime com Durable Objects.
