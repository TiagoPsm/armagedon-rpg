# Migracao para Cloudflare

Base inicial para migrar o portal Armagedon para:

- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- Durable Objects no passo seguinte

## Estado atual desta migracao

Esta base cobre o inicio da API em Workers com:

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

## O que ainda falta migrar

- realtime com Durable Objects
- refinamento das permissoes e sincronizacao em tempo real
- testes completos de todos os fluxos publicados

## Como esta modelado

Para acelerar a migracao, a modelagem do D1 segue a mesma ideia do backend atual:

- `users`
- `characters`
- `rules_posts`
- `transfer_audit`

O campo `data_json` em `characters` guarda a ficha inteira em JSON.

## Proximo passo recomendado

Depois de criar a conta Cloudflare, o proximo passo e:

1. criar o projeto Pages
2. criar o banco D1
3. aplicar `d1/schema.sql`
4. configurar os secrets do Worker
5. ligar o frontend publicado na nova API
6. migrar realtime com Durable Objects
