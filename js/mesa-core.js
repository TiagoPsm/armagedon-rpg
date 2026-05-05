const MESA_STORAGE_KEY = "tc_virtual_mesa_mock_v1";
const SHEETS_KEY = "tc_sheets";
const REMOTE_SHEETS_KEY = "tc_remote_sheets";
const NPCS_KEY = "tc_npcs";
const MONSTERS_KEY = "tc_monsters";
const NPC_PREFIX = "npc:";
const MONSTER_PREFIX = "monster:";

const TYPE_LABELS = {
  player: "Jogador",
  npc: "NPC",
  monster: "Monstro"
};
const STAGE_SLOT_COLUMNS = 5;
const STAGE_SLOT_START_X = 5.5;
const STAGE_SLOT_START_Y = 7.5;
const STAGE_SLOT_GAP_X = 17.5;
const STAGE_SLOT_GAP_Y = 22.5;
const STAGE_SLOT_COLLISION_X = 8.5;
const STAGE_SLOT_COLLISION_Y = 11.5;
const MESA_RENDER_PARTS = ["header", "summary", "controls", "roster", "stage", "inspector"];
const MESA_DOM_IDS = {
  headerUser: "headerUser",
  activeTokenCount: "activeTokenCount",
  roleBadge: "roleBadge",
  roleSummary: "roleSummary",
  sceneStateTitle: "sceneStateTitle",
  sceneStateCopy: "sceneStateCopy",
  previewRow: "playerPreviewRow",
  previewToggle: "playerPreviewToggle",
  stageViewBadge: "stageViewBadge",
  stageHintBadge: "stageHintBadge",
  fullscreenMesaBtn: "fullscreenMesaBtn",
  rosterSearch: "rosterSearch",
  rosterList: "rosterList",
  rosterCountBadge: "rosterCountBadge",
  stage: "mesaStage",
  emptyState: "mesaEmptyState",
  tokenInspector: "tokenInspector",
  resetMesaBtn: "resetMesaBtn",
  mesaPanelStage: "mesaPanelStage"
};

const state = {
  session: null,
  role: "player",
  roster: [],
  tokens: [],
  selectedTokenId: "",
  previewPlayerView: false,
  sceneVersion: 0,
  search: "",
  drag: null,
  fullscreenMode: "off",
  scenePersistence: "local",
  sceneRemoteExists: false,
  realtimeStatus: "offline",
  onlineUsers: []
};
const MESA_CLIENT_ID_KEY = "tc_mesa_client_id";
const MESA_REALTIME_DELTA_TYPES = new Set([
  "mesa:token:move",
  "mesa:token:upsert",
  "mesa:token:remove",
  "mesa:scene:clear"
]);
const mesaDom = {};
const pendingMesaRender = Object.fromEntries(MESA_RENDER_PARTS.map(part => [part, false]));
let mesaRenderFrame = 0;
let mesaRosterByCharacterKey = new Map();
let mesaRosterById = new Map();
let mesaPersistTimer = null;
let pendingPersistPayload = null;
let mesaRemotePersistInFlight = false;
let pendingRemotePersistPayload = null;
let pendingRemotePersistSignature = "";
let activeRemotePersistSignature = "";
let lastPersistedMesaSceneSignature = "";
let lastRemoteMesaSceneSignature = "";
let remoteMesaSceneFrame = 0;
let pendingRemoteMesaSceneData = null;
let dragAnimationFrame = 0;
let pendingDragPoint = null;
const mesaSheetSaveTimers = new Map();
const pendingMesaSheetPatches = new Map();
let mesaInitStarted = false;
let mesaRealtimeBound = false;
let mesaRealtimeMessageSequence = 0;
const mesaClientId = getMesaClientId();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootMesaPage, { once: true });
} else {
  bootMesaPage();
}

function bootMesaPage() {
  if (mesaInitStarted) return;
  mesaInitStarted = true;
  initMesaPage().catch(error => {
    console.error("Falha ao iniciar a mesa virtual.", error);
  });
}

async function initMesaPage() {
  cacheMesaDomRefs();
  bindEvents();

  if (window.AUTH_READY) {
    await window.AUTH_READY;
  } else if (window.AUTH?.init) {
    await window.AUTH.init();
  }

  const session = resolveMesaSession();
  if (!session) return;

  state.session = session;
  state.role = resolveInitialRole(session);
  await refreshMesaDirectoryBeforeRoster();
  setMesaRoster(buildRoster());

  await hydrateState();
  bindMesaRealtime();
  renderAll();
}

