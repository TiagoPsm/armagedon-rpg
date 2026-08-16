/* ============================================================
 * mesa-dice.js — Dados na Mesa (Etapa 45; refeito na Etapa 79)
 *
 * Painel de rolagem compartilhada: o cliente PEDE (mesa:dice:request)
 * e quem rola é o Durable Object com crypto.getRandomValues — o
 * resultado (mesa:dice:result) chega para todos, à prova de trapaça,
 * com histórico das últimas 20 rolagens (entregue no mesa:ready).
 * Sem backend (modo local), rola no próprio cliente com
 * crypto.getRandomValues e marca a entrada como "local".
 *
 * FLUXO (Etapa 79) — escolher, depois rolar
 * -----------------------------------------
 *   Os chips de dado SELECIONAM; a rolagem sai no botão ROLAR. Mudou
 *   porque modo (vantagem/desvantagem) e segredo são escolhas feitas
 *   ANTES de rolar: com "clique = rolagem" dava para rolar em segredo
 *   sem querer. A fórmula livre, quando preenchida, vence os chips.
 *
 * REGRAS QUE ESTE ARQUIVO ESPELHA DO WORKER
 * -----------------------------------------
 *   Vantagem/desvantagem: rola a FÓRMULA INTEIRA duas vezes e fica com
 *   o total maior/menor (igual à ficha, ver js/ficha-dice.js).
 *   Crítico/desastre: SÓ no d20 com UM dado (20 → crítico, 1 → desastre).
 *   As duas vivem em cloudflare/src/mesa-realtime-rules.js e são
 *   duplicadas aqui apenas para o MODO LOCAL (sem backend). Com backend,
 *   quem decide é sempre o servidor — mudou lá, muda aqui junto.
 * ============================================================ */

const MESA_DICE_MAX_HISTORY = 20;
const MESA_DICE_ALLOWED_SIDES = new Set([2, 4, 6, 8, 10, 12, 20, 100]);
const MESA_DICE_MODES = new Set(["normal", "advantage", "disadvantage"]);
// Se o resultado do DO não voltar nesse prazo, o botão volta ao normal —
// senão uma mensagem perdida deixaria o painel travado em "rolando…".
const MESA_DICE_WAIT_TIMEOUT_MS = 8000;

let _diceHistory = [];
let _dicePanelBound = false;
let _diceCollapsed = false;
let _diceWaitTimer = 0;
let _diceWaiting = false;

// Escolhas do painel (locais, não sincronizam).
const _dicePanel = { die: 20, mode: "normal", secret: false };

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

function normalizeMesaDiceMode(value) {
  const mode = String(value || "normal").trim().toLowerCase();
  return MESA_DICE_MODES.has(mode) ? mode : "normal";
}

/** Nome de quem está nesta tela. É `state.session.username` — NÃO existe
 *  `state.username` (era o bug que fazia você receber toast das próprias
 *  rolagens e aparecer como "você" no modo local). */
function _diceSelfUsername() {
  return String(state?.session?.username || window.AUTH?.getSession?.()?.username || "").trim();
}

/* ── Rolagem ─────────────────────────────────────────────────── */

/** Uma tirada da fórmula inteira. */
function _diceRollSpec(spec) {
  const rolls = [];
  for (let i = 0; i < spec.count; i += 1) rolls.push(_diceSecureRandomInt(spec.sides));
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + spec.modifier;
  return { rolls, total };
}

/** Espelha rollMesaDiceWithMode() do Worker — só para o modo local. */
function _diceRollWithMode(spec, mode) {
  const normalizedMode = normalizeMesaDiceMode(mode);
  const first = _diceRollSpec(spec);
  if (normalizedMode === "normal") {
    return { mode: normalizedMode, rolls: first.rolls, rollsSecond: null, total: first.total };
  }
  const second = _diceRollSpec(spec);
  const keepFirst = normalizedMode === "advantage"
    ? first.total >= second.total
    : first.total <= second.total;
  const chosen = keepFirst ? first : second;
  const discarded = keepFirst ? second : first;
  return { mode: normalizedMode, rolls: chosen.rolls, rollsSecond: discarded.rolls, total: chosen.total };
}

/** Espelha getMesaDiceSpecial() do Worker — só no d20 com um dado. */
function _diceSpecial(spec, rolls) {
  if (!spec || spec.sides !== 20 || spec.count !== 1) return "";
  const die = Array.isArray(rolls) ? Number(rolls[0]) : NaN;
  if (die === 20) return "critical";
  if (die === 1) return "fumble";
  return "";
}

/**
 * Pede uma rolagem. Com backend: envia mesa:dice:request e o resultado
 * volta via mesa:dice:result (para todos, ou só para os mestres quando
 * `secret`). Sem backend: rola local.
 * Retorna true se a fórmula era válida.
 */
