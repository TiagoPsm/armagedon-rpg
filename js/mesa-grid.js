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
  opacity: 0.18,
  /* Escala da cena (Etapa 131): quanto vale UMA celula no mundo do jogo, em
     metros. Era uma constante de 1,5 m dentro da regua — o que mentia em toda
     cena que nao fosse um combate corpo a corpo: o mesmo mapa servia para uma
     carruagem e para um vale, e a regua respondia a mesma coisa nos dois.
     Mora na grade porque e a MESMA unidade: a celula e o que a regua conta. */
  metersPerCell: 1.5
});
const MESA_GRID_METERS_MIN = 0.1;
const MESA_GRID_METERS_MAX = 5000;

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
    opacity: Math.round(clampNum(grid.opacity, 0.05, 0.8, MESA_GRID_DEFAULTS.opacity) * 100) / 100,
    // Cena antiga nao tem o campo: cai nos 1,5 m historicos, e nada muda.
    metersPerCell: Math.round(clampNum(grid.metersPerCell, MESA_GRID_METERS_MIN, MESA_GRID_METERS_MAX,
      MESA_GRID_DEFAULTS.metersPerCell) * 100) / 100
  };
}

/* ── ESTADO / CONTRATO DA CENA ──────────────────────────────── */

function getMesaGridState() {
  return { ..._gridState };
}

