# SYSTEM RULES

Este arquivo registra regras funcionais e de gameplay que nao devem ser alteradas sem autorizacao explicita.

## Regra Obrigatoria de Documentacao

Sempre que uma mudanca alterar ou esclarecer regra de gameplay, permissao, persistencia ou validacao, este arquivo deve ser atualizado na mesma etapa. Tambem atualize `DEV_STATUS.md` com resumo, arquivos afetados e validacoes.

## Pasta Oficial de Trabalho

Mudancas de regra, persistencia ou permissao devem ser feitas no checkout Git oficial:

```text
C:\Users\tiago\OneDrive\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync
```

Nao use a pasta antiga `rpg-campaign` para alterar regras ou publicar commits.

## Principio Geral

- Melhorias visuais podem ser feitas
- Organizacao pode ser melhorada
- Codigo pode ser refatorado
- Regras do sistema nao devem ser alteradas sem pedido claro do usuario

## Banco e Persistencia

- O site publicado usa Cloudflare Workers + Cloudflare D1
- Dados sao centralizados no servidor
- Nao voltar para salvamento principal em `localStorage`
- Fallback local so pode existir como apoio, nao como fonte principal em producao

## Papeis de Usuario

- `master`: mestre
- `player`: jogador

Permissoes importantes:

- apenas o mestre cria jogadores
- apenas o mestre cria NPCs
- apenas o mestre cria monstros
- apenas o mestre publica, edita e exclui regras
- sugestoes: qualquer um envia; **editar e so do mestre** (o texto enviado e registro da campanha), mas o **AUTOR pode excluir a propria** (2026-08-02) — quem mandou pode se arrepender e retirar. O Worker confere `created_by_user_id`; jogador que nao e o autor nao ve botao nem passa no `DELETE`
- o jogador gerencia o nucleo da alma apenas da propria ficha (aplicar Essencia e concluir pesadelo); o mestre gerencia o nucleo de todas as fichas
- todo ganho de Essencia ou conclusao de pesadelo gera auditoria no D1 (`soul_audit`); quando o ator e jogador, o mestre conectado recebe aviso em tempo real (toast) via eventos `soul:awarded` / `soul:nightmare`, entregues somente a sockets master

### Modelo de permissao da Mesa (2026-08-02, Etapa 75) — ONDE MEXER

Antes desta etapa a permissao da Mesa estava espalhada em quatro lugares que se atropelavam, e controles do mestre vazavam para o jogador. **Agora ha um so lugar.** Toda regra nova de permissao da Mesa entra aqui, nunca solta dentro de um modulo:

- **`js/mesa-permissions.js` e a fonte unica de verdade.** Expoe `mesaCan(cap)`, `isMesaMasterRole()`, `requireMesaMaster(cap, acao)` e `applyMesaRolePermissions(role)`.
- **O papel vem SEMPRE de `state.role`** (que ja respeita AUTH, a sessao sintetica de localhost e `localStorage.mesaRolePreview`). Nenhum modulo pode ler `tc_session` do localStorage para decidir papel — era assim que o `mesa-map.js` criava uma segunda verdade divergente.
- **Fail-closed em toda parte**: capacidade que nao esta em `MESA_SHARED_CAPS` e negada para jogador, inclusive nome que ninguem cadastrou. O `mesa.html` nasce com `<body data-role="player">`; o JS so promove para `master` depois de resolver a sessao.
- **Esconder na UI**: marque o elemento com `data-mesa-master-only` no HTML. O `css/mesa-permissions.css` cuida do resto (`body:not([data-role="master"]) [data-mesa-master-only] { display: none !important }`). Nao invente regra de CSS por id nem `hidden` manual espalhado.
- **Travar a acao**: `requireMesaMaster("cap", "acao")` na PRIMEIRA linha da funcao. Esconder o botao nao protege — as funcoes da Mesa sao globais (`onclick` inline) e chamaveis pelo console.
- **`applyMesaRolePermissions` so desfaz o que ela mesma escondeu** (marca `data-mesa-perm-hidden`). Ela nunca revela um elemento que ja nascia `hidden`: quem decide quando um controle do mestre aparece continua sendo o modulo dono (mapa ativo, combate ativo, backend online, painel aberto, token selecionado).
- **Quem mexe em `hidden` de bloco inteiro chama `applyMesaRolePermissions()` no fim.** Foi exatamente o que faltava no `showPanel()` do mesa.html — ele revelava blocos sem olhar papel e desfazia as travas dos modulos a cada clique na barra.
- **Blocos com dono proprio nao entram no `showPanel`**: `#vttInspectorBlock` e revelado por `renderInspector()`, que olha papel E estado. A iniciativa saiu da sidebar na Etapa 77 — `#initiativeOverlay` e `#initiativeTracker` sao donos de si por `renderInitiative()`.
- **A UI e conforto, nao seguranca.** A barreira real continua sendo o Worker (`role !== "master"` nas rotas de cena/cenas/mapa) e o Durable Object (`MASTER_ONLY_TYPES`, `MASTER_ONLY_MAP_SIGNAL_TYPES`). O que a Etapa 75 corrigiu foi a tela oferecer acao que o servidor ia negar depois.
- **Regressao coberta por `tests/mesa-permissions.spec.cjs`** (`npm run test:mesa:permissoes`): jogador sem nenhum elemento master-only visivel no boot, apos clicar em toda a barra e com combate ativo; funcoes de mestre no-op para jogador; e o mestre com todos os controles.

Exclusivo do mestre na Mesa (marcado com `data-mesa-master-only`): camadas MESTRE e MAPA, botao ESCAL. (escalacao), botao INIC. (ativar/encerrar combate), controles de conducao do combate, todo o chrome de mapa (rotulo, abrir, limpar, engrenagem, painel de escala/grade/nevoa/cenas), biblioteca de mapas, "Travar movimento", "Limpar cena", tabs e busca da escalacao, e o inspetor lateral.

Compartilhado por design (jogador PODE): ver o palco, desenhar (camada unica, Etapa 73), pingar, usar a regua, rolar dados da Mesa, zoom/tela cheia, ver o botao da camada de tokens como "Meu token", com icone proprio (Etapa 116 — o jogador tem um personagem, nao uma lista), ligar/desligar as barras de vida NA PROPRIA TELA (Etapa 114 — preferencia local `mesaShowLifeBars`, nao entra na cena e nao e transmitida), rolar a PROPRIA iniciativa, mover o proprio token com a trava aberta, editar Vida/Integridade atuais do proprio token, invocar/retirar o proprio Echo.

### Painel do mestre na Ficha tambem e travado por funcao (2026-08-02)

`openMasterPanel()`, `backToMaster()` e `masterView()` sao globais e eram chamaveis pelo console por qualquer jogador, caindo no painel do mestre (formularios de criar jogador/NPC/monstro). As tres passam por `isFichaMaster()` agora. Vale a mesma regra da Mesa: **funcao global exclusiva do mestre precisa de trava na primeira linha**, porque esconder o botao nao protege nada.

