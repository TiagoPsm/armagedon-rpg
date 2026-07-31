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

## Espaco abaixo do token e do nome (2026-07-31, Etapa 67)

O nome do token fica logo abaixo do circulo e **nada de UI pode ocupar esse espaco**. Por isso o botao de marcadores de status (`.mesa-token-markers-btn`) fica ACIMA do token, nao embaixo. Acessorios do token selecionado vao para cima; se ja houver chips de condicao la, o acessorio sobe mais (`:has(.mesa-token-markers)`).

## Pilha de camadas do palco da Mesa (2026-07-31, Etapa 66)

Ordem oficial, com o comentario-fonte em `css/mesa-stage.css` (regra `.mesa-stage`). Mexeu numa, confira a lista toda — os valores vivem em quatro arquivos diferentes:

| z-index | Camada |
|---|---|
| 0 | `#mesaMapLayer` — mapa |
| 7 | `#mesaGridCanvas` — grade |
| 8 | `#mesaDrawCanvas` — desenhos |
| 10 | `#mesaStage` — **tokens** |
| 12 | `#mesaRubberBand` — marquee da selecao por area |
| 15 | `#mesaSelectionBox` — caixa da selecao multipla |
| 26 | `#mesaFogCanvas` — nevoa |
| 29 | `#mesaRulerOverlay` — regua |
| 30 | ping |

- **Token sempre acima de mapa, grade e desenhos.** Ele e o objeto que a pessoa manipula; nada de cenario pode ser desenhado por cima. Os tokens ficaram em `z-index: 2` ate a Etapa 66 e as linhas da grade cortavam o retrato.
- **Nevoa sempre acima dos tokens** — caso contrario ela nao esconderia ninguem.
- **Marquee e caixa de selecao acima dos tokens** — precisam ser vistos por cima do que estao selecionando.

## Marcadores de status do token (2026-07-30, Etapa 64)

- **Um painel so.** O botao `◉` no token selecionado e o botao "Editar" do inspetor abrem o MESMO popover, com as 12 condicoes que ja existiam. Nao duplicar grade de toggles em dois lugares — foi o que a Etapa 64 desfez.
- **Popover ancorado, nao modal.** Abre embaixo do botao, vira para cima se nao couber, e sempre respeita 8px de margem da janela. Fecha com Esc ou clique fora.
- **Chips ficam acima do circulo**, fora da caixa de layout do token (mesma regra do nome), para nao inflar a area de encaixe na grade.
- **Todo controle dentro do palco precisa de contra-escala** (`calc(1 / (var(--token-scale) * var(--stage-zoom)))`) e de alvo de clique ampliado por `::before`. Vale para o botao de marcadores como valia para as alcas.
- **Overlay invisivel nao pode capturar clique.** Se um controle so aparece em certo estado (`opacity: 0` fora dele), o `pointer-events` tem que seguir o mesmo estado — senao vira alvo-fantasma. Aconteceu com as 8 alcas na Etapa 63.

## Token da Mesa: estados e selecao (2026-07-30, Etapa 63)

Padrao de base: Roll20, adaptado ao dark fantasy. Regras em `css/mesa-stage.css` **e** no bloco `<style>` inline de `mesa.html` — os dois precisam andar juntos (o inline vence no empate de especificidade).

