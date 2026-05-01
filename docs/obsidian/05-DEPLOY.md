# Deploy

## Publicacao Atual

- Repositorio: `TiagoPsm/armagedon-rpg`
- Branch: `main`
- Site: `https://tiagopsm.github.io/armagedon-rpg/`
- Fonte do Pages: GitHub Actions (`build_type: workflow`)
- Workflow: `.github/workflows/pages.yml`

## Arquivos Publicados

O workflow prepara `_site` com:

- `index.html`
- `ficha.html`
- `mesa.html`
- `regras.html`
- `.nojekyll`
- logos e icones usados
- `css/`
- `js/`
- `data/` quando existir

Nao publicar:

- `assets/` inteiro
- MP4s nao usados
- backend `server/`
- arquivos de ambiente

## Validacao Antes de Deploy

Rodar:

```powershell
node --check js\ui.js
git diff --check
```

Para varredura completa, usar:

- `node --check` em todos os `.js`
- checar referencias locais em HTML/CSS
- checar IDs duplicados
- abrir as quatro paginas localmente
- validar console sem erros

## Validacao Apos Deploy

Confirmar:

- GitHub Actions terminou com sucesso
- paginas principais retornam HTTP 200
- `ficha.html` carrega cache bust atual da ficha
- paginas carregam `css/ui.css` e `js/ui.js` atuais
- URLs antigas de MP4 e `/assets/logo-rpg-armagedon.png` retornam 404

## Ultimo Deploy Confirmado

- Commit: `0c59efd13910681472aec0153ee43d1ee04c3483`
- Mensagem: `Otimiza visual e publicacao do site`
- Resultado: sucesso