### Identidade do socket do realtime (PONTO CRITICO)

O Durable Object decide papel pelos headers `x-armagedon-username` / `x-armagedon-role`. Quem os define e o Worker em `handleMesaRealtime`: ele copia os headers do cliente (o upgrade de WebSocket precisa deles) e **em seguida sobrescreve os dois com o papel do JWT verificado**, usando `set()`.

Nao inverta essa ordem, nao troque `set` por `append` e nao condicione o set. Qualquer uma das tres coisas transforma "jogador manda `x-armagedon-role: master` na mao" em escalada de privilegio completa no realtime. Ha teste que falha se isso mudar (`tests/mesa-permissions.spec.cjs`).

## Fichas

Tipos de ficha:

- jogador
- NPC
- monstro

Habilidades registradas na ficha devem preservar:

- identificador interno (`id`)
- nome
- tipo (`ativa` ou `passiva`)
- gatilho
- descricao

## Recursos

- Vida continua existindo
- Integridade substitui Sanidade
- Integridade maxima e derivada de Alma
- Regra atual:
  - a cada 3 pontos de Alma, +1 de Integridade maxima
- O frontend e o backend devem recalcular Integridade maxima antes de salvar, sem aceitar `integMax` divergente vindo do cliente
- Vida atual nao pode passar da Vida maxima
- Integridade atual nao pode passar da Integridade maxima
- Jogador pode alterar sua Integridade atual na ficha
- Jogador pode alterar sua Integridade atual na Mesa quando controla o proprio token
- Vida atual de jogador, NPC e monstro nao pode passar da Vida maxima
- Integridade atual nao pode passar da Integridade maxima
- O limite deve existir no frontend e no backend, nao apenas na interface

## Atributos

Atributos atuais:

- Forca
- Agilidade
- Inteligencia
- Resistencia
- Alma

Regras:

- sem limite superior de valor
- modificador sobe em +1 a cada 3 pontos

## Inventario

- minimo atual: 10 slots
- jogador nao ve botoes de aumentar e diminuir inventario
- mestre pode ajustar inventario quando a interface permitir
- inventario deve abrir item em pop-up ao clicar
- layout deve ser compacto e organizado

## Monstros

Regras consolidadas:

- monstros nao tem Integridade
- monstros nao tem inventario
- monstros nao tem faccao
- monstros possuem secao de drop de memoria
- monstros possuem configuracao de drop de Echo (chance + raridade padrao)

## Memorias

- jogadores e NPCs tem memorias possuidas
- memorias podem ser transferidas entre jogadores
- mestre pode conceder memoria dropada de monstro

## Echos