- **Nada de branco no token.** O halo branco de 3px (`rgba(255,248,236,.85)`) na selecao foi removido: ele comia a arte do avatar. Branco puro fica reservado para as alcas de selecao, que sao elementos de UI e nao camada sobre a arte.
- **Hover nao move o token.** Sem `translateY`, sem mudanca de escala — o token nao pode "pular" debaixo do cursor. O feedback de hover e so o anel do tipo indo a opacidade cheia (jogador azul, NPC dourado, monstro carmesim) mais uma sombra projetada um pouco mais funda.
- **Selecao = anel carmesim fino + caixa de alcas.** `rgba(214,92,92,.95)` no anel, halo unico e discreto (`0 0 12px rgba(176,47,57,.35)`). A caixa ja comunica "selecionado"; o halo nao precisa gritar. Token selecionado continua carmesim mesmo sob o cursor.
- **Cor de borda sempre literal**, nunca `var()`. As tres cores de tipo tem regra propria por estado (base, hover) — mais verboso, porem trivial de rastrear.
- **Caixa de selecao**: quadrado EXATAMENTE sobre a caixa do token (`inset: 0`), borda carmesim, 8 alcas de 9px (4 cantos + 4 meios) em branco com contorno carmesim escuro. Nada de folga fixa em px: dentro do palco ela e multiplicada pela escala do token e a caixa descola do circulo, deixando de coincidir com a grade.
- **Espessura de traco tambem precisa de contra-escala**, nao so o tamanho: `border-width: calc(1px / (var(--token-scale) * var(--stage-zoom)))` mantem a linha em 1px de tela em vez de engrossar junto do token.
- **Icone de botao pequeno = SVG, nunca caractere.** Glifos como `◉` dependem da fonte instalada e quase nunca ficam opticamente centrados; com `svg { display: block }` some tambem o espaco de linha-de-base que empurra o icone para baixo.
- **Alcas tem tamanho de TELA constante**: contra-escaladas por `calc(1 / (var(--token-scale) * var(--stage-zoom)))`. Qualquer overlay de UI dentro do palco precisa desse cuidado — o palco inteiro vive sob um `transform: scale()`.
- **Alvo de clique maior que o desenho**: `::before` com `inset: -7px` amplia a area de pegada de 9px para ~23px. E o que faz a alca *parecer* facil de agarrar. Vale para qualquer controle pequeno da Mesa.
- **Cursor segue o eixo da alca** (`ns`, `ew`, `nwse`, `nesw`), nunca sempre a diagonal.
- **Feedback antes de confirmar**: durante o resize, o encaixe na grade aparece ao vivo (com ima de 8px) e uma etiqueta mostra o tamanho (`2×2` ou `%`). O usuario ve o resultado antes de soltar, em vez de o token pular ao confirmar.

## Palco da Mesa (2026-07-27)

- O fundo do palco da Mesa e MAIS ESCURO que o resto da UI de proposito: base `rgba(2,3,5,.98)` com gradientes vermelhos/violeta bem sutis e glow central a 55% — o mapa (imagem clara) e o unico ponto de luz, e a Fog of War se funde com o fundo.
- A nevoa (Fog of War) desenha com sangria de 3px alem da borda do mapa: nenhuma fileira de pixels do mapa ou linha da grade pode aparecer como "borda" na tela do jogador.

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
- O token do palco tem UM unico estilo: redondo (minimal) — avatar circular de 88px com borda colorida por tipo (jogador azul, NPC dourado, monstro vermelho). O antigo estilo "card" grande (ficha completa via Canvas renderer) e o seletor "Estilo dos tokens" foram removidos em 2026-06-30. `state.tokenStyle` fica fixo em `"minimal"`
- **A caixa do token e SO o circulo (88x88, desde 2026-07-11)**: o nome fica em posicao absoluta abaixo do circulo, FORA da caixa de layout, e so aparece em hover, selecao ou arrasto (fade de 150ms). Motivo: snap-to-grid, arrasto e selecao usam o rect do elemento — com o nome dentro da caixa o circulo nunca centralizava na celula da grade. O nome permanece no DOM (leitores de tela); a alca de redimensionar fica na borda inferior direita do circulo
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

### Palco ajustado ao mapa (Etapa 52)

Com "Ajustar ao mapa" ligado, o `#mesaStageInner` recebe `left/top/width/height`
inline (calculados em `js/mesa-map.js`) e passa a ter a proporcao exata da
imagem. Sobra letterbox no wrap — e essa sobra precisa ler como "fora do
territorio", nao como area jogavel vazia:

- `#mesaStageWrap[data-fit-map]` escurece o fundo para `#050307` (mais escuro
  que o `#030205` do canvas, para o palco destacar por contraste)
- borda carmesim discreta no inner (`0 0 0 1px rgba(176,48,57,0.35)`) mais
  sombra externa — marca o limite do mapa sem competir com o conteudo
- nada animado: o letterbox e moldura, nao elemento de cena

O atributo `data-fit-map` e a unica chave CSS; toda a geometria vem do JS,
porque depende das dimensoes naturais da imagem importada.

### Nitidez no zoom de palco (Etapa 58)

