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

/* ── Limites e precisão (Etapa 50) ─────────────────────────────────
 * A auditoria mediu 13,4KB para 5 traços a lápis: as coordenadas iam
 * cruas (0.02145922746781116 = 19 caracteres por número), o cap de
 * 32KB por mensagem WS estourava em ~12 traços e o DO passava a
 * RECUSAR o broadcast em silêncio — o mestre continuava vendo os
 * próprios traços e o jogador parava de receber.
 *
 * Três medidas: (1) arredondar na captura para as MESMAS 4 casas que o
 * Worker salva (2,4x menor, zero diferença visível); (2) ralo de
 * pontos redundantes (o mousemove dispara muito mais que o necessário);
 * (3) caps iguais aos do Worker, senão o que fica na tela diverge do
 * que é salvo. Junto com o broadcast por delta, a mensagem passou a ser
 * sempre de UM traço.
 */
const DRAW_COORD_DECIMALS = 4;
const DRAW_MIN_POINT_DIST = 0.002;   // 0,2% do canvas entre pontos do lápis
// Etapa 74: os tetos subiram muito (300→1500 traços, 200→400 pontos). O que
// segura de verdade não é a contagem, é o corpo do PUT /mesa/scene — que
// passou de 256KB para 1MB junto. Um traço de lápis cheio (400 pontos) dá
// ~7KB, bem abaixo do cap de 32KB por mensagem do DO, então o delta de UM
// traço continua cabendo sempre.
// Tolerancia base da simplificacao: 0,15% do palco. Abaixo disso o desvio
// nao chega a um pixel na tela em zoom normal.
/* ── Formas novas (Etapa 123) ──────────────────────────────────────
 * cone e arrow nao precisaram de campo novo: reaproveitam x1,y1 (origem) e
 * x2,y2 (ponta). O cone abre CONE_HALF_ANGLE para cada lado da direcao
 * arrastada — 26,5 graus, que da os 53 graus do cone classico de RPG. */
const CONE_HALF_ANGLE = 26.5 * Math.PI / 180;
const ARROW_HEAD_MIN = 10;   // px de tela: ponta legivel mesmo em seta curta

const DRAW_SIMPLIFY_EPS = 0.0015;
const DRAW_MAX_POINTS  = 400;        // = MAX_DRAW_POINTS do Worker
const DRAW_MAX_STROKES = 1500;       // = MAX_DRAWINGS do Worker
// Teto de segurança do full-state (só o reenvio a quem entra depois usa):
// abaixo do cap de 32KB do DO, com folga para o envelope.
const DRAW_FULL_STATE_MAX_CHARS = 30 * 1024;

/* ── Simplificacao de curva (Etapa 122) ────────────────────────────
 * O teto de DRAW_MAX_POINTS existe por causa do cap de 32KB por mensagem
 * do Durable Object. Ate aqui, ao bater no teto o traco simplesmente
 * PARAVA de crescer no meio do movimento: a mao continuava andando e a
 * tinta acabava, sem aviso nenhum.
 *
 * Ramer-Douglas-Peucker resolve por outro lado: em vez de contar pontos,
 * joga fora os que nao mudam a FORMA. Um risco longo desenhado depressa
 * tem centenas de pontos quase colineares - descartar 60% deles nao muda
 * um pixel na tela e devolve espaco para a mao continuar. Quando o teto
 * chega, a gente rareia o proprio traco e segue desenhando; so quando
 * nem rarear resolve e que ele para.
 *
 * Iterativo de proposito (pilha explicita): um traco de milhares de
 * pontos estouraria a pilha de recursao do navegador. */
function _perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const den = Math.hypot(dx, dy);
  if (den < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / den;
}

function _simplifyPoints(points, epsilon) {
  if (!Array.isArray(points) || points.length < 3) return points;
  const manter = new Uint8Array(points.length);
  manter[0] = 1;
  manter[points.length - 1] = 1;

  const pilha = [[0, points.length - 1]];
  while (pilha.length) {
    const [ini, fim] = pilha.pop();
    if (fim <= ini + 1) continue;
    let pior = 0;
    let indice = -1;
    for (let i = ini + 1; i < fim; i += 1) {
      const d = _perpDistance(points[i], points[ini], points[fim]);
      if (d > pior) { pior = d; indice = i; }
    }
    if (indice !== -1 && pior > epsilon) {
      manter[indice] = 1;
      pilha.push([ini, indice], [indice, fim]);
    }
  }

  const saida = [];
  for (let i = 0; i < points.length; i += 1) if (manter[i]) saida.push(points[i]);
  return saida;
}

