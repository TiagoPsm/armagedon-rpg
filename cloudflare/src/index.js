import {
  createCorsHeaders,
  createPasswordHash,
  ensureMasterUser,
  getUserByUsername,
  isLegacyPasswordHash,
  json,
  readJson,
  requireAuth,
  signToken,
  verifyPassword
} from "./auth.js";
import {
  assertCharacterAccess,
  awardSoulExperienceToCharacter,
  awardMonsterMemoryDrop,
  buildCharacterKey,
  completeSoulNightmareForCharacter,
  createMonsterCharacter,
  createNpcCharacter,
  createPlayerCharacter,
  deleteCharacterByKey,
  deletePlayerByUsername,
  getCharacterBundleByKey,
  getCharacterByKey,
  listDirectory,
  normalizeUsername,
  rollMonsterMemoryDrop,
  saveCharacterBundle,
  transferItemBetweenCharacters,
  transferItemBetweenPlayers,
  transferMemoryBetweenPlayers
} from "./characters.js";
import { getMesaScene, saveMesaScene } from "./mesa.js";
import { MesaRealtimeRoom } from "./mesa-realtime.js";

export { MesaRealtimeRoom };

function getMesaRealtimeStub(env) {
  if (!env.MESA_REALTIME?.getByName) return null;
  return env.MESA_REALTIME.getByName("default");
}

async function handleMesaRealtime(request, env, origin) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return errorJson("WebSocket obrigatorio para realtime da Mesa.", 426, origin);
  }

  const session = await requireAuth(request, env);
  const stub = getMesaRealtimeStub(env);
  if (!stub) {
    return errorJson("Realtime da Mesa indisponivel.", 503, origin);
  }

  const headers = new Headers(request.headers);
  headers.set("x-armagedon-username", session.username || "usuario");
  headers.set("x-armagedon-role", session.role || "player");

  const realtimeUrl = new URL(request.url);
  realtimeUrl.pathname = "/api/mesa/realtime";
  return stub.fetch(new Request(realtimeUrl, { method: "GET", headers }));
}

async function broadcastMesaScene(env, scene, actor) {
  const stub = getMesaRealtimeStub(env);
  if (!stub) return;

  try {
    await stub.fetch("https://mesa-realtime.local/broadcast", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        type: "mesa:scene",
        scene,
        actor: {
          id: actor.sub,
          username: actor.username,
          role: actor.role
        },
        sentAt: new Date().toISOString()
      })
    });
  } catch (error) {
    console.warn("Falha ao transmitir cena da Mesa.", error);
  }
}

async function broadcastSheetChanged(env, characterKey, actor) {
  const stub = getMesaRealtimeStub(env);
  const key = String(characterKey || "").trim().toLowerCase();
  if (!stub || !key) return;

  try {
    await stub.fetch("https://mesa-realtime.local/broadcast", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        type: "sheet:changed",
        key,
        characterKey: key,
        actor: {
          id: actor.sub,
          username: actor.username,
          role: actor.role
        },
        sentAt: new Date().toISOString()
      })
    });
  } catch (error) {
    console.warn("Falha ao transmitir alteracao de ficha.", error);
  }
}

// Avisa o mestre (somente sockets master, via DO) sobre progressao da alma
// feita por um jogador. type: "soul:awarded" | "soul:nightmare".
async function broadcastSoulEvent(env, type, summary, actor) {
  const stub = getMesaRealtimeStub(env);
  if (!stub) return;

  try {
    await stub.fetch("https://mesa-realtime.local/broadcast", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        type,
        targetKey: summary?.targetKey || "",
        targetName: summary?.targetName || "",
        totalExperience: summary?.totalExperience ?? summary?.appliedExperience ?? 0,
        rankName: summary?.rankName || "",
        actor: {
          id: actor.sub,
          username: actor.username,
          role: actor.role
        },
        sentAt: new Date().toISOString()
      })
    });
  } catch (error) {
    console.warn("Falha ao transmitir evento de alma.", error);
  }
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  const corsHeaders = createCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function errorJson(message, status = 400, origin = "*") {
  return withCors(json({ error: message }, { status }), origin);
}

