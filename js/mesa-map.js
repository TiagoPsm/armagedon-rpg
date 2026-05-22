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
 *  - Compressão WebP antes de qualquer transferência
 *    PNG 15 MB → WebP ~350 KB (Canvas API, max 1920 px)
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
const MESA_MAP_DB_VERSION = 1;
const MESA_MAP_STORE      = "maps";
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

// Parâmetros de compressão
const WEBP_MAX_PX   = 1920;   // maior dimensão em pixels
const WEBP_QUALITY  = 0.82;   // 0-1, 0.82 é ótimo equilíbrio tamanho/qualidade

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
  // mapa ativo com blob comprimido (cache em memória evita re-comprimir)
  activeEntry:    null,   // { id, name, blob (original), compressedBlob, hash }
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
    await restoreActiveMap();
    bindMesaMapPresence();

    if (mesaMapState.isMaster) {
      bindMasterMapListeners();
    } else {
      bindPlayerMapListeners();
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
  let { width, height } = bitmap;

  // Escalar mantendo proporção, só se necessário
  const ratio = Math.min(maxPx / width, maxPx / height, 1);
  width  = Math.round(width  * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close(); // libera memória do ImageBitmap

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error("[mesa-map] toBlob retornou null")),
      "image/webp",
      quality
    );
  });
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

  try { localStorage.setItem(MESA_MAP_ACTIVE_KEY, mapEntry.id); } catch {}

  renderMesaMapLayer(blobUrl, mapEntry.name);
}

function clearActiveMap() {
  if (mesaMapState.activeMapUrl) {
    URL.revokeObjectURL(mesaMapState.activeMapUrl);
  }
  mesaMapState.activeMapId  = "";
  mesaMapState.activeMapUrl = "";
  mesaMapState.activeEntry  = null;

  try { localStorage.removeItem(MESA_MAP_ACTIVE_KEY); } catch {}

  renderMesaMapLayer("", "");

  if (mesaMapState.playersOnline) {
    deleteActiveMapFromR2();
    _sendRealtime({ type: EV_MAP_CLEAR });
  }
}

async function restoreActiveMap() {
  const savedId = localStorage.getItem(MESA_MAP_ACTIVE_KEY);
  if (!savedId || !mesaMapState.db) return;

  const mapEntry = await loadMesaMapFromDB(savedId);
  if (mapEntry) {
    await applyActiveMap(mapEntry);
    mesaMapState.activeEntry = mapEntry;
  }
}

/* ── RENDERIZAÇÃO NO PALCO ──────────────────────────────────── */

function renderMesaMapLayer(blobUrl, mapName) {
  const layer    = document.getElementById("mesaMapLayer");
  const label    = document.getElementById("mesaMapLabel");
  const clearBtn = document.getElementById("mesaMapClearBtn");

  if (!layer) return;

  if (blobUrl) {
    layer.style.backgroundImage    = `url("${blobUrl}")`;
    layer.style.backgroundSize     = "cover";
    layer.style.backgroundPosition = "center";
    layer.removeAttribute("hidden");
  } else {
    layer.style.backgroundImage = "";
    layer.setAttribute("hidden", "");
  }

  if (label) {
    label.textContent = blobUrl ? mapName : "Sem mapa";
    label.classList.toggle("has-map", !!blobUrl);
  }
  if (clearBtn) clearBtn.hidden = !blobUrl;
}

/* ── PRESENÇA ───────────────────────────────────────────────── */

/**
 * Escuta mudanças de presença vindas do Durable Object.
 * Quando jogadores entram: inicia entrega do mapa ativo.
 * Quando todos saem: limpa R2, fecha conexões P2P abertas.
 */
function bindMesaMapPresence() {
  if (!window.APP?.on) return;

  const handle = (payload) => {
    const users   = Array.isArray(payload?.online?.users) ? payload.online.users : [];
    const players = users.filter(u => u.role !== "master");

    const hadPlayers          = mesaMapState.playersOnline;
    mesaMapState.playersOnline = players.length > 0;

    if (!hadPlayers && mesaMapState.playersOnline && mesaMapState.isMaster) {
      // Primeiro jogador entrou — anunciar mapa ativo se houver
      if (mesaMapState.activeEntry) {
        announceMapToPlayers(mesaMapState.activeEntry);
      }
    } else if (hadPlayers && !mesaMapState.playersOnline && mesaMapState.isMaster) {
      // Último jogador saiu — limpar todas as conexões P2P e R2
      mesaPeerConnections.forEach(pc => pc.close());
      mesaPeerConnections.clear();
      deleteActiveMapFromR2();
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

  // 1. Mestre anuncia novo mapa — verificar cache primeiro
  window.APP.on(EV_MAP_ANNOUNCE, async ({ mapId, hash, name, size, from }) => {
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
  window.APP.on(EV_MAP_WS_START, ({ to, hash, name, size, chunks }) => {
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
  window.APP.on(EV_MAP_SET, ({ url, mapId }) => {
    if (!url) return;
    renderMesaMapLayer(url, mapId || "Mapa");
  });

  // 8. Mestre limpou o mapa
  window.APP.on(EV_MAP_CLEAR, () => {
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
    const session  = _getSession();
    const apiBase  = window.ARMAGEDON_CONFIG?.apiBaseUrl || "";
    const token    = session?.token || "";

    if (!apiBase || !token) {
      console.warn("[mesa-map] Upload R2: API base ou token ausente.");
      return;
    }

    const formData = new FormData();
    formData.append("file",  mesaMapState.activeEntry.blob);
    formData.append("mapId", mesaMapState.activeEntry.id);

    const res = await fetch(`${apiBase}/mesa/map`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      body:    formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${res.status}`);
    }

    const { url, r2Key } = await res.json();
    mesaMapState.activeMapR2Key = r2Key;

    // Broadcast da URL pública R2 para jogadores que ainda não têm o mapa
    _sendRealtime({
      type:  EV_MAP_SET,
      mapId: mesaMapState.activeEntry.id,
      url,
      hash:  mesaMapState.activeEntry.hash,
      name:  mesaMapState.activeEntry.name,
    });

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
    const session = _getSession();
    const apiBase = window.ARMAGEDON_CONFIG?.apiBaseUrl || "";
    const token   = session?.token || "";

    if (!apiBase || !token) return;

    await fetch(`${apiBase}/mesa/map/${encodeURIComponent(r2Key)}`, {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

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

/**
 * Abre a galeria de mapas salvos no IndexedDB.
 * TODO [FASE 3]: renderizar UI de thumbnails.
 */
async function openMesaMapLibrary() {
  const maps = await listMesaMapsFromDB();
  console.log("[mesa-map] Mapas salvos:", maps.map(m => `${m.name} (${m.hash?.slice(0, 8)})`));
  // TODO [FASE 3]: renderizar galeria com thumbnails gerados via Canvas
}
