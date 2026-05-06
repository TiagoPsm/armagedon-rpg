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
- Realtime da Mesa usa Cloudflare Durable Objects com WebSocket nativo
- A ficha e armazenada principalmente em JSON dentro da tabela `characters`
- Nao existe bundler nesta etapa
- `npm run build:pages` gera o artefato estatico `_site/` para o GitHub Pages sem publicar `assets/` inteiro
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
- Mesa virtual sincroniza cena em tempo real para mestre e jogadores conectados
- Mesa virtual usa renderer Canvas/Worker por padrao, com fallback Canvas principal e DOM legado via `localStorage.mesaRenderer = "dom"`
- Realtime da Mesa aceita deltas incrementais de token para reduzir payload durante movimento
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

- Polimento de fluidez do drag da Mesa em 2026-05-06:
  - objetivo: reduzir microtravadas ao mover tokens sem alterar a aparencia geral da Mesa
  - `js/mesa-renderer-v2.js`: renderer passou a cachear o fundo estatico do palco em Canvas, evitando redesenhar grid/glow em todo frame; tambem passou a manter lista ordenada e layouts em cache
  - `js/mesa-renderer-v2.js` e `js/mesa-renderer-worker.js`: drag em Canvas/Worker agora usa mensagem leve `move-token` para atualizar apenas posicao/layout do token movido, sem reconstruir snapshot completo a cada movimento
  - `js/mesa-stage.js`: movimento local usa `updateTokenPosition()` durante drag; realtime de drag foi ajustado para intervalos menores e mais suaves sem salvar remoto antes do `pointerup`
  - `js/ui.js` e `css/ui.css`: brilho carmesim do cursor pausa enquanto a Mesa esta em drag, reduzindo pintura concorrente no momento mais sensivel
  - `mesa.html`: cache bust atualizado para `2026-05-06-drag-polish-1`
  - `tests/mesa.performance.spec.cjs`: teste de performance agora confirma que o drag usa patches leves de movimento e nao render completo a cada movimento
  - validacoes executadas: `npm run check:js`, `npm run test:mesa`, `npm run perf:mesa` e `git diff --check`

