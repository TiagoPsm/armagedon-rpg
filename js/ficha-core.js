const SHEETS_KEY = "tc_sheets";
const NPCS_KEY = "tc_npcs";
const MONSTERS_KEY = "tc_monsters";
const REMOTE_SHEETS_KEY = "tc_remote_sheets";
const NPC_PREFIX = "npc:";
const MONSTER_PREFIX = "monster:";
const ATTRIBUTES = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"];
const DEFAULT_INVENTORY_SLOTS = 10;
const HAB_CARD_STATE_KEY = "tc_hab_card_states";
const ITEM_TYPES = {
  arma: "Arma",
  acessorio: "Acessório",
  outro: "Outro"
};
const HAB_TYPES = {
  ativa: "Ativa",
  passiva: "Passiva"
};
const DICE_PRESETS = [
  { key: "d4", label: "D4", sides: 4 },
  { key: "d6", label: "D6", sides: 6 },
  { key: "d8", label: "D8", sides: 8 },
  { key: "d10", label: "D10", sides: 10 },
  { key: "d12", label: "D12", sides: 12 },
  { key: "d20", label: "D20", sides: 20 },
  { key: "d100", label: "D100", sides: 100 }
];
const DICE_TRAY_MODES = {
  normal: "Normal",
  advantage: "Vantagem",
  disadvantage: "Desvantagem"
};
const DEFAULT_DICE_PRESET = "d20";
const DICE_TRAY_HISTORY_LIMIT = 5;
const DICE_ROLL_PREVIEW_LIMIT = 12;
const DICE_TRAY_ANIMATION_MS = 180;
const DICE_TRAY_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
const SOUL = window.SOUL_ESSENCE || null;

function normalizeSoulCoreState(value, legacyRank = 1) {
  if (SOUL.normalizeSoulCore) {
    return SOUL.normalizeSoulCore(value, legacyRank);
  }

  const rankSource = value && typeof value === "object" ? (value.rank ?? legacyRank) : legacyRank;
  const xpSource = value && typeof value === "object" ? value.xp : 0;
  const rank = Math.min(7, Math.max(1, Number.parseInt(rankSource, 10) || 1));
  const xp = Math.max(0, Number.parseInt(xpSource, 10) || 0);
  return { rank, xp };
}

function getSoulRankName(rank) {
  if (SOUL.getRankName) {
    return SOUL.getRankName(rank);
  }

  const names = {
    1: "Adormecido",
    2: "Despertado",
    3: "Ascendido",
    4: "Transcendido",
    5: "Supremo",
    6: "Sagrado",
    7: "Divino"
  };

  return names[Math.min(7, Math.max(1, Number.parseInt(rank, 10) || 1))] || names[1];
}

function getSoulNextRankRequirement(rank) {
  if (SOUL.getNextRankRequirement) {
    return SOUL.getNextRankRequirement(rank);
  }

  const normalizedRank = Math.min(7, Math.max(1, Number.parseInt(rank, 10) || 1));
  const sameRankEssencesPerRankUp = 100;
  const baseExperienceByRank = {
    1: 10,
    2: 25,
    3: 50,
    4: 100,
    5: 200,
    6: 400,
    7: 800
  };

// Fallback local: subir de rank exige o equivalente a 100 essências do mesmo rank.
  return normalizedRank >= 7
    ? 0
    : (baseExperienceByRank[normalizedRank] || 0) * sameRankEssencesPerRankUp;
}

function calculateSoulEssenceExperience(characterRank, essenceRank) {
  if (SOUL.calculateEssenceExperience) {
    return SOUL.calculateEssenceExperience(characterRank, essenceRank);
  }

  return 0;
}

function absorbSoulEssencesState(core, essenceRank, amount = 1) {
  if (SOUL.absorbSoulEssences) {
    return SOUL.absorbSoulEssences(core, essenceRank, amount);
  }

  return {
    core: normalizeSoulCoreState(core),
    applications: [],
    totalExperience: 0,
    rankUps: [],
    essenceRank: Number.parseInt(essenceRank, 10) || 1,
    amount: Number.parseInt(amount, 10) || 1
  };
}