function _round4(value) {
  const factor = 10 ** DRAW_COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

/* ── Camada única (Etapa 73) ───────────────────────────────────────
 * O desenho não tem mais camada secreta do mestre: mestre e jogadores
 * dividem exatamente a MESMA camada, a dos tokens. Traços antigos
 * gravados como "dm" (que nunca saíram do navegador do mestre) passam a
 * valer como compartilhados na primeira leitura. O campo `layer`
 * continua no payload porque o Worker o normaliza. */
/* Ferramentas que este modulo sabe DESENHAR.
 *
 * Espelha `DRAW_TOOLS` do Worker e `MESA_DRAW_TOOLS` do js/mesa-core.js. Serve
 * de porta de entrada: traco de ferramenta desconhecida nao entra em
 * `_strokes` — e o caso dos rotulos de `text` de cenas gravadas entre as
 * Etapas 123 e 125, ja sem ferramenta desde a Etapa 126. Sem esta porta eles
 * ficariam na memoria sem pintar nada: invisiveis, inalcancaveis pela
 * borracha e ocupando o teto de tracos, e a cena divergiria do que o Worker
 * grava. */
const DRAW_RENDERABLE_TOOLS = new Set(["pencil", "line", "rect", "circle", "cone", "arrow"]);

function _isDrawableStroke(stroke) {
  if (!stroke || typeof stroke !== "object") return false;
  const tool = typeof stroke.tool === "string" ? stroke.tool : "";
  // Traco NOMEANDO uma ferramenta que este modulo nao desenha fica de fora.
  // Traco sem `tool` continua entrando como sempre entrou: quem decide o que
  // e forma valida na cena e a whitelist do Worker, nao esta porta.
  return !tool || DRAW_RENDERABLE_TOOLS.has(tool);
}

function _asSharedStroke(stroke) {
  return stroke && stroke.layer !== "tokens" ? { ...stroke, layer: "tokens" } : stroke;
}

function _asSharedStrokes(list) {
  return (Array.isArray(list) ? list : [])
    .filter(_isDrawableStroke)
    .map(_asSharedStroke);
}

/* ── Autoria do traço (Etapa 76) ───────────────────────────────────
 * O quadro continua ÚNICO e compartilhado, mas apagar deixou de ser
 * coletivo: cada traço carrega quem o desenhou (`author`, = username),
 * e a borracha / Ctrl+Z do jogador só alcançam os próprios traços.
 * Antes, a borracha de um jogador limpava o desenho tático do mestre
 * no meio do combate — o quadro era compartilhado até para destruir.
 *
 * O mestre continua alcançando qualquer traço com a borracha (precisa
 * poder limpar rabisco alheio sem apagar o quadro inteiro) e é o único
 * com o "Limpar tudo".
 *
 * Traço antigo, gravado antes desta etapa, não tem `author`. Ele é
 * tratado como ÓRFÃO: só o mestre apaga. Assim ninguém perde acesso ao
 * que já desenhou e nenhum jogador ganha poder sobre traço alheio.
 */
function _drawAuthorKey() {
  const session = window.AUTH?.getSession?.();
  return String(session?.username || "").trim().toLowerCase();
}

function _canEraseStroke(stroke) {
  if (typeof isMaster === "function" && isMaster()) return true;
  const author = String(stroke?.author || "").trim().toLowerCase();
  if (!author) return false;              // órfão: só o mestre
  return author === _drawAuthorKey();
}

const PALETTE = [
  "#e84040", "#f0663a", "#e86820", "#e8a020", "#e8c020", "#c8d820",
  "#8ac926", "#40c860", "#22b8a0", "#40b8e8", "#4058e8", "#7a52e0",
  "#a040e8", "#e840a0", "#f07a9a", "#8b5a2b", "#c9a227", "#ffffff",
  "#cccccc", "#888888", "#555555", "#111111"
];

/* ── Opacidade por traco (Etapa 122) ───────────────────────────────
 * A transparencia NAO virou campo novo: ela viaja dentro da propria cor,
 * em hex de 8 digitos (#rrggbbaa). O Worker ja aceitava esse formato
 * (`/^#[0-9a-f]{3,8}$/i` em normalizeSceneDrawing), entao opacidade
 * atravessa realtime, cena e F5 sem uma linha de backend nem deploy.
 * Campo novo exigiria mudar o contrato da cena e derrubaria a cor de
 * quem estivesse com o cliente antigo. */
const DRAW_ALPHA_MIN = 0.1;
// Traco antigo (cor de 6 digitos) continua com o alfa fixo historico: sem
// isto, todo desenho ja existente ficaria opaco de uma hora para outra.
const DRAW_LEGACY_ALPHA = 0.88;
let _drawAlpha = 1;

function _hexAlpha(alpha) {
  const v = Math.round(Math.max(DRAW_ALPHA_MIN, Math.min(1, alpha)) * 255);
  return v.toString(16).padStart(2, "0");
}

/** Cor que vai para o traco: com alfa embutido so quando nao e opaca. */
function _composeStrokeColor() {
  const base = /^#[0-9a-f]{6}$/i.test(_drawColor) ? _drawColor : "#e84040";
  return _drawAlpha >= 0.999 ? base : base + _hexAlpha(_drawAlpha);
}

/** Alfa de canvas para um traco ja existente. */
function _strokeBaseAlpha(color) {
  return /^#[0-9a-f]{8}$/i.test(String(color || "")) ? 1 : DRAW_LEGACY_ALPHA;
}

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
  _restoreDrawings();
  _bindDrawingsPresence();

  // A partir daqui o desenho existe de verdade. O botao nasce `disabled` no
  // mesa.html justamente para nao mentir durante o boot: enquanto os
  // listeners nao estao no canvas, clicar no lapis nao faria nada e o
  // usuario nao teria como saber. `data-draw-ready` no wrap e o gancho de
  // teste e de CSS para o mesmo fato.
  const toggle = document.getElementById("mesaDrawToggleBtn");
  if (toggle) {
    toggle.disabled = false;
    toggle.dataset.armed = "1";   // contrato da Etapa 82
  }
  document.getElementById("mesaStageWrap")?.setAttribute("data-draw-ready", "true");
}

// ── Persistência local dos traços ──────────────────────────────────
// Sem isto, os desenhos vivem só em memória: qualquer reload perde tudo e
// quem entra depois nunca vê o que já foi desenhado.
const MESA_DRAWINGS_STORAGE_KEY = "mesa_drawings_v1";

