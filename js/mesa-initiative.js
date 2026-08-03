/**
 * mesa-initiative.js — Iniciativa da Mesa Virtual (Etapa 77, reescrita total)
 *
 * FLUXO OFICIAL
 * -------------
 *   1. O MESTRE clica em INIC. → o combate abre com os tokens em cena virando
 *      participantes (menos o Echo, que age no turno do dono). Um modal
 *      central aparece para MESTRE E JOGADORES.
 *   2. Cada JOGADOR clica em "Rolar iniciativa" na linha do proprio token.
 *      A rolagem e 1d20 + o MODIFICADOR de Agilidade (ver INITIATIVE_ATTR).
 *   3. Quando TODOS os jogadores rolaram, o cliente do MESTRE rola sozinho
 *      pelos NPCs e monstros e, logo depois, fecha a fase de rolagem.
 *   4. A fase vira "order": todos passam a ver a LISTA DE ORDEM DE TURNO
 *      (maior total primeiro), com o nome da vez BRILHANDO. O mestre conduz
 *      com dois botoes — "Voltar" e "Passar" — mais "Encerrar".
 *      A ordem vale ate o combate acabar: rodada nova NAO re-rola.
 *
 * ESTADO (campo `initiative` da cena oficial, persistido em D1)
 * -------------------------------------------------------------
 *   { active, phase: "rolling"|"order", round, currentIndex, order: [entry] }
 *   entry = { id (= id do token na cena), characterKey, ownerUsername, type,
 *             name, secret, auto, roll, modifier, total, rolled }
 *
 *   O avatar NAO viaja na entrada: cada cliente resolve o retrato localmente
 *   pelo token da cena (`state.tokens`). Avatar pode ser data URI de dezenas
 *   de KB — no payload, estouraria o cap de 32KB por mensagem do realtime.
 *
 * REDE
 * ----
 *   mesa:initiative:update — estado completo, SO o mestre emite (o DO recusa
 *     de jogador). Chega pelo roteador padrao (applyMesaRealtimeDelta).
 *   mesa:initiative:roll   — unico delta que o jogador emite. `characterKey`
 *     e a IDENTIDADE (o DO exige que seja o username do socket); o alvo da
 *     rolagem vai em `tokenId`, e o mestre confere a posse antes de aceitar.
 *
 * Dependencias globais (carregadas antes): state, isMaster(),
 * sendMesaRealtimeDelta(), persistState(), readMergedSheets(),
 * requireMesaMaster(), normalizeMesaUsername(), normalizeMesaCharacterKey().
 */

/* ── CONSTANTES ──────────────────────────────────────────────── */
const EV_INITIATIVE_UPDATE = "mesa:initiative:update";
const EV_INITIATIVE_ROLL   = "mesa:initiative:roll";

/**
 * REGRA DO MODIFICADOR — confirmada por Tiago em 2026-08-02
 * --------------------------------------------------------
 * Iniciativa = 1d20 + o MODIFICADOR do atributo de destreza (nao o valor cru
 * do atributo). A ficha de Armagedom nao tem "Destreza": o atributo
 * equivalente e AGILIDADE (`attrAgilidade`).
 *
 * O modificador e o MESMO numero que a ficha mostra ao lado do atributo:
 * "+1 a cada 3 pontos" (SYSTEM_RULES.md > Atributos). Agilidade 5 → +1,
 * Agilidade 6 → +2, Agilidade 9 → +3.
 *
 * Para mudar a formula, mexa SO nestas constantes e em
 * initiativeModifierFor() — nenhum outro ponto do arquivo le o atributo.
 */
const INITIATIVE_ATTR       = "attrAgilidade";
const INITIATIVE_ATTR_LABEL = "Agilidade";
const INITIATIVE_FORMULA    = "1d20 + mod. de Agilidade";

// Sanidade do que chega pela rede (rolagem de jogador nao e confiavel).
const MAX_INITIATIVE_MOD = 30;
// Pausa entre "os NPCs rolaram" e "eis a ordem": da tempo de todo mundo ver
// os numeros dos monstros aparecerem antes da tela trocar.
const ORDER_REVEAL_DELAY_MS = 1200;

/* ── ESTADO ──────────────────────────────────────────────────── */

function getInitiativeState() {
  if (!window._mesaInitiativeState) {
    window._mesaInitiativeState = {
      active:       false,
      phase:        "rolling",
      round:        1,
      currentIndex: -1,
      order:        []
    };
  }
  return window._mesaInitiativeState;
}

// Colapso do modal/painel: preferencia LOCAL de cada pessoa, nunca sincroniza.
let _initCollapsed = false;
// Guarda do timer que fecha a fase de rolagem (evita disparo duplicado).
let _orderRevealTimer = 0;

/* ── HELPERS ─────────────────────────────────────────────────── */

function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

function initKey(value) {
  return typeof normalizeMesaCharacterKey === "function"
    ? normalizeMesaCharacterKey(value)
    : String(value || "").trim().toLowerCase();
}