function buildSoulProgressLabel(core) {
  if (SOUL.buildProgressLabel) {
    return SOUL.buildProgressLabel(core);
  }

  const normalized = normalizeSoulCoreState(core);
  const requirement = getSoulNextRankRequirement(normalized.rank);
  return requirement ? `${normalized.xp} / ${requirement} XP` : "Rank máximo alcançado";
}

let currentUser = null;
let currentRole = null;
let currentSheetTarget = null;
let habs = [];
let habCardStates = {};
let inv = [];
let inventorySlots = DEFAULT_INVENTORY_SLOTS;
let memoryDrops = [];
let ownedMemories = [];
let memoryRollStates = {};
let ownedMemoryTransferStates = {};
let itemTransferStates = {};
let itemRollStates = {};
let itemEditorIndex = -1;
let itemEditorSnapshot = null;
let itemEditorIsNew = false;
let soulCore = normalizeSoulCoreState(null, 1);
let soulAwardState = {
  open: false,
  essenceRank: 1,
  amount: 1
};
let diceTrayState = {
  open: false,
  preset: DEFAULT_DICE_PRESET,
  qty: 1,
  modifier: 0,
  mode: "normal",
  customExpression: "",
  historyOpen: false,
  advancedOpen: false,
  rolling: false,
  lastResult: null,
  history: []
};
let remoteSheetsCache = {};
let saveTimer = null;
let saveRequestId = 0;
let sheetRealtimeBound = false;
let directoryRefreshTimer = null;
let sheetRefreshTimer = null;
let pendingRealtimeSheetKey = "";
let diceTrayCloseTimer = 0;
const RECENT_LOCAL_SAVE_MS = 1500;
const recentLocalSaveMap = {};

function isBackendMode() {
  return AUTH.isBackendEnabled();
}

