# Armagedon

Plano de otimizacao implementado localmente: [entregas, medidas e reversao](docs/OTIMIZACAO-ENTREGAS.md). Menos leituras repetidas, snapshot de reconexao direcionado e animacao sem renderizar toda a Mesa por quadro. Pipeline unico e corte de avatares estaticos preparados, ainda sem ativacao/publicacao externa. Originais R2 recuperados e preservados; nenhum objeto excluido. Estado efetivamente publicado continua no bloco abaixo.

Validacao: `npm run test:optimization`, `npm run test:mesa:rules`, `npm run test:build` e `npm run test:mesa:worker:local`. Variante sem R2: `node tools/run-local-worker-tests.cjs --static`. Build completo: `npm run build`. Medicao: `npm run bench:optimization -- --artifact --label=optimized` (comparacao com `--ref=44400f6`). Recuperacao e atualizacao manual de avatares descritas no relatorio; pastas `local-backups/` privadas nunca entram no pacote.

Auditoria atual de recursos que podem gerar cobranca: [docs/CUSTOS-ATUAIS.md](docs/CUSTOS-ATUAIS.md). Ajuste de suavidade da animacao preparado localmente, preservando velocidade e duracao; ainda nao publicado. Detalhes de validacao em DEV_STATUS.md.

## Publicacao atual — 2026-10-29