function initUser(value) {
  return typeof normalizeMesaUsername === "function"
    ? normalizeMesaUsername(value)
    : String(value || "").trim().toLowerCase();
}

function isInitMaster() {
  return typeof isMaster === "function" && isMaster();
}

/** Username da sessao atual (o mesmo que o DO ve no socket). */
function initSessionUsername() {
  const fromState = typeof state === "object" && state ? state.session?.username : "";
  return initUser(fromState || window.AUTH?.getSession?.()?.username || "");
}

/**
 * Trava local das acoes de mestre. Delega para requireMesaMaster()
 * (js/mesa-permissions.js); sem o modulo de permissoes, cai no isMaster()
 * do core — nunca em "liberado".
 */
function requireMesaMasterInit(acao) {
  if (typeof requireMesaMaster === "function") {
    return requireMesaMaster("initiative.control", acao);
  }
  return isInitMaster();
}

/**
 * Valor CRU do atributo de destreza na ficha em cache (so para exibir na
 * linha do modal — quem entra na conta e o modificador abaixo).
 */
function initiativeAttrValueFor(characterKey) {
  const sheets = typeof readMergedSheets === "function" ? readMergedSheets() : {};
  const key    = initKey(characterKey);
  const sheet  = sheets[key] || sheets[characterKey] || {};
  const raw    = Number.parseInt(sheet[INITIATIVE_ATTR], 10);
  return Number.isFinite(raw) ? raw : 0;
}

/**
 * Modificador do atributo: "+1 a cada 3 pontos".
 *
 * ESPELHA `modScale()` de js/ficha-sheet.js — o mesmo numero que a ficha
 * mostra ao lado do atributo. A duplicacao e proposital: ficha-sheet.js so
 * carrega em ficha.html, e a Mesa nao pode depender dele. Se a escala de
 * modificador do sistema mudar, os dois lugares mudam juntos.
 */
function initiativeModScale(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / 3);
}

/** Modificador de iniciativa de um personagem, lido da ficha em cache. */
function initiativeModifierFor(characterKey) {
  const mod = initiativeModScale(initiativeAttrValueFor(characterKey));
  return Math.max(-MAX_INITIATIVE_MOD, Math.min(MAX_INITIATIVE_MOD, mod));
}

/**
 * Igual a initiativeModifierFor(), mas devolve `null` quando a ficha do
 * personagem NAO esta em cache nesta tela.
 *
 * Existe para o mestre conferir a rolagem que chega do jogador (Etapa 78):
 * quando o mestre tem a ficha, o modificador que vale e o DELE — o numero do
 * jogador vira palpite descartavel. Quando nao tem, `null` avisa "nao sei" e
 * o mestre aceita o valor recebido (ja clampado); tratar ausencia como 0
 * zeraria injustamente a iniciativa de quem tem Agilidade alta.
 */
function initiativeKnownModifierFor(characterKey) {
  const sheets = typeof readMergedSheets === "function" ? readMergedSheets() : {};
  const key    = initKey(characterKey);
  const sheet  = sheets[key] || sheets[characterKey];
  if (!sheet || sheet[INITIATIVE_ATTR] === undefined) return null;
  return initiativeModifierFor(characterKey);
}

/** Token da cena correspondente a uma entrada (para avatar/iniciais). */
function findInitiativeToken(entry) {
  const tokens = (typeof state === "object" && state && Array.isArray(state.tokens)) ? state.tokens : [];
  return tokens.find(token => String(token?.id || "") === String(entry?.id || "")) || null;
}

function normalizeEntry(e) {
  const type = ["player", "npc", "monster", "echo"].includes(String(e?.type)) ? String(e.type) : "npc";
  const roll = Number.isFinite(e?.roll) ? Math.trunc(e.roll) : 0;
  const mod  = Number.isFinite(e?.modifier)
    ? Math.max(-MAX_INITIATIVE_MOD, Math.min(MAX_INITIATIVE_MOD, Math.trunc(e.modifier)))
    : 0;
  return {
    id:            String(e?.id || e?.characterKey || ""),
    characterKey:  initKey(e?.characterKey || e?.id),
    ownerUsername: initUser(e?.ownerUsername),
    type,
    name:          String(e?.name || "?"),
    secret:        e?.secret === true,
    // Quem nao e jogador rola sozinho (NPC e monstro; Echo nem entra na lista).
    auto:          e?.auto === undefined ? type !== "player" : e.auto === true,
    roll,
    modifier:      mod,
    total:         Number.isFinite(e?.total) ? Math.trunc(e.total) : roll + mod,
    rolled:        Boolean(e?.rolled)
  };
}

/**
 * Aplica um estado de iniciativa vindo da rede, do snapshot local ou da cena.
 * Cena antiga (pre-Etapa 77) nao tem `phase`: deduz pela rolagem de todos.
 */
