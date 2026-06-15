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
- Backend legado Express/PostgreSQL: removido do repositorio em 2026-06-12 (historico preservado no git)

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


## Ultima Etapa Concluida (2026-06-14 — Etapa 12: polimento de carga inicial)

Resumo: dois ajustes leves de performance de primeiro carregamento, sem mudanca de comportamento.

- `logo-rpg-armagedon.png` (fallback do `<picture>` da home, usado so se o `.jpg`/`.webp` falham): recomprimido de 1024x1024/124 KB para 512x512/34 KB (-72%) via sharp. `?v=` bumpado para `2026-06-14-opt-2` em todos os HTML que o referenciam (index, ficha, mesa, regras, sugestoes).
- `index.html`: removido o `<link rel="prefetch" href="sugestoes.html">` — pagina pouco acessada que disputava banda no carregamento da home. Mantidos os prefetch de `regras.html` e `ficha.html` (paginas quentes).

Validacao: `npm run audit:static` e `npm run build` verdes; `_site/logo-rpg-armagedon.png` confirmado em 34 KB.

## Etapa anterior (2026-06-13 — Etapa 11: minificacao no deploy + correcao do bundle)

Resumo: maior ganho de performance de carregamento da sessao. O deploy servia JS/CSS NAO-minificados porque o workflow rodava `npm run build:pages` (so bundle). Agora roda `npm run build` (bundle + terser + clean-css).

Causa-raiz corrigida antes de ativar:

- `mesa-renderer-worker.js` estava no `mesaJsFiles` do bundle, mas e carregado em runtime via `new Worker("js/mesa-renderer-worker.js")` (thread separada) — nem aparece como `<script>` no `mesa.html`. Isso inflava o bundle e colidia `function clamp` com `mesa-storage.js`, gerando `SyntaxError: Identifier 'clamp' has already been declared` quando o terser minificava → minificacao quebrava. Removido do bundle (`build-pages.cjs`); o worker segue copiado standalone em `_site/js/` para o `new Worker`.

Mudancas:

- `tools/build-pages.cjs`: `mesa-renderer-worker.js` fora do `mesaJsFiles`.
- `.github/workflows/pages.yml`: adiciona `setup-node@v4` (node 24, cache npm) + `npm ci --ignore-scripts` (pula postinstall pesado de sharp/playwright, nao usados no build) e troca `build:pages` por `build`.

Ganho medido (gzip — o que trafega):

- mesa JS: 83 KB → 52 KB (−37%)
- ficha JS: 55 KB → 41 KB (−25%)
- mesa CSS: 22 KB → 14 KB (−36%)
- ficha CSS: 9 KB → 6 KB (−33%)
- Pagina da Mesa (JS+CSS): ~105 KB → ~66 KB

Validacao (artefato `_site` minificado servido em :8001 e exercitado no browser):

- Mesa: bundle carrega, funcoes globais preservadas (mangle nao toca top-level), Web Worker minificado ATIVO (`mode: canvas-worker`, `workerReady: true`, canvas transferido), zero erros de console.
- Ficha: `onclick` globais funcionam (abrir editor de item, seletor de tipo clicavel — fix de z-index sobreviveu), zero erros.
- `npm ci --ignore-scripts` simulado em tmpdir: terser + clean-css carregaveis (exit 0).
- `audit:static`, `check:js`, `test-worker` 53/53, Playwright 33/33, `node --check` nos dois bundles minificados — tudo verde.
- `.claude/launch.json`: adicionada config `armagedon-dist` (serve `_site` em :8001) para validar o artefato de producao localmente.

Observacao: esta etapa muda o pipeline de CI. Se o deploy do Pages falhar, o site NAO republica (o que esta no ar continua), e o erro aparece em Actions — basta reverter o `pages.yml` para `npm run build:pages`.

## Etapa Concluida (2026-06-13 — Etapa 10: login semantico e varredura de performance)

Resumo: melhorias opcionais da revisao + varredura adicional de performance/qualidade com evidencia.

O que mudou:

- Login agora e um `<form id="loginForm">` real (`index.html`): campos com `name`, botao `type="submit"`, submit tratado no `auth.js`. Elimina o aviso do Chrome ("Password field is not contained in a form") e faz os gerenciadores de senha/autofill funcionarem. Enter no usuario ainda avanca para a senha; Enter na senha submete. Validado ao vivo no preview (submit dispara `handleLogin`, sem erro de JS).
- Limpeza coerente com a remocao do `data/`: regra orfa `/data/*` removida do `_headers` e `data` tirado de `publishedRoots` no `audit-static.cjs`.

Varredura de performance (sem acao necessaria — ja otimizado):

- Glow do cursor (`auth/regras/sugestoes.js`): ja usa `requestAnimationFrame` com cancelamento.
- Drag de tokens (`mesa-stage.js`): `scheduleDragPosition` ja deduplica via guard de rAF; o listener `mousemove` redundante (par do `pointermove`) NAO causa render duplo — so duas atribuicoes por evento. Mantido por compatibilidade (navegadores sem Pointer Events); registrado como debito tecnico opcional, nao gargalo.
- `console.log`/`console.debug` de debug no frontend: zero (os 38 `console.*` sao `.warn`/`.error` de tratamento de erro).

Arquivos alterados: `index.html`, `js/auth.js`, `_headers`, `tools/audit-static.cjs`, `tools/build-pages.cjs` (bump bundles → 2026-06-13-revisao-2), `js/auth.js?v=` → 2026-06-13-login-form-1 nas 5 paginas, este arquivo.

Validacoes: `audit:static`, `check:js` (36), `build:pages`, `test-worker` 53/53, Playwright 33/33 — tudo verde.

Debito tecnico opcional (anotado, nao bloqueia): caminho de drag por `mouse*` em `mesa-core.js`/`mesa-stage.js` e redundante ao `pointer*` em navegadores modernos; pode ser removido se o suporte a navegadores sem Pointer Events for descartado.

## Etapa Concluida (2026-06-12 — Etapa 9: revisao tecnica — correcoes, performance e limpeza)

Resumo: execucao do plano de correcao da revisao tecnica completa. Quatro frentes: defeitos (cache-busting, regra de farm), performance (diretorio sem base64, login sem PBKDF2 extra, fontes), limpeza (server/ legado e videos fora do repo) e consistencia (normalizacao Mesa = Ficha).

O que mudou:

- Cache-busting: todos os `<link>` CSS locais das 5 paginas ganharam `?v=` (tokens, reset, index, regras, mesa-drawing; components em sugestoes). `tools/audit-static.cjs` agora FALHA se qualquer referencia local a `css/`/`js/` estiver sem `?v=`.
- Regra de gameplay (autorizada pelo mestre em 2026-06-12): removido o multiplicador de anti-farm por contagem diaria (`weakKillsToday`) do calculo de XP. A unica modulacao por nivel da criatura e a diferenca de rank (2^diff). Campo legado segue aceito em fichas salvas, sem efeito. Aplicado em `cloudflare/src/soul-progression.js` e `js/soul-essence.js`; previa da UI em `js/ficha-soul.js` sem a linha "Anti-farm".
- Diretorio: `GET /api/directory` nunca trafega avatar base64 (`data:` vira `""`). Nova rota master-only `POST /api/maintenance/migrate-avatars` migra avatares base64 do D1 para R2 e troca pelo URL publico (idempotente). PENDENTE: executar a migracao uma vez em producao apos o deploy.
- Login: `ensureMasterUser` so roda quando o username do login e o do mestre — logins de jogador deixam de pagar um PBKDF2 extra por request.
- Fontes: removido o peso 900 de Cinzel Decorative (nenhum uso no CSS/JS) das 5 paginas; `css/mesa.css` trocou `font-weight: 800` (peso nao carregado) por `700`.
- Limpeza: pasta `server/` (Express/PostgreSQL legado) e `render.yaml` removidos do repo; dois videos `.mp4` (~27 MB) sairam do versionamento (`git rm --cached` + `*.mp4` no `.gitignore`, arquivos continuam no disco).
- Consistencia Mesa/Ficha: `cloudflare/src/mesa-realtime.js` alinhado a `sheet.js` — campo vazio permanece vazio (nao vira "0") e atributo minimo e 0 (nao 1) nos patches da Mesa.
- Testes: `test-worker.mjs` ganhou grupos que importam `sheet.js` e `soul-progression.js` REAIS (contrato de semantica vazio/zero e da regra de XP por diferenca de rank) — 53/53 passando.
- Decisao registrada em `SYSTEM_RULES.md`: jogador aplicar essencia na propria ficha sem aprovacao previa e por design (confianca + notificacao ao mestre).
- Suites Playwright atualizadas (liam o `server/` removido) e migradas para o Worker/D1: `tests/ficha.spec.cjs` (28/28) e `tests/mesa.spec.cjs` (5/5) verdes. Specs do painel da Mesa ajustadas ao painel simplificado de 2026-06-06 (so Vida/Integridade, sem atributos/itens/memorias).
- 4 regressoes visuais REAIS encontradas e corrigidas via QA (eram causa das falhas dos testes, nao testes desatualizados):
  1. Seletor de tipo de item (`.ui-modal-root`) abria ATRAS do editor de item (mesmo z-index + ordem do DOM) e ficava inclicavel → novo token `--z-modal-top: 1100` em `tokens.css`, aplicado a `.ui-modal-root` em `components.css`.
  2. Linha de transferencia do editor de item estourava a largura do dialogo → `.item-transfer-row` virou grid (picker+qtd) com botao "Enviar" em linha cheia (`ficha.css`).
  3. Cartao de Lore/Anotacoes nao recolhia de fato e o botao Minimizar/Expandir mudava de largura → regras `.notes-collapsible.is-collapsed`, cabecalho com `.notes-card-heading` e `min-width` fixo no `.notes-toggle-btn` (`ficha.css` + `ficha.html`).
  4. Nucleo da alma caia numa coluna lateral estreita de 300px → `.identity-block` virou coluna unica e a progressao ocupa largura cheia (`ficha.css`).
