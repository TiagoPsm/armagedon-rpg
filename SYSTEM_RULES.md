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
- o jogador gerencia o nucleo da alma apenas da propria ficha (aplicar Essencia e concluir pesadelo); o mestre gerencia o nucleo de todas as fichas
- todo ganho de Essencia ou conclusao de pesadelo gera auditoria no D1 (`soul_audit`); quando o ator e jogador, o mestre conectado recebe aviso em tempo real (toast) via eventos `soul:awarded` / `soul:nightmare`, entregues somente a sockets master

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
- **Camada do Mestre (DM) e exclusiva do mestre**: o botao "MESTRE" so aparece para o mestre; o jogador nunca entra nela (cai em TOKENS). Tokens com `layer: "dm"` e tracos de desenho com `layer: "dm"` sao INVISIVEIS para os jogadores
- Tokens secretos: filtrados no render do jogador (`getRenderedTokens`); o mestre os ve esmaecidos com a marca "Mestre". O mestre move um token entre Token<->Mestre pelo botao "Camada" do inspetor
- Desenhos secretos: os tracos da camada DM NUNCA sao transmitidos pelo canal realtime (`_broadcastDrawings` filtra `layer: "dm"` e o Durable Object remove qualquer traco dm que chegue num relay); eles persistem apenas pela cena oficial (PUT master-only) e o GET `/api/mesa/scene` os filtra para nao-mestres. O mestre preserva os proprios tracos secretos ao receber atualizacoes remotas de desenho
- **Desenhos sincronizados e persistentes (2026-07-10, Etapa 38)**: qualquer participante pode desenhar na camada normal; `mesa:drawings:update` (estado completo dos tracos visiveis) e retransmitido pelo Durable Object para todos. Os desenhos fazem parte da cena oficial (`drawings` no `data_json`, caps: 300 tracos, 200 pontos por traco de lapis, fracoes 0-1 com 4 casas, ferramentas `pencil|line|rect|circle`): o mestre persiste ao desenhar E ao receber desenho de jogador, entao jogador que entra depois (ou F5) recebe os tracos pelo GET da cena sem o mestre online. Cena antiga sem o campo cai no restore local (`mesa_drawings_v1`). Limitacao conhecida: traco de jogador feito com o mestre offline vive so no cliente dele ate o mestre voltar e receber o delta
- **Desenho sincroniza por DELTA (2026-07-28, Etapa 50)**: o traco recem-fechado viaja SOZINHO (`mesa:drawings:add`, ~1KB) e a borracha/Ctrl+Z mandam SO os ids (`mesa:drawings:remove`) — os dois sao relay (qualquer participante desenha) e o Durable Object recusa traco da camada `dm`, id vazio e listas invalidas. O add remoto e idempotente por id (reenvio nao desenha duas vezes) e o remove remoto nunca apaga traco secreto do mestre. `mesa:drawings:update` (estado completo) sobrou para limpar o quadro e para o reenvio a quem entra depois, e so e enviado quando cabe em 30KB — acima disso e PULADO, porque quem entra recebe os tracos pelo GET da cena de qualquer forma. **Motivo**: o full-state com coordenadas cruas dava 13,4KB a cada 5 tracos e estourava o cap de 32KB por mensagem do DO por volta do 12o traco; o backend recusava e a sincronia morria sem qualquer aviso. As coordenadas agora sao arredondadas na CAPTURA para as mesmas 4 casas que o Worker salva (2,5x menos bytes), pontos redundantes sao descartados e o cliente respeita os caps do Worker (300 tracos, 200 pontos) — passar deles avisa por toast
- **Recusa do backend e sempre visivel (2026-07-28, Etapa 50)**: toda recusa do Durable Object (tamanho de mensagem, rate-limit, permissao, payload invalido) chega como `mesa:scene:ack` com `ok:false` e vira aviso na tela, com garganta de 4s. Nenhuma acao da Mesa pode falhar em silencio
- **Cena auto-suficiente (2026-07-07)**: cada token salvo na cena oficial embute os dados de exibicao (`type`, `name`, `ownerUsername`, `imageUrl` http, vitais). Motivo: o `/api/directory` NAO devolve NPCs/monstros para jogadores, entao o cliente do jogador hidrata esses tokens pelos dados embutidos (`createRosterEntryFromSavedToken`), com o roster como fonte preferida quando existe. Avatar em `data:` (base64) nunca entra na cena
- **Vitais de token com status oculto nao vazam**: quando `statsVisibleToPlayers` e falso, o GET `/api/mesa/scene` anula `currentLife/maxLife/currentIntegrity/maxIntegrity` para nao-mestres (o jogador ve o token, mas nem o JSON carrega os numeros)
- **Mapa persistente**: todo mapa ativado pelo mestre sobe para o R2 e a referencia `map: { id, url, transform }` e salva na cena oficial; jogadores carregam o mapa no boot pela cena, sem o mestre online. O realtime (P2P/WS chunked) continua como entrega rapida em sessao. "Limpar mapa" remove o objeto do R2 e a referencia da cena; o R2 NAO e mais apagado quando os jogadores saem. O pan/zoom do mestre persiste na cena (debounce 1.2s) alem do broadcast realtime
- **Limites anti-abuso (2026-07-11, Etapa 41)**: a API responde 413 para corpo JSON acima do cap (16KB padrao; 256KB para salvar cena e ficha) e para mapa acima de 12MB (era 8MB ate a Etapa 55). O realtime da Mesa descarta mensagem acima de 32KB (chunk de mapa: 128KB; teto absoluto 256KB) e aplica rate limit por conexao (30 msg/s com rajada de 60; chunks de mapa 120/s com rajada de 240) — mensagens bloqueadas recebem ack de erro, a conexao NAO e derrubada
- **Grade funcional (2026-07-11, Etapa 42)**: a grade e amarrada ao MAPA — a celula e uma fracao da largura exibida da imagem (`grid.cellFrac`, 1% a 25%), entao pan/zoom do mapa movem a grade junto. So o mestre controla a grade (grupo "Grade" no painel de configuracoes: exibir, encaixar tokens, tamanho da celula); `mesa:grid:update` e master-only no Durable Object e o estado vive na cena oficial (`grid` no `data_json`; grade toda desligada = `null`). A grade e VISIVEL a todos (nao existe grade secreta). Com "Encaixar tokens" ligado, o token vive em multiplos inteiros de celula (1x1, 2x2, 3x3...): ao soltar um arrasto ou terminar um redimensionamento, o diametro e quantizado para N celulas (ajustando `tokenScale`; o clamp 0.25-4 do contrato limita os extremos) e o quadrado NxN alinha nas linhas da grade (N impar centra na celula, N par numa intersecao); a posicao/escala transmitida e persistida ja e a conformada. Quando o mestre liga o snap ou troca o tamanho da celula, TODOS os tokens sao re-conformados de uma vez (broadcast + persist) para manter a mesa uniforme. Sem mapa ativo a grade ancora no proprio palco. Conversao palco<->mapa SEMPRE pelo helper unico de js/mesa-map.js (`getMesaMapSurfaceFrac`/`mesaStageFracToMapFrac`/`mesaMapFracToStageFrac`) — regua e fog reusarao o mesmo helper
- **Ping no mapa (2026-07-27, Etapa 43)**: QUALQUER participante (mestre ou jogador) pode pingar com Alt+clique no palco — um pulso de ~2s aparece para todos, com o nome do autor (pulso proprio dourado, dos outros carmesim). Canal 100% efemero: `mesa:ping` e apenas retransmitido pelo Durable Object (nao e master-only), nada entra na cena oficial nem persiste — quem entra depois nao ve pings antigos. As coordenadas viajam como fracao do MAPA (helper unico de mesa-map.js), entao o ping cai no mesmo ponto do mapa para todos, independente de pan/zoom local; sem mapa ativo, viaja como fracao do palco. Anti-spam: throttle local de 300ms + rate limit geral do DO; maximo de 12 pulsos simultaneos no palco
- **Regua de medicao (2026-07-27, Etapa 44)**: QUALQUER participante mede com Shift+arrastar no palco — linha tracejada com a distancia em celulas e metros (1 celula = 1,5 m; celula = a da grade atual, default 5% sem grade configurada). Enquanto arrasta, a regua e transmitida ao vivo (`mesa:ruler` a 10Hz) e todos veem (propria dourada, dos outros carmesim com o nome); soltar ou Escape encerra (`active: false`). Canal efemero como o ping: o DO so retransmite, nada entra na cena nem persiste; regua remota tem TTL de 4s se o emissor cair. Coordenadas em fracao do MAPA (helper unico de mesa-map.js) — a medida e a posicao ficam corretas para todos, independente de pan/zoom local
- **Dados na Mesa (2026-07-27, Etapa 45)**: rolagem compartilhada pelo painel "Dados da Mesa" (botao DADOS) — QUALQUER participante rola, mas quem gera o numero e o SERVIDOR (Durable Object, `crypto.getRandomValues`): o cliente so envia `mesa:dice:request` (formula NdM±K, N 1-20, M em {2,4,6,8,10,12,20,100}, K ±99) e o resultado `mesa:dice:result` chega a todos, inclusive ao autor — impossivel forjar (o tipo de resultado nao passa pelo relay). Historico das ultimas 20 rolagens fica no DO e chega a quem entra depois (via `mesa:ready`). Sem backend (modo local), a rolagem acontece no cliente com o mesmo RNG crypto e aparece marcada como "(local)". Rolagem com o painel fechado gera badge no botao + toast. A rolagem da FICHA (ficha-dice.js) continua separada e pessoal; a da Mesa e a rolagem publica da sessao
- **Marcadores de status (2026-07-27, Etapa 46)**: SO O MESTRE aplica/remove condicoes nos tokens (grade "Marcadores" no inspetor) — sao estado narrativo da cena, como visibilidade e camada. Whitelist fixa de 12: veneno, sangramento, queimando, congelado, atordoado, derrubado, amaldicoado, abencoado, medo, invisivel, inconsciente, morto. Maximo de 8 por token. Os chips aparecem no topo do circulo do token para TODOS (jogadores veem as condicoes) e persistem na cena oficial (`statusMarkers` em cada token do `data_json`; o Worker filtra whitelist e cap). Sincronizacao pelo canal existente `mesa:token:upsert` (master-only no DO)
- **Fog of War (2026-07-27, Etapa 47)**: SO O MESTRE controla a nevoa (grupo "Nevoa" no painel do mapa: ativar, pincel Revelar/Cobrir com tamanho ajustavel, "Cobrir tudo"). Para o JOGADOR a nevoa e 100% opaca — token, mapa e desenhos sob a nevoa ficam invisiveis; o MESTRE enxerga atraves (40%). A nevoa e amarrada ao MAPA (pinceladas em fracoes do mapa via helper unico — pan/zoom nao desalinham) e persiste na cena oficial (`fog` no `data_json`; cap de 400 pinceladas, o Worker tambem corta). **Base do mapa (2026-07-28)**: dois botoes distintos — "Cobrir tudo" (base `hidden`, o padrao: o mapa inteiro coberto) e "Revelar tudo" (base `revealed`: o mapa inteiro descoberto com a nevoa AINDA ativa, entao o pincel "Cobrir" vira a ferramenta principal para esconder so a sala secreta). Os dois zeram as pinceladas. Revelar tudo NAO e o mesmo que desativar a nevoa: desativada, o pincel some; revelada, ele continua armado. Cena antiga sem o campo `base` cai em `hidden` — zero migracao. Sync ao vivo por `mesa:fog:update` (master-only no DO). Sem mapa ativo, a nevoa cobre o palco inteiro. Regua e ping aparecem ACIMA da nevoa (sao efemeros e o mestre e quem conduz)
- **Multiplas cenas (2026-07-27, Etapas 48-49)**: SO O MESTRE gerencia cenas (grupo "Cenas" no painel do mapa: criar ate 20, renomear, ativar, excluir — a cena principal e a ativa nao podem ser excluidas). Cada cena guarda TUDO (tokens, mapa, desenhos, grade, nevoa, iniciativa) na propria linha do D1. Jogadores SEMPRE veem a cena ATIVA; ao ativar outra, todos os clientes trocam ao vivo (`mesa:scene:switch` + re-busca filtrada por papel). O mestre pode abrir/salvar uma cena em preparo via `?id=` sem afetar a mesa dos jogadores (PUT de cena nao-ativa nao e transmitido). Snapshot local por cena: default na chave legada, demais com sufixo `_<sceneId>`. Multi-cena exige backend; modo local continua com cena unica
- **Iniciativa (2026-07-10)**: o estado da iniciativa (`initiative` na cena oficial) e AUTORITATIVO do mestre — so o mestre transmite `mesa:initiative:update` (ativar, proximo turno, reiniciar rodada, encerrar, remover entrada). O jogador so emite `mesa:initiative:roll` e apenas pelo PROPRIO personagem: o DO rejeita rolagem cujo `characterKey` nao seja o username autenticado do socket, e o cliente do mestre descarta rolagem forjada (ator != personagem declarado). Rolagem: 1d20 + mod de Agilidade (floor(Agilidade/3)); desempate por maior dado e depois nome. Toda acao de iniciativa do mestre persiste a cena (sobrevive a F5 e chega a jogador que entra depois)

