/* ============================================================
 * mesa-select.js — Modos de interação + seleção multi-elemento
 *
 *  "select"  — cursor/flecha
 *    LMB arrastar em vazio      → rubber-band multi-select
 *    Clique em stroke           → click-select individual
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
  box.style.left   = (b.x1 - PAD) + "%";
  box.style.top    = (b.y1 - PAD) + "%";
  box.style.width  = ((b.x2 - b.x1) + PAD * 2) + "%";
  box.style.height = ((b.y2 - b.y1) + PAD * 2) + "%";
  box.hidden = false;
}

function _refreshSelectionBox() {
  var b = _computeSelectionBounds();
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
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  (stroke.points || []).forEach(function(p) {
    var px = (p.px != null ? p.px : p.x) * 100;
    var py = (p.py != null ? p.py : p.y) * 100;
    if (px < x1) x1 = px;  if (px > x2) x2 = px;
    if (py < y1) y1 = py;  if (py > y2) y2 = py;
  });
  return isFinite(x1) ? { x1: x1, y1: y1, x2: x2, y2: y2 } : null;
}

/**
 * Bounding box de um token em % do mesaStageInner (escala-invariante).
 */
function _tokenBoundsPct(tokenId) {
  var inner = _getInner();
  if (!inner) return null;
  var ir = inner.getBoundingClientRect();
  var el = document.querySelector("[data-token-id=\"" + tokenId + "\"]");
  if (el) {
    var r = el.getBoundingClientRect();
    return {
      x1: ((r.left   - ir.left) / ir.width)  * 100,
      y1: ((r.top    - ir.top)  / ir.height) * 100,
      x2: ((r.right  - ir.left) / ir.width)  * 100,
      y2: ((r.bottom - ir.top)  / ir.height) * 100,
    };
  }
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    var t = state.tokens.find(function(t) { return String(t.id) === String(tokenId); });
    if (t) return { x1: t.x, y1: t.y, x2: t.x + 5, y2: t.y + 5 };
  }
  return null;
}

/** União de todos os bounds selecionados em % */
function _computeSelectionBounds() {
  if (_selectedTokenIds.size === 0 && _selectedStrokeIds.size === 0) return null;
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

  function expand(b) {
    if (!b) return;
    if (b.x1 < x1) x1 = b.x1;  if (b.y1 < y1) y1 = b.y1;
    if (b.x2 > x2) x2 = b.x2;  if (b.y2 > y2) y2 = b.y2;
  }

  _selectedTokenIds.forEach(function(id) { expand(_tokenBoundsPct(id)); });

  if (_selectedStrokeIds.size > 0 && typeof getDrawingsSnapshot === "function") {
    var strokes = getDrawingsSnapshot();
    _selectedStrokeIds.forEach(function(id) {
      var s = strokes.find(function(s) { return String(s.id) === String(id); });
      if (s) expand(_strokeBounds(s));
    });
  }

  return isFinite(x1) ? { x1: x1, y1: y1, x2: x2, y2: y2 } : null;
}

// ── Detecção de elementos no rubber-band ─────────────────────