- QA mobile 360px confirmado via medicao de layout: painel "Meu personagem" 100% dentro do card (sem filhos vazando), home sem overflow horizontal, label "Jogador" sem quebra.

Arquivos principais alterados:

- `index.html`, `ficha.html`, `mesa.html`, `regras.html`, `sugestoes.html` (cache-busting + fontes)
- `tools/audit-static.cjs` (guarda de `?v=`), `tools/build-pages.cjs` (bump dos bundles)
- `cloudflare/src/soul-progression.js`, `js/soul-essence.js`, `js/ficha-soul.js` (regra de farm)
- `cloudflare/src/index.js` (rota migrate-avatars + bootstrap condicionado), `cloudflare/src/characters.js` (diretorio sem base64)
- `cloudflare/src/mesa-realtime.js` (normalizacao alinhada), `test-worker.mjs` (testes de contrato)
- `css/tokens.css` (token z-modal-top), `css/components.css` (z-index do seletor generico), `css/ficha.css` (transfer-row, lore collapse, identity-block), `css/mesa.css` (font-weight 700)
- `tests/ficha.spec.cjs`, `tests/mesa.spec.cjs` (migrados para Worker/D1 e painel simplificado)
- Docs: `README.md`, `DEPLOY_FREE.md`, `SYSTEM_RULES.md`, `cloudflare/README.md`, este arquivo
- Removidos: `server/` (29 arquivos), `render.yaml`, `.server-*.log`; destracked: 2 `.mp4`

Validacoes executadas:

- `node tools/check-js.cjs` OK (36 arquivos)
- `node tools/audit-static.cjs` OK (incluindo a nova guarda de `?v=`)
- `node test-worker.mjs` 53/53
- `npx playwright test tests/ficha.spec.cjs` 28/28 ; `tests/mesa.spec.cjs` 5/5
- `npx wrangler deploy --dry-run` OK (bindings preservados)
- QA mobile 360px (home + painel "Meu personagem") sem overflow

Pendencias abertas:

- Deploy do Worker + rodar `POST /api/maintenance/migrate-avatars` uma vez (mestre autenticado) — unico passo manual de producao
- `npm run test:mesa:online` com credenciais reais (smoke contra o site publicado)

## Etapa Concluida (2026-06-12 — Etapa 8: aceite de transferencia jogador->jogador)

### O que mudou
- `cloudflare/d1/schema.sql`: nova tabela `transfer_proposals` (status pending/accepted/rejected/cancelled, payload com snapshot do item/memoria, indices parciais por origem/destino pendente). Migracao remota necessaria antes do deploy.
- `cloudflare/src/characters.js`: `createTransferProposal` (snapshot + merge key, item fica na origem; limite de 10 pendentes por origem), `listTransferProposals` (incoming/outgoing; mestre ve todas), `acceptTransferProposal` (revalida item por merge key/quantidade e mochila do destino; origem sem o item => proposta cancelada + 409; efetiva fichas + `transfer_audit` com `proposalId` + resolucao no mesmo `DB.batch`), `declineTransferProposal` (reject pelo destino, cancel por quem enviou), `getCharacterById`. Rotas diretas jogador->jogador agora respondem 403 para jogador (somente mestre).
- `cloudflare/src/index.js`: rotas `POST/GET /api/transfers/proposals` e `POST /api/transfers/proposals/:id/(accept|reject|cancel)`; na criacao, sessao master efetiva direto (`direct: true`).
- `js/api.js`: wrappers `createTransferProposal`, `listTransferProposals`, `accept/reject/cancelTransferProposal`.
- `js/ficha-core.js`: painel "Propostas de transferencia" (`refreshTransferProposals`, render + acoes Aceitar/Recusar/Cancelar com confirmacao; aceite recarrega a ficha aberta); chamado em `loadSheet`.
- `js/ficha-inventory.js` / `js/ficha-memories.js`: envio de jogador para jogador em modo backend cria proposta (item/memoria permanece na origem) e mostra status; mestre segue fluxo direto.
- `ficha.html`: secao `#transferProposalsSection` no topo da ficha; `css/ficha.css`: estilos `.transfer-proposal-*`.
- Cache-bust: `api.js` para `?v=2026-06-12-transfer-accept-1` em todas as paginas; `ficha-core/ficha-inventory/ficha-memories/ficha.css` idem em `ficha.html`.

### Validacoes
- Protocolo testado local (wrangler dev + D1 local, 24 casos, todos OK): rotas diretas bloqueadas para jogador; criacao/listagem incoming/outgoing; terceiros e remetente nao aceitam; aceite move item/memoria e grava auditoria com `proposalId`; revalidacao cancela proposta com origem vazia (409); recusa e cancelamento; mestre efetiva direto.
- npm run check:js (36 arquivos) / audit:static: OK; wrangler deploy --dry-run: OK; test:ficha 24/28 (mesmas 4 falhas pre-existentes de layout/editor de item, sem regressao).

### Pendencias
- Aplicar `schema.sql` no D1 remoto antes do deploy do Worker (tabela `transfer_proposals`).

## Etapa Concluida (2026-06-11 — Etapa 7: jogador move o proprio token + trava do mestre)

### O que mudou
- `cloudflare/src/mesa-realtime.js`: novo tipo `mesa:move:lock` (master-only) — alterna a trava global de movimento, persistida no storage do DO e anunciada a todos; `mesa:ready` agora inclui `playersMoveLocked`. `mesa:token:move` de jogador passa a ser retransmitido quando a trava esta aberta e o `characterKey` declarado e o do proprio jogador.
- `js/mesa-core.js`: `state.playersMoveLocked`; listeners de `mesa:ready`/`mesa:move:lock` (jogador ve toast quando o mestre trava/libera); `broadcastMesaTokenMove` envia movimento do proprio token do jogador (com `characterKey`); `applyMesaTokenMoveDelta` descarta deltas de jogador para tokens que nao sao dele (anti-forja — o DO nao conhece a posse, os clientes conhecem); `toggleMesaMoveLock()`.
- `js/mesa-stage.js`: `canMoveTokens(token)` — mestre move tudo; jogador move apenas o proprio token e somente com a trava aberta.
- `js/mesa-roster.js`: botao `#moveLockBtn` (so mestre, so online) com label "Travar/Liberar movimento"; hint do palco reflete o estado para o jogador.
- `mesa.html`: novo botao no overlay de acoes; cache-bust `mesa-core/mesa-stage/mesa-roster` para `?v=2026-06-11-player-move-1`.

### Validacoes
- Protocolo testado local (wrangler dev, 11 casos): movimento proprio ok + mestre recebe; token de outro recusado; jogador nao trava; trava bloqueia e libera; novo socket recebe estado da trava; mestre move qualquer token
- npm run check:js / audit:static: OK; test:mesa 3/5 (mesmas 2 falhas pre-existentes documentadas, sem regressao)

