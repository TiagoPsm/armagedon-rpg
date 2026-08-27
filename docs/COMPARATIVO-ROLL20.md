# Comparativo Técnico — Armagedom (Mesa Virtual) × Roll20

> **Data:** 2026-08-27 · **Revisão 2** (a 1ª é de 2026-07-05) · **Escopo:** compara o **código atual** do repositório `rpg-campaign-git-sync` (commit de referência `cb0192b`, Etapa 127) com o **estado do Roll20** (pós-Jumpgate) verificado em fontes oficiais em 2026-07-05. Onde a documentação interna do projeto diverge do código, este documento segue o código (ver §10).
>
> **O que mudou nesta revisão:** a coluna Armagedom foi remedida item a item contra o código. A revisão 1 congelou o retrato na Etapa ~37; de lá para cá entraram **grade funcional com snap** (42), **ping** (43), **régua** (44), **dados na Mesa com rolagem do servidor e rolagem secreta do mestre** (45, 79), **Fog of War** (47), **múltiplas cenas com pastas** (48-49, 89-97), **marcadores de condição** (46, 64), **mapa por cena com transform** (90, 113), **desenho com cone, seta, cor livre, opacidade e borracha parcial** (122-123, 126) e **busca com tags nas regras**. O escore geral saiu de **≈51% para ≈62%**. Nenhuma nota do Roll20 foi alterada.
>
> **Nota de renderização:** os diagramas Mermaid renderizam no github.com, VS Code e Obsidian; **não** renderizam no GitHub Pages padrão (Jekyll).

---

## 1. Resumo executivo

- **Escore geral de similaridade: ≈ 62%** (58 sub-itens em 6 categorias ponderadas; metodologia na §2). Era 51% na revisão 1 (2026-07-05). Similaridade ≠ qualidade: vários zeros são escolha de escopo.
- **Onde o Armagedom já compete de igual para igual:** infraestrutura de sync/permissões (autorização dupla UI + Durable Object, ACKs, validação server-side), vínculo token↔ficha em tempo real, camada secreta do mestre, zoom/pan/seleção/desenho, dados rolados no servidor (públicos e secretos), iniciativa, e o conjunto ficha + painel do mestre.
- **O que fechou desde a revisão 1:** as três lacunas que abriam o documento anterior foram atacadas — **Fog of War** existe (pincel cobrir/revelar, base da cena, mestre enxerga através), **rolagem na Mesa** existe e é sorteada pelo Durable Object com `crypto.getRandomValues` (pública, secreta do mestre, histórico de 20), e a **grade virou funcional** com snap opcional. Entraram também múltiplas cenas com pastas, ping, régua, marcadores de condição e mapa por cena.
- **As 3 maiores lacunas de hoje** (por peso × gap): **(1) Visão dinâmica** — Visão/segredo está em 42%: iluminação dinâmica e visão por token seguem inexistentes (no Roll20 exigem Plus/Pro); **(2) conteúdo compartilhado** — handouts e export/import de ficha e cena continuam em zero, e a rolagem feita na ficha ainda não chega à mesa; **(3) automação programável** — macros, tabelas roláveis, cartas e API são zero (decisão consciente, ver §9.2).
- **Os 3 maiores diferenciais sobre o Roll20:** segredo do mestre **garantido no servidor** (tokens `dm` nunca chegam ao cliente do jogador), **fallback offline** em localStorage, e o **sistema da casa nativo** (Echos com drop/rank/XP, Núcleo da Alma, transferências atômicas auditadas) — que no Roll20 exigiria sheet custom + Mod scripts do plano Pro.
- **Roadmap sugerido (§9.2):** executando as 5 primeiras prioridades (rolagem da ficha na mesa, export/backup, handouts, toque completo, auras), o escore estimado sobe para **~70%**.
- **Aviso:** dos 3 pontos de documentação interna desatualizada apontados na revisão 1, **2 foram corrigidos**; resta `docs/obsidian/07-MESA.md` (§10).

---

## 2. Metodologia

**Escala de nota por sub-item, aplicada às duas plataformas:**

| Nota | Significado | Qualidade |
|---|---|---|
| 0 | Ausente | — |
| 1 | Parcial/rudimentar | Baixa |
| 2 | Funcional e utilizável em sessão real | Média |
| 3 | Completo/robusto | Alta |

**Cobertura por sub-item:** `cobertura = min(Armagedom ÷ Roll20, 1)` — com teto em 100%: superioridade pontual do Armagedom não infla o escore de similaridade (vira observação qualitativa).

**Diferenciais:** sub-itens em que Roll20 = 0 e Armagedom > 0 saem do denominador e são listados à parte (§5.2) — não faz sentido medir "similaridade com o Roll20" em algo que o Roll20 nem tenta fazer.

**Não documentado (ND):** afirmações sobre o Roll20 sem fonte oficial encontrável (ex.: comportamento interno de servidores) ficam **fora da pontuação**, marcadas como informativas.

**Agregação:** média simples dos sub-itens dentro de cada categoria (os pesos já foram definidos por categoria; sub-pesos criariam dupla ponderação).

**Escore geral:** `Σ(peso × cobertura da categoria) ÷ Σ(pesos) × 100`, com pesos definidos pelo mestre da campanha:

| Categoria | Peso |
|---|---|
| C1 Núcleo tático da mesa | 5 |
| C5 Fichas e conteúdo | 5 |
| C2 Visão e segredo | 4 |
| C3 Automação de jogo | 4 |
| C7 Infra, segurança e permissões | 4 |
| C6 Plataforma e robustez | 2 |
| C4 Comunicação na mesa | **0 — informativa, fora da pontuação** |

Σ pesos considerados = **24**.

**Política de fontes:** afirmações sobre o Roll20 citam prioritariamente o Help Center oficial (`help.roll20.net`) e o blog oficial; a wiki (`wiki.roll20.net`) é comunitária e aparece marcada como tal. Todas com data de acesso 2026-07-05, listadas em §11. Fatos sobre o Armagedom citam arquivo do repositório.

**Aviso de leitura:** o escore mede **similaridade de funcionalidades com o Roll20**, não qualidade absoluta. O Roll20 é um SaaS multi-campanha com 13+ anos de desenvolvimento; o Armagedom é um portal privado de 1 sala feito sob medida para um sistema próprio. Vários "0" do Armagedom são escolhas de escopo (ex.: chat — o grupo usa Discord), não defeitos.

---

## 3. Checklist de funcionalidades por categoria

### 3.1 C1 — Núcleo tático da mesa (peso 5)

