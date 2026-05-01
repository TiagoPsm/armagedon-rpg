# Decisoes Consolidadas

## Workspace

- `rpg-campaign-git-sync` e a pasta oficial.
- Toda alteracao, validacao, commit, push e deploy deve acontecer nesse checkout.

## Documentacao

- Mudancas relevantes precisam atualizar `.md`.
- `DEV_STATUS.md` registra log de etapas.
- `VISUAL_RULES.md` registra padroes visuais.
- `DEPLOY_FREE.md` registra regras de publicacao.
- `docs/obsidian/` registra contexto resumido para reduzir tokens.

## Frontend Sem Build

- Manter HTML/CSS/JS puros.
- Evitar introduzir bundler sem necessidade clara.
- Preservar handlers globais e ordem de scripts.

## Direcao Visual

- Preservar dark fantasy.
- Fundo principal preto estatico.
- Vermelho carmesim como acento.
- Evitar animacoes decorativas continuas no fundo.
- Brilho do cursor permitido se for sutil e respeitar `prefers-reduced-motion`.

## Ficha

- A ficha e a referencia visual principal.
- Habilidades e poderes devem abrir minimizados por padrao ao carregar ficha.
- O usuario pode expandir durante a sessao.
- Polimentos visuais devem entrar como camada final quando houver muitos overrides acumulados.

## Deploy

- GitHub Pages deve usar `build_type: workflow`.
- Workflow deve montar `_site` leve.
- MP4s locais podem existir no repositorio, mas nao devem entrar no pacote publicado enquanto nao forem usados.
- `assets/logo-rpg-armagedon.png` nao deve ser fallback de HTML publicado.

## Escopo

- Nao misturar melhorias visuais com regra de gameplay.
- Nao alterar backend ou persistencia sem pedido claro.
- Fazer etapas pequenas, validar e registrar.
