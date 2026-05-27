/* ============================================================
 * mesa-drawing.js — Ferramentas de desenho / anotação no VTT
 * Ferramentas: lápis, linha, retângulo, círculo, borracha
 * Coordenadas armazenadas em % do canvas → escalam com zoom
 * ============================================================ */

// ── Estado ─────────────────────────────────────────────────────────
let _activeTool  = null;   // 'pencil' | 'line' | 'rect' | 'circle' | 'eraser' | null
let _drawColor   = "#e84040";
let _drawWidth   = 3;
let _strokes     = [];     // traços persistidos
let _activeStroke = null;  // traço sendo desenhado agora
let _isDrawing   = false;

let _drawCanvasEl  = null;
let _drawCtx       = null;
let _stageInnerEl  = null;

const ERASE_RADIUS = 22;

const PALETTE = [
  "#e84040", "#e86820", "#e8c020", "#40c860",
  "#40b8e8", "#4058e8", "#a040e8", "#e840a0",
  "#ffffff", "#aaaaaa", "#555555", "#111111"
];

// ── Init ───────────────────────────────────────────────────────────
function initMesaDrawing() {
  _drawCanvasEl = document.getElementById("mesaDrawCanvas");
  _stageInnerEl = document.getElementById("mesaStageInner");
  if (!_drawCanvasEl || !_stageInnerEl) return;
  _drawCtx = _drawCanvasEl.getContext("2d");

  _resizeDrawCanvas();
  new ResizeObserver(() => _resizeDrawCanvas()).observe(_stageInnerEl);

  _bindDrawEvents();
  _bindToolbarButtons();
  _buildColorPicker();
}

// ── Resize canvas para cobrir o stageInner ─────────────────────────
function _resizeDrawCanvas() {
  if (!_drawCanvasEl || !_stageInnerEl) return;
  const dpr = window.devicePixelRatio || 1;
  const w   = _stageInnerEl.offsetWidth;
  const h   = _stageInnerEl.offsetHeight;
  if (!w || !h) return;

  _drawCanvasEl.style.width  = w + "px";
  _drawCanvasEl.style.height = h + "px";
  _drawCanvasEl.width  = Math.round(w * dpr);
  _drawCanvasEl.height = Math.round(h * dpr);

  if (_drawCtx) {
    _drawCtx.scale(dpr, dpr);
  }
  renderDrawings();
}

// ── Ativar / desativar ferramenta ─────────────────────────────────
function setDrawTool(tool) {
  // toggle: clicar na mesma ferramenta desativa
  _activeTool = (_activeTool === tool) ? null : tool;

  // botões da toolbar
  document.querySelectorAll("[data-draw-tool]").forEach(btn => {
    const active = btn.dataset.drawTool === _activeTool;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  // canvas: captura eventos só quando ferramenta ativa
  if (_drawCanvasEl) {
    const on = Boolean(_activeTool);
    _drawCanvasEl.style.pointerEvents = on ? "all" : "none";
    _drawCanvasEl.style.cursor = on
      ? (_activeTool === "eraser" ? "cell" : "crosshair")
      : "";
  }

  // painel de opções: ocultar se eraser ou null
  const opts = document.getElementById("mesaDrawOptions");
  if (opts) opts.hidden = !_activeTool || _activeTool === "eraser";

  // cursor do stage-wrap quando uma ferramenta está ativa
  const wrap = document.getElementById("mesaStageWrap");
  if (wrap) wrap.style.cursor = _activeTool ? "crosshair" : "";
}

function getDrawTool() { return _activeTool; }

// ── Coordenadas ────────────────────────────────────────────────────
function _canvasPos(e) {
  if (!_drawCanvasEl) return { x: 0, y: 0 };
  const rect = _drawCanvasEl.getBoundingClientRect();
  // Escala CSS vs tamanho interno (DPR já tratado no resize)
  const scaleX = (_drawCanvasEl.offsetWidth  || rect.width)  / rect.width;
  const scaleY = (_drawCanvasEl.offsetHeight || rect.height) / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY
  };
}

function _toPercent(x, y) {
  const w = _drawCanvasEl ? (_drawCanvasEl.offsetWidth  || 1) : 1;
  const h = _drawCanvasEl ? (_drawCanvasEl.offsetHeight || 1) : 1;
  return { px: x / w, py: y / h };
}

function _fromPercent(px, py) {
  const w = _drawCanvasEl ? (_drawCanvasEl.offsetWidth  || 1) : 1;
  const h = _drawCanvasEl ? (_drawCanvasEl.offsetHeight || 1) : 1;
  return { x: px * w, y: py * h };
}

// ── Eventos de desenho ─────────────────────────────────────────────
function _bindDrawEvents() {
  if (!_drawCanvasEl) return;

  _drawCanvasEl.addEventListener("mousedown", _onDrawStart);
  window.addEventListener("mousemove",  _onDrawMove);
  window.addEventListener("mouseup",    _onDrawEnd);

  // Clique direito cancela a ferramenta atual
  _drawCanvasEl.addEventListener("contextmenu", e => {
    e.preventDefault();
    setDrawTool(null);
  });

  // Tecla Escape cancela / desfaz traço em andamento
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && _activeTool) {
      _isDrawing    = false;
      _activeStroke = null;
      setDrawTool(null);
      renderDrawings();
    }
    // Ctrl+Z: desfaz último traço
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      if (_strokes.length > 0) {
        _strokes.pop();
        renderDrawings();
        _broadcastDrawings();
      }
    }
  });
}