| # | Sub-item | Roll20 | Armagedom | Observação |
|---|---|---|---|---|
| 1.1 | Múltiplas páginas/cenas | **3** — páginas ilimitadas, Player Ribbon arrastável, split the party, Page Folders[^4][^5] | **2** — cenas ilimitadas no D1 com pastas, busca, renomear/duplicar/excluir e troca sincronizada por `mesa:scene:switch`; gaveta com foco preso (`mesa-scenes.js`, rotas `/api/mesa/scenes`) | Falta o equivalente ao Player Ribbon: todos os jogadores veem sempre a cena ativa (sem split the party) |
| 1.2 | Fundo de mapa (upload/entrega) | **3** — Art Library, upload por plano, alinhamento de mapa[^30] | **2** — upload WebP por orçamento (mira 4096px, q 0.92), **um mapa por cena**, transform de posição/escala no painel, entrega WebRTC P2P → WS chunked 64KB → R2, cache SHA-256 em IndexedDB (`mesa-map.js`) | Entrega P2P é sofisticada; falta biblioteca de assets |
| 1.3 | Grade configurável | **3** — 70px/unidade, quadrada/hex H/hex V, escala (5 ft default, ft/m/km/mi), 4 regras de diagonal, cor/opacidade[^3] | **2** — grade amarrada ao MAPA: célula em fração da largura da imagem, offset X/Y, cor, opacidade, liga/desliga, persistida na cena e sincronizada por `mesa:grid:update` (`mesa-grid.js`) | Só quadrada; a escala de medição é fixa (1 célula = 1,5 m na régua), sem unidades configuráveis nem regra de diagonal. Sem isométrica em nenhum dos dois |
| 1.4 | Snap-to-grid | **3** — snap padrão; Alt desativa temporariamente[^8] | **2** — encaixe opcional por cena: ao soltar, o token cai na célula e o tamanho é quantizado em NxN células (`mesaConformTokenToGrid`, `mesa-grid.js`) | Falta a tecla que desativa o snap momentaneamente |
| 1.5 | Criação/edição de tokens | **3** — qualquer imagem no Objects Layer vira token; menu radial[^8] | **2** — tokens nascem do roster de fichas (`addTokenToStage`, `mesa-stage.js:1649`); sem token avulso de imagem arbitrária | Modelo do Armagedom é mais estruturado, porém menos flexível |
| 1.6 | Barras de status | **3** — 3 barras vinculáveis a atributos, sync bidirecional[^8] | **2** — 2 barras (Vida/Integridade) vinculadas à ficha, visibilidade por token (`statsVisibleToPlayers`) e liga/desliga local das barras no palco (Etapa 114) | Barras presas a Vida/Integridade, não a atributos arbitrários; visibilidade por token é um plus do Armagedom |
| 1.7 | Auras e marcadores de status | **3** — 2 auras (círculo/quadrado, cor) + 40+ markers + dots[^8] | **2** — 12 condições com ícone (veneno, sangramento, atordoado, medo, morto…), até 8 por token, painel próprio pelo botão do token ou pelo inspetor, sincronizadas e persistidas (`MESA_STATUS_MARKERS` em `mesa-stage.js`, UI em `mesa-markers.js`); mais os badges de tipo e "Oculto"/"Mestre" | **Sem auras** (círculo de alcance) — é o que falta para 3 |
| 1.8 | Escala e rotação de token | **3** — resize com snap + rotação livre[^8] | **2** — escala 0,1–12 pelas 8 alças, com contra-escala do enfeite e conformidade com a grade; **sem rotação** (`MESA_TOKEN_SCALE_MIN/MAX`, `mesa-stage.js`) | |
| 1.9 | Camadas | **3** — Map, Objects & Tokens, GM Info Overlay, Dynamic Lighting e Foreground[^6][^7] | **2** — 3 camadas (`tokens`, `dm`, `map` via `data-active-layer`); camada map aceita só o fundo, não objetos múltiplos | Ver §3.2 para a força real da camada `dm` |
| 1.10 | Zoom e pan | **3** — zoom/pan nativos | **3** — 25–500% (slider + botões + roda), pan por RMB/espaço, CSS transform (`mesa-map.js`, `ZOOM_MIN`/`ZOOM_MAX`) | Comparável |
| 1.11 | Seleção múltipla | **3** — rubber-band, grupo | **3** — rubber-band + caixa com 8 handles + multi-seleção de tokens e traços (`mesa-select.js`) | Comparável |
| 1.12 | Ferramentas de desenho | **3** — desenho livre, formas, texto | **2** — lápis, linha, retângulo, elipse, **cone de área** (53°) e **seta**; paleta + cor livre, opacidade, espessura 1–12, borracha que apaga só o trecho tocado, Ctrl+Z do próprio traço, simplificação de curva, coordenadas em frações 0–1 (`mesa-drawing.js`) | **Sem ferramenta de texto**: existiu entre as Etapas 123-125 e foi retirada na 126 por decisão do mestre |
| 1.13 | Vínculo token ↔ ficha | **3** — "Represents" + barras linkadas[^8] | **3** — bidirecional em tempo real via `mesa:sheet:patch` (edição no token reflete na ficha e vice-versa) | Comparável; Armagedom valida ownership no servidor |
| 1.14 | Controle de movimento | **3** — "Controlled By" por token[^24] | **3** — ownership por token + trava global do mestre (`playersMoveLocked`, persistida no Durable Object) | Trava global não existe nativamente no Roll20 |

**Cobertura C1 = 0,76** (10,67 ÷ 14) — era 0,62 na revisão 1

### 3.2 C2 — Visão e segredo (peso 4)

| # | Sub-item | Roll20 | Armagedom | Observação |
|---|---|---|---|---|
| 2.1 | Fog of War manual | **3** — "Hide/Reveal Mask", **grátis para todos**, retângulo + polígono, hide/reveal/página inteira[^9][^10] | **2** — névoa amarrada ao mapa: base da cena (`hidden`/`revealed`) + pincel circular cobrir/revelar, até 400 operações, canvas dedicado acima dos tokens, jogador opaco e mestre a 0,4 (enxerga através), master-only no DO e persistida na cena (`mesa-fog.js`, Etapa 47) | Falta pincel retangular/poligonal; o resto do fluxo do Roll20 está coberto |
| 2.2 | Iluminação dinâmica / linha de visão | **3** — requer Plus/Pro (só o criador), barreiras/portas/janelas, "Update on Drop"[^11][^13] | **0** — inexistente | |
| 2.3 | Visão por token | **3** — visão, night/nocturnal vision com dimming, luz emitida[^12] | **0** — inexistente | |
| 2.4 | Camada secreta do GM | **3** — GM Info Overlay[^6] | **3** — camada `dm`: tokens e desenhos invisíveis a jogadores; mestre vê esmaecido (opacity 0.52) | Paridade funcional |
| 2.5 | Garantia server-side do segredo | **ND** — modelo de entrega de dados ocultos não documentado publicamente | **Fato de código** — tokens `dm` são filtrados no `GET /api/mesa/scene` e **nunca** retransmitidos a jogadores pelo Durable Object (`cloudflare/src/index.js`, `mesa-realtime.js`) | **Diferencial do Armagedom** — o segredo não depende do cliente |

**Cobertura C2 = 0,42** (1,67 ÷ 4 pontuáveis) — era 0,25 na revisão 1

### 3.3 C3 — Automação de jogo (peso 4)

