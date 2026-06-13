# Deploy Gratuito do Armagedon

## Regra Obrigatoria de Documentacao

Sempre que qualquer etapa de deploy, workflow, dominio, API publicada ou lista de arquivos publicados mudar, atualize este arquivo e `DEV_STATUS.md`. Se a mudanca for em Cloudflare, atualize tambem `cloudflare/README.md`.

## Pasta Oficial Para Deploy

Execute commits, pushes e validacoes de publicacao somente a partir de:

```text
C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync
```

A pasta `rpg-campaign` ficou como copia antiga/local e nao deve ser usada para publicar no GitHub Pages.

Antes de qualquer deploy, confirme que o terminal ou a sessao do Codex esta em `rpg-campaign-git-sync`. Se uma conversa antiga ainda estiver vinculada a `rpg-campaign`, crie/abra um novo chat no projeto `rpg-campaign-git-sync` antes de continuar.

Este arquivo existe para evitar depender do historico de conversa na hora de publicar.

## Status Atual

O caminho publicado do projeto e:

- frontend: GitHub Pages
- API: Cloudflare Workers
- banco: Cloudflare D1
- realtime: Durable Objects
- avatares/mapas: Cloudflare R2

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
