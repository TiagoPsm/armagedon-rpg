# Iluminacao Dinamica — Proposta de Arquitetura

> Estado em 2026-09-20: nucleo, interface e integracao de servidor implementados localmente.
> Regras confirmadas pelo Tiago em 2026-09-18 estao registradas abaixo.
> Atualizacao em 2026-09-21: API publicada como beta; painel identificado como Beta para distribuicao via GitHub Pages. Homologacao de sessao mestre/jogador acompanhada em DEV_STATUS.md.

## Uso da interface implementada

Botao direito no palco sai de qualquer ferramenta mantendo o que ja foi criado. No poligono, salva os trechos entre os pontos clicados sem fechar automaticamente; ponto isolado e previa do cursor sao descartados. Use Finalizar poligono para fechar a forma. O rotulo mostra o modo ativo, vertices e ultimo trecho ficam destacados; ao apagar/trancar, o segmento sob o cursor fica branco.

O mestre abre a **engrenagem da cena > Paredes e visao** e escolhe **Criar parede** ou **Criar porta**. Parede oferece ponto a ponto (cadeia aberta), poligono (fecha no primeiro ponto ou em Finalizar poligono) e retangulo (dois cantos opostos). A previa tracejada acompanha o cursor. Poligono e retangulo sao salvos como um unico passo de desfazer. Escape cancela a forma ainda nao confirmada; na cadeia preserva os segmentos ja criados.

Criar porta usa dois pontos: sobre a mesma parede, recorta o trecho e preserva as partes laterais; num vao livre, adiciona o segmento da porta. Ela nasce fechada e destrancada. Com visao individual ativa, o jogador proximo, dentro do cone e sem barreiras intermediarias pode abrir: o vao deixa de bloquear visao e movimento, sem revelar alem do campo atual nem remover nevoa manual. Portas nao recortam varias paredes sobrepostas de uma vez.

Concluir edicao, fechar as configuracoes ou recolher a secao sai da ferramenta e descarta a previa. Campo de visao, simulacao, apagar trecho e trancar porta ficam em Ajustes e correcoes. Desfazer/refazer continuam acessiveis junto das ferramentas.

Ativar visao individual aplica cone de 120 graus (configuravel), preto fora do campo atual e colisao de disco. Simular visao usa o token selecionado; o jogador usa apenas o proprio personagem. Setas giram 15 graus. Portas proximas e visiveis oferecem Abrir. Redimensionamento e arrasto coletivo ficam desativados enquanto a visao estiver ativa.

`mesa-vision-rules.js` valida acoes; o Worker persiste com revisao e CAS. O cliente restaura a ultima posicao aceita se a acao remota falhar. Movimento remoto e enviado ao soltar, nao durante cada frame. Cena legada permanece desativada. Nao ha alturas, tochas, memoria de exploracao ou protecao do mapa contra DevTools.

Editor usa segmentos encadeados, sem arrasto de vertices ou desenho livre nesta versao. Limites e verificacao externa sao acompanhados somente em `DEV_STATUS.md`.

## Primeiro incremento implementado — 2026-09-18

`js/mesa-vision-geometry.js` expoe `globalThis.MesaVisionGeometry` sem DOM,
timers ou I/O. O mesmo arquivo aceita script classico ou importacao nativa.
O renderer nao e dono da geometria, conforme a skill `web-game-foundations`.
Nenhuma dependencia, novo servico ou custo foi adicionado.

Contrato efetivo v1 (o restante deste documento descreve a arquitetura-alvo):

```js
const scene = MesaVisionGeometry.prepare({
  schemaVersion: 1,
  enabled: true,
  coneDeg: 120,
  walls: [{ id: "w1", ax: 0.5, ay: 0, bx: 0.5, by: 1, kind: "wall", doorState: null }]
}, 0.75); // altura do mapa / largura do mapa
const origin = { x: 0.25, y: 0.375 }; // centro, nao canto superior do token
scene.polygon(origin, 0); // 0 graus = direita; 90 = baixo
scene.canSee(origin, { x: 0.7, y: 0.375 }, 0);
scene.sweep(origin, { x: 0.7, y: 0.375 }, 0.02); // raio em unidades da largura
scene.canReachDoor(origin, "door1", 0.05);
```

