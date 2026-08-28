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

## Moldura de superficie vai por cima das camadas (2026-08-20, Etapa 110)

A borda do palco nao pode morar na camada de FUNDO: grade, desenho e nevoa
ocupam a mesma caixa inteira e a apagam. Ela vive numa camada propria acima da
grade, dos desenhos e dos tokens — hoje `.mesa-stage-inner::after` em
`z-index: 11`.

Antes de pendurar uma moldura num elemento, confira se ele nao tem `z-index`
proprio: com contexto de empilhamento, o filho fica preso abaixo do irmao que
se queria cobrir.

## Superficie com grade tem canto reto (2026-08-20, Etapa 108)

O quadro do palco usa `border-radius: 0`. Onde uma grade e desenhada ate o
vertice da caixa, qualquer raio corta a celula do canto e deixa linha para fora
da borda pintada. Arredondamento fica para painel, card e botao — nao para
superficie de jogo.

## O quadro e a caixa, nao um desenho (2026-08-20, Etapa 107)

Superficie visivel e superficie logica sao a MESMA caixa: `#mesaStageInner`.
Quem muda o tamanho do palco e `applyStageFitBox()` — imagem do mapa quando ha
mapa, quadrado de 92% do lado menor quando nao ha. `.mesa-stage-board` so
pinta (`inset: 0`).

Regra: nunca dimensionar uma camada do palco por CSS proprio. Se a borda
desenhada nao for a borda da caixa, grade, desenho, nevoa e token vazam por
ela — foi exatamente o que aconteceu na Etapa 106.

## Palco vazio nao fala, mostra (2026-08-20, Etapa 106)

A tela inicial da Mesa nao carrega texto explicativo. Sem mapa, o palco mostra
so `.mesa-stage-board`: um quadrado centralizado, preto com degrade carmesim,
borda `--border-accent` e halo `--accent-glow` — destaque suficiente para ler
como superficie de jogo sem clarear o palco.

Regra: instrucao de uso mora nos controles (titulo, tooltip, painel), nunca no
palco. Quando um mapa entra, o quadro sai — a superficie de jogo e uma so.

## Escala de controle: tres alturas, uma fonte de rotulo (2026-08-19, Etapa 97)

Altura de botao nao se escolhe caso a caso. A escala vive em `css/tokens.css`:

- `--control-sm` **28px** — acao dentro de cartao, contexto denso
- `--control-md` **32px** — PADRAO: botao de painel, chip, segmentado, stepper
- `--control-lg` **40px** — destaque: icone que abre painel, fechar

Rotulo de controle usa `--fs-control` (11,2px). Glifo de icone (`+`, `−`, `x`) segue a propria escala e nao conta como rotulo.

Por que existe: entre a gaveta de cenas e o inspetor conviviam SETE alturas e SEIS tamanhos de fonte, com "Nova pasta" (21px) ao lado de chips (29px) na mesma linha. O mesmo `.mini-btn` media 26px num lugar e 21px no outro.

Regras que vem junto:

- **Piso de 28px** para qualquer alvo de clique (WCAG 2.2 AA pede 24px; a escala parte de 28 para nao encostar no limite).
- **Painel flutuante segue a escala de quem o abriu** — quando o inspetor subiu para 32px e o pop-up de marcadores ficou em 26px, foi o teste que compara os dois que denunciou.
- **Aplicada na Mesa inteira** desde a Etapa 98 — gaveta, inspetor e painel de configuracoes do mapa. As outras paginas migram em etapa propria; ate la, nao misturar as duas escalas dentro da mesma tela.

## Padrao de painel da Mesa (2026-08-19, Etapa 98)

O painel de configuracoes do mapa (`#mesaMapTransform`) era o unico canto da Mesa que nunca tinha migrado para a escala da Etapa 97: 26px de altura, CINCO tamanhos de fonte num painel so (0,56 / 0,68 / 0,70 / 0,72 / 0,78rem) e tres raios (3px, 4px, 10px). Arrumar ele fechou o padrao que vale para **qualquer painel da mesa.html**.

### Dois niveis de texto, os dois com nome

- `--fs-eyebrow` **9,28px**, caixa alta, com tracking — nomeia um BLOCO ("Grade", "Nevoa", "Acoes"). Nunca fica dentro de um alvo de clique, entao pode ser pequeno.
- `--fs-control` **11,2px** — rotulo DENTRO de um controle.
- **Glifo de icone** (`−`, `+`, `↻`) e um terceiro nivel, e tambem tem um valor so por painel. Foi o `↻` em 0,85rem ao lado de `−`/`+` em 0,82rem que mostrou que "sobra" tambem acontece em icone.

Os dois primeiros ja eram a convencao de fato (inspetor 0,58rem, painel do mapa 0,56rem) — viraram token porque estavam escritos a mao, com valores diferentes, em cada arquivo.

### Peso visual igual obriga significado igual

A regra mais cara desta etapa. Na Nevoa conviviam quatro botoes identicos com **dois significados**:

| Par | O que e | O que `.is-active` queria dizer |
|---|---|---|
| Revelar / Cobrir | MODO do pincel, exclusivo e continuo | "este pincel esta armado" |
| Revelar tudo / Cobrir tudo | ACAO de uma vez, destrutiva (zera as pinceladas) | "o mapa JA esta assim" |

A mesma classe significando duas coisas, com o mesmo desenho, fazia o bloco parecer quatro opcoes irmas. Correcao: **modo vira segmentado** (Etapa 94), **acao vira par 50/50 de botoes comuns**, mais discretos. E os dois pares seguem a **mesma ordem** — antes um vinha invertido em relacao ao outro, na mesma coluna.

### Numero sem unidade nao informa

"20" e "7" nao dizem nada, e o significado morava so no atributo `title` — invisivel no toque e para quem navega por teclado. A unidade vai **visivel** ao lado do numero (`colunas`, `% do mapa`), em `--fs-eyebrow`. O `id` fica no `<span>` que tem SO o numero, senao o `textContent` do JS apaga a unidade junto.

### Controle nativo importa o tema do sistema

`<input type="checkbox">` cru aparecia como um quadrado cinza claro num painel preto — o unico elemento da Mesa fora da direcao visual. Precisa de `appearance: none` + desenho proprio, e ai **o foco visivel tem de ser redesenhado junto**: o mesmo `appearance: none` que apaga a caixa apaga o anel de foco nativo. O "v" e pseudo-elemento com `transform`, nao glifo de fonte (o Cinzel nao tem um check apresentavel).

