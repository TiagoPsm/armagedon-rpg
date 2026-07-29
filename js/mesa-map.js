/* ============================================================
 * mesa-map.js — Camada de mapa para a Mesa Virtual
 * ============================================================
 *
 * ARQUITETURA DE ENTREGA (ordem de prioridade)
 * ─────────────────────────────────────────────────────────────
 *  1. WebRTC DataChannel (P2P direto mestre → jogador)
 *     Zero custo de servidor. Imagem nunca toca o Worker.
 *     Sinalização (SDP + ICE) viaja pelos ~200B via Durable Object.
 *
 *  2. Chunked WebSocket via Durable Object (fallback automático)
 *     Ativado se WebRTC não abrir em P2P_TIMEOUT_MS (NAT simétrico,
 *     firewall corporativo, etc.). Mesmo DO que já existe — sem nova
 *     infra. Imagem relayed em chunks base64.
 *
 *  3. Cloudflare R2 (último recurso)
 *     Só ativado se P2P + WS ambos falharem. Imagem deletada
 *     automaticamente quando todos os jogadores saírem.
 *     R2 free tier: 10 GB storage, zero egress fee.
 *
 * OTIMIZAÇÕES
 * ─────────────────────────────────────────────────────────────
 *  - Compressão WebP antes de qualquer transferência (Etapa 55)
 *    Orientada a ORÇAMENTO, não a um cap fixo: mira 4096 px em q0.92 e só
 *    degrada (qualidade primeiro, dimensão depois) se passar de 10 MB — o
 *    teto real é o 413 do Worker no upload, não a contagem de pixels.
 *    Fonte que já é WebP dentro dos limites passa intacta (sem perda
 *    geracional).
 *  - Cache do jogador no IndexedDB por SHA-256
 *    Mapa igual = zero re-download em qualquer sessão futura
 *  - Announce/have: mestre só transfere para quem não tem cache
 *  - Mestre sempre vê blob: URL local — sem dependência de rede
 *
 * FASES
 * ─────────────────────────────────────────────────────────────
 *  [FASE 1 ✓]  Estrutura local (IndexedDB, File System API, render)
 *  [FASE 2 ✓]  Compressão + P2P WebRTC + WS fallback + cache jogador
 *  [FASE 3  ]  R2 real (Worker endpoints) + galeria de mapas
 *  [FASE 4  ]  Fog of War (canvas overlay, sync incremental)
 * ============================================================ */

"use strict";

/* ── CONSTANTES ─────────────────────────────────────────────── */

const MESA_MAP_DB_NAME    = "armagedom_maps";
const MESA_MAP_DB_VERSION = 3;
const MESA_MAP_STORE      = "maps";
const MESA_MAP_SETTINGS_STORE = "settings";
const MESA_MAP_ACTIVE_KEY = "tc_mesa_active_map";

// Eventos internos (Durable Object relay)
const EV_MAP_ANNOUNCE  = "mesa:map:announce";   // mestre → todos: novo mapa disponível
const EV_MAP_HAVE      = "mesa:map:have";        // jogador → mestre: já tenho no cache
const EV_MAP_NEED      = "mesa:map:need";        // jogador → mestre: não tenho, envia
const EV_MAP_OFFER     = "mesa:map:offer";       // mestre → jogador: WebRTC SDP offer
const EV_MAP_ANSWER    = "mesa:map:answer";      // jogador → mestre: WebRTC SDP answer
const EV_MAP_ICE       = "mesa:map:ice";         // bidirecional: ICE candidate
const EV_MAP_WS_START  = "mesa:map:ws:start";   // mestre → jogador: início de transfer WS
const EV_MAP_WS_CHUNK  = "mesa:map:ws:chunk";   // mestre → jogador: chunk de dados
const EV_MAP_WS_END    = "mesa:map:ws:end";     // mestre → jogador: fim de transfer WS
const EV_MAP_SET       = "mesa:map:set";         // (compatibilidade Fase 3 / R2)
const EV_MAP_CLEAR     = "mesa:map:clear";       // mestre → todos: limpar mapa

// Parâmetros de compressão (Etapa 55)
// Antes: 1920px fixo em q0.82 — um battlemap de 4096px chegava ao palco com
// metade da resolução, e o zoom de palco (até 3x) ampliava esse borrão.
//
// O teto real NÃO é de pixels, é de BYTES: o Worker recusa upload de mapa
// acima de MAP_UPLOAD_LIMIT (413 em POST /api/mesa/map). Estourar isso deixa
// o mapa num estado meio quebrado — visível localmente e via P2P, mas ausente
// para quem entrar depois, porque o R2/cena nunca recebeu. Então a estratégia
// é MAXIMIZAR PIXELS DENTRO DE UM ORÇAMENTO, não subir o cap às cegas.
const WEBP_MAX_PX   = 4096;   // maior dimensão em pixels (nunca faz upscale)
const WEBP_QUALITY  = 0.92;   // qualidade inicial — só cai se o orçamento exigir

// Degradação em ordem: primeiro qualidade (imperceptível), depois dimensão.
const WEBP_QUALITY_STEPS = [0.92, 0.86, 0.80, 0.72];
const WEBP_MIN_PX        = 2048;  // piso de dimensão: abaixo disso não reduz mais

// Orçamento de bytes do mapa comprimido. Folga deliberada sob o limite do
// Worker (12 MB): o multipart do upload e o envelope base64 do relay WS somam
// alguns por cento, e um 413 no meio da sessão é pior que 2% menos qualidade.
const MAP_BYTES_BUDGET = 10 * 1024 * 1024;

// WebRTC
const P2P_TIMEOUT_MS = 8_000; // ms até desistir do P2P e usar WS
const CHUNK_SIZE     = 64 * 1024; // 64 KB por chunk (DataChannel e WS)
const WS_THROTTLE_MS = 15;    // pausa a cada 4 chunks WS (evita saturação)

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/* ── ESTADO ─────────────────────────────────────────────────── */

const mesaMapState = {
  db:             null,   // IDBDatabase
  activeMapId:    "",     // ID do mapa exibido
  activeMapUrl:   "",     // blob: URL gerada localmente
  activeMapR2Key: "",     // chave no R2 (Fase 3)
  playersOnline:  false,  // há jogadores conectados?
  uploadInFlight: false,  // upload R2 em andamento
  isMaster:       false,  // papel do usuário atual
  myUserId:       "",     // ID do usuário atual
  activeEntry:    null,   // { id, name, blob, hash }
  mapTransform:   { x: 0, y: 0, scale: 1 }, // posição e escala do mapa
  // Mapa oficial persistido na cena (D1): { id, url, transform } ou null.
  // É o que permite jogadores carregarem o mapa no boot sem o mestre online.
  sceneMapRef:        null,
  activeMapPublicUrl: "",        // URL pública R2 do mapa ativo (mestre)
  _uploadedMapId:     "",        // dedupe: último mapa já enviado ao R2
  _lastSceneMapUrl:   "",        // dedupe: última URL de cena renderizada
  _pendingSceneMap:   undefined, // snapshot que chegou antes do initMesaMap
  _initDone:          false,
  // Jogador: id do mapa como o MESTRE o conhece (vem no announce/set). O id
  // local do cache é "cached-<hash>", diferente do id do mestre — sem este
  // campo, os broadcasts de transform (que carregam o id do mestre) ficavam
  // pendentes para sempre e o pan/zoom nunca chegava ao jogador.
  remoteMapId:        "",
};

/* Estado da pasta conectada (monitoramento em tempo real, sem IDB) */
const connectedFolder = {
  handle:          null,       // FileSystemDirectoryHandle
  name:            "",         // nome da pasta para exibir
  entries:         [],         // [{ path, fullName, handle, size, lastModified }]
  thumbUrls:       new Map(),  // path → blob: URL (thumbnails gerados)
  pollTimer:       null,       // ID do setInterval
  snapshot:        new Map(),  // path → lastModified (detecção de mudanças)
  _activePath:     "",         // caminho do mapa ativo (sem salvar no IDB)
  permissionState: "",         // "granted" | "denied" | "prompt"
  _idbSaveFailed:  false,      // true se o save do handle no IDB falhou
};

// mestre → jogadores: mapa de userId → RTCPeerConnection
const mesaPeerConnections = new Map();

// Confirmações de recebimento por hash (para trigger de fallback R2)
// userId → true quando jogador enviou EV_MAP_HAVE
const mesaMapAckSet = new Set();
let   mesaMapFallbackTimer = null;
const MAP_R2_FALLBACK_MS   = 30_000; // 30s sem confirmação → tenta R2

// jogador: conexão inbound (recebendo do mestre)
let mesaInboundPeer = null;

// jogador: buffer de reassembly para chunks WS
const mesaWsBuffer = {
  chunks: null, received: 0, total: 0, hash: "", name: "", size: 0,
};

/* ── ZOOM DE PALCO ──────────────────────────────────────────── */

let _stageZoom     = 1.0;
let _stagePan      = { x: 0, y: 0 };   // translação do palco em px de tela
const ZOOM_MIN     = 0.25;
const ZOOM_MAX     = 3.0;
const ZOOM_STEP    = 0.1;
const ZOOM_DEFAULT = 1.0;

/** Retorna o nível de zoom atual do palco (1 = 100%). */
function getStageZoom() {
  return _stageZoom;
}

/** Aplica transform composta (translate + scale) ao inner do palco. */
function _applyStageTransform() {
  const inner = document.getElementById("mesaStageInner");
  if (!inner) return;
  const { x, y } = _stagePan;
  const z = _stageZoom;
  inner.style.transform =
    (x === 0 && y === 0 && z === 1) ? "" : `translate(${x}px,${y}px) scale(${z})`;
}

/**
 * Define o zoom do palco. Preserva a translação atual.
 * @param {number} z — fator de escala (0.25 – 3.0)
 */
function setStageZoom(z) {
  _stageZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  _applyStageTransform();
  const slider = document.getElementById("mesaZoomSlider");
  const label  = document.getElementById("mesaZoomLabel");
  if (slider) slider.value = Math.round(_stageZoom * 100);
  if (label)  label.textContent = Math.round(_stageZoom * 100);
}

/**
 * Move o palco por (dx, dy) pixels de tela.
 * @param {number} dx
 * @param {number} dy
 */
function panStage(dx, dy) {
  _stagePan.x += dx;
  _stagePan.y += dy;
  _applyStageTransform();
}

/** Reseta pan e zoom para os valores padrão. */
function resetStageView() {
  _stageZoom = ZOOM_DEFAULT;
  _stagePan  = { x: 0, y: 0 };
  _applyStageTransform();
  const slider = document.getElementById("mesaZoomSlider");
  const label  = document.getElementById("mesaZoomLabel");
  if (slider) slider.value = 100;
  if (label)  label.textContent = "100";
}

/** Liga os botões e o slider do controle de zoom ao palco. */
function bindZoomControl() {
  const btnIn    = document.getElementById("mesaZoomIn");
  const btnOut   = document.getElementById("mesaZoomOut");
  const btnReset = document.getElementById("mesaZoomReset");
  const slider   = document.getElementById("mesaZoomSlider");

  if (btnIn)    btnIn.addEventListener("click",  () => setStageZoom(_stageZoom + ZOOM_STEP));
  if (btnOut)   btnOut.addEventListener("click", () => setStageZoom(_stageZoom - ZOOM_STEP));
  if (btnReset) btnReset.addEventListener("click", () => resetStageView());
  if (slider) {
    slider.addEventListener("input", () => setStageZoom(Number(slider.value) / 100));
    // Impede que o scroll dentro do slider propague para o zoom do palco
    slider.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  }
}

/* ── AJUSTE DO PALCO AO MAPA (Etapa 52) ─────────────────────── */
// Por padrão o palco preenche o canvas inteiro e o mapa entra com "cover":
// se a proporção da imagem não bate com a do painel, sobra corte nas bordas.
//
// Com o fit ligado, o #mesaStageInner deixa de ser inset:0 e passa a ter
// EXATAMENTE a proporção da imagem, centralizado no wrap (letterbox). Como a
// caixa fica na proporção certa, o cover de applyMapTransform() vira encaixe
// perfeito — a imagem aparece inteira, sem corte, e as camadas internas
// (grade, névoa, desenhos, tokens) herdam a nova caixa por serem inset:0.
//
// A UI e a persistência por cena entram na Etapa 54; aqui o estado é local e
// começa DESLIGADO, para não deslocar coordenadas de cenas já salvas.

let _fitToMap = false;

/** O palco está ajustado à proporção do mapa? */
function isStageFitToMap() {
  return _fitToMap;
}

/**
 * Liga/desliga o ajuste do palco à proporção do mapa.
 * @param {boolean} on
 */
function setStageFitToMap(on) {
  const next = !!on;
  if (next === _fitToMap) return;
  _fitToMap = next;
  // applyMapTransform() já reaplica a caixa e redesenha grade e névoa.
  applyMapTransform();
}

/* ── UI DO FIT (mestre) — Etapa 54 ──────────────────────────── */

/** Espelha o estado atual no checkbox e mostra o grupo só p/ mestre com mapa. */
function _syncFitToggleUI() {
  const group  = document.getElementById("mesaMapFitGroup");
  const toggle = document.getElementById("mesaMapFitToggle");
  if (toggle) toggle.checked = _fitToMap;
  if (group)  group.hidden = !(_isMasterRole() && !!mesaMapState.activeMapUrl);
}

/** Liga o checkbox: muda o fit, avisa os jogadores e grava na cena. */
function _bindFitToggle() {
  const toggle = document.getElementById("mesaMapFitToggle");
  if (!toggle) return;
  toggle.addEventListener("change", () => {
    setStageFitToMap(toggle.checked);
    // O fit muda o que está na tela: jogadores online recebem na hora e a
    // cena oficial guarda para quem entrar depois (e para o F5 do mestre).
    broadcastMapTransform();
    _scheduleMapScenePersist();
  });
}

/**
 * Aplica o fit vindo do mestre (realtime ou cena oficial). Etapa 54.
 * `undefined` = cliente/cena antigos, sem o campo: mantém o estado local em
 * vez de forçar false, para um payload legado não desligar o ajuste no meio
 * da sessão. O mestre ignora — a fonte de verdade do fit é ele.
 */
function _applyRemoteFit(value) {
  if (value === undefined || value === null) return;
  if (_isMasterRole()) return;
  setStageFitToMap(value === true);
}

/**
 * Calcula o maior retângulo com a proporção da imagem que cabe no wrap e
 * aplica ao #mesaStageInner. Sem fit (ou sem mapa/dimensões) devolve o inner
 * ao inset:0 do CSS.
 */