function loadRemoteSheetsCache() {
  try {
    return JSON.parse(localStorage.getItem(REMOTE_SHEETS_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistRemoteSheetsCache() {
  localStorage.setItem(REMOTE_SHEETS_KEY, JSON.stringify(remoteSheetsCache));
}

function isMasterScreenActive() {
  return document.getElementById("masterScreen").classList.contains("active");
}

function isSheetScreenActive() {
  return document.getElementById("sheetScreen").classList.contains("active");
}

function hasEditableFocus() {
  const activeElement = document.activeElement;
  return Boolean(
    activeElement &&
      !activeElement.readOnly &&
      !activeElement.disabled &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable)
  );
}

function markRecentLocalSave(key) {
  if (!key) return;
  recentLocalSaveMap[key] = Date.now();
}

function isRecentLocalSave(key) {
  if (!key) return false;
  return Date.now() - (recentLocalSaveMap[key] || 0) < RECENT_LOCAL_SAVE_MS;
}

function scheduleDirectoryRefresh(delay = 140) {
  if (!isBackendMode()) return;
  if (directoryRefreshTimer) window.clearTimeout(directoryRefreshTimer);

  directoryRefreshTimer = window.setTimeout(async () => {
    try {
      await AUTH.refreshDirectory();
      if (isMasterScreenActive()) {
        renderPlayers();
        renderNpcs();
        renderMonsters();
      }
    } catch {}
  }, delay);
}

function scheduleRealtimeSheetReload(key, delay = 180) {
  if (!key || !currentSheetTarget.key || currentSheetTarget.key !== key) return;
  if (isRecentLocalSave(key)) return;

  if (hasEditableFocus()) {
    pendingRealtimeSheetKey = key;
    return;
  }

  if (sheetRefreshTimer) window.clearTimeout(sheetRefreshTimer);
  sheetRefreshTimer = window.setTimeout(async () => {
    if (!isSheetScreenActive()) return;
    if (!currentSheetTarget.key || currentSheetTarget.key !== key) return;

    try {
      await loadSheet(key, currentSheetTarget.kind);
    } catch {}
  }, delay);
}

function flushPendingRealtimeSheetReload() {
  if (!pendingRealtimeSheetKey) return;
  if (hasEditableFocus()) return;
  if (!isSheetScreenActive()) return;

  const pendingKey = pendingRealtimeSheetKey;
  pendingRealtimeSheetKey = "";
  scheduleRealtimeSheetReload(pendingKey, 0);
}

function bindSheetRealtime() {
  if (sheetRealtimeBound || !isBackendMode()) return;
  sheetRealtimeBound = true;

  APP.on("directory:changed", () => {
    scheduleDirectoryRefresh();
  });

  APP.on("sheet:changed", detail => {
    const key = String(detail.key || "").trim().toLowerCase();
    if (!key) return;

    scheduleDirectoryRefresh();
    scheduleRealtimeSheetReload(key);
  });

  APP.on("inventory:changed", detail => {
    const sourceKey = String(detail.sourceKey || "").trim().toLowerCase();
    const targetKey = String(detail.targetKey || "").trim().toLowerCase();

    scheduleDirectoryRefresh();

    if (currentSheetTarget.key === sourceKey || currentSheetTarget.key === targetKey) {
      scheduleRealtimeSheetReload(currentSheetTarget.key);
    }
  });

  APP.on("memory:changed", detail => {
    const sourceKey = String(detail.sourceKey || "").trim().toLowerCase();
    const targetKey = String(detail.targetKey || "").trim().toLowerCase();

    scheduleDirectoryRefresh();

    if (currentSheetTarget.key === sourceKey || currentSheetTarget.key === targetKey) {
      scheduleRealtimeSheetReload(currentSheetTarget.key);
    }
  });

  window.addEventListener("focus", flushPendingRealtimeSheetReload);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      flushPendingRealtimeSheetReload();
    }
  });
  document.addEventListener("click", () => {
    window.setTimeout(flushPendingRealtimeSheetReload, 0);
  });
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.body.setAttribute("data-active-screen", id);
}

async function loadSheet(username, kind = "player") {
  const cachedSheets = readSheets();
  const cachedData = normalizeSheetData(cachedSheets[username] || {}, kind);
  applySheetData(cachedData, kind);

  if (isBackendMode()) {
    try {
      const character = await APP.getCharacter(username);
      const mergedRemoteData = mergeSheetHabDraft(character.data || {}, remoteSheetsCache[username] || {});
      remoteSheetsCache[username] = normalizeSheetData(mergedRemoteData, kind);
      persistRemoteSheetsCache();

      if (!currentSheetTarget || currentSheetTarget.key !== username) return;
      applySheetData(remoteSheetsCache[username], kind);
    } catch (error) {
      if (!hasRenderableSheetData(cachedData)) {
        await UI.alert(error.message || "Falha ao carregar a ficha no servidor.", {
          title: "Falha ao carregar ficha",
          kicker: "// Servidor"
        });
      }
    }
  }
}

function hasRenderableSheetData(data) {
  if (!data) return false;

  if (data.charName || data.charClass || data.charNotes || data.avatar) return true;
  if (Array.isArray(data.habs) && data.habs.length) return true;
  if (Array.isArray(data.inv) && data.inv.length) return true;
  if (Array.isArray(data.ownedMemories) && data.ownedMemories.length) return true;
  if (Array.isArray(data.memoryDrops) && data.memoryDrops.length) return true;
  return ATTRIBUTES.some(attr => String(data[`attr${attr}`] || "").trim() !== "");
}

