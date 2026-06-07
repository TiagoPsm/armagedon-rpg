# DEV STATUS

Este arquivo registra o estado atual do projeto e deve ser atualizado ao final de cada etapa importante.

## Regra Obrigatoria de Documentacao

Qualquer alteracao no site deve vir acompanhada de atualizacao nos `.md` relacionados. Este arquivo deve ser atualizado sempre que a mudanca afetar comportamento, arquitetura, arquivos principais, deploy, pendencias ou validacoes.

Registro minimo esperado:

- resumo do que mudou
- arquivos principais alterados
- validacoes executadas
- pendencias ou riscos que continuam abertos

## Projeto

- Nome: Armagedon
- Tipo: portal de campanha de RPG
- Frontend: HTML, CSS e JavaScript puros
- API publicada: Cloudflare Workers
- Banco publicado: Cloudflare D1
- Banco local legado/preparado: PostgreSQL em `server/`

## Arquitetura Atual

- Site estatico publicado separadamente da API
- Frontend aponta para a API em:
  - `https://armagedon-api.tiagopsm2008.workers.dev/api`
- Worker usa o banco D1 `armagedon`
- Realtime da Mesa usa Cloudflare Durable Objects com WebSocket nativo
- A ficha e armazenada principalmente em JSON dentro da tabela `characters`
- Nao existe bundler nesta etapa
- `npm run build:pages` gera o artefato estatico `_site/` para o GitHub Pages sem publicar `assets/` inteiro
- Scripts continuam carregados por `<script src="..."></script>`
- A ordem de carregamento dos scripts da ficha e da mesa e parte do contrato atual

## Banco de Dados em Uso

- Banco ativo no site publicado: Cloudflare D1
- Tipo: relacional
- Motor base: SQLite
- Tabelas principais:
  - `users`
  - `characters`
  - `rules_posts`
  - `transfer_audit`

## Regras de Trabalho

- Trabalhar por etapas pequenas e fechadas
- Validar sintaxe e logica ao final de cada etapa
- Informar exatamente quais arquivos foram alterados
- Informar exatamente o que precisa ser enviado ao GitHub
- Nao mudar regras do sistema sem autorizacao explicita
- Usar sempre `C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync` como pasta oficial de trabalho
- Tratar `C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign` como copia antiga/local, nao como fonte para commits
- Manter este arquivo e os demais documentos locais de referencia atualizados em toda mudanca


## Ultima Etapa Concluida (2026-06-06 — Painel "Meu personagem" simplificado)

### O que mudou
- O painel pessoal do jogador na Mesa Virtual ("Meu personagem", `renderPlayerSheetPanel` em `js/mesa-roster.js`) foi enxugado: deixou de exibir/editar Atributos completos (Forca, Agilidade, Inteligencia, Resistencia, Alma), "Dados rapidos" (Nome/Classe/Raca/Faccao/Anotacoes) e as listas detalhadas de Inventario e Memorias direto na mesa.
- Mantido: avatar, nome, status em cena, seletor de personagem (quando ha mais de um), editores de Vida/Integridade (atual e maximo) e os cards-resumo com contagem de itens/memorias.
- Adicionada uma dica fixa orientando o jogador a usar a Ficha de Personagem para editar atributos, inventario, memorias e dados da ficha.
- Motivo: excesso de informacao/edicao duplicada na mesa — o jogador ja tem a Ficha de Personagem para isso; a visao na mesa deve ser rapida e focada no que importa durante a sessao (status, vida/integridade).

### Arquivos alterados
- js/mesa-roster.js — removidas as funcoes `renderPlayerIdentityEditor`, `renderPlayerTextField`, `renderPlayerAttributeEditor`, `renderPlayerInventoryList`, `renderPlayerInventoryItem`, `renderPlayerMemoryList`, `formatMesaItemType` (ficaram sem uso) e as chamadas correspondentes em `renderPlayerSheetPanel`
- css/mesa-roster.css — adicionado `.player-panel-hint`
- mesa.html — cache-bust atualizado: `css/mesa-roster.css`, `js/mesa-roster.js` e `js/mesa-inspector.js` para `?v=2026-06-06-simplify-player-panel-1` (as strings anteriores estavam desatualizadas em relacao ao ultimo commit que tocou esses arquivos, o que fazia alteracoes recentes parecerem "sem efeito" por cache do navegador)

### Validacoes
- npm run check:js: OK (40 arquivos)
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-05 — Tracker de Iniciativa)

### Funcionalidade implementada
- Tracker de iniciativa na Mesa Virtual com sincronizacao em tempo real via WebSocket
- Mestre ativa/encerra o combate com botao INIC. na toolbar
- Jogadores recebem banner "Combate iniciado!" e abrem popup para rolar 1d20 + mod Agilidade (floor(Agilidade/3))
- Resultado enviado ao mestre via mesa:initiative:roll; mestre ordena por total descrescente e faz broadcast
- Mestre avanca turnos (Proximo), reinicia rodada, remove participante individual ou encerra o combate
- Estado da iniciativa persiste na cena (localStorage + Cloudflare D1) e restaurado ao recarregar

### Arquivos principais alterados
- js/mesa-initiative.js (NOVO) — modulo completo de iniciativa
- js/mesa-core.js — delta types adicionados, initiative no payload da cena, restauro no applyMesaSceneSnapshot, init no boot
- cloudflare/src/mesa.js — normalizeMesaScene preserva initiative
- mesa.html — botao toolbar, painel sidebar #vttInitiativeBlock, banner #initiativeBanner, popup #initiativeRollPopup, script tag
- css/mesa.css — estilos do tracker, banner, popup

### Validacoes
- npm run check:js: OK (40 arquivos)
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-05)

- Responsividade da Mesa e da Ficha revisada:

  **Mesa mobile (≤480px):**
  - sidebar passou de scrollável horizontal para coluna vertical, ocupando o espaço restante abaixo do canvas
  - meta chips (Modo/Papel/Fichas) ficam em linha horizontal no topo da sidebar
  - toolbar reduzida a 44px sem o badge de papel e o contador; separadores ocultos
  - canvas fixado em 44vh para garantir espaço ao roster abaixo
  - tabs do roster em grade 2×2, sem overflow
  - botões de ação do token (FOCAR/RETIRAR) com largura completa

  **Mesa tablet (≤900px):**
  - cabeçalho de bloco da sidebar aceita quebra de linha (`flex-wrap: wrap`)
  - badge "X/N PARA COLOCAR" usa fonte e padding menores para não transbordar

  **Mesa ≤700px:**
  - sidebar horizontal com scroll snap (um bloco por vez, largura `min(280px, 80vw)`)
  - meta chips mais compactos

  **Ficha mobile (≤480px):**
  - campos de identidade (Nome/Aspecto/Raça/Facção) empilham em coluna única via `form-row { flex-wrap: wrap }`
  - `soul-core-panel` empilha verticalmente
  - recursos empilham em coluna

  **Ficha tablet (≤768px):**
  - `soul-attribute-cap-grid` quebra para segunda linha no `soul-core-panel`

  **Header global (≤480px):**
  - logo menor (32×32), subtítulo oculto, badge de usuário truncado com ellipsis

  - arquivos alterados: `css/mesa.css`, `css/mesa-roster.css`, `css/components.css`, `css/ficha.css`
  - validações executadas: `npm run check:js` (39 arquivos OK), `npm run audit:static` (OK), QA visual por Playwright em 360px e 768px para mesa e ficha

