/* ============================================================
 * mesa-grid.js — Grade funcional + snap-to-grid (Etapa 42)
 * ============================================================
 *
 * MODELO (decisão D1 do plano VTT)
 * ─────────────────────────────────────────────────────────────
 * A grade é amarrada ao MAPA: a célula é uma fração da largura
 * exibida da imagem (cellFrac). Pan/zoom do mapa movem a grade
 * junto sem nenhum recálculo de estado — só re-render.
 * Sem mapa ativo, a superfície de referência é o próprio palco.
 *
 * Conversões de coordenadas SEMPRE via helper único do mesa-map.js
 * (getMesaMapSurfaceFrac / mesaStageFracToMapFrac / mesaMapFracToStageFrac)
 * — régua (Etapa 44) e fog (Etapa 47) reusam a mesma fonte.
 *
 * ESTADO E SYNC
 * ─────────────────────────────────────────────────────────────
 * O estado vive na cena oficial (campo `grid` do PUT /mesa/scene,
 * normalizado no Worker) e chega aos jogadores no boot. Mudanças
 * ao vivo viajam por "mesa:grid:update" (master-only no DO).
 * ============================================================ */

"use strict";

const MESA_GRID_UPDATE_TYPE = "mesa:grid:update";

const MESA_GRID_DEFAULTS = Object.freeze({
  enabled: false,
  snap: false,
  cellFrac: 0.05,      // 5% da largura do mapa ≈ 20 colunas
  offsetXFrac: 0,      // deslocamento dentro da célula (0–1)
  offsetYFrac: 0,
  color: "#ffffff",
  opacity: 0.18
});

const MESA_GRID_CELL_MIN  = 0.01;
const MESA_GRID_CELL_MAX  = 0.25;
const MESA_GRID_CELL_STEP = 0.005;

let _gridState    = { ...MESA_GRID_DEFAULTS };
let _gridCanvasEl = null;
let _gridCtx      = null;
let _gridStageEl  = null;

/* ── NORMALIZAÇÃO (mesmos limites do Worker) ────────────────── */

function normalizeMesaGridState(grid) {
  if (!grid || typeof grid !== "object") return { ...MESA_GRID_DEFAULTS };
  const clampNum = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: grid.enabled === true,
    snap: grid.snap === true,
    cellFrac: Math.round(clampNum(grid.cellFrac, MESA_GRID_CELL_MIN, MESA_GRID_CELL_MAX, MESA_GRID_DEFAULTS.cellFrac) * 10000) / 10000,
    offsetXFrac: Math.round(clampNum(grid.offsetXFrac, 0, 1, 0) * 10000) / 10000,
    offsetYFrac: Math.round(clampNum(grid.offsetYFrac, 0, 1, 0) * 10000) / 10000,
    color: /^#[0-9a-f]{3,8}$/i.test(String(grid.color || "")) ? String(grid.color) : MESA_GRID_DEFAULTS.color,
    opacity: Math.round(clampNum(grid.opacity, 0.05, 0.8, MESA_GRID_DEFAULTS.opacity) * 100) / 100
  };
}

/* ── ESTADO / CONTRATO DA CENA ──────────────────────────────── */

function getMesaGridState() {
  return { ..._gridState };
}

// Consumido por createMesaScenePayloadFromState (mesa-core.js). Grade toda
// desligada vira null — cenas antigas e o dedupe de assinatura não mudam.
function getMesaGridScenePayload() {
  if (!_gridState.enabled && !_gridState.snap) return null;
  return { ..._gridState };
}

// Boot + snapshots remotos (applyMesaSceneSnapshot). `undefined` = cena
// antiga sem o campo → mantém o estado atual; null = grade desligada.
// SEMPRE sincroniza a UI: este apply roda depois do papel (state.role)
// assentar no boot — é o momento certo de revelar o grupo pro mestre
// (no DOMContentLoaded do initMesaGrid o isMaster() ainda é falso).
function applyMesaSceneGridFromSnapshot(grid) {
  if (grid !== undefined) {
    _gridState = normalizeMesaGridState(grid);
    renderMesaGrid();
  }
  _syncGridSettingsUI();
}