function _tokensInBand(screenRect) {
  var hits = [];
  document.querySelectorAll("[data-token-id]").forEach(function(el) {
    var r = el.getBoundingClientRect();
    var cx = (r.left + r.right)  / 2;
    var cy = (r.top  + r.bottom) / 2;
    if (cx >= screenRect.left && cx <= screenRect.right &&
        cy >= screenRect.top  && cy <= screenRect.bottom) {
      hits.push(String(el.dataset.tokenId));
    }
  });
  if (hits.length) return hits;

  // Fallback canvas
  var inner = _getInner();
  if (!inner) return hits;
  var ir = inner.getBoundingClientRect();
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    state.tokens.forEach(function(t) {
      var sx = ir.left + (t.x / 100) * ir.width;
      var sy = ir.top  + (t.y / 100) * ir.height;
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
  var inner = _getInner();
  if (!inner) return [];
  var ir = inner.getBoundingClientRect();

  return getDrawingsSnapshot()
    .filter(function(s) {
      var b = _strokeBounds(s);
      if (!b) return false;
      // Bounding box do stroke em screen space — verifica sobreposição
      var sx1 = ir.left + (b.x1 / 100) * ir.width;
      var sy1 = ir.top  + (b.y1 / 100) * ir.height;
      var sx2 = ir.left + (b.x2 / 100) * ir.width;
      var sy2 = ir.top  + (b.y2 / 100) * ir.height;
      return sx1 <= screenRect.right  && sx2 >= screenRect.left &&
             sy1 <= screenRect.bottom && sy2 >= screenRect.top;
    })
    .map(function(s) { return s.id; });
}

/**
 * Click-select: tenta selecionar o stroke cujo bounding box
 * contém (clientX, clientY). Prefere o menor bounding box (mais específico).
 * Retorna true se algo foi selecionado.
 */
function _tryClickSelectStroke(clientX, clientY) {
  if (typeof getDrawingsSnapshot !== "function") return false;
  var inner = _getInner();
  if (!inner) return false;
  var ir  = inner.getBoundingClientRect();
  var cpx = ((clientX - ir.left) / ir.width)  * 100;
  var cpy = ((clientY - ir.top)  / ir.height) * 100;

  var best = null, bestArea = Infinity;
  getDrawingsSnapshot().forEach(function(s) {
    var b = _strokeBounds(s);
    if (!b) return;
    if (cpx < b.x1 || cpx > b.x2 || cpy < b.y1 || cpy > b.y2) return;
    var area = (b.x2 - b.x1) * (b.y2 - b.y1);
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
    state.tokens.forEach(function(token) {
      if (!_selectedTokenIds.has(String(token.id))) return;
      token.x = Math.max(0, Math.min(100, token.x + dxPct));
      token.y = Math.max(0, Math.min(100, token.y + dyPct));
      var el = document.querySelector("[data-token-id=\"" + token.id + "\"]");
      if (el) { el.style.left = token.x + "%"; el.style.top = token.y + "%"; }
    });
  }

  // Strokes (frações 0–1)
  if (_selectedStrokeIds.size > 0 && typeof getDrawingsSnapshot === "function") {
    var dx = dxPct / 100, dy = dyPct / 100;
    var strokes = getDrawingsSnapshot();
    strokes.forEach(function(s) {
      if (!_selectedStrokeIds.has(String(s.id))) return;
      (s.points || []).forEach(function(p) {
        if (p.px != null) { p.px += dx; p.py += dy; }
        else              { p.x  += dx; p.y  += dy; }
      });
    });
    _scheduleDrawingUpdate(strokes);
  }
}

// ── Resize ───────────────────────────────────────────────────

function _applyResizeDelta(handle, newBounds, oldBounds) {
  var oldW = oldBounds.x2 - oldBounds.x1;
  var oldH = oldBounds.y2 - oldBounds.y1;
  var newW = newBounds.x2 - newBounds.x1;
  var newH = newBounds.y2 - newBounds.y1;
  if (oldW < 0.1 || oldH < 0.1) return;

  var scaleX = newW / oldW;
  var scaleY = newH / oldH;
  var anchorX = handle.includes("w") ? oldBounds.x2 : oldBounds.x1;
  var anchorY = handle.includes("n") ? oldBounds.y2 : oldBounds.y1;

  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    state.tokens.forEach(function(token) {
      if (!_selectedTokenIds.has(String(token.id))) return;
      var nx = anchorX + (token.x - anchorX) * scaleX;
      var ny = anchorY + (token.y - anchorY) * scaleY;
      token.x = Math.max(0, Math.min(100, nx));
      token.y = Math.max(0, Math.min(100, ny));
      var el = document.querySelector("[data-token-id=\"" + token.id + "\"]");
      if (el) { el.style.left = token.x + "%"; el.style.top = token.y + "%"; }
    });
  }

  if (_selectedStrokeIds.size > 0 && typeof getDrawingsSnapshot === "function") {
    var ax = anchorX / 100, ay = anchorY / 100;
    var strokes = getDrawingsSnapshot();
    strokes.forEach(function(s) {
      if (!_selectedStrokeIds.has(String(s.id))) return;
      (s.points || []).forEach(function(p) {
        if (p.px != null) {
          p.px = ax + (p.px - ax) * scaleX;
          p.py = ay + (p.py - ay) * scaleY;
        } else {
          p.x = ax + (p.x - ax) * scaleX;
          p.y = ay + (p.y - ay) * scaleY;
        }
      });
    });
    _scheduleDrawingUpdate(strokes);
  }
}

function _scheduleDrawingUpdate(strokes) {
  _pendingStrokes = strokes;
  if (!_pendingDrawingRender) {
    _pendingDrawingRender = true;
    requestAnimationFrame(function() {
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
    state.tokens.forEach(function(token) {
      if (!_selectedTokenIds.has(String(token.id))) return;
      if (typeof broadcastMesaTokenMove === "function") broadcastMesaTokenMove(token);
    });
  }
  if (typeof scheduleMesaRender === "function") scheduleMesaRender({ stage: true });
}

// ── Rubber-band helper ───────────────────────────────────────

function _updateBandEl(band) {
  var x = Math.min(_rbStartX, _rbEndX);
  var y = Math.min(_rbStartY, _rbEndY);
  var w = Math.abs(_rbEndX - _rbStartX);
  var h = Math.abs(_rbEndY - _rbStartY);
  band.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;";
}

// ── Init ─────────────────────────────────────────────────────

function initMesaSelect() {
  window._mesaInteractionMode = _interactionMode;

  var wrap = document.getElementById("mesaStageWrap");
  if (!wrap) return;

  var band = document.getElementById("mesaRubberBand");
  if (!band) {
    band = document.createElement("div");
    band.id = "mesaRubberBand";
    wrap.appendChild(band);
  }

  document.querySelectorAll("[data-interaction-tool]").forEach(function(btn) {
    btn.addEventListener("click", function() { setInteractionMode(btn.dataset.interactionTool); });
  });

  window.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && _interactionMode === "select") clearMultiSelection();
  });

  wrap.addEventListener("contextmenu", function(e) {
    if (_interactionMode === "select") e.preventDefault();
  });

  // ── SELECTION BOX: drag-to-move ──────────────────────────
  var box = document.getElementById("mesaSelectionBox");
  if (box) {
    box.addEventListener("mousedown", function(e) {
      if (e.button !== 0 || _interactionMode !== "select") return;
      if (e.target.classList.contains("sel-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      _dragMode    = "move";
      _dragClientX = e.clientX;
      _dragClientY = e.clientY;
      _dragBounds  = _computeSelectionBounds();
    });

    box.querySelectorAll(".sel-handle").forEach(function(h) {
      h.addEventListener("mousedown", function(e) {
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
  wrap.addEventListener("mousedown", function(e) {
    if (e.button !== 0 || _interactionMode !== "select") return;
    if (e.target.closest("input, button, a, [data-token-id], .mesa-token, #mesaSelectionBox")) return;

    var wr = wrap.getBoundingClientRect();
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
  window.addEventListener("mousemove", function(e) {
    if (_rbActive) {
      var wr = wrap.getBoundingClientRect();
      _rbEndX = e.clientX - wr.left;
      _rbEndY = e.clientY - wr.top;
      _updateBandEl(band);
      return;
    }

    if (_dragMode === null || !_dragBounds) return;

    var inner = _getInner();
    if (!inner) return;
    var ir    = inner.getBoundingClientRect();
    var dxPct = ((e.clientX - _dragClientX) / ir.width)  * 100;
    var dyPct = ((e.clientY - _dragClientY) / ir.height) * 100;
    _dragClientX = e.clientX;
    _dragClientY = e.clientY;

    if (_dragMode === "move") {
      _applyMoveDelta(dxPct, dyPct);
      _dragBounds = _computeSelectionBounds();

    } else if (_dragMode === "resize" && _dragHandle) {
      var nb = { x1: _dragBounds.x1, y1: _dragBounds.y1, x2: _dragBounds.x2, y2: _dragBounds.y2 };
      var h  = _dragHandle;
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
  window.addEventListener("mouseup", function() {
    if (_rbActive) {
      _rbActive = false;
      band.classList.remove("is-active");

      var w = Math.abs(_rbEndX - _rbStartX);
      var h = Math.abs(_rbEndY - _rbStartY);
      var wr = wrap.getBoundingClientRect();

      if (w >= 6 && h >= 6) {
        // Rubber-band drag: seleciona tudo que sobreponha a band
        var bandScreen = {
          left:   wr.left + Math.min(_rbStartX, _rbEndX),
          right:  wr.left + Math.max(_rbStartX, _rbEndX),
          top:    wr.top  + Math.min(_rbStartY, _rbEndY),
          bottom: wr.top  + Math.max(_rbStartY, _rbEndY),
        };

        var tHits = _tokensInBand(bandScreen);
        tHits.forEach(function(id) {
          _selectedTokenIds.add(id);
          var el = document.querySelector("[data-token-id=\"" + id + "\"]");
          if (el) el.classList.add("is-multi-selected");
        });

        var sHits = _strokesInBand(bandScreen);
        sHits.forEach(function(id) { _selectedStrokeIds.add(id); });

        if (tHits.length === 1 && sHits.length === 0 && typeof selectToken === "function") {
          selectToken(tHits[0]);
        }

        _refreshSelectionBox();

      } else {
        // Clique simples: tenta click-select num stroke
        var clickCx = wr.left + (_rbStartX + _rbEndX) / 2;
        var clickCy = wr.top  + (_rbStartY + _rbEndY) / 2;
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