## Ultima Etapa Concluida (2026-06-01)

- Correcao de sincronizacao do roster e botao de configuracoes da Mesa sempre visivel:

  **Fix 1 — Roster contaminado por localStorage em modo backend:**
  - causa: `buildPlayers`, `buildNpcs` e `buildMonsters` adicionavam ao roster qualquer chave encontrada em `tc_sheets` (localStorage), mesmo que aquele personagem nao existisse no diretorio da API; numa maquina diferente com outro cache local o roster ficava diferente
  - `js/mesa-core.js`: as tres funcoes agora so adicionam entradas vindas do localStorage ao roster quando `isMesaBackendEnabled()` retornar `false`; em modo backend o diretorio da API e a unica fonte de quem aparece no roster
  - cache bust de `mesa-core.js` atualizado para `2026-06-01-backend-roster-1`

  **Fix 2 — Botao de configuracoes da Mesa sempre visivel para o mestre:**
  - causa: `#mesaMapSettingsBtn` ficava oculto ate que um mapa fosse carregado, mas o painel de configuracoes tambem tem o seletor de estilo de tokens, que nao depende de mapa
  - `mesa.html`: removido `hidden` inicial do `#mesaMapSettingsBtn`; adicionado `id="mesaMapScaleGroup"` e `id="mesaMapHint"` para controlar visibilidade por secao
  - `js/mesa-map.js`: `renderMesaMapLayer()` exibe/oculta apenas as secoes de escala e posicao conforme mapa ativo; o botao e mantido visivel para o mestre mesmo sem mapa; `toggleMapSettings()` sincroniza visibilidade de cada secao ao abrir o painel; `initMesaMap()` ja exibe o botao ao detectar papel mestre, antes de qualquer mapa ser carregado
  - cache bust de `mesa-map.js` atualizado para `2026-06-01-settings-always-1`

  - validacoes executadas: `npm run check:js` (39 arquivos OK)
  - status: pronto para revisao e commit

## Estado Funcional Atual

- Login com mestre e jogadores funcionando via API
- Fichas centralizadas no servidor
- Painel do mestre com jogadores, NPCs e monstros
- Mestre abre e salva fichas de jogadores pelo `key` oficial do diretorio, preservando `username` como dono da ficha
- Sistema de regras publicado
- Transferencia de itens entre jogadores
- Transferencia de memorias entre jogadores
- Drop de memoria de monstros
- Progressao por Essencias da Alma implementada
- Rolagem de dados na ficha implementada
- Mesa virtual com roster, palco, inspetor e edicao local/online da ficha propria
- Mesa virtual sincroniza cena em tempo real para mestre e jogadores conectados
- Mesa virtual usa renderer Canvas/Worker por padrao, com fallback Canvas principal e DOM legado via `localStorage.mesaRenderer = "dom"`
- Realtime da Mesa aceita deltas incrementais de token para reduzir payload durante movimento
- Mestre ve roster completo da Mesa; jogador ve palco compartilhado e painel pessoal da propria ficha, sem lista de tokens disponiveis
- Jogador pode alterar pela Mesa: dados rapidos, atributos, Vida atual, Vida maxima, Integridade atual, Integridade maxima e inventario da propria ficha
- Campos numericos da Mesa permitem apagar o valor atual e digitar um novo numero antes de aplicar clamp/salvamento
- Memorias continuam em leitura no painel do jogador nesta etapa para preservar as regras de transferencia
- Vida atual de jogador, NPC e monstro nao pode passar da Vida maxima
- Integridade atual continua limitada pela Integridade maxima

## Estado Visual Atual

- A ficha e a referencia visual principal do projeto
- Direcao atual:
  - dark fantasy
  - preto profundo
  - vermelho escuro
  - atmosfera inspirada em Shadow Slave
- Home/login ja segue essa mesma linguagem visual

## Ultima Etapa Concluida

