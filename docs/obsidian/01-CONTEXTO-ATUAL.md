# Contexto Atual

## Projeto

- Nome: Armagedon
- Tipo: portal de campanha de RPG
- Frontend: HTML, CSS e JavaScript puros
- Build: nenhum
- Publicacao atual: GitHub Pages por GitHub Actions
- API publicada: Cloudflare Workers
- Banco publicado: Cloudflare D1
- Realtime publicado: Cloudflare Durable Objects + WebSocket
- Backend Express/PostgreSQL: legado, mantido em `server/`

## Workspace Oficial

```text
C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign-git-sync
```

Trabalhar sempre neste checkout. A pasta antiga `rpg-campaign` nao deve ser usada como fonte.

## Site Publicado

```text
https://tiagopsm.github.io/armagedon-rpg/
```

Paginas principais:

- `index.html`
- `ficha.html`
- `mesa.html`
- `regras.html`

## Estado Recente

- fundo animado removido visualmente do carregamento principal
- fundo preto estatico com brilho carmesim sutil
- brilho carmesim no cursor via `css/ui.css` + `js/ui.js`
- ficha recebeu polimento visual em `css/ficha-responsive.css`
- GitHub Pages passou a usar `build_type: workflow`
- workflow publica artifact leve, sem `assets/` inteiro e sem MP4
- Mesa recebeu base de persistencia oficial da cena no D1, com `GET /api/mesa/scene` e `PUT /api/mesa/scene`
- D1 remoto ja possui `mesa_scenes`; Worker `armagedon-api` foi publicado com version ID `44ddb8ef-776e-4bdc-841b-9dd171af1690`
- GitHub Pages ja serve `mesa.html`, `js/mesa-core.js` e `js/mesa-stage.js` com cache bust `2026-05-01-mesa-scene-1`
- Ajuste de 2026-05-04 na Mesa: `js/mesa-core.js` atualiza o diretorio oficial antes de montar o roster e semeia/salva tokens iniciais quando a cena remota vem vazia ou com referencias antigas.
- Cena oficial `default` foi populada no D1 com 5 tokens iniciais apos o deploy da correcao de tokens.
- Ajuste complementar de 2026-05-04: boot da Mesa ficou protegido contra `DOMContentLoaded` perdido para nao manter a tela em `Convidado`/`0 disponiveis`.
- Realtime oficial da Mesa publicado em 2026-05-04: Durable Object `MesaRealtimeRoom`, rota `GET /api/mesa/realtime`, frontend com WebSocket nativo e broadcast `mesa:scene` apos `PUT /api/mesa/scene`.
- Worker `armagedon-api` atualizado para version ID `2cab1568-cc32-4a79-81d0-07851eac7a4a`.
- Correcao de 2026-05-05: `js/auth.js` agora expõe `window.AUTH = AUTH`; sem isso a Mesa podia nao resolver sessao e ficar no HTML inicial `Convidado`/`0`.

## Validacoes Recentes Confirmadas

- `node --check` em JS
- `git diff --check`
- varredura HTML/CSS sem referencia local quebrada
- sem IDs duplicados nas paginas principais
- GitHub Actions `Deploy GitHub Pages` com sucesso
- paginas publicadas retornando HTTP 200
- MP4 antigo e `assets/logo-rpg-armagedon.png` fora do pacote publicado
- WebSocket oficial validado com duas conexoes recebendo `mesa:ready`
- `PUT /api/mesa/scene` validado transmitindo `mesa:scene` com os 5 tokens atuais
- Simulacao de Mesa com sessao real do mestre validou renderizacao de usuario, modo Mestre, 5 tokens e roster carregado apos `window.AUTH` ser exportado

## Direcao Visual

- dark fantasy
- preto profundo
- vermelho carmesim
- atmosfera inspirada em Shadow Slave
- sem redesign estrutural sem pedido explicito

## Regra Operacional

Toda etapa importante deve atualizar os `.md` relacionados, especialmente:

- `DEV_STATUS.md`
- `VISUAL_RULES.md`
- `DEPLOY_FREE.md`
- notas em `docs/obsidian/` quando mudarem contexto, decisao ou pendencia

## Pendencia Imediata Da Mesa

- aguardar GitHub Pages publicar os HTMLs com `auth.js?v=2026-05-05-mesa-auth-export-1`
- validar visualmente no navegador real: mestre coloca/remove tokens e jogador conectado ve a mudanca sem recarregar
