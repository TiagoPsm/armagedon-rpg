# Historico Compacto de Sessoes

Este arquivo resume marcos importantes. Detalhes completos continuam em `DEV_STATUS.md`.

## 2026-05-09 - Maximos De Vida E Integridade Editaveis

- Painel pessoal da Mesa passou a editar Integridade maxima com campo `Max`, igual Vida.
- Ficha, Worker e backend legado deixam de sobrescrever `integMax` pela Alma; Alma continua servindo para modificador.
- Vida/Integridade atuais continuam clampadas pelos maximos salvos, mas os maximos agora sao valores numericos manuais.

## 2026-05-09 - Edicao Numerica Direta Na Mesa

- Inputs numericos da Mesa agora aceitam apagar o valor inteiro e digitar outro numero sem transformar o campo vazio temporario em `0`.
- Cobertura adicionada para inspetor do mestre, Vida do jogador, atributos e quantidade de item no painel pessoal.
- Campos vazios ao sair do foco restauram o valor seguro atual, evitando salvamento acidental de vazio.

## 2026-05-09 - Correcao Das Quebras De Gradiente Da Mesa

- Gradientes dos paineis grandes da Mesa deixaram de usar faixas lineares com cortes visiveis.
- `css/mesa-base.css` e `css/mesa-stage.css` passaram a usar camadas radiais/elipticas com fade gradual.
- Objetivo visual: preservar a atmosfera carmesim/dark sem criar blocos ou emendas de cor.

## 2026-05-09 - Protecao De Limpar Cena E Gradiente Da Mesa

- Jogadores deixam de ver/acionar `Limpar cena`; o botao fica oculto/desabilitado e a funcao tem guarda interna por papel.
- Gradientes do fundo, dos paineis principais e do palco foram refinados com carmesim, preto profundo e acento frio sutil.
- O fluxo simples do painel do jogador foi preservado, sem reintroduzir abas ou botoes rapidos.

## 2026-05-09 - Retorno Ao Painel Simples Da Mesa

- Painel pessoal do jogador voltou ao fluxo unico simples, sem abas e sem botoes rapidos.
- A edicao ampla da propria ficha foi preservada: Vida, Integridade, dados rapidos, atributos e inventario continuam editaveis.
- Overrides recentes de largura/escala interna em `css/mesa-layout.css` foram removidos para restaurar a primeira leitura do painel.
- Testes da Mesa passaram a validar explicitamente que nao ha abas no painel do jogador.

## 2026-05-09 - Escala Interna Do Painel Da Mesa

- Ajustado o conteudo interno do painel pessoal do jogador, sem ampliar novamente o container geral.
- Cards de Vida/Integridade, atributos, inventario e memorias ganharam inputs mais altos, botoes maiores, padding e gaps mais confortaveis.
- Regra visual registrada: largura controlada nao pode transformar a ficha rapida da Mesa em conteudo pequeno ou mal espacado.
- Validado com Playwright local em desktop/mobile e com a bateria de scripts do projeto antes da publicacao.

## 2026-05-09 - GitHub Pages Preparado Para Node 24