// Delta realtime "mesa:grid:update" (mestre → todos, via mesa-core.js).
function setMesaGridFromRemote(grid) {
  _gridState = normalizeMesaGridState(grid);
  renderMesaGrid();
  _syncGridSettingsUI();
}

/* ── MUTAÇÃO (mestre) ───────────────────────────────────────── */

function _isGridMaster() {
  return typeof isMaster === "function" && isMaster();
}

// Toda mudança do mestre passa por aqui: aplica, redesenha, transmite o
// estado completo via DO e persiste a cena oficial (debounced no core).
function updateMesaGrid(patch) {
  if (!_isGridMaster()) return;
  _gridState = normalizeMesaGridState({ ..._gridState, ...patch });
  renderMesaGrid();
  _syncGridSettingsUI();

  if (typeof sendMesaRealtimeDelta === "function") {
    sendMesaRealtimeDelta(MESA_GRID_UPDATE_TYPE, { grid: getMesaGridScenePayload() });
  }
  if (typeof bumpMesaSceneVersion === "function") bumpMesaSceneVersion();
  if (typeof persistState === "function") persistState();
}

/* ── RENDER ─────────────────────────────────────────────────── */

function _resizeGridCanvas() {
  if (!_gridCanvasEl || !_gridStageEl) return;
  const dpr = window.devicePixelRatio || 1;
  const w = _gridStageEl.offsetWidth;
  const h = _gridStageEl.offsetHeight;
  if (_gridCanvasEl.width !== Math.round(w * dpr) || _gridCanvasEl.height !== Math.round(h * dpr)) {
    _gridCanvasEl.width  = Math.round(w * dpr);
    _gridCanvasEl.height = Math.round(h * dpr);
  }
  renderMesaGrid();
}

/**
 * Redesenha a grade. Chamado por: mudanças de estado, applyMapTransform
 * (pan/zoom/troca de mapa) e resize do palco. Idempotente e barato —
 * apenas linhas 2D no canvas dedicado.
 */
function renderMesaGrid() {
  if (!_gridCanvasEl || !_gridCtx || !_gridStageEl) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = _gridCanvasEl.width;
  const ch = _gridCanvasEl.height;
  _gridCtx.clearRect(0, 0, cw, ch);
  if (!_gridState.enabled || cw < 2 || ch < 2) return;

  // Superfície de referência (mapa exibido ou palco) em frações do palco,
  // convertida para px internos do canvas (que cobre o palco inteiro).
  const surface = typeof window.getMesaMapSurfaceFrac === "function"
    ? window.getMesaMapSurfaceFrac()
    : { left: 0, top: 0, width: 1, height: 1, hasMap: false };

  const stageW = _gridStageEl.offsetWidth * dpr;
  const stageH = _gridStageEl.offsetHeight * dpr;
  const surfLeft = surface.left * stageW;
  const surfTop  = surface.top  * stageH;
  const surfW    = surface.width  * stageW;
  const surfH    = surface.height * stageH;

  // Célula quadrada em px: fração da LARGURA da superfície.
  const cellPx = Math.max(4 * dpr, _gridState.cellFrac * surfW);

  // Área desenhada: interseção superfície ∩ canvas (mapa em cover pode
  // transbordar o palco; não desenhamos grade fora do mapa).
  const clipLeft   = Math.max(0, surfLeft);
  const clipTop    = Math.max(0, surfTop);
  const clipRight  = Math.min(cw, surfLeft + surfW);
  const clipBottom = Math.min(ch, surfTop + surfH);
  if (clipRight <= clipLeft || clipBottom <= clipTop) return;

  _gridCtx.save();
  _gridCtx.beginPath();
  _gridCtx.rect(clipLeft, clipTop, clipRight - clipLeft, clipBottom - clipTop);
  _gridCtx.clip();

  _gridCtx.globalAlpha = _gridState.opacity;
  _gridCtx.strokeStyle = _gridState.color;
  _gridCtx.lineWidth   = Math.max(1, dpr);
  _gridCtx.beginPath();

  const offsetX = _gridState.offsetXFrac * cellPx;
  const offsetY = _gridState.offsetYFrac * cellPx;
  const startX = surfLeft + offsetX - Math.ceil((surfLeft + offsetX - clipLeft) / cellPx) * cellPx;
  const startY = surfTop  + offsetY - Math.ceil((surfTop  + offsetY - clipTop)  / cellPx) * cellPx;

  for (let x = startX; x <= clipRight; x += cellPx) {
    _gridCtx.moveTo(x, clipTop);
    _gridCtx.lineTo(x, clipBottom);
  }
  for (let y = startY; y <= clipBottom; y += cellPx) {
    _gridCtx.moveTo(clipLeft, y);
    _gridCtx.lineTo(clipRight, y);
  }
  _gridCtx.stroke();
  _gridCtx.restore();
}