- Estabilizacao de sincronizacao da Mesa em 2026-05-09:
  - objetivo: remover gargalo/oscillacao em que valores recem editados pela Mesa podiam receber refresh antigo e aparentar rollback ou demora na selecao
  - causa encontrada: `sheet:changed` e `mesa:sheet:patch` podiam recarregar cache remoto antigo enquanto havia patch local pendente; alem disso, cada patch de ficha reprocessava roster/tokens inteiros
  - `js/mesa-core.js`: adicionada janela curta de patch otimista por ficha; eventos remotos agora mesclam esse patch local recente antes de atualizar cache/render
  - `js/mesa-stage.js`: patches da ficha atualizam roster/tokens de forma incremental, sem `refreshMesaRosterFromSheets()` completo em cada tecla; selecionar o mesmo token nao dispara nova ordem nem save de cena
  - `js/mesa-stage.js`: maxima de Vida/Integridade deixou de aplicar clamp no valor atual a cada digito intermediario; o clamp final acontece no `focusout`, evitando rollback ao digitar `30`
  - `mesa.html`: cache bust de `mesa-core.js` e `mesa-stage.js` atualizado para `2026-05-09-sync-lag-1`
  - `tests/mesa.spec.cjs`: regressao simula refresh remoto antigo logo apos edicao local e confirma que Vida/Integridade nao voltam para o valor antigo; tambem cobre clamp visual final quando Vida/Integridade maxima ficam abaixo do valor atual
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Digitacao continua de numeros na Mesa em 2026-05-09:
  - objetivo: permitir digitar valores com multiplos digitos, como `10` ou `30`, sem o campo travar no primeiro digito
  - `js/mesa-stage.js`: o inspetor da Mesa deixou de reconstruir o proprio painel a cada tecla; agora atualiza barra/label localmente e renderiza o inspetor completo apenas ao sair do campo
  - `tests/mesa.spec.cjs`: regressao usa `type("10")` e `type("30")` para cobrir digitacao real no inspetor do mestre e no painel pessoal do jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Edicao livre de maximos de Vida/Integridade em 2026-05-09:
  - objetivo: permitir que jogador e mestre editem diretamente, por numero digitado, Vida atual/maxima e Integridade atual/maxima
  - `js/mesa-roster.js`: painel pessoal do jogador agora mostra `Max` editavel tambem para Integridade
  - `js/mesa-stage.js` e `js/mesa-core.js`: patches da Mesa preservam `integMax` manual e `attrAlma` deixa de sobrescrever a Integridade maxima
  - `js/ficha-core.js`, `js/ficha-sheet.js` e `ficha.html`: Integridade maxima da ficha deixou de ser somente leitura e passou a ser persistida como valor manual
  - `cloudflare/src/sheet.js`, `cloudflare/src/mesa-realtime.js` e `server/src/utils/sheet.js`: backend/Worker preservam `integMax` enviado pelo cliente e apenas clampam Integridade atual pelo maximo salvo
  - `mesa.html` e `ficha.html`: cache bust atualizado para `2026-05-09-free-resource-max-1`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run --config cloudflare/wrangler.toml`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Edicao direta de numeros da ficha pela Mesa em 2026-05-09:
  - objetivo: permitir que mestre e jogador apaguem o valor de campos numericos e digitem o numero novo, sem depender apenas das setas do input
  - `js/mesa-stage.js`: handlers de Vida, Integridade, Vida maxima, atributos e quantidade de item agora ignoram campo numerico temporariamente vazio e restauram o valor seguro apenas ao sair do campo sem preencher
  - `js/mesa-core.js`: painel do jogador e inspetor passaram a tratar `focusout` para restaurar entradas numericas deixadas vazias sem salvar `0` por acidente
  - `js/mesa-roster.js` e `js/mesa-inspector.js`: inputs numericos ganharam `inputmode="numeric"` mantendo o visual e os limites atuais
  - `mesa.html`: cache bust dos scripts da Mesa atualizado para `2026-05-09-numeric-clear-1`
  - `tests/mesa.spec.cjs`: regressao cobre apagar e redigitar Vida no inspetor do mestre, Vida no painel do jogador, atributo e quantidade de item
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Protecao de limpar cena e gradiente da Mesa em 2026-05-09:
  - objetivo: impedir que jogadores vejam/usem `Limpar cena` e melhorar o acabamento dos gradientes da Mesa sem alterar o fluxo simples do painel do jogador
  - `mesa.html`: botao `Limpar cena` inicia oculto e cache bust atualizado para `2026-05-09-mesa-guard-gradient-1`
  - `js/mesa-roster.js`: controles da Mesa agora ocultam/desabilitam `Limpar cena` para jogadores e liberam apenas para mestre
  - `js/mesa-core.js` e `js/mesa-stage.js`: clique e funcao de limpar cena receberam guardas adicionais por papel
  - `css/mesa-base.css` e `css/mesa-stage.css`: gradientes da Mesa foram refinados com camadas carmesim, sombra escura e acento frio sutil, preservando a vibe dark fantasy
  - `tests/mesa.spec.cjs`: regressao cobre `Limpar cena` visivel para mestre e oculto/desabilitado para jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, `npm run perf:mesa`, QA visual por Playwright em desktop/mobile e `git diff --check`
  - status: pronto para publicacao

- Correcao de quebras visuais nos gradientes da Mesa em 2026-05-09:
  - objetivo: remover emendas/linhas visiveis entre tons escuros e carmesim nos paineis da Mesa
  - `css/mesa-base.css`: gradientes dos paineis passaram de faixas lineares/altura fixa para elipses suaves em painel inteiro
  - `css/mesa-stage.css`: gradiente do palco deixou de usar diagonais marcadas e passou a usar manchas radiais com fade gradual
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, QA visual por Playwright em desktop largo e `git diff --check`
  - status: pronto para publicacao

- Retorno da interface simples do painel do jogador na Mesa em 2026-05-09:
  - objetivo: voltar ao controle simples em fluxo unico, sem abas e sem botoes rapidos, preservando a edicao ampla da propria ficha pela Mesa
  - `js/mesa-roster.js`: painel pessoal voltou a renderizar hero, Vida/Integridade, dados rapidos, atributos, inventario e memorias em secoes continuas
  - `js/mesa-core.js` e `js/mesa-stage.js`: removidos estado/handlers mortos de abas e botoes rapidos do painel do jogador
  - `css/mesa-layout.css`: removidos overrides recentes de largura/escala interna que mudavam a primeira leitura da ficha rapida
  - `mesa.html`: cache bust de `mesa-core.js`, `mesa-stage.js`, `mesa-roster.js`, `mesa-roster.css` e `mesa-layout.css` atualizado para `2026-05-09-player-simple-1`
  - `tests/mesa.spec.cjs`: regressao ajustada para garantir ausencia de abas e manter edicao de Vida, Integridade, atributos, dados rapidos e inventario
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, `npm run perf:mesa`, QA visual por Playwright em desktop/mobile e `git diff --check`
  - status: pronto para publicacao

- Painel de edicao completa do jogador na Mesa em 2026-05-08:
  - objetivo: permitir que o jogador edite pela Mesa a propria ficha em tempo real, alem de Vida/Integridade atuais
  - `js/mesa-roster.js` e `css/mesa-roster.css`: painel pessoal ganhou campos editaveis de dados rapidos, atributos, Vida maxima e inventario; itens podem ser adicionados, removidos e editados sem expor roster de tokens
  - `js/mesa-stage.js`: novos handlers aplicam patches locais sem reconstruir o painel a cada tecla; inventario respeita a capacidade atual
  - `js/mesa-core.js`: `mesa:sheet:patch` passou a normalizar texto, recursos, atributos, `inv` e `ownedMemories`; cache local/remoto da Mesa preserva atributos e dados rapidos
  - `cloudflare/src/mesa-realtime.js`: Durable Object agora aceita e sanitiza patches amplos da ficha, mantendo a regra de que jogador so transmite alteracoes da propria `characterKey` e filtrando campos nao permitidos antes do relay
  - `mesa.html`: cache bust de `mesa-core.js`, `mesa-stage.js`, `mesa-roster.js` e `mesa-roster.css` atualizado para `2026-05-08-player-edit-1`
  - `tests/mesa.spec.cjs`: regressao ampliada para cobrir edicao local/online de atributos, dados rapidos e inventario pelo painel do jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `npm run test:mesa:online`, `npx.cmd --yes wrangler@latest deploy --dry-run --config cloudflare/wrangler.toml` e `git diff --check`
  - observacao de QA: o fluxo autenticado de `test:mesa:online` ficou ignorado neste processo porque as variaveis de credenciais nao estavam carregadas; testes publicos online passaram
  - observacao de ferramenta: o Browser integrado falhou antes de abrir a pagina por erro de preparo de arquivos temporarios do runtime; a validacao renderizada especifica ficou coberta pelo Playwright do projeto
  - Worker publicado em 2026-05-08: `armagedon-api`, version ID `d93c6c56-eaf6-4e13-855b-b5640967d7f6`
  - status: implementado e Worker publicado; falta apenas push para GitHub Pages publicar o cache bust do frontend

- Proximo passo da Mesa online em 2026-05-08:
  - `package.json`: adicionado `npm run test:mesa:online`
  - `tests/mesa-online.spec.cjs`: novo smoke test online para GitHub Pages e Cloudflare; sem credenciais, valida `index.html`, `mesa.html`, `ficha.html`, `regras.html`, `/api/health`, bloqueio anonimo de `/api/directory` e `/api/mesa/scene`, e resposta `426` de `/api/mesa/realtime` sem WebSocket
  - fluxo autenticado opcional: quando `ARMAGEDON_MASTER_USERNAME`, `ARMAGEDON_MASTER_PASSWORD`, `ARMAGEDON_PLAYER_USERNAME` e `ARMAGEDON_PLAYER_PASSWORD` estiverem definidos, o teste valida login mestre/jogador, diretorio, cena oficial, WebSocket `mesa:ready`, UI da Mesa como mestre e UI da Mesa como jogador
  - ajuste posterior: seletor do roster autenticado corrigido de `#mesaRosterList` para `#rosterList`; no modo jogador o teste agora valida painel pessoal, busca oculta e ausencia de acoes `data-roster-action`
  - `ARMAGEDON_ONLINE_RELAY_PROBE=1` ativa uma prova extra de relay `mesa:token:move`; deixar desligado por padrao para nao transmitir evento de teste a usuarios reais conectados
  - validacoes executadas sem credenciais reais: `node --check tests/mesa-online.spec.cjs`, `npm run audit:static`, `git diff --check` e `npm run test:mesa:online` com 2 testes passados e 1 autenticado ignorado