function applyInitiativeState(data) {
  const s = getInitiativeState();
  s.active = Boolean(data?.active);
  s.round  = Number.isFinite(data?.round) && data.round > 0 ? Math.floor(data.round) : 1;
  s.currentIndex = Number.isFinite(data?.currentIndex) ? Math.floor(data.currentIndex) : -1;
  s.order  = Array.isArray(data?.order) ? data.order.map(normalizeEntry) : [];

  const declared = String(data?.phase || "");
  if (declared === "rolling" || declared === "order") {
    s.phase = declared;
  } else {
    s.phase = s.order.length && s.order.every(e => e.rolled) ? "order" : "rolling";
  }

  if (!s.active) _initCollapsed = false;
  renderInitiative();
}

/* ── MONTAGEM DOS PARTICIPANTES ──────────────────────────────── */

/**
 * Todo token em cena vira participante — MENOS o Echo.
 *
 * REGRA (Tiago, 2026-08-02): o Echo NAO tem turno proprio. Ele age no mesmo
 * turno do jogador que o invocou, entao nao entra na ordem nem rola nada.
 * Colocar o Echo na lista faria o dono agir duas vezes por rodada.
 *
 * Token da camada secreta ("dm") ou marcado como invisivel entra como
 * `secret`: existe na ordem para o mestre, mas some da lista dos jogadores.
 */
function buildInitiativeParticipants() {
  const tokens = (typeof state === "object" && state && Array.isArray(state.tokens)) ? state.tokens : [];
  return tokens
    .filter(token => String(token?.type || "") !== "echo")
    .map(token => {
      const type = String(token?.type || "npc");
      return normalizeEntry({
        id:            token?.id,
        characterKey:  token?.characterKey || token?.id,
        ownerUsername: token?.ownerUsername,
        type,
        name:          token?.name,
        secret:        token?.layer === "dm" || token?.visibleToPlayers === false,
        auto:          type !== "player",
        roll: 0, modifier: 0, total: 0, rolled: false
      });
    })
    .filter(entry => entry.id);
}

/**
 * Best-effort: busca as fichas que faltam para que o modificador dos NPCs e
 * monstros saia certo. So o mestre pode ler ficha de terceiro na API — e so
 * em modo backend. Falha aqui nunca trava o combate (modificador vira 0).
 */
async function hydrateInitiativeSheets(entries) {
  if (!isInitMaster()) return;
  if (!window.AUTH?.isBackendEnabled?.() || !window.APP?.getCharacter) return;

  const sheets  = typeof readMergedSheets === "function" ? readMergedSheets() : {};
  const missing = [...new Set(
    entries
      .map(entry => entry.characterKey)
      .filter(key => key && sheets[key]?.[INITIATIVE_ATTR] === undefined)
  )];
  if (!missing.length) return;

  const cache = readJsonStorage(REMOTE_SHEETS_KEY, {});
  let changed = false;
  for (const key of missing) {
    try {
      const bundle = await window.APP.getCharacter(key);
      if (!bundle?.data) continue;
      cache[key] = { ...(cache[key] || {}), ...bundle.data };
      changed = true;
    } catch {
      // silencioso: sem ficha, o modificador daquele token fica 0
    }
  }
  if (changed) localStorage.setItem(REMOTE_SHEETS_KEY, JSON.stringify(cache));
}

/* ── ACOES DO MESTRE ─────────────────────────────────────────────
 * Todas passam por requireMesaMaster("initiative.control"). Esconder o botao
 * nao basta: estas funcoes sao globais (onclick inline) e chamaveis pelo
 * console — antes da Etapa 75 um jogador ligava o combate so na tela dele.
 */

/** Abre o combate: monta os participantes e manda todo mundo rolar. */
function activateInitiative() {
  if (!requireMesaMasterInit("iniciar o combate")) return;

  const participants = buildInitiativeParticipants();
  if (!participants.length) {
    if (window.UI?.toast) window.UI.toast("Coloque tokens em cena antes de iniciar o combate.", "warn");
    return;
  }

  clearTimeout(_orderRevealTimer);
  _orderRevealTimer = 0;
  _initCollapsed = false;

  const s = getInitiativeState();
  s.active       = true;
  s.phase        = "rolling";
  s.round        = 1;
  s.currentIndex = -1;
  s.order        = participants;
  _broadcastInitiative();
  renderInitiative();

  // Busca as fichas que faltam e so entao avalia se ja da para rolar sozinho
  // (mesa so de NPC/monstro fecha a rolagem na hora).
  hydrateInitiativeSheets(participants)
    .catch(() => {})
    .then(() => { _maybeCloseRollPhase(); });
}

/** Encerra o combate para todos. */
function deactivateInitiative() {
  if (!requireMesaMasterInit("encerrar o combate")) return;
  clearTimeout(_orderRevealTimer);
  _orderRevealTimer = 0;
  const s = getInitiativeState();
  s.active       = false;
  s.phase        = "rolling";
  s.round        = 1;
  s.currentIndex = -1;
  s.order        = [];
  _initCollapsed = false;
  _broadcastInitiative();
  renderInitiative();
}