function bindEvents() {
  if (document.body.dataset.mesaEventsBound === "1") return;
  document.body.dataset.mesaEventsBound = "1";

  const previewToggle = getMesaDomRef("previewToggle");
  const rosterSearch = getMesaDomRef("rosterSearch");
  const resetMesaBtn = getMesaDomRef("resetMesaBtn");
  const stage = getMesaDomRef("stage");
  const fullscreenMesaBtn = getMesaDomRef("fullscreenMesaBtn");
  const rosterList = getMesaDomRef("rosterList");
  const tokenInspector = getMesaDomRef("tokenInspector");

  previewToggle?.addEventListener("change", event => {
    if (!isMaster()) return;
    state.previewPlayerView = Boolean(event.target.checked);
    bumpMesaSceneVersion();
    persistState();
    scheduleMesaRender({ summary: true, controls: true, stage: true, inspector: true });
  });

  rosterSearch?.addEventListener("input", event => {
    state.search = String(event.target.value || "").trim().toLowerCase();
    scheduleMesaRender({ roster: true });
  });

  resetMesaBtn?.addEventListener("click", () => {
    resetPrototype();
  });

  fullscreenMesaBtn?.addEventListener("click", toggleMesaFullscreen);

  stage?.addEventListener("click", event => {
    if (typeof shouldIgnoreMesaStageClickAfterDrag === "function" && shouldIgnoreMesaStageClickAfterDrag()) return;
    const tokenTarget = typeof resolveStagePointerTarget === "function"
      ? resolveStagePointerTarget(event)
      : null;
    const tokenElement = event.target.closest?.("[data-token-id]");
    const tokenId = tokenTarget?.tokenId || String(tokenElement?.dataset?.tokenId || "");
    if (!tokenId) return;
    selectToken(tokenId);
  });
  stage?.addEventListener("pointerdown", handleTokenPointerDown);
  stage?.addEventListener("mousedown", handleTokenMouseDown);

  stage?.addEventListener("dragstart", event => {
    event.preventDefault();
  });

  rosterList?.addEventListener("click", handleRosterAction);
  tokenInspector?.addEventListener("click", handleInspectorAction);
  tokenInspector?.addEventListener("input", handleInspectorStatInput);

  window.addEventListener("pointermove", handleDragMove);
  window.addEventListener("pointerup", handleDragEnd);
  window.addEventListener("pointercancel", handleDragEnd);
  window.addEventListener("mousemove", handleMouseDragMove);
  window.addEventListener("mouseup", handleMouseDragEnd);
  window.addEventListener("pagehide", flushPersistState);
  window.addEventListener("storage", handleMesaStorageSync);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersistState();
  });
}

function bindMesaRealtime() {
  if (mesaRealtimeBound || !window.APP?.on) return;
  mesaRealtimeBound = true;

  window.APP.on("socket:connect", () => {
    state.realtimeStatus = "online";
    scheduleMesaRender({ summary: true });
  });

  window.APP.on("socket:disconnect", () => {
    state.realtimeStatus = "offline";
    scheduleMesaRender({ summary: true });
  });

  window.APP.on("socket:error", () => {
    state.realtimeStatus = "error";
    scheduleMesaRender({ summary: true });
  });

  window.APP.on("mesa:ready", payload => {
    state.realtimeStatus = "online";
    updateMesaPresence(payload);
    scheduleMesaRender({ summary: true });
  });

  window.APP.on("mesa:presence", payload => {
    updateMesaPresence(payload);
    scheduleMesaRender({ summary: true });
  });

  window.APP.on("mesa:scene", payload => {
    applyRemoteMesaSceneMessage(payload);
  });

  window.APP.on("mesa:batch", payload => {
    applyMesaRealtimeBatch(payload);
  });

  MESA_REALTIME_DELTA_TYPES.forEach(eventName => {
    window.APP.on(eventName, payload => {
      void applyMesaRealtimeDelta(payload);
    });
  });

  if (window.AUTH?.isBackendEnabled?.() && window.APP?.connectRealtime) {
    void window.APP.connectRealtime();
  }
}