- `normalizeVision(null)` fornece cena desativada, cone 120 e paredes vazias.
- As operacoes geometricas nao leem `enabled`; cabera a integracao aplicar a
  configuracao da cena. Nao ha selecao automatica de personagem ou visao de grupo.
- Pontos de consulta usam `x=u`, `y=v*aspect`. Paredes persistiveis usam `u,v`.
- Toda parede bloqueia visao e movimento; portas `open` nao bloqueiam; `locked`
  bloqueia e nao autoriza alcance. Porta comum nasce `closed`.
- `polygon` retorna os vertices da area atual, sem estado de exploracao.
- `sweep` retorna `{x,y,fraction,blocked}` considerando todo o trajeto do disco.
  Deslizamento tangente e recuo sao permitidos. Origem ja dentro de parede e
  recusada; reposicionamento pelo mestre precisa tratar essa situacao.
- `canReachDoor` verifica apenas geometria/distancia/tranca. Nao verifica dono,
  papel, cena, cone, fog, token sobre a porta ao fechar ou bloqueio de movimento.
- Pontos exatamente na superficie da parede podem ser vistos; nao se pode
  atravessa-la. Origem de visao sobre uma barreira retorna poligono vazio.
- Snapshot preparado e imutavel. Alteracao de porta/parede requer novo `prepare`.
- BVH reduz candidatos de colisao e raios; cruzamentos tambem geram vertices.
  Ha guardas de 5.000 segmentos e 20.000 intersecoes, com erro explicito em vez
  de truncamento. Sao limites defensivos iniciais, nao capacidade/FPS comprovados.
- Ao integrar, qualquer erro de geometria deve manter a mascara preta, nunca
  cair para visao irrestrita. O arquivo ainda nao foi incluido em `mesa.html`.

Testes: `npm run test:mesa:vision`. Cobrem portas, cantos, cruzamentos, tangencias,
mapas retangulares, arrastos rapidos, oraculos independentes e carga de dados.
Nao equivalem a teste visual ou benchmark do navegador. A lista de trabalho
aberto fica somente em `DEV_STATUS.md`, secao Pendencias Vivas.

## Regras confirmadas — 2026-09-18

- Cada jogador ve apenas a partir do proprio personagem, sem visao do grupo.
- Fora da visao atual tudo volta a preto, inclusive locais ja visitados.
- Primeira versao: geometria de visao, sem tochas, escuridao ou visao no escuro.
- Paredes bloqueiam visao E movimento.
- Mestre posiciona portas; jogadores proximos podem clicar para abri-las.
- Visao em cone orientado para onde o token olha.
- Suportar contornos irregulares, como cavernas; quantidade ainda desconhecida.
- Protecao contra inspecao do navegador ainda precisa de esclarecimento.
- Relevo funciona apenas como barreira opaca nesta versao, sem elevacao navegavel.

## Objetivo

Dar ao mestre uma camada de edicao sobre o mapa para desenhar barreiras de
visao. Cada jogador enxerga o palco a partir dos tokens que controla, e o campo
de visao termina nas barreiras desenhadas pelo mestre.

O sistema deve:

- continuar gratuito, usando o frontend estatico e a infraestrutura Cloudflare
  que o projeto ja possui;
- preservar o funcionamento local/offline da Mesa;
- manter mapa, paredes e visao alinhados em qualquer viewport e nivel de zoom;
- funcionar com mouse, toque e caneta;
- nao misturar paredes semanticas com os tracos visuais de `mesa-drawing.js`;
- degradar de forma segura: sem suporte/erro no calculo, o jogador nao deve
  ganhar visao extra por acidente;
