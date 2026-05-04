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

const state = {
  session: null,
  role: "player",
  roster: [],
  tokens: [],
  selectedTokenId: "",
  previewPlayerView: false,
  search: "",
  drag: null,
  fullscreenMode: "off",
  scenePersistence: "local"
};
let mesaPersistTimer = null;
let pendingPersistPayload = null;
let mesaRemotePersistInFlight = false;
let pendingRemotePersistPayload = null;
let dragAnimationFrame = 0;
let pendingDragPoint = null;
const mesaSheetSaveTimers = new Map();
const pendingMesaSheetPatches = new Map();
let mesaInitStarted = false;

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
  state.roster = buildRoster();

  await hydrateState();
  renderAll();
}

function bindEvents() {
  if (document.body.dataset.mesaEventsBound === "1") return;
  document.body.dataset.mesaEventsBound = "1";

  const previewToggle = document.getElementById("playerPreviewToggle");
  const rosterSearch = document.getElementById("rosterSearch");
  const resetMesaBtn = document.getElementById("resetMesaBtn");
  const stage = document.getElementById("mesaStage");
  const fullscreenMesaBtn = document.getElementById("fullscreenMesaBtn");
  const rosterList = document.getElementById("rosterList");
  const tokenInspector = document.getElementById("tokenInspector");

  previewToggle?.addEventListener("change", event => {
    if (!isMaster()) return;
    state.previewPlayerView = Boolean(event.target.checked);
    persistState();
    renderAll();
  });

  rosterSearch?.addEventListener("input", event => {
    state.search = String(event.target.value || "").trim().toLowerCase();
    renderRoster();
  });

  resetMesaBtn?.addEventListener("click", () => {
    resetPrototype();
  });

  fullscreenMesaBtn?.addEventListener("click", toggleMesaFullscreen);

  stage?.addEventListener("click", event => {
    const tokenElement = event.target.closest("[data-token-id]");
    if (!tokenElement) return;
    selectToken(String(tokenElement.dataset.tokenId || ""));
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
    persistState({ immediate: true });
  }
}

async function loadMesaSceneSnapshot() {
  if (window.AUTH?.isBackendEnabled?.() && window.APP?.getMesaScene) {
    try {
      const remoteScene = await window.APP.getMesaScene();
      const remoteData = remoteScene?.data && typeof remoteScene.data === "object" ? remoteScene.data : {};
      localStorage.setItem(MESA_STORAGE_KEY, JSON.stringify(remoteData));
      state.scenePersistence = "remote";
      return remoteData;
    } catch (error) {
      console.warn("Falha ao carregar cena oficial da mesa.", error);
    }
  }

  state.scenePersistence = "local";
  return readJsonStorage(MESA_STORAGE_KEY, {});
}

function applyMesaSceneSnapshot(saved) {
  const rosterMap = new Map(state.roster.map(entry => [entry.characterKey, entry]));
  const savedTokens = Array.isArray(saved?.tokens) ? saved.tokens : [];
  const mergedTokens = savedTokens
    .map(token => mergeTokenWithRoster(token, rosterMap.get(String(token.characterKey || ""))))
    .filter(Boolean);

  const seeded = !mergedTokens.length;
  state.tokens = seeded ? seedInitialTokens() : mergedTokens;
  state.previewPlayerView = isMaster() ? Boolean(saved?.previewPlayerView) : false;
  state.selectedTokenId = pickInitialSelectedToken(saved?.selectedTokenId);
  return { seeded, savedTokenCount: savedTokens.length };
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

function renderAll() {
  syncSelectedToken();
  renderHeader();
  renderSummary();
  renderControls();
  renderRoster();
  renderStage();
  renderInspector();
}

function renderHeader() {
  const headerUser = document.getElementById("headerUser");
  if (headerUser) {
    headerUser.textContent = state.session?.username || "Convidado";
  }
}
