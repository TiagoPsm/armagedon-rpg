import { DurableObject } from "cloudflare:workers";
// Regras puras (tipos permitidos, limites, sanitizacao, normalizacao) vivem
// em mesa-realtime-rules.js — modulo sem dependencia de "cloudflare:workers",
// entao os testes unitarios (tests/mesa-audit.spec.cjs) exercitam exatamente
// o codigo usado aqui.
import {
  DICE_REQUEST_TYPE,
  DICE_RESULT_TYPE,
  DRAWINGS_ADD_TYPE,
  DRAWINGS_REMOVE_TYPE,
  DRAWINGS_UPDATE_TYPE,
  ECHO_VITALS_TYPE,
  INITIATIVE_ROLL_TYPE,
  MAP_SIGNAL_TYPES,
  MASTER_ONLY_MAP_SIGNAL_TYPES,
  MASTER_ONLY_TYPES,
  MAX_DICE_HISTORY,
  MOVE_LOCK_TYPE,
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
  sanitizeRelayDrawingIds,
  sanitizeRelayDrawingStroke,
  sanitizeRelayDrawings,
  takeRateToken
} from "./mesa-realtime-rules.js";

const ROOM_NAME = "default";
// Trava global de movimento: quando ativa, jogadores nao movem nem o proprio
// token. Persistida no storage do DO; mestre alterna via mesa:move:lock.
const MOVE_LOCK_STORAGE_KEY = "playersMoveLocked";
// Historico das ultimas rolagens de dados da Mesa (cap MAX_DICE_HISTORY),
// mais recente primeiro. Entregue a cada cliente no mesa:ready.
const DICE_HISTORY_STORAGE_KEY = "diceHistory";

// Inteiro uniforme em 1..sides com crypto.getRandomValues (rejection sampling
// para nao enviesar o modulo). Fonte unica de aleatoriedade das rolagens.
function secureRandomInt(sides) {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return (value % sides) + 1;
}

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


