/* ============================================================
 * mesa-fog.js — Fog of War (Etapa 47)
 * ============================================================
 *
 * MODELO
 * ─────────────────────────────────────────────────────────────
 * A névoa é amarrada ao MAPA (mesma decisão D1 da grade): as
 * operações vivem em frações do mapa exibido, convertidas SEMPRE
 * pelo helper único de mesa-map.js. Pan/zoom só re-renderizam.
 * Sem mapa ativo, a superfície é o próprio palco.
 *
 * Estado: { enabled, ops[] } — cada op é um pincel circular
 * { mode: "reveal"|"hide", u, v, r } (r = fração da LARGURA do
 * mapa), aplicado NA ORDEM. Névoa ativa sem ops = tudo coberto.
 * Cap de 400 ops (o Worker também corta).
 *
 * RENDER
 * ─────────────────────────────────────────────────────────────
 * Canvas dedicado #mesaFogCanvas acima dos tokens. O desenho é
 * sempre 100% opaco; quem diferencia papel é a OPACIDADE CSS do
 * canvas: jogador 1.0 (não vê nada sob a névoa), mestre 0.4
 * (enxerga através para conduzir a cena).
 *
 * SYNC: estado completo via "mesa:fog:update" (master-only no DO)
 * + campo `fog` na cena oficial (normalizado no Worker).
 * ============================================================ */

"use strict";

const MESA_FOG_UPDATE_TYPE = "mesa:fog:update";
const MESA_FOG_MAX_OPS = 400;
const MESA_FOG_COLOR = "#070408";
const MESA_FOG_MASTER_OPACITY = 0.4;
// Broadcast a 10Hz durante a pincelada; o persist só acontece no soltar.
const MESA_FOG_BROADCAST_MS = 100;
const MESA_FOG_BRUSH_MIN = 0.02;
const MESA_FOG_BRUSH_MAX = 0.25;
const MESA_FOG_BRUSH_STEP = 0.01;

let _fogState = { enabled: false, ops: [] };
let _fogCanvasEl = null;
let _fogCtx = null;
let _fogStageEl = null;
// Pincel do mestre: null = desarmado; "reveal"/"hide" = pintando ao arrastar.
let _fogBrushMode = null;
let _fogBrushRadius = 0.07;
let _fogPainting = false;
let _fogLastOpU = null;
let _fogLastOpV = null;
let _fogLastBroadcastAt = 0;

/* ── NORMALIZAÇÃO (mesmos limites do Worker) ────────────────── */

function normalizeMesaFogState(fog) {
  if (!fog || typeof fog !== "object") return { enabled: false, ops: [] };
  const round4 = value => Math.round(Number(value) * 10000) / 10000;
  const clampNum = (value, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  };
  const ops = (Array.isArray(fog.ops) ? fog.ops : [])
    .map(op => {
      if (!op || typeof op !== "object") return null;
      const mode = op.mode === "hide" ? "hide" : (op.mode === "reveal" ? "reveal" : null);
      // Centro pode sair um pouco do mapa (pincel na borda): clamp -1..2.
      const u = clampNum(op.u, -1, 2);
      const v = clampNum(op.v, -1, 2);
      const r = clampNum(op.r, 0.005, 1);
      if (!mode || u === null || v === null || r === null) return null;
      return { mode, u: round4(u), v: round4(v), r: round4(r) };
    })
    .filter(Boolean)
    .slice(0, MESA_FOG_MAX_OPS);
  return { enabled: fog.enabled === true, ops };
}

/* ── ESTADO / CONTRATO DA CENA ──────────────────────────────── */

function getMesaFogState() {
  return { enabled: _fogState.enabled, ops: _fogState.ops.map(op => ({ ...op })) };
}

// Consumido por createMesaScenePayloadFromState. Névoa desligada e sem ops
// vira null — cenas antigas e o dedupe de assinatura não mudam.
function getMesaFogScenePayload() {
  if (!_fogState.enabled && !_fogState.ops.length) return null;
  return getMesaFogState();
}