// true quando a cena oficial (GET /mesa/scene ou snapshot local dela) já
// forneceu o campo `drawings` — nesse caso a cena é a fonte de verdade e o
// restore do localStorage antigo não deve sobrescrevê-la.
let _sceneDrawingsApplied = false;

function _persistDrawings() {
  try {
    localStorage.setItem(MESA_DRAWINGS_STORAGE_KEY, JSON.stringify(_strokes));
  } catch {}
}

function _readLocalDrawings() {
  try {
    const saved = JSON.parse(localStorage.getItem(MESA_DRAWINGS_STORAGE_KEY) || "[]");
    return _asSharedStrokes(saved);
  } catch {
    return [];
  }
}

function _restoreDrawings() {
  if (_sceneDrawingsApplied) return; // cena oficial já mandou os traços
  const saved = _readLocalDrawings();
  if (saved.length) {
    _strokes = saved;
    renderDrawings();
  }
}

// Desenhos embutidos na cena oficial (Etapa 38). Chamado por
// applyMesaSceneSnapshot no boot e em snapshots remotos — pode rodar ANTES de
// initMesaDrawing (renderDrawings é no-op sem canvas; o init renderiza depois).
// Cenas antigas sem o campo (undefined) mantêm o restore local como fallback.
function applyMesaSceneDrawingsFromSnapshot(drawings) {
  if (!Array.isArray(drawings)) return;
  _sceneDrawingsApplied = true;

  // Camada única: a cena é a fonte de verdade para todo mundo, sem ramo
  // separado para o mestre (Etapa 73).
  _strokes = _asSharedStrokes(drawings);
  _persistDrawings();
  renderDrawings();
}
window.applyMesaSceneDrawingsFromSnapshot = applyMesaSceneDrawingsFromSnapshot;

// Mestre reenvia o snapshot de desenhos quando um jogador novo aparece na
// presença (jogador que entra depois não recebe nada retroativo do DO).
function _bindDrawingsPresence() {
  if (!window.APP?.on) return;
  let knownNames = new Set();
  const handle = payload => {
    const users = Array.isArray(payload?.online?.users) ? payload.online.users : [];
    const names = new Set(
      users.filter(u => u.role !== "master")
        .map(u => String(u.username || "").toLowerCase())
        .filter(Boolean)
    );
    const hasNewcomer = [...names].some(name => !knownNames.has(name));
    knownNames = names;
    if (hasNewcomer && typeof isMaster === "function" && isMaster() && _strokes.length) {
      _broadcastDrawings();
    }
  };
  window.APP.on("mesa:ready", handle);
  window.APP.on("mesa:presence", handle);
}

