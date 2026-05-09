# Mesa

## Responsabilidade

`mesa.html` concentra:

- mesa virtual
- roster de personagens, NPCs e monstros
- palco visual
- tokens
- inspetor de token
- painel pessoal do jogador abaixo do palco
- edicao local/online da propria ficha no painel do jogador
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
- Jogador pode alterar pela Mesa dados rapidos, atributos, Vida atual, Vida maxima, Integridade atual e inventario da propria ficha.
- `attrAlma` recalcula a Integridade maxima da mesma forma que a Ficha e clampa a Integridade atual.
- Inventario editado pela Mesa deve respeitar a capacidade atual da ficha; jogador nao aumenta capacidade nesta etapa.
- Memorias continuam em leitura no painel do jogador nesta etapa para preservar as regras de transferencia.
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
- Realtime tambem aceita patch interno de ficha:
  - `mesa:sheet:patch` com `{ characterKey, charName?, charClass?, charRace?, charFaction?, charNotes?, attrForca?, attrAgilidade?, attrInteligencia?, attrResistencia?, attrAlma?, vidaAtual?, vidaMax?, integAtual?, integMax?, inv?, clientId, messageId, sentAt }`
  - `sheet:changed` para avisar que uma ficha foi salva via `PUT /api/characters/:key`