## Ultima Etapa Concluida (2026-06-11 — Etapa 6: notificacao de progressao da alma ao mestre)

### O que mudou
- `cloudflare/d1/schema.sql`: nova tabela `soul_audit` (event_type `essence-award`/`nightmare-complete`, ator, ficha alvo, payload com resumo). Migracao remota necessaria antes do deploy.
- `cloudflare/src/characters.js`: `awardSoulExperienceToCharacter` e `completeSoulNightmareForCharacter` gravam auditoria em `soul_audit` (sempre, inclusive quando o ator e o mestre).
- `cloudflare/src/index.js`: quando o ator e jogador, as rotas de soul-essence/soul-nightmare disparam `soul:awarded`/`soul:nightmare` via Durable Object; ambas tambem disparam `sheet:changed` (ficha aberta do mestre atualiza sozinha).
- `cloudflare/src/mesa-realtime.js`: novo `broadcastToMasters` — eventos de alma sao entregues SOMENTE a sockets com role master.
- `js/ui.js`: novo `UI.toast(mensagem, {kicker, duration})` (aviso nao bloqueante, canto inferior direito) + listeners de `soul:awarded`/`soul:nightmare` que exibem o toast (qualquer pagina com socket ativo: Mesa e Ficha).
- `css/components.css`: estilos `.ui-toast*` usando tokens do design system.
- Cache-bust: `ui.js` e `components.css` para `?v=2026-06-11-soul-notify-1` em todas as paginas.

### Validacoes (wrangler dev + D1 local)
- Jogador aplica Essencia na propria ficha -> mestre conectado recebe `soul:awarded` com ator/alvo/XP; socket de jogador NAO recebe; linha gravada em `soul_audit`
- npm run check:js: OK / npm run audit:static: OK / wrangler deploy --dry-run: OK

### Ordem de deploy
1. `npx wrangler d1 execute armagedon --remote --file cloudflare/d1/schema.sql --config cloudflare/wrangler.toml` (cria `soul_audit`)
2. `npx wrangler deploy --config cloudflare/wrangler.toml`
3. push do site (toast no ui.js)

## Ultima Etapa Concluida (2026-06-11 — Etapa 5 da auditoria: limpeza e consistencia)

### O que mudou
- Removidos arquivos JS mortos (nao referenciados por nenhum HTML): `js/main.js` (vazio), `js/ficha.js`, `js/home.js`, `js/mesa.js`. Tambem deletados os scripts one-off `tools/fix-mojibake*.{js,cjs}` (nunca versionados).
- `js/regras.js`: removidas ~54 linhas de codigo morto em `renderRules` (bloco inalcancavel apos `return`).
- `js/mesa-core.js`: corrigido mojibake em 17 linhas de comentarios (acentos quebrados por dupla codificacao). Zero mojibake restante em `js/`.
- `tools/audit-static.cjs`: nova checagem — `api.js`, `auth.js` e `ui.js` devem usar o MESMO `?v=` em todas as paginas; divergencia agora falha o audit (impede regressao do bug M2 da auditoria).
- `CLAUDE.md`: grafia oficial "Armagedom" registrada; mapeamento de paginas corrigido (inclui `sugestoes.html`, `mesa-initiative.js`, `mesa-init.js`, `ficha-habs.js`, `ficha-passives.js`); nome correto dos secrets (`MASTER_BOOTSTRAP_PASSWORD`, nao `ARMAGEDON_MASTER_PASSWORD`); auth atualizado para PBKDF2/throttle.
- Cache-bust: `mesa-core.js` e `regras.js` para `?v=2026-06-11-cleanup-1`.

### Validacoes
- npm run check:js: OK / npm run audit:static: OK (incluindo a checagem nova)

### Pendencias conhecidas (proximas etapas)
- Specs Playwright desatualizados (6 falhas pre-existentes, ver entrada da Etapa 2)
- Etapa 6: notificacao de ganho de XP ao mestre
- Etapa 7: jogador move o proprio token com trava do mestre
- Etapa 8: aceite de transferencia pelo destino
- UI: texto "JOGADOR" quebrando no card "Acesso" da home; painel "Nucleo da Alma" vazando do card na ficha

## Ultima Etapa Concluida (2026-06-11 — Etapa 4 da auditoria: PBKDF2 e rate-limit de login)

### O que mudou
- `cloudflare/src/auth.js`: senhas agora usam PBKDF2-SHA256 com salt aleatorio por usuario (25k iteracoes, formato `pbkdf2$<iter>$<salt>$<hash>`); comparacao em tempo constante. O hash legado (sha256 sem salt + pepper) continua aceito no login e e migrado para PBKDF2 de forma transparente no primeiro login valido — nenhum jogador precisa trocar senha.
- `cloudflare/src/auth.js`: `ensureMasterUser` so grava no banco quando algo mudou (senha do secret rotacionada, hash legado ou role/ativacao divergente); antes regravava o hash a cada chamada.
- `cloudflare/src/index.js`: rate-limit de login por usuario+IP (tabela `login_throttle`): 8 falhas seguidas bloqueiam o par por 10 minutos (HTTP 429); login valido limpa o contador.
- `cloudflare/d1/schema.sql`: nova tabela `login_throttle` (migracao remota necessaria antes do deploy do Worker — o login consulta a tabela).
- `.gitignore`: ignora `cloudflare/.dev.vars` e `.wrangler/` (artefatos de dev local).

### Validacoes (wrangler dev + D1 local, 10 casos)
- Bootstrap do mestre gera hash PBKDF2; login OK
- 8 senhas erradas -> 429 na 9a; senha correta tambem bloqueada durante o lock; outro usuario nao afetado
- Usuario com hash legado loga, hash migra para PBKDF2, segundo login OK, senha errada segue 401
- Jogador novo criado pelo mestre ja nasce com hash PBKDF2 e loga normalmente
- npm run check:js: OK / wrangler deploy --dry-run: OK

### Ordem de deploy (importante)
1. `npx wrangler d1 execute armagedon --remote --file cloudflare/d1/schema.sql --config cloudflare/wrangler.toml` (cria `login_throttle`; schema usa IF NOT EXISTS, e idempotente)
2. `npx wrangler deploy --config cloudflare/wrangler.toml`

## Ultima Etapa Concluida (2026-06-11 — Etapa 3 da auditoria: endurecimento do Worker)

### O que mudou
- `cloudflare/src/auth.js`: CORS deixou de refletir qualquer origem; agora usa allowlist (`tiagopsm.github.io`, `armagedon-rpg.pages.dev` + previews `*.armagedon-rpg.pages.dev`, `localhost`/`127.0.0.1` em qualquer porta). Origem fora da lista recebe o dominio canonico no header (bloqueada pelo navegador). Header `vary: origin` adicionado.
- `cloudflare/src/index.js`: `ensureMasterUser` saiu do topo do `fetch` (rodava SELECT+UPDATE no D1 em TODA requisicao) e agora roda apenas na rota de login.
- `cloudflare/src/index.js`: upload de avatar valida content-type (`image/webp`/`image/jpeg`, senao 415) e tamanho (max 2 MB, senao 413).
- `cloudflare/src/index.js`: `GET /api/mesa/map/<key>` valida o formato da chave (`maps/<user>/<id>.webp`) — nao serve mais objetos arbitrarios do bucket. Continua sem auth porque a URL e consumida como background-image (sem headers); mitigacao adicional e o TTL do R2 (`MAP_R2_TTL`).

### Validacoes
- npm run check:js: OK
- npx wrangler deploy --dry-run: OK
- Pos-deploy: login mestre/jogador, upload de avatar na ficha e envio de mapa na Mesa devem ser smoke-testados

## Ultima Etapa Concluida (2026-06-10 — Etapa 2 da auditoria: sessao confiavel no frontend)