- Correcao da edicao de fichas de jogadores pelo mestre em 2026-05-07:
  - problema: o cache local de jogadores gerado a partir do diretorio da API descartava a `key` oficial da ficha e `createPlayerTarget()` montava o alvo apenas com `username`; isso podia abrir/salvar a ficha no identificador errado quando a API entregasse uma `key` diferente ou quando o cache local estivesse desatualizado
  - problema adicional: handlers de realtime da ficha acessavam `currentSheetTarget.key` mesmo quando o mestre estava no painel principal, onde `currentSheetTarget` e nulo; um broadcast de ficha/inventario/memoria podia gerar erro de console antes da abertura/edicao da ficha
  - `js/auth.js`: `AUTH.setDirectoryCache()` agora preserva `id`, `key`, `username`, `charname`, `inventorySlots` e `usedSlots` no cache `tc_players`
  - `js/ficha-core.js`: `createPlayerTarget()` agora resolve o jogador pelo diretorio oficial ou pelo cache local, usa `player.key` como chave de API e mantem `player.username` como owner; os handlers de realtime usam guarda nula e comparacao normalizada
  - varredura profunda encontrou outra classe de bug: cache de diretorio remoto antigo podia contaminar o modo local/offline; `js/ficha-core.js` e `js/mesa-core.js` agora so usam `tc_directory_cache` quando o backend esta ativo, preservando `username`/`tc_sheets` locais no modo local
  - varredura extra fora do plano encontrou fragilidade em transferencias: item/memoria ainda podiam escolher destino por `username`; `js/ficha-inventory.js` e `js/ficha-memories.js` agora usam `player.key` em modo API, mantem `username` no modo local e evitam erro quando nao ha destino disponivel
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `auth.js` atualizado para `2026-05-07-master-sheet-key-1`; `ficha.html` tambem atualizou `ficha-core.js`, `ficha-inventory.js` e `ficha-memories.js`; `mesa.html` atualizou `mesa-core.js`
  - `tests/ficha.spec.cjs`, `tests/mesa.spec.cjs` e `package.json`: adicionadas regressoes `npm run test:ficha` e `npm run test:mesa`, simulando mestre salvando uma ficha de jogador em `/api/characters/:key`, transferencia de item usando `targetKey` oficial e Mesa local salvando no `username` local mesmo com diretorio remoto antigo
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:ficha`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git fsck --no-dangling`, varredura de MP4 no `_site` e `git diff --check`
  - deploy operacional em 2026-05-07: GitHub Pages ficou `built`, `index.html`, `ficha.html`, `mesa.html` e `regras.html` responderam HTTP 200, API `/api/health` respondeu HTTP 200 e Worker `armagedon-api` foi publicado na version ID `fb0548da-a975-4804-bc54-1b740938d31d`
  - observacao de ambiente: `npm run test:ficha` falhou no sandbox com `spawn EPERM`; o mesmo teste passou com permissao elevada porque o Playwright precisa criar worker de teste
  - status: correcao publicada na `main`; proxima pendencia e validacao manual ponta a ponta com mestre e jogador reais no site oficial

- Correcao da edicao da ficha pela Mesa em 2026-05-07:
  - problema: o painel do jogador podia editar o cache local da Mesa, mas a pagina nao buscava a ficha oficial do jogador antes de montar o painel; alem disso, a Ficha escutava `sheet:changed.key` enquanto o Worker emitia `sheet:changed.characterKey`
  - `js/mesa-core.js`: a Mesa agora hidrata a propria ficha do jogador via `GET /api/characters/:key` antes de montar o roster/painel, usa a `key` oficial do diretorio quando existir e aceita patch de ficha propria tambem por entrada/token pertencente ao usuario
  - `js/mesa-stage.js`: patches pendentes de Vida/Integridade sao enviados imediatamente em `pagehide`/aba oculta com `keepalive`; o save remoto continua usando debounce durante edicao normal
  - `js/ficha-core.js`: `sheet:changed` agora aceita `key`, `characterKey` ou `targetKey`, permitindo que a ficha aberta recarregue quando a Mesa salva o status
  - `cloudflare/src/index.js` e `cloudflare/src/mesa-realtime.js`: eventos de ficha passam a carregar `key` e `characterKey` para compatibilidade entre Mesa e Ficha
  - `mesa.html` e `ficha.html`: cache bust atualizado para `2026-05-07-sheet-edit-1`
  - `tests/mesa.spec.cjs`: adicionada cobertura com backend simulado confirmando que o jogador carrega a ficha oficial, ve itens/memorias reais e persiste Vida/Integridade via `PUT /api/characters/:key`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git fsck --no-dangling` e `git diff --check`
  - Worker publicado em 2026-05-07: `armagedon-api`, version ID `b89440a2-65c6-4d1e-8fcb-9b17c2236c6a`
  - pendencia pos-push: acompanhar GitHub Pages na `main` e conferir o site oficial com jogador editando Vida/Integridade pela Mesa

- Painel pessoal do jogador na Mesa em 2026-05-06:
  - objetivo: ocultar do jogador o roster de tokens disponiveis, manter o palco compartilhado e permitir edicao apenas de Vida atual e Integridade atual da propria ficha
  - `js/mesa-core.js`: adicionados helpers de papel/privacidade (`isOwnPlayerToken`, `getOwnPlayerTokens`, `getOwnSheetSnapshot`, `canViewDetailedTokenInfo`), cache de snapshot da propria ficha e assinatura do evento `mesa:sheet:patch`
  - `js/mesa-roster.js` e `css/mesa-roster.css`: roster do mestre preservado; jogadores passam a ver painel "Meu personagem" com avatar, Vida, Integridade, itens, capacidade e memorias em leitura
  - `js/mesa-stage.js`: selecao e status respeitam permissao de token; patch de ficha nao persiste cena visual; painel do jogador edita valores atuais sem reconstruir a UI a cada tecla
  - `js/mesa-inspector.js`: jogador nao ve detalhes de token alheio no inspetor inferior; tokens nao autorizados viram leitura restrita da cena
  - `js/mesa-renderer-v2.js`, `js/mesa-renderer-worker.js`, `css/mesa-stage.css` e `css/mesa-inspector.css`: Vida e Integridade usam a mesma formula visual da ficha original; Integridade deixou de usar fallback dourado na Mesa
  - `cloudflare/src/mesa-realtime.js`: Durable Object aceita `mesa:sheet:patch`, valida que jogador so altera a propria ficha e retransmite patch apenas para mestre e dono da ficha
  - `cloudflare/src/index.js`: `PUT /api/characters/:key` dispara `sheet:changed` para Mesa/Ficha atualizarem snapshot quando a ficha for salva
  - `mesa.html`: cache bust atualizado para `2026-05-06-player-panel-1`
  - `tests/mesa.spec.cjs`: adicionada cobertura de jogador sem roster, painel pessoal, privacidade do inspetor e edicao de Vida/Integridade
  - Worker publicado em 2026-05-07: `armagedon-api`, version ID `f749f048-5040-4f6a-a43d-e1e5aaae48f2`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git diff --check` e smoke visual no Browser integrado em servidor local
  - observacao de QA: o Browser integrado bloqueou `javascript:` URL para semear `localStorage`; o fluxo especifico de jogador foi validado por Playwright, e o Browser foi usado para smoke visual seguro da Mesa local

