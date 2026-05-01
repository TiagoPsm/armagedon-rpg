# Mesa

## Responsabilidade

`mesa.html` concentra:

- mesa virtual
- roster de personagens, NPCs e monstros
- palco visual
- tokens
- inspetor de token
- edicao local/online de status

## Arquivos Principais

HTML:

- `mesa.html`

CSS:

- `css/mesa-base.css`
- `css/mesa-roster.css`
- `css/mesa-stage.css`
- `css/mesa-inspector.css`
- `css/mesa-layout.css`
- `css/mesa-responsive.css`
- `css/ui.css`

JS:

- `js/mesa-core.js`
- `js/mesa-stage.js`
- `js/mesa-roster.js`
- `js/mesa-inspector.js`
- `js/mesa-storage.js`
- `js/mesa-init.js`

## Contratos

- Preservar ordem dos scripts em `mesa.html`.
- Nao quebrar drag/move de tokens.
- Jogador pode alterar Integridade atual na propria ficha e na mesa.
- Vida atual nao pode passar da Vida maxima.
- Integridade atual continua limitada pela Integridade maxima.

## Visual

- Mesa usa fundo preto estatico, alinhado ao restante do site.
- Elementos de palco devem ficar legiveis sem depender de fundo animado.
- Glow e camadas decorativas nao devem baixar MP4 ou assets grandes.

## Validacao Recomendada

1. Abrir `mesa.html` logado.
2. Confirmar roster carregado.
3. Adicionar token ao palco.
4. Selecionar token e conferir inspetor.
5. Testar alteracao de status permitido.
6. Conferir console sem erros.