// ── Resize canvas para cobrir o stageInner ─────────────────────────
function _resizeDrawCanvas() {
  if (!_drawCanvasEl || !_stageInnerEl) return;
  const w   = _stageInnerEl.offsetWidth;
  const h   = _stageInnerEl.offsetHeight;
  if (!w || !h) return;
  // Escala de EXIBIÇÃO (densidade x zoom de palco) — ver Etapa 58.
  const dpr = typeof window.getMesaRenderScale === "function"
    ? window.getMesaRenderScale(w, h)
    : (window.devicePixelRatio || 1);

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

  // Exclusão mútua (Etapa 74): com uma ferramenta de desenho armada, a mão e a
  // seleção por área saem do ar. Antes os dois ficavam acesos ao mesmo tempo e
  // o mesmo arrasto queria desenhar E arrastar o palco.
  if (_activeTool && typeof window.clearMesaInteractionMode === "function") {
    window.clearMesaInteractionMode();
  }

  // itens do flyout
  document.querySelectorAll("[data-draw-tool]").forEach(btn => {
    const active = btn.dataset.drawTool === _activeTool;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  // ponto indicador no botão toggle
  const toggleBtn = document.getElementById("mesaDrawToggleBtn");
  if (toggleBtn) toggleBtn.classList.toggle("has-active-tool", Boolean(_activeTool));

  // painel de opções dentro do flyout: oculta para borracha e sem ferramenta
  const opts = document.getElementById("mesaDrawOptions");
  if (opts) opts.hidden = !_activeTool || _activeTool === "eraser";

  // Uma marca só no wrap manda em tudo (cursor, z-index e captura do ponteiro
  // do canvas) — ver css/mesa-drawing.css. Antes o pointer-events ia inline no
  // canvas e não adiantava nada: o container dos tokens ficava por cima.
  const wrap = document.getElementById("mesaStageWrap");
  if (wrap) {
    if (_activeTool) wrap.setAttribute("data-draw-active", _activeTool === "eraser" ? "eraser" : "true");
    else wrap.removeAttribute("data-draw-active");
  }
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
  // Arredondado já na captura: é a mesma precisão que o Worker salva, então
  // nada se perde e o payload encolhe ~2,4x (ver bloco de limites acima).
  return { px: _round4(x / w), py: _round4(y / h) };
}

function _fromPercent(px, py) {
  const w = _drawCanvasEl ? (_drawCanvasEl.offsetWidth  || 1) : 1;
  const h = _drawCanvasEl ? (_drawCanvasEl.offsetHeight || 1) : 1;
  return { x: px * w, y: py * h };
}

/* ── Eventos de desenho: Pointer Events (Etapa 129) ────────────────
 * Eram mouse events, e no tablet o desenho simplesmente nao existia: o
 * navegador nao emite `mousedown` para o dedo antes de decidir que o gesto
 * NAO e rolagem, e quando emite (compatibilidade) o traco ja perdeu o comeco.
 * Pointer Events cobrem mouse, dedo e caneta com um handler so.
 *
 * Tres cuidados que o mouse nao exigia:
 *
 * 1. `setPointerCapture` — o dedo sai do canvas no meio do traco (o palco e
 *    menor que o gesto) e sem captura os eventos param de chegar.
 * 2. `preventDefault()` no pointerdown — alem de impedir a rolagem, e o que
 *    SUPRIME os eventos de mouse de compatibilidade. Sem isso o `mousedown`
 *    sintetico do navegador subia ate o palco e o pan do mapa comecava junto
 *    com o traco (o `stopPropagation` daqui nao alcanca evento sintetico).
 * 3. UM ponteiro por vez — o segundo dedo nao inicia um segundo traco; ele e
 *    o comeco de um gesto de pinca (ver mesa-map.js), que ABORTA o traco. */
let _drawPointerId = null;

function _bindDrawEvents() {
  if (!_drawCanvasEl) return;

  _drawCanvasEl.addEventListener("pointerdown", _onDrawStart);
  window.addEventListener("pointermove",  _onDrawMove);
  window.addEventListener("pointerup",    _onDrawEnd);
  // O navegador cancela o ponteiro quando decide que o gesto e dele (rolagem,
  // pinca do sistema). Traco pela metade nao vira desenho: e descartado.
  window.addEventListener("pointercancel", _abortarDesenhoAtual);

  // Clique direito cancela a ferramenta atual
  _drawCanvasEl.addEventListener("contextmenu", e => {
    e.preventDefault();
    setDrawTool(null);
  });

  // Tecla Escape cancela ferramenta + fecha flyout
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (_activeTool) {
        _isDrawing    = false;
        _activeStroke = null;
        setDrawTool(null);
        renderDrawings();
      }
      _closeFlyout();
    }
    // Ctrl+Z: desfaz o PRÓPRIO último traço (Etapa 76). Antes desfazia o
    // último do quadro, fosse de quem fosse — um jogador apagava o traço
    // que o mestre acabou de fazer só apertando Ctrl+Z.
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey && _strokes.length) {
      const me = _drawAuthorKey();
      let index = -1;
      for (let i = _strokes.length - 1; i >= 0; i -= 1) {
        if (String(_strokes[i]?.author || "").trim().toLowerCase() === me) { index = i; break; }
      }
      if (index === -1) return;   // nada meu para desfazer
      const [undone] = _strokes.splice(index, 1);
      renderDrawings();
      _commitStrokeRemove([undone]);
    }
  });
}

function _onDrawStart(e) {
  if (!_activeTool || e.button !== 0 || !e.isPrimary) return;
  // Um traco por vez: com um ponteiro ja desenhando, o segundo e gesto de
  // camera, nao tinta.
  if (_drawPointerId !== null) return;
  e.stopPropagation();
  // Ver o bloco de _bindDrawEvents: isto tambem mata o mousedown sintetico
  // que faria o palco panar junto com o traco.
  e.preventDefault();
  _drawPointerId = e.pointerId;
  try { _drawCanvasEl.setPointerCapture(e.pointerId); } catch { /* ponteiro ja solto */ }
  _isDrawing = true;
  window._mesaStagePanMoved = true; // impede deselect de token

  const pos = _canvasPos(e);
  const { px, py } = _toPercent(pos.x, pos.y);

  if (_activeTool === "eraser") {
    _iniciarSessaoBorracha();
    _eraseAt(pos.x, pos.y);
    return;
  }

  _activeStroke = {
    id:     Math.random().toString(36).slice(2),
    tool:   _activeTool,
    color:  _composeStrokeColor(),
    width:  _drawWidth,
    // Camada única, compartilhada por mestre e jogadores (Etapa 73).
    layer:  "tokens",
    // Autor do traço (Etapa 76): define quem pode apagá-lo.
    author: _drawAuthorKey(),
    x1: px, y1: py,
    x2: px, y2: py,
    points: _activeTool === "pencil" ? [[px, py]] : null
  };
}

function _onDrawMove(e) {
  if (!_isDrawing) return;
  if (_drawPointerId !== null && e.pointerId !== _drawPointerId) return;

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
    const pts = _activeStroke.points;
    // Ralo: o mousemove dispara muito mais que o necessário; pontos a menos de
    // DRAW_MIN_POINT_DIST não mudam o traço na tela e só inflam o payload.
    const last = pts[pts.length - 1];
    if (last && Math.hypot(px - last[0], py - last[1]) < DRAW_MIN_POINT_DIST) return;
    // Cap igual ao do Worker: sem ele, o traço na tela teria mais pontos do que
    // o traço salvo e o desenho "mudaria sozinho" no próximo reload.
    //
    // Etapa 122: bater no teto nao para mais o traço. Primeiro tentamos
    // RAREAR os pontos que nao mudam a forma (ver _simplifyPoints); cada
    // rodada usa uma tolerancia maior que a anterior. So quando nem isso
    // abre espaco util e que a tinta acaba de verdade.
    if (pts.length >= DRAW_MAX_POINTS && !_aliviarPontos(_activeStroke)) return;
    pts.push([px, py]);
  }
  renderDrawings();
}

