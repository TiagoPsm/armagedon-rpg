/* ============================================================
 * mesa-select.js — Modos de interação + seleção multi-elemento
 *
 *  "select"  — cursor/flecha
 *    LMB arrastar em vazio        → rubber-band multi-select
 *    Clique em stroke/token       → click-select individual
 *    RMB arrastar                 → pan da câmera (mesa-map.js)
 *    Drag na selection box        → mover todos os selecionados
 *    Drag em handle (.sel-handle) → redimensionar seleção
 *    Escape                       → limpar seleção
 *
 *  "move"    — mão
 *    LMB arrastar em token        → mover token (mesa-stage.js)
 *    LMB arrastar em vazio        → pan da câmera (mesa-map.js)
 *
 * Coordenadas internas: % do mesaStageInner (0–100).
 *
 * Formato real dos strokes (mesa-drawing.js):
 *   pencil:  { x1,y1,x2,y2, points:[[px,py],...], tool:"pencil", ... }
 *   shapes:  { x1,y1,x2,y2, points:null,          tool:"line"|"rect"|"circle", ... }
 *   Todos os coords são frações 0–1. Multiplicar por 100 → %.
 * ============================================================ */

let _interactionMode   = null;
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
  // Toggle: clicar no modo já ativo desativa
  const next = (_interactionMode === mode) ? null : mode;
  _interactionMode = next;
  window._mesaInteractionMode = next;

  document.querySelectorAll("[data-interaction-tool]").forEach(btn => {
    const active = btn.dataset.interactionTool === next;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  const wrap = document.getElementById("mesaStageWrap");
  if (wrap) wrap.dataset.interactionMode = next ?? "";

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
  const PAD = 0.5;
  box.style.left   = (b.x1 - PAD) + "%";
  box.style.top    = (b.y1 - PAD) + "%";
  box.style.width  = ((b.x2 - b.x1) + PAD * 2) + "%";
  box.style.height = ((b.y2 - b.y1) + PAD * 2) + "%";
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

// ── Helpers ──────────────────────────────────────────────────

function _getInner() {
  return document.getElementById("mesaStageInner");
}

// ── Bounds dos strokes (em 0–100%) ───────────────────────────
//
// Formato real dos pontos:
//   pencil → stroke.points = [[px,py], [px,py], ...]  (frações 0-1)
//   shapes → stroke.x1,y1,x2,y2 são frações 0-1; points = null

function _strokeBounds(stroke) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

  if (stroke.points && stroke.points.length > 0) {
    // Pencil: pontos como arrays [px, py]
    stroke.points.forEach(p => {
      if (p[0] < x1) x1 = p[0]; if (p[0] > x2) x2 = p[0];
      if (p[1] < y1) y1 = p[1]; if (p[1] > y2) y2 = p[1];
    });
    x1 *= 100; y1 *= 100; x2 *= 100; y2 *= 100;
  } else if (stroke.x1 != null) {
    // Shape (line, rect, circle): usa x1,y1,x2,y2
    let sx1 = stroke.x1 * 100, sy1 = stroke.y1 * 100;
    let sx2 = stroke.x2 * 100, sy2 = stroke.y2 * 100;
    x1 = Math.min(sx1, sx2); x2 = Math.max(sx1, sx2);
    y1 = Math.min(sy1, sy2); y2 = Math.max(sy1, sy2);
  }

  // Garantia de área mínima (evita bounding box de zero px)
  if (isFinite(x1)) {
    if (x2 - x1 < 0.5) { x1 -= 0.25; x2 += 0.25; }
    if (y2 - y1 < 0.5) { y1 -= 0.25; y2 += 0.25; }
    return { x1, y1, x2, y2 };
  }
  return null;
}

// ── Bounds dos tokens (em 0–100%) ───────────────────────────

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
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    const t = state.tokens.find(t => String(t.id) === String(tokenId));
    if (t) return { x1: t.x, y1: t.y, x2: t.x + 5, y2: t.y + 5 };
  }
  return null;
}

// ── União de todos os bounds selecionados ─────────────────────

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

// ── Detecção de elementos no rubber-band ─────────────────────

function _tokensInBand(screenRect) {
  const hits = [];
  document.querySelectorAll("[data-token-id]").forEach(el => {
    const r = el.getBoundingClientRect();
    const cx = (r.left + r.right)  / 2;
    const cy = (r.top  + r.bottom) / 2;
    if (cx >= screenRect.left && cx <= screenRect.right &&
        cy >= screenRect.top  && cy <= screenRect.bottom) {
      hits.push(String(el.dataset.tokenId));
    }
  });
  if (hits.length) return hits;

  const inner = _getInner();
  if (!inner) return hits;
  const ir = inner.getBoundingClientRect();
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    state.tokens.forEach(t => {
      const sx = ir.left + (t.x / 100) * ir.width;
      const sy = ir.top  + (t.y / 100) * ir.height;
      if (sx >= screenRect.left && sx <= screenRect.right &&
          sy >= screenRect.top  && sy <= screenRect.bottom) {
        hits.push(String(t.id));
      }
    });
  }
  return hits;
}