- incluir portas, orientacao e bloqueio de movimento desde a primeira versao;
- permitir evolucao futura para luzes e escuridao.

## O que ja existe e sera reaproveitado

- `mesa-map.js`: conversao palco <-> mapa em coordenadas normalizadas.
- `mesa-grid.js`: grade, escala em metros e snap.
- `mesa-fog.js`: mascara Canvas, composicao e estado persistido por cena.
- `mesa-stage.js`: tokens DOM, ownership, movimento e render incremental.
- `mesa-core.js`: payload, assinatura, persistencia, versao e deltas realtime.
- `mesa-permissions.js`: capacidades master-only e UI fail-closed.
- `cloudflare/src/mesa.js`: normalizacao e filtro da cena por papel.
- `cloudflare/src/mesa-realtime*.js`: relay autenticado e tipos master-only.

O palco atual usa tokens DOM. Canvas deve continuar reservado para superficies
de pixels — desenhos, fog e mascara de visao — sem migrar os tokens para outro
renderer.

## Escolha de tecnologia

### Escolha inicial

Usar Canvas 2D e JavaScript puro.

- `Path2D` para montar os poligonos visiveis.
- `globalCompositeOperation` para recortar a mascara escura.
- `requestAnimationFrame` para agrupar atualizacoes.
- Worker dedicado apenas para a geometria, se o benchmark demonstrar que o
  calculo no thread principal rompe o orcamento de frame.
- `Float32Array` entre Worker e cliente se a transferencia de vertices virar
  relevante; nao transferir objetos de renderer.

PixiJS/WebGL nao entra na primeira versao. Ele passa a ser candidato se o
produto exigir muitas fontes coloridas simultaneas, sombras suaves e efeitos
animados. Introduzi-lo apenas para uma mascara poligonal duplicaria o sistema
de coordenadas e o ciclo de render da Mesa sem beneficio provado.

### Algoritmo inicial

Calcular um poligono de visibilidade para cada fonte de visao relevante:

1. converter token e paredes para o mesmo espaco cartesiano do mapa;
2. incluir o retangulo limite do mapa como quatro segmentos;
3. disparar raios para cada extremidade de parede, usando `angulo - epsilon`,
   `angulo` e `angulo + epsilon`;
4. para cada raio, conservar a intersecao mais proxima;
5. ordenar os pontos pelo angulo;
6. recortar pelo cone orientado do personagem, incluindo seus dois raios
   limites; alcance inicial vai ate o limite do mapa;
7. exibir somente a visao do proprio personagem. Echos nao concedem visao
   adicional automaticamente.

Esse algoritmo e uma hipotese inicial a medir: testar O(N) raios contra todas
as N paredes custa O(N²) por fonte. Nenhum benchmark de visao foi executado.
Uma varredura angular O(N log N) pode substituir o nucleo sem mudar o contrato.
As metas e os limites abaixo sao propostas, nao capacidade comprovada.

Armazenar coordenadas normalizadas nao significa calcular distancias no
quadrado 0..1: em um mapa W por H, usar x = u * W e y = v * H. Isso preserva
angulos, circulos e alcance em mapas retangulares. A origem da visao deve ser
o centro real do token. Cruzamentos de paredes precisam virar vertices antes
da varredura; segmentos sobrepostos e degenerados precisam ser normalizados.

Intersecoes, segmentos colineares, token exatamente sobre parede e frestas
entre duas paredes precisam de testes explicitos. O editor deve aplicar snap
magnetico entre vertices proximos para evitar frestas invisiveis.

## Modelo de dados proposto

Tudo fica dentro da linha existente da cena, em coordenadas do mapa `0..1`:

