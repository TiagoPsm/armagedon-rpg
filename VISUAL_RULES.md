# VISUAL RULES

Este arquivo define a direcao visual do projeto. Atualizar sempre que uma decisao de design passar a ser padrao.

## Regra Obrigatoria de Documentacao

Sempre que uma alteracao visual consolidar padrao novo, ajustar layout importante, mudar responsividade, trocar paleta, alterar componentes principais ou criar comportamento visual reutilizavel, este arquivo deve ser atualizado na mesma etapa. Tambem atualize `DEV_STATUS.md` quando a mudanca afetar paginas ou arquivos sensiveis.

## Pasta Oficial de Trabalho

Mudancas visuais devem ser feitas no checkout Git oficial:

```text
C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync
```

A pasta antiga `rpg-campaign` nao deve ser usada para editar layout, CSS, HTML ou assets publicados.

## Direcao de Arte

- Estilo principal: dark fantasy
- Referencia de atmosfera: Shadow Slave
- Sensacao desejada:
  - sombria
  - elegante
  - ritualistica
  - densa, mas legivel

## Paleta

Priorizar:

- preto
- cinzas muito escuros
- vermelho escuro
- vinho profundo
- brilho vermelho suave

Evitar como acento principal:

- laranja forte
- amarelo intenso
- cores muito vivas fora do esquema dark

## Prioridades Visuais

1. Organizacao
2. Centralizacao
3. Alinhamento
4. Legibilidade
5. Atmosfera

Se houver conflito entre efeito visual e organizacao, a organizacao vence.

## Regras de Layout

- Cards e caixas devem parecer parte do mesmo sistema
- Nao deixar blocos tortos, soltos ou com larguras inconsistentes sem motivo
- Inputs que pertencem a mesma linha devem compartilhar alinhamento visual
- Titulos de secao devem manter a mesma linguagem grafica
- Botoes de acao precisam ter hierarquia clara:
  - primario
  - secundario
  - destrutivo

## Regras de Centralizacao

- Conteudo interno de cards deve ser centralizado quando o objetivo for leitura rapida
- Linhas superiores e barras de acao devem ficar alinhadas horizontalmente
- Evitar botoes isolados desalinhados em cabecalhos
- Modais devem abrir centralizados e permanecer equilibrados no desktop
- Centralizar conteudo da sidebar = padding horizontal SIMETRICO no bloco (`.vtt-sidebar-block { padding: 1rem 0.9rem }`) + `scrollbar-gutter: auto` na `.vtt-sidebar`. Erros ja cometidos e descartados: (a) `scrollbar-gutter: stable` reserva a barra so na direita e empurra tudo para a esquerda; (b) `stable both-edges` reserva faixa nos DOIS lados mesmo sem rolagem (faixa preta visivel); (c) `padding: 1rem 0` (full-bleed) gruda os cards na borda direita da janela (descentralizado). O simetrico + `auto` deixa as margens iguais quando nao ha rolagem (painel do jogador) e so a barra fina sobra a direita quando ha (inspetor do mestre)
- Pagina full-screen tipo app (Mesa): no ROOT usar `html { overflow: hidden; scrollbar-gutter: auto }`. O `reset.css` tem `html { scrollbar-gutter: stable }` (global, bom para paginas que rolam). Numa pagina `overflow: hidden`, esse `stable` RESERVA ~10px de gutter a direita SEM mostrar barra nenhuma — vira uma FAIXA PRETA do fundo aparecendo, a sidebar nao alcanca a borda e parece deslocada ("nao fecha em cima"). Assinatura no DevTools: `innerWidth === documentElement.clientWidth` (sem barra) MAS o conteudo para ~10px antes da borda. Fix = `scrollbar-gutter: auto` para anular o `stable` herdado. Como `mesa.css` so carrega na Mesa, fica escopado a ela; NAO aplicar global (index/ficha/regras precisam do `stable`)

## Ficha Como Referencia

A ficha e o padrao visual principal do projeto.

Elementos que devem servir de base para as outras paginas:

- superficie escura em camadas
- bordas discretas
- brilho vermelho suave
- tipografia de titulo mais dramatica
- inputs escuros e integrados
- atmosfera de calor e brasa sombria

Arquivos visuais atuais da ficha:

- `css/ficha-base.css`
- `css/ficha-layout.css`
- `css/ficha-master.css`
- `css/ficha-inventory-memory.css`
- `css/ficha-dice-soul.css`
- `css/ficha-responsive.css`

Comportamento visual consolidado:

- habilidades e poderes devem abrir minimizados por padrao sempre que uma ficha for carregada
- o usuario pode expandir cards durante a leitura/edicao da ficha, mas uma nova abertura deve voltar ao estado minimizado
- cores de recurso devem permanecer consistentes entre Ficha e Mesa:
  - Vida usa escala dinamica vermelho-verde por percentual (`hsl` com hue 0 a 120)
  - Integridade usa escala azul (`hsl(204 ...)`)
  - a Mesa nao deve usar amarelo/dourado para Integridade