function _strokesInBand(screenRect) {
  if (typeof getDrawingsSnapshot !== "function") return [];
  const inner = _getInner();
  if (!inner) return [];
  const ir = inner.getBoundingClientRect();

  return getDrawingsSnapshot()
    .filter(s => {
      const b = _strokeBounds(s);
      if (!b) return false;
      const sx1 = ir.left + (b.x1 / 100) * ir.width;
      const sy1 = ir.top  + (b.y1 / 100) * ir.height;
      const sx2 = ir.left + (b.x2 / 100) * ir.width;
      const sy2 = ir.top  + (b.y2 / 100) * ir.height;
      return sx1 <= screenRect.right  && sx2 >= screenRect.left &&
             sy1 <= screenRect.bottom && sy2 >= screenRect.top;
    })
    .map(s => s.id);
}

/**
 * Click-select: seleciona o stroke cujo bounding box contém o ponto.
 * Prefere o de menor área (mais específico).
 */
function _tryClickSelectStroke(clientX, clientY) {
  if (typeof getDrawingsSnapshot !== "function") return false;
  const inner = _getInner();
  if (!inner) return false;
  const ir  = inner.getBoundingClientRect();
  const cpx = ((clientX - ir.left) / ir.width)  * 100;
  const cpy = ((clientY - ir.top)  / ir.height) * 100;

  let best = null, bestArea = Infinity;
  getDrawingsSnapshot().forEach(s => {
    const b = _strokeBounds(s);
    if (!b) return;
    if (cpx < b.x1 || cpx > b.x2 || cpy < b.y1 || cpy > b.y2) return;
    const area = (b.x2 - b.x1) * (b.y2 - b.y1);
    if (area < bestArea) { bestArea = area; best = s; }
  });

  if (!best) return false;
  _selectedStrokeIds.add(String(best.id));
  _refreshSelectionBox();
  return true;
}

// ── Move ─────────────────────────────────────────────────────

function _applyMoveDelta(dxPct, dyPct) {
  // Tokens (0–100%)
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    state.tokens.forEach(token => {
      if (!_selectedTokenIds.has(String(token.id))) return;
      // Jogador nao pode mover token alheio nem pela selecao multipla
      if (typeof canMoveTokens === "function" && !canMoveTokens(token)) return;
      token.x = Math.max(0, Math.min(100, token.x + dxPct));
      token.y = Math.max(0, Math.min(100, token.y + dyPct));
      const el = document.querySelector(`[data-token-id="${token.id}"]`);
      if (el) { el.style.left = token.x + "%"; el.style.top = token.y + "%"; }
    });
  }

  if (_selectedStrokeIds.size === 0 || typeof getDrawingsSnapshot !== "function") return;

  // Strokes: dx/dy em frações 0-1
  const dx = dxPct / 100, dy = dyPct / 100;
  const strokes = getDrawingsSnapshot();
  strokes.forEach(s => {
    if (!_selectedStrokeIds.has(String(s.id))) return;
    // Pencil: move pontos [[px,py],...]
    if (s.points) {
      s.points.forEach(p => { p[0] += dx; p[1] += dy; });
    }
    // Todos: move x1,y1,x2,y2 (shapes usam esses como definição principal)
    if (s.x1 != null) {
      s.x1 += dx; s.y1 += dy;
      s.x2 += dx; s.y2 += dy;
    }
  });
  _scheduleDrawingUpdate(strokes);
}

// ── Resize ───────────────────────────────────────────────────