| # | Sub-item | Roll20 | Armagedom | Observação |
|---|---|---|---|---|
| 3.1 | Rolagem pública na mesa | **3** — /roll no chat, visível a todos, 3D dice[^14] | **3** — painel de dados na Mesa: o cliente PEDE e **quem sorteia é o Durable Object** com `crypto.getRandomValues`; o resultado chega a todos com rótulo, histórico das últimas 20 entregue no boot, e modo local (sem backend) rolando no próprio cliente (`mesa-dice.js`, Etapas 45 e 79) | Sem dados 3D (cosmético). Rolar no servidor é à prova de trapaça |
| 3.2 | Sintaxe de expressões de dados | **3** — Dice Reference: kh/kl, explosão, reroll, sucessos, cs/cf[^15] | **2** — d4–d100, expressão livre XdY+Z, modificador, vantagem/desvantagem (rola a fórmula inteira duas vezes), crítico/desastre só no d20 com um dado; mesmas regras na ficha, na Mesa e no Worker (`ficha-dice.js`, `mesa-dice.js`, `mesa-realtime-rules.js`) | Cobre o sistema da casa; sem keep/drop/explosão genéricos |
| 3.3 | Rolagem secreta do GM | **3** — /gmroll, /w gm[^14] | **3** — a flag `secret` só vale para quem tem papel master (de jogador é ignorada, sem erro) e o resultado vai por `broadcastToMasters`; o histórico do `mesa:ready` é filtrado por papel, então quem entra depois não recebe a rolagem secreta (`mesa-realtime.js`, Etapa 79) | |
| 3.4 | Macros e token actions | **3** — Collections, quickbar, Abilities, Token Actions contextuais[^17] | **0** — inexistente | |
| 3.5 | Turn tracker | **3** — itens custom, Round Calculation ±1, @{tracker}[^16] | **2** — tracker do mestre com fases (rolagem/ordem), rounds, avanço de turno, entradas secretas da camada dm e NPC/monstro rolando sozinho; tudo preservado na cena (`mesa-initiative.js`, Etapa 77) | Sem itens custom nem contadores livres |
| 3.6 | Rolagem de iniciativa integrada | **3** — via ficha/macro + &{tracker}[^16] | **3** — banner para o jogador rolar 1d20 + Agilidade/3 com 1 clique, ordenação automática por total (`mesa-initiative.js:199-217`) | UX do Armagedom é mais direta que a do Roll20 para o sistema da casa |
| 3.7 | Tabelas roláveis | **3** — Collections, loot/críticos, table tokens[^18] | **0** — inexistente | Único gerador aleatório server-side: drop de memórias/Echos de monstro (`/transfers/memories/monster-roll`) |
| 3.8 | Decks de cartas | **3** — deck 54 padrão + custom, mãos, mesa[^18] | **0** — inexistente | |
| 3.9 | Automação programável | **3** — Mod Scripts (API) Pro, sandbox server-side, state persistente[^20][^21] | **0** — inexistente | |

**Cobertura C3 = 0,48** (4,33 ÷ 9) — era 0,26 na revisão 1

### 3.4 C4 — Comunicação na mesa (peso 0 — informativa, fora da pontuação)

O grupo joga com Discord; estes itens ficam registrados apenas para completude do retrato. Peso 0 **não** quer dizer que nada foi feito: ping e régua entraram nas Etapas 43 e 44 e são usados em combate.

| # | Sub-item | Roll20 | Armagedom |
|---|---|---|---|
| 4.1 | Chat de texto | **3** — persistente, com rolagens[^14] | **0** — só o painel de dados tem histórico |
| 4.2 | Sussurro (/w) | **3**[^14] | **0** |
| 4.3 | Ping no mapa | **3** — via select tool, visível a todos[^27] | **3** — Alt+clique emite `mesa:ping` para todos, pulso de 2s com o nome de quem pingou, coordenadas em fração do MAPA (acompanha pan/zoom), canal efêmero que não entra na cena (`mesa-ping.js`) |
| 4.4 | Régua/medição | **3** — waypoints (Q), unidades da página, token segue trajeto[^27] | **2** — Shift+arrastar mede em células e metros (1 célula = 1,5 m) e o traçado é transmitido a 10Hz para todos verem, com o nome do autor (`mesa-ruler.js`) |
| 4.5 | Áudio/vídeo integrado | **2** — WebRTC P2P (~5 pessoas confortável)[^29] | **0** — há WebRTC no projeto, mas só para entregar o mapa |
| 4.6 | Emotes/falar como personagem | **3** — /em, "Speak As"[^14][^24] | **0** |
| 4.7 | Jukebox/áudio ambiente | **3** — independente do A/V[^29] | **0** |

### 3.5 C5 — Fichas e conteúdo (peso 5)

| # | Sub-item | Roll20 | Armagedom | Observação |
|---|---|---|---|---|
| 5.1 | Fichas estruturadas | **3** — sheets por sistema + Charactermancer[^23] | **3** — ficha nativa do sistema: 5 atributos, Vida, Integridade, Núcleo da Alma (rank 1–7/XP/pesadelos), habilidades (id/name/type/trigger/desc), passivas, memórias (`ficha-core.js`, `cloudflare/src/sheet.js`) | Feita sob medida — cobre 100% do sistema da casa |
| 5.2 | Edição total pelo mestre | **3** — GM edita tudo | **3** — painel do mestre: criar/remover jogadores, NPCs e monstros; editar qualquer ficha (`ficha-master.js`) | Comparável |
| 5.3 | Rolagem a partir da ficha | **3** — botões da sheet rolam no chat, visíveis à mesa[^23] | **1** — a bandeja de dados da ficha continua **privada ao navegador**: não rola direto de atributo e não transmite. Quem quer rolar para a mesa usa o painel da Mesa (3.1), digitando a fórmula de novo (`ficha-dice.js`) | Item mais barato do roadmap: o canal e o motor já existem, falta ligar os dois |
| 5.4 | Inventário estruturado | **2** — depende da sheet; genérico | **3** — slots com capacidade, tipos (arma/armadura/acessório), dano, mitigação de armadura, equipar (`ficha-inventory.js`) | Armagedom superior (cap em 100%) |
| 5.5 | Transferência de itens com auditoria | **1** — não nativo (manual ou via Mod scripts Pro) | **3** — propostas com aceite, efetivação atômica em `DB.batch`, auditoria imutável em `transfer_audit` (`cloudflare/src/index.js`) | Armagedom superior (cap em 100%) |
| 5.6 | Companheiros vinculados com progressão | **1** — possível manualmente (ficha extra) | **3** — Echos: drop de monstro, rank 1–7, XP com limites por rank, invocação na mesa, transferência com consentimento (`echos`, D1) | Armagedom superior (cap em 100%) |
| 5.7 | Progressão/XP automatizada | **1** — depende de sheetworkers por sistema | **3** — Núcleo da Alma: essência, saturação, pesadelos, ganho de atributos com tetos por rank, auditado em `soul_audit` | Armagedom superior (cap em 100%) |
| 5.8 | Compêndio/regras integrado | **3** — compêndios licenciados pesquisáveis, drag-and-drop[^23] | **2** — `regras.html`: posts do mestre com **busca por título/conteúdo/tag** e **filtro por tag clicável** (`regras.js`) | Falta o conteúdo licenciado e o arrastar-para-a-ficha do Roll20 |
| 5.9 | Handouts/notas compartilhadas | **3** — handouts com imagem e permissão por jogador[^24] | **0** — inexistente | |
| 5.10 | Import/export de personagem | **3** — Roll20 Characters (ex-Vault); nuance: jogo free aceita só 3 exports[^19] | **0** — sem export/import JSON de ficha ou cena | |
| 5.11 | Conteúdo pronto/marketplace | **3** — marketplace, módulos | **0** — estruturalmente N/A (sistema próprio), mas contado por honestidade | |
| 5.12 | Permissões por personagem | **3** — "In Player's Journals" + "Can Be Edited & Controlled By"[^24] | **2** — ownership binário (dono edita a própria; mestre tudo), validado no Worker e no DO; sem separar "ver" de "editar" | |
| 5.13 | Avatares/arte | **3** — Art Library com cotas por plano[^30] | **2** — upload R2 (webp/jpeg, máx 2MB), avatar por personagem e por Echo; sem biblioteca | |