/** Botao INIC. da barra: liga/desliga o combate. */
function toggleInitiative() {
  if (getInitiativeState().active) deactivateInitiative();
  else activateInitiative();
}

/** Passa a vez para o proximo da ordem (vira a rodada no fim da lista). */
function nextInitiativeTurn() {
  if (!requireMesaMasterInit("passar o turno")) return;
  const s = getInitiativeState();
  if (!s.active || s.phase !== "order" || !s.order.length) return;
  s.currentIndex += 1;
  if (s.currentIndex >= s.order.length) {
    s.currentIndex = 0;
    s.round += 1;
  }
  _broadcastInitiative();
  renderInitiative();
}

/** Volta a vez para o anterior (volta a rodada ao passar do primeiro). */
function prevInitiativeTurn() {
  if (!requireMesaMasterInit("voltar o turno")) return;
  const s = getInitiativeState();
  if (!s.active || s.phase !== "order" || !s.order.length) return;
  if (s.currentIndex <= 0) {
    // Rodada 1 no primeiro da fila: nao existe turno anterior.
    if (s.round <= 1) return;
    s.currentIndex = s.order.length - 1;
    s.round -= 1;
  } else {
    s.currentIndex -= 1;
  }
  _broadcastInitiative();
  renderInitiative();
}

/** Tira alguem da ordem (monstro morto, token que saiu de cena). */
function removeFromInitiative(id) {
  if (!requireMesaMasterInit("remover alguem da iniciativa")) return;
  const s = getInitiativeState();
  const idx = s.order.findIndex(e => e.id === id);
  if (idx === -1) return;
  s.order.splice(idx, 1);
  if (!s.order.length) {
    s.currentIndex = -1;
  } else if (s.currentIndex > idx) {
    s.currentIndex -= 1;
  } else if (s.currentIndex >= s.order.length) {
    s.currentIndex = 0;
  }
  _broadcastInitiative();
  renderInitiative();
  _maybeCloseRollPhase();
}

/**
 * Escape hatch do mestre: rola pelos jogadores que ainda nao rolaram
 * (alguem caiu da chamada, entrou depois, esqueceu). Sem isso, um jogador
 * ausente travaria o combate para sempre na fase de rolagem.
 */
function forcePendingInitiativeRolls() {
  if (!requireMesaMasterInit("rolar pelos ausentes")) return;
  const s = getInitiativeState();
  if (!s.active || s.phase !== "rolling") return;
  const pending = s.order.filter(e => !e.rolled);
  if (!pending.length) return;
  pending.forEach(entry => _applyRollToEntry(entry, rollD20(), initiativeModifierFor(entry.characterKey)));
  _broadcastInitiative();
  renderInitiative();
  _maybeCloseRollPhase();
}

/* ── ROLAGEM ─────────────────────────────────────────────────── */

function _applyRollToEntry(entry, roll, modifier) {
  entry.roll     = Math.max(1, Math.min(20, Math.trunc(roll) || 1));
  entry.modifier = Math.max(-MAX_INITIATIVE_MOD, Math.min(MAX_INITIATIVE_MOD, Math.trunc(modifier) || 0));
  entry.total    = entry.roll + entry.modifier;
  entry.rolled   = true;
}

/**
 * Ordem: maior total primeiro. Desempate confirmado por Tiago (2026-08-02):
 * maior DADO BRUTO → maior modificador (Agilidade) → nome. Ou seja, entre
 * dois totais 19, quem tirou 16 no dado passa na frente de quem tirou 14.
 */
function _sortInitiativeOrder(order) {
  order.sort((a, b) =>
    b.total - a.total
    || b.roll - a.roll
    || b.modifier - a.modifier
    || a.name.localeCompare(b.name, "pt-BR")
  );
}

/**
 * Rolagem do participante local. Jogador so alcanca o proprio token; o
 * mestre pode rolar por qualquer entrada direto do modal.
 */