function _applyResizeDelta(handle, newBounds, oldBounds) {
  const oldW = oldBounds.x2 - oldBounds.x1;
  const oldH = oldBounds.y2 - oldBounds.y1;
  const newW = newBounds.x2 - newBounds.x1;
  const newH = newBounds.y2 - newBounds.y1;
  if (oldW < 0.1 || oldH < 0.1) return;

  const scaleX = newW / oldW;
  const scaleY = newH / oldH;
  const anchorX = handle.includes("w") ? oldBounds.x2 : oldBounds.x1;
  const anchorY = handle.includes("n") ? oldBounds.y2 : oldBounds.y1;

  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    state.tokens.forEach(token => {
      if (!_selectedTokenIds.has(String(token.id))) return;
      if (typeof canMoveTokens === "function" && !canMoveTokens(token)) return;
      token.x = Math.max(0, Math.min(100, anchorX + (token.x - anchorX) * scaleX));
      token.y = Math.max(0, Math.min(100, anchorY + (token.y - anchorY) * scaleY));
      const el = document.querySelector(`[data-token-id="${token.id}"]`);
      if (el) { el.style.left = token.x + "%"; el.style.top = token.y + "%"; }
    });
  }

  if (_selectedStrokeIds.size === 0 || typeof getDrawingsSnapshot !== "function") return;

  // Anchor em frações 0-1
  const ax = anchorX / 100, ay = anchorY / 100;
  const strokes = getDrawingsSnapshot();
  strokes.forEach(s => {
    if (!_selectedStrokeIds.has(String(s.id))) return;
    if (s.points) {
      s.points.forEach(p => {
        p[0] = ax + (p[0] - ax) * scaleX;
        p[1] = ay + (p[1] - ay) * scaleY;
      });
    }
    if (s.x1 != null) {
      s.x1 = ax + (s.x1 - ax) * scaleX;
      s.y1 = ay + (s.y1 - ay) * scaleY;
      s.x2 = ax + (s.x2 - ax) * scaleX;
      s.y2 = ay + (s.y2 - ay) * scaleY;
    }
  });
  _scheduleDrawingUpdate(strokes);
}

function _scheduleDrawingUpdate(strokes) {
  _pendingStrokes = strokes;
  if (!_pendingDrawingRender) {
    _pendingDrawingRender = true;
    requestAnimationFrame(() => {
      _pendingDrawingRender = false;
      if (_pendingStrokes !== null && typeof setDrawingsFromRemote === "function") {
        setDrawingsFromRemote(_pendingStrokes);
        _pendingStrokes = null;
      }
    });
  }
}

function _broadcastAndRender() {
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    state.tokens.forEach(token => {
      if (!_selectedTokenIds.has(String(token.id))) return;
      if (typeof broadcastMesaTokenMove === "function") broadcastMesaTokenMove(token);
    });
  }
  // Sem persistir, o movimento em grupo sincroniza na hora mas volta ao
  // estado antigo no proximo reload (a cena salva nunca mudou).
  if (_selectedTokenIds.size) {
    if (typeof bumpMesaSceneVersion === "function") bumpMesaSceneVersion();
    if (typeof persistState === "function") persistState({ immediate: true });
  }
  // Tracos movidos/redimensionados pela selecao tambem precisam chegar
  // aos outros clientes (mesmo canal do desenho livre).
  if (_selectedStrokeIds.size && typeof _broadcastDrawings === "function") {
    _broadcastDrawings();
  }
  if (typeof scheduleMesaRender === "function") scheduleMesaRender({ stage: true });
}

// ── Rubber-band helper ───────────────────────────────────────

function _updateBandEl(band) {
  const x = Math.min(_rbStartX, _rbEndX);
  const y = Math.min(_rbStartY, _rbEndY);
  const w = Math.abs(_rbEndX - _rbStartX);
  const h = Math.abs(_rbEndY - _rbStartY);
  band.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
}

// ── Init ─────────────────────────────────────────────────────

