# Contexto Atual

## Projeto

- Nome: Armagedon
- Tipo: portal de campanha de RPG
- Frontend: HTML, CSS e JavaScript puros
- Build: nenhum
- Publicacao atual: GitHub Pages por GitHub Actions
- API publicada: Cloudflare Workers
- Banco publicado: Cloudflare D1
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

## Validacoes Recentes Confirmadas

- `node --check` em JS
- `git diff --check`
- varredura HTML/CSS sem referencia local quebrada
- sem IDs duplicados nas paginas principais
- GitHub Actions `Deploy GitHub Pages` com sucesso
- paginas publicadas retornando HTTP 200
- MP4 antigo e `assets/logo-rpg-armagedon.png` fora do pacote publicado

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