Alvo de clique e a **linha inteira** (`min-height: var(--control-md)`), nao os 13px do input.

### Painel flutuante precisa de largura declarada

`width: 248px` e o que destrava a regra da Etapa 94 ("controle de acao vai de borda a borda"). Sem largura o painel encolhe para o conteudo e um filho com `width: 100%` para no meio da coluna — o mesmo cuidado ja medido na Etapa 94.

### Token de texto se mede contra a SUPERFICIE, nao contra a pagina (2026-08-20, Etapa 105)

`--text-soft` foi calibrado contra o fundo da pagina: 5,52:1 no preto, ~5,4:1 no `--bg-card`. Sobre `--accent-deep` — o fundo da linha do roster cujo token ja esta em cena — ele cai para **4,497:1** e reprova.

Regra: ao pintar texto sobre uma superficie elevada ou de acento, meca ali. "O token esta certo" nao e resposta — a razao depende do par, nao do token sozinho. Quando a superficie sobe de peso, o texto sobre ela sobe junto; aqui, `--text-soft` deu lugar a `--accent-text` (5,30:1), com o hover ainda em `--text`.

**Cuidado de especificidade ao sobrescrever estado.** `.roster-entry[data-state="on-stage"] .mini-btn` empata em especificidade (0,3,0) com `.mini-btn:hover:not(:disabled)`. Empate resolve por ordem de arquivo — ou seja, o hover viraria refem da ordem dos `<link>`. Escreva o hover do caso especifico junto, sempre.

### Alfa e o jeito silencioso de reprovar contraste (2026-08-20, Etapa 104)

Os quatro piores casos de contraste destas duas etapas tinham a cor CERTA e um alfa por cima: o rotulo do zoom (carmesim a 0.7), os rotulos da barra (0.38), o reset de escala (0.4) e "Limpar tudo" (0.65). Nenhum apareceria numa revisao que confere apenas "o token e o certo?".

Regra: para deixar um elemento secundario, escolha um TOM mais escuro da paleta — nao um alfa sobre o tom claro. `--text-soft` ao lado de `--text` diz "secundario" e continua legivel; `rgba(--text, 0.4)` diz a mesma coisa e some. Discreto nao e apagado.

Quando o alfa for mesmo necessario, meca o resultado composto contra o fundo real, nunca a cor declarada.

### `--accent` preenche; `--accent-text` se le (2026-08-20, Etapa 103)

