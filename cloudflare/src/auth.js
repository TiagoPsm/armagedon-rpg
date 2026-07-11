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

// Hash legado (sem salt). Mantido apenas para verificar senhas antigas;
// no primeiro login valido o hash e migrado para PBKDF2.
async function legacyHashPassword(password, pepper = "") {
  return sha256Hex(`${pepper}:${password}`);
}

// 25k iteracoes: equilibrio entre custo para atacante e limite de CPU do
// Worker (PBKDF2 nativo via WebCrypto). Aumentar exige validar o plano.
const PBKDF2_ITERATIONS = 25000;
const PBKDF2_HASH_BYTES = 32;
const PBKDF2_SALT_BYTES = 16;

async function derivePbkdf2Bits(password, pepper, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${pepper}:${password}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8
  );

  return new Uint8Array(bits);
}

// Formato armazenado: pbkdf2$<iteracoes>$<salt base64url>$<hash base64url>
async function createPasswordHash(password, pepper = "") {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await derivePbkdf2Bits(password, pepper, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

function isLegacyPasswordHash(stored) {
  return !String(stored || "").startsWith("pbkdf2$");
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

async function verifyPassword(password, pepper, stored) {
  const value = String(stored || "");

  if (isLegacyPasswordHash(value)) {
    const candidate = await legacyHashPassword(password, pepper);
    return timingSafeEqual(candidate, value);
  }

  const [, rawIterations, rawSalt, rawHash] = value.split("$");
  const iterations = Number.parseInt(rawIterations, 10);
  if (!Number.isFinite(iterations) || iterations < 1 || iterations > 1000000) return false;

  try {
    const salt = base64UrlDecode(rawSalt);
    const candidate = await derivePbkdf2Bits(password, pepper, salt, iterations);
    return timingSafeEqual(base64UrlEncode(candidate), rawHash);
  } catch {
    return false;
  }
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

// Cap de body (Etapa 41): 16KB por padrao; rotas com payload grande (cena da
// Mesa, ficha completa) passam um limite maior explicitamente. Corpo acima do
// limite responde 413 — devolver {} silenciosamente seria pior (um PUT de
// cena com {} normalizado APAGARIA a cena salva).
const READ_JSON_DEFAULT_MAX_BYTES = 16 * 1024;

function payloadTooLarge() {
  return json({ error: "Corpo da requisicao excede o limite permitido." }, { status: 413 });
}

async function readJson(request, maxBytes = READ_JSON_DEFAULT_MAX_BYTES) {
  const declared = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw payloadTooLarge();
  }

  let text = "";
  try {
    text = await request.text();
  } catch {
    return {};
  }
  if (text.length > maxBytes) {
    throw payloadTooLarge();
  }
  try {
    return text ? JSON.parse(text) : {};
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

// Origens autorizadas a chamar a API pelo navegador. Outras origens
// recebem o dominio canonico no header (efetivamente bloqueadas pelo CORS).
const ALLOWED_ORIGINS = new Set([
  "https://tiagopsm.github.io",
  "https://armagedon-rpg.pages.dev"
]);
const CANONICAL_ORIGIN = "https://tiagopsm.github.io";

function isAllowedOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) return false;
  if (ALLOWED_ORIGINS.has(value)) return true;
  // Previews do Cloudflare Pages (<hash>.armagedon-rpg.pages.dev)
  if (/^https:\/\/[a-z0-9-]+\.armagedon-rpg\.pages\.dev$/.test(value)) return true;
  // Desenvolvimento local
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);
}

function createCorsHeaders(origin) {
  return {
    "access-control-allow-origin": isAllowedOrigin(origin) ? origin : CANONICAL_ORIGIN,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    "vary": "origin"
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

  const existing = await env.DB.prepare(
    "select id, password_hash, role, is_active from users where lower(username) = lower(?) limit 1"
  )
    .bind(username)
    .first();

  if (existing) {
    // So grava quando algo realmente mudou (senha rotacionada no secret,
    // role/ativacao divergente ou hash ainda no formato legado).
    const passwordMatches = await verifyPassword(password, pepper, existing.password_hash);
    const needsUpdate =
      !passwordMatches ||
      isLegacyPasswordHash(existing.password_hash) ||
      existing.role !== "master" ||
      !existing.is_active;

    if (!needsUpdate) return;

    const passwordHash = await createPasswordHash(password, pepper);
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
  const passwordHash = await createPasswordHash(password, pepper);

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
  const headerToken = authorization.replace(/^Bearer\s+/i, "").trim();
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  const token = headerToken || queryToken.trim();

  if (!token) {
    throw new Response(JSON.stringify({ error: "Sessão ausente." }), { status: 401 });
  }

  try {
    return await verifyToken(token, env.JWT_SECRET);
  } catch {
    throw new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401 });
  }
}

export {
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
};