function _onDrawStart(e) {
  if (!_activeTool || e.button !== 0) return;
  e.stopPropagation();
  _isDrawing = true;
  window._mesaStagePanMoved = true; // impede deselect de token

  const pos = _canvasPos(e);
  const { px, py } = _toPercent(pos.x, pos.y);

  if (_activeTool === "eraser") {
    _eraseAt(pos.x, pos.y);
    return;
  }

  _activeStroke = {
    id:     Math.random().toString(36).slice(2),
    tool:   _activeTool,
    color:  _drawColor,
    width:  _drawWidth,
    x1: px, y1: py,
    x2: px, y2: py,
    points: _activeTool === "pencil" ? [[px, py]] : null
  };
}

function _onDrawMove(e) {
  if (!_isDrawing) return;

  const pos = _canvasPos(e);
  const { px, py } = _toPercent(pos.x, pos.y);

  if (_activeTool === "eraser") {
    _eraseAt(pos.x, pos.y);
    return;
  }

  if (!_activeStroke) return;
  _activeStroke.x2 = px;
  _activeStroke.y2 = py;
  if (_activeTool === "pencil") {
    _activeStroke.points.push([px, py]);
  }
  renderDrawings();
}

function _onDrawEnd() {
  if (!_isDrawing) return;
  _isDrawing = false;
  setTimeout(() => { window._mesaStagePanMoved = false; }, 0);

  if (_activeStroke && _activeTool !== "eraser") {
    // Lápis: garantir pelo menos 2 pontos (evita ponto sem renderizar)
    if (_activeTool === "pencil") {
      const pts = _activeStroke.points;
      if (pts.length === 1) pts.push([pts[0][0] + 0.001, pts[0][1] + 0.001]);
    }
    _strokes.push(_activeStroke);
    _broadcastDrawings();
  }

  _activeStroke = null;
  renderDrawings();
}

// ── Borracha ───────────────────────────────────────────────────────
function _eraseAt(x, y) {
  const before = _strokes.length;
  _strokes = _strokes.filter(s => !_hitTest(s, x, y));
  if (_strokes.length !== before) {
    renderDrawings();
    _broadcastDrawings();
  }
}

function _hitTest(s, mx, my) {
  const r = ERASE_RADIUS;

  if (s.tool === "pencil") {
    return s.points.some(([px, py]) => {
      const { x, y } = _fromPercent(px, py);
      return Math.hypot(x - mx, y - my) < r;
    });
  }

  // Formas: testar centro + borda aproximada
  const { x: x1, y: y1 } = _fromPercent(s.x1, s.y1);
  const { x: x2, y: y2 } = _fromPercent(s.x2, s.y2);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const half = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
  return Math.hypot(cx - mx, cy - my) < r + half;
}

// ── Renderização ───────────────────────────────────────────────────
function renderDrawings() {
  if (!_drawCtx || !_drawCanvasEl) return;
  const w = _drawCanvasEl.offsetWidth;
  const h = _drawCanvasEl.offsetHeight;
  _drawCtx.clearRect(0, 0, w, h);

  const all = _activeStroke ? [..._strokes, _activeStroke] : _strokes;
  all.forEach(_renderStroke);
}