function rollOwnInitiative(tokenId) {
  const s = getInitiativeState();
  if (!s.active || s.phase !== "rolling") return;

  const entry = s.order.find(e => e.id === String(tokenId || ""));
  if (!entry || entry.rolled) return;

  // TRAVA DE POSSE (Etapa 78). Esconder o botao nao basta: esta funcao e
  // global e chamavel pelo console com qualquer id de token. A regra e uma
  // so — jogador rola pelo PROPRIO personagem, mais nada. O mestre segue
  // podendo rolar por quem ficou pendente (jogador ausente nao trava a mesa).
  if (!isInitMaster()) {
    if (typeof mesaCan === "function" && !mesaCan("initiative.roll")) return;
    if (!isOwnInitiativeEntry(entry)) {
      if (window.UI?.toast) window.UI.toast("Você só rola a iniciativa do seu personagem.", "warn");
      return;
    }
  } else if (entry.auto) {
    // NPC e monstro rolam sozinhos no fim da fase; nao ha botao para eles.
    return;
  }

  const roll     = rollD20();
  const modifier = initiativeModifierFor(entry.characterKey);

  if (isInitMaster()) {
    // O mestre e a autoridade do estado: aplica e transmite direto.
    _applyRollToEntry(entry, roll, modifier);
    _broadcastInitiative();
    renderInitiative();
    _maybeCloseRollPhase();
    return;
  }

  // Jogador: pinta a propria linha na hora (feedback imediato) e manda ao
  // mestre. O estado que vale volta no proximo mesa:initiative:update.
  _applyRollToEntry(entry, roll, modifier);
  renderInitiative();

  if (typeof sendMesaRealtimeDelta === "function") {
    sendMesaRealtimeDelta(EV_INITIATIVE_ROLL, {
      // Identidade: o DO exige que seja o username do socket.
      characterKey: initSessionUsername(),
      tokenId:      entry.id,
      name:         entry.name,
      roll,
      modifier,
      total:        roll + modifier
    });
  }
}

/**
 * A entrada e "minha de rolar"? Entrada automatica nunca conta, mesmo quando
 * o dono e quem esta na tela: NPC e monstro tem ownerUsername "mestre", e sem
 * essa guarda o mestre ganhava um botao de rolar em cada monstro (eles ja
 * rolam sozinhos no fim da fase).
 */
function isOwnInitiativeEntry(entry) {
  if (!entry || entry.auto) return false;
  const username = initSessionUsername();
  if (!username) return false;
  return entry.ownerUsername === username || entry.characterKey === username;
}

/**
 * MESTRE recebe a rolagem de um jogador (roteada por applyMesaRealtimeDelta,
 * que ja descartou payload cujo `characterKey` nao bate com o ator).
 * Aqui conferimos a POSSE DO TOKEN: o ator so rola pelo token dele.
 */
function _receivePlayerRoll(payload) {
  if (!isInitMaster()) return;
  const s = getInitiativeState();
  if (!s.active || s.phase !== "rolling") return;

  const actorRole = String(payload?.actor?.role || "");
  const actorName = initUser(payload?.actor?.username || payload?.characterKey);

  const tokenId = String(payload?.tokenId || "");
  // O alvo preferencial e o tokenId declarado. O fallback por characterKey
  // saiu na Etapa 78: com ele, um payload sem tokenId caia na primeira
  // entrada de mesmo characterKey — e o jogador escolhe o characterKey que
  // envia.
  //
  // O fallback que ficou (Etapa 80) parte do ATOR AUTENTICADO, nao de campo
  // do payload: se o id nao casa (a tela do jogador estava com uma ordem
  // antiga, de antes de o mestre recolocar o token), procuramos a UNICA
  // entrada manual pendente daquele dono. Com duas, nao ha como saber qual
  // ele quis — melhor ignorar do que rolar pelo token errado.
  let entry = tokenId ? s.order.find(e => e.id === tokenId) : null;
  if (!entry && actorName) {
    const candidatos = s.order.filter(e =>
      !e.auto && !e.rolled && (e.ownerUsername === actorName || e.characterKey === actorName)
    );
    if (candidatos.length === 1) entry = candidatos[0];
  }
  if (!entry || entry.rolled) return;

  if (actorRole !== "master") {
    if (!actorName) return;
    if (entry.ownerUsername !== actorName && entry.characterKey !== actorName) return;
    // Automatico (NPC/monstro) nunca vem de jogador, mesmo que ele "possua"
    // a entrada por coincidencia de nome: esses rolam no fecho da fase.
    if (entry.auto) return;
  }

  // O modificador que vale e o da FICHA vista pelo mestre — o numero do
  // cliente so entra quando esta tela ainda nao tem a ficha em cache.
  const knownMod = initiativeKnownModifierFor(entry.characterKey);
  _applyRollToEntry(entry, payload?.roll, knownMod === null ? payload?.modifier : knownMod);
  _broadcastInitiative();
  renderInitiative();
  _maybeCloseRollPhase();
}

/**
 * Fecha a fase de rolagem quando todo JOGADOR ja rolou: o cliente do mestre
 * rola pelos automaticos (NPC, monstro, Echo), transmite os numeros e, apos
 * uma pausa curta, publica a ordem de turno.
 */
