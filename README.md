# Armagedon

Portal estatico para campanha de RPG com home, fichas, mesa virtual, regras, NPCs, monstros, memorias, inventario e API publicada em Cloudflare Workers + D1.

## Regra Obrigatoria de Documentacao

Sempre que qualquer pessoa ou agente alterar o site, tambem deve atualizar os arquivos `.md` relacionados.

No minimo:

- atualize `DEV_STATUS.md` quando mudar comportamento, arquitetura, arquivos principais ou pendencias
- atualize `SYSTEM_RULES.md` quando a mudanca tocar regra de gameplay, permissao ou persistencia
- atualize `VISUAL_RULES.md` quando a mudanca criar ou consolidar decisao visual
- atualize `cloudflare/README.md` quando a mudanca tocar Worker, D1, rotas ou deploy Cloudflare
- atualize `server/README.md` quando a mudanca tocar o backend Express/PostgreSQL legado
- atualize `DEPLOY_FREE.md` quando a mudanca alterar publicacao, workflow ou arquivos enviados

Cada atualizacao deve registrar: o que mudou, quais arquivos foram afetados, como validar e quais pendencias continuam abertas. Esta regra existe para reduzir contexto em conversas futuras.

## Leitura Rapida Para Reduzir Contexto

Para entender o projeto sem reler historico de conversa:

- `README.md`: visao geral e mapa de arquivos
- `DEV_STATUS.md`: estado atual, ultimas mudancas, validacoes e proximas frentes
- `SYSTEM_RULES.md`: regras funcionais que nao devem mudar sem autorizacao
- `VISUAL_RULES.md`: padroes visuais consolidados
- `cloudflare/README.md`: API ativa em Workers + D1
- `server/README.md`: backend Express/PostgreSQL legado e referencia local
- `DEPLOY_FREE.md`: roteiro de publicacao gratuita e observacoes de deploy

## Voce precisa criar um projeto novo?

Nao. Este projeto atual ja pode ser usado.

Hoje o frontend funciona como site estatico puro, sem build e sem bundler:

- `index.html`: home/login e painel inicial
- `ficha.html`: painel de fichas, jogador, NPC e monstro
- `mesa.html`: mesa virtual e tokens
- `regras.html`: regras da campanha
- `css/`: estilos separados por pagina e dominio
- `js/`: logica separada por dominio
- `cloudflare/`: API ativa em Cloudflare Workers + D1
- `server/`: backend Express/PostgreSQL legado, mantido como referencia e alternativa local

## Como colocar em pratica

### Opcao 1: abrir direto no navegador

1. Entre na pasta do projeto.
2. Clique duas vezes em `index.html`.
3. O navegador vai abrir o site.

Isso costuma funcionar porque o frontend nao depende de build. Para dados centralizados, use a API configurada em `js/runtime-config.js`.

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

No site publicado, os dados principais devem ficar no servidor:

- API: Cloudflare Workers
- banco: Cloudflare D1
- URL configurada em `js/runtime-config.js`

O navegador ainda usa cache/fallback local:

- `localStorage` para a sessao de login
- `localStorage` para cache de fichas e diretorio
- `localStorage` para fallback local quando a API nao esta disponivel

Isso significa:

- producao nao deve depender de `localStorage` como fonte principal
- alteracoes feitas offline podem divergir do D1 se a API cair
- qualquer ajuste de persistencia precisa considerar navegador e servidor

## Arquivos Grandes Ja Separados

A ficha e a mesa foram divididas de forma incremental, ainda com `<script src="..."></script>` comum:

- ficha: `js/ficha-core.js`, `js/ficha-master.js`, `js/ficha-sheet.js`, `js/ficha-inventory.js`, `js/ficha-memories.js`, `js/ficha-soul.js`, `js/ficha-dice.js`, `js/ficha-habs.js`, `js/ficha-init.js`
- mesa: `js/mesa-core.js`, `js/mesa-stage.js`, `js/mesa-roster.js`, `js/mesa-inspector.js`, `js/mesa-storage.js`, `js/mesa-init.js`
- CSS da ficha e da mesa tambem foi separado por blocos
- `js/ficha.js`, `js/mesa.js`, `css/ficha.css` e `css/mesa.css` ficaram como entradas de compatibilidade

Manter a ordem de carregamento nos HTMLs e preservar funcoes globais usadas por handlers inline.

## O que ja foi preparado ou mantido

- backend em `server/`
- esquema SQL inicial em `server/sql/schema.sql`
- autenticacao por `usuario + senha` criada pelo mestre
- APIs para jogadores, NPCs, monstros, fichas, regras e transferencias
- base para troca de itens e memorias no servidor
- troca de itens entre jogadores ja adicionada no portal atual, com validacao de mochila cheia
- API Cloudflare em `cloudflare/` para o caminho publicado atual

## Como prosseguir com banco de dados

Este caminho usa o backend Express/PostgreSQL legado. O caminho publicado atual recomendado e Cloudflare Workers + D1, documentado em `cloudflare/README.md`.

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
- `mesa.html` deve ser publicado junto com `index.html`, `ficha.html` e `regras.html`

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

- API publicada: Cloudflare Workers
- banco publicado: Cloudflare D1
- frontend: site estatico sem build
- ficha e mesa: JS/CSS divididos por dominio
- workflow do GitHub Pages inclui `mesa.html`
- realtime via Socket.IO fica desligado por padrao quando a API ativa e Worker
- Vida atual e Integridade atual sao limitadas ao maximo antes de salvar
- jogador pode alterar Integridade atual na propria ficha e na mesa
- transferencias jogador-para-jogador no Worker validam tipo `player` e usam lote para origem, destino e auditoria
- Express/PostgreSQL em `server/` continua como legado/referencia

## Proxima Etapa da Mesa Realtime

A Mesa ja pode ser publicada como pagina estatica oficial. Para virar realtime de verdade, a proxima etapa tecnica e:

1. criar persistencia de cena no D1
2. criar Durable Object por sala/mesa
3. conectar navegadores via WebSocket
4. transmitir movimento/status em tempo real
5. salvar no D1 com debounce para evitar gravacao excessiva