function requestMesaDiceRoll(formula, label = "", options = {}) {
  const spec = parseMesaDiceFormulaClient(formula);
  if (!spec) {
    window.UI?.toast?.("Fórmula de dados inválida. Use NdM (+/- mod), ex: 2d20+3.", { kicker: "// Dados" });
    return false;
  }

  const mode = normalizeMesaDiceMode(options?.mode);
  // Segredo é privilégio de mestre; o DO ignora a flag vinda de jogador,
  // e aqui nem chegamos a enviá-la.
  const secret = Boolean(options?.secret) && isMesaDiceMaster();

  const sent = typeof sendMesaRealtimeDelta === "function"
    && sendMesaRealtimeDelta("mesa:dice:request", {
      formula: spec.formula,
      label: String(label || "").slice(0, 60),
      mode,
      secret
    });
  if (sent) {
    _setDiceWaiting(spec.formula, mode, secret);
    return true; // resultado chega via mesa:dice:result
  }

  // Modo local (backend indisponível): rola aqui mesmo, com o mesmo RNG.
  const { rolls, rollsSecond, total } = _diceRollWithMode(spec, mode);
  applyMesaDiceResult({
    id: "local-" + Date.now() + "-" + Math.floor(Math.random() * 1e6),
    formula: spec.formula,
    label: String(label || "").slice(0, 60),
    mode,
    rolls,
    rollsSecond,
    special: _diceSpecial(spec, rolls),
    secret,
    modifier: spec.modifier,
    total,
    actor: { username: _diceSelfUsername() || "você", role: state?.role || "player" },
    local: true,
    sentAt: new Date().toISOString()
  });
  return true;
}

/** Papel desta tela, fail-closed: o módulo de permissões manda; sem ele,
 *  cai no isMaster() do core — nunca em "liberado". */
function isMesaDiceMaster() {
  if (typeof isMesaMasterRole === "function") return isMesaMasterRole();
  return typeof isMaster === "function" && isMaster();
}

/* ── Histórico + render ──────────────────────────────────────── */