- Echo e uma manifestacao residual de um monstro derrotado; e um item raro e dificil de obter
- a chance de drop e baixa e ajustavel pelo mestre na ficha do monstro (campo `echoDropConfig`: chance + raridade padrao)
- apenas o mestre rola o drop e concede o Echo; o destino pode ser jogador ou NPC
- ao ser concedido, o Echo passa a pertencer permanentemente ao dono; pode haver multiplos Echos do mesmo monstro
- cada Echo guarda: nome, aparencia (imagem), descricao, atributos adaptados, habilidades e passivas herdadas do monstro, raridade, rank/XP proprios, data de obtencao e dono
- raridades: `comum`, `raro`, `epico`, `lendario`
- o Echo evolui com rank e XP proprios (independentes do dono): comeca no rank 1 e sobe quando o mestre concede XP; ranks de 1 a 7 (Fragmento ate Ressonancia)
- jogador comum visualiza e gerencia apenas os proprios Echos; edita apelido, anotacoes e imagem do proprio Echo
- o mestre tem acesso total: ve Echos de todos os jogadores e de NPCs, cria/edita/remove, altera proprietario, ajusta atributos, rank, XP e raridade
- Echos podem ser transferidos entre jogadores com consentimento (proposta com aceite), como as memorias; o mestre transfere direto
- na Mesa, o mestre pode colocar o Echo de qualquer jogador/NPC no palco; o JOGADOR tambem pode invocar (colocar no centro) e retirar o PROPRIO Echo pelo painel lateral "Meus Echos" sem depender do mestre. A invocacao do jogador e retransmitida pelo Durable Object (validacao por `ownerKey` == username, espelhando `mesa:echo:vitals`) e o mestre persiste a cena ao receber (a gravacao oficial continua master-only). Outros jogadores so veem o Echo se tambem forem donos dele (o roster de cada jogador so traz os proprios Echos)
- na Mesa, o painel lateral do JOGADOR tem duas secoes: "Meu Token" (sempre visivel: editar Vida/Integridade atuais e atalho para a ficha completa) e "Meus Echos" (so aparece se o jogador tiver Echos: invocar/retirar cada Echo da cena)
- o JOGADOR NAO tem o bloco lateral "INSPETOR / TOKEN SELECIONADO" (`#vttInspectorBlock` fica oculto sempre para nao-mestre em `renderInspector`): ele duplicava as infos do proprio token, que ja estao em "Meu Token". Tambem NAO ha botao "Focar meu token" (token unico nao renderiza acao; o seletor de token so aparece com mais de um personagem). O inspetor lateral e exclusivo do mestre
- no inspetor do MESTRE, Vida e Integridade aparecem como cards compactos (mesmo visual do painel do jogador) e o mestre edita ATUAL e MAXIMO de qualquer token, INCLUSIVE dos jogadores (`canEditCurrentStats` e `canEditAllStats` retornam true para o mestre; Echo nao tem max editavel na Mesa). Edicao do mestre num token de jogador vai por sheet patch + broadcast, igual a edicao do proprio jogador
- na Mesa, o JOGADOR NUNCA ve o roster de escalacao ("Adicionar a mesa" com a lista de personagens/NPCs/monstros e botoes "Colocar"): o painel lateral so renderiza "Meu Token"/"Meus Echos". As tabs de filtro por tipo (Todos/Jogadores/NPCs/Monstros) e a busca de personagem sao chrome de escalacao e ficam ocultas para o jogador (`renderRoster` em `js/mesa-roster.js`)
- a funcionalidade de "Previa do jogador" (simular a visao do jogador a partir do mestre) foi REMOVIDA: nao ha mais toggle nem estado `previewPlayerView`. O mestre sempre ve a propria visao completa (todos os tokens, escalacao); o jogador ve a visao dele. O badge "Visao do mestre/jogador" do topo do palco (`#stageViewBadge`) tambem foi removido
- o papel na Mesa (`state.role`) vem SEMPRE da sessao real (`session.role`), inclusive em localhost/127.0.0.1/file:. Nao forcar "master" so por estar em ambiente local — isso transformava jogadores logados em mestres na versao local. Excecoes legitimas: (1) sem login em localhost, `resolveMesaSession()` devolve uma sessao sintetica `{role:"master"}` para preview do mestre sem backend; (2) override explicito de dev via `localStorage.mesaRolePreview = "master"|"player"`
- na Mesa, o inspetor ("Token selecionado") so aparece para o JOGADOR quando ele seleciona o proprio token ou Echo; ao selecionar um token alheio (ou nenhum), a aba lateral do inspetor some
- **pasta organiza, nao possui (2026-08-19, Etapa 96)**: pastas de cena tem UM nivel, vivem no documento de metadados (`meta:mesa`, campos `folders` e `sceneFolders`) e nunca sao donas do conteudo — excluir pasta devolve as cenas dela para a raiz, sem apagar nenhuma. Cena apontando para pasta inexistente cai na raiz na propria leitura dos metadados, e excluir cena limpa a entrada dela no mapa de pastas. Mover cena tem de ter caminho por MENU (`UI.pickOption`); arrastar, se existir, e atalho — sozinho ele exclui quem navega por teclado
- **controle sintetico dispara o MESMO evento que a interacao real (2026-08-18, Etapa 93)**: botao que mexe no valor de um campo (stepper +/-) tem de disparar `input`, que e o evento que o inspetor escuta (`handleInspectorStatInput`) e o que a digitacao gera. Disparar `change` fazia o botao mudar so o numero na tela: a ficha nao gravava, a barra do token nao redesenhava e nenhum `mesa:sheet:patch` saia para os outros clientes — com a cadeia de sincronizacao inteira funcionando por tras
- **o mapa da cena vem da pasta conectada ou da biblioteca salva (2026-08-20, Etapa 100)**: nao existe mais "Abrir mapa", que punha na mesa um arquivo avulso de qualquer lugar do disco. O mestre conecta UMA pasta local (`connectLocalFolder()`), que e varrida recursivamente com todas as subpastas (`_scanDir()`), e escolhe dali; ou usa a biblioteca ja salva no IndexedDB, alimentada por "Importar imagem". Os dois caminhos vivem no bloco revelado pelo botao de camada **MAPA** — se esse caminho quebrar, o mestre fica sem nenhuma forma de definir mapa, e por isso o teste de permissoes do mestre percorre ele ate os botoes. O arquivo continua sendo local do mestre: e por isso que a copia para o R2 permanece, pois o jogador nao le o disco de quem mestra
- **o mapa pertence a UMA cena (2026-08-18, Etapa 90)**: todo mapa local carrega a cena a que pertence (`mesaMapState.mapSceneId`), e a chave do `localStorage` e por cena (`tc_mesa_active_map_<sceneId>`; a `default` mantem a legada). O mapa local do mestre so prevalece sobre o da cena se for DESTA cena — se for de outra, a cena manda, inclusive para ficar sem mapa. `getMesaSceneMapPayload()` nunca devolve mapa de outra cena: e o que impede o persist de gravar o mapa de uma cena dentro de outra no D1. Trocar de cena NAO apaga mapa (nao mexe em R2 nem persiste) — apenas troca o que esta em cena e tenta resgatar o mapa local da cena que chegou; apagar mapa continua sendo so `clearActiveMap()`, decisao explicita do mestre
- **a selecao de token e estado de TELA de cada cliente e NAO TRAFEGA (2026-08-16 Etapa 87; fechada em 2026-08-18, Etapa 88)**: `selectedTokenId` nao esta no payload da cena (`createMesaScenePayloadFromState`), nao esta no envelope de realtime (`createMesaRealtimeEnvelope`) e nao entra na assinatura de dedupe (`normalizeMesaScenePayload` ignora o campo em cena legada). Ele mora em chave propria de `localStorage`, por cliente e por cena: `<chave da cena>_selection`. O servidor nao recebe mais o campo; o Worker continua tolerante a cena antiga que o traz. Por que: enquanto o campo viajava, cada caminho novo de rede nascia podendo marcar token na tela de quem nao clicou em nada — foram cinco defeitos com a mesma origem na Etapa 87, corrigidos um a um. De brinde, sem a selecao na assinatura o mestre volta a absorver o proprio eco no curto-circuito de dedupe (o Worker transmite `mesa:scene` sem `clientId`, entao reconhecer o eco por outro meio e impossivel)
- **cena que chega da rede nunca mexe na selecao de quem recebe**: `applyMesaSceneSnapshot(..., { keepSelection: true })` no caminho remoto, e o cache de cena gravado no `localStorage` passa por `stripMesaSceneSelection` — cena nao e fonte de selecao em nenhuma camada, nem ao vivo nem depois do F5
- **"nada selecionado" e um estado valido e ninguem pode inventar selecao (2026-08-16, Etapas 86 e 87)**: `syncSelectedToken` e `pickInitialSelectedToken` SANEIAM (limpam selecao orfa) e nunca escolhem um token por conta propria. Cair em `tokens[0]` quando o id nao casa torna "nada selecionado" impossivel — `""` nunca casa com id nenhum
- **desmarcar grava, igual a selecionar (2026-08-16 Etapa 87; ajustada na Etapa 88)**: o clique no espaco vazio chama `persistState()`, e `flushPersistState` grava a selecao ANTES do dedupe de assinatura — como selecao nao esta mais no payload, marcar/desmarcar produz assinatura igual e o curto-circuito engoliria a gravacao. Sem `bumpMesaSceneVersion()` — a versao ordena mutacao de cena, e selecao nao e mutacao de cena; um bump ali carimbaria `Date.now()` no relogio do jogador e o faria descartar os deltas seguintes do mestre como atrasados
- na Mesa, Vida e Integridade ATUAIS dos tokens podem ser ajustadas no inspetor: o mestre ajusta as de qualquer token; o jogador ajusta apenas as do proprio token e dos proprios Echos. Os maximos continuam sendo definidos pelo mestre (na ficha, ou na pagina de Echos para Echos)
- a vida atual do Echo (`vidaAtual`/`integAtual`) e salva na tabela `echos` via `POST /api/echos/:id/vitals` (mestre ou dono) e sincroniza em tempo real entre mestre e dono pelo canal `mesa:echo:vitals` do Durable Object

## Transferencias

Tipos ja previstos e auditados:

- item de jogador para jogador
- memoria de jogador para jogador
- memoria obtida por drop de monstro
- Echo de jogador para jogador (proposta com aceite; mestre direto)
- Echo obtido por drop de monstro

Regras importantes:

- troca de itens deve acontecer apenas entre jogadores
- destino nao pode receber item se a mochila estiver cheia
- operacoes multi-etapa devem evitar estado parcial sempre que o backend permitir transacao/batch
- no Worker, transferencias jogador-para-jogador devem gravar origem, destino e auditoria no mesmo `DB.batch`
- transferencia jogador -> jogador exige aceite do destinatario (proposta em `transfer_proposals`); o item/memoria so sai da origem no momento do aceite, com revalidacao (item ainda disponivel na origem e mochila do destino com espaco)
- se a revalidacao falhar no aceite (item/memoria sumiu da origem), a proposta e cancelada automaticamente
- o destinatario pode recusar e quem enviou pode cancelar a proposta pendente; maximo de 10 propostas pendentes por ficha de origem
- envios do mestre entram direto, sem aceite; as rotas diretas de transferencia jogador->jogador sao exclusivas do mestre
- o aceite efetiva ambas as fichas, a auditoria (`transfer_audit` com `proposalId`) e a resolucao da proposta no mesmo `DB.batch`
- o painel "Propostas de transferencia" aparece na ficha do jogador logado com acoes Aceitar/Recusar (recebidas) e Cancelar envio (enviadas)

## Sessao e Modo Offline

- Sessao criada pelo servidor nao pode cair silenciosamente para salvamento local
- Se a API publicada estiver indisponivel durante uma sessao backend, o fluxo bloqueia a pagina e PRESERVA a sessao (token continua no navegador); o usuario ve aviso de servidor indisponivel e volta a entrar quando a API responder
- O health-check da API usa timeout de 5s com 2 tentativas (cold start do Worker nao pode derrubar a sessao)
- O modo local (sem API) so ativa com a flag explicita `localStorage.armagedonDevMode = "1"`, exclusiva para desenvolvimento; nesse modo qualquer credencial entra e o usuario `mestre` recebe papel master, com dados somente no navegador
- Nao existem mais credenciais de login embutidas no codigo do site

## Mesa Digital

