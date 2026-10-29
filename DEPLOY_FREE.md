# Deploy Gratuito do Armagedon

## Publicacao das otimizacoes autorizada — 2026-10-29

Tiago autorizou publicar o conjunto validado. Primeira etapa conserva catalogo enabled:false e binding R2; imagens sao publicadas antes do corte. CI GitHub valida e publica o espelho; Cloudflare continua com envio manual do pacote minificado apos builds automaticos, pois secrets restritos da CI ainda nao foram configurados. Aguardar CI e conferir hashes/health antes de encerrar. Sem contratacao ou exclusao externa. Resultados efetivos ficam no topo de DEV_STATUS.md.

## Pipeline unico preparado, ainda sem ativacao — 2026-10-29

`.github/workflows/pages.yml` executa contratos/testes, build/minificacao uma vez e publica o mesmo `_site` em Cloudflare Pages e GitHub Pages quando `CLOUDFLARE_CI_ENABLED=true`. Configurar somente por secrets da CI: CLOUDFLARE_API_TOKEN com escopo minimo dos recursos existentes e CLOUDFLARE_ACCOUNT_ID. Consulta atual encontrou repositorio e ambiente github-pages sem esses valores. Nao enviar token OAuth local para o workflow, nem contratar recursos. Ate validar a publicacao substituta, manter os builds Cloudflare existentes.

`tools/worker-fingerprint.cjs` compara fontes/configuracao/regras/catalogo ao hash publicado em health; Worker so recebe deploy quando diferir, incluindo recuperacao de run anterior incompleto. Nao aplica migracoes D1. `tools/release-manifest.cjs` registra hashes do pacote minificado; `tools/verify-release.cjs URL` verifica paginas e assets servidos. Depois de run autorizado aprovado nos dois destinos, desativar automacoes duplicadas da Cloudflare e conferir uma alteracao subsequente.

Avatares exigem publicacao em duas etapas: imagens primeiro com catalogo false, verificar ambos os sites, atualizar inventario/recuperacao durante janela sem edicoes, executar prepare-static-avatars --activate, testar e publicar catalogo/Worker/frontend. A ferramenta recusa ativacao se bytes publicados diferirem. Nao remover binding/bucket nesta publicacao. Procedimento e reversao em docs/OTIMIZACAO-ENTREGAS.md. Cada commit/push/deploy continua dependendo da autorizacao do proprietario.

## Publicacao da Mesa local executada — 2026-10-29

Codigo `92069c4` enviado a main. Worker com `--keep-vars`: `e586c3f0-ff98-4ed7-bb1d-466f60e7c4ed`; Cloudflare Pages final minificado: `577e68e0`. Build automatico do Pages concluiu antes do upload manual, preservando como resultado final o pacote minificado conferido por hash. Sem mudanca de planos, schema, bindings ou secrets. Dois testes publicos no destino Cloudflare aprovados. CI/espelho GitHub e fechamento em DEV_STATUS.md.

GitHub Pages atualizado pela CI `40941018013`, concluida com sucesso. Espelho com dois testes publicos aprovados e conteudo dos seis arquivos principais identico ao pacote local. Tags de cache pre-minificacao variam entre Windows/Linux; comparar bytes minificados, nao exigir a mesma query string. Fechamento documental usa skip ci para evitar nova publicacao desnecessaria.

## Publicacao da Mesa local autorizada — 2026-10-29

Tiago autorizou commit/push e publicacao do conjunto local validado, incluindo remocao do painel de backup. Publicar Worker com `--keep-vars` e pacote minificado `_site` no Pages existente; acompanhar CI GitHub Pages e builds automaticos. Nao criar infraestrutura nem mudar plano, schema ou segredos. Evidencias finais ficam no topo de DEV_STATUS.md.

## Preparacao local de cenas e mapas — 2026-10-29

Workflow inclui testes de armazenamento/backup local e de falha de mapas no artefato minificado. `mesa.html` inclui `mesa-local-store.js` e `mesa-local-session.js` antes do bootstrap; o build deriva essa ordem do HTML. Cache das seis paginas atualizado. Padrao `mesaLocalScenes:true` exige frontend e Worker com o protocolo anfitriao publicados juntos. Esta etapa prepara e testa o pacote; nenhum commit, push, deploy, assinatura ou recurso pago foi criado. A regra de workspace atual esta no README; caminhos antigos abaixo sao historicos. Plano Cloudflare nao confirmado por API (403); detalhes em `docs/MESA-LOCAL-AUDITORIA.md`.

## Publicacao corretiva integrada — 2026-10-29

