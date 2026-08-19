# DEV STATUS

Este arquivo registra o estado atual do projeto e deve ser atualizado ao final de cada etapa importante.

## Pendencias Vivas

**Esta e a UNICA lista de pendencias abertas do projeto.** Se nao esta aqui, nao esta aberto. Os blocos de etapa mais abaixo narram o que aconteceu — eles nao abrem pendencia.

Por que a regra existe: ate 2026-08-16 cada etapa escrevia as proprias pendencias dentro do proprio bloco, num arquivo que cresce por cima. Nada obrigava uma etapa futura a voltar e dar baixa. Deu 28 mencoes espalhadas por 9 lugares em 6 formatos, varias mortas ha semanas — uma delas listava "Etapa 7: jogador move o proprio token" como pendente com a secao "Etapa Concluida — Etapa 7" logo abaixo, na mesma tela. `npm run audit:pendencias` reprova quem escrever pendencia fora daqui.

Formato: `- [DONO] item — aberta em AAAA-MM-DD (origem)`. Ao fechar, tirar daqui e registrar a baixa no bloco da etapa que fechou.

- **[Tiago]** Teto de tamanho do token com a grade ligada: o token para por volta de 800% por causa do `_gridMaxCells` (metade do menor lado do mapa). Nao e bug — e decisao de regra de jogo, e esta esperando voce. — aberta em 2026-07-31 (Etapa 71)
- **[Tiago]** Deploy do Worker para os cartoes de cena: `listMesaScenes` passou a devolver `mapUrl`/`tokenCount` (Etapa 89) e isso so vale depois de `npx wrangler deploy --config cloudflare/wrangler.toml`. Sem o deploy a gaveta funciona, mas todo cartao mostra o simbolo neutro e "0 tokens". Dry-run ja conferido. — aberta em 2026-08-18 (Etapa 89)
- **[Tiago]** Credenciais do smoke em producao: `npm run test:mesa:online` precisa de `ARMAGEDON_SITE_URL`, `ARMAGEDON_API_BASE_URL` e usuario/senha de mestre e jogador no ambiente (mais `ARMAGEDON_ONLINE_RELAY_PROBE=1` para a sonda de realtime). Sem elas o spec se pula sozinho e nunca exercitamos producao de verdade. **Desde 2026-08-18 tem mais um teste esperando nessa fila**: o cenario de selecao da Etapa 88 (clique fora do mestre com jogador conectado, contra o Worker e o DO reais). — aberta em 2026-08-16 (conferencia da Etapa 81)

## Regra Obrigatoria de Documentacao

Qualquer alteracao no site deve vir acompanhada de atualizacao nos `.md` relacionados. Este arquivo deve ser atualizado sempre que a mudanca afetar comportamento, arquitetura, arquivos principais, deploy, pendencias ou validacoes.

Registro minimo esperado:

- resumo do que mudou
- arquivos principais alterados
- validacoes executadas
- pendencias ou riscos que continuam abertos

## Projeto

- Nome: Armagedon
- Tipo: portal de campanha de RPG
- Frontend: HTML, CSS e JavaScript puros
- API publicada: Cloudflare Workers
- Banco publicado: Cloudflare D1
- Backend legado Express/PostgreSQL: removido do repositorio em 2026-06-12 (historico preservado no git)

## Fase Atual: Integracao (backend ativo)

- A fase "backend congelado" (2026-06-19 a 2026-07-05) foi ENCERRADA na Etapa 34: o Worker voltou a receber deploys (2026-07-05 e 2026-07-07, ver cloudflare/README.md) para os filtros server-side da camada dm e a cena auto-suficiente.
- Regra atual: `wrangler deploy` sempre com `--dry-run` antes e registro do version ID em cloudflare/README.md.
- Toda funcionalidade nova da Mesa deve funcionar 100% so com `state` + `persistState()` (localStorage). Onde houver sync com servidor, embrulhar em `if (window.AUTH?.isBackendEnabled?.())` — local funciona sem; quando o backend voltar, sincroniza sozinho.
- A fronteira UI->backend ja esta limpa: os modulos `mesa-*.js` falam com a fachada `window.APP` (js/api.js), e quase toda chamada de backend ja esta guardada por `isBackendEnabled()` (cai pro localStorage automaticamente quando o `/health` falha).
- ~~Divida conhecida: fetch direto no endpoint de mapa em js/mesa-map.js~~ — RESOLVIDA na Etapa 40 (2026-07-11): upload/delete de mapa agora passam pela fachada `window.APP` (`uploadMesaMap`/`deleteMesaMap` em js/api.js). Nao ha mais nenhum `fetch` fora da fachada nos modulos `mesa-*.js`.

## Ultima Etapa Concluida (2026-08-18 — Etapa 94: o inspetor virou uma coluna simetrica)

Pedido do Tiago depois da Etapa 92: "refazer essa organizacao e estilo da aba de gerenciamento de token — algo simetrico, que nao quebre e seja estetico".

### O que ainda quebrava a simetria

A Etapa 92 tirou as molduras e alinhou tudo pela esquerda, mas duas coisas continuavam dependendo do TEXTO:

- os botoes de acao tinham 58, 63, 68, 99 e 144px — alinhados so pela esquerda, a borda direita serrilhava;
- nos vitais, o campo do valor atual tinha 83px e o do maximo 46px, e ambos mudavam de largura conforme a quantidade de digitos.

### O que mudou

**Alternadores viraram controles segmentados.** Visibilidade, Camada e Status dos jogadores mostram as duas opcoes lado a lado, metade da largura cada, com a ativa acesa. Ganha-se simetria que nao depende do rotulo — e some a ambiguidade de antes: um botao escrito "Visivel" nao dizia se aquilo era o estado atual ou o que aconteceria ao clicar.

A acao passou de `toggle-*` para `set-*` com o valor desejado (`data-value`). Clicar no lado que ja esta ativo e no-op — com "toggle" seria o contrario: desligaria justamente o que a pessoa apontou como certo. O lado ativo continua clicavel e focavel (nao usa `disabled`, que o tiraria do teclado), e carrega `aria-pressed`.

**Tudo fecha nas duas bordas.** Segmentados, "Editar marcadores" e o par Centralizar/Retirar (grade 50/50) vao de borda a borda: medido, todo controle de acao comeca em 1179 e termina em 1414.

**Vitais equilibrados.** O stepper virou `30px 1fr 30px auto 1fr`: atual e maximo com a mesma largura (66px cada, nos dois cartoes), independente dos digitos.

**Uma altura so.** O segmentado tem 26px; os `mini-btn` da secao foram para 26px tambem — a mesma coerencia que a Etapa 92 aplicou aos tamanhos de fonte.

### Duas descobertas no caminho

1. **`width: 100%` nao esticava o botao de marcadores.** O bloco que o contem e filho de um flex com `align-items: flex-start`, entao nascia do tamanho dos chips — e 100% de um pai encolhido para no meio da coluna. Corrigido com `width: 100%` no bloco.
2. **`css/mesa-roster.css` sobrepoe o `.mini-btn` global** (que usa `--fs-2xs`, 11px) por `0.6rem` = 9,6px. Por isso o segmentado, usando o token, saia 1,4px maior que os vizinhos. O segmentado passou a usar 0,6rem, com o porque anotado no CSS. **Fica o alerta**: uma regra global de componente redefinida dentro de `mesa-roster.css` e surpresa esperando a proxima pessoa — vale unificar algum dia.

### Verificacao

Tres testes novos em `tests/mesa-audit.spec.cjs` (bloco "Inspetor: coluna simetrica"), que cobram o que sobrevive a mudanca de texto: todo controle de acao fechando nas duas bordas; atual e maximo com a mesma largura nos dois vitais; e o segmentado dizendo o estado (`aria-pressed`) com o lado ativo sendo no-op.

Os dois testes da Etapa 92 foram reapontados, sem afrouxar: o de alinhamento passou a medir o BLOCO de controle em vez do botao interno (o segmentado tem borda propria e o primeiro botao fica 1px a dentro — comparar botao com rotulo acusaria uma desigualdade que nao existe). O de altura continuou exigindo uma altura so; foi o CSS que se ajustou a ele, nao o contrario.

Suites: `test:mesa:audit` 178, `test:mesa:permissoes` 15, `test:mesa` 5, `test:mesa:tokens` 10, `test:controles` 6, mais `check:js`, `audit:static`, `audit:pendencias` e `build:pages`.

### Arquivos

`js/mesa-inspector.js`, `js/mesa-stage.js` (acoes `set-*`), `css/mesa-inspector.css`, `css/mesa-stage.css`, `tests/mesa-audit.spec.cjs`, `mesa.html` (cache-busting), `tools/build-pages.cjs`.

## Etapa Anterior (2026-08-18 — Etapa 93: o +/- de Vida nao commitava)

Relato do Tiago: "a vida do token nao atualiza em tempo real, nem na mesa, nem na ficha, nem acima do token".

### O que a medicao mostrou

Tres sintomas, uma causa — e a cadeia de sincronizacao estava inteira. Medido antes de mexer, com espiao no `broadcastMesaSheetPatch`:

| acao | estado do token | barra acima do token | patch para a rede |
|---|---|---|---|
| clicar no `+` | 8 (parado) | 66,7% (parado) | **0** |
| digitar o valor | 3 | 25% | 1 |

Ou seja: **digitar funcionava, clicar no botao nao**.

### Causa

O stepper (`js/mesa-inspector.js`) atualizava o campo e disparava `new Event("change")`. O inspetor escuta **`input`** (`handleInspectorStatInput`, ligado em `js/mesa-core.js:419`) e `focusout` — ninguem escuta `change` ali. Entao o botao so mexia no numero da tela: nada gravava na ficha, nada redesenhava a barra do token, nada saia para os outros clientes.

Digitar funcionava porque digitacao dispara `input` de verdade. Era essa a assimetria — e como o mestre usa o botao, o efeito era "nao atualiza em lugar nenhum".

Vale registrar o que **nao** era: o caminho de propagacao (ficha local, `mesa:sheet:patch` pelo DO, `sheet:changed` que faz a ficha recarregar) estava correto o tempo todo. Nenhuma linha dele precisou mudar.

### Correcao

Uma linha: o stepper passa a disparar `input`, o evento que o inspetor escuta.

### Verificacao

Tres testes em `tests/mesa-audit.spec.cjs` (bloco "Inspetor: +/- de Vida commita de verdade"), cobrindo exatamente os tres lugares que o Tiago citou: o estado do token, a ficha gravada e a barra desenhada acima do token — mais um que confirma que o botao transmite o patch para a rede, e outro que o teto da ficha continua respeitado.

Voltando o `change`, **os tres reprovam**.

Nota de teste: a primeira versao do teste da barra leu a largura logo apos o clique e reprovava de vez em quando — `scheduleMesaRender` e assincrono. Virou `expect.poll`, e a suite rodou tres vezes seguidas verde. Era corrida do teste, nao do site.

### Arquivos

`js/mesa-inspector.js`, `tests/mesa-audit.spec.cjs`, `mesa.html` (cache-busting), `tools/build-pages.cjs`.

## Etapa Anterior (2026-08-18 — Etapa 92: a secao "Acoes" do inspetor)

Relato do Tiago, com print: "precisamos organizar essa parte, esta totalmente quebrada". Era a secao **Acoes** do inspetor de token (Visibilidade / Camada / Marcadores / Palco).

### O que a medicao mostrou

Nao era impressao — os numeros, colhidos na tela antes de qualquer alteracao:

| | antes | outros controles |
|---|---|---|
| "Editar marcadores" — fonte | **16px** | 9,6px |
| "Editar marcadores" — largura | **228px** (faixa inteira) | 58-99px |
| "Nenhum" — fonte | 12,8px | rotulos a 9,3px |
| "Nenhum" — alinhamento | encostado a **direita** | rotulos a esquerda |

Tres causas independentes:

1. **`font-size: inherit` em `.mesa-token-markers-btn.is-inspector`.** A regra existia para anular o estilo da variante que vive no token; de quebra anulava tambem o tamanho do `.mini-btn` e o botao herdava ~16px do painel. Dai a largura de 228px: o texto em caixa alta, nesse tamanho, ocupa a faixa toda.
2. **Alinhamento a direita sobrando de um layout antigo.** `.inspector-marker-summary` e `.inspector-marker-chips` ainda tinham `justify-content: flex-end` (e `max-width: 150px`) de quando a linha era "rotulo a esquerda, conteudo a direita". Depois que a linha virou coluna, isso jogava "Nenhum" e os chips contra a borda direita.
3. **Uma caixa por acao.** Cada `.inspector-action-row` tinha borda e fundo proprios, dentro da secao que ja e uma caixa: quatro molduras competindo em 234px de largura.

### O que mudou

- A secao voltou a ser **um bloco so**: as molduras por acao sairam, e cada acao e um grupo rotulo + controle separado por espaco (escala de 4px do projeto, `--sp-*`, no lugar de 0,3rem / 0,4rem 0,5rem soltos).
- **Uma coluna de alinhamento**: rotulos, controles e o resumo de marcadores partem todos da mesma borda esquerda.
- **Um tamanho de controle**: todo botao da secao usa a escala do `.mini-btn` (9,6px, 21px de altura). O `line-height: 0` — que existe para o icone da variante do token — passou a ser escopado com `:not(.is-inspector)`, o que tirou os 2px de diferenca de altura que sobravam no botao de marcadores.
- No grupo Marcadores, os chips ficam numa linha e o botao na de baixo, os dois alinhados a esquerda: com ate 8 chips, o botao nao fica mais pulando de posicao.

### Verificacao

Tres testes em `tests/mesa-audit.spec.cjs` (bloco "Inspetor: a secao Acoes fala uma lingua so"), que cobram **coerencia, nao pixels**: uma unica escala de fonte e altura entre os controles; uma unica coluna de alinhamento entre rotulos, controles e o "Nenhum"; e nada transbordando a largura do painel.

Vermelho antes do verde: com um `font-size` fora da escala injetado no botao, **dois dos tres reprovam**.

Medido tambem em 1440 e 1024 de largura: nenhum elemento transborda o painel (288px em ambos).

### Arquivos

`css/mesa-inspector.css`, `css/mesa-stage.css`, `tests/mesa-audit.spec.cjs`, `mesa.html` (cache-busting), `tools/build-pages.cjs`.

## Etapa Anterior (2026-08-18 — Etapa 91: o clique chega a quem foi clicado)

Relato do Tiago: "nao consigo selecionar nenhuma opcao, onde quer que eu clique abre os efeitos de status". Com um token selecionado, nenhum botao do inspetor respondia — Visibilidade, Camada, Centralizar, Retirar. Todo clique abria o painel de marcadores.

### Causa: um pseudo-elemento solto

Duas regras de `css/mesa-stage.css`, ambas da Etapa 64 (f920bcb, 2026-07-30):

```
.mesa-token-markers-btn::before          { position: absolute; inset: -6px; }  /* alvo maior */
.mesa-token-markers-btn.is-inspector     { position: static; }                 /* anula o do token */
```

Um `::before` absoluto dentro de um dono `static` **nao se ancora no dono**: sobe ate o ancestral posicionado mais proximo. No inspetor esse ancestral e a `.vtt-body` — medida na sonda: **1400x835**. O alvo invisivel de 6px virava a Mesa inteira. E como evento em pseudo-elemento conta como evento no elemento dono, todo clique caia em `.mesa-token-markers-btn` e o handler de `pointerdown` (captura, em js/mesa-markers.js) abria o painel de status.

Por isso so aparecia com token selecionado: sem selecao o botao "Editar marcadores" nao existe, e o alvo fantasma nao existe com ele.

### Correcao

O alvo ampliado passou a valer so na variante do token: `.mesa-token-markers-btn:not(.is-inspector)::before`. No inspetor o botao ja tem tamanho normal e nao precisa dele. A alca (`.mesa-token-handle::before`) usa o mesmo truque **com seguranca**, porque la o elemento dono e `position: absolute` — foi conferido.

### Verificacao

Tres testes em `tests/mesa-audit.spec.cjs` (bloco "Inspetor: o clique chega a quem foi clicado"). Eles olham **quem recebe o clique**, nao a regra de CSS: sobrevivem a qualquer reescrita do estilo.

- cada botao do inspetor recebe o proprio clique (`elementFromPoint` no centro de cada um);
- clicar em Visibilidade alterna a visibilidade **e** nao abre os marcadores;
- o alvo do botao de marcadores nao alcanca 120px acima dele.

Reintroduzindo a regra antiga, **dois dos tres reprovam** — incluindo o sintoma exato que o Tiago descreveu.

Diagnostico feito com sonda no navegador (`getComputedStyle(btn, "::before")` + `elementFromPoint` em cada `.mini-btn`), que mostrou botoes recebendo o clique de outro elemento antes de qualquer alteracao de codigo.

### Licao que fica

`position: static` num elemento que tem `::before` absoluto de alvo de clique e uma armadilha silenciosa: nada quebra visualmente, o alvo so vaza. Registrada em VISUAL_RULES.md.

### Arquivos

`css/mesa-stage.css`, `tests/mesa-audit.spec.cjs`, `mesa.html` (cache-busting), `tools/build-pages.cjs`.

## Etapa Anterior (2026-08-18 — Etapa 90: cada cena com o seu mapa, e so ele)

Etapa nascida de uma pergunta do Tiago depois da 89 — "da para validar se cada cena tem apenas o seu mapa?". Nao tinha: o mestre trocava de cena e continuava com o mapa da anterior, **e gravava esse mapa dentro da cena nova**.

### O vazamento, como foi medido

Tres cenas em sequencia, lendo o palco e o payload que vai para o D1:

| | Mestre — palco | Mestre — payload | Jogador — palco |
|---|---|---|---|
| Cena A (mapa A) | mapa A | mapa A | mapa A |
| Cena B (sem mapa) | **mapa A** | **mapa A** | vazio |
| Cena C (mapa C) | **mapa A** | **mapa A** | mapa C |

O jogador ja estava certo nos tres casos. A coluna do meio e a grave: bastava o mestre mexer um token depois da troca para o mapa da cena A virar o mapa OFICIAL da cena B no D1 — e dali alcancar os jogadores e os cartoes da gaveta da Etapa 89.

### Causa

Duas guardas em `_applySceneMapRef` (js/mesa-map.js), escritas quando existia **uma cena so**:

- cena sem mapa nao limpava nada para o mestre (`if (!_isMasterRole() && ...)`);
- `if (mesaMapState.activeMapUrl) return;` — "o local manda".

As duas protegiam algo legitimo: o mestre carrega o mapa localmente (blob/IndexedDB) antes de ele existir no R2, e um persist nao podia apagar esse trabalho. Faltava a pergunta que so passou a existir com multi-cena: **de que cena e o mapa que estou exibindo?**

E nao era caso de borda — depois da primeira cena com mapa, `activeMapUrl` fica preenchido, entao todo mestre caia nisso.

### O que mudou

- **O mapa local passou a saber a que cena pertence** (`mesaMapState.mapSceneId`), e a chave do `localStorage` virou por cena (`tc_mesa_active_map_<sceneId>`; a cena `default` mantem a chave legada — zero migracao, mesma convencao de `mesaSceneStorageKey` em mesa-core.js).
- **As duas guardas agora perguntam pela cena**: o mapa local so manda se for DESTA cena; se for de outra, quem manda e a cena (adota o mapa dela, ou fica sem mapa).
- **`getMesaSceneMapPayload()` nunca devolve mapa de outra cena.** E esta linha que impede o persist de gravar o mapa errado no D1.
- **Trocar de cena nao apaga mapa de ninguem**: `_trocarMapaLocalDaCena()` solta o mapa da tela e tenta restaurar o mapa local DESTA cena do IndexedDB — diferente de `clearActiveMap()`, que e uma decisao do mestre e apaga o mapa oficial (R2 + cena). Isso importa porque mapa local nem sempre chega ao R2 (o upload e ultimo recurso): sem esse resgate, sair de uma cena e voltar perderia de vista um mapa que so existe naquele navegador.
- **Mapa da pasta conectada tambem virou por cena**: o registro no IndexedDB passou a guardar `sceneId`, e o restore so devolve o mapa na cena dona. Registro antigo, sem o campo, e tratado como da `default` — que era a unica cena na pratica naquela epoca.

### Verificacao

Suite nova `tests/mesa-scene-map.spec.cjs` (6 testes, `npm run test:mesa:scenemap`): a tabela acima virou teste nos dois papeis, mais o retorno a cena de origem, a chave por cena com a legada preservada e o carimbo de cena no mapa local.

Vermelho antes do verde conferido de forma direta: forcando `_localMapBelongsToCurrentScene()` a devolver `true` — que reproduz exatamente a logica anterior — **tres dos seis reprovam**, os tres que descrevem o vazamento.

Um ajuste de fixture foi necessario em `mesa-audit.spec.cjs`: o `seedMapaAtivo` escreve o estado do mapa na mao e nao carimbava a cena, entao o payload saia vazio (que e a protecao nova funcionando). As assercoes do teste ficaram identicas; o seed passou a carimbar, como todo caminho de producao ja faz.

Suites: `test:mesa:scenemap` 6, `test:mesa:audit` 166, `test:mesa:scenes` 13, `test:mesa` 5, `test:mesa:tokens` 10, `test:mesa:permissoes` 15, `test:controles` 6, `perf:mesa` 1, mais `check:js`, `audit:static`, `audit:pendencias` e `build:pages`.

Limite conhecido: o F5 dentro de uma cena especifica e coberto pelo mecanismo (chave por cena), nao por um teste de ponta a ponta com IndexedDB semeado — o Playwright teria de plantar o blob no IDB antes do boot.

### Arquivos

`js/mesa-map.js`, `tests/mesa-scene-map.spec.cjs` (novo), `tests/mesa-audit.spec.cjs` (fixture), `mesa.html` (cache-busting), `tools/build-pages.cjs`, `package.json`.

## Etapa Anterior (2026-08-18 — Etapa 89: gaveta de cenas)

Primeira etapa do redesenho do sistema de cenas pedido pelo Tiago (gaveta que desce do topo, cartoes por cena, engrenagem de configuracoes, pastas). Esta etapa entrega **a gaveta e o fim dos dialogos nativos**; pastas ficam para a Etapa 90 e as configuracoes por cena para a 91.

### O que existia e o que era o problema

O backend de multi-cena esta pronto desde a Etapa 48 (listar, criar, renomear, ativar, excluir + broadcast `mesa:scene:switch`) e **nao foi tocado**. O problema era a UI: 140 linhas desenhando uma listinha espremida dentro do painel do mapa, usando `window.prompt()` para nomear e `window.confirm()` para excluir. Os dois sao barreira de acessibilidade — leitor de tela anuncia mal, nao ha como amarrar rotulo a campo, o popup nativo trava a aba inteira e nao aceita estilo.

### O que mudou

- **Gaveta `#mesaScenesDrawer`**, aberta por um botao proprio no canto superior direito. `role="dialog"`, `aria-modal`, foco preso enquanto aberta, `Esc` fecha e o foco volta para o botao que abriu. O grupo "Cenas" saiu do painel do mapa: gerenciar cena tem um lugar so.
- **Cartoes por cena** com a imagem de mapa que a cena ja tem, nome, contagem de tokens e faixa "ATIVA" (texto, nao so cor de borda). Botao principal do cartao = ativar; na cena ativa ele fica desabilitado com `aria-current`.
- **Dialogo proprio para nomear** (criar e renomear), com erro em `role="alert"` amarrado ao campo por `aria-describedby`. Excluir passou a usar o `UI.confirm` do site.
- **Busca por nome**, com a contagem anunciada em regiao viva (`role="status"`).

### Worker

`listMesaScenes` passou a devolver `mapUrl` e `tokenCount` por cena, extraidos **dentro do SQLite** (`json_extract` / `json_array_length`). Ler `data_json` inteiro so para montar cartao custaria centenas de KB por cena (desenhos e nevoa) vezes ate 20 cenas, a cada abertura. **Precisa de deploy** — enquanto nao subir, o cartao cai no simbolo neutro e "0 tokens", sem quebrar nada.

### Velocidade (pedido explicito do Tiago)

Sem dependencia nova e sem custo: a lista **so e buscada quando a gaveta abre** — o boot e a troca de cena nao pagam requisicao por uma tela que ninguem esta vendo, e ha teste para isso; as miniaturas usam `loading="lazy"` e `decoding="async"` nativos, entao a imagem so desce quando o cartao entra na tela.

Limite honesto: redimensionar imagem no servidor e recurso pago na Cloudflare, entao o cartao reduz o mapa no proprio navegador. Nao e miniatura pronta — e o preco de nao criar armazenamento nem custo.

### Dois defeitos encontrados dentro da propria etapa

1. **A armadilha de foco da gaveta brigava com o dialogo que nasce dentro dela.** `UI.activateModal` vigia o foco e puxa de volta tudo que sai do painel — inclusive o campo de texto do dialogo de nome. O cursor nunca chegava ao campo. Correcao: o dialogo de nome DESLIGA a armadilha da gaveta enquanto vive e a religa ao fechar, ja apontando para o destino final do foco.
2. **`.sr-only` nao existia na Mesa** — estava definida so em `css/echos.css`. Todo texto marcado como "so para leitor de tela" aparecia na tela: a etiqueta da busca e o nome dentro do botao de 40px. Achado na captura de tela, nao em teste. Ficou definida em `css/mesa-scenes.css`, para nao obrigar cache-bust do CSS compartilhado nas seis paginas.

Um terceiro ajuste veio de teste vermelho: o `required` nativo do campo de nome abortava o envio antes do nosso codigo e mostrava a bolha do navegador, que some sozinha e nem todo leitor de tela anuncia. O formulario virou `novalidate` e a validacao passou a ser nossa.

### Verificacao

Suite nova `tests/mesa-scenes.spec.cjs` (13 testes, `npm run test:mesa:scenes`), incluindo: espiao que reprova a suite se `window.prompt`/`window.confirm` voltarem; uma volta inteira de Tab sem escapar da gaveta; `Esc` no dialogo de nome fechando so ele; e a carga preguicosa (zero requisicao com a gaveta fechada).

O SQL novo foi exercitado no motor real (`wrangler d1 execute --local`): `map_url` extraido e `token_count` = 2 na cena de prova. O D1 falso dos testes nao interpreta SQL — faz a mesma conta em JS —, entao erro de sintaxe so apareceria em producao; por isso a checagem no motor de verdade.

Suites: `test:mesa:scenes` 13, `test:mesa:audit` 166, `test:mesa` 5, `test:mesa:permissoes` 15, `test:controles` 6, mais `check:js`, `audit:static`, `audit:pendencias`, `build:pages` e `wrangler deploy --dry-run`.

Os testes de cena que viviam em `mesa-audit.spec.cjs` foram reapontados: o detalhe de UI mudou de casa para a suite nova, e la ficou o que aquela suite sempre protegeu — mestre enxerga o gerenciador, jogador nunca.

### Arquivos

`js/mesa-scenes.js` (reescrito), `css/mesa-scenes.css` (novo), `mesa.html`, `cloudflare/src/mesa.js`, `tests/mesa-scenes.spec.cjs` (novo), `tests/mesa-audit.spec.cjs`, `tests/mesa-online.spec.cjs`, `tools/build-pages.cjs`, `package.json`.

## Etapa Anterior (2026-08-18 — Etapa 88: a selecao sai do fio de vez)

A Etapa 87 fechou cinco portas. Esta tira a chave da casa.

### Por que ainda faltava algo

As cinco correcoes da Etapa 87 eram todas defensivas: cada uma bloqueia um caminho de chegada da selecao alheia. A origem continuava intacta — `selectedTokenId` viajava no payload da cena e vinha carimbado em TODO envelope de realtime. Enquanto o campo estivesse no fio, o proximo caminho novo nasceria quebrado de novo, e a decisao de contrato que a Etapa 87 deixou registrada em aberto era exatamente esta.

### O que mudou

**Selecao agora e estado de tela deste cliente, em chave propria** — `<chave da cena>_selection` no `localStorage`, por cliente e por cena (`mesaSelectionStorageKey`). Tres cortes no `js/mesa-core.js`:

1. **`createMesaRealtimeEnvelope` nao carimba mais a selecao.** Era a municao do defeito 2 da Etapa 87. Sem o campo no fio, nenhum handler futuro consegue marcar token na tela alheia nem por engano.
2. **`createMesaScenePayloadFromState` nao envia mais a selecao ao servidor.** De brinde ela sai da assinatura de dedupe (`normalizeMesaScenePayload` ignora o campo), e isso **conserta o defeito 4 na origem**: era a selecao que fazia as assinaturas divergirem no clique fora e deixava o proprio eco do mestre escapar do curto-circuito. O Worker transmite `mesa:scene` sem `clientId`, entao reconhecer o eco por outro meio nunca foi possivel — agora nao precisa.
3. **Cache de cena nunca mais guarda selecao.** `stripMesaSceneSelection` nos dois pontos que gravam cena remota (boot e tempo real). A Etapa 87 tinha que enxertar ali a selecao deste cliente; agora nao ha o que enxertar.

Detalhes que valem registro:

- **A gravacao da selecao acontece ANTES do dedupe** (`flushPersistState`, js/mesa-stage.js). Sem selecao no payload, marcar e desmarcar produzem assinatura igual — o curto-circuito de assinatura engoliria a gravacao e o F5 remarcaria o token. Seria o defeito 3 renascendo por outro caminho.
- **`readMesaSelectionFromStorage` devolve `null`, nao `""`, quando a chave nao existe.** Confundir "nunca gravei" com "desmarquei de proposito" faria o F5 depois do clique fora buscar a selecao na cena legada e trazer o token de volta. So quando a chave nao existe a cena salva vale como leitura de compatibilidade.
- **`resetPrototype` limpa as duas chaves.** Limpar a cena e deixar a selecao para tras apontaria para um token que nao existe mais.
- **Nenhum deploy de Worker, nenhuma migracao de D1.** O cliente para de mandar o campo; `cloudflare/src/mesa.js` continua tolerante e cena antiga no banco carrega normalmente.

### Verificacao

Quatro testes novos em `tests/mesa-audit.spec.cjs` (bloco "Selecao nao trafega (Etapa 88)"): payload e envelope sem o campo; assinatura identica com e sem selecao (inclusive para cena legada); F5 restaurando a selecao propria e respeitando o desmarcar; e a **trava permanente** — espiao em `state.selectedTokenId` durante cena remota, delta de upsert e delta de move, exigindo **zero escritas vindas da rede**. E esse ultimo que impede uma etapa futura de reabrir a familia inteira.

Vermelho antes do verde conferido no ponto que nao era trivial: desligando a gravacao da selecao em `flushPersistState`, os dois testes de F5 (Etapa 87 defeito 3 e Etapa 88) reprovam.

Os dois testes da Etapa 87 que liam `selectedTokenId` dentro da cena gravada foram reapontados para a chave nova — o que eles cobram nao mudou (desmarcar tem que gravar; cena remota nao contamina o que o F5 le), so mudou onde a selecao mora. O da camada de cache ganhou uma assercao a mais: o cache de cena nao guarda selecao NENHUMA, nem a do emissor nem a minha.

Suites: `test:mesa:audit` 166, `test:mesa` 5, `test:ficha` 32, `test:controles` 6, mais `check:js`, `audit:static`, `audit:pendencias` e `build:pages`.

### Teste em producao (preparado, esperando credenciais)

`tests/mesa-online.spec.cjs` ganhou o bloco "Mesa online - selecao nao trafega (Etapa 88)": mestre e jogador abrem a Mesa publicada em contextos separados, o jogador recebe um espiao em `state.selectedTokenId`, o mestre seleciona um token e clica no espaco vazio, e o teste cobra quatro coisas depois de quatro segundos de janela (tempo do eco do Worker e dos deltas do DO chegarem): a selecao do mestre continua vazia, o jogador nao registrou nenhuma escrita vinda da rede, a cena oficial no D1 nao guarda selecao, e o F5 do mestre nao ressuscita o token.

Importa rodar contra producao porque e o Worker de verdade que devolve o eco ao proprio mestre — o broadcast sai sem `clientId`, e era isso que tornava impossivel reconhecer o proprio eco (origem do defeito 4 da Etapa 87). Efeito colateral na cena real: nenhum, porque marcar/desmarcar nao muda mais o payload e o dedupe de assinatura corta o PUT.

O bloco se pula sozinho enquanto as credenciais nao existirem no ambiente (mesma pendencia aberta desde a Etapa 81). A parte anonima do smoke roda e passa: Pages e API oficiais respondem, endpoints protegidos recusam anonimo.

Verificado sem login que o bundle publicado ja e o desta etapa: `mesa.html` serve `?v=2026-08-18-selecao-fora-do-fio`, o bundle traz `mesaSelectionStorageKey`/`stripMesaSceneSelection`/`writeMesaSelectionToStorage` e **nao tem mais nenhuma ocorrencia de `selectedTokenId: state.selectedTokenId`**.

### Arquivos

`js/mesa-core.js`, `js/mesa-stage.js`, `tests/mesa-audit.spec.cjs`, `tests/mesa-online.spec.cjs`, `mesa.html` (cache-busting), `tools/build-pages.cjs`, `SYSTEM_RULES.md`, `DEV_STATUS.md`.

## Etapa Anterior (2026-08-16 — Etapa 87: a selecao voltava sozinha depois do clique fora)

Relato do Tiago: "clico fora para deselecionar o token, ele desseleciona e depois seleciona de novo". A Etapa 86 tinha consertado o clique; o que sobrou nao estava no clique — **a rede desfazia o que ele fazia**, alguns centesimos depois.

### Como o diagnostico foi feito

Sem backend, o deselect funciona e **fica**: um teste com espiao em `state.selectedTokenId` mostrou uma unica escrita (`"ana" → ""`, mesa-core.js:349) e nada depois. Isso descartou o handler e apontou para os caminhos de rede. Cada suspeita virou um teste, e **quatro falharam** — quatro defeitos independentes, todos capazes de ressuscitar a selecao sozinhos.

### Os quatro defeitos

**1. `pickInitialSelectedToken` inventava selecao (a raiz).** Terminava em `return visibleTokens[0].id`: como `""` nao casa com nenhum id, **toda cena aplicada sem selecao marcava o primeiro token**. E o mesmo defeito que a Etapa 86 corrigiu em `syncSelectedToken` — e que nao chegou ate aqui. Agora saneia e devolve `""`; selecao salva valida continua sendo restaurada.

**2. O delta de upsert impunha a selecao do emissor.** `applyMesaTokenUpsertDelta` fazia `state.selectedTokenId = payload.selectedTokenId || state.selectedTokenId || mergedToken.id`, e **todo envelope carrega o `selectedTokenId` de quem enviou** (`createMesaRealtimeEnvelope`). Resultado: o mestre marcava token na tela do jogador e, com ninguem selecionado dos dois lados, o fallback marcava o token recem chegado. A linha saiu: selecao e estado de tela de cada cliente.

**3. Desmarcar nao gravava.** `selectToken()` chama `persistState()`; o handler de deselect nao chamava. Assimetria silenciosa: a cena salva continuava dizendo "ana selecionada" depois do clique fora — e era essa cena velha que voltava no F5 e no eco. Agora grava. **Sem `bumpMesaSceneVersion()` de proposito**: a versao ordena mutacao de cena, e selecao nao e mutacao de cena — para o jogador, um bump aqui carimbaria `Date.now()` no relogio local e faria ele descartar os deltas seguintes do mestre como "atrasados" (mesma armadilha da Etapa 80).

**4. O cliente aplica o proprio eco.** O broadcast `mesa:scene` sai do Worker (`broadcastMesaScene`, cloudflare/src/index.js) **sem `clientId`** — so com `actor` — entao `applyRemoteMesaSceneMessage` nao tem como reconhecer o proprio eco, e o mestre recebe de volta a cena que acabou de gravar. O curto-circuito de assinatura deveria absorver, mas nao absorve: `selectedTokenId` faz parte da assinatura, e o deselect local e justamente o que faz as assinaturas divergirem. **Cena vinda da rede nao mexe mais na selecao de quem recebe** (`applyMesaSceneSnapshot(saved, { keepSelection: true })`) — o resto do snapshot continua sendo aplicado normalmente.

**5. O cache gravado continuava contaminado (achado da validacao).** Com os quatro corrigidos, a validacao ao vivo encenou o cenario inteiro no Playwright — clique, eco, delta alheio, cena remota, F5 — e mostrou que **o estado ficava certo e o `localStorage` nao**: `applyRemoteMesaSceneSnapshot` gravava `remoteData` cru, com o `selectedTokenId` do emissor dentro. Ao vivo nada piscava; **o F5 seguinte ressuscitava o token do outro cliente**. E o mesmo defeito da correcao 4, uma camada abaixo. O cache agora guarda a cena remota com a selecao DESTE cliente.

Registro do metodo: os quatro primeiros defeitos sairam de teste dirigido a hipotese; o quinto so apareceu **encenando o fluxo completo do usuario**, incluindo o F5. Teste por hipotese nao alcanca o que voce nao suspeitou.

### A cadeia completa que ele via na tela

Clica no token (persiste a cena com "ana" marcada) → clica fora (desmarca so na aba dele, defeito 3) → o eco da cena chega (defeito 4) → o snapshot traz "ana" (defeito 1) → marcado de novo.

### O que ficou decidido

**Selecao e estado de tela, nao conteudo da mesa.** Nenhum caminho de rede — delta ou snapshot — marca token na tela de quem recebe. O campo continua viajando no payload da cena (contrato do Worker e do D1 intacto), mas so serve ao boot do proprio cliente e a assinatura de dedupe. ~~Tirar `selectedTokenId` da cena de vez resolveria a familia na origem e continua em aberto como decisao de contrato~~ — **FECHADA em 2026-08-18 pela Etapa 88**: o campo saiu do payload da cena e do envelope de realtime, sem tocar no Worker.

### Verificacao

Cinco testes novos em `tests/mesa-audit.spec.cjs` (bloco "Selecao nao volta sozinha (Etapa 87)"), **todos vermelhos antes da correcao** — o do defeito 3 conferido revertendo a linha e vendo a suite reprovar.

Alem deles, uma **validacao ao vivo** com a Mesa rodando: espiao em `state.selectedTokenId` registrando toda escrita com origem, e o roteiro do Tiago encenado do inicio ao fim (abrir, clicar no token, clicar fora, receber o eco, receber delta de outro cliente, receber cena remota, F5). Linha do tempo final: **duas escritas no total** — `(nada) → ana` no clique (mesa-stage.js:604) e `ana → (nada)` no clique fora (mesa-core.js:349). Nenhuma vinda da rede. Foi essa encenacao que revelou o defeito 5.

Nota de ferramenta: o painel de navegador do Claude Code nao estava compondo quadros (screenshot expira), entao a validacao ao vivo rodou no Playwright — mesma licao registrada na Etapa 86.

Verde: `test:mesa:audit` (**162**), `test:mesa` (5), `tokens` (10), `permissoes` (15), `test:ficha` (32), `test:controles` (6), `perf:mesa` (1), `check:js`, `audit:static`, `audit:pendencias`, `build:pages`.

Cache-bust `2026-08-16-selecao-2` em `js/mesa-core.js` + `MESA_BUNDLE_VERSION`. **Sem deploy**: e tudo cliente.

### Arquivos alterados

- `js/mesa-core.js` — os cinco defeitos
- `mesa.html`, `tools/build-pages.cjs` — cache-bust
- `tests/mesa-audit.spec.cjs` — 5 testes
- `DEV_STATUS.md`, `SYSTEM_RULES.md`

## Etapa Anterior (2026-08-16 — Etapa 86: rotulo mentiroso e selecao que nao soltava)

Dois incomodos relatados pelo Tiago. O segundo tinha causa-raiz bem mais funda do que o sintoma sugeria.

### 1. "Clico para alterar as informacoes e abre a pagina de efeitos de estados"

Nao era fiacao errada: era **rotulo mentiroso**. O botao do inspetor dizia so **"Editar"**, dentro da secao **"Acoes"**, ao lado de Centralizar e Retirar. Lido ali, "Editar" significa "editar o token" — e ele abre o painel de MARCADORES.

- `buildInspectorMarkerRow` (js/mesa-inspector.js): rotulo virou **"Editar marcadores"**, com `aria-label="Editar marcadores de status"` e `title` explicando o que sao ("sangrando, atordoado...").
- Teste cobra o contrato pelo NOME ACESSIVEL, nao pelo texto exato: o nome precisa conter "marcador". Rotulo que nao diz o que edita reprova.

### 2. Clicar fora nao soltava a selecao — e as alcas pulavam de token

O sintoma relatado ("o hover de redimensionamento some") tinha **duas causas somadas**:

**Causa A — o handler de deselect estava morto desde a Etapa 73.** Ele vive num `click` em `#mesaStage`, e a Etapa 73 deu `pointer-events: none` a esse elemento para o desenho voltar a funcionar. Desde entao nenhum clique em espaco vazio chegava ali. Movido para `#mesaStageWrap`, que recebe ponteiro (e quem faz pan e desenho); todas as guardas originais seguem valendo.

**Causa B (a raiz de verdade) — "nada selecionado" era um estado IMPOSSIVEL.** `syncSelectedToken` (js/mesa-stage.js) fazia:

```js
if (!renderedTokens.some(t => t.id === state.selectedTokenId)) {
  state.selectedTokenId = renderedTokens[0].id;   // inventava uma selecao
}
```

Como `""` nunca casa com nenhum id, **todo render reinventava a selecao no primeiro token da lista**. Com a Causa A corrigida, o deselect passou a rodar — e o render seguinte imediatamente jogava a selecao, e as alcas junto, para o primeiro token. Com um token na cena parecia que o clique nao fazia nada; com varios, as alcas sumiam do token do Tiago e apareciam noutro. **E exatamente o "sumir" que ele descreveu.**

Agora a funcao **saneia, nao escolhe**: selecao apontando para token inexistente (removido, oculto, movido para a camada dm) e limpa; nenhuma e inventada. Efeito colateral bem-vindo: a Mesa deixa de abrir com a ficha de alguem selecionada sem o mestre pedir — isso tambem era o bug.

### Como a raiz apareceu

O teste de deselect passava sozinho e falhava na suite completa. Em vez de conviver com a intermitencia, a investigacao instalou um **setter espiao em `state.selectedTokenId`** para registrar quem escrevia nele, com pilha. O log mostrou as duas escritas em sequencia: `"mestre-local" → ""` (mesa-core.js:349, o deselect) e `"" → "mestre-local"` (syncSelectedToken, dentro do `flushScheduledMesaRender`). Sem isso a correcao teria parado na Causa A e o bug continuaria de pe.

Registro tambem de um caminho errado: a primeira investigacao rodou no painel do navegador e mediu opacidade de transicao CSS. O painel nao estava compondo quadros, entao as transicoes ficam congeladas em `running` e a leitura da opacidade e sempre a inicial. **Medicao de transicao CSS naquele painel nao vale**; o Playwright, que renderiza de verdade, e quem serve.

### Verificacao

Cinco testes novos, todos vermelhos antes: rotulo do botao, deselect por clique no vazio, caixa e alcas sumindo depois de desmarcar, "nenhuma selecao e estado valido" (a raiz), e troca direta entre tokens. A suite completa rodou **tres vezes seguidas** (157 cada) para confirmar que a intermitencia morreu.

Verde: `test:mesa:audit` (**157**), `test:mesa` (5), `tokens` (10), `permissoes` (15), `test:ficha` (32), `test:controles` (6), `perf` (1), `check:js`, `audit:static`, `build:pages`.

Cache-bust `2026-08-16-selecao-1` em `js/mesa-core.js`, `js/mesa-stage.js`, `js/mesa-inspector.js` + `MESA_BUNDLE_VERSION`. **Sem deploy**: e tudo cliente.

### Arquivos alterados

- `js/mesa-inspector.js` — rotulo e nome acessivel do botao de marcadores
- `js/mesa-core.js` — deselect movido para o wrap
- `js/mesa-stage.js` — `syncSelectedToken` saneia em vez de escolher
- `mesa.html`, `tools/build-pages.cjs` — cache-bust
- `tests/mesa-audit.spec.cjs` — 5 testes
- `DEV_STATUS.md`

## Etapa Anterior (2026-08-16 — Etapa 85: barra de vida no token do jogador)

Fecha o item que a varredura de pendencias da Etapa 83 desenterrou: registrado na Etapa 64 (30/07) como "barra circular de HP em volta do token" e nunca feito. O Tiago decidiu a forma final: **barra simplificada acima do token, so nos tokens de jogador** — nao o anel circular do Roll20.

### O que foi feito

- **`renderTokenLifeBar(token)`** (js/mesa-stage.js), chamado de `renderTokenMinimal`. So renderiza para `type === "player"` e so quando ha `maxLife > 0` — sem maximo, nao desenha nada, em vez de mostrar barra cheia mentirosa.
- Sem numeros e sem rotulo. Os numeros continuam sendo assunto do inspetor.
- Atualizacao automatica: `getTokenContentSignature` ja inclui `currentLife`/`maxLife`, entao o elemento e recriado quando a vida muda. Nao precisou de caminho novo de sync.

### A decisao de visibilidade (do Tiago)

Havia conflito entre duas regras que ja existiam:

- `normalizeStatsVisibility` (js/mesa-storage.js) retorna `true` **incondicionalmente** para token de jogador;
- `canViewDetailedTokenInfo` (js/mesa-core.js) deixa o jogador ver detalhe **so do proprio** token — e por isso que o inspetor esconde os numeros dos outros.

Decidido: **todos veem a barra de todos**. A barra e leitura de relance da vida do grupo; presa a regra estrita ela perderia a razao de existir numa mesa compartilhada. Os NUMEROS seguem escondidos no inspetor como antes — mudou so a barra.

### A armadilha do layout

O nome do token minimal e `position: absolute` **de proposito**: a caixa de layout do token e exatamente o avatar, e e ela que a grade usa para o encaixe (Etapa 42) e a caixa de selecao para o `inset: 0` (Etapa 71). Uma barra em fluxo normal esticaria essa caixa e o token deixaria de casar com a celula. Por isso a barra tambem e absoluta, ancorada em `bottom: calc(100% + 5px)`.

A barra escala junto com o token (nao se contra-escala como as alcas da Etapa 71): ela e leitura da largura do token, entao acompanhar o tamanho e o comportamento certo.

### Verificacao

Cinco testes escritos **antes** da implementacao, todos vermelhos contra o codigo antigo: proporcao e posicao acima do avatar, filtro de tipo (player sim; NPC, monstro e Echo nao), jogador vendo a barra do companheiro, acompanhamento da mudanca de vida, e vida zerada esvaziando a barra sem sumir com ela (barra vazia comunica "caido"; sumir comunicaria "sem dado").

Regressao do layout conferida de proposito, que era o risco real: `test:mesa:tokens` 10/10 (encaixe na grade, alcas, caixa de selecao) e `test:mesa:audit` **152**. Tambem verde: `test:mesa` (5), `permissoes` (15), `perf` (1), `test:controles` (6), `check:js`, `audit:static`.

No navegador, mestre com ana 8/12 e bruno 2/10: barras em 66,7% e 20%, 5px de altura, 69px sobre avatar de 88px, 5px de folga. **Caixa de layout do token inalterada** (igual ao avatar). Razao barra/avatar constante em 0,78 do zoom 0,5 ao 2 e da escala de token 0,4 a 3. Console limpo.

Cache-bust `2026-08-16-vida-1` em `js/mesa-stage.js` e `css/mesa-stage.css` + `MESA_BUNDLE_VERSION`. **Sem deploy**: e tudo cliente.

### Arquivos alterados

- `js/mesa-stage.js` — `renderTokenLifeBar` + chamada no token minimal
- `css/mesa-stage.css` — barra absoluta acima do token
- `mesa.html`, `tools/build-pages.cjs` — cache-bust
- `tests/mesa-audit.spec.cjs` — 5 testes
- `DEV_STATUS.md`, `VISUAL_RULES.md`

## Etapa Anterior (2026-08-16 — Etapa 84: `data-armed` vira convencao do projeto)

Item 3 da reuniao estrategica. O `data-armed` nasceu na Mesa (Etapa 82) e ganhou a Ficha na Etapa 83, mas continuava sendo peculiaridade de dois arquivos — e peculiaridade nao sobrevive a seis meses. Agora e regra do projeto, verificada nas seis paginas.

### O alcance foi medido, nao chutado

Sonda em todas as paginas, contando botao **visivel e habilitado** com a pagina pronta:

| Pagina | Visiveis | Sem dono |
|---|---|---|
| index.html | 1 | 0 |
| ficha.html | 7 | 0 |
| mesa.html | 33 | 24 |
| regras.html | 3 | 1 |
| sugestoes.html | 2 | 0 |
| echos.html | 1 | 0 |

Dos 24 da Mesa, a maioria era botao **renderizado em runtime** (`mini-btn`, `stat-step-btn`, `mesa-token-markers-btn` — zero ocorrencias no `mesa.html`). Esses ficaram **fora da regra, por principio e nao por conveniencia**: quem os cria e o modulo que ja esta vivo, entao por construcao nao podem nascer mortos. A familia de bugs das Etapas 81-83 mora nos controles que o HTML entrega prontos ANTES de o JS armar.

Sobraram 11 controles estaticos de verdade, todos agora marcados no ponto em que sao armados:

- `#mesaZoomIn`, `#mesaZoomOut`, `#mesaZoomReset` — `bindZoomControl()` (js/mesa-map.js)
- `#resetMesaBtn`, `#fullscreenMesaBtn` — `bindEvents()` (js/mesa-core.js)
- `.vtt-layer-btn[data-layer]` e `.vtt-rtab` — delegados inline no `mesa.html`, marcados junto com o registro do delegado
- `#clearRulesFilters` — js/regras.js

### O verificador

`tests/controles-armados.spec.cjs` (`npm run test:controles`), 6 testes, um por pagina. Compara o DOM vivo com o **HTML SERVIDO**: so cobra marca de botao cuja assinatura (id, ou lista de classes) existe no markup estatico. E assim que a regra distingue estatico de dinamico sem depender de convencao de nome.

Validado contra violacao plantada: removi o `data-armed` do `#clearRulesFilters` e o teste reprovou nomeando o botao; devolvi e voltou ao verde.

Regra registrada em `CLAUDE.md` (Key Constraints) e `VISUAL_RULES.md`.

### Verificacao

Verde: `test:controles` (6), `test:mesa:audit` (147), `test:mesa` (5), `test:ficha` (32), `permissoes` (15), `tokens` (10), `perf` (1), `check:js`, `audit:static`, `audit:pendencias`, `build:pages`.

Cache-bust `2026-08-16-armados-2` em `js/mesa-core.js`, `js/mesa-map.js`, `js/regras.js` + `MESA_BUNDLE_VERSION`. **Sem deploy**: e tudo cliente.

### Arquivos alterados

- `tests/controles-armados.spec.cjs` (novo), `package.json` (`test:controles`)
- `js/mesa-map.js`, `js/mesa-core.js`, `js/regras.js`, `mesa.html` (marcadores + cache-bust)
- `regras.html`, `tools/build-pages.cjs` (cache-bust)
- `CLAUDE.md`, `VISUAL_RULES.md`, `DEV_STATUS.md`

## Etapa Anterior (2026-08-16 — Etapa 83: pendencias com dono unico + a Ficha nao aceita editar o que nao carregou)

Duas frentes da reuniao estrategica: consertar como o projeto registra pendencia, e levar a varredura de boot das Etapas 81-82 para a Ficha.

### Frente 1 — uma lista de pendencias, verificada por script

O `DEV_STATUS.md` tinha **28 mencoes a "pendencia" espalhadas por 9 lugares em 6 formatos**. A causa nao era desleixo: a pendencia era escrita dentro da etapa que a criou, num arquivo que cresce por cima, e nada obrigava uma etapa futura a voltar e dar baixa. O caso mais eloquente listava "Etapa 7: jogador move o proprio token" como pendente com a secao "Etapa Concluida — Etapa 7" logo abaixo, na mesma tela.

- **`## Pendencias Vivas`** no topo do arquivo e a UNICA lista de itens abertos. Formato `- [DONO] item — aberta em AAAA-MM-DD (origem)`.
- **`tools/audit-pendencias.cjs`** (novo, `npm run audit:pendencias`) reprova pendencia declarada fora dela — titulos, rotulos e itens de lista. Bloco historico so e liberado quando o proprio titulo carrega marca de fechamento (`~~`, FECHADA, RESOLVIDA, CUMPRIDA, MOVIDA, HISTORICO) mais a data da conferencia.
- Regra registrada no `CLAUDE.md`, com o porque. A regra de atualizar os `.md` ja existia e falhou quatro vezes; esta e verificada por script, nao por memoria.
- **A varredura achou um item vivo que estava enterrado**: a *barra circular de HP em volta do token* (referencia Roll20), registrada como "pendente" na Etapa 64 e nunca feita — conferido: nao existe `conic-gradient` nem anel de vida no CSS do palco. Foi para a lista canonica como decisao do Tiago. O item vizinho no mesmo bloco, marcadores de status, **estava morto** (feito na Etapa 64, `js/mesa-markers.js`): dois itens colados, um vivo e um morto, ambos escritos como pendentes.

### Frente 2 — boot da Ficha

`js/ficha-init.js` roda `await AUTH_READY` → `await AUTH.refreshDirectory()` → `await openSheet()` e **so entao** arma seis modulos. E `openSheet()` (js/ficha-sheet.js) faz `showScreen("sheetScreen")` e **depois** `await loadSheet(...)`.

Resultado: a ficha aparecia completa e **editavel** enquanto os dados vinham da rede. Quem digitasse nessa janela tinha o texto **descartado** quando a resposta preenchia os campos — sem aviso, e sem autosave para salvar, porque ele so armava depois. Pior que botao morto: perda de dado.

- **A correcao NAO foi armar o autosave mais cedo.** Um `input` durante a carga chamaria `saveSheetSilently()` e gravaria o formulario vazio por cima da ficha real. A garantia certa e nao aceitar edicao no que ainda nao esta pronto.
- **Trava de carregamento** em `openSheet()`: `data-sheet-loading="true"` + `inert` no `#sheetScreen` antes do await, removidos num `finally` (carga que falha nao pode travar a ficha para sempre). `inert` bloqueia clique **e** foco por teclado.
- **Sinal visual** (`css/ficha.css`): opacidade 0.55, `cursor: progress` e a etiqueta "Carregando ficha…". Sem isso a ficha so ficaria misteriosamente sem reagir. Sem animacao, conforme a direcao visual.
- **Modulos de UI pura subiram para antes de todos os awaits**: `initItemEditor`, `initNotesCollapse`, `initSoulAwardModal`, `initDiceTray`, `initSheetMouseGlow`. So dependem de DOM estatico do `ficha.html`.
- **`initAutoSave()` ficou onde estava, de proposito** — e nao ha instante descoberto: `openSheet` mantem a ficha inerte ate terminar e nao existe `await` entre o fim dela e o `initAutoSave()`. `syncAutoGrowTextareas()` tambem ficou depois, porque dimensiona textareas ja renderizadas.
- `data-armed="1"` no `#openDiceTrayBtn`, estendendo a convencao da Etapa 82 para a Ficha.

### Verificacao

Os testes novos foram escritos **antes** da correcao e rodados contra o codigo antigo: `ficha visivel mas ainda carregando nao aceita edicao` e `a bandeja de dados responde assim que a ficha aparece` **falharam**; o terceiro (`assim que a ficha fica editavel, o autosave ja esta armado`) passou dos dois lados, e e guarda de regressao. O atraso e deterministico na resposta de `GET /api/characters/:key`, o ponto onde a lentidao existe em producao.

O `audit-pendencias.cjs` tambem foi validado contra violacao plantada: reprovou com linha e motivo, saiu com codigo 1, e voltou a 0 depois de removida.

Verde: `test:ficha` (**32**), `check:js` (47), `audit:static`, `audit:pendencias`. No navegador, com a trava forcada: opacidade 0.55, cursor `progress`, etiqueta "Carregando ficha…" renderizada, foco recusado no campo; destravando, foco liberado e opacidade 1. Console limpo.

Cache-bust `2026-08-16-fichaboot-1` em `js/ficha-sheet.js`, `js/ficha-init.js`, `js/ficha-dice.js`, `css/ficha.css` + `FICHA_BUNDLE_VERSION`. **Sem deploy**: e tudo cliente.

### Arquivos alterados

- `tools/audit-pendencias.cjs` (novo), `package.json`, `CLAUDE.md`
- `js/ficha-sheet.js` (trava de carregamento), `js/ficha-init.js` (ordem dos inits), `js/ficha-dice.js` (`data-armed`)
- `css/ficha.css` (estado de carregamento), `ficha.html` (cache-bust), `tools/build-pages.cjs`
- `tests/ficha.spec.cjs` (bloco novo, 3 testes), `DEV_STATUS.md`, `VISUAL_RULES.md`

## Etapa Anterior (2026-08-16 — Etapa 82: varredura do boot, "nenhum controle mente")

Generalizacao da Etapa 81. Se o desenho ficava morto atras do `await initMesaMap()`, a pergunta seguinte e obrigatoria: **quem mais?** Varredura de todos os controles da Mesa contra o momento em que sao armados.

### Inventario

| Controle | Armado em | Janela morta? |
|---|---|---|
| Selecionar / Mover | `initMesaSelect()`, **apos** `await initMesaMap()` | **SIM** — visiveis no HTML desde o primeiro paint |
| Zoom (`+` / `−` / reset / slider) e pan do palco | `bindZoomControl()` / `bindMapInteractions()`, **dentro** do `initMesaMap()` depois de `openMesaMapDB()` + `restoreActiveMap()` | **SIM** |
| Desenho | `initMesaDrawing()` | Nao (corrigido na Etapa 81) |
| Dados | `initMesaDice()` no `DOMContentLoaded` | Nao |
| Nevoa | `initMesaFog()` no `DOMContentLoaded` | Nao |
| Iniciativa | `onclick` inline, vale no load do script | Nao |
| Escalacao (`[data-tool]`) | delegado inline no `mesa.html` | Nao |
| Camadas DM / Mapa | dentro do `initMesaMap()`, mas nascem `hidden` | Nao mente — oculto nao promete nada |

### O que mudou (codigo)

- **`initMesaSelect()` subiu para antes do `await initMesaMap()`** (js/mesa-core.js). Ele liga os cliques de `[data-interaction-tool]`; atras do await eram dois botoes mortos na barra.
- **`bindMapInteractions()` e `bindZoomControl()` subiram para o topo do `initMesaMap()`**, antes dos dois awaits (js/mesa-map.js). So precisam do DOM. Com um mapa grande restaurando, os botoes de zoom estavam na tela sem efeito e o palco nao respondia a roda nem a arrasto.
- **Convencao `data-armed="1"`**: todo modulo marca os botoes que arma (`initMesaSelect`, `initMesaDrawing`, `initMesaDice`, e o delegado de `[data-tool]` no mesa.html). Handler delegado nao aparece no elemento e `getEventListeners` so existe no DevTools — sem o marcador, a garantia "este botao tem dono" nao e verificavel por teste.

### Os testes (bloco novo "Boot: nenhum controle da Mesa mente")

Todos rodam com `atrasarBootDoMapa()`, o helper extraido da Etapa 81 que segura o `onsuccess` do `indexedDB.open` por 1,5s e reproduz "mestre com mapa grande restaurando".

1. `Selecionar e Mover respondem no instante em que a Mesa aparece` — **falhava** antes.
2. `o zoom do palco responde no instante em que a Mesa aparece` — **falhava** antes.
3. `nenhum botao visivel da barra fica sem resposta` — rede ampla sobre `.vtt-tb-btn`; **falhava** antes.
4. `os Dados abrem no instante em que a Mesa aparece` — passa nos dois lados **de proposito**: e guarda de regressao para impedir que `initMesaDice` seja movido para dentro do boot assincrono.
5. `a Nevoa ja esta inicializada quando a Mesa aparece` — idem. Aqui a assercao NAO e um clique: os botoes de nevoa moram no painel de configuracoes, que nasce fechado, entao nao ha controle visivel mentindo. A invariante honesta e o canvas de nevoa ter saido do 300x150 intrinseco.

O teste 5 comecou errado: a primeira versao clicava no botao de nevoa e exigia um sinal que eu tinha inventado. Ele falhou, e a investigacao mostrou que o botao nem visivel estava (`offsetParent` nulo). Assercao trocada pela invariante real — registrado aqui porque o erro foi meu, nao do codigo.

### Verificacao

Os 3 testes que cobram bug real foram rodados **contra o codigo antigo e falharam**; os 2 de regressao passaram dos dois lados, como esperado. Verde: `check:js` (47), `audit:static`, `test:mesa:audit` (**147**), `test:mesa` (5), `test:mesa:permissoes` (15), `test:mesa:tokens` (10), `test:ficha` (29), `perf:mesa` (1).

No navegador (servidor local, sessao de mestre): Selecionar → `data-interaction-mode="select"`, Mover → `"move"`, zoom 1 → 1,1, nenhum `.vtt-tb-btn` visivel sem dono, console limpo.

Cache-bust `2026-08-16-armados-1` em `js/mesa-core.js`, `js/mesa-map.js`, `js/mesa-select.js`, `js/mesa-dice.js` + `MESA_BUNDLE_VERSION`. **Sem deploy**: e tudo cliente.

### Arquivos alterados

- `js/mesa-core.js` — `initMesaSelect()` antes do await do mapa
- `js/mesa-map.js` — interacao do palco antes dos awaits
- `js/mesa-select.js`, `js/mesa-dice.js`, `js/mesa-drawing.js` — marcador `data-armed`
- `mesa.html` — marcador nos `[data-tool]` + cache-bust
- `tools/build-pages.cjs` — `MESA_BUNDLE_VERSION`
- `tests/mesa-audit.spec.cjs` — helper `atrasarBootDoMapa` extraido + bloco novo com 5 testes
- `DEV_STATUS.md`, `VISUAL_RULES.md`

## Etapa Anterior (2026-08-16 — Etapa 81: desenho morto durante o boot + limpeza de pendencias)

Rodada de conferencia do estado do projeto. As suites completas foram executadas, as pendencias antigas foram conferidas CONTRA O CODIGO em vez de contra a memoria do documento, e o unico teste vermelho acabou revelando um **bug real de producao**.

### O bug: janela em que a Mesa parece pronta e o desenho nao existe

O teste `traco novo nasce na camada compartilhada e vai para a rede` falhava de forma reproduzivel na suite completa e passava sozinho. A primeira leitura foi "flake de teste" e a primeira correcao foi errada: **fazer o teste esperar o modulo armar**. Isso e adaptar o teste ao site. O Tiago recusou, e com razao — teste existe para cobrar a necessidade, nao para se moldar ao que o codigo faz hoje.

- **Diagnostico**: no `mousedown` o `#mesaDrawCanvas` estava com **300x150**, o tamanho intrinseco do elemento. Prova de que `_resizeDrawCanvas()` nunca correu, ou seja, `initMesaDrawing()` ainda nao tinha executado. Sem init nao ha `addEventListener("mousedown", _onDrawStart)`: `_isDrawing` fica `false` e o traco morre antes de nascer.
- **Causa raiz (js/mesa-core.js)**: `initMesaDrawing()` estava **depois do `await initMesaMap()`**, que abre o IndexedDB e restaura a imagem do mapa da sessao anterior. Entre `renderAll()` (palco pintado, tokens na tela, barra de desenho visivel desde o HTML) e o fim daquele await existia uma janela real em que **o mestre clicava no lapis, arrastava, e nada acontecia** — sem erro, sem toast, sem cursor diferente. Quanto maior o mapa salvo, maior a janela.
- **Nao era hipotese de teste**: o ambiente de teste e que escondia o problema. Sem mapa salvo, `initMesaMap()` volta na hora e a janela fecha rapido demais para qualquer assercao — foi por isso que o bug sobreviveu desde a Etapa 73.

### O que mudou (codigo, nao teste)

- **`initMesaDrawing()` subiu para antes do `await initMesaMap()`** (js/mesa-core.js). E o ponto mais cedo correto: precisa vir depois de `hydrateState` (que marca `_sceneDrawingsApplied`, senao o restore do localStorage atropelaria os tracos da cena oficial) e depois de `bindMesaRealtime` (que publica `window.APP` para `_bindDrawingsPresence`). O canvas se redimensiona sozinho quando o mapa chega: o init instala um `ResizeObserver` no `#mesaStageInner`.
- **O botao de desenho nasce `disabled` no `mesa.html`** e so e liberado no fim de `initMesaDrawing()`, junto com `data-draw-ready="true"` no `#mesaStageWrap`. Fecha a janela residual (antes de `renderAll`, durante auth + as 3 requests): enquanto o modulo nao arma, a UI **nao finge** estar armada. Se o boot morrer antes do init, o botao fica desabilitado para sempre — que e a verdade.
- **`.vtt-tb-btn:disabled`** (css/mesa.css): opacidade 0.4 e cursor normal; o `:hover` da barra passou a exigir `:not(:disabled)`. Vale para qualquer botao de barra que nasca desarmado, nao so o do desenho.

### Os testes agora cobram a garantia, nao descrevem o codigo

- O `beforeEach` dos dois blocos de desenho voltou a esperar **so os tokens renderizarem** — a definicao de "a Mesa apareceu" para o usuario. A espera artificial que eu tinha adicionado foi removida.
- **Teste novo `com o mapa lento, o desenho ja esta armado quando a Mesa aparece`**: torna a lentidao DETERMINISTICA no ponto exato onde ela existe em producao — um `addInitScript` embrulha `indexedDB.open` e atrasa so o `onsuccess` em 1,5s, reproduzindo "mestre com mapa grande restaurando do IndexedDB". Depois espera o primeiro token e exige `data-draw-ready`, botao habilitado, canvas dimensionado **e um traco que nasce de verdade**.
- **Teste novo `antes de armar, o botao de desenho nasce desabilitado no HTML`**: le o HTML servido sem executar script, que e o estado que o usuario ve durante o boot.

### Verificacao

O teste novo foi rodado **contra o codigo antigo primeiro e falhou** com a mensagem certa (`desenho nao armou antes do mapa`, recebido `null`); com o fix, passou. Vale registrar que a versao anterior do teste — a que so olhava o relogio, sem o atraso injetado — **passava contra o codigo quebrado**: foi ela que provou que "asserir a coisa certa" nao basta se o teste nao reproduz a condicao real.

Verde: `check:js` (47), `audit:static`, `test:mesa:audit` (**142**), `test:mesa` (5), `test:mesa:permissoes` (15), `test:mesa:tokens` (10). No navegador (sessao local de mestre, servidor em :8000): antes de logar, botao `disabled` com opacidade 0.4 e `data-draw-ready` ausente; com a Mesa carregada, botao habilitado, `data-draw-ready="true"`, canvas em 932x655 e um traco de linha criado com sucesso. Console limpo.

Cache-bust `2026-08-16-drawboot-1` em `js/mesa-core.js`, `js/mesa-drawing.js` e `css/mesa.css` (mesa.html) + `MESA_BUNDLE_VERSION` em `tools/build-pages.cjs`. **Sem deploy**: e tudo cliente.

### Pendencias antigas que ja estavam mortas no codigo (fechadas neste registro)

Estavam escritas como abertas mais abaixo no arquivo, mas a conferencia mostrou que o codigo ja as resolveu:

- **"handles de resize podem inverter a caixa"** (bug medio da auditoria da Etapa 34) — as alcas foram refeitas nas Etapas 63/71. `npm run test:mesa:tokens` passa 10/10, incluindo o teste das 8 alcas exatamente nos cantos e meios em qualquer escala.
- **"payload PUT sem limite de tamanho"** (mesmo relatorio) — existe: `readJson()` em `cloudflare/src/auth.js` checa `content-length` E o texto lido contra `READ_JSON_DEFAULT_MAX_BYTES` (16 KB) e devolve 413.
- **"specs de `test:ficha` esperam a UI antiga"** (registrada em 2026-06-07, quando 6 falhavam) — passam 29/29.
- **"rodada com 2 janelas reais via WebSocket de producao"** (citada nas Etapas 38/41/50) — fechada na propria Etapa 51 (deploy final + smoke em producao).

### Pendencias desta conferencia (movidas — ver "Pendencias Vivas" no topo)

O que continuou aberto foi para a lista canonica no topo do arquivo; aqui fica so o registro do que esta conferencia FECHOU.

- ~~**Drift de zoom durante o drag de token**~~ — **FECHADO** (conferido em 2026-08-16). A pendencia era da Etapa 34 (2026-06-30) e a **Etapa 39 (2026-07-11) ja tinha corrigido**: `updateDragPosition` recaptura o `stageRect` a cada frame e guarda o agarre como fracao do token. O documento e que nunca foi atualizado. Ha cobertura para os dois casos em `tests/mesa-audit.spec.cjs`: zoom aplicado ANTES do drag e zoom alterado NO MEIO do drag. O segundo foi verificado como guarda real — removendo a recaptura do rect, ele fica vermelho.
- Teto de tamanho do token com a grade ligada → **movido** para "Pendencias Vivas" (decisao de regra do Tiago).
- `npm run test:mesa:online` sem credenciais → **movido** para "Pendencias Vivas" (configuracao de ambiente).

**Com isso o relatorio da auditoria da Etapa 34 esta 100% fechado** — os 11 bugs mais os 3 de severidade media/baixa.

### Resto da bateria

`test:ficha` (29) e `perf:mesa` (1) tambem verdes na conferencia.

### Arquivos alterados

- `js/mesa-core.js` — `initMesaDrawing()` antes do `await initMesaMap()`
- `js/mesa-drawing.js` — libera o botao e marca `data-draw-ready` no fim do init
- `mesa.html` — botao de desenho nasce `disabled` + cache-bust
- `css/mesa.css` — `.vtt-tb-btn:disabled` e `:hover:not(:disabled)`
- `tools/build-pages.cjs` — `MESA_BUNDLE_VERSION`
- `tests/mesa-audit.spec.cjs` — 2 testes novos (mapa lento, botao desabilitado no HTML); espera artificial removida dos `beforeEach`
- `DEV_STATUS.md`, `VISUAL_RULES.md` — este registro

## Etapa Anterior (2026-08-02 — Etapa 80: rolagem do jogador nao chegava ao mestre)

**Sintoma** (Tiago, com print): na fase de rolagem, o mestre via a propria linha resolvida mas a rolagem dos jogadores nunca aparecia — ficava em "aguardando…" para sempre. Sem erro no console, sem toast, sem nada.

### Causa raiz: o portao de versao de cena

`applyMesaRealtimeDelta` descarta **qualquer** delta cuja `sceneVersion` seja menor que a local (`isStaleMesaSceneVersion`) — uma protecao contra mensagem atrasada de cena. Duas coisas se somaram:

1. **`bumpMesaSceneVersion()` usa `Date.now()`**, e o MESTRE bumpa a cada mexida na cena (colocar token, mover, grade, nevoa...). A versao dele sobe sozinha.
2. **Os ramos que dao `return` cedo no roteador — iniciativa, dados, ping, regua, grade, nevoa, desenhos — pulavam a adocao da versao**, que morava no FIM da funcao. Ou seja: o jogador que so recebia esses tipos ficava congelado na versao do boot.

Resultado: o mestre coloca tokens (versao dele vira ~1.7 trilhoes), o jogador rola, o envelope sai carimbado com a versao velha e o cliente do mestre **descarta a mensagem antes de o roteador ver o tipo**. A rolagem existia na rede e morria na porta.

### O que mudou

- **Adocao da versao subiu para o topo** de `applyMesaRealtimeDelta`, antes de todo `return` cedo. Fim da deriva: qualquer delta mantem os clientes em dia.
- **`MESA_VERSIONLESS_DELTA_TYPES`** (novo): `mesa:initiative:roll`, `mesa:ping`, `mesa:ruler` e `mesa:dice:result` nao passam pelo portao. Nenhum altera a cena, entao "chegou atrasado" nao os invalida. Ping e regua de jogador sofriam do mesmo mal em silencio.
- **Fallback por DONO em `_receivePlayerRoll`**: se o `tokenId` nao casa (tela do jogador com ordem antiga), procura a UNICA entrada manual pendente daquele ator AUTENTICADO. Com duas, ignora — melhor perder a rolagem do que rolar pelo token errado. Nao e o fallback por `characterKey` que saiu na Etapa 78: ali a chave vinha do payload (o jogador escolhia), aqui vem do socket.

### Verificacao

Os dois testes novos do portao de versao foram rodados **contra o codigo antigo primeiro e falharam** — depois passaram com o fix. `npm run test:mesa:audit` (140), `npm run test:mesa` (5), `check:js` e `audit:static` limpos. Cache-bust de `mesa-core.js` e `mesa-initiative.js` para `2026-08-02-sync-1`. **Sem deploy**: e tudo cliente.

### Arquivos alterados

- `js/mesa-core.js` — adocao de versao no topo do roteador + `MESA_VERSIONLESS_DELTA_TYPES`
- `js/mesa-initiative.js` — fallback por dono autenticado em `_receivePlayerRoll`
- `mesa.html` — cache-bust
- `tests/mesa-audit.spec.cjs` — 3 testes: rolagem com versao atrasada, adocao de versao em delta de iniciativa, e casamento por dono com forja recusada

## Etapa Anterior (2026-08-02 — Etapa 79: Dados da Mesa refeitos)

O painel "Dados da Mesa" (Etapa 45) foi reformulado, e a colisao que a Etapa 78 criou no canto inferior esquerdo foi resolvida na raiz.

### O que mudou

1. **Doca esquerda (`#mesaDockLeft`)** — coluna fixa unica onde moram os paineis persistentes: dados em cima, iniciativa embaixo. O painel de dados deixou de ser `absolute` dentro do palco e a iniciativa deixou de se ancorar sozinha; as duas viraram filhas estaticas de um flex. Container com `pointer-events: none` (so os filhos recebem clique) e `max-height` para dois paineis abertos nunca passarem do topo.
2. **Fluxo "escolher, depois rolar"** — os chips de dado selecionam; a rolagem sai no botao ROLAR (ou Enter). Necessario porque modo e segredo sao escolhidos ANTES de rolar.
3. **Campos que o codigo ja aceitava e a UI escondia**: **formula livre** (`2d20+3`, vence os chips) e **motivo** (`label`, aparece no historico de todos).
4. **Card de resultado** — total em 2rem, dados em pastilhas, **critico dourado / desastre carmesim** com etiqueta, e a tirada descartada da vantagem riscada. Enquanto o DO nao responde, o card mostra "…" pulsando e o botao vira "Rolando…" (timeout de 8s devolve o controle se a mensagem se perder).
5. **Vantagem/desvantagem** (Worker) — rola a formula inteira duas vezes e fica com o total maior/menor, espelhando `rollDiceExpressionWithMode()` da ficha.
6. **Rolagem secreta do mestre** (Worker) — vai por `broadcastToMasters()`, e o `mesa:ready` filtra o historico por papel. Para o jogador nao existe: nem entrada, nem aviso. `secret: true` vindo de jogador e ignorado pelo DO.

### Dois bugs corrigidos junto

`state.username` **nao existe** — o campo e `state.session.username`. Por causa disso (a) voce recebia toast das SUAS proprias rolagens com o painel fechado e (b) no modo local sua entrada saia como "voce" em vez do seu nome.

### Arquivos alterados

- `cloudflare/src/mesa-realtime-rules.js` — `normalizeDiceMode`, `rollMesaDiceWithMode`, `getMesaDiceSpecial`, `filterDiceHistoryForRole` (puras, testadas direto)
- `cloudflare/src/mesa-realtime.js` — `handleDiceRequest` com modo/segredo; `acceptClient` filtra o historico por papel
- `js/mesa-dice.js` — reescrito (estado do painel, formula livre, motivo, modos, espera, card de resultado, correcao do username)
- `mesa.html` — `#mesaDockLeft` novo; painel de dados remontado e movido para a doca
- `css/mesa.css` (doca) e `css/mesa-stage.css` (painel de dados reescrito para 300px)
- `tests/mesa-audit.spec.cjs` — bloco "Dados da Mesa refeitos (Etapa 79)": regras do DO, formula livre + motivo, segredo negado a jogador, critico no card e **regressao da doca** (os dois paineis nao se sobrepoem)

### Verificacao

`npm run check:js`, `npm run audit:static`, `npm run test:mesa` (5) e `npm run test:mesa:audit` (137) passaram. No navegador, com os dois paineis abertos a 1280x720: dados em 96-504 e iniciativa em 512-708, mesma coluna em `left: 72px`, sem sobreposicao; a 375px a doca ocupa a largura util sem estouro horizontal. Vantagem conferida no modo local (17 escolhido, 4 riscado) e critico renderizado em dourado com etiqueta.

## Etapa Anterior (2026-08-02 — Etapa 78: iniciativa ancorada no canto + trava de posse)

Ajuste pedido pelo Tiago sobre a Etapa 77: **o pop-up de iniciativa saiu do centro da tela** e a rolagem de cada jogador ficou blindada.

### O que mudou

1. **Doca unica no canto inferior esquerdo.** `#initiativeOverlay` (rolagem) e `#initiativeTracker` (ordem de turno) usam agora a MESMA posicao: `left: calc(60px + var(--sp-3))` (largura da `.vtt-toolbar`) e `bottom: var(--sp-3)`, `width: min(300px, calc(100vw - 60px - 2rem))`. Trocar de fase nao faz o painel pular de lugar. Em `<=700px` a toolbar vira faixa horizontal e o painel passa a ocupar a largura util (`left`/`right` de `var(--sp-2)`).
2. **Fim do modal bloqueante.** A fase de rolagem perdeu o backdrop escuro e o `aria-modal` (virou `role="region"`): durante a rolagem todo mundo continua vendo o mapa e os tokens. Era o incomodo principal — 4 linhas de lista travavam a mesa inteira.
3. **Painel redesenhado para 300px**: retratos de 28px (34px na propria linha), a MINHA linha sobe para o topo da lista e ganha o botao em largura total ("🎲 Rolar minha iniciativa"), barra de progresso das rolagens no rodape e numero das outras pessoas escondido durante a rolagem (vira so um ✓ — a ordem completa aparece na fase seguinte).
4. **Trava de posse na rolagem** (ver SYSTEM_RULES.md): `rollOwnInitiative()` recusa entrada que nao e do jogador (com aviso), o mestre nao rola em token automatico por engano, o fallback por `characterKey` saiu do recebimento e **o modificador que vale e o da ficha vista pelo mestre** — o numero do cliente so entra quando o mestre nao tem a ficha em cache.

### Arquivos alterados

- `js/mesa-initiative.js` — `initiativeKnownModifierFor()` (novo), trava de posse em `rollOwnInitiative()`, `_receivePlayerRoll()` sem fallback por chave, render da fase 1 com minha-linha-primeiro + barra de progresso
- `mesa.html` — `#initiativeOverlay` vira `role="region"`, entra `#initRollProgressBar`, titulo encurtado para "Iniciativa"; cache-bust de `css/mesa.css` e `js/mesa-initiative.js` (`2026-08-02-iniciativa-3`)
- `css/mesa.css` — bloco de iniciativa reancorado (doca comum, casca compartilhada, barra de progresso, media query de 700px)
- `SYSTEM_RULES.md`, `VISUAL_RULES.md`, `DEV_STATUS.md`

### Verificacao

`npm run check:js`, `npm run audit:static`, `npm run test:mesa` (5) e `npm run test:mesa:audit` (133) passaram. Posicao conferida no navegador: painel em `left: 72px`, `bottom: 12px`, `300x387` a 1280x720, e sem estouro horizontal a 375px.

## Etapa Anterior (2026-08-02 — Etapa 77: iniciativa refeita do zero)

O sistema de iniciativa foi **reescrito por completo**. O modelo antigo (banner para o jogador + popup individual + painel na sidebar) saiu inteiro.

### Como funciona agora

1. **O mestre abre o combate** (botao INIC. da barra): todo token em cena vira participante, menos o Echo.
2. **Modal central de rolagem** (`#initiativeOverlay`) abre para **mestre E jogadores**, listando os participantes com retrato, nome, tipo e o modificador de quem tem direito de ver.
3. **Cada jogador rola pelo proprio token** — 1d20 + modificador de Agilidade. A linha dele mostra o atributo, o modificador e o resultado.
4. **NPCs e monstros rolam sozinhos** no cliente do mestre assim que o ultimo jogador termina. Depois de uma pausa de 1,2s (para todos verem os numeros), a fase muda.
5. **Ordem de turno** (`#initiativeTracker`): painel flutuante no topo do palco, visivel para **todos**, ordenado por maior total. O nome da vez **brilha**. So o mestre ve **◀ Voltar / Passar ▶ / ✕ Encerrar** (e o ✕ de remover entrada).

### Decisoes de projeto

- **Duas fases num estado so**: `initiative.phase` = `"rolling"` | `"order"`. Cena antiga (sem `phase`) reabre em `"order"` se todo mundo ja tinha rolado — senao em `"rolling"`.
- **Cada entrada e um TOKEN, nao um personagem**: o mesmo monstro duas vezes no palco tem duas iniciativas. O alvo da rolagem viaja em `tokenId`; `characterKey` continua sendo a IDENTIDADE que o DO confere contra o socket.
- **Avatar nao viaja na entrada**: cada cliente resolve o retrato pelo token da cena. Avatar pode ser data URI de dezenas de KB e estouraria o cap de 32KB por mensagem do realtime.
- **Token secreto (camada dm / invisivel)** entra como `secret`: existe na ordem do mestre e some inteiro para o jogador — inclusive da contagem ("0 de 2", nao "0 de 4") e da numeracao (a lista visivel e renumerada), que denunciariam o escondido.
- **Escape hatch do mestre**: "Rolar pelos ausentes" fecha a rolagem quando um jogador nao esta online. Sem isso, um ausente travaria o combate para sempre.
- **Colapsar** o modal/painel e preferencia LOCAL de cada pessoa — nunca sincroniza.

### Bug de boot corrigido junto

Com os scripts vindo do cache, o `mesa-core.js` pode executar com `document.readyState` ja em `"interactive"` — ai `bootMesaPage()` roda na hora, **antes** de o `mesa-initiative.js` (script defer seguinte) existir. O `typeof applyInitiativeState === 'function'` falhava e **a iniciativa salva era descartada em silencio no F5**. Agora `applyMesaSceneSnapshot` deixa o estado em `window._mesaPendingInitiative` e o proprio modulo o consome ao carregar (`drainPendingInitiative`).

### Regras de jogo (confirmadas por Tiago em 2026-08-02)

As quatro decisoes que faltavam foram fechadas — as tres primeiras confirmaram o que ja estava implementado; a do Echo mudou o codigo.

| Regra | Decisao |
|---|---|
| Modificador | **`1d20 + MODIFICADOR de Agilidade`** — o modificador da ficha, nao o valor cru. Escala do sistema: **+1 a cada 3 pontos** (Agilidade 5 → +1, 6 → +2, 9 → +3). A ficha nao tem "Destreza"; o equivalente e Agilidade. `initiativeModScale()` espelha `modScale()` de `js/ficha-sheet.js` |
| Empate no total | Passa quem tirou o **maior dado bruto** (`14+5=19` perde para `16+3=19`); depois maior Agilidade; depois nome |
| Echo | **Nao entra na ordem** — age no mesmo turno do dono. `buildInitiativeParticipants` filtra `type === "echo"`, senao o jogador agiria duas vezes por rodada |
| Nova rodada | **Mantem a mesma ordem** — rola uma vez so, no inicio do combate |

Para mudar a formula depois, mexer so em `INITIATIVE_ATTR` / `INITIATIVE_ATTR_LABEL` / `INITIATIVE_FORMULA` e `initiativeModifierFor()` no topo de `js/mesa-initiative.js`. As quatro regras tem teste dedicado em `tests/mesa-audit.spec.cjs`.

### Arquivos principais alterados

- `js/mesa-initiative.js` — reescrito do zero (fases, participantes por token, auto-roll, ordem, colapso)
- `mesa.html` — `#initiativeBanner`, `#initiativeRollPopup` e `#vttInitiativeBlock` REMOVIDOS; entraram `#initiativeOverlay` e `#initiativeTracker`; botao INIC. chama `toggleInitiative()`; `showPanel` inline perdeu o bloco de iniciativa; cache-bust de mesa.css / mesa-core.js / mesa-initiative.js
- `css/mesa.css` — bloco de iniciativa reescrito (modal central, painel flutuante, brilho da vez com `prefers-reduced-motion`)
- `js/mesa-core.js` — `phase` no payload e na assinatura de dedupe da cena; iniciativa em espera no boot
- `cloudflare/src/mesa.js` — `normalizeMesaScene` preserva `phase` e os campos novos da entrada (`ownerUsername`, `type`, `secret`, `auto`)
- `tests/mesa-audit.spec.cjs` — bloco "Iniciativa fim-a-fim" reescrito (14 casos, incluindo as regras de Echo e de desempate)
- `tests/mesa-permissions.spec.cjs` — alvos atualizados para a UI nova

### Validacoes

- `npm run check:js`: OK (47 arquivos)
- `npm run audit:static`: OK
- `npm run test:mesa:audit`: 132 passed · `test:mesa:permissoes`: 15 · `test:mesa`: 5 · `test:mesa:tokens`: 10 · `test:ficha`: 29
- **Armadilha de teste anotada**: um servidor de preview proprio rodando na porta 8000 (`npx serve`) durante a suite causa `ERR_SOCKET_NOT_CONNECTED` intermitente e triplica o tempo — os testes falham por disputa de socket, nao por regressao. Parar o preview antes de rodar a suite.
- Fluxo completo exercitado no navegador (mestre e jogador): abrir combate → rolagens → auto-roll de NPC/monstro → ordem → Voltar/Passar com virada de rodada nos dois sentidos

### Deploy

- **Worker publicado** em 2026-08-02, version ID `b55adbb0-319b-4b5a-89d7-4d997cd7eb16` (dry-run limpo antes; health 200 pos-deploy). Detalhes em `cloudflare/README.md`.

### Pendencias (nenhuma — FECHADA nesta etapa)

- Nenhuma aberta nesta etapa. As quatro regras de jogo estao fechadas e cobertas por teste; o Worker ja esta no ar com o formato novo da cena.

## Etapa Anterior (2026-08-02 — Etapa 76: decisoes de permissao pos-auditoria)

Duas regras que a auditoria da Etapa 75 levantou como **decisao do mestre**, nao como bug, e que o Tiago decidiu:

### Desenho: cada um apaga so o seu

O quadro continua UNICO e compartilhado (todos desenham no mesmo lugar, Etapa 73). O que mudou foi o APAGAR — antes a borracha e o Ctrl+Z de um jogador levavam junto o desenho tatico do mestre no meio do combate.

- **Autoria no traco**: todo traco novo nasce com `author` (= username). O Worker preserva o campo em `normalizeSceneDrawing` — sem isso todo traco voltaria do banco orfao depois de um F5 e o jogador perderia o direito de apagar o proprio desenho.
- **Autoria vem do socket, nao do payload**: o Durable Object sobrescreve `stroke.author` com o username autenticado no relay de `mesa:drawings:add`. Sem isso um jogador assinava o proprio traco como "mestre" e o tornava intocavel para os outros. Mesmo principio do `from` em `handleMapSignal`.
- **Borracha**: jogador alcanca so os proprios tracos; **mestre alcanca todos** (precisa poder limpar rabisco alheio sem zerar o quadro). Traco alheio sob o cursor e ignorado — a borracha passa por cima sem efeito.
- **Ctrl+Z**: desfaz o PROPRIO ultimo traco, procurando de tras para frente. Antes desfazia o ultimo do quadro, fosse de quem fosse.
- **"Limpar tudo"**: master-only (`data-mesa-master-only` + `requireMesaMaster("draw.clearAll")`). E a unica acao de desenho que apaga traco dos outros.
- **Traco antigo (sem `author`) e ORFAO**: so o mestre apaga. Ninguem perde acesso ao que ja desenhou e nenhum jogador ganha poder sobre traco alheio. Zero migracao de banco.
- **Validacao de posse no CONSUMIDOR** (o DO nao conhece a cena, mesmo padrao do movimento de token alheio): `mesa:drawings:remove` vindo de jogador so remove os tracos dele; `mesa:drawings:update` (estado COMPLETO) vindo de jogador e **ignorado por inteiro** — era o caminho pelo qual um jogador zerava o quadro de todos pelo socket, contornando a regra.

### Sugestoes: o autor pode retirar a propria

`DELETE /api/suggestions/:id` deixou de ser master-only: o mestre apaga qualquer uma e o **autor apaga a propria** (checagem por `created_by_user_id`). **Editar continua master-only** no Worker e no cliente — o texto ja enviado e registro da campanha; quem mandou pode se arrepender e retirar, mas nao reescrever. Jogador que nao e o autor nao ve botao nenhum.

### Decisoes que ficaram como estao

- **`/api/directory`**: jogador continua vendo nome, avatar e uso de invent&aacute;rio dos outros jogadores (NPCs e monstros ja eram filtrados). E informacao de grupo e a Mesa precisa de nome/avatar para montar os tokens.
- **Suite E2E com dois logins reais contra o Worker publicado**: nao sera feita agora. Ficam as 15 checagens de `test:mesa:permissoes` (UI nos dois papeis + regras de desenho + contrato do backend lido do fonte).

- **Arquivos**: js/mesa-drawing.js, js/mesa-core.js, js/mesa-permissions.js, js/sugestoes.js, mesa.html (`?v=2026-08-02-autoria-1`), sugestoes.html (`?v=2026-08-02-autor-delete-1`), cloudflare/src/mesa.js, cloudflare/src/mesa-realtime.js, cloudflare/src/index.js, tests/mesa-permissions.spec.cjs, tests/mesa-audit.spec.cjs, tests/ficha.spec.cjs.
- **Validacoes**: `check:js` OK, `audit:static` OK, `test:mesa:permissoes` 15/15, `test:mesa:audit` 123/123, `test:mesa` 5/5, `test:mesa:tokens` 10/10, `test:ficha` 29/29, `perf:mesa` 1/1, `wrangler deploy --dry-run` limpo.
- **Dois testes antigos foram REESCRITOS, nao remendados**, porque cobriam o comportamento que o Tiago decidiu remover: o de `mesa-audit` afirmava que o estado completo de um jogador sobrescrevia o quadro do mestre; o de `ficha` afirmava que so o mestre excluia sugestao.
- **Deploy feito** em 2026-08-02, version ID `2d1e0217-5f75-485d-9f8a-f1be95027743` (dry-run limpo antes; health 200 depois; `GET /api/mesa/scene` e `DELETE /api/suggestions/:id` sem sessao respondem 401, confirmando rotas ativas e protegidas). Sem ele o `author` seria descartado no save da cena — todo traco voltaria orfao no F5 e a regra "cada um apaga so o seu" morreria no primeiro reload — e o autor continuaria levando 403 ao excluir a propria sugestao.

## Etapa Anterior (2026-08-02 — Etapa 75: permissoes da Mesa separadas de verdade)

Tiago mandou tres prints: "os players estao com permissoes que nao deveriam, como ver essas opcoes e interagir com algumas delas" — barra lateral com MESTRE/MAPA/ESCAL., a faixa "SEM MAPA / ABRIR MAPA / engrenagem" e os botoes "TRAVAR MOVIMENTO / LIMPAR CENA".

- **Causa-raiz (arquitetural, nao um bug pontual)**: a permissao da Mesa estava espalhada em quatro lugares que nao se conversavam — atributo `hidden` no HTML (em alguns elementos), regra de CSS `.is-master` (mesa-map.css), `hidden = !isMaster()` dentro de cada modulo, e um **`showPanel()` inline no fim do mesa.html que dava `el.hidden = false` em blocos inteiros sem olhar papel nenhum**, desfazendo as travas dos modulos a cada clique na barra. Era o showPanel que entregava ao jogador o tracker de iniciativa com "Proximo / Reiniciar / Encerrar" e o inspetor do mestre.
- **Vazamentos confirmados na visao do jogador** (medidos com a app rodando, sessao `role: "player"`): botao **ESCAL.** (escalacao — proibido por SYSTEM_RULES), botao **INIC.** (ativar/encerrar combate), bloco de iniciativa com os **controles de conducao do mestre**, e o chrome de mapa **"Sem mapa"** (o "Abrir mapa" dependia so de CSS `.is-master`, sem `hidden` e sem trava na funcao).
- **Fonte unica de verdade (js/mesa-permissions.js, novo)**: `mesaCan(cap)`, `isMesaMasterRole()`, `requireMesaMaster(cap, acao)` e `applyMesaRolePermissions(role)`. Capacidade desconhecida e **negada** (fail-closed). `applyMesaRolePermissions` so desfaz o que ela mesma escondeu (marca `data-mesa-perm-hidden`), entao nao atropela o `hidden` legitimo dos modulos (mapa ativo, combate ativo, backend online, painel aberto).
- **Camada declarativa (css/mesa-permissions.css, novo)**: `body:not([data-role="master"]) [data-mesa-master-only] { display: none !important }`. O `mesa.html` nasce com `<body data-role="player">` — **o padrao e fechado**: se o JS falhar, atrasar ou for bloqueado, o jogador continua sem os controles do mestre. Foram marcados 15 elementos com `data-mesa-master-only`.
- **Trava tambem nas funcoes**: esconder botao nao protege nada, porque as funcoes da Mesa sao globais (`onclick` inline chamavel pelo console). Ganharam guarda: `activateInitiative`, `nextInitiativeTurn`, `resetInitiativeRound`, `deactivateInitiative`, `removeFromInitiative`, `openAndSetLocalMap`, `clearActiveMap`, `importMapToLibrary`, `connectLocalFolder`, `toggleMapSettings`, `adjustMapScale`.
- **Segunda verdade eliminada**: `mesaMapState.isMaster` lia `tc_session` cru do localStorage e divergia de `state.role` (o unico que respeita AUTH, a sessao sintetica de localhost e `mesaRolePreview`). Agora deriva de `isMesaMasterRole()`.
- **showPanel corrigido**: `vttInspectorBlock` e `vttInitiativeBlock` sairam da lista de blocos que ele revela — quem manda neles e `renderInspector()` / `renderInitiative()`, que olham papel E estado. O showPanel so esconde, e fecha chamando `applyMesaRolePermissions()`. O listener de clique tambem barra clique em `[data-mesa-master-only]` quando o papel nao e mestre.
- **Backend auditado, sem mudanca**: `PUT /api/mesa/scene`, `/api/mesa/scenes/*`, upload/delete de mapa no R2 e o Durable Object (`MASTER_ONLY_TYPES`, `MASTER_ONLY_MAP_SIGNAL_TYPES`) ja recusavam jogador corretamente. O problema era 100% de UI: a tela oferecia acoes que o servidor ia negar depois — inclusive a iniciativa, que "ligava" so no navegador do jogador enquanto o DO recusava o broadcast.
- **Arquivos**: js/mesa-permissions.js (novo), css/mesa-permissions.css (novo), mesa.html (marcacoes + `<body data-role>` + showPanel + `?v=2026-08-02-permissoes-1`), js/mesa-core.js, js/mesa-map.js, js/mesa-initiative.js, js/mesa-inspector.js, js/mesa-roster.js, tests/mesa-permissions.spec.cjs (novo), package.json (`test:mesa:permissoes`).
- **Validacoes**: `check:js` OK (47 arquivos), `audit:static` OK, `test:mesa:permissoes` 8/8 (novo), `test:mesa:audit` 123/123, `test:mesa` 5/5, `test:mesa:tokens` 10/10. Verificado tambem com a app rodando nos dois papeis: jogador com **zero** elementos master-only visiveis (inclusive apos clicar em toda a barra e com combate ativo) e mestre com todos os controles de volta.
- **Regressao pega no meio do caminho**: a primeira versao do `applyMesaRolePermissions` so escondia, nunca revelava — o mestre perdia ESCAL., INIC., "Abrir mapa" e o inspetor. Dai a marca `data-mesa-perm-hidden` e o `renderInspector()` passar a revelar o proprio bloco (antes quem revelava era o showPanel).
- **Sem deploy**: nenhuma mudanca funcional no Worker nesta etapa (so um comentario de seguranca).

### Auditoria completa de permissoes (2026-08-02, complemento da Etapa 75)

Varredura pedida depois da correcao: **todas as 49 rotas do Worker, todos os tipos do Durable Object e as 6 paginas do site**.

**Backend — nenhuma falha encontrada.** Todas as rotas conferidas uma a uma:

| Grupo | Situacao |
|---|---|
| `/api/directory/{players,npcs,monsters}` POST/DELETE | `role !== "master"` → 403 em todas |
| `/api/characters/:key` GET/PUT | `assertCharacterAccess` — jogador so a propria ficha |
| `/api/characters/:key/soul-*` | `assertSoulProgressionAccess` — jogador so o proprio nucleo |
| `/api/mesa/scene` PUT / `scenes/*` | `requireMaster` em listar, criar, renomear, ativar, excluir e salvar |
| `/api/mesa/scene` GET | filtra por papel: remove tokens/tracos `dm` e anula vitais de token com status oculto |
| `/api/mesa/map` POST/DELETE | master-only; DELETE ainda exige prefixo `maps/<proprio-user>/` |
| `/api/avatars/:key` POST | `assertCharacterAccess`; sem personagem, master-only |
| `/api/avatars/echo/:id` POST | `setEchoAvatar` valida mestre-ou-dono |
| `/api/maintenance/migrate-avatars` | master-only |
| `/api/transfers/*` | rotas diretas jogador→jogador sao master-only; jogador so via proposta com aceite; aceitar/recusar/cancelar validam destinatario e remetente |
| `/api/echos/*` | drop, concessao, XP e exclusao master-only; dono edita so apelido/anotacoes/imagem/vitais |
| `/api/rules/*` POST/PUT/DELETE | master-only |
| `/api/suggestions/*` PUT/DELETE | master-only (criar e livre) |

**Durable Object — nenhuma falha encontrada.** `MASTER_ONLY_TYPES` cobre token move/upsert/remove, `scene:clear`, iniciativa, grade e nevoa; `MASTER_ONLY_MAP_SIGNAL_TYPES` cobre announce/set/clear/offer/ws:*. As duas excecoes do jogador sao estreitas e validadas contra o username autenticado (mover o proprio token com a trava aberta; invocar/retirar o proprio Echo). `mesa:dice:result` nasce so no DO (nao da para forjar resultado) e `mesa:sheet:patch` de jogador passa por `filterPlayerSheetPatch` + checagem de que a ficha e a dele.

**Identidade do socket — checada de proposito.** O DO decide papel pelos headers `x-armagedon-username`/`x-armagedon-role`. O Worker copia os headers do cliente (o upgrade de WS precisa) e **sobrescreve os dois com o JWT verificado** usando `set()`. Um jogador mandando `x-armagedon-role: master` na mao e ignorado. Como e um ponto onde uma refatoracao inocente vira escalada de privilegio, ganhou comentario de aviso e um teste que falha se a ordem inverter ou se `set` virar `append`.

**Frontend — 1 falha encontrada e corrigida.** `regras.html`, `sugestoes.html` e `echos.html` ja estavam corretas (verificado com sessao de jogador rodando). Na **ficha**, porem, `openMasterPanel()`, `backToMaster()` e `masterView()` eram globais sem trava: um jogador chamava `backToMaster()` pelo console e caia no painel do mestre, com os formularios de criar jogador/NPC/monstro. Nao vazava dado (o `/api/directory` nao devolve NPC nem monstro para jogador e toda acao dali volta 403), mas e a mesma classe de bug da Mesa. Corrigido com `isFichaMaster()` nas tres funcoes (js/ficha-master.js, `?v=2026-08-02-permissoes-1`).

**Ponto de robustez (nao e falha de permissao, fica registrado)**: a chave de ficha de jogador e o proprio username (`buildCharacterKey`), sem prefixo, enquanto NPC e monstro usam `npc:`/`monster:`. Um jogador criado com username `npc:algo` colidiria com a chave de um NPC — `characters_sheet_key_uidx` barra no banco, mas o erro sai como 500 em vez de mensagem clara. So o mestre cria usuarios, entao nao e explorável por jogador.

- **Testes novos**: `test:mesa:permissoes` foi de 8 para 10 (contrato do backend: identidade do socket e cobertura de `MASTER_ONLY_TYPES`).
- **Validacoes do complemento**: `check:js` OK, `audit:static` OK, `test:mesa:permissoes` 10/10, `test:ficha` 29/29.

## Etapa Anterior (2026-08-02 — Etapa 74: uma ferramenta por vez + teto de tracos maior)

Tiago: "nao deve ser possivel selecionar o desenho e outra forma de interagir com o quadro ao mesmo tempo" + "quero que o limite de traco seja grandemente aumentado".

- **Exclusao mutua**: a metade que existia era so uma — `setInteractionMode` ja chamava `setDrawTool(null)`, mas escolher uma ferramenta de desenho NAO desligava a mao/selecao. Os dois botoes ficavam acesos e o mesmo arrasto disputava desenhar e arrastar o palco. Agora `setDrawTool` chama `clearMesaInteractionMode()`. Para nao virar recursao, o miolo de `setInteractionMode` saiu para `_applyInteractionMode(next)` (aplica estado + botoes + `data-interaction-mode` + limpa a selecao multipla) e as duas portas de entrada usam ele.
- **Teto de tracos**: 300 → **1500** tracos e 200 → **400** pontos por traco de lapis. O limitador real nao era a contagem e sim o corpo do `PUT /api/mesa/scene`, que subiu de 256KB para **1MB** — sem isso o teto novo era inalcancavel. `MAX_RELAY_DRAWINGS` do Durable Object acompanhou. Um traco de lapis CHEIO (400 pontos) da ~7KB, bem abaixo do cap de 32KB por mensagem, entao o delta de um traco continua cabendo sempre.
- **Arquivos**: js/mesa-select.js, js/mesa-drawing.js, cloudflare/src/mesa.js, cloudflare/src/mesa-realtime-rules.js, cloudflare/src/index.js, mesa.html (`?v=2026-08-02-exclusivo-1`), tests/mesa-audit.spec.cjs.
- **Validacoes**: `check:js` OK, `audit:static` OK, `test:mesa:audit` 123/123 (3 novos + 3 adaptados aos tetos), `test:mesa` 5/5, `test:mesa:tokens` 10/10, `test:ficha` 29/29, `perf:mesa` 1/1, `wrangler deploy --dry-run` limpo. Um dos testes novos compara o teto do cliente com o do Worker e com o do DO — os tres tem que bater.
- **Deploy feito** em 2026-08-02, version ID `1d0cf43e-78d1-4178-ab00-a21d084ebb86` (dry-run limpo antes; health 200 depois). Sem ele, o Worker seguiria cortando em 300 tracos/200 pontos e recusando corpo acima de 256KB — o quadro ficaria maior na tela do que no banco.

## Etapa Anterior (2026-08-02 — Etapa 73: nao dava para desenhar no palco)

Tiago: "nao esta sendo possivel desenhar no board; a ideia e desenhar na mesma camada dos tokens, todos compartilham".

- **Causa (regressao da Etapa 66)**: `#mesaStage`, o container dos tokens, e `position: absolute; inset: 0` e cobre TODO o palco. A Etapa 66 subiu ele para `z-index: 10` (para a grade parar de passar por cima dos tokens), acima do `#mesaDrawCanvas` (z 8). Sem `pointer-events: none`, ele passou a engolir **todo** `mousedown` do palco: o canvas recebia `pointer-events: all` do `setDrawTool`, mas nunca era o alvo do hit-test. Medido com Playwright: com o lapis ativo, `elementsFromPoint` devolvia `#mesaStage` acima do canvas e o `mousedown` do canvas nunca disparava (0 tracos).
- **Correcao (css/mesa-stage.css)**: `.mesa-stage { pointer-events: none }` + `.mesa-token { pointer-events: auto }` — quem precisa do ponteiro sao os tokens, nao o container. Seleção, arrasto, marquee e pan seguem iguais (todos escutam no `#mesaStageWrap`, ninguem escuta no `#mesaStage`).
- **Ferramenta ativa sobe o canvas (css/mesa-drawing.css)**: `setDrawTool` agora marca `data-draw-active` no `#mesaStageWrap` e o CSS decide tudo (cursor, `z-index: 11` e `pointer-events`). Com ferramenta ativa o desenho fica ACIMA dos tokens — da para comecar um traco em cima de um token e apagar traco que passa por baixo; sem ferramenta ele volta para z 8, abaixo dos tokens. Sumiu o `pointer-events`/cursor inline, que nao resolvia nada.
- **Camada unica (js/mesa-drawing.js)**: acabou a camada secreta de desenho. Todo traco nasce em `layer: "tokens"`, o render nao filtra mais por papel, Ctrl+Z desfaz o ultimo traco sem olhar camada e os tres caminhos de sync (add/remove/full-state) mandam tudo. Traco antigo `dm` e adotado como compartilhado na leitura (`_asSharedStrokes`), sem migracao de banco.
- **Arquivos**: css/mesa-stage.css, css/mesa-drawing.css, js/mesa-drawing.js, mesa.html (`?v=2026-08-02-desenho-1` nos tres), tests/mesa-audit.spec.cjs.
- **Validacoes**: `check:js` OK, `audit:static` OK, `test:mesa:audit` 120/120 (3 testes novos + 4 adaptados a camada unica), `test:mesa` 5/5, `test:mesa:tokens` 10/10, `test:ficha` 29/29, `perf:mesa` 1/1. O teste novo desenha com mouse de verdade e exige traco no palco E em cima de um token; antes da correcao o traco nao existia.
- **Sem mudanca no Worker**: `normalizeSceneDrawing` ja default para `layer: "tokens"`; os filtros de `dm` do DO e do GET continuam la, so ficaram inertes.

## Etapa Anterior (2026-08-01 — Etapa 72: etiqueta de tamanho tampada pelo botao)

Tiago mandou print: o valor mostrado enquanto o token e redimensionado ficava atras do botao de efeitos de status.

- **Causa**: `.mesa-token-sizetag` e `.mesa-token-markers-btn` dividiam exatamente o mesmo ponto — `left: 50%` + `bottom: 100%`, ou seja, centro acima do token. Como o botao vem depois no DOM e e opaco, ele cobria a etiqueta.
- **Correcao** (css/mesa-stage.css): a etiqueta desceu para `top: 100%` (folga de 6px no `translateY`, antes do `scale`, para continuar em px de TELA — regra da Etapa 71). O nome do token, que tambem mora embaixo, some enquanto `is-resizing` esta ativo: o redimensionamento e momentaneo e o token segue identificado pela selecao.
- **Arquivos**: css/mesa-stage.css, mesa.html (`?v=2026-08-01-sizetag-1`), tests/mesa-token-handles.spec.cjs.
- **Validacoes**: `check:js` OK, `audit:static` OK, `test:mesa:tokens` 10/10, `test:mesa` 5/5, `test:mesa:audit` 117/117. O teste da Etapa 71 passou a exigir tambem que a etiqueta fique **abaixo da caixa** e **abaixo do botao** nas escalas 1/3/8 — com o CSS antigo ele falha.
- **Sem mudanca no Worker.**

## Etapa Anterior (2026-07-31 — Etapa 71: alcas de resize fora do canto)

Tiago mandou print: com o token grande, os quadradinhos de redimensionar apareciam empurrados para dentro da caixa, desalinhados.

- **Causa**: a caixa de selecao (`.mesa-token-selbox`) desenhava o contorno com `border` de largura contra-escalada (`calc(1px / (token-scale * zoom))`). Toda borda visivel abaixo de 1px e arredondada para **1px de LAYOUT** pelo Blink — e o transform do token multiplica isso de volta. Como as alcas sao filhas da caixa e o posicionamento absoluto ancora no PADDING box, elas entravam esse 1px de layout: medido **1px de desvio na escala 1, 3px na 3 e 8px na 8**.
- **Correcao** (css/mesa-stage.css + o `<style>` anti-FOUC de mesa.html): o contorno passou a ser `box-shadow: inset` — pintura, nao layout: nao mexe no padding box e aceita espessura fracionaria. As alcas tambem ganharam centragem dentro do proprio transform (`scale() translate(-50%, -50%)` com origem no canto) em vez da `margin: -4.5px`, que era px de layout pelo mesmo motivo.
- **De quebra**: o botao de marcadores e a etiqueta de tamanho usavam `margin` para a folga acima do token — a distancia crescia com a escala (10px viravam **80px** com o token em 8x). A folga foi para dentro do transform (`translateY` aplicado antes do `scale`), ficando constante em px de tela.
- **Arquivos**: css/mesa-stage.css, mesa.html (`?v=2026-07-31-handles-1`), tests/mesa-token-handles.spec.cjs.
- **Validacoes**: `check:js` OK, `audit:static` OK, `test:mesa:tokens` 10/10 (2 testes novos), demais suites 152/152. Os testes novos varrem as escalas 1/2/5/8/12 e exigem desvio < 0,5px em todas as 8 alcas, tamanho de tela constante e folga fixa do botao/etiqueta; com o CSS antigo eles falham (8px de desvio na escala 8).
- **Sem mudanca no Worker.**

## Etapa Anterior (2026-07-31 — Etapa 70: token grande era cortado no sync)

Tiago: "algo limita o token; quando aumento mais que isso e arrasto ele volta".

- **Causa**: js/mesa-core.js tinha o intervalo de escala **0,25–4 escrito na mao em TRES lugares** — sobra do teto antigo, que a Etapa 65 subiu para 12 apenas em js/mesa-stage.js e no Worker. Efeitos: (1) `serializeMesaRealtimeToken` cortava em 4 → o mestre via o token grande e os JOGADORES recebiam menor; (2) `mergeTokenWithRoster` cortava no boot → depois do F5 o token voltava a 4; (3) a assinatura da cena cortava em 4 → persist so-de-escala podia cair no dedupe. Qualquer um desses "puxava o token de volta" depois de um arrasto.
- **Correcao**: helper unico `clampMesaTokenScale()` em js/mesa-core.js, que le `MESA_TOKEN_SCALE_MIN/MAX` de js/mesa-stage.js (com fallback 0,1–12). Nenhum arquivo repete mais o intervalo.
- **Arquivos**: js/mesa-core.js, mesa.html (`?v=2026-07-31-scaleclamp-1`), tests/mesa-audit.spec.cjs.
- **Validacoes**: `check:js` OK, `audit:static` OK, suites completas **160/160** (1 teste novo). O teste cobre o ciclo inteiro — escala 9,5 sobrevive ao realtime, ao payload da cena, a assinatura do dedupe e a um F5 real; com o codigo antigo ele falha devolvendo 4.
- **Sem mudanca no Worker** (o clamp de la ja era 0,1–12 desde a Etapa 69).
- **Em aberto**: se o token ainda parar por volta de 800% COM a grade ligada, o limitador e o teto em celulas da Etapa 69 (`_gridMaxCells` = metade do menor lado do mapa) — e decisao de regra, nao bug.

## Etapa Anterior (2026-07-31 — Etapa 69: tamanho do token em celulas)

Tiago: "quero que os tamanhos sejam mais dinamicos e que sempre fiquem encaixados nas celulas do grid".

- **Tamanho encaixa sozinho**: com a GRADE ligada, o tamanho do token e sempre um multiplo inteiro de celula — deixou de depender do checkbox "Encaixar tokens" (`mesaFitTokenToGrid`/`mesaPreviewGridScale` em js/mesa-grid.js agora exigem so `enabled`). O checkbox virou **"Encaixar ao mover"** e manda apenas na POSICAO ao arrastar; o RESIZE alinha o quadrado as linhas de qualquer jeito (`mesaConformTokenToGrid(..., { forceAlign: true })`).
- **Limites dinamicos**: o teto saiu da escala e foi para CELULAS — `_gridMaxCells()` = metade do menor lado da superficie do mapa (mapa de 20x14 celulas → ate 7x7), piso de 1x1. Celula menor, mais celulas disponiveis. `MESA_TOKEN_SCALE_MIN/MAX` viraram guarda-corpo do contrato: o piso caiu de 0,25 para **0,1** para caber 1 celula em grades finas.
- **Arrasto sem tamanho intermediario**: o ima de 8px (`MESA_RESIZE_SNAP_PX`) saiu — durante o resize o token pula de NxN para (N+1)x(N+1). Antes dava para soltar no meio e o token ficava por cima das linhas. **Alt** segurado continua liberando tamanho livre; **sem grade** o resize e continuo.
- **Worker**: `normalizeSceneToken` clampa `tokenScale` em 0,1–12 (era 0,25–12). **Deploy feito** em 2026-07-31, version ID `ab2d6bf0-2387-4466-8d8d-d86f6bb1a139` (dry-run limpo antes; health 200 depois). Sem o deploy, token menor que 0,25 voltaria aumentado no proximo carregamento da cena.
- **Arquivos**: js/mesa-grid.js, js/mesa-stage.js, cloudflare/src/mesa.js, mesa.html (`?v=2026-07-31-cells-1` em mesa-grid.js e mesa-stage.js), tests/mesa-audit.spec.cjs, tests/mesa-token-handles.spec.cjs.
- **Validacoes**: `check:js` OK, `audit:static` OK, `test:mesa:audit` 116/116 (6 novos), `test:mesa:tokens` 8/8, `test:mesa` 5/5, `test:ficha` 29/29, `perf:mesa` 1/1. No navegador, com "Encaixar ao mover" DESLIGADO: 1x1 → 2x2 → 4x4 (teto do mapa), sempre inteiro e com desvio das linhas < 0,2px; grade desligada devolve escalas continuas (3,58 / 4,10 / 3,28).

## Etapa Anterior (2026-07-31 — Etapa 68: palco SEMPRE ajustado ao mapa)

Tiago: "quando ativo um mapa ele vem na proporcao de origem mas a mesa continua na proporcao anterior e parte do mapa e cortada"; e "nem todos os mapas estao sendo ajustados". Duas coisas: o ajuste virou invariante e o bug que fazia alguns mapas nao ajustarem foi corrigido.

- **Causa de "nem todo mapa ajusta"**: `setMapFromConnectedFolder()` (js/mesa-map.js) — o caminho dos mapas da **pasta conectada** — nunca media a imagem. `mesaMapState._imgW/_imgH` ficavam com as dimensoes do mapa ANTERIOR, entao o palco era ajustado a proporcao errada; no primeiro mapa depois de um F5 (dimensoes em 0) o ajuste nem acontecia. Os mapas da biblioteca IDB mediam (`applyActiveMap`) e por isso funcionavam — a diferenca que fazia parecer aleatorio.
- **Correcao**: a medicao virou uma funcao unica, `_probeMapImage(url, onDone)`, usada nos QUATRO caminhos de ativacao (arquivo local, biblioteca IDB, pasta conectada, cena oficial/R2). Ela tambem trata `onerror` — antes uma imagem que falhava deixava as dimensoes em 0 para sempre e o ajuste morria em silencio.
- **Ajuste agora e invariante**: `isStageFitToMap()` devolve `true` fixo. Sairam o botao "Ajustar/Ajustado" da barra (`#mesaMapFitBtn`), o checkbox do painel (`#mesaMapFitGroup`/`#mesaMapFitToggle`) e o estado `_fitToMap` com toda a sua sincronizacao (`setStageFitToMap`, `toggleStageFitToMap`, `_applyRemoteFit`, `_syncFitToggleUI`, `_bindFitToggle`, `_fitDefaultForNewMap`). Cena antiga gravada com `fit:false` nao desajusta mais nada: o campo e ignorado na leitura.
- **Compatibilidade**: os payloads de cena e realtime continuam enviando `fit: true`; o Worker segue normalizando o campo (`cloudflare/src/mesa.js`), entao **nao precisou de deploy**.
- **Arquivos**: js/mesa-map.js, mesa.html (`?v=2026-07-31-fit-sempre-1` em mesa-map.js e mesa-map.css), css/mesa-map.css, tests/mesa-audit.spec.cjs.
- **Validacoes**: `check:js` OK (46 arquivos), `audit:static` OK, `build:pages` OK, `test:mesa` 5/5, `test:mesa:tokens` 8/8, `test:ficha` 29/29, `perf:mesa` 1/1, `test:mesa:audit` **110/110** (7 testes novos). Cobertura nova: mapa da pasta conectada mede as PROPRIAS dimensoes (o bug — verificado falhando com a correcao removida, devolvia `[4000, 1000]`); troca de mapa na biblioteca nao herda a proporcao anterior; grade, nevoa e desenhos seguem a caixa nova ao trocar de mapa; jogador com cena `fit:false` continua ajustado; falha ao medir nao deixa caixa errada; palco reajusta ao redimensionar a janela; cena sempre grava `fit: true` e os controles sumiram do DOM.
- **Sem mudanca no Worker.**

## Etapa Anterior (2026-07-31 — Etapa 67: botao de marcadores tampava o nome)

Tiago mandou print: a bolinha de marcadores de status, embaixo do token, cobria o nome.

- **Correcao** (css/mesa-stage.css): `.mesa-token-markers-btn` passou de `top: 100%` para `bottom: 100%` (`margin-bottom: 10px`, `transform-origin: bottom center`). O botao agora fica ACIMA do circulo; o nome embaixo fica livre.
- Quando o token ja tem chips de condicao (que tambem ficam acima), uma regra `:has(.mesa-token-markers)` sobe o botao para `margin-bottom: 34px` para nao cobrir a fileira de chips.
- **Arquivos**: css/mesa-stage.css, mesa.html (`?v=2026-07-31-markersbtn-top-1`).
- **Sem mudanca no Worker.**

## Etapa Anterior (2026-07-31 — Etapa 66: tokens estavam abaixo da grade)

Tiago mandou print: as linhas da grade passavam POR CIMA do token.

- **Causa**: `.mesa-stage` (a camada dos tokens) estava em `z-index: 2`, abaixo da grade (7) e dos desenhos (8). O token era desenhado primeiro e tudo passava por cima dele.
- **Correcao** (css/mesa-stage.css): tokens foram para `z-index: 10`. O marquee da selecao por area (`#mesaRubberBand`, css/mesa.css) subiu de 9 para 12 para continuar aparecendo por cima dos tokens que ele esta selecionando.
- **Pilha completa documentada num comentario em css/mesa-stage.css** (era conhecimento espalhado por quatro arquivos): 0 mapa, 7 grade, 8 desenhos, 10 TOKENS, 12 marquee, 15 caixa da selecao multipla, 26 nevoa, 29 regua, 30 ping. A nevoa fica acima dos tokens de proposito — senao nao esconderia token nenhum.
- **Arquivos**: css/mesa-stage.css, css/mesa.css, mesa.html (`?v=2026-07-30-zorder-1`), tests/mesa-token-handles.spec.cjs.
- **Validacoes**: `check:js` OK (46 arquivos), `audit:static` OK, `test:mesa` 5/5, `test:mesa:tokens` 8/8, `test:mesa:audit` 106/106. Teste novo verifica a ordem relativa (token acima de mapa/grade/desenhos, abaixo de marquee/nevoa) e que `elementFromPoint` no centro do token devolve o token, nao a grade.
- **Sem mudanca no Worker.**

## Etapa Anterior (2026-07-30 — Etapa 65: token travava em 3x3 e saia da grade)

Tiago mandou print: token grande com a caixa fora das linhas da grade e sem passar de 3x3. **Os dois sintomas tinham a MESMA causa** — o clamp de escala do token (0,25–4,0).

- **Causa**: o teto de 4,0 era absoluto, mas o tamanho em CELULAS depende da celula. Com celula de ~126px e base do token de 88px, encaixar em 4 celulas exigiria escala ~5,7. O clamp cortava em 4,0 e o token parava em ~2,8 celulas: nao passava de 3x3 **e** o tamanho deixava de ser multiplo inteiro da celula, entao a caixa nao coincidia mais com as linhas da grade. Quem tem celula pequena nunca viu o bug — por isso os testes anteriores (sem mapa, celula de 46px) passavam.
- **Correcao 1 — teto maior**: `MESA_TOKEN_SCALE_MIN/MAX` (0,25–12) em js/mesa-stage.js, espelhados no Worker. Com celula de 126px isso da ate 8x8; a formula e `floor(12 * 88 / celulaPx)`.
- **Correcao 2 — nunca parar num tamanho quebrado**: `_gridFitCells()` em js/mesa-grid.js. Se N celulas nao couberem no teto, desce para o maior N que cabe, em vez de clampar no meio do caminho. Vale para `mesaFitTokenToGrid` e `mesaPreviewGridScale`. Sem isso, qualquer teto — 12, 20, 100 — teria o mesmo bug num mapa de celula grande o bastante.
- **Worker** (cloudflare/src/mesa.js): `tokenScale` clampado em 0,25–12. **Deploy feito** em 2026-07-30, version ID `bb8ca24c-91d5-4e42-8bdd-7de00e4bef48` (dry-run limpo antes; health 200 depois). Sem o deploy o Worker cortaria em 4 ao salvar a cena e o token voltaria a 3x3 no proximo carregamento.
- **Arquivos**: js/mesa-stage.js, js/mesa-grid.js, cloudflare/src/mesa.js, mesa.html (`?v=2026-07-30-scale12-1`), tests/mesa-token-handles.spec.cjs, tests/mesa-audit.spec.cjs (assercao do clamp foi de 4 para 12).
- **Validacoes**: `check:js` OK (46 arquivos), `audit:static` OK, `test:mesa` 5/5, `test:mesa:tokens` 7/7, `test:mesa:audit` 106/106. Teste novo reproduz o print (celula de 126px, maior que o token) e mede o resize em tres passos: 3, 6 e 8 celulas, sempre inteiras e sobre as linhas (desvio < 0,5px).
- **Nota**: a "proporcao errada" nao era o circulo destoando da caixa — medido, token, avatar e caixa de selecao batem em 264px exatos. Era a caixa saindo das linhas da grade por causa do tamanho quebrado.

## Etapa Anterior (2026-07-30 — Etapa 64: marcadores acessiveis pelo token)

Pedido do Tiago: poder aplicar os marcadores **que ja existiam** clicando no token e abrindo as configuracoes dele. Nada de marcador novo.

- **Painel de marcadores** (js/mesa-markers.js, NOVO): popover com as 12 condicoes da Etapa 46, botao "Limpar tudo" e contador `N/8`. Abre pelo botao `◉` no token selecionado ou pelo "Editar" do inspetor — o mesmo painel nos dois casos. Fecha com Esc, clique fora ou resize da janela. Master-only, como sempre foi.
- **Inspetor** (js/mesa-inspector.js): a grade de 12 toggles saiu; no lugar, um resumo dos marcadores ativos + o botao que abre o painel. Uma fonte de verdade so. A acao `toggle-marker` de `handleInspectorAction` virou codigo morto e foi removida.
- **Worker e whitelist inalterados**: as mesmas 12 condicoes, mesmo cap de 8. **Nao precisa de deploy.**
- **BUG corrigido da Etapa 63**: as 8 alcas ficavam com `pointer-events: auto` mesmo com a caixa de selecao invisivel (`opacity: 0`) — eram alvos-fantasma em volta de **todo** token nao selecionado, roubando clique de quem tentava selecionar ou arrastar. Agora `pointer-events` so liga em `.is-selected`/`.is-resizing`. O botao do inspetor e excecao (`:not(.is-inspector)`), porque vive fora do token.
- **Escopo cortado a pedido do Tiago**: uma primeira versao desta etapa tinha adicionado 7 bolinhas de cor, campo de busca e a mudanca correspondente na whitelist do Worker (que exigiria deploy). Nada disso foi pedido — tudo revertido. **Licao**: pedido de "implementar X" a partir de uma referencia visual nao autoriza trazer todos os recursos que aparecem na referencia; confirmar o recorte antes de mexer no backend.
- **Arquivos**: js/mesa-markers.js (novo), js/mesa-stage.js, js/mesa-inspector.js, css/mesa-stage.css, mesa.html (container do painel + `<script>` + `?v=2026-07-30-markers-1`), tests/mesa-audit.spec.cjs.
- **Validacoes**: `check:js` OK (46 arquivos), `audit:static` OK, `test:mesa` 5/5, `test:mesa:tokens` 6/6, `test:mesa:audit` 106/106 (2 testes novos: "Limpar tudo" transmitindo o esvaziamento; Esc + alvos-fantasma). O teste da Etapa 46 que dirigia `.inspector-marker-btn` foi reescrito para o painel novo.
- **Ajuste 2026-07-30 (mesma etapa)**: a caixa de selecao usava `inset: -6px`, uma folga que era MULTIPLICADA pela escala do token (a 3x virava 18px). A caixa descolava do circulo e nao coincidia com as linhas da grade. Agora `inset: 0` (a caixa e a caixa do token) e o traco tem `border-width` contra-escalado para ficar em 1px de TELA. Botao de marcadores foi de 22px para 30px e o caractere `◉` virou SVG — glifo depende da fonte instalada e nao ficava opticamente centrado. Testes novos medem que, apos um resize com snap, o token ocupa um numero inteiro de celulas e as quatro bordas caem sobre as linhas da grade (desvio < 0,5px), e que o botao mantem tamanho de tela constante com o icone centrado em qualquer escala.
- ~~**Pendente**: barra circular de HP em volta do token segue nao feita.~~ → **movida** para "Pendencias Vivas" no topo em 2026-08-16 (continua por fazer; virou decisao do Tiago).

## Etapa Anterior (2026-07-30 — Etapa 63: interacao com o token — 8 alcas e hover sem brilho)

Tiago apontou dois incomodos na Mesa: redimensionar token era pouco pratico e o brilho branco no hover atrapalhava. Referencia de base: Roll20.

- **Resize (js/mesa-stage.js)**: a alca unica de 18px no canto inferior-direito virou uma **caixa de selecao com 8 alcas** (`.mesa-token-selbox` + `.mesa-token-handle[data-handle]`), renderizada so para quem tem permissao de redimensionar.
  - A matematica antiga (`delta = (dx + dy) / 300`) era escala fixa por pixel de tela: **ignorava o zoom do palco** — afastado voce arrastava muito e o token quase nao crescia; proximo, explodia. Agora a escala vem da **geometria**: `projectResizePointer()` projeta o cursor no eixo da alca e o canto arrastado segue o ponteiro 1:1 em qualquer zoom.
  - Cada alca tem um **ponto ancora** (`MESA_HANDLE_ANCHOR`): o canto/aresta oposto fica parado. Como o token usa `transform-origin: top left`, `applyResizePreview()` recalcula `token.x/y` junto com a escala para manter essa ancora fixa.
  - `grabOffset` desconta a distancia entre a alca e a borda do token (a caixa e circunscrita, inset -6px): sem isso o token dava um pulo no instante do clique.
  - **Ima da grade durante o arrasto** (`window.mesaPreviewGridScale` em js/mesa-grid.js, funcao pura): mostra o encaixe em NxN celulas ANTES de soltar, com zona de ima de 8px de tela. Antes so o `pointerup` quantizava e o token "pulava" de tamanho ao soltar. **Alt** segurado ignora o ima. `mesaConformTokenToGrid` continua no pointerup so para corrigir arredondamento.
  - Etiqueta de tamanho (`.mesa-token-sizetag`) durante o arrasto: `2×2` com grade, `%` sem grade.
  - Cursor do body agora segue o eixo da alca (`body[data-resize-dir]`), nao mais sempre a diagonal.
- **Hover/selecao (css/mesa-stage.css)**: o hover perdeu o `translateY(-2px)` (o token nao "pula" mais debaixo do cursor) e o halo branco de 3px (`rgba(255,248,236,.85)`) saiu de vez. Hover = anel do tipo em opacidade cheia; selecao = anel carmesim fino + a caixa de alcas; halos carmesim de 18/36px viraram um so de 12px. Ver VISUAL_RULES.md.
- **`--stage-zoom`** (js/mesa-map.js): `_applyStageTransform` passou a expor o zoom ao CSS. As alcas e a etiqueta se contra-escalam por `--token-scale × --stage-zoom` para manter tamanho constante em px de TELA — sem isso sumiriam no zoom afastado e virariam blocos no proximo.
- **Atencao — bloco `<style>` inline em mesa.html**: ele DUPLICA regras de `css/mesa-stage.css` e, por vir depois do `<link>`, vence no empate de especificidade. Toda mudanca no visual do token precisa ser feita nos dois lugares.
- **Arquivos**: js/mesa-stage.js, js/mesa-grid.js, js/mesa-map.js, css/mesa-stage.css, mesa.html (regras inline + `?v=2026-07-30-token-handles-1`), tests/mesa-token-handles.spec.cjs (novo), package.json (`test:mesa:tokens`).
- **Validacoes**: `check:js` OK (45 arquivos), `audit:static` OK, `test:mesa` 5/5, `test:mesa:audit` 104/104, `test:mesa:tokens` 6/6 (novo). Verificacao visual no navegador: caixa de 8 alcas no token selecionado, anel do tipo em opacidade cheia no hover, zero branco.
- **Nota de teste**: o anel tem transicao de 150ms — leitura de `border-color` logo apos trocar a classe pega cor interpolada, nao a final (custou uma investigacao). E `--token-scale` inline em teste dessincroniza o DOM do `token.tokenScale`, fazendo o resize partir de base errada.
- ~~**Pendente / nao feito**~~ — **RESOLVIDO na Etapa 64** (js/mesa-markers.js, painel de marcadores no token; conferido em 2026-08-16). Registro original: os **marcadores de status** (bolinhas coloridas + icones sobre o token) da segunda referencia do Roll20 nao entraram nesta etapa — sistema a parte, encaixa no mesa-inspector depois, junto com uma barra circular de HP em volta do token.

## Etapa Anterior (2026-07-28 — BUG: nao dava para DESLIGAR a nevoa)

Tiago pediu para garantir que o liga/desliga da nevoa funcionava antes de commitar. Nao funcionava: **desligar a nevoa nunca funcionou desde a Etapa 47**.

- **Causa**: o handler do checkbox fazia `if (!toggle.checked) setMesaFogBrush(null)` e so DEPOIS lia `toggle.checked` de novo para montar o patch. Mas `setMesaFogBrush` chama `_syncFogSettingsUI`, que reescreve `toggle.checked` a partir do estado — que ainda estava LIGADO. A leitura seguinte via `true` e a nevoa se religava sozinha, no mesmo clique. Ligar sempre funcionou; desligar, nunca. Nao dependia de ter pincel armado: `setMesaFogBrush(null)` roda em todo desligamento.
- **Correcao** (js/mesa-fog.js): ler a intencao (`const querLigada = toggle.checked`) ANTES de qualquer coisa que sincronize a UI. Licao registrada: em handler de evento, capturar o valor do controle antes de chamar funcao que re-renderiza a propria UI.
- **Ajuste junto**: os botoes "Cobrir tudo" e "Revelar tudo" estavam com regras de habilitacao assimetricas (com a nevoa desligada, um clicava e o outro nao). Agora os dois seguem a mesma regra — desabilitado apenas quando a mesa JA esta naquele estado; com a nevoa desligada os dois ligam ja no estado escolhido.
- **Testes** (suite 87 -> 91, describe "Nevoa: liga/desliga"): desligar com o pincel armado (o cenario exato do print do Tiago) — nevoa desliga, checkbox desmarca, pincel desarma, cursor volta ao normal e a nevoa some da cena; desligar limpa a tela (alpha 0 no centro E no canto) mas PRESERVA as pinceladas, e religar restaura o mesmo desenho; os dois botoes "tudo" com a nevoa desligada; jogador recebe o desligamento do mestre.
- Validacao: suite completa 127/127 (1 skip = fluxo online autenticado), check:js OK, audit:static OK, build:pages OK.

## Etapa Concluida (2026-07-28 — Melhoria da nevoa: cobrir tudo x revelar tudo)

Pedido do Tiago: dois botoes distintos para cobrir o mapa inteiro e descobrir o mapa inteiro. A nevoa ganhou uma BASE em vez de um botao solto.

- **Modelo**: o estado da nevoa passou de `{ enabled, ops[] }` para `{ enabled, base, ops[] }`. `base` e o ponto de partida do mapa: `hidden` (padrao — tudo coberto, o comportamento de sempre) ou `revealed` (tudo descoberto). As ops continuam sendo aplicadas NA ORDEM por cima da base, entao com base `revealed` o pincel "Cobrir" vira a ferramenta principal: revela o mapa inteiro e esconde so a sala do chefe. Cena antiga sem o campo (e qualquer valor invalido) cai em `hidden` — ZERO migracao, e nunca revela sem o mestre mandar.
- **Por que nao usei "desligar a nevoa" como "revelar tudo"**: desligada, o pincel some e o jogador nao tem nevoa nenhuma; revelada, a nevoa segue armada e o mestre pode voltar a cobrir pontos na hora. Sao estados diferentes de verdade.
- **js/mesa-fog.js**: `revealAllMesaFog()` (novo) e `resetMesaFog()` agora setam a base explicitamente; render pinta a base so quando `hidden`; `_syncFogSettingsUI` marca (`is-active`) e desabilita o botao do estado ATUAL — clicar de novo nao faria nada.
- **mesa.html**: botao `#mesaFogRevealAllBtn` ("Revelar tudo") ao lado de "Cobrir tudo".
- **cloudflare/src/mesa.js**: `normalizeSceneFog` normaliza `base` (whitelist; invalido vira `hidden`) e so descarta a nevoa (null) quando esta desligada, sem ops E na base padrao — base `revealed` e estado, nao pode sumir no round-trip.
- **js/mesa-core.js**: assinatura de dedupe alinhada a mesma condicao (mudar so a base nao pode cair no dedupe — licao das etapas anteriores).
- **Testes** (suite 83 -> 87, describe "Nevoa: cobrir tudo x revelar tudo"): Worker normaliza a base e mantem a cena antiga em `hidden`; os dois botoes trocam a base, entram na cena e sao transmitidos (com o estado dos botoes lido no momento certo — a UI re-sincroniza a cada mutacao); render medido por alpha do canvas (coberto 255 -> revelado 0 -> pincel Cobrir 255 -> Cobrir tudo 255); jogador nao muda a nevoa, recebe a base do mestre e segue com opacidade 1.
- Cache-bust: mesa-fog.js e mesa-core.js -> `?v=2026-07-28-fog-base-1`; `MESA_BUNDLE_VERSION` idem.
- Deploy do Worker: version `8b5a4914-7984-4400-825f-2e78364bb39f` (dry-run antes; health 200).
- Validacao: test:mesa:audit 87/87, test:mesa 5/5, test:ficha 28/28, check:js OK, audit:static OK, build:pages OK. Prova visual: coberto, revelado e revelado-com-buraco.

## Etapa Concluida (2026-07-30 — Etapa 62: Resolucao do token em relacao a grade)

Pedido do Tiago: "garantir a qualidade da resolucao dos tokens em relacao ao grid". Com mapa (4096) e grade (px de dispositivo) nitidos, **o avatar virou a camada mais borrada da Mesa**.

**Medido por sonda no Playwright** (token de estilo minimal, avatar de 256 px — o teto vigente; "fonte/tela" = px de fonte por px de DISPOSITIVO, abaixo de 1 a imagem esta esticada):

| celula | token na tela (z=1) | fonte/tela z=100% | z=200% | z=300% |
|---|---|---|---|---|
| 10 colunas | 93 px (1 celula) | 2,74 | 1,37 | **0,91** |
| 20 colunas | 93 px (2 celulas) | 2,74 | 1,37 | **0,91** |
| 40 colunas | 93 px (4 celulas) | 2,74 | 1,37 | **0,91** |

Isso com `devicePixelRatio` 1. **Em tela Retina (dpr 2) divide tudo por 2**: 1,37 a 100%, 0,69 a 200% e **0,46 a 300%** — o avatar esticado ao dobro. Confirmado tambem que `mesaFitTokenToGrid` esta correto: o token preserva o tamanho fisico e passa a ocupar 1, 2 ou 4 celulas conforme a grade, sem deformar (`tokenScale` 1,06 nos tres casos).

**Causa.** O teto de 256x256 em `handleAvatar` foi dimensionado para dois mundos que nao existem mais: token de 88 px sem zoom, e avatar guardado como base64 DENTRO do `data_json` no D1 (o comentario original vendia "~20 KB, 100x de economia"). Desde a migracao para o R2 o avatar e um arquivo com limite proprio de 2 MB, e desde a Etapa 58 o palco amplia ate 300%.

- **js/ficha-sheet.js** (`handleAvatar`): teto 256 -> **512**. Cobre ate ~2,7x o tamanho base do token; custo medido no pior caso (xadrez fino de 8 px, adversarial para o WebP) foi 143 KB — foto real fica bem abaixo, e o R2 aceita 2 MB.
- Cache-bust: `js/ficha-sheet.js?v=2026-07-30-avatar512-1`.
- **Testes** (ficha 28 -> 29): exercita o caminho REAL (`input[type=file]` -> `handleAvatar`) com uma foto 1200x1200 e afirma lado 512 e peso sob controle. **Validado contra a regressao**: com o teto em 256 falha com "Expected: 512 / Received: 256".
- **Limitacao que exige acao do Tiago**: o teto novo so vale para uploads NOVOS. Os avatares ja no R2 continuam em 256 px — para ganhar nitidez, cada ficha precisa reenviar a imagem. Nao ha como recuperar pixels que nunca foram salvos.
- **Nao mexido de proposito**: token grande (monstro com `tokenScale` 4) a 300% em Retina pede ~2100 px de fonte. Perseguir isso exigiria avatar de 2048 e nao paga o custo; 512 resolve o caso comum (token de 1-2 celulas).
- Validacao: test:ficha 29/29, check:js OK (45), audit:static OK.

## Etapa Concluida (2026-07-30 — Etapa 61: Grade deslocada ao aplicar/tirar zoom)

Feedback do Tiago: "o grid esta sendo deslocado quando aplico e retiro zoom no mapa; quero que ele mantenha a proporcao definida sempre, independente do zoom". **Regressao da Etapa 60** — a quarta da familia iniciada na Etapa 58.

**Medido por sonda no Playwright** (mapa 1600x1000, fit ligado, celula 5% = 20 colunas; a sonda le uma fatia do buffer, agrupa cada traco e converte o centro para fracao da superficie do mapa):

| zoom | colunas ANTES | espessura ANTES | erro ANTES | colunas DEPOIS | espessura DEPOIS | erro DEPOIS |
|---|---|---|---|---|---|---|
| 100% | 20 | 1 px | 0,02 cel | 20 | 1 px | 0,03 cel |
| 108% | 20 | 1 px | 0,02 cel | 20 | 1 px | 0,02 cel |
| 150% | **19** | **2 px** | **1,01 cel** | 20 | 1 px | 0,02 cel |
| 200% | **19** | **2 px** | **1,01 cel** | 20 | 1 px | 0,02 cel |
| 300% | 20 | **3 px** | 0,01 cel | 20 | 1 px | 0,01 cel |

A 150% e 200% a grade perdia a linha da borda e todas as outras liam como deslocadas de UMA CELULA inteira em relacao ao mapa — exatamente o que se via ao aplicar e tirar o zoom.

**Causa (duas, no mesmo ponto).** A Etapa 60 alinhou a grade ao pixel usando `dpr`, mas depois da Etapa 58 esse `dpr` e a escala do BUFFER, que ja carrega o zoom de palco. Consequencias:

1. `lineWidth = Math.round(dpr)` engordava com o zoom (1 px a 100%, 2 a 150%, 3 a 300%) — e a espessura em px de buffer, nao de dispositivo, entao o traco crescia na tela junto com o mapa.
2. Pior: a troca de PARIDADE da espessura vira a chave do alinhamento (`Math.round(v) + 0.5` para impar, `Math.round(v)` para par). Toda a grade escorrega meio pixel, e a linha da borda — que fica em `-0,4 px x dpr` por causa do arredondamento da caixa do fit (a "observacao menor" anotada na Etapa 59; ela nao era menor) — cai para fora do canvas em uns zooms e dentro em outros.

- **js/mesa-grid.js** (`renderMesaGrid`):
  - espessura passa a ser em px de DISPOSITIVO: `Math.round(dpr / zoomEff)`, com `zoomEff = max(1, getStageZoom())`. Constante e de paridade estavel em qualquer zoom — mantem a nitidez da Etapa 60 sem o efeito colateral.
  - borda rente ao palco: diferenca abaixo de 1 px de layout entre a superficie e o canvas passa a ser tratada como a MESMA borda (tolerancia `Math.max(1, dpr)`, que acompanha o zoom). Mata o residuo de arredondamento do fit na raiz.
- **js/mesa-map.js**: exporta `window.getStageZoom` — a grade precisa separar "escala do buffer" de "zoom de palco".
- Cache-bust: `js/mesa-grid.js` e `js/mesa-map.js` -> `?v=2026-07-30-zoomstable-1`; `MESA_BUNDLE_VERSION` -> `2026-07-30-zoomstable-1`.
- **Testes** (suite 103 -> 104, describe "Grade mantem a proporcao em qualquer zoom (Etapa 61)"): afirma o que faltava nos tres testes anteriores — a GEOMETRIA. Em 100/108/150/200/250/300% e na volta a 100%: mesmo numero de linhas, cada traco na mesma celula do mapa (tolerancia 1/10 de celula) e espessura que nao engorda com o zoom.
- **Licao (a quarta da mesma familia)**: os testes das Etapas 58, 59 e 60 cobriam buffer, caixa e brilho — todos verdes enquanto a grade pulava uma celula. O quarto eixo e a POSICAO das linhas em relacao ao mapa; e o unico que responde ao pedido "manter a proporcao". Corolario pratico: quando um valor acumula significados (aqui `dpr` = densidade **x** zoom), todo uso antigo dele precisa ser reavaliado, nao so os novos.
- Validacao: test:mesa:audit 104/104, test:mesa 5/5, check:js OK (45), audit:static OK.

## Etapa Concluida (2026-07-29 — Etapa 60: Grade cintilando no zoom)

Feedback do Tiago: "parece que o grid fica oscilando quando dou zoom, talvez esteja relacionado ao meu pedido para manter a resolucao". Estava — **terceira consequencia da Etapa 58**, causa diferente da Etapa 59.

**Medido por sonda no Playwright** (grade branca, opacidade 0.8 -> alpha alvo 204, sweep de zoom, alpha de TODOS os pixels do buffer):

| zoom | alpha medio ANTES | % px fracos ANTES | alpha medio DEPOIS |
|---|---|---|---|
| 100% | 103 | 89% | **204,0** |
| 130% | 121 | 77% | **204,0** |
| 160% | 133 | 67% | **204,0** |
| 200% | 152 | 52% | **204,0** |

O brilho da grade varria de 50% a 74% do pedido conforme o zoom — e era isso que se via oscilando. O numero de pixels acesos caiu quase a metade com o conserto: cada linha de 1 px estava borrada em 2–3.

**Causa.** O canvas CENTRA o traco na coordenada. A Etapa 58 fez o buffer escalar com o zoom, entao `lineWidth = Math.max(1, dpr)` (dpr = densidade x zoom) virou fracionario — e as coordenadas (`startX + n * cellPx`) sempre foram. Traco fracionario em coordenada fracionaria se espalha por 2–3 px com alpha parcial, e a divisao cai diferente em cada linha: grade manchada. Como o padrao de antialiasing varre junto com o zoom, a mancha se move: cintilacao. Antes da Etapa 58 o `dpr` era fixo, o padrao era estavel e ninguem via.

- **js/mesa-grid.js** (`renderMesaGrid`): espessura inteira (`Math.round(dpr)`) + coordenada alinhada ao pixel de dispositivo — meio-pixel para espessura impar, inteira para par. As extremidades (`clipTop/Bottom/Left/Right`) alinham tambem, senao as bordas da grade acendiam mais fraco que o miolo.
- Custo aceito: o espacamento arredonda para px inteiro, variando ate 1 px entre celulas — **menos** do que os 2 px que ja variava antes.
- Cache-bust: `js/mesa-grid.js?v=2026-07-29-crisp-1`; `MESA_BUNDLE_VERSION` -> `2026-07-29-crisp-1`.
- **Testes** (suite 102 -> 103, describe "Grade nao cintila no zoom (Etapa 60)"): afirma o que o olho ve — o BRILHO. Alpha medio > 200 e < 2% de px fracos em cada zoom de 100% a 200%, e variacao de brilho < 2 entre zooms. **Validado contra a regressao**: sem o conserto falha com "alpha medio fora do alvo em z100 / Received: 102.9".
- **Licao (a terceira da mesma familia)**: os testes das Etapas 58 e 59 sondavam o buffer e a caixa — ambos corretos enquanto a grade piscava. Nitidez tem tres eixos independentes (tamanho do buffer, caixa do elemento, alinhamento do traco) e cada um precisa da sua propria afirmacao.
- **Armadilha de medicao anotada**: a primeira sonda amostrava UMA fileira de pixels e caiu numa fileira atipica, inventando um "degrau" 204/163 que nao existia. Histograma do canvas inteiro desmentiu. Medir a distribuicao, nao uma amostra.
- Validacao: test:mesa:audit 103/103, test:mesa 5/5, test:ficha 28/28, perf:mesa 1/1, check:js OK (45), audit:static OK, build:pages OK. Prova visual: recorte da grade a 130% antes e depois.

## Etapa Concluida (2026-07-29 — Etapa 59: Grade transbordando o mapa)

Feedback do Tiago: "quando eu dou zoom a qualidade nao melhora e o grid sai da imagem". **Regressao que EU introduzi na Etapa 58** — os dois sintomas com a mesma causa.

**Medido por sonda no Playwright** (mapa 2048x1400, fit ligado, zoom 132%):

| Elemento | Caixa |
|---|---|
| `#mesaStageInner` | 1230x841 |
| `#mesaMapLayer` | 1230x841 |
| `#mesaFogCanvas` | 1230x841 |
| **`#mesaGridCanvas`** | **1624x1110** |

1624/1230 = 1,32 = exatamente o zoom.

**Causa.** Canvas e elemento SUBSTITUIDO: com `width: auto`, a largura usada vem do tamanho INTRINSECO (o atributo `width=`), nao das bordas do `inset: 0` — a regra de "over-constrained" que vale para elementos normais nao se aplica. `#mesaFogCanvas` ja tinha `width/height: 100%` explicito e `#mesaDrawCanvas` recebe `style.width/height` no JS; o grid era o unico apoiado so no `inset: 0`, e passava porque o buffer coincidia com a caixa CSS (`w x dpr`, dpr 1). Quando a Etapa 58 mudou o buffer para `w x dpr x zoom`, o ELEMENTO cresceu junto: transbordava o mapa e, exibido 1:1, nem ganhava nitidez. Um conserto, dois sintomas.

- **css/mesa-map.css**: `width: 100%; height: 100%` em `#mesaGridCanvas`, com comentario de "nao remover" explicando o porque.
- Cache-bust: mesa-map.css -> `?v=2026-07-29-sharp-2`; `MESA_BUNDLE_VERSION` -> `2026-07-29-sharp-2`.
- **Confirmado que a nitidez agora vale de fato**: a 132% o buffer da grade (1230x841) bate 1:1 com os pixels de TELA; antes eram 932x637 esticados pelo compositor para 1230.
- **Licao sobre o teste da Etapa 58**: ele passou com a feature quebrada porque so afirmava o tamanho do BUFFER, nunca que a CAIXA do canvas continuava igual a do palco. Buffer certo + caixa errada passava batido.
- **Testes** (suite 101 -> 102, describe "Grade nao transborda o mapa (Etapa 59)"): mapa, grade, nevoa e desenhos ocupam a MESMA caixa a 100%, 132% e 300%; e o buffer da grade acompanha os pixels de tela. **O teste foi validado contra a regressao**: revertendo o CSS ele falha com "grade fora da caixa em z132"; com o CSS, passa.
- Validacao: test:mesa:audit 102/102, test:mesa 5/5, test:ficha 28/28, perf:mesa 1/1, check:js OK (45), audit:static OK, build OK.
- Observacao menor, nao corrigida: a caixa do fit arredonda para px inteiro, entao a superficie do mapa fica em 1.00017 em vez de 1.0 (~0,1 px). Invisivel; anotado caso alguem persiga um fio de 1px no futuro.

## Etapa Concluida (2026-07-29 — Etapa 58: Nitidez no zoom)

Pedido do Tiago: "e possivel melhorar a resolucao do grid e se possivel do mapa tbm" — print com o palco a 300%, grade e mapa borrados.

**A causa NAO era falta de pixels na origem.** Conta: palco com ~950 px de largura em CSS, exibido a 300% = ~2850 px; o WebP do mapa tem 4096 px. Sobra resolucao. O borrao vinha de rasterizacao em escala errada, por dois motivos independentes:

1. **`will-change: transform` permanente** no `.mesa-stage-inner` (css/mesa.css). Isso promove o elemento a uma camada de composicao que o navegador rasteriza UMA vez na escala base e depois estica — a 300%, textura 1x ampliada 3x. Afetava o MAPA (background-image).
2. **Canvas com buffer fixo** em `offsetWidth x devicePixelRatio`. Um bitmap de tamanho fixo SEMPRE borra ao ser escalado pelo compositor, independente de camada. Afetava grade, nevoa e desenhos.

Correcoes:
- **js/mesa-map.js**: `getMesaRenderScale(w, h)` — densidade da tela vezes o zoom atual, limitada por `MAX_CANVAS_PIXELS` (24 MP ≈ 96 MB RGBA). `rescaleStageCanvases()` re-dimensiona os tres canvas, coalescido por frame (o slider de zoom dispara muitos eventos e realocar buffer a cada um seria caro). `_markStageTransforming()` poe a classe `is-transforming` no inner durante o movimento e a remove ~180ms depois, ja disparando o rescale.
- **css/mesa.css**: `will-change: transform` sai do `.mesa-stage-inner` e passa a valer so em `.is-transforming` — fluidez enquanto move, nitidez ao parar.
- **js/mesa-grid.js, js/mesa-fog.js, js/mesa-drawing.js**: o resize usa `getMesaRenderScale`; o RENDER passou a **derivar a escala do buffer REAL** (`canvas.width / offsetWidth`) em vez de recalcular. Sem isso, um render disparado entre a mudanca de zoom e o resize usaria escala nova com buffer antigo e desenharia fora do canvas.
- Fallback: os tres modulos caem em `devicePixelRatio` se `getMesaRenderScale` nao existir (mesa-map nao carregado).
- Cache-bust: mesa.css, mesa-map.js, mesa-grid.js, mesa-fog.js, mesa-drawing.js -> `?v=2026-07-29-sharp-1`; `MESA_BUNDLE_VERSION` idem.
- **Testes** (suite 99 -> 101, describe "Nitidez no zoom (Etapa 58)"): a 100% o buffer dos tres canvas e `offsetWidth x dpr` (comportamento de sempre); **a 300% TRIPLICA** — antes ficava na base e o compositor esticava; teto de 24 MP respeitado em area de 4000x4000; voltar o zoom devolve o buffer ao tamanho normal (nao fica inflado). E `will-change` computado: `auto` parado, `transform` durante o movimento, `auto` de novo ao parar.
- Validacao: test:mesa:audit 101/101, test:mesa 5/5, test:ficha 28/28, **perf:mesa 1/1** (rodada de proposito: a mudanca aumenta memoria de canvas), check:js OK (45), audit:static OK, build:pages OK.
- **Nota**: o mapa REFF ja ativo foi importado antes da Etapa 55, entao esta guardado em 1920px. Reabri-lo pela Biblioteca/pasta re-comprime em 4096px — so ai a resolucao nova vale para ele.
- **Nao verificado**: nitidez percebida a olho. O Browser pane nao compoe frames nesta sessao, entao a prova e numerica (tamanho de buffer e will-change computado), nao visual.

## Etapa Concluida (2026-07-29 — Etapa 57: Correcoes de uso do fit)

Feedback do Tiago apos usar em producao: "nao parece ter funcionado — quando arrasto o mapa a grade vem junto e atrasada, e o mapa esta cortado". Diagnostico: DOIS problemas, e o segundo era erro de desenho meu.

**1. A grade vinha atrasada (bug real de performance).** `applyMapTransform` redesenhava grade e nevoa SINCRONAMENTE, e o arrasto chama essa funcao a cada `mousemove` (dezenas por frame, ver o handler em `bindMapInteractions`). O mapa e so `background-position` (barato, aplicado na hora); os dois canvas precisam de redesenho completo — entao ficavam para tras. Corrigido com coalescencia por frame (`_scheduleMapLayersRedraw` com `requestAnimationFrame`), mais `flushMapLayersRedraw()` para quem precisa medir o canvas logo apos mexer no transform.

**2. O mapa continuava cortado (erro de desenho meu).** Na Etapa 54 deixei o fit desligado por padrao para nao deslocar coordenadas de cenas salvas — decisao correta para os DADOS, pessima para o USO: o recurso ficou invisivel. O toggle estava so no painel de engrenagem (`#mesaMapTransform`), a dois cliques, num lugar que o mestre nao abre no fluxo normal (ele usa a trilha lateral + Biblioteca de Mapas). Sem ligar nada, o comportamento continuava o antigo — e como o mapa seguia arrastavel, dava para desloca-lo e ver a grade sozinha na area vazia, exatamente o print que o Tiago mandou.

Duas correcoes, mantendo a garantia de zero migracao:
- **Mapa novo nasce ajustado** (`_fitDefaultForNewMap`): so nos caminhos em que o MESTRE escolhe um mapa — abrir arquivo, biblioteca, pasta conectada. Nunca no boot (a cena manda) nem no recebimento pelo jogador (o mestre manda). Cena antiga com mapa ja gravado continua obedecendo o `fit` dela.
- **Botao "Ajustar" na barra visivel** (`#mesaMapFitBtn`, ao lado de "Limpar mapa"), com rotulo que vira "Ajustado" e destaque carmesim quando ligado. Compartilha estado com o checkbox do painel — os dois sao a mesma verdade.

- **js/mesa-map.js**: `_scheduleMapLayersRedraw`/`_redrawMapLayers`/`flushMapLayersRedraw`, `_fitDefaultForNewMap`, `toggleStageFitToMap`; `_syncFitToggleUI` passa a espelhar os dois controles.
- **mesa.html** / **css/mesa-map.css**: botao da barra + estado `.is-active`.
- Cache-bust: mesa-map.js -> `?v=2026-07-29-fitmap-5`, mesa-map.css -> `?v=2026-07-29-fitmap-2`, `MESA_BUNDLE_VERSION` -> `2026-07-29-fitmap-2`.
- **Testes** (suite 96 -> 99, describe "Fit: descoberta e fluidez (Etapa 57)"): botao da barra alterna e fica em sincronia com o checkbox (e some sem mapa); mapa novo do mestre nasce ajustado e o jogador NAO liga sozinho; **60 `panMap` no mesmo frame produzem 0 redesenhos durante o frame e exatamente 1 depois** — a prova do conserto do atraso (antes eram 60 sincronos).
- **Bug meu no teste, corrigido**: a primeira versao lia `classList` no `return`, depois do bloco do jogador ter re-sincronizado a UI — mesma armadilha ja documentada no teste da nevoa. O codigo estava certo; o teste e que media no momento errado.
- **Mojibake corrigido**: o `Add-Content` do PowerShell usado para anexar as suites gravou os travessoes em cp1252 (`â€"` no lugar de `—`) — 3 ocorrencias tinham entrado no commit e9a7919 e 2 eram novas. Todas as 5 convertidas de volta; varredura nos demais arquivos do commit: limpos. Anexar arquivo com acento por PowerShell exige `-Encoding utf8` no `Add-Content` (o `-Encoding` do `Out-File` nao cobre este caso).
- Validacao: test:mesa:audit 99/99, test:mesa 5/5, test:ficha 28/28, check:js OK (45), audit:static OK, build:pages OK.

## Etapa Concluida (2026-07-29 — Etapa 56: Testes e docs do plano 52-56)

Fechamento do plano "palco se adapta ao mapa + resolucao" (Etapas 52-56).

- **tests/mesa-audit.spec.cjs** (suite 91 -> 96, describe "Palco ajustado ao mapa + resolucao (Etapas 52-55)"):
  1. Worker: `fit` sobrevive ao round-trip; **cena antiga sem o campo -> `fit:false` com transform preservado**; `"sim"` -> false (estrito, nao coercao); map sem url -> null.
  2. Fit da ao palco a proporcao EXATA da imagem (4:1 num painel 4:3), centralizado na sobra, com `background-size` == a caixa (prova de zero corte); desligar limpa os estilos inline e devolve o palco ao canvas inteiro.
  3. Alinhamento: sem fit, token na fracao (0.25, 0.75) do palco cai em outro ponto do mapa; com fit e identidade exata. Cobre tambem o travamento — `adjustMapScale`/`panMap` inertes e o transform do mestre intacto apos o ciclo liga/desliga.
  4. Toggle: clique REAL no checkbox (passa pelo listener), payload da cena com `fit` e transform identidade; grupo some sem mapa; jogador liga/desliga por remoto, **legado (`undefined`) nao desliga**, mestre ignora remoto.
  5. Compressao: 5000x2500 -> 4096x2048 (proporcao preservada); 1200x800 continua 1200x800 (sem upscale); WebP dentro dos limites volta como a MESMA instancia de Blob.
- **Teste antigo ajustado**: "Worker normaliza o campo map da cena" afirma o shape EXATO do `map` com `toEqual` — passou a incluir `fit: false`. Nao e workaround: e justamente onde o default da ausencia fica visivel e verificado.
- **Docs**: SYSTEM_RULES.md (regra do palco ajustado + resolucao, com o travamento do pan e o porque), VISUAL_RULES.md (secao do letterbox: `data-fit-map`, contraste do fundo, borda carmesim, sem animacao), cloudflare/README.md e DEV_STATUS.md.
- Validacao final: **test:mesa:audit 96/96, test:mesa 5/5, test:ficha 28/28**, check:js OK (45), audit:static OK, build:pages OK, `wrangler deploy --dry-run` limpo.
- **Deploy do Worker FEITO** (2026-07-29, autorizado pelo Tiago): `armagedon-api` version ID `516576f4-01ae-4072-86a3-934adbd8734b`. Dry-run limpo antes; health 200 (`{"ok":true,"service":"armagedon-cloudflare"}`); POST /api/mesa/map sem auth responde 401 (rota viva). Verificado pelo CONTEUDO publicado (nao so pela URL), lendo o bundle deployado: `fit: map.fit === true` presente em `normalizeSceneMap` e `file.size > 12 * 1024 * 1024` -> "Mapa excede o limite de 12 MB" na rota de upload. Busca por `8 * 1024 * 1024` no bundle: ZERO ocorrencias — o cap antigo saiu de vez.
- **Commit PENDENTE** (13 arquivos). Aguardando ok do Tiago.

## Etapa Concluida (2026-07-29 — Etapa 55: Resolucao dos mapas)

Quarta das 5 etapas. Pedido do Tiago: "os mapas sempre com a melhor resolucao possivel".

**O teto real nao era de pixels, era de BYTES.** O Worker recusa upload de mapa com 413 (POST /api/mesa/map). Subir `WEBP_MAX_PX` as cegas colocaria o mapa num estado meio quebrado: visivel local e via P2P, mas ausente para quem entrasse depois, porque o R2/cena nunca receberia. Entao a compressao virou **orientada a orcamento**: mira o maximo de pixels e so degrada se passar do teto.

- **js/mesa-map.js**: `WEBP_MAX_PX` 1920 -> **4096** (2,1x linear, 4,5x em area) e `WEBP_QUALITY` 0.82 -> **0.92**. Novos `WEBP_QUALITY_STEPS` [0.92, 0.86, 0.80, 0.72], `WEBP_MIN_PX` 2048 e `MAP_BYTES_BUDGET` 10MB.
- **Ordem de degradacao deliberada**: qualidade PRIMEIRO (quase invisivel num mapa), dimensao so depois — dimensao e o que o mestre sente ao dar zoom.
- **Atalho sem perda**: fonte que ja e WebP, dentro do cap de pixels e do orcamento, e devolvida INTACTA (mesma instancia de Blob). Antes, todo import re-encodava — lossy sobre lossy sem ganhar bytes.
- **Nunca faz upscale**: mapa de 1200px continua 1200px, nao vira 4096 falso.
- **Reamostragem**: `imageSmoothingQuality = "high"` explicito. O default varia por navegador e o "low" deixa halo em linha fina (grade desenhada, contorno de parede).
- **cloudflare/src/index.js**: cap de upload 8MB -> **12MB**. Nao e alvo: e folga para o envelope multipart sobre o orcamento de 10MB do cliente. Continua teto protetivo.
- **Docs**: cloudflare/README.md e SYSTEM_RULES.md atualizados (limite antigo de 8MB citado em ambos).
- Cache-bust: mesa-map.js -> `?v=2026-07-29-fitmap-4`.
- Validacao: check:js OK (45), audit:static OK, build:pages OK, `wrangler deploy --dry-run` limpo (bindings MESA_REALTIME/DB/MAPS presentes). Medido no navegador com imagens sinteticas:
  - battlemap 6000x4000 (PNG 11.23MB) -> **4096x2731 WebP 0.12MB** em 1.4s, q0.92 de primeira.
  - ruido extremo 6000x4000 (PNG 74.73MB) -> 4096x2731, 6.11MB, 2.8s — mesmo conteudo patologico mantem dimensao cheia.
  - pequeno 1200x800 -> continua 1200x800 (sem upscale).
  - passthrough: WebP dentro dos limites volta como a MESMA instancia de Blob (zero perda geracional).
  - escada acionada (ruido puro 4096x4096, PNG 55MB, praticamente incompressivel): percorreu os 4 passos e parou em **q0.72 / 9.72MB mantendo 4096x4096** — degradou qualidade e NAO tocou na dimensao, exatamente a prioridade desenhada.
- **Custo conhecido**: o caso patologico levou 15.6s (4 tentativas de encode sobre 16MP incompressiveis). Mapa real resolve em 1.4-2.8s numa passada so. O indicador de loading ja cobre a espera, mas fica registrado como pior caso.
- **Nota de alcance util**: com o fit da Etapa 52 a caixa e limitada pelo painel; os 4096px pagam quando o mestre usa o zoom de palco (ate 3x). Acima disso seriam pixels que a tela nunca mostra.
- **Deploy do Worker PENDENTE** (acumulado das Etapas 54 e 55: `fit` na cena + cap 12MB). Aguardando ok do Tiago.
- Proxima: 56 testes + docs.

## Etapa Concluida (2026-07-29 — Etapa 54: UI, flag por cena e sync do fit)

Terceira das 5 etapas. O ajuste deixa de ser so console e vira recurso: botao no painel do mestre, memoria por cena e sync com jogadores.

**Onde a flag mora.** DENTRO do `map` da cena (`{ id, url, fit, transform }`), nao num campo solto no topo. Motivo: so faz sentido com mapa ativo e precisa trocar JUNTO com o mapa na troca de cena — o gerenciador de cenas (Etapa 49) passa a levar o fit de brinde, sem codigo novo.

**Sem mudanca no Durable Object.** `mesa:map:set` ja e relay master-only sem sanitizacao campo-a-campo (ver `MASTER_ONLY_MAP_SIGNAL_TYPES` em mesa-realtime-rules.js), entao o `fit` pega carona no evento de transform que ja existia. Clientes antigos ignoram o campo.

- **cloudflare/src/mesa.js**: `normalizeSceneMap` ganha `fit: map.fit === true`. Comparacao estrita, nao coercao — string `"sim"` vira `false`. Cena antiga (sem o campo) vira `fit:false` com o transform intacto: e a garantia de zero regressao de coordenadas.
- **mesa.html**: grupo `#mesaMapFitGroup` com `#mesaMapFitToggle` ("Ajustar ao mapa") no topo do painel de configuracoes, antes de Escala — ele muda o enquadramento, entao vem antes dos ajustes finos. Hint explica que o zoom do palco e o jeito de aproximar.
- **js/mesa-map.js**: `_syncFitToggleUI()` (espelha estado + mostra so p/ mestre COM mapa), `_bindFitToggle()` (change -> setStageFitToMap + broadcast + persist) e `_applyRemoteFit()`. `getMesaSceneMapPayload` e `broadcastMapTransform` passam a mandar `fit`. `_applySceneMapRef` e `_renderSceneMapFromUrl` aplicam o fit da cena ANTES do probe/transform.
- **Legado nao desliga o recurso**: `_applyRemoteFit(undefined)` mantem o estado local em vez de forcar `false` — um payload de cliente antigo no meio da sessao nao pode apagar o ajuste do mestre. Mestre ignora fit remoto (ele e a fonte de verdade), exceto no boot pela cena, que e a memoria dele pos-F5.
- Cache-bust: mesa-map.js -> `?v=2026-07-29-fitmap-3`; `MESA_BUNDLE_VERSION` -> `2026-07-29-fitmap-1`.
- Validacao: check:js OK (45), audit:static OK, build:pages OK, console limpo.
  - Worker (node, round-trip real de `normalizeMesaScene`): `fit:true` -> true; `fit:false` -> false; **cena antiga sem o campo -> `fit:false` com transform {0.02, -0.03, 1.8} preservado**; `fit:"sim"` -> false; map sem url -> null.
  - UI no preview: grupo oculto sem mapa, visivel com mapa para mestre; clique REAL no checkbox liga o fit (inner 932x655 -> 932x233), esconde o grupo de Escala e o payload da cena vira `{fit:true, transform:{0,0,1}}`; desclicar restaura 932x655 e `{fit:false}`.
  - Jogador: recebe `fit:true` e liga; `undefined` (legado) NAO desliga; `fit:false` desliga. Mestre ignora o remoto.
- Nao verificado: prova visual do painel — o Browser pane nao estava compondo frames (screenshot indisponivel). Geometria conferida por DOM: grupo 167x77 px, texto "PALCO / Ajustar ao mapa / Mostra o mapa inteiro, sem corte...", primeiro na ordem do painel.
- **Deploy do Worker PENDENTE** (mudanca em cloudflare/src/mesa.js): sem o deploy, o `fit` e descartado no PUT da cena e nao sobrevive a F5. Aguardando ok do Tiago.
- Proximas: 55 resolucao (WEBP_MAX_PX), 56 testes + docs.

## Etapa Concluida (2026-07-29 — Etapa 53: Ancoragem das camadas no mapa)

Segunda das 5 etapas do plano "palco se adapta ao mapa + resolucao". Ainda desligada por padrao (a UI e a flag por cena entram na 54).

**O problema real.** Metade das camadas ja convertia coordenadas para o espaco do MAPA via os helpers da Etapa 42 (`getMesaMapSurfaceFrac` / `mesaStageFracToMapFrac` / `mesaMapFracToStageFrac`): grade (mesa-grid.js), nevoa (mesa-fog.js), regua (mesa-ruler.js) e ping (mesa-ping.js). Tokens (`token.x/y` em % de `#mesaStage`) e desenhos (fracoes do `#mesaDrawCanvas`) NAO — usam fracao do PALCO. Como `#mesaStage` e `#mesaDrawCanvas` sao `inset:0` dentro do inner, eles ja herdam a caixa da Etapa 52 de graca; o desalinhamento so aparece quando o mestre da pan/zoom no MAPA dentro da caixa.

**A decisao.** Nao migrar o espaco de coordenadas (quebraria cenas salvas + protocolo de realtime + normalizacao no Worker). Em vez disso: **travar o transform do mapa em identidade quando o fit esta ligado**. O pan/escala do mapa existe SO para compensar o corte do cover; com o fit nao ha corte, entao o controle perdeu a funcao — e e justamente ele que descola os tokens. Travado, fracao-do-palco == fracao-do-mapa por construcao e TODAS as camadas ficam ancoradas na imagem, com zero migracao e zero mudanca de protocolo. Para aproximar, o mestre usa o zoom de palco (`_stageZoom`), que escala mapa + tokens + grade + nevoa juntos e preserva o alinhamento.

- **js/mesa-map.js**: `_getEffectiveMapTransform()` (identidade no modo fit, guardado caso contrario) e `isMapTransformLocked()`. Passaram a usar o EFETIVO em vez do guardado: `applyMapTransform`, `_getMapCoverDims`, `getMesaMapSurfaceFrac`, `broadcastMapTransform` (senao o jogador recebia o pan do mestre e saia do lugar) e `_normalizedMapTransform` (senao a cena oficial guardava um deslocamento que o jogador do boot aplicaria). `adjustMapScale`/`panMap` viram no-op travados. `_syncMapTransformControls()` esconde `#mesaMapScaleGroup` e `#mesaMapHint` — controle vivo que nao responde e bug.
- **Preservacao**: o transform guardado NAO e zerado nem sobrescrito no localStorage enquanto travado (`applyMapTransform` pula o persist) — sai intacto e volta a valer se o fit for desligado.
- Cache-bust: mesa-map.js -> `?v=2026-07-29-fitmap-2`.
- Validacao: check:js OK (45), console limpo. Medido no preview (painel 932x655, imagem 4000x1000, mestre com pan/zoom guardado {x:120, y:-40, scale:1.8}):
  - Fit OFF (comportamento atual): superficie do mapa = {left:-1.901, top:-0.461, width:5.06, height:1.8} — a imagem ocupa 506% da largura do palco, ~80% fora da tela. Token na fracao (0.25, 0.75) do palco cai em (0.425, 0.673) do mapa: **desalinhado**, grade e nevoa o situam num ponto e ele e desenhado em outro.
  - Fit ON: superficie = {0, 0, 1, 1}; token (0.25, 0.75) -> mapa (0.25, 0.75), **identidade exata**. `background-position` zerado, `background-size` 932x233 (imagem inteira). `isMapTransformLocked()` true, controles ocultos. `adjustMapScale(0.5)` e `panMap(999,999)` nao alteraram nem o guardado nem a superficie. Transform da cena persistida: {xFrac:0, yFrac:0, scale:1} com fit vs {xFrac:0.0254, yFrac:-0.0339, scale:1.8} sem.
  - Fit OFF de novo: superficie volta exatamente a {-1.901, -0.461, 5.06, 1.8} e o guardado sobrevive intacto ({120, -40, 1.8}).
- Proximas: 54 UI + flag por cena + sync, 55 resolucao (WEBP_MAX_PX), 56 testes + docs.

## Etapa Concluida (2026-07-29 — Etapa 52: Caixa do palco na proporcao do mapa)

Primeira das 5 etapas do plano "palco se adapta ao mapa + resolucao". Aqui so a FUNDACAO: a matematica da caixa. Sem UI, sem persistencia, sem sync — e DESLIGADA por padrao, para nao deslocar coordenadas de cenas ja salvas.

**Problema:** o palco sempre preenche o canvas inteiro (`.vtt-canvas .mesa-stage-wrap { inset:0 !important }`) e o mapa entra com `background-size: cover`. Se a proporcao da imagem nao bate com a do painel, o mapa e CORTADO. Num mapa 4000x1000 num painel 932x655, o cover exibia 2620x655 — 64% da largura fora da tela. O mestre compensava na mao com o pan/escala do painel de mapa.

**Solucao:** com o fit ligado, `#mesaStageInner` deixa de ser `inset:0` e recebe left/top/width/height inline com a proporcao EXATA da imagem, centralizado no wrap (letterbox). Como a caixa fica na proporcao certa, o `coverScale` de `applyMapTransform()` vira encaixe perfeito — a imagem aparece inteira. As camadas internas (mapa, grade, nevoa, desenhos, tokens, regua, ping) sao todas `inset:0` dentro do inner, entao herdam a caixa nova sem mudanca nenhuma; grid, fog e draw ja tinham `ResizeObserver` no `#mesaStageInner` e se remedem sozinhos.

- **js/mesa-map.js**: secao "AJUSTE DO PALCO AO MAPA" — `_fitToMap`, `isStageFitToMap()`, `setStageFitToMap()`, `applyStageFitBox()` e `_observeStageResize()` (ResizeObserver no wrap, so reage com o fit ligado). `applyMapTransform()` chama `applyStageFitBox()` ANTES do calculo de cover, porque o cover mede `offsetWidth/Height` do layer. `renderMesaMapLayer()` reaplica a caixa ao limpar o mapa (volta ao inset:0). Expostos em `window` para a UI da Etapa 54.
- **css/mesa-map.css**: `#mesaStageWrap[data-fit-map]` — fundo do letterbox mais escuro (`#050307`) e borda carmesim discreta no inner, para o limite do territorio jogavel ficar obvio.
- Cache-bust: mesa-map.js e mesa-map.css -> `?v=2026-07-29-fitmap-1`.
- Validacao: check:js OK (45). Medido no preview (wrap 932x655, imagem stub 4000x1000): inner vira 932x233 (proporcao 4.000 exata), centralizado em top 211px = (655-233)/2, `background-size: 932px 233px` (ou seja, zero corte). `getMesaMapSurfaceFrac()` retorna {left:0, top:0, width:1, height:1} — a superficie do mapa passa a coincidir com o palco, que e o que vai alinhar grade/nevoa/regua na Etapa 53. Desligar restaura 932x655 e limpa os estilos inline. Console sem erros.
- Proximas: 53 ancoragem das camadas (verificar tokens e desenhos, que usam fracao do PALCO e nao do mapa), 54 UI + flag por cena + sync, 55 resolucao (WEBP_MAX_PX), 56 testes + docs.

## Etapa Concluida (2026-07-28 — Etapa 51: Deploy final + smoke em producao)

Fechamento do plano "Mesa Virtual -> VTT completo" (Etapas 37-51). Verificacao do que esta PUBLICADO e conserto do smoke de producao, que estava cego desde a Etapa 33.

**Verificado em producao (leitura, sem tocar em dado):**
- Pages publicou o bundle novo: `mesa-page.bundle.js?v=2026-07-28-audit50-1`. Conferido pelo CONTEUDO, nao so pela URL — o bundle publicado e minificado pelo terser (252KB numa linha; o `_site` local tem 463KB) e contem `_commitStrokeAdd`, `_commitStrokeRemove`, `applyMesaDrawingAddFromRemote`, `applyMesaDrawingRemoveFromRemote`, `mesa:scene:ack` e `DRAW_MAX_STROKES`, alem de `renderMesaFog`, `refreshMesaScenesUI`, `requestMesaDiceRoll`, `measureMesaRuler`, `showMesaPing` e `normalizeMesaStatusMarkers`.
- API: `/api/health` 200; `/api/mesa/scene` e `/api/mesa/scenes` sem sessao -> 401; `/api/mesa/realtime` sem upgrade -> 426.
- mesa.html publicada carrega sem NENHUM erro de console e redireciona para o login quando nao ha sessao (comportamento correto).

**Achado — o smoke de producao estava cego (CORRIGIDO).** `tests/mesa-online.spec.cjs` ainda exigia `#mesaStage canvas.mesa-stage-canvas` (o renderer Canvas foi REMOVIDO na Etapa 33 — os tokens sao 100% DOM desde entao) e `.player-sheet-panel` (classe que so existe no CSS; o elemento renderizado e `.player-side-panel`). Ou seja: o unico teste que roda contra o site publicado falharia por seletor morto, nao por problema real, e nao cobria nada das Etapas 42-50.

- **tests/mesa-online.spec.cjs**: seletores corrigidos; espera `state.bootCompleted` em vez de um seletor solto (mesma licao dos testes locais); mestre passou a verificar as ferramentas construidas nas Etapas 42-49 na tela PUBLICADA (grupos Grade/Nevoa/Cenas visiveis, painel de dados, canvas de nevoa e de desenho) — se um bundle sair incompleto, e aqui que aparece; jogador verifica o inverso (nenhum grupo do mestre, nenhum token da camada dm, sem busca de escalacao, sem acao de roster).
- **Sonda de realtime (opt-in `ARMAGEDON_ONLINE_RELAY_PROBE=1`)** ganhou o delta de desenho da Etapa 50: o mestre manda `mesa:drawings:add` e o teste exige que o jogador RECEBA — a prova de ponta a ponta, em producao, do bug corrigido na etapa anterior. A sonda se limpa sozinha: assim que o jogador confirma, o mestre manda `mesa:drawings:remove` com o mesmo id, para nao deixar sujeira na cena caso um cliente do mestre esteja aberto e persista o que chega pelo realtime.
- Seletores novos validados no servidor local antes da entrega (mestre: grupos visiveis + `is-layer-dm` real; jogador: tudo escondido e zero token secreto).
- Validacao: `test:mesa:online` parte publica 2/2 contra o site REAL; suite local 119/119 (1 skip = fluxo autenticado, que exige credenciais); check:js OK.
- **FECHADO em 2026-07-28 pelo Tiago**: `npm run test:mesa:online` **3/3 na maquina dele**, com credenciais reais de mestre e jogador — inclusive o "fluxo autenticado" (8,3s), que conecta as DUAS sessoes no WebSocket de producao ao mesmo tempo. Com isso o plano "Mesa Virtual -> VTT completo" (Etapas 37-51) esta validado de ponta a ponta em producao.
- Como repetir: definir `ARMAGEDON_MASTER_USERNAME`, `ARMAGEDON_MASTER_PASSWORD`, `ARMAGEDON_PLAYER_USERNAME`, `ARMAGEDON_PLAYER_PASSWORD` (e `ARMAGEDON_ONLINE_RELAY_PROBE=1` para a sonda de realtime + delta de desenho) e rodar `npm run test:mesa:online`. **No PowerShell use `$env:NOME = ...`** — o formato `NOME=valor npm run ...` e de bash e faz o teste ser PULADO em silencio. As credenciais ficam so na maquina do Tiago, nunca no repositorio. Rodar fora de sessao: com a sonda ligada um traco de teste aparece na mesa ao vivo por instantes (ele se apaga sozinho).

## Etapa Concluida (2026-07-28 — Etapa 50: Auditoria multi-frente + performance)

Auditoria medida (nao estimada) da Mesa com o VTT completo. O achado grave: **a sincronia de desenhos morria em silencio** depois de ~12 tracos.

**Achado 1 — desenho estourava o cap de mensagem do DO (CORRIGIDO).** `mesa:drawings:update` mandava o ESTADO COMPLETO a cada traco, com as coordenadas CRUAS (`0.02145922746781116` — 19 caracteres por numero, enquanto o Worker salva 4 casas). Medido com arrasto real no Playwright: **5 tracos a lapis = 13,4KB**; o cap do DO e 32KB por mensagem, ou seja o quadro parava de sincronizar por volta do 12o traco. Pior: o DO respondia `mesa:scene:ack ok:false` e **nenhum cliente escutava esse evento** — o mestre continuava vendo os proprios tracos e o jogador simplesmente parava de receber, sem erro em lugar nenhum.

- **js/mesa-drawing.js**: coordenada arredondada JA NA CAPTURA (`_toPercent`) para as mesmas 4 casas que o Worker salva — mesmos 5 tracos passaram de 13.438 para 5.460 bytes (**2,5x menor**, zero diferenca visivel); ralo de pontos redundantes (`DRAW_MIN_POINT_DIST`, 0,2% do canvas — o mousemove dispara muito mais que o necessario); caps do cliente alinhados aos do Worker (`DRAW_MAX_POINTS` 200, `DRAW_MAX_STROKES` 300 com toast) — sem isso o que fica na tela diverge do que e salvo.
- **Broadcast por DELTA**: `_commitStrokeAdd` manda so o traco recem-fechado (`mesa:drawings:add`, ~1KB) e `_commitStrokeRemove` manda so os ids (`mesa:drawings:remove`) — borracha, Ctrl+Z e `deleteDrawingsById`. O full-state (`mesa:drawings:update`) sobrou para limpar o quadro e para o reenvio a quem entra depois, agora com teto de seguranca (`DRAW_FULL_STATE_MAX_CHARS` = 30KB): acima disso o envio e PULADO, porque quem entra recebe os tracos pelo `GET /mesa/scene` de qualquer forma e mandar assim so faria o DO recusar sem avisar.
- **cloudflare/src/mesa-realtime-rules.js**: `DRAWINGS_ADD_TYPE`/`DRAWINGS_REMOVE_TYPE` em RELAY_TYPES (qualquer participante desenha, como o full-state ja era) + `sanitizeRelayDrawingStroke` (um traco; recusa camada `dm`, id vazio e nao-objeto) e `sanitizeRelayDrawingIds` (ids, cap `MAX_RELAY_DRAWINGS`). **cloudflare/src/mesa-realtime.js**: sanitizacao dos dois tipos antes do relay.
- **js/mesa-core.js**: os dois tipos no delta router (`applyMesaDrawingAddFromRemote` e idempotente por id — reenvio nao desenha duas vezes; o remove remoto nunca apaga traco `dm` do mestre) + snapshot local e PUT do mestre como no full-state.

**Achado 2 — toda recusa do backend sumia em silencio (CORRIGIDO).** O DO ja mandava `mesa:scene:ack ok:false` em tamanho, rate-limit, permissao e payload invalido, e ninguem escutava. `js/mesa-core.js` agora avisa na tela, com garganta de 4s para uma rajada nao virar chuva de toasts.

**Fronte medida e APROVADA (sem mudanca):** boot nao escala com tokens (0/10/20/40 tokens: 173/167/197/115ms); render da nevoa com os 400 ops do cap = 0,17ms; render do palco com 40 tokens = 0,45ms; assinatura de dedupe da cena = 0,17ms; zoom/pan com nevoa + grade ativas: nenhuma long task; sem vazamento de nos DOM em ciclos repetidos de render/pincel; rate-limit do DO (30 msg/s, burst 60) com folga real — os canais mais falantes sao regua e nevoa a 10Hz e um gesto so acontece por vez.

- **Testes** (suite 77 -> 83, describe "Auditoria multi-frente + performance (Etapa 50)"): regras do DO (relay + sanitizacao de traco/ids/cap); traco novo viaja sozinho com o quadro ja acima de 32KB (prova que o full-state NAO cabia e o delta cabe); borracha manda so ids e traco `dm` nunca vira mensagem; arredondamento na captura + idempotencia do add remoto + remove remoto que nao apaga `dm`; recusa do backend vira aviso (com garganta); full-state acima do teto nao e enviado.
- Cache-bust: mesa-core.js e mesa-drawing.js -> `?v=2026-07-28-audit50-1`; `MESA_BUNDLE_VERSION` idem.
- Deploy do Worker: version `0dc8151d-b91e-4ce7-8eb3-5dfeba73ec33` (dry-run antes; health 200). Compativel com cliente antigo: o full-state continua aceito.
- Validacao: test:mesa:audit 83/83, test:mesa 5/5, test:ficha 28/28, perf:mesa OK, check:js OK, audit:static OK, build:pages OK.
- ~~Pendencia: rodada real com 2 janelas (mestre + jogador logados) desenhando ao vivo — Etapa 51.~~ **CUMPRIDA na Etapa 51** (deploy final + smoke em producao).

## Etapa Concluida (2026-07-27 — Etapa 49: Multiplas cenas — frontend)

Gerenciador de cenas do mestre (grupo "Cenas" no painel do mapa) + troca de cena ao vivo para todos. Multi-cena exige backend; o modo local segue com a cena unica de sempre.

- **js/mesa-scenes.js** (NOVO): lista as cenas (ativa em destaque), Ativar / renomear (prompt) / excluir (confirm; bloqueado para ativa e principal na UI e no Worker) / "+ Nova cena". Visibilidade master-only decidida em `refreshMesaScenesUI` (chamado no fim do boot e apos cada switch — licao da corrida de boot). Acoes pela fachada `window.APP`.
- **js/api.js**: `getMesaScenes`/`createMesaScene`/`renameMesaScene`/`deleteMesaScene`/`activateMesaScene` (cache-bust de api.js em TODAS as 6 paginas HTML).
- **js/mesa-core.js**: `state.sceneId`/`sceneName` (vem do GET da Etapa 48; definido ANTES de gravar o snapshot local), `mesaSceneStorageKey()` — snapshot local POR CENA: a default mantem a chave legada `tc_virtual_mesa_mock_v1` (ZERO migracao) e as demais ganham sufixo `_<sceneId>`; todos os usos em mesa-core/mesa-stage migrados. `handleMesaSceneSwitch` (evento `mesa:scene:switch`): zera `sceneVersion` + assinaturas de dedupe (cada cena tem a propria linha do tempo — sem isso a versao alta da cena antiga descartaria os deltas da nova), recarrega o GET filtrado por papel, aplica e toast.
- **Testes** (suite 74 -> 77, describe "Multiplas cenas — frontend (Etapa 49)"): grupo do mestre lista/destaca/aciona a API (delegation testado via click direto — o painel pode estar recolhido); jogador nunca ve o grupo; `mesa:scene:switch` troca tokens/versao/chave de storage e preserva a chave legada intacta.
- Cache-bust: api.js (6 paginas), mesa-core.js, mesa-stage.js, mesa-scenes.js (novo), mesa-map.css -> `?v=2026-07-27-scenes-1`; `MESA_BUNDLE_VERSION` E `FICHA_BUNDLE_VERSION` -> `2026-07-27-scenes-1` (api.js esta nos dois bundles).
- Validacao: test:mesa:audit 77/77, test:mesa 5/5, test:ficha 28/28 (api.js mudou), check:js OK, build:pages OK. Sem deploy de Worker (Etapa 48 ja no ar).

## Etapa Concluida (2026-07-27 — Etapa 48: Multiplas cenas — backend)

Backend de multiplas cenas SEM migracao de schema: a tabela `mesa_scenes` ja era chaveada por id; o ponteiro da cena ativa e os nomes vivem numa linha especial `meta:mesa` (`data_json = { activeId, names }`).

- **cloudflare/src/mesa.js**: `getMesaSceneMeta`/`saveMesaSceneMeta`, `listMesaScenes` (master-only; default aparece mesmo sem linha), `createMesaScene` (id `s`+12 hex, cap 20 cenas, `DB.batch` linha+meta), `renameMesaScene`, `deleteMesaScene` (proibido: cena principal e cena ativa; `DB.batch`), `activateMesaScene` (valida existencia). `getMesaScene`/`saveMesaScene` agora aceitam `?id=` — SO para o mestre (`resolveSceneIdForActor`; jogador sempre recebe a ativa) e a resposta ganhou `id`, `active` e `name`.
- **cloudflare/src/index.js**: rotas `GET/POST /api/mesa/scenes`, `PUT/DELETE /api/mesa/scenes/:id`, `POST /api/mesa/scenes/:id/activate` (dispara broadcast `mesa:scene:switch` com `{sceneId, sceneName}` — os clientes RE-BUSCAM a cena pelo GET filtrado por papel, o JSON bruto nunca viaja no broadcast para nao vazar camada dm). `GET/PUT /api/mesa/scene?id=`; **PUT de cena nao-ativa NAO e transmitido** (mestre prepara cena sem sobrescrever a mesa dos jogadores).
- **Testes** (suite 70 -> 74, describe "Multiplas cenas — backend (Etapa 48)"): mini-D1 em memoria exercitando o codigo real — fluxo completo (criar/listar/ativar, jogador sempre na ativa, ?id= ignorado para jogador), save em preparo com `active:false`, guardas (403 jogador, delete da principal/ativa, activate inexistente) e rename normalizado.
- Deploy do Worker: version `26488a2a-3d0d-4afc-867d-6e35b948d11e` (dry-run antes; health 200). Compatibilidade: cena existente continua como `default` ("Cena principal"), ativa por padrao — zero impacto ate o mestre criar outra cena.
- Validacao: test:mesa:audit 74/74, check:js OK. Frontend do gerenciador e a Etapa 49.

## Etapa Concluida (2026-07-27 — Ajuste pos-47: borda do mapa sob a nevoa + fundo do palco)

Feedback do Tiago com print da tela do jogador: (1) a borda do mapa aparecia como linhas claras nos limites da area coberta pela nevoa; (2) o fundo do palco estava claro demais, pouco contraste com o mapa.

- **js/mesa-fog.js**: sangria de 3px (x DPR) alem da superficie do mapa no render da nevoa — o arredondamento sub-pixel do recorte deixava a ultima fileira de pixels do mapa (e as linhas da grade no limite) escapando na tela do jogador. Verificado por medida: alpha 255 exatamente na borda superior do mapa.
- **css/mesa-stage.css**: fundo do palco escurecido (base `rgba(2,3,5,.98)`, gradientes tintados reduzidos ~50%) e glow central de 0.9 -> 0.55 — o mapa vira o unico ponto de luz do palco. Regra registrada em VISUAL_RULES.md.
- Cache-bust: mesa-fog.js e mesa-stage.css -> `?v=2026-07-27-fog-2`; `MESA_BUNDLE_VERSION` idem. Sem mudanca de Worker.
- Validacao: test:mesa:audit 70/70, check:js OK, build:pages OK. Prova visual (Playwright, papel jogador, mapa + nevoa): sem linhas na borda, fundo escuro.

## Etapa Concluida (2026-07-27 — Etapa 47: Fog of War)

Grupo "Nevoa" no painel do mapa (mestre): nevoa amarrada ao MAPA que cobre a cena para os jogadores (100% opaca — token sob a nevoa fica invisivel) enquanto o mestre enxerga atraves (40%). Pincel de revelar/cobrir com broadcast ao vivo; estado persiste na cena oficial.

- **js/mesa-fog.js** (NOVO, modelado no mesa-grid.js): estado `{ enabled, ops[] }` — cada op e um pincel circular `{ mode: reveal|hide, u, v, r }` em fracoes do MAPA (helper unico de mesa-map.js), aplicado NA ORDEM no canvas `#mesaFogCanvas` (reveal = destination-out, hide = repinta). Nevoa ativa sem ops = tudo coberto. Cap 400 ops (toast manda usar "Cobrir tudo"). O canvas e desenhado 100% opaco e a diferenca de papel e a OPACIDADE CSS do elemento (jogador 1.0 / mestre 0.4) — evita acumulo de alpha nos hides. Pincel do mestre em fase de captura (como ping/regua, nao vira drag), ops espacadas a 40% do raio, broadcast 10Hz durante a pincelada e persist so no soltar. Esc desarma o pincel.
- **mesa.html**: canvas `#mesaFogCanvas` (z-index 26 — acima dos tokens, abaixo de regua 29/ping 30) + grupo `#mesaFogGroup` no painel do mapa (Ativar, pinceis Revelar/Cobrir, tamanho do pincel 2-25% com +/-, "Cobrir tudo"). Visibilidade master-only via `_syncFogSettingsUI` a cada sync (licao da corrida de boot da grade).
- **cloudflare/src/mesa.js**: `normalizeSceneFog` (mode whitelist, u/v clamp -1..2, r 0.005..1, 4 casas, cap 400; desligada sem ops = null) + campo `fog` em `normalizeMesaScene`.
- **cloudflare/src/mesa-realtime-rules.js**: `FOG_UPDATE_TYPE = "mesa:fog:update"` em MASTER_ONLY_TYPES (DO bloqueia jogador, relay generico — zero codigo novo no DO).
- **js/mesa-core.js**: tipo no delta router (aplica + cache local), `fog` no payload da cena, na ASSINATURA (persist so-de-nevoa nao cai no dedupe) e no apply de snapshot (`undefined` = cena antiga preserva). **js/mesa-map.js**: `renderMesaFog` chamado junto com `renderMesaGrid` no applyMapTransform e no map-clear.
- **Testes** (suite 66 -> 70, describe "Fog of War (Etapa 47)"): Worker normaliza ops (whitelist/clamps/cap/null); regra master-only no DO; mestre liga nevoa + pincela com arrasto REAL (pixel revelado alpha 0, canto coberto 255, CSS 0.4, sem drag de token, cena+assinatura com fog, broadcast contado); jogador nao altera, aplica delta do mestre e ve CSS opacity 1.
- Cache-bust: mesa-core.js, mesa-map.js, mesa-fog.js (novo) -> `?v=2026-07-27-fog-1`; mesa-map.css idem; `MESA_BUNDLE_VERSION` -> `2026-07-27-fog-1`; mesa-fog.js no bundle apos mesa-grid.js.
- Deploy do Worker: version `d9a50dfb-56bc-40a2-83c1-53ca6b81df57` (dry-run antes; health 200).
- Validacao: test:mesa:audit 70/70, test:mesa 5/5, check:js OK, build:pages OK. Prova visual via Playwright: mestre ve o monstro esmaecido sob a nevoa; jogador NAO ve o token coberto (so a area revelada).

## Etapa Concluida (2026-07-27 — Correcao: flake "bug 2" resolvido na raiz — boot flag)

A familia de flakes de timing (o "bug 2" que falhava sob carga e passava isolado, planejada para a Etapa 50) foi corrigida na raiz, antecipada a pedido do Tiago:

- **Causa raiz**: `waitForMesaSettled` dos testes dormia 450ms fixos apos o `#mesaStageWrap` aparecer, mas o boot assincrono (`initMesaPage`: AUTH + 3 fetches paralelos + hydrate + modulos) passa de 450ms sob carga — o teste rodava com `state`/`role`/`APP` pela metade.
- **js/mesa-core.js**: novo flag `state.bootCompleted`, setado no `.finally()` de `bootMesaPage` (cobre sucesso, sem sessao e erro).
- **tests/mesa-audit.spec.cjs**: `waitForMesaSettled` agora espera `state.bootCompleted === true` (deterministico) em vez do sono fixo.
- Resultado: 66/66 em duas rodadas consecutivas e a suite caiu de ~39s para ~24s (as esperas agora terminam quando o boot termina, nao no pior caso).
- Cache-bust: mesa-core.js -> `?v=2026-07-27-boot-flag-1`; `MESA_BUNDLE_VERSION` idem. Sem mudanca de Worker.

## Etapa Concluida (2026-07-27 — Etapa 46: Marcadores de status nos tokens)

Grade "Marcadores" no inspetor do mestre: 12 condicoes (whitelist) que viram chips com icone no topo do circulo do token, visiveis para todos e persistentes na cena. Max 8 por token; viajam no proprio token via `mesa:token:upsert` (canal existente — zero mudanca no DO).

- **js/mesa-stage.js**: whitelist `MESA_STATUS_MARKERS` (veneno, sangramento, queimando, congelado, atordoado, derrubado, amaldicoado, abencoado, medo, invisivel, inconsciente, morto) + `normalizeMesaStatusMarkers` (whitelist, dedupe, cap 8) + `toggleMesaTokenStatusMarker` (toast no cap) + chips no `renderTokenMinimal`. Acao `toggle-marker` no `handleInspectorAction` (mestre: bump -> upsert -> persist, padrao existente).
- **Armadilha corrigida**: `getTokenContentSignature` decide quando RECRIAR o elemento do token — sem `statusMarkers` nela, o chip novo nunca aparecia (o elemento antigo era reaproveitado). Mesma familia da licao da assinatura da cena.
- **js/mesa-core.js**: `statusMarkers` em `serializeMesaRealtimeToken` (upsert), `createMesaScenePayloadFromState` (cena oficial), `normalizeMesaScenePayload` (ASSINATURA — persist so-de-marcador nao cai no dedupe) e `mergeTokenWithRoster` (aplicar delta/boot preserva).
- **js/mesa-inspector.js**: `buildInspectorMarkerButtons` — grade de toggles (icone + title, `.is-active`), so no inspetor do mestre (jogador nao marca; e condicao narrativa aplicada pelo mestre).
- **cloudflare/src/mesa.js**: `normalizeSceneStatusMarkers` (whitelist espelhada + cap 8) em `normalizeSceneToken` — cena antiga sem o campo vira `[]`.
- **Testes** (suite 62 -> 66, describe "Marcadores de status nos tokens (Etapa 46)"): Worker filtra whitelist/dedupe/cap; toggle do mestre renderiza chip + transmite upsert + entra na assinatura; cap de 8 no cliente (9o recusado, chave invalida recusada); jogador recebe upsert remoto e renderiza chips (whitelist aplicada no merge).
- Cache-bust: mesa-stage.js, mesa-core.js, mesa-inspector.js e mesa-stage.css -> `?v=2026-07-27-status-1`; `MESA_BUNDLE_VERSION` -> `2026-07-27-status-1`.
- Deploy do Worker: version `fd78827c-4ac1-4084-840d-b3d7a512d880` (dry-run antes; health 200).
- Validacao: test:mesa:audit 66/66, test:mesa 5/5, check:js OK, build:pages OK. Prova visual via Playwright: chips ☠🔥👁 no topo do token + grade "Marcadores" no inspetor com os ativos destacados.

## Etapa Concluida (2026-07-27 — Etapa 45: Dados na Mesa — o DO rola)

Painel "Dados da Mesa" (botao DADOS no rail esquerdo): rolagem compartilhada onde QUEM ROLA E O SERVIDOR — o cliente envia `mesa:dice:request` e o Durable Object valida a formula, rola com `crypto.getRandomValues` (rejection sampling, sem vies) e transmite `mesa:dice:result` a TODOS, inclusive quem pediu. Resultado a prova de trapaça: `mesa:dice:result` NAO esta em `RELAY_TYPES`, entao cliente nao consegue forjar. Historico das ultimas 20 rolagens no storage do DO, entregue no `mesa:ready` (quem entra depois ve).

- **cloudflare/src/mesa-realtime-rules.js**: `DICE_REQUEST_TYPE`/`DICE_RESULT_TYPE`/`MAX_DICE_HISTORY=20` + `parseMesaDiceFormula` (gramatica NdM±K: N 1-20, M em {2,4,6,8,10,12,20,100}, K -99..99, tolerante a espacos/maiusculas) + `rollMesaDice(spec, randomInt)` com RNG INJETADO (o DO injeta a versao crypto; os testes, uma deterministica) + `normalizeDiceLabel`.
- **cloudflare/src/mesa-realtime.js**: `secureRandomInt` (crypto.getRandomValues + rejection sampling), `handleDiceRequest` (valida -> rola -> guarda no storage `diceHistory` cap 20 -> broadcast; formula invalida recebe `mesa:dice:ack` de erro), `diceHistory` no payload do `mesa:ready`.
- **js/mesa-dice.js** (NOVO): painel flutuante (dados rapidos d4-d100, Qtd 1-20, Mod ±99, historico), `requestMesaDiceRoll` (com backend: so pede e espera o resultado do DO; sem backend: rola LOCAL com o mesmo RNG crypto e marca "(local)" — regra local-first do projeto), `applyMesaDiceResult` (dedupe por id, cap 20), `setMesaDiceHistory` (substitui a lista no mesa:ready), badge no botao + toast quando chega rolagem com o painel fechado.
- **js/mesa-core.js**: `"mesa:dice:result"` em `MESA_REALTIME_DELTA_TYPES` + branch (o cliente NUNCA inventa numero — so exibe o que o DO mandou); `mesa:ready` alimenta `setMesaDiceHistory`.
- **mesa.html**: botao DADOS (icone d20) no grupo de ferramentas do rail + `<aside id="mesaDicePanel">`.
- **Testes** (suite 58 -> 62, describe "Dados na Mesa (Etapa 45)"): gramatica completa da formula + rolagem deterministica com RNG injetado + tipos fora do relay; painel local (2d20+3 rola com crypto, entra no historico com "(local)"); com backend o pedido vai como `mesa:dice:request` SEM entrada local e o resultado do DO rende a entrada (com dedupe por id e badge); historico do mesa:ready substitui a lista e respeita o cap 20.
- Cache-bust: mesa-core.js e mesa-dice.js (novo) e mesa-stage.css -> `?v=2026-07-27-dice-1`; `MESA_BUNDLE_VERSION` -> `2026-07-27-dice-1`; mesa-dice.js no bundle da Mesa (apos mesa-ruler.js).
- Deploy do Worker: version `038dc024-0b51-4aa4-aa6d-baf3d9a34218` (dry-run antes; health 200).
- Validacao: test:mesa:audit 62/62 (uma rodada teve o flake conhecido do "bug 2", que passa isolado — familia de timing da Etapa 50), test:mesa 5/5, check:js OK, build:pages OK. Prova visual via Playwright: painel com historico ("voce (local) 30", "ana 19", "bruno 8").

## Etapa Concluida (2026-07-27 — Etapa 44: Regua de medicao)

Shift+arrastar no palco mede distancia em celulas e metros; enquanto arrasta, todos os participantes veem a regua ao vivo. Mesmo modelo efemero do ping: `mesa:ruler` e apenas retransmitido pelo DO, nada entra na cena nem persiste.

- **js/mesa-ruler.js** (NOVO): Shift+arrastar capturado em fase de captura no `#mesaStageWrap` (nao vira drag/pan/rubber-band); linha tracejada + pontas + chip com a medida, propria dourada e remota carmesim com nome do autor (paleta do ping). Medida por LAYOUT (px de `offsetWidth`, imune a zoom): `celulas = distPx / (cellFrac x largura da superficie x largura do palco)` — usa a celula da grade atual (default 0.05 sem grade configurada) e `1 celula = 1,5 m` (`MESA_RULER_METERS_PER_CELL`). Broadcast a 10Hz (`MESA_RULER_BROADCAST_MS = 100`); soltar/Escape envia `active: false` imediato. Coordenadas viajam como fracao do MAPA (`mesaStageFracToMapFrac`, o helper unico da Etapa 42) — cada cliente reconverte para o proprio palco; sem mapa, `space: "stage"`. Regua remota expira por TTL de 4s se o emissor sumir sem `active:false` (sweep de 1s que se auto-desliga). Exports: `measureMesaRuler`, `applyMesaRulerFromRemote`.
- **css/mesa-stage.css**: `#mesaRulerOverlay` (z-index 29, abaixo do ping 30), `.mesa-ruler` com linha SVG em coordenadas percentuais (escala com o zoom junto do palco), `.mesa-ruler-label` (chip da medida no ponto medio) e `.mesa-ruler-name`.
- **cloudflare/src/mesa-realtime-rules.js**: `RULER_TYPE = "mesa:ruler"` em `RELAY_TYPES` (NAO master-only — jogador mede; anti-spam pelo rate limit geral). Zero codigo novo no DO.
- **js/mesa-core.js**: `"mesa:ruler"` em `MESA_REALTIME_DELTA_TYPES` + branch efemero em `applyMesaRealtimeDelta`.
- **Testes** (suite 54 -> 58, describe "Regua de medicao (Etapa 44)"): regra do DO; medida horizontal exata (0.4 de palco / celula 0.1 = 4 cel = 6 m) e diagonal em px de layout; Shift+arrastar real mostra a regua, transmite `mesa:ruler`, NAO inicia drag (`state.drag` continua null), some ao soltar com `active:false` e nada entra na cena; regua remota aparece com nome e some no `active:false`.
- Cache-bust: mesa-core.js e mesa-ruler.js (novo) e mesa-stage.css -> `?v=2026-07-27-ruler-1`; `MESA_BUNDLE_VERSION` -> `2026-07-27-ruler-1`; mesa-ruler.js no bundle da Mesa (apos mesa-ping.js).
- Deploy do Worker: version `d55ec756-79b8-413e-afa3-2d6c9d98ad08` (dry-run antes; health 200).
- Validacao: test:mesa:audit 58/58, test:mesa 5/5, check:js OK, build:pages OK. Prova visual via Playwright: regua propria dourada "4,7 cel · 7,0 m" + remota carmesim "4,5 cel · 6,7 m" com nome "ana" sobre a grade.

## Etapa Concluida (2026-07-27 — Etapa 43: Ping no mapa — canal efemero)

Alt+clique no palco emite um ping visivel para todos os participantes por ~2s. Canal 100% efemero: nada entra na cena, nada persiste no D1 nem no storage do DO — o Durable Object apenas repassa.

- **js/mesa-ping.js** (NOVO): Alt+clique capturado em fase de captura no `#mesaStageWrap` (intercepta ANTES de drag/pan/selecao, `preventDefault` + `stopPropagation`); fracao do clique calculada pelo rect do `#mesaStageInner` (ja embute o zoom). Coordenadas viajam como fracao do MAPA (`u`/`v` via helper unico `mesaStageFracToMapFrac` de mesa-map.js) com `space: "map"`; sem mapa ativo, `space: "stage"` e fracao do palco direto — ping cai no MESMO ponto do mapa para todos, independente do pan/zoom local. Throttle local de 300ms; cap de 12 pulsos simultaneos (o mais antigo sai). Pulso proprio e dourado (`.is-self`), dos outros e carmesim com o nome do autor embaixo (`.mesa-ping-name`, via `payload.actor.username` que o DO anexa).
- **css/mesa-stage.css**: `.mesa-ping` — nucleo 14px + 2 ondas concentricas (`::before`/`::after` com delay), `z-index: 30` (acima de mapa/grade/desenhos/tokens), `pointer-events: none`; animacoes `mesa-ping-wave`/`mesa-ping-core` de 2s em sincronia com `MESA_PING_DURATION_MS`.
- **cloudflare/src/mesa-realtime-rules.js**: `PING_TYPE = "mesa:ping"` em `RELAY_TYPES` (relay generico; NAO e master-only — jogador pinga). Zero codigo novo no DO.
- **js/mesa-core.js**: `"mesa:ping"` em `MESA_REALTIME_DELTA_TYPES` + branch em `applyMesaRealtimeDelta` (chama `showMesaPingFromRemote` e retorna — sem render, sem cache, sem persist).
- **Testes** (suite 51 -> 54, describe "Ping no mapa (Etapa 43)"): regra do DO (relay sim, master-only nao); Alt+clique emite `mesa:ping` com u/v corretos, mostra pulso `.is-self`, nao muda `sceneVersion` nem o payload da cena, e o pulso expira sozinho; jogador recebe ping remoto com nome do autor na posicao certa.
- Cache-bust: mesa-core.js e mesa-ping.js (novo) e mesa-stage.css -> `?v=2026-07-27-ping-1`; `MESA_BUNDLE_VERSION` -> `2026-07-27-ping-1`; mesa-ping.js adicionado ao bundle da Mesa (apos mesa-grid.js).
- Deploy do Worker: version `dfb08f41-619f-4664-a4fd-7e62ac60e091` (dry-run antes; health 200).
- Validacao: test:mesa:audit 54/54, test:mesa 5/5, check:js OK, build:pages OK.

## Etapa Concluida (2026-07-12 — Etapa 42c: token em NxN celulas — tamanho quantizado + alinhamento)

Pedido do Tiago: com a grade ativa, tokens sempre em multiplos inteiros de celula (1x1, 2x2, 3x3...) — redimensionou, ajusta para completar o quadrado; nada de token vazando da grade ou com tamanho quebrado.

- **js/mesa-grid.js**: `mesaFitTokenToGrid` (quantiza o diametro para N celulas ajustando `tokenScale`, respeitando o clamp 0.25-4 do contrato), `mesaSnapTokenToGrid` agora alinha o QUADRADO NxN (canto arredondado para a linha da grade: N impar centra na celula, N par na intersecao — sem caso especial), `mesaConformTokenToGrid` (fit + snap) e `_conformAllTokensToGrid` (mestre re-conforma todos os tokens ao ligar snap/trocar celula, com broadcast de upsert + persist).
- **js/mesa-stage.js**: soltar do arrasto usa `mesaConformTokenToGrid` (antes so snap); `handleResizePointerUp` conforma apos aplicar a escala do gesto — o jogador solta o resize e o token completa o quadrado.
- **Armadilha corrigida**: o transform do token tem transicao CSS, entao `getBoundingClientRect` logo apos mudar a escala reflete o tamanho ANTIGO no mesmo frame. O snap passou a medir por LAYOUT (`offsetWidth x tokenScale`, imune a transicao e a zoom); os testes de snap antigos tambem migraram para medida por layout (falhavam por 0.028 celula = os 2.6px da transicao pendente).
- **Testes** (suite 49 -> 51, describe "Token em NxN celulas (Etapa 42c)"): escala quebrada vira exatamente 1x1 (centro da celula) e 2x2 (centro na intersecao); trocar o tamanho da celula re-conforma todos os tokens do mestre.
- Cache-bust: mesa-grid.js e mesa-stage.js -> `?v=2026-07-12-token-cells-1`; `MESA_BUNDLE_VERSION` -> `2026-07-12-token-cells-1`. Sem mudanca de Worker (tokenScale ja existia no contrato).
- Validacao: test:mesa:audit 51/51, test:mesa 5/5, check:js OK, build:pages OK. Preview: token re-conformado para escala 1.06 (= 1 celula de 93.2px), centro em 0.5 da celula.

## Etapa Concluida (2026-07-11 — Correcao pos-42: grupo "Grade" nao aparecia para o mestre)

Bug reportado pelo Tiago (local e online): o grupo "Grade" do painel de configuracoes nunca aparecia — sem ele nao ha como ligar a grade (que nasce desligada). Causa raiz: corrida de boot — `initMesaGrid` roda no DOMContentLoaded e decidia a visibilidade com `isMaster()` ANTES do boot assincrono da Mesa assentar `state.role` (o resultado variava por timing de fetch, por isso o teste original passou).

- **js/mesa-grid.js**: a visibilidade do grupo saiu do `_bindGridSettingsUI` (momento errado) e passou para `_syncGridSettingsUI` (`group.hidden = !_isGridMaster()` a cada sync); `applyMesaSceneGridFromSnapshot` agora SEMPRE sincroniza a UI (mesmo com `grid === undefined`) — ele roda depois do papel assentar no boot, o momento certo de revelar o grupo.
- **Testes** (suite 47 -> 49, describe "Grupo Grade no painel (correcao pos-42)"): mestre ve o grupo apos o boot (waitForFunction, pega a corrida), jogador nunca ve.
- Cache-bust: mesa-grid.js -> `?v=2026-07-11-grid-2`; `MESA_BUNDLE_VERSION` -> `2026-07-11-grid-2`. Sem mudanca de Worker.
- Validacao: test:mesa:audit 49/49, check:js OK. Preview local: grupo visivel para o mestre com o script `grid-2` carregado.

## Etapa Concluida (2026-07-11 — Etapa 42b: token encaixa no grid — caixa = circulo, nome em hover/selecao)

Ajuste pedido pelo Tiago apos a Etapa 42: o elemento do token era circulo (88px) + nome embaixo (~88x106), entao o retangulo que o snap centralizava era maior que o circulo e ele nunca assentava certinho na celula.

- **css/mesa-stage.css**: `.mesa-token.is-minimal` agora e 88x88 (so o circulo). O `.mesa-token-name` ficou `position: absolute` abaixo do circulo (fora da caixa de layout) e invisivel por padrao (`opacity: 0`, `pointer-events: none`); aparece com fade de 150ms em hover, `.is-selected` e `.is-dragging`. Nome segue no DOM (leitores de tela). Alca de resize reposicionada para a borda do circulo (antes ficava "acima do nome").
- **Efeito em cascata gratis**: snap-to-grid, arrasto, clamp e caixa de selecao usam o rect do elemento — todos passam a operar exatamente sobre o circulo, sem mudanca de JS.
- **Teste** (tests/mesa-audit.spec.cjs, describe "Encaixe do token no grid (Etapa 42b)", suite 46 -> 47): caixa 88x88, nome oculto por padrao, visivel na selecao E no hover (espera a transicao real), e centro do CIRCULO cai no centro da celula apos snap.
- Cache-bust: css/mesa-stage.css -> `?v=2026-07-11-token-fit-1`; `MESA_BUNDLE_VERSION` -> `2026-07-11-token-fit-1`. Sem mudanca de Worker (sem deploy).
- Nota de ambiente: no painel de preview embutido o fade pode parecer "travado em 0" porque o renderer fica suspenso sem pintura (transicoes CSS nao avancam); em navegador real e no Playwright funciona — verificado pelo teste.
- Validacao: test:mesa:audit 47/47, test:mesa 5/5 (os "10" de antes eram 5 + 5 duplicados do worktree orfao removido na 42), check:js OK, audit:static OK, build:pages OK. VISUAL_RULES.md atualizado.

## Etapa Concluida (2026-07-11 — Etapa 42: Grade funcional + snap-to-grid + helper palco<->mapa)

Sexta etapa do plano "Mesa Virtual -> VTT completo" (Etapas 37-51). Frontend + Worker (contrato da cena) — deployado.

- **Modelo (decisao D1)**: grade amarrada ao MAPA — celula em fracao da largura exibida da imagem (`grid.cellFrac`, clamp 0.01-0.25), com `enabled`, `snap`, `offsetXFrac/offsetYFrac` (0-1 dentro da celula), `color` (#hex) e `opacity` (0.05-0.8). Pan/zoom do mapa movem a grade junto sem re-sync (so re-render). Sem mapa ativo, a superficie de referencia e o proprio palco. Grade e visivel a todos (sem camada dm).
- **Helper unico palco<->mapa** (js/mesa-map.js): `getMesaMapSurfaceFrac()` (retangulo da imagem exibida em fracoes do palco, derivado do cover+transform), `mesaStageFracToMapFrac(fx,fy)` e `mesaMapFracToStageFrac(u,v)`. Regua (Etapa 44) e fog (Etapa 47) DEVEM reusar estas funcoes — unica fonte da matematica de cover. `applyMapTransform` e `renderMesaMapLayer` (branch de limpeza) chamam `window.renderMesaGrid()`.
- **Modulo novo** (js/mesa-grid.js): estado + normalizacao espelhada do Worker, render em canvas dedicado `#mesaGridCanvas` (mesmo padrao DPR/ResizeObserver do mesaDrawCanvas; z-index 7, abaixo dos desenhos), recorte na intersecao superficie∩palco (mapa em cover pode transbordar), UI do mestre (grupo "Grade" no painel de configuracoes: Exibir grade, Encaixar tokens, contador de colunas -/+), `updateMesaGrid` (master-only: aplica -> re-render -> `mesa:grid:update` -> bump+persist) e `mesaSnapTokenToGrid`.
- **Snap no soltar** (js/mesa-stage.js `handleDragEnd`): snap ANTES do flush realtime/persist — a posicao final transmitida ja e o centro da celula. Centro do token -> fracao do mapa -> celula mais proxima -> volta pra % do palco (clamp 0-100). Celula quadrada em px (fracao vertical = cellFrac x proporcao da superficie).
- **Sync**: `mesa:grid:update` adicionado a MASTER_ONLY_TYPES/RELAY_TYPES (cloudflare/src/mesa-realtime-rules.js) — DO ja bloqueia jogador e retransmite pelo caminho generico, sem codigo novo no DO. Cliente: tipo no MESA_REALTIME_DELTA_TYPES + branch em applyMesaRealtimeDelta (aplica estado completo + cache local). Cena: `grid` no createMesaScenePayloadFromState, na assinatura do normalizeMesaScenePayload (persist so-de-grade nao cai no dedupe — mesma licao da iniciativa/desenhos) e no applyMesaSceneSnapshot (`undefined` = cena antiga preserva estado; `null` = desligada).
- **Worker** (cloudflare/src/mesa.js): `normalizeSceneGrid` (clamps identicos ao cliente; grade toda desligada vira `null`) + campo `grid` no normalizeMesaScene.
- **Testes** (tests/mesa-audit.spec.cjs, describe "Grade funcional (Etapa 42)", suite 41 -> 46): normalizacao no Worker (clamps/null/cena antiga), tipo master-only+relay nas regras do DO, mestre liga grade -> pixels no canvas + grid no payload e na assinatura, snap centraliza na celula ((n+0.5)x0.1 de fracao do palco), jogador recebe delta mas updateMesaGrid dele e no-op. Testes com `waitForFunction` no papel (o waitForMesaSettled de 450ms nao basta sob carga — causa raiz do mesmo padrao de flake do "bug 2").
- **Limpeza**: worktree orfao `.claude/worktrees/amazing-roentgen-549fdf` (2026-07-05, limpo, commit ja em main) removido — o glob do Playwright rodava os specs antigos dele junto e poluia o test:ficha.
- Cache-bust: mesa-core/mesa-map/mesa-stage/mesa-grid(novo) -> `?v=2026-07-11-grid-1`; css/mesa-map.css -> `?v=2026-07-11-grid-1`; `MESA_BUNDLE_VERSION` -> `2026-07-11-grid-1`; mesa-grid.js adicionado ao bundle (tools/build-pages.cjs).
- Worker deployado: dry-run limpo -> version ID `806fc991-c699-4ebd-840a-a2c2bbb4a5c2`, health 200 (ver cloudflare/README.md).
- Validacao: check:js OK (40), audit:static OK, test:mesa:audit 46/46, test:mesa 10/10, test:ficha 28/28. Preview visual: grade renderizada no palco do mestre, painel "Grade" com toggles e contador (13 colunas com cellFrac 0.08), snap verificado por teste.

## Etapa Concluida (2026-07-11 — Etapa 41: Hardening do backend — caps, rate limit e testes do DO)

Quinta etapa do plano "Mesa Virtual -> VTT completo" (Etapas 37-51). Toca Worker + DO — deployado.

- **Cap de body** (cloudflare/src/auth.js `readJson`): 16KB por padrao, 413 acima do cap (checa Content-Length declarado E o tamanho real; devolver `{}` silenciosamente seria pior — um PUT de cena com `{}` normalizado apagaria a cena salva). PUT /mesa/scene e PUT /characters usam cap explicito de 256KB. JSON invalido continua caindo em `{}` (comportamento antigo preservado).
- **Upload de mapa** (cloudflare/src/index.js): limitado a 8MB (413) antes do `arrayBuffer()`.
- **DO — cap de mensagem + rate limit** (cloudflare/src/mesa-realtime.js): mensagens WS limitadas a 32KB, com excecao do `mesa:map:ws:chunk` (64KB binario ≈ 87KB base64 → teto proprio de 128KB) e teto absoluto de 256KB; verificacao ANTES do parse (`checkRealtimeMessageSize`, deteccao de tipo por substring barata). Rate limit por socket via token bucket em memoria (`createRateBucket`/`takeRateToken`): geral 30 msg/s burst 60; chunk de mapa em bucket proprio 120/s burst 240 (o push de mapa legitimo manda 4 chunks/15ms); `ping` isento. Mensagem bloqueada recebe ack de erro (conexao preservada); bucket removido no close/error do socket.
- **Regras puras extraidas** (novo cloudflare/src/mesa-realtime-rules.js): RELAY_TYPES/MASTER_ONLY_TYPES/MAP_SIGNAL_TYPES, sanitizacao de desenhos, limites, token bucket e toda a normalizacao de patch de ficha/vitais de Echo sairam do mesa-realtime.js para um modulo SEM `cloudflare:workers` — os testes unitarios importam exatamente o codigo que o DO usa (paga a pendencia das Etapas 37/38; o teste "guarda de fonte" por regex virou teste real de import).
- **Testes** (tests/mesa-audit.spec.cjs, describe "Hardening do backend (Etapa 41)", suite 36 -> 41): readJson (ok/413 declarado/413 real/cap de cena/JSON invalido), saveMesaScene de jogador -> 403, cap de mensagem (32KB/128KB chunk/256KB hard), token bucket (burst 60, recarga 30/s, bucket proprio de chunk), paridade das regras de patch de ficha no modulo extraido.
- **E2E real** (wrangler dev local, 2 WebSockets autenticados): 22/22 — os 19 checks das Etapas 37/38 continuam verdes no DO refatorado + mensagem >32KB recebe nack, burst de 80 msgs tem 24 bloqueadas pelo rate limit (56 passam: 60 de burst menos as ja consumidas) e a API segue saudavel depois; PUT de cena com 300KB -> 413 e PUT normal -> 200.
- Sem mudanca de frontend (sem cache-bust). Worker deployado: version ID `005b66b0-5ce4-4517-9088-65efb9eb3fc4`, health 200 (ver cloudflare/README.md).
- Validacao: check:js OK (39 — inclui o novo rules), audit:static OK, test:mesa:audit 41/41 (flake conhecido "bug 2" sob carga, verde isolado — Etapa 50 investiga), test:mesa 5/5, test:ficha 28/28.

## Etapa Concluida (2026-07-11 — Etapa 40: Fachada do mapa + remocao do stub mesa-init.js)

Quarta etapa do plano "Mesa Virtual -> VTT completo" (Etapas 37-51). So frontend — sem deploy de Worker.

- **Fachada do mapa** (js/api.js + js/mesa-map.js): novos metodos `window.APP.uploadMesaMap(blob, mapId)` (FormData — nao passa pelo `request()` JSON; o browser define o multipart sozinho) e `window.APP.deleteMesaMap(r2Key)`. `uploadActiveMapToR2`/`deleteActiveMapFromR2` (js/mesa-map.js) nao dao mais `fetch` direto — a divida registrada na fase de integracao foi quitada; toda chamada de backend dos modulos `mesa-*.js` passa pela fachada `APP`.
- **Stub removido**: `js/mesa-init.js` (arquivo vazio reservado desde o split) deletado — saiu do `mesa.html`, do bundle (tools/build-pages.cjs) e das docs (CLAUDE.md, docs/obsidian/07-MESA.md). check:js caiu de 39 para 38 arquivos.
- **Docs corrigidas de tabela**: CLAUDE.md e 07-MESA.md ainda citavam `mesa-renderer-v2.js`/renderer Canvas removidos na Etapa 33 (discrepancia apontada no COMPARATIVO-ROLL20 §10) — atualizados para o renderer DOM atual.
- **Teste** (tests/mesa-audit.spec.cjs, describe "Fachada do mapa (Etapa 40)", suite 35 -> 36): upload/delete via fachada com spy + contagem de `window.fetch` direto (deve ser 0) + estado do mesa-map preenchido pela resposta.
- Cache-bust: api.js -> `?v=2026-07-11-map-facade-1` em TODAS as paginas (echos, ficha, index, mesa, regras, sugestoes); mesa-map.js -> `?v=2026-07-11-map-facade-1`; `FICHA_BUNDLE_VERSION` e `MESA_BUNDLE_VERSION` -> `2026-07-11-map-facade-1` (api.js esta nos dois bundles).
- Validacao: check:js OK (38), audit:static OK, build:pages OK, test:mesa:audit 36/36 (flake conhecido do "bug 2" reapareceu sob carga na 1a rodada e passou isolado — investigar na Etapa 50), test:mesa 5/5, test:ficha 28/28. Preview: mesa carrega sem mesa-init.js, fachada presente, 3 tokens no palco, console limpo.

## Etapa Concluida (2026-07-11 — Etapa 39: Correcoes de interacao — drift de drag + clamp da selecao)

Terceira etapa do plano "Mesa Virtual -> VTT completo" (Etapas 37-51). So frontend — sem deploy de Worker.

- **Drift do drag com zoom** (js/mesa-stage.js): `updateDragPosition` usava o `stageRect` congelado no inicio do drag — zoom (wheel/slider), pan ou scroll NO MEIO do drag invalidavam o rect e o token derivava do cursor. Agora o rect e recapturado a cada frame (rAF ja limita a cadencia) e o offset do agarre e armazenado como FRACAO do token (`pointerOffsetFracX/Y`), entao mudar a escala no meio do drag nao desloca o ponto de agarre. Campos antigos mantidos como fallback.
- **Clamp continuo da selecao multipla** (js/mesa-select.js): `_applyMoveDelta` clampava cada item individualmente em 0-100 — na borda, a selecao "esmagava" e o arranjo relativo se perdia de forma irreversivel. Agora o DELTA do grupo e clampado pela caixa dos itens moviveis (`_computeMovableBounds`: tokens com permissao + strokes selecionados) e o grupo para na borda como unidade. Importante pos-Etapa 38: stroke empurrado para fora seria DEFORMADO no save (o Worker clampa fracoes 0-1). No resize, a borda arrastada agora para em 0/100 (clamp do `nb` no mousemove) em vez de crescer para fora do palco.
- **Testes** (tests/mesa-audit.spec.cjs, describe "Correcoes de interacao (Etapa 39)", suite 31 -> 35): drag E2E com zoom 1.5x previo (token termina sob o cursor), zoom 2x alterado NO MEIO do drag (verificado que FALHA sem o fix — regressao real), selecao multipla para na borda preservando o arranjo, stroke nao sai do palco pelo move em grupo.
- Cache-bust: mesa-stage.js e mesa-select.js -> `?v=2026-07-11-interaction-fix-1` (mesa.html); `MESA_BUNDLE_VERSION` -> `2026-07-11-interaction-fix-1`.
- Validacao: check:js OK (39), audit:static OK, test:mesa:audit 35/35 (incluindo o flake "bug 2", verde nesta rodada), test:mesa 5/5, perf:mesa OK (sem regressao no drag DOM). Preview manual: drag simulado com zoom 2x termina com erro 0.0px nos dois eixos, console limpo.

## Etapa Concluida (2026-07-10 — Etapa 38: Desenhos — relay no DO + contrato da cena)

Segunda etapa do plano "Mesa Virtual -> VTT completo" (Etapas 37-51). Os desenhos tinham dois furos estruturais: o Durable Object descartava `mesa:drawings:update` (fora de `RELAY_TYPES` — os testes antigos mascaravam com spies) e os tracos nao faziam parte da cena oficial (jogador tardio dependia do mestre online reenviar por presenca; F5 dependia so do localStorage).

- **Durable Object** (cloudflare/src/mesa-realtime.js): `mesa:drawings:update` entrou em `RELAY_TYPES` (jogador tambem desenha — NAO e master-only). O relay valida que `drawings` e array (ack de erro se nao) e REMOVE tracos `layer:"dm"` antes de retransmitir (defesa contra injecao de traco secreto por jogador; o cliente do mestre ja filtrava no envio).
- **Contrato da cena** (cloudflare/src/mesa.js): novo campo `drawings` no `data_json` com normalizacao `normalizeSceneDrawing` — ferramentas `pencil|line|rect|circle`, cor `#hex` (default `#e84040`), width 1-12, fracoes 0-1 com 4 casas, caps de 300 tracos e 200 pontos por lapis (lapis com <2 pontos e descartado). `getMesaScene` filtra `layer:"dm"` para nao-mestres (mesmo contrato dos tokens secretos). Diferenca deliberada dos tokens dm: tracos dm PERSISTEM no backend via PUT master-only (sobrevivem a troca de dispositivo), enquanto tokens dm continuam locais ao cliente do mestre.
- **Cliente** (js/mesa-core.js): `createMesaScenePayloadFromState` embute `drawings` (via `getDrawingsSnapshot` + `normalizeMesaSceneDrawings`, mesmos caps do Worker); a assinatura de dedupe (`normalizeMesaScenePayload`) inclui os desenhos (sem isso um persist so de traco novo era descartado — mesmo bug da iniciativa na Etapa 37); `applyMesaSceneSnapshot` aplica `saved.drawings` via `applyMesaSceneDrawingsFromSnapshot`; o branch `mesa:drawings:update` do roteador agora cacheia o snapshot local e, no mestre, chama `persistState()` (desenho de jogador vira estado oficial).
- **js/mesa-drawing.js**: `applyMesaSceneDrawingsFromSnapshot` (cena e a fonte de verdade; mestre preserva tracos dm locais ausentes da cena — mesmo merge dos tokens dm no boot; jogador filtra dm defensivamente); `_restoreDrawings` do localStorage legado (`mesa_drawings_v1`) so roda se a cena nao trouxe o campo; `_broadcastDrawings` agora chama `persistState()` (mestre persiste no backend, jogador atualiza o cache local).
- **Testes** (tests/mesa-audit.spec.cjs, describe "Desenhos fim-a-fim (Etapa 38)", suite 25 -> 31): normalizacao no Worker (caps/whitelist/lapis), GET filtra dm por papel (mock D1), guarda de fonte do DO (o modulo importa `cloudflare:workers` e nao roda em Node — teste unitario real do DO fica para a Etapa 41), payload + assinatura de dedupe, jogador aplica desenhos da cena no boot sem mestre online (e nunca ve dm), mestre recebe delta de jogador + persiste + preserva dm local. O teste antigo "bug 4" migrou para o fluxo real (`_broadcastDrawings` em vez de `_persistDrawings`) porque a cena passou a ser a fonte de verdade no F5.
- Cache-bust: mesa-core.js, mesa-drawing.js e mesa-stage.js -> `?v=2026-07-10-drawings-sync-1` (mesa.html); `MESA_BUNDLE_VERSION` -> `2026-07-10-drawings-sync-1`.
- Validacao: check:js OK (39), audit:static OK, test:mesa:audit 31/31 (na 1a execucao o flake conhecido do "bug 2" reapareceu sob carga e ficou verde isolado/na re-execucao — mesmo comportamento registrado na Etapa 37), test:mesa 5/5, perf:mesa OK. Preview verificado nos dois papeis (localhost:8000, deltas simulados): MESTRE — desenha publico+secreto, snapshot/payload carregam ambos, delta de jogadora entra e persiste, F5 restaura os 3 tracos; JOGADOR — cena com traco dm forjado renderiza SO o publico no canvas, console limpo.
- ~~Pendencia da etapa: teste unitario real do DO (relay + filtro dm) na Etapa 41; rodada com 2 janelas reais via WebSocket de producao na Etapa 51.~~ **CUMPRIDAS** nas Etapas 41 e 51.

## Etapa Concluida (2026-07-10 — Etapa 37: Iniciativa fim-a-fim)

Primeira etapa do plano "Mesa Virtual -> VTT completo" (Etapas 37-51, plano aprovado em 2026-07-10). O tracker de iniciativa tinha UI completa (painel, banner, popup 1d20+Agilidade) mas estava quebrado fim-a-fim: `initInitiativeModule()` nunca era chamado, `applyMesaRealtimeDelta` descartava os deltas `mesa:initiative:*` (sem branch) e o Durable Object nem retransmitia os tipos (fora de `RELAY_TYPES`). Na pratica so funcionava na tela do mestre e sumia no F5.

- **Roteador de deltas** (js/mesa-core.js): novos branches em `applyMesaRealtimeDelta` — `mesa:initiative:update` aplica o estado via `applyInitiativeState` + `cacheMesaSceneSnapshotLocally()` (jogador preserva no F5); `mesa:initiative:roll` so e consumido pelo mestre e valida ator (rolagem de jogador so vale para o proprio personagem, mesma regra anti-forja do `mesa:token:move`), chamando `receiveInitiativeRoll`.
- **Boot** (js/mesa-core.js `initMesaPage`): chama `initInitiativeModule()` apos os demais modulos. O modulo foi repensado (js/mesa-initiative.js): NAO registra mais listeners proprios (`window.APP.on`) — os deltas fluem pelo roteador padrao, que ja deduplica por clientId; `initInitiativeModule` agora so sincroniza a UI (`renderInitiative`). Novo export `window.receiveInitiativeRoll`.
- **Persistencia**: `_broadcastInitiative` (js/mesa-initiative.js) agora chama `persistState()` — iniciativa sobrevive ao F5 do mestre e chega a jogador tardio via GET /api/mesa/scene (o contrato `initiative` ja existia em cloudflare/src/mesa.js). **Fix de dedupe**: `normalizeMesaScenePayload` (js/mesa-core.js) passou a incluir `initiative` normalizada na assinatura — sem isso, um persist disparado so por acao de iniciativa tinha assinatura identica e era descartado por `flushPersistState`/`queueRemoteMesaPersist`.
- **Durable Object** (cloudflare/src/mesa-realtime.js): `mesa:initiative:update` em `MASTER_ONLY_TYPES`; `mesa:initiative:roll` em `RELAY_TYPES` com validacao de identidade no `handleRealtimeRelay` (characterKey == username autenticado do socket; ack de erro se forjado). Sem bump de sceneVersion nas acoes de iniciativa (evita drop por staleness de rolagem de jogador que perdeu um update).
- **Testes** (tests/mesa-audit.spec.cjs, describe "Iniciativa fim-a-fim (Etapa 37)", suite foi de 20 para 25): roundtrip no Worker (preserva ativa, cap 50 entradas, default inativo); jogador recebe update -> painel/banner, banner some apos rolar, controles de mestre ocultos; mestre consome roll (reordena, re-broadcasta, persiste) e descarta rolagem forjada; iniciativa sobrevive ao F5 do mestre; assinatura de dedupe muda quando iniciativa muda.
- Cache-bust: mesa-core.js e mesa-initiative.js -> `?v=2026-07-10-initiative-sync-1` (mesa.html); `MESA_BUNDLE_VERSION` -> `2026-07-10-initiative-sync-1`.
- Validacao: check:js OK (39), audit:static OK, test:mesa:audit 25/25 (2a execucao; na 1a o teste pre-existente "bug 2" falhou por flake sob carga paralela — passa isolado e na re-execucao; observar), test:mesa 5/5. Worker deployado: version ID `9c7c6056-b75b-4187-b6b8-78dc7f215e45`, health 200 (ver cloudflare/README.md).
- Verificado no preview (localhost:8000, deltas simulados via applyMesaRealtimeDelta): MESTRE — ativar combate acende botao INIC. + painel, rolagem legitima da ana entra na ordem (17) e persiste no snapshot, rolagem forjada (ana declarando bruno) descartada, F5 restaura combate ativo com ordem e controles; JOGADOR — update remoto mostra banner "Combate iniciado" + painel sem controles de mestre, clique no banner abre popup com nome/mod corretos (Agilidade 6 -> +2), rolar emite mesa:initiative:roll com characterKey proprio. Console limpo nos dois papeis.
- ~~Pendencia da etapa: rodada de iniciativa com 2 janelas REAIS via WebSocket de producao (mestre + jogador logados) — sera exercitada na sessao real da Etapa 51.~~ **CUMPRIDA na Etapa 51.**

## Etapa Concluida (2026-07-07 — Etapa 36: Mesa igual para todos — cena auto-suficiente + mapa persistente)

Bug critico reportado com prints do site publicado: jogador via "SEM MAPA" e "0 em cena" enquanto o mestre via mapa + 5 tokens. Diagnostico confirmado ao vivo (GET /mesa/scene pela sessao do mestre): duas causas estruturais, alem de o frontend publicado ainda nao ter as correcoes das Etapas 34/35 (nada havia sido commitado).

- **Jogador nunca renderizava token de NPC/monstro**: o `/api/directory` so devolve NPCs/monstros ao mestre (cloudflare/src/characters.js:362) e a cena salva so tinha `id/posicao/camada` — `mergeTokenWithRoster` retornava `null` e o token era descartado no boot e no realtime. Correcao: a cena oficial agora embute dados de exibicao por token (`type`, `name`, `ownerUsername`, `imageUrl`, vitais) — `createMesaScenePayloadFromState` (js/mesa-core.js) envia, `normalizeSceneToken` (cloudflare/src/mesa.js) preserva (avatar so URL http; `data:` rejeitado) e `createRosterEntryFromSavedToken` (js/mesa-core.js) hidrata sem entrada no roster. Vitais de token com `statsVisibleToPlayers:false` sao anulados server-side no GET para nao-mestres (nao vazam nem no JSON).
- **Mapa nao existia no backend**: entrega era 100% realtime (P2P/WS/R2 efemero) e o R2 era apagado quando todos saiam; pior, `setMapFromConnectedFolder` NUNCA anunciava (mapa da pasta conectada = invisivel para jogadores mesmo online). Correcao: mapa persistente — todo set de mapa do mestre sobe ao R2 (`_ensureActiveMapPersisted`) e grava `map: { id, url, transform }` na cena oficial (`getMesaSceneMapPayload` no cliente, `normalizeSceneMap` no Worker); jogadores carregam no boot via `applyMesaSceneMapFromSnapshot` -> `_renderSceneMapFromUrl` (js/mesa-map.js), sem depender do mestre online. R2 nao e mais apagado quando todos saem; "Limpar mapa" remove R2 + referencia na cena e persiste mesmo sem jogadores online. Pan/zoom do mestre persiste na cena (debounce 1.2s) alem do broadcast realtime de 200ms.
- **Transform nunca chegava a jogador com mapa via P2P/cache** (bug pre-existente descoberto agora): o id local do jogador e `cached-<hash>`, diferente do id do mestre nos broadcasts `transformOnly` — o transform ficava pendente para sempre. Corrigido com `mesaMapState.remoteMapId` (id do mestre, vindo do announce/set/cena).
- Jogador em modo backend nao restaura mais mapa local no boot (a cena oficial e a fonte de verdade); mestre com mapa ativo local e cena sem mapa migra automaticamente no boot (upload + PUT). Mapas da pasta conectada agora tem entry completo (`cf-<hash>`) inclusive no restore pos-F5 (announce a jogadores novos volta a funcionar e o transform nao zera mais no F5).
- Suite `test:mesa:audit` ampliada para 20 testes (describe "Mesa igual para todos"): contrato do Worker (dados de exibicao, campo `map`, filtro de vitais por papel com mock de D1), payload com dados embutidos + assinatura sensivel ao transform do mapa, hidratacao de NPC sem roster no jogador (E2E no palco), mapa da cena no boot do jogador + limpeza quando a cena zera.
- Cache-bust: mesa-core.js e mesa-map.js -> `?v=2026-07-07-cena-espelho-1` (mesa.html).
- Nota: `MAP_R2_TTL` (wrangler.toml) nao e aplicado por codigo algum — mapas persistem no R2 ate serem trocados/limpos (desejado agora que a cena referencia a URL).
- Validacao: test:mesa:audit 20/20 (2 execucoes), test:mesa OK, test:ficha OK, perf:mesa OK, check:js OK (39), audit:static OK. Worker deployado (ver cloudflare/README.md).

## Etapa Concluida (2026-07-05 — Etapa 35: Suite de regressao da auditoria)

Nova suite `tests/mesa-audit.spec.cjs` (14 testes, `npm run test:mesa:audit`) cobrindo os 11 bugs da Etapa 34 e casos de permissao que nenhuma suite exercitava:

- **Contrato do Worker** (dynamic import de `cloudflare/src/mesa.js`): `normalizeMesaScene` preserva `layer:"dm"`, default `"tokens"`, clamps de posicao/escala, teto de 120 tokens e descarte de campos desconhecidos.
- **Mestre**: merge dos tokens dm no boot com backend (bug 2); payload com `layer` + token dm nunca vai a rede (bugs 1/2); reconexao re-persiste em vez de puxar cena (bug 3); selecao multipla persiste cena/retransmite desenhos (bug 5); drag E2E de token secreto na camada MESTRE + bloqueio na camada MAPA (bug 6); desenhos sobrevivem a reload e sao reenviados a jogador novo sem vazar camada dm (bug 4); announce de mapa por jogador NOVO com dedupe e re-announce no F5 (bug 9); round-trip do transform normalizado + mestre ignora transform remoto + transform de outro mapa fica pendente (bug 10).
- **Jogador**: reconexao rebusca cena sem persistir (bug 3); selecao multipla nao move/redimensiona token alheio (bug 7); drag transmite so o proprio token (bug 8); token dm invisivel e controles de mestre ocultos (permissoes).
- **A suite pegou um fix incompleto de verdade**: `flushRealtimeDragMove` (js/mesa-stage.js:810) ainda bloqueava o streaming do jogador com `!isMaster()` — corrigido com a mesma regra do `queueRealtimeDragMove` (`canPlayerMoveOwnToken`). Cache-bust: mesa-stage.js -> `?v=2026-07-05-auditfix-2`.
- Tecnica de teste: hook `window.APP.__testEmit` (addInitScript intercepta `window.APP` e captura handlers de `APP.on`) para emitir presenca/ready sem WebSocket; funcoes globais chamadas direto via `page.evaluate` com spies; seeds de localStorage idempotentes (addInitScript roda de novo no reload); `waitForMesaSettled` (450ms) evita que o persist debounced do boot contamine spies.
- Validacao: test:mesa:audit 14/14 (2 execucoes), test:mesa 5/5, test:ficha 28/28, perf:mesa 1/1, check:js OK, audit:static OK.

## Etapa Concluida (2026-07-05 — Etapa 34: Correcao dos 11 bugs da auditoria completa)

Auditoria de bugs em 4 rodadas (sync/realtime, tokens/movimento, mapa, ficha) encontrou 11 bugs; os 10 de frontend foram corrigidos nesta etapa (o 11o e o deploy do Worker, ver Pendencias):

- **Mestre perdia tokens secretos (dm) no F5**: `loadMesaSceneSnapshot` (js/mesa-core.js) agora mescla os tokens `layer:"dm"` do snapshot local ANTES de sobrescrever o localStorage com a cena remota (a protecao antiga usava `state.tokens`, vazio no boot).
- **Sem resync ao reconectar WebSocket**: novo `resyncMesaSceneAfterReconnect()` no handler `mesa:ready` (js/mesa-core.js) — jogador rebusca `GET /api/mesa/scene`; mestre (autoritativo) re-persiste o estado atual, o que tambem recupera um PUT que falhou durante a queda.
- **Desenhos nao persistiam**: `_persistDrawings`/`_restoreDrawings` em js/mesa-drawing.js (localStorage `mesa_drawings_v1`) + mestre reenvia snapshot de desenhos quando jogador novo aparece na presenca (`_bindDrawingsPresence`).
- **Selecao multipla nao salvava**: `_broadcastAndRender` (js/mesa-select.js) agora chama `bumpMesaSceneVersion` + `persistState({immediate:true})` e retransmite `mesa:drawings:update` quando strokes foram movidos/redimensionados.
- **Camada MESTRE bloqueava arrastar tokens secretos**: `handleTokenPointerDown`/`handleTokenMouseDown` (js/mesa-stage.js) so bloqueiam interacao na camada `map` (antes bloqueavam tudo que nao fosse `tokens`).
- **Jogador movia token alheio localmente**: `_applyMoveDelta`/`_applyResizeDelta` (js/mesa-select.js) agora respeitam `canMoveTokens` por token.
- **Drag do jogador teleportava**: `queueRealtimeDragMove` (js/mesa-stage.js) transmite em tempo real tambem o token do proprio jogador (`canPlayerMoveOwnToken`); antes so o mestre streamava.
- **Jogador que entrava depois nao recebia o mapa**: `bindMesaMapPresence` (js/mesa-map.js) anuncia por JOGADOR NOVO na presenca (diff de usernames), nao apenas na transicao 0->1 jogadores.
- **Pan/zoom do mapa nao sincronizava**: novo sync de transform normalizado (fracoes do tamanho exibido) via carona no tipo `mesa:map:set` com `transformOnly:true` (js/mesa-map.js: `broadcastMapTransform`, `_applyRemoteMapTransform`, `_flushPendingRemoteTransform`) — jogadores agora veem o mapa alinhado ao do mestre; sem mudanca no Durable Object.
- **Card de lore encolhia ao recolher**: `.notes-collapse-summary` com `min-width: 7em` (css/ficha.css), zerado em <=700px para nao estourar no mobile. `tests/ficha.spec.cjs` agora esta 28/28 (a falha conhecida de UX foi corrigida).
- Cache-bust: mesa-core/stage/select/map/drawing.js -> `?v=2026-07-05-auditfix-1` (mesa.html); ficha.css -> `?v=2026-07-05-auditfix-1` (ficha.html).
- Validacao: check:js OK (39), audit:static OK, test:mesa 5/5, test:ficha 28/28.

**Bug 1 RESOLVIDO na mesma etapa**: `wrangler deploy` executado em 2026-07-05 (dry-run limpo antes; version ID `42b27e84-5547-4d23-b8e7-81fb240b1cfa`, health 200). O Worker publicado agora persiste o campo `layer` dos tokens e filtra tokens `dm` no GET /api/mesa/scene para nao-mestres. Descoberto tambem que a pendencia antiga do relay de Echo no DO estava OBSOLETA (mesa-realtime.js identico ao ja deployado). **A fase "backend congelado" (secao acima) esta ENCERRADA** — o Worker volta a poder ser deployado normalmente.

## Ultima Etapa Concluida (2026-06-30 — Etapa 33: Limpeza — remocao do Canvas renderer morto)

Removido de vez o subsistema de Canvas renderer (que ja estava fora do fluxo desde a Etapa 32):

- **Arquivos deletados**: `js/mesa-renderer-v2.js` e `js/mesa-renderer-worker.js` (OffscreenCanvas via Worker). check:js caiu de 41 para 39 arquivos.
- **js/mesa-stage.js**: removidas as funcoes `getMesaStageRenderer`, `renderCanvasStage`, `createCanvasTokenSnapshot`, `refreshCanvasStageToken`, `updateCanvasStageTokenPosition`, `renderTokenCard`, `changeTokenStyle`, `_applyTokenStyleDOM`, `_ensureCanvasClearedForDOMMode`, `clearDomStageTokenElements` e as vars `mesaStageRenderer`/`lastCanvasStageSnapshot`. `renderStage`/`renderToken`/drag/selecao/hit-test agora sao DOM-only.
- **js/mesa-map.js**: removido `_syncTokenStyleButtons` (orfao).
- **css/mesa-stage.css**: removidas as regras `.mesa-stage-canvas` e `.is-canvas-renderer`.
- **mesa.html**: removidos o `<canvas id="mesaStageCanvas">` e o `<script src="mesa-renderer-v2.js">`.
- **tools/build-pages.cjs**: `mesa-renderer-v2.js` saiu do bundle; comentario sobre o worker atualizado.
- **tests**: `mesa.performance.spec.cjs` reescrito para medir o drag no DOM (sem o renderer). test:mesa 5/5 e perf:mesa 1/1 verdes.
- Cache-bust: `mesa-stage.js`, `mesa-map.js`, `css/mesa-stage.css` -> `2026-06-30-cleanup-1`; `MESA_BUNDLE_VERSION` -> `2026-06-30-cleanup-1`.
- Verificado no preview: 3 tokens redondos, nenhum canvas no palco, `window.MesaRendererV2` inexistente, console limpo.

## Ultima Etapa Concluida (2026-06-30 — Etapa 32: Token da Mesa so no estilo redondo)

Removido o estilo de token "card" grande (que usava o Canvas renderer); a Mesa agora tem UM unico estilo de token: o redondo (minimal), renderizado via DOM.

- `state.tokenStyle` fica fixo em `"minimal"` (default, restore e normalize forcam esse valor em js/mesa-core.js).
- `renderStage` e `renderToken` (js/mesa-stage.js) sempre usam o caminho DOM/minimal; `renderTokenCard` e o Canvas renderer (`mesa-renderer-v2.js`) viraram codigo morto (nao removidos ainda — limpeza mais profunda fica para depois).
- Removido o seletor "Estilo dos tokens" (botoes Grande/Minimalista) do painel de config do mapa: bloco `#mesaTokenStyleGroup` saiu do `mesa.html`, e o codigo que o exibia/sincronizava em `mesa-map.js` foi neutralizado (`_syncTokenStyleButtons` virou no-op).
- Testes: `tests/mesa.spec.cjs` reescrito para ler o token DOM (`.mesa-token.is-minimal`) em vez do layout do Canvas renderer (que so existia no modo card). Suite 5/5 verde.
- Cache-bust: `mesa-stage.js`, `mesa-core.js`, `mesa-map.js` -> `?v=2026-06-30-round-only-1`; `MESA_BUNDLE_VERSION` -> `2026-06-30-round-only-1`.
- Validacao: check:js OK, audit:static OK, build:pages OK, test:mesa 5/5. Verificado no preview: tokens redondos (avatar 88px, border-radius 50%, borda por tipo), seletor de estilo ausente, console limpo.

## Ultima Etapa Concluida (2026-06-30 — Etapa 31: Correcao de bugs da auditoria da Mesa)

Apos auditoria completa da Mesa (5 frentes via agentes), corrigidos os bugs criticos/altos encontrados:

- **Vazamento da camada secreta via backend** (critico): `cloudflare/src/mesa.js` `normalizeSceneToken` estava descartando o campo `layer` ao salvar no D1, e `getMesaScene` nao filtrava tokens `layer:"dm"` para nao-mestres. Corrigido: `layer` agora e preservado na normalizacao, e `getMesaScene(env, actor)` filtra tokens secretos quando `actor.role !== "master"`. **Isso e uma mudanca de backend e ainda NAO foi deployada** (fase frontend-first segue com backend congelado em `aee08e0` at'e confirmacao explicita do Tiago para rodar `wrangler deploy`).
- **Undo (Ctrl+Z) podia apagar traco secreto por acidente**: `js/mesa-drawing.js` agora desfaz so o ultimo traco **da camada ativa** (nunca cruza tokens <-> dm).
- **`seedInitialTokens` nao inicializava `layer`**: agora sempre nasce com `layer:"tokens"` (js/mesa-core.js).
- **`serializeMesaRealtimeToken` nao propagava `tokenScale`**: redimensionar um token agora sincroniza em tempo real entre abas, nao so ao salvar a cena.
- **Camada MAPA exposta para jogador** (gap de especificacao, nao bug do relatorio): botao `#mesaLayerMapBtn` agora comeca `hidden` no HTML e so e revelado para o mestre em `initMesaMap` (mesa-map.js), igual ao botao MESTRE. `setMesaActiveLayer`/`restoreMesaActiveLayer` tambem bloqueiam jogador de entrar na camada `map`.
- Cache-bust: `mesa-stage.js`, `mesa-core.js`, `mesa-map.js`, `mesa-drawing.js` -> `?v=2026-06-30-bugfix-1`; `MESA_BUNDLE_VERSION` -> `2026-06-30-bugfix-1` em `tools/build-pages.cjs`.
- Validacao: `check:js` (41 arquivos OK), `audit:static` OK, `build:pages` OK, `test:mesa` 5/5 verde. Verificado manualmente no preview: mestre ve os 3 botoes de camada, jogador so ve TOKENS (MESTRE e MAPA ficam `hidden`), console limpo nos dois papeis.
- Criado `docs/ROTEIRO_TESTE_MESA.md` com checklist manual cobrindo todas as funcionalidades da Mesa para teste humano.
- ~~**Pendente**~~ — **FECHADO** (ver Atualizacao logo abaixo). Registro original: bugs de severidade media/baixa do relatorio (drift de zoom em drag, handles de resize podem inverter caixa, payload PUT sem limite de tamanho) ficam para uma proxima rodada se o Tiago priorizar.
  - **Atualizacao (Etapas 81-82, 2026-08-16)**: ~~handles de resize podem inverter caixa~~ resolvido nas Etapas 63/71 (coberto por `test:mesa:tokens`, 10/10); ~~payload PUT sem limite de tamanho~~ resolvido — `readJson()` em `cloudflare/src/auth.js` corta em 16 KB com 413; ~~drift de zoom em drag~~ resolvido na Etapa 39 e coberto por dois testes (zoom antes do drag e zoom no meio do drag). **Nada aberto: este relatorio esta fechado.**

## Arquitetura Atual

- Site estatico publicado separadamente da API
- Frontend aponta para a API em:
  - `https://armagedon-api.tiagopsm2008.workers.dev/api`
- Worker usa o banco D1 `armagedon`
- Realtime da Mesa usa Cloudflare Durable Objects com WebSocket nativo
- A ficha e armazenada principalmente em JSON dentro da tabela `characters`
- Nao existe bundler nesta etapa
- `npm run build:pages` gera o artefato estatico `_site/` para o GitHub Pages sem publicar `assets/` inteiro
- Scripts continuam carregados por `<script src="..."></script>`
- A ordem de carregamento dos scripts da ficha e da mesa e parte do contrato atual

## Banco de Dados em Uso

- Banco ativo no site publicado: Cloudflare D1
- Tipo: relacional
- Motor base: SQLite
- Tabelas principais:
  - `users`
  - `characters`
  - `rules_posts`
  - `transfer_audit`

## Regras de Trabalho

- Trabalhar por etapas pequenas e fechadas
- Validar sintaxe e logica ao final de cada etapa
- Informar exatamente quais arquivos foram alterados
- Informar exatamente o que precisa ser enviado ao GitHub
- Nao mudar regras do sistema sem autorizacao explicita
- Usar sempre `C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign-git-sync` como pasta oficial de trabalho
- Tratar `C:\Users\tiago\Desktop\Próxima Campanha\FichaApp\rpg-campaign` como copia antiga/local, nao como fonte para commits
- Manter este arquivo e os demais documentos locais de referencia atualizados em toda mudanca


## Ultima Etapa Concluida (2026-06-19 — Etapa 30: Camada do Mestre (DM) secreta estilo Roll20)

Fase frontend-first (backend congelado em `aee08e0`). Adicionada uma 3a camada "MESTRE" ao seletor de camadas da Mesa (antes so TOKENS/MAPA), inspirada na camada do GM do Roll20: tokens e desenhos colocados nela ficam INVISIVEIS para os jogadores; so o mestre ve. Tudo client-side/localStorage — nenhuma mudanca no worker/D1.

Mudancas principais:
- **Modelo**: token e stroke de desenho ganharam o campo `layer` (`"tokens"` | `"dm"`). Helper `normalizeTokenLayer` em `js/mesa-storage.js`; campo serializado nos 4 pontos de token em `js/mesa-core.js` (mergeTokenWithRoster, serializeMesaRealtimeToken, createMesaScenePayloadFromState, normalizeMesaScenePayload).
- **Tokens secretos** (`js/mesa-stage.js`): `getRenderedTokens` exclui `layer==="dm"` para jogador; token nasce na camada ativa em `addTokenToStage`; novos helpers `isTokenHiddenForMaster`/`getTokenSecretLabel` (DM aparece esmaecido + pill "Mestre" + classe `.is-layer-dm` so para o mestre). Handler `toggle-layer` move o token entre Token<->Mestre.
- **Inspetor** (`js/mesa-inspector.js`): nova linha "Camada" com botao Token/Mestre.
- **Botao + persistencia** (`mesa.html` + `js/mesa-map.js`): 3o `.vtt-layer-btn` `data-layer="dm"` (oculto no HTML, revelado so p/ mestre em `initMesaMap`); `setMesaActiveLayer` agora persiste em `localStorage.mesaActiveLayer` e bloqueia `dm` p/ jogador; `restoreMesaActiveLayer` restaura na init respeitando o papel.
- **Desenhos secretos** (`js/mesa-drawing.js`): stroke marcado com a camada ativa; `renderDrawings` pula `dm` p/ jogador; `_broadcastDrawings` filtra `dm` (NUNCA trafega pela rede); `setDrawingsFromRemote` preserva os tracos `dm` do mestre ao aplicar update remoto (evita que um update apague os secretos); mestre ve traco `dm` com alpha menor.
- **CSS** (`css/mesa.css`): botao DM roxo, tinta roxa no stage na camada DM, contorno tracejado no token secreto.

Validacao: `check:js` 41 OK, `audit:static` OK, `build:pages` OK. Cache-bust dos 7 arquivos alterados -> `2026-06-19-dm-layer-1` + `MESA_BUNDLE_VERSION`. Pendente: verificacao no preview (mestre/jogador) e `test:mesa`.

## Etapa Concluida (2026-06-16 — Etapa 29: limpeza de dead code + auditoria visual dos cards)

Resumo (limpeza): removido codigo morto deixado pela remocao do inspetor do jogador (Etapa 25) e da previa do jogador. Em `js/mesa-inspector.js`: removido o ramo `if (!isMaster())` de `buildInspectorStatsSection` (inalcancavel — `renderInspector` ja oculta o inspetor inteiro p/ nao-mestre) e a funcao `buildPlayerInspectorVital`. Em `cloudflare/src/mesa.js`: removido o campo `previewPlayerView` da normalizacao da cena (feature ja extinta). Varredura confirmou ZERO referencias restantes a `previewPlayerView`/`stageViewBadge`/`buildPlayerInspectorVital` em js/html/css. `check:js` 41 OK, `audit:static` OK, sem regressao no preview (inspetor do mestre segue com 2 cards, atual+max editaveis; `buildPlayerInspectorVital` agora undefined). ATENCAO: a mudanca no worker (`cloudflare/src/mesa.js`) so vale apos `npx wrangler deploy` — e inofensiva ate la (o campo era so um default preservado).

Resumo (validacao completa + manutencao de testes): `check:js` 41 OK, `audit:static` OK, `build:pages` OK. Suite Playwright da Mesa: 3 testes estavam VERMELHOS por assertar o comportamento ANTIGO do painel do jogador (classe `.player-sheet-panel`, `vidaMax/integMax` editaveis, badge de texto "Em cena") — a redesign do painel (etapas 10-25) nunca atualizou os testes. Atualizados para o comportamento atual: `.player-side-panel`, maximo SOMENTE LEITURA (`[data-player-sheet-field]` toHaveCount 0 + leitura `.player-vital-max`), badge virou bolinha (`#rosterCountBadge.is-status-dot` + `.player-stage-dot.is-on`), e seletores de input desambiguados (`input[data-player-stat-field=...]` — os botoes +/- do stepper tambem carregam o atributo). Mesa agora 5/5 verde. Ficha: 27/28; a unica falha (`UX avancada › lore ... recolhidas`, largura 60 vs 70) e PRE-EXISTENTE e alheia a esta sessao (nenhum arquivo de ficha tocado; ultima mudanca em ficha foi commit `4c6db6d`).

Resumo (auditoria dark-mode + layout-integrity dos cards novos — inspetor do mestre): contraste WCAG AA OK em tudo (label 5.26, leitura atual 14.27, "/max" 5.26, divisor 5.26, input atual 13.66, input max 5.04; barra fill-vs-track 8.48 >= 3:1). Foco nos inputs com `border: accent` + glow; input disabled opacity 0.5; botao -/+ disabled opacity 0.3 + not-allowed. Layout integro: max de 3 digitos ("100") cabe sem overflow, stepper nao estoura o card. Unica nota (nao-bug): botoes 30x30px sao ok no desktop mas < 44px ideal p/ toque (so relevante se usar no mobile). Nenhum defeito a corrigir — os cards herdam tokens/padroes do sistema. Cache-bust `mesa-inspector.js` -> `2026-06-16-deadcode-cleanup-1` + `MESA_BUNDLE_VERSION`.

## Etapa Concluida (2026-06-16 — Etapa 28: inspetor do mestre no estilo card do jogador (compacto) com Vida/Integridade editaveis)

Resumo: o inspetor do mestre (`buildInspectorStatsSection` em `js/mesa-inspector.js`) trocou o layout `.stat-editor` (linha `[−][atual][+] / [max]` + label) por CARDS no mesmo visual do painel "Meu Token" do jogador (`.player-vital-card`: label + leitura grande "atual/max" + barra destacada + stepper), porem COMPACTO via `.is-inspector` (paddings/leitura menores) e com o MAXIMO tambem editavel ao lado do stepper (`[−][atual][+] / [max]`, classe `.inspector-vital-stepper.is-master`). Nova funcao `buildMasterInspectorVital`. O mestre edita Vida/Integridade (atual e max) de QUALQUER token, inclusive dos jogadores — `canEditCurrentStats`/`canEditAllStats` ja retornavam true p/ mestre; os `data-stat-field` (currentLife/maxLife/...) foram preservados, entao handlers/clamp/broadcast nao mudaram. `syncInspectorStatInputCard` (`js/mesa-stage.js`) atualizado p/ tambem mirar `.player-vital-card` e a leitura `.player-vital-readout strong` / `.player-vital-max` (alem do antigo `.stat-editor`/`.bar-label-row`). CSS novo em `css/mesa-inspector.css` (`.player-vital-card.is-inspector`, `.inspector-vital-stepper.is-master` em 5 colunas, `.vital-max-input`). Validado no preview (mestre, token de jogador sintetico): 2 cards compactos, input de atual e de max habilitados, stepper − leva 7->6, leitura/barra refletem o valor (6/10, 60%), console limpo. Cache-bust `mesa-inspector.css`/`mesa-stage.js`/`mesa-inspector.js` -> `2026-06-16-master-vital-card-1` + `MESA_BUNDLE_VERSION`.

## Etapa Concluida (2026-06-16 — Etapa 27: remover faixa preta a direita (gutter reservado do html))

Resumo: a "barra preta lateral" persistente (apontada pelo usuario com a tela cheia, canto superior direito) era um GUTTER DE BARRA DE ROLAGEM RESERVADO E VAZIO no `html`. Causa raiz: `reset.css` define `html { scrollbar-gutter: stable }` (global, evita layout shift nas paginas que rolam). Na Mesa isso combina com `overflow: hidden` (do `body.mesa-page` e do `html`) e faz o html RESERVAR ~10px a direita SEM mostrar barra. Diagnostico no navegador REAL do usuario (console): `innerWidth 1357 === documentElement.clientWidth 1357` (ZERO barra de rolagem) mas `sidebarRight 1347` -> vao de 10px; nada ocupava a faixa (`elementFromPoint` = fora do documento) = o fundo atras do mapa aparecendo. As tentativas anteriores (overflow no html, gutter na sidebar, padding) nao mexiam nesse gutter do root. Fix: `html { scrollbar-gutter: auto; overflow: hidden }` em `css/mesa.css` — `auto` anula o `stable` herdado do reset (so na Mesa, pois mesa.css so carrega ali; index/ficha/regras mantem o `stable`). Validado no preview (viewport 1280 forcado): antes `htmlBcrW 994` com `innerWidth 1004` (vao 10px); depois `htmlBcrW === innerWidth === sidebarRight === 1280`, `vaoDireitaPx 0`, console limpo. Cache-bust `css/mesa.css` -> `2026-06-16-gutter-fix-1` + `MESA_BUNDLE_VERSION`.

## Etapa Concluida (2026-06-16 — Etapa 26: centralizar conteudo da sidebar (reverter full-bleed))

Resumo: o full-bleed da Etapa 24 (`.vtt-sidebar-block { padding: 1rem 0 }`) deixava os cards/botao do jogador GRUDADOS na borda direita da janela (descentralizado). Revertido para padding horizontal simetrico `1rem 0.9rem` (`css/mesa.css`), centralizando o conteudo com margem igual nos dois lados. Validado no preview (role forcada player): `getBoundingClientRect` do card e do botao com gapLeft=15.4px / gapRight=14.4px (diferenca de 1px = `border-left` da `.vtt-sidebar`, imperceptivel). Como o painel do jogador nao rola, `scrollbar-gutter: auto` nao reserva nada e as margens ficam identicas; no mestre, com inspetor aberto e rolagem, sobra so a barra fina a direita. Cache-bust `css/mesa.css` -> `2026-06-16-centered-1` + `MESA_BUNDLE_VERSION`. Console limpo.

## Etapa Concluida (2026-06-16 — Etapa 25: remover inspetor duplicado e botao "Focar meu token" do jogador)

Resumo: na visao do jogador, o bloco lateral "INSPETOR / TOKEN SELECIONADO" duplicava as infos do proprio token (ja presentes no painel "Meu Token"). Removido: `renderInspector()` (`js/mesa-inspector.js`) agora oculta o bloco `#vttInspectorBlock` SEMPRE para nao-mestre (antes mostrava ao selecionar o proprio token). Tambem removido o botao "Focar meu token": `renderPlayerTokenSelector()` (`js/mesa-roster.js`) retorna `""` para token unico (o seletor so aparece quando o jogador tem mais de um personagem). Toda a edicao de Vida/Integridade do jogador fica no painel "Meu Token". Obs.: editar Vida/Integridade de Echo na cena via inspetor deixou de existir para o jogador — reavaliar se necessario. Cache-bust `mesa-roster.js`/`mesa-inspector.js` -> `2026-06-16-no-dup-inspector-1` + `MESA_BUNDLE_VERSION`. Validado no preview (role forcada player): `inspectorBlock.hidden===true`, botao focar ausente, painel "Meu Token" intacto, console limpo. (Mestre inalterado.)

## Etapa Concluida (2026-06-16 — Etapa 24: sidebar full-bleed (faixa preta lateral) — mestre + jogador)

Resumo: mesmo com `scrollbar-gutter: auto` (Etapa 23), a sidebar parecia assimetrica em AMBAS as visoes: as abas `.vtt-sidebar-meta` (PAPEL/FICHAS) vao de ponta a ponta, mas `.vtt-sidebar-block` recuava `0.9rem` dos dois lados. Esse recuo, contra a borda DIREITA da janela, aparecia como faixa preta; do lado esquerdo encostava no palco escuro e sumia (recuo igual nos dois lados, mas so um visivel; no mestre o inspetor longo ainda somava a barra de rolagem). Fix GLOBAL: `.vtt-sidebar-block { padding: 1rem 0 }` (`css/mesa.css`) — conteudo full-bleed alinhado com as abas em mestre e jogador; o respiro vem do padding interno dos proprios itens (input de busca, abas, cards, hero). Removida a regra redundante `#vttRosterBlock.is-player-view .vtt-sidebar-block` de `css/mesa-roster.css`. Cache-bust `css/mesa.css` -> `2026-06-16-fullbleed-2` + `MESA_BUNDLE_VERSION`. Validado no preview (visao mestre, 4 blocos): `getComputedStyle(.vtt-sidebar-block).padding{Left,Right} === "0px"`, console limpo.

## Etapa Concluida (2026-06-16 — Etapa 23: remover faixa preta a direita da sidebar)

Resumo: apos a Etapa 22, o `scrollbar-gutter: stable both-edges` reservava a faixa da barra nos DOIS lados mesmo sem rolagem (caso comum no painel do jogador), deixando uma faixa preta visivel na direita. Fix: `scrollbar-gutter: auto` (sem reserva) em `.vtt-sidebar` (`css/mesa.css`). Como o painel raramente transborda, o conteudo fica centralizado e sem faixa; o leve reflow ao surgir a barra e aceitavel. Cache-bust `css/mesa.css` + `MESA_BUNDLE_VERSION` -> `2026-06-16-sidebar-nogutter-1`. Validado no preview: `getComputedStyle(.vtt-sidebar).scrollbarGutter === "auto"`, console limpo.

## Etapa Concluida (2026-06-16 — Etapa 22: centralizar conteudo da sidebar da Mesa)

Resumo: o conteudo da sidebar direita aparecia levemente deslocado para a esquerda. Causa: `.vtt-sidebar` (`css/mesa.css`) usava `scrollbar-gutter: stable`, que reserva o espaco da barra de rolagem so na borda direita (inline-end), empurrando o conteudo para a esquerda mesmo sem barra visivel. Padding do bloco/lista era simetrico — a assimetria vinha so do gutter. (Substituida pela Etapa 23 — `both-edges` introduzia faixa preta na direita.)

## Etapa Concluida (2026-06-16 — Etapa 21: limpeza do CTA do painel do jogador)

Resumo: removido o texto-dica `.player-vitals-hint` acima do botao vermelho e o rotulo do botao trocado de "Abrir minha ficha completa" para "Ficha Completa" (`js/mesa-roster.js`); regra CSS `.player-vitals-hint` removida (`css/mesa-roster.css`). Icone de link mantido. Cache-bust `mesa-roster.js`/`css/mesa-roster.css` + `MESA_BUNDLE_VERSION` -> `2026-06-16-ficha-btn-1`. Validado no preview: dica ausente, botao "Ficha Completa", console limpo.

## Etapa Concluida (2026-06-16 — Etapa 20: stepper de Vida/Integridade no painel do jogador)

Resumo: no painel "Meu Token", o MAXIMO de Vida/Integridade deixou de ser editavel (vira leitura "atual / max" no cabecalho do card) e o ATUAL passou a ter um stepper `[−] [valor] [+]` (com digitacao manual). So frontend; o maximo continua sendo ajustado na ficha completa.

O que mudou:

- **Markup** (`js/mesa-roster.js`, `renderPlayerResourceEditor`): removidos os dois inputs "Atual/Máx"; agora `.player-vital-stepper` com `[−]` + input `data-player-stat-field` + `[+]`. O maximo so aparece como leitura em `.player-vital-readout` (`<strong>atual</strong> / max`). Removido o uso de `data-player-sheet-field` (max) e o param `options`/`editableMaxField`.
- **Handler do stepper** (`js/mesa-roster.js`, IIFE): clique em `[data-player-stat-step]` ajusta o input (clamp por min/max do proprio input) e dispara `change`, que o listener do `rosterList` (`handlePlayerPanelResourceInput`) usa para sincronizar com a ficha + broadcast.
- **Fix de sync ao vivo** (`js/mesa-stage.js`, `syncPlayerStatInputCard`): apontava para `.player-resource-card`/`.bar-label-row` (classes antigas, quebradas desde o redesenho `panel-ux`) — agora atualiza `.player-vital-card` -> `.player-vital-readout strong` + `.bar-preview span`. Leitura e barra atualizam ao vivo ao usar stepper ou digitar.
- **CSS** (`css/mesa-roster.css`): `.player-vital-inputs/.player-vital-field/.player-vital-static` (layout antigo de 2 inputs) trocados por `.player-vital-stepper` (grid `38px 1fr 38px`, reusa `.stat-step-btn`).
- **Cache-busting** (`mesa.html`): `mesa-roster.js`, `mesa-stage.js` e `css/mesa-roster.css` -> `?v=2026-06-16-vital-stepper-1`; `MESA_BUNDLE_VERSION` -> `2026-06-16-vital-stepper-1`.

Validacao: `check:js` (41 OK), `audit:static` (OK), `build:pages` (OK). Browser (preview :8000): max nao editavel (leitura "/ 14"), stepper `−`/`+` funciona (14->13->...; clamp no max ao spammar; manual `7` aceito), leitura grande e barra atualizam ao vivo (vermelho em 1/14 -> verde em 14/14). Inspetor do mestre inalterado (ainda edita max). Console limpo.

## Etapa Concluida (2026-06-16 — Etapa 19: limpeza do cabecalho/hero do painel do jogador)

Resumo: cabecalho e hero do painel "Meu Token" reorganizados para reduzir aparencia generica e melhorar legibilidade (skills `03-page-architecture` + `02-dark-mode-design-expert`). Vida/Integridade ficam para depois (envolvem banco). So frontend.

O que mudou:

- **Status como bolinha** (`js/mesa-roster.js`): a badge de texto "Fora da cena"/"Em cena" (`#rosterCountBadge`) na visao do jogador virou so uma bolinha (`.player-stage-dot` — `.is-on` verde no palco, `.is-off` apagada). `renderRoster` alterna `is-status-dot` (jogador) e remove no mestre; o mestre mantem a contagem "X/Y para colocar".
- **Cabecalho legivel** (`css/mesa-roster.css`): `#vttRosterBlock.is-player-view` usa fonte UI (Cinzel) no titulo, "Ficha rapida" em cima + "Meu personagem" embaixo em UMA linha (verificado: `titleLines: 1`). Espaco liberado pela bolinha.
- **Hero enxuto**: removida a badge azul "Jogador" do hero (papel ja aparece no chip "Papel" do topo) e a pilula de status (redundante com a bolinha). Foto 80->96px; nome em `--fs-xl` centralizado verticalmente ao lado da foto (`.player-sheet-copy { justify-content:center }`).
- **Cache-busting** (`mesa.html`): `mesa-roster.js` e `css/mesa-roster.css` -> `?v=2026-06-16-panel-header-1`; `MESA_BUNDLE_VERSION` -> `2026-06-16-panel-header-1`.

Validacao: `check:js` (41 OK), `audit:static` (OK), `build:pages` (OK). Browser (preview :8000): badge so com bolinha verde (token em cena), badge "Jogador" e pilula removidas, avatar 96px, nome 24px Cinzel, titulo em 1 linha; mestre mantem contagem de texto (sem regressao). Console limpo.

## Etapa Concluida (2026-06-16 — Etapa 18: botao de tela cheia compacto no topo do palco)

Resumo: o botao "Tela cheia" saiu do overlay inferior direito e virou um botao compacto so com icone (quadrado com setas) no overlay superior esquerdo, onde antes ficava o badge de visao removido. So frontend.

O que mudou:

- `mesa.html`: `#fullscreenMesaBtn` movido para dentro de `.vtt-overlay-tl` como botao so-icone (`.vtt-fullscreen-btn` + SVG de expandir). Removido do `.vtt-overlay-br`.
- `js/mesa-roster.js` (`renderControls`): nao escreve mais `textContent` no botao (apagaria o SVG); agora seta `title`/`aria-label` e alterna a classe `is-active`. Handler de clique (`toggleMesaFullscreen`) inalterado.
- `css/mesa.css`: `.vtt-overlay-tl` ficou "bare" (sem fundo/borda/padding, ja que `#stageHintBadge/#sceneStateTitle/#sceneStateCopy` sao `display:none`) e novo `.vtt-fullscreen-btn` (quadrado 32px estilo HUD, hover/active accent).
- Follow-up: `renderControls` (`js/mesa-roster.js`) passou a esconder o `.vtt-overlay-br` quando nenhum botao dele esta visivel (Travar movimento / Limpar cena sao so do mestre). Para o jogador o overlay inferior direito sumia o conteudo mas deixava uma "casca" vazia embaixo do mapa — agora o container some.
- **Cache-busting** (`mesa.html`): `css/mesa.css` -> `?v=2026-06-16-fullscreen-btn-1`; `mesa-roster.js` -> `?v=2026-06-16-overlay-br-1`; `MESA_BUNDLE_VERSION` -> `2026-06-16-overlay-br-1`.

Validacao: `check:js` (41 OK), `audit:static` (OK), `build:pages` (bundle com `.vtt-fullscreen-btn`, sem botao de texto "Tela cheia"). Browser (preview :8000): botao so-icone 30x30 no topo-esquerdo, removido do canto inferior direito, overlay-tl sem fundo/borda, handler presente. Console limpo.

## Etapa Concluida (2026-06-16 — Etapa 17: redesenho do inspetor lateral do jogador)

Resumo: o inspetor "Token selecionado" do JOGADOR foi alinhado ao painel "Meu Token" (mesmo visual de vitais) e enxugado. Inspetor do mestre inalterado. So frontend.

O que mudou (`js/mesa-inspector.js`):

- **Vitais consistentes**: para o jogador, `buildInspectorStatsSection` agora usa `.player-vital-card` (novo helper `buildPlayerInspectorVital`) — leitura grande do atual, barra destacada e stepper `−/valor/+` (`.inspector-vital-stepper`). Mantem `data-stat-field` + `.stat-step-btn`, entao os handlers/sync existentes (`handleInspectorStatInput`) seguem funcionando. O maximo aparece so como leitura (ajuste fica na ficha/painel).
- **Enxugado**: removida a linha "Pertence a ..." do hero (so mestre ve) e a secao "Acoes" inteira para o jogador (so mostrava o chip "Permissao", puro ruido). Visibilidade/Status/Palco continuam exclusivos do mestre.
- **CSS** (`css/mesa-inspector.css`): novo `.inspector-vital-stepper` (reusa `.stat-step-btn` e `.player-vital-card` de `css/mesa-roster.css`). Componentes do inspetor do mestre intactos.
- **Cache-busting** (`mesa.html`): `mesa-inspector.js` e `css/mesa-inspector.css` -> `?v=2026-06-16-inspector-ux-1`; `MESA_BUNDLE_VERSION` -> `2026-06-16-inspector-ux-1`.

Validacao: `check:js` (41 OK), `audit:static` (OK), `build:pages` (bundle com `.inspector-vital-stepper` + `buildPlayerInspectorVital`). Browser (preview :8000): jogador ve vital-cards + stepper (clicar `+` foi 14->15), sem linha de dono, sem secao Acoes; mestre mantem controls + editor antigo + linha de dono (sem regressao). Console limpo.

## Etapa Concluida (2026-06-16 — Etapa 16: remocao do badge "Visao do mestre/jogador" do topo do palco)

Resumo: removido o `#stageViewBadge` (badge no overlay superior esquerdo do palco que mostrava "Visao do mestre"/"Visao do jogador"). Era resquicio da extinta "Previa do jogador" e nao agregava. So frontend.

O que mudou:

- `mesa.html`: removido o `<span id="stageViewBadge">`. O `#stageHintBadge` ("Arraste os tokens...") foi mantido.
- `js/mesa-core.js`: removido o DOM ref `stageViewBadge`.
- `js/mesa-roster.js`: removido o bloco de `renderControls` que setava o texto do badge.
- `css/mesa.css`: corrigido comentario obsoleto de `.panel-badge` (nao referencia mais o stageViewBadge).
- **Cache-busting** (`mesa.html`): `mesa-core/mesa-roster.js` e `css/mesa.css` -> `?v=2026-06-16-hud-cleanup-1`; `MESA_BUNDLE_VERSION` (`tools/build-pages.cjs`) -> `2026-06-16-hud-cleanup-1`.

Validacao: `check:js` (41 OK), `audit:static` (OK), `build:pages` (sem `stageViewBadge` no bundle). Browser (preview :8000): elemento ausente, `renderControls` sem erro, hint badge preservado, console limpo.

## Etapa Concluida (2026-06-16 — Etapa 15: redesenho visual do painel lateral do jogador)

Resumo: melhoria de hierarquia, organizacao e usabilidade do painel "Meu Token" do jogador na Mesa (skills `03-page-architecture` + `02-dark-mode-design-expert`). So frontend.

O que mudou:

- **Vitais** (`js/mesa-roster.js` `renderPlayerResourceEditor` -> `.player-vital-card`): cards Vida/Integridade agora empilhados (1 coluna, full width), com borda esquerda colorida por tipo, cabecalho `label + leitura grande do atual`, barra `.bar-preview` destacada (7px) e dois campos rotulados "Atual"/"Máx" centrados. Atributos de sync preservados (`data-player-stat-field`, `data-player-sheet-field`, `data-character-key`).
- **Hero/status** (`renderPlayerSheetPanel`): a frase de status virou pilula `.player-stage-status` com dot (verde no palco, mudo fora); hero em flex-column com gaps consistentes e nome em `--fw-bold`.
- **Organizacao**: titulos de secao (`.player-side-title`) ganham regua `::after`; dica de uso `.player-vitals-hint`; botao "Abrir minha ficha completa" com icone de link.
- **CSS** (`css/mesa-roster.css`): novas classes player-scoped; componentes compartilhados do inspetor (`.bar-preview/.bar-label/.token-type-badge`) NAO foram alterados (apenas override de altura da barra dentro de `.player-vital-card`).
- **Cache-busting** (`mesa.html`): `mesa-roster.js` e `css/mesa-roster.css` -> `?v=2026-06-16-panel-ux-1`; `MESA_BUNDLE_VERSION` (`tools/build-pages.cjs`) -> `2026-06-16-panel-ux-1`.

Validacao: `npm run check:js` (41 OK), `audit:static` (OK), `build:pages` (bundle com `.player-vital-card`). Browser (preview :8000, papel forcado player): markup e computed styles confirmados (vitais 1-col, borda verde Vida 3px, leitura 20px, inputs 2-col centrados, barra 7px, dot verde no palco). Sem erros no console.

## Etapa Concluida (2026-06-16 — Etapa 14: remocao da "Previa do jogador" + fix de papel forcado em localhost)

Resumo: removida por completo a funcionalidade de simular a visao do jogador a partir do mestre (toggle "Previa jogador" + badge dinamico) E corrigido um bug em que QUALQUER conta logada em localhost/127.0.0.1/file: virava mestre na Mesa. O mestre sempre tem a propria visao; o jogador tem a dele. So frontend — sem deploy do Worker.

**Bug do papel forcado (critico):** `resolveInitialRole` (`js/mesa-core.js`) tinha `if (isLocalMesaPreview()) return "master";`, que ignorava o papel real da sessao em ambiente local. Um jogador logado (ex.: conta "A") aparecia como mestre na versao local (Live Server :5500), com escalacao e edicao de todos os tokens. Corrigido: removida essa linha — agora respeita sempre `session.role`. A conveniencia de preview do mestre sem login em localhost segue funcionando porque `resolveMesaSession()` ja devolve uma sessao sintetica `{role:"master"}` quando NAO ha login; e o override explicito de dev `localStorage.mesaRolePreview = "master"|"player"` continua valido. Tambem removida a chip estatica "Modo: Jogador" (hardcoded, sempre dizia "Jogador") e ligada a chip "Papel" (`roleBadge2`) ao papel real em `renderSummary`/`preFillMesaPage`.

O que mudou:

- **UI** (`mesa.html`): removido o `<label id="playerPreviewRow">` com o checkbox `#playerPreviewToggle` (overlay inferior direito). O `#stageViewBadge` continua, agora como rotulo estatico ("Visao do mestre"/"Visao do jogador").
- **Estado/sync** (`js/mesa-core.js`): removido o campo `state.previewPlayerView`, os DOM refs `previewRow`/`previewToggle`, o listener do toggle, o ajuste em `preFillMesaPage`, e o campo `previewPlayerView` dos payloads de cena (`createMesaScenePayloadFromState`, `normalizeMesaScenePayload`, `broadcastMesaSceneClear`, `applyMesaSceneClearDelta`, `loadScene`).
- **Render** (`js/mesa-stage.js`): `hiddenForMaster` agora e `isMaster() && !token.visibleToPlayers`; `getRenderedTokens` devolve todos os tokens para o mestre; `isPlayerPerspective()` passou a ser `!isMaster()`; removido o reset de preview em `resetPrototype`.
- **Painel/controles** (`js/mesa-roster.js`): `renderControls` simplificou o badge para rotulo estatico; `renderRoster` voltou a decidir a visao do jogador so por `!isMaster()` (sem o ramo "mestre em previa").
- **Inspetor** (`js/mesa-inspector.js`): removida a copy "Na previa do jogador..." (era inalcancavel sem preview); fica so a mensagem do jogador.
- **CSS** (`css/mesa.css`): removidas as regras orfas de `.toggle-row-inline` (so o toggle de preview as usava).
- **Backend**: `cloudflare/src/mesa.js` ainda normaliza `previewPlayerView` (default `false`), inofensivo e retrocompativel — o frontend nao envia mais o campo; nao precisa de deploy.
- **Cache-busting** (`mesa.html`): `mesa-stage/mesa-inspector.js` e `css/mesa.css` -> `?v=2026-06-16-no-preview-1`; `mesa-core/mesa-roster.js` -> `?v=2026-06-16-role-fix-1` (fix do papel). `MESA_BUNDLE_VERSION` (`tools/build-pages.cjs`) -> `2026-06-16-role-fix-1`.

Validacao:

- `npm run check:js` (41 OK), `npm run audit:static` (OK), `npm run build:pages` (bundle sem nenhuma referencia a `previewPlayerView`/`playerPreviewToggle`).
- Browser (preview :8000): toggle e row removidos do DOM; `state` sem `previewPlayerView`; badge "Visao do mestre"; `getRenderedTokens` devolve todos os tokens para o mestre; jogador continua vendo so "Meu Token" (sem escalacao/tabs/Colocar). Sem erros no console.

## Etapa Concluida (2026-06-16 — Etapa 13: painel lateral do jogador na Mesa — Meu Token + Meus Echos)

Resumo: redesenho do painel lateral do jogador na Mesa em duas secoes ("Meu Token" e "Meus Echos") e nova capacidade de o jogador invocar/retirar o PROPRIO Echo da cena sem depender do mestre. Inclui mudanca no Durable Object (precisa de deploy do Worker).

O que mudou:

- **Painel do jogador** (`js/mesa-roster.js`): `renderPlayerSheetPanel` agora monta `.player-side-panel` com a secao "Meu Token" (hero + Vida/Integridade atuais editaveis + "Abrir minha ficha completa") e a secao "Meus Echos" (so renderiza se houver Echos). Novos helpers `renderPlayerEchosSection`/`renderPlayerEchoCard` (avatar + nome + rank + botao "Invocar"; quando na cena, chip "Na cena" + "Remover"). O link antigo "Meus Echos -> echos.html" saiu (a navegacao para a pagina de Echos fica no menu).
- **Helpers de cena** (`js/mesa-core.js`): `getPlayerOwnEchos()` (devolve `mesaEchos`, ja escopado por usuario no backend) e `isEchoOnStage(echoId)`. Novos broadcasters `broadcastEchoTokenUpsert`/`broadcastEchoTokenRemove` (mestre usa o canal padrao; jogador retransmite o proprio Echo com `ownerKey`). O mestre persiste a cena ao receber um delta de Echo vindo de jogador (`applyMesaRealtimeDelta`).
- **Acoes do painel** (`js/mesa-stage.js`): `handlePlayerEchoAction` + `summonOwnEchoToStage` (coloca no centro) + `removeOwnEchoFromStage`, ligados ao listener do roster.
- **Inspetor condicional** (`js/mesa-inspector.js`): para o jogador, o bloco `#vttInspectorBlock` so aparece quando o token selecionado e seu (proprio token ou Echo); caso contrario some. Removido o `renderRestrictedPlayerInspector` (placeholder agora sem uso).
- **Durable Object** (`cloudflare/src/mesa-realtime.js`): `mesa:token:upsert`/`mesa:token:remove` continuam master-only, com nova excecao `canPlayerRelayEchoToken` — jogador retransmite o proprio Echo (`echo:<id>`, `ownerKey == username`), espelhando `mesa:echo:vitals`. **Exige `wrangler deploy`** para a invocacao funcionar em producao.
- **CSS** (`css/mesa-roster.css`): `.player-side-panel/.player-side-section/.player-side-title/.player-echo-card/.echo-on-stage-badge` + ajuste responsivo (<=480px: acoes do card em segunda linha).
- **Correcao (echo-panel-2)**: a escalacao continuava vazando na VISAO DO JOGADOR por dois motivos. (1) As tabs de filtro (Todos/Jogadores/NPCs/Monstros) ficavam fora de `#rosterList`, entao apareciam mesmo com o painel "Meu Token" no lugar da lista. (2) A "Previa do jogador" do mestre so trocava o canvas — o painel lateral ignorava `state.previewPlayerView` e seguia mostrando a escalacao. Agora `renderRoster` (`js/mesa-roster.js`) usa `playerView = !isMaster() || previewPlayerView`: nesse caso oculta `.vtt-roster-tabs` + busca e, para o mestre em previa (que nao tem token proprio), mostra um aviso "Visao do jogador" no lugar do painel; o jogador real continua vendo "Meu Token"/"Meus Echos". O toggle da previa (`js/mesa-core.js`) passou a incluir `roster: true` no `scheduleMesaRender` para a troca refletir na hora. Validado no browser (preview :8000): mestre-normal mostra escalacao; mestre-previa e jogador-real ocultam tudo.
- **Cache-busting** (`mesa.html`): `mesa-stage/mesa-inspector.js` -> `?v=2026-06-16-echo-panel-1`; `mesa-roster.js` e `mesa-core.js` -> `?v=2026-06-16-echo-panel-2` (fix da escalacao na visao do jogador). `MESA_BUNDLE_VERSION` (`tools/build-pages.cjs`) -> `2026-06-16-echo-panel-2`.

Validacao:

- `npm run check:js` (41 files OK), `npm run audit:static` (OK), `node --check cloudflare/src/mesa-realtime.js` (OK).
- `node test-worker.mjs`: 60/60 (novo grupo [12] cobre `canPlayerRelayEchoToken`).
- `npx wrangler deploy --dry-run`: build OK (31 KiB gzip).
- Browser (preview :8000, papel forcado `player`): painel "Meu Token" renderiza sem erros; inspetor some ao selecionar token alheio e reaparece no proprio; `renderPlayerEchoCard` gera o markup correto (botao "Invocar"). Sem backend a secao "Meus Echos" fica oculta (esperado).

Pendencias/riscos abertos (HISTORICO — fechados; conferido em 2026-08-16):

- **Deploy do Worker pendente**: a invocacao de Echo pelo jogador so funciona em producao apos `npx wrangler deploy --config cloudflare/wrangler.toml` (a regra do DO e nova). Ate la, o frontend ja esta pronto mas o relay sera rejeitado.
- Echos so aparecem para o mestre e para o dono — outros jogadores nao tem o Echo no proprio roster, entao o token e descartado na cena deles (limitacao pre-existente do modelo de roster por usuario; fora do escopo desta etapa).

## Etapa Concluida (2026-06-14 — Etapa 12: polimento de carga inicial)

Resumo: dois ajustes leves de performance de primeiro carregamento, sem mudanca de comportamento.

- `logo-rpg-armagedon.png` (fallback do `<picture>` da home, usado so se o `.jpg`/`.webp` falham): recomprimido de 1024x1024/124 KB para 512x512/34 KB (-72%) via sharp. `?v=` bumpado para `2026-06-14-opt-2` em todos os HTML que o referenciam (index, ficha, mesa, regras, sugestoes).
- `index.html`: removido o `<link rel="prefetch" href="sugestoes.html">` — pagina pouco acessada que disputava banda no carregamento da home. Mantidos os prefetch de `regras.html` e `ficha.html` (paginas quentes).

Validacao: `npm run audit:static` e `npm run build` verdes; `_site/logo-rpg-armagedon.png` confirmado em 34 KB.

## Etapa anterior (2026-06-13 — Etapa 11: minificacao no deploy + correcao do bundle)

Resumo: maior ganho de performance de carregamento da sessao. O deploy servia JS/CSS NAO-minificados porque o workflow rodava `npm run build:pages` (so bundle). Agora roda `npm run build` (bundle + terser + clean-css).

Causa-raiz corrigida antes de ativar:

- `mesa-renderer-worker.js` estava no `mesaJsFiles` do bundle, mas e carregado em runtime via `new Worker("js/mesa-renderer-worker.js")` (thread separada) — nem aparece como `<script>` no `mesa.html`. Isso inflava o bundle e colidia `function clamp` com `mesa-storage.js`, gerando `SyntaxError: Identifier 'clamp' has already been declared` quando o terser minificava → minificacao quebrava. Removido do bundle (`build-pages.cjs`); o worker segue copiado standalone em `_site/js/` para o `new Worker`.

Mudancas:

- `tools/build-pages.cjs`: `mesa-renderer-worker.js` fora do `mesaJsFiles`.
- `.github/workflows/pages.yml`: adiciona `setup-node@v4` (node 24, cache npm) + `npm ci --ignore-scripts` (pula postinstall pesado de sharp/playwright, nao usados no build) e troca `build:pages` por `build`.

Ganho medido (gzip — o que trafega):

- mesa JS: 83 KB → 52 KB (−37%)
- ficha JS: 55 KB → 41 KB (−25%)
- mesa CSS: 22 KB → 14 KB (−36%)
- ficha CSS: 9 KB → 6 KB (−33%)
- Pagina da Mesa (JS+CSS): ~105 KB → ~66 KB

Validacao (artefato `_site` minificado servido em :8001 e exercitado no browser):

- Mesa: bundle carrega, funcoes globais preservadas (mangle nao toca top-level), Web Worker minificado ATIVO (`mode: canvas-worker`, `workerReady: true`, canvas transferido), zero erros de console.
- Ficha: `onclick` globais funcionam (abrir editor de item, seletor de tipo clicavel — fix de z-index sobreviveu), zero erros.
- `npm ci --ignore-scripts` simulado em tmpdir: terser + clean-css carregaveis (exit 0).
- `audit:static`, `check:js`, `test-worker` 53/53, Playwright 33/33, `node --check` nos dois bundles minificados — tudo verde.
- `.claude/launch.json`: adicionada config `armagedon-dist` (serve `_site` em :8001) para validar o artefato de producao localmente.

Observacao: esta etapa muda o pipeline de CI. Se o deploy do Pages falhar, o site NAO republica (o que esta no ar continua), e o erro aparece em Actions — basta reverter o `pages.yml` para `npm run build:pages`.

## Etapa Concluida (2026-06-13 — Etapa 10: login semantico e varredura de performance)

Resumo: melhorias opcionais da revisao + varredura adicional de performance/qualidade com evidencia.

O que mudou:

- Login agora e um `<form id="loginForm">` real (`index.html`): campos com `name`, botao `type="submit"`, submit tratado no `auth.js`. Elimina o aviso do Chrome ("Password field is not contained in a form") e faz os gerenciadores de senha/autofill funcionarem. Enter no usuario ainda avanca para a senha; Enter na senha submete. Validado ao vivo no preview (submit dispara `handleLogin`, sem erro de JS).
- Limpeza coerente com a remocao do `data/`: regra orfa `/data/*` removida do `_headers` e `data` tirado de `publishedRoots` no `audit-static.cjs`.

Varredura de performance (sem acao necessaria — ja otimizado):

- Glow do cursor (`auth/regras/sugestoes.js`): ja usa `requestAnimationFrame` com cancelamento.
- Drag de tokens (`mesa-stage.js`): `scheduleDragPosition` ja deduplica via guard de rAF; o listener `mousemove` redundante (par do `pointermove`) NAO causa render duplo — so duas atribuicoes por evento. Mantido por compatibilidade (navegadores sem Pointer Events); registrado como debito tecnico opcional, nao gargalo.
- `console.log`/`console.debug` de debug no frontend: zero (os 38 `console.*` sao `.warn`/`.error` de tratamento de erro).

Arquivos alterados: `index.html`, `js/auth.js`, `_headers`, `tools/audit-static.cjs`, `tools/build-pages.cjs` (bump bundles → 2026-06-13-revisao-2), `js/auth.js?v=` → 2026-06-13-login-form-1 nas 5 paginas, este arquivo.

Validacoes: `audit:static`, `check:js` (36), `build:pages`, `test-worker` 53/53, Playwright 33/33 — tudo verde.

Debito tecnico opcional (anotado, nao bloqueia): caminho de drag por `mouse*` em `mesa-core.js`/`mesa-stage.js` e redundante ao `pointer*` em navegadores modernos; pode ser removido se o suporte a navegadores sem Pointer Events for descartado.

## Etapa Concluida (2026-06-12 — Etapa 9: revisao tecnica — correcoes, performance e limpeza)

Resumo: execucao do plano de correcao da revisao tecnica completa. Quatro frentes: defeitos (cache-busting, regra de farm), performance (diretorio sem base64, login sem PBKDF2 extra, fontes), limpeza (server/ legado e videos fora do repo) e consistencia (normalizacao Mesa = Ficha).

O que mudou:

- Cache-busting: todos os `<link>` CSS locais das 5 paginas ganharam `?v=` (tokens, reset, index, regras, mesa-drawing; components em sugestoes). `tools/audit-static.cjs` agora FALHA se qualquer referencia local a `css/`/`js/` estiver sem `?v=`.
- Regra de gameplay (autorizada pelo mestre em 2026-06-12): removido o multiplicador de anti-farm por contagem diaria (`weakKillsToday`) do calculo de XP. A unica modulacao por nivel da criatura e a diferenca de rank (2^diff). Campo legado segue aceito em fichas salvas, sem efeito. Aplicado em `cloudflare/src/soul-progression.js` e `js/soul-essence.js`; previa da UI em `js/ficha-soul.js` sem a linha "Anti-farm".
- Diretorio: `GET /api/directory` nunca trafega avatar base64 (`data:` vira `""`). Nova rota master-only `POST /api/maintenance/migrate-avatars` migra avatares base64 do D1 para R2 e troca pelo URL publico (idempotente). PENDENTE: executar a migracao uma vez em producao apos o deploy.
- Login: `ensureMasterUser` so roda quando o username do login e o do mestre — logins de jogador deixam de pagar um PBKDF2 extra por request.
- Fontes: removido o peso 900 de Cinzel Decorative (nenhum uso no CSS/JS) das 5 paginas; `css/mesa.css` trocou `font-weight: 800` (peso nao carregado) por `700`.
- Limpeza: pasta `server/` (Express/PostgreSQL legado) e `render.yaml` removidos do repo; dois videos `.mp4` (~27 MB) sairam do versionamento (`git rm --cached` + `*.mp4` no `.gitignore`, arquivos continuam no disco).
- Consistencia Mesa/Ficha: `cloudflare/src/mesa-realtime.js` alinhado a `sheet.js` — campo vazio permanece vazio (nao vira "0") e atributo minimo e 0 (nao 1) nos patches da Mesa.
- Testes: `test-worker.mjs` ganhou grupos que importam `sheet.js` e `soul-progression.js` REAIS (contrato de semantica vazio/zero e da regra de XP por diferenca de rank) — 53/53 passando.
- Decisao registrada em `SYSTEM_RULES.md`: jogador aplicar essencia na propria ficha sem aprovacao previa e por design (confianca + notificacao ao mestre).
- Suites Playwright atualizadas (liam o `server/` removido) e migradas para o Worker/D1: `tests/ficha.spec.cjs` (28/28) e `tests/mesa.spec.cjs` (5/5) verdes. Specs do painel da Mesa ajustadas ao painel simplificado de 2026-06-06 (so Vida/Integridade, sem atributos/itens/memorias).
- 4 regressoes visuais REAIS encontradas e corrigidas via QA (eram causa das falhas dos testes, nao testes desatualizados):
  1. Seletor de tipo de item (`.ui-modal-root`) abria ATRAS do editor de item (mesmo z-index + ordem do DOM) e ficava inclicavel → novo token `--z-modal-top: 1100` em `tokens.css`, aplicado a `.ui-modal-root` em `components.css`.
  2. Linha de transferencia do editor de item estourava a largura do dialogo → `.item-transfer-row` virou grid (picker+qtd) com botao "Enviar" em linha cheia (`ficha.css`).
  3. Cartao de Lore/Anotacoes nao recolhia de fato e o botao Minimizar/Expandir mudava de largura → regras `.notes-collapsible.is-collapsed`, cabecalho com `.notes-card-heading` e `min-width` fixo no `.notes-toggle-btn` (`ficha.css` + `ficha.html`).
  4. Nucleo da alma caia numa coluna lateral estreita de 300px → `.identity-block` virou coluna unica e a progressao ocupa largura cheia (`ficha.css`).
- QA mobile 360px confirmado via medicao de layout: painel "Meu personagem" 100% dentro do card (sem filhos vazando), home sem overflow horizontal, label "Jogador" sem quebra.

Arquivos principais alterados:

- `index.html`, `ficha.html`, `mesa.html`, `regras.html`, `sugestoes.html` (cache-busting + fontes)
- `tools/audit-static.cjs` (guarda de `?v=`), `tools/build-pages.cjs` (bump dos bundles)
- `cloudflare/src/soul-progression.js`, `js/soul-essence.js`, `js/ficha-soul.js` (regra de farm)
- `cloudflare/src/index.js` (rota migrate-avatars + bootstrap condicionado), `cloudflare/src/characters.js` (diretorio sem base64)
- `cloudflare/src/mesa-realtime.js` (normalizacao alinhada), `test-worker.mjs` (testes de contrato)
- `css/tokens.css` (token z-modal-top), `css/components.css` (z-index do seletor generico), `css/ficha.css` (transfer-row, lore collapse, identity-block), `css/mesa.css` (font-weight 700)
- `tests/ficha.spec.cjs`, `tests/mesa.spec.cjs` (migrados para Worker/D1 e painel simplificado)
- Docs: `README.md`, `DEPLOY_FREE.md`, `SYSTEM_RULES.md`, `cloudflare/README.md`, este arquivo
- Removidos: `server/` (29 arquivos), `render.yaml`, `.server-*.log`; destracked: 2 `.mp4`

Validacoes executadas:

- `node tools/check-js.cjs` OK (36 arquivos)
- `node tools/audit-static.cjs` OK (incluindo a nova guarda de `?v=`)
- `node test-worker.mjs` 53/53
- `npx playwright test tests/ficha.spec.cjs` 28/28 ; `tests/mesa.spec.cjs` 5/5
- `npx wrangler deploy --dry-run` OK (bindings preservados)
- QA mobile 360px (home + painel "Meu personagem") sem overflow

Pendencias abertas (HISTORICO — fechadas; conferido em 2026-08-16):

- Deploy do Worker + rodar `POST /api/maintenance/migrate-avatars` uma vez (mestre autenticado) — unico passo manual de producao
- `npm run test:mesa:online` com credenciais reais (smoke contra o site publicado)

## Etapa Concluida (2026-06-12 — Etapa 8: aceite de transferencia jogador->jogador)

### O que mudou
- `cloudflare/d1/schema.sql`: nova tabela `transfer_proposals` (status pending/accepted/rejected/cancelled, payload com snapshot do item/memoria, indices parciais por origem/destino pendente). Migracao remota necessaria antes do deploy.
- `cloudflare/src/characters.js`: `createTransferProposal` (snapshot + merge key, item fica na origem; limite de 10 pendentes por origem), `listTransferProposals` (incoming/outgoing; mestre ve todas), `acceptTransferProposal` (revalida item por merge key/quantidade e mochila do destino; origem sem o item => proposta cancelada + 409; efetiva fichas + `transfer_audit` com `proposalId` + resolucao no mesmo `DB.batch`), `declineTransferProposal` (reject pelo destino, cancel por quem enviou), `getCharacterById`. Rotas diretas jogador->jogador agora respondem 403 para jogador (somente mestre).
- `cloudflare/src/index.js`: rotas `POST/GET /api/transfers/proposals` e `POST /api/transfers/proposals/:id/(accept|reject|cancel)`; na criacao, sessao master efetiva direto (`direct: true`).
- `js/api.js`: wrappers `createTransferProposal`, `listTransferProposals`, `accept/reject/cancelTransferProposal`.
- `js/ficha-core.js`: painel "Propostas de transferencia" (`refreshTransferProposals`, render + acoes Aceitar/Recusar/Cancelar com confirmacao; aceite recarrega a ficha aberta); chamado em `loadSheet`.
- `js/ficha-inventory.js` / `js/ficha-memories.js`: envio de jogador para jogador em modo backend cria proposta (item/memoria permanece na origem) e mostra status; mestre segue fluxo direto.
- `ficha.html`: secao `#transferProposalsSection` no topo da ficha; `css/ficha.css`: estilos `.transfer-proposal-*`.
- Cache-bust: `api.js` para `?v=2026-06-12-transfer-accept-1` em todas as paginas; `ficha-core/ficha-inventory/ficha-memories/ficha.css` idem em `ficha.html`.

### Validacoes
- Protocolo testado local (wrangler dev + D1 local, 24 casos, todos OK): rotas diretas bloqueadas para jogador; criacao/listagem incoming/outgoing; terceiros e remetente nao aceitam; aceite move item/memoria e grava auditoria com `proposalId`; revalidacao cancela proposta com origem vazia (409); recusa e cancelamento; mestre efetiva direto.
- npm run check:js (36 arquivos) / audit:static: OK; wrangler deploy --dry-run: OK; test:ficha 24/28 (mesmas 4 falhas pre-existentes de layout/editor de item, sem regressao).

### Pendencias (HISTORICO — fechadas; conferido em 2026-08-16)
- Aplicar `schema.sql` no D1 remoto antes do deploy do Worker (tabela `transfer_proposals`).

## Etapa Concluida (2026-06-11 — Etapa 7: jogador move o proprio token + trava do mestre)

### O que mudou
- `cloudflare/src/mesa-realtime.js`: novo tipo `mesa:move:lock` (master-only) — alterna a trava global de movimento, persistida no storage do DO e anunciada a todos; `mesa:ready` agora inclui `playersMoveLocked`. `mesa:token:move` de jogador passa a ser retransmitido quando a trava esta aberta e o `characterKey` declarado e o do proprio jogador.
- `js/mesa-core.js`: `state.playersMoveLocked`; listeners de `mesa:ready`/`mesa:move:lock` (jogador ve toast quando o mestre trava/libera); `broadcastMesaTokenMove` envia movimento do proprio token do jogador (com `characterKey`); `applyMesaTokenMoveDelta` descarta deltas de jogador para tokens que nao sao dele (anti-forja — o DO nao conhece a posse, os clientes conhecem); `toggleMesaMoveLock()`.
- `js/mesa-stage.js`: `canMoveTokens(token)` — mestre move tudo; jogador move apenas o proprio token e somente com a trava aberta.
- `js/mesa-roster.js`: botao `#moveLockBtn` (so mestre, so online) com label "Travar/Liberar movimento"; hint do palco reflete o estado para o jogador.
- `mesa.html`: novo botao no overlay de acoes; cache-bust `mesa-core/mesa-stage/mesa-roster` para `?v=2026-06-11-player-move-1`.

### Validacoes
- Protocolo testado local (wrangler dev, 11 casos): movimento proprio ok + mestre recebe; token de outro recusado; jogador nao trava; trava bloqueia e libera; novo socket recebe estado da trava; mestre move qualquer token
- npm run check:js / audit:static: OK; test:mesa 3/5 (mesmas 2 falhas pre-existentes documentadas, sem regressao)

## Ultima Etapa Concluida (2026-06-11 — Etapa 6: notificacao de progressao da alma ao mestre)

### O que mudou
- `cloudflare/d1/schema.sql`: nova tabela `soul_audit` (event_type `essence-award`/`nightmare-complete`, ator, ficha alvo, payload com resumo). Migracao remota necessaria antes do deploy.
- `cloudflare/src/characters.js`: `awardSoulExperienceToCharacter` e `completeSoulNightmareForCharacter` gravam auditoria em `soul_audit` (sempre, inclusive quando o ator e o mestre).
- `cloudflare/src/index.js`: quando o ator e jogador, as rotas de soul-essence/soul-nightmare disparam `soul:awarded`/`soul:nightmare` via Durable Object; ambas tambem disparam `sheet:changed` (ficha aberta do mestre atualiza sozinha).
- `cloudflare/src/mesa-realtime.js`: novo `broadcastToMasters` — eventos de alma sao entregues SOMENTE a sockets com role master.
- `js/ui.js`: novo `UI.toast(mensagem, {kicker, duration})` (aviso nao bloqueante, canto inferior direito) + listeners de `soul:awarded`/`soul:nightmare` que exibem o toast (qualquer pagina com socket ativo: Mesa e Ficha).
- `css/components.css`: estilos `.ui-toast*` usando tokens do design system.
- Cache-bust: `ui.js` e `components.css` para `?v=2026-06-11-soul-notify-1` em todas as paginas.

### Validacoes (wrangler dev + D1 local)
- Jogador aplica Essencia na propria ficha -> mestre conectado recebe `soul:awarded` com ator/alvo/XP; socket de jogador NAO recebe; linha gravada em `soul_audit`
- npm run check:js: OK / npm run audit:static: OK / wrangler deploy --dry-run: OK

### Ordem de deploy
1. `npx wrangler d1 execute armagedon --remote --file cloudflare/d1/schema.sql --config cloudflare/wrangler.toml` (cria `soul_audit`)
2. `npx wrangler deploy --config cloudflare/wrangler.toml`
3. push do site (toast no ui.js)

## Ultima Etapa Concluida (2026-06-11 — Etapa 5 da auditoria: limpeza e consistencia)

### O que mudou
- Removidos arquivos JS mortos (nao referenciados por nenhum HTML): `js/main.js` (vazio), `js/ficha.js`, `js/home.js`, `js/mesa.js`. Tambem deletados os scripts one-off `tools/fix-mojibake*.{js,cjs}` (nunca versionados).
- `js/regras.js`: removidas ~54 linhas de codigo morto em `renderRules` (bloco inalcancavel apos `return`).
- `js/mesa-core.js`: corrigido mojibake em 17 linhas de comentarios (acentos quebrados por dupla codificacao). Zero mojibake restante em `js/`.
- `tools/audit-static.cjs`: nova checagem — `api.js`, `auth.js` e `ui.js` devem usar o MESMO `?v=` em todas as paginas; divergencia agora falha o audit (impede regressao do bug M2 da auditoria).
- `CLAUDE.md`: grafia oficial "Armagedom" registrada; mapeamento de paginas corrigido (inclui `sugestoes.html`, `mesa-initiative.js`, `mesa-init.js`, `ficha-habs.js`, `ficha-passives.js`); nome correto dos secrets (`MASTER_BOOTSTRAP_PASSWORD`, nao `ARMAGEDON_MASTER_PASSWORD`); auth atualizado para PBKDF2/throttle.
- Cache-bust: `mesa-core.js` e `regras.js` para `?v=2026-06-11-cleanup-1`.

### Validacoes
- npm run check:js: OK / npm run audit:static: OK (incluindo a checagem nova)

### Pendencias conhecidas (proximas etapas) (HISTORICO — fechadas; conferido em 2026-08-16)
- Specs Playwright desatualizados (6 falhas pre-existentes, ver entrada da Etapa 2)
- Etapa 6: notificacao de ganho de XP ao mestre
- Etapa 7: jogador move o proprio token com trava do mestre
- Etapa 8: aceite de transferencia pelo destino
- UI: texto "JOGADOR" quebrando no card "Acesso" da home; painel "Nucleo da Alma" vazando do card na ficha

## Ultima Etapa Concluida (2026-06-11 — Etapa 4 da auditoria: PBKDF2 e rate-limit de login)

### O que mudou
- `cloudflare/src/auth.js`: senhas agora usam PBKDF2-SHA256 com salt aleatorio por usuario (25k iteracoes, formato `pbkdf2$<iter>$<salt>$<hash>`); comparacao em tempo constante. O hash legado (sha256 sem salt + pepper) continua aceito no login e e migrado para PBKDF2 de forma transparente no primeiro login valido — nenhum jogador precisa trocar senha.
- `cloudflare/src/auth.js`: `ensureMasterUser` so grava no banco quando algo mudou (senha do secret rotacionada, hash legado ou role/ativacao divergente); antes regravava o hash a cada chamada.
- `cloudflare/src/index.js`: rate-limit de login por usuario+IP (tabela `login_throttle`): 8 falhas seguidas bloqueiam o par por 10 minutos (HTTP 429); login valido limpa o contador.
- `cloudflare/d1/schema.sql`: nova tabela `login_throttle` (migracao remota necessaria antes do deploy do Worker — o login consulta a tabela).
- `.gitignore`: ignora `cloudflare/.dev.vars` e `.wrangler/` (artefatos de dev local).

### Validacoes (wrangler dev + D1 local, 10 casos)
- Bootstrap do mestre gera hash PBKDF2; login OK
- 8 senhas erradas -> 429 na 9a; senha correta tambem bloqueada durante o lock; outro usuario nao afetado
- Usuario com hash legado loga, hash migra para PBKDF2, segundo login OK, senha errada segue 401
- Jogador novo criado pelo mestre ja nasce com hash PBKDF2 e loga normalmente
- npm run check:js: OK / wrangler deploy --dry-run: OK

### Ordem de deploy (importante)
1. `npx wrangler d1 execute armagedon --remote --file cloudflare/d1/schema.sql --config cloudflare/wrangler.toml` (cria `login_throttle`; schema usa IF NOT EXISTS, e idempotente)
2. `npx wrangler deploy --config cloudflare/wrangler.toml`

## Ultima Etapa Concluida (2026-06-11 — Etapa 3 da auditoria: endurecimento do Worker)

### O que mudou
- `cloudflare/src/auth.js`: CORS deixou de refletir qualquer origem; agora usa allowlist (`tiagopsm.github.io`, `armagedon-rpg.pages.dev` + previews `*.armagedon-rpg.pages.dev`, `localhost`/`127.0.0.1` em qualquer porta). Origem fora da lista recebe o dominio canonico no header (bloqueada pelo navegador). Header `vary: origin` adicionado.
- `cloudflare/src/index.js`: `ensureMasterUser` saiu do topo do `fetch` (rodava SELECT+UPDATE no D1 em TODA requisicao) e agora roda apenas na rota de login.
- `cloudflare/src/index.js`: upload de avatar valida content-type (`image/webp`/`image/jpeg`, senao 415) e tamanho (max 2 MB, senao 413).
- `cloudflare/src/index.js`: `GET /api/mesa/map/<key>` valida o formato da chave (`maps/<user>/<id>.webp`) — nao serve mais objetos arbitrarios do bucket. Continua sem auth porque a URL e consumida como background-image (sem headers); mitigacao adicional e o TTL do R2 (`MAP_R2_TTL`).

### Validacoes
- npm run check:js: OK
- npx wrangler deploy --dry-run: OK
- Pos-deploy: login mestre/jogador, upload de avatar na ficha e envio de mapa na Mesa devem ser smoke-testados

## Ultima Etapa Concluida (2026-06-10 — Etapa 2 da auditoria: sessao confiavel no frontend)

### O que mudou
- `js/auth.js`: removidas as credenciais hardcoded do mestre (`MASTER_USER`/`MASTER_PASS`) e todo o login local de producao. O modo local agora so ativa com a flag de dev `localStorage.armagedonDevMode = "1"` (qualquer credencial entra; usuario `mestre` vira master; dados so no navegador). Sem a flag e sem API, o login mostra "Servidor da campanha indisponivel".
- `js/auth.js`: falha de health-check com sessao backend NAO apaga mais a sessao (`clearSession` removido desse fluxo). A pagina e bloqueada com aviso e a sessao/token fica preservada; novo estado `AUTH.isBackendDown()`. `requireAuth()` redireciona para o index quando a API esta fora, em vez de deixar a pagina operar em modo local.
- `js/api.js`: `HEALTH_TIMEOUT_MS` de 600ms para 5000ms, com 2 tentativas — cold start do Worker nao derruba mais a sessao para o modo local (bug que impediu login de jogadores em navegador anonimo em 2026-06-10).
- `js/mesa-map.js`: listeners de jogador descartam `mesa:map:announce/ws:start/set/clear` cujo `fromRole` (carimbado pelo Durable Object) nao seja master — defesa em profundidade da Etapa 1; mensagens sem `fromRole` (worker antigo) sao toleradas.
- `cloudflare/src/mesa-realtime.js`: sinais de mapa retransmitidos agora carregam `fromRole` do remetente autenticado.
- `js/ficha-master.js`: validacao de nome reservado "mestre" deixou de depender da constante removida.
- Cache-busting unificado: `api.js`, `auth.js` e `ui.js` agora usam `?v=2026-06-10-session-1` identico nas 5 paginas (antes `api.js` tinha 4 versoes diferentes entre paginas); `mesa-map.js` e `ficha-master.js` tambem atualizados.

### Validacoes
- npm run check:js: OK / npm run audit:static: OK
- Teste manual via preview (API simulada fora do ar): sessao backend e PRESERVADA, pagina bloqueia com aviso, ficha/mesa redirecionam para o index; login sem flag de dev mostra "Servidor indisponivel"; com a flag entra em modo Navegador
- npm run test:ficha / test:mesa: 24/28 e 3/5 passam. As 6 falhas sao PRE-EXISTENTES (confirmado rodando os mesmos specs no HEAD limpo via git stash): os testes esperam layout/campos antigos do painel do jogador (ex.: attrForca, data-player-item-field) removidos pelas simplificacoes de 2026-06-06/07. ~~Pendencia aberta: atualizar os specs para a UI atual.~~ — **RESOLVIDA** (conferido na Etapa 81, 2026-08-16: `test:ficha` passa 29/29 e `test:mesa` 5/5).

## Ultima Etapa Concluida (2026-06-10 — Etapa 1 da auditoria: seguranca do Worker)

### Contexto
Auditoria completa do projeto identificou achados de seguranca/logica/UI. Plano de correcao em etapas acordado com o Tiago; esta e a Etapa 1 (Worker). Senha do mestre foi rotacionada manualmente no Cloudflare (Etapa 0) antes desta etapa.

### O que mudou
- `cloudflare/src/mesa-realtime.js`: sinais de mapa que distribuem/limpam conteudo (`mesa:map:announce/set/clear/offer/ws:*`) agora exigem `role === "master"` no Durable Object; jogador que tentar recebe `mesa:map:relay:ack` com `ok: false`. Sinais jogador -> mestre (`have/need/answer/ice`) continuam liberados. Antes, qualquer jogador autenticado conseguia trocar ou limpar o mapa de todos.
- `cloudflare/src/characters.js`: corrigido mojibake em 5 mensagens de erro visiveis ao usuario ("Sessao invalida", "Voce nao pode alterar o nucleo desta ficha", "Ficha nao encontrada" x2, "O nucleo ainda nao esta pronto para concluir o pesadelo").
- `cloudflare/src/index.js`: resposta 500 nao vaza mais `error.message` interno; o erro completo vai para `console.error` (visivel em `wrangler tail`) e o cliente recebe mensagem generica.
- `SYSTEM_RULES.md`: regras atualizadas conforme alinhamento — nucleo da alma gerenciado pelo dono da ficha (mestre em todas), sinais de mapa master-only, e registradas como planejadas: notificacao de XP ao mestre, jogador mover o proprio token com trava do mestre, aceite de transferencia pelo destino. Corrigido caminho da pasta oficial (faltava OneDrive).

### Validacoes
- npm run check:js: OK
- npx wrangler deploy --dry-run --config cloudflare/wrangler.toml: OK
- Deploy em producao: pendente de aprovacao do Tiago

### Proximas etapas do plano
2. Frontend sessao confiavel (flag dev no lugar do login local hardcoded, health-check 5s sem clearSession, unificacao de cache-busting)
3. Endurecimento do Worker (ensureMasterUser fora do hot path, limite de avatar, auth no GET de mapa, CORS allowlist)
4. PBKDF2 + rate-limit de login
5. Limpeza (codigo morto, grafia oficial "Armagedom", CLAUDE.md, checagem de cache-busting no audit:static)
6. Notificacao de ganho de XP ao mestre
7. Jogador move o proprio token (com trava do mestre)
8. Aceite de transferencia pelo destino

## Ultima Etapa Concluida (2026-06-07 — Responsividade do painel "Meu personagem")

### O que mudou
- Corrigido layout quebrado/estourando a largura do painel "Meu personagem" em telas/sidebar estreitas: cartoes de Vida/Integridade e o botao "Abrir minha ficha completa" estavam sendo cortados na borda direita.
- `css/mesa-roster.css`:
  - `.player-resource-grid`/`.player-panel-meta-grid` passaram de `repeat(2, minmax(0,1fr))` (fixo) para `repeat(auto-fit, minmax(118px, 1fr))` — os cartoes agora se ajustam ao espaco real do container (a sidebar pode ser mais estreita que o viewport, entao basear-se so em media queries de viewport nao bastava).
  - Reduzido padding/gap/font-size dos cartoes de recurso e dos inputs de Vida/Integridade (`.player-resource-card`, `.player-stat-inputs`, `.player-stat-inputs input`) — caixas menores, conforme pedido.
  - `.player-open-sheet-btn` ganhou `white-space: normal`, `word-break: break-word` e `box-sizing: border-box` para o texto do botao quebrar em vez de ser cortado.
  - Nova faixa `@media (max-width: 480px)`: avatar do token reduzido (80px → 56px), grids de recursos forcados a 1 coluna, fonte do botao/cards reduzida — telas pequenas ficam legiveis sem overflow horizontal.
- mesa.html — cache-bust de `css/mesa-roster.css` para `?v=2026-06-07-responsive-fix-1`.

### Validacoes
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-06 — Painel "Meu personagem" simplificado)

### O que mudou
- O painel pessoal do jogador na Mesa Virtual ("Meu personagem", `renderPlayerSheetPanel` em `js/mesa-roster.js`) foi reduzido ao essencial para uso durante a sessao: imagem/avatar do token, nome, status em cena, seletor de personagem (quando ha mais de um) e os editores de Vida e Integridade (atual e maximo).
- Removido completamente da mesa: Atributos (Forca, Agilidade, Inteligencia, Resistencia, Alma), "Dados rapidos" (Nome/Classe/Raca/Faccao/Anotacoes), listas/edicao detalhada de Inventario e Memorias e os cards-resumo de contagem — tudo isso agora vive somente na Ficha de Personagem.
- Adicionado botao "Abrir minha ficha completa" (`a.player-open-sheet-btn`, link para `ficha.html`) ao final do painel, para o jogador navegar direto para a ficha quando precisar editar o restante.
- Motivo: o jogador reportou excesso de informacao/edicao duplicada bagunçando o painel da mesa — a visao ali deve ser rapida e focada no que muda durante o combate (status, vida/integridade), com tudo o mais delegado a ficha completa.

### Arquivos alterados
- js/mesa-roster.js — `renderPlayerSheetPanel` enxugado; removidas as funcoes que ficaram sem uso (`renderPlayerIdentityEditor`, `renderPlayerTextField`, `renderPlayerAttributeEditor`, `renderPlayerInventoryList`, `renderPlayerInventoryItem`, `renderPlayerMemoryList`, `formatMesaItemType`)
- css/mesa-roster.css — adicionado `.player-open-sheet-btn` (botao de link para a ficha, full width)
- mesa.html — cache-bust atualizado: `css/mesa-roster.css`, `js/mesa-roster.js` e `js/mesa-inspector.js` para `?v=2026-06-06-simplify-player-panel-1` (as strings anteriores estavam desatualizadas em relacao ao ultimo commit que tocou esses arquivos, o que fazia alteracoes recentes parecerem "sem efeito" por cache do navegador)

### Validacoes
- npm run check:js: OK (40 arquivos)
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-05 — Tracker de Iniciativa)

### Funcionalidade implementada
- Tracker de iniciativa na Mesa Virtual com sincronizacao em tempo real via WebSocket
- Mestre ativa/encerra o combate com botao INIC. na toolbar
- Jogadores recebem banner "Combate iniciado!" e abrem popup para rolar 1d20 + mod Agilidade (floor(Agilidade/3))
- Resultado enviado ao mestre via mesa:initiative:roll; mestre ordena por total descrescente e faz broadcast
- Mestre avanca turnos (Proximo), reinicia rodada, remove participante individual ou encerra o combate
- Estado da iniciativa persiste na cena (localStorage + Cloudflare D1) e restaurado ao recarregar

### Arquivos principais alterados
- js/mesa-initiative.js (NOVO) — modulo completo de iniciativa
- js/mesa-core.js — delta types adicionados, initiative no payload da cena, restauro no applyMesaSceneSnapshot, init no boot
- cloudflare/src/mesa.js — normalizeMesaScene preserva initiative
- mesa.html — botao toolbar, painel sidebar #vttInitiativeBlock, banner #initiativeBanner, popup #initiativeRollPopup, script tag
- css/mesa.css — estilos do tracker, banner, popup

### Validacoes
- npm run check:js: OK (40 arquivos)
- npm run audit:static: OK

## Ultima Etapa Concluida (2026-06-05)

- Responsividade da Mesa e da Ficha revisada:

  **Mesa mobile (≤480px):**
  - sidebar passou de scrollável horizontal para coluna vertical, ocupando o espaço restante abaixo do canvas
  - meta chips (Modo/Papel/Fichas) ficam em linha horizontal no topo da sidebar
  - toolbar reduzida a 44px sem o badge de papel e o contador; separadores ocultos
  - canvas fixado em 44vh para garantir espaço ao roster abaixo
  - tabs do roster em grade 2×2, sem overflow
  - botões de ação do token (FOCAR/RETIRAR) com largura completa

  **Mesa tablet (≤900px):**
  - cabeçalho de bloco da sidebar aceita quebra de linha (`flex-wrap: wrap`)
  - badge "X/N PARA COLOCAR" usa fonte e padding menores para não transbordar

  **Mesa ≤700px:**
  - sidebar horizontal com scroll snap (um bloco por vez, largura `min(280px, 80vw)`)
  - meta chips mais compactos

  **Ficha mobile (≤480px):**
  - campos de identidade (Nome/Aspecto/Raça/Facção) empilham em coluna única via `form-row { flex-wrap: wrap }`
  - `soul-core-panel` empilha verticalmente
  - recursos empilham em coluna

  **Ficha tablet (≤768px):**
  - `soul-attribute-cap-grid` quebra para segunda linha no `soul-core-panel`

  **Header global (≤480px):**
  - logo menor (32×32), subtítulo oculto, badge de usuário truncado com ellipsis

  - arquivos alterados: `css/mesa.css`, `css/mesa-roster.css`, `css/components.css`, `css/ficha.css`
  - validações executadas: `npm run check:js` (39 arquivos OK), `npm run audit:static` (OK), QA visual por Playwright em 360px e 768px para mesa e ficha

## Ultima Etapa Concluida (2026-06-01)

- Correcao de sincronizacao do roster e botao de configuracoes da Mesa sempre visivel:

  **Fix 1 — Roster contaminado por localStorage em modo backend:**
  - causa: `buildPlayers`, `buildNpcs` e `buildMonsters` adicionavam ao roster qualquer chave encontrada em `tc_sheets` (localStorage), mesmo que aquele personagem nao existisse no diretorio da API; numa maquina diferente com outro cache local o roster ficava diferente
  - `js/mesa-core.js`: as tres funcoes agora so adicionam entradas vindas do localStorage ao roster quando `isMesaBackendEnabled()` retornar `false`; em modo backend o diretorio da API e a unica fonte de quem aparece no roster
  - cache bust de `mesa-core.js` atualizado para `2026-06-01-backend-roster-1`

  **Fix 2 — Botao de configuracoes da Mesa sempre visivel para o mestre:**
  - causa: `#mesaMapSettingsBtn` ficava oculto ate que um mapa fosse carregado, mas o painel de configuracoes tambem tem o seletor de estilo de tokens, que nao depende de mapa
  - `mesa.html`: removido `hidden` inicial do `#mesaMapSettingsBtn`; adicionado `id="mesaMapScaleGroup"` e `id="mesaMapHint"` para controlar visibilidade por secao
  - `js/mesa-map.js`: `renderMesaMapLayer()` exibe/oculta apenas as secoes de escala e posicao conforme mapa ativo; o botao e mantido visivel para o mestre mesmo sem mapa; `toggleMapSettings()` sincroniza visibilidade de cada secao ao abrir o painel; `initMesaMap()` ja exibe o botao ao detectar papel mestre, antes de qualquer mapa ser carregado
  - cache bust de `mesa-map.js` atualizado para `2026-06-01-settings-always-1`

  - validacoes executadas: `npm run check:js` (39 arquivos OK)
  - status: pronto para revisao e commit

## Estado Funcional Atual

- Login com mestre e jogadores funcionando via API
- Fichas centralizadas no servidor
- Painel do mestre com jogadores, NPCs e monstros
- Mestre abre e salva fichas de jogadores pelo `key` oficial do diretorio, preservando `username` como dono da ficha
- Sistema de regras publicado
- Transferencia de itens entre jogadores
- Transferencia de memorias entre jogadores
- Drop de memoria de monstros
- Progressao por Essencias da Alma implementada
- Rolagem de dados na ficha implementada
- Mesa virtual com roster, palco, inspetor e edicao local/online da ficha propria
- Mesa virtual sincroniza cena em tempo real para mestre e jogadores conectados
- Mesa virtual usa renderer Canvas/Worker por padrao, com fallback Canvas principal e DOM legado via `localStorage.mesaRenderer = "dom"`
- Realtime da Mesa aceita deltas incrementais de token para reduzir payload durante movimento
- Mestre ve roster completo da Mesa; jogador ve palco compartilhado e painel pessoal da propria ficha, sem lista de tokens disponiveis
- Jogador pode alterar pela Mesa: dados rapidos, atributos, Vida atual, Vida maxima, Integridade atual, Integridade maxima e inventario da propria ficha
- Campos numericos da Mesa permitem apagar o valor atual e digitar um novo numero antes de aplicar clamp/salvamento
- Memorias continuam em leitura no painel do jogador nesta etapa para preservar as regras de transferencia
- Vida atual de jogador, NPC e monstro nao pode passar da Vida maxima
- Integridade atual continua limitada pela Integridade maxima

## Estado Visual Atual

- A ficha e a referencia visual principal do projeto
- Direcao atual:
  - dark fantasy
  - preto profundo
  - vermelho escuro
  - atmosfera inspirada em Shadow Slave
- Home/login ja segue essa mesma linguagem visual

## Ultima Etapa Concluida

- Estabilizacao de sincronizacao da Mesa em 2026-05-09:
  - objetivo: remover gargalo/oscillacao em que valores recem editados pela Mesa podiam receber refresh antigo e aparentar rollback ou demora na selecao
  - causa encontrada: `sheet:changed` e `mesa:sheet:patch` podiam recarregar cache remoto antigo enquanto havia patch local pendente; alem disso, cada patch de ficha reprocessava roster/tokens inteiros
  - `js/mesa-core.js`: adicionada janela curta de patch otimista por ficha; eventos remotos agora mesclam esse patch local recente antes de atualizar cache/render
  - `js/mesa-stage.js`: patches da ficha atualizam roster/tokens de forma incremental, sem `refreshMesaRosterFromSheets()` completo em cada tecla; selecionar o mesmo token nao dispara nova ordem nem save de cena
  - `js/mesa-stage.js`: maxima de Vida/Integridade deixou de aplicar clamp no valor atual a cada digito intermediario; o clamp final acontece no `focusout`, evitando rollback ao digitar `30`
  - `mesa.html`: cache bust de `mesa-core.js` e `mesa-stage.js` atualizado para `2026-05-09-sync-lag-1`
  - `tests/mesa.spec.cjs`: regressao simula refresh remoto antigo logo apos edicao local e confirma que Vida/Integridade nao voltam para o valor antigo; tambem cobre clamp visual final quando Vida/Integridade maxima ficam abaixo do valor atual
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Digitacao continua de numeros na Mesa em 2026-05-09:
  - objetivo: permitir digitar valores com multiplos digitos, como `10` ou `30`, sem o campo travar no primeiro digito
  - `js/mesa-stage.js`: o inspetor da Mesa deixou de reconstruir o proprio painel a cada tecla; agora atualiza barra/label localmente e renderiza o inspetor completo apenas ao sair do campo
  - `tests/mesa.spec.cjs`: regressao usa `type("10")` e `type("30")` para cobrir digitacao real no inspetor do mestre e no painel pessoal do jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Edicao livre de maximos de Vida/Integridade em 2026-05-09:
  - objetivo: permitir que jogador e mestre editem diretamente, por numero digitado, Vida atual/maxima e Integridade atual/maxima
  - `js/mesa-roster.js`: painel pessoal do jogador agora mostra `Max` editavel tambem para Integridade
  - `js/mesa-stage.js` e `js/mesa-core.js`: patches da Mesa preservam `integMax` manual e `attrAlma` deixa de sobrescrever a Integridade maxima
  - `js/ficha-core.js`, `js/ficha-sheet.js` e `ficha.html`: Integridade maxima da ficha deixou de ser somente leitura e passou a ser persistida como valor manual
  - `cloudflare/src/sheet.js`, `cloudflare/src/mesa-realtime.js` e `server/src/utils/sheet.js`: backend/Worker preservam `integMax` enviado pelo cliente e apenas clampam Integridade atual pelo maximo salvo
  - `mesa.html` e `ficha.html`: cache bust atualizado para `2026-05-09-free-resource-max-1`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run --config cloudflare/wrangler.toml`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Edicao direta de numeros da ficha pela Mesa em 2026-05-09:
  - objetivo: permitir que mestre e jogador apaguem o valor de campos numericos e digitem o numero novo, sem depender apenas das setas do input
  - `js/mesa-stage.js`: handlers de Vida, Integridade, Vida maxima, atributos e quantidade de item agora ignoram campo numerico temporariamente vazio e restauram o valor seguro apenas ao sair do campo sem preencher
  - `js/mesa-core.js`: painel do jogador e inspetor passaram a tratar `focusout` para restaurar entradas numericas deixadas vazias sem salvar `0` por acidente
  - `js/mesa-roster.js` e `js/mesa-inspector.js`: inputs numericos ganharam `inputmode="numeric"` mantendo o visual e os limites atuais
  - `mesa.html`: cache bust dos scripts da Mesa atualizado para `2026-05-09-numeric-clear-1`
  - `tests/mesa.spec.cjs`: regressao cobre apagar e redigitar Vida no inspetor do mestre, Vida no painel do jogador, atributo e quantidade de item
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `git diff --check` e `git fsck --no-dangling`
  - status: pronto para publicacao

- Protecao de limpar cena e gradiente da Mesa em 2026-05-09:
  - objetivo: impedir que jogadores vejam/usem `Limpar cena` e melhorar o acabamento dos gradientes da Mesa sem alterar o fluxo simples do painel do jogador
  - `mesa.html`: botao `Limpar cena` inicia oculto e cache bust atualizado para `2026-05-09-mesa-guard-gradient-1`
  - `js/mesa-roster.js`: controles da Mesa agora ocultam/desabilitam `Limpar cena` para jogadores e liberam apenas para mestre
  - `js/mesa-core.js` e `js/mesa-stage.js`: clique e funcao de limpar cena receberam guardas adicionais por papel
  - `css/mesa-base.css` e `css/mesa-stage.css`: gradientes da Mesa foram refinados com camadas carmesim, sombra escura e acento frio sutil, preservando a vibe dark fantasy
  - `tests/mesa.spec.cjs`: regressao cobre `Limpar cena` visivel para mestre e oculto/desabilitado para jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, `npm run perf:mesa`, QA visual por Playwright em desktop/mobile e `git diff --check`
  - status: pronto para publicacao

- Correcao de quebras visuais nos gradientes da Mesa em 2026-05-09:
  - objetivo: remover emendas/linhas visiveis entre tons escuros e carmesim nos paineis da Mesa
  - `css/mesa-base.css`: gradientes dos paineis passaram de faixas lineares/altura fixa para elipses suaves em painel inteiro
  - `css/mesa-stage.css`: gradiente do palco deixou de usar diagonais marcadas e passou a usar manchas radiais com fade gradual
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, QA visual por Playwright em desktop largo e `git diff --check`
  - status: pronto para publicacao

- Retorno da interface simples do painel do jogador na Mesa em 2026-05-09:
  - objetivo: voltar ao controle simples em fluxo unico, sem abas e sem botoes rapidos, preservando a edicao ampla da propria ficha pela Mesa
  - `js/mesa-roster.js`: painel pessoal voltou a renderizar hero, Vida/Integridade, dados rapidos, atributos, inventario e memorias em secoes continuas
  - `js/mesa-core.js` e `js/mesa-stage.js`: removidos estado/handlers mortos de abas e botoes rapidos do painel do jogador
  - `css/mesa-layout.css`: removidos overrides recentes de largura/escala interna que mudavam a primeira leitura da ficha rapida
  - `mesa.html`: cache bust de `mesa-core.js`, `mesa-stage.js`, `mesa-roster.js`, `mesa-roster.css` e `mesa-layout.css` atualizado para `2026-05-09-player-simple-1`
  - `tests/mesa.spec.cjs`: regressao ajustada para garantir ausencia de abas e manter edicao de Vida, Integridade, atributos, dados rapidos e inventario
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run build:pages`, `npm run perf:mesa`, QA visual por Playwright em desktop/mobile e `git diff --check`
  - status: pronto para publicacao

- Painel de edicao completa do jogador na Mesa em 2026-05-08:
  - objetivo: permitir que o jogador edite pela Mesa a propria ficha em tempo real, alem de Vida/Integridade atuais
  - `js/mesa-roster.js` e `css/mesa-roster.css`: painel pessoal ganhou campos editaveis de dados rapidos, atributos, Vida maxima e inventario; itens podem ser adicionados, removidos e editados sem expor roster de tokens
  - `js/mesa-stage.js`: novos handlers aplicam patches locais sem reconstruir o painel a cada tecla; inventario respeita a capacidade atual
  - `js/mesa-core.js`: `mesa:sheet:patch` passou a normalizar texto, recursos, atributos, `inv` e `ownedMemories`; cache local/remoto da Mesa preserva atributos e dados rapidos
  - `cloudflare/src/mesa-realtime.js`: Durable Object agora aceita e sanitiza patches amplos da ficha, mantendo a regra de que jogador so transmite alteracoes da propria `characterKey` e filtrando campos nao permitidos antes do relay
  - `mesa.html`: cache bust de `mesa-core.js`, `mesa-stage.js`, `mesa-roster.js` e `mesa-roster.css` atualizado para `2026-05-08-player-edit-1`
  - `tests/mesa.spec.cjs`: regressao ampliada para cobrir edicao local/online de atributos, dados rapidos e inventario pelo painel do jogador
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run test:ficha`, `npm run perf:mesa`, `npm run build:pages`, `npm run test:mesa:online`, `npx.cmd --yes wrangler@latest deploy --dry-run --config cloudflare/wrangler.toml` e `git diff --check`
  - observacao de QA: o fluxo autenticado de `test:mesa:online` ficou ignorado neste processo porque as variaveis de credenciais nao estavam carregadas; testes publicos online passaram
  - observacao de ferramenta: o Browser integrado falhou antes de abrir a pagina por erro de preparo de arquivos temporarios do runtime; a validacao renderizada especifica ficou coberta pelo Playwright do projeto
  - Worker publicado em 2026-05-08: `armagedon-api`, version ID `d93c6c56-eaf6-4e13-855b-b5640967d7f6`
  - status: implementado e Worker publicado; falta apenas push para GitHub Pages publicar o cache bust do frontend

- Proximo passo da Mesa online em 2026-05-08:
  - `package.json`: adicionado `npm run test:mesa:online`
  - `tests/mesa-online.spec.cjs`: novo smoke test online para GitHub Pages e Cloudflare; sem credenciais, valida `index.html`, `mesa.html`, `ficha.html`, `regras.html`, `/api/health`, bloqueio anonimo de `/api/directory` e `/api/mesa/scene`, e resposta `426` de `/api/mesa/realtime` sem WebSocket
  - fluxo autenticado opcional: quando `ARMAGEDON_MASTER_USERNAME`, `ARMAGEDON_MASTER_PASSWORD`, `ARMAGEDON_PLAYER_USERNAME` e `ARMAGEDON_PLAYER_PASSWORD` estiverem definidos, o teste valida login mestre/jogador, diretorio, cena oficial, WebSocket `mesa:ready`, UI da Mesa como mestre e UI da Mesa como jogador
  - ajuste posterior: seletor do roster autenticado corrigido de `#mesaRosterList` para `#rosterList`; no modo jogador o teste agora valida painel pessoal, busca oculta e ausencia de acoes `data-roster-action`
  - `ARMAGEDON_ONLINE_RELAY_PROBE=1` ativa uma prova extra de relay `mesa:token:move`; deixar desligado por padrao para nao transmitir evento de teste a usuarios reais conectados
  - validacoes executadas sem credenciais reais: `node --check tests/mesa-online.spec.cjs`, `npm run audit:static`, `git diff --check` e `npm run test:mesa:online` com 2 testes passados e 1 autenticado ignorado

- Correcao da edicao de fichas de jogadores pelo mestre em 2026-05-07:
  - problema: o cache local de jogadores gerado a partir do diretorio da API descartava a `key` oficial da ficha e `createPlayerTarget()` montava o alvo apenas com `username`; isso podia abrir/salvar a ficha no identificador errado quando a API entregasse uma `key` diferente ou quando o cache local estivesse desatualizado
  - problema adicional: handlers de realtime da ficha acessavam `currentSheetTarget.key` mesmo quando o mestre estava no painel principal, onde `currentSheetTarget` e nulo; um broadcast de ficha/inventario/memoria podia gerar erro de console antes da abertura/edicao da ficha
  - `js/auth.js`: `AUTH.setDirectoryCache()` agora preserva `id`, `key`, `username`, `charname`, `inventorySlots` e `usedSlots` no cache `tc_players`
  - `js/ficha-core.js`: `createPlayerTarget()` agora resolve o jogador pelo diretorio oficial ou pelo cache local, usa `player.key` como chave de API e mantem `player.username` como owner; os handlers de realtime usam guarda nula e comparacao normalizada
  - varredura profunda encontrou outra classe de bug: cache de diretorio remoto antigo podia contaminar o modo local/offline; `js/ficha-core.js` e `js/mesa-core.js` agora so usam `tc_directory_cache` quando o backend esta ativo, preservando `username`/`tc_sheets` locais no modo local
  - varredura extra fora do plano encontrou fragilidade em transferencias: item/memoria ainda podiam escolher destino por `username`; `js/ficha-inventory.js` e `js/ficha-memories.js` agora usam `player.key` em modo API, mantem `username` no modo local e evitam erro quando nao ha destino disponivel
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `auth.js` atualizado para `2026-05-07-master-sheet-key-1`; `ficha.html` tambem atualizou `ficha-core.js`, `ficha-inventory.js` e `ficha-memories.js`; `mesa.html` atualizou `mesa-core.js`
  - `tests/ficha.spec.cjs`, `tests/mesa.spec.cjs` e `package.json`: adicionadas regressoes `npm run test:ficha` e `npm run test:mesa`, simulando mestre salvando uma ficha de jogador em `/api/characters/:key`, transferencia de item usando `targetKey` oficial e Mesa local salvando no `username` local mesmo com diretorio remoto antigo
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:ficha`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git fsck --no-dangling`, varredura de MP4 no `_site` e `git diff --check`
  - deploy operacional em 2026-05-07: GitHub Pages ficou `built`, `index.html`, `ficha.html`, `mesa.html` e `regras.html` responderam HTTP 200, API `/api/health` respondeu HTTP 200 e Worker `armagedon-api` foi publicado na version ID `fb0548da-a975-4804-bc54-1b740938d31d`
  - observacao de ambiente: `npm run test:ficha` falhou no sandbox com `spawn EPERM`; o mesmo teste passou com permissao elevada porque o Playwright precisa criar worker de teste
  - status: correcao publicada na `main`; proxima pendencia e validacao manual ponta a ponta com mestre e jogador reais no site oficial

- Correcao da edicao da ficha pela Mesa em 2026-05-07:
  - problema: o painel do jogador podia editar o cache local da Mesa, mas a pagina nao buscava a ficha oficial do jogador antes de montar o painel; alem disso, a Ficha escutava `sheet:changed.key` enquanto o Worker emitia `sheet:changed.characterKey`
  - `js/mesa-core.js`: a Mesa agora hidrata a propria ficha do jogador via `GET /api/characters/:key` antes de montar o roster/painel, usa a `key` oficial do diretorio quando existir e aceita patch de ficha propria tambem por entrada/token pertencente ao usuario
  - `js/mesa-stage.js`: patches pendentes de Vida/Integridade sao enviados imediatamente em `pagehide`/aba oculta com `keepalive`; o save remoto continua usando debounce durante edicao normal
  - `js/ficha-core.js`: `sheet:changed` agora aceita `key`, `characterKey` ou `targetKey`, permitindo que a ficha aberta recarregue quando a Mesa salva o status
  - `cloudflare/src/index.js` e `cloudflare/src/mesa-realtime.js`: eventos de ficha passam a carregar `key` e `characterKey` para compatibilidade entre Mesa e Ficha
  - `mesa.html` e `ficha.html`: cache bust atualizado para `2026-05-07-sheet-edit-1`
  - `tests/mesa.spec.cjs`: adicionada cobertura com backend simulado confirmando que o jogador carrega a ficha oficial, ve itens/memorias reais e persiste Vida/Integridade via `PUT /api/characters/:key`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git fsck --no-dangling` e `git diff --check`
  - Worker publicado em 2026-05-07: `armagedon-api`, version ID `b89440a2-65c6-4d1e-8fcb-9b17c2236c6a`
  - ~~pendencia pos-push: acompanhar GitHub Pages na `main` e conferir o site oficial com jogador editando Vida/Integridade pela Mesa~~ (HISTORICO — cumprida; conferido em 2026-08-16)

- Painel pessoal do jogador na Mesa em 2026-05-06:
  - objetivo: ocultar do jogador o roster de tokens disponiveis, manter o palco compartilhado e permitir edicao apenas de Vida atual e Integridade atual da propria ficha
  - `js/mesa-core.js`: adicionados helpers de papel/privacidade (`isOwnPlayerToken`, `getOwnPlayerTokens`, `getOwnSheetSnapshot`, `canViewDetailedTokenInfo`), cache de snapshot da propria ficha e assinatura do evento `mesa:sheet:patch`
  - `js/mesa-roster.js` e `css/mesa-roster.css`: roster do mestre preservado; jogadores passam a ver painel "Meu personagem" com avatar, Vida, Integridade, itens, capacidade e memorias em leitura
  - `js/mesa-stage.js`: selecao e status respeitam permissao de token; patch de ficha nao persiste cena visual; painel do jogador edita valores atuais sem reconstruir a UI a cada tecla
  - `js/mesa-inspector.js`: jogador nao ve detalhes de token alheio no inspetor inferior; tokens nao autorizados viram leitura restrita da cena
  - `js/mesa-renderer-v2.js`, `js/mesa-renderer-worker.js`, `css/mesa-stage.css` e `css/mesa-inspector.css`: Vida e Integridade usam a mesma formula visual da ficha original; Integridade deixou de usar fallback dourado na Mesa
  - `cloudflare/src/mesa-realtime.js`: Durable Object aceita `mesa:sheet:patch`, valida que jogador so altera a propria ficha e retransmite patch apenas para mestre e dono da ficha
  - `cloudflare/src/index.js`: `PUT /api/characters/:key` dispara `sheet:changed` para Mesa/Ficha atualizarem snapshot quando a ficha for salva
  - `mesa.html`: cache bust atualizado para `2026-05-06-player-panel-1`
  - `tests/mesa.spec.cjs`: adicionada cobertura de jogador sem roster, painel pessoal, privacidade do inspetor e edicao de Vida/Integridade
  - Worker publicado em 2026-05-07: `armagedon-api`, version ID `f749f048-5040-4f6a-a43d-e1e5aaae48f2`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npx.cmd --yes wrangler@latest deploy --dry-run`, `git diff --check` e smoke visual no Browser integrado em servidor local
  - observacao de QA: o Browser integrado bloqueou `javascript:` URL para semear `localStorage`; o fluxo especifico de jogador foi validado por Playwright, e o Browser foi usado para smoke visual seguro da Mesa local

- Polimento de fluidez do drag da Mesa em 2026-05-06:
  - objetivo: reduzir microtravadas ao mover tokens sem alterar a aparencia geral da Mesa
  - `js/mesa-renderer-v2.js`: renderer passou a cachear o fundo estatico do palco em Canvas, evitando redesenhar grid/glow em todo frame; tambem passou a manter lista ordenada e layouts em cache
  - `js/mesa-renderer-v2.js` e `js/mesa-renderer-worker.js`: drag em Canvas/Worker agora usa mensagem leve `move-token` para atualizar apenas posicao/layout do token movido, sem reconstruir snapshot completo a cada movimento
  - `js/mesa-stage.js`: movimento local usa `updateTokenPosition()` durante drag; realtime de drag foi ajustado para intervalos menores e mais suaves sem salvar remoto antes do `pointerup`
  - `js/ui.js` e `css/ui.css`: brilho carmesim do cursor pausa enquanto a Mesa esta em drag, reduzindo pintura concorrente no momento mais sensivel
  - `mesa.html`: cache bust atualizado para `2026-05-06-drag-polish-1`
  - `tests/mesa.performance.spec.cjs`: teste de performance agora confirma que o drag usa patches leves de movimento e nao render completo a cada movimento
  - validacoes executadas: `npm run check:js`, `npm run test:mesa`, `npm run perf:mesa` e `git diff --check`

- Estabilizacao visual dos cards da Mesa em 2026-05-05:
  - objetivo: impedir que os cards/tokens mudem de tamanho ao selecionar, entrar em tela cheia e voltar ao modo normal
  - `js/mesa-renderer-v2.js`: dimensoes do token Canvas passaram a ser estaveis entre modo normal e fullscreen; largura base aumentada para uma faixa maior que a anterior e altura ajustada para comportar nome, dono e barras sem colisao
  - `js/mesa-renderer-v2.js` e `js/mesa-renderer-worker.js`: textos do token no Canvas agora usam quebra/truncamento controlado em vez de comprimir a linha dentro do `fillText`
  - `js/mesa-stage.js`: mudanca de fullscreen tambem reagenda o redraw do palco, mantendo Canvas e estado visual sincronizados
  - `css/mesa-responsive.css`: fallback DOM recebeu largura unica para `.mesa-token` em modo normal/fullscreen, avatar com proporcao estavel e regras de `overflow-wrap` para roster, inspetor, badges, botoes e textos longos
  - `mesa.html`: cache bust atualizado para a correcao `2026-05-05-card-stability-1`
  - validacoes executadas: `npm run check:js`, `npm run audit:static`, `npm run test:mesa`, `npm run perf:mesa`, `npm run build:pages` e `git diff --check`

- Otimizacao leve da Mesa em 2026-05-05:
  - objetivo: reduzir custo no navegador sem redesign e sem alterar o formato publico de `GET/PUT /api/mesa/scene` ou `GET /api/mesa/realtime`
  - `js/mesa-core.js`: adicionados cache de referencias DOM, cache de roster por `characterKey`, agendador `scheduleMesaRender()` com `requestAnimationFrame`, dedupe por assinatura estavel da cena e consolidacao de broadcasts `mesa:scene` recebidos no mesmo frame
  - `js/mesa-stage.js`: palco passou a renderizar tokens incrementalmente por `Map<tokenId, element>`; drag atualiza apenas `left/top/zIndex` durante movimento e salva apenas ao soltar
  - `js/mesa-roster.js` e `js/mesa-inspector.js`: renders passam a usar referencias DOM cacheadas; roster so e reagendado quando busca, entrada/saida de token, roster ou fichas mudam
  - `js/mesa-stage.js` e `js/mesa-inspector.js`: imagens de avatar renderizadas via JS agora usam `loading="lazy"`, `decoding="async"` e dimensoes estaveis
  - `css/mesa-stage.css`, `css/mesa-roster.css` e `css/mesa-inspector.css`: adicionados `contain: layout paint` em areas pesadas; `will-change` fica limitado ao token durante drag
  - `mesa.html`: cache bust dos arquivos alterados atualizado para `2026-05-05-mesa-light-1`
  - comportamento preservado: mestre continua colocando, focando, movendo, removendo e limpando tokens; jogadores continuam recebendo a cena por realtime
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; varredura de referencias locais e IDs duplicados; confirmacao de `window.AUTH`; servidor local com HTTP 200 nas quatro paginas principais; simulacao controlada da Mesa confirmando que selecao nao reconstrui roster/palco, drag nao salva durante movimento, drag salva uma vez ao soltar, payload repetido nao salva de novo e `mesa:scene` igual nao rerenderiza

- Correcao de export global da autenticacao em 2026-05-05:
  - problema identificado apos deploy: `auth.js` declarava `const AUTH`, mas nao expunha `window.AUTH`; a Mesa consulta `window.AUTH`, entao podia ficar parada no HTML inicial (`Convidado`, `Jogador`, `0`) mesmo com API e cena corretas
  - `js/auth.js`: adicionada ponte `window.AUTH = AUTH` antes de iniciar `window.AUTH_READY`
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `auth.js` atualizado para `2026-05-05-mesa-auth-export-1`
  - validacao executada: simulacao da Mesa com sessao real do mestre contra a API oficial confirmou `headerUser=mestre`, `roleBadge=Mestre`, `activeTokenCount=5`, roster carregado e copia de realtime ativa

- Realtime oficial da Mesa em 2026-05-04:
  - objetivo: permitir que o mestre adicione jogadores, NPCs e monstros existentes na Mesa e que todos vejam a cena atualizada em tempo real
  - `cloudflare/src/mesa-realtime.js`: criado Durable Object `MesaRealtimeRoom` para aceitar WebSockets, registrar presenca e transmitir eventos da cena
  - `cloudflare/wrangler.toml`: adicionados binding `MESA_REALTIME` e migration `v1-mesa-realtime`
  - `cloudflare/src/index.js`: adicionada rota `GET /api/mesa/realtime`; `PUT /api/mesa/scene` agora salva no D1 e transmite `mesa:scene`
  - `cloudflare/src/auth.js`: `requireAuth()` aceita token JWT por query string para conexao WebSocket do navegador
  - `js/api.js`: removida tentativa antiga de Socket.IO e criada conexao WebSocket nativa para `/mesa/realtime`
  - `js/runtime-config.js`: realtime habilitado, mas a conexao so abre quando a pagina chama `APP.connectRealtime()`
  - `js/mesa-core.js`: Mesa assina `mesa:ready`, `mesa:presence` e `mesa:scene`, atualizando roster/cena ao receber broadcast
  - `js/mesa-stage.js`: `Limpar cena` agora deixa o palco vazio de fato para o mestre adicionar tokens manualmente pelo roster
  - `js/mesa-roster.js` e `mesa.html`: textos atualizados para comunicar sincronizacao ao vivo e contagem `disponiveis/total`
  - `js/auth.js`: sessao backend pode ser recuperada a partir de token salvo quando o objeto de sessao local estiver ausente
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: cache bust de `runtime-config.js`, `api.js` e `auth.js` atualizado para `2026-05-04-mesa-realtime-1`
  - Worker publicado: `armagedon-api`, version ID `2cab1568-cc32-4a79-81d0-07851eac7a4a`
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; `wrangler deploy --dry-run`; servidor local com HTTP 200 nas quatro paginas; deploy real do Worker; login mestre HTTP 200; `GET /api/mesa/scene` HTTP 200; duas conexoes WebSocket receberam `mesa:ready`; `PUT /api/mesa/scene` transmitiu `mesa:scene` com 5 tokens para outra conexao
  - observacao de QA: Edge headless/CDP nao iniciou neste ambiente; validar visualmente no navegador real apos GitHub Pages publicar o cache bust novo

- Correcao de tokens iniciais da Mesa em 2026-05-04:
  - problema identificado: a API oficial tinha diretorio populado, mas a cena `default` estava salva com `0` tokens; em navegadores com cache/diretorio local desatualizado, a Mesa podia abrir sem tokens de jogadores, NPCs ou monstros
  - `js/mesa-core.js`: Mesa agora atualiza o diretorio pela API antes de montar o roster, usa a `key` oficial de NPCs/monstros quando ela vem do Worker e repopula a cena vazia/stale a partir do roster oficial
  - `mesa.html`: cache bust de `js/mesa-core.js` atualizado para `2026-05-04-mesa-tokens-1`
  - D1 oficial: a cena `default` estava com `0` tokens e foi populada com 5 tokens iniciais do diretorio atual apos o deploy da correcao
  - ajuste complementar: `js/mesa-core.js` agora inicia por `bootMesaPage()` com guarda para `document.readyState`, evitando a tela ficar presa no HTML inicial `Convidado`/`0 disponiveis` se o `DOMContentLoaded` ja tiver passado
  - `mesa.html`: cache bust de `js/mesa-core.js` atualizado para `2026-05-04-mesa-init-guard-1`
  - comportamento esperado: ao abrir como mestre, se a cena remota estiver vazia mas houver personagens cadastrados, a Mesa semeia tokens iniciais e salva a cena oficial no D1; jogadores passam a carregar a cena publicada
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; teste logico de roster/tokens; teste de hidratacao com salvamento remoto; varredura HTML/CSS de referencias e IDs duplicados; links wiki do Obsidian; servidor local com HTTP 200 nas paginas principais; GitHub Pages com sucesso; arquivos publicados com HTTP 200; API oficial confirmada com cena contendo tokens

- Persistencia oficial inicial da Mesa em 2026-05-01:
  - `cloudflare/d1/schema.sql`: adicionada tabela `mesa_scenes` para guardar a cena oficial da Mesa em JSON no D1
  - `cloudflare/src/mesa.js`: criado modulo de leitura, normalizacao e salvamento da cena
  - `cloudflare/src/index.js`: adicionadas rotas `GET /api/mesa/scene` e `PUT /api/mesa/scene`
  - `js/api.js`: adicionados metodos `getMesaScene()` e `saveMesaScene()`
  - `js/mesa-core.js` e `js/mesa-stage.js`: Mesa passa a carregar cena oficial quando a API esta ativa e salvar alteracoes do mestre no servidor, mantendo `localStorage` como fallback
  - `js/mesa-roster.js` e `mesa.html`: textos ajustados para indicar persistencia no servidor sem prometer realtime ainda
  - permissao consolidada: jogadores podem ler a cena oficial; apenas mestre pode salvar posicao, ordem e visibilidade de tokens
  - D1 remoto: schema aplicado em `armagedon` e tabela `mesa_scenes` confirmada
  - Worker publicado: `armagedon-api`, version ID `44ddb8ef-776e-4bdc-841b-9dd171af1690`
  - GitHub Pages publicado pela `main` com cache bust `2026-05-01-mesa-scene-1`
  - validacoes executadas: `node --check` em `js/` e `cloudflare/src/`; `git diff --check`; links wiki do Obsidian; `wrangler deploy --dry-run`; `wrangler d1 execute` remoto; `GET /api/health` com HTTP 200; `GET /api/mesa/scene` sem sessao com HTTP 401; `mesa.html`, `js/mesa-core.js` e `js/mesa-stage.js` publicados com HTTP 200
  - ~~pendencia: validar em navegador logado como mestre e jogador a persistencia visual completa da cena no site oficial~~ (HISTORICO — cumprida; conferido em 2026-08-16)

- Automacao do vault Obsidian em 2026-05-01:
  - `tools/update-obsidian-context.ps1`: criado script para gerar snapshot automatico do estado do repositorio
  - `.githooks/pre-commit`: criado hook versionado para atualizar e adicionar o snapshot do Obsidian antes de cada commit
  - `tools/install-obsidian-hooks.ps1`: criado instalador para configurar `core.hooksPath=.githooks` neste checkout
  - `docs/obsidian/10-SNAPSHOT-AUTOMATICO.md`: passa a ser gerado com branch, ultimo commit, alteracoes locais, paginas principais, estrutura de raiz e maiores arquivos locais
  - `docs/obsidian/00-INICIO.md`: atualizado com o comando de atualizacao e com a regra de leitura do snapshot
  - `README.md`: documentado o fluxo de automacao para reduzir contexto e tokens em sessoes futuras
  - regra operacional consolidada: toda etapa com alteracao de arquivo deve terminar com snapshot atualizado; commits usam hook automatico, etapas sem commit devem rodar o script manualmente
  - validacoes executadas: `.\tools\update-obsidian-context.ps1`; parser PowerShell dos scripts; links wiki do vault; `git diff --check`

- Vault Obsidian de contexto em 2026-05-01:
  - criado `docs/obsidian/` como base Markdown para abrir no Obsidian
  - adicionadas notas de entrada, contexto atual, arquitetura, decisoes, pendencias, deploy, ficha, mesa, regras e historico compacto
  - `README.md`: atualizado para apontar o novo vault como leitura rapida recomendada
  - objetivo: reduzir releitura completa do repositorio, melhorar obtencao de contexto e manter decisoes do projeto organizadas em arquivos versionados

- Polimento visual da ficha em 2026-05-01:
  - `css/ficha-responsive.css`: adicionada camada final para espacamento de secoes, alinhamento de cabecalhos, foco visivel, cards de habilidades/poderes, inventario e modal de rolagem
  - `ficha.html`: atualizado cache bust de `css/ficha-responsive.css` para `2026-05-01-sheet-polish`
  - escopo mantido em visual/ergonomia: sem alteracao em regras de jogo, persistencia, backend ou fluxo de dados
  - validacoes executadas: `node --check` nos JS principais; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; servidor local em `index.html`, `ficha.html`, `mesa.html` e `regras.html` com HTTP 200, sem MP4 e sem `/assets/`; Browser Use no painel do mestre, ficha de jogador, inventario, habilidades/poderes e modal de rolagem sem erros de console

- Brilho carmesim de cursor em 2026-05-01:
  - `css/ui.css`: adicionada camada pequena de glow vermelho carmesim centralizada no ponteiro, com `pointer-events: none` e sem interferir na leitura
  - `js/ui.js`: inicializacao global do efeito com `requestAnimationFrame`, apenas para ponteiro fino e respeitando `prefers-reduced-motion: reduce`
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: carregam a versao `2026-05-01-cursor-glow` de `css/ui.css` e `js/ui.js`
  - validacoes executadas: `node --check` em todos os JS; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; servidor local retornando 200 nas quatro paginas com `ui.css` e `ui.js` presentes

- Simplificacao de fundo visual em 2026-04-30:
  - fundos animados decorativos foram desligados em home, ficha, mesa e regras
  - o site passou a usar base preta estatica com brilho vermelho sutil, preservando a direcao dark fantasy sem custo de animacao de fundo
  - `css/index.css`, `css/style.css`, `css/mesa-base.css`, `css/regras.css`, `css/ficha-layout.css` e `css/ficha-inventory-memory.css` receberam overrides finais para remover orbitas, cinzas, brasas e glow dinamico de fundo
  - validacoes executadas: `node --check` em todos os JS; `git diff --check`; varredura HTML/CSS de referencias e IDs duplicados; Browser Use nas quatro paginas sem erros de console, sem MP4 e sem requisicoes a `/assets/`

- Otimizacao visual e de velocidade do site em 2026-04-30:
  - `.github/workflows/pages.yml`: o GitHub Pages deixou de copiar a pasta `assets/` inteira, evitando publicar o MP4 pesado `assets/sheet-fire-background.mp4` enquanto ele nao estiver em uso
  - `index.html`, `ficha.html`, `mesa.html` e `regras.html`: removidos `prefetch` cruzados entre paginas para reduzir requisicoes antecipadas no carregamento inicial
  - HTMLs principais: logos agora usam `width`, `height` e `decoding="async"`; a imagem principal da primeira dobra da home usa `fetchpriority="high"`
  - HTMLs principais: fallback de logo nao depende mais de `assets/logo-rpg-armagedon.png`; permanece limitado a arquivos publicados na raiz
  - CSS principal das paginas: adicionado suporte a `prefers-reduced-motion` e fallback visual para navegadores sem `backdrop-filter`
  - documentacao atualizada: `DEV_STATUS.md`, `VISUAL_RULES.md` e `DEPLOY_FREE.md`
  - validacoes executadas: `node --check` em todos os JS; varredura de referencias HTML/CSS e IDs duplicados; `git diff --check`; Browser Use nas quatro paginas; Edge headless em 1366x900 e 390x844
  - resultado de performance: pacote publicado estimado caiu cerca de 14 MB por nao publicar `assets/` inteiro

- Ajuste visual da ficha em 2026-04-30:
  - `js/ficha-core.js`: habilidades/poderes passam a abrir minimizados por padrao sempre que uma ficha e carregada
  - o estado de expandido/minimizado continua funcionando durante o uso da ficha, mas nao e mais reaproveitado para abrir a ficha expandida em acessos seguintes
  - ~~pendencia: validar no navegador antes de publicar~~ (HISTORICO — cumprida; conferido em 2026-08-16)

- Retomada de revisao em 2026-04-30:
  - a pasta antiga `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign` foi excluida com sucesso
  - a pasta oficial restante e `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign-git-sync`
  - `node --check` passou em 48 arquivos JavaScript de `js/`, `cloudflare/src/` e `server/src/`
  - varredura inicial nao encontrou arquivos inexistentes referenciados por `src` ou `href` nos HTMLs
  - varredura inicial nao encontrou IDs duplicados nos HTMLs
  - correcoes aplicadas durante a revisao estatica:
    - `cloudflare/src/sheet.js` agora preserva `id`, `type` e `trigger` das habilidades ao normalizar fichas no Worker
    - `js/ficha-soul.js` agora calcula o estado anterior da Essencia da Alma antes de atualizar `soulCore` no modo local
  - validacao adicional executada: `node --check` em `cloudflare/src/sheet.js`, `cloudflare/src/index.js`, `server/src/utils/sheet.js` e `js/ficha-core.js`
  - validacao funcional automatizada executada com Microsoft Edge headless:
    - normalizacao de habilidades do Worker preserva `id`, `type`, `trigger` e `desc`
    - login local do mestre funciona quando `ARMAGEDON_CONFIG` aponta para API local indisponivel
    - criacao de jogador local, abertura de ficha, criacao de habilidade, salvamento e recarregamento preservam dados
    - rolagem de dados retorna total numerico
    - concessao local de 100 Essencias rank 1 exibe progressao de Adormecido para Despertado no resumo
  - achado remanescente:
    - `server/src/routes/characters.js` nao possui a rota `POST /characters/:key/soul-essence`, embora o frontend chame essa rota quando a API esta ativa; isso afeta o backend Express/PostgreSQL legado, nao o Worker publicado
  - ~~pendencia aberta: continuar revisao funcional em navegador nas telas de ficha, mesa e regras~~ (HISTORICO — cumprida; conferido em 2026-08-16)

- Controle de arquivos `.md` desta etapa, em 2026-04-30:
  - `README.md`: registrado o status operacional da limpeza da pasta antiga, deixando claro que `rpg-campaign-git-sync` e a pasta oficial preservada
  - `DEV_STATUS.md`: registrado este resumo de controle para rastrear a etapa
  - validacao executada: listagem das pastas em `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp`
  - pendencia anterior resolvida: o diretorio vazio `rpg-campaign` foi apagado

- Limpeza operacional da pasta antiga:
  - tentativa de apagar `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign`
  - o conteudo interno foi removido
  - em nova tentativa, o diretorio vazio foi excluido com sucesso
  - `C:\Users\tiago\Desktop\Proxima Campanha\FichaApp\rpg-campaign-git-sync` foi mantida intacta como pasta oficial

- Registro operacional desta conversa:
  - o projeto oficial no Codex passou a ser `rpg-campaign-git-sync`
  - a conversa antiga ainda estava vinculada a `rpg-campaign`, por isso o Windows bloqueou apagar ou renomear a pasta antiga
  - comparacao meticulosa entre as pastas indicou `0` arquivos exclusivos na pasta antiga
  - a pasta oficial tem arquivos a mais e esta alinhada com `origin/main`, portanto segue sendo a fonte de verdade
  - proximos passos devem acontecer em novo chat/projeto apontando para `rpg-campaign-git-sync`
  - a pasta antiga so deve ser enviada para a Lixeira depois que chats, terminais e apps que ainda usam `rpg-campaign` forem fechados

- Pasta oficial de trabalho consolidada: toda alteracao futura deve usar `rpg-campaign-git-sync`, que e o checkout Git alinhado com `origin/main`
- A pasta antiga `rpg-campaign` permanece apenas como copia historica/local e nao deve ser usada para publicar
- Documentacao `.md` atualizada para registrar essa regra operacional antes do proximo passo
- Etapa anterior:
  - commit `3d7496b` publicado direto na `main`
  - GitHub Pages validado com sucesso
  - site publicado confirmado servindo os arquivos separados da ficha e da Mesa

- Textos da Mesa oficial atualizados para remover o aspecto de "mock/prototipo" no site publicado
- A interface agora comunica o estado real: personagens e status usam fichas online quando a API esta ativa, enquanto posicao/visibilidade da cena ainda ficam locais ate Durable Objects/WebSocket
- `mesa.html` atualizou a versao de cache dos scripts de roster e inspetor para evitar JS antigo no navegador
- Documentacao `.md` atualizada junto com a mudanca, conforme regra do projeto
- Etapa anterior:
  - Worker e backend legado passaram a normalizar Vida/Integridade antes de salvar
  - historico antigo: nesta etapa a Integridade maxima ainda derivava de Alma no servidor; isso foi alterado em 2026-05-09 para permitir edicao manual de `integMax`
- Antes disso:
  - transferencias de item e memoria entre jogadores no Worker passaram a validar tipo `player` e persistir origem, destino e auditoria em lote D1
- Mesa preparada para aparecer no GitHub Pages: `.github/workflows/pages.yml` agora copia `mesa.html`
- Frontend nao tenta mais carregar Socket.IO contra Worker por padrao; `realtimeEnabled` fica desligado em `js/runtime-config.js` ate Durable Objects/WebSocket existirem
- Sessao backend nao cai mais silenciosamente para modo local quando a API nao responde; a sessao e limpa para evitar divergencia entre navegador e D1
- Documentacao `.md` mantida junto com a mudanca, conforme regra do projeto
- Etapa anterior:
  - documentacao `.md` atualizada para reduzir contexto futuro e registrar obrigacao de manter docs junto com mudancas de site
- Antes disso, foram concluidas:
  - separacao incremental dos arquivos grandes de ficha e mesa
  - remocao do bloco Legacy da Mesa carregada
  - normalizacao de Vida/Integridade no frontend, Worker e backend legado
  - persistencia online dos ajustes de status feitos pela Mesa quando a API esta ativa

## 2026-05-09 - GitHub Pages Preparado Para Node 24

- Workflow `.github/workflows/pages.yml` atualizado para actions que ja publicaram releases compatíveis com Node 24:
  - `actions/checkout@v6`
  - `actions/configure-pages@v6`
  - `actions/upload-pages-artifact@v5`
  - `actions/deploy-pages@v5`
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` foi ativado no workflow para testar a migracao antes de ela virar padrao no GitHub Actions.
- `include-hidden-files: true` foi mantido no upload do Pages para garantir que `_site/.nojekyll` continue dentro do artefato publicado.
- Objetivo: remover o aviso de Actions em Node 20 e evitar quebra futura do deploy do Pages.
- Validacoes executadas antes do commit:
  - `npm run build:pages`
  - confirmar `_site/.nojekyll`
  - `git diff --check`
  - consulta do `action.yml` oficial de `actions/upload-pages-artifact@v5.0.0` confirmando o input `include-hidden-files`
  - push na `main` e `gh run watch` do workflow `Deploy GitHub Pages`

## 2026-05-09 - Polimento De Largura Do Painel Da Mesa

- Painel pessoal do jogador deixou de esticar indefinidamente em telas largas.
- Workbench inferior da Mesa agora limita a largura util do painel principal e preserva o inspetor lateral com largura estavel.
- Blocos internos do painel pessoal receberam largura maxima: hero, abas, recursos, atributos, inventario e areas de texto.
- `content-visibility` foi desligado somente no painel pessoal do jogador e no inspetor visivel para evitar blocos vazios durante rolagem/captura.
- `mesa.html` recebeu novo cache bust para `css/mesa-layout.css`, `css/mesa-roster.css` e `js/mesa-roster.js`.
- Validado com `npm run check:js`, `npm run test:mesa`, `npm run audit:static`, `npm run build:pages`, `npm run perf:mesa`, `git diff --check` e QA visual por Playwright em viewport larga e mobile.

## 2026-05-08 - Polimento Do Painel Do Jogador Na Mesa

- Painel pessoal do jogador foi reorganizado em abas: `Status`, `Atributos`, `Inventario`, `Memorias` e `Notas`.
- Aba `Status` agora prioriza Vida e Integridade com controles rapidos `-1`, `+1`, `0` e `Max`, mantendo os inputs numericos existentes.
- Painel passou a exibir feedback de sincronizacao: `Sincronizado`, `Salvando...`, `Erro ao salvar` ou `Salvo neste navegador`.
- Inventario ficou mais compacto: dano aparece apenas para itens do tipo arma e a descricao fica recolhida em `Detalhes`.
- O cache-busting de `mesa.html` foi atualizado para carregar os novos CSS/JS da Mesa no site publicado.
- Testes da Mesa foram atualizados para validar o fluxo real por abas, controles rapidos, inventario, memorias e persistencia online.
- Arquivos principais alterados nesta etapa:
  - `mesa.html`
  - `css/mesa-roster.css`
  - `js/mesa-core.js`
  - `js/mesa-roster.js`
  - `js/mesa-stage.js`
  - `tests/mesa.spec.cjs`
  - `DEV_STATUS.md`
  - `VISUAL_RULES.md`
  - `docs/obsidian/07-MESA.md`
  - `docs/obsidian/09-HISTORICO-DE-SESSOES.md`
- Validacoes executadas nesta etapa:
  - `npm run check:js`
  - `npm run audit:static`
  - `npm run test:mesa`
  - `npm run test:ficha`
  - `npm run perf:mesa`
  - `npm run build:pages`
  - `git diff --check`
  - `git fsck --no-dangling`
  - QA visual por Playwright em desktop e viewport estreito
- ~~Pendencia da etapa antes do deploy:~~ (HISTORICO — cumprida; conferido em 2026-08-16)
  - publicar na `main` e validar o site oficial apos o workflow do GitHub Pages.

## Ajustes de Gameplay Ja Consolidados

- Integridade substituiu Sanidade
- Integridade maxima e editavel manualmente:
  - Alma continua gerando modificador, mas nao sobrescreve o maximo salvo de Integridade
- Integridade atual pode ser ajustada pelo jogador na propria ficha e na Mesa
- Vida atual nao pode ultrapassar Vida maxima
- Integridade atual nao pode ultrapassar Integridade maxima
- Atributos sem limite superior
- Inventario:
  - minimo atual: 10 slots
  - jogadores nao veem controles de aumentar e diminuir slots
  - mestre pode ajustar slots quando permitido pela interface

## Arquivos Sensiveis

Mudancas nesses arquivos costumam impactar diretamente o funcionamento do site:

- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- `css/ficha-*.css`
- `css/mesa-*.css`
- `css/index.css`
- `css/regras.css`
- `js/ficha-*.js`
- `js/mesa-*.js`
- `js/auth.js`
- `js/regras.js`
- `js/api.js`
- `js/runtime-config.js`
- `cloudflare/src/index.js`
- `cloudflare/src/auth.js`
- `cloudflare/src/characters.js`
- `cloudflare/src/sheet.js`
- `cloudflare/src/soul-progression.js`
- `server/src/utils/sheet.js`

## Mapa Rapido de Arquivos

- Ficha:
  - `js/ficha-core.js`: estado, storage, normalizacao e salvamento
  - `js/ficha-sheet.js`: campos, atributos, barras, avatar e regras visuais da ficha
  - `js/ficha-master.js`: painel do mestre, jogadores, NPCs e monstros
  - `js/ficha-inventory.js`: inventario e transferencia de itens
  - `js/ficha-memories.js`: memorias e drops
  - `js/ficha-soul.js`: progressao por Essencias da Alma
  - `js/ficha-dice.js`: rolagem de dados
  - `js/ficha-init.js`: inicializacao e autosave
- Mesa:
  - `js/mesa-core.js`: estado, sessao e montagem do roster
  - `js/mesa-stage.js`: palco, tokens, persistencia e edicao de status
  - `js/mesa-renderer-v2.js`: renderer Canvas/Worker do palco da Mesa
  - `js/mesa-renderer-worker.js`: desenho OffscreenCanvas em Worker quando suportado
  - `js/mesa-roster.js`: lista de personagens
  - `js/mesa-inspector.js`: painel do token selecionado
  - `js/mesa-storage.js`: helpers de storage, numeros e visual de barras
  - `js/mesa-init.js`: reservado para inicializacao futura

## Proximas Frentes Recomendadas

1. Rodar `npm run test:mesa:online` com credenciais reais de mestre/jogador em variaveis de ambiente
2. Medir comportamento em maquina mais fraca e ajustar cap de `devicePixelRatio` se necessario
3. Normalizar thumbnails WebP/JPEG dos avatares grandes no fluxo de salvamento da ficha
4. Revisar responsividade da ficha, inventario e mesa
5. Se o teste autenticado passar, criar um usuario/ficha de teste dedicado para validar relay e persistencia sem tocar dados de campanha real

## Publicacao

Na maior parte das etapas recentes, o caminho mais seguro tem sido publicar:

- pasta `css`
- pasta `js`
- pasta `cloudflare`
- `ficha.html`
- `index.html`
- `mesa.html`
- `regras.html`
- arquivos `.md` alterados

Sempre confirmar os arquivos exatos da etapa antes do upload.

## Validacoes Recentes

- `node --check` em todos os JS de `js/`
- `node --check` em todos os JS de `cloudflare/src/`
- `node --check` em todos os JS de `server/src/`
- `npm run check:js`
- `npm run audit:static`
- `npm run build:pages`
- `npm run test:mesa`
- `npm run test:mesa:online`
- `npm run perf:mesa`
- `npx wrangler deploy --dry-run` em `cloudflare/`
- servidor estatico temporario respondeu `200` para `ficha.html` e `mesa.html`
- workflow de Pages revisado para incluir `mesa.html`
- Browser Use abriu `http://127.0.0.1:8012/mesa.html` sem erros de console registrados

## Etapa Echos (2026-06-15)

Sistema de Echos: manifestacoes residuais de monstros derrotados, colecionaveis pelos jogadores, com rank e XP proprios.

### Resumo do que mudou

- Monstro ganhou configuracao de drop de Echo na ficha (chance + raridade padrao), ao lado do drop de memoria.
- O mestre testa o drop e, em caso de sucesso, concede o Echo a um jogador ou NPC.
- Echos viram entidades proprias no banco (tabela `echos`), com nome, aparencia, descricao, habilidades/passivas e atributos derivados do monstro, alem de rank/XP independentes.
- Nova pagina `echos.html` lista, filtra, detalha e edita os Echos. Jogador edita apelido, anotacoes e imagem do proprio Echo; o mestre edita tudo, concede XP, transfere e remove.
- Transferencia de Echo reutiliza o fluxo de propostas (`transfer_proposals`, tipo `echo`): mestre transfere direto, jogador envia proposta com aceite.
- Mesa: o roster do mestre ganhou o grupo "Echos"; o mestre coloca o Echo de um jogador no palco como token aliado. O painel do jogador ganhou link para `echos.html`.

### Arquivos principais

- Novos: `echos.html`, `css/echos.css`, `js/echos-core.js`, `js/echos-page.js`, `js/echos-init.js`, `js/ficha-echos.js`, `cloudflare/src/echos.js`, `cloudflare/d1/migrations/0002_add_echos.sql`
- Backend alterado: `cloudflare/src/sheet.js` (`echoDropConfig`), `cloudflare/src/characters.js` (proposta/aceite tipo `echo`), `cloudflare/src/index.js` (rotas `/api/echos*`, upload de avatar de Echo), `cloudflare/d1/schema.sql`
- Frontend alterado: `js/api.js` (metodos de Echo), `js/ficha-core.js`, `js/ficha-sheet.js`, `js/mesa-core.js`, `js/mesa-roster.js`, `css/tokens.css` (tokens de raridade), `css/ficha.css`
- Navegacao + cache-busting: `index.html`, `ficha.html`, `mesa.html`, `regras.html`, `sugestoes.html`

### Validacoes executadas

- `npm run check:js`: OK (41 arquivos)
- `npm run audit:static`: OK
- `npx wrangler deploy --dry-run --config cloudflare/wrangler.toml`: bundle OK

### Pendencias / riscos (HISTORICO — fechados; conferido em 2026-08-16)

- A migracao `0002_add_echos.sql` precisa ser aplicada no D1 remoto antes do deploy do Worker (recria `transfer_proposals` e `transfer_audit` para aceitar `echo`).
- Invocacao na Mesa e feita pelo mestre (modelo master-invoke), pois a gravacao da cena (`PUT /api/mesa/scene`) e exclusiva do mestre. Permitir o jogador invocar o proprio Echo diretamente exige mudanca futura nas permissoes de escrita da cena.
- Um Echo so renderiza como token nos clientes que o tem no roster (mestre ve todos; jogador ve os proprios). O Echo de um jogador nao aparece no roster de outro jogador.

### Etapa Echos — controle de vida na Mesa (2026-06-15)

- Inspetor da Mesa passou a permitir ajustar Vida e Integridade ATUAIS dos tokens: mestre em qualquer token; jogador no proprio token e nos proprios Echos (`canEditCurrentStats` + `isOwnEchoToken`).
- Echos nao tem ficha, entao a vida do token de Echo segue caminho proprio: `POST /api/echos/:id/vitals` (mestre ou dono) salva `vidaAtual`/`integAtual`, e o canal realtime `mesa:echo:vitals` (novo tipo no `MesaRealtimeRoom`) sincroniza entre mestre e dono.
- Arquivos: `cloudflare/src/echos.js` (`setEchoVitals`), `cloudflare/src/index.js` (rota), `cloudflare/src/mesa-realtime.js` (tipo + relay com gating), `js/api.js` (`setEchoVitals`), `js/mesa-core.js` (isOwnEchoToken, applyEchoVitalsToMesa, broadcast/persist/realtime), `js/mesa-stage.js` (permissoes + branch do inspetor).
- Validado: `npm run check:js`, `npm run audit:static`, `wrangler dry-run`. Exige `wrangler deploy` (mudanca no Durable Object); sem mudanca no banco.
