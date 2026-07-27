/* ============================================================
 * mesa-realtime-rules.js — Regras PURAS do Durable Object da Mesa
 * (Etapa 41). Sem imports de "cloudflare:workers": este modulo
 * roda em Node puro, entao os testes unitarios (mesa-audit)
 * exercitam exatamente o codigo que o DO usa em producao.
 * ============================================================ */

// Iniciativa: o estado completo (update) e autoritativo do mestre; a rolagem
// (roll) e o unico delta de iniciativa que jogador emite, validado no DO
// (characterKey precisa ser o proprio username do socket).
const INITIATIVE_UPDATE_TYPE = "mesa:initiative:update";
const INITIATIVE_ROLL_TYPE = "mesa:initiative:roll";
// Desenhos: qualquer participante pode desenhar na camada normal; o payload e
// o estado completo dos tracos visiveis. Tracos da camada secreta ("dm") nunca
// deveriam sair do cliente do mestre — o DO remove qualquer um que chegue.
const DRAWINGS_UPDATE_TYPE = "mesa:drawings:update";
// Grade (Etapa 42): estado completo da grade da cena, autoritativo do mestre.
const GRID_UPDATE_TYPE = "mesa:grid:update";
// Ping no mapa (Etapa 43): canal efêmero — qualquer participante emite,
// o DO só repassa (nada entra na cena nem no storage do DO).
const PING_TYPE = "mesa:ping";
// Régua de medição (Etapa 44): mesmo modelo efêmero do ping — qualquer
// participante mede; broadcast a 10Hz enquanto arrasta, active:false encerra.
const RULER_TYPE = "mesa:ruler";
// Dados na Mesa (Etapa 45): o cliente PEDE (mesa:dice:request) e quem rola e o
// DO com crypto.getRandomValues — resultado a prova de trapaça, transmitido a
// todos como mesa:dice:result. NENHUM dos dois entra em RELAY_TYPES: request
// tem handler proprio e result so nasce no DO (cliente nao consegue forjar).
const DICE_REQUEST_TYPE = "mesa:dice:request";
const DICE_RESULT_TYPE = "mesa:dice:result";
const MAX_DICE_HISTORY = 20;
const SHEET_PATCH_TYPE = "mesa:sheet:patch";
const ECHO_VITALS_TYPE = "mesa:echo:vitals";
const SHEET_CHANGED_TYPE = "sheet:changed";
const MOVE_LOCK_TYPE = "mesa:move:lock";
const MAP_WS_CHUNK_TYPE = "mesa:map:ws:chunk";

const MASTER_ONLY_TYPES = new Set([
  "mesa:token:move",
  "mesa:token:upsert",
  "mesa:token:remove",
  "mesa:scene:clear",
  INITIATIVE_UPDATE_TYPE,
  GRID_UPDATE_TYPE
]);

const RELAY_TYPES = new Set([
  ...MASTER_ONLY_TYPES,
  SHEET_PATCH_TYPE,
  ECHO_VITALS_TYPE,
  INITIATIVE_ROLL_TYPE,
  DRAWINGS_UPDATE_TYPE,
  PING_TYPE,
  RULER_TYPE,
  "mesa:batch"
]);

// Tipos de sinalização do módulo de mapa (WebRTC + WS chunked + R2).
// Mensagens com campo "to" são entregues só ao socket daquele username.
// Mensagens sem "to" são broadcast para todos (ex: announce, clear).
const MAP_SIGNAL_TYPES = new Set([
  "mesa:map:announce",   // mestre → todos (sem "to")
  "mesa:map:have",       // jogador → mestre (com "to")
  "mesa:map:need",       // jogador → mestre (com "to")
  "mesa:map:offer",      // mestre → jogador (com "to")
  "mesa:map:answer",     // jogador → mestre (com "to")
  "mesa:map:ice",        // bidirecional (com "to")
  "mesa:map:ws:start",   // mestre → jogador (com "to")
  MAP_WS_CHUNK_TYPE,     // mestre → jogador (com "to")
  "mesa:map:ws:end",     // mestre → jogador (com "to")
  "mesa:map:set",        // mestre → todos (sem "to", fallback R2)
  "mesa:map:clear",      // mestre → todos (sem "to")
]);