function _maybeCloseRollPhase() {
  if (!isInitMaster()) return;
  const s = getInitiativeState();
  if (!s.active || s.phase !== "rolling" || !s.order.length) return;
  if (s.order.some(entry => !entry.auto && !entry.rolled)) return;

  const pendingAuto = s.order.filter(entry => !entry.rolled);
  if (pendingAuto.length) {
    pendingAuto.forEach(entry => _applyRollToEntry(entry, rollD20(), initiativeModifierFor(entry.characterKey)));
    _broadcastInitiative();
    renderInitiative();
  }

  if (_orderRevealTimer) return;
  const delay = pendingAuto.length ? ORDER_REVEAL_DELAY_MS : 0;
  _orderRevealTimer = setTimeout(() => {
    _orderRevealTimer = 0;
    _publishInitiativeOrder();
  }, delay);
}

function _publishInitiativeOrder() {
  if (!isInitMaster()) return;
  const s = getInitiativeState();
  if (!s.active || s.phase !== "rolling") return;
  if (s.order.some(entry => !entry.rolled)) return;

  _sortInitiativeOrder(s.order);
  s.phase        = "order";
  s.round        = 1;
  s.currentIndex = 0;
  _broadcastInitiative();
  renderInitiative();
}

function _broadcastInitiative() {
  const s = getInitiativeState();
  if (typeof sendMesaRealtimeDelta === "function") {
    sendMesaRealtimeDelta(EV_INITIATIVE_UPDATE, { initiative: s });
  }
  // A iniciativa faz parte da cena oficial: persistir aqui garante que o
  // estado sobrevive ao F5 do mestre e chega a quem entrar depois
  // (GET /mesa/scene), sem depender de outro persist acontecer por acidente.
  if (typeof persistState === "function") persistState();
}

/* ── BOOT ────────────────────────────────────────────────────── */

/**
 * Consome a iniciativa que o boot da Mesa deixou em espera.
 *
 * Por que existe: com os scripts vindo do cache, o mesa-core.js pode executar
 * com readyState "interactive" e disparar bootMesaPage() imediatamente — ou
 * seja, a cena e restaurada ANTES de este arquivo existir. Nesse caso o
 * applyMesaSceneSnapshot guarda o estado em window._mesaPendingInitiative em
 * vez de descarta-lo, e quem aplica somos nos.
 */
function drainPendingInitiative() {
  const pending = window._mesaPendingInitiative;
  if (!pending) return false;
  window._mesaPendingInitiative = null;
  applyInitiativeState(pending);
  return true;
}

/**
 * Sincroniza a UI no boot da Mesa (chamado por initMesaPage em mesa-core.js,
 * depois de hydrateState restaurar a cena). Os deltas mesa:initiative:* NAO
 * sao registrados aqui: chegam pelo roteador padrao, que deduplica por
 * clientId, valida o ator e chama applyInitiativeState/receiveInitiativeRoll.
 */
function initInitiativeModule() {
  if (drainPendingInitiative()) return;
  renderInitiative();
}

/* ── RENDERIZACAO ────────────────────────────────────────────── */

function renderInitiative() {
  _renderRollOverlay();
  _renderTracker();
  _updateInitiativeToolbarBtn();
  // Ultima palavra sobre visibilidade: o modulo de permissoes so ESCONDE,
  // entao chamar aqui nunca revela controle de mestre para jogador.
  if (typeof applyMesaRolePermissions === "function") applyMesaRolePermissions();
}

function _updateInitiativeToolbarBtn() {
  const btn = document.getElementById("mesaInitiativeBtn");
  if (!btn) return;
  const s = getInitiativeState();
  btn.classList.toggle("is-active", s.active);
  btn.setAttribute("aria-pressed", String(s.active));
  btn.title = s.active ? "Combate ativo — clique para encerrar" : "Iniciar combate (iniciativa)";
}

/** Entradas visiveis para quem esta nesta tela, com o indice original. */
function _visibleEntries() {
  const s = getInitiativeState();
  const master = isInitMaster();
  return s.order
    .map((entry, index) => ({ entry, index }))
    .filter(item => master || !item.entry.secret);
}

function _entryAvatarHtml(entry) {
  const token = findInitiativeToken(entry);
  const url = String(token?.imageUrl || "").trim();
  if (url) {
    return `<img src="${escapeHtmlInit(url)}" alt="" width="40" height="40" loading="lazy" decoding="async" draggable="false" />`;
  }
  const initials = String(token?.initials || entry.name.slice(0, 2)).toUpperCase();
  return `<span class="init-avatar-fallback">${escapeHtmlInit(initials)}</span>`;
}

const INIT_TYPE_LABEL = { player: "Jogador", npc: "NPC", monster: "Monstro", echo: "Echo" };

function _formatMod(mod) {
  return mod >= 0 ? `+${mod}` : String(mod);
}

/* ── FASE 1: modal central de rolagem ────────────────────────── */