- Polimento de fluidez do drag da Mesa em 2026-05-06:
  - objetivo: reduzir microtravadas ao mover tokens sem alterar a aparencia geral da Mesa
  - `js/mesa-renderer-v2.js`: renderer passou a cachear o fundo estatico do palco em Canvas, evitando redesenhar grid/glow em todo frame; tambem passou a manter lista ordenada e layouts em cache
  - `js/mesa-renderer-v2.js` e `js/mesa-renderer-worker.js`: drag em Canvas/Worker agora usa mensagem leve `move-token` para atualizar apenas posicao/layout do token movido, sem reconstruir snapshot completo a cada movimento
  - `js/mesa-stage.js`: movimento local usa `updateTokenPosition()` durante drag; realtime de drag foi ajustado para intervalos menores e mais suaves sem salvar remoto antes do `pointerup`
  - `js/ui.js` e `css/ui.css`: brilho carmesim do cursor pausa enquanto a Mesa esta em drag, reduzindo pintura concorrente no momento mais sensivel
  - `mesa.html`: cache bust atualizado para `2026-05-06-drag-polish-1`
  - `tests/mesa.performance.spec.cjs`: teste de performance agora confirma que o drag usa patches leves de movimento e nao render completo a cada movimento
  - validacoes executadas: `npm run check:js`, `npm run test:mesa`, `npm run perf:mesa` e `git diff --check`