```js
vision: {
  enabled: true,
  mode: "daylight",            // daylight | darkness
  sharedPartyVision: false,
  explorationEnabled: false,
  walls: [
    {
      id: "wall-01",
      ax: 0.125,
      ay: 0.320,
      bx: 0.410,
      by: 0.320,
      kind: "wall",            // wall | door
      doorState: null,          // null | open | closed | locked
      blocksVision: true,
      blocksLight: true,
      blocksMovement: true
    }
  ],
  lights: []
}
```

Regras do contrato:

- IDs estaveis permitem `upsert` e `remove` sem retransmitir tudo.
- Parede e porta usam o mesmo segmento; porta aberta e ignorada no calculo.
- `blocksVision`, `blocksLight` e `blocksMovement` sao separados no contrato;
  paredes comuns bloqueiam visao e movimento na primeira versao.
- Cada token precisa de orientacao persistida (`facingDeg`); abertura do cone
  e configuracao do mestre. Proposta inicial: 120 graus, ainda nao confirmada.
- `lights` nasce vazio e reservado; a primeira etapa nao precisa implementar
  fontes de luz para estabilizar paredes e linha de visao.
- O cliente e o Worker devem compartilhar os mesmos limites e a mesma
  normalizacao. Campo desconhecido nunca pode desaparecer silenciosamente.

Nao fixar 1.000 segmentos como capacidade suficiente: medir cenas de 500,
2.000 e 5.000 segmentos com contornos de cavernas. Estes sao cenarios de carga,
nao garantias. Oferecer polilinha e contorno livre convertido em segmentos,
com simplificacao controlada e previa; preservar cantos e vãos de portas.
Pre-processar geometria ao editar e medir indice espacial/varredura angular
para evitar testar todas as paredes contra todos os raios durante cada gesto.

## Camadas e composicao

Ordem visual proposta:

```text
mapa
  grade
  desenhos
  tokens DOM
  mascara de visao dinamica
  fog manual
  ping, regua e controles efemeros
```

`mesaVisionCanvas` pinta a tela escura e abre os poligonos atualmente visiveis.
O `mesaFogCanvas` continua representando a decisao manual do mestre. Empilhar
as duas mascaras produz a intersecao correta sem destruir o estado atual do
Fog of War.

Mascara com dois estados: visao atual transparente e todo o restante preto
opaco. Nao armazenar historico de exploracao. Tokens fora da visao atual
tambem saem da interacao, nomes, barras, marcadores e leitura acessivel.

Luz e visao sao calculos distintos: uma tocha na sala vizinha nao concede
visao atraves da parede. No modo escuro, a area visivel e a intersecao da
linha de visao com as areas iluminadas, acrescida de eventual visao no escuro
limitada pela mesma linha de visao. O fog manual continua podendo cobrir tudo.

O fog manual pode restringir a visao, nunca revelar por cima de uma parede.

## Editor do mestre

Nova camada `PAREDES` ou `ILUMINACAO`, com capacidade `vision.manage`.

Ferramentas da primeira etapa:

- selecionar segmento;
- desenhar cadeia de paredes;
- mover vertices;
- desenhar contorno irregular com previa de simplificacao;
- posicionar portas nos contornos;
- apagar segmento/selecionados;
- desfazer/refazer local da sessao de edicao;
- snap magnetico entre vertices;
- snap opcional aos cantos/subdivisoes da grade;
- simular a visao de um token selecionado;
- ligar/desligar a visao dinamica da cena.

Gestos:

- clique/toque define o primeiro ponto;
- pontos seguintes continuam a cadeia;
- duplo clique, Enter ou botao explicito conclui;
- Escape cancela somente o segmento em construcao;
- dois dedos continuam reservados para camera, conforme a regra atual da Mesa;
- parede em construcao e local; realtime e persistencia ocorrem ao concluir a
  unidade editavel.

Jogadores nao veem o painel nem podem executar alteracoes autorizadas. Como
os scripts estaticos sao compartilhados, o codigo das funcoes pode chegar ao
navegador; a protecao efetiva depende da autorizacao no servidor, alem das
guardas na UI, nas funcoes globais, no Durable Object e no PUT da cena.

