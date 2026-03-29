# Deploy Gratuito do Armagedon

Este roteiro usa:

- frontend: GitHub Pages
- backend Node.js: Koyeb
- banco PostgreSQL: Neon

Essa combinacao exige pouco retrabalho no projeto atual.

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
5. Troque o final para apontar para o banco `armagedon`, se necessario.

Exemplo esperado:

```text
postgresql://usuario:senha@host/armagedon?sslmode=require
```

Observacao:

- em producao, use `sslmode=require`
- no Neon, o `DATABASE_SSL` do projeto deve ficar `true`

## 3. Criar as tabelas no banco publicado

No seu computador, rode o schema do projeto usando a URL do Neon:

```powershell
$env:PGPASSWORD="SUA_SENHA_DO_NEON"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgresql://USUARIO:SENHA@HOST/armagedon?sslmode=require" -f ".\server\sql\schema.sql"
```

Se preferir, substitua a string inteira direto no comando e nao use `PGPASSWORD`.

## 4. Publicar o backend no Koyeb

1. Crie uma conta no Koyeb.
2. Clique para criar um novo app a partir do GitHub.
3. Escolha este repositorio.
4. Defina a raiz do servico como:

```text
server
```

5. Selecione deploy por Node.js ou por Dockerfile.
6. Defina estas variaveis:

```text
PORT=4000
DATABASE_URL=postgresql://USUARIO:SENHA@HOST/armagedon?sslmode=require
DATABASE_SSL=true
JWT_SECRET=UMA_CHAVE_BEM_GRANDE_E_UNICA
CORS_ORIGIN=https://SEU-USUARIO.github.io
MASTER_BOOTSTRAP_USERNAME=mestre
MASTER_BOOTSTRAP_PASSWORD=SUA_NOVA_SENHA_DO_MESTRE
PASSWORD_SALT_BYTES=16
PASSWORD_KEYLEN=64
PASSWORD_SCRYPT_COST=16384
```

Se voce for usar dominio proprio no frontend depois, inclua tambem:

```text
https://www.seudominio.com
```

em `CORS_ORIGIN`, separado por virgula.

## 5. Apontar o frontend para a API publicada

Edite `js/runtime-config.js` e troque:

```js
apiBaseUrl: "http://localhost:4000/api"
```

por:

```js
apiBaseUrl: "https://SEU-BACKEND.koyeb.app/api"
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

Quando o GitHub Pages te entregar a URL final, volte no Koyeb e ajuste `CORS_ORIGIN` com a URL real do site.

Se voce usar:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO
```

entao essa URL precisa estar autorizada no backend.

## 8. Teste final

Teste em producao:

1. login do mestre
2. criacao de jogador
3. login do jogador
4. salvar ficha
5. regras
6. troca de memoria
7. troca de item
8. atualizacao entre duas abas

## 9. Seguranca minima

Antes de usar com outras pessoas:

- troque a senha padrao do mestre
- gere um `JWT_SECRET` novo
- nao publique `server/.env`
- faca backup regular do banco