function getMesaClientId() {
  try {
    const existing = sessionStorage.getItem(MESA_CLIENT_ID_KEY);
    if (existing) return existing;
    const next = crypto?.randomUUID?.() || `mesa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(MESA_CLIENT_ID_KEY, next);
    return next;
  } catch {
    return `mesa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function updateMesaPresence(payload) {
  const users = Array.isArray(payload?.online?.users) ? payload.online.users : [];
  state.onlineUsers = users
    .map(user => ({
      username: String(user?.username || "").trim(),
      role: String(user?.role || "player").trim() || "player",
      connections: asPositiveInt(user?.connections, 1)
    }))
    .filter(user => user.username);
}

function applyRemoteMesaSceneMessage(payload) {
  const remoteData = extractMesaSceneData(payload);
  if (!remoteData) return;

  const remoteSignature = getMesaSceneSignature(remoteData);
  if (remoteSignature && remoteSignature === lastRemoteMesaSceneSignature && hasPendingMesaScenePersist()) {
    return;
  }

  if (remoteSignature && remoteSignature === getCurrentMesaSceneSignature()) {
    lastPersistedMesaSceneSignature = remoteSignature;
    lastRemoteMesaSceneSignature = remoteSignature;
    return;
  }

  pendingRemoteMesaSceneData = remoteData;
  if (remoteMesaSceneFrame) return;

  remoteMesaSceneFrame = requestMesaRenderFrame(() => {
    remoteMesaSceneFrame = 0;
    const nextRemoteData = pendingRemoteMesaSceneData;
    pendingRemoteMesaSceneData = null;
    void applyRemoteMesaSceneSnapshot(nextRemoteData);
  });
}

function extractMesaSceneData(payload) {
  if (payload?.scene?.data && typeof payload.scene.data === "object") return payload.scene.data;
  if (payload?.data && typeof payload.data === "object") return payload.data;
  if (payload && typeof payload === "object" && Array.isArray(payload.tokens)) return payload;
  return null;
}

function applyMesaRealtimeBatch(payload) {
  if (payload?.clientId === mesaClientId) return;
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  messages.forEach(message => {
    if (!message || typeof message !== "object") return;
    if (MESA_REALTIME_DELTA_TYPES.has(String(message.type || ""))) {
      void applyMesaRealtimeDelta({
        ...message,
        clientId: message.clientId || payload.clientId,
        actor: message.actor || payload.actor,
        sentAt: message.sentAt || payload.sentAt
      });
    }
  });
}

async function applyMesaRealtimeDelta(payload) {
  const type = String(payload?.type || "");
  if (!MESA_REALTIME_DELTA_TYPES.has(type)) return;
  if (payload?.clientId === mesaClientId) return;
  if (isStaleMesaSceneVersion(payload?.sceneVersion)) return;

  const previousTokenIds = getMesaSceneTokenIdSet(state.tokens);
  let needsRosterRefresh = false;
  let changed = false;

  if (type === "mesa:token:move") {
    changed = applyMesaTokenMoveDelta(payload);
  }

  if (type === "mesa:token:remove") {
    changed = applyMesaTokenRemoveDelta(payload);
  }

  if (type === "mesa:scene:clear") {
    changed = applyMesaSceneClearDelta(payload);
  }

  if (type === "mesa:token:upsert") {
    needsRosterRefresh = hasMissingMesaRosterEntries({ tokens: [payload.token] });
    if (needsRosterRefresh) {
      await refreshMesaDirectoryBeforeRoster();
      setMesaRoster(buildRoster());
    }
    changed = applyMesaTokenUpsertDelta(payload) || changed;
  }

  if (!changed && !needsRosterRefresh) return;

  const incomingVersion = asPositiveInt(payload?.sceneVersion, 0);
  if (incomingVersion > state.sceneVersion) state.sceneVersion = incomingVersion;
  syncSelectedToken();
  cacheMesaSceneSnapshotLocally();

  const membershipChanged = hasMesaTokenMembershipChanged(previousTokenIds, state.tokens);
  scheduleMesaRender({
    summary: true,
    controls: true,
    roster: membershipChanged || needsRosterRefresh,
    stage: true,
    inspector: true
  });
}

function applyMesaTokenMoveDelta(payload) {
  const token = findToken(payload?.tokenId);
  if (!token) return false;
  const nextX = roundTo(clamp(Number(payload.x), 0, 100), 2);
  const nextY = roundTo(clamp(Number(payload.y), 0, 100), 2);
  const nextOrder = asPositiveInt(payload.order, token.order || 1);
  if (token.x === nextX && token.y === nextY && token.order === nextOrder) return false;
  token.x = nextX;
  token.y = nextY;
  token.order = nextOrder;
  return true;
}

function applyMesaTokenRemoveDelta(payload) {
  const tokenId = String(payload?.tokenId || "");
  if (!tokenId || !findToken(tokenId)) return false;
  state.tokens = state.tokens.filter(token => token.id !== tokenId);
  if (state.selectedTokenId === tokenId) {
    state.selectedTokenId = getNextSelectedTokenId();
  }
  return true;
}

function applyMesaSceneClearDelta(payload) {
  if (!state.tokens.length && !state.selectedTokenId) return false;
  state.tokens = [];
  state.selectedTokenId = "";
  state.previewPlayerView = isMaster() ? Boolean(payload?.previewPlayerView) : false;
  return true;
}

function applyMesaTokenUpsertDelta(payload) {
  const incomingToken = payload?.token && typeof payload.token === "object" ? payload.token : null;
  if (!incomingToken) return false;
  const rosterEntry = getRosterEntryByCharacterKey(incomingToken.characterKey || incomingToken.id);
  const mergedToken = mergeTokenWithRoster(incomingToken, rosterEntry);
  if (!mergedToken) return false;

  const index = state.tokens.findIndex(token => token.id === mergedToken.id);
  if (index >= 0) {
    const previousSignature = getMesaSceneSignature({ tokens: [state.tokens[index]] });
    const nextSignature = getMesaSceneSignature({ tokens: [mergedToken] });
    if (previousSignature === nextSignature) return false;
    state.tokens = state.tokens.map(token => token.id === mergedToken.id ? mergedToken : token);
  } else {
    state.tokens = [...state.tokens, mergedToken];
  }

  state.selectedTokenId = String(payload?.selectedTokenId || state.selectedTokenId || mergedToken.id);
  return true;
}

async function applyRemoteMesaSceneSnapshot(remoteData) {
  if (!remoteData) return;

  if (isStaleMesaSceneVersion(remoteData?.sceneVersion)) {
    return;
  }

  const remoteSignature = getMesaSceneSignature(remoteData);
  if (remoteSignature && remoteSignature === lastRemoteMesaSceneSignature && hasPendingMesaScenePersist()) {
    return;
  }

  if (remoteSignature && remoteSignature === getCurrentMesaSceneSignature()) {
    lastPersistedMesaSceneSignature = remoteSignature;
    lastRemoteMesaSceneSignature = remoteSignature;
    return;
  }

  try {
    const previousTokenIds = getMesaSceneTokenIdSet(state.tokens);
    const needsRosterRefresh = hasMissingMesaRosterEntries(remoteData);
    if (needsRosterRefresh) {
      await refreshMesaDirectoryBeforeRoster();
      setMesaRoster(buildRoster());
    }

    state.scenePersistence = "remote";
    state.sceneRemoteExists = true;
    localStorage.setItem(MESA_STORAGE_KEY, JSON.stringify(remoteData));
    applyMesaSceneSnapshot(remoteData);
    lastPersistedMesaSceneSignature = remoteSignature;
    lastRemoteMesaSceneSignature = remoteSignature;

    const membershipChanged = hasMesaTokenMembershipChanged(previousTokenIds, state.tokens);
    scheduleMesaRender({
      summary: true,
      controls: true,
      roster: membershipChanged || needsRosterRefresh,
      stage: true,
      inspector: true
    });
  } catch (error) {
    console.warn("Falha ao aplicar cena recebida em tempo real.", error);
  }
}

function resolveMesaSession() {
  const existingSession = window.AUTH?.getSession ? window.AUTH.getSession() : null;
  if (existingSession) return existingSession;

  if (isLocalMesaPreview()) {
    return {
      username: "mestre-local",
      role: "master",
      token: "",
      backend: false
    };
  }

  return window.AUTH?.requireAuth ? window.AUTH.requireAuth() : null;
}

function resolveInitialRole(session) {
  if (isLocalMesaPreview()) return "master";
  return session?.role || "player";
}

async function refreshMesaDirectoryBeforeRoster() {
  if (!window.AUTH?.isBackendEnabled?.() || !window.AUTH?.refreshDirectory) return;

  try {
    await window.AUTH.refreshDirectory();
  } catch (error) {
    console.warn("Falha ao atualizar diretorio da mesa antes do roster.", error);
  }
}

function cacheMesaDomRefs() {
  Object.keys(MESA_DOM_IDS).forEach(key => {
    mesaDom[key] = document.getElementById(MESA_DOM_IDS[key]);
  });
}

function getMesaDomRef(key) {
  if (!MESA_DOM_IDS[key]) return null;
  const cached = mesaDom[key];
  if (cached && cached.isConnected !== false) return cached;
  mesaDom[key] = document.getElementById(MESA_DOM_IDS[key]);
  return mesaDom[key];
}

function requestMesaRenderFrame(callback) {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(callback, 16);
}

function cancelMesaRenderFrame(frameId) {
  if (!frameId) return;
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frameId);
    return;
  }
  window.clearTimeout(frameId);
}