// Boot + snapshots remotos. `undefined` = cena antiga sem o campo → mantém.
// SEMPRE sincroniza a UI (roda depois do papel assentar — lição da grade).
function applyMesaSceneFogFromSnapshot(fog) {
  if (fog !== undefined) {
    _fogState = normalizeMesaFogState(fog);
    renderMesaFog();
  }
  _syncFogSettingsUI();
}

// Delta realtime "mesa:fog:update" (mestre → todos, via mesa-core.js).
function setMesaFogFromRemote(fog) {
  _fogState = normalizeMesaFogState(fog);
  renderMesaFog();
  _syncFogSettingsUI();
}

/* ── MUTAÇÃO (mestre) ───────────────────────────────────────── */

function _isFogMaster() {
  return typeof isMaster === "function" && isMaster();
}

function _broadcastFog(force) {
  if (typeof sendMesaRealtimeDelta !== "function") return;
  const now = Date.now();
  if (!force && now - _fogLastBroadcastAt < MESA_FOG_BROADCAST_MS) return;
  _fogLastBroadcastAt = now;
  sendMesaRealtimeDelta(MESA_FOG_UPDATE_TYPE, { fog: getMesaFogScenePayload() });
}

function _commitFog() {
  _broadcastFog(true);
  if (typeof bumpMesaSceneVersion === "function") bumpMesaSceneVersion();
  if (typeof persistState === "function") persistState();
}

// Mudança estrutural do mestre (ligar/desligar, cobrir tudo): aplica,
// redesenha, transmite e persiste.
function updateMesaFog(patch) {
  if (!_isFogMaster()) return;
  _fogState = normalizeMesaFogState({ ..._fogState, ...patch });
  renderMesaFog();
  _syncFogSettingsUI();
  _commitFog();
}

// "Cobrir tudo" = névoa ativa sem ops. Também zera o histórico de pincel
// (é o reset recomendado quando o cap de 400 ops é atingido).
function resetMesaFog() {
  updateMesaFog({ enabled: true, ops: [] });
}

/** Adiciona uma pincelada (fração do mapa). Retorna false no cap. */
function _addFogOp(mode, u, v) {
  if (_fogState.ops.length >= MESA_FOG_MAX_OPS) {
    window.UI?.toast?.(
      `Limite de ${MESA_FOG_MAX_OPS} pinceladas de névoa — use "Cobrir tudo" para resetar.`,
      { kicker: "// Mesa" }
    );
    return false;
  }
  const round4 = value => Math.round(value * 10000) / 10000;
  _fogState.ops.push({ mode, u: round4(u), v: round4(v), r: round4(_fogBrushRadius) });
  return true;
}

/* ── RENDER ─────────────────────────────────────────────────── */

function _resizeFogCanvas() {
  if (!_fogCanvasEl || !_fogStageEl) return;
  const dpr = window.devicePixelRatio || 1;
  const w = _fogStageEl.offsetWidth;
  const h = _fogStageEl.offsetHeight;
  if (_fogCanvasEl.width !== Math.round(w * dpr) || _fogCanvasEl.height !== Math.round(h * dpr)) {
    _fogCanvasEl.width = Math.round(w * dpr);
    _fogCanvasEl.height = Math.round(h * dpr);
  }
  renderMesaFog();
}

/**
 * Redesenha a névoa. Chamado por mudanças de estado, applyMapTransform
 * (pan/zoom/troca de mapa) e resize do palco. O canvas é desenhado 100%
 * opaco; a diferença mestre/jogador é a opacidade CSS do elemento.
 */