- A cena oficial da Mesa deve ser salva no Cloudflare D1 quando a API estiver ativa
- `localStorage` da Mesa e apenas fallback/cache local, nao fonte principal da cena publicada
- Jogadores podem ler a cena oficial liberada pelo mestre
- Apenas o mestre pode salvar posicao, ordem, visibilidade e exposicao de status dos tokens da cena
- Realtime/WebSocket ja existe via Durable Object (`MesaRealtimeRoom`); alteracoes de cena em tempo real (`mesa:token:*`, `mesa:scene:clear`) sao exclusivas do mestre, com duas excecoes para o jogador: `mesa:token:move` do proprio token (com a trava aberta) e `mesa:token:upsert`/`mesa:token:remove` do PROPRIO Echo (token `echo:<id>` com `ownerKey` == username)
- Sinais de mapa que distribuem ou limpam conteudo (`mesa:map:announce`, `mesa:map:set`, `mesa:map:clear`, `mesa:map:offer`, `mesa:map:ws:*`) sao exclusivos do mestre; sinais jogador -> mestre (`have`, `need`, `answer`, `ice`) continuam liberados
- Jogador pode mover o proprio token em tempo real quando a trava global esta aberta; o mestre alterna a trava pelo botao "Travar/Liberar movimento" (estado persistido no Durable Object e anunciado a todos via `mesa:move:lock`)
- Clientes descartam movimentos vindos de jogador que nao sejam do proprio token (validacao de posse no consumidor, ja que o DO nao conhece a cena)
- Jogador continua sem poder limpar a cena ou salvar a cena oficial; so pode criar/remover tokens da cena no caso especifico dos PROPRIOS Echos (invocar/retirar pelo painel "Meus Echos")
- A Mesa tem 3 camadas no seletor: TOKENS (padrao), MESTRE (secreta) e MAPA. A camada ativa fica em `data-active-layer` no `#mesaStageWrap` e e persistida em `localStorage.mesaActiveLayer`
- **Camada do Mestre (DM) e exclusiva do mestre**: o botao "MESTRE" so aparece para o mestre; o jogador nunca entra nela (cai em TOKENS). Tokens com `layer: "dm"` sao INVISIVEIS para os jogadores. **O DESENHO nao segue a camada ativa (2026-08-02, Etapa 73)**: todo traco nasce em `layer: "tokens"`, independente de quem desenha e de qual camada esta selecionada
- Tokens secretos: filtrados no render do jogador (`getRenderedTokens`); o mestre os ve esmaecidos com a marca "Mestre". O mestre move um token entre Token<->Mestre pelo botao "Camada" do inspetor
- **Desenhar e coletivo; APAGAR nao (2026-08-02, Etapa 76)**: o quadro continua unico e compartilhado, mas cada traco carrega `author` (= username de quem desenhou) e isso decide quem pode remove-lo. **Jogador**: borracha e Ctrl+Z alcancam somente os PROPRIOS tracos; Ctrl+Z procura de tras para frente o ultimo traco dele, nao o ultimo do quadro. **Mestre**: borracha alcanca qualquer traco (precisa poder limpar rabisco alheio sem zerar o quadro) e e o unico com "Limpar tudo" (`draw.clearAll`). **Traco antigo, sem `author`, e ORFAO**: so o mestre apaga — ninguem perde o que ja desenhou e nenhum jogador ganha poder sobre traco alheio; zero migracao de banco. A autoria e carimbada pelo Durable Object com o username AUTENTICADO no relay de `mesa:drawings:add` (o cliente nao declara autor, senao assinaria o proprio traco como o mestre) e preservada pelo Worker em `normalizeSceneDrawing` (se for descartada no save, todo traco volta orfao no F5). Como o DO nao conhece a cena, a posse e validada no CONSUMIDOR, igual ao movimento de token alheio: `mesa:drawings:remove` de jogador so remove os tracos dele, e `mesa:drawings:update` (estado COMPLETO) vindo de jogador e IGNORADO — era por ali que um jogador zerava o quadro de todos pelo socket
- **Desenho tem UMA camada so, compartilhada (2026-08-02, Etapa 73)**: mestre e jogadores desenham no MESMO quadro, na camada dos tokens — nao existe mais traco secreto do mestre. Todo traco e transmitido, persistido na cena e visto por todos. Traco antigo gravado como `layer: "dm"` e adotado como compartilhado na primeira leitura (localStorage, cena ou realtime), sem migracao de banco. As defesas do backend que removem `dm` (`sanitizeRelayDrawings` no DO, filtro do GET `/api/mesa/scene`) continuam la e ficaram inertes — o cliente nao produz mais tracos `dm`
- Em repouso o desenho fica ABAIXO dos tokens; com uma ferramenta ativa o canvas sobe acima deles para receber o ponteiro, entao da para comecar um traco em cima de um token e apagar traco que passa por baixo
- **Uma ferramenta armada por vez (2026-08-02, Etapa 74)**: as ferramentas de desenho e os modos de interacao (mao/mover e selecao por area) sao MUTUAMENTE EXCLUSIVOS. Escolher um lapis desarma a mao (`clearMesaInteractionMode`); escolher a mao ou a selecao desarma o desenho (`setDrawTool(null)`). Nunca ha dois botoes acesos, e nenhum arrasto e disputado por duas ferramentas
- **Teto de desenhos (2026-08-02, Etapa 74)**: 1500 tracos por cena e 400 pontos por traco de lapis (era 300/200). Os tres pontos tem que continuar iguais: `DRAW_MAX_STROKES`/`DRAW_MAX_POINTS` em js/mesa-drawing.js, `MAX_DRAWINGS`/`MAX_DRAW_POINTS` em cloudflare/src/mesa.js e `MAX_RELAY_DRAWINGS` em cloudflare/src/mesa-realtime-rules.js — se divergirem, o que fica na tela deixa de ser o que e salvo. O corpo do `PUT /api/mesa/scene` subiu para 1MB pelo mesmo motivo (era 256KB, e estourava antes do teto de tracos)
- **Desenhos sincronizados e persistentes (2026-07-10, Etapa 38)**: qualquer participante pode desenhar na camada normal; `mesa:drawings:update` (estado completo dos tracos visiveis) e retransmitido pelo Durable Object para todos. Os desenhos fazem parte da cena oficial (`drawings` no `data_json`, caps: 1500 tracos, 400 pontos por traco de lapis desde a Etapa 74, fracoes 0-1 com 4 casas, ferramentas `pencil|line|rect|circle`): o mestre persiste ao desenhar E ao receber desenho de jogador, entao jogador que entra depois (ou F5) recebe os tracos pelo GET da cena sem o mestre online. Cena antiga sem o campo cai no restore local (`mesa_drawings_v1`). Limitacao conhecida: traco de jogador feito com o mestre offline vive so no cliente dele ate o mestre voltar e receber o delta
- **Desenho sincroniza por DELTA (2026-07-28, Etapa 50)**: o traco recem-fechado viaja SOZINHO (`mesa:drawings:add`, ~1KB) e a borracha/Ctrl+Z mandam SO os ids (`mesa:drawings:remove`) — os dois sao relay (qualquer participante desenha) e o Durable Object recusa traco da camada `dm`, id vazio e listas invalidas. O add remoto e idempotente por id (reenvio nao desenha duas vezes) e o remove remoto nunca apaga traco secreto do mestre. `mesa:drawings:update` (estado completo) sobrou para limpar o quadro e para o reenvio a quem entra depois, e so e enviado quando cabe em 30KB — acima disso e PULADO, porque quem entra recebe os tracos pelo GET da cena de qualquer forma. **Motivo**: o full-state com coordenadas cruas dava 13,4KB a cada 5 tracos e estourava o cap de 32KB por mensagem do DO por volta do 12o traco; o backend recusava e a sincronia morria sem qualquer aviso. As coordenadas agora sao arredondadas na CAPTURA para as mesmas 4 casas que o Worker salva (2,5x menos bytes), pontos redundantes sao descartados e o cliente respeita os caps do Worker (1500 tracos, 400 pontos desde a Etapa 74) — passar deles avisa por toast
- **Recusa do backend e sempre visivel (2026-07-28, Etapa 50)**: toda recusa do Durable Object (tamanho de mensagem, rate-limit, permissao, payload invalido) chega como `mesa:scene:ack` com `ok:false` e vira aviso na tela, com garganta de 4s. Nenhuma acao da Mesa pode falhar em silencio
- **Cena auto-suficiente (2026-07-07)**: cada token salvo na cena oficial embute os dados de exibicao (`type`, `name`, `ownerUsername`, `imageUrl` http, vitais). Motivo: o `/api/directory` NAO devolve NPCs/monstros para jogadores, entao o cliente do jogador hidrata esses tokens pelos dados embutidos (`createRosterEntryFromSavedToken`), com o roster como fonte preferida quando existe. Avatar em `data:` (base64) nunca entra na cena
- **Vitais de token com status oculto nao vazam**: quando `statsVisibleToPlayers` e falso, o GET `/api/mesa/scene` anula `currentLife/maxLife/currentIntegrity/maxIntegrity` para nao-mestres (o jogador ve o token, mas nem o JSON carrega os numeros)
- **Mapa persistente**: todo mapa ativado pelo mestre sobe para o R2 e a referencia `map: { id, url, transform }` e salva na cena oficial; jogadores carregam o mapa no boot pela cena, sem o mestre online. O realtime (P2P/WS chunked) continua como entrega rapida em sessao. "Limpar mapa" remove o objeto do R2 e a referencia da cena; o R2 NAO e mais apagado quando os jogadores saem. O pan/zoom do mestre persiste na cena (debounce 1.2s) alem do broadcast realtime
- **Limites anti-abuso (2026-07-11, Etapa 41)**: a API responde 413 para corpo JSON acima do cap (16KB padrao; 256KB para salvar cena e ficha) e para mapa acima de 12MB (era 8MB ate a Etapa 55). O realtime da Mesa descarta mensagem acima de 32KB (chunk de mapa: 128KB; teto absoluto 256KB) e aplica rate limit por conexao (30 msg/s com rajada de 60; chunks de mapa 120/s com rajada de 240) — mensagens bloqueadas recebem ack de erro, a conexao NAO e derrubada
- **Grade funcional (2026-07-11, Etapa 42)**: a grade e amarrada ao MAPA — a celula e uma fracao da largura exibida da imagem (`grid.cellFrac`, 1% a 25%), entao pan/zoom do mapa movem a grade junto. So o mestre controla a grade (grupo "Grade" no painel de configuracoes: exibir, encaixar tokens, tamanho da celula); `mesa:grid:update` e master-only no Durable Object e o estado vive na cena oficial (`grid` no `data_json`; grade toda desligada = `null`). A grade e VISIVEL a todos (nao existe grade secreta). **Tamanho do token (revisto na Etapa 69, 2026-07-31)**: com a GRADE LIGADA o token vive sempre em multiplos inteiros de celula (1x1, 2x2, 3x3...) — nao depende de nenhum checkbox. Durante o arrasto de redimensionamento o tamanho pula de N para N+1 celulas (sem tamanho intermediario) e, ao soltar, o quadrado NxN e alinhado as linhas da grade mesmo que "Encaixar ao mover" esteja desligado (N impar centra na celula, N par numa intersecao). O limite e em CELULAS e derivado do mapa: minimo 1x1, maximo metade do menor lado da superficie (`_gridMaxCells` em js/mesa-grid.js) — celula menor, mais celulas disponiveis. `MESA_TOKEN_SCALE_MIN/MAX` (0,1-12, espelhados no Worker) sao so guarda-corpo do contrato — e sao a FONTE UNICA do intervalo: nenhum outro arquivo pode reescrever esses numeros (js/mesa-core.js usa `clampMesaTokenScale()`; ate a Etapa 70 ele repetia 0,25-4 em tres lugares e cortava o token no realtime, no boot e na assinatura da cena). **Sem grade nao ha em que encaixar**: o redimensionamento e continuo. Segurar **Alt** ao redimensionar e a saida consciente para um tamanho livre mesmo com grade. O checkbox "Encaixar ao mover" (antes "Encaixar tokens") manda so na POSICAO ao mover o token. Quando o mestre liga a grade ou troca o tamanho da celula, TODOS os tokens sao re-conformados de uma vez (broadcast + persist) para manter a mesa uniforme; a posicao/escala transmitida e persistida ja e a conformada. Sem mapa ativo a grade ancora no proprio palco. Conversao palco<->mapa SEMPRE pelo helper unico de js/mesa-map.js (`getMesaMapSurfaceFrac`/`mesaStageFracToMapFrac`/`mesaMapFracToStageFrac`) — regua e fog reusarao o mesmo helper
- **Ping no mapa (2026-07-27, Etapa 43)**: QUALQUER participante (mestre ou jogador) pode pingar com Alt+clique no palco — um pulso de ~2s aparece para todos, com o nome do autor (pulso proprio dourado, dos outros carmesim). Canal 100% efemero: `mesa:ping` e apenas retransmitido pelo Durable Object (nao e master-only), nada entra na cena oficial nem persiste — quem entra depois nao ve pings antigos. As coordenadas viajam como fracao do MAPA (helper unico de mesa-map.js), entao o ping cai no mesmo ponto do mapa para todos, independente de pan/zoom local; sem mapa ativo, viaja como fracao do palco. Anti-spam: throttle local de 300ms + rate limit geral do DO; maximo de 12 pulsos simultaneos no palco
- **Regua de medicao (2026-07-27, Etapa 44)**: QUALQUER participante mede com Shift+arrastar no palco — linha tracejada com a distancia em celulas e metros (1 celula = 1,5 m; celula = a da grade atual, default 5% sem grade configurada). Enquanto arrasta, a regua e transmitida ao vivo (`mesa:ruler` a 10Hz) e todos veem (propria dourada, dos outros carmesim com o nome); soltar ou Escape encerra (`active: false`). Canal efemero como o ping: o DO so retransmite, nada entra na cena nem persiste; regua remota tem TTL de 4s se o emissor cair. Coordenadas em fracao do MAPA (helper unico de mesa-map.js) — a medida e a posicao ficam corretas para todos, independente de pan/zoom local
- **Dados na Mesa (2026-07-27, Etapa 45; REFEITO em 2026-08-02, Etapa 79)**: rolagem compartilhada pelo painel "Dados da Mesa" (botao DADOS) — QUALQUER participante rola, mas quem gera o numero e o SERVIDOR (Durable Object, `crypto.getRandomValues`): o cliente so envia `mesa:dice:request` (formula NdM+-K, N 1-20, M em {2,4,6,8,10,12,20,100}, K +-99) e o resultado `mesa:dice:result` chega a todos, inclusive ao autor — impossivel forjar (o tipo de resultado nao passa pelo relay). Historico das ultimas 20 rolagens fica no DO e chega a quem entra depois (via `mesa:ready`). Sem backend (modo local), a rolagem acontece no cliente com o mesmo RNG crypto e aparece marcada como "(local)". Rolagem com o painel fechado gera badge no botao + toast. A rolagem da FICHA (ficha-dice.js) continua separada e pessoal; a da Mesa e a rolagem publica da sessao