- Estabilizacao visual dos cards da Mesa em 2026-05-05:
  - objetivo: impedir que os cards/tokens mudem de tamanho ao selecionar, entrar em tela cheia e voltar ao modo normal
  - `js/mesa-renderer-v2.js`: dimensoes do token Canvas passaram a ser estaveis entre modo normal e fullscreen; largura base aumentada para uma faixa maior que a anterior e altura ajustada para comportar nome, dono e barras sem colisao
  - `js/mesa-renderer-v2.js` e `js/mesa-renderer-worker.js`: textos do token no Canvas agora usam quebra/truncamento controlado em vez de comprimir a linha dentro do `fillText`
  - `js/mesa-stage.js`: mudanca de fullscreen tambem reagenda o redraw do palco, mantendo Canvas e estado visual sincronizados
  - `css/mesa-responsive.css`: fallback DOM recebeu largura unica para `.mesa-token` em modo normal/fullscreen, avatar com proporcao estavel e regras de `overflow-wrap` para roster, inspetor, badges, botoes e textos longos
  - `mesa.html`: cache bust atualizado para a correcao `2026-05-05-card-stability-1`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages` e `git diff --check`

- Otimizacao leve da Mesa em 2026-05-05:
  - objetivo: reduzir custo no navegador sem redesign e sem alterar o formato publico de `GET/PUT /api/mesa/scene` ou `GET /api/mesa/realtime`
  - `js/mesa-core.js`: adicionados cache de referencias DOM, cache de roster por `characterKey`, agendador `scheduleMesaRender()` com `requestAnimationFrame`, dedupe por assinatura estavel da cena e consolidacao de broadcasts `mesa:scene` recebidos no mesmo frame
  - `js/mesa-stage.js`: palco passou a renderizar tokens incrementalmente por `Map<tokenId, element>`; drag atualiza apenas `left/top/zIndex` durante movimento e salva apenas ao soltar
  - `js/mesa-roster.js` e `js/mesa-inspector.js`: renders passam a usar referencias DOM cacheadas; roster so e reagendado quando busca, entrada/saida de token, roster ou fichas mudam
  - `js/mesa-stage.js` e `js/mesa-inspector.js`: imagens de avatar renderizadas via JS agora usam `loading="lazy"`, `decoding="async"` e dimensoes estaveis
  - `css/mesa-stage.css`, `css/mesa-roster.css` e `css/mesa-inspector.css`: adicionados `contain: layout paint` em areas pesadas; `will-change` fica limitado ao token durante drag
  - `mesa.html`: cache bust dos arquivos alterados atualizado para `2026-05-05-mesa-light-1`
  - comportamento preservado: mestre continua colocando, focando, movendo, removendo e limpando tokens; jogadores continuam recebendo a cena por realtime
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; varredura de referencias locais e IDs duplicados; confirmacao de `window.AUTH`; servidor local com HTTP 200 nas quatro paginas principais; simulacao controlada da Mesa confirmando que selecao nao reconstrui roster/palco, drag nao salva durante movimento, drag salva uma vez ao soltar, payload repetido nao salva de novo e `mesa:scene` igual nao rerenderiza

- Correcao de export global da autenticacao em 2026-05-05:
  - problema identificado apos deploy: `auth.js` declarava `const AUTH`, mas nao expunha `window.AUTH`; a Mesa consulta `window.AUTH`, entao podia ficar parada no HTML inicial (`Convidado`, `Jogador`, `0`) mesmo com API e cena corretas
  - `js/auth.js`: adicionada ponte `window.AUTH = AUTH` antes de iniciar `window.AUTH_READY`
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `auth.js` atualizado para `2026-05-05-mesa-auth-export-1`
  - validacao executada: simulacao da Mesa com sessao real do mestre contra a API oficial confirmou `headerUser=mestre`, `roleBadge=Mestre`, `activeTokenCount=5`, roster carregado e copia de realtime ativa

- Realtime oficial da Mesa em 2026-05-04:
  - objetivo: permitir que o mestre adicione jogadores, NPCs e monstros existentes na Mesa e que todos vejam a cena atualizada em tempo real
  - `cloudflare/src/mesa-realtime.js`: criado Durable Object `MesaRealtimeRoom` para aceitar WebSockets, registrar presenca e transmitir eventos da cena
  - `cloudflare/wrangler.toml`: adicionados binding `MESA_REALTIME` e migration `v1-mesa-realtime`
  - `cloudflare/src/index.js`: adicionada rota `GET /api/mesa/realtime`; `PUT /api/mesa/scene` agora salva no D1 e transmite `mesa:scene`
  - `cloudflare/src/auth.js`: `requireAuth()` aceita token JWT por query string para conexao WebSocket do navegador
  - `js/api.js`: removida tentativa antiga de Socket.IO e criada conexao WebSocket nativa para `/mesa/realtime`
  - `js/runtime-config.js`: realtime habilitado, mas a conexao so abre quando a pagina chama `APP.connectRealtime()`
  - `js/mesa-core.js`: Mesa assina `mesa:ready`, `mesa:presence` e `mesa:scene`, atualizando roster/cena ao receber broadcast
  - `js/mesa-stage.js`: `Limpar cena` agora deixa o palco vazio de fato para o mestre adicionar tokens manualmente pelo roster
  - `js/mesa-roster.js` e `mesa.html`: textos atualizados para comunicar sincronizacao ao vivo e contagem `disponiveis/total`
  - `js/auth.js`: sessao backend pode ser recuperada a partir de token salvo quando o objeto de sessao local estiver ausente
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `runtime-config.js`, `api.js` e `auth.js` atualizado para `2026-05-04-mesa-realtime-1`
  - Worker publicado: `armagedon-api`, version ID `2cab1568-cc32-4a79-81d0-07851eac7a4a`
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; `wrangler deploy --dry-run`; servidor local com HTTP 200 nas quatro paginas; deploy real do Worker; login mestre HTTP 200; `GET /api/mesa/scene` HTTP 200; duas conexoes WebSocket receberam `mesa:ready`; `PUT /api/mesa/scene` transmitiu `mesa:scene` com 5 tokens para outra conexao
  - observacao de QA: Edge headless/CDP nao iniciou neste ambiente; validar visualmente no navegador real apos GitHub Pages publicar o cache bust novo

- Correcao de tokens iniciais da Mesa em 2026-05-04:
  - problema identificado: a API oficial tinha diretorio populado, mas a cena `default` estava salva com `0` tokens; em navegadores com cache/diretorio local desatualizado, a Mesa podia abrir sem tokens de jogadores, NPCs ou monstros
  - `js/mesa-core.js`: Mesa agora atualiza o diretorio pela API antes de montar o roster, usa a `key` oficial de NPCs/monstros quando ela vem do Worker e repopula a cena vazia/stale a partir do roster oficial
  - `mesa.html`: cache bust de `js/mesa-core.js` atualizado para `2026-05-04-mesa-tokens-1`
  - D1 oficial: a cena `default` estava com `0` tokens e foi populada com 5 tokens iniciais do diretorio atual apos o deploy da correcao
  - ajuste complementar: `js/mesa-core.js` agora inicia por `bootMesaPage()` com guarda para `document.readyState`, evitando a tela ficar presa no HTML inicial `Convidado`/`0 disponiveis` se o `DOMContentLoaded` ja tiver passado
  - `mesa.html`: cache bust de `js/mesa-core.js` atualizado para `2026-05-04-mesa-init-guard-1`
  - comportamento esperado: ao abrir como mestre, se a cena remota estiver vazia mas houver personagens cadastrados, a Mesa semeia tokens iniciais e salva a cena oficial no D1; jogadores passam a carregar a cena publicada
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; teste logico de roster/tokens; teste de hidratacao com salvamento remoto; varredura HTML/CSS de referencias e IDs duplicados; links wiki do Obsidian; servidor local com HTTP 200 nas paginas principais; GitHub Pages com sucesso; arquivos publicados com HTTP 200; API oficial confirmada com cena contendo tokens

- Persistencia oficial inicial da Mesa em 2026-05-01:
  - `cloudflare/d1/schema.sql`: adicionada tabela `mesa_scenes` para guardar a cena oficial da Mesa em JSON no D1
  - `cloudflare/src/mesa.js`: criado modulo de leitura, normalizacao e salvamento da cena
  - `cloudflare/src/index.js`: adicionadas rotas `GET /api/mesa/scene` e `PUT /api/mesa/scene`
  - `js/api.js`: adicionados metodos `getMesaScene()` e `saveMesaScene()`
  - `js/mesa-core.js` e `js/mesa-stage.js`: Mesa passa a carregar cena oficial quando a API esta ativa e salvar alteracoes do mestre no servidor, mantendo `localStorage` como fallback
  - `js/mesa-roster.js` e `mesa.html`: textos ajustados para indicar persistencia no servidor sem prometer realtime ainda
  - permissao consolidada: jogadores podem ler a cena oficial; apenas mestre pode salvar posicao, ordem e visibilidade de tokens
  - D1 remoto: schema aplicado em `armagedon` e tabela `mesa_scenes` confirmada
  - Worker publicado: `armagedon-api`, version ID `44ddb8ef-776e-4bdc-841b-9dd171af1690`
  - GitHub Pages publicado pela `main` com cache bust `2026-05-01-mesa-scene-1`
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; links wiki do Obsidian; `wrangler deploy --dry-run`; `wrangler d1 execute` remoto; `GET /api/health` com HTTP 200; `GET /api/mesa/scene` sem sessao com HTTP 401; `mesa.html`, `js/mesa-core.js` e `js/mesa-stage.js` publicados com HTTP 200
  - pendencia: validar em navegador logado como mestre e jogador a persistencia visual completa da cena no site oficial

- Automacao do vault Obsidian em 2026-05-01:
  - `tools/update-obsidian-context.ps1`: criado script para gerar snapshot automatico do estado do repositorio
  - `.githooks/pre-commit`: criado hook versionado para atualizar e adicionar o snapshot do Obsidian antes de cada commit
  - `tools/install-obsidian-hooks.ps1`: criado instalador para configurar `core.hooksPath=.githooks` neste checkout
  - `docs/obsidian/10-SNAPSHOT-AUTOMATICO.md`: passa a ser gerado com branch, ultimo commit, alteracoes locais, paginas principais, estrutura de raiz e maiores arquivos locais
  - `docs/obsidian/00-INICIO.md`: atualizado com o comando de atualizacao e com a regra de leitura do snapshot
  - `README.md`: documentado o fluxo de automacao para reduzir contexto e tokens em sessoes futuras
  - regra operacional consolidada: toda etapa com alteracao de arquivo deve terminar com snapshot atualizado; commits usam hook automatico, etapas sem commit devem rodar o script manualmente
  - validacoes executadas: `.\tools\update-obsidian-context.ps1`; parser PowerShell dos scripts; links wiki do vault; `git diff --check`

- Vault Obsidian de contexto em 2026-05-01:
  - criado `docs/obsidian/` como base Markdown para abrir no Obsidian
  - adicionadas notas de entrada, contexto atual, arquitetura, decisoes, pendencias, deploy, ficha, mesa, regras e historico compacto
  - `README.md`: atualizado para apontar o novo vault como leitura rapida recomendada
  - objetivo: reduzir releitura completa do repositorio, melhorar obtencao de contexto e manter decisoes do projeto organizadas em arquivos versionados

- Polimento visual da ficha em 2026-05-01:
  - `css/ficha-responsive.css`: adicionada camada final para espacamento de secoes, alinhamento de cabecalhos, foco visivel, cards de habilidades/poderes, inventario e modal de rolagem
  - `ficha.html`: atualizado cache bust de `css/ficha-responsive.css` para `2026-05-01-sheet-polish`
  - escopo mantido em visual/ergonomia: sem alteracao em regras de jogo, persistencia, backend ou fluxo de dados
  - validacoes executadas: `node --check` nos JS principais; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; servidor local em `index.html`, `ficha.html`, `mesa.html` e `regras.html` com HTTP 200, sem MP4 e sem `/assets/`; Browser Use no painel do mestre, ficha de jogador, inventario, habilidades/poderes e modal de rolagem sem erros de console

- Brilho carmesim de cursor em 2026-05-01:
  - `css/ui.css`: adicionada camada pequena de glow vermelho carmesim centralizada no ponteiro, com `pointer-events: none` e sem interferir na leitura
  - `js/ui.js`: inicializacao global do efeito com `requestAnimationFrame`, apenas para ponteiro fino e respeitando `prefers-reduced-motion: reduce`
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: carregam a versao `2026-05-01-cursor-glow` de `css/ui.css` e `js/ui.js`
  - validacoes executadas: `node --check` em todos os JS; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; servidor local retornando 200 nas quatro paginas com `ui.css` e `ui.js` presentes

- Simplificacao de fundo visual em 2026-04-30:
  - fundos animados decorativos foram desligados em home, ficha, mesa e regras
  - o site passou a usar base preta estatica com brilho vermelho sutil, preservando a direcao dark fantasy sem custo de animacao de fundo
  - `css/index.css`, `css/style.css`, `css/mesa-base.css`, `css/regras.css`, `css/ficha-layout.css` e `css/ficha-inventory-memory.css` receberam overrides finais para remover orbitas, cinzas, brasas e glow dinamico de fundo
  - validacoes executadas: `node --check` em todos os JS; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; Browser Use nas quatro paginas sem erros de console, sem MP4 e sem requisicoes a `/assets/`

- Otimizacao visual e de velocidade do site em 2026-04-30:
  - `.github/workflows/pages.yml`: o GitHub Pages deixou de copiar a pasta `assets/` inteira, evitando publicar o MP4 pesado `assets/sheet-fire-background.mp4` enquanto ele nao estiver em uso
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: removidos `prefetch` cruzados entre paginas para reduzir requisicoes antecipadas no carregamento inicial
  - HTMLs principais: logos agora usam `width`, `height` e `decoding="async"`; a imagem principal da primeira dobra da home usa `fetchpriority="high"`
  - HTMLs principais: fallback de logo nao depende mais de `assets/logo-rpg-armagedon.png`; permanece limitado a arquivos publicados na raiz
  - CSS principal das paginas: adicionado suporte a `prefers-reduced-motion` e fallback visual para navegadores sem `backdrop-filter`
  - documentacao atualizada: `DEV_STATUS.md`, `VISUAL_RULES.md` e `DEPLOY_FREE.md`
  - validacoes executadas: `node --check` em todos os JS; varredura de referencias HTML/CSS e IDs duplicados; `git diff --check`; Browser Use nas quatro paginas; Edge headless em 1366x900 e 390x844
  - resultado de performance: pacote publicado estimado caiu cerca de 14 MB por nao publicar `assets/` inteiro

- Ajuste visual da ficha em 2026-04-30:
  - `js/ficha-core.js`: habilidades/poderes passam a abrir minimizados por padrao sempre que uma ficha e carregada
  - o estado de expandido/minimizado continua funcionando durante o uso da ficha, mas nao e mais reaproveitado para abrir a ficha expandida em acessos seguintes
  - pendencia: validar no navegador antes de publicar

- Retomada de revisao em 2026-04-30:
  - a pasta antiga `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign` foi excluida com sucesso
  - a pasta oficial restante e `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign-git-sync`
  - `node --check` passou em 48 arquivos JavaScript de `js/`, `cloudflare/src/` e `server/src/`
  - varredura inicial nao encontrou arquivos inexistentes referenciados por `src` ou `href` nos HTMLs
  - varredura inicial nao encontrou IDs duplicados nos HTMLs
  - correcoes aplicadas durante a revisao estatica:
    - `cloudflare/src/sheet.js` agora preserva `id`, `type` e `trigger` das habilidades ao normalizar fichas no Worker
    - `js/ficha-soul.js` agora calcula o estado anterior da Essencia da Alma antes de atualizar `soulCore` no modo local
  - validacao adicional executada: `node --check` em `cloudflare/src/sheet.js`, `cloudflare/src/index.js`, `server/src/utils/sheet.js` e `js/ficha-core.js`
  - validacao funcional automatizada executada com Microsoft Edge headless:
    - normalizacao de habilidades do Worker preserva `id`, `type`, `trigger` e `desc`
    - login local do mestre funciona quando `ARMAGEDON_CONFIG` aponta para API local indisponivel
    - criacao de jogador local, abertura de ficha, criacao de habilidade, salvamento e recarregamento preservam dados
    - rolagem de dados retorna total numerico
    - concessao local de 100 Essencias rank 1 exibe progressao de Adormecido para Despertado no resumo
  - achado remanescente:
    - `server/src/routes/characters.js` nao possui a rota `POST /characters/:key/soul-essence`, embora o frontend chame essa rota quando a API esta ativa; isso afeta o backend Express/PostgreSQL legado, nao o Worker publicado
  - pendencia aberta: continuar revisao funcional em navegador nas telas de ficha, mesa e regras

- Controle de arquivos `.md` desta etapa, em 2026-04-30:
  - `README.md`: registrado o status operacional da limpeza da pasta antiga, deixando claro que `rpg-campaign-git-sync` e a pasta oficial preservada
  - `DEV_STATUS.md`: registrado este resumo de controle para rastrear a etapa
  - validacao executada: listagem das pastas em `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp`
  - pendencia anterior resolvida: o diretorio vazio `rpg-campaign` foi apagado

- Limpeza operacional da pasta antiga:
  - tentativa de apagar `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign`
  - o conteudo interno foi removido
  - em nova tentativa, o diretorio vazio foi excluido com sucesso
  - `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign-git-sync` foi mantida intacta como pasta oficial

- Registro operacional desta conversa:
  - o projeto oficial no Codex passou a ser `rpg-campaign-git-sync`
  - a conversa antiga ainda estava vinculada a `rpg-campaign`, por isso o Windows bloqueou apagar ou renomear a pasta antiga
  - comparacao meticulosa entre as pastas indicou `0` arquivos exclusivos na pasta antiga
  - a pasta oficial tem arquivos a mais e esta alinhada com `origin/main`, portanto segue sendo a fonte de verdade
  - proximos passos devem acontecer em novo chat/projeto apontando para `rpg-campaign-git-sync`
  - a pasta antiga so deve ser enviada para a Lixeira depois que chats, terminais e apps que ainda usam `rpg-campaign` forem fechados

- Pasta oficial de trabalho consolidada: toda alteracao futura deve usar `rpg-campaign-git-sync`, que e o checkout Git alinhado com `origin/main`
- A pasta antiga `rpg-campaign` permanece apenas como copia historica/local e nao deve ser usada para publicar
- Documentacao `.md` atualizada para registrar essa regra operacional antes do proximo passo
- Etapa anterior:
  - commit `3d7496b` publicado direto na `main`
  - GitHub Pages validado com sucesso
  - site publicado confirmado servindo os arquivos separados da ficha e da Mesa

- Textos da Mesa oficial atualizados para remover o aspecto de "mock/prototipo" no site publicado
- A interface agora comunica o estado real: personagens e status usam fichas online quando a API esta ativa, enquanto posicao/visibilidade da cena ainda ficam locais ate Durable Objects/WebSocket
- `mesa.html` atualizou a versao de cache dos scripts de roster e inspetor para evitar JS antigo no navegador
- Documentacao `.md` atualizada junto com a mudanca, conforme regra do projeto
- Etapa anterior:
  - Worker e backend legado passaram a normalizar Vida/Integridade antes de salvar
  - historico antigo: nesta etapa a Integridade maxima ainda derivava de Alma no servidor; isso foi alterado em 2026-05-09 para permitir edicao manual de `integMax`
- Antes disso:
  - transferencias de item e memoria entre jogadores no Worker passaram a validar tipo `player` e persistir origem, destino e auditoria em lote D1
- Mesa preparada para aparecer no GitHub Pages: `.github/workflows/pages.yml` agora copia `mesa.html`
- Frontend nao tenta mais carregar Socket.IO contra Worker por padrao; `realtimeEnabled` fica desligado em `js/runtime-config.js` ate Durable Objects/WebSocket existirem
- Sessao backend nao cai mais silenciosamente para modo local quando a API nao responde; a sessao e limpa para evitar divergencia entre navegador e D1
- Documentacao `.md` mantida junto com a mudanca, conforme regra do projeto
- Etapa anterior:
  - documentacao `.md` atualizada para reduzir contexto futuro e registrar obrigacao de manter docs junto com mudancas de site
- Antes disso, foram concluidas:
  - separacao incremental dos arquivos grandes de ficha e mesa
  - remocao do bloco Legacy da Mesa carregada
  - normalizacao de Vida/Integridade no frontend, Worker e backend legado
  - persistencia online dos ajustes de status feitos pela Mesa quando a API esta ativa

## 2026-05-09 - GitHub Pages Preparado Para Node 24

- Workflow `.github/workflows/pages.yml` atualizado para actions que ja publicaram releases compatíveis com Node 24:
  - `actions/checkout@v6`
  - `actions/configure-pages@v6`
  - `actions/upload-pages-artifact@v5`
  - `actions/deploy-pages@v5`
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` foi ativado no workflow para testar a migracao antes de ela virar padrao no GitHub Actions.
- `include-hidden-files: true` foi mantido no upload do Pages para garantir que `_site/.nojekyll` continue dentro do artefato publicado.
- Objetivo: remover o aviso de Actions em Node 20 e evitar quebra futura do deploy do Pages.
- Validacoes executadas antes do commit:
  - `npm run build:pages`
  - confirmar `_site/.nojekyll`
  - `git diff --check`
  - consulta do `action.yml` oficial de `actions/upload-pages-artifact@v5.0.0` confirmando o input `include-hidden-files`
  - push na `main` e `gh run watch` do workflow `Deploy GitHub Pages`

