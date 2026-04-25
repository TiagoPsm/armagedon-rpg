# Migracao para Cloudflare

Base inicial para migrar o portal Armagedon para:

- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- Durable Objects no passo seguinte

## Regra Obrigatoria de Documentacao

Qualquer alteracao no Worker, D1, rotas, deploy ou comportamento publicado da API deve atualizar este arquivo no mesmo PR.

Registro minimo esperado:

- o que mudou
- quais rotas ou tabelas foram afetadas
- como validar a mudanca
- quais riscos ou pendencias continuam abertos

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
- normalizacao de ficha em `src/sheet.js`

## Normalizacao de Ficha no Worker

A rota `PUT /api/characters/:key` deve normalizar a ficha antes de persistir em D1.

Regras atuais:

- Vida atual nao pode passar da Vida maxima
- Integridade maxima de jogador/NPC deriva de Alma e ignora `integMax` divergente enviado pelo cliente
- Integridade atual nao pode passar da Integridade maxima
- Monstros continuam sem Integridade, inventario, faccao ou memorias possuidas

## Transferencias no Worker

As rotas de transferencia jogador-para-jogador ficam em `cloudflare/src/characters.js`.

Regras atuais:

- origem e destino precisam existir
- origem e destino precisam ser `player`
- origem e destino nao podem ser a mesma ficha
- o ator precisa ter acesso de escrita a ficha de origem
- item so entra no destino se houver espaco na mochila
- item, memoria e auditoria sao persistidos em lote via `env.DB.batch`

O uso de `env.DB.batch` evita gravacao parcial entre origem, destino e auditoria. A documentacao atual do D1 informa que batches rodam como transacoes: se uma instrucao falha, a sequencia inteira e abortada/rollback.

## O que ainda falta migrar

- realtime com Durable Objects
- persistencia oficial da cena da Mesa no D1
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
