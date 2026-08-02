/**
 * mesa-initiative.js — Tracker de Iniciativa da Mesa Virtual
 *
 * Fluxo:
 *   Mestre ativa → banner aparece para jogadores
 *   Jogadores clicam no banner → popup de rolagem (1d20 + mod Agilidade)
 *   Resultado enviado via WS → mestre ordena (maior → menor) → broadcast para todos
 *   Mestre controla próximo turno / encerrar combate
 *
 * Roteamento: os deltas mesa:initiative:update/roll chegam pelo roteador
 * padrão da Mesa (applyMesaRealtimeDelta em mesa-core.js), que valida
 * clientId/ator e chama applyInitiativeState/receiveInitiativeRoll daqui.
 * O estado persiste como campo `initiative` da cena oficial (persistState).
 *
 * Dependências globais esperadas (carregadas antes):
 *   isMaster(), state, sendMesaRealtimeDelta(), persistState(), readMergedSheets()
 */

/* ── CONSTANTES ──────────────────────────────────────────────── */
const EV_INITIATIVE_UPDATE = "mesa:initiative:update";
const EV_INITIATIVE_ROLL   = "mesa:initiative:roll";

/* ── ESTADO LOCAL ────────────────────────────────────────────── */
// O estado canônico vive em mesa-core.js (state.initiative).
// Este módulo só lê/escreve via as funções exportadas abaixo.

/* ── HELPERS ─────────────────────────────────────────────────── */
function modFromAttr(value) {
  const v = Number.parseInt(value, 10);
  if (Number.isNaN(v) || v <= 0) return 0;
  return Math.floor(v / 3);
}

function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

/* ── GETTER do estado canônico ───────────────────────────────── */
function getInitiativeState() {
  // state é o objeto global definido em mesa-core.js
  if (!window._mesaInitiativeState) {
    window._mesaInitiativeState = {
      active:       false,
      round:        1,
      currentIndex: -1,
      order:        []   // [{ id, characterKey, name, roll, modifier, total, rolled }]
    };
  }
  return window._mesaInitiativeState;
}

/**
 * Trava local das acoes de mestre. Delega para requireMesaMaster()
 * (js/mesa-permissions.js); se o modulo de permissoes nao carregou,
 * cai no isMaster() do core — nunca em "liberado".
 */
function requireMesaMasterInit(acao) {
  if (typeof requireMesaMaster === "function") {
    return requireMesaMaster("initiative.control", acao);
  }
  return typeof isMaster === "function" && isMaster();
}

/** Aplica um novo estado de iniciativa recebido da rede ou local */
function applyInitiativeState(data) {
  const s = getInitiativeState();
  s.active       = Boolean(data?.active);
  s.round        = Number.isFinite(data?.round) && data.round > 0 ? Math.floor(data.round) : 1;
  s.currentIndex = Number.isFinite(data?.currentIndex) ? Math.floor(data.currentIndex) : -1;
  s.order        = Array.isArray(data?.order) ? data.order.map(normalizeEntry) : [];
  renderInitiative();
}

function normalizeEntry(e) {
  return {
    id:           String(e?.id || e?.characterKey || ""),
    characterKey: String(e?.characterKey || e?.id || ""),
    name:         String(e?.name || "?"),
    roll:         Number.isFinite(e?.roll)     ? e.roll     : 0,
    modifier:     Number.isFinite(e?.modifier) ? e.modifier : 0,
    total:        Number.isFinite(e?.total)    ? e.total    : 0,
    rolled:       Boolean(e?.rolled)
  };
}

/* ── AÇÕES DO MESTRE ─────────────────────────────────────────────
 * Todas passam por requireMesaMaster("initiative.control"). Esconder
 * o botao nao basta: estas funcoes sao globais (onclick inline), e
 * antes da Etapa 75 um jogador chamava activateInitiative() e via o
 * tracker "ligar" so na tela dele — o Durable Object recusava o
 * mesa:initiative:update e a UI ficava mentindo.
 */

/** Ativa o tracker e avisa todos os jogadores */
function activateInitiative() {
  if (!requireMesaMasterInit("iniciar o combate")) return;
  const s = getInitiativeState();
  s.active       = true;
  s.round        = 1;
  s.currentIndex = -1;
  s.order        = [];
  _broadcastInitiative();
  renderInitiative();
}

/** Avança para o próximo turno */
function nextInitiativeTurn() {
  if (!requireMesaMasterInit("passar o turno")) return;
  const s = getInitiativeState();
  if (!s.active || !s.order.length) return;
  s.currentIndex = s.currentIndex + 1;
  if (s.currentIndex >= s.order.length) {
    s.currentIndex = 0;
    s.round += 1;
  }
  _broadcastInitiative();
  renderInitiative();
}

/** Reinicia apenas a rodada (mantém ordem) */
function resetInitiativeRound() {
  if (!requireMesaMasterInit("reiniciar a rodada")) return;
  const s = getInitiativeState();
  s.round        = 1;
  s.currentIndex = s.order.length > 0 ? 0 : -1;
  _broadcastInitiative();
  renderInitiative();
}

