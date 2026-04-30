import { normalizeSoulCore } from "./soul-progression.js";

const ATTRIBUTES = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"];
const DEFAULT_INVENTORY_SLOTS = 10;
const ITEM_TYPES = new Set(["arma", "acessorio", "outro"]);

function sanitizeChance(value, fallback = "0") {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number.parseFloat(String(value).replace(",", "."));
  if (Number.isNaN(numeric)) return fallback;
  return String(Math.max(0, Math.min(100, numeric)));
}

function sanitizeAttrValue(attr, value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;
  return String(Math.max(1, numeric));
}

function normalizeResourceValue(value, fallback = "") {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;
  return String(Math.max(0, numeric));
}

function clampResourceValue(value, maxValue, fallback = "") {
  const current = normalizeResourceValue(value, fallback);
  if (current === "") return current;

  const max = normalizeResourceValue(maxValue, "");
  if (max === "") return current;

  return String(Math.min(
    Number.parseInt(current, 10),
    Number.parseInt(max, 10)
  ));
}

function getIntegrityMaxFromSoul(value, fallback = "") {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return fallback;
  return String(Math.max(0, Math.floor(numeric / 3)));
}

function normalizeInventorySlots(kind, value, used = 0) {
  if (kind === "monster") return 0;
  if (kind === "npc") return DEFAULT_INVENTORY_SLOTS;

  const numeric = Number.parseInt(value, 10);
  const safeValue = Number.isNaN(numeric) ? DEFAULT_INVENTORY_SLOTS : numeric;
  return Math.max(Math.max(DEFAULT_INVENTORY_SLOTS, used), Math.min(120, safeValue));
}

function normalizeHab(hab = {}) {
  const legacyDesc = String(hab.desc || "");
  return {
    id: String(hab.id || createHabId()),
    name: String(hab.name || ""),
    type: normalizeHabType(hab.type),
    trigger: String(hab.trigger || hab.gatilho || ""),
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

function normalizeItemType(value) {
  const normalized = String(value || "outro").trim().toLowerCase();
  return ITEM_TYPES.has(normalized) ? normalized : "outro";
}

function normalizeDamageExpression(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 24);
}

function normalizeItem(item = {}) {
  const type = normalizeItemType(item.type);
  return {
    name: String(item.name || ""),
    qty: String(Math.max(0, Number.parseInt(item.qty || "1", 10) || 0)),
    desc: String(item.desc || ""),
    type,
    damage: type === "arma" ? normalizeDamageExpression(item.damage) : ""
  };
}

function normalizeOwnedMemory(memory = {}) {
  return {
    name: String(memory.name || ""),
    desc: String(memory.desc || ""),
    source: String(memory.source || "")
  };
}

function normalizeMemoryDrop(drop = {}) {
  return {
    name: String(drop.name || ""),
    desc: String(drop.desc || ""),
    chance: sanitizeChance(drop.chance, "0")
  };
}

function normalizeSheetData(data = {}, kind = "player", charNameFallback = "") {
  const isMonster = kind === "monster";
  const inventory = !isMonster && Array.isArray(data.inv) ? data.inv.map(normalizeItem) : [];
  const soulCore = normalizeSoulCore(data.soulCore || {}, data.charLevel || 1);
  const vidaMax = normalizeResourceValue(data.vidaMax);
  const integMax = normalizeResourceValue(data.integMax);

  const normalized = {
    charName: String(data.charName || charNameFallback || ""),
    charClass: String(data.charClass || ""),
    charLevel: String(soulCore.rank),
    soulCore,
    charRace: String(data.charRace || ""),
    charFaction: isMonster ? "" : String(data.charFaction || ""),
    avatar: String(data.avatar || ""),
    vidaAtual: clampResourceValue(data.vidaAtual, vidaMax),
    vidaMax,
    integAtual: clampResourceValue(data.integAtual, integMax),
    integMax,
    charNotes: String(data.charNotes || ""),
    habs: Array.isArray(data.habs) ? data.habs.map(normalizeHab) : [],
    ownedMemories: isMonster
      ? []
      : Array.isArray(data.ownedMemories)
        ? data.ownedMemories.map(normalizeOwnedMemory)
        : [],
    inventorySlots: isMonster ? 0 : normalizeInventorySlots(kind, data.inventorySlots, inventory.length),
    inv: inventory,
    memoryDrops: isMonster
      ? Array.isArray(data.memoryDrops)
        ? data.memoryDrops.map(normalizeMemoryDrop)
        : []
      : []
  };

  ATTRIBUTES.forEach(attr => {
    normalized[`attr${attr}`] = sanitizeAttrValue(attr, data[`attr${attr}`], "");
  });

  if (!isMonster) {
    normalized.integMax = getIntegrityMaxFromSoul(normalized.attrAlma, "");
    normalized.integAtual = clampResourceValue(normalized.integAtual, normalized.integMax);
  }

  if (isMonster) {
    normalized.charFaction = "";
    normalized.integAtual = "";
    normalized.integMax = "";
    normalized.inventorySlots = 0;
    normalized.inv = [];
    normalized.ownedMemories = [];
  }

  return normalized;
}

function buildDefaultSheet(kind, charName) {
  return normalizeSheetData(
    {
      charName,
      charLevel: "1",
      soulCore: {
        rank: 1,
        xp: 0
      },
      vidaAtual: "",
      vidaMax: "",
      integAtual: "",
      integMax: "",
      inventorySlots: kind === "monster" ? 0 : DEFAULT_INVENTORY_SLOTS
    },
    kind,
    charName
  );
}

export {
  ATTRIBUTES,
  DEFAULT_INVENTORY_SLOTS,
  buildDefaultSheet,
  normalizeInventorySlots,
  normalizeItem,
  normalizeMemoryDrop,
  normalizeOwnedMemory,
  normalizeSheetData,
  sanitizeChance
};