// Sinais de mapa que só o mestre pode emitir. Os demais (have/need/answer/ice)
// fazem parte do fluxo jogador → mestre e continuam liberados.
const MASTER_ONLY_MAP_SIGNAL_TYPES = new Set([
  "mesa:map:announce",
  "mesa:map:offer",
  "mesa:map:ws:start",
  MAP_WS_CHUNK_TYPE,
  "mesa:map:ws:end",
  "mesa:map:set",
  "mesa:map:clear",
]);

/* ── Limites de mensagem (Etapa 41) ─────────────────────────── */

// Cap padrao por mensagem WS. Excecao: chunks de mapa (64KB binario ≈ 87KB
// em base64 + envelope JSON) tem teto proprio maior. O hard cap protege o DO
// de payloads absurdos independentemente do tipo.
const MAX_WS_MESSAGE_CHARS = 32 * 1024;
const MAX_MAP_CHUNK_MESSAGE_CHARS = 128 * 1024;
const MAX_WS_MESSAGE_CHARS_HARD = 256 * 1024;
const MAX_RELAY_DRAWINGS = 300;

/**
 * Valida o tamanho de uma mensagem WS crua ANTES do parse completo.
 * O tipo e extraido por regex barata (sem JSON.parse do payload inteiro)
 * para decidir o teto — chunk de mapa tem limite proprio.
 * Retorna { ok: true } ou { ok: false, reason }.
 */
function checkRealtimeMessageSize(rawText) {
  const text = String(rawText || "");
  if (text.length > MAX_WS_MESSAGE_CHARS_HARD) {
    return { ok: false, reason: "Mensagem excede o limite absoluto do realtime." };
  }
  if (text.length <= MAX_WS_MESSAGE_CHARS) {
    return { ok: true };
  }
  // Acima de 32KB: so chunk de mapa passa (ate 128KB)
  const isMapChunk = text.includes(`"${MAP_WS_CHUNK_TYPE}"`);
  if (isMapChunk && text.length <= MAX_MAP_CHUNK_MESSAGE_CHARS) {
    return { ok: true };
  }
  return { ok: false, reason: "Mensagem excede o limite de tamanho do realtime." };
}

/* ── Rate limit por socket (token bucket) ───────────────────── */

// Mensagens gerais: ~30 msg/s com burst de 60 (drag streams a ~10/s, transform
// a 5/s — folga real). Chunks de mapa tem bucket proprio (~120/s, burst 240):
// o mestre envia 4 chunks a cada ~15ms durante um push de mapa legitimo.
const RATE_LIMIT = {
  general: { ratePerSec: 30, burst: 60 },
  mapChunk: { ratePerSec: 120, burst: 240 }
};

function createRateBucket(now) {
  return {
    general: { tokens: RATE_LIMIT.general.burst, lastRefill: now },
    mapChunk: { tokens: RATE_LIMIT.mapChunk.burst, lastRefill: now }
  };
}

/**
 * Consome 1 token do bucket adequado ao tipo. Muta `bucket`.
 * Retorna true se a mensagem pode passar, false se estourou o limite.
 */
function takeRateToken(bucket, type, now) {
  const lane = type === MAP_WS_CHUNK_TYPE ? "mapChunk" : "general";
  const config = RATE_LIMIT[lane];
  const state = bucket[lane];

  const elapsedSec = Math.max(0, (now - state.lastRefill) / 1000);
  state.tokens = Math.min(config.burst, state.tokens + elapsedSec * config.ratePerSec);
  state.lastRefill = now;

  if (state.tokens < 1) return false;
  state.tokens -= 1;
  return true;
}

/* ── Dados na Mesa (Etapa 45) ───────────────────────────────── */

// Gramatica: "NdM", "dM" ou "NdM±K" — N 1-20, M em {2,4,6,8,10,12,20,100},
// K -99..99. Espacos e maiusculas tolerados ("2 D 20 + 3" vale).
const DICE_ALLOWED_SIDES = new Set([2, 4, 6, 8, 10, 12, 20, 100]);

function parseMesaDiceFormula(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, "");
  const match = /^(\d{0,2})d(\d{1,3})([+-]\d{1,2})?$/.exec(text);
  if (!match) return null;
  const count = match[1] === "" ? 1 : Number.parseInt(match[1], 10);
  const sides = Number.parseInt(match[2], 10);
  const modifier = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (count < 1 || count > 20) return null;
  if (!DICE_ALLOWED_SIDES.has(sides)) return null;
  const suffix = modifier === 0 ? "" : (modifier > 0 ? `+${modifier}` : String(modifier));
  return { count, sides, modifier, formula: `${count}d${sides}${suffix}` };
}

