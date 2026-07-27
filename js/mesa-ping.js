/* ============================================================
 * mesa-ping.js — Ping no mapa (Etapa 43)
 * Alt+clique no palco emite "mesa:ping" via realtime para todos os
 * participantes (canal efêmero: nada entra na cena nem persiste).
 * Coordenadas viajam como frações do MAPA (u/v) usando o helper único
 * de mesa-map.js — sem mapa ativo o helper é identidade (fração do
 * palco), então o ping funciona igual em cenas sem mapa.
 * ============================================================ */

const MESA_PING_TYPE = "mesa:ping";
// Duração do pulso — manter em sincronia com a animação em mesa-stage.css
const MESA_PING_DURATION_MS = 2000;
// Throttle local de emissão (o DO tem rate-limit próprio, mas não fazemos
// o usuário gastar tokens do bucket com cliques frenéticos)
const MESA_PING_THROTTLE_MS = 300;
// Cap de pulsos simultâneos no palco — o mais antigo sai quando estoura
const MESA_PING_MAX_ACTIVE = 12;

let _mesaPingLastSentAt = 0;

function _mesaPingClampFrac(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * Mostra um pulso de ping no palco. x/y em fração do palco (0–1).
 * Retorna o elemento criado (ou null se o palco não existe).
 */
function showMesaPing(stageXFrac, stageYFrac, options = {}) {
  const inner = document.getElementById("mesaStageInner");
  if (!inner) return null;
  const x = _mesaPingClampFrac(stageXFrac, 0, 1);
  const y = _mesaPingClampFrac(stageYFrac, 0, 1);
  if (x === null || y === null) return null;

  const active = inner.querySelectorAll(".mesa-ping");
  if (active.length >= MESA_PING_MAX_ACTIVE) active[0].remove();

  const ping = document.createElement("div");
  ping.className = "mesa-ping" + (options.self ? " is-self" : "");
  ping.style.left = (x * 100) + "%";
  ping.style.top = (y * 100) + "%";
  ping.setAttribute("aria-hidden", "true");

  const name = String(options.name || "").trim().slice(0, 24);
  if (name) {
    const label = document.createElement("span");
    label.className = "mesa-ping-name";
    label.textContent = name;
    ping.appendChild(label);
  }

  inner.appendChild(ping);
  window.setTimeout(() => ping.remove(), MESA_PING_DURATION_MS);
  return ping;
}

/**
 * Emite um ping na posição indicada (fração do palco) e mostra o pulso
 * local imediatamente (o DO não ecoa para o próprio clientId).
 */
function sendMesaPingAtStageFrac(stageXFrac, stageYFrac) {
  const now = Date.now();
  if (now - _mesaPingLastSentAt < MESA_PING_THROTTLE_MS) return false;
  _mesaPingLastSentAt = now;

  let space = "stage";
  let u = stageXFrac;
  let v = stageYFrac;
  if (typeof window.mesaStageFracToMapFrac === "function") {
    const converted = window.mesaStageFracToMapFrac(stageXFrac, stageYFrac);
    if (converted.hasMap) {
      space = "map";
      u = converted.u;
      v = converted.v;
    }
  }

  if (typeof sendMesaRealtimeDelta === "function") {
    sendMesaRealtimeDelta(MESA_PING_TYPE, {
      u: _mesaPingClampFrac(u, -8, 8),
      v: _mesaPingClampFrac(v, -8, 8),
      space
    });
  }
  showMesaPing(stageXFrac, stageYFrac, { self: true, name: state?.username || "" });
  return true;
}

/**
 * Consome um mesa:ping vindo do realtime (chamado por applyMesaRealtimeDelta).
 * space === "map": converte fração do mapa → palco pelo helper; "stage" usa
 * as frações direto (cena sem mapa no emissor).
 */
function showMesaPingFromRemote(payload) {
  const u = _mesaPingClampFrac(payload?.u, -8, 8);
  const v = _mesaPingClampFrac(payload?.v, -8, 8);
  if (u === null || v === null) return;

  let fx = u;
  let fy = v;
  if (String(payload?.space || "") === "map" && typeof window.mesaMapFracToStageFrac === "function") {
    const converted = window.mesaMapFracToStageFrac(u, v);
    fx = converted.fx;
    fy = converted.fy;
  }
  showMesaPing(fx, fy, { name: payload?.actor?.username || "" });
}

/* ── Alt+clique no palco ────────────────────────────────────── */

function _handleMesaPingPointerDown(event) {
  if (!event.altKey || event.button !== 0) return;
  const inner = document.getElementById("mesaStageInner");
  if (!inner) return;
  // Rect do inner já embute o zoom (transform: scale) — a fração fica correta
  // em qualquer nível de zoom.
  const rect = inner.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const fx = (event.clientX - rect.left) / rect.width;
  const fy = (event.clientY - rect.top) / rect.height;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
  // Captura antes dos handlers de drag/pan/seleção — Alt+clique é só ping.
  event.preventDefault();
  event.stopPropagation();
  sendMesaPingAtStageFrac(fx, fy);
}

function initMesaPing() {
  const wrap = document.getElementById("mesaStageWrap");
  if (!wrap) return;
  wrap.addEventListener("pointerdown", _handleMesaPingPointerDown, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMesaPing, { once: true });
} else {
  initMesaPing();
}

window.showMesaPing = showMesaPing;
window.showMesaPingFromRemote = showMesaPingFromRemote;
window.sendMesaPingAtStageFrac = sendMesaPingAtStageFrac;
