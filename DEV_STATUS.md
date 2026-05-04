# DEV STATUS

Este arquivo registra o estado atual do projeto e deve ser atualizado ao final de cada etapa importante.

## Regra Obrigatoria de Documentacao

Qualquer alteracao no site deve vir acompanhada de atualizacao nos `.md` relacionados. Este arquivo deve ser atualizado sempre que a mudanca afetar comportamento, arquitetura, arquivos principais, deploy, pendencias ou validacoes.

Registro minimo esperado:

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
- Frontend aponta para a API em:
  - `https://armagedon-api.tiagopsm2008.workers.dev/api`
- Worker usa o banco D1 `armagedon`
- A ficha e armazenada principalmente em JSON dentro da tabela `characters`
- Nao existe build/bundler nesta etapa
- Scripts continuam carregados por `<script src="..."></script>`
- A ordem de carregamento dos scripts da ficha e da mesa e parte do contrato atual

## Banco de Dados em Uso

- Banco ativo no site publicado: Cloudflare D1
- Tipo: relacional
- Motor base: SQLite
- Tabelas principais:
  - `users`
  - `characters`
  - `rules_posts`
  - `transfer_audit`

## Regras de Trabalho

- Trabalhar por etapas pequenas e fechadas
- Validar sintaxe e logica ao final de cada etapa
- Informar exatamente quais arquivos foram alterados
- Informar exatamente o que precisa ser enviado ao GitHub
- Nao mudar regras do sistema sem autorizacao explicita
- Usar sempre `C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync` como pasta oficial de trabalho
- Tratar `C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign` como copia antiga/local, nao como fonte para commits
- Manter este arquivo e os demais documentos locais de referencia atualizados em toda mudanca

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
- Mesa virtual com roster, palco, inspetor e edicao local/online de status
- Jogador pode alterar Integridade atual na propria ficha e na Mesa
- Vida atual de jogador, NPC e monstro nao pode passar da Vida maxima
- Integridade atual continua limitada pela Integridade maxima

## Estado Visual Atual

- A ficha e a referencia visual principal do projeto
- Direcao atual:
  - dark fantasy
  - preto profundo
  - vermelho escuro
  - atmosfera inspirada em Shadow Slave
- Home/login ja segue essa mesma linguagem visual

## Ultima Etapa Concluida

- Correcao de tokens iniciais da Mesa em 2026-05-04:
  - problema identificado: a API oficial tinha diretorio populado, mas a cena `default` estava salva com `0` tokens; em navegadores com cache/diretorio local desatualizado, a Mesa podia abrir sem tokens de jogadores, NPCs ou monstros
  - `js/mesa-core.js`: Mesa agora atualiza o diretorio pela API antes de montar o roster, usa a `key` oficial de NPCs/monstros quando ela vem do Worker e repopula a cena vazia/stale a partir do roster oficial
  - `mesa.html`: cache bust de `js/mesa-core.js` atualizado para `2026-05-04-mesa-tokens-1`
  - comportamento esperado: ao abrir como mestre, se a cena remota estiver vazia mas houver personagens cadastrados, a Mesa semeia tokens iniciais e salva a cena oficial no D1; jogadores passam a carregar a cena publicada
  - validacao em andamento nesta etapa: sintaxe JS, referencias HTML/CSS, API oficial, snapshot Obsidian, publicacao e leitura da pagina oficial

- Persistencia oficial inicial da Mesa em 2026-05-01:
  - `cloudflare/d1/schema.sql`: adicionada tabela `mesa_scenes` para guardar a cena oficial da Mesa em JSON no D1
  - `cloudflare/src/mesa.js`: criado modulo de leitura, normalizacao e salvamento da cena
  - `cloudflare/src/index.js`: adicionadas rotas `GET /api/mesa/scene` e `PUT /api/mesa/scene`
  - `js/api.js`: adicionados metodos `getMesaScene()` e `saveMesaScene()`
  - `js/mesa-core.js` e `js/mesa-stage.js`: Mesa passa a carregar cena oficial quando a API esta ativa e salvar alteracoes do mestre no servidor, mantendo `localStorage` como fallback
  - `js/mesa-roster.js` e `mesa.html`: textos ajustados para indicar persistencia no servidor sem prometer realtime ainda
  - permissao consolidada: jogadores podem ler a cena oficial; apenas mestre pode salvar posicao, ordem e visibilidade de tokens
  - D1 remoto: schema aplicado em `armagedon` e tabela `mesa_scenes` confirmada
  - Worker publicado: `armagedon-api`, version ID `44ddb8ef-776e-4bdc-841b-9dd171af1690`
  - GitHub Pages publicado pela `main` com cache bust `2026-05-01-mesa-scene-1`
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; links wiki do Obsidian; `wrangler deploy --dry-run`; `wrangler d1 execute` remoto; `GET /api/health` com HTTP 200; `GET /api/mesa/scene` sem sessao com HTTP 401; `mesa.html`, `js/mesa-core.js` e `js/mesa-stage.js` publicados com HTTP 200
  - pendencia: validar em navegador logado como mestre e jogador a persistencia visual completa da cena no site oficial