function _renderStroke(s) {
  const ctx = _drawCtx;
  const { x: x1, y: y1 } = _fromPercent(s.x1, s.y1);
  const { x: x2, y: y2 } = _fromPercent(s.x2, s.y2);

  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle   = s.color;
  ctx.lineWidth   = s.width;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  ctx.globalAlpha = 0.88;

  switch (s.tool) {

    case "pencil": {
      if (!s.points || s.points.length < 2) break;
      ctx.beginPath();
      const { x: sx0, y: sy0 } = _fromPercent(s.points[0][0], s.points[0][1]);
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < s.points.length; i++) {
        const { x: sx, y: sy } = _fromPercent(s.points[i][0], s.points[i][1]);
        if (i < s.points.length - 1) {
          const { x: mx, y: my } = _fromPercent(
            (s.points[i][0] + s.points[i + 1][0]) / 2,
            (s.points[i][1] + s.points[i + 1][1]) / 2
          );
          ctx.quadraticCurveTo(sx, sy, mx, my);
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
      break;
    }

    case "line":
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;

    case "rect": {
      const rx = x1, ry = y1, rw = x2 - x1, rh = y2 - y1;
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.globalAlpha = 0.13;
      ctx.fill();
      ctx.globalAlpha = 0.88;
      ctx.stroke();
      break;
    }

    case "circle": {
      const radiusX = Math.abs(x2 - x1) / 2;
      const radiusY = Math.abs(y2 - y1) / 2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(radiusX, 1), Math.max(radiusY, 1), 0, 0, Math.PI * 2);
      ctx.globalAlpha = 0.13;
      ctx.fill();
      ctx.globalAlpha = 0.88;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ── Limpar tudo ────────────────────────────────────────────────────
function clearAllDrawings() {
  _strokes = [];
  renderDrawings();
  _broadcastDrawings();
}

// ── Sync externo ───────────────────────────────────────────────────
function setDrawingsFromRemote(strokes) {
  _strokes = Array.isArray(strokes) ? strokes : [];
  renderDrawings();
}

function getDrawingsSnapshot() {
  return _strokes.slice();
}

function _broadcastDrawings() {
  if (typeof sendMesaRealtimeDelta === "function") {
    sendMesaRealtimeDelta("mesa:drawings:update", { drawings: _strokes });
  }
}

// ── Bind botões da toolbar ─────────────────────────────────────────
function _bindToolbarButtons() {
  document.querySelectorAll("[data-draw-tool]").forEach(btn => {
    btn.addEventListener("click", () => setDrawTool(btn.dataset.drawTool));
  });

  const clearBtn = document.getElementById("mesaDrawClearBtn");
  if (clearBtn) clearBtn.addEventListener("click", clearAllDrawings);
}

// ── Paleta de cores + largura ──────────────────────────────────────
function _buildColorPicker() {
  const container = document.getElementById("mesaDrawColorPalette");
  if (!container) return;

  PALETTE.forEach(color => {
    const swatch = document.createElement("button");
    swatch.className = "draw-swatch";
    swatch.style.setProperty("--swatch-color", color);
    swatch.title = color;
    swatch.setAttribute("aria-label", "Cor " + color);
    if (color === _drawColor) swatch.classList.add("is-active");

    swatch.addEventListener("click", () => {
      _drawColor = color;
      document.querySelectorAll(".draw-swatch").forEach(s =>
        s.classList.toggle("is-active", s.title === color)
      );
      // Atualiza preview da cor atual
      const preview = document.getElementById("mesaDrawColorPreview");
      if (preview) preview.style.background = color;
    });
    container.appendChild(swatch);
  });

  // Atualiza preview inicial
  const preview = document.getElementById("mesaDrawColorPreview");
  if (preview) preview.style.background = _drawColor;

  // Botões de largura
  document.querySelectorAll("[data-draw-width]").forEach(btn => {
    btn.addEventListener("click", () => {
      _drawWidth = Number(btn.dataset.drawWidth);
      document.querySelectorAll("[data-draw-width]").forEach(b =>
        b.classList.toggle("is-active", b.dataset.drawWidth === btn.dataset.drawWidth)
      );
    });
    if (Number(btn.dataset.drawWidth) === _drawWidth) btn.classList.add("is-active");
  });
}