/* ── SNAP-TO-GRID ───────────────────────────────────────────── */

/**
 * Ajusta o token para o centro da célula mais próxima ao soltar o arrasto.
 * Chamado pelo handleDragEnd (mesa-stage.js). Mexe em token.x/y (% do palco,
 * canto superior esquerdo) usando o rect real do elemento para achar o centro.
 *
 * @returns {boolean} true se a posição mudou.
 */
function mesaSnapTokenToGrid(token, tokenElement) {
  if (!_gridState.enabled || !_gridState.snap) return false;
  if (!token || !_gridStageEl) return false;
  if (typeof window.mesaStageFracToMapFrac !== "function") return false;

  const stageW = _gridStageEl.offsetWidth;
  const stageH = _gridStageEl.offsetHeight;
  if (stageW < 2 || stageH < 2) return false;

  // Tamanho do token em frações do palco (rect é pós-zoom do palco; as
  // frações são invariantes ao zoom porque o palco escala junto).
  const stageRect = _gridStageEl.getBoundingClientRect();
  const tokenRect = tokenElement?.getBoundingClientRect?.();
  const tokenWFrac = tokenRect && stageRect.width  > 0 ? tokenRect.width  / stageRect.width  : 0;
  const tokenHFrac = tokenRect && stageRect.height > 0 ? tokenRect.height / stageRect.height : 0;

  const centerFx = token.x / 100 + tokenWFrac / 2;
  const centerFy = token.y / 100 + tokenHFrac / 2;

  // Palco → mapa → célula mais próxima → centro dela → palco.
  const surface = window.getMesaMapSurfaceFrac();
  const map = window.mesaStageFracToMapFrac(centerFx, centerFy);
  const cellU = _gridState.cellFrac;

  // Frações de célula com offset: índice da célula que contém o centro.
  const snapAxis = (value, cell, offsetFrac) => {
    if (!(cell > 0)) return value;
    const shifted = value - offsetFrac * cell;
    return (Math.floor(shifted / cell) + 0.5) * cell + offsetFrac * cell;
  };

  const snappedU = snapAxis(map.u, cellU, _gridState.offsetXFrac);
  const snappedV = snapAxis(map.v, _cellVFrac(surface), _gridState.offsetYFrac);

  const back = window.mesaMapFracToStageFrac(snappedU, snappedV);
  const nextX = Math.max(0, Math.min(100, (back.fx - tokenWFrac / 2) * 100));
  const nextY = Math.max(0, Math.min(100, (back.fy - tokenHFrac / 2) * 100));

  if (Math.abs(nextX - token.x) < 0.01 && Math.abs(nextY - token.y) < 0.01) return false;
  token.x = Math.round(nextX * 100) / 100;
  token.y = Math.round(nextY * 100) / 100;

  if (tokenElement?.isConnected) {
    tokenElement.style.left = `${token.x}%`;
    tokenElement.style.top  = `${token.y}%`;
  }
  return true;
}