`--accent` (#a83028) sobre o fundo quase preto da Mesa da **3,0:1** — abaixo dos 4,5:1 do WCAG AA para texto pequeno — e estava pintando justamente rotulos de 8 a 11px (kickers, selos de papel, rotulo do zoom).

- **`--accent`**: preenchimento, borda, estado ativo. Nunca texto pequeno.
- **`--accent-text` (#c97a70, 6,5:1)**: quando o carmesim precisa ser lido.

### `--text-faint` e placeholder, nao conteudo (2026-08-20, Etapa 103)

`tokens.css` documenta `--text-faint` (#3a382f) como "placeholder, desabilitado" — e ele estava pintando estados vazios, rotulos de secao e ate o botao "dispensar" do banner de reconexao, a **1,74:1**. Nao era escolha de cor errada: era o token errado no lugar errado.

Texto que a pessoa precisa ler para agir e CONTEUDO — piso `--text-soft`. `--text-faint` fica para placeholder de campo e simbolo decorativo, onde e o proposito dele.

### Contraste se mede, nao se compara por nome (2026-08-20, Etapa 103)

Conferir se a cor "e o token certo" nao basta: o rotulo do zoom usava o carmesim certo com **alfa 0.7**, e o alfa derrubava a leitura para 3,8:1. A conta tem de ser a do WCAG — luminancia relativa, com o fundo resolvido subindo a arvore e compondo alfa em cada camada translucida. Os testes da Etapa 103 fazem exatamente isso e servem de modelo.

Cuidado ao ler resultado de varredura: **valide os falsos positivos antes de "consertar"**. Nesta etapa, tres caixas de 16x16 pareciam alvos minusculos e vivem dentro de `<label>` de 222x32; e um swatch de 20px entre onze de 17px era o item ATIVO com `scale(1.15)`. Nenhum dos dois era defeito.

### `outline: none` sem substituto e um controle invisivel ao teclado (2026-08-20, Etapa 102)

`.vtt-tb-btn, .vtt-layer-btn` zeravam o outline na regra base para o clique de mouse nao deixar anel — e levaram o teclado junto. Eram a barra de ferramentas e as camadas: a navegacao principal da Mesa ficava sem nenhum sinal de foco.

Regra: `outline: none` **so** acompanhado de um `:focus-visible` que devolva um anel. Nunca sozinho. `:focus-visible` (e nao `:focus`) e o que preserva a intencao original — mouse nao ganha anel, teclado ganha. O padrao da casa e `outline: 2px solid rgba(214, 69, 80, 0.9)`, com offset negativo quando o controle ocupa a largura inteira de uma coluna estreita.

**Como medir foco sem se enganar** — duas armadilhas, as duas encontradas nesta etapa:

- **`el.focus()` de script nao casa com `:focus-visible`.** O heuristico do navegador so liga depois de um evento de teclado CONFIAVEL; evento sintetico (`dispatchEvent`) nao serve. Medir assim diz "nenhum controle tem anel", inclusive dos que tem. Em teste, use `page.keyboard.press("Tab")` antes de focar.
- **`getComputedStyle` devolve objeto VIVO.** Ler `cs.outlineStyle` depois do `blur()` entrega o estado sem foco. Copie para string no instante do foco.

### Dois flutuantes no mesmo canto: um sai, nao empilha (2026-08-20, Etapa 101)

Barra de zoom e painel de configuracoes moravam os dois em `right: var(--hud-inset)`, e a barra tem `z-index` maior — ela cobria a coluna direita do painel, inclusive o "+" do stepper. Empilhar por z-index nao resolve: o de baixo continua inalcancavel.

Regra: quando um painel abre sobre a area de outro controle flutuante, o controle **se desloca pela largura do painel**, e essa largura e um token (`--map-panel-w`), nunca um numero repetido nos dois arquivos.

- **Detecte o estado com `:has()` no ancestral comum**, nao com uma classe marcada no clique. Assim o desvio acompanha o estado real do elemento, venha de qualquer caminho que mexa no `hidden`. Sem suporte a `:has()`, o pior caso e a sobreposicao de hoje — nunca um layout quebrado.
- **Se houver transicao, o teste tem de esperar.** A primeira versao do teste desta etapa media no instante da abertura e falhou legitimamente: com `transition: right 0.16s`, a barra passa ~160ms sobre o painel. O que se cobra e onde o controle PARA. Transicao desligada em `prefers-reduced-motion`.

### Limite duplicado entre JS e HTML precisa de teste (2026-08-20, Etapa 101)

O teto do zoom vive em `ZOOM_MAX` (mesa-map.js) e no `max` do `#mesaZoomSlider` (mesa.html, em porcentagem). Sao duas fontes de verdade para o mesmo limite e nada no codigo liga uma a outra: se divergirem, o botao "+" passa de um teto que a barra nao alcanca, em silencio. Sempre que um limite tiver gemeo no HTML, escreva o teste que cobra a igualdade — o piso tambem.

### Painel flutuante da Mesa usa os tokens `--hud-*` (2026-08-20, Etapa 99)

`css/mesa.css` define `--hud-bg`, `--hud-border`, `--hud-blur` e `--hud-radius` dizendo, no proprio comentario, que sao o "estilo compartilhado por todos os paineis flutuantes da mesa". O painel do mapa **nao usava nenhum deles**: fundo e raio proprios e borda `rgba(255,255,255,0.08)` — BRANCA, onde o padrao do HUD e carmesim (`rgba(168,48,40,0.22)`). Era a razao de ele parecer cinza e estrangeiro logo abaixo da barra do canto, que usa os tokens.

Regra: painel flutuante nao escolhe fundo, borda nem raio. Herda os `--hud-*`. Conferido por medicao — borda e fundo do painel agora batem exatamente com os da barra.

### Carmesim marca estado, nao decora

Dentro do painel, o neutro era o padrao e o acento quase nao aparecia:

- Botao e checkbox tinham borda/fundo **brancos** translucidos → passaram para `--border-accent` sobre `rgba(168,48,40,0.10)`.
- Estado LIGADO (checkbox marcado, pincel armado) usava `--accent-deep` (#3a0a08, quase preto) — "marcado" mal se distinguia de "desmarcado". Passou para `--accent` (#a83028) cheio, com o "v" em quase-branco por cima.
- Rotulo de secao saiu de `--text-soft` (#8a8272, bege apagado) para carmesim claro: ele marca o bloco em vez de sumir.

**Texto de controle e conteudo, nao decoracao.** Rotulo de botao e de opcao estavam em `--text-soft`: 5,7:1 de contraste em corpo de 11,2px. Passaram para `--text`, medido em **14,4:1**. A sobrancelha de secao ficou em 6,2:1. Reservar `--text-soft` para texto de apoio (legenda), nao para o rotulo do controle que a pessoa precisa ler para agir.

### Compactar tirando espaco, nunca alvo

Reduzir painel nao pode encolher area de clique — o piso de 28px da Etapa 97 continua valendo, e todo controle deste painel segue em 32px. A altura saiu de **557px para 530px** no mesmo estado, vinda de:

- vao entre secoes 16px → 12px, com uma **regua fina carmesim** assumindo a separacao. Troca espaco por estrutura: encurta e ainda deixa o agrupamento mais explicito.
- legenda reescrita de 3 para 2 linhas (mesmos dois fatos, sem repetir o que os controles ja dizem) e `line-height` 1,5 → 1,35, que e respiro de leitura corrida e nao de texto de apoio.

**A regua tem uma armadilha.** Os grupos nascem `hidden` e ha um `<p>` de ajuda entre eles, entao `+` (irmao adjacente) erra dos dois lados: pula a divisoria de um par e, pior, poe uma regua no TOPO do painel assim que um grupo oculto precede o primeiro visivel. O seletor certo e geral, com `:not([hidden])` nos dois lados:

```css
.mesa-map-transform-group:not([hidden]) ~ .mesa-map-transform-group:not([hidden])
```

Conferido nos tres arranjos (nenhum oculto, um oculto, dois ocultos): o primeiro grupo **visivel** nunca leva regua.

### Painel ancorado calcula o proprio `top`, nunca copia um numero

O painel do mapa usava `top: 52px`, medido a mao um dia. Ja encostava 4px na barra do canto antes desta etapa; quando os controles do overlay subiram para a escala, virou **18px de sobreposicao**.

Regra: quem se ancora abaixo de uma barra deriva a posicao **da barra**, nao de um numero. `--hud-overlay-h` (em `css/mesa.css`) = filho mais alto + padding vertical + borda, e o painel faz `top: calc(var(--hud-inset) + var(--hud-overlay-h) + var(--sp-2))`.

Duas armadilhas medidas:

- **O filho mais alto pode nascer `hidden`.** No overlay do canto o mais alto e o botao da gaveta de cenas (`--control-lg`, 40px), que so aparece para o mestre com cena. Calcular pela altura do estado inicial da 8px a menos, e o encosto volta exatamente para quem usa a ferramenta. Use a altura do MAIOR possivel, nao a do visivel agora.
- **Teste de sobreposicao tem de rodar no estado revelado.** Os tres testes desta etapa medem `painel.top - barra.bottom >= 0` com a gaveta oculta, com ela visivel e em 900px de largura. Rodados contra o CSS antigo, falharam com `-18`.

### Legenda pertence a secao de cima

O `border-top` acima do texto de ajuda o fazia parecer cabecalho da secao SEGUINTE, quando ele explica a atual. Parentesco se resolve por **proximidade** (colado no grupo, separado do proximo pelo `gap` do painel), nao por regua.

## Pop-up herda a lingua de quem o abriu (2026-08-18, Etapa 95)

Painel flutuante ancorado a um controle nao inventa estilo proprio: largura amarrada a do controle que o abre, mesmos tokens de raio, borda e espacamento, mesma escala de texto e mesma altura de botao da secao de origem. Foi a divergencia disso (268px contra 235px, cantos de 14px contra 4px, pilula contra retangulo) que fez o painel de marcadores parecer de outro site.

Grade de icones usa `aspect-ratio: 1/1` — com padding vertical fixo e largura elastica, o "quadrado" deforma assim que o painel muda de largura.

## Coluna estreita: controle ocupa a largura toda (2026-08-18, Etapa 94)

Em painel estreito, controle com largura de conteudo serrilha a borda direita e a simetria passa a depender do texto. Regra: **todo controle de acao vai de borda a borda** — segmentado (duas metades de 50%), botao unico esticado, ou par em grade 50/50. Rotulo maior deixa de mexer no desenho.

- **Alternador de dois estados vira segmentado**, nao botao que troca de rotulo. "Visivel" sozinho num botao nao diz se e o estado atual ou o que acontece ao clicar. No segmentado, o estado esta aceso e a alternativa esta do lado — e a acao carrega o valor desejado (`data-value`), com clique no lado ativo sendo no-op.
- **O lado ativo continua focavel** (nada de `disabled`, que o tira da navegacao por teclado) e leva `aria-pressed`.
- **Par de campos relacionados tem a mesma largura** (atual/maximo): colunas `1fr`, nunca uma fixa e outra flexivel — senao o par desequilibra e ainda muda de tamanho com a quantidade de digitos.
- **Uma altura por secao**, do mesmo jeito que ja vale para tamanho de fonte.
- Cuidado medido na Etapa 94: `width: 100%` so estica se o PAI tiver largura. Dentro de flex com `align-items: flex-start`, o pai encolhe para o conteudo e o filho para no meio da coluna.

## Secao de acoes: um bloco, uma coluna, um tamanho (2026-08-18, Etapa 92)

Numa coluna estreita (o inspetor tem 288px), lista de acoes nao leva moldura por item: a secao ja e a caixa. Cada acao e um grupo rotulo + controle, separado por ESPACO. Quatro caixas empilhadas dentro de outra caixa foi o que fez a secao parecer quebrada.

Tres regras que vieram junto:

- **Uma coluna de alinhamento.** Rotulo, controle e texto auxiliar partem da mesma borda esquerda. Alinhamento a direita so se a linha inteira for "rotulo a esquerda / valor a direita" — e se o layout mudar de linha para coluna, essa sobra precisa sair junto (foi o que deixou "Nenhum" encostado na borda).
- **Um tamanho de controle por secao.** Todo botao de uma mesma secao usa a mesma escala (`.mini-btn`). Variante que existe em dois lugares (token e inspetor) anula so o que e do outro contexto — `position`, `line-height` do icone —, nunca o tamanho de fonte: `font-size: inherit` num botao dentro de painel o faz saltar para ~16px e dominar a secao.
- **Espacamento na escala de 4px** (`--sp-*`), nao valores soltos como 0,3rem ou 0,4rem 0,5rem.

## Alvo de clique ampliado exige dono posicionado (2026-08-18, Etapa 91)

O truque de aumentar a area clicavel com `::before { position: absolute; inset: -Npx }` **so funciona se o elemento dono tiver `position` diferente de `static`**. Dentro de um dono estatico, o pseudo-elemento se ancora no ancestral posicionado mais proximo e o alvo invisivel cresce ate o tamanho DELE.

Foi o que aconteceu com o botao de marcadores no inspetor: `position: static` (para anular o posicionamento da variante do token) + `::before` com `inset: -6px` = alvo do tamanho da `.vtt-body` inteira (1400x835). Nada quebrava na tela; todo clique da Mesa e que ia parar no botao errado.

Regra: sempre que um `::before` servir de alvo de clique, ou o dono e `relative`/`absolute`, ou a regra do alvo e escopada para a variante que tem posicionamento (`:not(.is-inspector)`). E ao criar uma variante que zera posicionamento, conferir se algum pseudo-elemento dependia dele.

## Gaveta de cenas: faixa do topo, nunca modal de tela cheia (2026-08-18, Etapa 89)

O gerenciador de cenas desce do topo e ocupa no maximo 70% da altura (82% em tela estreita), com a lista rolando por dentro. O palco continua aparecendo embaixo: o mestre escolhe a cena olhando para a mesa, nao para uma tela que cobriu a mesa.

Regras que vem junto:

- **Dialogo nativo nao entra na Mesa.** `window.prompt`/`window.confirm` sairam daqui; nomear tem dialogo proprio (erro em `role="alert"`, amarrado ao campo por `aria-describedby`) e confirmar usa `UI.confirm`. Ha teste que reprova se voltarem.
- **Estado nunca depende so de cor.** A cena ativa tem borda carmesim E a faixa escrita "ATIVA" E `aria-current` no botao.
- **A unica animacao e a descida da gaveta** (0,22s), desligada em `prefers-reduced-motion`. Nada de fundo animado.
- **Armadilha de foco nao se empilha.** Dialogo que nasce dentro de outro DESLIGA a armadilha do de baixo enquanto vive e a religa ao fechar, apontando para onde o foco deve parar. Empilhar as duas faz a de baixo puxar o foco para fora da de cima — foi assim que o campo de nome ficou inalcancavel na propria Etapa 89.
- **`.sr-only` precisa estar definida na pagina que a usa.** Estava so em `css/echos.css`; na Mesa, todo texto "so para leitor de tela" aparecia na tela. Agora vive tambem em `css/mesa-scenes.css`.

## Doca esquerda: todo painel persistente da Mesa mora na mesma coluna (2026-08-02, Etapa 79)

`#mesaDockLeft` e uma coluna `position: fixed` no canto inferior esquerdo, colada a direita da toolbar (`left: calc(60px + var(--sp-3))`, `bottom: var(--sp-3)`, largura `min(300px, calc(100vw - 60px - 2rem))`). Todo painel que fica aberto durante o jogo entra nela como filho de posicao **estatica** — dados em cima, iniciativa embaixo — e o empilhamento sai do flex.

Por que uma doca e nao dois paineis ancorados: na Etapa 78 a iniciativa foi ancorada nesse canto sem reparar que o painel de dados ja estava la (`absolute`, dentro do palco). Os dois se sobrepuseram. Painel que se ancora sozinho colide com o proximo; painel que entra numa doca, nao.

Regras da doca:

- **`pointer-events: none` no container, `auto` nos filhos.** Os vaos entre paineis nao podem roubar clique do palco.
- **`max-height` na doca, `overflow` em cada painel.** A doca limita o conjunto (`calc(100dvh - 96px - var(--sp-3))`); cada painel rola por dentro. Dois abertos nunca passam do topo da janela.
- **Mobile (`<=700px`)**: a toolbar vira faixa horizontal, o recuo de 60px some e a doca ocupa a largura util (`left`/`right` de `var(--sp-2)`).
- **Todo painel da doca colapsa** (botao no cabecalho, sobra so o titulo) e o colapso e preferencia LOCAL — nunca sincroniza.

### O resultado tem de ser lido de longe

No painel de dados o numero e o produto: card proprio no topo (`.mesa-dice-result`), total em 2rem, dados individuais em pastilhas, e a tirada descartada pela vantagem/desvantagem **riscada e a 40% de opacidade** — presente para conferencia, sem competir. Critico veste dourado, desastre veste carmesim, cada um com etiqueta escrita: cor sozinha nao diz o que aconteceu.

Enquanto o servidor nao responde (quem rola e o Durable Object, ha latencia de rede), o card mostra "…" pulsando e o botao vira "Rolando…" e desabilita. Acao sem retorno imediato precisa de estado visivel — senao a pessoa clica de novo.

## Iniciativa: doca unica no canto, nunca modal central (2026-08-02, Etapa 78 — revisa a 77)

Painel de mesa nao bloqueia a mesa. A fase de rolagem nasceu (Etapa 77) como modal central com backdrop e **isso foi revertido**: durante a rolagem o jogador precisa continuar vendo mapa e tokens, e um card de 4 linhas nao justifica escurecer a tela inteira.

O padrao que ficou, reutilizavel para qualquer painel persistente da Mesa:

- **Uma doca, todas as fases.** `#initiativeOverlay` (rolagem) e `#initiativeTracker` (ordem) compartilham posicao e casca: `position: fixed`, `left: calc(60px + var(--sp-3))` — os 60px sao a largura da `.vtt-toolbar`, entao o painel encosta nela sem cobri-la — `bottom: var(--sp-3)`, `width: min(300px, calc(100vw - 60px - 2rem))`, `max-height: min(62vh, 560px)` com a lista rolando por dentro. Trocar de fase **nao muda o painel de lugar**: o olho ja sabe onde olhar.
- **Sem backdrop e sem `aria-modal`.** O container e `role="region"`; nada fica inerte atras dele.
- **Mobile (`<=700px`)**: a toolbar vira faixa horizontal no topo, entao o recuo de 60px deixa de existir — `left`/`right` de `var(--sp-2)` e `max-height: 50vh`.
- **Colapsar e obrigatorio.** Botao `[data-init-collapse]` no canto; sobra so o cabecalho. Preferencia LOCAL — nunca sincroniza.

### O que exige acao vem primeiro, e ocupa a largura toda

Num painel de 300px nao da para espremer nome + meta + botao na mesma linha. Entao a **propria linha** (`.init-row.is-mine`) e tratada como outra coisa: sobe para o topo da lista (ordenacao no JS), ganha retrato maior (34px contra 28px), fundo em gradiente carmesim e o botao em `flex: 1 0 100%` embaixo do nome, com rotulo explicito ("Rolar minha iniciativa"). As outras linhas ficam informativas — um `✓` no lugar do numero enquanto a rolagem corre, porque placar alheio no meio da acao e ruido (e a ordem completa aparece na fase seguinte).

Progresso coletivo vira **barra** (`.init-progress-bar`, 4px) alem do texto: "quanto falta" tem de ser legivel de relance, sem contar linha por linha.

### Destaque da vez: brilho, nao so cor

O item ativo (`.init-entry.is-current`) recebe tres camadas: borda carmesim, gradiente lateral esmaecendo para a direita e o **nome com `text-shadow` duplo pulsando** (`init-turn-glow`, 1,8s). Cor sozinha nao basta — a lista e densa e o item ativo tem de saltar de relance, do outro lado da sala.

Todo movimento adicionado aqui esta dentro de `@media (prefers-reduced-motion: reduce)`: com movimento reduzido, o brilho fica **estatico** (a borda e o gradiente continuam marcando a vez) e os paineis entram sem animacao. Regra geral: destaque nunca pode depender SO da animacao.

## Acessorios do token escalado: px de TELA, nunca de layout (2026-07-31, Etapa 71)

O token inteiro vive dentro de um `transform: scale(var(--token-scale))`, entao
**toda medida em px de layout e multiplicada pela escala**. Acessorios que devem
ter tamanho/posicao constantes na tela (alcas de resize, botao de marcadores,
etiqueta de tamanho, contorno da caixa de selecao) seguem duas regras:

- **Centragem e folga vao DENTRO do transform**, nunca em `margin`/`inset`. A
  ordem importa: `scale(k) translate(...)` — o transform aplica da direita para
  a esquerda, entao o deslocamento e escalado junto e vale px de tela. Com
  `margin: -4.5px` a alca saia do canto e a folga do botao ia de 10px para 80px
  num token 8x.
- **Contorno fino usa `box-shadow: inset`, nao `border`.** Uma borda
  contra-escalada pede largura sub-pixel, e o Blink arredonda qualquer borda
  visivel para 1px de LAYOUT — que a escala do token multiplica de volta. Pior:
  `border` empurra o padding box, e filhos posicionados por `left/top` (as
  alcas) ancoram nele. `box-shadow` e pintura: nao mexe no layout e aceita
  espessura fracionaria.

Regressao coberta em `tests/mesa-token-handles.spec.cjs` (escalas 1/2/5/8/12).

## Espaco abaixo do token e do nome (2026-07-31, Etapa 67; revisto na Etapa 72)

O nome do token fica logo abaixo do circulo e **nada de UI permanente pode ocupar esse espaco**. Por isso o botao de marcadores de status (`.mesa-token-markers-btn`) fica ACIMA do token, nao embaixo. Acessorios permanentes do token selecionado vao para cima; se ja houver chips de condicao la, o acessorio sobe mais (`:has(.mesa-token-markers)`).

**Excecao momentanea (Etapa 72)**: acessorio que so existe durante um gesto pode usar o espaco de baixo, desde que esconda o nome enquanto durar. E o caso da etiqueta de tamanho (`.mesa-token-sizetag`), que aparece so com `is-resizing` — em cima ela caia atras do botao de marcadores, que ocupa o mesmo ponto central.

Regra pratica: **um ponto de ancoragem, um acessorio.** Centro-acima e do botao de marcadores; centro-abaixo e do nome (ou de quem o substitui temporariamente).

## Controle exclusivo do mestre some por atributo, nunca por regra avulsa (2026-08-02, Etapa 75)

Elemento que so o mestre pode ver leva **`data-mesa-master-only`** no HTML. Quem esconde e uma regra unica em `css/mesa-permissions.css`:

```css
body:not([data-role="master"]) [data-mesa-master-only] { display: none !important; }
```

Tres detalhes que fazem essa regra funcionar e que nao podem ser trocados por conveniencia:

- **Seletor negativo, nao `display: none` fixo + override.** Cada controle tem seu proprio `display` (flex, grid, inline-flex); um `display: none` fixo obrigaria a redeclarar o valor certo para o mestre e quebraria layout no dia em que alguem mudasse o componente.
- **`<body data-role="player">` ja vem no HTML.** O padrao e fechado: se o JS falhar, atrasar ou for bloqueado, o jogador continua sem o chrome do mestre. O caminho inverso (revelar por engano) nao existe.
- **Nada de regra por id.** A `.is-master #mesaMapOpenBtn` do `css/mesa-map.css` era o unico obstaculo entre o jogador e o botao "Abrir mapa" — sem `hidden`, sem trava na funcao. A classe `.is-master` continua no body so por compatibilidade; a fonte oficial e `data-role`.

Visualmente o efeito e que a barra lateral do jogador fica com **TOKENS + desenho + dados + zoom** e nada mais: sem MESTRE/MAPA/INIC. (o botao ESCAL. saiu da barra para todos na Etapa 112 — abria o mesmo painel que a camada TOKENS), sem a faixa de mapa no canto superior direito e sem os botoes do canto inferior direito. E uma barra mais curta de proposito — o jogador nao deve nem saber que aquelas ferramentas existem.

## Camada que cobre o palco nao captura o ponteiro (2026-08-02, Etapa 73)

Toda camada do palco que ocupa `inset: 0` e **transparente ao ponteiro por padrao** (`pointer-events: none`); quem captura sao os elementos de dentro (`.mesa-token`, alcas, botoes). Sem isso, subir uma camada na pilha derruba em silencio tudo que estiver abaixo: `#mesaStage` foi para `z-index: 10` na Etapa 66 e matou o desenho, porque passou a engolir todo `mousedown` do palco antes do `#mesaDrawCanvas` (z 8).

Quando uma camada de baixo precisa do ponteiro por um tempo (ferramenta de desenho ativa), ela **sobe acima da pilha enquanto durar** e volta ao lugar depois — controlado por um atributo unico no wrap (`data-draw-active`), nunca por estilo inline espalhado pelo JS.

## Pilha de camadas do palco da Mesa (2026-07-31, Etapa 66)

Ordem oficial, com o comentario-fonte em `css/mesa-stage.css` (regra `.mesa-stage`). Mexeu numa, confira a lista toda — os valores vivem em quatro arquivos diferentes:

| z-index | Camada |
|---|---|
| 0 | `#mesaMapLayer` — mapa |
| 7 | `#mesaGridCanvas` — grade |
| 8 | `#mesaDrawCanvas` — desenhos (sobe para **11** enquanto uma ferramenta de desenho estiver ativa, Etapa 73) |
| 10 | `#mesaStage` — **tokens** (container `pointer-events: none`, Etapa 73) |
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

### Palco ajustado ao mapa (Etapa 52, invariante desde a Etapa 68)

Sempre que ha mapa medido, o `#mesaStageInner` recebe `left/top/width/height`
inline (calculados em `js/mesa-map.js`) e passa a ter a proporcao exata da
imagem — **nao existe mais botao nem checkbox para desligar isso**. Mapa cortado
nao e um estado que a Mesa ofereca. Sobra letterbox no wrap — e essa sobra
precisa ler como "fora do territorio", nao como area jogavel vazia:

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

## Barra de Vida no Token (Etapa 85)

- **So em token de jogador.** NPC e monstro tem vida secreta por regra de mesa; Echo tem maximos geridos fora da Mesa. Barra neles entregaria informacao que o mestre controla de proposito.
- **Acima do token, simplificada**: 5px, cantos arredondados, trilho quase preto e preenchimento em carmesim (`rgba(214,92,92)` → `rgba(176,47,57)`). Sem numeros e sem rotulo — numero e assunto do inspetor.
- **Todos veem a de todos.** A barra existe para ler a vida do grupo de relance; presa a regra estrita do inspetor ela perderia a razao de existir. Os numeros seguem restritos.
- **Vida zerada esvazia a barra, nao a esconde.** Barra vazia comunica "caido"; barra ausente comunicaria "sem dado". Sem `maxLife`, ai sim nao renderiza.
- **`position: absolute`, sempre.** A caixa de layout do token minimal e exatamente o avatar, e e ela que a grade usa para encaixe e a caixa de selecao para o `inset: 0`. Qualquer elemento novo em fluxo normal dentro do token estica essa caixa e quebra o snap — vale para a barra, para o nome e para o que vier depois.
- Escala junto com o token (nao se contra-escala como as alcas): a barra e leitura da largura dele.
- **Quem escala junto e quem nao escala nao podem se posicionar pela mesma folga (Etapa 114).** A barra escala com o token (px de LAYOUT); a esfera de status e contra-escalada e a folga dela e de TELA. Enquanto a esfera se ancorava em `bottom: 100%` + `translateY(-10px)`, a barra de um token grande subia alem dessa folga e a esfera ficava POR CIMA dela. A ancora de quem precisa ficar depois de um elemento que escala tem de ser de LAYOUT, com os mesmos numeros dele — `--token-life-gap` / `--token-life-h` sao a fonte unica desses numeros. Regra geral: **elemento contra-escalado so pode se posicionar em relacao a algo que tambem nao escala; contra qualquer outro, a distancia varia com o zoom e um dia encosta.** E por isso que o teste mede em TRES escalas: numa so, o bug passa.
- **Ver a barra e escolha de quem ve (Etapa 114).** Checkbox no painel pessoal do jogador, preferencia LOCAL (`mesaShowLifeBars`, default ligada): nao entra na cena e nao e transmitida — ninguem perde informacao por escolha alheia. O texto de apoio ("Vale so para a sua tela") e parte da opcao, nao enfeite: sem ele parece que o jogador esta escondendo a propria vida do mestre. Desligada, a barra sai com `display: none` — barra apenas invisivel ainda satisfaz o `:has()` que posiciona a esfera, que ficaria flutuando no vazio.

## Controle Desarmado Nao Pode Parecer Armado (Etapa 81)

Regra geral, nascida do desenho que ficava morto durante o boot da Mesa: **se um controle ainda nao faz nada, ele nao pode ter aparencia de clicavel.** Um botao que responde ao hover e ao clique sem nenhum efeito e pior do que um botao apagado — o usuario culpa a si mesmo, tenta de novo, e nao tem como saber que o modulo ainda esta carregando.

- Botao de barra que depende de um modulo assincrono nasce `disabled` no HTML e e liberado pelo `init` do proprio modulo. Se o boot falhar, ele fica desabilitado — que e a verdade.
- `.vtt-tb-btn:disabled` (css/mesa.css): opacidade 0.4, cursor normal. O `:hover` da barra exige `:not(:disabled)`, senao o botao apagado ainda acende sob o cursor.
- O estado tem um gancho legivel para teste e para CSS: `data-draw-ready="true"` no `#mesaStageWrap` quando o desenho arma.
- **`data-armed="1"` (Etapa 82, convencao do projeto na Etapa 84)**: todo modulo marca os botoes que arma, em TODAS as paginas — nao so na Mesa. Handler registrado por `addEventListener` nao aparece no elemento, e handler delegado nem sequer esta nele; `getEventListeners` so existe no DevTools. Sem o marcador, "este botao faz alguma coisa" nao e verificavel.
- Controle que nasce `hidden` **nao** cai nesta regra: oculto nao promete nada. O problema e prometer e nao cumprir.
- **Vale para botao ESTATICO** (presente no HTML servido). Botao renderizado em runtime e criado pelo modulo que ja esta vivo — por construcao nao nasce morto, e exigir marca dele seria ruido sem risco correspondente.
- Verificado por `npm run test:controles` (`tests/controles-armados.spec.cjs`), que roda nas seis paginas e reprova botao estatico visivel e habilitado sem `onclick` inline nem `data-armed`.

### Tela que ainda carrega nao pode aceitar edicao (Etapa 83)

Extensao da mesma regra para formularios. A Ficha aparecia inteira e editavel enquanto os dados vinham da rede: quem digitasse perdia o texto quando a resposta preenchia os campos.

- Enquanto carrega: `data-sheet-loading="true"` + `inert` no container. `inert` e o que importa — `pointer-events: none` sozinho ainda deixa entrar por Tab.
- Sempre com **sinal visivel**: opacidade reduzida, `cursor: progress` e uma etiqueta dizendo o que esta acontecendo (`#sheetScreen[data-sheet-loading]::after` em css/ficha.css). Bloquear sem avisar troca um bug por outro — a tela fica so misteriosamente sem reagir.
- Destravar sempre em `finally`: carga que falha nao pode deixar a tela travada para sempre.

## Um Controle, Dois Papeis (Etapa 116)

Quando o mesmo botao significa coisas diferentes para mestre e jogador, o nome
e o icone mudam com o papel — e a troca e **declarativa**: duas variantes no
HTML (`data-role-label` / `data-role-icon`) e o CSS escolhendo por
`body[data-role]`. Nao renderizar por JS evita o piscar e mantem o markup
legivel.

- **O padrao e a variante do JOGADOR.** `applyMesaRolePermissions()` so roda no
  DOMContentLoaded; comecar pelo mestre mostraria chrome de mestre a todos ate
  la. Mesma logica fail-closed do resto das permissoes.
- **`title` e `aria-label` NAO sao alcancados por CSS.** Trocar so o que se ve
  deixa o leitor de tela e o tooltip falando pelo papel errado — esses dois vao
  no `applyMesaRolePermissions()`.
- **Rotulo de duas palavras cabe?** Os botoes da barra tem 49px e
  `overflow: hidden`: um rotulo maior e cortado sem aviso. Quebre em duas
  linhas antes de encolher a fonte — tamanho de texto diferente do vizinho
  desmonta a barra, e o teste deve medir o estouro, nao so o texto.

## O Que Evitar

- excesso de ornamento
- sombras exageradas sem funcao
- caixas de tamanhos incoerentes
- espacamentos irregulares
- alinhamentos quebrados
- brilhos coloridos fora da paleta
- aparencia de painel generico claro

## Controles continuos no flyout de desenho (2026-08-25, Etapa 122)

Grossura e opacidade usam `input[type=range]` com rotulo a esquerda e `output`
a direita (`.draw-slider-row`), no lugar dos tres botoes fixos anteriores. A
regra: **quando o intervalo util e continuo, o controle e continuo** — tres
degraus (2/4/8) escondiam nove dos doze valores que o Worker aceita.

O `input[type=color]` nativo e feio por padrao em todo navegador; ele e
reduzido a um retangulo da propria cor (`::-webkit-color-swatch`,
`::-moz-color-swatch` sem borda). O quadrado de preview ao lado da paleta
mostra a cor JA com a opacidade aplicada — e o unico lugar onde da para ver o
resultado antes de desenhar.

## Fonte em canvas nao aceita variavel CSS (2026-08-26, Etapa 123)

`ctx.font = "700 25px var(--font-ui, ...)"` e string INVALIDA: o canvas usa o
parser de fonte do CSS, que so resolve variaveis no contexto de um elemento.
O navegador ignora em silencio e mantem `10px sans-serif` — o texto aparece,
minusculo, e nada avisa. Resolva a variavel antes
(`getComputedStyle(document.body).getPropertyValue("--font-ui")`) e passe o
valor literal. Teste de canvas com texto deve medir TAMANHO do que foi pintado;
contar pixels nao distingue rotulo certo de rotulo microscopico.

## Fonte em canvas: a regra fica, o caso de uso foi embora (2026-08-27, Etapa 126)

A ferramenta de texto do palco saiu (ver DEV_STATUS, Etapa 126) e com ela o
campo flutuante `.mesa-draw-text-input` e o controle de quebra de linha. A
regra da secao anterior — `ctx.font` nao aceita `var(--...)` — continua valendo
para qualquer texto que volte a ser pintado em canvas.

Fica tambem o detalhe que a barra ensinou: `hidden` num elemento com
`display: flex` NAO esconde nada, a regra de display vence o padrao do
navegador. Linha de barra que entra e sai precisa da contrapartida explicita
no CSS.

## Enfeite do token mede em pixels de TELA; so o que le o token escala (2026-08-27, Etapa 127)

Tudo que orbita o token — alcas, esfera de status, etiqueta de tamanho e,
desde esta etapa, a ESPESSURA e a FOLGA da barra de vida — tem tamanho e
distancia constantes em px de tela, via `--token-chrome-counter`
(`calc(1 / (var(--token-scale) * var(--stage-zoom)))`). O que continua preso
ao token e so o que o MEDE: a largura da barra (78% dele).

A regra existe porque a alternativa ja falhou duas vezes com o mesmo sintoma:
enfeite ancorado em px de layout e multiplicado pelo `scale()` do token, e num
token 8x o botao de marcadores ia parar a 80px do circulo (Etapa 71) — e
voltou a ir quando a Etapa 114 reancorou o botao pelos numeros da barra, que
tambem eram de layout. Enfeite que escala nao e enfeite maior: e enfeite
longe.

**Nunca use `border` para contorno contra-escalado.** O navegador arredonda
espessura de borda fracionaria para 1px inteiro e, com `box-sizing:
border-box`, esse arredondamento vira piso de altura — foi assim que a barra
de 5px de tela virou 12px num token 6x. Contorno de elemento contra-escalado
vai em `box-shadow` (pintura, aceita fracao, nao entra na caixa), como ja
fazia `.mesa-token-selbox`.

## Superficie que trata o proprio gesto declara `touch-action: none` (2026-08-27, Etapa 129)

O `.mesa-stage-wrap` desenha, seleciona, pana e da zoom com o dedo. Sem
`touch-action: none` o navegador assume que o primeiro movimento e rolagem da
pagina, rola, e **cancela o ponteiro no meio do gesto** — o traco morre pela
metade e a culpa parece do codigo.

A regra vale para qualquer superficie que passe a tratar gesto proprio: ou ela
declara `touch-action: none`, ou o navegador leva o gesto embora. E o par
obrigatorio de `setPointerCapture`: um garante que os eventos continuem
chegando, o outro que eles cheguem desde o comeco.

## Opacidade se mede no PIXEL, nunca na string da cor (2026-08-27, Etapa 130)

Um traco a 100% de opacidade saiu 12% transparente por semanas. A cor estava
certa (`#40b8e8`), o slider estava certo, e os testes de opacidade — que
comparavam a string da cor — passavam. O que faltava era medir o que chegou na
tela: `getImageData` e olhar o canal alfa.

A causa vale como regra propria: **estado que nao se declara acaba herdando o
padrao de outro**. A cor de 6 digitos significava duas coisas ao mesmo tempo —
"traco novo, opaco" e "traco antigo, 88%" — e o desenho nao tinha como
distinguir. Fazer o traco novo declarar sempre o proprio alfa (`ff` inclusive)
separou os dois sem tocar em desenho nenhum ja existente.

E, em forma composta de corpo + cabeca (a seta), **as partes nao podem se
sobrepor**: com opacidade parcial a area comum recebe tinta duas vezes e vira
uma emenda mais escura. O corpo para meia espessura antes da base para a ponta
arredondada terminar exatamente nela.

## A regua tambem e enfeite: mede-se em tela (2026-08-27, Etapa 131)

O overlay da regua e filho do `#mesaStageInner`, que o zoom do palco escala.
Resultado: a 40% a linha saia com menos de 1px e o rotulo ilegivel; a 250%
virava tarja. Mesma regra da Etapa 127 — **o que serve para LER o palco mede-se
em px de tela**; so o que representa o mundo escala com ele.

Linha, pontas e rotulo sao contra-escalados por `--stage-zoom` (sem
`--token-scale`: a regua nao pertence a token nenhum). Vale tambem o tamanho
minimo de leitura: o rotulo passou de 0,74rem para 0,95rem com peso 700 — chip
de medida e informacao de combate, nao legenda.

Detalhe de implementacao: em SVG, `stroke-width` e `r` aceitam `calc()` com
`var()` — e `getComputedStyle` devolve `"calc(8.75px)"`, com o calc em volta.
Teste que fizer `parseFloat` nesse valor recebe `NaN` e passa por acidente.

## Contorno dentro de contorno nao — quem some e o CONTAINER (2026-08-28, Etapa 135)

Um botao de icone dentro de um overlay do HUD tem DUAS molduras: o quadrado do
proprio botao e o retangulo do container. Uma delas sobra.

**Some a do container, nunca a do botao.** O quadrado do botao e o alvo de
clique e o limite do icone — sem ele fica um simbolo solto no vidro, sem
comeco nem fim. Ja o fundo/borda do overlay existe para AGRUPAR: com dois ou
mais controles ele faz esse trabalho; com um botao so, e um retangulo em volta
de outro retangulo.

Precedente que ja existia e que esta regra so generaliza: `.vtt-overlay-tl`
abriga apenas o botao de tela cheia e ja abria mao de padding, fundo e borda,
deixando o quadrado do botao aparecer. Na Etapa 135 o `.vtt-overlay-tr` passou
a fazer o mesmo **na tela do jogador**, onde a Etapa 134 deixou a engrenagem
sozinha. Para o mestre a moldura fica: la ela agrupa nome do mapa, "Limpar
mapa" e a gaveta de cenas.

Ao testar isso: **borda que nao pinta se mede por largura ou estilo, nunca por
cor**. `border: none` deixa a cor computada em `currentcolor` — um teste que
olhe `borderTopColor` acusa moldura onde nao ha nenhuma.

## Painel vazio ainda e painel (2026-08-28, Etapa 135)

O painel de configuracoes do jogador esta vazio de proposito ate ganhar
opcoes. Sem altura minima ele encolhia para a altura da unica frase que tem
dentro e deixava de parecer um painel: virava um balao de aviso pendurado
abaixo da barra.

O corpo reservado (`.mesa-map-settings-empty`, 140px) cresce **para baixo** —
o painel e ancorado no topo, logo abaixo da barra do mapa (`top` derivado de
`--hud-overlay-h`, nunca um numero medido a mao). Entao a reserva alonga o
rodape sem deslocar o topo: a relacao com a barra que o abriu fica intacta.
Quando os controles do jogador existirem, a reserva sai junto com o paragrafo
de aviso.
