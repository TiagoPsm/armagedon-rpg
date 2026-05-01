# Arquitetura

## Visao Geral

O projeto e um site estatico sem bundler. Os HTMLs carregam CSS e JS diretamente por tags `<link>` e `<script>`.

## Frontend

Paginas:

- `index.html`: login, home e painel inicial
- `ficha.html`: mestre, jogadores, NPCs, monstros, inventario, memorias e dados
- `mesa.html`: mesa virtual, palco, tokens e inspetor
- `regras.html`: regras da campanha

Pastas principais:

- `css/`: estilos separados por pagina/dominio
- `js/`: scripts separados por pagina/dominio
- `data/`: dados estaticos auxiliares
- `cloudflare/`: Worker publicado
- `server/`: backend Express/PostgreSQL legado

## API Publicada

- Plataforma: Cloudflare Workers
- Banco: Cloudflare D1
- URL base configurada em `js/runtime-config.js`

## Persistencia

Fonte principal em producao:

- Cloudflare D1 via Worker

Fallback/cache local:

- `localStorage` para sessao
- `localStorage` para cache de fichas e diretorio

## Contratos Importantes

- Nao alterar ordem de scripts em `ficha.html` e `mesa.html` sem validar fluxo completo.
- Funcoes globais usadas por handlers inline fazem parte do contrato atual.
- O frontend nao depende de build; qualquer mudanca deve funcionar como site estatico.
- Backend Express em `server/` e legado; nao assumir que ele representa producao.

## Publicacao

GitHub Pages deve usar GitHub Actions e artifact preparado em `.github/workflows/pages.yml`.

O workflow deve publicar apenas:

- HTMLs principais
- CSS
- JS
- imagens e icones realmente usados
- `data/` quando existir

Nao publicar `assets/` inteiro se houver arquivos grandes nao usados.