A publicacao direta anterior foi substituida pela integracao dos tres commits remotos com a recuperacao local, mantendo a visao dinamica removida. Nao publicar novamente uma base anterior sem comparar schema local e funcionalidades ja disponiveis. Executar `npm run test:mesa:rules`, `npm run test:build`, regressao da interface e `tests/mesa-upgrade.spec.cjs` no pacote minificado. Build continua `npm run build`, incluindo Echos. Enviar Worker e frontend juntos, com dry-run e `--keep-vars`; nao aplicar schema D1 nem rotacionar segredos. A integracao permite atualizar `main` por fast-forward sem reescrever historico; conferir os builds automaticos e comparar os bundles servidos com `_site`.

## Publicacao direta da base recuperada — 2026-10-29

Workspace oficial atual: `C:\Users\Usuario\Projects\Armagedom`. Tiago autorizou publicar a base recuperada no Cloudflare Pages `armagedon-rpg` e Worker `armagedon-api`. Gerar o pacote com `npm run build` e enviar `_site` por `wrangler pages deploy _site --project-name armagedon-rpg --branch main`; o argumento de branch seleciona o ambiente de producao do Pages, sem alterar a branch Git. Worker exige dry-run antes e `--keep-vars` no deploy. Nao aplicar schema, alterar banco ou rotacionar secrets nesta publicacao. O espelho GitHub Pages e os tres commits de `origin/main` ficam fora desta publicacao direta. Versoes e verificacoes em `DEV_STATUS.md` e `cloudflare/README.md`.

## Regra Obrigatoria de Documentacao

Sempre que qualquer etapa de deploy, workflow, dominio, API publicada ou lista de arquivos publicados mudar, atualize este arquivo e `DEV_STATUS.md`. Se a mudanca for em Cloudflare, atualize tambem `cloudflare/README.md`.

## Pasta Oficial Para Deploy

Execute commits, pushes e validacoes de publicacao somente a partir de:

```text
C:\Users\Usuario\Projects\Armagedom
```

A copia no OneDrive e os caminhos antigos `rpg-campaign`/`rpg-campaign-git-sync` sao historicos; nao sao a pasta oficial atual.

Antes de qualquer deploy autorizado, confirme o caminho atual acima e o estado do Git. Nao publicar automaticamente ao executar a validacao local.

Este arquivo existe para evitar depender do historico de conversa na hora de publicar.

## Status Atual

O caminho publicado do projeto e:

- frontend: Cloudflare Pages e espelho GitHub Pages
- API: Cloudflare Workers
- banco: Cloudflare D1
- realtime: Durable Objects
- avatares e mapas legados: R2 enquanto o corte estatico preparado nao for publicado; novos mapas ficam na pasta/cache do mestre e sao transmitidos sem upload remoto

O roteiro legado com Render + Neon (backend Express/PostgreSQL em `server/`) foi
removido junto com a pasta `server/` em 2026-06-12; o historico do git preserva
a versao antiga deste arquivo caso precise ser consultada.

## 1. Subir o repositorio para o GitHub

1. Crie um repositorio novo no GitHub.
2. Envie esta pasta inteira, exceto o que estiver ignorado em `.gitignore`.
3. Confirme se a branch principal se chama `main`.
4. Garanta que os arquivos `.md` atualizados tambem sejam enviados.

Se a branch principal tiver outro nome, ajuste `.github/workflows/pages.yml`.

## 2. Publicar a API no Cloudflare (Workers + D1)

Na raiz do repositorio:

```powershell
# aplicar o schema (idempotente) no D1 remoto
npx wrangler d1 execute armagedon --remote --file cloudflare/d1/schema.sql

# validar e publicar o Worker
npx wrangler deploy --dry-run --config cloudflare/wrangler.toml
npx wrangler deploy --config cloudflare/wrangler.toml
```

Segredos exigidos (uma unica vez, via `npx wrangler secret put <NOME> --config cloudflare/wrangler.toml`):

```text
JWT_SECRET
PASSWORD_PEPPER
MASTER_BOOTSTRAP_PASSWORD
```

Detalhes completos em `cloudflare/README.md`.

## 3. Apontar o frontend para a API publicada

A URL fica centralizada em `js/runtime-config.js`:

```js
apiBaseUrl: "https://armagedon-api.tiagopsm2008.workers.dev/api"
```

Se o Worker mudar de nome/conta, ajuste apenas esse arquivo e envie ao GitHub.

## 4. Publicar o frontend no GitHub Pages

1. No repositorio do GitHub, abra `Settings > Pages`.
2. Confirme que GitHub Pages esta ativo.
3. O workflow em `.github/workflows/pages.yml` vai publicar o site automaticamente.
4. O workflow deve copiar `mesa.html`, alem de `index.html`, `ficha.html` e `regras.html`.

