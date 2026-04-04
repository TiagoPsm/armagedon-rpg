const SHEETS_KEY = "tc_sheets";
const NPCS_KEY = "tc_npcs";
const MONSTERS_KEY = "tc_monsters";
const REMOTE_SHEETS_KEY = "tc_remote_sheets";
const NPC_PREFIX = "npc:";
const MONSTER_PREFIX = "monster:";
const ATTRIBUTES = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"];
const DEFAULT_INVENTORY_SLOTS = 20;
const ITEM_TYPES = {
  arma: "Arma",
  acessorio: "Acessório",
  outro: "Outro"
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
const SOUL = window.SOUL_ESSENCE || null;

let currentUser = null;
let currentRole = null;
let currentSheetTarget = null;
let habs = [];
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
  rolling: false,
  lastResult: null
};
let remoteSheetsCache = {};
let saveTimer = null;
let saveRequestId = 0;
let sheetRealtimeBound = false;
let directoryRefreshTimer = null;
let sheetRefreshTimer = null;
let pendingRealtimeSheetKey = "";
const RECENT_LOCAL_SAVE_MS = 1500;
const recentLocalSaveMap = {};

document.addEventListener("DOMContentLoaded", async () => {
  await AUTH_READY;
  remoteSheetsCache = loadRemoteSheetsCache();

  const session = AUTH.requireAuth();
  if (!session) return;

  currentUser = session.username;
  currentRole = session.role;

  if (AUTH.isBackendEnabled()) {
    await AUTH.refreshDirectory();
    bindSheetRealtime();
  }

  if (currentRole === "master") {
    await openMasterPanel();
  } else {
    await openSheet(createPlayerTarget(currentUser), false);
  }

  initAutoSave();
  initItemEditor();
  initSoulAwardModal();
  initDiceTray();
  syncAutoGrowTextareas();
});

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
  return document.getElementById("masterScreen")?.classList.contains("active");
}

