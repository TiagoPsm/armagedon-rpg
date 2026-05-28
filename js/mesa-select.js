/* ============================================================
 * mesa-select.js — Modos de interação + seleção multi-elemento
 *
 *  "select"  — cursor/flecha
 *    LMB arrastar em vazio      → rubber-band multi-select
 *    RMB arrastar               → pan da câmera (mesa-map.js)
 *    Drag na selection box      → mover todos os selecionados
 *    Drag em handle (.sel-handle) → redimensionar seleção
 *    Escape                     → limpar seleção
 *
 *  "move"    — mão
 *    LMB arrastar em token      → mover token (mesa-stage.js)
 *    LMB arrastar em vazio      → pan da câmera (mesa-map.js)
 *
 * Coordenadas internas: % do mesaStageInner (0–100).
 * Strokes usam frações 0–1 nos seus pontos; tokens usam 0–100.
 * A selection box fica dentro de #mesaStageInner e herda o
 * transform de zoom/pan — posicionada em % lógicos. ✓
 * ============================================================ */

let _interactionMode   = "select";
let _selectedTokenIds  = new Set();
let _selectedStrokeIds = new Set();

// Rubber-band
let _rbActive = false;
let _rbStartX = 0, _rbStartY = 0;
let _rbEndX   = 0, _rbEndY   = 0;

// Move / resize drag
let _dragMode    = null;   // null | "move" | "resize"
let _dragHandle  = null;   // "nw"|"n"|"ne"|"w"|"e"|"sw"|"s"|"se"
let _dragClientX = 0, _dragClientY = 0;
let _dragBounds  = null;   // {x1,y1,x2,y2} em % — estado do frame anterior

// RAF batch para atualizar o canvas de desenho
let _pendingDrawingRender = false;
let _pendingStrokes       = null;

// ── API pública ─────────────────────────────────────────────
function getInteractionMode()   { return _interactionMode; }
function getSelectedTokenIds()  { return new Set(_selectedTokenIds); }
function getSelectedStrokeIds() { return new Set(_selectedStrokeIds); }

function setInteractionMode(mode) {
  if (mode !== "select" && mode !== "move") return;
  _interactionMode = mode;
  window._mesaInteractionMode = mode;

  document.querySelectorAll("[data-interaction-tool]").forEach(btn => {
    const active = btn.dataset.interactionTool === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  const wrap = document.getElementById("mesaStageWrap");
  if (wrap) wrap.dataset.interactionMode = mode;

  if (typeof setDrawTool === "function") setDrawTool(null);
  if (typeof _closeFlyout === "function") _closeFlyout();

  clearMultiSelection();
}

function clearMultiSelection() {
  _selectedTokenIds.clear();
  _selectedStrokeIds.clear();
  document.querySelectorAll(".mesa-token.is-multi-selected")
    .forEach(el => el.classList.remove("is-multi-selected"));
  _hideSelectionBox();
}

// ── Selection box ────────────────────────────────────────────

function _hideSelectionBox() {
  const box = document.getElementById("mesaSelectionBox");
  if (box) box.hidden = true;
}

function _showSelectionBox(b) {
  const box = document.getElementById("mesaSelectionBox");
  if (!box || !b) return;
  const PAD = 0.5; // % de padding ao redor dos elementos
  box.style.left   = `${b.x1 - PAD}%`;
  box.style.top    = `${b.y1 - PAD}%`;
  box.style.width  = `${(b.x2 - b.x1) + PAD * 2}%`;
  box.style.height = `${(b.y2 - b.y1) + PAD * 2}%`;
  box.hidden = false;
}

function _refreshSelectionBox() {
  const b = _computeSelectionBounds();
  if (b && (_selectedTokenIds.size > 0 || _selectedStrokeIds.size > 0)) {
    _showSelectionBox(b);
  } else {
    _hideSelectionBox();
  }
}

// ── Coordenadas ──────────────────────────────────────────────

function _getInner() {
  return document.getElementById("mesaStageInner");
}

// ── Bounds dos elementos (em 0–100%) ─────────────────────────

/** Bounding box de um stroke em 0–100% */
function _strokeBounds(stroke) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  (stroke.points || []).forEach(p => {
    const px = (p.px != null ? p.px : p.x) * 100;
    const py = (p.py != null ? p.py : p.y) * 100;
    if (px < x1) x1 = px;  if (px > x2) x2 = px;
    if (py < y1) y1 = py;  if (py > y2) y2 = py;
  });
  return isFinite(x1) ? { x1, y1, x2, y2 } : null;
}

/**
 * Bounding box de um token em % do mesaStageInner (escala-invariante).
 * Usa getBoundingClientRect tanto do token quanto do inner, portanto
 * qualquer zoom/pan é cancelado na divisão. ✓
 */
function _tokenBoundsPct(tokenId) {
  const inner = _getInner();
  if (!inner) return null;
  const ir = inner.getBoundingClientRect();
  const el = document.querySelector(`[data-token-id="${tokenId}"]`);
  if (el) {
    const r = el.getBoundingClientRect();
    return {
      x1: ((r.left   - ir.left) / ir.width)  * 100,
      y1: ((r.top    - ir.top)  / ir.height) * 100,
      x2: ((r.right  - ir.left) / ir.width)  * 100,
      y2: ((r.bottom - ir.top)  / ir.height) * 100,
    };
  }
  // Fallback via state
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    const t = state.tokens.find(t => String(t.id) === String(tokenId));
    if (t) return { x1: t.x, y1: t.y, x2: t.x + 5, y2: t.y + 5 };
  }
  return null;
}

/** União de todos os bounds selecionados em % */
function _computeSelectionBounds() {
  if (_selectedTokenIds.size === 0 && _selectedStrokeIds.size === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

  const expand = b => {
    if (!b) return;
    if (b.x1 < x1) x1 = b.x1;  if (b.y1 < y1) y1 = b.y1;
    if (b.x2 > x2) x2 = b.x2;  if (b.y2 > y2) y2 = b.y2;
  };

  _selectedTokenIds.forEach(id => expand(_tokenBoundsPct(id)));

  if (_selectedStrokeIds.size > 0 && typeof getDrawingsSnapshot === "function") {
    const strokes = getDrawingsSnapshot();
    _selectedStrokeIds.forEach(id => {
      const s = strokes.find(s => String(s.id) === String(id));
      if (s) expand(_strokeBounds(s));
    });
  }

  return isFinite(x1) ? { x1, y1, x2, y2 } : null;
}

// ── Detecção de elementos no 