function scheduleMesaRender(parts = {}) {
  let hasPendingRender = false;

  MESA_RENDER_PARTS.forEach(part => {
    if (parts.all || parts[part]) {
      pendingMesaRender[part] = true;
      hasPendingRender = true;
    }
  });

  if (!hasPendingRender || mesaRenderFrame) return;
  mesaRenderFrame = requestMesaRenderFrame(flushScheduledMesaRender);
}

function flushScheduledMesaRender() {
  mesaRenderFrame = 0;
  const nextRender = {};
  MESA_RENDER_PARTS.forEach(part => {
    nextRender[part] = pendingMesaRender[part];
    pendingMesaRender[part] = false;
  });

  syncSelectedToken();
  if (nextRender.header) renderHeader();
  if (nextRender.summary) renderSummary();
  if (nextRender.controls) renderControls();
  if (nextRender.roster) renderRoster();
  if (nextRender.stage) renderStage();
  if (nextRender.inspector) renderInspector();
}

function clearScheduledMesaRender() {
  if (mesaRenderFrame) {
    cancelMesaRenderFrame(mesaRenderFrame);
    mesaRenderFrame = 0;
  }
  MESA_RENDER_PARTS.forEach(part => {
    pendingMesaRender[part] = false;
  });
}

function setMesaRoster(roster) {
  state.roster = Array.isArray(roster) ? roster : [];
  mesaRosterByCharacterKey = new Map(state.roster.map(entry => [String(entry.characterKey || ""), entry]));
  mesaRosterById = new Map(state.roster.map(entry => [String(entry.id || ""), entry]));
}

function getRosterEntryByCharacterKey(characterKey) {
  return mesaRosterByCharacterKey.get(String(characterKey || "")) || null;
}

function getRosterEntryById(entryId) {
  return mesaRosterById.get(String(entryId || "")) || null;
}

function hasMissingMesaRosterEntries(sceneData) {
  const savedTokens = Array.isArray(sceneData?.tokens) ? sceneData.tokens : [];
  return savedTokens.some(token => !getRosterEntryByCharacterKey(token?.characterKey));
}

function getMesaSceneTokenIdSet(tokens) {
  return new Set((Array.isArray(tokens) ? tokens : []).map(token => String(token?.id || "")).filter(Boolean));
}