## Home / Login

- Ja redesenhada para seguir a linguagem da ficha
- Deve continuar parecendo parte do mesmo universo visual
- Nao pode voltar a ter aparencia de formulario generico
- Primeira dobra deve funcionar como poster sombrio do portal
- A area logada deve parecer extensao natural da ficha, nao uma dashboard SaaS generica

## Mouse Glow

- Pode existir brilho reagindo ao mouse
- Deve ser sutil, bonito e funcional
- Nao deve atrapalhar leitura nem esconder conteudo
- Deve atuar como reforco atmosferico, nao como efeito principal
- O brilho do cursor deve usar vermelho carmesim da paleta do site, ficar pequeno e centralizado no ponteiro
- O efeito deve ser desligado em ponteiros grosseiros e em `prefers-reduced-motion: reduce`

## Performance Visual

- Imagens de marca carregadas no HTML devem declarar dimensoes estaveis para evitar salto de layout
- Logos publicados devem ter fallback apenas para arquivos que tambem entram no pacote do site publicado
- A primeira imagem visivel da home pode usar `fetchpriority="high"`; os demais logos devem preferir carregamento leve com `decoding="async"`
- Evitar `prefetch` cruzado entre paginas quando isso antecipar download sem necessidade clara
- Animacoes e transicoes devem respeitar `prefers-reduced-motion`
- Superficies com `backdrop-filter` precisam manter contraste e legibilidade mesmo quando o navegador nao suportar blur
- O fundo principal do site deve ser preto estatico, com brilho vermelho muito sutil e sem animacoes decorativas continuas
- Camadas como orbitas, cinzas, brasas e glow dinamico de pagina devem ficar desligadas por padrao para melhorar fluidez
- Fontes Google: carregar apenas os pesos realmente usados no CSS. Hoje sao
  Cinzel 400/500/600/700, Cinzel Decorative 400/700 e Crimson Text 400/600/700
  (+ italico 400). Antes de adicionar um `font-weight` novo, confirme que o peso
  esta na URL do Google Fonts nas 5 paginas.
- Avatares e mapas trafegam como URL (R2), nunca base64 embutido em respostas de
  listagem — base64 inflava cada carga de pagina (ver `cloudflare/README.md`)

## Ficha

- Ajustes visuais da ficha devem preservar a estrutura existente e entrar como camada final de polimento quando houver overrides acumulados
- Habilidades, poderes, inventario e rolagens devem manter controles claros, foco visivel, espacamento consistente e layout sem texto espremido em mobile
- Botoes compactos da ficha devem manter area clicavel suficiente e nao depender apenas de hover para indicar estado

## Inventario

- Visual compacto
- Grid limpo
- Pouco ruido visual
- Abrir detalhes do item em painel recolhivel ou pop-up, sem expandir o grid de forma descontrolada

## Pop-ups e Modais

- Devem seguir o mesmo estilo dark fantasy da ficha
- Conteudo sempre bem dimensionado
- Nunca deixar textos espremidos ou botoes mal distribuidos
- Preferir composicao simples, clara e premium
- Escala de z-index (em `tokens.css`): `--z-modal: 1000` para dialogos; um
  seletor generico aberto POR CIMA de outro dialogo (ex.: escolher o tipo de
  item dentro do editor de item) usa `--z-modal-top: 1100`. Empate de z-index
  faz o DOM decidir a ordem — sem o token superior o seletor fica clicavel só
  visualmente, mas atras do dialogo que o abriu.
- Botoes que alternam rotulo (ex.: "Minimizar"/"Expandir" no cartao de Lore)
  precisam de largura minima fixa para o cabecalho nao "pular" ao alternar.

## Painel do Mestre

- Deve parecer um painel de controle sombrio e organizado
- Separacao clara entre:
  - jogadores
  - NPCs
  - monstros
  - regras
- Acoes importantes precisam ser faceis de localizar
- Dentro da aba de fichas, o painel do mestre deve usar:
  - hero superior com resumo curto
  - cards amplos e escuros
  - listas com hierarquia clara
  - grade separada entre criacao, diretorio e acesso rapido
  - mesmo peso visual da ficha, sem parecer uma dashboard generica

## Mesa Virtual