function _renderRollOverlay() {
  const overlay = document.getElementById("initiativeOverlay");
  if (!overlay) return;
  const s = getInitiativeState();
  const open = s.active && s.phase === "rolling";

  overlay.hidden = !open;
  overlay.classList.toggle("is-collapsed", _initCollapsed);
  if (!open) return;

  const master  = isInitMaster();
  const items   = _visibleEntries();
  // Contagem sobre o que a pessoa PODE ver: para o jogador, um token secreto
  // nem entra no total — senao o "0 de 4" com 3 linhas na tela denunciaria
  // que existe alguem escondido no palco.
  const counted = items.map(item => item.entry);
  const pending = counted.filter(entry => !entry.auto && !entry.rolled);
  const rolledCount = counted.filter(entry => entry.rolled).length;

  // A MINHA linha primeiro (Etapa 78): o painel encolheu para caber na doca
  // do canto, entao o que exige acao tem de estar no topo, sem rolagem de
  // lista. Para o mestre a ordem original se mantem (ele nao rola por si).
  const mine   = master ? [] : counted.filter(entry => isOwnInitiativeEntry(entry));
  const others = counted.filter(entry => !mine.includes(entry));
  const rows   = [...mine, ...others];

  const sub = overlay.querySelector(".init-modal-sub");
  if (sub) {
    const meuTurno = mine.some(entry => !entry.rolled);
    sub.textContent = meuTurno
      ? `Role a SUA iniciativa: ${INITIATIVE_FORMULA}.`
      : `${INITIATIVE_FORMULA} · NPCs e monstros rolam sozinhos no fim.`;
  }

  const list = overlay.querySelector("#initRollList");
  if (list) {
    list.innerHTML = rows.map(entry => _rollRowHtml(entry, master)).join("")
      || `<li class="init-empty">Nenhum participante visivel.</li>`;
  }

  const progress = overlay.querySelector("#initRollProgress");
  if (progress) {
    const quemFalta = pending.length === 1
      ? "falta 1 jogador"
      : `faltam ${pending.length} jogadores`;
    progress.textContent = pending.length
      ? `${rolledCount}/${counted.length} rolaram — ${quemFalta}.`
      : "Todas as rolagens entraram. Montando a ordem…";
  }

  const bar = overlay.querySelector("#initRollProgressBar > i");
  if (bar) {
    const pct = counted.length ? Math.round((rolledCount / counted.length) * 100) : 0;
    bar.style.width = `${pct}%`;
  }

  // O mestre so precisa do escape hatch enquanto houver rolagem manual pendente.
  const forceBtn = overlay.querySelector("#initForceRollsBtn");
  if (forceBtn) forceBtn.hidden = !master || !s.order.some(entry => !entry.auto && !entry.rolled);
}

function _rollRowHtml(entry, master) {
  const mine    = isOwnInitiativeEntry(entry);
  const canRoll = !entry.rolled && (mine || (master && !entry.auto));
  const classes = [
    "init-row",
    entry.rolled ? "is-rolled" : "is-waiting",
    mine ? "is-mine" : "",
    entry.secret ? "is-secret" : ""
  ].filter(Boolean).join(" ");

  // Modificador so aparece para quem tem direito de ver a ficha: o dono e o
  // mestre. Numero de NPC/monstro nao vaza para jogador antes da hora.
  const showMod = master || mine;
  // Depois de rolar vale o modificador que entrou na conta; antes, o previsto
  // pela ficha. `entry.modifier` legitimamente vale 0 (Agilidade 0, 1 ou 2),
  // entao o teste e por `rolled`, nunca por "valor falsy".
  const modValue = entry.rolled ? entry.modifier : initiativeModifierFor(entry.characterKey);
  const meta = [
    INIT_TYPE_LABEL[entry.type] || "Token",
    showMod
      ? `${INITIATIVE_ATTR_LABEL} ${initiativeAttrValueFor(entry.characterKey)} (${_formatMod(modValue)})`
      : ""
  ].filter(Boolean).join(" · ");

  let action;
  if (entry.rolled) {
    // O numero so abre para quem tem direito de ver: o dono e o mestre. Para
    // os outros fica um "ja rolou" — no painel estreito o placar de todo
    // mundo virava ruido, e a ordem completa aparece na fase seguinte.
    action = showMod
      ? `<span class="init-row-total"><strong>${entry.total}</strong><small>${entry.roll} ${_formatMod(entry.modifier)}</small></span>`
      : `<span class="init-row-done" title="Já rolou">&#10003;</span>`;
  } else if (canRoll) {
    const label = mine ? "&#127922; Rolar minha iniciativa" : "&#127922; Rolar";
    action = `<button type="button" class="btn btn-primary btn-sm init-roll-btn" data-init-roll="${escapeHtmlInit(entry.id)}">${label}</button>`;
  } else if (entry.auto) {
    action = `<span class="init-row-wait">rola no fim</span>`;
  } else {
    action = `<span class="init-row-wait">aguardando…</span>`;
  }

  return `
    <li class="${classes}">
      <span class="init-avatar">${_entryAvatarHtml(entry)}</span>
      <span class="init-row-main">
        <strong class="init-row-name">${escapeHtmlInit(entry.name)}</strong>
        <span class="init-row-meta">${escapeHtmlInit(meta)}</span>
      </span>
      <span class="init-row-action">${action}</span>
    </li>`;
}