### Regras dos dados confirmadas por Tiago (2026-08-02, Etapa 79)

- **Escolher, depois rolar**: os chips de dado SELECIONAM; a rolagem sai no botao ROLAR (ou Enter nos campos de texto). Mudou porque modo e segredo sao escolhas feitas ANTES de rolar — com "clique = rolagem" dava para rolar em segredo sem querer
- **Formula livre vence os chips**: com o campo preenchido, quantidade, modificador e dado selecionado ficam esmaecidos e nao entram na conta
- **Vantagem/desvantagem = a regra da FICHA**: rola a FORMULA INTEIRA duas vezes e fica com o TOTAL maior (vantagem) ou menor (desvantagem). Nao e "2d20 mantem um". A tirada descartada viaja no `rollsSecond` e aparece riscada, para a mesa conferir. `rollMesaDiceWithMode()` em `cloudflare/src/mesa-realtime-rules.js` espelha `rollDiceExpressionWithMode()` de `js/ficha-dice.js`
- **Critico e desastre: SO no d20 com UM dado** — 20 natural e critico, 1 natural e desastre, e o modificador nao conta (`1d20+5` tirando 20 e critico mesmo somando 25). Aqui a Mesa DIVERGE da ficha de proposito: a ficha marca critico no total maximo de qualquer expressao, o que num `3d6` seria so um numero alto sem significado de regra. Com mais de um d20 a marca seria ambigua (critico e desastre na mesma tirada), entao nao se aplica
- **Rolagem secreta e exclusiva do mestre e INVISIVEL para o jogador**: nem entrada no historico, nem aviso, nem indicio de que houve rolagem. Tres camadas: a caixa so aparece para o mestre (`data-mesa-master-only`), o cliente nao envia a flag sem papel de mestre, e o **DO ignora `secret: true` vindo de jogador** (a rolagem sai publica). O resultado vai por `broadcastToMasters()` e o `mesa:ready` filtra o historico por papel (`filterDiceHistoryForRole`) — sem esse filtro, o jogador que entrasse depois receberia a rolagem secreta inteira no payload de boot
- **O motivo ("Ataque", "Furtividade") e publico** e aparece no historico de todos, junto da formula
- **Sincronizacao do tamanho (2026-08-21, Etapa 117)**: soltar a alca de redimensionamento TRANSMITE o token — `mesa:token:move` passou a carregar `tokenScale` (redimensionar tambem muda x/y, entao o canal de movimento e o mesmo). Token de Echo usa `mesa:token:upsert` com `ownerKey` (o canal de movimento so aceita token de jogador vindo de jogador). Ao receber um move de jogador com `tokenScale`, o MESTRE persiste a cena — persistir e master-only, entao sem isso o tamanho do jogador voltava ao antigo no F5. Delta sem `tokenScale` (cliente antigo) mantem o tamanho atual, nunca zera. Com a trava global de movimento ligada o resize do jogador NAO propaga: o Durable Object recusa `mesa:token:move` de jogador travado.
- **Tamanho do token (2026-07-30, Etapa 65)**: `tokenScale` vai de 0,25 a 12 (contrato da cena, clampado tambem no Worker). Com a grade e o encaixe ligados o tamanho e sempre um numero INTEIRO de celulas; quantas celulas cabem depende do tamanho da celula (`floor(12 * 88 / celulaPx)`). Se o encaixe pedido nao couber no teto, o token desce para o maior NxN que cabe — nunca para num tamanho quebrado fora das linhas da grade.
- **Marcadores de status (2026-07-27, Etapa 46; acesso mudou na Etapa 64 em 2026-07-30)**: SO O MESTRE aplica/remove marcadores nos tokens (painel aberto pelo botao `◉` do token selecionado ou pelo "Editar" do inspetor) — sao estado narrativo da cena, como visibilidade e camada. Whitelist fixa de 12: veneno, sangramento, queimando, congelado, atordoado, derrubado, amaldicoado, abencoado, medo, invisivel, inconsciente, morto. Maximo de 8 por token. Os chips aparecem no topo do circulo do token para TODOS (jogadores veem as condicoes) e persistem na cena oficial (`statusMarkers` em cada token do `data_json`; o Worker filtra whitelist e cap). Sincronizacao pelo canal existente `mesa:token:upsert` (master-only no DO)
- **Fog of War (2026-07-27, Etapa 47)**: SO O MESTRE controla a nevoa (grupo "Nevoa" no painel do mapa: ativar, pincel Revelar/Cobrir com tamanho ajustavel, "Cobrir tudo"). Para o JOGADOR a nevoa e 100% opaca — token, mapa e desenhos sob a nevoa ficam invisiveis; o MESTRE enxerga atraves (40%). A nevoa e amarrada ao MAPA (pinceladas em fracoes do mapa via helper unico — pan/zoom nao desalinham) e persiste na cena oficial (`fog` no `data_json`; cap de 400 pinceladas, o Worker tambem corta). **Base do mapa (2026-07-28)**: dois botoes distintos — "Cobrir tudo" (base `hidden`, o padrao: o mapa inteiro coberto) e "Revelar tudo" (base `revealed`: o mapa inteiro descoberto com a nevoa AINDA ativa, entao o pincel "Cobrir" vira a ferramenta principal para esconder so a sala secreta). Os dois zeram as pinceladas. Revelar tudo NAO e o mesmo que desativar a nevoa: desativada, o pincel some; revelada, ele continua armado. Cena antiga sem o campo `base` cai em `hidden` — zero migracao. Sync ao vivo por `mesa:fog:update` (master-only no DO). Sem mapa ativo, a nevoa cobre o palco inteiro. Regua e ping aparecem ACIMA da nevoa (sao efemeros e o mestre e quem conduz)
- **Multiplas cenas (2026-07-27, Etapas 48-49)**: SO O MESTRE gerencia cenas (grupo "Cenas" no painel do mapa: criar ate 20, renomear, ativar, excluir — a cena principal e a ativa nao podem ser excluidas). Cada cena guarda TUDO (tokens, mapa, desenhos, grade, nevoa, iniciativa) na propria linha do D1. Jogadores SEMPRE veem a cena ATIVA; ao ativar outra, todos os clientes trocam ao vivo (`mesa:scene:switch` + re-busca filtrada por papel). O mestre pode abrir/salvar uma cena em preparo via `?id=` sem afetar a mesa dos jogadores (PUT de cena nao-ativa nao e transmitido). Snapshot local por cena: default na chave legada, demais com sufixo `_<sceneId>`. Multi-cena exige backend; modo local continua com cena unica
- **Iniciativa (REFEITA em 2026-08-02, Etapa 77)**: o estado (`initiative` na cena oficial) continua AUTORITATIVO do mestre — so ele transmite `mesa:initiative:update`. O fluxo agora tem **duas fases** (`initiative.phase`):
  1. **`rolling`** — o mestre abre o combate e todo token em cena vira participante (menos o Echo). Um **painel ancorado no canto inferior esquerdo** (`#initiativeOverlay`; era modal central com backdrop ate a Etapa 78) abre para mestre E jogadores. Cada jogador rola pelo PROPRIO token; **NPC e monstro rolam sozinhos** (campo `auto`) no cliente do mestre assim que o ultimo jogador termina.
  2. **`order`** — lista de ordem de turno (`#initiativeTracker`), visivel para TODOS, ordenada por maior total. O nome da vez BRILHA. So o mestre conduz: **Voltar**, **Passar**, **Encerrar** e remover entrada.