### O que mudou
- `js/auth.js`: removidas as credenciais hardcoded do mestre (`MASTER_USER`/`MASTER_PASS`) e todo o login local de producao. O modo local agora so ativa com a flag de dev `localStorage.armagedonDevMode = "1"` (qualquer credencial entra; usuario `mestre` vira master; dados so no navegador). Sem a flag e sem API, o login mostra "Servidor da campanha indisponivel".
- `js/auth.js`: falha de health-check com sessao backend NAO apaga mais a sessao (`clearSession` removido desse fluxo). A pagina e bloqueada com aviso e a sessao/token fica preservada; novo estado `AUTH.isBackendDown()`. `requireAuth()` redireciona para o index quando a API esta fora, em vez de deixar a pagina operar em modo local.
- `js/api.js`: `HEALTH_TIMEOUT_MS` de 600ms para 5000ms, com 2 tentativas — cold start do Worker nao derruba mais a sessao para o modo local (bug que impediu login de jogadores em navegador anonimo em 2026-06-10).
- `js/mesa-map.js`: listeners de jogador descartam `mesa:map:announce/ws:start/set/clear` cujo `fromRole` (carimbado pelo Durable Object) nao seja master — defesa em profundidade da Etapa 1; mensagens sem `fromRole` (worker antigo) sao toleradas.
- `cloudflare/src/mesa-realtime.js`: sinais de mapa retransmitidos agora carregam `fromRole` do remetente autenticado.
- `js/ficha-master.js`: validacao de nome reservado "mestre" deixou de depender da constante removida.
- Cache-busting unificado: `api.js`, `auth.js` e `ui.js` agora usam `?v=2026-06-10-session-1` identico nas 5 paginas (antes `api.js` tinha 4 versoes diferentes entre paginas); `mesa-map.js` e `ficha-master.js` tambem atualizados.

### Validacoes
- npm run check:js: OK / npm run audit:static: OK
- Teste manual via preview (API simulada fora do ar): sessao backend e PRESERVADA, pagina bloqueia com aviso, ficha/mesa redirecionam para o index; login sem flag de dev mostra "Servidor indisponivel"; com a flag entra em modo Navegador
- npm run test:ficha / test:mesa: 24/28 e 3/5 passam. As 6 falhas sao PRE-EXISTENTES (confirmado rodando os mesmos specs no HEAD limpo via git stash): os testes esperam layout/campos antigos do painel do jogador (ex.: attrForca, data-player-item-field) removidos pelas simplificacoes de 2026-06-06/07. Pendencia aberta: atualizar os specs para a UI atual.

## Ultima Etapa Concluida (2026-06-10 — Etapa 1 da auditoria: seguranca do Worker)

### Contexto
Auditoria completa do projeto identificou achados de seguranca/logica/UI. Plano de correcao em etapas acordado com o Tiago; esta e a Etapa 1 (Worker). Senha do mestre foi rotacionada manualmente no Cloudflare (Etapa 0) antes desta etapa.

### O que mudou
- `cloudflare/src/mesa-realtime.js`: sinais de mapa que distribuem/limpam conteudo (`mesa:map:announce/set/clear/offer/ws:*`) agora exigem `role === "master"` no Durable Object; jogador que tentar recebe `mesa:map:relay:ack` com `ok: false`. Sinais jogador -> mestre (`have/need/answer/ice`) continuam liberados. Antes, qualquer jogador autenticado conseguia trocar ou limpar o mapa de todos.
- `cloudflare/src/characters.js`: corrigido mojibake em 5 mensagens de erro visiveis ao usuario ("Sessao invalida", "Voce nao pode alterar o nucleo desta ficha", "Ficha nao encontrada" x2, "O nucleo ainda nao esta pronto para concluir o pesadelo").
- `cloudflare/src/index.js`: resposta 500 nao vaza mais `error.message` interno; o erro completo vai para `console.error` (visivel em `wrangler tail`) e o cliente recebe mensagem generica.
- `SYSTEM_RULES.md`: regras atualizadas conforme alinhamento — nucleo da alma gerenciado pelo dono da ficha (mestre em todas), sinais de mapa master-only, e registradas como planejadas: notificacao de XP ao mestre, jogador mover o proprio token com trava do mestre, aceite de transferencia pelo destino. Corrigido caminho da pasta oficial (faltava OneDrive).

### Validacoes
- npm run check:js: OK
- npx wrangler deploy --dry-run --config cloudflare/wrangler.toml: OK
- Deploy em producao: pendente de aprovacao do Tiago

### Proximas etapas do plano
2. Frontend sessao confiavel (flag dev no lugar do login local hardcoded, health-check 5s sem clearSession, unificacao de cache-busting)
3. Endurecimento do Worker (ensureMasterUser fora do hot path, limite de avatar, auth no GET de mapa, CORS allowlist)
4. PBKDF2 + rate-limit de login
5. Limpeza (codigo morto, grafia oficial "Armagedom", CLAUDE.md, checagem de cache-busting no audit:static)
6. Notificacao de ganho de XP ao mestre
7. Jogador move o proprio token (com trava do mestre)
8. Aceite de transferencia pelo destino

## Ultima Etapa Concluida (2026-06-07 — Responsividade do painel "Meu personagem")

### O que mudou
- Corrigido layout quebrado/estourando a largura do painel "Meu personagem" em telas/sidebar estreitas: cartoes de Vida/Integridade e o botao "Abrir minha ficha completa" estavam sendo cortados na borda direita.
- `css/mesa-roster.css`:
  - `.player-resource-grid`/`.player-panel-meta-grid` passaram de `repeat(2, minmax(0,1fr))` (fixo) para `repeat(auto-fit, minmax(118px, 1fr))` — os cartoes agora se ajustam ao espaco real do container (a sidebar pode ser mais estreita que o viewport, entao basear-se so em media queries de viewport nao bastava).
  - Reduzido padding/gap/font-size dos cartoes de recurso e dos inputs de Vida/Integridade (`.player-resource-card`, `.player-stat-inputs`, `.player-stat-inputs input`) — caixas menores, conforme pedido.
  - `.player-open-sheet-btn` ganhou `white-space: normal`, `word-break: break-word` e `box-sizing: border-box` para o texto do botao quebrar em vez de ser cortado.
  - Nova faixa `@media (max-width: 480px)`: avatar do token reduzido (80px → 56px), grids de recursos forcados a 1 coluna, fonte do botao/cards reduzida — telas pequenas ficam legiveis sem overflow horizontal.
- mesa.html — cache-bust de `css/mesa-roster.css` para `?v=2026-06-07-responsive-fix-1`.

### Validacoes
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-06 — Painel "Meu personagem" simplificado)

### O que mudou
- O painel pessoal do jogador na Mesa Virtual ("Meu personagem", `renderPlayerSheetPanel` em `js/mesa-roster.js`) foi reduzido ao essencial para uso durante a sessao: imagem/avatar do token, nome, status em cena, seletor de personagem (quando ha mais de um) e os editores de Vida e Integridade (atual e maximo).
- Removido completamente da mesa: Atributos (Forca, Agilidade, Inteligencia, Resistencia, Alma), "Dados rapidos" (Nome/Classe/Raca/Faccao/Anotacoes), listas/edicao detalhada de Inventario e Memorias e os cards-resumo de contagem — tudo isso agora vive somente na Ficha de Personagem.
- Adicionado botao "Abrir minha ficha completa" (`a.player-open-sheet-btn`, link para `ficha.html`) ao final do painel, para o jogador navegar direto para a ficha quando precisar editar o restante.
- Motivo: o jogador reportou excesso de informacao/edicao duplicada bagunçando o painel da mesa — a visao ali deve ser rapida e focada no que muda durante o combate (status, vida/integridade), com tudo o mais delegado a ficha completa.

### Arquivos alterados
- js/mesa-roster.js — `renderPlayerSheetPanel` enxugado; removidas as funcoes que ficaram sem uso (`renderPlayerIdentityEditor`, `renderPlayerTextField`, `renderPlayerAttributeEditor`, `renderPlayerInventoryList`, `renderPlayerInventoryItem`, `renderPlayerMemoryList`, `formatMesaItemType`)
- css/mesa-roster.css — adicionado `.player-open-sheet-btn` (botao de link para a ficha, full width)
- mesa.html — cache-bust atualizado: `css/mesa-roster.css`, `js/mesa-roster.js` e `js/mesa-inspector.js` para `?v=2026-06-06-simplify-player-panel-1` (as strings anteriores estavam desatualizadas em relacao ao ultimo commit que tocou esses arquivos, o que fazia alteracoes recentes parecerem "sem efeito" por cache do navegador)

### Validacoes
- npm run check:js: OK (40 arquivos)
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-05 — Tracker de Iniciativa)

