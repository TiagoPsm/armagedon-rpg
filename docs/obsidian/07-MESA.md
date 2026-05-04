# Mesa

## Responsabilidade

`mesa.html` concentra:

- mesa virtual
- roster de personagens, NPCs e monstros
- palco visual
- tokens
- inspetor de token
- edicao local/online de status
- persistencia oficial inicial da cena no D1 quando a API esta ativa

## Arquivos Principais

HTML:

- `mesa.html`

CSS:

- `css/mesa-base.css`
- `css/mesa-roster.css`
- `css/mesa-stage.css`
- `css/mesa-inspector.css`
- `css/mesa-layout.css`
- `css/mesa-responsive.css`
- `css/ui.css`

JS:

- `js/mesa-core.js`
- `js/mesa-stage.js`
- `js/mesa-roster.js`
- `js/mesa-inspector.js`
- `js/mesa-storage.js`
- `js/mesa-init.js`

Worker/D1:

- `cloudflare/src/mesa.js`
- `cloudflare/src/index.js`
- `cloudflare/d1/schema.sql`

## Contratos

- Preservar ordem dos scripts em `mesa.html`.
- Nao quebrar drag/move de tokens.
- Jogador pode alterar Integridade atual na propria ficha e na mesa.
- Vida atual nao pode passar da Vida maxima.
- Integridade atual continua limitada pela Integridade maxima.
- Cena oficial usa `GET /api/mesa/scene` e `PUT /api/mesa/scene`.
- Jogadores podem ler a cena; apenas mestre salva posicao, ordem e visibilidade.
- `localStorage` continua apenas como fallback/cache quando a API nao esta ativa.

## Visual

- Mesa usa fundo preto estatico, alinhado ao restante do site.
- Elementos de palco devem ficar legiveis sem depender de fundo animado.
- Glow e camadas decorativas nao devem baixar MP4 ou assets grandes.

## Validacao Recomendada

1. Abrir `mesa.html` logado.
2. Confirmar roster carregado.
3. Adicionar token ao palco.
4. Selecionar token e conferir inspetor.
5. Testar alteracao de status permitido.
6. Com API ativa, mover/adicionar/remover token como mestre e confirmar `PUT /api/mesa/scene`.
7. Reabrir a pagina e confirmar que a cena vem de `GET /api/mesa/scene`.
8. Conferir console sem erros.

## Pendencia Imediata

- Publicar frontend no GitHub Pages com os scripts da Mesa versionados como `2026-05-01-mesa-scene-1`.
- Validar no site oficial com mestre logado: mover/adicionar/remover token, recarregar e confirmar persistencia.
- Realtime com Durable Objects/WebSocket continua fora desta etapa.