**Cobertura C5 = 0,64** (8,33 ÷ 13) — era 0,62 na revisão 1

### 3.6 C6 — Plataforma e robustez (peso 2)

| # | Sub-item | Roll20 | Armagedom | Observação |
|---|---|---|---|---|
| 6.1 | Mobile/touch | **2** — app delistado (fev/2026); navegador móvel recomendado; fichas otimizadas, tabletop completo fraco em phone[^25][^26] | **1** — responsivo até 480px e **parte** da mesa já fala Pointer Events (arrastar token, ping, régua, névoa, painéis); **desenho e seleção por área continuam presos a mouse events**, então não respondem ao toque | Meio caminho: o token se move no dedo, o desenho não. Nenhum dos dois resolve bem o tabletop em celular |
| 6.2 | Offline/local | **0** — exige conexão | **2** — fallback completo em localStorage quando a API cai; sem merge ao reconectar | **Diferencial do Armagedom** (fora da fórmula) |
| 6.3 | Desempenho de renderização | **2** — Jumpgate melhorou (60 FPS default)[^1] | **2** — DOM renderer leve, render incremental por assinatura, limite de 120 tokens validado no Worker | Escalas diferentes, ambos adequados ao uso |
| 6.4 | Acessibilidade | **1** — limitada | **1** — aria parcial, `prefers-reduced-motion`, contraste AA no texto principal; steppers 30px < 44px | Empate em "parcial" |
| 6.5 | Compatibilidade de navegadores | **3** — Chrome/Firefox/Edge suportados oficialmente | **2** — funciona nos navegadores modernos; sem matriz de teste formal | |
| 6.6 | Peso/otimização de assets | **2** — assets pesados, cotas por plano[^30] | **3** — WebP, minify CSS/JS, cache-busting `?v=`, sem bundler, `audit:static` valida referências | Armagedom superior (cap em 100%) |

**Cobertura C6 = 0,83** (4,17 ÷ 5 pontuáveis)

### 3.7 C7 — Infra, segurança e permissões (peso 4)

| # | Sub-item | Roll20 | Armagedom | Observação |
|---|---|---|---|---|
| 7.1 | Autenticação | **3** — contas da plataforma | **3** — JWT HS256 (7 dias), PBKDF2 25k + salt/usuário + pepper, migração transparente de sha256 legado, throttle de login 8 falhas/10 min (`cloudflare/src/auth.js`) | Comparável para o escopo |
| 7.2 | Recuperação de senha | **3** — fluxo de conta padrão | **0** — mestre reseta manualmente | |
| 7.3 | Papéis e granularidade | **2** — GM/jogador binário + campos por personagem[^24] | **2** — master/player binário + ownership por recurso | Empate |
| 7.4 | Sincronização em tempo real | **3** — sync da plataforma | **3** — WebSocket via Durable Object: ~20 tipos de mensagem, ACKs com `messageId`, broadcast segmentado (todos/mestres/audiência da ficha), reconexão 1.8s (`mesa-realtime.js`, `js/api.js`) | Comparável |
| 7.5 | Persistência + validação server-side | **3** — persistência da plataforma | **3** — D1 como fonte de verdade; `PUT /mesa/scene` valida 120 tokens, posição 0–100, escala 0.25–4; normalização de ficha preserva campos e clampa recursos (`sheet.js`) | Comparável |
| 7.6 | Resolução de conflitos | **2** — last-write-wins com sync contínuo | **1** — last-write-wins; `PUT` de ficha sem versionamento/locking otimista pode sobrescrever edição concorrente | Janela otimista no cliente mitiga parcialmente |
| 7.7 | Auditoria imutável | **0** — sem log de auditoria exposto ao GM | **2** — `transfer_audit` + `soul_audit` imutáveis; sem audit de edição de ficha | **Diferencial do Armagedom** (fora da fórmula) |
| 7.8 | Rate limiting além do login | **ND** — não documentado | **1** — só no login | Informativo (fora da fórmula) |
| 7.9 | Tolerância a falhas/degradação | **2** — reconexão da plataforma | **2** — fallback localStorage, reconexão automática, trava de movimento persistida no storage do DO (sobrevive à hibernação) | Empate |
| 7.10 | Snapshots/backup/versionamento | **2** — personagens via Vault; jogos persistem na plataforma | **1** — cenas guardadas no D1 funcionam como cópias manuais do tabuleiro (duplicar antes de mexer), mas **não há export para fora do banco nem histórico de ficha** | |
| 7.11 | Multi-salas/campanhas | **3** — jogos ilimitados por conta | **0** — Durable Object único, sala `default` | |

**Cobertura C7 = 0,67** (6,00 ÷ 9 pontuáveis) — era 0,61 na revisão 1

---

## 4. Matriz consolidada de recursos

Visão de varredura rápida (justificativas na §3). Legenda: nota 0–3; `DIF` = diferencial do Armagedom (fora da fórmula); `ND` = não documentado no Roll20 (fora da fórmula); `INF` = categoria informativa (peso 0); **↑** = subiu desde a revisão 1 (2026-07-05).

