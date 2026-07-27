/* ============================================================
 * mesa-dice.js — Dados na Mesa (Etapa 45)
 * Painel de rolagem compartilhada: o cliente PEDE (mesa:dice:request)
 * e quem rola é o Durable Object com crypto.getRandomValues — o
 * resultado (mesa:dice:result) chega para todos, à prova de trapaça,
 * com histórico das últimas 20 rolagens (entregue no mesa:ready).
 * Sem backend (modo local), rola no próprio cliente com
 * crypto.getRandomValues e marca a entrada como "local".
 * ============================================================ */

const MESA_DICE_MAX_HISTORY = 20;
const MESA_DICE_ALLOWED_SIDES = new Set([2, 4, 6, 8, 10, 12, 20, 100]);

let _diceHistory = [];
let _dicePanelBound = false;

/* ── Fórmula (espelho da gramática do Worker) ───────────────── */

function parseMesaDiceFormulaClient(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, "");
  const match = /^(\d{0,2})d(\d{1,3})([+-]\d{1,2})?$/.exec(text);
  if (!match) return null;
  const count = match[1] === "" ? 1 : Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const modifier = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (count < 1 || count > 20) return null;
  if (!MESA_DICE_ALLOWED_SIDES.has(sides)) return null;
  const suffix = modifier === 0 ? "" : (modifier > 0 ? `+${modifier}` : String(modifier));
  return { count, sides, modifier, formula: `${count}d${sides}${suffix}` };
}

function _diceSecureRandomInt(sides) {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return (value % sides) + 1;
}

/* ── Rolagem ─────────────────────────────────────────────────── */

/**
 * Pede uma rolagem. Com backend: envia mesa:dice:request e o resultado
 * volta via mesa:dice:result (para todos). Sem backend: rola local.
 * Retorna true se a fórmula era válida.
 */
function requestMesaDiceRoll(formula, label = "") {
  const spec = parseMesaDiceFormulaClient(formula);
  if (!spec) {
    window.UI?.toast?.("Fórmula de dados inválida. Use NdM (+/- mod), ex: 2d20+3.", { kicker: "// Dados" });
    return false;
  }

  const sent = typeof sendMesaRealtimeDelta === "function"
    && sendMesaRealtimeDelta("mesa:dice:request", { formula: spec.formula, label: String(label || "").slice(0, 60) });
  if (sent) return true; // resultado chega via mesa:dice:result

  // Modo local (backend indisponível): rola aqui mesmo, com o mesmo RNG.
  const rolls = [];
  for (let i = 0; i < spec.count; i += 1) rolls.push(_diceSecureRandomInt(spec.sides));
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + spec.modifier;
  applyMesaDiceResult({
    id: "local-" + Date.now() + "-" + Math.floor(Math.random() * 1e6),
    formula: spec.formula,
    label: String(label || "").slice(0, 60),
    rolls,
    modifier: spec.modifier,
    total,
    actor: { username: state?.username || "você", role: state?.role || "player" },
    local: true,
    sentAt: new Date().toISOString()
  });
  return true;
}

/* ── Histórico + render ──────────────────────────────────────── */

/** Consome um mesa:dice:result (do realtime ou local). */
function applyMesaDiceResult(payload) {
  if (!payload || typeof payload !== "object") return;
  const rolls = Array.isArray(payload.rolls) ? payload.rolls.map(Number).filter(Number.isFinite) : [];
  if (!rolls.length || !Number.isFinite(Number(payload.total))) return;
  const entry = {
    id: String(payload.id || "r-" + Date.now()),
    formula: String(payload.formula || "").slice(0, 16),
    label: String(payload.label || "").slice(0, 60),
    rolls: rolls.slice(0, 20),
    modifier: Number(payload.modifier) || 0,
    total: Number(payload.total),
    actor: {
      username: String(payload.actor?.username || "?").slice(0, 24),
      role: String(payload.actor?.role || "player")
    },
    local: Boolean(payload.local),
    sentAt: String(payload.sentAt || "")
  };
  if (_diceHistory.some(existing => existing.id === entry.id)) return;
  _diceHistory.unshift(entry);
  _diceHistory = _diceHistory.slice(0, MESA_DICE_MAX_HISTORY);
  _renderMesaDiceHistory();
  _notifyMesaDiceResult(entry);
}