function normalizeSocketUser(request) {
  return {
    username: String(request.headers.get("x-armagedon-username") || "usuario").trim() || "usuario",
    role: String(request.headers.get("x-armagedon-role") || "player").trim() || "player"
  };
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
      if (payload?.type === "soul:awarded" || payload?.type === "soul:nightmare") {
        this.broadcastToMasters(payload);
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

  async isPlayersMoveLocked() {
    return Boolean(await this.ctx.storage.get(MOVE_LOCK_STORAGE_KEY));
  }

  async acceptClient(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const user = normalizeSocketUser(request);
    const playersMoveLocked = await this.isPlayersMoveLocked();
    const diceHistory = (await this.ctx.storage.get(DICE_HISTORY_STORAGE_KEY)) || [];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      ...user,
      joinedAt: Date.now()
    });

    sendJson(server, {
      type: "mesa:ready",
      room: ROOM_NAME,
      user,
      playersMoveLocked,
      diceHistory,
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
    const rawText = typeof message === "string" ? message : "";

    // Cap de tamanho (Etapa 41): 32KB por mensagem; chunk de mapa tem teto
    // proprio (128KB); nada passa de 256KB. Verificado ANTES do parse.
    const sizeCheck = checkRealtimeMessageSize(rawText);
    if (!sizeCheck.ok) {
      sendJson(ws, {
        type: "mesa:scene:ack",
        ok: false,
        reason: sizeCheck.reason,
        sentAt: new Date().toISOString()
      });
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(rawText || "{}");
    } catch {
      payload = null;
    }

    // Rate limit por socket (token bucket em memoria): ~30 msg/s gerais com
    // burst de 60; chunks de mapa tem bucket proprio (~120/s). O estado vive
    // so nesta instancia do DO — reiniciar/hibernar zera os buckets, o que e
    // aceitavel para protecao de abuso.
    if (!this.rateBuckets) this.rateBuckets = new Map();
    let bucket = this.rateBuckets.get(ws);
    if (!bucket) {
      bucket = createRateBucket(Date.now());
      this.rateBuckets.set(ws, bucket);
    }
    const messageType = String(payload?.type || "");
    if (messageType !== "ping" && !takeRateToken(bucket, messageType, Date.now())) {
      sendJson(ws, {
        type: "mesa:scene:ack",
        ok: false,
        reason: "Limite de mensagens por segundo excedido.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
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

    if (String(payload?.type || "") === MOVE_LOCK_TYPE) {
      await this.handleMoveLockToggle(ws, payload);
      return;
    }

    if (String(payload?.type || "") === DICE_REQUEST_TYPE) {
      await this.handleDiceRequest(ws, payload);
      return;
    }

    if (RELAY_TYPES.has(String(payload?.type || ""))) {
      await this.handleRealtimeRelay(ws, payload);
      return;
    }

    if (MAP_SIGNAL_TYPES.has(String(payload?.type || ""))) {
      this.handleMapSignal(ws, payload);
    }
  }

  async handleMoveLockToggle(ws, payload) {
    const attachment = readAttachment(ws) || {};
    if (attachment.role !== "master") {
      sendJson(ws, {
        type: "mesa:scene:ack",
        ok: false,
        reason: "Apenas o mestre pode travar ou liberar o movimento.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
    }

    const locked = Boolean(payload?.locked);
    await this.ctx.storage.put(MOVE_LOCK_STORAGE_KEY, locked);

    this.broadcast({
      type: MOVE_LOCK_TYPE,
      locked,
      actor: {
        username: attachment.username || "usuario",
        role: "master"
      },
      sentAt: new Date().toISOString()
    });
  }

  /**
   * Dados na Mesa (Etapa 45): o DO rola — o cliente so pede. A formula e
   * validada (parseMesaDiceFormula), a rolagem usa crypto.getRandomValues e o
   * resultado e transmitido a TODOS (inclusive quem pediu: fonte unica da
   * verdade). mesa:dice:result nao esta em RELAY_TYPES, entao um cliente
   * malicioso nao consegue forjar resultado. Historico (cap 20) no storage,
   * entregue no mesa:ready para quem entra depois.
   */
  async handleDiceRequest(ws, payload) {
    const attachment = readAttachment(ws) || {};
    const spec = parseMesaDiceFormula(payload?.formula);
    if (!spec) {
      sendJson(ws, {
        type: "mesa:dice:ack",
        ok: false,
        reason: "Formula de dados invalida. Use NdM (+/- mod), ex: 2d20+3.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
    }

    const { rolls, total } = rollMesaDice(spec, secureRandomInt);
    const entry = {
      id: crypto.randomUUID(),
      formula: spec.formula,
      label: normalizeDiceLabel(payload?.label),
      rolls,
      modifier: spec.modifier,
      total,
      actor: {
        username: attachment.username || "usuario",
        role: attachment.role || "player"
      },
      sentAt: new Date().toISOString()
    };

    const history = (await this.ctx.storage.get(DICE_HISTORY_STORAGE_KEY)) || [];
    history.unshift(entry);
    await this.ctx.storage.put(DICE_HISTORY_STORAGE_KEY, history.slice(0, MAX_DICE_HISTORY));

    this.broadcast({ type: DICE_RESULT_TYPE, ...entry });
  }

  // Jogador pode emitir mesa:token:move quando a trava global esta aberta e o
  // movimento declara o proprio characterKey. A validacao de posse do token em
  // si acontece nos clientes (que conhecem o dono de cada token) ao aplicar o
  // delta — aqui filtramos o que da para filtrar sem estado da cena.
  async canPlayerRelayTokenMove(payload, attachment) {
    if (await this.isPlayersMoveLocked()) return false;
    const declaredKey = normalizeCharacterKey(payload?.characterKey);
    const username = normalizeCharacterKey(attachment.username);
    return Boolean(declaredKey && username && declaredKey === username);
  }

  // Jogador pode invocar/retirar o PROPRIO Echo (mesa:token:upsert/remove) com
  // o token "echo:<id>", declarando ownerKey == proprio username. Espelha o
  // canal mesa:echo:vitals: o DO confirma a identidade do ator; a posse do Echo
  // especifico e garantida nos clientes (o roster do jogador so traz os proprios
  // Echos) e na API (dados autoritativos). O mestre persiste a cena ao receber.
  canPlayerRelayEchoToken(payload, attachment) {
    const username = normalizeCharacterKey(attachment.username);
    const ownerKey = normalizeCharacterKey(payload?.ownerKey);
    if (!username || !ownerKey || username !== ownerKey) return false;

    const type = String(payload?.type || "");
    if (type === "mesa:token:upsert") {
      const token = isPlainObject(payload?.token) ? payload.token : null;
      if (!token || String(token.type || "") !== "echo") return false;
      return normalizeCharacterKey(token.characterKey || token.id).startsWith("echo:");
    }
    if (type === "mesa:token:remove") {
      return normalizeCharacterKey(payload?.tokenId).startsWith("echo:");
    }
    return false;
  }

  async handleRealtimeRelay(ws, payload) {
    const attachment = readAttachment(ws) || {};
    const type = String(payload?.type || "");
    if (type === SHEET_PATCH_TYPE) {
      this.handleSheetPatchRelay(ws, payload, attachment);
      return;
    }

    if (type === ECHO_VITALS_TYPE) {
      this.handleEchoVitalsRelay(ws, payload, attachment);
      return;
    }

    // Desenhos: payload precisa ser o estado completo (array). Traços "dm"
    // são removidos no relay — nunca deveriam sair do cliente do mestre, e um
    // jogador malicioso não pode injetá-los na tela dos outros.
    if (type === DRAWINGS_UPDATE_TYPE) {
      const sanitized = sanitizeRelayDrawings(payload?.drawings);
      if (!sanitized) {
        sendJson(ws, {
          type: "mesa:scene:ack",
          ok: false,
          reason: "Payload de desenhos invalido.",
          messageId: payload?.messageId || "",
          sentAt: new Date().toISOString()
        });
        return;
      }
      payload = { ...payload, drawings: sanitized };
    }

    // Delta de desenho (Etapa 50): UM traco recem-fechado. Mesma regra da
    // camada secreta — traco "dm" nunca e retransmitido.
    if (type === DRAWINGS_ADD_TYPE) {
      const stroke = sanitizeRelayDrawingStroke(payload?.stroke);
      if (!stroke) {
        sendJson(ws, {
          type: "mesa:scene:ack",
          ok: false,
          reason: "Traco de desenho invalido.",
          messageId: payload?.messageId || "",
          sentAt: new Date().toISOString()
        });
        return;
      }
      payload = { ...payload, stroke };
    }

    // Remocao por id (borracha/desfazer): lista enxuta em vez do estado inteiro.
    if (type === DRAWINGS_REMOVE_TYPE) {
      const ids = sanitizeRelayDrawingIds(payload?.ids);
      if (!ids) {
        sendJson(ws, {
          type: "mesa:scene:ack",
          ok: false,
          reason: "Lista de tracos a remover invalida.",
          messageId: payload?.messageId || "",
          sentAt: new Date().toISOString()
        });
        return;
      }
      payload = { ...payload, ids };
    }

    // Rolagem de iniciativa: jogador so pode rolar pelo proprio personagem
    // (mesmo padrao do mesa:sheet:patch — a identidade vem do socket
    // autenticado, nao do payload). Mestre pode rolar por qualquer entrada.
    if (type === INITIATIVE_ROLL_TYPE && attachment.role !== "master") {
      const declaredKey = normalizeCharacterKey(payload?.characterKey);
      const username = normalizeCharacterKey(attachment.username);
      if (!declaredKey || !username || declaredKey !== username) {
        sendJson(ws, {
          type: "mesa:scene:ack",
          ok: false,
          reason: "Rolagem de iniciativa so vale para o proprio personagem.",
          messageId: payload?.messageId || "",
          sentAt: new Date().toISOString()
        });
        return;
      }
    }

    const messages = type === "mesa:batch" && Array.isArray(payload.messages)
      ? payload.messages.filter(message => isPlainObject(message) && MASTER_ONLY_TYPES.has(String(message.type || "")))
      : [];
    const isMasterPayload = MASTER_ONLY_TYPES.has(type) || messages.length > 0;

    if (isMasterPayload && attachment.role !== "master") {
      const allowedPlayerMove =
        type === "mesa:token:move" && (await this.canPlayerRelayTokenMove(payload, attachment));
      const allowedPlayerEcho =
        (type === "mesa:token:upsert" || type === "mesa:token:remove")
        && this.canPlayerRelayEchoToken(payload, attachment);

      if (!allowedPlayerMove && !allowedPlayerEcho) {
        sendJson(ws, {
          type: "mesa:scene:ack",
          ok: false,
          reason: "Apenas o mestre pode alterar a cena em tempo real.",
          messageId: payload?.messageId || "",
          sentAt: new Date().toISOString()
        });
        return;
      }
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

  /**
   * Retransmite mensagens do módulo de mapa.
   *
   * Se payload.to estiver preenchido: entrega somente ao socket cujo
   * username coincide com payload.to (sinalização WebRTC 1:1).
   *
   * Se não houver payload.to: broadcast para todos exceto o remetente
   * (ex: announce, clear, R2 URL).
   *
   * O campo "from" é sobrescrito com o username autenticado do remetente
   * para evitar falsificação de identidade.
   */
  handleMapSignal(ws, payload) {
    const attachment = readAttachment(ws) || {};
    const senderUsername = String(attachment.username || "usuario").trim() || "usuario";
    const targetUsername  = String(payload?.to || "").trim();
    const signalType = String(payload?.type || "");

    if (MASTER_ONLY_MAP_SIGNAL_TYPES.has(signalType) && attachment.role !== "master") {
      sendJson(ws, {
        type:   "mesa:map:relay:ack",
        for:    signalType,
        ok:     false,
        reason: "Apenas o mestre pode enviar este sinal de mapa.",
        sentAt: new Date().toISOString(),
      });
      return;
    }

    const enriched = {
      ...payload,
      from:     senderUsername,
      fromRole: String(attachment.role || "player").trim() || "player",
      sentAt:   payload?.sentAt || new Date().toISOString(),
    };

    if (targetUsername) {
      // Entrega direcionada: apenas o socket do destinatário recebe
      let delivered = false;
      this.ctx.getWebSockets().forEach(sock => {
        if (sock === ws) return; // não enviar de volta ao remetente
        const att = readAttachment(sock) || {};
        if (String(att.username || "").trim() === targetUsername) {
          sendJson(sock, enriched);
          delivered = true;
        }
      });
      // Confirmar entrega ao remetente (útil para debug/timeout)
      sendJson(ws, {
        type:      "mesa:map:relay:ack",
        for:       payload?.type,
        to:        targetUsername,
        delivered,
        sentAt:    new Date().toISOString(),
      });
    } else {
      // Broadcast: todos os outros sockets (ex: announce, clear)
      this.ctx.getWebSockets().forEach(sock => {
        if (sock === ws) return;
        sendJson(sock, enriched);
      });
    }
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

  // Vida/Integridade atuais de um token de Echo. characterKey e "echo:<id>";
  // ownerKey e a ficha dona (== username do jogador dono). Mestre sempre pode;
  // jogador so pode mexer no Echo proprio. A persistencia (autoritativa) ja foi
  // validada pela API; aqui apenas retransmitimos para o mestre e o dono.
  handleEchoVitalsRelay(ws, payload, attachment) {
    const actor = {
      username: attachment.username || "usuario",
      role: attachment.role || "player"
    };
    const characterKey = normalizeCharacterKey(payload?.characterKey || payload?.key);
    const ownerKey = normalizeCharacterKey(payload?.ownerKey);
    const vitals = normalizeEchoVitals(payload?.vitals);

    if (!characterKey || !ownerKey || !Object.keys(vitals).length) {
      sendJson(ws, {
        type: "mesa:echo:ack",
        ok: false,
        reason: "Vitais de Echo invalidos.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
    }

    if (actor.role !== "master" && normalizeCharacterKey(actor.username) !== ownerKey) {
      sendJson(ws, {
        type: "mesa:echo:ack",
        ok: false,
        reason: "Jogador so pode alterar o proprio Echo.",
        messageId: payload?.messageId || "",
        sentAt: new Date().toISOString()
      });
      return;
    }

    const relayPayload = {
      type: ECHO_VITALS_TYPE,
      clientId: payload?.clientId || "",
      messageId: payload?.messageId || "",
      characterKey,
      key: characterKey,
      ownerKey,
      vitals,
      actor,
      online: this.getPresence(),
      sentAt: payload?.sentAt || new Date().toISOString()
    };

    // Entrega ao mestre e ao dono, preservando characterKey "echo:<id>"
    // (broadcastToCharacterAudience sobrescreveria characterKey pela chave de audiencia).
    this.ctx.getWebSockets().forEach(sock => {
      if (sock === ws) return;
      const att = readAttachment(sock) || {};
      const username = normalizeCharacterKey(att.username);
      const role = String(att.role || "player").trim() || "player";
      if (role !== "master" && username !== ownerKey) return;
      sendJson(sock, relayPayload);
    });

    sendJson(ws, {
      type: "mesa:echo:ack",
      ok: true,
      messageId: payload?.messageId || "",
      characterKey,
      sentAt: new Date().toISOString()
    });
  }

  async webSocketClose(ws) {
    this.rateBuckets?.delete(ws);
    this.broadcastPresence();
  }

  async webSocketError(ws) {
    this.rateBuckets?.delete(ws);
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

  broadcastToMasters(payload) {
    const message = {
      ...payload,
      sentAt: payload?.sentAt || new Date().toISOString()
    };

    this.ctx.getWebSockets().forEach(ws => {
      const attachment = readAttachment(ws) || {};
      if (String(attachment.role || "player") !== "master") return;
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