- Eventos de ficha devem carregar `key` e `characterKey` para manter compatibilidade entre Ficha e Mesa.
- `PUT /api/mesa/scene` deve persistir no D1 antes de transmitir `mesa:scene`.
- Durable Object `MesaRealtimeRoom` coordena conexoes e presenca; ele nao substitui o D1 como fonte de verdade.
- Jogadores podem ler a cena; apenas mestre salva posicao, ordem e visibilidade.
- Durable Object valida `mesa:sheet:patch`: mestre pode retransmitir qualquer ficha; jogador so pode alterar `characterKey` igual ao proprio usuario; payload de jogador e sanitizado e filtrado antes do relay.
- `mesa:sheet:patch` e `sheet:changed` devem ser transmitidos apenas para mestre e dono da ficha, nunca para outros jogadores.
- `localStorage` continua apenas como fallback/cache quando a API nao esta ativa.
- A Mesa deve chamar `AUTH.refreshDirectory()` antes de montar o roster quando a API esta ativa.
- Jogador deve hidratar a propria ficha com `GET /api/characters/:key` antes de montar o painel pessoal quando a API esta ativa.
- O painel pessoal deve usar a `key` oficial do diretorio quando existir; `username` continua fallback.
- Em modo local/offline, a Mesa deve ignorar `tc_directory_cache` remoto antigo e usar `username`/`tc_sheets` locais para painel pessoal, roster e salvamento.
- Patches de ficha pendentes devem ser enviados em `pagehide` ou aba oculta para reduzir perda de edicao ao sair da pagina.
- NPCs e monstros vindos do Worker devem usar a `key` oficial do diretorio como `characterKey`.
- Cena remota inexistente ou com tokens antigos que nao batem mais com o roster pode ser repovoada por `seedInitialTokens()`; cena remota existente com zero tokens deve continuar vazia para permitir que o mestre monte manualmente pelo roster.
- Em 2026-05-04, a cena `default` do D1 foi encontrada com `0` tokens e populada com 5 tokens iniciais depois do deploy da correcao.
- `js/mesa-core.js` deve iniciar por `bootMesaPage()`, com guarda de execucao unica e fallback para `document.readyState !== "loading"`.
- `Limpar cena` deixa `state.tokens = []` e salva o palco vazio, nao volta a semear tokens automaticamente.
- `auth.js` deve manter `window.AUTH = AUTH`; a Mesa depende de `window.AUTH` para resolver sessao, diretorio e backend.
- Mestre ve roster completo, busca, contagem de disponiveis e acoes de colocar/focar/retirar.
- Jogador nao ve busca, roster de disponiveis, contagem de disponiveis nem acoes de colocar/focar/retirar.
- Jogador ve painel "Meu personagem" com avatar, dados rapidos, atributos, Vida, Integridade, inventario, capacidade e memorias somente da propria ficha.
- Painel do jogador deve ser organizado em abas: `Status`, `Atributos`, `Inventario`, `Memorias` e `Notas`.
- Aba `Status` deve priorizar Vida e Integridade com inputs e acoes rapidas `-1`, `+1`, `0` e `Max`.
- Painel do jogador deve exibir feedback de salvamento/sincronizacao sem criar modal ou bloquear edicao.
- Inventario do jogador na Mesa deve ser compacto: dano aparece apenas em arma, descricao fica recolhida em detalhes e memorias continuam somente leitura.
- Trocar abas no painel do jogador nao deve expor roster, busca, acoes de mestre ou dados de terceiros.
- Em desktop largo, painel pessoal e grids internos devem ter largura maxima para evitar campos esticados e leitura ruim.
- Mesmo com largura maxima, o conteudo interno do painel do jogador deve manter leitura confortavel: cards, inputs, botoes rapidos, atributos, inventario e memorias nao podem ficar pequenos ou mal espacados.
- `content-visibility` pode continuar no roster pesado do mestre, mas deve ficar desligado no painel pessoal do jogador e no inspetor visivel para evitar blocos vazios durante rolagem.
- Se o token do jogador ainda nao estiver em cena, o painel pessoal continua visivel e informa que o mestre ainda nao colocou o token no palco.
- `getSelectedToken()` nao deve devolver token oculto ou fora de permissao por fallback interno.
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
- Vida na Mesa deve usar a mesma escala dinamica vermelho-verde da Ficha.
- Integridade na Mesa deve usar a mesma escala azul da Ficha; evitar fallback dourado/amarelo.
- Avatares renderizados por JS no painel do jogador devem manter `loading="lazy"`, `decoding="async"` e dimensoes estaveis.

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
7. Abrir como jogador e confirmar que nao aparece roster, busca, contagem de disponiveis nem acoes de colocar/focar/retirar.
8. Confirmar que o jogador ve apenas painel "Meu personagem" com a propria ficha.
9. Confirmar abas `Status`, `Atributos`, `Inventario`, `Memorias` e `Notas` sem expor roster ou dados de terceiros.
10. Editar Vida atual, Vida maxima, Integridade atual, atributos, dados rapidos e inventario no painel do jogador e confirmar persistencia na ficha apos recarregar.
11. Usar os botoes rapidos de Vida/Integridade e confirmar que respeitam limites `0` e `Max`.
12. Validar em viewport larga que painel pessoal, recursos e inspetor nao ficam esticados nem vazios.
13. Em modo local/offline, manter um `tc_directory_cache` remoto antigo e confirmar que a Mesa salva em `tc_sheets[username]`, nunca na `key` remota antiga.
14. Com API ativa, abrir a Mesa diretamente como jogador e confirmar que itens/memorias reais aparecem antes de qualquer edicao.
15. Selecionar token alheio como jogador e confirmar que o inspetor nao mostra nome, barras ou dados detalhados.
16. Com API ativa, mover/adicionar/remover token como mestre e confirmar `PUT /api/mesa/scene`.
17. Abrir outra sessao conectada e confirmar recebimento de `mesa:scene` sem recarregar.
18. Jogador altera Vida/Integridade/atributos/inventario e mestre recebe `mesa:sheet:patch`; outro jogador nao recebe painel/dados detalhados dessa ficha.
19. Reabrir a pagina e confirmar que a cena vem de `GET /api/mesa/scene`.
20. Conferir console sem erros.
21. Selecionar token e confirmar que roster nao foi reconstruido.
22. Mover token e confirmar que o save remoto acontece ao soltar, nao durante o movimento.
23. Receber `mesa:scene` igual ao estado local e confirmar que nao ocorre rerender nem novo save.
24. Rodar `npm run test:mesa` para validar Canvas + drag local e painel do jogador.
25. Rodar `npm run test:mesa:online` sem credenciais para validar Pages/API publicados e protecao anonima.
26. Rodar `npm run test:mesa:online` com `ARMAGEDON_MASTER_USERNAME`, `ARMAGEDON_MASTER_PASSWORD`, `ARMAGEDON_PLAYER_USERNAME` e `ARMAGEDON_PLAYER_PASSWORD` para validar login real, diretorio, cena, WebSocket e UI mestre/jogador.
27. Usar `ARMAGEDON_ONLINE_RELAY_PROBE=1` somente quando for aceitavel transmitir um evento de teste `mesa:token:move` para conexoes online da sala.
28. Rodar `npm run perf:mesa` para conferir ausencia de long tasks relevantes no drag.
29. Rodar `npx wrangler deploy --dry-run --config cloudflare/wrangler.toml` apos alterar Durable Object.

## Pendencia Imediata

- Conferir no site oficial com credenciais reais: jogador carrega a propria ficha oficial ao abrir a Mesa, edita Vida/Integridade/atributos/inventario, a Ficha aberta recebe `sheet:changed` e outro jogador nao recebe dados detalhados alheios.
- Novo comando de apoio: `npm run test:mesa:online`.
- Worker publicado para a edicao ampla pela Mesa: `armagedon-api` version ID `d93c6c56-eaf6-4e13-855b-b5640967d7f6`.
- Futuro: normalizar avatars grandes para thumbnails WebP/JPEG ao salvar fichas.