function hasMesaTokenMembershipChanged(previousTokenIds, nextTokens) {
  const nextTokenIds = getMesaSceneTokenIdSet(nextTokens);
  if (previousTokenIds.size !== nextTokenIds.size) return true;
  return [...previousTokenIds].some(tokenId => !nextTokenIds.has(tokenId));
}

function buildRoster() {
  const directory = window.AUTH?.getDirectoryCache?.() || { players: [], npcs: [], monsters: [] };
  const sheets = readMergedSheets();

  // A Mesa tenta montar o roster a partir de duas fontes:
  // 1. diretorio/listas auxiliares (quando existem)
  // 2. chaves reais das fichas salvas
  // Isso evita cair no fallback de exemplo quando o ambiente local
  // tem fichas, mas ainda nao tem cache de diretorio populado.
  const players = buildPlayers(directory, sheets);
  const npcs = buildNpcs(directory, sheets);
  const monsters = buildMonsters(directory, sheets);
  const roster = [...players, ...npcs, ...monsters];

  if (roster.length) return roster;
  return buildFallbackRoster(sheets);
}

function buildPlayers(directory, sheets) {
  const backendPlayers = Array.isArray(directory?.players) ? directory.players : [];
  const localPlayers = Array.isArray(window.AUTH?.getPlayers?.()) ? window.AUTH.getPlayers() : [];
  const players = backendPlayers.length ? backendPlayers : localPlayers;
  const playerMap = new Map(
    players.map((player, index) => {
      const username = String(player?.username || "").trim() || `jogador-${index + 1}`;
      return [username, player];
    })
  );

  Object.keys(sheets || {}).forEach(rawKey => {
    const key = String(rawKey || "").trim();
    if (!key || key.startsWith(NPC_PREFIX) || key.startsWith(MONSTER_PREFIX)) return;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        username: key,
        charname: String(sheets?.[key]?.charName || "").trim()
      });
    }
  });

  return [...playerMap.values()].map((player, index) => {
    const username = String(player.username || "").trim() || `jogador-${index + 1}`;
    const sheet = normalizeSheetSnapshot(sheets[username], "player");
    const name = String(sheet.charName || player.charname || username).trim() || username;
    return createRosterEntry({
      id: username,
      characterKey: username,
      type: "player",
      ownerUsername: username,
      createdBy: "mestre",
      name,
      imageUrl: sheet.avatar,
      currentLife: sheet.vidaAtual,
      maxLife: sheet.vidaMax,
      currentIntegrity: sheet.integAtual,
      maxIntegrity: sheet.integMax
    });
  });
}

function buildNpcs(directory, sheets) {
  const backendNpcs = Array.isArray(directory?.npcs) ? directory.npcs : [];
  const localNpcs = readJsonStorage(NPCS_KEY, []).map(normalizeNamedEntity);
  const npcs = backendNpcs.length ? backendNpcs.map(normalizeNamedEntity) : localNpcs;
  const npcMap = new Map(npcs.map(npc => [resolveDirectoryCharacterKey(npc, NPC_PREFIX, "npc"), npc]));

  Object.keys(sheets || {}).forEach(rawKey => {
    const key = String(rawKey || "").trim();
    if (!key.startsWith(NPC_PREFIX)) return;
    const npcId = key.slice(NPC_PREFIX.length).trim();
    if (!npcId || npcMap.has(key)) return;
    npcMap.set(key, {
      id: npcId,
      name: String(sheets?.[key]?.charName || npcId).trim() || npcId
    });
  });

  return [...npcMap.entries()].map(([key, npc]) => {
    const sheet = normalizeSheetSnapshot(sheets[key], "npc");
    const name = String(sheet.charName || npc.name || "NPC").trim() || "NPC";
    return createRosterEntry({
      id: key,
      characterKey: key,
      type: "npc",
      ownerUsername: "mestre",
      createdBy: "mestre",
      name,
      imageUrl: sheet.avatar,
      currentLife: sheet.vidaAtual,
      maxLife: sheet.vidaMax,
      currentIntegrity: sheet.integAtual,
      maxIntegrity: sheet.integMax
    });
  });
}

function buildMonsters(directory, sheets) {
  const backendMonsters = Array.isArray(directory?.monsters) ? directory.monsters : [];
  const localMonsters = readJsonStorage(MONSTERS_KEY, []).map(normalizeNamedEntity);
  const monsters = backendMonsters.length ? backendMonsters.map(normalizeNamedEntity) : localMonsters;
  const monsterMap = new Map(monsters.map(monster => [resolveDirectoryCharacterKey(monster, MONSTER_PREFIX, "monster"), monster]));

  Object.keys(sheets || {}).forEach(rawKey => {
    const key = String(rawKey || "").trim();
    if (!key.startsWith(MONSTER_PREFIX)) return;
    const monsterId = key.slice(MONSTER_PREFIX.length).trim();
    if (!monsterId || monsterMap.has(key)) return;
    monsterMap.set(key, {
      id: monsterId,
      name: String(sheets?.[key]?.charName || monsterId).trim() || monsterId
    });
  });

  return [...monsterMap.entries()].map(([key, monster]) => {
    const sheet = normalizeSheetSnapshot(sheets[key], "monster");
    const name = String(sheet.charName || monster.name || "Monstro").trim() || "Monstro";
    return createRosterEntry({
      id: key,
      characterKey: key,
      type: "monster",
      ownerUsername: "mestre",
      createdBy: "mestre",
      name,
      imageUrl: sheet.avatar,
      currentLife: sheet.vidaAtual,
      maxLife: sheet.vidaMax,
      currentIntegrity: sheet.integAtual,
      maxIntegrity: sheet.integMax
    });
  });
}