- Seletor de camadas tem cores distintas por camada: TOKENS = verde, MESTRE (DM) = roxo (`rgba(150,90,200,...)`), MAPA = dourado. O roxo sinaliza a camada secreta exclusiva do mestre, diferenciando-a das demais sem fugir do dark fantasy
- Quando a camada MESTRE esta ativa, o stage ganha uma borda interna roxa sutil (`box-shadow: inset 0 0 0 2px`) lembrando que o mestre esta na camada secreta; tokens continuam interativos (diferente do modo MAPA, que bloqueia tokens)
- Token na camada secreta aparece SO para o mestre: esmaecido (herda `.is-hidden-master`) + contorno roxo tracejado (`.is-layer-dm`) + pill de estado "Mestre" (em vez de "Oculto"), para distinguir de um token apenas marcado como oculto
- Tracos de desenho da camada secreta aparecem com opacidade menor (0.5 vs 0.88) para o mestre os distinguir dos tracos publicos
- Deve priorizar leitura rapida de tokens, status e selecao
- O palco deve ficar claro, responsivo e sem sobreposicao incoerente
- O token do palco tem UM unico estilo: redondo (minimal) — avatar circular de 88px com borda colorida por tipo (jogador azul, NPC dourado, monstro vermelho) e nome centralizado embaixo. O antigo estilo "card" grande (ficha completa via Canvas renderer) e o seletor "Estilo dos tokens" foram removidos em 2026-06-30. `state.tokenStyle` fica fixo em `"minimal"`
- Tokens do palco devem manter o mesmo tamanho ao selecionar, entrar em tela cheia e voltar ao modo normal
- Nomes, donos, badges, botoes e textos de status devem quebrar linha ou truncar de forma controlada; nunca devem comprimir ou sobrepor outros elementos
- Durante arrasto de token, efeitos globais que competem por pintura, como o brilho do cursor, podem pausar temporariamente para preservar fluidez
- Inspetor lateral deve ser compacto e funcional
- Jogadores veem palco compartilhado, mas nao veem roster de tokens disponiveis para colocar na cena
- Jogadores recebem painel pessoal "Meu personagem" com dados da propria ficha; memorias aparecem em leitura
- O painel lateral do jogador tem duas secoes rotuladas: "Meu Token" (hero + Vida/Integridade atuais editaveis + atalho "Abrir minha ficha completa", sempre visivel) e "Meus Echos" (so renderiza se o jogador tiver Echos)
- Hierarquia do painel do jogador (`css/mesa-roster.css`): titulos de secao (`.player-side-title`) sao label accent em caixa alta com uma regua/hairline `::after`. O cabecalho do bloco na visao do jogador (`#vttRosterBlock.is-player-view`) usa fonte UI (Cinzel, nao a display decorativa — mais legivel em tamanho pequeno) com "Ficha rapida" (kicker) em cima e "Meu personagem" embaixo em UMA linha; o status do token virou so uma bolinha (`.player-stage-dot.is-on/.is-off`: verde no palco, apagada fora) no lugar da antiga badge de texto "Fora da cena" (`.vtt-count-badge.is-status-dot` zera fundo/borda)
- Hero do jogador: foto ~96px e o NOME centralizado verticalmente ao lado da foto (`.player-sheet-copy` com `justify-content:center`, nome em `--fs-xl`). Sem badge "Jogador" no hero (o papel ja aparece no chip "Papel" do topo) — evitar repetir a mesma informacao em lugares diferentes
- Vitais Vida/Integridade usam cards empilhados (1 coluna) `.player-vital-card` com borda esquerda colorida por tipo (Vida = verde, Integridade = azul, batendo com `.bar-preview.is-life/.is-integrity`): cabecalho com label + leitura grande "atual / max" (o MAXIMO so aparece aqui como leitura, NAO e editavel no painel — ajuste so na ficha completa), barra de progresso destacada (7px) e abaixo um stepper `.player-vital-stepper` (`[−] [atual editavel] [+]`). Os botoes ajustam o atual clampando por min/max; o jogador tambem digita direto no input. A leitura e a barra atualizam ao vivo (`syncPlayerStatInputCard`). Uma dica curta (`.player-vitals-hint`) explica que a edicao sincroniza com a ficha. O botao "Abrir minha ficha completa" leva um icone de link externo
- O inspetor lateral do jogador ("Token selecionado") usa o MESMO visual das vitais do painel (`.player-vital-card`) para consistencia: por token proprio mostra so o essencial — hero (avatar + badge + nome, sem a linha "Pertence a") e os cards de Vida/Integridade com leitura grande, barra e um stepper de Atual (`.inspector-vital-stepper`: −/valor/+). O maximo aparece so como leitura (e ajustado na ficha/painel). O jogador NAO ve a secao "Acoes" (Visibilidade/Palco/Permissao) — ela e exclusiva do mestre. O inspetor do mestre permanece inalterado
- Cada card de Echo do painel mostra avatar + nome + rank e um botao "Invocar"; quando o Echo ja esta na cena, o card mostra o chip "Na cena" ao lado do botao "Remover". Cards usam `.player-echo-card` em `css/mesa-roster.css`
- Jogadores podem editar dados rapidos, atributos, Vida atual, Vida maxima, Integridade atual, Integridade maxima e inventario da propria ficha pela Mesa
- O painel do jogador deve manter a interface simples em fluxo unico, sem abas por padrao, com secoes diretas para status, dados, atributos, inventario e memorias
- Vida e Integridade devem usar inputs diretos e legiveis; botoes rapidos podem voltar apenas se nao deixarem a ficha visualmente pesada
- Inputs numericos da Mesa devem permitir apagar o valor e redigitar um numero novo; o clamp visual deve acontecer sem transformar o campo vazio temporario em `0`
- Inputs numericos da Mesa devem aceitar digitacao continua de varios digitos, como `10` e `30`, sem rerender intermediario que interrompa o foco
- Inputs de Vida maxima e Integridade maxima nao devem rebaixar o valor atual durante a digitacao de um numero incompleto; o ajuste de limite acontece ao sair do campo.
- O painel pessoal e o inspetor nao devem piscar nem reconstruir enquanto houver edicao local recente da ficha; eventos remotos antigos precisam preservar o patch local otimista.
- Atualizacoes de Vida/Integridade/atributos/inventario pela Mesa devem redesenhar apenas o necessario no palco/inspetor/painel afetado.
- Selecionar novamente o mesmo token nao deve causar mudanca visual de ordem, save ou broadcast.
- A acao `Limpar cena` e exclusiva do mestre; jogadores nao devem ver nem acionar esse controle
- Gradientes da Mesa devem usar carmesim, preto profundo e acentos frios muito sutis, evitando brilho excessivo ou aparencia colorida demais
- Gradientes em paineis grandes da Mesa nao podem ter cortes, faixas com altura fixa ou emendas visiveis; preferir camadas radiais/elipticas com fade gradual
- Otimizacoes com `content-visibility` nao podem criar blocos vazios em areas imediatamente visiveis, como painel pessoal e inspetor
- Para o jogador, o bloco do inspetor ("Token selecionado") so aparece quando ele seleciona o proprio token ou Echo; ao selecionar um token alheio (ou nenhum), a aba lateral do inspetor some por completo (nao mostra placeholder de "token restrito")
- Mestre pode controlar visibilidade, organizacao e valores maximos
- O inspetor permite editar Vida/Integridade atuais tambem dos tokens de Echo (mestre em todos; jogador nos proprios Echos), reutilizando os mesmos editores de stat; o maximo do Echo fica somente leitura na Mesa (ajustado na pagina de Echos)
- Visual deve seguir a mesma linguagem dark fantasy da ficha, mas com densidade maior por ser ferramenta de mesa