### Regras da iniciativa confirmadas por Tiago (2026-08-02)

- **Rolagem: `1d20 + MODIFICADOR de Agilidade`** — o modificador, nunca o valor cru do atributo. A ficha de Armagedom nao tem "Destreza"; o atributo equivalente e **Agilidade** (`attrAgilidade`), e o modificador segue a escala do sistema (**+1 a cada 3 pontos**, ver "Atributos" acima): Agilidade 5 → **+1**, 6 → **+2**, 9 → **+3**. E exatamente o numero que a ficha ja mostra ao lado do atributo. `initiativeModScale()` em `js/mesa-initiative.js` **espelha `modScale()` de `js/ficha-sheet.js`** — duplicacao proposital (ficha-sheet.js so carrega em ficha.html); se a escala do sistema mudar, os dois lugares mudam juntos
- **Empate no total: passa quem tirou o MAIOR DADO BRUTO.** Entre `14+5=19` e `16+3=19`, o do dado 16 age primeiro. Empatou tambem no dado, decide a maior Agilidade; depois, o nome
- **Echo NAO tem turno proprio**: ele age no mesmo turno do jogador que o invocou, entao nao entra na ordem nem rola nada (`buildInitiativeParticipants` filtra `type === "echo"`). Colocar o Echo na lista faria o dono agir duas vezes por rodada
- **Rola UMA vez por combate**: virar a rodada NAO re-rola a iniciativa. A ordem vale ate o mestre encerrar o combate
- **Cada entrada da ordem e um TOKEN, nao um personagem**: o mesmo monstro duas vezes no palco tem duas iniciativas. O jogador so emite `mesa:initiative:roll`, com `characterKey` = a propria IDENTIDADE (o DO rejeita se nao for o username autenticado do socket) e `tokenId` = o alvo; o cliente do mestre ainda confere a POSSE do token antes de aceitar
- **Token secreto (camada dm / invisivel) entra como `secret`**: participa da ordem do mestre e some inteiro para o jogador — inclusive da contagem e da numeracao da lista, que denunciariam o escondido. Com a vez num token secreto, o jogador le apenas "Turno do mestre…"
- **Delta que nao muda a cena nao passa pelo portao de versao (Etapa 80)**: `sceneVersion` cresce com `Date.now()` a cada mexida do MESTRE na cena, e o roteador descarta delta com versao menor que a local. Isso valia ate para `mesa:initiative:roll` — a rolagem do jogador (carimbada com a versao velha da tela dele) morria na porta do cliente do mestre, sem erro visivel. Agora: (1) todo cliente adota a `sceneVersion` recebida no TOPO de `applyMesaRealtimeDelta`, antes dos ramos que retornam cedo, entao ninguem mais fica para tras; (2) `mesa:initiative:roll`, `mesa:ping`, `mesa:ruler` e `mesa:dice:result` estao em `MESA_VERSIONLESS_DELTA_TYPES` e escapam do portao — sao eventos pontuais, nao mutacao de cena
- **Rolagem sem token correspondente cai no DONO (Etapa 80)**: se o `tokenId` da rolagem nao existe na ordem (tela do jogador com uma ordem antiga), o mestre procura a UNICA entrada manual pendente daquele ator AUTENTICADO. Havendo duas, ignora — rolar pelo token errado e pior que perder a rolagem. Diferente do fallback por `characterKey` removido na Etapa 78: aquele lia uma chave do payload (escolhida pelo jogador), este parte do username do socket
- **Jogador ausente nao trava o combate**: o mestre tem "Rolar pelos ausentes" no modal. Toda acao de iniciativa do mestre persiste a cena (sobrevive a F5 e chega a jogador que entra depois)