- Automacao do vault Obsidian em 2026-05-01:
  - `tools/update-obsidian-context.ps1`: criado script para gerar snapshot automatico do estado do repositorio
  - `.githooks/pre-commit`: criado hook versionado para atualizar e adicionar o snapshot do Obsidian antes de cada commit
  - `tools/install-obsidian-hooks.ps1`: criado instalador para configurar `core.hooksPath=.githooks` neste checkout
  - `docs/obsidian/10-SNAPSHOT-AUTOMATICO.md`: passa a ser gerado com branch, ultimo commit, alteracoes locais, paginas principais, estrutura de raiz e maiores arquivos locais
  - `docs/obsidian/00-INICIO.md`: atualizado com o comando de atualizacao e com a regra de leitura do snapshot
  - `README.md`: documentado o fluxo de automacao para reduzir contexto e tokens em sessoes futuras
  - regra operacional consolidada: toda etapa com alteracao de arquivo deve terminar com snapshot atualizado; commits usam hook automatico, etapas sem commit devem rodar o script manualmente
  - validacoes executadas: `.\tools\update-obsidian-context.ps1`; parser PowerShell dos scripts; links wiki do vault; `git diff --check`

- Vault Obsidian de contexto em 2026-05-01:
  - criado `docs/obsidian/` como base Markdown para abrir no Obsidian
  - adicionadas notas de entrada, contexto atual, arquitetura, decisoes, pendencias, deploy, ficha, mesa, regras e historico compacto
  - `README.md`: atualizado para apontar o novo vault como leitura rapida recomendada
  - objetivo: reduzir releitura completa do repositorio, melhorar obtencao de contexto e manter decisoes do projeto organizadas em arquivos versionados

- Polimento visual da ficha em 2026-05-01:
  - `css/ficha-responsive.css`: adicionada camada final para espacamento de secoes, alinhamento de cabecalhos, foco visivel, cards de habilidades/poderes, inventario e modal de rolagem
  - `ficha.html`: atualizado cache bust de `css/ficha-responsive.css` para `2026-05-01-sheet-polish`
  - escopo mantido em visual/ergonomia: sem alteracao em regras de jogo, persistencia, backend ou fluxo de dados
  - validacoes executadas: `node --check` nos JS principais; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; servidor local em `index.html`, `ficha.html`, `mesa.html` e `regras.html` com HTTP 200, sem MP4 e sem `/assets/`; Browser Use no painel do mestre, ficha de jogador, inventario, habilidades/poderes e modal de rolagem sem erros de console

- Brilho carmesim de cursor em 2026-05-01:
  - `css/ui.css`: adicionada camada pequena de glow vermelho carmesim centralizada no ponteiro, com `pointer-events: none` e sem interferir na leitura
  - `js/ui.js`: inicializacao global do efeito com `requestAnimationFrame`, apenas para ponteiro fino e respeitando `prefers-reduced-motion: reduce`
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: carregam a versao `2026-05-01-cursor-glow` de `css/ui.css` e `js/ui.js`
  - validacoes executadas: `node --check` em todos os JS; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; servidor local retornando 200 nas quatro paginas com `ui.css` e `ui.js` presentes

- Simplificacao de fundo visual em 2026-04-30:
  - fundos animados decorativos foram desligados em home, ficha, mesa e regras
  - o site passou a usar base preta estatica com brilho vermelho sutil, preservando a direcao dark fantasy sem custo de animacao de fundo
  - `css/index.css`, `css/style.css`, `css/mesa-base.css`, `css/regras.css`, `css/ficha-layout.css` e `css/ficha-inventory-memory.css` receberam overrides finais para remover orbitas, cinzas, brasas e glow dinamico de fundo
  - validacoes executadas: `node --check` em todos os JS; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; Browser Use nas quatro paginas sem erros de console, sem MP4 e sem requisicoes a `/assets/`