| Cat. | # | Sub-item | R20 | Arm | Situação |
|---|---|---|---|---|---|
| C1 | 1.1 | Múltiplas páginas/cenas | 3 | 2 | Parcial ↑ |
| C1 | 1.2 | Fundo de mapa | 3 | 2 | Parcial |
| C1 | 1.3 | Grade configurável | 3 | 2 | Parcial ↑ |
| C1 | 1.4 | Snap-to-grid | 3 | 2 | Parcial ↑ |
| C1 | 1.5 | Criação/edição de tokens | 3 | 2 | Parcial |
| C1 | 1.6 | Barras de status | 3 | 2 | Parcial |
| C1 | 1.7 | Auras e marcadores | 3 | 2 | Parcial ↑ |
| C1 | 1.8 | Escala e rotação | 3 | 2 | Parcial |
| C1 | 1.9 | Camadas | 3 | 2 | Parcial |
| C1 | 1.10 | Zoom e pan | 3 | 3 | Paridade |
| C1 | 1.11 | Seleção múltipla | 3 | 3 | Paridade |
| C1 | 1.12 | Ferramentas de desenho | 3 | 2 | Parcial |
| C1 | 1.13 | Vínculo token↔ficha | 3 | 3 | Paridade |
| C1 | 1.14 | Controle de movimento | 3 | 3 | Paridade |
| C2 | 2.1 | Fog of War manual | 3 | 2 | Parcial ↑ |
| C2 | 2.2 | Iluminação dinâmica | 3 | 0 | Lacuna |
| C2 | 2.3 | Visão por token | 3 | 0 | Lacuna |
| C2 | 2.4 | Camada secreta do GM | 3 | 3 | Paridade |
| C2 | 2.5 | Segredo server-side | ND | — | **DIF** |
| C3 | 3.1 | Rolagem pública na mesa | 3 | 3 | Paridade ↑ |
| C3 | 3.2 | Sintaxe de dados | 3 | 2 | Parcial |
| C3 | 3.3 | Rolagem secreta do GM | 3 | 3 | Paridade ↑ |
| C3 | 3.4 | Macros/token actions | 3 | 0 | Lacuna |
| C3 | 3.5 | Turn tracker | 3 | 2 | Parcial |
| C3 | 3.6 | Iniciativa integrada | 3 | 3 | Paridade |
| C3 | 3.7 | Tabelas roláveis | 3 | 0 | Lacuna |
| C3 | 3.8 | Decks de cartas | 3 | 0 | Lacuna |
| C3 | 3.9 | Automação programável | 3 | 0 | Lacuna |
| C4 | 4.1–4.7 | Chat 0, sussurro 0, **ping 3**, **régua 2**, A/V 0, emotes 0, jukebox 0 | 2–3 | 0–3 | INF (peso 0) |
| C5 | 5.1 | Fichas estruturadas | 3 | 3 | Paridade |
| C5 | 5.2 | Edição total pelo mestre | 3 | 3 | Paridade |
| C5 | 5.3 | Rolagem a partir da ficha | 3 | 1 | Lacuna |
| C5 | 5.4 | Inventário estruturado | 2 | 3 | **Arm superior** |
| C5 | 5.5 | Transferências auditadas | 1 | 3 | **Arm superior** |
| C5 | 5.6 | Companheiros (Echos) | 1 | 3 | **Arm superior** |
| C5 | 5.7 | Progressão automatizada | 1 | 3 | **Arm superior** |
| C5 | 5.8 | Compêndio/regras | 3 | 2 | Parcial ↑ |
| C5 | 5.9 | Handouts | 3 | 0 | Lacuna |
| C5 | 5.10 | Import/export | 3 | 0 | Lacuna |
| C5 | 5.11 | Marketplace | 3 | 0 | Lacuna (N/A estrutural) |
| C5 | 5.12 | Permissões por personagem | 3 | 2 | Parcial |
| C5 | 5.13 | Avatares/arte | 3 | 2 | Parcial |
| C6 | 6.1 | Mobile/touch | 2 | 1 | Parcial |
| C6 | 6.2 | Offline/local | 0 | 2 | **DIF** |
| C6 | 6.3 | Desempenho | 2 | 2 | Paridade |
| C6 | 6.4 | Acessibilidade | 1 | 1 | Paridade |
| C6 | 6.5 | Navegadores | 3 | 2 | Parcial |
| C6 | 6.6 | Otimização de assets | 2 | 3 | **Arm superior** |
| C7 | 7.1 | Autenticação | 3 | 3 | Paridade |
| C7 | 7.2 | Recuperação de senha | 3 | 0 | Lacuna |
| C7 | 7.3 | Papéis | 2 | 2 | Paridade |
| C7 | 7.4 | Sync tempo real | 3 | 3 | Paridade |
| C7 | 7.5 | Persistência/validação | 3 | 3 | Paridade |
| C7 | 7.6 | Conflitos | 2 | 1 | Parcial |
| C7 | 7.7 | Auditoria imutável | 0 | 2 | **DIF** |
| C7 | 7.8 | Rate limiting | ND | 1 | ND |
| C7 | 7.9 | Tolerância a falhas | 2 | 2 | Paridade |
| C7 | 7.10 | Snapshots/backup | 2 | 1 | Parcial ↑ |
| C7 | 7.11 | Multi-salas | 3 | 0 | Lacuna |

---

## 5. Pontuação ponderada

### 5.1 Escore por categoria

| Categoria | Peso | Cobertura | Peso × Cobertura | Contribuição no escore | Revisão 1 |
|---|---|---|---|---|---|
| C1 Núcleo tático | 5 | 0,76 (10,67/14) | 3,81 | 15,9% | 0,62 |
| C5 Fichas e conteúdo | 5 | 0,64 (8,33/13) | 3,21 | 13,4% | 0,62 |
| C2 Visão e segredo | 4 | 0,42 (1,67/4) | 1,67 | 6,9% | 0,25 |
| C3 Automação | 4 | 0,48 (4,33/9) | 1,93 | 8,0% | 0,26 |
| C7 Infra/segurança | 4 | 0,67 (6,00/9) | 2,67 | 11,1% | 0,61 |
| C6 Plataforma | 2 | 0,83 (4,17/5) | 1,67 | 6,9% | 0,83 |
| C4 Comunicação | 0 | — (informativa) | — | — | — |
| **Escore geral** | **24** | | **14,94 ÷ 24** | **≈ 62%** | **≈ 51%** |

**Leitura:** o Armagedom cobre hoje cerca de **dois terços** do que o Roll20 oferece nas categorias que importam para esta campanha. O salto de 51% para 62% veio quase todo das duas categorias que a revisão 1 apontou como piores: **visão/segredo subiu de 25% para 42%** (Fog of War) e **automação de 26% para 48%** (rolagem na Mesa, pública e secreta). O **núcleo tático virou a categoria mais forte depois da plataforma** (76%), com cenas múltiplas, grade funcional, snap e marcadores de condição.

O que sobrou de fraco é de outra natureza: em C2 falta **visão dinâmica** (iluminação e visão por token), que no Roll20 é recurso pago e no Armagedom seria a peça mais cara do projeto; em C3, macros/tabelas/cartas/API são **decisão consciente** de não fazer (§9.2); e em C5 o que trava a nota são três itens baratos e ainda em zero — rolagem da ficha na mesa, handouts e export/import.

### 5.2 Diferenciais do Armagedom (fora da fórmula)

Recursos onde o Roll20 não compete — excluídos do denominador para não inflar a similaridade:

1. **Segredo garantido no servidor** (2.5) — tokens da camada `dm` nunca chegam ao cliente do jogador, nem por REST nem por WebSocket. No Roll20 esse modelo não é documentado publicamente.
2. **Fallback offline em localStorage** (6.2) — a mesa e as fichas continuam operáveis com a API fora do ar; o Roll20 exige conexão.
3. **Auditoria imutável de transferências e progressão** (7.7) — `transfer_audit` e `soul_audit` registram quem fez o quê; o Roll20 não expõe auditoria ao GM.
4. **Sistema da casa nativo** (pontuado em 5.4–5.7, com cap) — inventário com capacidade/armadura, transferências com consentimento atômicas (`DB.batch`), Echos com drop/rank/XP e Núcleo da Alma com pesadelos: no Roll20 isso exigiria sheet custom + Mod scripts (Pro).
5. **Entrega de mapa em 3 vias** (dentro de 1.2) — WebRTC P2P → WebSocket chunked → R2, com cache SHA-256 no jogador.

---

## 6. Modelagem de interações

### 6.1 Arquitetura lado a lado

O Armagedom separa REST (persistência via Worker → D1/R2) de tempo real (Durable Object). O Roll20 é descrito como caixa observável — os internals não são documentados publicamente.