function renderMesaFog() {
  if (!_fogCanvasEl || !_fogCtx || !_fogStageEl) return;
  const cw = _fogCanvasEl.width;
  const ch = _fogCanvasEl.height;
  _fogCtx.clearRect(0, 0, cw, ch);

  // Opacidade por papel a cada render (o papel assenta depois do boot).
  _fogCanvasEl.style.opacity = _isFogMaster() ? String(MESA_FOG_MASTER_OPACITY) : "1";

  if (!_fogState.enabled || cw < 2 || ch < 2) return;

  const dpr = window.devicePixelRatio || 1;
  const surface = typeof window.getMesaMapSurfaceFrac === "function"
    ? window.getMesaMapSurfaceFrac()
    : { left: 0, top: 0, width: 1, height: 1, hasMap: false };

  const stageW = _fogStageEl.offsetWidth * dpr;
  const stageH = _fogStageEl.offsetHeight * dpr;
  const surfLeft = surface.left * stageW;
  const surfTop = surface.top * stageH;
  const surfW = surface.width * stageW;
  const surfH = surface.height * stageH;

  // Névoa cobre a interseção superfície ∩ canvas (não pinta fora do mapa).
  const clipLeft = Math.max(0, surfLeft);
  const clipTop = Math.max(0, surfTop);
  const clipRight = Math.min(cw, surfLeft + surfW);
  const clipBottom = Math.min(ch, surfTop + surfH);
  if (clipRight <= clipLeft || clipBottom <= clipTop) return;

  _fogCtx.save();
  _fogCtx.beginPath();
  _fogCtx.rect(clipLeft, clipTop, clipRight - clipLeft, clipBottom - clipTop);
  _fogCtx.clip();

  _fogCtx.fillStyle = MESA_FOG_COLOR;
  _fogCtx.fillRect(clipLeft, clipTop, clipRight - clipLeft, clipBottom - clipTop);

  // Ops na ordem: reveal apaga (destination-out), hide repinta por cima.
  _fogState.ops.forEach(op => {
    const cx = surfLeft + op.u * surfW;
    const cy = surfTop + op.v * surfH;
    const radius = Math.max(2, op.r * surfW);
    _fogCtx.globalCompositeOperation = op.mode === "reveal" ? "destination-out" : "source-over";
    _fogCtx.beginPath();
    _fogCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    _fogCtx.fill();
  });
  _fogCtx.globalCompositeOperation = "source-over";
  _fogCtx.restore();
}

/* ── PINCEL DO MESTRE (captura, como ping/régua) ────────────── */

function setMesaFogBrush(mode) {
  if (!_isFogMaster()) return;
  _fogBrushMode = (mode === "reveal" || mode === "hide") ? mode : null;
  _syncFogSettingsUI();
  const wrap = document.getElementById("mesaStageWrap");
  if (wrap) wrap.classList.toggle("is-fog-brushing", Boolean(_fogBrushMode));
}

function adjustMesaFogBrush(direction) {
  if (!_isFogMaster()) return;
  const next = _fogBrushRadius + MESA_FOG_BRUSH_STEP * (direction > 0 ? 1 : -1);
  _fogBrushRadius = Math.min(MESA_FOG_BRUSH_MAX, Math.max(MESA_FOG_BRUSH_MIN, Math.round(next * 100) / 100));
  _syncFogSettingsUI();
}

function _fogPointToMapFrac(event) {
  const inner = _fogStageEl;
  if (!inner) return null;
  const rect = inner.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const fx = (event.clientX - rect.left) / rect.width;
  const fy = (event.clientY - rect.top) / rect.height;
  if (typeof window.mesaStageFracToMapFrac !== "function") return { u: fx, v: fy };
  const converted = window.mesaStageFracToMapFrac(fx, fy);
  return { u: converted.u, v: converted.v };
}

function _paintFogAt(event) {
  const point = _fogPointToMapFrac(event);
  if (!point) return;
  // Espaça as ops: só adiciona quando o cursor andou ~40% do raio, senão
  // uma pincelada geraria centenas de círculos redundantes.
  if (_fogLastOpU !== null) {
    const dist = Math.hypot(point.u - _fogLastOpU, point.v - _fogLastOpV);
    if (dist < _fogBrushRadius * 0.4) return;
  }
  if (!_addFogOp(_fogBrushMode, point.u, point.v)) {
    _stopFogPainting();
    return;
  }
  _fogLastOpU = point.u;
  _fogLastOpV = point.v;
  renderMesaFog();
  _broadcastFog(false);
}

function _handleFogPointerDown(event) {
  if (!_fogBrushMode || !_isFogMaster() || event.button !== 0) return;
  if (!_fogState.enabled) return;
  event.preventDefault();
  event.stopPropagation();
  _fogPainting = true;
  _fogLastOpU = null;
  _fogLastOpV = null;
  _paintFogAt(event);
  window.addEventListener("pointermove", _handleFogPointerMove, true);
  window.addEventListener("pointerup", _handleFogPointerUp, true);
  window.addEventListener("pointercancel", _handleFogPointerUp, true);
}

