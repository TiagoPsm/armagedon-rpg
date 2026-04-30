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
- `transfer_audit`

O campo `data_json` em `characters` guarda a ficha inteira em JSON.

## Regras de Backend Que Devem Permanecer

- Producao deve salvar no D1, nao depender de `localStorage`
- Jogador so pode editar a propria ficha
- Mestre controla jogadores, NPCs, monstros, regras e concessao de Essencia da Alma
- Vida atual nao pode passar da Vida maxima
- Integridade maxima de jogador/NPC deriva de Alma no Worker e ignora `integMax` divergente enviado pelo cliente
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

1. desenhar schema D1 da Mesa oficial
2. implementar Durable Object da sala da Mesa com WebSocket
3. salvar estado da cena no D1 com debounce
4. manter `d1/schema.sql` sincronizado com qualquer mudanca de banco
5. documentar cada alteracao neste arquivo e em `../DEV_STATUS.md`
