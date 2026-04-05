import { normalizeSoulCore } from "./soul-progression.js";

const ATTRIBUTES = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"];
const DEFAULT_INVENTORY_SLOTS = 30;
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

function normalizeInventorySlots(kind, value, used = 0) {
  if (kind === "monster") return 0;
  if (kind === "npc") return DEFAULT_INVENTORY_SLOTS;

  const numeric = Number.parseInt(value, 10);
  const safeValue = Number.isNaN(numeric) ? DEFAULT_INVENTORY_SLOTS : numeric;
  return Math.max(Math.max(DEFAULT_INVENTORY_SLOTS, used), Math.min(120, safeValue));
}

function normalizeHab(hab = {}) {
  return {
    name: String(hab.name || ""),
    desc: String(hab.desc || "")
  };
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

  const normalized = {
    charName: String(data.charName || charNameFallback || ""),
    charClass: String(data.charClass || ""),
    charLevel: String(soulCore.rank),
    soulCore,
    charRace: String(data.charRace || ""),
    charFaction: isMonster ? "" : String(data.charFaction || ""),
    avatar: String(data.avatar || ""),
    vidaAtual: String(data.vidaAtual || ""),
    vidaMax: String(data.vidaMax || ""),
    integAtual: isMonster ? "" : String(data.integAtual || ""),
    integMax: isMonster ? "" : String(data.integMax || ""),
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
      integAtual: kind === "monster" ? "" : "",
      integMax: kind === "monster" ? "" : "",
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
