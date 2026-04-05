import {
  createCorsHeaders,
  ensureMasterUser,
  getUserByUsername,
  hashPassword,
  json,
  readJson,
  requireAuth,
  signToken
} from "./auth.js";
import {
  assertCharacterAccess,
  awardSoulEssenceToPlayer,
  awardMonsterMemoryDrop,
  buildCharacterKey,
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
  transferItemBetweenPlayers,
  transferMemoryBetweenPlayers
} from "./characters.js";

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

function decodePathParam(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
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

    await ensureMasterUser(env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/api/health" && request.method === "GET") {
        return withCors(json({ ok: true, service: "armagedon-cloudflare" }), origin);
      }

      if (path === "/api/auth/login" && request.method === "POST") {
        const body = await readJson(request);
        const user = await getUserByUsername(env, body.username);
        const pepper = String(env.PASSWORD_PEPPER || "");

        if (!user || !user.is_active) {
          return errorJson("Usuário ou senha inválidos.", 401, origin);
        }

        const incomingHash = await hashPassword(body.password || "", pepper);
        if (incomingHash !== user.password_hash) {
          return errorJson("Usuário ou senha inválidos.", 401, origin);
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
        const passwordHash = await hashPassword(password, String(env.PASSWORD_PEPPER || ""));

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
        return withCors(json(saved), origin);
      }

      const characterSoulMatch = path.match(/^\/api\/characters\/([^/]+)\/soul-essence$/);
      if (characterSoulMatch && request.method === "POST") {
        const session = await requireAuth(request, env);
        const key = decodePathParam(characterSoulMatch[1]);
        const body = await readJson(request);

        return withCors(
          json(await awardSoulEssenceToPlayer(env, session, key, body.essenceRank, body.amount)),
          origin
        );
      }

      if (path === "/api/transfers/items/player-to-player" && request.method === "POST") {
        const session = await requireAuth(request, env);
        const body = await readJson(request);
        const sourceKey = String(body.sourceKey || "").trim().toLowerCase();
        const targetKey = String(body.targetKey || "").trim().toLowerCase();
        const itemIndex = body.itemIndex;

        if (!sourceKey || !targetKey) {
          return errorJson("Origem e destino são obrigatórios.", 400, origin);
        }

        return withCors(json(await transferItemBetweenPlayers(env, session, sourceKey, targetKey, itemIndex)), origin);
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
        const tag = String(body.tag || "").trim();
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

        return withCors(json({ id, title, tag, content, createdAt: now, updatedAt: now }, { status: 201 }), origin);
      }

      const ruleMatch = path.match(/^\/api\/rules\/([^/]+)$/);
      if (ruleMatch && request.method === "PUT") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode editar regras.", 403, origin);

        const body = await readJson(request);
        const title = String(body.title || "").trim();
        const tag = String(body.tag || "").trim();
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
        return withCors(json({ id: ruleId, title, tag, content, updatedAt: now }), origin);
      }

      if (ruleMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode excluir regras.", 403, origin);

        const ruleId = ruleMatch[1];
        const result = await env.DB.prepare("delete from rules_posts where id = ?").bind(ruleId).run();
        if (!result.meta.changes) return errorJson("Postagem não encontrada.", 404, origin);
        return withCors(json({ ok: true, id: ruleId }), origin);
      }

      return errorJson("Rota ainda não migrada para Cloudflare.", 404, origin);
    } catch (error) {
      if (error instanceof Response) {
        return withCors(error, origin);
      }

      return errorJson(error?.message || "Erro interno no Worker.", 500, origin);
    }
  }
};
