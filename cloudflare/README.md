# Migracao para Cloudflare

Este e o caminho principal atual da API publicada do Armagedon.

## Regra Obrigatoria de Documentacao

Sempre que uma mudanca tocar Worker, D1, rotas, schema, secrets, deploy Cloudflare, autenticacao, normalizacao de ficha ou transferencias, atualize este arquivo e `../DEV_STATUS.md`.

## Pasta Oficial de Trabalho

Alteracoes em Worker, D1 e deploy Cloudflare devem ser feitas somente no checkout Git oficial:

```text
C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync
```

Nao use a pasta antiga `rpg-campaign` para editar ou publicar arquivos em `cloudflare/`.

Registro minimo esperado:

- rota/schema afetado
- comportamento alterado
- validacao executada
- pendencias que continuam abertas

## Stack Atual

- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- Durable Objects no passo seguinte

## Estado atual desta migracao

Esta base cobre a API em Workers com:

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `GET /api/directory`
- `POST /api/directory/players`
- `DELETE /api/directory/players/:username`
- `POST /api/directory/npcs`
- `DELETE /api/directory/npcs/:id`
- `POST /api/directory/monsters`
- `DELETE /api/directory/monsters/:id`
- `GET /api/characters/:key`
- `PUT /api/characters/:key`
- `POST /api/characters/:key/soul-essence`
- `GET /api/mesa/scene`
- `PUT /api/mesa/scene`
- `POST /api/transfers/proposals`
- `GET /api/transfers/proposals`
- `POST /api/transfers/proposals/:id/accept`
- `POST /api/transfers/proposals/:id/reject`
- `POST /api/transfers/proposals/:id/cancel`
- `POST /api/transfers/items/player-to-player`
- `POST /api/transfers/memories/player-to-player`
- `POST /api/transfers/memories/monster-roll`
- `POST /api/transfers/memories/monster-award`
- `GET /api/echos` (jogador: proprios; mestre: todos, com `?owner=<key>`)
- `GET /api/echos/:id`
- `PUT /api/echos/:id` (jogador: apelido/anotacoes; mestre: tudo)
- `DELETE /api/echos/:id` (master-only)
- `POST /api/echos/monster-roll` (master-only)
- `POST /api/echos/monster-award` (master-only)
- `POST /api/echos/:id/xp` (master-only)
- `POST /api/echos/:id/vitals` (mestre ou dono; Vida/Integridade atuais)
- `POST /api/avatars/echo/:id` (mestre ou dono do Echo)
- `GET /api/rules`
- `POST /api/rules`
- `PUT /api/rules/:id`
- `DELETE /api/rules/:id`
- `POST /api/maintenance/migrate-avatars` (master-only; one-shot)

E tambem inclui:

- `wrangler.toml`
- schema inicial em `d1/schema.sql`
- modulo de auth com JWT em Workers
- bootstrap do mestre por variavel de ambiente
- normalizacao de ficha em `src/sheet.js`
- progressao por Essencias da Alma em `src/soul-progression.js`

## O que ainda falta migrar

- realtime com Durable Objects
- refinamento das permissoes e sincronizacao em tempo real
- testes completos de todos os fluxos publicados
- transacao/batch D1 para outras mutacoes multi-etapa sensiveis que ainda nao usam lote

## Como esta modelado

Para acelerar a migracao, a modelagem do D1 segue a mesma ideia do backend atual:

- `users`
- `characters`
- `rules_posts`
- `mesa_scenes`
- `transfer_audit`
- `transfer_proposals`
- `echos`

O campo `data_json` em `characters` guarda a ficha inteira em JSON.
O campo `data_json` em `echos` guarda avatar, descricao, habilidades, passivas e atributos derivados do monstro; `rank`/`xp` ficam em colunas proprias.
O campo `data_json` em `mesa_scenes` guarda a cena visual da Mesa: tokens ativos, posicao, ordem, visibilidade e exposicao de status.

## Regras de Backend Que Devem Permanecer

