function base64UrlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map(char => char.charCodeAt(0)));
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, pepper = "") {
  return sha256Hex(`${pepper}:${password}`);
}

async function signToken(payload, secret) {
  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsignedToken));
  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyToken(token, secret) {
  const [headerPart, payloadPart, signaturePart] = String(token || "").split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error("Token inválido.");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signaturePart),
    encoder.encode(`${headerPart}.${payloadPart}`)
  );

  if (!valid) {
    throw new Error("Assinatura inválida.");
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error("Sessão expirada.");
  }

  return payload;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
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

function createCorsHeaders(origin) {
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400"
  };
}

async function ensureMasterUser(env) {
  const username = String(env.MASTER_BOOTSTRAP_USERNAME || "mestre").trim().toLowerCase();
  const password = String(env.MASTER_BOOTSTRAP_PASSWORD || "").trim();
  const pepper = String(env.PASSWORD_PEPPER || "");

  if (!username || !password) {
    return;
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password, pepper);

  const existing = await env.DB.prepare(
    "select id from users where lower(username) = lower(?) limit 1"
  )
    .bind(username)
    .first();

  if (existing) {
    await env.DB.prepare(
      `
        update users
        set password_hash = ?, role = 'master', is_active = 1, updated_at = ?
        where id = ?
      `
    )
      .bind(passwordHash, now, existing.id)
      .run();
    return;
  }

  const userId = crypto.randomUUID();

  await env.DB.prepare(
    `
      insert into users (id, username, password_hash, role, is_active, created_at, updated_at)
      values (?, ?, ?, 'master', 1, ?, ?)
    `
  )
    .bind(userId, username, passwordHash, now, now)
    .run();
}

async function getUserByUsername(env, username) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) return null;

  return env.DB.prepare(
    `
      select id, username, password_hash, role, is_active, created_at, updated_at
      from users
      where lower(username) = lower(?)
      limit 1
    `
  )
    .bind(normalized)
    .first();
}

async function requireAuth(request, env) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Response(JSON.stringify({ error: "Sessão ausente." }), { status: 401 });
  }

  try {
    return await verifyToken(token, env.JWT_SECRET);
  } catch {
    throw new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401 });
  }
}

export { createCorsHeaders, ensureMasterUser, getUserByUsername, hashPassword, json, readJson, requireAuth, signToken };