function applyStageFitBox() {
  const wrap  = document.getElementById("mesaStageWrap");
  const inner = document.getElementById("mesaStageInner");
  if (!wrap || !inner) return;

  const iw = mesaMapState._imgW;
  const ih = mesaMapState._imgH;
  const active = !!(_fitToMap && mesaMapState.activeMapUrl && iw > 0 && ih > 0);

  if (!active) {
    inner.style.left = inner.style.top = "";
    inner.style.right = inner.style.bottom = "";
    inner.style.width = inner.style.height = "";
    wrap.removeAttribute("data-fit-map");
    return;
  }

  const cw = wrap.clientWidth  || 1;
  const ch = wrap.clientHeight || 1;
  const fit = Math.min(cw / iw, ch / ih);   // "contain": cabe inteiro
  const w = Math.max(1, Math.round(iw * fit));
  const h = Math.max(1, Math.round(ih * fit));

  // left/top + width/height sobrepõem o inset:0 (right/bottom viram auto para
  // a caixa não ficar sobre-restringida).
  inner.style.left   = `${Math.round((cw - w) / 2)}px`;
  inner.style.top    = `${Math.round((ch - h) / 2)}px`;
  inner.style.right  = "auto";
  inner.style.bottom = "auto";
  inner.style.width  = `${w}px`;
  inner.style.height = `${h}px`;
  wrap.setAttribute("data-fit-map", "");
}

/**
 * Transform EFETIVO do mapa (Etapa 53).
 *
 * O pan/escala do mapa existe só para compensar o corte do "cover". Com o fit
 * ligado não há corte: a imagem já preenche a caixa exatamente. Manter o
 * controle ativo aí seria nocivo — mover a imagem dentro da caixa descola o
 * mapa dos tokens e dos desenhos, que usam fração do PALCO (ao contrário de
 * grade/névoa/régua/ping, que convertem para fração do MAPA).
 *
 * Travando em identidade no modo fit, fração-do-palco ≡ fração-do-mapa por
 * construção e TODAS as camadas ficam ancoradas na imagem — sem migrar
 * coordenada e sem mexer no protocolo de sync. Para aproximar, o mestre usa o
 * zoom de palco, que escala tudo junto e preserva o alinhamento.
 *
 * O transform guardado NÃO é zerado: sai intacto do localStorage e volta a
 * valer se o fit for desligado.
 */
function _getEffectiveMapTransform() {
  if (_fitToMap && mesaMapState.activeMapUrl && mesaMapState._imgW && mesaMapState._imgH) {
    return { x: 0, y: 0, scale: 1 };
  }
  return mesaMapState.mapTransform;
}

/** O pan/escala do mapa está travado (fit ligado)? */
function isMapTransformLocked() {
  return _getEffectiveMapTransform() !== mesaMapState.mapTransform;
}

/** Recalcula a caixa quando o painel muda de tamanho (janela, sidebars). */
function _observeStageResize() {
  const wrap = document.getElementById("mesaStageWrap");
  if (!wrap || typeof ResizeObserver !== "function") return;
  // Só reage quando o fit está ligado; caso contrário o inset:0 já resolve.
  new ResizeObserver(() => {
    if (_fitToMap) applyMapTransform();
  }).observe(wrap);
}

/* ── CAMADA ATIVA ───────────────────────────────────────────── */

const MESA_ACTIVE_LAYER_KEY = "mesaActiveLayer";

/**
 * Retorna a camada atualmente ativa ("tokens" | "dm" | "map").
 * Lê diretamente do atributo data-active-layer do wrapper do palco.
 */
function getMesaActiveLayer() {
  const wrap = document.getElementById("mesaStageWrap");
  return wrap ? (wrap.dataset.activeLayer || "tokens") : "tokens";
}

/**
 * Define a camada ativa, persiste no localStorage e atualiza os botões.
 * A camada "dm" (secreta) é exclusiva do mestre — jogador cai em "tokens".
 * @param {"tokens"|"dm"|"map"} layer
 */