function initMesaSelect() {
  window._mesaInteractionMode = _interactionMode;

  const wrap = document.getElementById("mesaStageWrap");
  if (!wrap) return;

  let band = document.getElementById("mesaRubberBand");
  if (!band) {
    band = document.createElement("div");
    band.id = "mesaRubberBand";
    wrap.appendChild(band);
  }

  // Sincroniza estado inicial dos botões (nenhum ativo por padrão)
  document.querySelectorAll("[data-interaction-tool]").forEach(btn => {
    const active = btn.dataset.interactionTool === _interactionMode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", () => setInteractionMode(btn.dataset.interactionTool));
  });
  wrap.dataset.interactionMode = _interactionMode ?? "";

  window.addEventListener("keydown", e => {
    if (_interactionMode !== "select") return;
    if (e.key === "Escape") {
      clearMultiSelection();
    } else if ((e.key === "Delete" || e.key === "Backspace") && _selectedStrokeIds.size > 0) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) return;
      if (typeof deleteDrawingsById === "function") {
        deleteDrawingsById([..._selectedStrokeIds]);
        _selectedStrokeIds.clear();
        _hideSelectionBox();
      }
    }
  });

  wrap.addEventListener("contextmenu", e => {
    e.preventDefault();
  });

  // ── SELECTION BOX: drag-to-move ──────────────────────────
  const box = document.getElementById("mesaSelectionBox");
  if (box) {
    box.addEventListener("mousedown", e => {
      if (e.button !== 0 || _interactionMode !== "select") return;
      if (e.target.classList.contains("sel-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      _dragMode    = "move";
      _dragClientX = e.clientX;
      _dragClientY = e.clientY;
      _dragBounds  = _computeSelectionBounds();
    });

    box.querySelectorAll(".sel-handle").forEach(h => {
      h.addEventListener("mousedown", e => {
        if (e.button !== 0 || _interactionMode !== "select") return;
        e.preventDefault();
        e.stopPropagation();
        _dragMode    = "resize";
        _dragHandle  = h.dataset.handle;
        _dragClientX = e.clientX;
        _dragClientY = e.clientY;
        _dragBounds  = _computeSelectionBounds();
      });
    });
  }

  // ── RUBBER BAND: mousedown em espaço vazio ───────────────
  wrap.addEventListener("mousedown", e => {
    if (e.button !== 0 || _interactionMode !== "select") return;
    if (e.target.closest("input, button, a, [data-token-id], .mesa-token, #mesaSelectionBox")) return;

    const wr = wrap.getBoundingClientRect();
    _rbStartX = e.clientX - wr.left;
    _rbStartY = e.clientY - wr.top;
    _rbEndX   = _rbStartX;
    _rbEndY   = _rbStartY;
    _rbActive = true;
    band.classList.add("is-active");
    _updateBandEl(band);
    clearMultiSelection();
    e.preventDefault();
  });

  // ── GLOBAL MOUSEMOVE ─────────────────────────────────────
  window.addEventListener("mousemove", e => {
    if (_rbActive) {
      const wr = wrap.getBoundingClientRect();
      _rbEndX = e.clientX - wr.left;
      _rbEndY = e.clientY - wr.top;
      _updateBandEl(band);
      return;
    }

    if (_dragMode === null || !_dragBounds) return;

    const inner = _getInner();
    if (!inner) return;
    const ir    = inner.getBoundingClientRect();
    const dxPct = ((e.clientX - _dragClientX) / ir.width)  * 100;
    const dyPct = ((e.clientY - _dragClientY) / ir.height) * 100;
    _dragClientX = e.clientX;
    _dragClientY = e.clientY;

    if (_dragMode === "move") {
      _applyMoveDelta(dxPct, dyPct);
      _dragBounds = _computeSelectionBounds();

    } else if (_dragMode === "resize" && _dragHandle) {
      const nb = { ..._dragBounds };
      const h  = _dragHandle;
      if (h.includes("e")) nb.x2 = Math.max(nb.x1 + 2, nb.x2 + dxPct);
      if (h.includes("w")) nb.x1 = Math.min(nb.x2 - 2, nb.x1 + dxPct);
      if (h.includes("s")) nb.y2 = Math.max(nb.y1 + 2, nb.y2 + dyPct);
      if (h.includes("n")) nb.y1 = Math.min(nb.y2 - 2, nb.y1 + dyPct);

      _applyResizeDelta(h, nb, _dragBounds);
      _dragBounds = nb;
    }

    _refreshSelectionBox();
  });

  // ── GLOBAL MOUSEUP ───────────────────────────────────────
  window.addEventListener("mouseup", () => {
    if (_rbActive) {
      _rbActive = false;
      band.classList.remove("is-active");

      const w = Math.abs(_rbEndX - _rbStartX);
      const h = Math.abs(_rbEndY - _rbStartY);
      const wr = wrap.getBoundingClientRect();

      if (w >= 6 && h >= 6) {
        // Rubber-band: seleciona tudo que sobreponha a band
        const bandScreen = {
          left:   wr.left + Math.min(_rbStartX, _rbEndX),
          right:  wr.left + Math.max(_rbStartX, _rbEndX),
          top:    wr.top  + Math.min(_rbStartY, _rbEndY),
          bottom: wr.top  + Math.max(_rbStartY, _rbEndY),
        };

        const tHits = _tokensInBand(bandScreen);
        tHits.forEach(id => {
          _selectedTokenIds.add(id);
          const el = document.querySelector(`[data-token-id="${id}"]`);
          if (el) el.classList.add("is-multi-selected");
        });

        const sHits = _strokesInBand(bandScreen);
        sHits.forEach(id => _selectedStrokeIds.add(id));

        if (tHits.length === 1 && sHits.length === 0 && typeof selectToken === "function") {
          selectToken(tHits[0]);
        }

        _refreshSelectionBox();

      } else {
        // Clique simples: tenta click-select num stroke
        const clickCx = wr.left + (_rbStartX + _rbEndX) / 2;
        const clickCy = wr.top  + (_rbStartY + _rbEndY) / 2;
        _tryClickSelectStroke(clickCx, clickCy);
      }
      return;
    }

    if (_dragMode !== null) {
      _broadcastAndRender();
      _dragMode   = null;
      _dragHandle = null;
      _dragBounds = null;
    }
  });
}
