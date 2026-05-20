# Deploy

## Publicacao Atual

- Repositorio: `TiagoPsm/armagedon-rpg`
- Branch: `main`
- Site: `https://tiagopsm.github.io/armagedon-rpg/`
- Fonte do Pages: GitHub Actions (`build_type: workflow`)
- Workflow: `.github/workflows/pages.yml`
- Workflow preparado para Node 24:
  - `actions/checkout@v6`
  - `actions/configure-pages@v6`
  - `actions/upload-pages-artifact@v5`
  - `actions/deploy-pages@v5`
  - `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`
- `upload-pages-artifact@v5` deve manter `include-hidden-files: true` para preservar `_site/.nojekyll`.

## Arquivos Publicados

O workflow prepara `_site` com:

- `index.html`
- `ficha.html`
- `mesa.html`
- `regras.html`
- `sugestoes.html`
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
- abrir as cinco paginas localmente
- validar console sem erros

## Regra de Layout Para Proximos Upgrades

- Toda alteracao visual precisa preservar layout organizado em desktop e mobile antes de publicar.
- Painel alto nao deve dividir a mesma linha com campos curtos se isso empurrar os campos para baixo ou deixar uma coluna vazia.
- Textos longos devem virar resumo curto, chips, lista ou area recolhivel. Nao deixar frases extensas espremidas em cards estreitos.
- Novos controles devem ter largura minima, quebra responsiva e teste visual quando afetarem Ficha, Mesa, Regras ou Sugestoes.
- Para a Ficha, validar pelo menos desktop largo (1440 x 820) e mobile estreito antes de considerar a mudanca pronta.

Quando houver mudanca em `cloudflare/d1/schema.sql`, aplicar o schema no D1 remoto antes de depender da rota publicada. Para a Mesa oficial, a tabela necessaria e `mesa_scenes`. Para a pagina de Sugestoes, a tabela necessaria e `suggestions`.

## Validacao Apos Deploy

Confirmar:

- GitHub Actions terminou com sucesso
- paginas principais retornam HTTP 200
- `ficha.html` carrega cache bust atual da ficha
- paginas carregam `css/ui.css` e `js/ui.js` atuais
- URLs antigas de MP4 e `/assets/logo-rpg-armagedon.png` retornam 404
- `npm run test:mesa:online` passa ao menos nos testes publicos
- com credenciais reais em variaveis de ambiente, `npm run test:mesa:online` tambem valida mestre/jogador autenticados
- o workflow nao deve emitir aviso de Actions rodando em Node 20

## Ultimo Deploy Confirmado

- Commit: `0c59efd13910681472aec0153ee43d1ee04c3483`
- Mensagem: `Otimiza visual e publicacao do site`
- Resultado: sucesso

## Deploy Cloudflare 2026-05-04

- Schema D1 aplicado no banco remoto `armagedon`.
- Tabela `mesa_scenes` confirmada.
- Worker `armagedon-api` publicado com persistencia D1 inicial.
- Version ID inicial: `44ddb8ef-776e-4bdc-841b-9dd171af1690`
- Worker atualizado com Durable Object realtime da Mesa.
- Version ID realtime: `2cab1568-cc32-4a79-81d0-07851eac7a4a`
- Validacao:
  - `GET /api/health`: HTTP 200
  - `GET /api/mesa/scene` sem sessao: HTTP 401
  - login mestre: HTTP 200
  - `GET /api/mesa/scene` autenticado: HTTP 200
  - duas conexoes `wss://.../api/mesa/realtime`: receberam `mesa:ready`
  - `PUT /api/mesa/scene`: transmitiu `mesa:scene` para outra conexao

## Deploy GitHub Pages 2026-05-04

- Push na `main` publicado pelo workflow `Deploy GitHub Pages`.
- `mesa.html`: HTTP 200 com cache bust `2026-05-01-mesa-scene-1`.
- `js/mesa-core.js`: HTTP 200 e contem `getMesaScene`.
- `js/mesa-stage.js`: HTTP 200 e contem `saveMesaScene`.

## Mesa Online

- Worker atual: `armagedon-api` version ID `fb0548da-a975-4804-bc54-1b740938d31d`.
- GitHub Pages atual: `built` em `main`.
- Comando de smoke online: `npm run test:mesa:online`.
- Credenciais devem ser passadas somente por variaveis locais: `ARMAGEDON_MASTER_USERNAME`, `ARMAGEDON_MASTER_PASSWORD`, `ARMAGEDON_PLAYER_USERNAME`, `ARMAGEDON_PLAYER_PASSWORD`.
- `ARMAGEDON_ONLINE_RELAY_PROBE=1` habilita prova de relay WebSocket; manter desligado quando houver risco de usuarios reais estarem conectados.