### Quem pode rolar a iniciativa (endurecido na Etapa 78)

Regra unica: **jogador rola a iniciativa do PROPRIO personagem, e nada mais**. As camadas, de fora para dentro:

1. **UI** — o botao de rolar so e montado na linha do proprio token (`isOwnInitiativeEntry`, que ignora entrada `auto`). O mestre continua com botao nas linhas pendentes, alem do "Rolar pelos ausentes"
2. **Funcao** — `rollOwnInitiative()` e global (script classico, chamavel pelo console). Ela exige `mesaCan("initiative.roll")` e recusa, com aviso, qualquer entrada que nao seja do jogador; para o mestre, recusa entrada `auto` (NPC/monstro rolam sozinhos no fecho da fase)
3. **Rede** — o jogador so emite `mesa:initiative:roll`. O Durable Object exige que o `characterKey` seja o username autenticado do socket; `applyMesaRealtimeDelta` repete a conferencia no cliente
4. **Mestre** — ao receber, confere a POSSE do `tokenId` declarado. **Nao ha mais fallback por `characterKey`**: sem `tokenId` valido, a rolagem e descartada (o fallback deixava um payload sem alvo cair na primeira entrada de mesmo characterKey — e o jogador escolhe o que envia)
5. **Numero** — o **modificador que entra na conta e o da ficha vista pelo mestre**; o valor mandado pelo cliente so vale quando aquela tela nao tem a ficha em cache (`initiativeKnownModifierFor()` devolve `null`). Tratar "nao sei" como 0 zeraria injustamente quem tem Agilidade alta. O dado (1-20) continua vindo do cliente e clampado no recebimento

- **Palco ajustado ao mapa (2026-07-29, Etapas 52-57; INVARIANTE desde a Etapa 68, 2026-07-31)**: o palco tem SEMPRE a proporcao exata do mapa ativo, centralizado (letterbox) — o mapa aparece inteiro, sem o corte do "cover". Nao ha botao, checkbox nem estado: quem ativa um mapa nunca precisa ajustar nada, e nenhuma cena pode carregar um mapa desajustado. Vale igual para mestre e jogador, em qualquer caminho de ativacao (arquivo local, biblioteca, pasta conectada, cena oficial/R2, realtime). Cena antiga com `fit: false` gravado: o campo e IGNORADO na leitura (os payloads continuam enviando `fit: true` so por compatibilidade com clientes antigos). **Pre-requisito**: as dimensoes naturais da imagem precisam ser medidas — `_probeMapImage()` em js/mesa-map.js e o unico lugar que faz isso, e todo caminho de ativacao tem de passar por ela; se um caminho novo esquecer, o palco herda a proporcao do mapa anterior (foi exatamente o bug da pasta conectada, corrigido na Etapa 68). Enquanto ha mapa medido, o **pan/escala do MAPA fica travado** — aquele controle existia so para compensar o corte, e mexer na imagem dentro da caixa descolaria os tokens (que usam fracao do palco) do mapa. **Desde a Etapa 113 (2026-08-20) o grupo "Escala" nao existe mais**: ele so aparecia na janela entre carregar e MEDIR o mapa (e ficava vivo para sempre se a medicao falhasse), mexendo num fallback que nao corresponde ao mapa ajustado. `adjustMapScale()` foi removida junto; `panMap()` continua para o caso ainda-nao-medido. Para aproximar, use o zoom de PALCO, que escala mapa, tokens, grade e nevoa juntos
- **Resolucao dos mapas (2026-07-29, Etapa 55)**: import mira 4096 px no maior lado em qualidade 0.92 (antes: 1920 px / 0.82). O teto real nao e de pixels e sim de BYTES — a API recusa upload de mapa acima de 12 MB — entao a compressao e orientada a orcamento (10 MB): degrada QUALIDADE primeiro (quase invisivel num mapa) e so depois DIMENSAO (piso de 2048 px), que e o que se sente ao dar zoom. Nunca faz upscale: mapa de 1200 px continua 1200 px. Fonte que ja e WebP dentro dos limites passa intacta, sem re-encode — evita perda geracional

## Rolagem de Dados

A ficha possui rolagem propria.

Funcionalidades consolidadas:

- escolha do dado
- quantidade
- modificador
- expressao livre
- vantagem
- desvantagem

## Progressao por Essencias da Alma

Ranks:

1. Adormecido
2. Despertado
3. Ascendido
4. Transcendido
5. Supremo
6. Sagrado
7. Divino

Regras consolidadas:

- ganho de XP baseado no rank da essencia
- multiplicador conforme diferenca entre rank da essencia e rank do personagem
- a diferenca de rank e a UNICA modulacao por nivel da criatura: criatura mais
  fraca rende exponencialmente menos (2^diferenca), mais forte rende mais
- removido em 2026-06-12: multiplicador de anti-farm por contagem de abates
  diarios (`weakKillsToday`) — o campo segue aceito em fichas antigas, mas nao
  e mais incrementado nem usado no calculo
- XP final arredondado para baixo
- mantem excedente ao subir
- nao sobe alem do rank 7

Aplicacao de essencia pelo jogador:

- por design, o jogador aplica essencia na PROPRIA ficha sem aprovacao previa
  do mestre; o controle e por confianca + notificacao em tempo real ao mestre
  (toast via WebSocket, evento `soul:awarded`)

Progressao atual mais dificil:

- 1 -> 2: 1000 XP
- 2 -> 3: 2500 XP
- 3 -> 4: 5000 XP
- 4 -> 5: 10000 XP
- 5 -> 6: 20000 XP
- 6 -> 7: 40000 XP

## Login do Mestre

- usuario bootstrap do mestre: `mestre`
- senha definida por segredo do Worker
- nao alterar o fluxo de bootstrap sem necessidade

## Padrao de Trabalho Futuro

Para cada nova etapa:

1. escopo pequeno e fechado
2. implementacao
3. validacao de sintaxe e logica
4. lista exata de arquivos alterados
5. orientacao clara do que subir
6. atualizacao dos arquivos `.md` de referencia

Se uma etapa mexer no site e nao atualizar documentacao, ela deve ser considerada incompleta.