/**
 * Rareia o traço em curso para caber mais movimento. Devolve true quando
 * abriu espaço util (>= 10% do teto), false quando nao ha mais o que tirar.
 */
/** Solta a captura do ponteiro do traco. Idempotente. */
function _soltarPonteiroDoDesenho() {
  if (_drawPointerId === null) return;
  try { _drawCanvasEl?.releasePointerCapture(_drawPointerId); } catch { /* ja solto */ }
  _drawPointerId = null;
}

/* Aborta o traco em curso SEM gravar.
 *
 * Dois caminhos chegam aqui: o `pointercancel` do navegador e o gesto de
 * pinca do mesa-map.js, que chama isto pelo `window` quando o segundo dedo
 * encosta. Descartar e o certo: metade de um traco que o usuario nem quis
 * ficaria no quadro de todo mundo. */
function _abortarDesenhoAtual() {
  if (!_isDrawing && !_activeStroke) { _soltarPonteiroDoDesenho(); return; }
  _soltarPonteiroDoDesenho();
  _isDrawing = false;
  _activeStroke = null;
  if (_activeTool === "eraser") _fecharSessaoBorracha();
  renderDrawings();
  setTimeout(() => { window._mesaStagePanMoved = false; }, 0);
}
window.mesaAbortDrawingGesture = _abortarDesenhoAtual;

function _aliviarPontos(stroke) {
  if (!stroke || !Array.isArray(stroke.points)) return false;
  const antes = stroke.points.length;
  stroke._alivio = (stroke._alivio || 0) + 1;
  const epsilon = DRAW_SIMPLIFY_EPS * Math.pow(1.8, stroke._alivio - 1);
  const rarefeito = _simplifyPoints(stroke.points, epsilon);
  if (antes - rarefeito.length < DRAW_MAX_POINTS * 0.1) return false;
  stroke.points = rarefeito;
  return true;
}

function _onDrawEnd(e) {
  if (!_isDrawing) return;
  if (e && _drawPointerId !== null && e.pointerId !== _drawPointerId) return;
  _soltarPonteiroDoDesenho();
  _isDrawing = false;
  setTimeout(() => { window._mesaStagePanMoved = false; }, 0);

  // Borracha: um unico commit com tudo o que o arrasto inteiro mexeu.
  if (_activeTool === "eraser") {
    _fecharSessaoBorracha();
    return;
  }

  if (_activeStroke && _activeTool !== "eraser") {
    // Lápis: garantir pelo menos 2 pontos (evita ponto sem renderizar)
    if (_activeTool === "pencil") {
      const pts = _activeStroke.points;
      if (pts.length === 1) pts.push([_round4(pts[0][0] + 0.001), _round4(pts[0][1] + 0.001)]);
      // Passada final de economia: tira o que nao muda a forma antes de
      // gravar e transmitir. Menos bytes no fio e na cena, mesmo desenho.
      if (pts.length > 2) {
        const enxuto = _simplifyPoints(pts, DRAW_SIMPLIFY_EPS);
        if (enxuto.length >= 2) _activeStroke.points = enxuto;
      }
      // Campo de trabalho: nao pode viajar no payload nem entrar na cena.
      delete _activeStroke._alivio;
    }
    if (_strokes.length >= DRAW_MAX_STROKES) {
      window.UI?.toast?.(
        `Limite de ${DRAW_MAX_STROKES} traços — use a borracha ou limpe o quadro.`,
        { kicker: "// Mesa" }
      );
      _activeStroke = null;
      renderDrawings();
      return;
    }
    const stroke = _activeStroke;
    _strokes.push(stroke);
    _commitStrokeAdd(stroke);
  }

  _activeStroke = null;
  renderDrawings();
}

// ── Borracha ───────────────────────────────────────────────────────
// Só apaga o que o ator tem direito de apagar (Etapa 76): jogador alcança
// os próprios traços, mestre alcança todos. Traço alheio sob o cursor é
// simplesmente ignorado — a borracha passa por cima sem efeito.
/* ── Borracha de verdade (Etapa 122) ───────────────────────────────
 * Antes, encostar num traço apagava o traço INTEIRO: um risco de dez
 * segundos sumia porque a borracha tocou a ponta dele. Agora ela apaga
 * so o pedaço tocado e o que sobra vira um ou dois traços novos — o
 * comportamento que todo mundo espera de uma borracha.
 *
 * Vale so para o lápis: partir um retângulo ou uma elipse nao produz uma
 * forma, produz lixo. Forma continua saindo inteira.
 *
 * O commit acontece no FIM do arrasto, nao a cada mousemove: partir a
 * cada quadro geraria dezenas de mensagens por segundo e o Durable Object
 * recusaria em silêncio (o defeito da Etapa 50). Durante o arrasto tudo é
 * local; ao soltar, sai UM remove com todos os ids e um add por pedaço.
 */
let _eraseSession = null;

function _iniciarSessaoBorracha() {
  _eraseSession = { removidos: new Map(), criados: new Map() };
}

function _registrarRemocao(stroke) {
  if (!_eraseSession) return;
  const id = String(stroke.id);
  // Pedaço criado nesta mesma sessão e apagado em seguida nunca existiu
  // para os outros clientes: cancela em vez de transmitir add + remove.
  if (_eraseSession.criados.has(id)) _eraseSession.criados.delete(id);
  else _eraseSession.removidos.set(id, stroke);
}

function _registrarCriacao(stroke) {
  if (_eraseSession) _eraseSession.criados.set(String(stroke.id), stroke);
}

