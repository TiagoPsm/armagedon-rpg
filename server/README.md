# Backend Armagedon

Base de backend para tirar o portal do `localStorage` e centralizar tudo em um unico servidor.

## Stack

- Node.js 18+
- Express
- PostgreSQL
- Socket.IO

## O que este backend cobre

- login por `usuario + senha`
- mestre bootstrapado pelo servidor
- mestre cria jogadores
- criacao e exclusao de NPCs e monstros
- leitura e gravacao de fichas
- CRUD de regras
- transferencia de memorias entre jogadores
- envio de memoria de monstro para jogador ou NPC
- troca de itens entre jogadores com bloqueio por mochila cheia
- eventos em tempo real via Socket.IO
- normalizacao de Vida/Integridade antes de persistir ficha

## Estrutura

- `src/app.js`: inicializacao do servidor HTTP e Socket.IO
- `src/routes/`: rotas da API
- `src/services/`: regras de negocio
- `src/utils/`: autenticacao, senhas e normalizacao de ficha
- `sql/schema.sql`: esquema inicial do banco

## Subindo localmente

1. Crie um banco PostgreSQL vazio, por exemplo `armagedon`.
2. Aplique o esquema:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -p 5432 -d armagedon -f .\sql\schema.sql
```

3. Copie o arquivo de ambiente:

```powershell
Copy-Item .env.example .env
```

4. Ajuste no `.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `MASTER_BOOTSTRAP_USERNAME`
- `MASTER_BOOTSTRAP_PASSWORD`

5. Instale dependencias:

```powershell
npm.cmd install
```

6. Inicie o backend:

```powershell
npm.cmd start
```

## Rotas principais

- `POST /api/auth/login`
- `GET /api/auth/session`
- `GET /api/directory`
- `POST /api/directory/players`
- `POST /api/directory/npcs`
- `POST /api/directory/monsters`
- `GET /api/characters/:key`
- `PUT /api/characters/:key`
- `GET /api/rules`
- `POST /api/rules`
- `POST /api/transfers/items/player-to-player`
- `POST /api/transfers/memories/player-to-player`
- `POST /api/transfers/memories/monster-roll`
- `POST /api/transfers/memories/monster-award`

## Publicando o backend

Este diretorio ja inclui:

- `Dockerfile`
- `Procfile`
- `package-lock.json`

Na raiz do repositorio tambem existe um `render.yaml` pronto para deploy no Render.

Entao voce pode publicar o backend em um host Node ou Docker apontando a raiz para `server/`.

### Variaveis minimas de producao

- `PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `MASTER_BOOTSTRAP_USERNAME`
- `MASTER_BOOTSTRAP_PASSWORD`

### Exemplo de CORS para frontend publicado

```text
CORS_ORIGIN=https://seuusuario.github.io,https://www.seudominio.com
```

## Regras importantes

- o mestre cria os usuarios dos jogadores
- jogadores so podem editar a propria ficha
- NPCs e monstros sao controlados pelo mestre
- a troca de itens entre jogadores falha se o destino estiver sem slot livre
- Vida atual nao pode passar da Vida maxima
- Integridade maxima de jogador/NPC deriva de Alma no servidor e ignora `integMax` divergente enviado pelo cliente
- Integridade atual nao pode passar da Integridade maxima
- monstros continuam sem Integridade, inventario, faccao ou memorias possuidas

## Integracao com o frontend atual

O frontend atual ja detecta automaticamente o backend quando ele responde em `http://localhost:4000`.

Partes ja integradas:

- autenticacao em `js/auth.js`
- regras em `js/regras.js`
- criacao e exclusao de jogadores, NPCs e monstros em `js/ficha.js`
- leitura e escrita de fichas em `js/ficha.js`
- transferencia de itens e memorias em `js/ficha.js`
- rolagem e envio de memorias de monstro em `js/ficha.js`

## Observacao

No Windows PowerShell, use `npm.cmd` em vez de `npm` se a politica de execucao bloquear `npm.ps1`.
