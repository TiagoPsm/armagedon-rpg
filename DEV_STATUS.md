# DEV STATUS

Este arquivo registra o estado atual do projeto e deve ser atualizado ao final de cada etapa importante.

## Regra Obrigatoria de Documentacao

Qualquer alteracao no site deve vir acompanhada de atualizacao nos `.md` relacionados. Registro minimo esperado:

- resumo do que mudou
- arquivos principais alterados
- validacoes executadas
- pendencias ou riscos que continuam abertos

## Projeto

- Nome: Armagedon
- Tipo: portal de campanha de RPG
- Frontend: HTML, CSS e JavaScript puros
- API publicada: Cloudflare Workers
- Banco publicado: Cloudflare D1
- Banco local legado/preparado: PostgreSQL em `server/`

## Arquitetura Atual

- Site estatico publicado separadamente da API
- Frontend aponta para `https://armagedon-api.tiagopsm2008.workers.dev/api`
- Worker usa o banco D1 `armagedon`
- A ficha e armazenada principalmente em JSON dentro da tabela `characters`
- Nao existe build/bundler nesta etapa
- Scripts continuam carregados por `<script src="..."></script>`
- A ordem de carregamento dos scripts da ficha e da mesa e parte do contrato atual

## Estado Funcional Atual

- Login com mestre e jogadores funcionando via API
- Fichas centralizadas no servidor
- Painel do mestre com jogadores, NPCs e monstros
- Sistema de regras publicado
- Transferencia de itens entre jogadores
- Transferencia de memorias entre jogadores
- Drop de memoria de monstros
- Progressao por Essencias da Alma implementada
- Rolagem de dados na ficha implementada
- Mesa virtual publicada no GitHub Pages
- Mesa usa personagens e status das fichas quando a API esta ativa
- Posicao e visibilidade dos tokens da Mesa ainda ficam locais ate a etapa realtime
- Jogador pode alterar Integridade atual na propria ficha e na Mesa
- Vida atual de jogador, NPC e monstro nao pode passar da Vida maxima
- Integridade atual continua limitada pela Integridade maxima

## Ultima Etapa Concluida

- `mesa.html` teve os textos de mock/prototipo substituidos por comunicacao de Mesa oficial
- A interface agora comunica o estado real: fichas/status online quando a API esta ativa, cena local ate Durable Objects/WebSocket
- Cache do `js/mesa.js` foi atualizado no HTML para forcar o navegador a buscar a versao nova
- Validacoes executadas localmente:
  - busca por `Mock local`, `prototipo`, `Prototipo`, `fluxo local`, `sem backend`
  - `node --check js/mesa-roster.js`
  - `node --check js/mesa-inspector.js`

## Ajustes de Gameplay Ja Consolidados

- Integridade substituiu Sanidade
- Integridade maxima e derivada da Alma: a cada 3 pontos de Alma, +1 de Integridade maxima
- Integridade atual pode ser ajustada pelo jogador na propria ficha e na Mesa
- Vida atual nao pode ultrapassar Vida maxima
- Integridade atual nao pode ultrapassar Integridade maxima
- Atributos sem limite superior
- Inventario minimo atual: 10 slots
- Jogadores nao veem controles de aumentar e diminuir slots
- Mestre pode ajustar slots quando permitido pela interface

## Arquivos Sensiveis

- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- `css/ficha-*.css`
- `css/mesa*.css`
- `css/index.css`
- `css/regras.css`
- `js/ficha-*.js`
- `js/mesa*.js`
- `js/auth.js`
- `js/regras.js`
- `js/api.js`
- `js/runtime-config.js`
- `cloudflare/src/index.js`
- `cloudflare/src/auth.js`
- `cloudflare/src/characters.js`
- `cloudflare/src/sheet.js`
- `cloudflare/src/soul-progression.js`
- `server/src/utils/sheet.js`

## Proximas Frentes Recomendadas

1. Consolidar no GitHub a separacao local dos arquivos grandes da Mesa, se ela ainda nao estiver publicada na branch principal
2. Projetar e implementar Mesa realtime com Durable Objects/WebSocket
3. Criar persistencia oficial da cena da Mesa no D1
4. Revisar responsividade da ficha, inventario e mesa
5. Otimizar imagens e cache depois das correcoes funcionais

## Publicacao

Na maior parte das etapas recentes, o caminho mais seguro tem sido publicar:

- pasta `css`
- pasta `js`
- pasta `cloudflare`
- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- arquivos `.md` alterados

Sempre confirmar os arquivos exatos da etapa antes do upload.
