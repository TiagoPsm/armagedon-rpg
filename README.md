# Armagedon

Portal para campanha de RPG com home, fichas, regras, NPCs, monstros, memorias e inventario.

## Voce precisa criar um projeto novo?

Nao. Este projeto atual ja pode ser usado.

Hoje o frontend ainda funciona como site estatico:

- `index.html` e a pagina inicial
- `ficha.html` e o painel de fichas
- `regras.html` e o arquivo de regras da campanha
- `css/` guarda os estilos
- `js/` guarda a logica de login e fichas
- `server/` agora guarda a base do backend Node + PostgreSQL para migrar o portal para um servidor centralizado

## Como colocar em pratica

### Opcao 1: abrir direto no navegador

1. Entre na pasta do projeto.
2. Clique duas vezes em `index.html`.
3. O navegador vai abrir o site.

Isso costuma funcionar porque o projeto nao depende de build nem backend.

### Opcao 2: rodar com servidor local

Se preferir um fluxo mais limpo, rode um servidor simples.

No PowerShell, dentro da pasta do projeto:

```powershell
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

## Login inicial do modo local

Usuario mestre padrao:

```text
mestre
```

Senha mestre padrao:

```text
Mestre123
```

## Como o modo atual salva os dados

O projeto usa o armazenamento do proprio navegador:

- `localStorage` para a sessao de login
- `localStorage` para jogadores e fichas
- `localStorage` para as postagens de regras

Isso significa:

- os dados ficam no navegador atual
- a sessao continua ativa mesmo depois de fechar a aba
- se voce limpar os dados do navegador, os personagens somem
- nao existe banco de dados ativo ainda no frontend atual

## O que ja foi preparado para a migracao

- backend em `server/`
- esquema SQL inicial em `server/sql/schema.sql`
- autenticacao por `usuario + senha` criada pelo mestre
- APIs para jogadores, NPCs, monstros, fichas, regras e transferencias
- base para troca de itens e memorias no servidor
- troca de itens entre jogadores ja adicionada no portal atual, com validacao de mochila cheia

## Como prosseguir com banco de dados

1. Instale Node.js 18+ na maquina onde o backend vai rodar.
2. Crie um banco PostgreSQL.
3. Aplique `server/sql/schema.sql`.
4. Copie `server/.env.example` para `server/.env` e ajuste as variaveis.
5. Entre em `server/` e rode `npm.cmd install`.
6. Rode `npm.cmd start`.
7. Mantenha o frontend em `http://localhost:8000` e o backend em `http://localhost:4000`.

Detalhes completos estao em `server/README.md`.

## Publicacao gratuita recomendada

Se o objetivo for publicar rapido com poucas mudancas, o caminho mais simples continua sendo:

- frontend estatico no GitHub Pages
- backend Node.js no Render
- banco PostgreSQL no Neon

Se o objetivo for a melhor base gratuita possivel no medio prazo, a migracao recomendada agora passa a ser:

- frontend: Cloudflare Pages
- API: Cloudflare Workers
- banco: Cloudflare D1
- realtime: Durable Objects

A base inicial dessa migracao esta em `cloudflare/`.

### Antes de publicar

1. Nao publique `server/.env`.
2. Confirme que `.gitignore` esta ativo.
3. Gere um `JWT_SECRET` proprio em producao.
4. Troque a senha padrao do mestre.

### Frontend

O frontend ja esta pronto para GitHub Pages:

- `.nojekyll` evita processamento desnecessario do Pages
- `js/runtime-config.js` centraliza a URL da API publicada
- `.github/workflows/pages.yml` publica so os arquivos estaticos do portal

Para publicar, edite `js/runtime-config.js` e troque:

```js
apiBaseUrl: "http://localhost:4000/api"
```

por algo como:

```js
apiBaseUrl: "https://api-seu-projeto.exemplo.com/api"
```

Depois envie o repositorio ao GitHub e publique a raiz do projeto como site estatico.

Se sua branch principal nao se chama `main`, ajuste isso em `.github/workflows/pages.yml`.

### Backend

O backend agora esta pronto para o Render com:

- `render.yaml`

Tambem continua compativel com hosts Node/Docker usando:

- `server/Procfile`
- `server/Dockerfile`

No Render, basta conectar o repositorio e preencher os segredos do Blueprint. Em outros hosts, a configuracao minima continua sendo:

- `PORT`
- `DATABASE_URL`
- `DATABASE_SSL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `MASTER_BOOTSTRAP_USERNAME`
- `MASTER_BOOTSTRAP_PASSWORD`

### Banco

Use um PostgreSQL externo e passe a string completa em `DATABASE_URL`.

### Dominio proprio

Se voce ja usa dominio proprio, mantenha assim:

- site: `www.seudominio.com`
- api: `api.seudominio.com`

O frontend aponta para a API apenas pelo `js/runtime-config.js`, entao futuras trocas de host ficam simples.

Existe tambem um roteiro direto em `DEPLOY_FREE.md` para seguir a publicacao gratuita passo a passo.

## Estado atual

- o PostgreSQL local foi configurado com o banco `armagedon`
- o esquema SQL ja foi aplicado com sucesso
- o backend ja respondeu em `GET /api/health` e `POST /api/auth/login`
- um teste de fumaca validou criacao de jogadores, troca de itens, troca de memorias, monstro com drop e CRUD de regras
- o frontend ja tem deteccao de backend e fallback local, mas ainda precisa de testes completos no navegador com o servidor ligado