- Producao deve salvar no D1, nao depender de `localStorage`
- Jogador so pode editar a propria ficha
- Mestre controla jogadores, NPCs, monstros e regras; o nucleo da alma (Essencia/pesadelo) pode ser gerenciado pelo dono da ficha na propria ficha e pelo mestre em todas
- Sugestoes: criar e livre; **editar (`PUT`) e master-only**; **excluir (`DELETE`) e do mestre OU do autor** (checagem por `created_by_user_id`, 2026-08-02)
- Jogadores podem ler a cena da Mesa, mas apenas o mestre pode salvar posicao, ordem e visibilidade dos tokens
- No Durable Object `MesaRealtimeRoom`, sinais de mapa que distribuem/limpam conteudo (`mesa:map:announce/set/clear/offer/ws:*`) exigem role master; sinais jogador -> mestre (`have/need/answer/ice`) sao liberados
- Respostas 500 nao devem expor `error.message` interno ao cliente; detalhes vao para `console.error` (acessivel via `wrangler tail`)
- CORS usa allowlist (github.io, armagedon-rpg.pages.dev + previews, localhost); novos dominios do site precisam ser adicionados em `ALLOWED_ORIGINS` no `src/auth.js`
- `ensureMasterUser` roda somente na rota de login e apenas quando o username do login e o do mestre (evita um PBKDF2 extra em todo login de jogador)
- Upload de avatar: maximo 2 MB, apenas `image/webp` ou `image/jpeg`
- `GET /api/directory` nunca trafega avatar em base64 (`data:`): avatares legados em base64 ficam vazios no diretorio ate serem migrados para R2 via `POST /api/maintenance/migrate-avatars` (master-only, idempotente) ou pelo save automatico da ficha
- `GET /api/mesa/map/<key>` continua sem auth (URL vira background-image, sem headers), mas so serve chaves `maps/<user>/<id>.webp`; mitigacao extra e o TTL do R2
- Senhas: PBKDF2-SHA256 com salt por usuario (25k iteracoes) + pepper de secret; hashes legados sha256 migram sozinhos no primeiro login valido — nao remover o caminho legado enquanto houver hash antigo no banco
- Sessao: o JWT expira em 7 dias e NAO ha refresh automatico — apos expirar, o usuario precisa logar de novo (qualquer doc que afirme renovacao automatica esta errada)
- Rate-limit de login: tabela `login_throttle` (usuario+IP, 8 falhas = 10 min de bloqueio); manter schema.sql sincronizado e aplicar migracao remota antes de deploys que dependam de tabela nova
- Progressao da alma: ganhos de Essencia e pesadelos gravam auditoria em `soul_audit`; quando o ator e jogador, o Worker dispara `soul:awarded`/`soul:nightmare` e o DO entrega apenas a sockets master (`broadcastToMasters`)
- Movimento de token: `mesa:move:lock` (master-only) alterna a trava global persistida no storage do DO; `mesa:token:move` de jogador so e retransmitido com a trava aberta e `characterKey` igual ao username autenticado; a posse do token e validada nos clientes ao aplicar o delta
- Invocar/retirar Echo proprio: `mesa:token:upsert` e `mesa:token:remove` sao master-only, com excecao para o jogador quando o token e um Echo (`echo:<id>`) e o payload declara `ownerKey == username` (helper `canPlayerRelayEchoToken`, espelha `mesa:echo:vitals`). O DO so retransmite; a persistencia da cena segue master-only, entao o mestre persiste ao receber o delta de um jogador (cliente). Mudancas no DO exigem `wrangler deploy`
- **Identidade do socket do realtime (PONTO CRITICO)**: o `MesaRealtimeRoom` decide papel lendo os headers `x-armagedon-username` / `x-armagedon-role` (`normalizeSocketUser`). Quem os define e `handleMesaRealtime` em `src/index.js`: ele copia os headers do cliente (o upgrade de WebSocket precisa deles) e **em seguida sobrescreve os dois com o papel do JWT verificado**, usando `set()`. Nao inverter a ordem, nao trocar `set` por `append`, nao condicionar o set — qualquer uma das tres coisas transforma "jogador manda `x-armagedon-role: master` na mao" em escalada de privilegio completa. Ha teste que falha se isso mudar (`tests/mesa-permissions.spec.cjs`)
- **Autoria do traco de desenho (Etapa 76)**: cada traco carrega `author` (= username de quem desenhou) e isso decide quem pode apaga-lo — jogador so remove os proprios, mestre remove qualquer um, traco sem `author` (anterior a esta etapa) e orfao e so o mestre alcanca. **O `author` e carimbado pelo DO** com o username autenticado no relay de `mesa:drawings:add`, nunca aceito do payload (senao um jogador assinaria o proprio traco como o mestre). **O Worker preserva o campo** em `normalizeSceneDrawing` — se for descartado no save, todo traco volta orfao no F5 e o jogador perde o direito de apagar o proprio desenho. Como o DO nao conhece a cena, a posse e validada no consumidor (clientes), igual ao movimento de token alheio
- Desenhos da Mesa (Etapa 38): `mesa:drawings:update` esta em `RELAY_TYPES` do `MesaRealtimeRoom` e NAO e master-only no DO (jogador tambem desenha) — mas desde a Etapa 76 os **clientes ignoram** estado completo vindo de jogador (so vale do mestre): era o caminho pelo qual um jogador zerava o quadro de todos pelo socket; o relay exige `drawings` array (ack de erro caso contrario), remove tracos `layer:"dm"` (inerte desde a Etapa 73: o cliente nao produz mais tracos `dm`) e limita a `MAX_RELAY_DRAWINGS` tracos. A cena oficial (`data_json.drawings`) normaliza cada traco em `src/mesa.js` (`normalizeSceneDrawing`: ferramentas `pencil|line|rect|circle`, cor `#hex`, width 1-12, fracoes 0-1 com 4 casas, caps 1500 tracos / 400 pontos por lapis desde a Etapa 74) e o GET `/api/mesa/scene` filtra tracos `dm` para nao-mestres. Mudancas no DO exigem `wrangler deploy`
- Limites de requisicao (Etapa 41): `readJson` aceita 16KB por padrao e responde 413 acima do cap (PUT /characters usa 256KB; PUT /mesa/scene usa 1MB desde a Etapa 74); upload de mapa no R2 limitado a 12MB (era 8MB; elevado na Etapa 55, quando o cliente passou a mirar 4096px com orcamento de 10MB). No `MesaRealtimeRoom`: mensagens WS de ate 32KB (chunk de mapa `mesa:map:ws:chunk` ate 128KB; teto absoluto 256KB) e rate limit por socket via token bucket (30 msg/s com burst 60; chunks de mapa em bucket proprio de 120/s com burst 240; `ping` isento). As regras puras do DO (tipos, limites, sanitizacao, normalizacao de patch) vivem em `src/mesa-realtime-rules.js` — sem import de `cloudflare:workers`, para os testes unitarios rodarem em Node
- Vida atual nao pode passar da Vida maxima
- Integridade maxima de jogador/NPC e editavel; o Worker preserva `integMax` enviado pelo cliente e apenas clampa Integridade atual pelo maximo salvo
- Integridade atual nao pode passar da Integridade maxima
- Habilidades devem preservar `id`, `name`, `type`, `trigger` e `desc` ao salvar no D1
- Echos: so o mestre rola/concede o drop (`/api/echos/monster-roll`, `/api/echos/monster-award`), concede XP (`/api/echos/:id/xp`) e remove; o jogador edita apenas `customName`, `notes` e o avatar do proprio Echo via `PUT /api/echos/:id` e `POST /api/avatars/echo/:id` (a ownership e validada por `owner_character_id` -> `owner_user_id`)
- Transferencia de Echo reaproveita `transfer_proposals` (tipo `echo`, payload `{ echoId }`): o mestre transfere direto pela rota generica de propostas; o jogador cria proposta e o aceite troca `echos.owner_character_id` em `DB.batch` com auditoria (`echo-player-to-player`) e resolucao da proposta
- A configuracao de drop de Echo do monstro (`echoDropConfig`: chance + raridade) e normalizada em `src/sheet.js` e preservada no `data_json` do monstro
- Migracao `d1/migrations/0002_add_echos.sql` deve ser aplicada no D1 remoto antes do deploy que depende de Echos: recria `transfer_proposals` e `transfer_audit` (CHECK agora aceita `echo`) preservando dados e cria a tabela `echos`. Manter `d1/schema.sql` como fonte de verdade para bases novas
- Vida do Echo na Mesa: `POST /api/echos/:id/vitals` salva apenas `vidaAtual`/`integAtual` (clamp pelo maximo), permitido a mestre ou dono. A sincronizacao em tempo real usa o tipo `mesa:echo:vitals` no `MesaRealtimeRoom`: o DO retransmite ao mestre e ao dono (jogador so emite para o proprio Echo, validado por `ownerKey == username`); a persistencia autoritativa e sempre a API. Mudancas no DO exigem `wrangler deploy`
- Monstros nao devem ganhar inventario, faccao ou memorias possuidas
- Troca de itens deve ser limitada a jogador para jogador
- Transferencias jogador-para-jogador devem persistir origem, destino e auditoria via `DB.batch`
- Transferencia jogador->jogador exige proposta com aceite (`transfer_proposals`): `POST /api/transfers/proposals` cria a proposta; o mestre na mesma rota efetiva direto (`direct: true`); o item/memoria fica na origem ate o aceite
- No aceite (`/accept`, somente dono do destino ou mestre) o Worker revalida: item localizado por merge key com quantidade suficiente na origem e mochila do destino com espaco; se a origem nao tem mais o item/memoria, a proposta e cancelada automaticamente e a rota responde 409
- O aceite efetiva fichas + `transfer_audit` (payload com `proposalId`) + resolucao da proposta no mesmo `DB.batch`; `/reject` e do destinatario, `/cancel` e de quem enviou; limite de 10 propostas pendentes por ficha de origem
- As rotas diretas (`items/player-to-player`, `memories/player-to-player`, `items/character-to-character` quando origem e destino sao jogadores) respondem 403 para jogador — somente o mestre transfere direto

