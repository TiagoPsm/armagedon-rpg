/* ============================================================
 * mesa-select.js — Modos de interação com o palco VTT
 *
 *  "select"  — cursor/flecha
 *    LMB arrastar em vazio  → rubber-band multi-select
 *    RMB arrastar           → pan da câmera
 *    Clique em token        → select normal (mesa-stage.js)
 *
 *  "move"    — mão
 *    LMB arrastar em token  → mover token (mesa-stage.js)
 *    LMB arrastar em vazio  → pan da câmera (mesa-map.js)
 *
 * O modo ativo fica em window._mesaInteractionMode para que
 * mesa-map.js possa decidir qual botão ativa o pan.
 * ============================================================ */

let _interactionMode = "select";
let _selectedTokenIds = new Set();

let _rbActive  = false;
let _rbStartX  = 0, _rbStartY = 0;
let _rbEndX    = 0, _rbEndY   = 0;

// ── API pública ─────────────────────────────────────────────
function getInteractionMode()  { return _interactionMode; }
function getSelectedTokenIds() { return new Set(_selectedTokenIds); }

function setInteractionMode(mode) {
  if (mode !== "select" && mode !== "move") return;
  _interactionMode = mode;
  window._mesaInteractionMode = mode;

  // Atualizar botões na toolbar
  document.querySelectorAll("[data-interaction-tool]").forEach(btn => {
    const active = btn.dataset.interactionTool === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  // Data-attribute no wrap para CSS de cursor
  const wrap = document.getElementById("mesaStageWrap");
  if (wrap) wrap.dataset.interactionMode = mode;

  clearMultiSelection();
}

function clearMultiSelection() {
  _selectedTokenIds.clear();
  document.querySelectorAll(".mesa-token.is-multi-selected")
    .forEach(el => el.classList.remove("is-multi-selected"));
}

// ── Rubber-band ─────────────────────────────────────────────
function _updateBandEl(band) {
  const x = Math.min(_rbStartX, _rbEndX);
  const y = Math.min(_rbStartY, _rbEndY);
  const w = Math.abs(_rbEndX - _rbStartX);
  const h = Math.abs(_rbEndY - _rbStartY);
  band.style.cssText =
    `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
}

function _tokensInBand(screenRect) {
  const hits = [];

  // Modo DOM: usa getBoundingClientRect dos elementos já no stage
  document.querySelectorAll("[data-token-id]").forEach(el => {
    const r  = el.getBoundingClientRect();
    const cx = (r.left + r.right)  / 2;
    const cy = (r.top  + r.bottom) / 2;
    if (cx >= screenRect.left && cx <= screenRect.right &&
        cy >= screenRect.top  && cy <= screenRect.bottom) {
      hits.push(String(el.dataset.tokenId));
    }
  });
  if (hits.length) return hits;

  // Fallback canvas: calcula posição via % de token + rect do inner
  const inner = document.getElementById("mesaStageInner");
  if (!inner) return hits;
  const ir = inner.getBoundingClientRect();
  if (typeof state !== "undefined" && Array.isArray(state.tokens)) {
    state.tokens.forEach(token => {
      const sx = ir.left + (token.x / 100) * ir.width;
      const sy = ir.top  + (token.y / 100) * ir.height;
      if (sx >= screenRect.left && sx <= screenRect.right &&
          sy >= screenRect.top  && sy <= screenRect.bottom) {
        hits.push(token.id);
      }
    });
  }
  return hits;
}

// ── Init ────────────────────────────────────────────────────
function initMesaSelect() {
  // Expõe modo inicial
  window._mesaInteractionMode = _interactionMode;

  const wrap = document.getElementById("mesaStageWrap");
  if (!wrap) return;

  // Criar elemento do rubber band
  let band = document.getElementById("mesaRubberBand");
  if (!band) {
    band = document.createElement("div");
    band.id = "mesaRubberBand";
    wrap.appendChild(band);
  }

  // Botões de modo
  document.querySelectorAll("[data-interaction-tool]").forEach(btn => {
    btn.addEventListener("click", () => setInteractionMode(btn.dataset.interactionTool));
  });

  // Impedir menu de contexto quando RMB serve para pan (modo select)
  wrap.addEventListener("contextmenu", e => {
    if ((_interactionMode) === "select") e.preventDefault();
  });

  // Rubber band: inicia no mousedown sobre espaço vazio em modo select
  wrap.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    if (_interactionMode !== "select") return;
    if (e.target.closest("input, button, a, [data-token-id], .mesa-token")) return;

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

  window.addEventListener("mousemove", e => {
    if (!_rbActive) return;
    const wr = wrap.getBoundingClientRect();
    _rbEndX = e.clientX - wr.left;
    _rbEndY = e.clientY - wr.top;
    _updateBandEl(band);
  });

  window.addEventListener("mouseup", () => {
    if (!_rbActive) return;
    _rbActive = false;
    band.classList.remove("is-active");

    const w = Math.abs(_rbEndX - _rbStartX);
    const h = Math.abs(_rbEndY - _rbStartY);
    if (w < 6 || h < 6) return;   // clique simples, não drag

    const wr = wrap.getBoundingClientRect();
    const bandScreen = {
      left:   wr.left + Math.min(_rbStartX, _rbEndX),
      right:  wr.left + Math.max(_rbStartX, _rbEndX),
      top:    wr.top  + Math.min(_rbStartY, _rbEndY),
      bottom: wr.top  + Math.max(_rbStartY, _rbEndY),
    };

    const hits = _tokensInBand(bandScreen);
    if (!hits.length) return;

    hits.forEach(id => {
      _selectedTokenIds.add(id);
      const el = document.querySelector(`[data-token-id="${id}"]`);
      if (el) el.classList.add("is-multi-selected");
    });

    // Se um único token foi capturado, seleciona normalmente também
    if (hits.length === 1 && typeof selectToken === "function") {
      selectToken(hits[0]);
    }
  });
}