function normalizeNamedEntity(entity) {
  return {
    id: String(entity?.id || slugify(entity?.name || "registro")),
    key: String(entity?.key || "").trim(),
    name: String(entity?.name || "Registro").trim() || "Registro"
  };
}

function resolveDirectoryCharacterKey(entity, prefix, fallbackName) {
  const rawKey = String(entity?.key || "").trim();
  if (rawKey.startsWith(prefix)) return rawKey;

  const rawId = String(entity?.id || "").trim();
  if (rawId.startsWith(prefix)) return rawId;

  return `${prefix}${rawId || slugify(entity?.name || fallbackName)}`;
}

function normalizeSheetSnapshot(raw, type) {
  const hasStoredSheet = Boolean(raw && typeof raw === "object" && Object.keys(raw).length);
  const lifeFallback = type === "monster" ? 18 : 14;
  const integrityFallback = type === "monster" ? 0 : 6;
  const vidaMax = asPositiveInt(raw?.vidaMax, hasStoredSheet ? 0 : lifeFallback);
  const vidaSeed = raw?.vidaAtual === "" || raw?.vidaAtual === null || raw?.vidaAtual === undefined
    ? vidaMax
    : asPositiveInt(raw?.vidaAtual, vidaMax);
  const integMax = asPositiveInt(raw?.integMax, hasStoredSheet ? 0 : integrityFallback);
  const integSeed = raw?.integAtual === "" || raw?.integAtual === null || raw?.integAtual === undefined
    ? integMax
    : asPositiveInt(raw?.integAtual, integMax);
  const vidaAtual = clamp(vidaSeed, 0, Math.max(vidaMax, 0));
  const integAtual = clamp(integSeed, 0, Math.max(integMax, 0));

  return {
    charName: String(raw?.charName || "").trim(),
    avatar: String(raw?.avatar || "").trim(),
    vidaAtual,
    vidaMax,
    integAtual,
    integMax
  };
}

function createRosterEntry(data) {
  return {
    id: String(data.id),
    characterKey: String(data.characterKey),
    type: data.type,
    ownerUsername: String(data.ownerUsername || "mestre"),
    createdBy: String(data.createdBy || "mestre"),
    name: String(data.name || "Sem nome").trim() || "Sem nome",
    imageUrl: String(data.imageUrl || "").trim(),
    currentLife: clamp(asPositiveInt(data.currentLife, asPositiveInt(data.maxLife, 10)), 0, asPositiveInt(data.maxLife, 10)),
    maxLife: asPositiveInt(data.maxLife, 10),
    currentIntegrity: clamp(asPositiveInt(data.currentIntegrity, asPositiveInt(data.maxIntegrity, 0)), 0, asPositiveInt(data.maxIntegrity, 0)),
    maxIntegrity: asPositiveInt(data.maxIntegrity, 0),
    statsVisibleToPlayers: normalizeStatsVisibility(data.type, data.statsVisibleToPlayers),
    initials: getInitials(data.name),
    typeLabel: TYPE_LABELS[data.type] || "Token"
  };
}

function buildFallbackRoster(sheets = {}) {
  const username = state.session?.username || "jogador";
  const playerSheet = normalizeSheetSnapshot(sheets[username], "player");
  const npcSheet = normalizeSheetSnapshot(sheets[`${NPC_PREFIX}vigia-da-porta`], "npc");
  const monsterSheet = normalizeSheetSnapshot(sheets[`${MONSTER_PREFIX}eco-rubro`], "monster");

  return [
    createRosterEntry({
      id: username,
      characterKey: username,
      type: "player",
      ownerUsername: username,
      createdBy: "mestre",
      name: playerSheet.charName || "Protagonista",
      imageUrl: playerSheet.avatar,
      currentLife: playerSheet.vidaAtual,
      maxLife: playerSheet.vidaMax,
      currentIntegrity: playerSheet.integAtual,
      maxIntegrity: playerSheet.integMax
    }),
    createRosterEntry({
      id: "npc:vigia-da-porta",
      characterKey: "npc:vigia-da-porta",
      type: "npc",
      ownerUsername: "mestre",
      createdBy: "mestre",
      name: npcSheet.charName || "Vigia da Porta",
      imageUrl: npcSheet.avatar,
      currentLife: npcSheet.vidaAtual,
      maxLife: npcSheet.vidaMax,
      currentIntegrity: npcSheet.integAtual,
      maxIntegrity: npcSheet.integMax
    }),
    createRosterEntry({
      id: "monster:eco-rubro",
      characterKey: "monster:eco-rubro",
      type: "monster",
      ownerUsername: "mestre",
      createdBy: "mestre",
      name: monsterSheet.charName || "Eco Rubro",
      imageUrl: monsterSheet.avatar,
      currentLife: monsterSheet.vidaAtual,
      maxLife: monsterSheet.vidaMax,
      currentIntegrity: monsterSheet.integAtual,
      maxIntegrity: monsterSheet.integMax
    })
  ];
}