Mesa local do commit `92069c4` publicada no [Cloudflare Pages](https://armagedon-rpg.pages.dev), com Worker correspondente e painel "Cenas neste computador" removido. Salvamento automatico local, confirmacao de movimentos e bloqueio de novos uploads de mapas R2 ativos no codigo servido. Dois testes publicos e hashes dos arquivos principais conferidos. Registros abaixo de implementacao "ainda local" sao historicos; resultados completos em DEV_STATUS.md. Nenhum plano ou servico pago ativado.

Espelho GitHub Pages tambem atualizado: CI `40941018013` aprovada, dois testes publicos e arquivos minificados conferidos no destino.

Atualizacao de interface em 2026-10-29: a pedido do Tiago, o painel "Cenas neste computador" e os botoes de backup/copia foram retirados dos ajustes. Salvamento local automatico e otimizacoes continuam ativos; as referencias aos botoes abaixo descrevem a implementacao anterior. Alteracao ainda local, sem publicacao.

## Mesa local preparada, ainda sem publicacao — 2026-10-29

Cenas passam a ser salvas automaticamente no navegador do mestre, com exportacao/importacao JSON e imagens separadas. Ajustes do mapa incluem os botoes de backup e copia explicita das cenas antigas do servidor. Movimentos de jogadores sao confirmados e salvos pelo mestre antes da animacao compartilhada; ele precisa manter a Mesa aberta. Novos uploads e exclusoes de mapas no R2 estao bloqueados. Originais locais e arquivos remotos existentes preservados.

Login, fichas, avatares e relay WebSocket continuam usando Cloudflare; esta mudanca reduz dependencia e operacoes de cenas, sem garantir custo zero da conta. Nao limpar dados do navegador sem exportar cenas e conferir mapas originais. Procedimento, limites e auditoria em [docs/MESA-LOCAL-AUDITORIA.md](docs/MESA-LOCAL-AUDITORIA.md). `npm run test:mesa:local` valida armazenamento/backup e falha de mapas; `npm run test:mesa:worker:local` valida o fluxo conectado em ambiente descartavel. Sem commit ou deploy desta etapa.

## Correcao de compatibilidade e recuperacao da interface — 2026-10-29

Integradas as melhorias de outubro de `origin/main` com a remocao de visao dinamica preservada. Biblioteca de mapas usa schema local v4: mapas, catalogo e preferencias existentes permanecem; nao e necessario apagar dados do navegador. Calibracao da grade, moldes, percursos, decoracoes e melhorias de portal/teclado recuperados. `tests/mesa-upgrade.spec.cjs` cobre bancos v3/v4 e recarga dos controles do mestre. Resultado de publicacao e validacoes em `DEV_STATUS.md`.

Portal estatico para campanha de RPG com home, fichas, mesa virtual, regras, NPCs, monstros, memorias, inventario e API publicada em Cloudflare Workers + D1.

## Regra Obrigatoria de Documentacao

Sempre que qualquer pessoa ou agente alterar o site, tambem deve atualizar os arquivos `.md` relacionados.

No minimo:

- atualize `DEV_STATUS.md` quando mudar comportamento, arquitetura, arquivos principais ou pendencias
- atualize `SYSTEM_RULES.md` quando a mudanca tocar regra de gameplay, permissao ou persistencia
- atualize `VISUAL_RULES.md` quando a mudanca criar ou consolidar decisao visual
- atualize `cloudflare/README.md` quando a mudanca tocar Worker, D1, rotas ou deploy Cloudflare
- atualize `DEPLOY_FREE.md` quando a mudanca alterar publicacao, workflow ou arquivos enviados

Cada atualizacao deve registrar: o que mudou, quais arquivos foram afetados, como validar e quais pendencias continuam abertas. Esta regra existe para reduzir contexto em conversas futuras.

## Pasta Oficial de Trabalho

Desde 2026-10-29, os fontes ficam fora do OneDrive:

```text
C:\Users\Usuario\Projects\Armagedom
```

A pasta Armagedom na Area de Trabalho contem apenas o atalho Abrir projeto. Abra a pasta dos fontes como workspace no editor/Codex para trabalhar nela diretamente. A base recuperada esta consolidada na branch `codex/recuperacao-local`, com os tres commits de outubro de `origin/main` integrados e visao dinamica removida.

## Ambiente de Desenvolvimento Validado — 2026-10-29

Base integrada corrigida publicada em `https://armagedon-rpg.pages.dev` e no espelho GitHub Pages em 2026-10-29, com pacote minificado e Worker atualizado (codigo/CI `39cf881`, em main). Echos incluido no build, dados locais v3/v4 preservados e controles do mestre restaurados. CI e verificacoes publicas aprovadas; bundles dos dois destinos identicos ao pacote validado. Detalhes, versoes e limites em `DEV_STATUS.md`.

Node 24.22.0, npm 11.19.1, Playwright/Chromium e Wrangler 4.154.0 conferidos. Dependencias instaladas e auditoria npm sem vulnerabilidades. Hooks locais configurados em `.githooks`.

Na pasta oficial:

```powershell
npm run check:js
npm run audit:static
npm run audit:pendencias
node test-worker.mjs
npm run test:ficha
npm run test:mesa
npm run test:mesa:audit
npm run test:controles
npm run perf:mesa
npm run test:mesa:worker:local
npm run test:build
npm run build
npx wrangler deploy --dry-run --config cloudflare/wrangler.toml
python -m http.server 8000 --bind 127.0.0.1
```

Abra http://127.0.0.1:8000. O teste `test:mesa:worker:local` cria D1 em uma pasta temporaria, gera segredos e contas descartaveis, inicia Worker e servidor estatico locais e executa tres testes reais de persistencia, permissoes e realtime. Nao usa o D1 remoto nem credenciais de producao; encerra os servidores ao terminar. O estado de teste fica no diretorio temporario do Windows, separado do banco de desenvolvimento.

No Windows, os comandos npm dos testes online ja usam `-ExecutionPolicy Bypass` apenas no processo. Para executar diretamente os scripts PowerShell de contexto, use o mesmo parametro; nao e necessario mudar a politica global.

As credenciais do smoke autenticado de producao ainda nao foram cadastradas nesta maquina. O cadastro e feito por `npm run test:online:setup`, em cofre DPAPI. Resultados e limites desta verificacao estao no topo de `DEV_STATUS.md`.

## Leitura Rapida Para Reduzir Contexto

Para entender o projeto sem reler historico de conversa:

- `docs/obsidian/00-INICIO.md`: ponto de entrada recomendado para Obsidian e Codex
- `docs/obsidian/01-CONTEXTO-ATUAL.md`: resumo compacto do estado atual
- `docs/obsidian/03-DECISOES.md`: decisoes consolidadas para evitar retrabalho
- `README.md`: visao geral e mapa de arquivos
- `DEV_STATUS.md`: estado atual, ultimas mudancas, validacoes e proximas frentes
- `SYSTEM_RULES.md`: regras funcionais que nao devem mudar sem autorizacao
- `VISUAL_RULES.md`: padroes visuais consolidados
- `cloudflare/README.md`: API ativa em Workers + D1
- `DEPLOY_FREE.md`: roteiro de publicacao gratuita e observacoes de deploy

O diretorio `docs/obsidian/` pode ser aberto como vault no Obsidian. Ele deve guardar contexto curto, decisoes e pendencias para reduzir custo de tokens em sessoes futuras.

### Automacao do contexto Obsidian

Para atualizar o snapshot do projeto antes de uma sessao longa, rode na raiz do repositorio:

```powershell
.\tools\update-obsidian-context.ps1
```

O comando gera `docs/obsidian/10-SNAPSHOT-AUTOMATICO.md` com branch atual, ultimo commit, alteracoes locais, paginas principais, estrutura de raiz e maiores arquivos locais. Essa nota serve como contexto rapido para Obsidian e Codex, sem exigir varredura completa do repositorio a cada conversa.

Para garantir que o Obsidian seja alimentado antes de cada commit neste checkout, os hooks versionados devem estar ativos:

```powershell
.\tools\install-obsidian-hooks.ps1
```

Esse instalador configura `core.hooksPath` para `.githooks`. A partir disso, `.githooks/pre-commit` roda `tools/update-obsidian-context.ps1` a cada commit. Desde 2026-08-21 a nota gerada **nao e versionada** (esta no `.gitignore`): ela carimba o commit ANTERIOR, entao nunca cabia dentro do commit que a regenera e deixava o repositorio sujo depois de cada commit. Quem clonar o repositorio gera a sua rodando o script.

Regra operacional: toda etapa que alterar arquivos deve terminar com o snapshot do Obsidian atualizado. Se houver commit, o hook faz isso automaticamente. Se a etapa terminar sem commit, rode `.\tools\update-obsidian-context.ps1` antes de encerrar.

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

O backend legado Express/PostgreSQL (`server/`) foi removido do repositorio em 2026-06-12; o historico do git preserva a referencia caso precise ser consultada.

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

- autenticacao por `usuario + senha` criada pelo mestre
- APIs para jogadores, NPCs, monstros, fichas, regras e transferencias
- base para troca de itens e memorias no servidor
- troca de itens entre jogadores ja adicionada no portal atual, com validacao de mochila cheia
- API Cloudflare em `cloudflare/` para o caminho publicado atual
- Mesa com base inicial de cena oficial no D1 (`GET /api/mesa/scene` e `PUT /api/mesa/scene`), mantendo realtime para etapa posterior

## Como prosseguir com banco de dados

O caminho publicado e Cloudflare Workers + D1, documentado em `cloudflare/README.md` (schema em `cloudflare/d1/schema.sql`, aplicado com `npx wrangler d1 execute`).

## Publicacao gratuita recomendada

O stack publicado do projeto:

- frontend: GitHub Pages (workflow em `.github/workflows/pages.yml`)
- API: Cloudflare Workers
- banco: Cloudflare D1
- realtime: Durable Objects
- avatares/mapas: Cloudflare R2

A base esta em `cloudflare/`.

### Antes de publicar

1. Nao exponha segredos no repositorio; use `wrangler secret put` para `JWT_SECRET`, `PASSWORD_PEPPER` e `MASTER_BOOTSTRAP_PASSWORD`.
2. Confirme que `.gitignore` esta ativo.
3. Gere um `JWT_SECRET` proprio em producao.
4. Troque a senha padrao do mestre.

### Frontend

O frontend ja esta pronto para GitHub Pages:

- `.nojekyll` evita processamento desnecessario do Pages
- `js/runtime-config.js` centraliza a URL da API publicada
- `.github/workflows/pages.yml` publica so os arquivos estaticos do portal
- `mesa.html` deve ser publicado junto com `index.html`, `ficha.html` e `regras.html`

A URL da API publicada fica em `js/runtime-config.js`:

```js
apiBaseUrl: "https://armagedon-api.tiagopsm2008.workers.dev/api"
```

Para apontar para outro backend, basta editar esse arquivo. Depois envie o repositorio ao GitHub e publique a raiz do projeto como site estatico.

Se sua branch principal nao se chama `main`, ajuste isso em `.github/workflows/pages.yml`.

### Backend

A API roda em Cloudflare Workers. Deploy a partir de `cloudflare/`:

```powershell
npx wrangler deploy --dry-run --config cloudflare/wrangler.toml
npx wrangler deploy --config cloudflare/wrangler.toml
```

Segredos via `wrangler secret put`: `JWT_SECRET`, `PASSWORD_PEPPER`, `MASTER_BOOTSTRAP_PASSWORD`.

### Banco

Cloudflare D1 (`armagedon`); schema idempotente em `cloudflare/d1/schema.sql`, aplicado com `npx wrangler d1 execute armagedon --remote --file cloudflare/d1/schema.sql`.

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
- Mesa oficial publicada no Pages; roster e status usam as fichas quando a API esta ativa
- posicao/visibilidade dos tokens da Mesa ainda ficam locais ate a etapa realtime com Durable Objects
- realtime via Socket.IO fica desligado por padrao quando a API ativa e Worker
- Vida atual e Integridade atual sao limitadas ao maximo antes de salvar
- jogador pode alterar Integridade atual na propria ficha e na mesa
- transferencias jogador-para-jogador no Worker validam tipo `player` e persistem origem, destino e auditoria em lote D1
- o backend legado Express/PostgreSQL foi removido do repositorio em 2026-06-12 (historico preservado no git)

## Proxima Etapa da Mesa Realtime

A Mesa ja pode ser publicada como pagina estatica oficial. Para virar realtime de verdade, a proxima etapa tecnica e:

1. criar persistencia de cena no D1
2. criar Durable Object por sala/mesa
3. conectar navegadores via WebSocket
4. transmitir movimento/status em tempo real
5. salvar no D1 com debounce para evitar gravacao excessiva