### Funcionalidade implementada
- Tracker de iniciativa na Mesa Virtual com sincronizacao em tempo real via WebSocket
- Mestre ativa/encerra o combate com botao INIC. na toolbar
- Jogadores recebem banner "Combate iniciado!" e abrem popup para rolar 1d20 + mod Agilidade (floor(Agilidade/3))
- Resultado enviado ao mestre via mesa:initiative:roll; mestre ordena por total descrescente e faz broadcast
- Mestre avanca turnos (Proximo), reinicia rodada, remove participante individual ou encerra o combate
- Estado da iniciativa persiste na cena (localStorage + Cloudflare D1) e restaurado ao recarregar

### Arquivos principais alterados
- js/mesa-initiative.js (NOVO) — modulo completo de iniciativa
- js/mesa-core.js — delta types adicionados, initiative no payload da cena, restauro no applyMesaSceneSnapshot, init no boot
- cloudflare/src/mesa.js — normalizeMesaScene preserva initiative
- mesa.html — botao toolbar, painel sidebar #vttInitiativeBlock, banner #initiativeBanner, popup #initiativeRollPopup, script tag
- css/mesa.css — estilos do tracker, banner, popup

### Validacoes
- npm run check:js: OK (40 arquivos)
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-05)

- Responsividade da Mesa e da Ficha revisada:

  **Mesa mobile (≤480px):**
  - sidebar passou de scrollável horizontal para coluna vertical, ocupando o espaço restante abaixo do canvas
  - meta chips (Modo/Papel/Fichas) ficam em linha horizontal no topo da sidebar
  - toolbar reduzida a 44px sem o badge de papel e o contador; separadores ocultos
  - canvas fixado em 44vh para garantir espaço ao roster abaixo
  - tabs do roster em grade 2×2, sem overflow
  - botões de ação do token (FOCAR/RETIRAR) com largura completa

  **Mesa tablet (≤900px):**
  - cabeçalho de bloco da sidebar aceita quebra de linha (`flex-wrap: wrap`)
  - badge "X/N PARA COLOCAR" usa fonte e padding menores para não transbordar

  **Mesa ≤700px:**
  - sidebar horizontal com scroll snap (um bloco por vez, largura `min(280px, 80vw)`)
  - meta chips mais compactos

  **Ficha mobile (≤480px):**
  - campos de identidade (Nome/Aspecto/Raça/Facção) empilham em coluna única via `form-row { flex-wrap: wrap }`
  - `soul-core-panel` empilha verticalmente
  - recursos empilham em coluna

  **Ficha tablet (≤768px):**
  - `soul-attribute-cap-grid` quebra para segunda linha no `soul-core-panel`

  **Header global (≤480px):**
  - logo menor (32×32), subtítulo oculto, badge de usuário truncado com ellipsis

  - arquivos alterados: `css/mesa.css`, `css/mesa-roster.css`, `css/components.css`, `css/ficha.css`
  - validações executadas: `npm run check:js` (39 arquivos OK), `npm run audit:static` (OK), QA visual por Playwright em 360px e 768px para mesa e ficha

## Ultima Etapa Concluida (2026-06-01)

- Correcao de sincronizacao do roster e botao de configuracoes da Mesa sempre visivel:

  **Fix 1 — Roster contaminado por localStorage em modo backend:**
  - causa: `buildPlayers`, `buildNpcs` e `buildMonsters` adicionavam ao roster qualquer chave encontrada em `tc_sheets` (localStorage), mesmo que aquele personagem nao existisse no diretorio da API; numa maquina diferente com outro cache local o roster ficava diferente
  - `js/mesa-core.js`: as tres funcoes agora so adicionam entradas vindas do localStorage ao roster quando `isMesaBackendEnabled()` retornar `false`; em modo backend o diretorio da API e a unica fonte de quem aparece no roster
  - cache bust de `mesa-core.js` atualizado para `2026-06-01-backend-roster-1`

  **Fix 2 — Botao de configuracoes da Mesa sempre visivel para o mestre:**
  - causa: `#mesaMapSettingsBtn` ficava oculto ate que um mapa fosse carregado, mas o painel de configuracoes tambem tem o seletor de estilo de tokens, que nao depende de mapa
  - `mesa.html`: removido `hidden` inicial do `#mesaMapSettingsBtn`; adicionado `id="mesaMapScaleGroup"` e `id="mesaMapHint"` para controlar visibilidade por secao
  - `js/mesa-map.js`: `renderMesaMapLayer()` exibe/oculta apenas as secoes de escala e posicao conforme mapa ativo; o botao e mantido visivel para o mestre mesmo sem mapa; `toggleMapSettings()` sincroniza visibilidade de cada secao ao abrir o painel; `initMesaMap()` ja exibe o botao ao detectar papel mestre, antes de qualquer mapa ser carregado
  - cache bust de `mesa-map.js` atualizado para `2026-06-01-settings-always-1`

  - validacoes executadas: `npm run check:js` (39 arquivos OK)
  - status: pronto para revisao e commit

## Estado Funcional Atual

- Login com mestre e jogadores funcionando via API
- Fichas centralizadas no servidor
- Painel do mestre com jogadores, NPCs e monstros
- Mestre abre e salva fichas de jogadores pelo `key` oficial do diretorio, preservando `username` como dono da ficha
- Sistema de regras publicado
- Transferencia de itens entre jogadores
- Transferencia de memorias entre jogadores
- Drop de memoria de monstros
- Progressao por Essencias da Alma implementada
- Rolagem de dados na ficha implementada
- Mesa virtual com roster, palco, inspetor e edicao local/online da ficha propria
- Mesa virtual sincroniza cena em tempo real para mestre e jogadores conectados
- Mesa virtual usa renderer Canvas/Worker por padrao, com fallback Canvas principal e DOM legado via `localStorage.mesaRenderer = "dom"`
- Realtime da Mesa aceita deltas incrementais de token para reduzir payload durante movimento
- Mestre ve roster completo da Mesa; jogador ve palco compartilhado e painel pessoal da propria ficha, sem lista de tokens disponiveis
- Jogador pode alterar pela Mesa: dados rapidos, atributos, Vida atual, Vida maxima, Integridade atual, Integridade maxima e inventario da propria ficha
- Campos numericos da Mesa permitem apagar o valor atual e digitar um novo numero antes de aplicar clamp/salvamento
- Memorias continuam em leitura no painel do jogador nesta etapa para preservar as regras de transferencia
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