- Otimizacao visual e de velocidade do site em 2026-04-30:
  - `.github/workflows/pages.yml`: o GitHub Pages deixou de copiar a pasta `assets/` inteira, evitando publicar o MP4 pesado `assets/sheet-fire-background.mp4` enquanto ele nao estiver em uso
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: removidos `prefetch` cruzados entre paginas para reduzir requisicoes antecipadas no carregamento inicial
  - HTMLs principais: logos agora usam `width`, `height` e `decoding="async"`; a imagem principal da primeira dobra da home usa `fetchpriority="high"`
  - HTMLs principais: fallback de logo nao depende mais de `assets/logo-rpg-armagedon.png`; permanece limitado a arquivos publicados na raiz
  - CSS principal das paginas: adicionado suporte a `prefers-reduced-motion` e fallback visual para navegadores sem `backdrop-filter`
  - documentacao atualizada: `DEV_STATUS.md`, `VISUAL_RULES.md` e `DEPLOY_FREE.md`
  - validacoes executadas: `node --check` em todos os JS; varredura de referencias HTML/CSS e IDs duplicados; `git diff --check`; Browser Use nas quatro paginas; Edge headless em 1366x900 e 390x844
  - resultado de performance: pacote publicado estimado caiu cerca de 14 MB por nao publicar `assets/` inteiro

- Ajuste visual da ficha em 2026-04-30:
  - `js/ficha-core.js`: habilidades/poderes passam a abrir minimizados por padrao sempre que uma ficha e carregada
  - o estado de expandido/minimizado continua funcionando durante o uso da ficha, mas nao e mais reaproveitado para abrir a ficha expandida em acessos seguintes
  - pendencia: validar no navegador antes de publicar

- Retomada de revisao em 2026-04-30:
  - a pasta antiga `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign` foi excluida com sucesso
  - a pasta oficial restante e `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign-git-sync`
  - `node --check` passou em 48 arquivos JavaScript de `js/`, `cloudflare/src/` e `server/src/`
  - varredura inicial nao encontrou arquivos inexistentes referenciados por `src` ou `href` nos HTMLs
  - varredura inicial nao encontrou IDs duplicados nos HTMLs
  - correcoes aplicadas durante a revisao estatica:
    - `cloudflare/src/sheet.js` agora preserva `id`, `type` e `trigger` das habilidades ao normalizar fichas no Worker
    - `js/ficha-soul.js` agora calcula o estado anterior da Essencia da Alma antes de atualizar `soulCore` no modo local
  - validacao adicional executada: `node --check` em `cloudflare/src/sheet.js`, `cloudflare/src/index.js`, `server/src/utils/sheet.js` e `js/ficha-core.js`
  - validacao funcional automatizada executada com Microsoft Edge headless:
    - normalizacao de habilidades do Worker preserva `id`, `type`, `trigger` e `desc`
    - login local do mestre funciona quando `ARMAGEDON_CONFIG` aponta para API local indisponivel
    - criacao de jogador local, abertura de ficha, criacao de habilidade, salvamento e recarregamento preservam dados
    - rolagem de dados retorna total numerico
    - concessao local de 100 Essencias rank 1 exibe progressao de Adormecido para Despertado no resumo
  - achado remanescente:
    - `server/src/routes/characters.js` nao possui a rota `POST /characters/:key/soul-essence`, embora o frontend chame essa rota quando a API esta ativa; isso afeta o backend Express/PostgreSQL legado, nao o Worker publicado
  - pendencia aberta: continuar revisao funcional em navegador nas telas de ficha, mesa e regras

- Controle de arquivos `.md` desta etapa, em 2026-04-30:
  - `README.md`: registrado o status operacional da limpeza da pasta antiga, deixando claro que `rpg-campaign-git-sync` e a pasta oficial preservada
  - `DEV_STATUS.md`: registrado este resumo de controle para rastrear a etapa
  - validacao executada: listagem das pastas em `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp`
  - pendencia anterior resolvida: o diretorio vazio `rpg-campaign` foi apagado

- Limpeza operacional da pasta antiga:
  - tentativa de apagar `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign`
  - o conteudo interno foi removido
  - em nova tentativa, o diretorio vazio foi excluido com sucesso
  - `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign-git-sync` foi mantida intacta como pasta oficial

- Registro operacional desta conversa:
  - o projeto oficial no Codex passou a ser `rpg-campaign-git-sync`
  - a conversa antiga ainda estava vinculada a `rpg-campaign`, por isso o Windows bloqueou apagar ou renomear a pasta antiga
  - comparacao meticulosa entre as pastas indicou `0` arquivos exclusivos na pasta antiga
  - a pasta oficial tem arquivos a mais e esta alinhada com `origin/main`, portanto segue sendo a fonte de verdade
  - proximos passos devem acontecer em novo chat/projeto apontando para `rpg-campaign-git-sync`
  - a pasta antiga so deve ser enviada para a Lixeira depois que chats, terminais e apps que ainda usam `rpg-campaign` forem fechados

- Pasta oficial de trabalho consolidada: toda alteracao futura deve usar `rpg-campaign-git-sync`, que e o checkout Git alinhado com `origin/main`
- A pasta antiga `rpg-campaign` permanece apenas como copia historica/local e nao deve ser usada para publicar
- Documentacao `.md` atualizada para registrar essa regra operacional antes do proximo passo
- Etapa anterior:
  - commit `3d7496b` publicado direto na `main`
  - GitHub Pages validado com sucesso
  - site publicado confirmado servindo os arquivos separados da ficha e da Mesa