/* ── THROTTLE DE LOGIN ─────────────────────────────────────────────
   Chave: username|ip. Apos LOGIN_MAX_FAILS falhas o par fica bloqueado
   por LOGIN_LOCK_MINUTES. Sucesso limpa o contador. */

const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_MINUTES = 10;

function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") || "ip-desconhecido";
}

async function getLoginLockMinutes(env, key) {
  const row = await env.DB.prepare(
    "select locked_until from login_throttle where key = ? limit 1"
  ).bind(key).first();

  if (!row?.locked_until) return 0;
  const remainingMs = Date.parse(row.locked_until) - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / 60000));
}

async function registerLoginFailure(env, key) {
  const now = new Date();
  const row = await env.DB.prepare(
    "select fail_count from login_throttle where key = ? limit 1"
  ).bind(key).first();

  const failCount = (Number(row?.fail_count) || 0) + 1;
  const shouldLock = failCount >= LOGIN_MAX_FAILS;
  const lockedUntil = shouldLock
    ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60000).toISOString()
    : null;

  await env.DB.prepare(
    `
      insert into login_throttle (key, fail_count, locked_until, updated_at)
      values (?, ?, ?, ?)
      on conflict(key) do update set
        fail_count = excluded.fail_count,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    `
  )
    .bind(key, shouldLock ? 0 : failCount, lockedUntil, now.toISOString())
    .run();
}

async function clearLoginThrottle(env, key) {
  await env.DB.prepare("delete from login_throttle where key = ?").bind(key).run();
}