- Estabilizacao de sincronizacao da Mesa em 2026-05-09:
  - objetivo: remover gargalo/oscillacao em que valores recem editados pela Mesa podiam receber refresh antigo e aparentar rollback ou demora na selecao
  - causa encontrada: `sheet:changed` e `mesa:sheet:patch` podiam recarregar cache remoto antigo enquanto havia patch local pendente; alem disso, cada patch de ficha reprocessava roster/tokens inteiros
  - `js/mesa-core.js`: adicionada janela curta de patch otimista por ficha; eventos remotos agora mesclam esse patch local recente antes de atualizar cache/render
  - `js/mesa-stage.js`: patches da ficha atualizam roster/tokens de forma incremental, sem `refreshMesaRosterFromSheets()` completo em cada tecla; selecionar o mesmo token nao dispara nova ordem nem save de cena
  - `js/mesa-stage.js`: maxima de Vida/Integridade deixou de aplicar clamp no valor atual a cada digito intermediario; o clamp final acontece no `focusout`, evitando rollback ao digitar `30`
  - `mesa.html`: cache bust de `mesa-core.js` e `mesa-stage.js` atualizado para `2026-05-09-sync-lag-1`
  - `tests/mesa.spec.cjs`: regressao simula refresh remoto antigo logo apos edicao local e confirma que Vida/Integridade nao voltam para o valor antigo; tambem cobre clamp visual final quando Vida/Integridade maxima ficam abaixo do valor atual
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Digitacao continua de numeros na Mesa em 2026-05-09:
  - objetivo: permitir digitar valores com multiplos digitos, como `10` ou `30`, sem o campo travar no primeiro digito
  - `js/mesa-stage.js`: o inspetor da Mesa deixou de reconstruir o proprio painel a cada tecla; agora atualiza barra/label localmente e renderiza o inspetor completo apenas ao sair do campo
  - `tests/mesa.spec.cjs`: regressao usa `type("10")` e `type("30")` para cobrir digitacao real no inspetor do mestre e no painel pessoal do jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Edicao livre de maximos de Vida/Integridade em 2026-05-09:
  - objetivo: permitir que jogador e mestre editem diretamente, por numero digitado, Vida atual/maxima e Integridade atual/maxima
  - `js/mesa-roster.js`: painel pessoal do jogador agora mostra `Max` editavel tambem para Integridade
  - `js/mesa-stage.js` e `js/mesa-core.js`: patches da Mesa preservam `integMax` manual e `attrAlma` deixa de sobrescrever a Integridade maxima
  - `js/ficha-core.js`, `js/ficha-sheet.js` e `ficha.html`: Integridade maxima da ficha deixou de ser somente leitura e passou a ser persistida como valor manual
  - `cloudflare/src/sheet.js`, `cloudflare/src/mesa-realtime.js` e `server/src/utils/sheet.js`: backend/Worker preservam `integMax` enviado pelo cliente e apenas clampam Integridade atual pelo maximo salvo
  - `mesa.html` e `ficha.html`: cache bust atualizado para `2026-05-09-free-resource-max-1`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run --config cloudflare/wrangler.toml`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Edicao direta de numeros da ficha pela Mesa em 2026-05-09:
  - objetivo: permitir que mestre e jogador apaguem o valor de campos numericos e digitem o numero novo, sem depender apenas das setas do input
  - `js/mesa-stage.js`: handlers de Vida, Integridade, Vida maxima, atributos e quantidade de item agora ignoram campo numerico temporariamente vazio e restauram o valor seguro apenas ao sair do campo sem preencher
  - `js/mesa-core.js`: painel do jogador e inspetor passaram a tratar `focusout` para restaurar entradas numericas deixadas vazias sem salvar `0` por acidente
  - `js/mesa-roster.js` e `js/mesa-inspector.js`: inputs numericos ganharam `inputmode="numeric"` mantendo o visual e os limites atuais
  - `mesa.html`: cache bust dos scripts da Mesa atualizado para `2026-05-09-numeric-clear-1`
  - `tests/mesa.spec.cjs`: regressao cobre apagar e redigitar Vida no inspetor do mestre, Vida no painel do jogador, atributo e quantidade de item
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Protecao de limpar cena e gradiente da Mesa em 2026-05-09:
  - objetivo: impedir que jogadores vejam/usem `Limpar cena` e melhorar o acabamento dos gradientes da Mesa sem alterar o fluxo simples do painel do jogador
  - `mesa.html`: botao `Limpar cena` inicia oculto e cache bust atualizado para `2026-05-09-mesa-guard-gradient-1`
  - `js/mesa-roster.js`: controles da Mesa agora ocultam/desabilitam `Limpar cena` para jogadores e liberam apenas para mestre
  - `js/mesa-core.js` e `js/mesa-stage.js`: clique e funcao de limpar cena receberam guardas adicionais por papel
  - `css/mesa-base.css` e `css/mesa-stage.css`: gradientes da Mesa foram refinados com camadas carmesim, sombra escura e acento frio sutil, preservando a vibe dark fantasy
  - `tests/mesa.spec.cjs`: regressao cobre `Limpar cena` visivel para mestre e oculto/desabilitado para jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, `npm run perf:mesa`, QA visual por Playwright em desktop/mobile e `git diff --check`
  - status: pronto para publicacao

- Correcao de quebras visuais nos gradientes da Mesa em 2026-05-09:
  - objetivo: remover emendas/linhas visiveis entre tons escuros e carmesim nos paineis da Mesa
  - `css/mesa-base.css`: gradientes dos paineis passaram de faixas lineares/altura fixa para elipses suaves em painel inteiro
  - `css/mesa-stage.css`: gradiente do palco deixou de usar diagonais marcadas e passou a usar manchas radiais com fade gradual
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, QA visual por Playwright em desktop largo e `git diff --check`
  - status: pronto para publicacao

- Retorno da interface simples do painel do jogador na Mesa em 2026-05-09:
  - objetivo: voltar ao controle simples em fluxo unico, sem abas e sem botoes rapidos, preservando a edicao ampla da propria ficha pela Mesa
  - `js/mesa-roster.js`: painel pessoal voltou a renderizar hero, Vida/Integridade, dados rapidos, atributos, inventario e memorias em secoes continuas
  - `js/mesa-core.js` e `js/mesa-stage.js`: removidos estado/handlers mortos de abas e botoes rapidos do painel do jogador
  - `css/mesa-layout.css`: removidos overrides recentes de largura/escala interna que mudavam a primeira leitura da ficha rapida
  - `mesa.html`: cache bust de `mesa-core.js`, `mesa-stage.js`, `mesa-roster.js`, `mesa-roster.css` e `mesa-layout.css` atualizado para `2026-05-09-player-simple-1`
  - `tests/mesa.spec.cjs`: regressao ajustada para garantir ausencia de abas e manter edicao de Vida, Integridade, atributos, dados rapidos e inventario
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, `npm run perf:mesa`, QA visual por Playwright em desktop/mobile e `git diff --check`
  - status: pronto para publicacao

- Painel de edicao completa do jogador na Mesa em 2026-05-08:
  - objetivo: permitir que o jogador edite pela Mesa a propria ficha em tempo real, alem de Vida/Integridade atuais
  - `js/mesa-roster.js` e `css/mesa-roster.css`: painel pessoal ganhou campos editaveis de dados rapidos, atributos, Vida maxima e inventario; itens podem ser adicionados, removidos e editados sem expor roster de tokens
  - `js/mesa-stage.js`: novos handlers aplicam patches locais sem reconstruir o painel a cada tecla; inventario respeita a capacidade atual
  - `js/mesa-core.js`: `mesa:sheet:patch` passou a normalizar texto, recursos, atributos, `inv` e `ownedMemories`; cache local/remoto da Mesa preserva atributos e dados rapidos
  - `cloudflare/src/mesa-realtime.js`: Durable Object agora aceita e sanitiza patches amplos da ficha, mantendo a regra de que jogador so transmite alteracoes da propria `characterKey` e filtrando campos nao permitidos antes do relay
  - `mesa.html`: cache bust de `mesa-core.js`, `mesa-stage.js`, `mesa-roster.js` e `mesa-roster.css` atualizado para `2026-05-08-player-edit-1`
  - `tests/mesa.spec.cjs`: regressao ampliada para cobrir edicao local/online de atributos, dados rapidos e inventario pelo painel do jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `npm run test:mesa:online`, `npx.cmd --yes wrangler@latest deploy --dry-run --config cloudflare/wrangler.toml` e `git diff --check`
  - observacao de QA: o fluxo autenticado de `test:mesa:online` ficou ignorado neste processo porque as variaveis de credenciais nao estavam carregadas; testes publicos online passaram
  - observacao de ferramenta: o Browser integrado falhou antes de abrir a pagina por erro de preparo de arquivos temporarios do runtime; a validacao renderizada especifica ficou coberta pelo Playwright do projeto
  - Worker publicado em 2026-05-08: `armagedon-api`, version ID `d93c6c56-eaf6-4e13-855b-b5640967d7f6`
  - status: implementado e Worker publicado; falta apenas push para GitHub Pages publicar o cache bust do frontend

- Proximo passo da Mesa online em 2026-05-08:
  - `package.json`: adicionado `npm run test:mesa:online`
  - `tests/mesa-online.spec.cjs`: novo smoke test online para GitHub Pages e Cloudflare; sem credenciais, valida `index.html`, `mesa.html`, `ficha.html`, `regras.html`, `/api/health`, bloqueio anonimo de `/api/directory` e `/api/mesa/scene`, e resposta `426` de `/api/mesa/realtime` sem WebSocket
  - fluxo autenticado opcional: quando `ARMAGEDON_MASTER_USERNAME`, `ARMAGEDON_MASTER_PASSWORD`, `ARMAGEDON_PLAYER_USERNAME` e `ARMAGEDON_PLAYER_PASSWORD` estiverem definidos, o teste valida login mestre/jogador, diretorio, cena oficial, WebSocket `mesa:ready`, UI da Mesa como mestre e UI da Mesa como jogador
  - ajuste posterior: seletor do roster autenticado corrigido de `#mesaRosterList` para `#rosterList`; no modo jogador o teste agora valida painel pessoal, busca oculta e ausencia de acoes `data-roster-action`
  - `ARMAGEDON_ONLINE_RELAY_PROBE=1` ativa uma prova extra de relay `mesa:token:move`; deixar desligado por padrao para nao transmitir evento de teste a usuarios reais conectados
  - validacoes executadas sem credenciais reais: `node --check tests/mesa-online.spec.cjs`, `npm run audit:static`, `git diff --check` e `npm run test:mesa:online` com 2 testes passados e 1 autenticado ignorado