/** Substitui o histórico inteiro (vem no mesa:ready, mais recente primeiro). */
function setMesaDiceHistory(list) {
  if (!Array.isArray(list)) return;
  _diceHistory = [];
  // applyMesaDiceResult valida cada entrada; insere do mais antigo pro mais
  // novo para o unshift preservar a ordem (mais recente no topo).
  [...list].reverse().forEach(item => {
    if (!item || typeof item !== "object") return;
    const rolls = Array.isArray(item.rolls) ? item.rolls : [];
    if (!rolls.length) return;
    _diceHistory.unshift({
      id: String(item.id || "h-" + _diceHistory.length),
      formula: String(item.formula || "").slice(0, 16),
      label: String(item.label || "").slice(0, 60),
      rolls: rolls.map(Number).filter(Number.isFinite).slice(0, 20),
      modifier: Number(item.modifier) || 0,
      total: Number(item.total) || 0,
      actor: {
        username: String(item.actor?.username || "?").slice(0, 24),
        role: String(item.actor?.role || "player")
      },
      local: false,
      sentAt: String(item.sentAt || "")
    });
  });
  _diceHistory = _diceHistory.slice(0, MESA_DICE_MAX_HISTORY);
  _renderMesaDiceHistory();
}

function getMesaDiceHistory() {
  return _diceHistory.map(entry => ({ ...entry, rolls: [...entry.rolls] }));
}

function _renderMesaDiceHistory() {
  const list = document.getElementById("mesaDiceHistory");
  if (!list) return;
  list.textContent = "";
  if (!_diceHistory.length) {
    const empty = document.createElement("li");
    empty.className = "mesa-dice-empty";
    empty.textContent = "Nenhuma rolagem ainda. Todos verão os resultados aqui.";
    list.appendChild(empty);
    return;
  }
  _diceHistory.forEach(entry => {
    const item = document.createElement("li");
    item.className = "mesa-dice-entry";

    const who = document.createElement("span");
    who.className = "mesa-dice-who" + (entry.actor.role === "master" ? " is-master" : "");
    who.textContent = entry.actor.username + (entry.local ? " (local)" : "");

    const detail = document.createElement("span");
    detail.className = "mesa-dice-detail";
    const mod = entry.modifier === 0 ? "" : (entry.modifier > 0 ? ` +${entry.modifier}` : ` ${entry.modifier}`);
    detail.textContent = `${entry.formula} → [${entry.rolls.join(", ")}]${mod}`;
    if (entry.label) detail.textContent += ` · ${entry.label}`;

    const total = document.createElement("strong");
    total.className = "mesa-dice-total";
    total.textContent = String(entry.total);

    item.appendChild(who);
    item.appendChild(detail);
    item.appendChild(total);
    list.appendChild(item);
  });
}

// Painel fechado: badge no botão + toast para não perder a rolagem dos outros.
function _notifyMesaDiceResult(entry) {
  const panel = document.getElementById("mesaDicePanel");
  if (panel && !panel.hidden) return;
  document.getElementById("mesaDiceBtn")?.classList.add("has-new");
  const selfName = String(state?.username || "").trim().toLowerCase();
  if (entry.actor.username.trim().toLowerCase() !== selfName) {
    window.UI?.toast?.(`${entry.actor.username} rolou ${entry.formula}: ${entry.total}`, { kicker: "// Dados" });
  }
}

/* ── UI do painel ────────────────────────────────────────────── */

function _toggleMesaDicePanel(forceOpen) {
  const panel = document.getElementById("mesaDicePanel");
  const button = document.getElementById("mesaDiceBtn");
  if (!panel) return;
  const open = forceOpen !== undefined ? Boolean(forceOpen) : panel.hidden;
  panel.hidden = !open;
  button?.setAttribute("aria-pressed", String(open));
  if (open) button?.classList.remove("has-new");
}

function _rollFromDicePanel(sides) {
  const qtyInput = document.getElementById("mesaDiceQty");
  const modInput = document.getElementById("mesaDiceMod");
  const qty = Math.min(20, Math.max(1, Number.parseInt(qtyInput?.value, 10) || 1));
  const mod = Math.min(99, Math.max(-99, Number.parseInt(modInput?.value, 10) || 0));
  const suffix = mod === 0 ? "" : (mod > 0 ? `+${mod}` : String(mod));
  requestMesaDiceRoll(`${qty}d${sides}${suffix}`);
}

function initMesaDice() {
  if (_dicePanelBound) return;
  const button = document.getElementById("mesaDiceBtn");
  const panel = document.getElementById("mesaDicePanel");
  if (!button || !panel) return;
  _dicePanelBound = true;

  button.addEventListener("click", () => _toggleMesaDicePanel());
  document.getElementById("mesaDiceCloseBtn")?.addEventListener("click", () => _toggleMesaDicePanel(false));
  panel.querySelectorAll(".mesa-dice-die").forEach(die => {
    die.addEventListener("click", () => _rollFromDicePanel(Number.parseInt(die.dataset.die, 10)));
  });
  _renderMesaDiceHistory();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMesaDice, { once: true });
} else {
  initMesaDice();
}

window.requestMesaDiceRoll = requestMesaDiceRoll;
window.applyMesaDiceResult = applyMesaDiceResult;
window.setMesaDiceHistory = setMesaDiceHistory;
window.getMesaDiceHistory = getMesaDiceHistory;