/* ── FASE 2: painel flutuante com a ordem de turno ───────────── */

function _renderTracker() {
  const tracker = document.getElementById("initiativeTracker");
  if (!tracker) return;
  const s = getInitiativeState();
  const open = s.active && s.phase === "order";

  tracker.hidden = !open;
  tracker.classList.toggle("is-collapsed", _initCollapsed);
  if (!open) return;

  const master = isInitMaster();
  const items  = _visibleEntries();
  const current = s.order[s.currentIndex] || null;

  const round = tracker.querySelector(".init-round-num");
  if (round) round.textContent = String(s.round);

  const status = tracker.querySelector(".init-status");
  if (status) {
    if (!current) status.textContent = "Aguardando o mestre…";
    else if (current.secret && !master) status.textContent = "Turno do mestre…";
    else status.textContent = `Vez de ${current.name}`;
  }

  const list = tracker.querySelector(".init-order-list");
  if (list) {
    // A posicao exibida numera a lista VISIVEL (o "is-current" continua
    // comparando o indice real). Para o jogador que nao ve o token secreto,
    // numerar pelo indice real deixaria buracos — 2, 3, 5 — denunciando que
    // ha alguem escondido na cena.
    list.innerHTML = items.map(({ entry, index }, visiblePos) => {
      const isCurrent = index === s.currentIndex;
      return `
        <li class="init-entry${isCurrent ? " is-current" : ""}${entry.secret ? " is-secret" : ""}"${isCurrent ? ' aria-current="true"' : ""}>
          <span class="init-pos">${visiblePos + 1}</span>
          <span class="init-avatar">${_entryAvatarHtml(entry)}</span>
          <span class="init-name">${escapeHtmlInit(entry.name)}</span>
          <span class="init-roll"><strong>${entry.total}</strong></span>
          ${master ? `<button type="button" class="init-remove-btn" data-init-remove="${escapeHtmlInit(entry.id)}" title="Remover da ordem" aria-label="Remover ${escapeHtmlInit(entry.name)} da ordem">&#10005;</button>` : ""}
        </li>`;
    }).join("") || `<li class="init-empty">Nenhum participante.</li>`;
  }

  const prevBtn = tracker.querySelector("#initPrevTurnBtn");
  if (prevBtn) prevBtn.disabled = s.round <= 1 && s.currentIndex <= 0;
}

/* ── COLAPSAR (preferencia local, nao sincroniza) ────────────── */

function toggleInitiativeCollapsed() {
  _initCollapsed = !_initCollapsed;
  renderInitiative();
}

function escapeHtmlInit(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── CLIQUES (delegados) ─────────────────────────────────────── */
document.addEventListener("click", function (e) {
  const rollBtn = e.target.closest("[data-init-roll]");
  if (rollBtn) {
    rollOwnInitiative(rollBtn.dataset.initRoll);
    return;
  }

  const removeBtn = e.target.closest("[data-init-remove]");
  if (removeBtn) {
    removeFromInitiative(removeBtn.dataset.initRemove);
    return;
  }

  if (e.target.closest("[data-init-collapse]")) {
    toggleInitiativeCollapsed();
    return;
  }
  if (e.target.closest("#initPrevTurnBtn"))   { prevInitiativeTurn(); return; }
  if (e.target.closest("#initNextTurnBtn"))   { nextInitiativeTurn(); return; }
  if (e.target.closest("#initEndBtn"))        { deactivateInitiative(); return; }
  if (e.target.closest("#initForceRollsBtn")) { forcePendingInitiativeRolls(); return; }
});

/* ── EXPORTACOES GLOBAIS (scripts classicos, sem bundler) ────── */
window.activateInitiative        = activateInitiative;
window.deactivateInitiative      = deactivateInitiative;
window.toggleInitiative          = toggleInitiative;
window.nextInitiativeTurn        = nextInitiativeTurn;
window.prevInitiativeTurn        = prevInitiativeTurn;
window.removeFromInitiative      = removeFromInitiative;
window.forcePendingInitiativeRolls = forcePendingInitiativeRolls;
window.rollOwnInitiative         = rollOwnInitiative;
window.toggleInitiativeCollapsed = toggleInitiativeCollapsed;
window.applyInitiativeState      = applyInitiativeState;
window.getInitiativeState        = getInitiativeState;
window.initInitiativeModule      = initInitiativeModule;
window.renderInitiative          = renderInitiative;
// Consumido pelo roteador de deltas (applyMesaRealtimeDelta em mesa-core.js)
// quando o mestre recebe mesa:initiative:roll de um jogador.
window.receiveInitiativeRoll     = _receivePlayerRoll;

// O boot pode ter passado por aqui antes deste arquivo carregar: se ficou
// iniciativa em espera, aplica agora (ver drainPendingInitiative).
drainPendingInitiative();