// A Mesa usa a ficha como fonte de verdade para identidade e status.
// O estado salvo aqui e apenas a camada visual do palco:
// posicao, ordem, visibilidade e regra de exposicao dos status.
async function hydrateState() {
  const saved = await loadMesaSceneSnapshot();
  const snapshotResult = applyMesaSceneSnapshot(saved);

  if (
    snapshotResult.seeded
    && state.scenePersistence === "remote"
    && isMaster()
    && state.tokens.length
    && typeof persistState === "function"
  ) {
    bumpMesaSceneVersion();
    persistState({ immediate: true });
  }
}

async function loadMesaSceneSnapshot() {
  if (window.AUTH?.isBackendEnabled?.() && window.APP?.getMesaScene) {
    try {
      const remoteScene = await window.APP.getMesaScene();
      const remoteData = remoteScene?.data && typeof remoteScene.data === "object" ? remoteScene.data : {};
      state.sceneRemoteExists = Boolean(remoteScene?.createdAt || remoteScene?.updatedAt);
      localStorage.setItem(MESA_STORAGE_KEY, JSON.stringify(remoteData));
      state.scenePersistence = "remote";
      rememberMesaSceneSignature(remoteData, { persisted: true, remote: true });
      return remoteData;
    } catch (error) {
      console.warn("Falha ao carregar cena oficial da mesa.", error);
    }
  }

  state.scenePersistence = "local";
  state.sceneRemoteExists = false;
  const localData = readJsonStorage(MESA_STORAGE_KEY, {});
  rememberMesaSceneSignature(localData, { persisted: true });
  return localData;
}

function applyMesaSceneSnapshot(saved) {
  const savedTokens = Array.isArray(saved?.tokens) ? saved.tokens : [];
  const mergedTokens = savedTokens
    .map(token => mergeTokenWithRoster(token, getRosterEntryByCharacterKey(token?.characterKey)))
    .filter(Boolean);

  const seeded = !mergedTokens.length && shouldSeedMesaTokens(savedTokens.length);
  state.tokens = seeded ? seedInitialTokens() : mergedTokens;
  state.previewPlayerView = isMaster() ? Boolean(saved?.previewPlayerView) : false;
  state.sceneVersion = asPositiveInt(saved?.sceneVersion, state.sceneVersion);
  state.selectedTokenId = pickInitialSelectedToken(saved?.selectedTokenId);
  return { seeded, savedTokenCount: savedTokens.length };
}

function shouldSeedMesaTokens(savedTokenCount) {
  if (!state.roster.length) return false;
  if (state.scenePersistence !== "remote") return true;
  if (!state.sceneRemoteExists) return true;
  return savedTokenCount > 0;
}

function seedInitialTokens() {
  const players = state.roster.filter(entry => entry.type === "player");
  const npcs = state.roster.filter(entry => entry.type === "npc");
  const monsters = state.roster.filter(entry => entry.type === "monster");
  const starter = [...players.slice(0, 2), ...npcs.slice(0, 2), ...monsters.slice(0, 2)];
  const lineup = starter.length ? starter : state.roster.slice(0, 4);
  const slots = buildPreferredStageSlots(lineup.length);

  return lineup.map((entry, index) => {
    const slot = slots[index] || getCenterStagePosition();
    return {
      ...entry,
      visibleToPlayers: true,
      statsVisibleToPlayers: normalizeStatsVisibility(entry.type, entry.statsVisibleToPlayers),
      x: slot.x,
      y: slot.y,
      order: index + 1
    };
  });
}

function mergeTokenWithRoster(savedToken, rosterEntry) {
  if (!rosterEntry) return null;

  return {
    ...rosterEntry,
    visibleToPlayers: savedToken?.visibleToPlayers !== false,
    statsVisibleToPlayers: normalizeStatsVisibility(
      rosterEntry.type,
      savedToken?.statsVisibleToPlayers ?? rosterEntry.statsVisibleToPlayers
    ),
    x: clamp(Number(savedToken?.x), 3, 82),
    y: clamp(Number(savedToken?.y), 3, 78),
    order: asPositiveInt(savedToken?.order, 1)
  };
}

function pickInitialSelectedToken(savedId) {
  const visibleTokens = getRenderedTokens();
  if (!visibleTokens.length) return "";
  if (visibleTokens.some(token => token.id === savedId)) return String(savedId);
  return visibleTokens[0].id;
}

function getMesaSceneSignature(payload) {
  return JSON.stringify(normalizeMesaScenePayload(payload));
}

function getCurrentMesaSceneSignature() {
  return getMesaSceneSignature(createMesaScenePayloadFromState());
}

function isStaleMesaSceneVersion(sceneVersion) {
  const incomingVersion = asPositiveInt(sceneVersion, 0);
  return Boolean(incomingVersion && state.sceneVersion && incomingVersion < state.sceneVersion);
}