## 2026-05-09 - Polimento De Largura Do Painel Da Mesa

- Painel pessoal do jogador deixou de esticar indefinidamente em telas largas.
- Workbench inferior da Mesa agora limita a largura util do painel principal e preserva o inspetor lateral com largura estavel.
- Blocos internos do painel pessoal receberam largura maxima: hero, abas, recursos, atributos, inventario e areas de texto.
- `content-visibility` foi desligado somente no painel pessoal do jogador e no inspetor visivel para evitar blocos vazios durante rolagem/captura.
- `mesa.html` recebeu novo cache bust para `css/mesa-layout.css`, `css/mesa-roster.css` e `js/mesa-roster.js`.
- Validado com `npm run check:js`, `npm run test:mesa`, `npm run audit:static`, `npm run build:pages`, `npm run perf:mesa`, `git diff --check` e QA visual por Playwright em viewport larga e mobile.

## 2026-05-08 - Polimento Do Painel Do Jogador Na Mesa

- Painel pessoal do jogador foi reorganizado em abas: `Status`, `Atributos`, `Inventario`, `Memorias` e `Notas`.
- Aba `Status` agora prioriza Vida e Integridade com controles rapidos `-1`, `+1`, `0` e `Max`, mantendo os inputs numericos existentes.
- Painel passou a exibir feedback de sincronizacao: `Sincronizado`, `Salvando...`, `Erro ao salvar` ou `Salvo neste navegador`.
- Inventario ficou mais compacto: dano aparece apenas para itens do tipo arma e a descricao fica recolhida em `Detalhes`.
- O cache-busting de `mesa.html` foi atualizado para carregar os novos CSS/JS da Mesa no site publicado.
- Testes da Mesa foram atualizados para validar o fluxo real por abas, controles rapidos, inventario, memorias e persistencia online.
- Arquivos principais alterados nesta etapa:
  - `mesa.html`
  - `css/mesa-roster.css`
  - `js/mesa-core.js`
  - `js/mesa-roster.js`
  - `js/mesa-stage.js`
  - `tests/mesa.spec.cjs`
  - `DEV_STATUS.md`
  - `VISUAL_RULES.md`
  - `docs/obsidian/07-MESA.md`
  - `docs/obsidian/09-HISTORICO-DE-SESSOES.md`
