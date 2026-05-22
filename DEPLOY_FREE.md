# Deploy Gratuito do Armagedon

## Regra Obrigatoria de Documentacao

Sempre que qualquer etapa de deploy, workflow, dominio, API publicada ou lista de arquivos publicados mudar, atualize este arquivo e `DEV_STATUS.md`. Se a mudanca for em Cloudflare, atualize tambem `cloudflare/README.md`. Se for no backend Express/PostgreSQL legado, atualize `server/README.md`.

## Pasta Oficial Para Deploy

Execute commits, pushes e validacoes de publicacao somente a partir de:

```text
C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync
```

A pasta `rpg-campaign` ficou como copia antiga/local e nao deve ser usada para publicar no GitHub Pages.

Antes de qualquer deploy, confirme que o terminal ou a sessao do Codex esta em `rpg-campaign-git-sync`. Se uma conversa antiga ainda estiver vinculada a `rpg-campaign`, crie/abra um novo chat no projeto `rpg-campaign-git-sync` antes de continuar.

Este arquivo existe para evitar depender do historico de conversa na hora de publicar.

## Status Atual

O caminho publicado principal do projeto e:

- frontend estatico
- API em Cloudflare Workers
- banco em Cloudflare D1

O roteiro abaixo com GitHub Pages + Render + Neon continua util como alternativa gratuita/legada para o backend Express/PostgreSQL em `server/`.

Este roteiro usa:

- frontend: GitHub Pages
- backend Node.js: Render
- banco PostgreSQL: Neon

Essa combinacao exige pouco retrabalho no projeto atual e evita o fluxo do Koyeb que hoje pede verificacao de cartao.

## 1. Subir o repositorio para o GitHub

1. Crie um repositorio novo no GitHub.
2. Envie esta pasta inteira, exceto o que estiver ignorado em `.gitignore`.
3. Confirme se a branch principal se chama `main`.
4. Garanta que os arquivos `.md` atualizados tambem sejam enviados.

Se a branch principal tiver outro nome, ajuste `.github/workflows/pages.yml`.

## 2. Criar o banco no Neon

1. Crie uma conta no Neon.
2. Crie um projeto novo.
3. Abra o modal `Connect`.
4. Copie a `connection string`.
5. Guarde a `connection string` direta e a `connection string` com pooling.

Exemplo esperado:

```text
postgresql://usuario:senha@host/neondb?sslmode=require
```

Observacao:

- em producao, use `sslmode=require`
- no Neon, o `DATABASE_SSL` do projeto deve ficar `true`

## 3. Criar as tabelas no banco publicado

No seu computador, rode o schema do projeto usando a URL direta do Neon:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgresql://USUARIO:SENHA@HOST/neondb?sslmode=require" -f ".\server\sql\schema.sql"
```

Se preferir, substitua a string inteira direto no comando e nao use `PGPASSWORD`.

## 4. Publicar o backend no Render

1. Crie uma conta no Render.
2. Clique em `New +`.
3. Escolha `Blueprint`.
4. Conecte o seu GitHub ao Render.
5. Escolha este repositorio.
6. O Render deve detectar automaticamente o arquivo `render.yaml`.
7. Preencha os segredos pedidos pelo Blueprint:

```text
DATABASE_URL=postgresql://USUARIO:SENHA@HOST/neondb?sslmode=require
JWT_SECRET=UMA_CHAVE_BEM_GRANDE_E_UNICA
CORS_ORIGIN=https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO
MASTER_BOOTSTRAP_PASSWORD=SUA_NOVA_SENHA_DO_MESTRE
```

Se voce for usar dominio proprio no frontend depois, inclua tambem:

```text
https://www.seudominio.com
```

em `CORS_ORIGIN`, separado por virgula.

Observacoes:

- o `render.yaml` ja fixa o plano `free`
- o backend deve usar a string com pooling do Neon
- o Render Free pode dormir depois de 15 minutos sem trafego

## 5. Apontar o frontend para a API publicada

Edite `js/runtime-config.js` e troque:

```js
apiBaseUrl: "http://localhost:4000/api"
```

por:

```js
apiBaseUrl: "https://SEU-BACKEND.onrender.com/api"
```

Depois envie esse ajuste ao GitHub.

## 6. Publicar o frontend no GitHub Pages

1. No repositorio do GitHub, abra `Settings > Pages`.
2. Confirme que GitHub Pages esta ativo.
3. O workflow em `.github/workflows/pages.yml` vai publicar o site automaticamente.
4. O workflow deve copiar `mesa.html`, alem de `index.html`, `ficha.html` e `regras.html`.

Quando terminar, o frontend deve ficar em algo como:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/
```

## 7. Ajustar o CORS do backend

Quando o GitHub Pages te entregar a URL final, volte no Render e ajuste `CORS_ORIGIN` com a URL real do site.

Se voce usar:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO
```

entao essa URL precisa estar autorizada no backend.

## 8. Limites do Render Free

Pontos comuns do plano gratuito do Render que devem ser confirmados antes de publicar:

- web services free entram em spin down apos 15 minutos sem trafego
- o primeiro acesso depois disso pode levar ate cerca de 1 minuto
- mensagens WebSocket tambem contam como atividade

Isso serve para hobby e teste, mas nao e o ideal para uso com exigencia de resposta imediata o tempo todo.

## 9. Teste final

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

## 10. Seguranca minima

Antes de usar com outras pessoas:

- troque a senha padrao do mestre
- gere um `JWT_SECRET` novo
- nao publique `server/.env`
- faca backup regular do banco

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
