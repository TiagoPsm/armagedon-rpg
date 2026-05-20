import { DurableObject } from "cloudflare:workers";

const ROOM_NAME = "default";
const MASTER_ONLY_TYPES = new Set([
  "mesa:token:move",
  "mesa:token:upsert",
  "mesa:token:remove",
  "mesa:scene:clear"
]);
const SHEET_PATCH_TYPE = "mesa:sheet:patch";
const SHEET_CHANGED_TYPE = "sheet:changed";
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
const RELAY_TYPES = new Set([
  ...MASTER_ONLY_TYPES,
  SHEET_PATCH_TYPE,
  "mesa:batch"
]);

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

function readAttachment(ws) {
  try {
    return ws.deserializeAttachment?.() || null;
  } catch {
    return null;
  }
}

function sendJson(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {}
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeSocketUser(request) {
  return {
    username: String(request.headers.get("x-armagedon-username") || "usuario").trim() || "usuario",
    role: String(request.headers.get("x-armagedon-role") || "player").trim() || "player"
  };
}

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

function normalizeResourceValue(value, fallback = "0") {
  if (value === "" || value === null || value === undefined) return String(fallback);
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return String(fallback);
  return String(Math.max(0, numeric));
}

function normalizeAttrValue(value, fallback = "1") {
  if (value === "" || value === null || value === undefined) return String(fallback);
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return String(fallback);
  return String(Math.max(1, numeric));
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
    patch[field] = normalizeResourceValue(payload[field], "0");
  });

  ATTRIBUTES.forEach(attr => {
    const field = `attr${attr}`;
    if (payload?.[field] !== undefined) {
      patch[field] = normalizeAttrValue(payload[field], "1");
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

class MesaRealtimeRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/broadcast") {
      const payload = await request.json().catch(() => ({}));
      if (payload?.type === SHEET_CHANGED_TYPE || payload?.type === SHEET_PATCH_TYPE) {
        this.broadcastToCharacterAudience(payload, payload.characterKey || payload.key);
        return json({ ok: true, room: ROOM_NAME, online: this.getPresence() });
      }
      this.broadcast(payload);
      return json({ ok: true, room: ROOM_NAME, online: this.getPresence() });
    }

    if (request.method === "GET" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.acceptClient(request);
    }

    return json({ error: "Rota realtime invalida." }, { status: 404 });
  }

  acceptClient(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const user = normalizeSocketUser(request);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      ...user,
      joinedAt: Date.now()
    });

    sendJson(server, {
      type: "mesa:ready",
      room: ROOM_NAME,
      user,
      online: this.getPresence(),
      sentAt: new Date().toISOString()
    });

    this.broadcastPresence(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(ws, message) {
    let payload = null;
    try {
      payload = JSON.parse(String(message || "{}"));
    } catch {
      payload = null;
    }

    if (payload?.type === "ping") {
      sendJson(ws, {
        type: "pong",
        sentAt: new Date().toISOString()
      });
      return;
    }

    if (payload?.type === "mesa:presence:request") {
      sendJson(ws, {
        type: "mesa:presence",
        online: this.getPresence(),
        sentAt: new Date().toISOString()
      });
      return;
    }

    if (RELAY_TYPES.has(String(payload?.type || ""))) {
      this.handleRealtimeRelay(ws, payload);
    }
  }

  handleRealtimeRelay(ws, payload) {
    const attachment = readAttachment(ws) || {};
    const type = String(payload?.type || "");
    if (type === SHEET_PATCH_TYPE) {
      this.handleSheetPatchRelay(ws, payload, attachment);
      return;
    }

    const messages = type === "mesa:batch" && Array.isArray(payload.messages)
      ? payload.messages.filter(message => isPlainObject(message) && MASTER_ONLY_TYPES.has(String(message.type || "")))
      : [];
    const isMasterPayload = MASTER_ONLY_TYPES.has(type) || messages.length > 0;

    if (isMasterPayload && attachment.role !== "master") {
      sendJson(ws, {
        type: "mesa:scene:ack",
        ok: false,
        reason: "Apenas o mestre pode alterar a cena em tempo real.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
    }

    const actor = {
      username: attachment.username || "usuario",
      role: attachment.role || "player"
    };
    const relayPayload = type === "mesa:batch"
      ? {
          ...payload,
          messages: messages.map(message => ({
            ...message,
            actor: message.actor || actor,
            sentAt: message.sentAt || new Date().toISOString()
          }))
        }
      : {
          ...payload,
          actor,
          sentAt: payload?.sentAt || new Date().toISOString()
        };

    this.broadcast(relayPayload, ws);
    sendJson(ws, {
      type: "mesa:scene:ack",
      ok: true,
      relayedType: type,
      messageId: payload?.messageId || "",
      sceneVersion: payload?.sceneVersion || 0,
      sentAt: new Date().toISOString()
    });
  }

  handleSheetPatchRelay(ws, payload, attachment) {
    const { characterKey, patch } = normalizeSheetPatchPayload(payload);
    const actor = {
      username: attachment.username || "usuario",
      role: attachment.role || "player"
    };
    const safePatch = actor.role === "master" ? patch : filterPlayerSheetPatch(patch);

    if (!characterKey || !Object.keys(safePatch).length) {
      sendJson(ws, {
        type: "mesa:sheet:ack",
        ok: false,
        reason: "Patch de ficha invalido.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
    }

    if (actor.role !== "master" && normalizeCharacterKey(actor.username) !== characterKey) {
      sendJson(ws, {
        type: "mesa:sheet:ack",
        ok: false,
        reason: "Jogador so pode alterar a propria ficha.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
    }

    const relayPayload = {
      type: SHEET_PATCH_TYPE,
      clientId: payload?.clientId || "",
      messageId: payload?.messageId || "",
      ...safePatch,
      key: characterKey,
      characterKey,
      actor,
      sentAt: payload?.sentAt || new Date().toISOString()
    };
    this.broadcastToCharacterAudience(relayPayload, characterKey, ws);
    sendJson(ws, {
      type: "mesa:sheet:ack",
      ok: true,
      messageId: payload?.messageId || "",
      characterKey,
      sentAt: new Date().toISOString()
    });
  }

  async webSocketClose() {
    this.broadcastPresence();
  }

  async webSocketError() {
    this.broadcastPresence();
  }

  broadcast(payload, excludeSocket = null) {
    const message = {
      ...payload,
      online: this.getPresence(),
      sentAt: payload?.sentAt || new Date().toISOString()
    };

    this.ctx.getWebSockets().forEach(ws => {
      if (excludeSocket && ws === excludeSocket) return;
      sendJson(ws, message);
    });
  }

  broadcastToCharacterAudience(payload, characterKey, excludeSocket = null) {
    const key = normalizeCharacterKey(characterKey);
    if (!key) return;
    const message = {
      ...payload,
      key,
      characterKey: key,
      online: this.getPresence(),
      sentAt: payload?.sentAt || new Date().toISOString()
    };

    this.ctx.getWebSockets().forEach(ws => {
      if (excludeSocket && ws === excludeSocket) return;
      const attachment = readAttachment(ws) || {};
      const username = normalizeCharacterKey(attachment.username);
      const role = String(attachment.role || "player").trim() || "player";
      if (role !== "master" && username !== key) return;
      sendJson(ws, message);
    });
  }

  broadcastPresence(excludeSocket = null) {
    this.broadcast({
      type: "mesa:presence",
      online: this.getPresence()
    }, excludeSocket);
  }

  getPresence() {
    const sockets = this.ctx.getWebSockets();
    const usersByName = new Map();

    sockets.forEach(ws => {
      const attachment = readAttachment(ws) || {};
      const username = String(attachment.username || "usuario").trim() || "usuario";
      const role = String(attachment.role || "player").trim() || "player";
      const current = usersByName.get(username) || {
        username,
        role,
        connections: 0
      };
      current.connections += 1;
      usersByName.set(username, current);
    });

    return {
      connections: sockets.length,
      users: [...usersByName.values()]
    };
  }
}

export { MesaRealtimeRoom };
