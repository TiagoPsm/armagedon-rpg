/* mesa-markers.js — Painel de marcadores de status do token (Etapa 64)
 *
 * O mestre clica no botao do token selecionado (ou no "Editar" do inspetor) e
 * liga/desliga as condicoes que ja existiam desde a Etapa 46.
 *
 * A whitelist (MESA_STATUS_MARKERS), o cap (MESA_MAX_STATUS_MARKERS) e o
 * toggle (toggleMesaTokenStatusMarker) vivem em js/mesa-stage.js, que carrega
 * ANTES deste arquivo. Este modulo so cuida da UI do painel.
 */

let _markerPanelTokenId = "";

function getMarkerPanel() {
  return document.getElementById("mesaMarkerPanel");
}

function renderMesaMarkerPanel() {
  const panel = getMarkerPanel();
  if (!panel) return;
  const token = typeof findToken === "function" ? findToken(_markerPanelTokenId) : null;
  if (!token) {
    closeMesaMarkerPanel();
    return;
  }

  const active = new Set(normalizeMesaStatusMarkers(token.statusMarkers));
  const botoes = MESA_STATUS_MARKERS.map(marker => `
    <button type="button"
            class="marker-icon ${active.has(marker.key) ? "is-active" : ""}"
            data-marker-key="${marker.key}"
            title="${escapeAttribute(marker.label)}"
            aria-label="${escapeAttribute(marker.label)}"
            aria-pressed="${active.has(marker.key)}">${marker.icon}</button>
  `).join("");

  // Etapa 95: o cabecalho ganhou um kicker "Marcadores" no mesmo tom das
  // secoes do inspetor (ESTADO / ACOES). Sem ele, o painel abria mostrando
  // so o nome do token e nada dizia do que aquilo se tratava.
  panel.innerHTML = `
    <div class="marker-panel-head">
      <div class="marker-panel-heading">
        <span class="marker-panel-kicker">Marcadores</span>
        <strong class="marker-panel-title">${escapeHtml(token.name || "Token")}</strong>
      </div>
      <button type="button" class="marker-clear-btn" data-marker-action="clear" ${active.size ? "" : "disabled"}>Limpar tudo</button>
    </div>
    <div class="marker-icon-grid">${botoes}</div>
    <p class="marker-panel-count">${active.size}/${MESA_MAX_STATUS_MARKERS} marcadores</p>
  `;
}

/** Ancora o painel ao botao do token, mantendo-o dentro da janela. */
function positionMesaMarkerPanel(anchorEl) {
  const panel = getMarkerPanel();
  if (!panel || !anchorEl) return;
  const anchor = anchorEl.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  const margem = 8;

  let left = anchor.left + anchor.width / 2 - box.width / 2;
  left = Math.max(margem, Math.min(left, window.innerWidth - box.width - margem));

  // Abre para baixo; se nao couber, joga para cima do token.
  let top = anchor.bottom + margem;
  if (top + box.height > window.innerHeight - margem) {
    top = Math.max(margem, anchor.top - box.height - margem);
  }

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function openMesaMarkerPanel(tokenId, anchorEl) {
  const panel = getMarkerPanel();
  if (!panel) return;
  if (typeof isMaster === "function" && !isMaster()) return;

  _markerPanelTokenId = String(tokenId || "");
  panel.hidden = false;
  renderMesaMarkerPanel();
  positionMesaMarkerPanel(anchorEl);
}

function closeMesaMarkerPanel() {
  const panel = getMarkerPanel();
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  panel.innerHTML = "";
  _markerPanelTokenId = "";
}

function isMesaMarkerPanelOpen() {
  const panel = getMarkerPanel();
  return !!panel && !panel.hidden;
}

/** Persiste + transmite depois de mexer nos marcadores do token. */
function commitMesaMarkerChange(token) {
  if (typeof bumpMesaSceneVersion === "function") bumpMesaSceneVersion();
  if (typeof broadcastMesaTokenUpsert === "function") broadcastMesaTokenUpsert(token);
  if (typeof persistState === "function") persistState();
  if (typeof scheduleMesaRender === "function") scheduleMesaRender({ stage: true, inspector: true });
}

function handleMesaMarkerPanelClick(event) {
  const panel = getMarkerPanel();
  if (!panel || panel.hidden) return;

  const token = typeof findToken === "function" ? findToken(_markerPanelTokenId) : null;
  if (!token) {
    closeMesaMarkerPanel();
    return;
  }

  const clearBtn = event.target.closest("[data-marker-action='clear']");
  if (clearBtn) {
    if (!normalizeMesaStatusMarkers(token.statusMarkers).length) return;
    token.statusMarkers = [];
    commitMesaMarkerChange(token);
    renderMesaMarkerPanel();
    return;
  }

  const toggle = event.target.closest("[data-marker-key]");
  if (!toggle) return;
  // O cap e o aviso de limite ficam no helper compartilhado.
  if (!toggleMesaTokenStatusMarker(token, toggle.dataset.markerKey)) return;
  commitMesaMarkerChange(token);
  renderMesaMarkerPanel();
}

/** Abre o painel a partir do botao no token selecionado. */
function handleMesaMarkerButtonClick(event) {
  const button = event.target.closest(".mesa-token-markers-btn");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const tokenId = String(button.dataset.tokenId || "");
  // Clicar de novo no mesmo token fecha (alterna).
  if (isMesaMarkerPanelOpen() && _markerPanelTokenId === tokenId) {
    closeMesaMarkerPanel();
    return;
  }
  openMesaMarkerPanel(tokenId, button);
}

function initMesaMarkerPanel() {
  const panel = getMarkerPanel();
  if (!panel) return;

  panel.addEventListener("click", handleMesaMarkerPanelClick);

  // O botao vive dentro do token, que e re-renderizado: delega no documento.
  document.addEventListener("pointerdown", handleMesaMarkerButtonClick, true);

  // Clique fora fecha.
  document.addEventListener("pointerdown", event => {
    if (!isMesaMarkerPanelOpen()) return;
    if (event.target.closest("#mesaMarkerPanel")) return;
    if (event.target.closest(".mesa-token-markers-btn")) return;
    closeMesaMarkerPanel();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && isMesaMarkerPanelOpen()) closeMesaMarkerPanel();
  });

  // Se o token sai da cena ou o palco se move, o painel perde a ancora.
  window.addEventListener("resize", closeMesaMarkerPanel);
}

document.addEventListener("DOMContentLoaded", initMesaMarkerPanel);

window.openMesaMarkerPanel = openMesaMarkerPanel;
window.closeMesaMarkerPanel = closeMesaMarkerPanel;