```mermaid
flowchart LR
    subgraph ARM["Armagedom"]
        direction LR
        AC1["Cliente mestre"] -->|"REST + JWT"| AW["Worker armagedon-api"]
        AC2["Cliente jogador"] -->|"REST + JWT"| AW
        AC1 <-->|"WebSocket"| ADO["Durable Object MesaRealtimeRoom"]
        AC2 <-->|"WebSocket"| ADO
        AC1 <-.->|"WebRTC P2P (mapa)"| AC2
        AW --> AD1[("D1 SQLite")]
        AW --> AR2[("R2 avatares/mapas")]
        ADO --> ADOS[("Storage do DO")]
    end
    subgraph R20["Roll20 (visao externa)"]
        direction LR
        RC1["Cliente GM"] <--> RS["Servicos Roll20 (sync/contas/assets)"]
        RC2["Cliente jogador"] <--> RS
        RS --> RDB[("Persistencia da plataforma")]
    end
```

**Comparação:** nos dois, o servidor é autoritativo. A diferença estrutural é escala: o Roll20 multiplexa milhares de jogos; o Armagedom dedica 1 Durable Object à única sala — mais simples, e é também o teto atual (§7, escalabilidade).

### 6.2 Sequência: movimento de token (Armagedom)

```mermaid
sequenceDiagram
    participant J as Jogador
    participant DO as DurableObject
    participant M as Mestre
    participant D1 as D1
    J->>J: "drag otimista (move local)"
    J->>DO: "mesa:token:move (throttle 50ms)"
    DO->>DO: "valida ownership + trava global"
    DO-->>M: "broadcast do delta"
    DO-->>J: "ack com messageId"
    M->>D1: "PUT /api/mesa/scene (so mestre persiste)"
    D1-->>M: "cena salva (sceneVersion++)"
```

**Comparação:** o fluxo do Roll20 é análogo (cliente → sync → demais clientes), com autorização por "Controlled By". No Armagedom há uma nuance: o delta em tempo real é retransmitido pelo DO, mas a **persistência** da cena é exclusiva do mestre — um jogador movendo o próprio token depende do mestre para o estado ficar gravado no D1.

### 6.3 Fluxo de segredo do mestre

```mermaid
flowchart TD
    T["Token criado na camada dm"] --> Q{"Quem esta pedindo?"}
    Q -->|"Mestre"| V1["Ve o token (esmaecido, opacity 0.52)"]
    Q -->|"Jogador"| F1["GET /api/mesa/scene: Worker FILTRA tokens dm"]
    F1 --> F2["WebSocket: deltas dm NUNCA sao retransmitidos a jogadores"]
    F2 --> R["Jogador nao recebe o dado em NENHUM canal"]
```

**Comparação:** o GM Info Overlay do Roll20 cumpre o mesmo papel de UX. A garantia do Armagedom é verificável no código do servidor; o modelo do Roll20 para dados ocultos não é documentado publicamente.

### 6.4 Cadeia de entrega de mapa (Armagedom)

```mermaid
flowchart TD
    U["Mestre seleciona imagem"] --> C["Compressao WebP por orcamento (mira 4096px, q 0.92)"]
    C --> P{"WebRTC P2P disponivel? (timeout 8s)"}
    P -->|"sim"| P2P["Entrega direta cliente a cliente"]
    P -->|"nao"| WS{"WebSocket ativo?"}
    WS -->|"sim"| CH["Streaming em chunks de 64KB via DO"]
    WS -->|"nao"| R2["Upload para R2 + URL publica com TTL"]
    P2P --> OK["Jogador cacheia por SHA-256 em IndexedDB"]
    CH --> OK
    R2 --> OK
```

**Comparação:** o Roll20 serve mapas de CDN própria com cotas por plano (Free 100MB de storage)[^30]. O Armagedom evita custo de storage priorizando P2P — mais engenhoso, porém com mais partes móveis para falhar.

### 6.5 Sequência: iniciativa

```mermaid
sequenceDiagram
    participant M as Mestre
    participant DO as DurableObject
    participant J as Jogador
    M->>DO: "ativa iniciativa"
    DO-->>J: "banner Rolar Iniciativa aparece"
    J->>J: "clica Rolar: 1d20 + Agilidade/3"
    J->>DO: "mesa:initiative:roll {roll, modifier, total}"
    DO-->>M: "recebe resultado"
    M->>M: "ordena por total desc (tie-break: roll, nome)"
    M->>DO: "avanca turno / round"
    DO-->>J: "tracker atualizado"
```

**Comparação:** no Roll20 o jogador rola pela ficha/macro e o resultado entra no Turn Tracker via `&{tracker}`[^16] — mais flexível, porém exige configuração. O fluxo do Armagedom é de 1 clique, já com a regra da casa embutida.

### 6.6 Sequência: transferência de item (Armagedom)

```mermaid
sequenceDiagram
    participant O as Origem
    participant W as Worker
    participant D1 as D1
    participant D as Destino
    O->>W: "POST /transfers/proposals"
    W->>D1: "INSERT proposta (pending)"
    D->>W: "POST /transfers/proposals/:id/accept"
    W->>W: "revalida quantidade e espaco"
    W->>D1: "DB.batch: UPDATE 2 fichas + INSERT transfer_audit + UPDATE proposta"
    Note over W,D1: "atomico: ou tudo, ou nada"
    W-->>D: "item aparece no inventario"
```

**Comparação:** sem equivalente nativo no Roll20 (seria manual ou Mod script). É um dos diferenciais listados em §5.2.

### 6.7 Estados de conexão do cliente (Armagedom)

```mermaid
stateDiagram-v2
    [*] --> Online: "login + /health ok"
    Online --> Queda: "WebSocket fecha / API falha"
    Queda --> FallbackLocal: "localStorage assume leitura/escrita"
    FallbackLocal --> Reconectando: "retry a cada 1.8s"
    Reconectando --> Online: "WS reabre + GET /api/mesa/scene"
    note right of Online
        Sem merge automatico ao voltar:
        estado remoto sobrescreve o local
        (lacuna documentada)
    end note
```

**Comparação:** o Roll20 não degrada para modo local — sem conexão, sem jogo. Em compensação, ao reconectar não há risco de perder edições feitas offline, risco que existe no Armagedom (item 7.6).

### 6.8 Árvore de autorização da Mesa (Armagedom)

```mermaid
flowchart TD
    A["Acao sobre um token"] --> B{"role == master?"}
    B -->|"sim"| OK1["Permitido"]
    B -->|"nao"| C{"token e do jogador? (characterKey == username ou Echo proprio)"}
    C -->|"nao"| NEG1["Negado"]
    C -->|"sim"| D{"acao e mover?"}
    D -->|"sim"| E{"trava global aberta?"}
    E -->|"sim"| OK2["Permitido (revalidado no DO)"]
    E -->|"nao"| NEG2["Negado: movimento travado pelo mestre"]
    D -->|"nao (editar vida/integ)"| OK3["Permitido no proprio token/Echo"]
```

**Comparação:** equivalente ao "Controlled By" do Roll20[^24], com duas diferenças: a trava global de movimento (sem equivalente nativo no Roll20) e a dupla validação — a permissão é checada na UI **e** revalidada no Durable Object antes do relay.