function _handleFogPointerMove(event) {
  if (!_fogPainting) return;
  _paintFogAt(event);
}

function _handleFogPointerUp() {
  if (!_fogPainting) return;
  _stopFogPainting();
  // Pincelada terminou: transmite o estado final e persiste a cena.
  _commitFog();
}

function _stopFogPainting() {
  _fogPainting = false;
  window.removeEventListener("pointermove", _handleFogPointerMove, true);
  window.removeEventListener("pointerup", _handleFogPointerUp, true);
  window.removeEventListener("pointercancel", _handleFogPointerUp, true);
}

/* ── UI DO MESTRE ───────────────────────────────────────────── */

function _syncFogSettingsUI() {
  const group = document.getElementById("mesaFogGroup");
  if (group) group.hidden = !_isFogMaster();
  const toggle = document.getElementById("mesaFogToggle");
  if (toggle) toggle.checked = _fogState.enabled;
  const reveal = document.getElementById("mesaFogRevealBtn");
  const hide = document.getElementById("mesaFogHideBtn");
  if (reveal) {
    reveal.classList.toggle("is-active", _fogBrushMode === "reveal");
    reveal.disabled = !_fogState.enabled;
  }
  if (hide) {
    hide.classList.toggle("is-active", _fogBrushMode === "hide");
    hide.disabled = !_fogState.enabled;
  }
  const resetBtn = document.getElementById("mesaFogResetBtn");
  if (resetBtn) resetBtn.disabled = !_fogState.enabled && !_fogState.ops.length;
  const sizeLbl = document.getElementById("mesaFogBrushLabel");
  if (sizeLbl) sizeLbl.textContent = String(Math.round(_fogBrushRadius * 100));
}

function _bindFogSettingsUI() {
  const toggle = document.getElementById("mesaFogToggle");
  if (toggle) {
    toggle.addEventListener("change", () => {
      // Desligar a névoa limpa o pincel armado (não faz sentido pintar).
      if (!toggle.checked) setMesaFogBrush(null);
      updateMesaFog({ enabled: toggle.checked });
    });
  }
  document.getElementById("mesaFogRevealBtn")?.addEventListener("click", () => {
    setMesaFogBrush(_fogBrushMode === "reveal" ? null : "reveal");
  });
  document.getElementById("mesaFogHideBtn")?.addEventListener("click", () => {
    setMesaFogBrush(_fogBrushMode === "hide" ? null : "hide");
  });
  document.getElementById("mesaFogResetBtn")?.addEventListener("click", () => resetMesaFog());
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && _fogBrushMode) setMesaFogBrush(null);
  });
}

/* ── INIT ───────────────────────────────────────────────────── */

function initMesaFog() {
  _fogCanvasEl = document.getElementById("mesaFogCanvas");
  _fogStageEl = document.getElementById("mesaStageInner");
  if (!_fogCanvasEl || !_fogStageEl) return;
  _fogCtx = _fogCanvasEl.getContext("2d");

  _resizeFogCanvas();
  new ResizeObserver(() => _resizeFogCanvas()).observe(_fogStageEl);

  const wrap = document.getElementById("mesaStageWrap");
  if (wrap) wrap.addEventListener("pointerdown", _handleFogPointerDown, true);

  _bindFogSettingsUI();
  _syncFogSettingsUI();
  renderMesaFog();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMesaFog, { once: true });
} else {
  initMesaFog();
}

// Globais consumidos por mesa-core.js / mesa-map.js e testes.
window.renderMesaFog                 = renderMesaFog;
window.getMesaFogState               = getMesaFogState;
window.getMesaFogScenePayload        = getMesaFogScenePayload;
window.applyMesaSceneFogFromSnapshot = applyMesaSceneFogFromSnapshot;
window.setMesaFogFromRemote          = setMesaFogFromRemote;
window.updateMesaFog                 = updateMesaFog;
window.resetMesaFog                  = resetMesaFog;
window.setMesaFogBrush               = setMesaFogBrush;
window.adjustMesaFogBrush            = adjustMesaFogBrush;
window.normalizeMesaFogState         = normalizeMesaFogState;