function _fecharSessaoBorracha() {
  const sessao = _eraseSession;
  _eraseSession = null;
  if (!sessao) return;

  const removidos = [...sessao.removidos.values()];
  const criados   = [...sessao.criados.values()];
  if (!removidos.length && !criados.length) return;

  if (removidos.length) _commitStrokeRemove(removidos);
  criados.forEach(_commitStrokeAdd);
  if (!removidos.length) _persistDrawingsAndScene();
}

/**
 * Corta de um traço de lápis os pontos sob a borracha. Devolve os pedaços
 * que sobraram (0, 1 ou mais), cada um com id proprio.
 */
function _cortarPontos(stroke, mx, my) {
  const raio = ERASE_RADIUS;
  const pedacos = [];
  let atual = [];

  stroke.points.forEach(([px, py]) => {
    const { x, y } = _fromPercent(px, py);
    if (Math.hypot(x - mx, y - my) < raio) {
      if (atual.length >= 2) pedacos.push(atual);
      atual = [];
      return;
    }
    atual.push([px, py]);
  });
  if (atual.length >= 2) pedacos.push(atual);

  return pedacos.map(pontos => ({
    ...stroke,
    id: Math.random().toString(36).slice(2),
    points: pontos
  }));
}

function _eraseAt(x, y) {
  const alvos = _strokes.filter(s => _hitTest(s, x, y) && _canEraseStroke(s));
  if (!alvos.length) return;

  const removidos = new Set();
  const novos = [];

  alvos.forEach(stroke => {
    removidos.add(String(stroke.id));
    _registrarRemocao(stroke);
    if (stroke.tool !== "pencil" || !Array.isArray(stroke.points)) return;
    _cortarPontos(stroke, x, y).forEach(pedaco => {
      novos.push(pedaco);
      _registrarCriacao(pedaco);
    });
  });

  _strokes = _strokes.filter(s => !removidos.has(String(s.id)));
  // O teto de traços vale igual aqui: partir muito um desenho denso poderia
  // multiplicar traços sem limite.
  const cabe = Math.max(0, DRAW_MAX_STROKES - _strokes.length);
  novos.slice(0, cabe).forEach(pedaco => _strokes.push(pedaco));
  renderDrawings();
}

function _hitTest(s, mx, my) {
  const r = ERASE_RADIUS;

  if (s.tool === "pencil") {
    return s.points.some(([px, py]) => {
      const { x, y } = _fromPercent(px, py);
      return Math.hypot(x - mx, y - my) < r;
    });
  }

  const { x: x1, y: y1 } = _fromPercent(s.x1, s.y1);
  const { x: x2, y: y2 } = _fromPercent(s.x2, s.y2);

  // Cone e seta: o alvo e a linha origem->ponta, nao o retangulo em volta.
  if (s.tool === "cone" || s.tool === "arrow") {
    const dx = x2 - x1, dy = y2 - y1;
    const comp2 = dx * dx + dy * dy;
    const t = comp2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / comp2));
    return Math.hypot(x1 + t * dx - mx, y1 + t * dy - my) < r + (s.tool === "cone" ? 12 : 0);
  }

  // Demais formas: centro + borda aproximada
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

  // Camada única: todo mundo vê os mesmos traços (Etapa 73).
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
  // Cor com alfa embutido (8 digitos) ja carrega a transparencia; cor antiga
  // (6 digitos) mantem o alfa fixo historico.
  const alfaBase  = _strokeBaseAlpha(s.color);
  ctx.globalAlpha = alfaBase;

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
      ctx.globalAlpha = alfaBase * 0.15;
      ctx.fill();
      ctx.globalAlpha = alfaBase;
      ctx.stroke();
      break;
    }

    case "cone": {
      // Triangulo com a ponta na origem: o arrasto define direcao e alcance.
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const alcance = Math.hypot(x2 - x1, y2 - y1);
      const a1 = ang - CONE_HALF_ANGLE;
      const a2 = ang + CONE_HALF_ANGLE;
      // Lado do triangulo, nao o raio: sem isso o cone fica curto demais
      // perto da borda arrastada.
      const lado = alcance / Math.cos(CONE_HALF_ANGLE);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + Math.cos(a1) * lado, y1 + Math.sin(a1) * lado);
      ctx.lineTo(x1 + Math.cos(a2) * lado, y1 + Math.sin(a2) * lado);
      ctx.closePath();
      ctx.globalAlpha = alfaBase * 0.15;
      ctx.fill();
      ctx.globalAlpha = alfaBase;
      ctx.stroke();
      break;
    }

    case "arrow": {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const comprimento = Math.hypot(x2 - x1, y2 - y1);
      const cabeca = Math.max(ARROW_HEAD_MIN, Math.min(comprimento * 0.3, s.width * 4 + 8));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(ang - 0.45) * cabeca, y2 - Math.sin(ang - 0.45) * cabeca);
      ctx.lineTo(x2 - Math.cos(ang + 0.45) * cabeca, y2 - Math.sin(ang + 0.45) * cabeca);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case "circle": {
      const radiusX = Math.abs(x2 - x1) / 2;
      const radiusY = Math.abs(y2 - y1) / 2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(radiusX, 1), Math.max(radiusY, 1), 0, 0, Math.PI * 2);
      ctx.globalAlpha = alfaBase * 0.15;
      ctx.fill();
      ctx.globalAlpha = alfaBase;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ── Limpar tudo ────────────────────────────────────────────────────