- Correcao da edicao de fichas de jogadores pelo mestre em 2026-05-07:
  - problema: o cache local de jogadores gerado a partir do diretorio da API descartava a `key` oficial da ficha e `createPlayerTarget()` montava o alvo apenas com `username`; isso podia abrir/salvar a ficha no identificador errado quando a API entregasse uma `key` diferente ou quando o cache local estivesse desatualizado
  - problema adicional: handlers de realtime da ficha acessavam `currentSheetTarget.key` mesmo quando o mestre estava no painel principal, onde `currentSheetTarget` e nulo; um broadcast de ficha/inventario/memoria podia gerar erro de console antes da abertura/edicao da ficha
  - `js/auth.js`: `AUTH.setDirectoryCache()` agora preserva `id`, `key`, `username`, `charname`, `inventorySlots` e `usedSlots` no cache `tc_players`
  - `js/ficha-core.js`: `createPlayerTarget()` agora resolve o jogador pelo diretorio oficial ou pelo cache local, usa `player.key` como chave de API e mantem `player.username` como owner; os handlers de realtime usam guarda nula e comparacao normalizada
  - varredura profunda encontrou outra classe de bug: cache de diretorio remoto antigo podia contaminar o modo local/offline; `js/ficha-core.js` e `js/mesa-core.js` agora so usam `tc_directory_cache` quando o backend esta ativo, preservando `username`/`tc_sheets` locais no modo local
  - varredura extra fora do plano encontrou fragilidade em transferencias: item/memoria ainda podiam escolher destino por `username`; `js/ficha-inventory.js` e `js/ficha-memories.js` agora usam `player.key` em modo API, mantem `username` no modo local e evitam erro quando nao ha destino disponivel
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `auth.js` atualizado para `2026-05-07-master-sheet-key-1`; `ficha.html` tambem atualizou `ficha-core.js`, `ficha-inventory.js` e `ficha-memories.js`; `mesa.html` atualizou `mesa-core.js`
  - `tests/ficha.spec.cjs`, `tests/mesa.spec.cjs` e `package.json`: adicionadas regressoes `npm run test:ficha` e `npm run test:mesa`, simulando mestre salvando uma ficha de jogador em `/api/characters/:key`, transferencia de item usando `targetKey` oficial e Mesa local salvando no `username` local mesmo com diretorio remoto antigo
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:ficha`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git fsck --no-dangling`, varredura de MP4 no `_site` e `git diff --check`
  - deploy operacional em 2026-05-07: GitHub Pages ficou `built`, `index.html`, `ficha.html`, `mesa.html` e `regras.html` responderam HTTP 200, API `/api/health` respondeu HTTP 200 e Worker `armagedon-api` foi publicado na version ID `fb0548da-a975-4804-bc54-1b740938d31d`
  - observacao de ambiente: `npm run test:ficha` falhou no sandbox com `spawn EPERM`; o mesmo teste passou com permissao elevada porque o Playwright precisa criar worker de teste
  - status: correcao publicada na `main`; proxima pendencia e validacao manual ponta a ponta com mestre e jogador reais no site oficial

- Correcao da edicao da ficha pela Mesa em 2026-05-07:
  - problema: o painel do jogador podia editar o cache local da Mesa, mas a pagina nao buscava a ficha oficial do jogador antes de montar o painel; alem disso, a Ficha escutava `sheet:changed.key` enquanto o Worker emitia `sheet:changed.characterKey`
  - `js/mesa-core.js`: a Mesa agora hidrata a propria ficha do jogador via `GET /api/characters/:key` antes de montar o roster/painel, usa a `key` oficial do diretorio quando existir e aceita patch de ficha propria tambem por entrada/token pertencente ao usuario
  - `js/mesa-stage.js`: patches pendentes de Vida/Integridade sao enviados imediatamente em `pagehide`/aba oculta com `keepalive`; o save remoto continua usando debounce durante edicao normal
  - `js/ficha-core.js`: `sheet:changed` agora aceita `key`, `characterKey` ou `targetKey`, permitindo que a ficha aberta recarregue quando a Mesa salva o status
  - `cloudflare/src/index.js` e `cloudflare/src/mesa-realtime.js`: eventos de ficha passam a carregar `key` e `characterKey` para compatibilidade entre Mesa e Ficha
  - `mesa.html` e `ficha.html`: cache bust atualizado para `2026-05-07-sheet-edit-1`
  - `tests/mesa.spec.cjs`: adicionada cobertura com backend simulado confirmando que o jogador carrega a ficha oficial, ve itens/memorias reais e persiste Vida/Integridade via `PUT /api/characters/:key`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git fsck --no-dangling` e `git diff --check`
  - Worker publicado em 2026-05-07: `armagedon-api`, version ID `b89440a2-65c6-4d1e-8fcb-9b17c2236c6a`
  - pendencia pos-push: acompanhar GitHub Pages na `main` e conferir o site oficial com jogador editando Vida/Integridade pela Mesa

- Painel pessoal do jogador na Mesa em 2026-05-06:
  - objetivo: ocultar do jogador o roster de tokens disponiveis, manter o palco compartilhado e permitir edicao apenas de Vida atual e Integridade atual da propria ficha
  - `js/mesa-core.js`: adicionados helpers de papel/privacidade (`isOwnPlayerToken`, `getOwnPlayerTokens`, `getOwnSheetSnapshot`, `canViewDetailedTokenInfo`), cache de snapshot da propria ficha e assinatura do evento `mesa:sheet:patch`
  - `js/mesa-roster.js` e `css/mesa-roster.css`: roster do mestre preservado; jogadores passam a ver painel "Meu personagem" com avatar, Vida, Integridade, itens, capacidade e memorias em leitura
  - `js/mesa-stage.js`: selecao e status respeitam permissao de token; patch de ficha nao persiste cena visual; painel do jogador edita valores atuais sem reconstruir a UI a cada tecla
  - `js/mesa-inspector.js`: jogador nao ve detalhes de token alheio no inspetor inferior; tokens nao autorizados viram leitura restrita da cena
  - `js/mesa-renderer-v2.js`, `js/mesa-renderer-worker.js`, `css/mesa-stage.css` e `css/mesa-inspector.css`: Vida e Integridade usam a mesma formula visual da ficha original; Integridade deixou de usar fallback dourado na Mesa
  - `cloudflare/src/mesa-realtime.js`: Durable Object aceita `mesa:sheet:patch`, valida que jogador so altera a propria ficha e retransmite patch apenas para mestre e dono da ficha
  - `cloudflare/src/index.js`: `PUT /api/characters/:key` dispara `sheet:changed` para Mesa/Ficha atualizarem snapshot quando a ficha for salva
  - `mesa.html`: cache bust atualizado para `2026-05-06-player-panel-1`
  - `tests/mesa.spec.cjs`: adicionada cobertura de jogador sem roster, painel pessoal, privacidade do inspetor e edicao de Vida/Integridade
  - Worker publicado em 2026-05-07: `armagedon-api`, version ID `f749f048-5040-4f6a-a43d-e1e5aaae48f2`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git diff --check` e smoke visual no Browser integrado em servidor local
  - observacao de QA: o Browser integrado bloqueou `javascript:` URL para semear `localStorage`; o fluxo especifico de jogador foi validado por Playwright, e o Browser foi usado para smoke visual seguro da Mesa local

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
  - historico antigo: nesta etapa a Integridade maxima ainda derivava de Alma no servidor; isso foi alterado em 2026-05-09 para permitir edicao manual de `integMax`
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

## 2026-05-09 - GitHub Pages Preparado Para Node 24