/** Encerra o combate */
function deactivateInitiative() {
  if (!requireMesaMasterInit("encerrar o combate")) return;
  const s = getInitiativeState();
  s.active       = false;
  s.round        = 1;
  s.currentIndex = -1;
  s.order        = [];
  _broadcastInitiative();
  renderInitiative();
}

/** Remove uma entrada da ordem (mestre pode expulsar NPC/monstro morto) */
function removeFromInitiative(id) {
  if (!requireMesaMasterInit("remover alguem da iniciativa")) return;
  const s = getInitiativeState();
  const idx = s.order.findIndex(e => e.id === id);
  if (idx === -1) return;
  s.order.splice(idx, 1);
  if (s.currentIndex >= s.order.length) s.currentIndex = 0;
  _broadcastInitiative();
  renderInitiative();
}

/** Mestre recebe rolagem de um jogador e insere na ordem */
function _receivePlayerRoll(payload) {
  if (!isMaster()) return;
  const s = getInitiativeState();
  const entry = normalizeEntry({
    id:           payload.characterKey,
    characterKey: payload.characterKey,
    name:         payload.name,
    roll:         payload.roll,
    modifier:     payload.modifier,
    total:        payload.total,
    rolled:       true
  });
  // Substitui se já existia (re-roll)
  const existing = s.order.findIndex(e => e.characterKey === entry.characterKey);
  if (existing !== -1) s.order[existing] = entry;
  else s.order.push(entry);
  // Reordena: maior total primeiro; empate → maior roll; empate → nome
  s.order.sort((a, b) =>
    b.total - a.total || b.roll - a.roll || a.name.localeCompare(b.name)
  );
  _broadcastInitiative();
  renderInitiative();
}

function _broadcastInitiative() {
  const s = getInitiativeState();
  sendMesaRealtimeDelta(EV_INITIATIVE_UPDATE, { initiative: s });
  // A iniciativa faz parte da cena oficial: persistir aqui garante que o
  // estado sobrevive ao F5 do mestre e chega a jogador que entrar depois
  // (GET /mesa/scene), sem depender de outro persist acontecer por acidente.
  if (typeof persistState === "function") persistState();
}

/* ── AÇÃO DO JOGADOR ─────────────────────────────────────────── */

/** Mostra o popup de rolagem de iniciativa para o jogador */
function showInitiativeRollPopup() {
  const popup = document.getElementById("initiativeRollPopup");
  if (!popup) return;

  // Obtém folha do jogador para ler Agilidade
  const username = window.AUTH?.getSession?.()?.username || "";
  const sheets   = typeof readMergedSheets === "function" ? readMergedSheets() : {};
  const sheet    = sheets[username] || {};
  const agil     = Number.parseInt(sheet.attrAgilidade, 10) || 0;
  const mod      = modFromAttr(agil);
  const charName = sheet.charName || username || "Personagem";

  popup.querySelector(".init-popup-char").textContent = charName;
  popup.querySelector(".init-popup-agil").textContent = agil;
  popup.querySelector(".init-popup-mod").textContent  = mod >= 0 ? `+${mod}` : String(mod);
  popup.querySelector(".init-popup-result").textContent = "—";
  popup.querySelector(".init-popup-total").textContent  = "—";

  // Guarda dados no dataset para o botão de rolar
  popup.dataset.charKey  = username;
  popup.dataset.charName = charName;
  popup.dataset.modifier = String(mod);

  popup.hidden = false;
  popup.querySelector(".init-popup-roll-btn").focus();
}

function hideInitiativeRollPopup() {
  const popup = document.getElementById("initiativeRollPopup");
  if (popup) popup.hidden = true;
}

/** Chamada pelo botão "Rolar" dentro do popup */
function executeInitiativeRoll() {
  const popup = document.getElementById("initiativeRollPopup");
  if (!popup) return;

  const mod      = Number.parseInt(popup.dataset.modifier, 10) || 0;
  const charKey  = popup.dataset.charKey  || "";
  const charName = popup.dataset.charName || charKey;
  const roll     = rollD20();
  const total    = roll + mod;

  // Anima o resultado
  popup.querySelector(".init-popup-result").textContent = String(roll);
  popup.querySelector(".init-popup-total").textContent  = String(total);

  // Desabilita botão para evitar re-roll
  const btn = popup.querySelector(".init-popup-roll-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Rolado!"; }

  // Envia para o mestre
  sendMesaRealtimeDelta(EV_INITIATIVE_ROLL, {
    characterKey: charKey,
    name:         charName,
    roll,
    modifier:     mod,
    total
  });

  // Fecha popup após breve pausa
  setTimeout(hideInitiativeRollPopup, 1800);
}

/* ── BOOT ────────────────────────────────────────────────────── */