Quando terminar, o frontend deve ficar em algo como:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/
```

## 5. Ajustar o CORS do Worker

O CORS usa allowlist fixa em `cloudflare/src/auth.js` (`ALLOWED_ORIGINS`):
github.io, `armagedon-rpg.pages.dev` + previews e `localhost`. Se o site ganhar
um dominio novo, adicione a origem na allowlist e re-publique o Worker.

## 6. Teste final

Teste em producao:

1. login do mestre
2. criacao de jogador
3. login do jogador
4. salvar ficha
5. editar Vida atual sem ultrapassar Vida maxima
6. editar Integridade atual do jogador na ficha
7. editar Vida/Integridade atual do jogador na Mesa
8. regras
9. troca de memoria
10. troca de item
11. atualizacao entre duas abas

## 7. Seguranca minima

Antes de usar com outras pessoas:

- troque a senha padrao do mestre
- gere um `JWT_SECRET` novo (via `wrangler secret put`)
- nao exponha segredos no repositorio (`.dev.vars` local fica fora do git)
- faca backup regular do banco (export do D1 via `wrangler d1 export`)

## Arquivos Que Normalmente Precisam Ir no Deploy

- `index.html`
- `ficha.html`
- `mesa.html`
- `regras.html`
- `css/`
- `js/`
- imagens usadas pelas paginas
- `.nojekyll`
- `.github/workflows/pages.yml`, se o workflow mudou
- `.md` alterados, para manter o contexto do projeto atualizado

Observacao de performance:

- nao publique a pasta `assets/` inteira quando ela contiver arquivos grandes que nao estao em uso nas paginas
- o workflow do GitHub Pages deve copiar somente os assets realmente usados pelo HTML/CSS publicado
- se um asset dentro de `assets/` passar a ser usado no futuro, adicione a copia dele de forma explicita no workflow em vez de restaurar uma copia ampla da pasta inteira
- o workflow do GitHub Pages deve usar actions compativeis com Node 24 (`checkout@v6`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5` ou superiores)
- ao usar `upload-pages-artifact@v5`, manter `include-hidden-files: true` para publicar `_site/.nojekyll`

## Observacao Sobre Realtime

Realtime esta implementado com Durable Objects e WebSocket. O modulo de mapa VTT
usa WebRTC P2P com fallback WS chunked e R2 como ultimo recurso.

## Deploy do Modulo de Mapa VTT (Fase 3)

O modulo de mapa precisa de um bucket R2 e de um novo deploy do Worker.
Execute os comandos abaixo uma unica vez, na pasta `cloudflare/`.

### 1. Criar o bucket R2

```powershell
cd cloudflare
npx wrangler r2 bucket create armagedom-maps
```

Confirme que a saida mostra `Created bucket 'armagedom-maps'`.

### 2. Re-deployar o Worker

```powershell
npx wrangler deploy
```

O Worker publicado expoe tres novas rotas:

| Metodo   | Rota                       | Descricao                          |
|----------|----------------------------|------------------------------------|
| POST     | /api/mesa/map              | Upload mapa comprimido (so mestre) |
| GET      | /api/mesa/map/:r2Key       | Servir imagem do bucket            |
| DELETE   | /api/mesa/map/:r2Key       | Remover mapa ao encerrar sessao    |

### 3. Checklist pos-deploy

- [ ] Abrir mesa.html como mestre
- [ ] Clicar "Abrir mapa" e escolher uma imagem do disco
- [ ] Confirmar que o mapa aparece no palco imediatamente (Fase 1)
- [ ] Abrir mesa.html em outra aba como jogador
- [ ] Confirmar que o mapa chega ao jogador automaticamente
- [ ] No console do mestre, verificar o caminho usado: P2P > WS > R2
- [ ] Fechar a aba do jogador e confirmar que o mapa some do R2
  (verificar em `wrangler r2 object list armagedom-maps`)

### Notas de Seguranca

- O bucket R2 nao tem dominio publico configurado: imagens sao servidas
  exclusivamente pelo proprio Worker com verificacao de autorizacao.
- A chave R2 inclui o username do mestre como prefixo (`maps/<user>/<id>.webp`),
  impedindo que um mestre apague mapas de outro.
- O fallback R2 so e acionado automaticamente se nenhum jogador confirmar
  recebimento em 30 segundos (P2P e WS chunked falharam).

## Arquivos Alterados no Modulo de Mapa

Incluir obrigatoriamente no proximo commit/deploy:

- `js/mesa-map.js`        — modulo completo (Fases 1, 2 e 3)
- `js/mesa-core.js`       — chamada a initMesaMap() em initMesaPage()
- `css/mesa-map.css`      — estilos da camada de mapa
- `mesa.html`             — camada de mapa no stage + controles
- `cloudflare/wrangler.toml`        — binding R2
- `cloudflare/src/index.js`         — endpoints R2
- `cloudflare/src/mesa-realtime.js` — relay de sinais WebRTC