function setMesaActiveLayer(layer) {
  const wrap = document.getElementById("mesaStageWrap");
  if (!wrap) return;
  if ((layer === "dm" || layer === "map") && !mesaMapState.isMaster) layer = "tokens";
  wrap.dataset.activeLayer = layer;
  document.querySelectorAll(".vtt-layer-btn[data-layer]").forEach(function(btn) {
    const active = btn.dataset.layer === layer;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  try { localStorage.setItem(MESA_ACTIVE_LAYER_KEY, layer); } catch (e) {}
}

/**
 * Restaura a camada ativa salva no localStorage (chamado na init).
 * Respeita o papel: jogador nunca entra na camada secreta do mestre.
 */
function restoreMesaActiveLayer() {
  let saved = "tokens";
  try { saved = localStorage.getItem(MESA_ACTIVE_LAYER_KEY) || "tokens"; } catch (e) {}
  if (!["tokens", "dm", "map"].includes(saved)) saved = "tokens";
  if ((saved === "dm" || saved === "map") && !mesaMapState.isMaster) saved = "tokens";
  setMesaActiveLayer(saved);
}

/* ── INICIALIZAÇÃO ──────────────────────────────────────────── */

/**
 * Ponto de entrada. Chamado após DOM estar pronto.
 * Detecta papel, abre IndexedDB, restaura mapa anterior,
 * registra listeners de presença e realtime.
 */
async function initMesaMap() {
  try {
    // Detectar papel (mestre ou jogador)
    const session = _getSession();
    mesaMapState.isMaster   = session?.role === "master";
    mesaMapState.myUserId   = session?.username || session?.userId || `user-${Date.now()}`;

    mesaMapState.db = await openMesaMapDB();
    // Jogador em modo backend não restaura mapa local: a cena oficial
    // (e o realtime) são a fonte de verdade — evita mapa antigo no F5
    // depois que o mestre trocou ou limpou o mapa.
    if (mesaMapState.isMaster || !window.AUTH?.isBackendEnabled?.()) {
      await restoreActiveMap();
    }
    await _restoreConnectedFolder();
    bindMesaMapPresence();
    bindMapInteractions();
    bindZoomControl();
    _observeStageResize();
    _bindFitToggle();

    if (mesaMapState.isMaster) {
      document.body.classList.add("is-master");
      // Mestre: botão de configurações sempre visível (token style disponível sem mapa)
      const settingsBtn = document.getElementById("mesaMapSettingsBtn");
      if (settingsBtn) settingsBtn.hidden = false;
      // Mestre: revela a camada secreta e a camada de mapa (ocultas para jogadores no HTML).
      const dmLayerBtn = document.getElementById("mesaLayerDmBtn");
      if (dmLayerBtn) dmLayerBtn.hidden = false;
      const mapLayerBtn = document.getElementById("mesaLayerMapBtn");
      if (mapLayerBtn) mapLayerBtn.hidden = false;
      bindMasterMapListeners();
    } else {
      bindPlayerMapListeners();
    }

    // Restaura a camada ativa salva (respeitando o papel).
    restoreMesaActiveLayer();

    mesaMapState._initDone = true;
    // Aplica o mapa da cena oficial que chegou durante o hydrate (o boot do
    // mesa-core roda antes deste init — ver applyMesaSceneMapFromSnapshot).
    _applyPendingSceneMap();

    // Migração suave: mestre com mapa ativo local mas cena oficial sem mapa
    // persiste o mapa atual (upload R2 + PUT da cena) para os jogadores.
    if (mesaMapState.isMaster && mesaMapState.activeEntry && !mesaMapState.sceneMapRef) {
      _ensureActiveMapPersisted();
    }
  } catch (err) {
    console.warn("[mesa-map] Falha ao iniciar módulo de mapa:", err);
  }
}

function _getSession() {
  try {
    const session = JSON.parse(localStorage.getItem("tc_session")) || {};
    // O token JWT fica em chave separada (tc_session_token) por segurança.
    // Tentamos essa chave primeiro; se não existir, usamos o campo session.token
    // (que também é populado por auth.js na maioria dos cenários).
    const token = localStorage.getItem("tc_session_token") || session.token || "";
    return { ...session, token };
  } catch { return null; }
}

/* ── INDEXEDDB ──────────────────────────────────────────────── */

function openMesaMapDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MESA_MAP_DB_NAME, MESA_MAP_DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(MESA_MAP_STORE)) {
        const store = db.createObjectStore(MESA_MAP_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(MESA_MAP_SETTINGS_STORE)) {
        db.createObjectStore(MESA_MAP_SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror   = (e) => reject(e.target.error);
  });
}

function saveMesaMapToDB(map) {
  return new Promise((resolve, reject) => {
    const tx = mesaMapState.db.transaction(MESA_MAP_STORE, "readwrite");
    tx.objectStore(MESA_MAP_STORE).put(map);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

function loadMesaMapFromDB(mapId) {
  return new Promise((resolve, reject) => {
    const tx  = mesaMapState.db.transaction(MESA_MAP_STORE, "readonly");
    const req = tx.objectStore(MESA_MAP_STORE).get(mapId);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function listMesaMapsFromDB() {
  return new Promise((resolve, reject) => {
    const tx  = mesaMapState.db.transaction(MESA_MAP_STORE, "readonly");
    const req = tx.objectStore(MESA_MAP_STORE).getAll();
    req.onsuccess = (e) =>
      resolve((e.target.result || []).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = (e) => reject(e.target.error);
  });
}

function deleteMesaMapFromDB(mapId) {
  return new Promise((resolve, reject) => {
    const tx = mesaMapState.db.transaction(MESA_MAP_STORE, "readwrite");
    tx.objectStore(MESA_MAP_STORE).delete(mapId);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/**
 * Busca um mapa pelo hash SHA-256 (para cache hit do jogador).
 * @param {string} hash
 * @returns {Promise<object|null>}
 */
async function findCachedMapByHash(hash) {
  if (!mesaMapState.db || !hash) return null;
  const all = await listMesaMapsFromDB();
  return all.find(m => m.hash === hash) || null;
}

/* ── COMPRESSÃO WEBP ────────────────────────────────────────── */

/**
 * Comprime um Blob de imagem para WebP via Canvas API.
 * PNG 15 MB → WebP ~300–600 KB tipicamente.
 *
 * @param {Blob} blob       — imagem original (qualquer formato)
 * @param {number} maxPx    — dimensão máxima em pixels (default 1920)
 * @param {number} quality  — qualidade WebP 0-1 (default 0.82)
 * @returns {Promise<Blob>} — blob WebP comprimido
 */
async function compressToWebP(blob, maxPx = WEBP_MAX_PX, quality = WEBP_QUALITY) {
  const bitmap = await createImageBitmap(blob);
  const srcMax = Math.max(bitmap.width, bitmap.height);

  try {
    // Atalho sem perda: fonte já é WebP, já cabe no cap de pixels e no
    // orçamento. Re-encodar aqui seria perda geracional pura — a imagem
    // passaria por uma segunda compressão com lossy sobre lossy, sem ganhar
    // nada em bytes.
    if (blob.type === "image/webp" && srcMax <= maxPx && blob.size <= MAP_BYTES_BUDGET) {
      console.info(`[mesa-map] Original preservado: ${bitmap.width}x${bitmap.height} WebP, ${_fmtMB(blob.size)}`);
      return blob;
    }

    // Nunca faz upscale: um mapa de 1200px não vira 4096px falso.
    let targetMax = Math.min(srcMax, maxPx);
    let best = null;

    // Degrada na ordem certa: primeiro qualidade (quase invisível num mapa),
    // só depois dimensão (que é o que o mestre realmente sente ao dar zoom).
    while (true) {
      for (const q of _qualitySteps(quality)) {
        const out = await _encodeWebP(bitmap, targetMax, q);
        // Guarda o menor produzido até agora, para o caso de nada caber.
        if (!best || out.blob.size < best.blob.size) best = out;
        if (out.blob.size <= MAP_BYTES_BUDGET) {
          const nota = (out.w === srcMax || out.w === bitmap.width) ? "" : ` (origem ${bitmap.width}x${bitmap.height})`;
          console.info(`[mesa-map] Mapa: ${out.w}x${out.h} q${q} ${_fmtMB(out.blob.size)}${nota}`);
          return out.blob;
        }
      }
      if (targetMax <= WEBP_MIN_PX) break;
      targetMax = Math.max(WEBP_MIN_PX, Math.round(targetMax * 0.8));
    }

    // Piso atingido e ainda acima do orçamento (mapa gigante e muito
    // detalhado). Devolve o menor: o upload pode falhar com 413, e é melhor
    // dizer isso alto do que degradar a imagem até virar borrão.
    console.warn(
      `[mesa-map] Mapa nao coube no orcamento de ${_fmtMB(MAP_BYTES_BUDGET)}: ` +
      `melhor tentativa ${best.w}x${best.h} = ${_fmtMB(best.blob.size)}. ` +
      `O upload para o R2 pode ser recusado; considere reduzir o mapa na origem.`
    );
    return best.blob;
  } finally {
    bitmap.close(); // libera memória do ImageBitmap em qualquer caminho
  }
}

/** Passos de qualidade a tentar, começando na qualidade pedida. */
function _qualitySteps(startQuality) {
  const steps = WEBP_QUALITY_STEPS.filter(q => q <= startQuality);
  return steps.length ? steps : [startQuality];
}

/** Desenha o bitmap redimensionado e codifica em WebP. */
function _encodeWebP(bitmap, targetMax, quality) {
  const ratio = Math.min(targetMax / bitmap.width, targetMax / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width  * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Reamostragem de alta qualidade: o default varia entre navegadores e o
  // "low" deixa halo em linhas finas de mapa (grades desenhadas, contornos).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve({ blob: b, w, h }) : reject(new Error("[mesa-map] toBlob retornou null")),
      "image/webp",
      quality
    );
  });
}

function _fmtMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Calcula SHA-256 de um Blob.
 * Usado para identificar mapas e evitar re-download no cache do jogador.
 * @param {Blob} blob
 * @returns {Promise<string>} — 64 caracteres hex
 */
async function computeBlobHash(blob) {
  const buf    = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ── FILE SYSTEM ACCESS API ─────────────────────────────────── */

async function pickLocalMapFile() {
  if (!("showOpenFilePicker" in window)) return pickLocalMapFileFallback();

  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{
        description: "Imagens de mapa",
        accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
      }],
      multiple: false,
    });
    return await fileHandle.getFile();
  } catch (err) {
    if (err.name === "AbortError") return null;
    throw err;
  }
}

function pickLocalMapFileFallback() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), {
      type: "file", accept: "image/*",
    });
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change",  () => { document.body.removeChild(input); resolve(input.files?.[0] || null); }, { once: true });
    input.addEventListener("cancel",  () => { document.body.removeChild(input); resolve(null); }, { once: true });
    input.click();
  });
}

/* ── ABRIR E DEFINIR MAPA (mestre) ──────────────────────────── */

/**
 * Abre o seletor de arquivo, comprime para WebP, salva no IndexedDB
 * e define como mapa ativo. Se há jogadores online, inicia entrega P2P.
 */
async function openAndSetLocalMap() {
  const file = await pickLocalMapFile();
  if (!file) return;

  setMesaMapLoading(true);

  try {
    const mapId   = `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const mapName = file.name.replace(/\.[^.]+$/, "");
    const rawBlob = new Blob([await file.arrayBuffer()], { type: file.type });

    // Comprimir antes de salvar — ocupa menos espaço no IndexedDB
    const compressed = await compressToWebP(rawBlob);
    const hash       = await computeBlobHash(compressed);

    const mapEntry = {
      id:             mapId,
      name:           mapName,
      blob:           compressed,   // salva a versão comprimida
      hash,
      createdAt:      Date.now(),
    };

    await saveMesaMapToDB(mapEntry);
    await applyActiveMap(mapEntry);

    // Armazenar na memória para evitar re-comprimir
    mesaMapState.activeEntry = mapEntry;

    if (mesaMapState.playersOnline) {
      announceMapToPlayers(mapEntry);
    }

    // R2 + cena oficial (jogadores offline/futuros recebem no boot)
    _ensureActiveMapPersisted();

  } catch (err) {
    console.error("[mesa-map] Falha ao abrir mapa:", err);
  } finally {
    setMesaMapLoading(false);
  }
}

async function applyActiveMap(mapEntry) {
  if (mesaMapState.activeMapUrl) {
    URL.revokeObjectURL(mesaMapState.activeMapUrl);
  }

  const blobUrl = URL.createObjectURL(mapEntry.blob);
  mesaMapState.activeMapId  = mapEntry.id;
  mesaMapState.activeMapUrl = blobUrl;

  // Restaurar transform salvo para este mapa
  try {
    const saved = localStorage.getItem(`mesa_map_tr_${mapEntry.id}`);
    mesaMapState.mapTransform = saved ? JSON.parse(saved) : { x: 0, y: 0, scale: 1 };
  } catch { mesaMapState.mapTransform = { x: 0, y: 0, scale: 1 }; }

  try { localStorage.setItem(MESA_MAP_ACTIVE_KEY, mapEntry.id); } catch {}

  // Pré-carregar dimensões naturais da imagem para cálculo de cover correto
  mesaMapState._imgW = 0;
  mesaMapState._imgH = 0;
  const probe = new Image();
  probe.onload = function() {
    mesaMapState._imgW = probe.naturalWidth;
    mesaMapState._imgH = probe.naturalHeight;
    applyMapTransform(); // re-aplica com dimensões corretas
    // Jogador: aplica transform do mestre que chegou antes das dimensões.
    if (typeof _flushPendingRemoteTransform === "function") _flushPendingRemoteTransform();
    // Mestre: alinha os jogadores ao transform atual deste mapa.
    if (typeof broadcastMapTransform === "function") broadcastMapTransform();
  };
  probe.src = blobUrl;

  renderMesaMapLayer(blobUrl, mapEntry.name);
}

function clearActiveMap() {
  if (mesaMapState.activeMapUrl) {
    URL.revokeObjectURL(mesaMapState.activeMapUrl);
  }
  mesaMapState.activeMapId  = "";
  mesaMapState.activeMapUrl = "";
  mesaMapState.activeEntry  = null;
  mesaMapState._imgW        = 0;
  mesaMapState._imgH        = 0;

  try { localStorage.removeItem(MESA_MAP_ACTIVE_KEY); } catch {}

  // Limpa seleção da pasta conectada e mapa persistido
  connectedFolder._activePath = "";
  _deleteCFActiveMapFromIDB().catch(function() {});

  renderMesaMapLayer("", "");

  // Remove a referência oficial da cena (D1) e o objeto do R2. O persist
  // roda mesmo sem jogadores online — quem entrar depois não pode receber
  // um mapa que o mestre já limpou.
  mesaMapState.sceneMapRef        = null;
  mesaMapState.activeMapPublicUrl = "";
  mesaMapState._uploadedMapId     = "";
  mesaMapState._lastSceneMapUrl   = "";
  deleteActiveMapFromR2();
  _persistMesaSceneMap();

  if (mesaMapState.playersOnline) {
    _sendRealtime({ type: EV_MAP_CLEAR });
  }
}

async function restoreActiveMap() {
  // 1. Tentar restaurar mapa salvo na biblioteca IDB
  const savedId = localStorage.getItem(MESA_MAP_ACTIVE_KEY);
  if (savedId && mesaMapState.db) {
    const mapEntry = await loadMesaMapFromDB(savedId);
    if (mapEntry) {
      await applyActiveMap(mapEntry);
      mesaMapState.activeEntry = mapEntry;
      return;
    }
  }

  // 2. Tentar restaurar mapa da pasta conectada (salvo no IDB settings)
  await _restoreCFActiveMap();
}

async function _restoreCFActiveMap() {
  if (!mesaMapState.db) return;
  try {
    var record = await new Promise(function(resolve) {
      var tx  = mesaMapState.db.transaction(MESA_MAP_SETTINGS_STORE, "readonly");
      var req = tx.objectStore(MESA_MAP_SETTINGS_STORE).get("cfActiveMap");
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { resolve(null); };
    });
    if (!record || !record.value) return;

    var saved = record.value; // { blob, name, cfPath }
    var blobUrl = URL.createObjectURL(saved.blob);
    var hash = await computeBlobHash(saved.blob);

    if (mesaMapState.activeMapUrl) URL.revokeObjectURL(mesaMapState.activeMapUrl);
    // Entry completo mesmo no restore: permite anunciar a jogadores novos e
    // persistir na cena oficial (mesmo id derivado do hash usado no set).
    mesaMapState.activeMapId  = "cf-" + hash.slice(0, 12);
    mesaMapState.activeEntry  = { id: "cf-" + hash.slice(0, 12), name: saved.name || "", blob: saved.blob, hash: hash };
    mesaMapState.activeMapUrl = blobUrl;
    try { localStorage.removeItem(MESA_MAP_ACTIVE_KEY); } catch {}

    // Marcar pasta conectada como tendo esse caminho ativo (sera confirmado apos reconexao)
    connectedFolder._activePath = saved.cfPath || "";

    renderMesaMapLayer(blobUrl, saved.name || "");

    // Restaura o transform salvo por mapa (antes o F5 sempre zerava o
    // pan/zoom do mestre em mapas da pasta conectada).
    try {
      var savedTr = localStorage.getItem("mesa_map_tr_" + mesaMapState.activeMapId);
      mesaMapState.mapTransform = savedTr ? JSON.parse(savedTr) : { x: 0, y: 0, scale: 1 };
    } catch { mesaMapState.mapTransform = { x: 0, y: 0, scale: 1 }; }

    // Probe de dimensões (necessário para o cálculo cover e para o
    // broadcast/persist do transform normalizado).
    mesaMapState._imgW = 0;
    mesaMapState._imgH = 0;
    var probe = new Image();
    probe.onload = function() {
      mesaMapState._imgW = probe.naturalWidth;
      mesaMapState._imgH = probe.naturalHeight;
      applyMapTransform();
      broadcastMapTransform();
    };
    probe.src = blobUrl;
    applyMapTransform();
  } catch (e) {
    console.warn("[mesa-map] _restoreCFActiveMap:", e);
  }
}

/* ── RENDERIZAÇÃO NO PALCO ──────────────────────────────────── */

function renderMesaMapLayer(blobUrl, mapName) {
  const layer       = document.getElementById("mesaMapLayer");
  const label       = document.getElementById("mesaMapLabel");
  const clearBtn    = document.getElementById("mesaMapClearBtn");
  const transformEl = document.getElementById("mesaMapTransform");
  const scaleGroup  = document.getElementById("mesaMapScaleGroup");
  const hint        = document.getElementById("mesaMapHint");
  const settingsBtn = document.getElementById("mesaMapSettingsBtn");

  if (!layer) return;

  const emptyState = document.getElementById("mesaEmptyState");
  const masterMode = typeof isMaster === "function" && isMaster();

  if (blobUrl) {
    layer.style.backgroundImage = `url("${blobUrl}")`;
    layer.removeAttribute("hidden");
    if (emptyState) emptyState.hidden = true;
    applyMapTransform();
    // Exibe seção de escala/posição — só faz sentido com mapa ativo
    if (scaleGroup) scaleGroup.hidden = false;
    if (hint) hint.hidden = false;
    if (settingsBtn) settingsBtn.hidden = false;
  } else {
    layer.style.backgroundImage    = "";
    layer.style.backgroundSize     = "cover";
    layer.style.backgroundPosition = "center";
    layer.setAttribute("hidden", "");
    // Oculta controles específicos de mapa (escala, hint)
    if (scaleGroup) scaleGroup.hidden = true;
    if (hint) hint.hidden = true;
    if (masterMode) {
      // Mestre: mantém botão visível para acessar config de tokens
      if (settingsBtn) settingsBtn.hidden = false;
      // Se o painel estava aberto, fecha para evitar visual quebrado (controles de mapa sumiram)
      if (transformEl && !transformEl.hidden) {
        transformEl.hidden = true;
        if (settingsBtn) settingsBtn.setAttribute("aria-expanded", "false");
        if (settingsBtn) settingsBtn.classList.remove("is-active");
      }
    } else {
      // Jogador: sem mapa → sem configurações → oculta tudo
      if (transformEl) { transformEl.hidden = true; }
      if (settingsBtn) { settingsBtn.hidden = true; settingsBtn.setAttribute("aria-expanded","false"); }
    }
    const mesaStage = document.getElementById("mesaStage");
    if (emptyState && mesaStage && !mesaStage.children.length) {
      emptyState.hidden = false;
    }
    // Mapa limpo: o palco volta a preencher o canvas e a grade e a névoa
    // voltam a ancorar no palco inteiro. O toggle de fit some junto (sem
    // mapa não há proporção a que ajustar).
    applyStageFitBox();
    _syncFitToggleUI();
    if (typeof window.renderMesaGrid === "function") window.renderMesaGrid();
    if (typeof window.renderMesaFog === "function") window.renderMesaFog();
  }

  if (label) {
    label.textContent = blobUrl ? mapName : "Sem mapa";
    label.classList.toggle("has-map", !!blobUrl);
  }
  if (clearBtn) clearBtn.hidden = !blobUrl;
}

/* ── TRANSFORM DO MAPA (pan + zoom) ────────────────────────── */

function applyMapTransform() {
  const layer = document.getElementById("mesaMapLayer");
  if (!layer) return;

  // A caixa do palco vem primeiro: o cover abaixo mede offsetWidth/Height do
  // layer, que só está correto depois do fit aplicado.
  applyStageFitBox();

  // Efetivo, não o guardado: no modo fit o pan/escala fica travado em
  // identidade (ver _getEffectiveMapTransform).
  const { x, y, scale } = _getEffectiveMapTransform();
  const s = Math.max(0.1, Math.min(8, scale));

  // "cover" escalado: calcula o tamanho cover e multiplica por s
  const cw = layer.offsetWidth  || 1;
  const ch = layer.offsetHeight || 1;

  if (mesaMapState._imgW && mesaMapState._imgH) {
    const iw = mesaMapState._imgW;
    const ih = mesaMapState._imgH;
    // tamanho cover: a menor escala que faz a imagem cobrir o container
    const coverScale = Math.max(cw / iw, ch / ih);
    const finalW = Math.round(iw * coverScale * s);
    const finalH = Math.round(ih * coverScale * s);
    layer.style.backgroundSize = `${finalW}px ${finalH}px`;
  } else {
    // fallback enquanto as dimensões não estão disponíveis
    layer.style.backgroundSize = `${s * 100}% auto`;
  }
  layer.style.backgroundPosition = `calc(50% + ${x}px) calc(50% + ${y}px)`;

  // Atualizar label de escala
  const lbl = document.getElementById("mesaMapScaleLabel");
  if (lbl) lbl.textContent = `${Math.round(s * 100)}%`;

  // Persistir por mapa. No modo fit o transform é identidade FORÇADA, não uma
  // escolha do mestre — salvar aqui apagaria o pan/zoom que ele havia ajustado
  // e que deve voltar intacto se o fit for desligado.
  if (mesaMapState.activeMapId && !isMapTransformLocked()) {
    try {
      localStorage.setItem(
        `mesa_map_tr_${mesaMapState.activeMapId}`,
        JSON.stringify({ x, y, scale: s })
      );
    } catch {}
  }

  // Com o fit ligado, pan/escala do mapa não fazem mais nada: esconder o grupo
  // evita um controle vivo que não responde.
  _syncMapTransformControls();

  // Grade e névoa acompanham o mapa: qualquer pan/zoom/troca redesenha.
  if (typeof window.renderMesaGrid === "function") window.renderMesaGrid();
  if (typeof window.renderMesaFog === "function") window.renderMesaFog();
}

/**
 * Mostra/esconde os controles de pan e escala do mapa conforme o travamento.
 * Só age quando há mapa ativo — sem mapa, renderMesaMapLayer() já os oculta.
 */
function _syncMapTransformControls() {
  _syncFitToggleUI();
  if (!mesaMapState.activeMapUrl) return;
  const locked     = isMapTransformLocked();
  const scaleGroup = document.getElementById("mesaMapScaleGroup");
  const hint       = document.getElementById("mesaMapHint");
  if (scaleGroup) scaleGroup.hidden = locked;
  if (hint)       hint.hidden       = locked;
}

function adjustMapScale(delta) {
  if (!mesaMapState.activeMapUrl) return;
  // Fit ligado: escalar a imagem dentro da caixa a descolaria dos tokens.
  if (isMapTransformLocked()) return;
  mesaMapState.mapTransform.scale = Math.max(0.1, Math.min(8,
    mesaMapState.mapTransform.scale + delta));
  applyMapTransform();
  broadcastMapTransform();
}

function panMap(dx, dy) {
  if (!mesaMapState.activeMapUrl) return;
  if (isMapTransformLocked()) return;
  mesaMapState.mapTransform.x += dx;
  mesaMapState.mapTransform.y += dy;
  applyMapTransform();
  broadcastMapTransform();
}

function resetMapTransform() {
  mesaMapState.mapTransform = { x: 0, y: 0, scale: 1 };
  applyMapTransform();
  broadcastMapTransform();
}

/* ── SYNC DO TRANSFORM (mestre → jogadores) ─────────────────── */
// O pan é armazenado em PIXELS do container local, que muda por resolução.
// Para sincronizar, o transform viaja normalizado como frações do tamanho
// exibido da imagem (cover × scale), e cada cliente converte de volta para
// os próprios pixels. Pega carona no tipo "mesa:map:set" (master-only e
// retransmitido a todos pelo Durable Object já deployado); clientes antigos
// ignoram o payload sem "url".

function _getMapCoverDims() {
  const layer = document.getElementById("mesaMapLayer");
  if (!layer || !mesaMapState._imgW || !mesaMapState._imgH) return null;
  const cw = layer.offsetWidth  || 1;
  const ch = layer.offsetHeight || 1;
  const s  = Math.max(0.1, Math.min(8, _getEffectiveMapTransform().scale));
  const coverScale = Math.max(cw / mesaMapState._imgW, ch / mesaMapState._imgH);
  return {
    w: Math.max(1, mesaMapState._imgW * coverScale * s),
    h: Math.max(1, mesaMapState._imgH * coverScale * s)
  };
}

/* ── HELPER ÚNICO PALCO ↔ MAPA (Etapa 42) ───────────────────── */
// Toda feature ancorada ao mapa (grade, régua, fog) converte coordenadas por
// aqui — uma única fonte da matemática de cover + transform. Coordenadas:
//   • fração do palco: 0–1 relativo ao container do palco (mesmo espaço dos
//     tokens, que usam % — dividir por 100)
//   • fração do mapa: 0–1 relativo à IMAGEM exibida (cover × scale + pan)
// Sem mapa ativo, a superfície de referência é o próprio palco (retângulo
// 0,0–1,1), para a grade continuar utilizável em cenas sem mapa.

/**
 * Retângulo da imagem exibida em frações do palco.
 * @returns {{ left:number, top:number, width:number, height:number, hasMap:boolean }}
 */
function getMesaMapSurfaceFrac() {
  const layer = document.getElementById("mesaMapLayer");
  const dims  = _getMapCoverDims();
  if (!layer || !dims || layer.hidden) {
    return { left: 0, top: 0, width: 1, height: 1, hasMap: false };
  }
  const cw = layer.offsetWidth  || 1;
  const ch = layer.offsetHeight || 1;
  const { x, y } = _getEffectiveMapTransform();
  // background-position: calc(50% + Xpx) → canto da imagem em px do container
  const leftPx = (cw - dims.w) / 2 + x;
  const topPx  = (ch - dims.h) / 2 + y;
  return {
    left:   leftPx / cw,
    top:    topPx  / ch,
    width:  dims.w / cw,
    height: dims.h / ch,
    hasMap: true
  };
}

/** Converte fração do palco → fração do mapa exibido. */
function mesaStageFracToMapFrac(fx, fy) {
  const s = getMesaMapSurfaceFrac();
  return {
    u: (Number(fx) - s.left) / (s.width  || 1),
    v: (Number(fy) - s.top)  / (s.height || 1),
    hasMap: s.hasMap
  };
}

/** Converte fração do mapa exibido → fração do palco. */
function mesaMapFracToStageFrac(u, v) {
  const s = getMesaMapSurfaceFrac();
  return {
    fx: s.left + Number(u) * s.width,
    fy: s.top  + Number(v) * s.height,
    hasMap: s.hasMap
  };
}

window.isStageFitToMap        = isStageFitToMap;
window.isMapTransformLocked   = isMapTransformLocked;
window.setStageFitToMap       = setStageFitToMap;
window.applyStageFitBox       = applyStageFitBox;
window.getMesaMapSurfaceFrac  = getMesaMapSurfaceFrac;
window.mesaStageFracToMapFrac = mesaStageFracToMapFrac;
window.mesaMapFracToStageFrac = mesaMapFracToStageFrac;

let _mapTransformBroadcastTimer = 0;

function broadcastMapTransform() {
  if (!mesaMapState.isMaster || !mesaMapState.activeMapId) return;
  if (_mapTransformBroadcastTimer) clearTimeout(_mapTransformBroadcastTimer);
  _mapTransformBroadcastTimer = setTimeout(() => {
    _mapTransformBroadcastTimer = 0;
    const dims = _getMapCoverDims();
    if (!dims) return;
    // Efetivo: com o fit ligado o jogador precisa receber identidade, não o
    // pan/zoom guardado — senão o mapa dele sai do lugar em relação ao mestre.
    const { x, y, scale } = _getEffectiveMapTransform();
    _sendRealtime({
      type:          EV_MAP_SET,
      transformOnly: true,
      mapId:         mesaMapState.activeMapId,
      from:          mesaMapState.myUserId,
      // O fit pega carona no mesmo evento: é relay master-only já liberado no
      // Durable Object e clientes antigos simplesmente ignoram o campo.
      fit:           isStageFitToMap(),
      transform: {
        xFrac: x / dims.w,
        yFrac: y / dims.h,
        scale: Math.max(0.1, Math.min(8, scale))
      }
    });
    // Pan/zoom também vai para a cena oficial (sobrevive a F5 sem mestre).
    _scheduleMapScenePersist();
  }, 200);
}

function _applyRemoteMapTransform(t, mapId) {
  if (mesaMapState.isMaster) return;
  const scale = Math.max(0.1, Math.min(8, Number(t?.scale) || 1));
  mesaMapState._pendingRemoteTransform = {
    xFrac: Number(t?.xFrac) || 0,
    yFrac: Number(t?.yFrac) || 0,
    scale,
    mapId: String(mapId || "")
  };
  _flushPendingRemoteTransform();
}

function _flushPendingRemoteTransform() {
  const p = mesaMapState._pendingRemoteTransform;
  if (!p) return;
  // Transform de outro mapa que ainda não chegou: guarda até o mapa ativar.
  // Compara contra o id remoto (do mestre) quando conhecido — o id local de
  // mapas recebidos via P2P/cache é "cached-<hash>" e nunca bateria.
  const knownMapId = mesaMapState.remoteMapId || mesaMapState.activeMapId;
  if (p.mapId && knownMapId && p.mapId !== knownMapId) return;
  mesaMapState.mapTransform.scale = p.scale; // escala primeiro: dims dependem dela
  const dims = _getMapCoverDims();
  if (!dims) {
    // Dimensões da imagem ainda não conhecidas: aplica ao menos a escala e
    // mantém pendente — probe.onload chama este flush de novo.
    mesaMapState.mapTransform = { x: 0, y: 0, scale: p.scale };
    applyMapTransform();
    return;
  }
  mesaMapState.mapTransform = { x: p.xFrac * dims.w, y: p.yFrac * dims.h, scale: p.scale };
  mesaMapState._pendingRemoteTransform = null;
  applyMapTransform();
}

/* ── MAPA PERSISTIDO NA CENA OFICIAL (D1 + R2) ──────────────── */
// O mapa deixa de ser efêmero: quando o mestre ativa um mapa, ele sobe para
// o R2 e a referência { id, url, transform } é salva na cena oficial
// (PUT /mesa/scene). Jogadores carregam o mapa no boot direto do backend,
// sem depender do mestre online — o realtime (P2P/WS) vira otimização.

function _isMasterRole() {
  if (typeof isMaster === "function") return isMaster();
  return mesaMapState.isMaster;
}

// Transform atual normalizado (frações do tamanho exibido da imagem).
function _normalizedMapTransform() {
  // Efetivo em toda a função: a cena oficial precisa guardar o que está de
  // fato NA TELA. Com o fit ligado isso é identidade — persistir o transform
  // guardado faria o jogador que entra depois desenhar o mapa deslocado.
  const eff = _getEffectiveMapTransform();
  const fallback = (isMapTransformLocked() ? null : mesaMapState.sceneMapRef?.transform)
    || { xFrac: 0, yFrac: 0, scale: Math.max(0.1, Math.min(8, eff.scale || 1)) };
  const dims = _getMapCoverDims();
  if (!dims) return fallback;
  const { x, y, scale } = eff;
  return {
    xFrac: Math.round((x / dims.w) * 10000) / 10000,
    yFrac: Math.round((y / dims.h) * 10000) / 10000,
    scale: Math.round(Math.max(0.1, Math.min(8, scale)) * 10000) / 10000
  };
}

// Consumido por createMesaScenePayloadFromState (mesa-core.js) em todo persist.
window.getMesaSceneMapPayload = function () {
  if (mesaMapState.activeMapPublicUrl && mesaMapState.activeMapId) {
    return {
      id:        mesaMapState.activeMapId,
      url:       mesaMapState.activeMapPublicUrl,
      fit:       isStageFitToMap(),
      transform: _normalizedMapTransform()
    };
  }
  // Sem mapa local persistido: preserva a referência que veio da cena
  // (evita que um persist do mestre apague o mapa oficial sem intenção).
  return mesaMapState.sceneMapRef || null;
};

// Chamado por applyMesaSceneSnapshot (mesa-core.js) no boot e em snapshots
// remotos. Antes do initMesaMap terminar, apenas guarda como pendente.
window.applyMesaSceneMapFromSnapshot = function (map) {
  const ref = map && map.url ? map : null;
  mesaMapState.sceneMapRef = ref;
  if (!mesaMapState._initDone) {
    mesaMapState._pendingSceneMap = ref;
    return;
  }
  _applySceneMapRef(ref);
};

function _applyPendingSceneMap() {
  if (mesaMapState._pendingSceneMap === undefined) return;
  const ref = mesaMapState._pendingSceneMap;
  mesaMapState._pendingSceneMap = undefined;
  _applySceneMapRef(ref);
}

function _applySceneMapRef(ref) {
  if (!ref) {
    // Cena oficial sem mapa: o jogador só limpa se o que exibe veio da cena
    // (um mapa entregue via P2P/WS pelo mestre online permanece).
    if (!_isMasterRole() && mesaMapState._lastSceneMapUrl) {
      mesaMapState._lastSceneMapUrl = "";
      mesaMapState.activeMapId = "";
      mesaMapState._imgW = 0;
      mesaMapState._imgH = 0;
      renderMesaMapLayer("", "");
    }
    return;
  }

  if (_isMasterRole()) {
    // Mestre já exibe este mapa localmente: só reconecta a URL persistida
    // (pós-F5) para os próximos persists não perderem a referência.
    if (mesaMapState.activeMapId && mesaMapState.activeMapId === ref.id) {
      mesaMapState.activeMapPublicUrl = ref.url;
      mesaMapState._uploadedMapId = ref.id;
      // O fit é do mestre, mas depois de um F5 quem tem a memória é a cena.
      if (ref.fit !== undefined) {
        setStageFitToMap(ref.fit === true);
        _syncFitToggleUI();
      }
      return;
    }
    // Mestre com outro mapa local ativo: o local manda (a cena converge no
    // próximo persist do próprio mestre).
    if (mesaMapState.activeMapUrl) return;
    // Mestre sem mapa local (cache perdido): carrega da cena.
    mesaMapState.activeMapPublicUrl = ref.url;
    mesaMapState._uploadedMapId = ref.id;
    _renderSceneMapFromUrl(ref);
    return;
  }

  // Jogador: renderiza a URL da cena (dedupe por URL + id; se for o mesmo
  // mapa, só realinha o transform).
  if (mesaMapState._lastSceneMapUrl === ref.url && mesaMapState.activeMapId === ref.id) {
    _applyRemoteFit(ref.fit);
    if (ref.transform) _applyRemoteMapTransform(ref.transform, ref.id);
    return;
  }
  _renderSceneMapFromUrl(ref);
}

function _renderSceneMapFromUrl(ref) {
  if (mesaMapState.activeMapUrl && mesaMapState.activeMapUrl.startsWith("blob:")) {
    URL.revokeObjectURL(mesaMapState.activeMapUrl);
  }
  // Mantém a URL ativa (não-blob): controles de pan/zoom do mestre exigem
  // activeMapUrl truthy mesmo quando o mapa veio da cena oficial.
  mesaMapState.activeMapUrl = String(ref.url);
  mesaMapState.activeMapId = String(ref.id || "scene-map");
  mesaMapState.remoteMapId = String(ref.id || "");
  mesaMapState._lastSceneMapUrl = ref.url;
  mesaMapState._imgW = 0;
  mesaMapState._imgH = 0;

  // Fit da cena antes do probe: troca de cena troca o fit junto com o mapa.
  if (ref.fit !== undefined) {
    if (_isMasterRole()) { setStageFitToMap(ref.fit === true); _syncFitToggleUI(); }
    else _applyRemoteFit(ref.fit);
  }

  const probe = new Image();
  probe.onload = function () {
    mesaMapState._imgW = probe.naturalWidth;
    mesaMapState._imgH = probe.naturalHeight;
    const t = ref.transform || { xFrac: 0, yFrac: 0, scale: 1 };
    mesaMapState.mapTransform.scale = Math.max(0.1, Math.min(8, Number(t.scale) || 1));
    const dims = _getMapCoverDims();
    mesaMapState.mapTransform = dims
      ? { x: (Number(t.xFrac) || 0) * dims.w, y: (Number(t.yFrac) || 0) * dims.h, scale: mesaMapState.mapTransform.scale }
      : { x: 0, y: 0, scale: mesaMapState.mapTransform.scale };
    applyMapTransform();
    // Transform realtime que chegou antes da imagem (jogador).
    _flushPendingRemoteTransform();
  };
  probe.src = ref.url;
  renderMesaMapLayer(ref.url, ref.id || "Mapa");
}

// Persiste a cena oficial com a referência atual do mapa (master-only).
function _persistMesaSceneMap() {
  if (!_isMasterRole()) return;
  if (!window.AUTH?.isBackendEnabled?.()) return;
  if (typeof bumpMesaSceneVersion === "function") bumpMesaSceneVersion();
  if (typeof persistState === "function") persistState({ immediate: true });
}

// Garante que o mapa ativo do mestre está no R2 e referenciado na cena.
function _ensureActiveMapPersisted() {
  if (!_isMasterRole() || !window.AUTH?.isBackendEnabled?.()) return;
  if (!mesaMapState.activeEntry) return;
  if (
    mesaMapState._uploadedMapId === mesaMapState.activeEntry.id
    && mesaMapState.activeMapPublicUrl
  ) {
    _persistMesaSceneMap();
    return;
  }
  uploadActiveMapToR2();
}

// Pan/zoom do mestre também persiste (debounced, mais lento que o broadcast
// realtime de 200ms para não fazer PUT em cada passo do arrasto).
let _mapScenePersistTimer = 0;
function _scheduleMapScenePersist() {
  if (!_isMasterRole()) return;
  if (_mapScenePersistTimer) clearTimeout(_mapScenePersistTimer);
  _mapScenePersistTimer = setTimeout(() => {
    _mapScenePersistTimer = 0;
    _persistMesaSceneMap();
  }, 1200);
}

function bindMapInteractions() {
  const wrap = document.getElementById("mesaStageWrap");
  if (!wrap) return;

  // ── Zoom via scroll/pinch — qualquer camada, qualquer utilizador ────────────
  wrap.addEventListener("wheel", function(e) {
    e.preventDefault();
    const raw  = e.deltaY;
    const step = Math.abs(raw) < 20 ? raw * 0.005 : (raw > 0 ? -0.08 : 0.08);
    setStageZoom(_stageZoom + step);
  }, { passive: false });

  // ── Pan do palco — qualquer camada, qualquer utilizador ───────────────────
  // Arrastar em espaço vazio (não sobre token/botão) move toda a cena.
  // Em camada MAPA o mestre também pode mover o fundo independentemente
  // através do painel de configurações de mapa.
  let dragging = false;
  let lastX = 0, lastY = 0;
  let _panMoved = false;  // exportado para mesa-stage.js saber se foi pan

  // Expõe flag para o handler de deselect em mesa-stage.js
  window._mesaStagePanMoved = false;

  wrap.addEventListener("mousedown", function(e) {
    // Modo "select": pan no RMB | Modo "move": pan no LMB (padrão)
    const _imode = window._mesaInteractionMode || "select";
    const _panBtn = _imode === "select" ? 2 : 0;
    if (e.button !== _panBtn) return;
    if (e.target.closest("input, button, a, select, textarea")) return;
    // Em camada tokens: só inicia pan se NÃO está em cima de um token
    // (tokens têm pointer-events desativados na camada mapa, então não há conflito)
    if (e.target.closest(".mesa-token")) return;
    dragging = true;
    _panMoved = false;
    window._mesaStagePanMoved = false;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mousemove", function(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (!_panMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      _panMoved = true;
      window._mesaStagePanMoved = true;
      wrap.style.cursor = "grabbing";
    }
    if (_panMoved) {
      panStage(dx, dy);
      // Na camada mapa: também move o fundo do mapa junto (mestre apenas)
      if (mesaMapState.isMaster && getMesaActiveLayer() === "map") {
        panMap(dx, dy);
      }
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  window.addEventListener("mouseup", function() {
    if (dragging) {
      dragging = false;
      wrap.style.cursor = "";
      // Reseta o flag de pan após o ciclo de eventos (para o click handler ver)
      setTimeout(function() { window._mesaStagePanMoved = false; }, 0);
    }
  });

  // Cursor hint: grab ao passar sobre área vazia
  wrap.addEventListener("mouseover", function(e) {
    if (dragging) return;
    if (!e.target.closest(".mesa-token, input, button, a")) {
      wrap.style.cursor = "grab";
    }
  });
  wrap.addEventListener("mouseout", function() {
    if (!dragging) wrap.style.cursor = "";
  });
}

/* ── PRESENÇA ───────────────────────────────────────────────── */

/**
 * Escuta mudanças de presença vindas do Durable Object.
 * Quando jogadores entram: inicia entrega do mapa ativo.
 * Quando todos saem: limpa R2, fecha conexões P2P abertas.
 */
function bindMesaMapPresence() {
  if (!window.APP?.on) return;

  // Usernames de jogadores ja vistos na presenca. O announce precisa disparar
  // para CADA jogador novo (ou que voltou apos F5) — nao apenas na transicao
  // 0->1 jogadores, senao quem entra depois nunca recebe o mapa.
  let knownPlayerNames = new Set();

  const handle = (payload) => {
    const users   = Array.isArray(payload?.online?.users) ? payload.online.users : [];
    const players = users.filter(u => u.role !== "master");

    const hadPlayers          = mesaMapState.playersOnline;
    mesaMapState.playersOnline = players.length > 0;

    const currentNames = new Set(
      players.map(u => String(u.username || "").toLowerCase()).filter(Boolean)
    );
    const hasNewcomer = [...currentNames].some(name => !knownPlayerNames.has(name));
    knownPlayerNames  = currentNames;

    if (hasNewcomer && mesaMapState.playersOnline && mesaMapState.isMaster) {
      // Jogador novo (ou recem-reconectado) — anunciar mapa ativo se houver.
      // Quem ja tem o mapa em cache apenas responde EV_MAP_HAVE (barato).
      if (mesaMapState.activeEntry) {
        announceMapToPlayers(mesaMapState.activeEntry);
      }
    } else if (hadPlayers && !mesaMapState.playersOnline && mesaMapState.isMaster) {
      // Último jogador saiu — limpar conexões P2P. O mapa NÃO sai do R2:
      // ele agora é persistente (referenciado pela cena oficial) para que
      // jogadores futuros o carreguem no boot sem o mestre online.
      mesaPeerConnections.forEach(pc => pc.close());
      mesaPeerConnections.clear();
    }
  };

  window.APP.on("mesa:ready",    handle);
  window.APP.on("mesa:presence", handle);
}

/* ── ENTREGA: LADO DO MESTRE ────────────────────────────────── */

/**
 * Registra os listeners de sinais WebRTC que chegam dos jogadores.
 * Chamado apenas no mestre.
 */
function bindMasterMapListeners() {
  if (!window.APP?.on) return;

  // Jogador não tem o mapa — abrir P2P para ele
  window.APP.on(EV_MAP_NEED, async ({ from, hash }) => {
    if (!mesaMapState.activeEntry) return;
    // Segurança: garantir que hash coincide com o mapa ativo
    if (hash && hash !== mesaMapState.activeEntry.hash) return;
    await openP2PToPlayer(from, mesaMapState.activeEntry);
  });

  // Jogador confirmou que tem o mapa (cache hit ou recebeu via P2P/WS)
  // Registrar confirmação e cancelar timer de fallback R2 se todos confirmaram
  window.APP.on(EV_MAP_HAVE, ({ from, hash }) => {
    console.info(`[mesa-map] Jogador ${from} tem mapa ${hash?.slice(0, 8)}.`);
    if (from) mesaMapAckSet.add(from);
    // Se recebemos pelo menos uma confirmação, o canal funcionou
    // → cancelar fallback R2 (evita upload desnecessário)
    if (mesaMapAckSet.size > 0 && mesaMapFallbackTimer) {
      clearTimeout(mesaMapFallbackTimer);
      mesaMapFallbackTimer = null;
    }
  });

  // Resposta SDP do jogador
  window.APP.on(EV_MAP_ANSWER, async ({ from, sdp }) => {
    const pc = mesaPeerConnections.get(from);
    if (pc && pc.signalingState !== "stable") {
      try { await pc.setRemoteDescription(sdp); } catch (e) {
        console.warn("[mesa-map] Falha ao aplicar answer de", from, e);
      }
    }
  });

  // ICE candidate do jogador
  window.APP.on(EV_MAP_ICE, async ({ from, candidate }) => {
    const pc = mesaPeerConnections.get(from);
    if (pc) {
      try { await pc.addIceCandidate(candidate); } catch {}
    }
  });
}

/**
 * Anuncia o mapa para todos os jogadores.
 * Jogadores verificam o cache pelo hash e respondem com have/need.
 * Inicia timer de fallback R2: se nenhum jogador confirmar em
 * MAP_R2_FALLBACK_MS, tenta upload para R2 como último recurso.
 *
 * @param {{ id, name, blob, hash }} entry
 */
function announceMapToPlayers(entry) {
  // Resetar rastreamento de confirmações
  mesaMapAckSet.clear();
  if (mesaMapFallbackTimer) clearTimeout(mesaMapFallbackTimer);

  _sendRealtime({
    type:  EV_MAP_ANNOUNCE,
    mapId: entry.id,
    hash:  entry.hash,
    name:  entry.name,
    size:  entry.blob.size,
    from:  mesaMapState.myUserId,
  });

  // Fallback R2: ativado se nenhum EV_MAP_HAVE chegar em 30s
  mesaMapFallbackTimer = setTimeout(() => {
    if (mesaMapAckSet.size === 0 && mesaMapState.playersOnline) {
      console.warn("[mesa-map] Nenhuma confirmação em 30s. Tentando fallback R2...");
      uploadActiveMapToR2();
    }
  }, MAP_R2_FALLBACK_MS);

  // Alinha quem acabou de entrar ao pan/zoom atual do mestre (quem ainda
  // não tem a imagem guarda como pendente e aplica quando ela chegar).
  broadcastMapTransform();
}

/**
 * Cria RTCPeerConnection para um jogador e transfere o blob via DataChannel.
 * Fallback automático para WS chunked se P2P não abrir em P2P_TIMEOUT_MS.
 *
 * @param {string} userId
 * @param {{ blob: Blob, hash: string, name: string }} entry
 */
async function openP2PToPlayer(userId, entry) {
  // Fechar conexão anterior com este usuário
  const existing = mesaPeerConnections.get(userId);
  if (existing) { existing.close(); mesaPeerConnections.delete(userId); }

  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  mesaPeerConnections.set(userId, pc);

  const dc = pc.createDataChannel("map", { ordered: true });
  let fallbackFired = false;

  // Timer de fallback — se DataChannel não abrir, usar WS
  const fallbackTimer = setTimeout(() => {
    if (dc.readyState !== "open") {
      fallbackFired = true;
      console.warn(`[mesa-map] WebRTC timeout para ${userId} — usando WS chunked.`);
      sendMapViaWS(userId, entry);
    }
  }, P2P_TIMEOUT_MS);

  dc.onopen = async () => {
    if (fallbackFired) return;
    clearTimeout(fallbackTimer);
    try {
      await sendBlobViaDataChannel(dc, entry.blob, entry.hash, entry.name);
    } catch (e) {
      console.error("[mesa-map] Erro no DataChannel, tentando WS:", e);
      if (!fallbackFired) { fallbackFired = true; sendMapViaWS(userId, entry); }
    }
  };

  dc.onerror = () => {
    if (!fallbackFired) {
      fallbackFired = true;
      clearTimeout(fallbackTimer);
      sendMapViaWS(userId, entry);
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      _sendRealtime({ type: EV_MAP_ICE, to: userId, from: mesaMapState.myUserId, candidate: e.candidate.toJSON() });
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    _sendRealtime({
      type: EV_MAP_OFFER,
      to:   userId,
      from: mesaMapState.myUserId,
      sdp:  pc.localDescription.toJSON(),
      hash: entry.hash,
      name: entry.name,
      size: entry.blob.size,
    });
  } catch (e) {
    console.error("[mesa-map] Falha ao criar offer WebRTC:", e);
    clearTimeout(fallbackTimer);
    sendMapViaWS(userId, entry);
  }
}

/**
 * Envia o blob em chunks de CHUNK_SIZE via RTCDataChannel.
 * Protocolo:
 *   → JSON { type:"map:start", hash, name, size, chunks }
 *   → N × ArrayBuffer (cada chunk ≤ CHUNK_SIZE bytes)
 *   → JSON { type:"map:end", hash }
 */
async function sendBlobViaDataChannel(dc, blob, hash, name) {
  const buffer      = await blob.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

  dc.send(JSON.stringify({ type: "map:start", hash, name, size: buffer.byteLength, chunks: totalChunks }));

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    dc.send(buffer.slice(start, start + CHUNK_SIZE));

    // Back-pressure: aguarda se o buffer do DC estiver muito cheio
    while (dc.readyState === "open" && dc.bufferedAmount > 2 * 1024 * 1024) {
      await new Promise(r => setTimeout(r, 30));
    }
    if (dc.readyState !== "open") throw new Error("DataChannel fechou durante envio");
  }

  dc.send(JSON.stringify({ type: "map:end", hash }));
}

/* ── FALLBACK WS CHUNKED ────────────────────────────────────── */

/**
 * Envia o mapa em chunks via Durable Object WebSocket (relay).
 * Usado quando WebRTC falha. Chunks são base64 para compatibilidade
 * com o JSON do protocolo do DO.
 *
 * @param {string} userId
 * @param {{ blob: Blob, hash: string, name: string }} entry
 */
async function sendMapViaWS(userId, entry) {
  const { blob, hash, name } = entry;
  const buffer      = await blob.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

  _sendRealtime({ type: EV_MAP_WS_START, to: userId, from: mesaMapState.myUserId,
    hash, name, size: buffer.byteLength, chunks: totalChunks });

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const chunk = buffer.slice(start, start + CHUNK_SIZE);
    _sendRealtime({ type: EV_MAP_WS_CHUNK, to: userId, from: mesaMapState.myUserId,
      i, hash, data: _ab2b64(chunk) });

    // Leve throttle a cada 4 chunks para não saturar a WS connection
    if (i % 4 === 3) await new Promise(r => setTimeout(r, WS_THROTTLE_MS));
  }

  _sendRealtime({ type: EV_MAP_WS_END, to: userId, from: mesaMapState.myUserId, hash });
}

/* ── RECEPÇÃO: LADO DO JOGADOR ──────────────────────────────── */

/**
 * Registra todos os listeners de entrega de mapa para jogadores.
 * Chamado apenas em clientes não-mestre.
 */
function bindPlayerMapListeners() {
  if (!window.APP?.on) return;

  // Defesa em profundidade: o Durable Object já bloqueia sinais de
  // distribuição de mapa vindos de não-mestre, mas o cliente também
  // descarta mensagens cujo fromRole (carimbado pelo DO) não é master.
  // Mensagens sem fromRole (worker antigo) são toleradas.
  const isFromMaster = msg => !msg || msg.fromRole === undefined || msg.fromRole === "master";

  // 1. Mestre anuncia novo mapa — verificar cache primeiro
  window.APP.on(EV_MAP_ANNOUNCE, async (msg) => {
    if (!isFromMaster(msg)) return;
    const { mapId, hash, name, size, from } = msg;
    mesaMapState.remoteMapId = String(mapId || "");
    const cached = await findCachedMapByHash(hash);
    if (cached) {
      console.info(`[mesa-map] Cache hit: ${name} (hash ${hash.slice(0, 8)})`);
      await applyActiveMap(cached);
      _sendRealtime({ type: EV_MAP_HAVE, to: from, from: mesaMapState.myUserId, hash });
    } else {
      _sendRealtime({ type: EV_MAP_NEED, to: from, from: mesaMapState.myUserId, hash, name, size });
    }
  });

  // 2. Receber SDP offer do mestre → criar PeerConnection e responder
  window.APP.on(EV_MAP_OFFER, async (msg) => {
    // Filtro: aceitar só mensagens endereçadas a mim
    if (msg.to && msg.to !== mesaMapState.myUserId) return;
    await _setupInboundP2P(msg);
  });

  // 3. ICE candidate do mestre
  window.APP.on(EV_MAP_ICE, async ({ to, candidate }) => {
    if (to && to !== mesaMapState.myUserId) return;
    if (mesaInboundPeer) {
      try { await mesaInboundPeer.addIceCandidate(candidate); } catch {}
    }
  });

  // 4. Início de transfer WS
  window.APP.on(EV_MAP_WS_START, (msg) => {
    if (!isFromMaster(msg)) return;
    const { to, hash, name, size, chunks } = msg;
    if (to && to !== mesaMapState.myUserId) return;
    mesaWsBuffer.chunks   = new Array(chunks);
    mesaWsBuffer.received = 0;
    mesaWsBuffer.total    = size;
    mesaWsBuffer.hash     = hash;
    mesaWsBuffer.name     = name;
    mesaWsBuffer.size     = size;
  });

  // 5. Chunk WS
  window.APP.on(EV_MAP_WS_CHUNK, ({ to, i, hash, data }) => {
    if (to && to !== mesaMapState.myUserId) return;
    if (mesaWsBuffer.hash !== hash) return;
    mesaWsBuffer.chunks[i] = _b642ab(data);
    mesaWsBuffer.received++;
  });

  // 6. Fim de transfer WS → remontar e exibir
  window.APP.on(EV_MAP_WS_END, async ({ to, hash }) => {
    if (to && to !== mesaMapState.myUserId) return;
    if (mesaWsBuffer.hash !== hash) return;
    await _reassembleAndApply(mesaWsBuffer);
  });

  // 7. Compatibilidade Fase 3 (R2 URL direta)
  window.APP.on(EV_MAP_SET, (msg) => {
    if (!isFromMaster(msg)) return;
    if (msg.transformOnly && msg.transform) {
      // Fit antes do transform: ele decide se o transform recebido vale ou é
      // sobreposto por identidade (ver _getEffectiveMapTransform).
      _applyRemoteFit(msg.fit);
      _applyRemoteMapTransform(msg.transform, msg.mapId);
      return;
    }
    const { url, mapId } = msg;
    if (!url) return;
    _applyRemoteFit(msg.fit);
    // Caminho completo (probe de dimensões + transform pendente), igual ao
    // boot pela cena oficial — antes só trocava o background e o transform
    // do mestre nunca era aplicado neste fallback.
    _renderSceneMapFromUrl({ id: mapId || "scene-map", url, transform: null });
  });

  // 8. Mestre limpou o mapa
  window.APP.on(EV_MAP_CLEAR, (msg) => {
    if (!isFromMaster(msg)) return;
    renderMesaMapLayer("", "");
  });
}

/**
 * Cria RTCPeerConnection de entrada para receber blob do mestre.
 */
async function _setupInboundP2P({ from, sdp, hash, name, size }) {
  if (mesaInboundPeer) { mesaInboundPeer.close(); mesaInboundPeer = null; }

  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  mesaInboundPeer = pc;

  // Buffer local para P2P (mesmo protocolo map:start / chunk / map:end)
  let p2pBuf = { chunks: [], received: 0, total: 0, hash: "", name: "", size: 0 };

  pc.ondatachannel = ({ channel: dc }) => {
    dc.binaryType = "arraybuffer";

    dc.onmessage = async ({ data }) => {
      if (typeof data === "string") {
        const msg = JSON.parse(data);
        if (msg.type === "map:start") {
          p2pBuf = { chunks: new Array(msg.chunks), received: 0,
            total: msg.size, hash: msg.hash, name: msg.name, size: msg.size };
        } else if (msg.type === "map:end") {
          await _reassembleAndApply(p2pBuf);
          dc.close();
        }
      } else {
        // ArrayBuffer chunk — armazenar em ordem
        p2pBuf.chunks[p2pBuf.received++] = data;
      }
    };
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      _sendRealtime({ type: EV_MAP_ICE, to: from, from: mesaMapState.myUserId, candidate: e.candidate.toJSON() });
    }
  };

  try {
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    _sendRealtime({ type: EV_MAP_ANSWER, to: from, from: mesaMapState.myUserId, sdp: pc.localDescription.toJSON() });
  } catch (e) {
    console.error("[mesa-map] Falha ao processar offer WebRTC:", e);
  }
}

/**
 * Remonta chunks em Blob, salva no cache IndexedDB e exibe no palco.
 */
async function _reassembleAndApply(buffer) {
  if (!buffer.chunks || buffer.chunks.some(c => c == null)) {
    console.warn("[mesa-map] Reassembly incompleto, chunks faltando");
    return;
  }

  const blob = new Blob(buffer.chunks, { type: "image/webp" });

  const mapEntry = {
    id:        `cached-${buffer.hash.slice(0, 12)}`,
    name:      buffer.name,
    blob,
    hash:      buffer.hash,
    createdAt: Date.now(),
  };

  if (mesaMapState.db) {
    try { await saveMesaMapToDB(mapEntry); } catch {}
  }

  await applyActiveMap(mapEntry);

  // Confirmar ao mestre que o mapa foi recebido e exibido.
  // Isso cancela o timer de fallback R2 no lado do mestre.
  _sendRealtime({ type: EV_MAP_HAVE, hash: buffer.hash, from: mesaMapState.myUserId });
}

/* ── SINCRONIZAÇÃO REMOTA R2 (FASE 3) ──────────────────────── */

/**
 * Upload do mapa ativo para Cloudflare R2.
 * Usado apenas como último recurso (P2P + WS falharam).
 *
 * Endpoint do Worker:
 *   POST /mesa/map
 *   Body: FormData { file: Blob, mapId: string }
 *   Response: { url: string, r2Key: string }
 */
async function uploadActiveMapToR2() {
  if (!mesaMapState.activeEntry) return;
  if (mesaMapState.uploadInFlight) return;
  if (!window.AUTH?.isBackendEnabled?.()) return;

  mesaMapState.uploadInFlight = true;
  setMesaMapUploading(true);

  try {
    if (!window.APP?.uploadMesaMap) {
      console.warn("[mesa-map] Upload R2: fachada APP indisponivel.");
      return;
    }

    const { url, r2Key } = await window.APP.uploadMesaMap(
      mesaMapState.activeEntry.blob,
      mesaMapState.activeEntry.id
    );
    mesaMapState.activeMapR2Key = r2Key;
    mesaMapState.activeMapPublicUrl = url;
    mesaMapState._uploadedMapId = mesaMapState.activeEntry.id;

    // Broadcast da URL pública R2 para jogadores que ainda não têm o mapa
    _sendRealtime({
      type:  EV_MAP_SET,
      mapId: mesaMapState.activeEntry.id,
      url,
      hash:  mesaMapState.activeEntry.hash,
      name:  mesaMapState.activeEntry.name,
    });

    // Salva a referência { id, url, transform } na cena oficial — jogadores
    // passam a carregar o mapa no boot mesmo com o mestre offline.
    _persistMesaSceneMap();

    console.info("[mesa-map] Upload R2 concluído:", r2Key);
  } catch (err) {
    console.error("[mesa-map] Falha no upload R2:", err);
  } finally {
    mesaMapState.uploadInFlight = false;
    setMesaMapUploading(false);
  }
}

async function deleteActiveMapFromR2() {
  if (!mesaMapState.activeMapR2Key) return;
  if (!window.AUTH?.isBackendEnabled?.()) return;

  const r2Key = mesaMapState.activeMapR2Key;
  mesaMapState.activeMapR2Key = "";

  try {
    if (!window.APP?.deleteMesaMap) return;

    await window.APP.deleteMesaMap(r2Key);

    console.info("[mesa-map] Mapa removido do R2:", r2Key);
  } catch (err) {
    console.warn("[mesa-map] Falha ao remover do R2:", err);
  }
}

/* ── UTILITÁRIOS ────────────────────────────────────────────── */

/** ArrayBuffer → base64 (para chunks via WS JSON) */
function _ab2b64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** base64 → ArrayBuffer */
function _b642ab(b64) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Wrapper para enviar mensagem realtime (abstrai window.APP) */
function _sendRealtime(payload) {
  if (window.APP?.sendRealtime) window.APP.sendRealtime(payload);
}

/* ── UI HELPERS ─────────────────────────────────────────────── */

function setMesaMapLoading(loading) {
  const btn = document.getElementById("mesaMapOpenBtn");
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? "Carregando..." : "Abrir mapa";
}

function setMesaMapUploading(uploading) {
  const label = document.getElementById("mesaMapLabel");
  if (!label) return;
  if (uploading) {
    label.dataset.prevText = label.textContent;
    label.textContent = "Enviando...";
  } else {
    label.textContent = label.dataset.prevText || label.textContent;
    delete label.dataset.prevText;
  }
}

function toggleMapSettings() {
  const panel = document.getElementById("mesaMapTransform");
  const btn   = document.getElementById("mesaMapSettingsBtn");
  if (!panel) return;
  const isOpen = !panel.hidden;
  panel.hidden = isOpen;
  if (btn) {
    btn.setAttribute("aria-expanded", isOpen ? "false" : "true");
    btn.classList.toggle("is-active", !isOpen);
  }
  if (!isOpen && typeof isMaster === "function" && isMaster()) {
    // Controles de mapa — visíveis apenas quando há mapa ativo
    const hasMap = Boolean(mesaMapState.activeMapUrl);
    const scaleGroup = document.getElementById("mesaMapScaleGroup");
    const hint = document.getElementById("mesaMapHint");
    if (scaleGroup) scaleGroup.hidden = !hasMap;
    if (hint) hint.hidden = !hasMap;
  }
}




/* ── BIBLIOTECA DE MAPAS (Fase 3 — UI local) ────────────────── */

/**
 * Blob URLs temporários para thumbnails da biblioteca.
 * Revogados quando o painel é fechado ou o mapa é deletado.
 */
const _mapLibThumbUrls = new Map(); // mapId → blobUrl

/**
 * Renderiza a biblioteca de mapas no painel lateral.
 * Chamada ao ativar o tool "map" na toolbar.
 */
async function renderMapLibrary() {
  const container = document.getElementById("mapLibraryList");
  if (!container) return;

  if (!mesaMapState.db) {
    container.innerHTML =
      '<div class="map-lib-empty">' +
      '<strong>Banco de dados indispon\u00edvel</strong>' +
      '<p>Recarregue a p\u00e1gina e tente novamente.</p>' +
      '</div>';
    return;
  }

  let maps;
  try {
    maps = await listMesaMapsFromDB();
  } catch (err) {
    container.innerHTML =
      '<div class="map-lib-empty">' +
      '<strong>Erro ao carregar mapas</strong>' +
      '<p>Tente novamente.</p>' +
      '</div>';
    return;
  }

  if (!maps.length) {
    container.innerHTML =
      '<div class="map-lib-empty">' +
      '<strong>Nenhum mapa salvo</strong>' +
      '<p>Use <strong>Importar</strong> para adicionar imagens \u00e0 sua biblioteca local.</p>' +
      '</div>';
    return;
  }

  // Revogar thumbs antigos antes de recriar
  _mapLibThumbUrls.forEach(function(url) { URL.revokeObjectURL(url); });
  _mapLibThumbUrls.clear();

  const activeId = mesaMapState.activeMapId;

  const cards = maps.map(function(m) {
    const thumbUrl = URL.createObjectURL(m.blob);
    _mapLibThumbUrls.set(m.id, thumbUrl);

    const isActive  = m.id === activeId;
    const sizeKB    = Math.round((m.blob && m.blob.size ? m.blob.size : 0) / 1024);
    const sizeLabel = sizeKB >= 1024
      ? (sizeKB / 1024).toFixed(1) + " MB"
      : sizeKB + " KB";
    const dateLabel = m.createdAt
      ? new Date(m.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
      : "";

    const actionBtn = isActive
      ? '<button type="button" class="mini-btn is-danger" data-lib-action="remove" data-map-id="' + m.id + '">Retirar</button>'
      : '<button type="button" class="mini-btn is-primary" data-lib-action="set" data-map-id="' + m.id + '">Colocar</button>';

    const activePill = isActive ? '<span class="map-lib-active-pill">Na mesa</span>' : "";

    return '<article class="map-lib-entry' + (isActive ? " is-active" : "") + '" data-map-id="' + m.id + '">' +
      '<div class="map-lib-thumb" style="background-image:url(\'' + thumbUrl + '\')" aria-hidden="true"></div>' +
      '<div class="map-lib-info">' +
        '<strong class="map-lib-name" title="' + _escAttr(m.name) + '">' + _escHtml(m.name) + '</strong>' +
        '<span class="map-lib-meta">' + sizeLabel + (dateLabel ? " &middot; " + dateLabel : "") + '</span>' +
        activePill +
      '</div>' +
      '<div class="map-lib-actions">' +
        actionBtn +
        '<button type="button" class="mini-btn map-lib-delete-btn" data-lib-action="delete" data-map-id="' + m.id + '" title="Excluir da biblioteca">&#215;</button>' +
      '</div>' +
    '</article>';
  });

  container.innerHTML = cards.join("");

  // Atualizar label de espaço total
  var totalBytes = maps.reduce(function(sum, m) { return sum + (m.blob && m.blob.size ? m.blob.size : 0); }, 0);
  // Inclui tamanho dos arquivos da pasta conectada no contador
  var cfBytes = connectedFolder.entries.reduce(function(sum, e) { return sum + (e.size || 0); }, 0);
  var storageLabel = document.getElementById("mapLibStorageLabel");
  if (storageLabel) storageLabel.textContent = _formatLibBytes(totalBytes + cfBytes);
}

/** Ativa um mapa da biblioteca como mapa da mesa. */
async function setActiveMapFromLibrary(mapId) {
  if (!mesaMapState.db) return;
  const mapEntry = await loadMesaMapFromDB(mapId);
  if (!mapEntry) return;

  setMesaMapLoading(true);
  try {
    await applyActiveMap(mapEntry);
    mesaMapState.activeEntry = mapEntry;
    if (mesaMapState.playersOnline) {
      announceMapToPlayers(mapEntry);
    }
    // R2 + cena oficial (jogadores offline/futuros recebem no boot)
    _ensureActiveMapPersisted();
    await renderMapLibrary();
  } finally {
    setMesaMapLoading(false);
  }
}

/** Remove o mapa ativo da mesa (mantém na biblioteca). */
function removeActiveMapFromMesa() {
  clearActiveMap();
  renderMapLibrary();
}

/** Deleta um mapa da biblioteca local (IndexedDB). */
async function deleteMapFromLibrary(mapId) {
  if (!mesaMapState.db) return;
  if (mesaMapState.activeMapId === mapId) {
    clearActiveMap();
  }
  const thumbUrl = _mapLibThumbUrls.get(mapId);
  if (thumbUrl) {
    URL.revokeObjectURL(thumbUrl);
    _mapLibThumbUrls.delete(mapId);
  }
  try {
    await deleteMesaMapFromDB(mapId);
  } catch (err) {
    console.error("[mesa-map] Falha ao deletar mapa:", err);
  }
  await renderMapLibrary();
}

/** Importa um arquivo novo e adiciona à biblioteca (sem colocar na mesa automaticamente). */
async function importMapToLibrary() {
  const file = await pickLocalMapFile();
  if (!file) return;

  const importBtn = document.getElementById("mapLibImportBtn");
  if (importBtn) { importBtn.disabled = true; }

  try {
    const mapId   = "map-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    const mapName = file.name.replace(/\.[^.]+$/, "");
    const rawBlob = new Blob([await file.arrayBuffer()], { type: file.type });

    const compressed = await compressToWebP(rawBlob);
    const hash       = await computeBlobHash(compressed);

    // Se já existe mapa com o mesmo hash, apenas re-renderiza
    const existing = await findCachedMapByHash(hash);
    if (existing) {
      await renderMapLibrary();
      return;
    }

    const mapEntry = {
      id:        mapId,
      name:      mapName,
      blob:      compressed,
      hash:      hash,
      createdAt: Date.now(),
    };

    await saveMesaMapToDB(mapEntry);
    await renderMapLibrary();
  } catch (err) {
    console.error("[mesa-map] Falha ao importar mapa:", err);
  } finally {
    if (importBtn) { importBtn.disabled = false; }
  }
}

/* ── IMPORT DE PASTA INTEIRA ────────────────────────────────── */

const _IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;

async function importFolderToLibrary() {
  var entries = [];

  if ("showDirectoryPicker" in window) {
    try {
      var dirHandle = await window.showDirectoryPicker({ mode: "read" });
      entries = await _collectImagesFromDir(dirHandle, "");
    } catch (err) {
      if (err.name === "AbortError") return;
      entries = await _pickFolderFallback();
    }
  } else {
    entries = await _pickFolderFallback();
  }

  if (!entries.length) return;

  var folderBtn = document.getElementById("mapLibFolderBtn");
  if (folderBtn) { folderBtn.disabled = true; }

  var done = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    try {
      var rawBlob  = new Blob([await entry.file.arrayBuffer()], { type: entry.file.type || "image/*" });
      var webp     = await compressToWebP(rawBlob);
      var hash     = await computeBlobHash(webp);
      var existing = await findCachedMapByHash(hash);

      if (!existing) {
        await saveMesaMapToDB({
          id:        "map-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
          name:      entry.name,
          blob:      webp,
          hash:      hash,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      console.warn("[mesa-map] Ignorado:", entry.name, err.message);
    }
    done++;
    if (folderBtn) folderBtn.title = "Importando " + done + "/" + entries.length;
  }

  if (folderBtn) { folderBtn.disabled = false; folderBtn.title = "Importar pasta inteira"; folderBtn.classList.remove("is-loading"); }
  await renderMapLibrary();
}

async function _collectImagesFromDir(dirHandle, prefix) {
  var result = [];
  var IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
  for await (var item of dirHandle.entries()) {
    var entryName = item[0];
    var handle    = item[1];
    if (handle.kind === "file" && IMAGE_EXT.test(entryName)) {
      var file = await handle.getFile();
      var base = entryName.replace(IMAGE_EXT, "");
      result.push({ file: file, name: prefix ? prefix + " / " + base : base });
    } else if (handle.kind === "directory") {
      var subPrefix = prefix ? prefix + " / " + entryName : entryName;
      var sub = await _collectImagesFromDir(handle, subPrefix);
      result = result.concat(sub);
    }
  }
  return result;
}

function _pickFolderFallback() {
  return new Promise(function (resolve) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.webkitdirectory = true;
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", function () {
      document.body.removeChild(input);
      var IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
      var files = Array.from(input.files || []).filter(function (f) {
        return IMAGE_EXT.test(f.name);
      });
      var entries = files.map(function (f) {
        var parts = f.webkitRelativePath
          ? f.webkitRelativePath.split("/")
          : [f.name];
        var inner = parts.slice(1);
        if (!inner.length) inner.push(f.name);
        inner[inner.length - 1] = inner[inner.length - 1].replace(IMAGE_EXT, "");
        return { file: f, name: inner.join(" / ") };
      });
      resolve(entries);
    }, { once: true });

    input.addEventListener("cancel", function () {
      document.body.removeChild(input);
      resolve([]);
    }, { once: true });

    input.click();
  });
}

/* ── HANDLER DELEGADO para acoes da biblioteca ───────────────── */
(function () {
  document.addEventListener("click", function (e) {
    // Cancelar confirmacao
    var cancelBtn = e.target.closest("[data-lib-cancel]");
    if (cancelBtn) {
      var row    = cancelBtn.closest(".map-lib-confirm-row");
      var entry  = cancelBtn.closest(".map-lib-entry");
      var delBtn = entry && entry.querySelector(".map-lib-delete-btn");
      if (row) { clearTimeout(parseInt(row.dataset.tid || "0")); row.remove(); }
      if (delBtn) { delBtn.hidden = false; }
      return;
    }

    var btn = e.target.closest("[data-lib-action]");
    if (!btn) return;
    var action = btn.dataset.libAction;
    var mapId  = btn.dataset.mapId;
    if (!mapId) return;

    if (action === "set")    { setActiveMapFromLibrary(mapId); return; }
    if (action === "remove") { removeActiveMapFromMesa(); return; }

    if (action === "delete") {
      if (btn.dataset.confirming === "1") {
        deleteMapFromLibrary(mapId);
        return;
      }

      // Primeiro clique no x: mostrar [Sim] [Nao] inline
      btn.hidden = true;

      var row = document.createElement("div");
      row.className = "map-lib-confirm-row";

      row.innerHTML =
        '<button type="button" class="mini-btn is-danger" ' +
          'data-lib-action="delete" data-map-id="' + mapId + '" data-confirming="1">Sim</button>' +
        '<button type="button" class="mini-btn" ' +
          'data-lib-cancel="' + mapId + '">Nao</button>';

      btn.parentNode.appendChild(row);

      // Auto-cancelar em 4 s
      var tid = setTimeout(function () {
        if (row.parentNode) row.remove();
        btn.hidden = false;
      }, 4000);
      row.dataset.tid = String(tid);
    }
  });
})();

function _formatLibBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/* Helpers de escape para HTML gerado na biblioteca */
function _escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function _escAttr(str) {
  return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}


/* ============================================================
 * PASTA CONECTADA — monitoramento em tempo real
 * ============================================================
 * Os mapas aparecem na sidebar SEM salvar no IndexedDB.
 * Só entram no banco quando os jogadores precisam ver a cena.
 * ============================================================ */

/* ── CONSTANTES DA PASTA CONECTADA ──────────────────────────── */


/* ── CONECTAR / DESCONECTAR ─────────────────────────────────── */

/**
 * Abre o seletor de pasta nativa, salva o handle no IDB e inicia
 * o monitoramento em tempo real. Sem copiar nada para o banco.
 */
async function connectLocalFolder() {
  if (!window.showDirectoryPicker) {
    alert("Seu navegador nao suporta acesso a pastas locais. Use Chrome 86+ ou Edge.");
    return;
  }
  try {
    // id="armagedom_cf" faz o Chrome lembrar a ultima pasta usada:
    // o seletor ja abre direto nela na proxima vez.
    var handle = await window.showDirectoryPicker({ mode: "read", id: "armagedom_cf" });
    connectedFolder.handle          = handle;
    connectedFolder.name            = handle.name;
    connectedFolder.permissionState = "granted";
    connectedFolder._activePath     = "";
    connectedFolder.entries         = [];
    connectedFolder.snapshot        = new Map();

    // Salvar nome no localStorage (fallback de UI imediato)
    try { localStorage.setItem("tc_cf_folder_name", handle.name); } catch {}

    // Salvar handle no IDB aguardando confirmacao para detectar falhas
    try {
      await _saveCFHandleToIDB(handle);
    } catch (saveErr) {
      console.warn("[mesa-map] Handle nao salvo no IDB:", saveErr);
      // Marcar no estado para que o banner informe o usuario
      connectedFolder._idbSaveFailed = true;
    }

    // Renderiza imediatamente com estado "conectando..."
    renderConnectedFolderUI();

    // Varre a pasta e re-renderiza com os arquivos encontrados
    await _pollConnectedFolder(true);
  } catch (err) {
    if (err && err.name !== "AbortError") {
      console.warn("[mesa-map] connectLocalFolder:", err);
      connectedFolder.handle = null;
      renderConnectedFolderUI();
    }
  }
}

/**
 * Desconecta a pasta: para o polling, limpa estado e remove do IDB.
 */
async function disconnectLocalFolder() {
  // Revogar thumbnails em cache
  connectedFolder.thumbUrls.forEach(function(url) { URL.revokeObjectURL(url); });
  connectedFolder.thumbUrls = new Map();

  // Limpar mapa ativo se veio da pasta conectada
  if (connectedFolder._activePath) {
    connectedFolder._activePath = "";
    clearActiveMap();
  }

  connectedFolder.handle          = null;
  connectedFolder.name            = "";
  connectedFolder.entries         = [];
  connectedFolder.snapshot        = new Map();
  connectedFolder.permissionState = "";
  connectedFolder._idbSaveFailed  = false;

  await _deleteCFHandleFromIDB();
  try { localStorage.removeItem("tc_cf_folder_name"); } catch {}

  // Cancelar reconexao automatica pendente (se existir)
  if (document._cfAutoReconnectHandler) {
    document.removeEventListener("click", document._cfAutoReconnectHandler, true);
    document._cfAutoReconnectHandler = null;
  }

  renderConnectedFolderUI();
}

/**
 * Solicita permissao de leitura novamente (requer gesto do usuario).
 * Chamado pelo botao "Reconectar" quando permissao foi revogada.
 */
async function reconnectLocalFolder() {
  if (!connectedFolder.handle) return;
  try {
    var perm = await connectedFolder.handle.requestPermission({ mode: "read" });
    connectedFolder.permissionState = perm;
    if (perm === "granted") {
      await _pollConnectedFolder();
    }
    renderConnectedFolderUI();
  } catch (err) {
    console.warn("[mesa-map] reconnectLocalFolder:", err);
  }
}

/* ── RESTAURAR AO CARREGAR A PAGINA ─────────────────────────── */

/**
 * Tenta restaurar o handle da pasta conectada do IDB ao iniciar.
 * Se a permissao ainda for valida, inicia o polling imediatamente.
 * Se nao, mostra o botao "Reconectar" (sem interromper o usuario).
 */
async function _restoreConnectedFolder() {
  // Fallback: mesmo sem IDB, localStorage guarda o nome da pasta
  // para que o banner de reconexao apareça apos reload.
  var savedName = "";
  try { savedName = localStorage.getItem("tc_cf_folder_name") || ""; } catch {}

  var handle = null;

  if (mesaMapState.db) {
    try {
      var record = await new Promise(function(resolve) {
        var tx  = mesaMapState.db.transaction(MESA_MAP_SETTINGS_STORE, "readonly");
        var req = tx.objectStore(MESA_MAP_SETTINGS_STORE).get("connectedFolderHandle");
        req.onsuccess = function() { resolve(req.result); };
        req.onerror   = function() { resolve(null); };
      });
      if (record && record.value) handle = record.value;
    } catch (e) {
      console.warn("[mesa-map] Leitura IDB handle:", e);
    }
  }

  // Nem IDB nem localStorage — nada a restaurar
  if (!handle && !savedName) return;

  // Definir handle e nome ANTES de qualquer operacao assincrona
  // para garantir que o banner de reconexao sempre apareca
  connectedFolder.handle          = handle;
  connectedFolder.name            = handle ? handle.name : savedName;
  connectedFolder.permissionState = "prompt"; // padrao conservador

  if (handle) {
    try {
      var perm = await handle.queryPermission({ mode: "read" });
      connectedFolder.permissionState = perm;
      if (perm === "granted") {
        // Permissao ainda valida — reconecta em silencio
        await _pollConnectedFolder();
        renderConnectedFolderUI();
        return;
      }
    } catch (permErr) {
      console.warn("[mesa-map] queryPermission:", permErr);
    }
  }

  // Permissao precisa de gesto do usuario.
  // Registrar listener unico: no primeiro clique em qualquer lugar da pagina,
  // pedir permissao automaticamente — sem o usuario ter que achar um botao.
  renderConnectedFolderUI();

  if (handle) {
    _registerAutoReconnectOnClick(handle);
  }
}

/**
 * Registra um listener de clique unico em todo o document.
 * No primeiro clique (qualquer elemento), tenta requestPermission silenciosamente.
 * Remove-se automaticamente apos a primeira tentativa.
 */
function _registerAutoReconnectOnClick(handle) {
  // Evita duplicatas
  if (document._cfAutoReconnectHandler) return;

  function handler() {
    document.removeEventListener("click", handler, true);
    document._cfAutoReconnectHandler = null;

    // So executa se o handle ainda é o mesmo (usuario nao desconectou)
    if (connectedFolder.handle !== handle) return;
    if (connectedFolder.permissionState === "granted") return;

    handle.requestPermission({ mode: "read" }).then(function(perm) {
      connectedFolder.permissionState = perm;
      if (perm === "granted") {
        return _pollConnectedFolder(true);
      }
    }).then(function() {
      renderConnectedFolderUI();
    }).catch(function(e) {
      console.warn("[mesa-map] auto-reconexao:", e);
      renderConnectedFolderUI();
    });
  }

  document._cfAutoReconnectHandler = handler;
  // capture:true garante que o evento chega antes de qualquer stopPropagation
  document.addEventListener("click", handler, true);
}

/* ── VARREDURA MANUAL DA PASTA ───────────────────────────────── */

/**
 * Varre a pasta e atualiza a lista de entradas.
 * Chamado manualmente pelo botao de recarregar ou ao conectar/reconectar.
 */
async function _pollConnectedFolder(force) {
  if (!connectedFolder.handle) return;

  var entries;
  try {
    entries = await _scanDir(connectedFolder.handle, "");
  } catch (err) {
    // Permissao revogada ou pasta removida
    if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
      connectedFolder.permissionState = "denied";
      renderConnectedFolderUI();
    }
    return;
  }

  // Verificar se houve mudancas
  var changed = false;
  if (entries.length !== connectedFolder.snapshot.size) {
    changed = true;
  } else {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var prev = connectedFolder.snapshot.get(e.path);
      if (prev === undefined || prev !== e.lastModified) {
        changed = true;
        break;
      }
    }
  }

  if (!changed && !force) return;

  // Atualizar snapshot
  var newSnap = new Map();
  for (var j = 0; j < entries.length; j++) {
    newSnap.set(entries[j].path, entries[j].lastModified);
  }

  // Revogar thumbs de entradas que sumiram
  connectedFolder.snapshot.forEach(function(_, path) {
    if (!newSnap.has(path) && connectedFolder.thumbUrls.has(path)) {
      URL.revokeObjectURL(connectedFolder.thumbUrls.get(path));
      connectedFolder.thumbUrls.delete(path);
    }
  });

  connectedFolder.snapshot = newSnap;
  connectedFolder.entries  = entries;

  // Gerar thumbnails para entradas novas
  await _generateMissingThumbs(entries);

  renderConnectedFolderUI();
}

/**
 * Recarga manual da pasta — chamado pelo botao de refresh.
 * Mostra animacao girando no botao durante o scan.
 */
function cfRefresh() {
  var btn = document.getElementById("cfRefreshBtn");
  if (btn) btn.classList.add("is-spinning");
  _pollConnectedFolder(true).catch(function(e) {
    console.warn("[mesa-map] cfRefresh:", e);
  }).finally(function() {
    // Garante re-render mesmo sem mudancas, para dar feedback visual
    renderConnectedFolderUI();
    // Remove animacao (o botao sera re-criado pelo render, mas por seguranca)
    var b2 = document.getElementById("cfRefreshBtn");
    if (b2) b2.classList.remove("is-spinning");
  });
}

/**
 * Recursivo: escaneia dirHandle retornando array de entradas de imagem.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} prefix - caminho relativo acumulado (sem barra inicial)
 * @returns {Promise<Array<{path,fullName,handle,size,lastModified}>>}
 */
async function _scanDir(dirHandle, prefix) {
  var results = [];
  for await (var entry of dirHandle.values()) {
    if (entry.kind === "file") {
      if (_IMAGE_EXT.test(entry.name)) {
        var file = await entry.getFile();
        var path = prefix ? prefix + "/" + entry.name : entry.name;
        var displayName = path.replace(/\//g, " / ");
        results.push({
          path:         path,
          fullName:     displayName,
          handle:       entry,
          size:         file.size,
          lastModified: file.lastModified,
        });
      }
    } else if (entry.kind === "directory") {
      var subPrefix = prefix ? prefix + "/" + entry.name : entry.name;
      var sub = await _scanDir(entry, subPrefix);
      results = results.concat(sub);
    }
  }
  // Ordenar alfabeticamente por path para ordem consistente entre reloads
  results.sort(function(a, b) {
    return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
  });
  return results;
}

/**
 * Gera thumbnails (blob: URL) para entradas que ainda nao tem.
 * Limita a leitura paralela para nao travar o I/O.
 */
async function _generateMissingThumbs(entries) {
  // Coleta todas as entradas sem thumbnail ainda
  var missing = entries.filter(function(en) {
    return !connectedFolder.thumbUrls.has(en.path);
  });
  if (missing.length === 0) return;

  // Processa em lotes de 10 em paralelo sem travar o I/O.
  // NAO chama renderConnectedFolderUI() a cada lote — isso destruiria
  // o estado open/closed das subpastas (<details>).
  // Em vez disso, gera todos os blob: URLs em background e depois
  // faz um unico patch no DOM atualizando so os style.backgroundImage.
  var BATCH = 10;
  for (var start = 0; start < missing.length; start += BATCH) {
    var chunk = missing.slice(start, start + BATCH);
    await Promise.all(chunk.map(async function(en) {
      try {
        var file = await en.handle.getFile();
        var url  = URL.createObjectURL(file);
        connectedFolder.thumbUrls.set(en.path, url);
      } catch (e) { /* ignore */ }
    }));
  }

  // Patch cirurgico unico ao final: percorre todos os .map-lib-thumb
  // ja renderizados e aplica o backgroundImage pelo data-cf-path.
  // Nao reconstroi o HTML — preserva estado open/closed das subpastas.
  _patchThumbsInDOM();
}

/**
 * Atualiza o style.backgroundImage de cada miniatura ja no DOM
 * usando os blob: URLs gerados em _generateMissingThumbs.
 * Operacao segura de chamar a qualquer momento, inclusive com painel oculto.
 */
function _patchThumbsInDOM() {
  var container = document.getElementById("vttConnectedFolder");
  if (!container) return;
  var thumbEls = container.querySelectorAll(".map-lib-thumb[data-cf-path]");
  thumbEls.forEach(function(el) {
    var cfPath = el.getAttribute("data-cf-path");
    var url    = connectedFolder.thumbUrls.get(cfPath);
    if (url && !el.style.backgroundImage) {
      el.style.backgroundImage = "url('" + url + "')";
    }
  });
}

/* ── APLICAR MAPA DA PASTA CONECTADA ────────────────────────── */

/**
 * Le o arquivo via File System Access API, comprime para WebP e
 * aplica na mesa — SEM salvar no IndexedDB.
 * @param {string} path - caminho relativo dentro da pasta conectada
 */
async function setMapFromConnectedFolder(path) {
  var entry = connectedFolder.entries.find(function(e) { return e.path === path; });
  if (!entry) return;

  // Feedback visual imediato
  connectedFolder._activePath = path;
  renderConnectedFolderUI();

  try {
    var file = await entry.handle.getFile();
    var compressed = await compressToWebP(file);
    var blobUrl    = URL.createObjectURL(compressed);
    var hash       = await computeBlobHash(compressed);

    // Limpar mapa IDB ativo (se havia)
    if (mesaMapState.activeMapUrl) {
      URL.revokeObjectURL(mesaMapState.activeMapUrl);
    }
    // Mapas da pasta conectada agora têm entry completo ({id, name, blob,
    // hash}) — sem isso eles nunca eram anunciados nem persistidos, e os
    // jogadores ficavam em "SEM MAPA" mesmo online (bug crítico).
    var cfEntry = {
      id:   "cf-" + hash.slice(0, 12),
      name: entry.fullName,
      blob: compressed,
      hash: hash,
    };
    mesaMapState.activeMapId  = cfEntry.id;
    mesaMapState.activeEntry  = cfEntry;
    mesaMapState.activeMapUrl = blobUrl;
    try { localStorage.removeItem(MESA_MAP_ACTIVE_KEY); } catch {}

    renderMesaMapLayer(blobUrl, entry.fullName);
    resetMapTransform();

    if (mesaMapState.playersOnline) {
      announceMapToPlayers(cfEntry);
    }
    // R2 + cena oficial (jogadores offline/futuros recebem no boot)
    _ensureActiveMapPersisted();

    // Persistir mapa ativo no IDB para sobreviver ao reload
    _saveCFActiveMapToIDB(compressed, entry.fullName, path).catch(function() {});

    // Re-renderizar biblioteca IDB (para desmarcar is-active)
    renderMapLibrary();
  } catch (err) {
    console.warn("[mesa-map] setMapFromConnectedFolder:", err);
    connectedFolder._activePath = "";
    renderConnectedFolderUI();
  }
}

/* ── RENDERIZACAO DA PASTA CONECTADA ─────────────────────────── */

/**
 * Renderiza a secao da pasta conectada dentro de #vttConnectedFolder.
 * Chamado apos cada poll, conexao, desconexao ou mudanca de estado.
 */
function renderConnectedFolderUI() {
  var container = document.getElementById("vttConnectedFolder");
  if (!container) return;

  if (!connectedFolder.handle) {
    // Se temos o nome salvo no localStorage mas perdemos o handle (IDB falhou),
    // mostrar o banner de reconexão em vez do prompt inicial.
    if (connectedFolder.name) {
      container.innerHTML =
        '<div class="map-lib-reconnect-banner">' +
          '<div class="map-lib-reconnect-info">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
                 'stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
              '<path d="M1.5 4.5h4l1.5 2h7v7h-13v-9z"/>' +
            '</svg>' +
            '<span class="map-lib-reconnect-name">' + _escHtml(connectedFolder.name) + '</span>' +
          '</div>' +
          '<p class="map-lib-reconnect-hint">O seletor j&aacute; abrir&aacute; na pasta correta &mdash; basta confirmar.</p>' +
          '<button type="button" class="map-lib-connect-btn" onclick="connectLocalFolder()">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
                 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
                 'width="13" height="13">' +
              '<path d="M13.5 8A5.5 5.5 0 1 1 10 3"/>' +
              '<polyline points="10 1 10 4 13 4"/>' +
            '</svg>' +
            'Reconectar pasta' +
          '</button>' +
          '<button type="button" class="map-lib-reconnect-dismiss" onclick="disconnectLocalFolder()">' +
            'Esquecer pasta' +
          '</button>' +
        '</div>';
      return;
    }
    // Prompt de conexao inicial (sem pasta salva)
    container.innerHTML =
      '<div class="map-lib-connect-prompt">' +
        '<button type="button" class="map-lib-connect-btn" onclick="connectLocalFolder()">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
               'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
               'width="14" height="14">' +
            '<path d="M1.5 4.5h4l1.5 2h7v7h-13v-9z"/>' +
          '</svg>' +
          'Conectar pasta local' +
        '</button>' +
        '<p class="map-lib-connect-hint">Monitoramento em tempo real &mdash; sem salvar no banco</p>' +
      '</div>';
    return;
  }

  var isGranted = connectedFolder.permissionState === "granted";

  // ── Estado: aguardando reconexao apos reload ────────────────
  if (!isGranted) {
    container.innerHTML =
      '<div class="map-lib-reconnect-banner">' +
        '<div class="map-lib-reconnect-info">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
               'stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
            '<path d="M1.5 4.5h4l1.5 2h7v7h-13v-9z"/>' +
          '</svg>' +
          '<span class="map-lib-reconnect-name">' + _escHtml(connectedFolder.name) + '</span>' +
        '</div>' +
        '<p class="map-lib-reconnect-hint">O navegador precisa de permiss&atilde;o novamente ap&oacute;s recarregar a p&aacute;gina.</p>' +
        '<button type="button" class="map-lib-connect-btn" onclick="reconnectLocalFolder()">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
               'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
               'width="13" height="13">' +
            '<path d="M13.5 8A5.5 5.5 0 1 1 10 3"/>' +
            '<polyline points="10 1 10 4 13 4"/>' +
          '</svg>' +
          'Reconectar pasta' +
        '</button>' +
        '<button type="button" class="map-lib-reconnect-dismiss" onclick="disconnectLocalFolder()" ' +
          'title="Esquecer esta pasta">' +
          'Esquecer pasta' +
        '</button>' +
      '</div>';
    return;
  }

  // ── Estado: conectado ────────────────────────────────────────
  var entryCount = connectedFolder.entries.length;

  var headerHtml =
    '<div class="map-lib-connected-head">' +
      '<div class="map-lib-connected-info">' +
        '<span class="map-lib-connected-dot"></span>' +
        '<span class="map-lib-connected-name">' + _escHtml(connectedFolder.name) + '</span>' +
        (entryCount > 0
          ? '<span class="map-lib-connected-count">' + entryCount + '</span>'
          : '') +
      '</div>' +
      '<div class="map-lib-connected-actions">' +
        '<button type="button" class="mesa-map-settings-btn" id="cfRefreshBtn" ' +
            'onclick="cfRefresh()" title="Recarregar pasta" aria-label="Recarregar pasta">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
               'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">' +
            '<path d="M13.5 8A5.5 5.5 0 1 1 10 3"/>' +
            '<polyline points="10 1 10 4 13 4"/>' +
          '</svg>' +
        '</button>' +
        '<button type="button" class="mesa-map-settings-btn" onclick="disconnectLocalFolder()" ' +
          'title="Desconectar pasta" aria-label="Desconectar pasta">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
               'stroke-width="1.5" stroke-linecap="round" width="13" height="13">' +
            '<line x1="3" y1="3" x2="13" y2="13"/>' +
            '<line x1="13" y1="3" x2="3" y2="13"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +
    '</div>';

  var listHtml = entryCount === 0
    ? '<div class="map-lib-empty">' +
        '<strong>Pasta vazia</strong>' +
        '<p>Adicione imagens na pasta para elas aparecerem aqui.</p>' +
      '</div>'
    : _renderConnectedCards(connectedFolder.entries, connectedFolder._activePath);

  container.innerHTML = headerHtml + listHtml;
}

/**
 * Gera o HTML dos cards de mapa para a pasta conectada.
 * @param {Array} entries
 * @param {string} activePath
 * @returns {string}
 */
/**
 * Agrupa as entradas da pasta conectada por subpasta de primeiro nivel.
 * Arquivos na raiz aparecem direto; subpastas aparecem como grupos recolhiveis.
 */
function _renderConnectedCards(entries, activePath) {
  if (!entries || entries.length === 0) return "";

  var rootEntries = [];
  var groups      = {};  // groupName -> [entry, ...]
  var groupOrder  = [];  // manter ordem de aparicao

  for (var i = 0; i < entries.length; i++) {
    var en    = entries[i];
    var slash = en.path.indexOf("/");
    if (slash === -1) {
      rootEntries.push(en);
    } else {
      var gName = en.path.substring(0, slash);
      if (!groups[gName]) { groups[gName] = []; groupOrder.push(gName); }
      groups[gName].push(en);
    }
  }

  var html = '<div class="map-lib-list">';

  // Arquivos na raiz (sem subpasta)
  for (var r = 0; r < rootEntries.length; r++) {
    html += _renderCFCard(rootEntries[r], activePath);
  }

  // Grupos de subpastas
  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gn       = groupOrder[gi];
    var gEntries = groups[gn];
    var hasActive = false;
    for (var k = 0; k < gEntries.length; k++) {
      if (gEntries[k].path === activePath) { hasActive = true; break; }
    }

    html +=
      '<details class="map-lib-folder-group"' + (hasActive ? " open" : "") + ">" +
        '<summary class="map-lib-folder-summary">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
               'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ' +
               'width="12" height="12" aria-hidden="true">' +
            '<path d="M1.5 4.5h4l1.5 2h7v7h-13v-9z"/>' +
          "</svg>" +
          '<span class="map-lib-folder-gname">' + _escHtml(gn) + "</span>" +
          '<span class="map-lib-folder-gcount">' + gEntries.length + "</span>" +
        "</summary>" +
        '<div class="map-lib-folder-body">';

    for (var j = 0; j < gEntries.length; j++) {
      html += _renderCFCard(gEntries[j], activePath);
    }
    html += "</div></details>";
  }

  html += "</div>";
  return html;
}

/** Renderiza um unico card de mapa da pasta conectada. */
function _renderCFCard(en, activePath) {
  var isAct    = en.path === activePath;
  var thumbUrl = connectedFolder.thumbUrls.get(en.path) || "";
  // Mostrar apenas o nome do arquivo (sem caminho da subpasta)
  var slash    = en.path.lastIndexOf("/");
  var dispName = slash === -1 ? en.path : en.path.substring(slash + 1);
  var sizeStr  = _formatLibBytes(en.size);
  var bgStyle  = thumbUrl ? "background-image:url('" + thumbUrl + "')" : "";

  return (
    '<div class="map-lib-entry' + (isAct ? " is-active" : "") + '">' +
      '<div class="map-lib-thumb" data-cf-path="' + _escAttr(en.path) + '" style="' + bgStyle + '"></div>' +
      '<div class="map-lib-info">' +
        '<span class="map-lib-name">' + _escHtml(dispName) + "</span>" +
        '<span class="map-lib-meta">' + sizeStr +
          (isAct ? ' &nbsp;<span class="map-lib-active-pill">ATIVO</span>' : "") +
        "</span>" +
      "</div>" +
      '<div class="map-lib-actions">' +
        (isAct
          ? '<button type="button" class="mini-btn" ' +
              'data-cf-action="remove" data-cf-path="">&#x25A1; Remover</button>'
          : '<button type="button" class="mini-btn" ' +
              'data-cf-action="set" data-cf-path="' + _escAttr(en.path) + '">&#x25B6; Usar</button>') +
      "</div>" +
    "</div>"
  );
}

function _saveCFHandleToIDB(handle) {
  return new Promise(function(resolve, reject) {
    if (!mesaMapState.db) { resolve(); return; }
    try {
      var tx    = mesaMapState.db.transaction(MESA_MAP_SETTINGS_STORE, "readwrite");
      var store = tx.objectStore(MESA_MAP_SETTINGS_STORE);
      store.put({ key: "connectedFolderHandle", value: handle });
      tx.oncomplete = function() { resolve(); };
      tx.onerror    = function(e) { reject(e.target.error); };
      tx.onabort    = function(e) { reject(new Error("IDB transaction aborted: " + (e.target.error || "unknown"))); };
    } catch (e) {
      reject(e);
    }
  });
}

function _saveCFActiveMapToIDB(blob, name, cfPath) {
  return new Promise(function(resolve, reject) {
    if (!mesaMapState.db) { resolve(); return; }
    try {
      var tx    = mesaMapState.db.transaction(MESA_MAP_SETTINGS_STORE, "readwrite");
      var store = tx.objectStore(MESA_MAP_SETTINGS_STORE);
      store.put({ key: "cfActiveMap", value: { blob: blob, name: name, cfPath: cfPath } });
      tx.oncomplete = function() { resolve(); };
      tx.onerror    = function(e) { reject(e.target.error); };
      tx.onabort    = function(e) { reject(new Error("IDB transaction aborted")); };
    } catch (e) {
      reject(e);
    }
  });
}

function _deleteCFActiveMapFromIDB() {
  return new Promise(function(resolve, reject) {
    if (!mesaMapState.db) { resolve(); return; }
    var tx    = mesaMapState.db.transaction(MESA_MAP_SETTINGS_STORE, "readwrite");
    var store = tx.objectStore(MESA_MAP_SETTINGS_STORE);
    store.delete("cfActiveMap");
    tx.oncomplete = function() { resolve(); };
    tx.onerror    = function(e) { reject(e.target.error); };
  });
}

/* ── DELEGATED HANDLER PARA ACOES DA PASTA CONECTADA ───────────── */

(function () {
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-cf-action]");
    if (!btn) return;

    var action = btn.dataset.cfAction;
    var path   = btn.dataset.cfPath;

    if (action === "set")    { setMapFromConnectedFolder(path); return; }
    if (action === "remove") { clearActiveMap(); renderMapLibrary(); renderConnectedFolderUI(); return; }
  });
})();
