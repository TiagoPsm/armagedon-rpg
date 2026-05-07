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

function normalizeSheetPatchPayload(payload) {
  const characterKey = normalizeCharacterKey(payload?.characterKey || payload?.key);
  const patch = {};
  if (payload?.vidaAtual !== undefined) {
    patch.vidaAtual = String(Math.max(0, Number.parseInt(payload.vidaAtual, 10) || 0));
  }
  if (payload?.integAtual !== undefined) {
    patch.integAtual = String(Math.max(0, Number.parseInt(payload.integAtual, 10) || 0));
  }
  return { characterKey, patch };
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

    if (!characterKey || !Object.keys(patch).length) {
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
      ...patch,
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