// Consumido por createMesaScenePayloadFromState (mesa-core.js). Grade toda
// desligada vira null — cenas antigas e o dedupe de assinatura não mudam.
function getMesaGridScenePayload() {
  // Grade desligada mas escala mudada ainda precisa viajar (Etapa 131): a
  // regua vale com ou sem grade desenhada, e perder a escala no F5 seria o
  // mesmo defeito de antes com outra roupa.
  const escalaPadrao = _gridState.metersPerCell === MESA_GRID_DEFAULTS.metersPerCell;
  if (!_gridState.enabled && !_gridState.snap && escalaPadrao) return null;
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
  const w = _gridStageEl.offsetWidth;
  const h = _gridStageEl.offsetHeight;
  // Escala de EXIBIÇÃO (densidade x zoom de palco), não só a densidade da
  // tela: a 300% um buffer em 1x seria esticado pelo compositor. Etapa 58.
  const dpr = _gridRenderScale(w, h);
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
/** Escala de rasterização; cai na densidade da tela se mesa-map não carregou. */
function _gridRenderScale(w, h) {
  return typeof window.getMesaRenderScale === "function"
    ? window.getMesaRenderScale(w, h)
    : (window.devicePixelRatio || 1);
}

function renderMesaGrid() {
  if (!_gridCanvasEl || !_gridCtx || !_gridStageEl) return;
  // Deriva a escala do buffer REAL, não recalcula: se o zoom mudou e o
  // resize ainda não rodou, recalcular daria coordenadas fora do canvas.
  const dpr = (_gridCanvasEl.width / Math.max(1, _gridStageEl.offsetWidth)) || 1;
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
  let surfLeft = surface.left * stageW;
  let surfTop  = surface.top  * stageH;
  let surfW    = surface.width  * stageW;
  let surfH    = surface.height * stageH;

  // BORDA RENTE AO PALCO — não remover (Etapa 61).
  // No modo "ajustado" a caixa do palco é a própria imagem, mas os
  // arredondamentos de applyStageFitBox() deixam a superfície uns milésimos
  // fora do palco (left ≈ -0.0004). Em px de buffer isso vale -0,4 px a 100%
  // e -1,2 px a 300%: a linha da borda caía DENTRO do canvas num zoom e FORA
  // no seguinte, e a grade parecia pular uma célula inteira ao ampliar.
  // Diferença abaixo de 1 px de LAYOUT = mesma borda: encosta e pronto. A
  // tolerância acompanha `dpr` porque o resíduo nasce do arredondamento da
  // caixa (px de layout) e vira mais px de buffer conforme o zoom sobe.
  const FLUSH = Math.max(1, dpr);
  if (Math.abs(surfLeft) < FLUSH)               { surfW += surfLeft; surfLeft = 0; }
  if (Math.abs(surfTop)  < FLUSH)               { surfH += surfTop;  surfTop  = 0; }
  if (Math.abs(surfLeft + surfW - cw) < FLUSH)  { surfW = cw - surfLeft; }
  if (Math.abs(surfTop  + surfH - ch) < FLUSH)  { surfH = ch - surfTop; }

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

  // ALINHAMENTO AO PIXEL DE DISPOSITIVO — não remover (Etapa 60).
  // O canvas CENTRA o traço na coordenada. Com lineWidth fracionário (dpr =
  // densidade x zoom) e coordenada fracionária, cada linha se espalhava por 2–3
  // px com um alpha diferente: a grade saía manchada, e como o padrão do
  // antialiasing varre junto com o zoom, ela CINTILAVA ao ampliar. Medido a
  // 100%: alpha de pico entre 91 e 204 na mesma grade.
  //
  // A correção é a receita padrão: espessura inteira + coordenada meio-pixel
  // para espessura ímpar (traço cobre 1 px cheio) e inteira para espessura par
  // (traço cobre 2 px cheios). Custo: o espaçamento arredonda para px inteiro,
  // variando até 1 px entre células — menos do que os 2 px que já variava.
  //
  // ESPESSURA EM PX DE DISPOSITIVO, NÃO DE BUFFER — não remover (Etapa 61).
  // `dpr` aqui é a escala do buffer, que JÁ inclui o zoom de palco (Etapa 58).
  // Usá-lo direto como espessura fazia a linha engordar junto com o zoom (1 px
  // a 100%, 2 a 150%, 3 a 300%) e — pior — virava a PARIDADE da espessura, o
  // que desloca todas as linhas meio pixel e derruba a linha da borda. Era
  // isso que dava a impressão de a grade "andar" ao aplicar e tirar o zoom.
  // Dividindo pelo zoom sobra a densidade da tela: espessura constante e
  // paridade estável em qualquer nível de zoom.
  const zoomEff = Math.max(1, typeof window.getStageZoom === "function" ? window.getStageZoom() : 1);
  const lineW = Math.max(1, Math.round(dpr / zoomEff));
  const snapToDevicePx = v => (lineW % 2 === 1 ? Math.round(v) + 0.5 : Math.round(v));

  _gridCtx.globalAlpha = _gridState.opacity;
  _gridCtx.strokeStyle = _gridState.color;
  _gridCtx.lineWidth   = lineW;
  _gridCtx.beginPath();

  const offsetX = _gridState.offsetXFrac * cellPx;
  const offsetY = _gridState.offsetYFrac * cellPx;
  const startX = surfLeft + offsetX - Math.ceil((surfLeft + offsetX - clipLeft) / cellPx) * cellPx;
  const startY = surfTop  + offsetY - Math.ceil((surfTop  + offsetY - clipTop)  / cellPx) * cellPx;

  // As extremidades também alinham: sem isso o traço fica meio-pixel curto nas
  // pontas e as bordas da grade acendem mais fraco que o miolo.
  const top    = snapToDevicePx(clipTop);
  const bottom = snapToDevicePx(clipBottom);
  const left   = snapToDevicePx(clipLeft);
  const right  = snapToDevicePx(clipRight);

  for (let x = startX; x <= clipRight; x += cellPx) {
    const px = snapToDevicePx(x);
    _gridCtx.moveTo(px, top);
    _gridCtx.lineTo(px, bottom);
  }
  for (let y = startY; y <= clipBottom; y += cellPx) {
    const py = snapToDevicePx(y);
    _gridCtx.moveTo(left, py);
    _gridCtx.lineTo(right, py);
  }
  _gridCtx.stroke();
  _gridCtx.restore();
}

/* ── SNAP-TO-GRID + TAMANHO EM CÉLULAS ──────────────────────── */
// Com a GRADE LIGADA o token vive em múltiplos inteiros de célula (1x1, 2x2,
// 3x3...): o diâmetro é quantizado para N células e o quadrado NxN alinha nas
// linhas da grade (N ímpar centra na célula; N par centra numa interseção).
//
// Etapa 69: o tamanho deixou de depender do checkbox "Encaixar tokens" — com
// grade, tamanho fora da célula não é um estado válido, e o limite passou a
// ser em CÉLULAS (1x1 até metade do menor lado do mapa) em vez de um teto de
// escala fixo. O checkbox continua mandando só na POSIÇÃO ao mover o token.
// Sem grade não há em que encaixar: o resize é contínuo, com o guarda-corpo
// do contrato (MESA_TOKEN_SCALE_MIN/MAX).

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
 * Teto de tamanho do token, em CÉLULAS (Etapa 69).
 *
 * Derivado do mapa, não fixo: metade do menor lado da superfície. Um mapa de
 * 20x14 células deixa o token chegar a 7x7. Assim o limite acompanha a grade
 * — célula menor, mais células disponíveis — e nenhum token pode virar maior
 * que o próprio território.
 */
function _gridMaxCells() {
  const cellPx = _gridCellStagePx();
  if (!(cellPx > 0) || !_gridStageEl) return 1;
  const surface = typeof window.getMesaMapSurfaceFrac === "function"
    ? window.getMesaMapSurfaceFrac()
    : { width: 1, height: 1 };
  const wPx = surface.width  * (_gridStageEl.offsetWidth  || 0);
  const hPx = surface.height * (_gridStageEl.offsetHeight || 0);
  const menorLado = Math.min(wPx, hPx);
  if (!(menorLado > 0)) return 1;
  return Math.max(1, Math.floor(menorLado / cellPx / 2));
}
window.mesaGridMaxCells = _gridMaxCells;

// Teto/piso de escala do contrato da cena (MESA_TOKEN_SCALE_* em mesa-stage.js,
// carregado antes deste arquivo; o fallback cobre uso isolado do módulo).
function _gridScaleMin() {
  return typeof MESA_TOKEN_SCALE_MIN === "number" ? MESA_TOKEN_SCALE_MIN : 0.25;
}
function _gridScaleMax() {
  return typeof MESA_TOKEN_SCALE_MAX === "number" ? MESA_TOKEN_SCALE_MAX : 12;
}

/**
 * Escala para encaixar o token em NxN células.
 *
 * N é limitado pelo teto EM CÉLULAS do mapa (_gridMaxCells) e, por segurança,
 * pelo teto de escala do contrato — se N não couber, desce para o maior N que
 * cabe, nunca devolve um tamanho quebrado. Era esse o bug da Etapa 65: com
 * célula grande o clamp cortava no meio do caminho e o token parava fora das
 * linhas da grade (ex.: 3,06 células).
 * @returns {{scale:number, cells:number}}
 */
function _gridFitCells(cells, cellPx, basePx) {
  const max = _gridScaleMax();
  let n = Math.max(1, Math.min(_gridMaxCells(), Math.round(cells)));
  while (n > 1 && (n * cellPx) / basePx > max) n -= 1;
  const bruto = (n * cellPx) / basePx;
  // Só o piso pode gerar tamanho não-inteiro (célula menor que o token mínimo).
  const scale = Math.round(Math.max(_gridScaleMin(), Math.min(max, bruto)) * 100) / 100;
  return { scale, cells: n };
}

/**
 * Quantiza o TAMANHO do token para N células (ajusta token.tokenScale).
 * Se N não couber no teto do contrato, cai para o maior N que cabe — o token
 * continua encaixado na grade em vez de parar num tamanho quebrado.
 * @returns {boolean} true se a escala mudou.
 */
function mesaFitTokenToGrid(token, tokenElement) {
  // Etapa 69: basta a grade estar ligada — tamanho fora da célula deixou de
  // ser um estado possível, com ou sem "Encaixar tokens".
  if (!_gridState.enabled) return false;
  if (!token) return false;
  const cellPx = _gridCellStagePx();
  if (!(cellPx > 0)) return false;

  const basePx = tokenElement?.offsetWidth || 88; // largura de layout (sem transform)
  const currentScale = Number(token.tokenScale) || 1;
  const alvo = _gridFitCells(_gridTokenCells(basePx * currentScale, cellPx), cellPx, basePx);
  const nextScale = alvo.scale;

  if (Math.abs(nextScale - currentScale) < 0.005) return false;
  token.tokenScale = nextScale;
  if (tokenElement?.isConnected) {
    tokenElement.style.setProperty("--token-scale", String(nextScale));
  }
  return true;
}

/**
 * Escala quantizada em N células, para PREVIEW durante o arrasto de resize.
 * Função pura: não escreve no token nem no DOM (Etapa 63).
 * @param {number} basePx      largura de layout do token (offsetWidth, sem transform)
 * @param {number} desiredScale escala crua vinda do ponteiro
 * @returns {{scale:number, cells:number}|null} null se a grade estiver desligada.
 */
function mesaPreviewGridScale(basePx, desiredScale) {
  if (!_gridState.enabled) return null;
  const cellPx = _gridCellStagePx();
  if (!(cellPx > 0) || !(basePx > 0)) return null;
  return _gridFitCells(_gridTokenCells(basePx * desiredScale, cellPx), cellPx, basePx);
}

/**
 * Alinha o token ao quadrado de células mais próximo (posição). Mexe em
 * token.x/y (% do palco, canto superior esquerdo) usando o rect real do
 * elemento para achar o centro e o diâmetro.
 * @param {boolean} [force] ignora o checkbox "Encaixar tokens". Usado pelo
 *   RESIZE (Etapa 69): o quadrado NxN tem de cair sobre as linhas, senão o
 *   token fica com tamanho de célula mas montado por cima delas. Mover o
 *   token continua livre quando o checkbox está desligado.
 * @returns {boolean} true se a posição mudou.
 */
function mesaSnapTokenToGrid(token, tokenElement, force) {
  if (!_gridState.enabled || (!_gridState.snap && !force)) return false;
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
 * @param {{forceAlign?: boolean}} [opts] forceAlign alinha a posição mesmo com
 *   "Encaixar tokens" desligado (o resize usa isso — ver mesaSnapTokenToGrid).
 * @returns {boolean} true se algo mudou.
 */
function mesaConformTokenToGrid(token, tokenElement, opts) {
  const resized = mesaFitTokenToGrid(token, tokenElement);
  const moved = mesaSnapTokenToGrid(token, tokenElement, opts?.forceAlign === true);
  return resized || moved;
}

// Mestre: re-conforma TODOS os tokens quando a grade muda (ligar a grade,
// ligar o snap, trocar o tamanho da célula). Mantém a mesa uniforme sem
// arrastar um a um. Etapa 69: basta a grade estar ligada — o TAMANHO conforma
// sempre; a posição só se "Encaixar tokens" estiver ligado.
function _conformAllTokensToGrid() {
  if (!_isGridMaster()) return;
  if (!_gridState.enabled) return;
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
  const escalaLbl = document.getElementById("mesaGridScaleLabel");
  if (escalaLbl) escalaLbl.textContent = formatMesaGridScale(_gridState.metersPerCell);
}

/** "1,5" · "12" · "1 km" — o rotulo curto do stepper de escala. */
function formatMesaGridScale(metros) {
  const n = Number(metros) || MESA_GRID_DEFAULTS.metersPerCell;
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".", ",") + " km";
  if (n >= 10) return String(Math.round(n));
  return n.toFixed(1).replace(".", ",");
}

/* Passo do stepper de escala: cresce junto com a escala.
 *
 * Passo fixo nao serve para as duas pontas — 0,5 m e o passo certo para uma
 * masmorra e absurdo para um mapa de reino (seriam 2000 cliques ate 1 km). */
function _passoDaEscala(atual) {
  if (atual < 3) return 0.5;
  if (atual < 10) return 1;
  if (atual < 50) return 5;
  if (atual < 200) return 25;
  if (atual < 1000) return 100;
  return 500;
}

function adjustMesaGridScale(direction) {
  if (!_isGridMaster()) return;
  const atual = _gridState.metersPerCell;
  // Descer usa o passo da FAIXA DE BAIXO, senao 3 m desceria para 2 e 2 para
  // 1,5 com passos diferentes do que subiu — o stepper nao voltaria pelo
  // mesmo caminho.
  const passo = direction > 0 ? _passoDaEscala(atual) : _passoDaEscala(atual - 0.001);
  const alvo = direction > 0 ? atual + passo : atual - passo;
  updateMesaGrid({ metersPerCell: Math.round(alvo * 100) / 100 });
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
window.adjustMesaGridScale            = adjustMesaGridScale;
window.formatMesaGridScale            = formatMesaGridScale;
window.mesaSnapTokenToGrid            = mesaSnapTokenToGrid;
window.mesaFitTokenToGrid             = mesaFitTokenToGrid;
window.mesaPreviewGridScale           = mesaPreviewGridScale;
window.mesaConformTokenToGrid         = mesaConformTokenToGrid;
window.normalizeMesaGridState         = normalizeMesaGridState;