- Workflow `.github/workflows/pages.yml` atualizado para `checkout@v6`, `configure-pages@v6`, `upload-pages-artifact@v5` e `deploy-pages@v5`.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` ativado para testar Node 24 antes da migracao obrigatoria do GitHub Actions.
- `include-hidden-files: true` mantido no upload do Pages para preservar `_site/.nojekyll`.
- Objetivo: remover aviso de Actions em Node 20 e reduzir risco de falha futura no deploy.

## 2026-05-09 - Mesa Menos Esticada Em Desktop

- Workbench inferior da Mesa recebeu largura util maxima para evitar painel pessoal excessivamente largo.
- Hero, abas, cards de Vida/Integridade, atributos e inventario do painel do jogador agora param de esticar em telas largas.
- `content-visibility` foi desligado no painel pessoal e no inspetor visivel para evitar areas vazias durante rolagem.
- Validado com `check:js`, `test:mesa`, `audit:static`, `build:pages`, `perf:mesa`, `git diff --check` e QA visual por Playwright em viewport larga e mobile.

## 2026-05-08 - Polimento Do Painel Do Jogador Na Mesa

- Painel pessoal do jogador foi separado em abas: `Status`, `Atributos`, `Inventario`, `Memorias` e `Notas`.
- Status ganhou botoes rapidos `-1`, `+1`, `0` e `Max` para Vida/Integridade, alem dos inputs existentes.
- Inventario ficou mais compacto, com dano exibido apenas para armas e descricao recolhida em `Detalhes`.
- Feedback de salvamento foi exposto no painel como `Sincronizado`, `Salvando...`, `Erro ao salvar` ou `Salvo neste navegador`.
- `mesa.html` recebeu cache-busting novo para forcar os CSS/JS atualizados no site publicado.
- Validado com `check:js`, `audit:static`, `test:mesa`, `test:ficha`, `perf:mesa`, `build:pages`, `git diff --check`, `git fsck --no-dangling` e QA visual por Playwright.

## 2026-05-08 - Edicao Ampla Da Ficha Pela Mesa

- Painel pessoal do jogador na Mesa agora edita dados rapidos, atributos, Vida atual, Vida maxima, Integridade atual e inventario da propria ficha.
- Roster de tokens continua exclusivo do mestre; jogador continua sem busca, contagem de disponiveis e acoes de colocar/focar/retirar tokens alheios.
- Historico da primeira versao: `attrAlma` ainda recalculava `integMax`; isso foi substituido depois por Integridade maxima manual.
- `mesa:sheet:patch` passou a aceitar payload amplo e sanitizado; Durable Object continua retransmitindo apenas para mestre e dono da ficha.
- Memorias continuam em leitura no painel do jogador para preservar regras de transferencia.
- Validado com `check:js`, `audit:static`, `test:mesa`, `test:ficha`, `perf:mesa`, `build:pages`, `test:mesa:online` publico e dry-run do Worker com `--config cloudflare/wrangler.toml`.
- Worker `armagedon-api` publicado na version ID `d93c6c56-eaf6-4e13-855b-b5640967d7f6`.

## 2026-05-08 - Smoke Test Da Mesa Online

- Adicionado `npm run test:mesa:online`.
- Sem credenciais, o teste valida Pages/API oficiais e protecao anonima dos endpoints.
- Com variaveis locais de mestre/jogador, o teste valida login real, diretorio, cena oficial, WebSocket `mesa:ready` e UI da Mesa para mestre e jogador.
- Corrigido o seletor do roster autenticado para `#rosterList`; em modo jogador, o mesmo container vira painel pessoal e nao deve expor acoes de roster.
- `ARMAGEDON_ONLINE_RELAY_PROBE=1` fica separado para evitar relay de evento de teste quando houver usuarios reais conectados.

## 2026-05-07 - Ficha Mestre Por Key Oficial

- Corrigido o fluxo em que o mestre abre e salva fichas de jogadores pelo painel de fichas.
- `AUTH.setDirectoryCache()` passou a preservar a `key` oficial do jogador no cache local usado pela UI.
- `createPlayerTarget()` agora resolve o jogador pelo diretorio/cache, usa `player.key` para `GET/PUT /api/characters/:key` e mantem `player.username` como dono da ficha.
- Handlers de realtime da Ficha receberam guardas quando `currentSheetTarget` esta nulo no painel do mestre.
- Varredura extra corrigiu transferencias de item/memoria para usar `targetKey` oficial em modo API e evitar erro quando nao ha destino.
- Varredura profunda corrigiu modo local/offline para ignorar cache de diretorio remoto antigo na Ficha e na Mesa, evitando salvar a ficha local na `key` remota errada.
- Adicionado `npm run test:ficha` com regressao cobrindo mestre salvando a ficha no endpoint oficial correto e transferencia de item para `targetKey` oficial.
- Validado com `check:js`, `audit:static`, `test:ficha`, `test:mesa`, `perf:mesa`, `build:pages`, `wrangler deploy --dry-run`, `git fsck --no-dangling` e `git diff --check`.
- Deploy operacional confirmado: Pages em `built`, API `/api/health` em HTTP 200 e Worker `armagedon-api` publicado na version ID `fb0548da-a975-4804-bc54-1b740938d31d`.