// Master-only (Etapa 76): é a única ação que zera traço dos outros.
function clearAllDrawings() {
  if (typeof requireMesaMaster === "function"
      && !requireMesaMaster("draw.clearAll", "limpar o quadro inteiro")) return;
  _strokes = [];
  renderDrawings();
  _broadcastDrawings();
}

// ── Deletar strokes por ID ─────────────────────────────────────────
function deleteDrawingsById(ids) {
  const idSet = new Set(ids.map(String));
  const removed = _strokes.filter(s => idSet.has(String(s.id)) && _canEraseStroke(s));
  if (!removed.length) return;
  const removedIds = new Set(removed.map(s => String(s.id)));
  _strokes = _strokes.filter(s => !removedIds.has(String(s.id)));
  renderDrawings();
  _commitStrokeRemove(removed);
}

// ── Sync externo ───────────────────────────────────────────────────
/**
 * Estado COMPLETO vindo da rede. Só vale vindo do mestre (Etapa 76).
 *
 * O Durable Object não conhece a cena, então não consegue julgar traço a
 * traço — a posse é validada no consumidor, mesmo padrão já usado para o
 * movimento de token alheio. Sem esta checagem, um jogador que emitisse
 * `mesa:drawings:update` com lista vazia apagava o quadro de todos, o que
 * justamente a decisão desta etapa proíbe.
 *
 * `actor` ausente = origem local (boot, restore da cena), que é confiável.
 */
function setDrawingsFromRemote(strokes, actor) {
  if (actor && String(actor.role || "") !== "master") return;
  _strokes = _asSharedStrokes(strokes);
  _persistDrawings();
  renderDrawings();
}

// Chega um traço solto de outro cliente (mesa:drawings:add). Idempotente: um
// id já conhecido é ignorado, então reenvio/duplicata não desenha duas vezes.
function applyMesaDrawingAddFromRemote(stroke) {
  // Mesma porta do snapshot: ferramenta que este modulo nao desenha nao entra.
  if (!_isDrawableStroke(stroke)) return;
  const id = String(stroke.id || "");
  if (!id || _strokes.some(s => String(s.id) === id)) return;
  if (_strokes.length >= DRAW_MAX_STROKES) return;
  _strokes.push(_asSharedStroke(stroke));
  _persistDrawings();
  renderDrawings();
}

/**
 * Chega uma remoção de outro cliente (mesa:drawings:remove).
 *
 * Etapa 76: a remoção é aplicada só aos traços que o AUTOR da mensagem
 * podia mesmo apagar — mestre remove qualquer um; jogador, apenas os
 * próprios. Validação de posse no consumidor porque o DO não conhece a
 * cena (mesmo padrão do movimento de token alheio). Sem isto, a regra
 * "cada um apaga só o seu" valeria só para quem usa a interface: bastava
 * mandar os ids alheios na mão pelo socket.
 */
function applyMesaDrawingRemoveFromRemote(ids, actor) {
  if (!Array.isArray(ids) || !ids.length) return;
  const idSet = new Set(ids.map(String));
  const actorIsMaster = !actor || String(actor.role || "") === "master";
  const actorKey = String(actor?.username || "").trim().toLowerCase();

  const before = _strokes.length;
  _strokes = _strokes.filter(s => {
    if (!idSet.has(String(s.id))) return true;
    if (actorIsMaster) return false;                        // mestre remove
    const author = String(s.author || "").trim().toLowerCase();
    return !(author && actorKey && author === actorKey);    // jogador: só o dele
  });
  if (_strokes.length === before) return;
  _persistDrawings();
  renderDrawings();
}

function getDrawingsSnapshot() {
  return _strokes.slice();
}

// Persiste local + cena oficial. Comum aos três caminhos de mutação.
function _persistDrawingsAndScene() {
  _persistDrawings();
  // Cena oficial ganha os traços: mestre persiste no backend; jogador atualiza
  // o snapshot local (o traço dele vira oficial quando o mestre receber o
  // delta e persistir).
  if (typeof persistState === "function") persistState();
}

// Traço recém-fechado → viaja sozinho para todo mundo (camada única).
function _commitStrokeAdd(stroke) {
  if (stroke && typeof sendMesaRealtimeDelta === "function") {
    sendMesaRealtimeDelta("mesa:drawings:add", { stroke });
  }
  _persistDrawingsAndScene();
}

// Borracha/desfazer/deleção → só os ids.
function _commitStrokeRemove(strokes) {
  const ids = (Array.isArray(strokes) ? strokes : [])
    .filter(Boolean)
    .map(s => String(s.id || ""))
    .filter(Boolean);
  if (ids.length && typeof sendMesaRealtimeDelta === "function") {
    sendMesaRealtimeDelta("mesa:drawings:remove", { ids });
  }
  _persistDrawingsAndScene();
}

// Estado completo. Sobrou para dois casos: limpar o quadro (payload vazio) e o
// reenvio a quem entra depois. Acima do teto de segurança o envio é PULADO — o
// jogador que entra recebe os traços pelo GET /mesa/scene de qualquer forma, e
// mandar assim mesmo só faria o DO recusar em silêncio (o bug da Etapa 50).
function _broadcastDrawings() {
  _persistDrawings();
  if (typeof sendMesaRealtimeDelta === "function") {
    const drawings = _strokes;
    if (JSON.stringify(drawings).length <= DRAW_FULL_STATE_MAX_CHARS) {
      sendMesaRealtimeDelta("mesa:drawings:update", { drawings });
    }
  }
  if (typeof persistState === "function") {
    persistState();
  }
}