- Estabilizacao visual dos cards da Mesa em 2026-05-05:
  - objetivo: impedir que os cards/tokens mudem de tamanho ao selecionar, entrar em tela cheia e voltar ao modo normal
  - `js/mesa-renderer-v2.js`: dimensoes do token Canvas passaram a ser estaveis entre modo normal e fullscreen; largura base aumentada para uma faixa maior que a anterior e altura ajustada para comportar nome, dono e barras sem colisao
  - `js/mesa-renderer-v2.js` e `js/mesa-renderer-worker.js`: textos do token no Canvas agora usam quebra/truncamento controlado em vez de comprimir a linha dentro do `fillText`
  - `js/mesa-stage.js`: mudanca de fullscreen tambem reagenda o redraw do palco, mantendo Canvas e estado visual sincronizados
  - `css/mesa-responsive.css`: fallback DOM recebeu largura unica para `.mesa-token` em modo normal/fullscreen, avatar com proporcao estavel e regras de `overflow-wrap` para roster, inspetor, badges, botoes e textos longos
  - `mesa.html`: cache bust atualizado para a correcao `2026-05-05-card-stability-1`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages` e `git diff --check`

- Otimizacao leve da Mesa em 2026-05-05:
  - objetivo: reduzir custo no navegador sem redesign e sem alterar o formato publico de `GET/PUT /api/mesa/scene` ou `GET /api/mesa/realtime`
  - `js/mesa-core.js`: adicionados cache de referencias DOM, cache de roster por `characterKey`, agendador `scheduleMesaRender()` com `requestAnimationFrame`, dedupe por assinatura estavel da cena e consolidacao de broadcasts `mesa:scene` recebidos no mesmo frame
  - `js/mesa-stage.js`: palco passou a renderizar tokens incrementalmente por `Map<tokenId, element>`; drag atualiza apenas `left/top/zIndex` durante movimento e salva apenas ao soltar
  - `js/mesa-roster.js` e `js/mesa-inspector.js`: renders passam a usar referencias DOM cacheadas; roster so e reagendado quando busca, entrada/saida de token, roster ou fichas mudam
  - `js/mesa-stage.js` e `js/mesa-inspector.js`: imagens de avatar renderizadas via JS agora usam `loading="lazy"`, `decoding="async"` e dimensoes estaveis
  - `css/mesa-stage.css`, `css/mesa-roster.css` e `css/mesa-inspector.css`: adicionados `contain: layout paint` em areas pesadas; `will-change` fica limitado ao token durante drag
  - `mesa.html`: cache bust dos arquivos alterados atualizado para `2026-05-05-mesa-light-1`
  - comportamento preservado: mestre continua colocando, focando, movendo, removendo e limpando tokens; jogadores continuam recebendo a cena por realtime
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; varredura de referencias locais e IDs duplicados; confirmacao de `window.AUTH`; servidor local com HTTP 200 nas quatro paginas principais; simulacao controlada da Mesa confirmando que selecao nao reconstrui roster/palco, drag nao salva durante movimento, drag salva uma vez ao soltar, payload repetido nao salva de novo e `mesa:scene` igual nao rerenderiza

- Correcao de export global da autenticacao em 2026-05-05:
  - problema identificado apos deploy: `auth.js` declarava `const AUTH`, mas nao expunha `window.AUTH`; a Mesa consulta `window.AUTH`, entao podia ficar parada no HTML inicial (`Convidado`, `Jogador`, `0`) mesmo com API e cena corretas
  - `js/auth.js`: adicionada ponte `window.AUTH = AUTH` antes de iniciar `window.AUTH_READY`
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `auth.js` atualizado para `2026-05-05-mesa-auth-export-1`
  - validacao executada: simulacao da Mesa com sessao real do mestre contra a API oficial confirmou `headerUser=mestre`, `roleBadge=Mestre`, `activeTokenCount=5`, roster carregado e copia de realtime ativa

- Realtime oficial da Mesa em 2026-05-04:
  - objetivo: permitir que o mestre adicione jogadores, NPCs e monstros existentes na Mesa e que todos vejam a cena atualizada em tempo real
  - `cloudflare/src/mesa-realtime.js`: criado Durable Object `MesaRealtimeRoom` para aceitar WebSockets, registrar presenca e transmitir eventos da cena
  - `cloudflare/wrangler.toml`: adicionados binding `MESA_REALTIME` e migration `v1-mesa-realtime`
  - `cloudflare/src/index.js`: adicionada rota `GET /api/mesa/realtime`; `PUT /api/mesa/scene` agora salva no D1 e transmite `mesa:scene`
  - `cloudflare/src/auth.js`: `requireAuth()` aceita token JWT por query string para conexao WebSocket do navegador
  - `js/api.js`: removida tentativa antiga de Socket.IO e criada conexao WebSocket nativa para `/mesa/realtime`
  - `js/runtime-config.js`: realtime habilitado, mas a conexao so abre quando a pagina chama `APP.connectRealtime()`
  - `js/mesa-core.js`: Mesa assina `mesa:ready`, `mesa:presence` e `mesa:scene`, atualizando roster/cena ao receber broadcast
  - `js/mesa-stage.js`: `Limpar cena` agora deixa o palco vazio de fato para o mestre adicionar tokens manualmente pelo roster
  - `js/mesa-roster.js` e `mesa.html`: textos atualizados para comunicar sincronizacao ao vivo e contagem `disponiveis/total`
  - `js/auth.js`: sessao backend pode ser recuperada a partir de token salvo quando o objeto de sessao local estiver ausente
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `runtime-config.js`, `api.js` e `auth.js` atualizado para `2026-05-04-mesa-realtime-1`
  - Worker publicado: `armagedon-api`, version ID `2cab1568-cc32-4a79-81d0-07851eac7a4a`
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; `wrangler deploy --dry-run`; servidor local com HTTP 200 nas quatro paginas; deploy real do Worker; login mestre HTTP 200; `GET /api/mesa/scene` HTTP 200; duas conexoes WebSocket receberam `mesa:ready`; `PUT /api/mesa/scene` transmitiu `mesa:scene` com 5 tokens para outra conexao
  - observacao de QA: Edge headless/CDP nao iniciou neste ambiente; validar visualmente no navegador real apos GitHub Pages publicar o cache bust novo

- Correcao de tokens iniciais da Mesa em 2026-05-04:
  - problema identificado: a API oficial tinha diretorio populado, mas a cena `default` estava salva com `0` tokens; em navegadores com cache/diretorio local desatualizado, a Mesa podia abrir sem tokens de jogadores, NPCs ou monstros
  - `js/mesa-core.js`: Mesa agora atualiza o diretorio pela API antes de montar o roster, usa a `key` oficial de NPCs/monstros quando ela vem do Worker e repopula a cena vazia/stale a partir do roster oficial
  - `mesa.html`: cache bust de `js/mesa-core.js` atualizado para `2026-05-04-mesa-tokens-1`
  - D1 oficial: a cena `default` estava com `0` tokens e foi populada com 5 tokens iniciais do diretorio atual apos o deploy da correcao
  - ajuste complementar: `js/mesa-core.js` agora inicia por `bootMesaPage()` com guarda para `document.readyState`, evitando a tela ficar presa no HTML inicial `Convidado`/`0 disponiveis` se o `DOMContentLoaded` ja tiver passado
  - `mesa.html`: cache bust de `js/mesa-core.js` atualizado para `2026-05-04-mesa-init-guard-1`
  - comportamento esperado: ao abrir como mestre, se a cena remota estiver vazia mas houver personagens cadastrados, a Mesa semeia tokens iniciais e salva a cena oficial no D1; jogadores passam a carregar a cena publicada
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; teste logico de roster/tokens; teste de hidratacao com salvamento remoto; varredura HTML/CSS de referencias e IDs duplicados; links wiki do Obsidian; servidor local com HTTP 200 nas paginas principais; GitHub Pages com sucesso; arquivos publicados com HTTP 200; API oficial confirmada com cena contendo tokens

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
  - `js/mesa-renderer-v2.js`: renderer Canvas/Worker do palco da Mesa
  - `js/mesa-renderer-worker.js`: desenho OffscreenCanvas em Worker quando suportado
  - `js/mesa-roster.js`: lista de personagens
  - `js/mesa-inspector.js`: painel do token selecionado
  - `js/mesa-storage.js`: helpers de storage, numeros e visual de barras
  - `js/mesa-init.js`: reservado para inicializacao futura

## Proximas Frentes Recomendadas

1. Validar a Mesa Canvas/Worker no site publicado com mestre e jogador em abas separadas
2. Medir comportamento em maquina mais fraca e ajustar cap de `devicePixelRatio` se necessario
3. Normalizar thumbnails WebP/JPEG dos avatares grandes no fluxo de salvamento da ficha
4. Revisar responsividade da ficha, inventario e mesa
5. Expandir os testes Playwright para mestre/jogador com API real quando for seguro usar credenciais de teste

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
- `npm run check:js`
- `npm run audit:static`
- `npm run build:pages`
- `npm run test:mesa`
- `npm run perf:mesa`
- `npx wrangler deploy --dry-run` em `cloudflare/`
- servidor estatico temporario respondeu `200` para `ficha.html` e `mesa.html`
- workflow de Pages revisado para incluir `mesa.html`
- Browser Use abriu `http://127.0.0.1:8012/mesa.html` sem erros de console registrados