## 2026-05-05 - Mesa Canvas/Worker

- Palco da Mesa ganhou renderer Canvas/Worker com fallback Canvas principal e DOM legado por flag local.
- Tokens deixaram de depender de cards DOM no palco ativo, reduzindo pintura e custo de layout durante drag.
- Cards/tokens do palco foram estabilizados para manter o mesmo tamanho ao selecionar, entrar em tela cheia e voltar ao modo normal.
- Texto longo em tokens, roster e inspetor passou a quebrar/truncar sem sobrepor outros elementos.
- Drag recebeu polimento extra: fundo do palco cacheado, patches leves `move-token` para o Worker e pausa do brilho do cursor durante movimento.
- Drag em Canvas usa hit test por coordenadas, `requestAnimationFrame`, cache de imagens e persistencia completa apenas ao soltar.
- Realtime recebeu deltas internos `mesa:token:*`, `mesa:scene:clear` e `mesa:batch` para reduzir payload em movimento.
- Durable Object continua coordenando presenca e WebSocket; D1 permanece fonte duravel da cena completa.
- Tooling gratuito adicionado: `npm run check:js`, `audit:static`, `build:pages`, `test:mesa` e `perf:mesa`.
- Validado com Playwright funcional/performance e `wrangler deploy --dry-run`.

## 2026-05-05 - Otimizacao Leve Da Mesa

- Mesa manteve visual dark atual, mas reduziu custo interno de render.
- `scheduleMesaRender()` passou a agrupar renders por frame e por area.
- Palco passou a atualizar tokens incrementalmente por `Map<tokenId, element>`.
- Drag atualiza posicao no elemento durante movimento e salva cena apenas ao soltar.
- Dedupe por assinatura estavel evita `PUT /api/mesa/scene` e `mesa:scene` redundantes.
- Roster em cache evita `AUTH.refreshDirectory()` em todo broadcast quando as `characterKey` ja sao conhecidas.
- CSS recebeu containment seguro e `will-change` apenas durante drag.

## 2026-05-05 - Correcao De Sessao Da Mesa

- Corrigido `auth.js` para expor `window.AUTH = AUTH`.
- Causa: Mesa dependia de `window.AUTH`; sem a ponte global podia ficar em `Convidado`/`0` apesar da API e realtime estarem publicados.
- Cache bust de `auth.js` atualizado nos quatro HTMLs.
- Simulacao com sessao real do mestre validou renderizacao de Mestre, 5 tokens e roster carregado.

## 2026-05-04 - Realtime Da Mesa

- Durable Object `MesaRealtimeRoom` criado para WebSocket da Mesa.
- `PUT /api/mesa/scene` passou a salvar no D1 e transmitir `mesa:scene`.
- Frontend trocou Socket.IO antigo por WebSocket nativo.
- Mestre pode limpar a cena e adicionar tokens existentes pelo roster.
- Worker publicado com version ID `2cab1568-cc32-4a79-81d0-07851eac7a4a`.
- Validado: duas conexoes WebSocket receberam `mesa:ready`; broadcast `mesa:scene` chegou com 5 tokens.

## 2026-05-01 - Deploy Visual e Performance

- fundo animado removido do carregamento principal
- fundo preto estatico consolidado
- cursor com brilho carmesim adicionado
- ficha recebeu polimento visual e responsivo
- GitHub Pages corrigido para `build_type: workflow`
- deploy publicado na `main`
- MP4s e `/assets/logo-rpg-armagedon.png` removidos do pacote publicado

Commit:

```text
0c59efd13910681472aec0153ee43d1ee04c3483
```

## 2026-04-30 - Workspace Oficial

- `rpg-campaign-git-sync` consolidado como checkout oficial
- pasta antiga `rpg-campaign` excluida
- regra de atualizar `.md` reforcada

## 2026-04-30 - Revisao Funcional

- varredura estatica de JS e HTML
- correcoes em normalizacao de habilidades no Worker
- correcoes em progressao local de Essencia da Alma
- pendencia identificada no backend Express legado para rota de Essencia da Alma