function applySheetData(data, kind = "player") {
  setValue("charName", data.charName);
  setValue("charClass", data.charClass);
  setValue("charLevel", data.charLevel);
  setValue("charRace", data.charRace);
  setValue("charFaction", data.charFaction);
  setValue("vidaAtual", data.vidaAtual);
  setValue("vidaMax", data.vidaMax);
  setValue("integAtual", data.integAtual);
  setValue("integMax", data.integMax);
  setValue("charNotes", data.charNotes);

  const avatarImg = document.getElementById("avatarImg");
  const avatarPlaceholder = document.getElementById("avatarPlaceholder");
  if (avatarImg && avatarPlaceholder) {
    if (data.avatar) {
      avatarImg.src = data.avatar;
      avatarImg.style.display = "block";
      avatarPlaceholder.style.display = "none";
    } else {
      avatarImg.style.display = "none";
      avatarPlaceholder.style.display = "block";
    }
  }

  ATTRIBUTES.forEach(attr => {
    const value = data[`attr${attr}`];
    setValue(`attr${attr}`, value);
    calcModFromVal(attr, parseInt(value, 10));
  });

  habs = data.habs;
  inv = data.inv;
  inventorySlots = data.inventorySlots;
  memoryDrops = data.memoryDrops;
  ownedMemories = data.ownedMemories;
  soulCore = normalizeSoulCoreState(data.soulCore, data.charLevel || 1);
  memoryRollStates = {};
  ownedMemoryTransferStates = {};
  itemTransferStates = {};
  itemRollStates = {};
  loadHabCardStatesForCurrentSheet();
  resetItemEditorState();

  updateBar("vida");
  updateBar("integ");
  renderHabs(habs);
  renderOwnedMemories(ownedMemories);
  renderInv(inv);
  renderMemoryDrops(memoryDrops);
  renderProgressionField(kind);
  syncAutoGrowTextareas();
}

async function saveSheet() {
  await saveCurrentSheet();

  const saveMsg = document.getElementById("saveMsg");
  if (!saveMsg) return;

  saveMsg.textContent = "Salvo com sucesso.";
  saveMsg.className = "save-msg saved";
  setTimeout(() => {
    saveMsg.textContent = "";
    saveMsg.className = "save-msg";
  }, 3000);
}

function saveSheetSilently() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveCurrentSheet();
    saveTimer = null;
  }, isBackendMode() ? 450 : 220);
}

function flushSheetSaveOnExit(options = {}) {
  const {
    keepalive = isBackendMode(),
    suppressError = true,
    allowInactive = true
  } = options;

  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }

  return saveCurrentSheet({
    keepalive,
    suppressError,
    allowInactive
  });
}

async function saveCurrentSheet(options = {}) {
  const {
    keepalive = false,
    suppressError = false,
    allowInactive = false
  } = options;

  if (!currentSheetTarget?.key) return true;
  if (!allowInactive && !document.getElementById("sheetScreen").classList.contains("active")) return true;

  enforceSheetRules();
  const data = collectSheetData(currentSheetTarget.kind);
  soulCore = normalizeSoulCoreState(data.soulCore, data.charLevel || 1);

  if (isBackendMode()) {
    const requestId = ++saveRequestId;
    markRecentLocalSave(currentSheetTarget.key);
    remoteSheetsCache[currentSheetTarget.key] = normalizeSheetData(data, currentSheetTarget.kind);
    persistRemoteSheetsCache();
    try {
      const saved = await APP.saveCharacter(currentSheetTarget.key, data, { keepalive });
      if (requestId !== saveRequestId) return;
      const savedData = mergeSheetHabDraft(saved?.data || data, data);
      remoteSheetsCache[currentSheetTarget.key] = normalizeSheetData(savedData, currentSheetTarget.kind);
      persistRemoteSheetsCache();
      soulCore = normalizeSoulCoreState(
        remoteSheetsCache[currentSheetTarget.key].soulCore,
        remoteSheetsCache[currentSheetTarget.key].charLevel || 1
      );
      renderProgressionField(currentSheetTarget.kind);
      if (currentSheetTarget.kind === "player" || currentSheetTarget.kind === "npc" || currentSheetTarget.kind === "monster") {
        syncDirectoryName(savedData.charName || data.charName);
      }
      return true;
    } catch (error) {
      if (suppressError) return false;
      const saveMsg = document.getElementById("saveMsg");
      if (saveMsg) {
        saveMsg.textContent = error.message || "Falha ao salvar no servidor.";
        saveMsg.className = "save-msg";
      }
      return false;
    }
  } else {
    const sheets = readSheets();
    sheets[currentSheetTarget.key] = data;
    writeSheets(sheets);
    renderProgressionField(currentSheetTarget.kind);
    syncDirectoryName(data.charName);
    return true;
  }
}