/** Consome um mesa:dice:result (do realtime ou local). */
function applyMesaDiceResult(payload) {
  if (!payload || typeof payload !== "object") return;
  const rolls = Array.isArray(payload.rolls) ? payload.rolls.map(Number).filter(Number.isFinite) : [];
  if (!rolls.length || !Number.isFinite(Number(payload.total))) return;
  const second = Array.isArray(payload.rollsSecond)
    ? payload.rollsSecond.map(Number).filter(Number.isFinite)
    : null;
  const entry = {
    id: String(payload.id || "r-" + Date.now()),
    formula: String(payload.formula || "").slice(0, 16),
    label: String(payload.label || "").slice(0, 60),
    mode: normalizeMesaDiceMode(payload.mode),
    rolls: rolls.slice(0, 20),
    rollsSecond: second && second.length ? second.slice(0, 20) : null,
    special: ["critical", "fumble"].includes(String(payload.special)) ? String(payload.special) : "",
    secret: payload.secret === true,
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

  if (_isOwnDiceEntry(entry)) _clearDiceWaiting();
  _renderMesaDiceResult(entry);
  _renderMesaDiceHistory();
  _notifyMesaDiceResult(entry);
}

function _isOwnDiceEntry(entry) {
  const self = _diceSelfUsername().toLowerCase();
  return Boolean(self) && entry.actor.username.trim().toLowerCase() === self;
}

/** Substitui o histórico inteiro (vem no mesa:ready, mais recente primeiro). */
function setMesaDiceHistory(list) {
  if (!Array.isArray(list)) return;
  _diceHistory = [];
  // Insere do mais antigo pro mais novo para o unshift preservar a ordem
  // (mais recente no topo).
  [...list].reverse().forEach(item => {
    if (!item || typeof item !== "object") return;
    const rolls = Array.isArray(item.rolls) ? item.rolls : [];
    if (!rolls.length) return;
    const second = Array.isArray(item.rollsSecond) ? item.rollsSecond : null;
    _diceHistory.unshift({
      id: String(item.id || "h-" + _diceHistory.length),
      formula: String(item.formula || "").slice(0, 16),
      label: String(item.label || "").slice(0, 60),
      mode: normalizeMesaDiceMode(item.mode),
      rolls: rolls.map(Number).filter(Number.isFinite).slice(0, 20),
      rollsSecond: second ? second.map(Number).filter(Number.isFinite).slice(0, 20) : null,
      special: ["critical", "fumble"].includes(String(item.special)) ? String(item.special) : "",
      secret: item.secret === true,
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

const MESA_DICE_MODE_LABEL = {
  normal: "",
  advantage: "com vantagem",
  disadvantage: "com desvantagem"
};

/* ── Card do último resultado ────────────────────────────────── */

function _diceResultEl() {
  return document.getElementById("mesaDiceResult");
}

/** Mostra "rolando…" entre o pedido e a resposta do DO (há latência de
 *  rede, e sem isso nada acontece na tela depois do clique). */
function _setDiceWaiting(formula, mode, secret) {
  const card = _diceResultEl();
  _diceWaiting = true;
  clearTimeout(_diceWaitTimer);
  _diceWaitTimer = setTimeout(() => {
    _clearDiceWaiting();
    window.UI?.toast?.("A rolagem não voltou do servidor. Tente de novo.", { kicker: "// Dados" });
  }, MESA_DICE_WAIT_TIMEOUT_MS);

  _updateRollButton();
  if (!card) return;
  card.hidden = false;
  card.className = "mesa-dice-result is-waiting" + (secret ? " is-secret" : "");
  const nota = [MESA_DICE_MODE_LABEL[mode], secret ? "em segredo" : ""].filter(Boolean).join(" · ");
  card.innerHTML = `
    <div class="mesa-dice-result-top">
      <span class="mesa-dice-result-formula">${_diceEscape(formula)}${nota ? " · " + _diceEscape(nota) : ""}</span>
      <strong class="mesa-dice-result-total">…</strong>
    </div>
    <p class="mesa-dice-result-note">Rolando no servidor…</p>`;
}

function _clearDiceWaiting() {
  _diceWaiting = false;
  clearTimeout(_diceWaitTimer);
  _diceWaitTimer = 0;
  _updateRollButton();
}

function _updateRollButton() {
  const btn = document.getElementById("mesaDiceRollBtn");
  if (!btn) return;
  btn.disabled = _diceWaiting;
  btn.textContent = _diceWaiting ? "Rolando…" : "Rolar";
}

function _dicePipsHtml(rolls, discarded) {
  const cls = "mesa-dice-pips" + (discarded ? " is-discarded" : "");
  return `<div class="${cls}">${rolls.map(r => `<span class="mesa-dice-pip">${r}</span>`).join("")}</div>`;
}

function _renderMesaDiceResult(entry) {
  const card = _diceResultEl();
  if (!card) return;

  const mine = _isOwnDiceEntry(entry);
  card.hidden = false;
  card.className = [
    "mesa-dice-result",
    entry.special ? `is-${entry.special}` : "",
    entry.secret ? "is-secret" : ""
  ].filter(Boolean).join(" ");

  // A formula ja carrega o modificador ("1d20+5") — repeti-lo aqui daria
  // "1d20+5 +5".
  const quem = mine ? "" : `${entry.actor.username} · `;
  const notas = [
    MESA_DICE_MODE_LABEL[entry.mode],
    entry.label,
    entry.secret ? "🔒 em segredo" : "",
    entry.local ? "local" : ""
  ].filter(Boolean).join(" · ");

  const tag = entry.special === "critical"
    ? `<span class="mesa-dice-result-tag">Crítico</span>`
    : entry.special === "fumble"
      ? `<span class="mesa-dice-result-tag">Desastre</span>`
      : "";

  card.innerHTML = `
    <div class="mesa-dice-result-top">
      <span class="mesa-dice-result-formula">${_diceEscape(quem + entry.formula)}</span>
      <strong class="mesa-dice-result-total">${entry.total}</strong>
    </div>
    ${_dicePipsHtml(entry.rolls, false)}
    ${entry.rollsSecond ? _dicePipsHtml(entry.rollsSecond, true) : ""}
    ${tag}
    ${notas ? `<p class="mesa-dice-result-note">${_diceEscape(notas)}</p>` : ""}`;
}

function _diceEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── Histórico ───────────────────────────────────────────────── */

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
    item.className = [
      "mesa-dice-entry",
      entry.special ? `is-${entry.special}` : "",
      entry.secret ? "is-secret" : ""
    ].filter(Boolean).join(" ");

    const who = document.createElement("span");
    who.className = "mesa-dice-who" + (entry.actor.role === "master" ? " is-master" : "");
    who.textContent = entry.actor.username
      + (entry.secret ? " 🔒" : "")
      + (entry.local ? " (local)" : "");

    const detail = document.createElement("span");
    detail.className = "mesa-dice-detail";
    const mod = entry.modifier === 0 ? "" : (entry.modifier > 0 ? ` +${entry.modifier}` : ` ${entry.modifier}`);
    const partes = [`${entry.formula} → [${entry.rolls.join(", ")}]${mod}`];
    if (entry.rollsSecond) partes.push(`(descartado [${entry.rollsSecond.join(", ")}])`);
    if (MESA_DICE_MODE_LABEL[entry.mode]) partes.push(MESA_DICE_MODE_LABEL[entry.mode]);
    if (entry.label) partes.push(entry.label);
    detail.textContent = partes.join(" · ");

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
  if (_isOwnDiceEntry(entry)) return;   // a própria rolagem não vira aviso
  window.UI?.toast?.(`${entry.actor.username} rolou ${entry.formula}: ${entry.total}`, { kicker: "// Dados" });
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

function _toggleMesaDiceCollapsed() {
  _diceCollapsed = !_diceCollapsed;
  document.getElementById("mesaDicePanel")?.classList.toggle("is-collapsed", _diceCollapsed);
}

/** Fórmula que o painel vai rolar: a livre vence os chips. */
function _mesaDiceFormulaFromPanel() {
  const livre = String(document.getElementById("mesaDiceFormula")?.value || "").trim();
  if (livre) return livre;

  const qtyInput = document.getElementById("mesaDiceQty");
  const modInput = document.getElementById("mesaDiceMod");
  const qty = Math.min(20, Math.max(1, Number.parseInt(qtyInput?.value, 10) || 1));
  const mod = Math.min(99, Math.max(-99, Number.parseInt(modInput?.value, 10) || 0));
  const suffix = mod === 0 ? "" : (mod > 0 ? `+${mod}` : String(mod));
  return `${qty}d${_dicePanel.die}${suffix}`;
}

function _rollFromDicePanel() {
  if (_diceWaiting) return;
  const formulaInput = document.getElementById("mesaDiceFormula");
  const formula = _mesaDiceFormulaFromPanel();
  const valida = Boolean(parseMesaDiceFormulaClient(formula));
  formulaInput?.classList.toggle("is-invalid", !valida && Boolean(formulaInput?.value.trim()));
  if (!valida) {
    window.UI?.toast?.("Fórmula de dados inválida. Use NdM (+/- mod), ex: 2d20+3.", { kicker: "// Dados" });
    return;
  }

  const label = String(document.getElementById("mesaDiceLabel")?.value || "").trim();
  requestMesaDiceRoll(formula, label, { mode: _dicePanel.mode, secret: _dicePanel.secret });
}

function _selectMesaDie(sides) {
  _dicePanel.die = sides;
  document.querySelectorAll(".mesa-dice-die").forEach(btn => {
    btn.classList.toggle("is-active", Number.parseInt(btn.dataset.die, 10) === sides);
  });
}

function _selectMesaDiceMode(mode) {
  _dicePanel.mode = normalizeMesaDiceMode(mode);
  document.querySelectorAll(".mesa-dice-mode").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.mode === _dicePanel.mode);
  });
}

function initMesaDice() {
  if (_dicePanelBound) return;
  const button = document.getElementById("mesaDiceBtn");
  const panel = document.getElementById("mesaDicePanel");
  if (!button || !panel) return;
  _dicePanelBound = true;

  button.addEventListener("click", () => _toggleMesaDicePanel());
  button.dataset.armed = "1";   // contrato da Etapa 82
  document.getElementById("mesaDiceCloseBtn")?.addEventListener("click", () => _toggleMesaDicePanel(false));
  document.getElementById("mesaDiceCollapseBtn")?.addEventListener("click", _toggleMesaDiceCollapsed);

  panel.querySelectorAll(".mesa-dice-die").forEach(die => {
    die.addEventListener("click", () => _selectMesaDie(Number.parseInt(die.dataset.die, 10)));
  });
  panel.querySelectorAll(".mesa-dice-mode").forEach(btn => {
    btn.addEventListener("click", () => _selectMesaDiceMode(btn.dataset.mode));
  });

  const secretInput = document.getElementById("mesaDiceSecret");
  secretInput?.addEventListener("change", () => { _dicePanel.secret = Boolean(secretInput.checked); });

  document.getElementById("mesaDiceRollBtn")?.addEventListener("click", _rollFromDicePanel);

  // A fórmula livre manda quando preenchida: o painel avisa isso apagando
  // os chips, para ninguém achar que o d20 selecionado ainda vale.
  const formulaInput = document.getElementById("mesaDiceFormula");
  formulaInput?.addEventListener("input", () => {
    const ativo = Boolean(formulaInput.value.trim());
    panel.classList.toggle("is-formula-mode", ativo);
    if (!ativo) formulaInput.classList.remove("is-invalid");
  });
  [formulaInput, document.getElementById("mesaDiceLabel")].forEach(input => {
    input?.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      _rollFromDicePanel();
    });
  });

  _selectMesaDie(_dicePanel.die);
  _selectMesaDiceMode(_dicePanel.mode);
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