function bumpMesaSceneVersion() {
  state.sceneVersion = Math.max(asPositiveInt(state.sceneVersion, 0) + 1, Date.now());
  return state.sceneVersion;
}

function cacheMesaSceneSnapshotLocally() {
  const payload = createMesaScenePayloadFromState();
  localStorage.setItem(MESA_STORAGE_KEY, JSON.stringify(payload));
  rememberMesaSceneSignature(payload, { persisted: true });
}

function createMesaRealtimeEnvelope(type, payload = {}) {
  return {
    ...payload,
    type,
    clientId: mesaClientId,
    messageId: `${mesaClientId}:${++mesaRealtimeMessageSequence}`,
    sceneVersion: asPositiveInt(payload.sceneVersion, state.sceneVersion),
    selectedTokenId: state.selectedTokenId,
    sentAt: new Date().toISOString()
  };
}

function sendMesaRealtimeDelta(type, payload = {}) {
  if (!window.APP?.sendRealtime || !window.AUTH?.isBackendEnabled?.()) return false;
  return window.APP.sendRealtime(createMesaRealtimeEnvelope(type, payload));
}

function serializeMesaRealtimeToken(token) {
  if (!token) return null;
  return {
    id: token.id,
    characterKey: token.characterKey,
    type: token.type,
    ownerUsername: token.ownerUsername,
    name: token.name,
    imageUrl: token.imageUrl,
    currentLife: token.currentLife,
    maxLife: token.maxLife,
    currentIntegrity: token.currentIntegrity,
    maxIntegrity: token.maxIntegrity,
    visibleToPlayers: token.visibleToPlayers !== false,
    statsVisibleToPlayers: normalizeStatsVisibility(token.type, token.statsVisibleToPlayers),
    x: roundTo(token.x, 2),
    y: roundTo(token.y, 2),
    order: token.order || 1
  };
}

function broadcastMesaTokenMove(token) {
  if (!token || !isMaster()) return false;
  return sendMesaRealtimeDelta("mesa:token:move", {
    tokenId: token.id,
    x: roundTo(token.x, 2),
    y: roundTo(token.y, 2),
    order: token.order || 1
  });
}

function broadcastMesaTokenUpsert(token) {
  if (!token || !isMaster()) return false;
  return sendMesaRealtimeDelta("mesa:token:upsert", {
    token: serializeMesaRealtimeToken(token)
  });
}

function broadcastMesaTokenRemove(tokenId) {
  if (!tokenId || !isMaster()) return false;
  return sendMesaRealtimeDelta("mesa:token:remove", {
    tokenId
  });
}

function broadcastMesaSceneClear() {
  if (!isMaster()) return false;
  return sendMesaRealtimeDelta("mesa:scene:clear", {
    previewPlayerView: Boolean(state.previewPlayerView)
  });
}

function hasPendingMesaScenePersist() {
  return Boolean(pendingPersistPayload || pendingRemotePersistPayload || mesaRemotePersistInFlight);
}

function createMesaScenePayloadFromState() {
  return {
    sceneVersion: asPositiveInt(state.sceneVersion, 0),
    previewPlayerView: Boolean(state.previewPlayerView),
    selectedTokenId: state.selectedTokenId,
    tokens: state.tokens.map(token => ({
      id: token.id,
      characterKey: token.characterKey,
      x: roundTo(token.x, 2),
      y: roundTo(token.y, 2),
      visibleToPlayers: token.visibleToPlayers !== false,
      statsVisibleToPlayers: normalizeStatsVisibility(token.type, token.statsVisibleToPlayers),
      order: token.order || 1
    }))
  };
}

function rememberMesaSceneSignature(payload, options = {}) {
  const signature = getMesaSceneSignature(payload);
  if (options.persisted) lastPersistedMesaSceneSignature = signature;
  if (options.remote) lastRemoteMesaSceneSignature = signature;
  return signature;
}

function normalizeMesaScenePayload(payload = {}) {
  const tokens = Array.isArray(payload?.tokens) ? payload.tokens : [];
  return {
    sceneVersion: asPositiveInt(payload?.sceneVersion, 0),
    previewPlayerView: Boolean(payload?.previewPlayerView),
    selectedTokenId: String(payload?.selectedTokenId || ""),
    tokens: tokens
      .map(token => ({
        id: String(token?.id || ""),
        characterKey: String(token?.characterKey || ""),
        x: roundTo(clamp(Number(token?.x), 0, 100), 2),
        y: roundTo(clamp(Number(token?.y), 0, 100), 2),
        visibleToPlayers: token?.visibleToPlayers !== false,
        statsVisibleToPlayers: token?.statsVisibleToPlayers === true,
        order: asPositiveInt(token?.order, 1)
      }))
      .filter(token => token.id && token.characterKey)
      .sort((a, b) => a.id.localeCompare(b.id))
  };
}

function renderAll() {
  clearScheduledMesaRender();
  syncSelectedToken();
  renderHeader();
  renderSummary();
  renderControls();
  renderRoster();
  renderStage();
  renderInspector();
}

function renderHeader() {
  const headerUser = getMesaDomRef("headerUser");
  if (headerUser) {
    headerUser.textContent = state.session?.username || "Convidado";
  }
}