function isSheetScreenActive() {
  return document.getElementById("sheetScreen")?.classList.contains("active");
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
  if (!key || !currentSheetTarget?.key || currentSheetTarget.key !== key) return;
  if (isRecentLocalSave(key)) return;

  if (hasEditableFocus()) {
    pendingRealtimeSheetKey = key;
    return;
  }

  if (sheetRefreshTimer) window.clearTimeout(sheetRefreshTimer);
  sheetRefreshTimer = window.setTimeout(async () => {
    if (!isSheetScreenActive()) return;
    if (!currentSheetTarget?.key || currentSheetTarget.key !== key) return;

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
    const key = String(detail?.key || "").trim().toLowerCase();
    if (!key) return;

    scheduleDirectoryRefresh();
    scheduleRealtimeSheetReload(key);
  });

  APP.on("inventory:changed", detail => {
    const sourceKey = String(detail?.sourceKey || "").trim().toLowerCase();
    const targetKey = String(detail?.targetKey || "").trim().toLowerCase();

    scheduleDirectoryRefresh();

    if (currentSheetTarget?.key === sourceKey || currentSheetTarget?.key === targetKey) {
      scheduleRealtimeSheetReload(currentSheetTarget.key);
    }
  });

  APP.on("memory:changed", detail => {
    const sourceKey = String(detail?.sourceKey || "").trim().toLowerCase();
    const targetKey = String(detail?.targetKey || "").trim().toLowerCase();

    scheduleDirectoryRefresh();

    if (currentSheetTarget?.key === sourceKey || currentSheetTarget?.key === targetKey) {
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
  document.getElementById(id)?.classList.add("active");
  document.body?.setAttribute("data-active-screen", id);
}

async function openMasterPanel() {
  currentSheetTarget = null;
  pendingRealtimeSheetKey = "";
  if (isBackendMode()) {
    await AUTH.refreshDirectory();
  }
  renderPlayers();
  renderNpcs();
  renderMonsters();
  resetAddPlayerForm();
  resetNpcForm();
  resetMonsterForm();
  showScreen("masterScreen");
}

function renderPlayers() {
  const players = AUTH.getPlayers();
  const listEl = document.getElementById("playersList");
  const btnsEl = document.getElementById("playersBtns");

  if (!listEl || !btnsEl) return;

  if (!players.length) {
    listEl.innerHTML = '<p class="empty-msg">Nenhum jogador cadastrado.</p>';
    btnsEl.innerHTML = '<p class="empty-msg">Nenhum jogador ainda.</p>';
    return;
  }

  listEl.innerHTML = players
    .map(
      player => `
        <div class="player-row">
          <div class="player-info">
            <span class="player-user">${esc(player.username)}</span>
            <span class="player-char">${esc(player.charname || "-")}</span>
          </div>
          <div class="player-actions">
            <button class="btn btn-ghost btn-sm" onclick="masterView('${jsEsc(player.username)}')">Ver ficha</button>
            <button class="btn-danger" onclick="removePlayer('${jsEsc(player.username)}')">Remover</button>
          </div>
        </div>
      `
    )
    .join("");

  btnsEl.innerHTML = players
    .map(
      player => `
        <button class="player-btn" onclick="masterView('${jsEsc(player.username)}')">
          ${esc(player.charname || player.username)}
        </button>
      `
    )
    .join("");
}

async function addPlayer() {
  const username = document.getElementById("newUser")?.value.trim() || "";
  const password = document.getElementById("newPass")?.value || "";
  const charname = document.getElementById("newChar")?.value.trim() || "";
  const errEl = document.getElementById("addError");
  if (!errEl) return;

  errEl.textContent = "";

  if (!username || !password) {
    errEl.textContent = "Usuário e senha são obrigatórios.";
    return;
  }

  if (username.toLowerCase() === AUTH.MASTER_USER) {
    errEl.textContent = "Nome reservado.";
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.createPlayer({
        username,
        password,
        charname: charname || username
      });
      await AUTH.refreshDirectory();
    } catch (error) {
      errEl.textContent = error?.message || "Falha ao criar o jogador.";
      return;
    }
  } else {
    const players = AUTH.getPlayers();
    if (players.find(player => player.username.toLowerCase() === username.toLowerCase())) {
      errEl.textContent = "Já existe um jogador com esse nome.";
      return;
    }

    players.push({ username, password, charname: charname || username });
    localStorage.setItem(AUTH.PLAYERS_KEY, JSON.stringify(players));
  }

  resetAddPlayerForm();
  renderPlayers();
}

async function addNpc() {
  const name = document.getElementById("newNpcName")?.value.trim() || "";
  const errEl = document.getElementById("npcError");
  if (!errEl) return;

  errEl.textContent = "";

  if (!name) {
    errEl.textContent = "Informe o nome do NPC.";
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.createNpc({ name });
      await AUTH.refreshDirectory();
    } catch (error) {
      errEl.textContent = error?.message || "Falha ao criar o NPC.";
      return;
    }
  } else {
    const npcs = readNpcs();
    if (npcs.some(npc => npc.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = "Já existe um NPC com esse nome.";
      return;
    }

    const npc = normalizeNpc({
      id: createNpcId(),
      name
    });

    npcs.push(npc);
    writeNpcs(npcs);

    const sheets = readSheets();
    sheets[getNpcSheetKey(npc.id)] = normalizeSheetData({
      charName: npc.name
    }, "npc");
    writeSheets(sheets);
  }

  resetNpcForm();
  renderNpcs();
}

async function addMonster() {
  const name = document.getElementById("newMonsterName")?.value.trim() || "";
  const errEl = document.getElementById("monsterError");
  if (!errEl) return;

  errEl.textContent = "";

  if (!name) {
    errEl.textContent = "Informe o nome do monstro.";
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.createMonster({ name });
      await AUTH.refreshDirectory();
    } catch (error) {
      errEl.textContent = error?.message || "Falha ao criar o monstro.";
      return;
    }
  } else {
    const monsters = readMonsters();
    if (monsters.some(monster => monster.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = "Já existe um monstro com esse nome.";
      return;
    }

    const monster = normalizeMonster({
      id: createMonsterId(),
      name
    });

    monsters.push(monster);
    writeMonsters(monsters);

    const sheets = readSheets();
    sheets[getMonsterSheetKey(monster.id)] = normalizeSheetData({
      charName: monster.name
    }, "monster");
    writeSheets(sheets);
  }

  resetMonsterForm();
  renderMonsters();
}

function resetAddPlayerForm() {
  const newUser = document.getElementById("newUser");
  const newPass = document.getElementById("newPass");
  const newChar = document.getElementById("newChar");
  const addError = document.getElementById("addError");

  if (newUser) newUser.value = "";
  if (newPass) newPass.value = "";
  if (newChar) newChar.value = "";
  if (addError) addError.textContent = "";

  // Run after the browser has a chance to apply autofill so the form stays blank by default.
  setTimeout(() => {
    if (newUser) newUser.value = "";
    if (newPass) newPass.value = "";
    if (newChar) newChar.value = "";
  }, 0);
}

function resetNpcForm() {
  const newNpcName = document.getElementById("newNpcName");
  const npcError = document.getElementById("npcError");

  if (newNpcName) newNpcName.value = "";
  if (npcError) npcError.textContent = "";

  setTimeout(() => {
    if (newNpcName) newNpcName.value = "";
  }, 0);
}

function resetMonsterForm() {
  const newMonsterName = document.getElementById("newMonsterName");
  const monsterError = document.getElementById("monsterError");

  if (newMonsterName) newMonsterName.value = "";
  if (monsterError) monsterError.textContent = "";

  setTimeout(() => {
    if (newMonsterName) newMonsterName.value = "";
  }, 0);
}

async function removePlayer(username) {
  const confirmed = await UI.confirm(`Remover "${username}"? A ficha será apagada.`, {
    title: "Excluir jogador",
    kicker: "// Confirmação",
    confirmLabel: "Remover",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (isBackendMode()) {
    await APP.deletePlayer(username);
    await AUTH.refreshDirectory();
    delete remoteSheetsCache[username];
    persistRemoteSheetsCache();
  } else {
    const players = AUTH.getPlayers().filter(player => player.username !== username);
    localStorage.setItem(AUTH.PLAYERS_KEY, JSON.stringify(players));

    const sheets = readSheets();
    delete sheets[username];
    writeSheets(sheets);
  }

  renderPlayers();
}

async function masterView(username) {
  await openSheet(createPlayerTarget(username), true);
}

async function backToMaster() {
  await saveSheet();
  await openMasterPanel();
}

function openSheetLegacy(target, fromMaster) {
  const sheetUser = document.getElementById("sheetUser");
  const backButton = document.getElementById("btnBackMaster");
  const sheetKindLabel = document.getElementById("sheetKindLabel");
  const sheetSaveText = document.getElementById("sheetSaveText");
  const resolvedTarget = typeof target === "string" ? createPlayerTarget(target) : target;

  currentSheetTarget = resolvedTarget;

  if (sheetUser) {
    sheetUser.textContent =
      resolvedTarget.kind === "npc" ? `${resolvedTarget.label} · NPC` : resolvedTarget.label;
  }
  if (backButton) backButton.style.display = fromMaster ? "inline-block" : "none";
  if (sheetKindLabel) {
    sheetKindLabel.textContent = resolvedTarget.kind === "npc" ? "Ficha do NPC" : "Ficha do personagem";
  }
  if (sheetSaveText) {
    sheetSaveText.textContent =
      resolvedTarget.kind === "npc"
        ? "Toda alteração desta ficha de NPC fica salva neste navegador do mestre."
        : "Toda alteração da ficha fica salva para o usuário correto.";
  }

  loadSheet(resolvedTarget.key);
  showScreen("sheetScreen");
}

async function loadSheet(username, kind = "player") {
  let data = null;

  if (isBackendMode()) {
    try {
      const character = await APP.getCharacter(username);
      remoteSheetsCache[username] = normalizeSheetData(character?.data || {}, kind);
      persistRemoteSheetsCache();
    } catch (error) {
      await UI.alert(error?.message || "Falha ao carregar a ficha no servidor.", {
        title: "Falha ao carregar ficha",
        kicker: "// Servidor"
      });
    }
  }

  const sheets = readSheets();
  data = normalizeSheetData(sheets[username] || {}, kind);

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
  resetItemEditorState();

  updateBar("vida");
  if (kind !== "monster") updateBar("integ");
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
  if (isBackendMode()) {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveCurrentSheet();
    }, 450);
    return;
  }

  saveCurrentSheet();
}

async function saveCurrentSheet() {
  if (!currentSheetTarget?.key) return;
  if (!document.getElementById("sheetScreen")?.classList.contains("active")) return;

  enforceSheetRules();
  const data = collectSheetData(currentSheetTarget.kind);
  soulCore = normalizeSoulCoreState(data.soulCore, data.charLevel || 1);

  if (isBackendMode()) {
    const requestId = ++saveRequestId;
    markRecentLocalSave(currentSheetTarget.key);
    try {
      const saved = await APP.saveCharacter(currentSheetTarget.key, data);
      if (requestId !== saveRequestId) return;
      remoteSheetsCache[currentSheetTarget.key] = normalizeSheetData(saved?.data || data, currentSheetTarget.kind);
      persistRemoteSheetsCache();
      soulCore = normalizeSoulCoreState(
        remoteSheetsCache[currentSheetTarget.key]?.soulCore,
        remoteSheetsCache[currentSheetTarget.key]?.charLevel || 1
      );
      renderProgressionField(currentSheetTarget.kind);
      if (currentSheetTarget.kind === "player" || currentSheetTarget.kind === "npc" || currentSheetTarget.kind === "monster") {
        syncDirectoryName((saved?.data || data).charName);
      }
    } catch (error) {
      const saveMsg = document.getElementById("saveMsg");
      if (saveMsg) {
        saveMsg.textContent = error?.message || "Falha ao salvar no servidor.";
        saveMsg.className = "save-msg";
      }
      return;
    }
  } else {
    const sheets = readSheets();
    sheets[currentSheetTarget.key] = data;
    writeSheets(sheets);
    renderProgressionField(currentSheetTarget.kind);
  }

  syncDirectoryName(data.charName);
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
      integAtual: isMonster ? "" : getValue("integAtual"),
      integMax: isMonster ? "" : getValue("integMax"),
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
  const nextSoulCore = normalizeSoulCoreState(data?.soulCore, data?.charLevel || 1);
  const normalized = {
    charName: data.charName || "",
    charClass: data.charClass || "",
    charLevel: String(data?.charLevel || nextSoulCore.rank || ""),
    soulCore: nextSoulCore,
    charRace: data.charRace || "",
    charFaction: isMonster ? "" : data.charFaction || "",
    avatar: data.avatar || "",
    vidaAtual: data.vidaAtual || "",
    vidaMax: data.vidaMax || "",
    integAtual: isMonster ? "" : data.integAtual || "",
    integMax: isMonster ? "" : data.integMax || "",
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

    if (normalized.integMax !== "" && normalized.integAtual !== "") {
      const currentIntegrity = Number.parseInt(normalized.integAtual, 10);
      const maxIntegrity = Number.parseInt(normalized.integMax, 10);

      if (!Number.isNaN(currentIntegrity) && !Number.isNaN(maxIntegrity)) {
        normalized.integAtual = String(Math.max(0, Math.min(currentIntegrity, maxIntegrity)));
      }
    }
  }

  if (kind === "player") {
    normalized.charLevel = String(normalized.soulCore.rank);
  }

  return normalized;
}

function normalizeSoulCoreState(value, legacyRank = 1) {
  if (SOUL?.normalizeSoulCore) {
    return SOUL.normalizeSoulCore(value, legacyRank);
  }

  const rank = Math.min(7, Math.max(1, Number.parseInt(value?.rank ?? legacyRank, 10) || 1));
  const xp = Math.max(0, Number.parseInt(value?.xp, 10) || 0);
  return { rank, xp };
}

function getSoulRankName(rank) {
  if (SOUL?.getRankName) {
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
  if (SOUL?.getNextRankRequirement) {
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
  if (SOUL?.calculateEssenceExperience) {
    return SOUL.calculateEssenceExperience(characterRank, essenceRank);
  }

  return 0;
}

function absorbSoulEssencesState(core, essenceRank, amount = 1) {
  if (SOUL?.absorbSoulEssences) {
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
  if (SOUL?.buildProgressLabel) {
    return SOUL.buildProgressLabel(core);
  }

  const normalized = normalizeSoulCoreState(core);
  const requirement = getSoulNextRankRequirement(normalized.rank);
  return requirement ? `${normalized.xp} / ${requirement} XP` : "Rank maximo alcancado";
}

function normalizeHab(hab) {
  return {
    name: hab?.name || "",
    desc: hab?.desc || ""
  };
}

function normalizeItem(item) {
  const type = normalizeItemType(item?.type);
  return {
    name: String(item?.name || ""),
    qty: String(Math.max(0, Number.parseInt(item?.qty || "1", 10) || 0)),
    desc: String(item?.desc || ""),
    type,
    damage: type === "arma" ? normalizeDamageExpression(item?.damage) : ""
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
    name: memory?.name || "",
    desc: memory?.desc || "",
    source: memory?.source || ""
  };
}

function normalizeMemoryDrop(drop) {
  return {
    name: drop?.name || "",
    desc: drop?.desc || "",
    chance: sanitizeChance(drop?.chance, "0")
  };
}

function itemHasContent(item) {
  return Boolean(
    String(item?.name || "").trim() ||
      String(item?.desc || "").trim() ||
      (normalizeItemType(item?.type) === "arma" && String(item?.damage || "").trim()) ||
      Number.parseInt(item?.qty || "0", 10) > 1
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
    diceCount > 20 ||
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

  const rolls = Array.from({ length: parsed.diceCount }, () => 1 + Math.floor(Math.random() * parsed.diceSides));
  const subtotal = rolls.reduce((sum, roll) => sum + roll, 0);
  const total = subtotal + parsed.modifier;

  return {
    ...parsed,
    rolls,
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
    id: String(npc?.id || createNpcId()),
    name: String(npc?.name || "NPC").trim() || "NPC"
  };
}

function normalizeMonster(monster) {
  return {
    id: String(monster?.id || createMonsterId()),
    name: String(monster?.name || "Monstro").trim() || "Monstro"
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
    label: player?.charname || username
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

function renderNpcs() {
  const npcs = readNpcs();
  const listEl = document.getElementById("npcList");

  if (!listEl) return;

  if (!npcs.length) {
    listEl.innerHTML = '<p class="empty-msg">Nenhum NPC criado.</p>';
    return;
  }

  listEl.innerHTML = npcs
    .map(
      npc => `
        <div class="player-row">
          <div class="player-info">
            <span class="player-user">NPC</span>
            <span class="player-char">${esc(npc.name)}</span>
          </div>
          <div class="player-actions">
            <button class="btn btn-ghost btn-sm" onclick="masterViewNpc('${jsEsc(npc.id)}')">Abrir ficha</button>
            <button class="btn-danger" onclick="removeNpc('${jsEsc(npc.id)}')">Excluir</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderMonsters() {
  const monsters = readMonsters();
  const listEl = document.getElementById("monsterList");

  if (!listEl) return;

  if (!monsters.length) {
    listEl.innerHTML = '<p class="empty-msg">Nenhum monstro criado.</p>';
    return;
  }

  listEl.innerHTML = monsters
    .map(
      monster => `
        <div class="player-row">
          <div class="player-info">
            <span class="player-user">Monstro</span>
            <span class="player-char">${esc(monster.name)}</span>
          </div>
          <div class="player-actions">
            <button class="btn btn-ghost btn-sm" onclick="masterViewMonster('${jsEsc(monster.id)}')">Abrir ficha</button>
            <button class="btn-danger" onclick="removeMonster('${jsEsc(monster.id)}')">Excluir</button>
          </div>
        </div>
      `
    )
    .join("");
}

async function masterViewNpc(npcId) {
  const npc = readNpcs().find(candidate => candidate.id === npcId);
  if (!npc) return;
  await openSheet(createNpcTarget(npc), true);
}

async function masterViewMonster(monsterId) {
  const monster = readMonsters().find(candidate => candidate.id === monsterId);
  if (!monster) return;
  await openSheet(createMonsterTarget(monster), true);
}

async function removeNpc(npcId) {
  const npcs = readNpcs();
  const npc = npcs.find(candidate => candidate.id === npcId);
  if (!npc) return;

  const confirmed = await UI.confirm(`Apagar o NPC "${npc.name}"? A ficha será apagada.`, {
    title: "Excluir NPC",
    kicker: "// Confirmação",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (isBackendMode()) {
    await APP.deleteNpc(npcId);
    await AUTH.refreshDirectory();
    delete remoteSheetsCache[getNpcSheetKey(npcId)];
    persistRemoteSheetsCache();
  } else {
    writeNpcs(npcs.filter(candidate => candidate.id !== npcId));

    const sheets = readSheets();
    delete sheets[getNpcSheetKey(npcId)];
    writeSheets(sheets);
  }

  renderNpcs();
}

async function removeMonster(monsterId) {
  const monsters = readMonsters();
  const monster = monsters.find(candidate => candidate.id === monsterId);
  if (!monster) return;

  const confirmed = await UI.confirm(`Apagar o monstro "${monster.name}"? A ficha será apagada.`, {
    title: "Excluir monstro",
    kicker: "// Confirmação",
    confirmLabel: "Excluir",
    cancelLabel: "Cancelar",
    variant: "danger"
  });

  if (!confirmed) return;

  if (isBackendMode()) {
    await APP.deleteMonster(monsterId);
    await AUTH.refreshDirectory();
    delete remoteSheetsCache[getMonsterSheetKey(monsterId)];
    persistRemoteSheetsCache();
  } else {
    writeMonsters(monsters.filter(candidate => candidate.id !== monsterId));

    const sheets = readSheets();
    delete sheets[getMonsterSheetKey(monsterId)];
    writeSheets(sheets);
  }

  renderMonsters();
}

function syncDirectoryNameLegacy(charName) {
  const cleanName = String(charName || "").trim();
  if (!cleanName || !currentSheetTarget) return;

  if (currentSheetTarget.kind === "player") {
    const players = AUTH.getPlayers();
    const index = players.findIndex(player => player.username === currentSheetTarget.owner);
    if (index >= 0 && players[index].charname !== cleanName) {
      players[index] = { ...players[index], charname: cleanName };
      localStorage.setItem(AUTH.PLAYERS_KEY, JSON.stringify(players));
    }
    return;
  }

  const npcs = readNpcs();
  const index = npcs.findIndex(npc => npc.id === currentSheetTarget.npcId);
  if (index >= 0 && npcs[index].name !== cleanName) {
    npcs[index] = { ...npcs[index], name: cleanName };
    writeNpcs(npcs);
    currentSheetTarget.label = cleanName;
  }
}

function sanitizeAttrValue(attr, value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;

  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;

  const clamped = Math.max(1, Math.min(30, numeric));
  return String(clamped);
}

function enforceSheetRules() {
  ATTRIBUTES.forEach(attr => {
    const input = document.getElementById(`attr${attr}`);
    if (!input) return;

    input.value = sanitizeAttrValue(attr, input.value, "");
    calcMod(attr);
  });
}

function initAutoSave() {
  const sheetScreen = document.getElementById("sheetScreen");
  if (!sheetScreen) return;

  ["input", "change"].forEach(eventName => {
    sheetScreen.addEventListener(eventName, event => {
      if (!(event.target instanceof HTMLElement)) return;
      if (!event.target.closest("#sheetScreen")) return;
      if (event.target instanceof HTMLTextAreaElement && event.target.classList.contains("auto-grow")) {
        autoGrowTextarea(event.target);
      }
      saveSheetSilently();
    });
  });

  window.addEventListener("beforeunload", () => {
    saveSheetSilently();
  });
}

function getValue(id) {
  return document.getElementById(id)?.value || "";
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function modScale(value) {
  if (value <= 0) return 0;
  return Math.floor((value - 1) / 3);
}

function getIntegrityMaxFromSoul(value, fallback = "") {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;
  return String(Math.max(0, Math.floor(numeric / 3)));
}

function syncIntegrityFromSoul() {
  const integrityMaxInput = document.getElementById("integMax");
  const integrityCurrentInput = document.getElementById("integAtual");
  if (!integrityMaxInput) return;

  const nextIntegrityMax = getIntegrityMaxFromSoul(getValue("attrAlma"), "");
  integrityMaxInput.value = nextIntegrityMax;

  if (integrityCurrentInput && nextIntegrityMax !== "") {
    const currentIntegrity = Number.parseInt(integrityCurrentInput.value, 10);
    const maxIntegrity = Number.parseInt(nextIntegrityMax, 10);

    if (!Number.isNaN(currentIntegrity) && !Number.isNaN(maxIntegrity)) {
      integrityCurrentInput.value = String(Math.max(0, Math.min(currentIntegrity, maxIntegrity)));
    }
  }

  updateBar("integ");
}

function calcMod(attr) {
  const input = document.getElementById(`attr${attr}`);
  const target = document.getElementById(`mod${attr}`);
  if (!input || !target) return;

  input.value = sanitizeAttrValue(attr, input.value, "");
  const value = Number.parseInt(input.value, 10);

  if (Number.isNaN(value)) {
    target.textContent = "-";
    target.style.color = "";
    if (attr === "Alma") syncIntegrityFromSoul();
    return;
  }

  calcModFromVal(attr, value);
}

function calcModFromVal(attr, value) {
  const target = document.getElementById(`mod${attr}`);
  if (!target) return;

  if (Number.isNaN(value)) {
    target.textContent = "-";
    target.style.color = "";
    return;
  }

  const mod = modScale(value);
  target.textContent = `+${mod}`;
  target.style.color = mod >= 4 ? "var(--red-mid)" : mod >= 2 ? "var(--gold)" : "var(--text-secondary)";

  if (attr === "Alma") {
    syncIntegrityFromSoul();
  }
}

function updateBar(type) {
  const isVida = type === "vida";
  const current = parseFloat(getValue(isVida ? "vidaAtual" : "integAtual")) || 0;
  const max = parseFloat(getValue(isVida ? "vidaMax" : "integMax")) || 1;
  const bar = document.getElementById(isVida ? "barVida" : "barInteg");
  if (!bar) return;

  const percent = Math.min(100, Math.max(0, (current / max) * 100));
  bar.style.width = `${percent}%`;

  if (isVida) {
    const hue = Math.round((percent / 100) * 120);
    const lightness = 28 + (percent / 100) * 22;
    bar.style.background = `hsl(${hue} 78% ${lightness}%)`;
    bar.style.boxShadow = `0 0 16px hsla(${hue}, 90%, ${Math.max(lightness, 35)}%, 0.22)`;
  } else {
    const lightness = 14 + (percent / 100) * 50;
    const saturation = 48 + (percent / 100) * 30;
    bar.style.background = `hsl(204 ${saturation}% ${lightness}%)`;
    bar.style.boxShadow = `0 0 16px hsla(204, 90%, ${Math.max(lightness, 28)}%, 0.2)`;
  }
}

function handleAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = loadEvent => {
    const avatarImg = document.getElementById("avatarImg");
    const avatarPlaceholder = document.getElementById("avatarPlaceholder");
    if (!avatarImg || !avatarPlaceholder) return;

    avatarImg.src = loadEvent.target?.result || "";
    avatarImg.style.display = "block";
    avatarPlaceholder.style.display = "none";
    saveSheetSilently();
  };

  reader.readAsDataURL(file);
}

function getItemEditorElements() {
  return {
    root: document.getElementById("itemEditorRoot"),
    dialog: document.querySelector(".item-editor-dialog"),
    name: document.getElementById("itemEditorName"),
    qty: document.getElementById("itemEditorQty"),
    type: document.getElementById("itemEditorType"),
    typeBtn: document.getElementById("itemEditorTypeBtn"),
    typeLabel: document.getElementById("itemEditorTypeLabel"),
    damageWrap: document.getElementById("itemEditorDamageWrap"),
    damage: document.getElementById("itemEditorDamage"),
    damageLabel: document.getElementById("itemEditorDamageLabel"),
    rollBox: document.getElementById("itemEditorRollBox"),
    transfer: document.getElementById("itemEditorTransfer"),
    desc: document.getElementById("itemEditorDesc"),
    save: document.getElementById("itemEditorSaveBtn")
  };
}

function resetItemEditorState() {
  const { root, name, qty, type, damage, transfer, desc } = getItemEditorElements();

  itemEditorIndex = -1;
  itemEditorSnapshot = null;
  itemEditorIsNew = false;

  if (root) root.hidden = true;
  if (name) name.value = "";
  if (qty) qty.value = "1";
  if (type) type.value = "outro";
  if (damage) damage.value = "";
  if (transfer) {
    transfer.hidden = true;
    transfer.innerHTML = "";
  }
  if (desc) desc.value = "";
  updateItemEditorTypeUI("outro");
  updateItemEditorDamageUI("outro", "");
}

function updateItemEditorTypeUI(type = "outro") {
  const { typeLabel } = getItemEditorElements();
  if (typeLabel) {
    typeLabel.textContent = formatItemType(type);
  }
}

function updateItemEditorDamageUI(type = "outro", damage = "") {
  const { damageWrap, rollBox, damageLabel } = getItemEditorElements();
  const isWeapon = normalizeItemType(type) === "arma";
  const cleanDamage = normalizeDamageExpression(damage);

  if (damageWrap) damageWrap.hidden = !isWeapon;
  if (rollBox) rollBox.hidden = !isWeapon;
  if (damageLabel) {
    damageLabel.textContent = cleanDamage ? `Dano: ${cleanDamage}` : "Dano: definir";
  }
}

function syncItemFromEditor() {
  if (itemEditorIndex < 0 || !inv[itemEditorIndex]) return;

  const { name, qty, type, damage, desc } = getItemEditorElements();
  const nextItem = normalizeItem({
    name: name?.value || "",
    qty: qty?.value || "1",
    type: type?.value || "outro",
    damage: damage?.value || "",
    desc: desc?.value || ""
  });

  inv[itemEditorIndex] = nextItem;
  updateItemEditorTypeUI(nextItem.type);
  updateItemEditorDamageUI(nextItem.type, nextItem.damage);
}

async function openItemTypePicker() {
  if (itemEditorIndex < 0) return;

  const { type, typeBtn, damage } = getItemEditorElements();
  if (!type) return;

  const currentType = normalizeItemType(type.value);
  const selectedType = await UI.pickOption({
    title: "Escolher categoria",
    kicker: "// Item",
    message: "Defina o tipo do item para habilitar os campos específicos.",
    cancelLabel: "Fechar",
    options: [
      { value: "outro", label: "Outro", meta: "Item geral", selected: currentType === "outro" },
      { value: "arma", label: "Arma", meta: "Permite rolagem de dano", selected: currentType === "arma" },
      { value: "acessorio", label: "Acessório", meta: "Equipável ou passivo", selected: currentType === "acessorio" }
    ]
  });

  if (!selectedType) {
    typeBtn?.focus();
    return;
  }

  type.value = normalizeItemType(selectedType);
  if (type.value !== "arma" && damage) {
    damage.value = "";
  }

  syncItemFromEditor();
  typeBtn?.focus();
}

function initItemEditor() {
  const root = document.getElementById("itemEditorRoot");
  if (!root) return;
  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }

  const closeEditor = shouldSave => {
    if (shouldSave) {
      commitItemEditor();
      return;
    }
    cancelItemEditor();
  };

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.itemEditorClose) {
      closeEditor(false);
    }
  });

  document.getElementById("itemEditorCloseBtn")?.addEventListener("click", () => closeEditor(false));
  document.getElementById("itemEditorCancelBtn")?.addEventListener("click", () => closeEditor(false));
  document.getElementById("itemEditorSaveBtn")?.addEventListener("click", () => closeEditor(true));
  document.getElementById("itemEditorRollBtn")?.addEventListener("click", () => rollCurrentEditorDamage());
  document.getElementById("itemEditorTypeBtn")?.addEventListener("click", () => {
    openItemTypePicker();
  });

  ["itemEditorName", "itemEditorQty", "itemEditorDamage", "itemEditorDesc"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", () => {
      syncItemFromEditor();
      if (id === "itemEditorDesc") {
        const textarea = document.getElementById(id);
        if (textarea instanceof HTMLTextAreaElement) autoGrowTextarea(textarea);
      }
    });
  });

  document.addEventListener("keydown", event => {
    if (itemEditorIndex < 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditor(false);
    }
  });
}

function openItemEditor(index, { isNew = false } = {}) {
  const item = inv[index];
  const { root, dialog, name, qty, type, damage, desc } = getItemEditorElements();
  if (!item || !root || !dialog || !name || !qty || !type || !damage || !desc) return;

  itemEditorIndex = index;
  itemEditorIsNew = isNew;
  itemEditorSnapshot = normalizeItem(item);

  name.value = item.name;
  qty.value = item.qty;
  type.value = item.type;
  damage.value = item.damage;
  desc.value = item.desc;
  autoGrowTextarea(desc);
  updateItemEditorTypeUI(item.type);
  updateItemEditorDamageUI(item.type, item.damage);
  renderItemEditorTransfer(index);

  root.hidden = false;
  window.requestAnimationFrame(() => {
    dialog.focus();
    name.focus();
  });
}

function commitItemEditor() {
  if (itemEditorIndex < 0 || !inv[itemEditorIndex]) {
    resetItemEditorState();
    return;
  }

  syncItemFromEditor();
  const currentItem = normalizeItem(inv[itemEditorIndex]);

  if (itemEditorIsNew && !itemHasContent(currentItem)) {
    inv.splice(itemEditorIndex, 1);
  } else {
    inv[itemEditorIndex] = currentItem;
  }

  renderInv(inv);
  resetItemEditorState();
  saveSheetSilently();
}

function cancelItemEditor() {
  if (itemEditorIndex >= 0) {
    if (itemEditorIsNew) {
      inv.splice(itemEditorIndex, 1);
    } else if (itemEditorSnapshot) {
      inv[itemEditorIndex] = normalizeItem(itemEditorSnapshot);
    }
    renderInv(inv);
  }

  resetItemEditorState();
}

function rollCurrentEditorDamage() {
  if (itemEditorIndex < 0) return;
  syncItemFromEditor();
  rollItemDamage(itemEditorIndex, { preserveModal: true });
}

async function rollItemDamage(index, options = {}) {
  const item = normalizeItem(inv[index]);
  if (!item || item.type !== "arma") return;

  const result = rollDamageExpression(item.damage);
  if (!result) {
    itemRollStates[index] = {
      tone: "fail",
      text: "Defina um dano válido, como 1d10 ou 2d6+3."
    };
    renderInv(inv);
    await UI.alert("Defina um dano válido para a arma, por exemplo 1d10 ou 2d6+3.", {
      title: "Dano inválido",
      kicker: "// Inventário"
    });
    if (options.preserveModal) openItemEditor(index, { isNew: itemEditorIsNew });
    return;
  }

  const modifierText = result.modifier
    ? ` ${result.modifier > 0 ? "+" : "-"} ${Math.abs(result.modifier)}`
    : "";
  itemRollStates[index] = {
    tone: "success",
    text: `Ultimo dano: ${result.total} (${result.expression})`
  };
  renderInv(inv);

  await UI.alert(
    `Resultado: ${result.total}. Rolagens: ${result.rolls.join(" + ")}${modifierText}.`,
    {
      title: item.name || "Rolagem de arma",
      kicker: "// Dano"
    }
  );

  if (options.preserveModal) {
    openItemEditor(index, { isNew: itemEditorIsNew });
  }
}

function getDicePreset(key) {
  return DICE_PRESETS.find(preset => preset.key === key)
    || DICE_PRESETS.find(preset => preset.key === DEFAULT_DICE_PRESET)
    || DICE_PRESETS[0];
}

function getDiceTrayElements() {
  return {
    root: document.getElementById("diceTrayRoot"),
    dialog: document.querySelector(".dice-tray-dialog"),
    optionGrid: document.getElementById("diceOptionGrid"),
    modeGrid: document.getElementById("diceModeGrid"),
    qty: document.getElementById("diceTrayQty"),
    modifier: document.getElementById("diceTrayModifier"),
    expression: document.getElementById("diceTrayExpression"),
    preview: document.getElementById("diceExpressionPreview"),
    roll: document.getElementById("diceTrayRollBtn"),
    cancel: document.getElementById("diceTrayCancelBtn"),
    close: document.getElementById("diceTrayCloseBtn"),
    badge: document.getElementById("diceTrayBadge"),
    resultCard: document.getElementById("diceResultCard"),
    resultState: document.getElementById("diceResultState"),
    resultTotal: document.getElementById("diceResultTotal"),
    resultDetail: document.getElementById("diceResultDetail")
  };
}

function clampDiceTrayQuantity(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 1;
  return Math.min(20, Math.max(1, numeric));
}

function clampDiceTrayModifier(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 0;
  return Math.min(1000, Math.max(-1000, numeric));
}

function normalizeDiceTrayMode(value) {
  return Object.prototype.hasOwnProperty.call(DICE_TRAY_MODES, value) ? value : "normal";
}

function buildDiceTrayExpression() {
  const preset = getDicePreset(diceTrayState.preset);
  const modifier = clampDiceTrayModifier(diceTrayState.modifier);
  const modifierSuffix = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
  return `${clampDiceTrayQuantity(diceTrayState.qty)}d${preset.sides}${modifierSuffix}`;
}

function getActiveDiceTrayExpression() {
  const customExpression = normalizeDamageExpression(diceTrayState.customExpression);
  return customExpression || buildDiceTrayExpression();
}

function renderDiceOptions() {
  const { optionGrid } = getDiceTrayElements();
  if (!optionGrid) return;

  optionGrid.innerHTML = DICE_PRESETS.map(preset => `
    <button
      type="button"
      class="dice-option-btn ${diceTrayState.preset === preset.key ? "is-active" : ""}"
      data-dice-option="${preset.key}"
      aria-pressed="${diceTrayState.preset === preset.key ? "true" : "false"}"
      title="${preset.label}"
    >
      <span class="dice-option-value">${preset.sides}</span>
    </button>
  `).join("");
}

function renderDiceModeButtons() {
  const { modeGrid } = getDiceTrayElements();
  if (!modeGrid) return;

  modeGrid.querySelectorAll("[data-dice-mode]").forEach(button => {
    if (!(button instanceof HTMLButtonElement)) return;
    const isActive = button.dataset.diceMode === diceTrayState.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function formatDiceTrayRollSummary(result) {
  const modifierText = result.modifier
    ? ` | Modificador: ${result.modifier > 0 ? "+" : ""}${result.modifier}`
    : "";
  return `${result.total} (${result.rolls.join(" + ")}${modifierText})`;
}

function openDiceTray() {
  const { root, dialog } = getDiceTrayElements();
  if (!root || !dialog) return;

  diceTrayState.open = true;
  root.hidden = false;
  window.requestAnimationFrame(() => {
    dialog.focus();
    renderDiceTray();
  });
}

function closeDiceTray() {
  const { root } = getDiceTrayElements();
  if (!root) return;

  diceTrayState.open = false;
  root.hidden = true;
}

function initDiceTray() {
  const { root, dialog, qty, modifier, expression, roll, cancel, close, optionGrid, modeGrid } = getDiceTrayElements();
  const openButton = document.getElementById("openDiceTrayBtn");
  if (!root || !dialog || !qty || !modifier || !expression || !roll || !cancel || !close || !optionGrid || !modeGrid || !openButton) return;

  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }

  const trayKicker = root.querySelector(".dice-tray-kicker");
  const trayTitle = document.getElementById("diceTrayTitle");
  const traySubtitle = root.querySelector(".dice-tray-subtitle");
  const expressionLabel = root.querySelector('label[for="diceTrayExpression"]');
  const previewLabel = root.querySelector(".dice-tray-side .item-meta");
  const previewNote = root.querySelector(".dice-tray-preview-note");

  if (trayKicker) trayKicker.textContent = "// Rolagem";
  if (trayTitle) trayTitle.textContent = "Lançar dados";
  if (traySubtitle) {
    traySubtitle.textContent = "Escolha o dado, ajuste a rolagem e veja o resultado em um painel limpo e direto.";
  }
  if (expressionLabel) expressionLabel.textContent = "Expressão livre";
  if (previewLabel) previewLabel.textContent = "Resumo";
  if (previewNote) {
    previewNote.textContent = "A expressão livre substitui a quantidade, o dado e o modificador.";
  }

  openButton.addEventListener("click", openDiceTray);
  close.addEventListener("click", closeDiceTray);
  cancel.addEventListener("click", closeDiceTray);
  roll.addEventListener("click", () => {
    rollDiceTray();
  });

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.diceClose) {
      closeDiceTray();
      return;
    }

    const option = target.closest("[data-dice-option]");
    if (option instanceof HTMLElement) {
      diceTrayState.preset = option.dataset.diceOption || DEFAULT_DICE_PRESET;
      diceTrayState.lastResult = null;
      renderDiceTray();
      return;
    }

    const modeButton = target.closest("[data-dice-mode]");
    if (modeButton instanceof HTMLElement) {
      diceTrayState.mode = normalizeDiceTrayMode(modeButton.dataset.diceMode || "normal");
      diceTrayState.lastResult = null;
      renderDiceTray();
    }
  });

  qty.addEventListener("input", () => {
    diceTrayState.qty = clampDiceTrayQuantity(qty.value);
    diceTrayState.lastResult = null;
    renderDiceTray();
  });

  modifier.addEventListener("input", () => {
    diceTrayState.modifier = clampDiceTrayModifier(modifier.value);
    diceTrayState.lastResult = null;
    renderDiceTray();
  });

  expression.addEventListener("input", () => {
    diceTrayState.customExpression = normalizeDamageExpression(expression.value);
    expression.value = diceTrayState.customExpression;
    diceTrayState.lastResult = null;
    renderDiceTray();
  });

  document.addEventListener("keydown", event => {
    if (!diceTrayState.open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeDiceTray();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      rollDiceTray();
    }
  });

  renderDiceTray();
}

function buildDiceTrayResultDetail(result) {
  if (!result) return "";

  if (result.mode === "advantage" || result.mode === "disadvantage") {
    const modeLabel = DICE_TRAY_MODES[result.mode];
    return `${modeLabel} | 1ª: ${result.first.total} | 2ª: ${result.second.total} | Escolhido: ${result.chosen.total}`;
  }

  return `Rolagens: ${result.chosen.rolls.join(" + ")}${
    result.chosen.modifier
      ? ` | Modificador: ${result.chosen.modifier > 0 ? "+" : ""}${result.chosen.modifier}`
      : ""
  }`;
}

function applyDiceTraySpecialState(elements, special) {
  const { resultCard, resultState } = elements;
  const classes = ["is-critical", "is-fumble"];

  if (resultCard) resultCard.classList.remove(...classes);
  if (resultState) {
    resultState.hidden = true;
    resultState.textContent = "";
    resultState.className = "dice-result-state";
  }

  if (!special) return;

  if (special === "critical") {
    if (resultCard) resultCard.classList.add("is-critical");
    return;
  }

  if (special === "fumble") {
    if (resultCard) resultCard.classList.add("is-fumble");
  }
}

function rollDiceExpressionWithMode(expression, mode) {
  const normalizedMode = normalizeDiceTrayMode(mode);
  const first = rollDamageExpression(expression);
  if (!first) return null;

  const getSpecialState = chosen => {
    const min = chosen.diceCount + chosen.modifier;
    const max = (chosen.diceCount * chosen.diceSides) + chosen.modifier;
    if (chosen.total === max) return "critical";
    if (chosen.total === min) return "fumble";
    return "";
  };

  if (normalizedMode === "normal") {
    return {
      mode: normalizedMode,
      expression: first.expression,
      total: first.total,
      chosen: first,
      first,
      second: null,
      special: getSpecialState(first)
    };
  }

  const second = rollDamageExpression(expression);
  if (!second) return null;

  const chosen = normalizedMode === "advantage"
    ? (second.total > first.total ? second : first)
    : (second.total < first.total ? second : first);

  return {
    mode: normalizedMode,
    expression: first.expression,
    total: chosen.total,
    chosen,
    first,
    second,
    special: getSpecialState(chosen)
  };
}

function renderDiceTray() {
  const elements = getDiceTrayElements();
  const preset = getDicePreset(diceTrayState.preset);
  const expression = getActiveDiceTrayExpression();
  const customExpression = normalizeDamageExpression(diceTrayState.customExpression);

  if (elements.qty) elements.qty.value = String(clampDiceTrayQuantity(diceTrayState.qty));
  if (elements.modifier) elements.modifier.value = String(clampDiceTrayModifier(diceTrayState.modifier));
  if (elements.expression) elements.expression.value = customExpression;
  if (elements.preview) elements.preview.textContent = expression;
  if (elements.badge) elements.badge.textContent = preset.label;
  if (elements.roll) {
    elements.roll.disabled = diceTrayState.rolling;
    elements.roll.textContent = diceTrayState.rolling ? "Rolando..." : "Rolar agora";
  }

  applyDiceTraySpecialState(elements, "");

  if (
    diceTrayState.lastResult
    && diceTrayState.lastResult.expression === expression
    && diceTrayState.lastResult.mode === diceTrayState.mode
  ) {
    if (elements.resultTotal) elements.resultTotal.textContent = String(diceTrayState.lastResult.total);
    if (elements.resultDetail) elements.resultDetail.textContent = buildDiceTrayResultDetail(diceTrayState.lastResult);
    applyDiceTraySpecialState(elements, diceTrayState.lastResult.special);
  } else {
    if (elements.resultTotal) elements.resultTotal.textContent = "Pronto";
    if (elements.resultDetail) {
      const modeLabel = DICE_TRAY_MODES[diceTrayState.mode].toLowerCase();
      const isCustom = Boolean(customExpression);
      elements.resultDetail.textContent = isCustom
        ? `Expressão pronta: ${expression}. Modo ${modeLabel}.`
        : `Selecione os dados e role em modo ${modeLabel}.`;
    }
  }

  renderDiceOptions();
  renderDiceModeButtons();
}

async function rollDiceTray() {
  if (diceTrayState.rolling) return;

  const elements = getDiceTrayElements();
  diceTrayState.qty = clampDiceTrayQuantity(elements.qty?.value ?? diceTrayState.qty);
  diceTrayState.modifier = clampDiceTrayModifier(elements.modifier?.value ?? diceTrayState.modifier);
  diceTrayState.customExpression = normalizeDamageExpression(elements.expression?.value ?? diceTrayState.customExpression);
  diceTrayState.mode = normalizeDiceTrayMode(diceTrayState.mode);

  const expression = getActiveDiceTrayExpression();
  const result = rollDiceExpressionWithMode(expression, diceTrayState.mode);

  if (!result) {
    await UI.alert("Não foi possível interpretar essa rolagem.", {
      title: "Rolagem inválida",
      kicker: "// Dados"
    });
    return;
  }

  diceTrayState.rolling = true;
  renderDiceTray();
  diceTrayState.lastResult = result;
  diceTrayState.rolling = false;
  renderDiceTray();
}
function renderHabs(list) {
  habs = list.map(normalizeHab);
  const element = document.getElementById("habList");
  if (!element) return;

  if (!habs.length) {
    element.innerHTML = '<p class="empty-msg">Nenhuma habilidade registrada.</p>';
    return;
  }

  element.innerHTML = habs
    .map(
      (hab, index) => `
        <div class="hab-row">
          <input class="hab-name" type="text" placeholder="Nome..." value="${esc(hab.name)}" oninput="updateHab(${index}, 'name', this.value)"/>
          <textarea class="hab-desc auto-grow" rows="3" placeholder="Efeito, custo, descrição..." oninput="updateHab(${index}, 'desc', this.value)">${esc(hab.desc)}</textarea>
          <button class="btn-remove" onclick="removeHab(${index})">x</button>
        </div>
      `
    )
    .join("");

  syncAutoGrowTextareas(element);
}

function updateHab(index, field, value) {
  if (!habs[index]) return;
  habs[index][field] = value;
}

function addHabilidade() {
  habs.push({ name: "", desc: "" });
  renderHabs(habs);
  document.querySelectorAll(".hab-name")[habs.length - 1]?.focus();
  saveSheetSilently();
}

function removeHab(index) {
  habs.splice(index, 1);
  renderHabs(habs);
  saveSheetSilently();
}

function collectHabs() {
  return Array.from(document.querySelectorAll(".hab-row")).map(row => ({
    name: row.querySelector(".hab-name")?.value || "",
    desc: row.querySelector(".hab-desc")?.value || ""
  }));
}

function renderOwnedMemories(list) {
  ownedMemories = list.map(normalizeOwnedMemory);
  const element = document.getElementById("ownedMemoryList");
  if (!element) return;

  const canTransfer = currentSheetTarget?.kind === "player";
  const transferTargets = canTransfer ? getOwnedMemoryTransferTargets() : [];

  if (!ownedMemories.length) {
    element.className = "";
    element.innerHTML = '<p class="empty-msg">Nenhuma memória possuída.</p>';
    return;
  }

  element.className = "owned-memory-list";
  element.innerHTML = ownedMemories
    .map(
      (memory, index) => `
        <article
          class="owned-memory-card"
          data-name="${esc(memory.name)}"
          data-desc="${esc(memory.desc)}"
          data-source="${esc(memory.source)}"
        >
          <div class="owned-memory-body">
            <span class="item-meta">Memória</span>
            <h3 class="owned-memory-title">${esc(memory.name || "Memória sem nome")}</h3>
            <p class="owned-memory-desc">${esc(memory.desc || "Sem descrição.")}</p>
            ${
              memory.source
                ? `<span class="owned-memory-source">Origem: ${esc(memory.source)}</span>`
                : ""
            }
            ${
              canTransfer
                ? renderOwnedMemoryTransferBlock(index, transferTargets)
                : ""
            }
          </div>
          <button class="btn-remove" onclick="removeOwnedMemory(${index})">x</button>
        </article>
      `
    )
    .join("");
}

function removeOwnedMemory(index) {
  ownedMemoryTransferStates = {};
  ownedMemories.splice(index, 1);
  renderOwnedMemories(ownedMemories);
  saveSheetSilently();
}

function collectOwnedMemories() {
  return Array.from(document.querySelectorAll(".owned-memory-card")).map(card => ({
    name: card.dataset.name || "",
    desc: card.dataset.desc || "",
    source: card.dataset.source || ""
  }));
}

function getOwnedMemoryTransferTargets() {
  if (currentSheetTarget?.kind !== "player") return [];

  return AUTH.getPlayers()
    .filter(player => player.username !== currentSheetTarget.owner)
    .map(player => ({
      value: player.username,
      label: player.charname || player.username,
      meta: player.username
    }));
}

function formatMemoryTargetLabel(value, targets, fallback) {
  const target = targets.find(candidate => candidate.value === value);
  return target ? `${target.label} (${target.meta})` : fallback;
}

function renderOwnedMemoryTransferBlock(index, targets) {
  if (!targets.length) {
    return `
      <div class="owned-memory-transfer">
        <span class="item-meta">Transferência</span>
        <div class="memory-award-status">Não há outro jogador disponível para receber esta memória.</div>
      </div>
    `;
  }

  const state = ownedMemoryTransferStates[index] || {};
  const selectedTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;
  const statusClass =
    state.tone === "success"
      ? "memory-award-status is-success"
      : state.tone === "fail"
        ? "memory-award-status is-fail"
        : "memory-award-status";

  ownedMemoryTransferStates[index] = {
    ...state,
    target: selectedTarget
  };

  return `
    <div class="owned-memory-transfer">
      <span class="item-meta">Transferir para outro jogador</span>
      <div class="owned-memory-transfer-row">
        <button class="btn-inline memory-picker-btn owned-memory-picker-btn" onclick="pickOwnedMemoryTransferTarget(${index})">
          <span class="memory-picker-label">${esc(formatMemoryTargetLabel(selectedTarget, targets, "Escolher jogador"))}</span>
          <span class="memory-picker-hint">Alterar</span>
        </button>
        <button class="btn-inline owned-memory-transfer-send" onclick="transferOwnedMemory(${index})">Enviar</button>
      </div>
          <div class="${statusClass}">${esc(state.text || "Selecione o jogador de destino para transferir esta memória.")}</div>
    </div>
  `;
}

async function pickOwnedMemoryTransferTarget(index) {
  const targets = getOwnedMemoryTransferTargets();
  if (!targets.length) return;

  const state = ownedMemoryTransferStates[index] || {};
  const currentTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  const selected = await UI.pickOption({
    title: "Transferir memória",
    kicker: "// Jogadores",
    message: "Escolha qual jogador vai receber esta memória.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: `Jogador | ${target.meta}`,
      selected: target.value === currentTarget
    }))
  });

  if (!selected) return;

  ownedMemoryTransferStates[index] = {
    ...state,
    target: selected,
    tone: "",
    text: "Destino definido. Clique em Enviar para concluir a transferência."
  };

  renderOwnedMemories(ownedMemories);
}

async function transferOwnedMemory(index) {
  if (currentSheetTarget?.kind !== "player") return;

  const memory = ownedMemories[index];
  const state = ownedMemoryTransferStates[index] || {};
  const targetUsername = state.target || getOwnedMemoryTransferTargets()[0]?.value;
  if (!memory || !targetUsername) return;

  const target = createPlayerTarget(targetUsername);
  const confirmed = await UI.confirm(
      `Transferir "${memory.name || "Memória sem nome"}" para ${target.label}?`,
    {
        title: "Transferir memória",
        kicker: "// Memórias possuídas",
      confirmLabel: "Transferir",
      cancelLabel: "Cancelar"
    }
  );

  if (!confirmed) return;

  if (isBackendMode()) {
    try {
      await APP.transferOwnedMemory({
        sourceKey: currentSheetTarget.key,
        targetKey: target.key,
        memoryIndex: index
      });
      await AUTH.refreshDirectory();
    } catch (error) {
      ownedMemoryTransferStates[index] = {
        ...state,
        tone: "fail",
      text: error?.message || "Falha ao transferir a memória."
      };
      renderOwnedMemories(ownedMemories);
      return;
    }
  } else {
    const sheets = readSheets();
    const targetSheet = normalizeSheetData(sheets[target.key] || {}, "player");
    const transferredMemory = normalizeOwnedMemory({
      name: memory.name,
      desc: memory.desc,
      source: memory.source || currentSheetTarget.label || ""
    });

    targetSheet.ownedMemories = [...targetSheet.ownedMemories, transferredMemory];
    sheets[target.key] = targetSheet;
    writeSheets(sheets);
  }

  ownedMemoryTransferStates = {};
  ownedMemories.splice(index, 1);
  renderOwnedMemories(ownedMemories);
  saveSheetSilently();
}

function getMemoryAwardTargets() {
  const players = AUTH.getPlayers().map(player => ({
    kind: "player",
    value: `player:${player.username}`,
    label: player.charname || player.username,
    meta: `Jogador | ${player.username}`
  }));

  const npcs = readNpcs().map(npc => ({
    kind: "npc",
    value: `npc:${npc.id}`,
    label: npc.name,
    meta: "NPC"
  }));

  return [...players, ...npcs];
}

function parseMemoryAwardTarget(value) {
  if (!value) return null;

  const [kind, rawId] = String(value).split(":");
  if (!kind || !rawId) return null;

  if (kind === "player") {
    return createPlayerTarget(rawId);
  }

  if (kind === "npc") {
    const npc = readNpcs().find(candidate => candidate.id === rawId);
    return npc ? createNpcTarget(npc) : null;
  }

  return null;
}

function buildOwnedMemoryEntry(drop) {
  return normalizeOwnedMemory({
    name: String(drop?.name || "").trim() || "Memória sem nome",
    desc: String(drop?.desc || "").trim(),
    source: currentSheetTarget?.label || "Origem desconhecida"
  });
}

function applyMemoryRollState(index) {
  const fill = document.getElementById(`memoryRollFill${index}`);
  const result = document.getElementById(`memoryRollResult${index}`);
  const threshold = document.getElementById(`memoryThreshold${index}`);
  const state = memoryRollStates[index];

  if (threshold) {
    threshold.style.left = `${formatChancePercent(memoryDrops[index]?.chance)}%`;
  }

  if (fill) {
    fill.classList.remove("success", "fail");
    fill.style.transition = "none";
    fill.style.width = state?.rolled !== undefined ? `${state.rolled}%` : "0%";
    if (state?.status) fill.classList.add(state.status);
  }

  if (result) {
    result.className = "memory-roll-result";
    if (state?.status) result.classList.add(`is-${state.status}`);
    if (state?.isRolling) result.classList.add("is-rolling");
    result.textContent = state?.resultText || "Defina a chance e role para descobrir se a memória caiu.";
  }

  renderMemoryAwardControls(index);
}

function renderMemoryAwardControls(index) {
  const award = document.getElementById(`memoryAward${index}`);
  const state = memoryRollStates[index];
  if (!award) return;

  const showAward = Boolean(state?.success);
  if (!showAward) {
    award.hidden = true;
    award.innerHTML = "";
    return;
  }

  const targets = getMemoryAwardTargets();
  const statusClass =
    state?.awardTone === "success"
      ? "memory-award-status is-success"
      : state?.awardTone === "fail"
        ? "memory-award-status is-fail"
        : "memory-award-status";

  award.hidden = false;

  if (state.awarded) {
    award.innerHTML = `
      <span class="item-meta">Memória enviada</span>
      <div class="${statusClass}">${esc(state.awardText || "Memória enviada para a ficha escolhida.")}</div>
    `;
    return;
  }

  if (!targets.length) {
    award.innerHTML = `
      <span class="item-meta">Enviar memória</span>
      <div class="memory-award-status is-fail">Não há jogadores ou NPCs disponíveis para receber esta memória.</div>
    `;
    return;
  }

  const selectedTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  memoryRollStates[index] = {
    ...state,
    target: selectedTarget
  };

  award.innerHTML = `
    <span class="item-meta">Enviar memória para</span>
    <button class="btn-inline memory-picker-btn" onclick="pickMemoryAwardTarget(${index})">
      <span class="memory-picker-label">${esc(formatMemoryTargetLabel(selectedTarget, targets, "Escolher destino"))}</span>
      <span class="memory-picker-hint">Alterar</span>
    </button>
    <button class="btn-inline memory-award-btn" onclick="awardMemoryDrop(${index})">Enviar para ficha</button>
    <div class="${statusClass}">${esc(state.awardText || "A memória caiu. Escolha quem vai recebê-la.")}</div>
  `;
}

async function pickMemoryAwardTarget(index) {
  const state = memoryRollStates[index];
  if (!state) return;

  const targets = getMemoryAwardTargets();
  if (!targets.length) return;

  const currentTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  const selected = await UI.pickOption({
    title: "Enviar memória",
    kicker: "// Destino",
    message: "Escolha quem vai receber esta memória.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: target.meta,
      selected: target.value === currentTarget
    }))
  });

  if (!selected) return;

  memoryRollStates[index] = {
    ...state,
    target: selected,
    awardTone: "",
    awardText: "Destino definido. Clique em Enviar para ficha."
  };

  renderMemoryAwardControls(index);
}

function renderMemoryDrops(list) {
  memoryDrops = list.map(normalizeMemoryDrop);
  const element = document.getElementById("memoryList");
  if (!element) return;

  if (!memoryDrops.length) {
    element.className = "";
    element.innerHTML = '<p class="empty-msg">Nenhuma memória definida.</p>';
    return;
  }

  element.className = "memory-drop-list";
  element.innerHTML = memoryDrops
    .map(
      (drop, index) => `
        <div class="memory-row">
          <div class="memory-main">
            <div class="memory-field">
              <span class="item-meta">Memória</span>
              <input class="memory-name" type="text" placeholder="Nome da memória..." value="${esc(drop.name)}" oninput="updateMemoryDrop(${index}, 'name', this.value)" />
            </div>

            <div class="memory-field">
              <span class="item-meta">Descrição e efeito</span>
              <textarea class="memory-desc auto-grow" rows="3" placeholder="Descrição do drop, raridade, condição ou efeito..." oninput="updateMemoryDrop(${index}, 'desc', this.value)">${esc(drop.desc)}</textarea>
            </div>
          </div>

          <div class="memory-side">
            <div class="memory-meta">
              <span class="item-meta">Chance de drop (%)</span>
              <input
                class="memory-chance"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value="${esc(drop.chance)}"
                oninput="updateMemoryDrop(${index}, 'chance', this.value)"
              />
              <button class="btn-inline memory-roll-btn" onclick="rollMemoryDrop(${index})">Testar drop</button>
              <div class="memory-roll-track">
                <div class="memory-roll-threshold" id="memoryThreshold${index}" style="left:${formatChancePercent(drop.chance)}%"></div>
                <div class="memory-roll-fill" id="memoryRollFill${index}"></div>
              </div>
          <div class="memory-roll-result" id="memoryRollResult${index}">Defina a chance e role para descobrir se a memória caiu.</div>
            </div>

            <div class="memory-award" id="memoryAward${index}" hidden></div>
          </div>

          <button class="btn-remove" onclick="removeMemoryDrop(${index})">x</button>
        </div>
      `
    )
    .join("");

  syncAutoGrowTextareas(element);
  memoryDrops.forEach((_drop, index) => applyMemoryRollState(index));
}

function updateMemoryDrop(index, field, value) {
  if (!memoryDrops[index]) return;
  memoryDrops[index][field] = field === "chance" ? sanitizeChance(value, "0") : value;

  if (field === "chance") {
    delete memoryRollStates[index];
    applyMemoryRollState(index);
  }
}

function addMemoryDrop() {
  memoryRollStates = {};
  memoryDrops.push({ name: "", desc: "", chance: "0" });
  renderMemoryDrops(memoryDrops);
  document.querySelectorAll(".memory-name")[memoryDrops.length - 1]?.focus();
  saveSheetSilently();
}

function removeMemoryDrop(index) {
  memoryRollStates = {};
  memoryDrops.splice(index, 1);
  renderMemoryDrops(memoryDrops);
  saveSheetSilently();
}

function collectMemoryDrops() {
  return Array.from(document.querySelectorAll(".memory-row")).map(row => ({
    name: row.querySelector(".memory-name")?.value || "",
    desc: row.querySelector(".memory-desc")?.value || "",
    chance: sanitizeChance(row.querySelector(".memory-chance")?.value || "0", "0")
  }));
}

function formatChancePercent(value) {
  const chance = Number.parseFloat(sanitizeChance(value, "0")) || 0;
  return Math.max(0, Math.min(100, chance));
}

async function rollMemoryDrop(index) {
  const drop = memoryDrops[index];
  const fill = document.getElementById(`memoryRollFill${index}`);
  const result = document.getElementById(`memoryRollResult${index}`);
  if (!drop || !fill || !result) return;

  fill.classList.remove("success", "fail");
  fill.style.transition = "none";
  fill.style.width = "0%";
  delete memoryRollStates[index];
  renderMemoryAwardControls(index);
  result.className = "memory-roll-result is-rolling";
  result.textContent = "Rolando o destino da memória...";

  let chance = formatChancePercent(drop.chance);
  let rolled = Number((Math.random() * 100).toFixed(1));
  let success = chance > 0 && rolled <= chance;

  if (isBackendMode()) {
    try {
      const remoteResult = await APP.rollMonsterMemory({
        monsterKey: currentSheetTarget?.key,
        dropIndex: index
      });
      chance = Number(remoteResult.chance || chance);
      rolled = Number(remoteResult.rolled || rolled);
      success = Boolean(remoteResult.success);
    } catch (error) {
      result.className = "memory-roll-result is-fail";
    result.textContent = error?.message || "Falha ao rolar o drop da memória.";
      return;
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.transition = "width 1.2s cubic-bezier(0.2, 0.9, 0.1, 1)";
      fill.style.width = `${rolled}%`;
    });
  });

  window.setTimeout(() => {
    memoryRollStates[index] = {
      rolled,
      status: success ? "success" : "fail",
      success,
      awarded: false,
      target: getMemoryAwardTargets()[0]?.value || "",
      awardTone: "",
      awardText: "",
      resultText: success
        ? `Memória obtida. Rolagem ${rolled}% dentro da chance de ${chance}%.`
        : `Sem memória. Rolagem ${rolled}% acima da chance de ${chance}%.`
    };
    applyMemoryRollState(index);
  }, 1250);
}

async function awardMemoryDrop(index) {
  const drop = memoryDrops[index];
  const state = memoryRollStates[index];
  if (!drop || !state?.success || state.awarded) return;
  const awardedMemoryName = String(drop?.name || "").trim() || "Memória sem nome";

  const target = parseMemoryAwardTarget(state.target);
  if (!target || target.kind === "monster") {
    memoryRollStates[index] = {
      ...state,
      awardTone: "fail",
      awardText: "Escolha um jogador ou NPC válido para receber a memória."
    };
    renderMemoryAwardControls(index);
    return;
  }

  if (isBackendMode()) {
    try {
      await APP.awardMonsterMemory({
        monsterKey: currentSheetTarget?.key,
        targetKey: target.key,
        dropIndex: index
      });
    } catch (error) {
      memoryRollStates[index] = {
        ...state,
        awardTone: "fail",
      awardText: error?.message || "Falha ao enviar a memória."
      };
      renderMemoryAwardControls(index);
      return;
    }
  } else {
    const sheets = readSheets();
    const targetSheet = normalizeSheetData(sheets[target.key] || {}, target.kind);
    const memory = buildOwnedMemoryEntry(drop);

    targetSheet.ownedMemories = [...targetSheet.ownedMemories, memory];
    sheets[target.key] = targetSheet;
    writeSheets(sheets);
  }

  memoryRollStates[index] = {
    ...state,
    awarded: true,
    awardTone: "success",
    awardText: `${awardedMemoryName} enviada para ${target.label}.`
  };

  renderMemoryAwardControls(index);
}

function getPlayerInventoryState(username) {
  if (isBackendMode()) {
    const player = AUTH.getDirectoryCache().players.find(candidate => candidate.username === username);
    const used = Number(player?.usedSlots || 0);
    const capacity = Number(player?.inventorySlots || DEFAULT_INVENTORY_SLOTS);
    return {
      used,
      capacity,
      available: Math.max(0, capacity - used)
    };
  }

  const sheets = readSheets();
  const playerSheet = normalizeSheetData(sheets[username] || {}, "player");
  const capacity = Math.max(
    normalizeInventorySlots("player", playerSheet.inventorySlots),
    playerSheet.inv.length
  );

  return {
    used: playerSheet.inv.length,
    capacity,
    available: Math.max(0, capacity - playerSheet.inv.length)
  };
}

function getItemTransferTargets() {
  if (currentSheetTarget?.kind !== "player") return [];

  return AUTH.getPlayers()
    .filter(player => player.username !== currentSheetTarget.owner)
    .map(player => {
      const inventoryState = getPlayerInventoryState(player.username);
      return {
        value: player.username,
        label: player.charname || player.username,
        meta: `${inventoryState.used}/${inventoryState.capacity} slots`,
        isFull: inventoryState.available <= 0
      };
    });
}

function formatItemTransferLabel(value, targets, fallback) {
  const target = targets.find(candidate => candidate.value === value);
  return target ? `${target.label} (${target.meta})` : fallback;
}

function renderItemTransferBlock(index, targets) {
  const availableTargets = targets.filter(target => !target.isFull);

  if (!availableTargets.length) {
    return `
      <div class="item-transfer">
        <span class="item-meta">Troca de item</span>
        <div class="memory-award-status">Nenhum jogador disponível com slot livre para receber este item.</div>
      </div>
    `;
  }

  const state = itemTransferStates[index] || {};
  const selectedTarget = availableTargets.some(target => target.value === state.target)
    ? state.target
    : availableTargets[0].value;
  const statusClass =
    state.tone === "success"
      ? "memory-award-status is-success"
      : state.tone === "fail"
        ? "memory-award-status is-fail"
        : "memory-award-status";

  itemTransferStates[index] = {
    ...state,
    target: selectedTarget
  };

  return `
    <div class="item-transfer">
      <span class="item-meta">Enviar para outro jogador</span>
      <div class="item-transfer-row">
        <button class="btn-inline memory-picker-btn item-transfer-picker" onclick="pickItemTransferTarget(${index})">
          <span class="memory-picker-label">${esc(formatItemTransferLabel(selectedTarget, availableTargets, "Escolher jogador"))}</span>
          <span class="memory-picker-hint">Alterar</span>
        </button>
        <button class="btn-inline item-transfer-send" onclick="transferItem(${index})">Enviar</button>
      </div>
      <div class="${statusClass}">${esc(state.text || "O item só pode ser enviado para jogadores com slot livre no inventário.")}</div>
    </div>
  `;
}

function renderItemEditorTransfer(index) {
  const { transfer } = getItemEditorElements();
  if (!transfer) return;

  if (currentSheetTarget?.kind !== "player" || !inv[index]) {
    transfer.hidden = true;
    transfer.innerHTML = "";
    return;
  }

  transfer.hidden = false;
  transfer.innerHTML = renderItemTransferBlock(index, getItemTransferTargets());
}

async function pickItemTransferTarget(index) {
  const targets = getItemTransferTargets().filter(target => !target.isFull);
  if (!targets.length) return;

  const state = itemTransferStates[index] || {};
  const currentTarget = targets.some(target => target.value === state.target)
    ? state.target
    : targets[0].value;

  const selected = await UI.pickOption({
    title: "Transferir item",
    kicker: "// Inventário",
    message: "Escolha qual jogador vai receber este item.",
    options: targets.map(target => ({
      value: target.value,
      label: target.label,
      meta: `Jogador | ${target.meta}`,
      selected: target.value === currentTarget
    }))
  });

  if (!selected) return;

  itemTransferStates[index] = {
    ...state,
    target: selected,
    tone: "",
    text: "Destino definido. Clique em Enviar para concluir a transferência."
  };

  if (itemEditorIndex === index) {
    renderItemEditorTransfer(index);
    return;
  }

  renderInv(inv);
}

async function transferItem(index) {
  if (currentSheetTarget?.kind !== "player") return;

  const item = inv[index];
  if (!item) return;

  const availableTargets = getItemTransferTargets().filter(target => !target.isFull);
  const state = itemTransferStates[index] || {};
  const targetUsername = state.target || availableTargets[0]?.value;
  const target = availableTargets.find(candidate => candidate.value === targetUsername);

  if (!target) {
    itemTransferStates[index] = {
      ...state,
      tone: "fail",
      text: "Nenhum jogador com slot livre está disponível para receber este item."
    };
    if (itemEditorIndex === index) {
      renderItemEditorTransfer(index);
    } else {
      renderInv(inv);
    }
    return;
  }

  const targetInventoryState = getPlayerInventoryState(targetUsername);
  if (targetInventoryState.available <= 0) {
    itemTransferStates[index] = {
      ...state,
      tone: "fail",
      text: `${target.label} está com a mochila cheia.`
    };
    if (itemEditorIndex === index) {
      renderItemEditorTransfer(index);
    } else {
      renderInv(inv);
    }
    return;
  }

  const confirmed = await UI.confirm(
    `Transferir "${item.name || "Item sem nome"}" para ${target.label}?`,
    {
      title: "Transferir item",
      kicker: "// Inventário",
      confirmLabel: "Transferir",
      cancelLabel: "Cancelar"
    }
  );

  if (!confirmed) return;

  if (isBackendMode()) {
    try {
      await APP.transferItem({
        sourceKey: currentSheetTarget.key,
        targetKey: targetUsername,
        itemIndex: index
      });
      await AUTH.refreshDirectory();
    } catch (error) {
      itemTransferStates[index] = {
        ...state,
        tone: "fail",
        text: error?.message || "Falha ao transferir o item."
      };
      if (itemEditorIndex === index) {
        renderItemEditorTransfer(index);
      } else {
        renderInv(inv);
      }
      return;
    }
  } else {
    const sheets = readSheets();
    const targetSheet = normalizeSheetData(sheets[targetUsername] || {}, "player");
    const targetCapacity = Math.max(
      normalizeInventorySlots("player", targetSheet.inventorySlots),
      targetSheet.inv.length
    );

    if (targetSheet.inv.length >= targetCapacity) {
      itemTransferStates[index] = {
        ...state,
        tone: "fail",
        text: `${target.label} ficou sem slot livre para receber este item.`
      };
      if (itemEditorIndex === index) {
        renderItemEditorTransfer(index);
      } else {
        renderInv(inv);
      }
      return;
    }

    targetSheet.inv = [...targetSheet.inv, normalizeItem(item)];
    sheets[targetUsername] = targetSheet;
    writeSheets(sheets);
  }

  itemTransferStates = {};
  inv.splice(index, 1);
  renderInv(inv);
  resetItemEditorState();
  saveSheetSilently();
}

function renderInv(list) {
  inv = list.map(normalizeItem);
  const grid = document.getElementById("inventoryGrid");
  const inventoryMeta = document.getElementById("inventoryMeta");
  const inventoryAddBtn = document.getElementById("inventoryAddBtn");
  const inventoryMasterControls = document.getElementById("inventoryMasterControls");
  const inventorySlotDelta = document.getElementById("inventorySlotDelta");
  if (!grid) return;

  const capacity = Math.max(
    normalizeInventorySlots(currentSheetTarget?.kind || "player", inventorySlots),
    inv.length
  );
  const used = Math.min(inv.length, capacity);
  const canExpand = currentRole === "master" && currentSheetTarget?.kind === "player";

  inventorySlots = capacity;

  if (inventoryMeta) inventoryMeta.textContent = `${used} / ${capacity} slots`;
  if (inventoryMasterControls) inventoryMasterControls.hidden = !canExpand;
  if (inventorySlotDelta && (!inventorySlotDelta.value || Number.parseInt(inventorySlotDelta.value, 10) < 1)) {
    inventorySlotDelta.value = "1";
  }
  if (inventoryAddBtn) {
    inventoryAddBtn.disabled = used >= capacity;
    inventoryAddBtn.textContent = used >= capacity ? "Lotado" : "+ Item";
  }

  grid.innerHTML = Array.from({ length: capacity }, (_slot, index) => {
    const item = inv[index];

    if (!item) {
      return `
        <article class="item-card item-card-empty">
          <button class="item-slot-btn" onclick="addItem()" ${used >= capacity ? "disabled" : ""}>
            <span class="item-slot-index">Slot ${index + 1}</span>
            <strong class="item-slot-plus">+</strong>
            <span class="item-slot-copy">${used >= capacity ? "Inventário cheio" : "Slot vazio"}</span>
          </button>
        </article>
      `;
    }

    const itemType = normalizeItemType(item.type);
    const rollState = itemRollStates[index];
    const primaryMeta = itemType === "arma" && item.damage
      ? `Dano: ${item.damage}`
      : `Quantidade: ${item.qty}`;
    const secondaryMeta = itemType === "arma"
      ? `Quantidade: ${item.qty}`
      : rollState?.text || "Clique para abrir os detalhes";
    const secondaryClass = secondaryMeta === "Clique para abrir os detalhes" ? "item-summary-line is-muted" : "item-summary-line";

    return `
      <article class="item-card inv-row" data-index="${index}">
        <div class="item-card-head">
          <span class="item-slot-index">Slot ${index + 1}</span>
          <button class="btn-remove" onclick="removeItem(${index})">x</button>
        </div>

        <button class="item-summary-btn" onclick="openItemEditor(${index})">
          <div class="item-summary-main">
            <span class="${getItemTypeBadgeClass(itemType)}">${esc(formatItemType(itemType))}</span>
            <h3 class="item-title">${esc(item.name || "Item sem nome")}</h3>
            <span class="item-summary-line ${itemType === "arma" && item.damage ? "is-weapon" : ""}">${esc(primaryMeta)}</span>
            <span class="${secondaryClass}">${esc(secondaryMeta)}</span>
          </div>
        </button>
      </article>
    `;
  }).join("");

  syncAutoGrowTextareas(grid);
}

function updateItem(index, field, value) {
  if (!inv[index]) return;
  inv[index] = normalizeItem({
    ...inv[index],
    [field]: value
  });
}

async function addItem() {
  const capacity = Math.max(
    normalizeInventorySlots(currentSheetTarget?.kind || "player", inventorySlots),
    inv.length
  );
  if (inv.length >= capacity) {
    await UI.alert("Todos os slots atuais do inventário já estão ocupados.", {
      title: "Inventário cheio",
      kicker: "// Slots",
      confirmLabel: "Fechar"
    });
    return;
  }

  inv.push(normalizeItem({ name: "", qty: 1, type: "outro", damage: "", desc: "" }));
  renderInv(inv);
  openItemEditor(inv.length - 1, { isNew: true });
}

function removeItem(index) {
  if (itemEditorIndex === index) {
    resetItemEditorState();
  }
  itemTransferStates = {};
  delete itemRollStates[index];
  inv.splice(index, 1);
  itemRollStates = Object.fromEntries(
    Object.entries(itemRollStates)
      .map(([key, value]) => {
        const numericKey = Number.parseInt(key, 10);
        if (numericKey > index) return [String(numericKey - 1), value];
        return [key, value];
      })
  );
  renderInv(inv);
  saveSheetSilently();
}

function collectInv() {
  return inv.map(normalizeItem);
}

function getInventorySlotDelta() {
  const input = document.getElementById("inventorySlotDelta");
  const numeric = Number.parseInt(input?.value || "1", 10);
  const safeValue = Number.isNaN(numeric) ? 1 : Math.max(1, Math.min(100, numeric));

  if (input) input.value = String(safeValue);
  return safeValue;
}

async function changeInventorySlots(direction) {
  if (!(currentRole === "master" && currentSheetTarget?.kind === "player")) return;

  const delta = getInventorySlotDelta();
  const currentCapacity = Math.max(
    normalizeInventorySlots(currentSheetTarget?.kind || "player", inventorySlots),
    inv.length
  );
  const minimumCapacity = Math.max(DEFAULT_INVENTORY_SLOTS, inv.length);
  const targetCapacity = currentCapacity + delta * direction;

  if (direction < 0 && targetCapacity < minimumCapacity) {
    await UI.alert(
      `Não é possível reduzir abaixo de ${minimumCapacity} slots porque a ficha usa ${inv.length} item(ns) e o mínimo padrão é ${DEFAULT_INVENTORY_SLOTS}.`,
      {
        title: "Redução bloqueada",
        kicker: "// Inventário",
        confirmLabel: "Entendi"
      }
    );
    return;
  }

  inventorySlots = normalizeInventorySlots("player", targetCapacity);
  renderInv(inv);
  saveSheetSilently();
}

function syncAutoGrowTextareas(scope = document) {
  scope.querySelectorAll?.("textarea.auto-grow").forEach(autoGrowTextarea);
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

async function openSheet(target, fromMaster) {
  const resolvedTarget = typeof target === "string" ? createPlayerTarget(target) : target;

  pendingRealtimeSheetKey = "";
  currentSheetTarget = resolvedTarget;
  updateSheetHeader(fromMaster);
  applySheetKindUI(resolvedTarget.kind);
  await loadSheet(resolvedTarget.key, resolvedTarget.kind);
  showScreen("sheetScreen");
}

function updateSheetHeader(fromMaster) {
  const sheetUser = document.getElementById("sheetUser");
  const backButton = document.getElementById("btnBackMaster");
  const sheetKindLabel = document.getElementById("sheetKindLabel");
  const sheetSaveText = document.getElementById("sheetSaveText");

  if (sheetUser) sheetUser.textContent = formatCurrentSheetTarget();
  if (backButton) backButton.style.display = fromMaster ? "inline-block" : "none";
  if (sheetKindLabel) sheetKindLabel.textContent = getSheetKindTitle();
  if (sheetSaveText) sheetSaveText.textContent = getSheetSaveText();
}

function applySheetKindUI(kind) {
  const resourcesRow = document.querySelector(".resources-row");
  const sanityCard = document.getElementById("sanityCard");
  const charFactionGroup = document.getElementById("charFactionGroup");
  const charRaceGroup = document.getElementById("charRaceGroup");
  const ownedMemoriesSection = document.getElementById("ownedMemoriesSection");
  const charFaction = document.getElementById("charFaction");
  const inventorySection = document.getElementById("inventorySection");
  const memorySection = document.getElementById("memorySection");
  const vidaCard = document.getElementById("vidaCard");
  const isMonster = kind === "monster";

  if (resourcesRow) resourcesRow.classList.toggle("resources-single", isMonster);
  if (sanityCard) {
    sanityCard.hidden = isMonster;
    sanityCard.style.display = isMonster ? "none" : "";
  }
  if (charFactionGroup) {
    charFactionGroup.hidden = isMonster;
    charFactionGroup.style.display = isMonster ? "none" : "";
  }
  if (charRaceGroup) charRaceGroup.classList.toggle("form-group-full", isMonster);
  if (charFaction && isMonster) charFaction.value = "";
  if (ownedMemoriesSection) {
    ownedMemoriesSection.hidden = isMonster;
    ownedMemoriesSection.style.display = isMonster ? "none" : "";
  }
  if (inventorySection) {
    inventorySection.hidden = isMonster;
    inventorySection.style.display = isMonster ? "none" : "";
  }
  if (memorySection) {
    memorySection.hidden = !isMonster;
    memorySection.style.display = isMonster ? "" : "none";
  }
  if (vidaCard) vidaCard.classList.toggle("resource-card-wide", isMonster);
  renderProgressionField(kind);
}

function getSoulRanks() {
  return Array.isArray(SOUL?.RANKS) && SOUL.RANKS.length
    ? SOUL.RANKS
    : [
        { rank: 1, name: "Adormecido" },
        { rank: 2, name: "Despertado" },
        { rank: 3, name: "Ascendido" },
        { rank: 4, name: "Transcendido" },
        { rank: 5, name: "Supremo" },
        { rank: 6, name: "Sagrado" },
        { rank: 7, name: "Divino" }
      ];
}

function getSoulAwardElements() {
  return {
    root: document.getElementById("soulAwardRoot"),
    dialog: document.querySelector(".soul-award-dialog"),
    close: document.getElementById("soulAwardCloseBtn"),
    cancel: document.getElementById("soulAwardCancelBtn"),
    apply: document.getElementById("soulAwardApplyBtn"),
    amount: document.getElementById("soulAwardAmount"),
    preview: document.getElementById("soulAwardPreview"),
    optionGrid: document.getElementById("soulRankOptionGrid"),
    title: document.getElementById("soulAwardTitle"),
    open: document.getElementById("openSoulAwardBtn")
  };
}

function renderProgressionField(kind = currentSheetTarget?.kind || "player") {
  const label = document.querySelector('label[for="charLevel"]');
  const levelInput = document.getElementById("charLevel");
  const row = document.querySelector(".level-field-row");
  const group = document.querySelector(".level-field-group");
  const panel = document.getElementById("soulCorePanel");
  const actionButton = document.getElementById("openSoulAwardBtn");
  const isPlayer = kind === "player";

  if (label) {
    label.textContent = isPlayer ? "Núcleo da alma" : "Nível";
  }

  if (label && isPlayer) {
    label.textContent = "Nível";
  }

  if (group) group.classList.toggle("is-soul", isPlayer);
  if (row) row.classList.toggle("has-soul-core", isPlayer);

  if (levelInput) {
    levelInput.hidden = isPlayer;
    levelInput.style.display = isPlayer ? "none" : "";
  }

  if (panel) {
    panel.hidden = !isPlayer;
    panel.style.display = isPlayer ? "" : "none";
    panel.classList.toggle("is-compact", isPlayer);
  }

  if (actionButton) {
    const canAward = isPlayer && currentRole === "master";
    actionButton.hidden = !canAward;
    actionButton.style.display = canAward ? "" : "none";
  }

  if (!isPlayer) return;

  const normalized = normalizeSoulCoreState(soulCore, getValue("charLevel") || 1);
  const rankName = getSoulRankName(normalized.rank);
  const requirement = getSoulNextRankRequirement(normalized.rank);
  const progressPercent = requirement ? Math.min(100, (normalized.xp / requirement) * 100) : 100;
  const rankNameElement = document.getElementById("soulRankName");
  const rankMetaElement = document.getElementById("soulRankMeta");
  const xpTextElement = document.getElementById("soulXpText");
  const nextRankElement = document.getElementById("soulNextRankText");
  const progressBar = document.getElementById("soulXpBar");
  const progressLabel = buildSoulProgressLabel(normalized);
  const nextRankLabel = requirement
    ? `Próximo rank: ${getSoulRankName(normalized.rank + 1)}`
    : "Rank máximo alcançado";

  soulCore = normalized;
  if (levelInput) levelInput.value = String(normalized.rank);
  if (rankNameElement) rankNameElement.textContent = rankName;
  if (rankMetaElement) rankMetaElement.textContent = `Rank ${normalized.rank}`;
  if (xpTextElement) xpTextElement.textContent = buildSoulProgressLabel(normalized);
  if (nextRankElement) {
    nextRankElement.textContent = requirement
      ? `Próximo rank: ${getSoulRankName(normalized.rank + 1)}`
      : "Rank máximo alcançado";
  }
  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
  }
  if (xpTextElement) xpTextElement.textContent = progressLabel;
  if (nextRankElement) nextRankElement.textContent = nextRankLabel;
  if (panel) {
    panel.title = `${rankName} | ${progressLabel} | ${nextRankLabel}`;
    panel.setAttribute("aria-label", `Rank atual: ${rankName}. ${progressLabel}. ${nextRankLabel}.`);
  }
}

function renderSoulAwardOptions() {
  const { optionGrid } = getSoulAwardElements();
  if (!optionGrid) return;

  optionGrid.innerHTML = getSoulRanks()
    .map(
      option => `
        <button
          type="button"
          class="soul-rank-option${option.rank === soulAwardState.essenceRank ? " is-active" : ""}"
          data-soul-rank="${option.rank}"
          aria-pressed="${option.rank === soulAwardState.essenceRank ? "true" : "false"}"
        >
          <span class="item-meta">Rank ${option.rank}</span>
          <strong>${esc(option.name)}</strong>
        </button>
      `
    )
    .join("");
}

function renderSoulAwardPreview() {
  const { preview, amount, title } = getSoulAwardElements();
  if (!preview) return;

  const normalizedAmount = Math.min(999, Math.max(1, Number.parseInt(amount?.value || soulAwardState.amount, 10) || 1));
  const selectedRank = Math.min(7, Math.max(1, Number.parseInt(soulAwardState.essenceRank, 10) || 1));
  const currentCore = normalizeSoulCoreState(soulCore, getValue("charLevel") || 1);
  const result = absorbSoulEssencesState(currentCore, selectedRank, normalizedAmount);
  const totalExperience = result.totalExperience;
  const perEssenceExperience = calculateSoulEssenceExperience(currentCore.rank, selectedRank);

  soulAwardState.amount = normalizedAmount;
  soulAwardState.essenceRank = selectedRank;

  if (amount) amount.value = String(normalizedAmount);
  if (title) {
    title.textContent = `Alimentar núcleo de ${currentSheetTarget?.label || "personagem"}`;
  }

  preview.innerHTML = `
    <span class="item-meta">Prévia</span>
    <strong>${normalizedAmount} essência(s) de rank ${selectedRank}</strong>
    <p>${getSoulRankName(currentCore.rank)} recebe ${perEssenceExperience} XP por absorção nesta etapa.</p>
    <ul>
      <li>Experiência total: ${totalExperience} XP</li>
      <li>Estado final: ${getSoulRankName(result.core.rank)} (Rank ${result.core.rank})</li>
      <li>Progresso final: ${buildSoulProgressLabel(result.core)}</li>
      ${
        result.rankUps.length
          ? `<li>Subidas: ${result.rankUps.map(entry => `${entry.from}→${entry.to}`).join(", ")}</li>`
          : "<li>Nenhuma subida de rank nesta absorção.</li>"
      }
    </ul>
  `;
}

function openSoulAwardModal() {
  if (currentRole !== "master" || currentSheetTarget?.kind !== "player") return;

  const { root, dialog, amount } = getSoulAwardElements();
  if (!root || !dialog) return;

  soulAwardState.open = true;
  soulAwardState.essenceRank = soulAwardState.essenceRank || 1;
  soulAwardState.amount = Math.min(999, Math.max(1, Number.parseInt(amount?.value || soulAwardState.amount, 10) || 1));
  root.hidden = false;
  renderSoulAwardOptions();
  renderSoulAwardPreview();
  window.requestAnimationFrame(() => {
    dialog.focus();
  });
}

function closeSoulAwardModal() {
  const { root } = getSoulAwardElements();
  if (!root) return;

  soulAwardState.open = false;
  root.hidden = true;
}

function buildSoulAwardSummary(summary) {
  if (!summary) {
    return "A essência da alma foi aplicada ao núcleo do personagem.";
  }

  const beforeName = getSoulRankName(summary.before?.rank || 1);
  const afterName = getSoulRankName(summary.after?.rank || 1);
  const rankUps = Array.isArray(summary.rankUps) ? summary.rankUps : [];

  if (!summary.totalExperience) {
    return `${currentSheetTarget?.label || "O personagem"} não absorveu experiência desta essência por causa da diferença de ranks.`;
  }

  return `${currentSheetTarget?.label || "O personagem"} recebeu ${summary.totalExperience} XP em essência da alma. ${beforeName} → ${afterName}.${rankUps.length ? ` Subidas: ${rankUps.map(entry => `${entry.from}→${entry.to}`).join(", ")}.` : ""}`;
}

async function applySoulAward() {
  if (currentRole !== "master" || currentSheetTarget?.kind !== "player") return;

  const { apply } = getSoulAwardElements();
  const essenceRank = Math.min(7, Math.max(1, Number.parseInt(soulAwardState.essenceRank, 10) || 1));
  const amount = Math.min(999, Math.max(1, Number.parseInt(soulAwardState.amount, 10) || 1));

  if (apply) apply.disabled = true;

  try {
    if (isBackendMode()) {
      const response = await APP.awardSoulEssence(currentSheetTarget.key, {
        essenceRank,
        amount
      });
      const savedData = normalizeSheetData(response?.character?.data || {}, "player");
      remoteSheetsCache[currentSheetTarget.key] = savedData;
      persistRemoteSheetsCache();
      soulCore = normalizeSoulCoreState(savedData.soulCore, savedData.charLevel || 1);
      renderProgressionField("player");
      closeSoulAwardModal();
      await UI.alert(buildSoulAwardSummary(response?.summary), {
        title: "Núcleo fortalecido",
        kicker: "// Essência da alma"
      });
      return;
    }

    // No modo local, a mesma lógica pura é reaproveitada para manter a integração simples.
    const result = absorbSoulEssencesState(soulCore, essenceRank, amount);
    soulCore = normalizeSoulCoreState(result.core, result.core.rank);
    renderProgressionField("player");
    closeSoulAwardModal();
    saveSheetSilently();
    await UI.alert(
      buildSoulAwardSummary({
        before: normalizeSoulCoreState(soulCore, soulCore.rank),
        after: result.core,
        totalExperience: result.totalExperience,
        rankUps: result.rankUps
      }),
      {
        title: "Núcleo fortalecido",
        kicker: "// Essência da alma"
      }
    );
  } catch (error) {
    await UI.alert(error?.message || "Falha ao aplicar a essência da alma.", {
      title: "Falha na absorção",
      kicker: "// Essência da alma"
    });
  } finally {
    if (apply) apply.disabled = false;
  }
}

function initSoulAwardModal() {
  const { root, dialog, close, cancel, apply, amount, optionGrid, open } = getSoulAwardElements();
  if (!root || !dialog || !close || !cancel || !apply || !amount || !optionGrid || !open) return;
  if (root.dataset.bound === "true") return;

  root.dataset.bound = "true";

  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }

  open.addEventListener("click", openSoulAwardModal);
  close.addEventListener("click", closeSoulAwardModal);
  cancel.addEventListener("click", closeSoulAwardModal);
  apply.addEventListener("click", () => {
    applySoulAward();
  });

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.soulAwardClose) {
      closeSoulAwardModal();
      return;
    }

    const rankButton = target.closest("[data-soul-rank]");
    if (!(rankButton instanceof HTMLElement)) return;

    soulAwardState.essenceRank = Math.min(7, Math.max(1, Number.parseInt(rankButton.dataset.soulRank || "1", 10) || 1));
    renderSoulAwardOptions();
    renderSoulAwardPreview();
  });

  amount.addEventListener("input", () => {
    soulAwardState.amount = Math.min(999, Math.max(1, Number.parseInt(amount.value || "1", 10) || 1));
    renderSoulAwardPreview();
  });

  document.addEventListener("keydown", event => {
    if (!soulAwardState.open) return;
    if (event.key !== "Escape") return;

    event.preventDefault();
    closeSoulAwardModal();
  });
}

function formatCurrentSheetTarget() {
  if (!currentSheetTarget) return "";
  if (currentSheetTarget.kind === "npc") return `${currentSheetTarget.label} | NPC`;
  if (currentSheetTarget.kind === "monster") return `${currentSheetTarget.label} | Monstro`;
  return currentSheetTarget.label;
}

function getSheetKindTitle() {
  if (!currentSheetTarget) return "Ficha do personagem";
  if (currentSheetTarget.kind === "npc") return "Ficha do NPC";
  if (currentSheetTarget.kind === "monster") return "Ficha do monstro";
  return "Ficha do personagem";
}

function getSheetSaveText() {
  if (!currentSheetTarget) return "Toda alteração da ficha fica salva para o usuário correto.";
  if (currentSheetTarget.kind === "npc") {
    return "Toda alteração desta ficha de NPC fica salva neste navegador do mestre.";
  }
  if (currentSheetTarget.kind === "monster") {
    return "Toda alteração desta ficha de monstro fica salva neste navegador do mestre.";
  }
  return "Toda alteração da ficha fica salva para o usuário correto.";
}

function syncDirectoryName(charName) {
  const cleanName = String(charName || "").trim();
  if (!cleanName || !currentSheetTarget) return;

  if (currentSheetTarget.kind === "player") {
    const players = AUTH.getPlayers();
    const index = players.findIndex(player => player.username === currentSheetTarget.owner);
    if (index >= 0) {
      players[index] = {
        ...players[index],
        charname: cleanName,
        inventorySlots,
        usedSlots: inv.length
      };
      AUTH.setPlayers(players);
    }

    if (isBackendMode()) {
      const directory = AUTH.getDirectoryCache();
      const directoryPlayers = directory.players.map(player =>
        player.username === currentSheetTarget.owner
          ? {
              ...player,
              charname: cleanName,
              inventorySlots,
              usedSlots: inv.length
            }
          : player
      );
      AUTH.setDirectoryCache({
        ...directory,
        players: directoryPlayers
      });
    }
    currentSheetTarget.label = cleanName;
    updateSheetHeader(document.getElementById("btnBackMaster")?.style.display !== "none");
    return;
  }

  if (currentSheetTarget.kind === "npc") {
    const npcs = readNpcs();
    const index = npcs.findIndex(npc => npc.id === currentSheetTarget.npcId);
    if (index >= 0 && npcs[index].name !== cleanName) {
      npcs[index] = { ...npcs[index], name: cleanName };
      writeNpcs(npcs);
    }
    currentSheetTarget.label = cleanName;
    updateSheetHeader(document.getElementById("btnBackMaster")?.style.display !== "none");
    return;
  }

  const monsters = readMonsters();
  const index = monsters.findIndex(monster => monster.id === currentSheetTarget.monsterId);
  if (index >= 0 && monsters[index].name !== cleanName) {
    monsters[index] = { ...monsters[index], name: cleanName };
    writeMonsters(monsters);
  }
  currentSheetTarget.label = cleanName;
  updateSheetHeader(document.getElementById("btnBackMaster")?.style.display !== "none");
}

setInterval(() => {
  if (document.getElementById("sheetScreen")?.classList.contains("active")) {
    saveSheetSilently();
  }
}, 60000);

