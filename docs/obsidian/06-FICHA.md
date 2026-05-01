# Ficha

## Responsabilidade

`ficha.html` concentra:

- painel do mestre
- fichas de jogadores
- NPCs
- monstros
- inventario
- memorias
- Essencias da Alma
- rolagem de dados

## Arquivos Principais

HTML:

- `ficha.html`

CSS:

- `css/ficha-base.css`
- `css/ficha-layout.css`
- `css/ficha-inventory-memory.css`
- `css/ficha-master.css`
- `css/ficha-dice-soul.css`
- `css/ficha-responsive.css`
- `css/ui.css`

JS:

- `js/ficha-core.js`
- `js/ficha-master.js`
- `js/ficha-sheet.js`
- `js/ficha-inventory.js`
- `js/ficha-memories.js`
- `js/ficha-soul.js`
- `js/ficha-dice.js`
- `js/ficha-habs.js`
- `js/ficha-init.js`

## Contratos

- Preservar ordem dos scripts em `ficha.html`.
- Preservar funcoes globais chamadas por `onclick`, `oninput` e outros handlers inline.
- Habilidades/poderes devem abrir minimizados ao carregar ficha.
- Jogador e mestre devem manter acesso aos dados corretos.
- Nao alterar regras de gameplay junto com polimento visual.

## Visual

- Ficha e referencia visual principal.
- Fundo preto estatico.
- Cards com contraste alto e acento carmesim.
- Inventario deve manter slots legiveis no desktop e mobile.
- Modal de dados deve abrir sem quebrar layout.

## Validacao Recomendada

1. Login como mestre.
2. Abrir painel de fichas.
3. Abrir uma ficha de jogador.
4. Conferir recursos, atributos, habilidades, memorias e inventario.
5. Abrir rolagem de dados e executar uma rolagem.
6. Conferir console sem erros.
7. Repetir em viewport estreito quando houver mudanca visual.