## Realtime e persistencia

Tipos propostos:

```text
mesa:wall:upsert
mesa:wall:remove
mesa:vision:update
```

- Todos sao master-only.
- `upsert/remove` cobrem edicao interativa e portas.
- `vision:update` cobre configuracao global e recuperacao de estado.
- Durante arrasto de vertice, delta no maximo a 10-20 Hz; persistencia apenas
  ao soltar.
- O movimento de token ja sincronizado nao precisa enviar dados novos: cada
  cliente recalcula a propria mascara ao receber a posicao.
- A cena completa no D1 continua sendo a fonte duravel.

Jogador pede interacao por um canal separado, `mesa:door:request`, com ID da
porta e da cena. O servidor verifica dono, posicao aceita, proximidade e
acesso a porta; o pedido nao autoriza editar paredes. Ele publica o resultado
e persiste a porta sem depender de uma aba do mestre aberta. Proposta de
proximidade: uma celula ate o segmento da porta, sem outra parede no caminho.
Distancia definitiva e comportamento de porta trancada ainda serao definidos.

Movimento exige varrer o percurso entre posicoes, considerando o tamanho do
token, para impedir atravessar uma parede num arrasto rapido ou apos snap.
O relay atual de movimento precisa de estado autoritativo e validacao para
suportar isso; verificar so o destino ou confiar no ID declarado nao basta.
Proposta de controle: alca de direcao para girar parado, utilizavel por toque;
giro automatico ao caminhar ainda depende da escolha de gameplay.

Cada delta deve identificar a cena e a revisao da geometria; editar uma cena
em preparo nao pode alterar a cena ativa de outro cliente. Reentradas e
reconexoes recuperam um snapshot antes de aplicar deltas posteriores. O
estado completo nao deve ser enviado em uma mensagem que ultrapasse o limite
do relay: usar deltas pequenos e recuperacao do snapshot via API.

O calculo local e as APIs nativas nao exigem licenca paga. Manter custo zero
de hospedagem depende das cotas e do plano da conta existente, que nao foram
auditados nesta proposta. Nunca gravar mascaras por frame ou calcular visao
na nuvem a cada movimento apenas para reproduzir o efeito visual.

## Regras de recalculo

Recalcular somente quando uma dependencia muda:

- posicao/tamanho do token que fornece visao;
- conjunto de tokens que fornece visao;
- parede criada, movida, removida ou porta alternada;
- raio, angulo ou orientacao da fonte;
- troca de cena/mapa;
- resize do palco.

Zoom e pan locais nao exigem recalculo geometrico em coordenadas do mapa; eles
exigem apenas redesenho da mascara para o novo buffer/transform.

Durante drag:

- um recalculo por `requestAnimationFrame`, com throttle alvo de 20 Hz;
- descartar resultados de Worker pertencentes a geracoes antigas;
- recalculo exato ao soltar;
- cachear segmentos normalizados e seus bounding boxes;
- introduzir indice espacial somente se a medicao justificar.

## Orcamento de desempenho e benchmark obrigatorio

O benchmark deve medir o codigo real da Mesa, em viewport desktop e mobile:

| Cenario | Meta inicial |
|---|---:|
| 1 token de visao, 100 paredes, parado | recalculo < 4 ms |
| 1 token, 500 paredes, durante drag | p95 < 12 ms por atualizacao |
| 1 personagem, 2.000 e 5.000 segmentos irregulares | medir p95; meta < 24 ms |
| mover token por 10 s | nenhuma long task >= 50 ms |
| editar cadeia de 100 paredes | sem frame abaixo de 30 FPS por trabalho da visao |
| 10 min de movimento | memoria volta proxima ao baseline apos GC |

Portoes de decisao:

- Canvas 2D principal permanece se os cenarios-alvo passarem.
- Geometria vai para Worker se o calculo causar long tasks ou p95 acima da
  meta, mas o desenho Canvas continuar barato.
- Indice espacial entra se intersecoes dominarem o perfil.
- PixiJS/WebGL so e reavaliado se a composicao de muitas luzes, e nao a
  geometria, virar o gargalo.

O benchmark existente de `tests/mesa.performance.spec.cjs` deve ganhar cenarios
de visao; nao criar um medidor desconectado da pagina real.

## Seguranca e limite do cliente

Mascara calculada no navegador impede revelacao pela interface normal, mas nao
impede um jogador determinado de abrir DevTools, ocultar o canvas ou ler o JSON
da cena. Tambem e necessario desabilitar hit testing, selecao, nomes e ARIA de
tokens fora da visao; esconder pixels sozinho nao basta para a UX.

Existem dois modelos possiveis:

1. **Confianca da mesa**: jogadores recebem paredes e tokens publicos; o
   cliente mascara o que esta fora da visao. E simples, rapido e barato.
2. **Segredo autoritativo**: Worker e Durable Object calculam/filtram a cena por
   jogador. Isso exige geometria server-side, filtro por socket e uma solucao
   diferente para o arquivo completo do mapa, que ja chega ao navegador.

Recomendacao inicial: modelo 1, mantendo tokens `dm` no filtro server-side que
ja existe. O modelo 2 so deve ser escolhido se resistencia a trapaça for um
requisito real.

## Fases sugeridas

### Etapas internas da primeira versao confirmada

- editor master-only;
- paredes comuns e contornos irregulares;
- cone individual, orientacao do token e preto fora da visao;
- bloqueio de movimento pelo percurso e tamanho do token;
- portas posicionadas pelo mestre e abertas por jogadores proximos;
- simulacao pelo mestre;
- D1, fallback local e realtime;
- testes de geometria, permissao e desempenho.

### Evolucao posterior — iluminacao visual

- luz ambiente da cena;
- fontes de luz fixas ou presas a tokens;
- raio claro e penumbra;
- cor e intensidade;
- alcance e visao no escuro;
- avaliacao de PixiJS/WebGL somente com benchmark.

## Parametros e limites da primeira implementacao

1. Relevo e parede opaca, conforme resposta do Tiago.
2. Mascara visual nao e protecao contra inspecao tecnica do navegador. Nao
   foi autorizada uma expansao para segredo autoritativo de mapa/tokens.
3. Padrao adotado: cone de 120 graus e giro manual parado.
4. Proximidade inicial: uma celula; porta trancada nao abre por proximidade.

Nao exigir uma estimativa exata de segmentos do usuario: medir mapas
irregulares representativos antes de estabelecer limites de uso.

## Referencias pesquisadas

- Foundry VTT, paredes, portas e restricoes:
  <https://foundryvtt.com/article/walls/>
- Foundry VTT, fontes de luz, escuridao e exploracao:
  <https://foundryvtt.com/article/lighting/>
- Roll20, documentacao de Dynamic Lighting:
  <https://help.roll20.net/hc/en-us/sections/360008317214-How-to-Use-Dynamic-Lighting>
- MDN, composicao em Canvas 2D:
  <https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation>
- MDN, OffscreenCanvas e Workers:
  <https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas>
- Red Blob Games, poligonos de visibilidade 2D:
  <https://www.redblobgames.com/articles/visibility/>
- Implementacao JavaScript em dominio publico, usada apenas como referencia:
  <https://github.com/byronknoll/visibility-polygon-js>
- PixiJS, custos de mascaras e filtros:
  <https://pixijs.com/8.x/guides/concepts/performance-tips>
- Cloudflare D1, precos e limites do plano gratuito:
  <https://developers.cloudflare.com/d1/platform/pricing/>
- Cloudflare Durable Objects, precos e hibernacao:
  <https://developers.cloudflare.com/durable-objects/platform/pricing/>