- Textos da Mesa oficial atualizados para remover o aspecto de "mock/prototipo" no site publicado
- A interface agora comunica o estado real: personagens e status usam fichas online quando a API esta ativa, enquanto posicao/visibilidade da cena ainda ficam locais ate Durable Objects/WebSocket
- `mesa.html` atualizou a versao de cache dos scripts de roster e inspetor para evitar JS antigo no navegador
- Documentacao `.md` atualizada junto com a mudanca, conforme regra do projeto
- Etapa anterior:
  - Worker e backend legado passaram a normalizar Vida/Integridade antes de salvar
  - Integridade maxima e derivada de Alma no servidor, nao apenas no frontend
- Antes disso:
  - transferencias de item e memoria entre jogadores no Worker passaram a validar tipo `player` e persistir origem, destino e auditoria em lote D1
- Mesa preparada para aparecer no GitHub Pages: `.github/workflows/pages.yml` agora copia `mesa.html`
- Frontend nao tenta mais carregar Socket.IO contra Worker por padrao; `realtimeEnabled` fica desligado em `js/runtime-config.js` ate Durable Objects/WebSocket existirem
- Sessao backend nao cai mais silenciosamente para modo local quando a API nao responde; a sessao e limpa para evitar divergencia entre navegador e D1
- Documentacao `.md` mantida junto com a mudanca, conforme regra do projeto
- Etapa anterior:
  - documentacao `.md` atualizada para reduzir contexto futuro e registrar obrigacao de manter docs junto com mudancas de site
- Antes disso, foram concluidas:
  - separacao incremental dos arquivos grandes de ficha e mesa
  - remocao do bloco Legacy da Mesa carregada
  - normalizacao de Vida/Integridade no frontend, Worker e backend legado
  - persistencia online dos ajustes de status feitos pela Mesa quando a API esta ativa

## Ajustes de Gameplay Ja Consolidados

- Integridade substituiu Sanidade
- Integridade maxima e derivada da Alma:
  - a cada 3 pontos de Alma, +1 de Integridade maxima
- Integridade atual pode ser ajustada pelo jogador na propria ficha e na Mesa
- Vida atual nao pode ultrapassar Vida maxima
- Integridade atual nao pode ultrapassar Integridade maxima
- Atributos sem limite superior
- Inventario:
  - minimo atual: 10 slots
  - jogadores nao veem controles de aumentar e diminuir slots
  - mestre pode ajustar slots quando permitido pela interface

## Arquivos Sensiveis

Mudancas nesses arquivos costumam impactar diretamente o funcionamento do site:

- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- `css/ficha-*.css`
- `css/mesa-*.css`
- `css/index.css`
- `css/regras.css`
- `js/ficha-*.js`
- `js/mesa-*.js`
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

## Mapa Rapido de Arquivos

- Ficha:
  - `js/ficha-core.js`: estado, storage, normalizacao e salvamento
  - `js/ficha-sheet.js`: campos, atributos, barras, avatar e regras visuais da ficha
  - `js/ficha-master.js`: painel do mestre, jogadores, NPCs e monstros
  - `js/ficha-inventory.js`: inventario e transferencia de itens
  - `js/ficha-memories.js`: memorias e drops
  - `js/ficha-soul.js`: progressao por Essencias da Alma
  - `js/ficha-dice.js`: rolagem de dados
  - `js/ficha-init.js`: inicializacao e autosave
- Mesa:
  - `js/mesa-core.js`: estado, sessao e montagem do roster
  - `js/mesa-stage.js`: palco, tokens, persistencia e edicao de status
  - `js/mesa-roster.js`: lista de personagens
  - `js/mesa-inspector.js`: painel do token selecionado
  - `js/mesa-storage.js`: helpers de storage, numeros e visual de barras
  - `js/mesa-init.js`: reservado para inicializacao futura

## Proximas Frentes Recomendadas

1. Projetar e implementar Mesa realtime com Durable Objects/WebSocket
2. Criar persistencia oficial da cena da Mesa no D1
3. Revisar responsividade da ficha, inventario e mesa
4. Otimizar imagens e cache depois das correcoes funcionais
5. Criar teste manual guiado para duas abas da Mesa quando realtime estiver pronto

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

## Validacoes Recentes

- `node --check` em todos os JS de `js/`
- `node --check` em todos os JS de `cloudflare/src/`
- `node --check` em todos os JS de `server/src/`
- servidor estatico temporario respondeu `200` para `ficha.html` e `mesa.html`
- workflow de Pages revisado para incluir `mesa.html`
- Browser Use abriu `http://127.0.0.1:8012/mesa.html` sem erros de console registrados
