/* ============================================================
 * mesa-ruler.js — Régua de medição (Etapa 44)
 * Shift+arrastar no palco mede distância em células e metros.
 * Enquanto mede, o traçado é transmitido via "mesa:ruler" (10Hz)
 * para todos os participantes — canal efêmero como o ping: nada
 * entra na cena nem persiste. Soltar o mouse (ou Escape) encerra
 * e avisa os outros clientes (active: false).
 * Coordenadas viajam como frações do MAPA (helper único de
 * mesa-map.js); sem mapa ativo, frações do palco ("stage").
 * ============================================================ */

const MESA_RULER_TYPE = "mesa:ruler";
// Broadcast a 10Hz — mesmo ritmo do drag de token, folga no rate limit do DO
const MESA_RULER_BROADCAST_MS = 100;
// 1 célula = 1,5 m (escala humana clássica de mesa). Constante do sistema.
const MESA_RULER_METERS_PER_CELL = 1.5;
// Régua remota some sozinha se o emissor sumir sem mandar active:false
const MESA_RULER_REMOTE_TTL_MS = 4000;

let _rulerActive = false;
let _rulerStart = null;         // { fx, fy } fração do palco
let _rulerEnd = null;
let _rulerLastBroadcastAt = 0;
let _rulerPendingFinal = false;
const _remoteRulers = new Map(); // nome do autor -> { el, expiresAt }
let _remoteRulerSweepTimer = 0;

/* ── Medida ──────────────────────────────────────────────────── */

function _rulerInner() { return document.getElementById("mesaStageInner"); }

function _rulerClamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

// Tamanho da célula em px de LAYOUT do palco (mesma matemática da grade:
// cellFrac é fração da largura exibida do mapa). Sem grade configurada,
// usa o default de 5% para a régua continuar útil.
function _rulerCellStagePx(inner) {
  const grid = typeof window.getMesaGridState === "function" ? window.getMesaGridState() : null;
  const cellFrac = Number(grid?.cellFrac) > 0 ? Number(grid.cellFrac) : 0.05;
  const surface = typeof window.getMesaMapSurfaceFrac === "function"
    ? window.getMesaMapSurfaceFrac()
    : { width: 1 };
  return Math.max(2, cellFrac * (surface.width || 1) * (inner.offsetWidth || 1));
}

/**
 * Distância entre dois pontos (fração do palco) em células e metros.
 * Calculada em px de layout (imune ao zoom, células quadradas em px).
 */
function measureMesaRuler(fx1, fy1, fx2, fy2) {
  const inner = _rulerInner();
  if (!inner) return null;
  const dxPx = (fx2 - fx1) * (inner.offsetWidth || 1);
  const dyPx = (fy2 - fy1) * (inner.offsetHeight || 1);
  const distPx = Math.hypot(dxPx, dyPx);
  const cells = distPx / _rulerCellStagePx(inner);
  return { cells, meters: cells * MESA_RULER_METERS_PER_CELL };
}

function _formatRulerLabel(measure) {
  if (!measure) return "";
  const cells = measure.cells.toFixed(1).replace(".", ",");
  const meters = measure.meters.toFixed(1).replace(".", ",");
  return `${cells} cél · ${meters} m`;
}

/* ── Render (SVG overlay + chip de rótulo) ──────────────────── */

function _ensureRulerOverlay() {
  const inner = _rulerInner();
  if (!inner) return null;
  let overlay = document.getElementById("mesaRulerOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "mesaRulerOverlay";
    overlay.setAttribute("aria-hidden", "true");
    inner.appendChild(overlay);
  }
  return overlay;
}

function _buildRulerElement(isSelf) {
  const el = document.createElement("div");
  el.className = "mesa-ruler" + (isSelf ? " is-self" : "");
  el.innerHTML =
    '<svg class="mesa-ruler-svg">' +
    '<line class="mesa-ruler-line" x1="0%" y1="0%" x2="0%" y2="0%" />' +
    '<circle class="mesa-ruler-dot mesa-ruler-dot-a" cx="0%" cy="0%" r="4" />' +
    '<circle class="mesa-ruler-dot mesa-ruler-dot-b" cx="0%" cy="0%" r="4" />' +
    "</svg>" +
    '<span class="mesa-ruler-label"></span>';
  return el;
}

