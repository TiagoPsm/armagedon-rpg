# Deploy Gratuito do Armagedon

Este roteiro usa:

- frontend: GitHub Pages
- backend Node.js: Render
- banco PostgreSQL: Neon

Essa combinacao exige pouco retrabalho no projeto atual e evita o fluxo do Koyeb que hoje pede verificacao de cartao.

## 1. Subir o repositorio para o GitHub

1. Crie um repositorio novo no GitHub.
2. Envie esta pasta inteira, exceto o que estiver ignorado em `.gitignore`.
3. Confirme se a branch principal se chama `main`.

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

Segundo a documentacao oficial atual do Render:

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
5. regras
6. troca de memoria
7. troca de item
8. atualizacao entre duas abas

## 10. Seguranca minima

Antes de usar com outras pessoas:

- troque a senha padrao do mestre
- gere um `JWT_SECRET` novo
- nao publique `server/.env`
- faca backup regular do banco
