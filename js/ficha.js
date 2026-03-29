const SHEETS_KEY = "tc_sheets";
const NPCS_KEY = "tc_npcs";
const MONSTERS_KEY = "tc_monsters";
const REMOTE_SHEETS_KEY = "tc_remote_sheets";
const NPC_PREFIX = "npc:";
const MONSTER_PREFIX = "monster:";
const ATTRIBUTES = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"];
const DEFAULT_INVENTORY_SLOTS = 20;

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
    errEl.textContent = "Usuario e senha sao obrigatorios.";
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
      errEl.textContent = "Ja existe um jogador com esse nome.";
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
      errEl.textContent = "Ja existe um NPC com esse nome.";
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
      errEl.textContent = "Ja existe um monstro com esse nome.";
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
  const confirmed = await UI.confirm(`Remover "${username}"? A ficha sera apagada.`, {
    title: "Excluir jogador",
    kicker: "// Confirmacao",
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
        ? "Toda alteracao desta ficha de NPC fica salva neste navegador do mestre."
        : "Toda alteracao da ficha fica salva para o usuario correto.";
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
  memoryRollStates = {};
  ownedMemoryTransferStates = {};
  itemTransferStates = {};

  updateBar("vida");
  if (kind !== "monster") updateBar("integ");
  renderHabs(habs);
  renderOwnedMemories(ownedMemories);
  renderInv(inv);
  renderMemoryDrops(memoryDrops);
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

  if (isBackendMode()) {
    const requestId = ++saveRequestId;
    markRecentLocalSave(currentSheetTarget.key);
    try {
      const saved = await APP.saveCharacter(currentSheetTarget.key, data);
      if (requestId !== saveRequestId) return;
      remoteSheetsCache[currentSheetTarget.key] = normalizeSheetData(saved?.data || data, currentSheetTarget.kind);
      persistRemoteSheetsCache();
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
  }

  syncDirectoryName(data.charName);
}

function collectSheetData(kind = "player") {
  const avatarImg = document.getElementById("avatarImg");
  const attrData = {};
  const isMonster = kind === "monster";

  ATTRIBUTES.forEach(attr => {
    attrData[`attr${attr}`] = getValue(`attr${attr}`);
  });

  return normalizeSheetData(
    {
      charName: getValue("charName"),
      charClass: getValue("charClass"),
      charLevel: getValue("charLevel"),
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
  const normalized = {
    charName: data.charName || "",
    charClass: data.charClass || "",
    charLevel: data.charLevel || "",
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
    if (attr === "Alma") {
      normalized[`attr${attr}`] = sanitizeAttrValue(attr, data[`attr${attr}`], 10);
    } else {
      normalized[`attr${attr}`] = sanitizeAttrValue(attr, data[`attr${attr}`], "");
    }
  });

  return normalized;
}

function normalizeHab(hab) {
  return {
    name: hab?.name || "",
    desc: hab?.desc || ""
  };
}

function normalizeItem(item) {
  return {
    name: item?.name || "",
    qty: item?.qty || 1,
    desc: item?.desc || ""
  };
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

  const confirmed = await UI.confirm(`Apagar o NPC "${npc.name}"? A ficha sera apagada.`, {
    title: "Excluir NPC",
    kicker: "// Confirmacao",
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

  const confirmed = await UI.confirm(`Apagar o monstro "${monster.name}"? A ficha sera apagada.`, {
    title: "Excluir monstro",
    kicker: "// Confirmacao",
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

  const min = attr === "Alma" ? 10 : 1;
  const clamped = Math.max(min, Math.min(30, numeric));
  return String(clamped);
}

function enforceSheetRules() {
  ATTRIBUTES.forEach(attr => {
    const input = document.getElementById(`attr${attr}`);
    if (!input) return;

    input.value = sanitizeAttrValue(attr, input.value, attr === "Alma" ? 10 : "");
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

function calcMod(attr) {
  const input = document.getElementById(`attr${attr}`);
  const target = document.getElementById(`mod${attr}`);
  if (!input || !target) return;

  input.value = sanitizeAttrValue(attr, input.value, attr === "Alma" ? 10 : "");
  const value = Number.parseInt(input.value, 10);

  if (Number.isNaN(value)) {
    target.textContent = "-";
    target.style.color = "";
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
          <textarea class="hab-desc auto-grow" rows="3" placeholder="Efeito, custo, descricao..." oninput="updateHab(${index}, 'desc', this.value)">${esc(hab.desc)}</textarea>
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
    element.innerHTML = '<p class="empty-msg">Nenhuma memoria possuida.</p>';
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
            <span class="item-meta">Memoria</span>
            <h3 class="owned-memory-title">${esc(memory.name || "Memoria sem nome")}</h3>
            <p class="owned-memory-desc">${esc(memory.desc || "Sem descricao.")}</p>
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
        <span class="item-meta">Transferencia</span>
        <div class="memory-award-status">Nao ha outro jogador disponivel para receber esta memoria.</div>
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
      <div class="${statusClass}">${esc(state.text || "Selecione o jogador de destino para transferir esta memoria.")}</div>
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
    title: "Transferir memoria",
    kicker: "// Jogadores",
    message: "Escolha qual jogador vai receber esta memoria.",
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
    text: "Destino definido. Clique em Enviar para concluir a transferencia."
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
    `Transferir "${memory.name || "Memoria sem nome"}" para ${target.label}?`,
    {
      title: "Transferir memoria",
      kicker: "// Memorias possuidas",
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
        text: error?.message || "Falha ao transferir a memoria."
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
    name: String(drop?.name || "").trim() || "Memoria sem nome",
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
    result.textContent = state?.resultText || "Defina a chance e role para descobrir se a memoria caiu.";
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
      <span class="item-meta">Memoria enviada</span>
      <div class="${statusClass}">${esc(state.awardText || "Memoria enviada para a ficha escolhida.")}</div>
    `;
    return;
  }

  if (!targets.length) {
    award.innerHTML = `
      <span class="item-meta">Enviar memoria</span>
      <div class="memory-award-status is-fail">Nao ha jogadores ou NPCs disponiveis para receber esta memoria.</div>
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
    <span class="item-meta">Enviar memoria para</span>
    <button class="btn-inline memory-picker-btn" onclick="pickMemoryAwardTarget(${index})">
      <span class="memory-picker-label">${esc(formatMemoryTargetLabel(selectedTarget, targets, "Escolher destino"))}</span>
      <span class="memory-picker-hint">Alterar</span>
    </button>
    <button class="btn-inline memory-award-btn" onclick="awardMemoryDrop(${index})">Enviar para ficha</button>
    <div class="${statusClass}">${esc(state.awardText || "A memoria caiu. Escolha quem vai recebe-la.")}</div>
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
    title: "Enviar memoria",
    kicker: "// Destino",
    message: "Escolha quem vai receber esta memoria.",
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
    element.innerHTML = '<p class="empty-msg">Nenhuma memoria definida.</p>';
    return;
  }

  element.className = "memory-drop-list";
  element.innerHTML = memoryDrops
    .map(
      (drop, index) => `
        <div class="memory-row">
          <div class="memory-main">
            <div class="memory-field">
              <span class="item-meta">Memoria</span>
              <input class="memory-name" type="text" placeholder="Nome da memoria..." value="${esc(drop.name)}" oninput="updateMemoryDrop(${index}, 'name', this.value)" />
            </div>

            <div class="memory-field">
              <span class="item-meta">Descricao e efeito</span>
              <textarea class="memory-desc auto-grow" rows="3" placeholder="Descricao do drop, raridade, condicao ou efeito..." oninput="updateMemoryDrop(${index}, 'desc', this.value)">${esc(drop.desc)}</textarea>
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
              <div class="memory-roll-result" id="memoryRollResult${index}">Defina a chance e role para descobrir se a memoria caiu.</div>
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
  result.textContent = "Rolando o destino da memoria...";

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
      result.textContent = error?.message || "Falha ao rolar o drop da memoria.";
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
        ? `Memoria obtida. Rolagem ${rolled}% dentro da chance de ${chance}%.`
        : `Sem memoria. Rolagem ${rolled}% acima da chance de ${chance}%.`
    };
    applyMemoryRollState(index);
  }, 1250);
}

async function awardMemoryDrop(index) {
  const drop = memoryDrops[index];
  const state = memoryRollStates[index];
  if (!drop || !state?.success || state.awarded) return;
  const awardedMemoryName = String(drop?.name || "").trim() || "Memoria sem nome";

  const target = parseMemoryAwardTarget(state.target);
  if (!target || target.kind === "monster") {
    memoryRollStates[index] = {
      ...state,
      awardTone: "fail",
      awardText: "Escolha um jogador ou NPC valido para receber a memoria."
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
        awardText: error?.message || "Falha ao enviar a memoria."
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
        <div class="memory-award-status">Nenhum jogador disponivel com slot livre para receber este item.</div>
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
      <div class="${statusClass}">${esc(state.text || "O item so pode ser enviado para jogadores com slot livre no inventario.")}</div>
    </div>
  `;
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
    kicker: "// Inventario",
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
    text: "Destino definido. Clique em Enviar para concluir a transferencia."
  };

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
      text: "Nenhum jogador com slot livre esta disponivel para receber este item."
    };
    renderInv(inv);
    return;
  }

  const targetInventoryState = getPlayerInventoryState(targetUsername);
  if (targetInventoryState.available <= 0) {
    itemTransferStates[index] = {
      ...state,
      tone: "fail",
      text: `${target.label} esta com a mochila cheia.`
    };
    renderInv(inv);
    return;
  }

  const confirmed = await UI.confirm(
    `Transferir "${item.name || "Item sem nome"}" para ${target.label}?`,
    {
      title: "Transferir item",
      kicker: "// Inventario",
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
      renderInv(inv);
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
      renderInv(inv);
      return;
    }

    targetSheet.inv = [...targetSheet.inv, normalizeItem(item)];
    sheets[targetUsername] = targetSheet;
    writeSheets(sheets);
  }

  itemTransferStates = {};
  inv.splice(index, 1);
  renderInv(inv);
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
  const canTransferItems = currentSheetTarget?.kind === "player";
  const transferTargets = canTransferItems ? getItemTransferTargets() : [];

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
            <span class="item-slot-copy">${used >= capacity ? "Inventario cheio" : "Slot vazio"}</span>
          </button>
        </article>
      `;
    }

    return `
      <article class="item-card inv-row" data-index="${index}">
        <div class="item-card-head">
          <span class="item-slot-index">Slot ${index + 1}</span>
          <button class="btn-remove" onclick="removeItem(${index})">x</button>
        </div>

        <div class="item-fields">
          <div class="item-top">
            <div>
              <span class="item-meta">Item</span>
              <input
                class="item-input inv-name"
                type="text"
                placeholder="Nome..."
                value="${esc(item.name)}"
                oninput="updateItem(${index}, 'name', this.value)"
              />
            </div>

            <div>
              <span class="item-meta">Qtd</span>
              <input
                class="item-input item-qty inv-qty"
                type="number"
                min="0"
                value="${esc(item.qty)}"
                oninput="updateItem(${index}, 'qty', this.value)"
              />
            </div>
          </div>

          <div>
            <span class="item-meta">Descricao</span>
            <textarea
              class="item-desc inv-desc auto-grow"
              rows="2"
              placeholder="Descricao curta..."
              oninput="updateItem(${index}, 'desc', this.value)"
            >${esc(item.desc)}</textarea>
          </div>

          ${
            canTransferItems
              ? renderItemTransferBlock(index, transferTargets)
              : ""
          }
        </div>
      </article>
    `;
  }).join("");

  syncAutoGrowTextareas(grid);
}

function updateItem(index, field, value) {
  if (!inv[index]) return;
  inv[index][field] = field === "qty" ? String(Math.max(0, parseInt(value || "0", 10) || 0)) : value;
}

async function addItem() {
  const capacity = Math.max(
    normalizeInventorySlots(currentSheetTarget?.kind || "player", inventorySlots),
    inv.length
  );
  if (inv.length >= capacity) {
    await UI.alert("Todos os slots atuais do inventario ja estao ocupados.", {
      title: "Inventario cheio",
      kicker: "// Slots",
      confirmLabel: "Fechar"
    });
    return;
  }

  inv.push({ name: "", qty: 1, desc: "" });
  renderInv(inv);
  document.querySelectorAll(".inv-name")[inv.length - 1]?.focus();
  saveSheetSilently();
}

function removeItem(index) {
  itemTransferStates = {};
  inv.splice(index, 1);
  renderInv(inv);
  saveSheetSilently();
}

function collectInv() {
  return Array.from(document.querySelectorAll(".inv-row")).map(row => {
    return {
      name: row.querySelector(".inv-name")?.value || "",
      qty: row.querySelector(".inv-qty")?.value || 1,
      desc: row.querySelector(".inv-desc")?.value || ""
    };
  });
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
      `Nao e possivel reduzir abaixo de ${minimumCapacity} slots porque a ficha usa ${inv.length} item(ns) e o minimo padrao e ${DEFAULT_INVENTORY_SLOTS}.`,
      {
        title: "Reducao bloqueada",
        kicker: "// Inventario",
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
  if (!currentSheetTarget) return "Toda alteracao da ficha fica salva para o usuario correto.";
  if (currentSheetTarget.kind === "npc") {
    return "Toda alteracao desta ficha de NPC fica salva neste navegador do mestre.";
  }
  if (currentSheetTarget.kind === "monster") {
    return "Toda alteracao desta ficha de monstro fica salva neste navegador do mestre.";
  }
  return "Toda alteracao da ficha fica salva para o usuario correto.";
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