---

## 7. Requisitos não-funcionais comparados

| Requisito | Roll20 | Armagedom | Avaliação |
|---|---|---|---|
| **Escalabilidade** | SaaS multi-campanha, jogos ilimitados | 1 Durable Object (sala `default`), ~centenas de WebSockets por DO — muito acima da necessidade de 1 grupo | Adequado ao escopo; multi-sala exigiria sharding de DOs |
| **Tolerância a falhas** | Reconexão da plataforma; exige conexão | Fallback localStorage (leitura e escrita), reconexão 1.8s, trava de movimento persistida no storage do DO (sobrevive à hibernação); **sem merge ao reconectar** | Armagedom degrada melhor; recuperação pior (risco de sobrescrita) |
| **Segurança** | Conta da plataforma, HTTPS | TLS (Cloudflare), JWT 7d, PBKDF2 25k + salt + pepper, throttle de login, CORS allowlist, validação de ownership no Worker **e** no DO, secrets via env | Sólido para o escopo; sem recuperação de senha, rate-limit só no login |
| **Privacidade** | Dados na plataforma Roll20 (termos deles) | Dados no Cloudflare do próprio mestre; sem terceiros | Vantagem estrutural do Armagedom |
| **Desempenho** | Jumpgate: engine nova, FPS limit 60 default[^1] | DOM renderer com render incremental, throttle de drag 50ms, mapa WebP ≤4096px por orçamento de bytes, limite de 120 tokens | Ambos adequados; escalas incomparáveis |
| **Compatibilidade** | Chrome/Firefox/Edge oficiais | Navegadores modernos; sem matriz formal de teste | |
| **Offline** | Inexistente | localStorage cobre mesa e fichas | Diferencial (§5.2) |
| **Mobile** | App delistado (fev/2026); browser p/ fichas[^25][^26] | Responsivo até 480px; token, ping, régua e névoa já em Pointer Events; desenho e seleção ainda em mouse events | Fraco nos dois; no Armagedom falta terminar a migração para Pointer Events |
| **Auditabilidade** | Sem auditoria exposta | `transfer_audit` + `soul_audit` imutáveis | Diferencial (§5.2) |

---

## 8. Métricas e plano de testes

### 8.1 KPIs propostos para o Armagedom

| KPI | Alvo | Como medir |
|---|---|---|
| Latência de sync de movimento (delta → outro cliente) | < 300 ms | timestamp `sentAt` dos deltas vs recepção |
| FPS durante drag de token | > 30 (sem long tasks > 50ms) | já coberto por `npm run perf:mesa` |
| Tempo de entrega de mapa por via | P2P < 3s; WS < 8s; R2 < 5s | instrumentar `mesa-map.js` |
| Tempo de reestabilização pós-queda | < 5 s (reconexão + `GET /mesa/scene`) | teste de rede simulada |
| Taxa de ACK com erro no DO | < 1% | contar `ok:false` nos ACKs |
| Tempo de carga inicial da mesa | < 3 s em rede doméstica | Playwright trace |

### 8.2 Mapa das suítes existentes

| Suíte | Testes | O que cobre (itens da matriz) |
|---|---|---|
| `tests/mesa-audit.spec.cjs` | 237 | a maior: regressão de permissões e camada dm (2.4, 2.5), sync e versão de cena (7.4), grade e névoa (1.3, 2.1), dados (3.1, 3.3), iniciativa (3.5, 3.6), desenho em todas as formas (1.12), contraste e controles armados |
| `tests/mesa.spec.cjs` | 5 | render DOM de tokens, drag/move (1.5, 1.14), seleção, edição Vida/Integridade no inspetor (1.13), console limpo |
| `tests/ficha.spec.cjs` | 32 | contratos de transferência/auditoria (5.5), XP do Núcleo da Alma (5.7), saturação/overflow, normalização de ficha (7.5) |
| `tests/mesa-scenes.spec.cjs` | 22 | cenas e pastas: criar, renomear, mover, ativar, buscar (1.1) |
| `tests/mesa-permissions.spec.cjs` | 15 | rotas e relays master-only, elementos `data-mesa-master-only` (7.3) |
| `tests/mesa-token-handles.spec.cjs` | 10 | alças, escala, snap na grade e enfeite em px de tela (1.4, 1.8) |
| `tests/build-pages.spec.cjs` | 8 | bundle publicado: ordem dos scripts e hash de conteúdo no `?v=` |
| `tests/controles-armados.spec.cjs` | 6 | todo botão estático visível tem dono nas 6 páginas |
| `tests/mesa-scene-map.spec.cjs` | 6 | mapa por cena (1.2) |
| `tests/mesa-online.spec.cjs` | 4 | site publicado + API, proteção anônima (7.1), sync mestre/jogador em 2 abas (7.4) |
| `tests/mesa.performance.spec.cjs` | 1 | drag DOM sem long tasks (6.3) |
| `npm run check:js` / `audit:static` / `audit:pendencias` | — | sintaxe dos 38 JS; referências, cache-busting `?v=`, IDs duplicados; lista única de pendências |

### 8.3 Lacunas de teste

1. **Touch/mobile** — nenhum teste simula toque na mesa (item 6.1), que é justamente onde a migração para Pointer Events está pela metade.
2. **Reconexão + consistência** — nenhum teste derruba o WebSocket e valida o estado após reconectar (7.6/7.9 — justamente onde há risco de sobrescrita).
3. **Mais de 2 clientes simultâneos** — o smoke online usa mestre + 1 jogador.
4. **Carga de 120 tokens** — o limite do `PUT /mesa/scene` nunca é exercitado.
5. **Cadeia de mapa** — os ramos WS chunked e R2 do diagrama 6.4 não têm teste.
6. **Permissões negativas sistemáticas** — falta uma suíte que tente cada rota master-only como jogador e espere 403 (hoje é pontual).
7. **Acessibilidade automatizada** — sem axe/lighthouse no CI.

---

## 9. Conclusão e roadmap

### 9.1 Semelhanças cruciais

- **Servidor autoritativo** com sync em tempo real via WebSocket nos dois sistemas; no Armagedom com ACKs e broadcast segmentado.
- **Camada secreta do GM** em paridade funcional (GM Info Overlay ↔ camada `dm`) — e no Armagedom com garantia server-side.
- **Vínculo token ↔ ficha** bidirecional nos dois; barras de vida sincronizadas.
- **Modelo de permissões** por controle/ownership de personagem, com GM/mestre onipotente.
- **Núcleo de manipulação** (zoom/pan, multi-seleção, desenho, turn tracker, grade com snap, névoa manual) comparável.
- **Dados na mesa** sorteados no servidor, com rolagem secreta do mestre que não vaza nem para quem entra depois.

### 9.2 Lacunas priorizadas (peso da categoria × tamanho do gap)

**Cumpridas desde a revisão 1** (eram as prioridades 1, 2, 3, 7 e 8): Fog of War, rolagem pública e secreta na Mesa, snap-to-grid com grade configurável, múltiplas cenas com pastas e marcadores de condição. Foi esse bloco que levou o escore de 51% a 62%.

