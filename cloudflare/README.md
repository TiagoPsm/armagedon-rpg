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
- Desenhos da Mesa (Etapa 38): `mesa:drawings:update` esta em `RELAY_TYPES` do `MesaRealtimeRoom` e NAO e master-only (jogador tambem desenha); o relay exige `drawings` array (ack de erro caso contrario), remove tracos `layer:"dm"` e limita a 300 tracos. A cena oficial (`data_json.drawings`) normaliza cada traco em `src/mesa.js` (`normalizeSceneDrawing`: ferramentas `pencil|line|rect|circle`, cor `#hex`, width 1-12, fracoes 0-1 com 4 casas, caps 300 tracos / 200 pontos por lapis) e o GET `/api/mesa/scene` filtra tracos `dm` para nao-mestres. Mudancas no DO exigem `wrangler deploy`
- Limites de requisicao (Etapa 41): `readJson` aceita 16KB por padrao e responde 413 acima do cap (PUT /mesa/scene e PUT /characters usam 256KB); upload de mapa no R2 limitado a 8MB. No `MesaRealtimeRoom`: mensagens WS de ate 32KB (chunk de mapa `mesa:map:ws:chunk` ate 128KB; teto absoluto 256KB) e rate limit por socket via token bucket (30 msg/s com burst 60; chunks de mapa em bucket proprio de 120/s com burst 240; `ping` isento). As regras puras do DO (tipos, limites, sanitizacao, normalizacao de patch) vivem em `src/mesa-realtime-rules.js` — sem import de `cloudflare:workers`, para os testes unitarios rodarem em Node
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

- `wrangler d1 execute armagedon --remote --file d1/schema.sql`: aplicado com sucesso no D1 remoto.
- Tabela confirmada: `mesa_scenes`.
- `wrangler deploy` (2026-07-27, Etapa 46): Worker `armagedon-api` publicado com version ID `fd78827c-4ac1-4084-840d-b3d7a512d880` — marcadores de status: novo campo `statusMarkers` por token na cena oficial (`src/mesa.js` `normalizeSceneStatusMarkers`: whitelist de 12 condicoes espelhada de js/mesa-stage.js, dedupe, cap 8; cena antiga sem o campo vira `[]`). Sem mudanca no DO (sincroniza pelo `mesa:token:upsert` existente). Dry-run limpo antes; health 200 pos-deploy.
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