function _updateRulerElement(el, fx1, fy1, fx2, fy2, labelText) {
  const pct = v => (v * 100) + "%";
  const line = el.querySelector(".mesa-ruler-line");
  line.setAttribute("x1", pct(fx1));
  line.setAttribute("y1", pct(fy1));
  line.setAttribute("x2", pct(fx2));
  line.setAttribute("y2", pct(fy2));
  const dotA = el.querySelector(".mesa-ruler-dot-a");
  dotA.setAttribute("cx", pct(fx1));
  dotA.setAttribute("cy", pct(fy1));
  const dotB = el.querySelector(".mesa-ruler-dot-b");
  dotB.setAttribute("cx", pct(fx2));
  dotB.setAttribute("cy", pct(fy2));
  const label = el.querySelector(".mesa-ruler-label");
  label.textContent = labelText;
  label.style.left = ((fx1 + fx2) / 2 * 100) + "%";
  label.style.top = ((fy1 + fy2) / 2 * 100) + "%";
}

function _renderLocalRuler() {
  const overlay = _ensureRulerOverlay();
  if (!overlay) return;
  let el = overlay.querySelector(".mesa-ruler.is-self");
  if (!_rulerActive || !_rulerStart || !_rulerEnd) {
    el?.remove();
    return;
  }
  if (!el) {
    el = _buildRulerElement(true);
    overlay.appendChild(el);
  }
  const m = measureMesaRuler(_rulerStart.fx, _rulerStart.fy, _rulerEnd.fx, _rulerEnd.fy);
  _updateRulerElement(el, _rulerStart.fx, _rulerStart.fy, _rulerEnd.fx, _rulerEnd.fy, _formatRulerLabel(m));
}

/* ── Broadcast ───────────────────────────────────────────────── */

function _rulerPointToWire(fx, fy) {
  if (typeof window.mesaStageFracToMapFrac === "function") {
    const converted = window.mesaStageFracToMapFrac(fx, fy);
    if (converted.hasMap) return { u: converted.u, v: converted.v, space: "map" };
  }
  return { u: fx, v: fy, space: "stage" };
}

function _broadcastRuler(active, force) {
  if (typeof sendMesaRealtimeDelta !== "function") return;
  const now = Date.now();
  if (!force && now - _rulerLastBroadcastAt < MESA_RULER_BROADCAST_MS) return;
  _rulerLastBroadcastAt = now;
  if (!active) {
    sendMesaRealtimeDelta(MESA_RULER_TYPE, { active: false });
    return;
  }
  const a = _rulerPointToWire(_rulerStart.fx, _rulerStart.fy);
  const b = _rulerPointToWire(_rulerEnd.fx, _rulerEnd.fy);
  sendMesaRealtimeDelta(MESA_RULER_TYPE, {
    active: true,
    u1: a.u, v1: a.v,
    u2: b.u, v2: b.v,
    space: a.space
  });
}

/* ── Régua remota ────────────────────────────────────────────── */

function _remoteRulerKey(payload) {
  const name = String(payload?.actor?.username || "").trim().toLowerCase();
  return name || String(payload?.clientId || "anon");
}

function _sweepRemoteRulers() {
  const now = Date.now();
  _remoteRulers.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      entry.el.remove();
      _remoteRulers.delete(key);
    }
  });
  if (_remoteRulers.size === 0 && _remoteRulerSweepTimer) {
    window.clearInterval(_remoteRulerSweepTimer);
    _remoteRulerSweepTimer = 0;
  }
}