O zoom de palco e um `transform: scale()` no `#mesaStageInner`. Duas armadilhas
de rasterizacao, ambas ja tratadas — nao reintroduzir:

- **`will-change: transform` nao pode ser permanente** no inner. Permanente,
  promove o elemento a uma camada rasterizada UMA vez na escala base, e o
  mapa (background-image) sai borrado ao ampliar. Ele vive so em
  `.mesa-stage-inner.is-transforming`, classe posta durante o movimento e
  removida ~180ms depois.
- **Canvas dentro do inner precisa de buffer proporcional ao zoom.**
  `offsetWidth x devicePixelRatio` basta a 100%, mas a 300% o compositor
  estica o bitmap. Grade, nevoa e desenhos usam `getMesaRenderScale()`
  (densidade x zoom, com teto de 24 MP) e re-rasterizam via
  `rescaleStageCanvases()`.

Regra geral: dentro de um elemento com `transform: scale()`, qualquer bitmap
de tamanho fixo vai borrar. Ou se re-rasteriza na escala exibida, ou se
aceita o borrao.

**Armadilha que ja custou uma regressao (Etapa 59):** todo `<canvas>` do palco
precisa de `width: 100%; height: 100%` no CSS — `inset: 0` sozinho NAO basta.
Canvas e elemento substituido: com `width: auto`, a largura usada vem do
tamanho intrinseco (o atributo `width=`), nao das bordas do inset. Sem as duas
linhas, aumentar o buffer faz o ELEMENTO crescer junto, transbordando o palco.
Vale para `#mesaGridCanvas`, `#mesaFogCanvas` e `#mesaDrawCanvas` (este ultimo
resolve por JS, setando `style.width/height`).

**Segunda armadilha, que custou outra regressao (Etapa 60):** linha de canvas
em escala variavel precisa de espessura INTEIRA e coordenada alinhada ao pixel
de dispositivo. O canvas centra o traco na coordenada — traco fracionario
(`lineWidth = dpr` com dpr = densidade x zoom) em coordenada fracionaria se
espalha por 2–3 px com alpha parcial, e a divisao cai diferente em cada linha.
A grade sai manchada, e como o padrao varre junto com o zoom, ela CINTILA.
Receita: `lw = Math.max(1, Math.round(dpr))`, e coordenada `Math.round(v) + 0.5`
para `lw` impar / `Math.round(v)` para par. Alinhar as extremidades tambem, ou
as bordas acendem mais fraco que o miolo.

**Terceira armadilha (Etapa 61):** espessura e alinhamento se medem em px de
DISPOSITIVO, nunca em px do buffer. Quando o buffer escala com o zoom, `dpr`
deixa de ser densidade e vira densidade x zoom: usa-lo como `lineWidth` engorda
o traco a cada zoom e, ao virar a PARIDADE da espessura, escorrega a grade
inteira meio pixel e derruba a linha da borda — a grade parece pular uma celula.
Receita corrigida: `lw = Math.max(1, Math.round(dpr / Math.max(1, zoom)))`.
E trate diferenca abaixo de 1 px de layout entre a superficie e o canvas como a
MESMA borda; senao o residuo do arredondamento da caixa entra e sai do canvas
conforme o zoom.

**Quarta armadilha (Etapa 62):** bitmap de CONTEUDO tambem entra na conta. Os
avatares dos tokens eram reduzidos a 256 px — teto herdado do token de 88 px
sem zoom e do tempo em que o avatar ia como base64 no D1. Com mapa e grade
nitidos, o avatar virou a camada borrada: a 300% em tela Retina sobrava 0,46 px
de fonte por px de tela. Teto agora e 512. Regra: ao mexer no zoom maximo ou no
tamanho dos tokens, refaca a conta `lado_fonte / (lado_css x zoom x dpr)` para
TODA imagem do palco — o valor precisa ficar >= 1.

Regra pratica que fecha as quatro: **nitidez em elemento com `transform: scale()`
tem cinco eixos independentes** — tamanho do buffer, caixa CSS do elemento,
alinhamento do traco, posicao das linhas em relacao ao conteudo e resolucao dos
bitmaps de conteudo. Acertar quatro e errar um ainda da defeito visivel, e cada
eixo precisa da sua propria afirmacao em teste.

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
