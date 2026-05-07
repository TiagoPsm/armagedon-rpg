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
- Em modo API, fichas de jogadores devem ser abertas e salvas pelo `player.key` vindo do diretorio oficial.
- `player.username` continua sendo o dono/identidade de login e nao deve substituir `player.key` quando a API informar uma chave propria.
- O cache `tc_players` deve preservar `key`, `id`, `inventorySlots` e `usedSlots` vindos de `GET /api/directory`.
- Transferencias online de itens e memorias devem enviar `sourceKey`/`targetKey` oficiais; o modo local continua usando `username` como chave do `tc_sheets`.
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
4. Alterar um valor simples e salvar; em modo API, confirmar `PUT /api/characters/:key`, nao `:username`.
5. Transferir item/memoria entre jogadores; em modo API, confirmar destino por `targetKey` oficial.
6. Conferir recursos, atributos, habilidades, memorias e inventario.
7. Abrir rolagem de dados e executar uma rolagem.
8. Conferir console sem erros.
9. Repetir em viewport estreito quando houver mudanca visual.