/**
 * Rola um spec de parseMesaDiceFormula. `randomInt(sides)` deve devolver um
 * inteiro uniforme em 1..sides — o DO injeta a versao crypto; os testes, uma
 * deterministica. Retorna { rolls, total }.
 */
function rollMesaDice(spec, randomInt) {
  const rolls = [];
  for (let i = 0; i < spec.count; i += 1) rolls.push(randomInt(spec.sides));
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + spec.modifier;
  return { rolls, total };
}

function normalizeDiceLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/* ── Sanitizacao de desenhos no relay ───────────────────────── */

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Sanitiza o payload de mesa:drawings:update para relay.
 * Retorna o array limpo (sem tracos "dm", cap de 300) ou null se invalido.
 */
function sanitizeRelayDrawings(drawings) {
  if (!Array.isArray(drawings)) return null;
  return drawings
    .filter(stroke => isPlainObject(stroke) && stroke.layer !== "dm")
    .slice(0, MAX_RELAY_DRAWINGS);
}

/* ── Normalizacao de patch de ficha / vitais de Echo ────────── */

const DEFAULT_INVENTORY_SLOTS = 10;
const ATTRIBUTES = ["Forca", "Agilidade", "Inteligencia", "Resistencia", "Alma"];
const SHEET_TEXT_FIELDS = new Set(["charName", "charClass", "charRace", "charFaction", "charNotes", "sheetNotes"]);
const SHEET_RESOURCE_FIELDS = new Set(["vidaAtual", "vidaMax", "integAtual", "integMax", "inventorySlots"]);
const ITEM_TYPES = new Set(["arma", "armadura", "acessorio", "outro"]);
const PLAYER_PATCH_FIELDS = new Set([
  ...SHEET_TEXT_FIELDS,
  "vidaAtual",
  "vidaMax",
  "integAtual",
  "integMax",
  ...ATTRIBUTES.map(attr => `attr${attr}`)
]);

function normalizeCharacterKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTextValue(value, maxLength = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeLongTextValue(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeTextField(field, value) {
  if (field === "charNotes") return normalizeLongTextValue(value, 1400);
  if (field === "charName") return normalizeTextValue(value, 90);
  if (field === "charClass" || field === "charRace" || field === "charFaction") {
    return normalizeTextValue(value, 70);
  }
  return normalizeTextValue(value, 160);
}

// Mesma semantica de sheet.js (normalizeResourceValue/sanitizeAttrValue):
// campo vazio permanece vazio (""), valor minimo e 0. Divergir daqui fazia o
// patch da Mesa transformar Vida/Integridade vazias em "0" e atributo 0 em 1.
function normalizeResourceValue(value, fallback = "") {
  if (value === "" || value === null || value === undefined) return String(fallback);
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return String(fallback);
  return String(Math.max(0, numeric));
}

function normalizeAttrValue(value, fallback = "") {
  if (value === "" || value === null || value === undefined) return String(fallback);
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return String(fallback);
  return String(Math.max(0, numeric));
}

function normalizeInventorySlotsValue(value, used = 0) {
  const numeric = Number.parseInt(value, 10);
  const safeValue = Number.isNaN(numeric) ? DEFAULT_INVENTORY_SLOTS : numeric;
  return String(Math.max(Math.max(DEFAULT_INVENTORY_SLOTS, used), Math.min(120, safeValue)));
}

function normalizeItemType(value) {
  const normalized = String(value || "outro").trim().toLowerCase();
  return ITEM_TYPES.has(normalized) ? normalized : "outro";
}

function normalizeDamageExpression(value) {
  return String(value || "").trim().replace(/\s+/g, "").slice(0, 24);
}

function normalizeItem(item = {}) {
  const type = normalizeItemType(item.type);
  const armor = type === "armadura" ? normalizeArmorData(item.armor) : normalizeArmorData({});
  return {
    name: normalizeTextValue(item.name, 80),
    qty: String(Math.max(0, Number.parseInt(item.qty || "1", 10) || 0)),
    desc: normalizeTextValue(item.desc, 320),
    type,
    damage: type === "arma" ? normalizeDamageExpression(item.damage) : "",
    armor
  };
}

function normalizeArmorData(armor = {}) {
  const mitigation = Math.max(0, Number.parseInt(armor.mitigation || "0", 10) || 0);
  return {
    equipped: Boolean(armor.equipped),
    mitigation: String(mitigation),
    resistances: normalizeTextValue(armor.resistances, 180),
    notes: normalizeTextValue(armor.notes, 180)
  };
}

function normalizeOwnedMemory(memory = {}) {
  return {
    name: normalizeTextValue(memory.name, 80),
    desc: normalizeTextValue(memory.desc, 420),
    source: normalizeTextValue(memory.source, 80)
  };
}

function normalizeSheetPatchPayload(payload) {
  const characterKey = normalizeCharacterKey(payload?.characterKey || payload?.key);
  const patch = {};

  SHEET_TEXT_FIELDS.forEach(field => {
    if (payload?.[field] !== undefined) {
      patch[field] = normalizeTextField(field, payload[field]);
    }
  });

  SHEET_RESOURCE_FIELDS.forEach(field => {
    if (payload?.[field] === undefined) return;
    if (field === "inventorySlots") {
      const used = Array.isArray(payload.inv) ? payload.inv.length : 0;
      patch[field] = normalizeInventorySlotsValue(payload[field], used);
      return;
    }
    patch[field] = normalizeResourceValue(payload[field], "");
  });

  ATTRIBUTES.forEach(attr => {
    const field = `attr${attr}`;
    if (payload?.[field] !== undefined) {
      patch[field] = normalizeAttrValue(payload[field], "");
    }
  });

  if (Array.isArray(payload?.inv)) {
    patch.inv = payload.inv.slice(0, 120).map(normalizeItem);
    if (patch.inventorySlots !== undefined) {
      patch.inventorySlots = normalizeInventorySlotsValue(patch.inventorySlots, patch.inv.length);
    }
  }

  if (Array.isArray(payload?.ownedMemories)) {
    patch.ownedMemories = payload.ownedMemories.slice(0, 120).map(normalizeOwnedMemory);
  }

  return { characterKey, patch };
}

function filterPlayerSheetPatch(patch) {
  const filtered = {};

  PLAYER_PATCH_FIELDS.forEach(field => {
    if (patch[field] !== undefined) filtered[field] = patch[field];
  });

  if (Array.isArray(patch.inv)) {
    filtered.inv = patch.inv.slice(0, 120).map(normalizeItem);
  }

  return filtered;
}

function normalizeEchoVitals(vitals) {
  const source = isPlainObject(vitals) ? vitals : {};
  const result = {};
  ["vidaAtual", "integAtual"].forEach(field => {
    if (source[field] === undefined) return;
    const numeric = Number.parseInt(source[field], 10);
    if (Number.isNaN(numeric)) return;
    result[field] = Math.max(0, numeric);
  });
  return result;
}

export {
  ATTRIBUTES,
  DICE_REQUEST_TYPE,
  DICE_RESULT_TYPE,
  DRAWINGS_UPDATE_TYPE,
  ECHO_VITALS_TYPE,
  GRID_UPDATE_TYPE,
  INITIATIVE_ROLL_TYPE,
  INITIATIVE_UPDATE_TYPE,
  MAP_SIGNAL_TYPES,
  MAP_WS_CHUNK_TYPE,
  MASTER_ONLY_MAP_SIGNAL_TYPES,
  MASTER_ONLY_TYPES,
  MAX_DICE_HISTORY,
  MAX_MAP_CHUNK_MESSAGE_CHARS,
  MAX_RELAY_DRAWINGS,
  MAX_WS_MESSAGE_CHARS,
  MAX_WS_MESSAGE_CHARS_HARD,
  MOVE_LOCK_TYPE,
  PING_TYPE,
  RATE_LIMIT,
  RULER_TYPE,
  RELAY_TYPES,
  SHEET_CHANGED_TYPE,
  SHEET_PATCH_TYPE,
  checkRealtimeMessageSize,
  createRateBucket,
  filterPlayerSheetPatch,
  isPlainObject,
  normalizeCharacterKey,
  normalizeDiceLabel,
  normalizeEchoVitals,
  normalizeSheetPatchPayload,
  parseMesaDiceFormula,
  rollMesaDice,
  sanitizeRelayDrawings,
  takeRateToken
};