- Workflow `.github/workflows/pages.yml` atualizado para actions que ja publicaram releases compatíveis com Node 24:
  - `actions/checkout@v6`
  - `actions/configure-pages@v6`
  - `actions/upload-pages-artifact@v5`
  - `actions/deploy-pages@v5`
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` foi ativado no workflow para testar a migracao antes de ela virar padrao no GitHub Actions.
- `include-hidden-files: true` foi mantido no upload do Pages para garantir que `_site/.nojekyll` continue dentro do artefato publicado.
- Objetivo: remover o aviso de Actions em Node 20 e evitar quebra futura do deploy do Pages.
- Validacoes executadas antes do commit:
  - `npm run build:pages`
  - confirmar `_site/.nojekyll`
  - `git diff --check`
  - consulta do `action.yml` oficial de `actions/upload-pages-artifact@v5.0.0` confirmando o input `include-hidden-files`
  - push na `main` e `gh run watch` do workflow `Deploy GitHub Pages`

## 2026-05-09 - Polimento De Largura Do Painel Da Mesa

- Painel pessoal do jogador deixou de esticar indefinidamente em telas largas.
- Workbench inferior da Mesa agora limita a largura util do painel principal e preserva o inspetor lateral com largura estavel.
- Blocos internos do painel pessoal receberam largura maxima: hero, abas, recursos, atributos, inventario e areas de texto.
- `content-visibility` foi desligado somente no painel pessoal do jogador e no inspetor visivel para evitar blocos vazios durante rolagem/captura.
- `mesa.html` recebeu novo cache bust para `css/mesa-layout.css`, `css/mesa-roster.css` e `js/mesa-roster.js`.
- Validado com `npm run check:js`, `npm run test:mesa`, `npm run audit:static`, `npm run build:pages`, `npm run perf:mesa`, `git diff --check` e QA visual por Playwright em viewport larga e mobile.

## 2026-05-08 - Polimento Do Painel Do Jogador Na Mesa

- Painel pessoal do jogador foi reorganizado em abas: `Status`, `Atributos`, `Inventario`, `Memorias` e `Notas`.
- Aba `Status` agora prioriza Vida e Integridade com controles rapidos `-1`, `+1`, `0` e `Max`, mantendo os inputs numericos existentes.
- Painel passou a exibir feedback de sincronizacao: `Sincronizado`, `Salvando...`, `Erro ao salvar` ou `Salvo neste navegador`.
- Inventario ficou mais compacto: dano aparece apenas para itens do tipo arma e a descricao fica recolhida em `Detalhes`.
- O cache-busting de `mesa.html` foi atualizado para carregar os novos CSS/JS da Mesa no site publicado.
- Testes da Mesa foram atualizados para validar o fluxo real por abas, controles rapidos, inventario, memorias e persistencia online.
- Arquivos principais alterados nesta etapa:
  - `mesa.html`
  - `css/mesa-roster.css`
  - `js/mesa-core.js`
  - `js/mesa-roster.js`
  - `js/mesa-stage.js`
  - `tests/mesa.spec.cjs`
  - `DEV_STATUS.md`
  - `VISUAL_RULES.md`
  - `docs/obsidian/07-MESA.md`
  - `docs/obsidian/09-HISTORICO-DE-SESSOES.md`
- Validacoes executadas nesta etapa:
  - `npm run check:js`
  - `npm run audit:static`
  - `npm run test:mesa`
  - `npm run test:ficha`
  - `npm run perf:mesa`
  - `npm run build:pages`
  - `git diff --check`
  - `git fsck --no-dangling`
  - QA visual por Playwright em desktop e viewport estreito
- Pendencia da etapa antes do deploy:
  - publicar na `main` e validar o site oficial apos o workflow do GitHub Pages.

## Ajustes de Gameplay Ja Consolidados

- Integridade substituiu Sanidade
- Integridade maxima e editavel manualmente:
  - Alma continua gerando modificador, mas nao sobrescreve o maximo salvo de Integridade
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

1. Rodar `npm run test:mesa:online` com credenciais reais de mestre/jogador em variaveis de ambiente
2. Medir comportamento em maquina mais fraca e ajustar cap de `devicePixelRatio` se necessario
3. Normalizar thumbnails WebP/JPEG dos avatares grandes no fluxo de salvamento da ficha
4. Revisar responsividade da ficha, inventario e mesa
5. Se o teste autenticado passar, criar um usuario/ficha de teste dedicado para validar relay e persistencia sem tocar dados de campanha real

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
- `npm run test:mesa:online`
- `npm run perf:mesa`
- `npx wrangler deploy --dry-run` em `cloudflare/`
- servidor estatico temporario respondeu `200` para `ficha.html` e `mesa.html`
- workflow de Pages revisado para incluir `mesa.html`
- Browser Use abriu `http://127.0.0.1:8012/mesa.html` sem erros de console registrados

## Etapa Echos (2026-06-15)

Sistema de Echos: manifestacoes residuais de monstros derrotados, colecionaveis pelos jogadores, com rank e XP proprios.

### Resumo do que mudou

- Monstro ganhou configuracao de drop de Echo na ficha (chance + raridade padrao), ao lado do drop de memoria.
- O mestre testa o drop e, em caso de sucesso, concede o Echo a um jogador ou NPC.
- Echos viram entidades proprias no banco (tabela `echos`), com nome, aparencia, descricao, habilidades/passivas e atributos derivados do monstro, alem de rank/XP independentes.
- Nova pagina `echos.html` lista, filtra, detalha e edita os Echos. Jogador edita apelido, anotacoes e imagem do proprio Echo; o mestre edita tudo, concede XP, transfere e remove.
- Transferencia de Echo reutiliza o fluxo de propostas (`transfer_proposals`, tipo `echo`): mestre transfere direto, jogador envia proposta com aceite.
- Mesa: o roster do mestre ganhou o grupo "Echos"; o mestre coloca o Echo de um jogador no palco como token aliado. O painel do jogador ganhou link para `echos.html`.

### Arquivos principais

- Novos: `echos.html`, `css/echos.css`, `js/echos-core.js`, `js/echos-page.js`, `js/echos-init.js`, `js/ficha-echos.js`, `cloudflare/src/echos.js`, `cloudflare/d1/migrations/0002_add_echos.sql`
- Backend alterado: `cloudflare/src/sheet.js` (`echoDropConfig`), `cloudflare/src/characters.js` (proposta/aceite tipo `echo`), `cloudflare/src/index.js` (rotas `/api/echos*`, upload de avatar de Echo), `cloudflare/d1/schema.sql`
- Frontend alterado: `js/api.js` (metodos de Echo), `js/ficha-core.js`, `js/ficha-sheet.js`, `js/mesa-core.js`, `js/mesa-roster.js`, `css/tokens.css` (tokens de raridade), `css/ficha.css`
- Navegacao + cache-busting: `index.html`, `ficha.html`, `mesa.html`, `regras.html`, `sugestoes.html`

### Validacoes executadas

- `npm run check:js`: OK (41 arquivos)
- `npm run audit:static`: OK
- `npx wrangler deploy --dry-run --config cloudflare/wrangler.toml`: bundle OK

### Pendencias / riscos

- A migracao `0002_add_echos.sql` precisa ser aplicada no D1 remoto antes do deploy do Worker (recria `transfer_proposals` e `transfer_audit` para aceitar `echo`).
- Invocacao na Mesa e feita pelo mestre (modelo master-invoke), pois a gravacao da cena (`PUT /api/mesa/scene`) e exclusiva do mestre. Permitir o jogador invocar o proprio Echo diretamente exige mudanca futura nas permissoes de escrita da cena.
- Um Echo so renderiza como token nos clientes que o tem no roster (mestre ve todos; jogador ve os proprios). O Echo de um jogador nao aparece no roster de outro jogador.

### Etapa Echos — controle de vida na Mesa (2026-06-15)

- Inspetor da Mesa passou a permitir ajustar Vida e Integridade ATUAIS dos tokens: mestre em qualquer token; jogador no proprio token e nos proprios Echos (`canEditCurrentStats` + `isOwnEchoToken`).
- Echos nao tem ficha, entao a vida do token de Echo segue caminho proprio: `POST /api/echos/:id/vitals` (mestre ou dono) salva `vidaAtual`/`integAtual`, e o canal realtime `mesa:echo:vitals` (novo tipo no `MesaRealtimeRoom`) sincroniza entre mestre e dono.
- Arquivos: `cloudflare/src/echos.js` (`setEchoVitals`), `cloudflare/src/index.js` (rota), `cloudflare/src/mesa-realtime.js` (tipo + relay com gating), `js/api.js` (`setEchoVitals`), `js/mesa-core.js` (isOwnEchoToken, applyEchoVitalsToMesa, broadcast/persist/realtime), `js/mesa-stage.js` (permissoes + branch do inspetor).
- Validado: `npm run check:js`, `npm run audit:static`, `wrangler dry-run`. Exige `wrangler deploy` (mudanca no Durable Object); sem mudanca no banco.