function collectSheetData(kind = "player") {
  const avatarImg = document.getElementById("avatarImg");
  const attrData = {};
  const isMonster = kind === "monster";
  const isPlayer = kind === "player";
  const nextSoulCore = normalizeSoulCoreState(
    isPlayer
      ? soulCore
      : {
          rank: getValue("charLevel") || 1,
          xp: 0
        },
    getValue("charLevel") || 1
  );

  ATTRIBUTES.forEach(attr => {
    attrData[`attr${attr}`] = getValue(`attr${attr}`);
  });

  return normalizeSheetData(
    {
      charName: getValue("charName"),
      charClass: getValue("charClass"),
      charLevel: isPlayer ? String(nextSoulCore.rank) : getValue("charLevel"),
      soulCore: nextSoulCore,
      charRace: getValue("charRace"),
      charFaction: isMonster ? "" : getValue("charFaction"),
      avatar: avatarImg && avatarImg.style.display !== "none" ? avatarImg.src : "",
      vidaAtual: getValue("vidaAtual"),
      vidaMax: getValue("vidaMax"),
      integAtual: getValue("integAtual"),
      integMax: getValue("integMax"),
      charNotes: getValue("charNotes"),
      ...attrData,
      habs: collectHabs(),
      ownedMemories: isMonster ? [] : collectOwnedMemories(),
      inventorySlots: isMonster ? 0 : inventorySlots,
      inv: isMonster ? [] : collectInv(),
      memoryDrops: isMonster ? collectMemoryDrops() : []
    },
    kind
  );
}

function readSheets() {
  if (isBackendMode()) {
    return remoteSheetsCache;
  }
  return JSON.parse(localStorage.getItem(SHEETS_KEY) || "{}");
}

function writeSheets(sheets) {
  if (isBackendMode()) {
    remoteSheetsCache = { ...sheets };
    persistRemoteSheetsCache();
    return;
  }
  localStorage.setItem(SHEETS_KEY, JSON.stringify(sheets));
}

function readNpcs() {
  if (isBackendMode()) {
    return AUTH.getDirectoryCache().npcs.map(normalizeNpc);
  }
  try {
    return JSON.parse(localStorage.getItem(NPCS_KEY) || "[]").map(normalizeNpc);
  } catch {
    return [];
  }
}

function writeNpcs(npcs) {
  if (isBackendMode()) {
    const directory = AUTH.getDirectoryCache();
    AUTH.setDirectoryCache({
      ...directory,
      npcs: npcs.map(normalizeNpc)
    });
    return;
  }
  localStorage.setItem(NPCS_KEY, JSON.stringify(npcs.map(normalizeNpc)));
}

function readMonsters() {
  if (isBackendMode()) {
    return AUTH.getDirectoryCache().monsters.map(normalizeMonster);
  }
  try {
    return JSON.parse(localStorage.getItem(MONSTERS_KEY) || "[]").map(normalizeMonster);
  } catch {
    return [];
  }
}

function writeMonsters(monsters) {
  if (isBackendMode()) {
    const directory = AUTH.getDirectoryCache();
    AUTH.setDirectoryCache({
      ...directory,
      monsters: monsters.map(normalizeMonster)
    });
    return;
  }
  localStorage.setItem(MONSTERS_KEY, JSON.stringify(monsters.map(normalizeMonster)));
}

