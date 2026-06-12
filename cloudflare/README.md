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
- `POST /api/transfers/items/player-to-player`
- `POST /api/transfers/memories/player-to-player`
- `POST /api/transfers/memories/monster-roll`
- `POST /api/transfers/memories/monster-award`
- `GET /api/rules`
- `POST /api/rules`
- `PUT /api/rules/:id`
- `DELETE /api/rules/:id`

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

O campo `data_json` em `characters` guarda a ficha inteira em JSON.
O campo `data_json` em `mesa_scenes` guarda a cena visual da Mesa: tokens ativos, posicao, ordem, visibilidade e exposicao de status.

## Regras de Backend Que Devem Permanecer

- Producao deve salvar no D1, nao depender de `localStorage`
- Jogador so pode editar a propria ficha
- Mestre controla jogadores, NPCs, monstros e regras; o nucleo da alma (Essencia/pesadelo) pode ser gerenciado pelo dono da ficha na propria ficha e pelo mestre em todas
- Jogadores podem ler a cena da Mesa, mas apenas o mestre pode salvar posicao, ordem e visibilidade dos tokens
- No Durable Object `MesaRealtimeRoom`, sinais de mapa que distribuem/limpam conteudo (`mesa:map:announce/set/clear/offer/ws:*`) exigem role master; sinais jogador -> mestre (`have/need/answer/ice`) sao liberados
- Respostas 500 nao devem expor `error.message` interno ao cliente; detalhes vao para `console.error` (acessivel via `wrangler tail`)
- CORS usa allowlist (github.io, armagedon-rpg.pages.dev + previews, localhost); novos dominios do site precisam ser adicionados em `ALLOWED_ORIGINS` no `src/auth.js`
- `ensureMasterUser` roda somente na rota de login, nao em todas as requisicoes
- Upload de avatar: maximo 2 MB, apenas `image/webp` ou `image/jpeg`
- `GET /api/mesa/map/<key>` continua sem auth (URL vira background-image, sem headers), mas so serve chaves `maps/<user>/<id>.webp`; mitigacao extra e o TTL do R2
- Senhas: PBKDF2-SHA256 com salt por usuario (25k iteracoes) + pepper de secret; hashes legados sha256 migram sozinhos no primeiro login valido — nao remover o caminho legado enquanto houver hash antigo no banco
- Rate-limit de login: tabela `login_throttle` (usuario+IP, 8 falhas = 10 min de bloqueio); manter schema.sql sincronizado e aplicar migracao remota antes de deploys que dependam de tabela nova
- Progressao da alma: ganhos de Essencia e pesadelos gravam auditoria em `soul_audit`; quando o ator e jogador, o Worker dispara `soul:awarded`/`soul:nightmare` e o DO entrega apenas a sockets master (`broadcastToMasters`)
- Movimento de token: `mesa:move:lock` (master-only) alterna a trava global persistida no storage do DO; `mesa:token:move` de jogador so e retransmitido com a trava aberta e `characterKey` igual ao username autenticado; a posse do token e validada nos clientes ao aplicar o delta
- Vida atual nao pode passar da Vida maxima
- Integridade maxima de jogador/NPC e editavel; o Worker preserva `integMax` enviado pelo cliente e apenas clampa Integridade atual pelo maximo salvo
- Integridade atual nao pode passar da Integridade maxima
- Habilidades devem preservar `id`, `name`, `type`, `trigger` e `desc` ao salvar no D1
- Monstros nao devem ganhar inventario, faccao ou memorias possuidas
- Troca de itens deve ser limitada a jogador para jogador
- Transferencias jogador-para-jogador devem persistir origem, destino e auditoria via `DB.batch`

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
- `wrangler deploy`: Worker `armagedon-api` publicado com version ID `44ddb8ef-776e-4bdc-841b-9dd171af1690`.
- Validacao publica:
  - `GET /api/health`: HTTP 200
  - `GET /api/mesa/scene` sem sessao: HTTP 401, confirmando rota ativa e protegida