/** Consome um mesa:ruler vindo do realtime (applyMesaRealtimeDelta). */
function applyMesaRulerFromRemote(payload) {
  const key = _remoteRulerKey(payload);
  const existing = _remoteRulers.get(key);

  if (!payload?.active) {
    if (existing) {
      existing.el.remove();
      _remoteRulers.delete(key);
    }
    return;
  }

  const raw = [payload.u1, payload.v1, payload.u2, payload.v2].map(Number);
  if (raw.some(n => !Number.isFinite(n))) return;

  let [fx1, fy1, fx2, fy2] = raw;
  if (String(payload.space || "") === "map" && typeof window.mesaMapFracToStageFrac === "function") {
    const a = window.mesaMapFracToStageFrac(fx1, fy1);
    const b = window.mesaMapFracToStageFrac(fx2, fy2);
    fx1 = a.fx; fy1 = a.fy;
    fx2 = b.fx; fy2 = b.fy;
  }
  const clamped = [fx1, fy1, fx2, fy2].map(v => _rulerClamp01(v));
  if (clamped.some(v => v === null)) return;
  [fx1, fy1, fx2, fy2] = clamped;

  const overlay = _ensureRulerOverlay();
  if (!overlay) return;
  let el = existing?.el;
  if (!el) {
    el = _buildRulerElement(false);
    const name = String(payload?.actor?.username || "").trim().slice(0, 24);
    if (name) {
      const nameEl = document.createElement("span");
      nameEl.className = "mesa-ruler-name";
      nameEl.textContent = name;
      el.appendChild(nameEl);
    }
    overlay.appendChild(el);
  }
  const m = measureMesaRuler(fx1, fy1, fx2, fy2);
  _updateRulerElement(el, fx1, fy1, fx2, fy2, _formatRulerLabel(m));
  const nameEl = el.querySelector(".mesa-ruler-name");
  if (nameEl) {
    nameEl.style.left = (fx2 * 100) + "%";
    nameEl.style.top = (fy2 * 100) + "%";
  }
  _remoteRulers.set(key, { el, expiresAt: Date.now() + MESA_RULER_REMOTE_TTL_MS });
  if (!_remoteRulerSweepTimer) {
    _remoteRulerSweepTimer = window.setInterval(_sweepRemoteRulers, 1000);
  }
}

/* ── Interação: Shift+arrastar ───────────────────────────────── */

function _rulerFracFromEvent(event) {
  const inner = _rulerInner();
  if (!inner) return null;
  const rect = inner.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    fx: _rulerClamp01((event.clientX - rect.left) / rect.width),
    fy: _rulerClamp01((event.clientY - rect.top) / rect.height)
  };
}

function _handleRulerPointerDown(event) {
  if (!event.shiftKey || event.button !== 0) return;
  const point = _rulerFracFromEvent(event);
  if (!point || point.fx === null || point.fy === null) return;
  // Captura antes de drag/pan/rubber-band — Shift+arrastar é só régua.
  event.preventDefault();
  event.stopPropagation();
  _rulerActive = true;
  _rulerStart = point;
  _rulerEnd = point;
  _rulerLastBroadcastAt = 0;
  _renderLocalRuler();
  window.addEventListener("pointermove", _handleRulerPointerMove, true);
  window.addEventListener("pointerup", _handleRulerPointerUp, true);
  window.addEventListener("pointercancel", _handleRulerPointerUp, true);
  window.addEventListener("keydown", _handleRulerKeyDown, true);
}

function _handleRulerPointerMove(event) {
  if (!_rulerActive) return;
  const point = _rulerFracFromEvent(event);
  if (!point) return;
  _rulerEnd = point;
  _renderLocalRuler();
  _broadcastRuler(true, false);
}

function _handleRulerPointerUp() {
  if (!_rulerActive) return;
  _endRulerMeasurement();
}

function _handleRulerKeyDown(event) {
  if (event.key === "Escape" && _rulerActive) _endRulerMeasurement();
}

function _endRulerMeasurement() {
  _rulerActive = false;
  _rulerStart = null;
  _rulerEnd = null;
  _renderLocalRuler();
  _broadcastRuler(false, true);
  window.removeEventListener("pointermove", _handleRulerPointerMove, true);
  window.removeEventListener("pointerup", _handleRulerPointerUp, true);
  window.removeEventListener("pointercancel", _handleRulerPointerUp, true);
  window.removeEventListener("keydown", _handleRulerKeyDown, true);
}

function initMesaRuler() {
  const wrap = document.getElementById("mesaStageWrap");
  if (!wrap) return;
  wrap.addEventListener("pointerdown", _handleRulerPointerDown, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMesaRuler, { once: true });
} else {
  initMesaRuler();
}

window.measureMesaRuler = measureMesaRuler;
window.applyMesaRulerFromRemote = applyMesaRulerFromRemote;
