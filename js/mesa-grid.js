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

  // Grade mudou (ligou snap, trocou célula): re-conforma todos os tokens
  // para manter a mesa uniforme (tamanhos NxN, ninguém fora da grade).
  _conformAllTokensToGrid();
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

/* ── SNAP-TO-GRID + TAMANHO EM CÉLULAS ──────────────────────── */
// Com "Encaixar tokens" ligado o token vive em múltiplos inteiros de célula
// (1x1, 2x2, 3x3...): o diâmetro é quantizado para N células e o quadrado
// NxN alinha nas linhas da grade (N ímpar centra na célula; N par centra
// numa interseção). Evita token vazando da grade ou com tamanho "quebrado".

// Lado da célula em px do palco (espaço sem zoom — mesmo dos token.x/y %).
function _gridCellStagePx() {
  if (!_gridStageEl) return 0;
  const surface = typeof window.getMesaMapSurfaceFrac === "function"
    ? window.getMesaMapSurfaceFrac()
    : { width: 1 };
  return _gridState.cellFrac * surface.width * (_gridStageEl.offsetWidth || 0);
}

// Quantos NxN o token ocupa, a partir do diâmetro real em px do palco.
function _gridTokenCells(diameterPx, cellPx) {
  if (!(cellPx > 0)) return 1;
  return Math.max(1, Math.round(diameterPx / cellPx));
}

/**
 * Quantiza o TAMANHO do token para N células (ajusta token.tokenScale).
 * O clamp 0.25-4 do contrato da cena limita N em células muito grandes ou
 * muito pequenas — nesse extremo o token fica no tamanho válido mais próximo.
 * @returns {boolean} true se a escala mudou.
 */
function mesaFitTokenToGrid(token, tokenElement) {
  if (!_gridState.enabled || !_gridState.snap) return false;
  if (!token) return false;
  const cellPx = _gridCellStagePx();
  if (!(cellPx > 0)) return false;

  const basePx = tokenElement?.offsetWidth || 88; // largura de layout (sem transform)
  const currentScale = Number(token.tokenScale) || 1;
  const cells = _gridTokenCells(basePx * currentScale, cellPx);
  const nextScale = Math.round(Math.max(0.25, Math.min(4, (cells * cellPx) / basePx)) * 100) / 100;

  if (Math.abs(nextScale - currentScale) < 0.005) return false;
  token.tokenScale = nextScale;
  if (tokenElement?.isConnected) {
    tokenElement.style.setProperty("--token-scale", String(nextScale));
  }
  return true;
}

/**
 * Alinha o token ao quadrado de células mais próximo (posição). Mexe em
 * token.x/y (% do palco, canto superior esquerdo) usando o rect real do
 * elemento para achar o centro e o diâmetro.
 * @returns {boolean} true se a posição mudou.
 */
function mesaSnapTokenToGrid(token, tokenElement) {
  if (!_gridState.enabled || !_gridState.snap) return false;
  if (!token || !_gridStageEl) return false;
  if (typeof window.mesaStageFracToMapFrac !== "function") return false;

  const stageW = _gridStageEl.offsetWidth;
  const stageH = _gridStageEl.offsetHeight;
  if (stageW < 2 || stageH < 2) return false;

  // Tamanho do token em px de LAYOUT do palco: offsetWidth (sem transform)
  // x tokenScale. NUNCA usar getBoundingClientRect aqui — o transform do
  // token tem transição CSS, então logo após um resize o rect ainda reflete
  // a escala ANTIGA e o snap calcularia N com o tamanho errado.
  const basePx = tokenElement?.offsetWidth || 88;
  const scale = Number(token.tokenScale) || 1;
  const diamPx = basePx * scale;
  const tokenWFrac = diamPx / stageW;
  const tokenHFrac = ((tokenElement?.offsetHeight || basePx) * scale) / stageH;

  const centerFx = token.x / 100 + tokenWFrac / 2;
  const centerFy = token.y / 100 + tokenHFrac / 2;

  // Palco → mapa → quadrado NxN mais próximo → centro dele → palco.
  const surface = window.getMesaMapSurfaceFrac();
  const map = window.mesaStageFracToMapFrac(centerFx, centerFy);
  const cellU = _gridState.cellFrac;
  const cellV = _cellVFrac(surface);
  const cells = _gridTokenCells(diamPx, _gridCellStagePx());

  // Canto do quadrado NxN cai numa linha da grade: arredonda o canto (não o
  // centro) para o múltiplo de célula — N ímpar centra na célula, N par na
  // interseção, sem caso especial.
  const snapAxis = (center, cell, offsetFrac) => {
    if (!(cell > 0)) return center;
    const offset = offsetFrac * cell;
    const corner = Math.round((center - (cells * cell) / 2 - offset) / cell) * cell + offset;
    return corner + (cells * cell) / 2;
  };

  const snappedU = snapAxis(map.u, cellU, _gridState.offsetXFrac);
  const snappedV = snapAxis(map.v, cellV, _gridState.offsetYFrac);

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

/**
 * Conformidade completa (tamanho + posição) — usada no soltar do arrasto,
 * no fim do redimensionamento e na re-conformidade em massa do mestre.
 * @returns {boolean} true se algo mudou.
 */
function mesaConformTokenToGrid(token, tokenElement) {
  const resized = mesaFitTokenToGrid(token, tokenElement);
  const moved = mesaSnapTokenToGrid(token, tokenElement);
  return resized || moved;
}

// Mestre: re-conforma TODOS os tokens quando a grade muda (ligar snap,
// trocar tamanho da célula). Mantém a mesa uniforme sem arrastar um a um.
function _conformAllTokensToGrid() {
  if (!_isGridMaster()) return;
  if (!_gridState.enabled || !_gridState.snap) return;
  if (typeof state !== "object" || !Array.isArray(state.tokens)) return;

  let changedAny = false;
  state.tokens.forEach(token => {
    const el = document.querySelector(`.mesa-token[data-token-id="${CSS.escape(token.id)}"]`);
    const changed = mesaConformTokenToGrid(token, el);
    if (changed) {
      changedAny = true;
      // Upsert leva posição E escala; a camada "dm" é bloqueada lá dentro.
      if (typeof broadcastMesaTokenUpsert === "function") broadcastMesaTokenUpsert(token);
    }
  });

  if (changedAny) {
    if (typeof bumpMesaSceneVersion === "function") bumpMesaSceneVersion();
    if (typeof persistState === "function") persistState();
    if (typeof scheduleMesaRender === "function") scheduleMesaRender({ stage: true, inspector: true });
  }
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
window.mesaFitTokenToGrid             = mesaFitTokenToGrid;
window.mesaConformTokenToGrid         = mesaConformTokenToGrid;
window.normalizeMesaGridState         = normalizeMesaGridState;
