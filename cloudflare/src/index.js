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
          return errorJson("Usuario ou senha invalidos.", 401, origin);
        }

        const incomingHash = await hashPassword(body.password || "", pepper);
        if (incomingHash !== user.password_hash) {
          return errorJson("Usuario ou senha invalidos.", 401, origin);
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
        if (!title || !content) return errorJson("Titulo e conteudo sao obrigatorios.", 400, origin);

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
        if (!title || !content) return errorJson("Titulo e conteudo sao obrigatorios.", 400, origin);

        const ruleId = ruleMatch[1];
        const now = new Date().toISOString();
        const result = await env.DB.prepare(
          `
            update rules_posts
            set title = ?, tag = ?, content = ?, updated_by_user_id = ?, updated_at = ?
            where id = ?
          `
        ).bind(title, tag, content, session.sub, now, ruleId).run();

        if (!result.meta?.changes) return errorJson("Postagem nao encontrada.", 404, origin);
        return withCors(json({ id: ruleId, title, tag, content, updatedAt: now }), origin);
      }

      if (ruleMatch && request.method === "DELETE") {
        const session = await requireAuth(request, env);
        if (session.role !== "master") return errorJson("Apenas o mestre pode excluir regras.", 403, origin);

        const ruleId = ruleMatch[1];
        const result = await env.DB.prepare("delete from rules_posts where id = ?").bind(ruleId).run();
        if (!result.meta?.changes) return errorJson("Postagem nao encontrada.", 404, origin);
        return withCors(json({ ok: true, id: ruleId }), origin);
      }

      return errorJson("Rota ainda nao migrada para Cloudflare.", 404, origin);
    } catch (error) {
      if (error instanceof Response) {
        return withCors(error, origin);
      }

      return errorJson(error?.message || "Erro interno no Worker.", 500, origin);
    }
  }
};