/**
 * Sincroniza a UI de iniciativa no boot da Mesa (chamado por initMesaPage
 * em mesa-core.js, depois de hydrateState restaurar state/iniciativa).
 * Os deltas mesa:initiative:* NÃO são registrados aqui: eles chegam pelo
 * roteador padrão (applyMesaRealtimeDelta), que já deduplica por clientId,
 * valida o ator e então chama applyInitiativeState/receiveInitiativeRoll.
 */
function initInitiativeModule() {
  renderInitiative();
}

/* ── RENDERIZAÇÃO ────────────────────────────────────────────── */

function renderInitiative() {
  _renderInitiativePanel();
  _renderInitiativeBanner();
  _updateInitiativeToolbarBtn();
}

function _updateInitiativeToolbarBtn() {
  const btn = document.getElementById("mesaInitiativeBtn");
  if (!btn) return;
  const s = getInitiativeState();
  btn.classList.toggle("is-active", s.active);
  btn.setAttribute("aria-pressed", String(s.active));
  btn.title = s.active ? "Combate ativo — clique para encerrar" : "Ativar tracker de iniciativa";
}

function _renderInitiativePanel() {
  const block = document.getElementById("vttInitiativeBlock");
  if (!block) return;
  const s   = getInitiativeState();
  const master = typeof isMaster === "function" && isMaster();

  // Visibilidade do bloco
  block.hidden = !s.active;
  if (!s.active) return;

  const list   = block.querySelector(".init-order-list");
  const round  = block.querySelector(".init-round-num");
  const status = block.querySelector(".init-status");

  if (round) round.textContent = String(s.round);

  // Mostra controles de mestre só para o mestre
  const masterControls = block.querySelector('.init-master-controls');
  if (masterControls) masterControls.hidden = !master;

  // Status
  if (status) {
    if (s.currentIndex < 0 || !s.order.length) {
      status.textContent = "Aguardando rolagens…";
    } else {
      const cur = s.order[s.currentIndex];
      status.textContent = cur ? `Turno de ${cur.name}` : "";
    }
  }

  if (!list) return;

  if (!s.order.length) {
    list.innerHTML = `<li class="init-empty">Nenhum participante ainda.</li>`;
    return;
  }

  list.innerHTML = s.order.map((e, i) => {
    const isCurrent = i === s.currentIndex;
    const modStr    = e.modifier >= 0 ? `+${e.modifier}` : String(e.modifier);
    const rollStr   = e.rolled ? `${e.roll} ${modStr} = <strong>${e.total}</strong>` : "—";
    return `
      <li class="init-entry${isCurrent ? " is-current" : ""}">
        <span class="init-pos">${i + 1}</span>
        <span class="init-name">${escapeHtmlInit(e.name)}</span>
        <span class="init-roll">${rollStr}</span>
        ${master ? `<button class="init-remove-btn" data-init-remove="${escapeHtmlInit(e.id)}" title="Remover">✕</button>` : ""}
      </li>`;
  }).join("");
}

function _renderInitiativeBanner() {
  const banner = document.getElementById("initiativeBanner");
  if (!banner) return;
  const s      = getInitiativeState();
  const master = typeof isMaster === "function" && isMaster();

  // Banner só para jogadores quando combate ativo
  if (master || !s.active) { banner.hidden = true; return; }

  // Verifica se o jogador já rolou
  const username = window.AUTH?.getSession?.()?.username || "";
  const alreadyRolled = s.order.some(e => e.characterKey === username && e.rolled);

  if (alreadyRolled) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
}

function escapeHtmlInit(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── DELEGATED CLICK HANDLERS ────────────────────────────────── */
document.addEventListener("click", function (e) {
  // Remover entrada da ordem (mestre)
  const removeBtn = e.target.closest("[data-init-remove]");
  if (removeBtn) {
    removeFromInitiative(removeBtn.dataset.initRemove);
    return;
  }

  // Banner do jogador → abre popup
  if (e.target.closest("#initiativeBannerRollBtn")) {
    showInitiativeRollPopup();
    return;
  }

  // Fechar popup
  if (e.target.closest("#initiativeRollPopupClose") || e.target.id === "initiativeRollPopup") {
    hideInitiativeRollPopup();
    return;
  }

  // Botão rolar dentro do popup
  if (e.target.closest(".init-popup-roll-btn")) {
    executeInitiativeRoll();
    return;
  }
});

/* ── EXPORTAÇÕES GLOBAIS ─────────────────────────────────────── */
window.activateInitiative    = activateInitiative;
window.deactivateInitiative  = deactivateInitiative;
window.nextInitiativeTurn    = nextInitiativeTurn;
window.resetInitiativeRound  = resetInitiativeRound;
window.applyInitiativeState  = applyInitiativeState;
window.getInitiativeState    = getInitiativeState;
window.initInitiativeModule  = initInitiativeModule;
window.renderInitiative      = renderInitiative;
// Consumido pelo roteador de deltas (applyMesaRealtimeDelta em mesa-core.js)
// quando o mestre recebe mesa:initiative:roll de um jogador.
window.receiveInitiativeRoll = _receivePlayerRoll;