// ── Flyout toggle ──────────────────────────────────────────────────
let _flyoutOpen = false;

function _openFlyout() {
  const flyout  = document.getElementById("mesaDrawFlyout");
  const toggleBtn = document.getElementById("mesaDrawToggleBtn");
  if (!flyout) return;

  // Posiciona o flyout alinhado ao botão toggle
  if (toggleBtn) {
    const tbRect = toggleBtn.getBoundingClientRect();
    const canvasRect = document.getElementById("mesaPanelStage")?.getBoundingClientRect() || { top: 0 };
    flyout.style.top = (tbRect.top - canvasRect.top) + "px";
  }

  flyout.hidden   = false;
  _flyoutOpen     = true;
  if (toggleBtn) {
    toggleBtn.classList.add("is-open");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
}

function _closeFlyout() {
  const flyout    = document.getElementById("mesaDrawFlyout");
  const toggleBtn = document.getElementById("mesaDrawToggleBtn");
  if (flyout) flyout.hidden = true;
  _flyoutOpen = false;
  if (toggleBtn) {
    toggleBtn.classList.remove("is-open");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
}

function _toggleFlyout() {
  _flyoutOpen ? _closeFlyout() : _openFlyout();
}

// ── Bind botões da toolbar ─────────────────────────────────────────
function _bindToolbarButtons() {
  // Botão toggle da caneta
  const toggleBtn = document.getElementById("mesaDrawToggleBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", e => {
      e.stopPropagation();
      _toggleFlyout();
    });
  }

  // Itens do flyout — selecionar ferramenta
  document.querySelectorAll("[data-draw-tool]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      setDrawTool(btn.dataset.drawTool);
      // Não fecha o flyout: usuário pode trocar de ferramenta
    });
  });

  /* O painel NAO fecha ao clicar fora (Etapa 122).
   *
   * Ate aqui, qualquer clique fora dele fechava — e desenhar e clicar fora.
   * Ou seja: cada traco terminado fechava o painel, e trocar de cor ou de
   * grossura exigia reabrir tudo de novo. Para uma ferramenta de uso
   * continuo isso e o oposto do util.
   *
   * Agora o painel e um interruptor honesto: abre e fecha no proprio botao
   * da caneta. Escape continua fechando (saida de teclado, e um gesto
   * deliberado, nao um clique acidental no palco), e escolher a mao ou a
   * selecao tambem fecha — desenho e selecao sao mutuamente exclusivos
   * (mesa-select.js chama _closeFlyout na troca).
   */

  // Limpar tudo
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

    swatch.addEventListener("click", () => _aplicarCor(color));
    container.appendChild(swatch);
  });

  // Cor livre (Etapa 122): tres botoes de grossura viraram controle
  // continuo, e a paleta ganhou um seletor de cor ao lado.
  const custom = document.getElementById("mesaDrawColorCustom");
  if (custom) {
    custom.value = /^#[0-9a-f]{6}$/i.test(_drawColor) ? _drawColor : "#e84040";
    custom.addEventListener("input", () => _aplicarCor(custom.value, { daPaleta: false }));
  }

  const widthEl = document.getElementById("mesaDrawWidth");
  const widthOut = document.getElementById("mesaDrawWidthOut");
  if (widthEl) {
    widthEl.value = String(_drawWidth);
    if (widthOut) widthOut.textContent = String(_drawWidth);
    widthEl.addEventListener("input", () => {
      // O teto de 12 e o do Worker (clamp em normalizeSceneDrawing): passar
      // disso desenharia grosso na tela e voltaria fino depois do F5.
      _drawWidth = Math.max(1, Math.min(12, Number(widthEl.value) || 1));
      if (widthOut) widthOut.textContent = String(_drawWidth);
      _atualizarPreviewCor();
    });
  }

  const alphaEl = document.getElementById("mesaDrawAlpha");
  const alphaOut = document.getElementById("mesaDrawAlphaOut");
  if (alphaEl) {
    alphaEl.value = String(Math.round(_drawAlpha * 100));
    alphaEl.addEventListener("input", () => {
      _drawAlpha = Math.max(DRAW_ALPHA_MIN, Math.min(1, (Number(alphaEl.value) || 100) / 100));
      if (alphaOut) alphaOut.textContent = Math.round(_drawAlpha * 100) + "%";
      _atualizarPreviewCor();
    });
  }

  _atualizarPreviewCor();
}

/** Preview mostra a cor COM a opacidade e a grossura atuais. */
function _atualizarPreviewCor() {
  const preview = document.getElementById("mesaDrawColorPreview");
  if (!preview) return;
  preview.style.background = _composeStrokeColor();
  preview.style.setProperty("--preview-width", _drawWidth + "px");
  preview.title = `Cor ${_drawColor} - ${Math.round(_drawAlpha * 100)}% - ${_drawWidth}px`;
}

function _aplicarCor(color, { daPaleta } = { daPaleta: true }) {
  if (!/^#[0-9a-f]{6}$/i.test(String(color))) return;
  _drawColor = String(color).toLowerCase();
  document.querySelectorAll(".draw-swatch").forEach(sw =>
    sw.classList.toggle("is-active", daPaleta && sw.title === _drawColor)
  );
  const custom = document.getElementById("mesaDrawColorCustom");
  if (custom && custom.value.toLowerCase() !== _drawColor) custom.value = _drawColor;
  _atualizarPreviewCor();
}