## Registro de revisao estatica 2026-04-30

- `cloudflare/src/sheet.js` foi alinhado ao frontend e ao backend legado para nao descartar tipo, gatilho e identificador das habilidades ao normalizar fichas.
- Validacao executada: `node --check` em `cloudflare/src/sheet.js`, `cloudflare/src/index.js`, `server/src/utils/sheet.js` e `js/ficha-core.js`.
- Validacao funcional local executada com Edge headless confirmou criacao, salvamento e recarregamento de habilidade com `type` e `trigger` preservados no fluxo da ficha.
- Pendencia: quando necessario, validar o mesmo fluxo contra a API publicada apos deploy do Worker.

## Proximo passo recomendado

Proximos passos tecnicos:

1. publicar frontend no GitHub Pages com cache bust `2026-05-01-mesa-scene-1`
2. validar mestre salvando cena e jogador carregando a cena persistida
3. implementar Durable Object da sala da Mesa com WebSocket
4. manter `d1/schema.sql` sincronizado com qualquer mudanca de banco
5. documentar cada alteracao neste arquivo e em `../DEV_STATUS.md`

## Registro de deploy 2026-05-04

- `wrangler deploy` (2026-08-02, Etapa 79): Worker `armagedon-api` publicado com version ID `e61e3c80-ed13-4ce2-b558-dbdceae4a073` — **dados da Mesa com modo e segredo**. (1) `src/mesa-realtime-rules.js` ganhou quatro funcoes puras: `normalizeDiceMode` (whitelist `normal|advantage|disadvantage`), `rollMesaDiceWithMode` (vantagem/desvantagem rolam a FORMULA INTEIRA duas vezes e ficam com o total maior/menor — a regra da ficha; a tirada perdedora volta em `rollsSecond` para o cliente exibir riscada), `getMesaDiceSpecial` (critico/desastre **so no d20 com um dado**, modificador nao conta) e `filterDiceHistoryForRole`. (2) `src/mesa-realtime.js` `handleDiceRequest` le `mode` e `secret` do payload; **`secret` so vale para `attachment.role === "master"`** (de jogador a flag e ignorada e a rolagem sai publica, sem erro) e o resultado secreto vai por `broadcastToMasters()` em vez de `broadcast()`. (3) `acceptClient` filtra o `diceHistory` do `mesa:ready` por papel — **sem esse filtro o jogador que entrasse depois receberia a rolagem secreta inteira (formula e total) no payload de boot**, que era o furo obvio de "rolar escondido". Campos novos do protocolo, todos opcionais para cliente antigo: request ganha `mode`/`secret`, result ganha `mode`/`rollsSecond`/`special`/`secret`. Sem mudanca de schema nem migracao. Dry-run limpo antes; health 200 pos-deploy.
- `wrangler deploy` (2026-08-02, Etapa 77): Worker `armagedon-api` publicado com version ID `b55adbb0-319b-4b5a-89d7-4d997cd7eb16` — **iniciativa refeita**. `src/mesa.js` `normalizeMesaScene` passou a preservar o campo **`phase`** da iniciativa (`"rolling"` | `"order"`) e, em cada entrada da ordem, **`ownerUsername`**, **`type`** (whitelist `TOKEN_TYPES`), **`secret`** e **`auto`**. **Motivo**: sem isso a cena voltava do D1 sem saber em que fase o combate estava e, pior, sem o `secret` — um monstro da camada dm reapareceria na lista dos jogadores depois de um F5. Retrocompativel sem migracao: cena antiga sem `phase` reabre em `"order"` quando todas as entradas ja tinham rolado (senao em `"rolling"`), e entrada sem `auto` assume `type !== "player"` (NPC e monstro rolam sozinhos). **Sem mudanca no DO**: `mesa:initiative:update` (master-only) e `mesa:initiative:roll` (relay com validacao de identidade) ja cobrem o fluxo novo — o alvo da rolagem viaja em `tokenId`, campo livre do payload, e a checagem de posse do token e feita no cliente do mestre. Dry-run limpo antes; health 200 pos-deploy.
- `wrangler deploy` (2026-08-02, Etapa 76): Worker `armagedon-api` publicado com version ID `2d1e0217-5f75-485d-9f8a-f1be95027743` — **autoria do traco de desenho + exclusao de sugestao pelo autor**. (1) `src/mesa.js` `normalizeSceneDrawing` passou a preservar `author` (username em minusculo, 40 chars): sem isso todo traco voltaria do banco **orfao** depois de um F5 e o jogador perderia o direito de apagar o proprio desenho — a regra "cada um apaga so o seu" morreria no primeiro reload. (2) `src/mesa-realtime.js` carimba `stroke.author` com o username AUTENTICADO no relay de `mesa:drawings:add`, ignorando o que o cliente declarou: sem isso um jogador assinava o proprio traco como "mestre" e o tornava intocavel para os outros (mesmo principio do `from` em `handleMapSignal`). (3) `src/index.js` `DELETE /api/suggestions/:id` deixou de ser master-only — o mestre apaga qualquer uma e o **autor apaga a propria** (checagem por `created_by_user_id`); editar continua master-only. Tambem entrou comentario de aviso em `handleMesaRealtime` marcando a sobrescrita dos headers de identidade como ponto critico. Sem mudanca de schema. Dry-run limpo antes; health 200 pos-deploy.
- `wrangler deploy` (2026-08-02, Etapa 74): Worker `armagedon-api` publicado com version ID `1d0cf43e-78d1-4178-ab00-a21d084ebb86` — tetos de desenho ampliados: `MAX_DRAWINGS` 300 → **1500** e `MAX_DRAW_POINTS` 200 → **400** em `src/mesa.js`, `MAX_RELAY_DRAWINGS` 300 → 1500 em `src/mesa-realtime-rules.js`, e o corpo do `PUT /api/mesa/scene` de 256KB para **1MB** em `src/index.js`. **Motivo**: o limitador real nao era a contagem de tracos e sim o cap do corpo do PUT — com 256KB a cena estourava muito antes de chegar a 300 tracos, entao subir so o teto de desenhos nao daria em nada. Um traco de lapis cheio (400 pontos) da ~7KB, bem abaixo do cap de 32KB por mensagem do DO, entao o delta de UM traco continua cabendo sempre. Os tres tetos precisam seguir iguais aos de js/mesa-drawing.js (`DRAW_MAX_STROKES`/`DRAW_MAX_POINTS`), senao o que fica na tela diverge do que e salvo. Dry-run limpo antes; health 200 pos-deploy.
- `wrangler deploy` (2026-07-31, Etapa 69): Worker `armagedon-api` publicado com version ID `ab2d6bf0-2387-4466-8d8d-d86f6bb1a139` — `src/mesa.js` `normalizeSceneToken` passou a clampar `tokenScale` em **0,1–12** (era 0,25–12), espelhando o novo `MESA_TOKEN_SCALE_MIN` de js/mesa-stage.js. Motivo: o tamanho do token agora e definido pelo encaixe em CELULAS (1x1 ate metade do menor lado do mapa) e uma grade fina pode ter celula menor que 0,25x88px — o piso antigo impedia o token de caber em 1 celula. Sem mudanca no DO (sincroniza pelo `mesa:token:upsert` existente). Dry-run limpo antes; health 200 pos-deploy.
- `wrangler deploy` (2026-07-30, Etapa 65): Worker `armagedon-api` publicado com version ID `bb8ca24c-91d5-4e42-8bdd-7de00e4bef48` — `src/mesa.js` `normalizeSceneToken` passou a clampar `tokenScale` em 0,25–12 (era 0,25–4), espelhando `MESA_TOKEN_SCALE_MAX` de js/mesa-stage.js. Motivo: o teto de 4 era absoluto, mas o tamanho em celulas depende do tamanho da celula — com celula de ~126px, 4x88px nao chega a 4 celulas, entao o token travava em 3x3 E parava num tamanho quebrado, fora das linhas da grade. Sem mudanca no DO (sincroniza pelo `mesa:token:upsert` existente). Dry-run limpo antes; health 200 pos-deploy.
- `wrangler d1 execute armagedon --remote --file d1/schema.sql`: aplicado com sucesso no D1 remoto.
- Tabela confirmada: `mesa_scenes`.
- `wrangler deploy` (2026-07-28, melhoria da nevoa): Worker `armagedon-api` publicado com version ID `8b5a4914-7984-4400-825f-2e78364bb39f` — a nevoa ganhou o campo `base` na cena (`src/mesa.js` `normalizeSceneFog`): `hidden` (padrao, mapa todo coberto) ou `revealed` (mapa todo descoberto com a nevoa ainda ativa, so as ops de "hide" cobrem). Valor invalido e cena antiga sem o campo caem em `hidden` (zero migracao, nunca revela sozinho); a nevoa so vira null quando esta desligada, sem ops E na base padrao — base `revealed` e estado e nao pode sumir no round-trip. Dry-run limpo antes; health 200 pos-deploy.
- `wrangler deploy` (2026-07-28, Etapa 50): Worker `armagedon-api` publicado com version ID `0dc8151d-b91e-4ce7-8eb3-5dfeba73ec33` — sincronia de desenho por DELTA. `src/mesa-realtime-rules.js` ganhou `DRAWINGS_ADD_TYPE` (`mesa:drawings:add`) e `DRAWINGS_REMOVE_TYPE` (`mesa:drawings:remove`) em `RELAY_TYPES` (nao master-only: qualquer participante desenha, como o full-state ja era) + `sanitizeRelayDrawingStroke` (UM traco: recusa camada `dm`, id vazio e nao-objeto) e `sanitizeRelayDrawingIds` (lista de ids, cap `MAX_RELAY_DRAWINGS` = 300). `src/mesa-realtime.js` sanitiza os dois tipos antes do relay, com `mesa:scene:ack ok:false` em payload invalido. **Motivo**: o `mesa:drawings:update` full-state estourava o cap de 32KB por mensagem por volta do 12o traco a lapis (medido: 5 tracos = 13,4KB com coordenadas cruas) e o DO recusava — a sincronia de desenho morria em silencio na sessao. Retrocompativel: o full-state continua aceito (cliente antigo segue funcionando). Dry-run limpo antes; health 200 pos-deploy.
- `wrangler deploy` (2026-07-27, Etapa 48): Worker `armagedon-api` publicado com version ID `26488a2a-3d0d-4afc-867d-6e35b948d11e` — multiplas cenas (backend): linha `meta:mesa` em `mesa_scenes` guarda `{ activeId, names }` (sem migracao de schema); novas rotas master-only `GET/POST /api/mesa/scenes`, `PUT/DELETE /api/mesa/scenes/:id`, `POST /api/mesa/scenes/:id/activate` (broadcast `mesa:scene:switch` via DO — clientes re-buscam o GET filtrado por papel); `GET/PUT /api/mesa/scene` aceitam `?id=` so para o mestre (jogador sempre na ativa) e PUT de cena nao-ativa nao e transmitido. Cap: 20 cenas. Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-27, Etapa 47): Worker `armagedon-api` publicado com version ID `d9a50dfb-56bc-40a2-83c1-53ca6b81df57` — Fog of War: novo campo `fog` na cena oficial (`src/mesa.js` `normalizeSceneFog`: ops `{mode reveal|hide, u, v, r}` em fracoes do mapa, clamps -1..2 / 0.005..1, 4 casas, cap 400; desligada sem ops = null) e `mesa:fog:update` em `MASTER_ONLY_TYPES` (`src/mesa-realtime-rules.js`) — DO bloqueia jogador e retransmite pelo caminho generico, zero codigo novo no DO. Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-27, Etapa 46): Worker `armagedon-api` publicado com version ID `fd78827c-4ac1-4084-840d-b3d7a512d880` — marcadores de status: novo campo `statusMarkers` por token na cena oficial (`src/mesa.js` `normalizeSceneStatusMarkers`: whitelist de 12 condicoes espelhada de js/mesa-stage.js, dedupe, cap 8; cena antiga sem o campo vira `[]`). Sem mudanca no DO (sincroniza pelo `mesa:token:upsert` existente). Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-27, Etapa 45): Worker `armagedon-api` publicado com version ID `038dc024-0b51-4aa4-aa6d-baf3d9a34218` — dados na Mesa: o DO ganhou `handleDiceRequest` (`mesa:dice:request` valida a formula via `parseMesaDiceFormula` das rules, rola com `crypto.getRandomValues` + rejection sampling e faz broadcast de `mesa:dice:result` para todos, inclusive o autor). Historico cap 20 no storage do DO (chave `diceHistory`), entregue no `mesa:ready`. Nem request nem result entram em `RELAY_TYPES` — cliente nao forja resultado. Formula invalida recebe `mesa:dice:ack` de erro. Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-27, Etapa 44): Worker `armagedon-api` publicado com version ID `d55ec756-79b8-413e-afa3-2d6c9d98ad08` — regua de medicao: `mesa:ruler` (`RULER_TYPE`) entrou em `RELAY_TYPES` de `src/mesa-realtime-rules.js` (NAO master-only: qualquer participante mede; canal efemero identico ao ping — o DO so retransmite, nada persiste; broadcast do cliente a 10Hz dentro do rate limit geral de 30 msg/s). Zero codigo novo no DO. Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-27, Etapa 43): Worker `armagedon-api` publicado com version ID `dfb08f41-619f-4664-a4fd-7e62ac60e091` — ping no mapa: `mesa:ping` (`PING_TYPE`) entrou em `RELAY_TYPES` de `src/mesa-realtime-rules.js` (NAO e master-only: qualquer participante pinga; o DO apenas retransmite pelo caminho generico — canal efemero, nada persiste no D1 nem no storage do DO; anti-spam pelo rate limit geral por socket). Zero codigo novo no DO. Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-11, Etapa 42): Worker `armagedon-api` publicado com version ID `806fc991-c699-4ebd-840a-a2c2bbb4a5c2` — grade funcional: novo campo `grid` na cena oficial (`src/mesa.js` `normalizeSceneGrid`: `enabled`/`snap` booleanos, `cellFrac` clamp 0.01-0.25, offsets 0-1, cor #hex, opacidade 0.05-0.8; grade toda desligada normaliza para `null`) e `mesa:grid:update` em `MASTER_ONLY_TYPES` (`src/mesa-realtime-rules.js`) — o DO bloqueia jogador e retransmite pelo caminho generico, sem codigo novo no DO. Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-11, Etapa 41): Worker `armagedon-api` publicado com version ID `005b66b0-5ce4-4517-9088-65efb9eb3fc4` — hardening: cap de body no `readJson` (16KB default; 256KB em PUT /mesa/scene e PUT /characters; 413 acima disso), upload de mapa limitado a 8MB (413), DO com cap de mensagem (32KB geral / 128KB chunk de mapa / 256KB absoluto) e rate limit por socket (token bucket: 30 msg/s burst 60; chunks de mapa 120/s burst 240). Regras puras extraidas para `src/mesa-realtime-rules.js` (testavel em Node). Dry-run limpo antes; health 200 pos-deploy; E2E local 22/22 + PUT 300KB → 413.
- Deploy anterior (2026-07-10, Etapa 38): `10247d19-ed9b-4e21-9e3a-b3570a5b7160` — desenhos fim-a-fim: `mesa:drawings:update` em `RELAY_TYPES` do DO (jogador tambem desenha; relay valida array, remove tracos `dm` e limita a 300) e novo campo `drawings` na cena oficial (`src/mesa.js`: `normalizeSceneDrawing` + filtro `dm` no GET para nao-mestres). Dry-run limpo antes; health 200 pos-deploy.
- Deploy anterior (2026-07-10): `9c7c6056-b75b-4187-b6b8-78dc7f215e45` — iniciativa fim-a-fim no Durable Object (`mesa-realtime.js`): `mesa:initiative:update` entrou em `MASTER_ONLY_TYPES` (so o mestre transmite o estado autoritativo) e `mesa:initiative:roll` entrou em `RELAY_TYPES` com validacao de identidade (jogador so rola pelo proprio personagem: `characterKey` do payload precisa ser o username autenticado do socket, mesmo padrao do `mesa:sheet:patch`; ack de erro caso contrario). Dry-run limpo antes; health 200 pos-deploy. Antes deste deploy o DO descartava silenciosamente os dois tipos e a iniciativa so funcionava na tela do mestre.
- Deploy anterior (2026-07-07): `5c01e5e4-67f0-420b-9dc6-581c3e10ba32` — cena auto-suficiente: `normalizeSceneToken` preserva dados de exibicao (`type` whitelist, `name`, `ownerUsername`, `imageUrl` http-only com 600 chars max, vitais clampados 0-999999); novo campo `map: { id, url, transform }` normalizado por `normalizeSceneMap` (URL http obrigatoria, fracs -8..8, scale 0.05..20); GET /api/mesa/scene anula os vitais de tokens com `statsVisibleToPlayers:false` para nao-mestres. Health 200 pos-deploy. Nota: `MAP_R2_TTL` continua sem enforcement em codigo — mapas persistem no R2 (comportamento desejado: a cena agora referencia a URL).
- Deploy anterior (2026-07-05): `42b27e84-5547-4d23-b8e7-81fb240b1cfa` — persistencia do campo `layer` dos tokens e filtro server-side da camada `dm` no GET /api/mesa/scene para nao-mestres (bug 1 da auditoria).
- Deploy anterior: `44ddb8ef-776e-4bdc-841b-9dd171af1690`.
- Validacao publica:
  - `GET /api/health`: HTTP 200
  - `GET /api/mesa/scene` sem sessao: HTTP 401, confirmando rota ativa e protegida