function decodePathParam(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function normalizeRuleTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const seen = new Set();
  return rawTags
    .map(tag => String(tag || "").trim())
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function serializeRuleTags(body = {}) {
  return normalizeRuleTags(body.tags || body.tag).join(", ");
}

async function listRules(env) {
  const { results } = await env.DB.prepare(
    `
      select
        r.id,
        r.title,
        r.tag,
        r.content,
        r.created_at as createdAt,
        r.updated_at as updatedAt,
        creator.username as createdBy,
        updater.username as updatedBy
      from rules_posts r
      left join users creator on creator.id = r.created_by_user_id
      left join users updater on updater.id = r.updated_by_user_id
      order by r.updated_at desc
    `
  ).all();

  return (results || []).map(rule => ({
    ...rule,
    tags: normalizeRuleTags(rule.tag)
  }));
}

async function listSuggestions(env) {
  const { results } = await env.DB.prepare(
    `
      select
        s.id,
        s.title,
        s.category,
        s.description,
        s.created_at as createdAt,
        s.updated_at as updatedAt,
        creator.username as author,
        updater.username as updatedBy
      from suggestions s
      left join users creator on creator.id = s.created_by_user_id
      left join users updater on updater.id = s.updated_by_user_id
      order by s.updated_at desc
    `
  ).all();

  return results || [];
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(origin)
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/api/health" && request.method === "GET") {
        return withCors(json({ ok: true, service: "armagedon-cloudflare" }), origin);
      }

      if (path === "/api/mesa/realtime" && request.method === "GET") {
        return await handleMesaRealtime(request, env, origin);
      }

      if (path === "/api/auth/login" && request.method === "POST") {
        // Bootstrap do mestre roda apenas aqui (rota fria) em vez de em toda
        // requisicao — evita um UPDATE no D1 por request.
        await ensureMasterUser(env);

        const body = await readJson(request);
        const pepper = String(env.PASSWORD_PEPPER || "");
        const password = String(body.password || "");
        const normalizedUsername = String(body.username || "").trim().toLowerCase();
        const throttleKey = `${normalizedUsername}|${getClientIp(request)}`;

        const lockedMinutes = await getLoginLockMinutes(env, throttleKey);
        if (lockedMinutes > 0) {
          return errorJson(
            `Muitas tentativas de login. Tente novamente em ${lockedMinutes} min.`,
            429,
            origin
          );
        }

        const user = await getUserByUsername(env, normalizedUsername);
        const validCredentials =
          Boolean(user && user.is_active) &&
          (await verifyPassword(password, pepper, user.password_hash));

        if (!validCredentials) {
          await registerLoginFailure(env, throttleKey);
          return errorJson("Usuário ou senha inválidos.", 401, origin);
        }

        await clearLoginThrottle(env, throttleKey);

        // Migracao transparente: hash legado (sha256 sem salt) vira PBKDF2
        // no primeiro login valido.
        if (isLegacyPasswordHash(user.password_hash)) {
          const upgradedHash = await createPasswordHash(password, pepper);
          await env.DB.prepare(
            "update users set password_hash = ?, updated_at = ? where id = ?"
          )
            .bind(upgradedHash, new Date().toISOString(), user.id)
            .run();
        }

        const now = Math.floor(Date.now() / 1000);
        const token = await signToken(
          {
            sub: user.id,
            username: user.username,
            role: user.role,
            iat: now,
            exp: now + 60 * 60 * 24 * 7
          },
          env.JWT_SECRET
        );

        return withCors(
          json({
            token,
            user: {
              id: user.id,
              username: user.username,
              role: user.role
            },
            defaultSheetKey: user.role === "player" ? user.username : null
          }),
          origin
        );
      }

      if (path === "/api/auth/session" && request.method === "GET") {
        const session = await requireAuth(request, env);
        return withCors(
          json({
            user: {
              id: session.sub,
              username: session.username,
              role: session.role
            },
            defaultSheetKey: session.role === "player" ? session.username : null
          }),
          origin
        );
      }

      if (path === "/api/directory" && request.method === "GET") {
        const session = await requireAuth(request, env);
        return withCors(json(await listDirectory(env, session)), origin);
      }

      if (path === "/api/directory/players" && request.method === "POST") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode criar jogadores.", 403, origin);

        const body = await readJson(request);
        const username = normalizeUsername(body.username);
        const password = String(body.password || "");
        const charName = String(body.charname || body.charName || "").trim() || username;

        if (!username || !password) {
          return errorJson("Usuário e senha são obrigatórios.", 400, origin);
        }

        const existingUser = await getUserByUsername(env, username);
        if (existingUser) {
          return errorJson("Já existe um jogador com esse usuário.", 409, origin);
        }

        const now = new Date().toISOString();
        const userId = crypto.randomUUID();
        const passwordHash = await createPasswordHash(password, String(env.PASSWORD_PEPPER || ""));

        await env.DB.prepare(
          `
            insert into users (id, username, password_hash, role, is_active, created_at, updated_at)
            values (?, ?, ?, 'player', 1, ?, ?)
          `
        ).bind(userId, username, passwordHash, now, now).run();

        const player = await createPlayerCharacter(env, userId, username, charName, session.sub);

        return withCors(
          json(
            {
              user: {
                id: userId,
                username,
                role: "player"
              },
              player
            },
            { status: 201 }
          ),
          origin
        );
      }

      const playerDeleteMatch = path.match(/^\/api\/directory\/players\/([^/]+)$/);
      if (playerDeleteMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode remover jogadores.", 403, origin);

        const username = decodePathParam(playerDeleteMatch[1]);
        const removed = await deletePlayerByUsername(env, username);
        if (!removed) return errorJson("Jogador não encontrado.", 404, origin);

        return withCors(json({ ok: true, username: removed.username }), origin);
      }

      if (path === "/api/directory/npcs" && request.method === "POST") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode criar NPCs.", 403, origin);

        const body = await readJson(request);
        const name = String(body.name || "").trim();
        if (!name) return errorJson("Informe o nome do NPC.", 400, origin);

        const npc = await createNpcCharacter(env, name, session.sub);
        return withCors(json(npc, { status: 201 }), origin);
      }

      const npcDeleteMatch = path.match(/^\/api\/directory\/npcs\/([^/]+)$/);
      if (npcDeleteMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode remover NPCs.", 403, origin);

        const deleted = await deleteCharacterByKey(
          env,
          buildCharacterKey("npc", decodePathParam(npcDeleteMatch[1])),
          "npc"
        );
        if (!deleted) return errorJson("NPC não encontrado.", 404, origin);

        return withCors(json({ ok: true, key: deleted.sheet_key }), origin);
      }

      if (path === "/api/directory/monsters" && request.method === "POST") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode criar monstros.", 403, origin);

        const body = await readJson(request);
        const name = String(body.name || "").trim();
        if (!name) return errorJson("Informe o nome do monstro.", 400, origin);

        const monster = await createMonsterCharacter(env, name, session.sub);
        return withCors(json(monster, { status: 201 }), origin);
      }

      const monsterDeleteMatch = path.match(/^\/api\/directory\/monsters\/([^/]+)$/);
      if (monsterDeleteMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode remover monstros.", 403, origin);

        const deleted = await deleteCharacterByKey(
          env,
          buildCharacterKey("monster", decodePathParam(monsterDeleteMatch[1])),
          "monster"
        );
        if (!deleted) return errorJson("Monstro não encontrado.", 404, origin);

        return withCors(json({ ok: true, key: deleted.sheet_key }), origin);
      }

      const characterMatch = path.match(/^\/api\/characters\/([^/]+)$/);
      if (characterMatch && request.method === "GET") {
        const session = await requireAuth(request, env);
        const key = decodePathParam(characterMatch[1]);
        const character = await getCharacterByKey(env, key);
        if (!character) return errorJson("Ficha não encontrada.", 404, origin);

        assertCharacterAccess(session, character, "read");
        return withCors(json(await getCharacterBundleByKey(env, key)), origin);
      }

      if (characterMatch && request.method === "PUT") {
        const session = await requireAuth(request, env);
        const key = decodePathParam(characterMatch[1]);
        const character = await getCharacterByKey(env, key);
        if (!character) return errorJson("Ficha não encontrada.", 404, origin);

        assertCharacterAccess(session, character, "write");
        const body = await readJson(request);
        const saved = await saveCharacterBundle(env, character, body, session);
        await broadcastSheetChanged(env, key, session);
        return withCors(json(saved), origin);
      }

      const characterSoulMatch = path.match(/^\/api\/characters\/([^/]+)\/soul-essence$/);
      if (characterSoulMatch && request.method === "POST") {
        const session = await requireAuth(request, env);
        const key = decodePathParam(characterSoulMatch[1]);
        const body = await readJson(request);

        const result = await awardSoulExperienceToCharacter(env, session, key, body);
        if (session.role !== "master") {
          await broadcastSoulEvent(env, "soul:awarded", result.summary, session);
        }
        await broadcastSheetChanged(env, key, session);
        return withCors(json(result), origin);
      }

      const characterNightmareMatch = path.match(/^\/api\/characters\/([^/]+)\/soul-nightmare$/);
      if (characterNightmareMatch && request.method === "POST") {
        const session = await requireAuth(request, env);
        const key = decodePathParam(characterNightmareMatch[1]);

        const result = await completeSoulNightmareForCharacter(env, session, key);
        if (session.role !== "master") {
          await broadcastSoulEvent(env, "soul:nightmare", result.summary, session);
        }
        await broadcastSheetChanged(env, key, session);
        return withCors(json(result), origin);
      }

      if (path === "/api/mesa/scene" && request.method === "GET") {
        await requireAuth(request, env);
        return withCors(json(await getMesaScene(env)), origin);
      }

      if (path === "/api/mesa/scene" && request.method === "PUT") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const saved = await saveMesaScene(env, session, body);
        await broadcastMesaScene(env, saved, session);
        return withCors(json(saved), origin);
      }

      /* ── AVATAR: upload para R2 ─────────────────────────────────────── */

      const avatarUploadMatch = path.match(/^\/api\/avatars\/([^/]+)$/);
      if (avatarUploadMatch && request.method === "POST") {
        const session = await requireAuth(request, env);
        if (!env.MAPS) return errorJson("Bucket R2 de avatares nao configurado.", 503, origin);

        const key = decodePathParam(avatarUploadMatch[1]);

        // Mestre pode enviar qualquer avatar; jogador só pode enviar o próprio
        const character = await getCharacterByKey(env, key);
        if (character) {
          assertCharacterAccess(session, character, "write");
        } else if (session.role !== "master") {
          return errorJson("Sem permissao para enviar avatar.", 403, origin);
        }

        const contentType = request.headers.get("content-type") || "image/webp";
        if (!/^image\/(webp|jpeg|jpg)$/i.test(contentType.split(";")[0].trim())) {
          return errorJson("Formato de avatar invalido. Use webp ou jpeg.", 415, origin);
        }

        const bodyBytes = await request.arrayBuffer();
        if (!bodyBytes.byteLength) return errorJson("Body vazio.", 400, origin);
        if (bodyBytes.byteLength > 2 * 1024 * 1024) {
          return errorJson("Avatar muito grande. Limite de 2 MB.", 413, origin);
        }
        const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "webp";
        const safeKey = String(key).replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 64);
        const r2Key = `avatars/${safeKey}.${ext}`;

        await env.MAPS.put(r2Key, bodyBytes, {
          httpMetadata:   { contentType },
          customMetadata: { characterKey: key, uploadedBy: session.username, uploadedAt: new Date().toISOString() }
        });

        const publicUrl = `${new URL(request.url).origin}/api/avatars/${encodeURIComponent(key)}`;
        return withCors(json({ ok: true, r2Key, url: publicUrl }, { status: 201 }), origin);
      }

      /* ── AVATAR: servir do R2 ────────────────────────────────────────── */

      const avatarServeMatch = path.match(/^\/api\/avatars\/([^/]+)$/);
      if (avatarServeMatch && request.method === "GET") {
        if (!env.MAPS) return errorJson("Bucket R2 nao configurado.", 503, origin);

        const key = decodePathParam(avatarServeMatch[1]);
        const safeKey = String(key).replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 64);

        // Tenta webp primeiro, depois jpg
        let object = await env.MAPS.get(`avatars/${safeKey}.webp`);
        if (!object) object = await env.MAPS.get(`avatars/${safeKey}.jpg`);
        if (!object) return errorJson("Avatar nao encontrado.", 404, origin);

        const headers = new Headers();
        headers.set("content-type", object.httpMetadata?.contentType || "image/webp");
        headers.set("cache-control", "public, max-age=3600");
        Object.entries(createCorsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
        return new Response(object.body, { headers });
      }

      /* ── MAPA: upload para R2 (último recurso, só mestre) ──────────── */

      if (path === "/api/mesa/map" && request.method === "POST") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") {
          return errorJson("Apenas o mestre pode enviar mapas.", 403, origin);
        }
        if (!env.MAPS) {
          return errorJson("Bucket R2 de mapas nao configurado.", 503, origin);
        }

        const formData = await request.formData();
        const file  = formData.get("file");
        const mapId = String(formData.get("mapId") || "").trim();

        if (!file || !(file instanceof File)) return errorJson("Campo 'file' obrigatorio.", 400, origin);
        if (!mapId) return errorJson("Campo 'mapId' obrigatorio.", 400, origin);

        // Chave no R2: maps/<username>/<mapId>.webp
        const safeUser  = String(session.username || "unknown").replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 32);
        const safeMapId = String(mapId).replace(/[^a-z0-9_-]/gi, "_").slice(0, 64);
        const r2Key     = `maps/${safeUser}/${safeMapId}.webp`;

        await env.MAPS.put(r2Key, await file.arrayBuffer(), {
          httpMetadata:   { contentType: "image/webp" },
          customMetadata: { uploadedBy: session.username, mapId, uploadedAt: new Date().toISOString() },
        });

        // URL pública servida pelo próprio Worker (não depende de domínio R2 customizado)
        const publicUrl = `${new URL(request.url).origin}/api/mesa/map/${encodeURIComponent(r2Key)}`;
        return withCors(json({ ok: true, r2Key, url: publicUrl }, { status: 201 }), origin);
      }

      /* ── MAPA: servir imagem do R2 (sem auth — URL é efêmera) ────────── */

      const mapServeMatch = path.match(/^\/api\/mesa\/map\/(.+)$/);
      if (mapServeMatch && request.method === "GET") {
        if (!env.MAPS) return errorJson("Bucket R2 nao configurado.", 503, origin);

        // Sem auth (a URL e usada como background-image, sem headers),
        // mas restrita ao prefixo maps/ — nao serve outros objetos do bucket.
        // Mitigacao adicional: mapas expiram do R2 via MAP_R2_TTL.
        const r2Key = decodePathParam(mapServeMatch[1]);
        if (!/^maps\/[a-z0-9_-]+\/[a-z0-9_-]+\.webp$/i.test(r2Key)) {
          return errorJson("Chave de mapa invalida.", 400, origin);
        }
        const object = await env.MAPS.get(r2Key);
        if (!object) return errorJson("Mapa nao encontrado.", 404, origin);

        const headers = new Headers();
        headers.set("content-type", object.httpMetadata?.contentType || "image/webp");
        headers.set("cache-control", "private, max-age=3600");
        Object.entries(createCorsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
        return new Response(object.body, { headers });
      }

      /* ── MAPA: deletar do R2 (só mestre, só próprio prefixo) ─────────── */

      const mapDeleteMatch = path.match(/^\/api\/mesa\/map\/(.+)$/);
      if (mapDeleteMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode remover mapas.", 403, origin);
        if (!env.MAPS) return errorJson("Bucket R2 nao configurado.", 503, origin);

        const r2Key    = decodePathParam(mapDeleteMatch[1]);
        const safeUser = String(session.username || "").replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 32);
        if (!r2Key.startsWith(`maps/${safeUser}/`)) {
          return errorJson("Sem permissao para remover este mapa.", 403, origin);
        }

        await env.MAPS.delete(r2Key);
        return withCors(json({ ok: true, r2Key }), origin);
      }

      if (path === "/api/transfers/items/player-to-player" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const sourceKey = String(body.sourceKey || "").trim().toLowerCase();
        const targetKey = String(body.targetKey || "").trim().toLowerCase();
        const itemIndex = body.itemIndex;
        const quantity = body.quantity;

        if (!sourceKey || !targetKey) {
          return errorJson("Origem e destino são obrigatórios.", 400, origin);
        }

        return withCors(json(await transferItemBetweenPlayers(env, session, sourceKey, targetKey, itemIndex, quantity)), origin);
      }

      if (path === "/api/transfers/items/character-to-character" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const sourceKey = String(body.sourceKey || "").trim().toLowerCase();
        const targetKey = String(body.targetKey || "").trim().toLowerCase();
        const itemIndex = body.itemIndex;
        const quantity = body.quantity;

        if (!sourceKey || !targetKey) {
          return errorJson("Origem e destino sao obrigatorios.", 400, origin);
        }

        return withCors(json(await transferItemBetweenCharacters(env, session, sourceKey, targetKey, itemIndex, quantity)), origin);
      }

      if (path === "/api/transfers/memories/player-to-player" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const sourceKey = String(body.sourceKey || "").trim().toLowerCase();
        const targetKey = String(body.targetKey || "").trim().toLowerCase();
        const memoryIndex = body.memoryIndex;

        if (!sourceKey || !targetKey) {
          return errorJson("Origem e destino são obrigatórios.", 400, origin);
        }

        return withCors(
          json(await transferMemoryBetweenPlayers(env, session, sourceKey, targetKey, memoryIndex)),
          origin
        );
      }

      if (path === "/api/transfers/memories/monster-roll" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const monsterKey = String(body.monsterKey || "").trim().toLowerCase();
        const dropIndex = body.dropIndex;

        if (!monsterKey) {
          return errorJson("Monstro obrigatório.", 400, origin);
        }

        return withCors(json(await rollMonsterMemoryDrop(env, session, monsterKey, dropIndex)), origin);
      }

      if (path === "/api/transfers/memories/monster-award" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const monsterKey = String(body.monsterKey || "").trim().toLowerCase();
        const targetKey = String(body.targetKey || "").trim().toLowerCase();
        const dropIndex = body.dropIndex;

        if (!monsterKey || !targetKey) {
          return errorJson("Monstro e destino são obrigatórios.", 400, origin);
        }

        return withCors(
          json(await awardMonsterMemoryDrop(env, session, monsterKey, dropIndex, targetKey)),
          origin
        );
      }

      if (path === "/api/rules" && request.method === "GET") {
        await requireAuth(request, env);
        return withCors(json(await listRules(env)), origin);
      }

      if (path === "/api/rules" && request.method === "POST") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode publicar regras.", 403, origin);

        const body = await readJson(request);
        const title = String(body.title || "").trim();
        const tag = serializeRuleTags(body);
        const tags = normalizeRuleTags(tag);
        const content = String(body.content || "").trim();
        if (!title || !content) return errorJson("Título e conteúdo são obrigatórios.", 400, origin);

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.DB.prepare(
          `
            insert into rules_posts (id, title, tag, content, created_by_user_id, updated_by_user_id, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).bind(id, title, tag, content, session.sub, session.sub, now, now).run();

        return withCors(json({ id, title, tag, tags, content, createdAt: now, updatedAt: now }, { status: 201 }), origin);
      }

      const ruleMatch = path.match(/^\/api\/rules\/([^/]+)$/);
      if (ruleMatch && request.method === "PUT") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode editar regras.", 403, origin);

        const body = await readJson(request);
        const title = String(body.title || "").trim();
        const tag = serializeRuleTags(body);
        const tags = normalizeRuleTags(tag);
        const content = String(body.content || "").trim();
        if (!title || !content) return errorJson("Título e conteúdo são obrigatórios.", 400, origin);

        const ruleId = ruleMatch[1];
        const now = new Date().toISOString();
        const result = await env.DB.prepare(
          `
            update rules_posts
            set title = ?, tag = ?, content = ?, updated_by_user_id = ?, updated_at = ?
            where id = ?
          `
        ).bind(title, tag, content, session.sub, now, ruleId).run();

        if (!result.meta.changes) return errorJson("Postagem não encontrada.", 404, origin);
        return withCors(json({ id: ruleId, title, tag, tags, content, updatedAt: now }), origin);
      }

      if (ruleMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode excluir regras.", 403, origin);

        const ruleId = ruleMatch[1];
        const result = await env.DB.prepare("delete from rules_posts where id = ?").bind(ruleId).run();
        if (!result.meta.changes) return errorJson("Postagem não encontrada.", 404, origin);
        return withCors(json({ ok: true, id: ruleId }), origin);
      }

      if (path === "/api/suggestions" && request.method === "GET") {
        await requireAuth(request, env);
        return withCors(json(await listSuggestions(env)), origin);
      }

      if (path === "/api/suggestions" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const title = String(body.title || "").trim();
        const category = String(body.category || "").trim();
        const description = String(body.description || "").trim();
        if (!title || !description) return errorJson("Titulo e descricao sao obrigatorios.", 400, origin);

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.DB.prepare(
          `
            insert into suggestions (
              id, title, category, description, created_by_user_id, updated_by_user_id, created_at, updated_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).bind(id, title, category, description, session.sub, session.sub, now, now).run();

        return withCors(
          json({
            id,
            title,
            category,
            description,
            author: session.username,
            createdAt: now,
            updatedAt: now
          }, { status: 201 }),
          origin
        );
      }

      const suggestionMatch = path.match(/^\/api\/suggestions\/([^/]+)$/);
      if (suggestionMatch && request.method === "PUT") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode editar sugestoes.", 403, origin);

        const body = await readJson(request);
        const title = String(body.title || "").trim();
        const category = String(body.category || "").trim();
        const description = String(body.description || "").trim();
        if (!title || !description) return errorJson("Titulo e descricao sao obrigatorios.", 400, origin);

        const suggestionId = suggestionMatch[1];
        const now = new Date().toISOString();
        const result = await env.DB.prepare(
          `
            update suggestions
            set title = ?, category = ?, description = ?, updated_by_user_id = ?, updated_at = ?
            where id = ?
          `
        ).bind(title, category, description, session.sub, now, suggestionId).run();

        if (!result.meta.changes) return errorJson("Sugestao nao encontrada.", 404, origin);
        return withCors(json({ id: suggestionId, title, category, description, updatedAt: now }), origin);
      }

      if (suggestionMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode excluir sugestoes.", 403, origin);

        const suggestionId = suggestionMatch[1];
        const result = await env.DB.prepare("delete from suggestions where id = ?").bind(suggestionId).run();
        if (!result.meta.changes) return errorJson("Sugestao nao encontrada.", 404, origin);
        return withCors(json({ ok: true, id: suggestionId }), origin);
      }

      return errorJson("Rota ainda não migrada para Cloudflare.", 404, origin);
    } catch (error) {
      if (error instanceof Response) {
        return withCors(error, origin);
      }

      console.error("Erro interno no Worker.", error);
      return errorJson("Erro interno no Worker.", 500, origin);
    }
  }
};