function normalizeSheetData(data, kind = "player") {
  const isMonster = kind === "monster";
  const nextSoulCore = normalizeSoulCoreState(data.soulCore, data.charLevel || 1);
  const vidaMax = normalizeSheetResourceValue(data.vidaMax);
  const integMax = normalizeSheetResourceValue(data.integMax);
  const normalized = {
    charName: data.charName || "",
    charClass: data.charClass || "",
    charLevel: String(data.charLevel || nextSoulCore.rank || ""),
    soulCore: nextSoulCore,
    charRace: data.charRace || "",
    charFaction: isMonster ? "" : data.charFaction || "",
    avatar: data.avatar || "",
    vidaAtual: clampSheetResourceValue(data.vidaAtual, vidaMax),
    vidaMax,
    integAtual: clampSheetResourceValue(data.integAtual, integMax),
    integMax,
    charNotes: data.charNotes || "",
    habs: Array.isArray(data.habs) ? data.habs.map(normalizeHab) : [],
    ownedMemories: isMonster ? [] : Array.isArray(data.ownedMemories) ? data.ownedMemories.map(normalizeOwnedMemory) : [],
    inventorySlots: isMonster ? 0 : normalizeInventorySlots(kind, data.inventorySlots),
    inv: isMonster ? [] : Array.isArray(data.inv) ? data.inv.map(normalizeItem) : [],
    memoryDrops: isMonster ? (Array.isArray(data.memoryDrops) ? data.memoryDrops.map(normalizeMemoryDrop) : []) : []
  };

  ATTRIBUTES.forEach(attr => {
    normalized[`attr${attr}`] = sanitizeAttrValue(attr, data[`attr${attr}`], "");
  });

  if (!isMonster) {
    normalized.integMax = getIntegrityMaxFromSoul(normalized.attrAlma, normalized.integMax || "");
    normalized.integAtual = clampSheetResourceValue(normalized.integAtual, normalized.integMax);
  }

  if (kind === "player") {
    normalized.charLevel = String(normalized.soulCore.rank);
  }

  return normalized;
}

function normalizeSheetResourceValue(value, fallback = "") {
  if (value === "" || value === null || value === undefined) return fallback;

  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;

  return String(Math.max(0, numeric));
}

function clampSheetResourceValue(value, maxValue, fallback = "") {
  const current = normalizeSheetResourceValue(value, fallback);
  if (current === "") return current;

  const max = normalizeSheetResourceValue(maxValue, "");
  if (max === "") return current;

  return String(Math.min(
    Number.parseInt(current, 10),
    Number.parseInt(max, 10)
  ));
}

function normalizeHab(hab) {
  const legacyDesc = String(hab?.desc || "");
  return {
    id: String(hab?.id || createHabId()),
    name: String(hab?.name || ""),
    type: normalizeHabType(hab?.type),
    trigger: String(hab?.trigger || hab?.gatilho || ""),
    desc: legacyDesc
  };
}