// Altura da célula em frações VERTICAIS da superfície: a célula é quadrada
// em px, então a fração vertical é cellFrac × (largura px / altura px).
function _cellVFrac(surface) {
  if (!_gridStageEl) return _gridState.cellFrac;
  const surfWPx = surface.width  * (_gridStageEl.offsetWidth  || 1);
  const surfHPx = surface.height * (_gridStageEl.offsetHeight || 1);
  if (!(surfHPx > 0)) return _gridState.cellFrac;
  return _gridState.cellFrac * (surfWPx / surfHPx);
}

/* ── UI DO MESTRE ───────────────────────────────────────────── */

function _syncGridSettingsUI() {
  const toggle  = document.getElementById("mesaGridToggle");
  const snap    = document.getElementById("mesaGridSnapToggle");
  const sizeLbl = document.getElementById("mesaGridSizeLabel");
  // Visibilidade do grupo acompanha o papel a cada sync (o papel só é
  // conhecido depois do boot assíncrono — nunca decidir isso uma vez só).
  const group = document.getElementById("mesaGridGroup");
  if (group) group.hidden = !_isGridMaster();
  if (toggle) {
    toggle.checked = _gridState.enabled;
  }
  if (snap) {
    snap.checked  = _gridState.snap;
    snap.disabled = !_gridState.enabled;
  }
  if (sizeLbl) {
    // Exibe como número de colunas na largura do mapa — mais intuitivo que %.
    sizeLbl.textContent = String(Math.round(1 / _gridState.cellFrac));
  }
}

// direction > 0 = mais colunas (células menores); < 0 = menos colunas.
// O rótulo da UI exibe o número de colunas, então "+" aumenta colunas.
function adjustMesaGridCell(direction) {
  if (!_isGridMaster()) return;
  const step = MESA_GRID_CELL_STEP * (direction > 0 ? -1 : 1);
  updateMesaGrid({ cellFrac: _gridState.cellFrac + step });
}

function _bindGridSettingsUI() {
  const toggle = document.getElementById("mesaGridToggle");
  const snap   = document.getElementById("mesaGridSnapToggle");
  if (toggle) toggle.addEventListener("change", () => updateMesaGrid({ enabled: toggle.checked }));
  if (snap)   snap.addEventListener("change", () => updateMesaGrid({ snap: snap.checked }));
  // A visibilidade do grupo (master-only) é decidida em _syncGridSettingsUI,
  // chamado quando o papel já é conhecido — aqui no init ainda não é.
}

/* ── INIT ───────────────────────────────────────────────────── */

function initMesaGrid() {
  _gridCanvasEl = document.getElementById("mesaGridCanvas");
  _gridStageEl  = document.getElementById("mesaStageInner");
  if (!_gridCanvasEl || !_gridStageEl) return;
  _gridCtx = _gridCanvasEl.getContext("2d");

  _resizeGridCanvas();
  new ResizeObserver(() => _resizeGridCanvas()).observe(_gridStageEl);

  _bindGridSettingsUI();
  _syncGridSettingsUI();
  renderMesaGrid();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMesaGrid, { once: true });
} else {
  initMesaGrid();
}

// Globais consumidos por mesa-core.js / mesa-stage.js / mesa-map.js e testes.
window.renderMesaGrid                 = renderMesaGrid;
window.getMesaGridState               = getMesaGridState;
window.getMesaGridScenePayload        = getMesaGridScenePayload;
window.applyMesaSceneGridFromSnapshot = applyMesaSceneGridFromSnapshot;
window.setMesaGridFromRemote          = setMesaGridFromRemote;
window.updateMesaGrid                 = updateMesaGrid;
window.adjustMesaGridCell             = adjustMesaGridCell;
window.mesaSnapTokenToGrid            = mesaSnapTokenToGrid;
window.normalizeMesaGridState         = normalizeMesaGridState;