Arquivos visuais atuais da Mesa:

- `css/mesa-base.css`
- `css/mesa-layout.css`
- `css/mesa-stage.css`
- `css/mesa-roster.css`
- `css/mesa-inspector.css`
- `css/mesa-responsive.css`

## Pagina de Regras

- Deve parecer um grimorio oficial da campanha
- Hero com introducao forte e painel lateral de status
- Editor do mestre com o mesmo acabamento dos cards da ficha
- Cartoes de regras devem priorizar:
  - leitura
  - hierarquia clara
  - contraste forte
  - atmosfera dark fantasy
- A pagina de regras nao pode parecer um blog comum nem um CMS generico
- O HTML da pagina de regras deve permanecer em UTF-8 limpo; qualquer texto corrompido deve ser corrigido na origem antes de novos refinamentos
- A pagina de regras deve manter estrutura funcional simples; refinamento visual nao deve criar secoes extras sem necessidade

## Pagina de Echos

- Segue a mesma linguagem dark fantasy da ficha: superficie escura em camadas, bordas discretas, tipografia de titulo dramatica
- Layout: hero curto, barra de filtros (busca, raridade, ordenacao e, para o mestre, dono) e grade de cards responsiva
- Cada Echo e um card com retrato, badge de raridade, nome, monstro de origem, barra de rank/XP, atributos resumidos e acoes
- Raridade e codificada por cor de borda/badge via tokens em `tokens.css` (`--echo-comum-*`, `--echo-raro-*`, `--echo-epico-*`, `--echo-lendario-*`); manter dentro da paleta (azul frio, roxo profundo, dourado contido) sem brilho excessivo
- Detalhes e edicao abrem em modal centralizado seguindo o padrao `app-modal-*`
- Na ficha do monstro, a secao "Drop de Echo" reaproveita os componentes de rolagem do drop de memoria (`memory-roll-*`) para manter consistencia
- Token de Echo na Mesa usa a cor `--token-echo` (roxo) e o rotulo de tipo "Echos"

## O Que Evitar

- excesso de ornamento
- sombras exageradas sem funcao
- caixas de tamanhos incoerentes
- espacamentos irregulares
- alinhamentos quebrados
- brilhos coloridos fora da paleta
- aparencia de painel generico claro