- **Palco ajustado ao mapa (2026-07-29, Etapas 52-55, ajustado na 57)**: SO O MESTRE liga/desliga — pelo botao "Ajustar" na barra do mapa (vira "Ajustado" em carmesim quando ligado) ou pelo checkbox equivalente no painel de engrenagem. **Mapa novo escolhido pelo mestre (abrir arquivo, biblioteca, pasta conectada) ja nasce ajustado**; cena antiga que ja tem mapa continua obedecendo o `fit` gravado nela, entao nenhuma coordenada salva se desloca. Ligado, o palco deixa de preencher o painel e passa a ter a proporcao EXATA da imagem, centralizado (letterbox) — o mapa aparece inteiro, sem o corte do "cover". A flag mora DENTRO do `map` da cena (`fit`), entao troca junto com o mapa na troca de cena e chega a jogadores online (`mesa:map:set`) e a quem entra depois (cena oficial). Cena antiga sem o campo cai em `fit: false`: comportamento e coordenadas inalterados, zero migracao. **Enquanto ligado, o pan/escala do MAPA fica travado** e o grupo "Escala" some — aquele controle existia so para compensar o corte, e mexer na imagem dentro da caixa descolaria os tokens (que usam fracao do palco) do mapa. Para aproximar, use o zoom de PALCO, que escala mapa, tokens, grade e nevoa juntos. O transform guardado do mestre nao e apagado: volta intacto se o fit for desligado. Jogador nunca controla o fit; payload legado (sem o campo) NAO desliga o ajuste no meio da sessao
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