| Prioridade | Lacuna | Categoria (peso) | Por quê |
|---|---|---|---|
| 1 | **Rolagem da ficha transmitida à mesa** | C5 (5) | O item mais barato que restou: o canal (`mesa:dice:request`) e o motor (`ficha-dice.js`) já existem e seguem as mesmas regras — falta o botão na ficha mandar para a Mesa em vez de rolar no canto. Leva 5.3 de 1→3 |
| 2 | **Export/import JSON de ficha e cena** | C5/C7 | Único item que hoje é **risco**, não funcionalidade: não há cópia dos dados fora do D1. Barato — cena e ficha já são JSON normalizado. Cobre 5.10 e melhora 7.10 |
| 3 | **Handouts / notas compartilhadas** | C5 (5) | Zero absoluto (5.9) e encaixa no modelo de permissão que já existe (camada dm, visibilidade por token): imagem ou texto entregue a um jogador específico |
| 4 | **Terminar a migração para Pointer Events** | C6 (2) | Meio caminho andado: token, ping, régua e névoa já respondem ao toque; desenho e seleção não. É trocar `mousedown/mousemove` por `pointer*` em `mesa-drawing.js` e `mesa-select.js` |
| 5 | **Auras nos tokens** | C1 (5) | O que falta para 1.7 virar 3, e resolve "quem está dentro do cone/da explosão" — o cone de desenho já existe desde a Etapa 123 |
| 6 | **Chat de texto com sussurro** | C4 (0 — informativa) | Fora da pontuação por decisão do grupo (Discord), mas é a lacuna mais sentida numa sessão remota; o canal do realtime já está pronto, seria mais um `RELAY_TYPE` |
| 7 | **Versionamento otimista de ficha** | C7 (4) | `sceneVersion` já existe para cena; aplicar o mesmo padrão ao `PUT /characters` fecha 7.6 (hoje last-write-wins sem aviso) |
| 8 | **Rotação de token** | C1 (5) | Completa 1.8; o transform do token já é composto e contra-escalado, o ângulo entra como mais um campo da cena |
| 9 | **Recuperação de senha** | C7 (4) | 7.2 é zero e hoje depende do mestre resetar na mão |
| 10 | **Visão dinâmica / linha de visão** | C2 (4) | O que separa a Mesa de um VTT completo (2.2 e 2.3), e de longe o mais caro. No Roll20 exige Plus/Pro — fica por último de propósito |

Macros, tabelas roláveis, cartas e API de scripts (C3) seguem fora do top 10 conscientemente: são caros e o sistema da casa já embute as automações que importam (iniciativa, XP, drops).

### 9.3 Meta de escore

Executando as prioridades 1–5, a cobertura estimada sobe: C5 0,64→0,80 (rolagem da ficha, export, handouts), C7 0,67→0,72 (backup), C1 0,76→0,81 (auras), C6 0,83→1,00 (toque) → **escore geral de ~62% para ~70%**, mantendo os diferenciais e sem tocar na peça cara (visão dinâmica).

Para passar de ~70% seria preciso atacar C2 (iluminação e visão por token) ou C3 (macros, tabelas, cartas) — os dois blocos que o projeto adiou por escolha, não por acidente.

---

## 10. Discrepâncias da documentação interna

Este comparativo segue **o código**. Dos três pontos apontados na revisão 1, dois foram corrigidos:

1. ~~**`CLAUDE.md`** — renderer descrito como Canvas/OffscreenCanvas~~ — **CORRIGIDO**: o arquivo hoje diz "tokens are rendered 100% in DOM… Canvas is used only for drawings (`#mesaDrawCanvas`)". Verificado em 2026-08-27.
2. **`docs/obsidian/07-MESA.md`** (linhas ~120–128) — **ainda desatualizado**: afirma que "o palco usa Canvas/Worker por padrão quando suportado" e que o renderer DOM é legado acionável por `localStorage.mesaRenderer = "dom"`, além de recomendar otimizações para uma rota de render que não existe mais. É o último resquício do renderer removido na Etapa 33.
3. ~~**`DEV_STATUS.md`** — "backend congelado, NÃO rodar `wrangler deploy`"~~ — **CORRIGIDO**: o arquivo registra que a fase de congelamento foi encerrada na Etapa 34 e a regra atual é `wrangler deploy` sempre com `--dry-run` antes e o version ID anotado em `cloudflare/README.md`. O último deploy (2026-08-27, `53e1c74a`) está registrado lá.

---

## 11. Fontes

Todas acessadas em **2026-07-05**. `[oficial]` = help.roll20.net / blog oficial; `[wiki]` = comunitária.

[^1]: [oficial] Jumpgate — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/21569402281495-Jumpgate
[^3]: [oficial] Page Settings — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039675373-Page-Settings
[^4]: [oficial] Page Menu & Folders — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039675413-Page-Menu-Folders
[^5]: [wiki] Player Ribbon — Roll20 Wiki — https://wiki.roll20.net/Player_Ribbon
[^6]: [oficial] Layers — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039675053-Layers
[^7]: [oficial] Foreground Layer — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/30738192036887-Foreground-Layer
[^8]: [oficial] Token Features — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039674573-Token-Features
[^9]: [oficial] Hide / Reveal Mask (Free) — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360051768534-Hide-Reveal-Mask-Free
[^10]: [oficial] Fog of War (Classic VTT) — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360037774513-Fog-of-War-Classic-VTT
[^11]: [oficial] Page Settings For Dynamic Lighting — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360052521913-Page-Settings-For-Dynamic-Lighting
[^12]: [oficial] Token Settings for Dynamic Lighting — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360051754954-Token-Settings-for-Dynamic-Lighting
[^13]: [oficial] Creating Light, Windows, and Barriers — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360051768974-Creating-Light-Windows-and-Barriers
[^14]: [oficial] Text Chat — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039675093-Text-Chat
[^15]: [wiki] Dice Reference — Roll20 Wiki — https://wiki.roll20.net/Dice_Reference
[^16]: [oficial] Turn Tracker — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039178634-Turn-Tracker
[^17]: [oficial] Macros & Token Actions — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360037256794-Macros-Token-Actions
[^18]: [oficial] Collections — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039178754-Collections
[^19]: [oficial] Roll20 Characters — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360037258594-Roll20-Characters
[^20]: [oficial] Introduction to Mod Scripts (API) — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360037256714-Introduction-to-Mod-Scripts-API
[^21]: [oficial] API: Sandbox Model — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360037772853-API-Sandbox-Model
[^23]: [oficial] Compendium — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039178694-Compendium
[^24]: [oficial] Journal — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039675133-Journal
[^25]: [oficial] Using Roll20 on Mobile Devices — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/4411213438231-Using-Roll20-on-Mobile-Devices
[^26]: [oficial] We're Retiring the Roll20 Mobile App… — Roll20 Blog — https://blog.roll20.net/posts/were-retiring-the-roll20-mobile-app-to-build-something-better-heres-why/
[^27]: [oficial] Measure Tool — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360039674913-Measure-Tool
[^29]: [oficial] Integrated Voice and Video — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360041544734-Integrated-Voice-and-Video
[^30]: [oficial] Best Practices for Files on Roll20 — Roll20 Help Center — https://help.roll20.net/hc/en-us/articles/360037256634-Best-Practices-for-Files-on-Roll20