- Validacoes executadas nesta etapa:
  - `npm run check:js`
  - `npm run audit:static`
  - `npm run test:mesa`
  - `npm run test:ficha`
  - `npm run perf:mesa`
  - `npm run build:pages`
  - `git diff --check`
  - `git fsck --no-dangling`
  - QA visual por Playwright em desktop e viewport estreito
- Pendencia da etapa antes do deploy:
  - publicar na `main` e validar o site oficial apos o workflow do GitHub Pages.

## Ajustes de Gameplay Ja Consolidados

- Integridade substituiu Sanidade
- Integridade maxima e editavel manualmente:
  - Alma continua gerando modificador, mas nao sobrescreve o maximo salvo de Integridade
- Integridade atual pode ser ajustada pelo jogador na propria ficha e na Mesa
- Vida atual nao pode ultrapassar Vida maxima
- Integridade atual nao pode ultrapassar Integridade maxima
- Atributos sem limite superior
- Inventario:
  - minimo atual: 10 slots
  - jogadores nao veem controles de aumentar e diminuir slots
  - mestre pode ajustar slots quando permitido pela interface

## Arquivos Sensiveis

Mudancas nesses arquivos costumam impactar diretamente o funcionamento do site:

- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- `css/ficha-*.css`
- `css/mesa-*.css`
- `css/index.css`
- `css/regras.css`
- `js/ficha-*.js`
- `js/mesa-*.js`
- `js/auth.js`
- `js/regras.js`
- `js/api.js`
- `js/runtime-config.js`
- `cloudflare/src/index.js`
- `cloudflare/src/auth.js`
- `cloudflare/src/characters.js`
- `cloudflare/src/sheet.js`
- `cloudflare/src/soul-progression.js`
- `server/src/utils/sheet.js`

## Mapa Rapido de Arquivos

- Ficha:
  - `js/ficha-core.js`: estado, storage, normalizacao e salvamento
  - `js/ficha-sheet.js`: campos, atributos, barras, avatar e regras visuais da ficha
  - `js/ficha-master.js`: painel do mestre, jogadores, NPCs e monstros
  - `js/ficha-inventory.js`: inventario e transferencia de itens
  - `js/ficha-memories.js`: memorias e drops
  - `js/ficha-soul.js`: progressao por Essencias da Alma
  - `js/ficha-dice.js`: rolagem de dados
  - `js/ficha-init.js`: inicializacao e autosave
- Mesa:
  - `js/mesa-core.js`: estado, sessao e montagem do roster
  - `js/mesa-stage.js`: palco, tokens, persistencia e edicao de status
  - `js/mesa-renderer-v2.js`: renderer Canvas/Worker do palco da Mesa
  - `js/mesa-renderer-worker.js`: desenho OffscreenCanvas em Worker quando suportado
  - `js/mesa-roster.js`: lista de personagens
  - `js/mesa-inspector.js`: painel do token selecionado
  - `js/mesa-storage.js`: helpers de storage, numeros e visual de barras
  - `js/mesa-init.js`: reservado para inicializacao futura

## Proximas Frentes Recomendadas

1. Rodar `npm run test:mesa:online` com credenciais reais de mestre/jogador em variaveis de ambiente
2. Medir comportamento em maquina mais fraca e ajustar cap de `devicePixelRatio` se necessario
3. Normalizar thumbnails WebP/JPEG dos avatares grandes no fluxo de salvamento da ficha
4. Revisar responsividade da ficha, inventario e mesa
5. Se o teste autenticado passar, criar um usuario/ficha de teste dedicado para validar relay e persistencia sem tocar dados de campanha real

## Publicacao

Na maior parte das etapas recentes, o caminho mais seguro tem sido publicar:

- pasta `css`
- pasta `js`
- pasta `cloudflare`
- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- arquivos `.md` alterados

Sempre confirmar os arquivos exatos da etapa antes do upload.

## Validacoes Recentes

- `node --check` em todos os JS de `js/`
- `node --check` em todos os JS de `cloudflare/src/`
- `node --check` em todos os JS de `server/src/`
- `npm run check:js`
- `npm run audit:static`
- `npm run build:pages`
- `npm run test:mesa`
- `npm run test:mesa:online`
- `npm run perf:mesa`
- `npx wrangler deploy --dry-run` em `cloudflare/`
- servidor estatico temporario respondeu `200` para `ficha.html` e `mesa.html`
- workflow de Pages revisado para incluir `mesa.html`
- Browser Use abriu `http://127.0.0.1:8012/mesa.html` sem erros de console registrados