function createHabId() {
  return `hab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHabType(value) {
  const normalized = String(value || "ativa").trim().toLowerCase();
  if (normalized === "passiva") return "passiva";
  return "ativa";
}

function getHabTypeLabel(type) {
  return HAB_TYPES[normalizeHabType(type)] || HAB_TYPES.ativa;
}

function getHabTypeBadgeClass(type) {
  return `hab-type-badge is-${normalizeHabType(type)}`;
}

function buildHabSummaryMeta(hab) {
  const trigger = String(hab.trigger || "").trim();
  const desc = String(hab.desc || "").trim();

  if (trigger) return `Gatilho: ${trigger}`;
  if (desc) {
    return desc.length > 110 ? `${desc.slice(0, 107)}...` : desc;
  }

  return "Sem gatilho ou descrição definidos.";
}

function syncHabCardStates() {
  habCardStates = habs.reduce((nextState, hab) => {
    nextState[hab.id] = habCardStates[hab.id] || { collapsed: true };
    return nextState;
  }, {});
}

function readHabCardStateStore() {
  try {
    return JSON.parse(localStorage.getItem(HAB_CARD_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function loadHabCardStatesForCurrentSheet() {
  habCardStates = {};
}

function persistHabCardStatesForCurrentSheet() {
  if (!currentSheetTarget?.key) return;

  const store = readHabCardStateStore();
  const nextStates = Object.fromEntries(
    habs
      .filter(hab => hab?.id)
      .map(hab => [hab.id, { collapsed: Boolean(habCardStates[hab.id]?.collapsed) }])
  );

  store[currentSheetTarget.key] = nextStates;
  localStorage.setItem(HAB_CARD_STATE_KEY, JSON.stringify(store));
}

function createHabIdentityKey(hab) {
  const id = String(hab?.id || "").trim();
  if (id) return `id:${id}`;

  const name = String(hab?.name || "").trim().toLowerCase();
  const desc = String(hab?.desc || "").trim().toLowerCase();
  if (name || desc) return `text:${name}::${desc}`;

  return "";
}

function pickHabFallbackForMerge(incomingHab, fallbackHabs, index) {
  if (!Array.isArray(fallbackHabs) || !fallbackHabs.length) return null;

  const incomingKey = createHabIdentityKey(incomingHab);
  if (incomingKey) {
    const directMatch = fallbackHabs.find(candidate => createHabIdentityKey(candidate) === incomingKey);
    if (directMatch) return directMatch;
  }

  return fallbackHabs[index] || null;
}

function mergeHabDraftEntry(incomingHab, fallbackHab) {
  const source = incomingHab && typeof incomingHab === "object" ? incomingHab : {};
  const fallback = fallbackHab && typeof fallbackHab === "object" ? fallbackHab : {};

  return normalizeHab({
    id: source.id || fallback.id || createHabId(),
    name: source.name ?? fallback.name ?? "",
    type: source.type ?? fallback.type ?? "ativa",
    trigger: source.trigger ?? source.gatilho ?? fallback.trigger ?? fallback.gatilho ?? "",
    desc: source.desc ?? fallback.desc ?? ""
  });
}

function mergeHabCollections(incomingHabs, fallbackHabs) {
  if (!Array.isArray(incomingHabs)) return [];
  if (!Array.isArray(fallbackHabs) || !fallbackHabs.length || !incomingHabs.length) {
    return incomingHabs.map(normalizeHab);
  }

  return incomingHabs.map((incomingHab, index) =>
    mergeHabDraftEntry(incomingHab, pickHabFallbackForMerge(incomingHab, fallbackHabs, index))
  );
}

function mergeSheetHabDraft(incomingData, fallbackData) {
  const nextData = incomingData && typeof incomingData === "object" ? { ...incomingData } : {};
  const fallback = fallbackData && typeof fallbackData === "object" ? fallbackData : {};

  if (Array.isArray(nextData.habs)) {
    nextData.habs = mergeHabCollections(nextData.habs, fallback.habs);
  }

  return nextData;
}

function normalizeItem(item) {
  const type = normalizeItemType(item.type);
  return {
    name: String(item.name || ""),
    qty: String(Math.max(0, Number.parseInt(item.qty || "1", 10) || 0)),
    desc: String(item.desc || ""),
    type,
    damage: type === "arma" ? normalizeDamageExpression(item.damage) : ""
  };
}

function normalizeItemType(value) {
  const normalized = String(value || "outro").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ITEM_TYPES, normalized) ? normalized : "outro";
}

function normalizeDamageExpression(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 24);
}

function normalizeInventorySlots(kind, value) {
  if (kind === "monster") return 0;
  if (kind === "npc") return DEFAULT_INVENTORY_SLOTS;

  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return DEFAULT_INVENTORY_SLOTS;
  return Math.max(DEFAULT_INVENTORY_SLOTS, Math.min(120, numeric));
}

function normalizeOwnedMemory(memory) {
  return {
    name: memory.name || "",
    desc: memory.desc || "",
    source: memory.source || ""
  };
}

function normalizeMemoryDrop(drop) {
  return {
    name: drop.name || "",
    desc: drop.desc || "",
    chance: sanitizeChance(drop.chance, "0")
  };
}

function itemHasContent(item) {
  return Boolean(
    String(item.name || "").trim() ||
      String(item.desc || "").trim() ||
      (normalizeItemType(item.type) === "arma" && String(item.damage || "").trim()) ||
      Number.parseInt(item.qty || "0", 10) > 1
  );
}

function formatItemType(type) {
  return ITEM_TYPES[normalizeItemType(type)] || ITEM_TYPES.outro;
}

function getItemTypeBadgeClass(type) {
  if (type === "arma") return "item-type-badge is-weapon";
  if (type === "acessorio") return "item-type-badge is-accessory";
  return "item-type-badge";
}

function parseDamageExpression(expression) {
  const sanitized = normalizeDamageExpression(expression);
  const match = sanitized.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;

  const diceCount = Number.parseInt(match[1], 10);
  const diceSides = Number.parseInt(match[2], 10);
  const modifier = Number.parseInt(match[3] || "0", 10);

  if (
    Number.isNaN(diceCount) ||
    Number.isNaN(diceSides) ||
    Number.isNaN(modifier) ||
    diceCount < 1 ||
    diceSides < 2 ||
    diceSides > 1000 ||
    Math.abs(modifier) > 1000
  ) {
    return null;
  }

  return {
    expression: sanitized,
    diceCount,
    diceSides,
    modifier
  };
}

function rollDamageExpression(expression) {
  const parsed = parseDamageExpression(expression);
  if (!parsed) return null;

  const rolls = [];
  let subtotal = 0;

  for (let index = 0; index < parsed.diceCount; index += 1) {
    const roll = 1 + Math.floor(Math.random() * parsed.diceSides);
    subtotal += roll;
    if (rolls.length < DICE_ROLL_PREVIEW_LIMIT) {
      rolls.push(roll);
    }
  }

  const total = subtotal + parsed.modifier;

  return {
    ...parsed,
    rolls,
    hiddenRollCount: Math.max(0, parsed.diceCount - rolls.length),
    subtotal,
    total
  };
}

function sanitizeChance(value, fallback = "0") {
  if (value === "" || value === null || value === undefined) return fallback;

  const numeric = Number.parseFloat(String(value).replace(",", "."));
  if (Number.isNaN(numeric)) return fallback;

  return String(Math.max(0, Math.min(100, numeric)));
}

function normalizeNpc(npc) {
  return {
    id: String(npc.id || createNpcId()),
    name: String(npc.name || "NPC").trim() || "NPC"
  };
}

function normalizeMonster(monster) {
  return {
    id: String(monster.id || createMonsterId()),
    name: String(monster.name || "Monstro").trim() || "Monstro"
  };
}

function createNpcId() {
  return `npc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createMonsterId() {
  return `monster-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getNpcSheetKey(id) {
  return `${NPC_PREFIX}${id}`;
}

function getMonsterSheetKey(id) {
  return `${MONSTER_PREFIX}${id}`;
}

function createPlayerTarget(username) {
  const player = AUTH.getPlayers().find(candidate => candidate.username === username);
  return {
    kind: "player",
    key: username,
    owner: username,
    label: player.charname || username
  };
}

function createNpcTarget(npc) {
  return {
    kind: "npc",
    key: getNpcSheetKey(npc.id),
    npcId: npc.id,
    label: npc.name
  };
}

function createMonsterTarget(monster) {
  return {
    kind: "monster",
    key: getMonsterSheetKey(monster.id),
    monsterId: monster.id,
    label: monster.name
  };
}

function syncAutoGrowTextareas(scope = document) {
  scope.querySelectorAll("textarea.auto-grow").forEach(autoGrowTextarea);
}

function autoGrowTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsEsc(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
