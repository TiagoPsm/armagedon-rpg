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
- A Mesa deve chamar `AUTH.refreshDirectory()` antes de montar o roster quando a API esta ativa.
- NPCs e monstros vindos do Worker devem usar a `key` oficial do diretorio como `characterKey`.
- Cena remota vazia ou com tokens que nao batem mais com o roster deve ser repovoada por `seedInitialTokens()`; se o usuario for mestre, esse estado inicial deve ser salvo no D1.
- Em 2026-05-04, a cena `default` do D1 foi encontrada com `0` tokens e populada com 5 tokens iniciais depois do deploy da correcao.
- `js/mesa-core.js` deve iniciar por `bootMesaPage()`, com guarda de execucao unica e fallback para `document.readyState !== "loading"`.

## Visual

- Mesa usa fundo preto estatico, alinhado ao restante do site.
- Elementos de palco devem ficar legiveis sem depender de fundo animado.
- Glow e camadas decorativas nao devem baixar MP4 ou assets grandes.

## Validacao Recomendada

1. Abrir `mesa.html` logado.
2. Confirmar roster carregado.
3. Confirmar que jogadores, NPCs e monstros aparecem como tokens quando a cena remota esta vazia.
4. Adicionar token ao palco.
5. Selecionar token e conferir inspetor.
6. Testar alteracao de status permitido.
7. Com API ativa, mover/adicionar/remover token como mestre e confirmar `PUT /api/mesa/scene`.
8. Reabrir a pagina e confirmar que a cena vem de `GET /api/mesa/scene`.
9. Conferir console sem erros.

## Pendencia Imediata

- Validar no site oficial com mestre logado: hard reload, tokens iniciais visiveis, mover/adicionar/remover token, recarregar e confirmar persistencia.
- Validar no site oficial com jogador logado: carregar cena salva e respeitar visibilidade/status liberados.
- Realtime com Durable Objects/WebSocket continua fora desta etapa.
