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
- sincronizacao em tempo real da cena para usuarios conectados

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
- `js/mesa-renderer-v2.js`
- `js/mesa-renderer-worker.js`
- `js/mesa-roster.js`
- `js/mesa-inspector.js`
- `js/mesa-storage.js`
- `js/mesa-init.js`

Worker/D1:

- `cloudflare/src/mesa.js`
- `cloudflare/src/mesa-realtime.js`
- `cloudflare/src/index.js`
- `cloudflare/wrangler.toml`
- `cloudflare/d1/schema.sql`

## Contratos

- Preservar ordem dos scripts em `mesa.html`.
- Nao quebrar drag/move de tokens.
- Jogador pode alterar Integridade atual na propria ficha e na mesa.
- Vida atual nao pode passar da Vida maxima.
- Integridade atual continua limitada pela Integridade maxima.
- Cena oficial usa `GET /api/mesa/scene` e `PUT /api/mesa/scene`.
- Realtime oficial usa `GET /api/mesa/realtime` com WebSocket nativo.
- Realtime tambem aceita deltas internos incrementais:
  - `mesa:token:move`
  - `mesa:token:upsert`
  - `mesa:token:remove`
  - `mesa:scene:clear`
  - `mesa:batch`
- `PUT /api/mesa/scene` deve persistir no D1 antes de transmitir `mesa:scene`.
- Durable Object `MesaRealtimeRoom` coordena conexoes e presenca; ele nao substitui o D1 como fonte de verdade.
- Jogadores podem ler a cena; apenas mestre salva posicao, ordem e visibilidade.
- `localStorage` continua apenas como fallback/cache quando a API nao esta ativa.
- A Mesa deve chamar `AUTH.refreshDirectory()` antes de montar o roster quando a API esta ativa.
- NPCs e monstros vindos do Worker devem usar a `key` oficial do diretorio como `characterKey`.
- Cena remota inexistente ou com tokens antigos que nao batem mais com o roster pode ser repovoada por `seedInitialTokens()`; cena remota existente com zero tokens deve continuar vazia para permitir que o mestre monte manualmente pelo roster.
- Em 2026-05-04, a cena `default` do D1 foi encontrada com `0` tokens e populada com 5 tokens iniciais depois do deploy da correcao.
- `js/mesa-core.js` deve iniciar por `bootMesaPage()`, com guarda de execucao unica e fallback para `document.readyState !== "loading"`.
- `Limpar cena` deixa `state.tokens = []` e salva o palco vazio, nao volta a semear tokens automaticamente.
- `auth.js` deve manter `window.AUTH = AUTH`; a Mesa depende de `window.AUTH` para resolver sessao, diretorio e backend.
- `renderAll()` deve ficar restrito a boot/hidratacao completa; interacoes comuns devem usar `scheduleMesaRender()` com partes especificas.
- Selecionar token nao deve rebuildar roster; deve atualizar classe/ordem do token e inspetor.
- Drag deve alterar apenas `left`, `top` e `zIndex` durante movimento e salvar a cena apenas ao soltar.
- Na rota Canvas, drag deve atualizar o desenho do token em `requestAnimationFrame`, enviar deltas throttled por WebSocket e persistir cena completa apenas ao soltar.
- Durante drag em Canvas/Worker, preferir patches leves de posicao (`updateTokenPosition`/`move-token`) em vez de reconstruir snapshot completo da cena.
- O fundo estatico do palco deve ficar cacheado no Canvas para evitar redesenhar grid/glow em todo frame.
- Efeitos globais como o brilho do cursor devem pausar enquanto `body.mesa-drag-active` estiver ativo.
- `mesa:scene` recebido deve ser ignorado quando a assinatura da cena ja for igual ao estado local; broadcasts multiplos no mesmo frame devem aplicar apenas o ultimo.
- `AUTH.refreshDirectory()` em realtime so deve rodar quando a cena recebida trouxer `characterKey` desconhecida para o roster em cache.
- O palco usa render incremental por `Map<tokenId, element>`; evitar voltar para `stage.innerHTML = ...` completo em toda interacao.
- O palco usa Canvas/Worker por padrao quando suportado; o renderer DOM legado continua disponivel por `localStorage.mesaRenderer = "dom"`.
- `OffscreenCanvas` e Worker sao otimizacao progressiva; se falharem, a Mesa deve cair para Canvas 2D principal sem quebrar o uso.
- Avatares renderizados por JS devem manter `loading="lazy"`, `decoding="async"` e dimensoes estaveis.
- Cards/tokens do palco devem ter tamanho estavel entre selecao, tela cheia e retorno ao modo normal.
- Texto de token, roster e inspetor deve quebrar ou truncar de forma controlada, sem compressao visual ou sobreposicao.

## Visual

- Mesa usa fundo preto estatico, alinhado ao restante do site.
- Elementos de palco devem ficar legiveis sem depender de fundo animado.
- Glow e camadas decorativas nao devem baixar MP4 ou assets grandes.
- Tokens Canvas usam metrica unica de card para evitar mudanca brusca de escala ao alternar fullscreen.
- Areas pesadas da Mesa podem usar `contain: layout paint` quando isso nao alterar o visual.
- `will-change` deve ficar limitado a `.mesa-token.is-dragging`, nao permanente em todos os tokens.
- `content-visibility` pode ser usado em roster/inspetor, mas nunca deve ocultar o palco ativo.

## Validacao Recomendada

1. Abrir `mesa.html` logado.
2. Confirmar roster carregado.
3. Confirmar que jogadores, NPCs e monstros aparecem como tokens quando a cena remota esta vazia.
4. Adicionar token ao palco.
5. Selecionar token e conferir inspetor.
6. Testar alteracao de status permitido.
7. Com API ativa, mover/adicionar/remover token como mestre e confirmar `PUT /api/mesa/scene`.
8. Abrir outra sessao conectada e confirmar recebimento de `mesa:scene` sem recarregar.
9. Reabrir a pagina e confirmar que a cena vem de `GET /api/mesa/scene`.
10. Conferir console sem erros.
11. Selecionar token e confirmar que roster nao foi reconstruido.
12. Mover token e confirmar que o save remoto acontece ao soltar, nao durante o movimento.
13. Receber `mesa:scene` igual ao estado local e confirmar que nao ocorre rerender nem novo save.
14. Rodar `npm run test:mesa` para validar Canvas + drag local.
15. Rodar `npm run perf:mesa` para conferir ausencia de long tasks relevantes no drag.
16. Rodar `npx wrangler deploy --dry-run` em `cloudflare/` apos alterar Durable Object.

## Pendencia Imediata

- Publicar cache bust `2026-05-05-mesa-canvas-v2`.
- Conferir no site oficial com mestre e jogador em abas separadas: mestre adiciona/remove/move token e jogador ve a mudanca por deltas realtime sem recarregar.
- Futuro: normalizar avatars grandes para thumbnails WebP/JPEG ao salvar fichas.
