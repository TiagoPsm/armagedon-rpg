import {
  buildDefaultSheet,
  normalizeInventorySlots,
  normalizeSheetData
} from "./sheet.js";

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function buildCharacterKey(kind, idOrUsername) {
  if (kind === "player") return normalizeUsername(idOrUsername);
  return `${kind}:${String(idOrUsername || "").trim().toLowerCase()}`;
}

function parseCharacterData(value) {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapCharacterRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    key: row.sheet_key,
    kind: row.kind,
    ownerUserId: row.owner_user_id || null,
    ownerUsername: row.owner_username || null,
    name: row.name,
    data: parseCharacterData(row.data_json),
    createdByUserId: row.created_by_user_id || null
  };
}

function serializeCharacter(character) {
  const normalizedData = normalizeSheetData(character.data || {}, character.kind, character.name);

  return {
    id: character.id,
    key: character.key,
    kind: character.kind,
    ownerUserId: character.ownerUserId,
    ownerUsername: character.ownerUsername,
    name: character.name,
    data: normalizedData
  };
}

function assertCharacterAccess(user, character, mode = "read") {
  if (!user || !character) {
    throw new Response(JSON.stringify({ error: "Sessao invalida." }), { status: 401 });
  }

  if (user.role === "master") return true;

  if (character.kind === "player" && character.ownerUserId === user.sub) {
    return true;
  }

  throw new Response(
    JSON.stringify({
      error: mode === "write" ? "Voce nao pode alterar esta ficha." : "Voce nao pode acessar esta ficha."
    }),
    { status: 403 }
  );
}

async function getCharacterByKey(env, key) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (!normalizedKey) return null;

  const row = await env.DB.prepare(
    `
      select
        c.id,
        c.sheet_key,
        c.kind,
        c.owner_user_id,
        c.name,
        c.data_json,
        c.created_by_user_id,
        u.username as owner_username
      from characters c
      left join users u on u.id = c.owner_user_id
      where lower(c.sheet_key) = lower(?)
      limit 1
    `
  ).bind(normalizedKey).first();

  return mapCharacterRow(row);
}

async function getCharacterBundleByKey(env, key) {
  const character = await getCharacterByKey(env, key);
  if (!character) return null;
  return serializeCharacter(character);
}

function persistNameFromData(currentName, normalizedData) {
  return String(normalizedData.charName || currentName || "").trim() || currentName || "Sem nome";
}

async function persistCharacterData(env, character, normalizedData) {
  const name = persistNameFromData(character.name, normalizedData);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `
      update characters
      set name = ?, data_json = ?, updated_at = ?
      where id = ?
    `
  ).bind(name, JSON.stringify({ ...normalizedData, charName: name }), now, character.id).run();

  return getCharacterBundleByKey(env, character.key);
}

async function saveCharacterBundle(env, character, payload, actor) {
  const baseData =
    payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;

  const currentData = normalizeSheetData(character.data || {}, character.kind, character.name);
  const normalizedData = normalizeSheetData(
    baseData || {},
    character.kind,
    String(baseData?.charName || character.name || "")
  );

  if (character.kind === "player") {
    const currentSlots = normalizeInventorySlots("player", currentData.inventorySlots, currentData.inv.length);

    if (actor?.role !== "master" && normalizedData.inv.length > currentSlots) {
      throw new Response(
        JSON.stringify({ error: "O inventario enviado ultrapassa a capacidade atual da mochila." }),
        { status: 409 }
      );
    }

    normalizedData.inventorySlots =
      actor?.role === "master"
        ? normalizeInventorySlots("player", normalizedData.inventorySlots, normalizedData.inv.length)
        : currentSlots;
    normalizedData.ownedMemories =
      actor?.role === "master" ? normalizedData.ownedMemories : currentData.ownedMemories;
  }

  if (character.kind === "npc") {
    normalizedData.inventorySlots = normalizeInventorySlots("npc", normalizedData.inventorySlots);
    if (normalizedData.inv.length > normalizedData.inventorySlots) {
      throw new Response(
        JSON.stringify({ error: "NPCs nao podem ultrapassar o limite padrao de 20 slots." }),
        { status: 409 }
      );
    }
  }

  return persistCharacterData(env, character, normalizedData);
}

async function listDirectory(env, user) {
  const { results } = await env.DB.prepare(
    `
      select
        c.id,
        c.sheet_key,
        c.kind,
        c.owner_user_id,
        c.name,
        c.data_json,
        c.created_by_user_id,
        u.username as owner_username
      from characters c
      left join users u on u.id = c.owner_user_id
      order by
        case c.kind
          when 'player' then 1
          when 'npc' then 2
          else 3
        end,
        c.name asc
    `
  ).all();

  const players = [];
  const npcs = [];
  const monsters = [];

  (results || []).forEach(row => {
    const character = serializeCharacter(mapCharacterRow(row));
    const inventorySlots = Number(character.data.inventorySlots || 0);
    const usedSlots = Array.isArray(character.data.inv) ? character.data.inv.length : 0;

    if (character.kind === "player") {
      players.push({
        id: character.id,
        key: character.key,
        username: character.ownerUsername,
        charname: character.name,
        inventorySlots,
        usedSlots
      });
      return;
    }

    if (user.role !== "master") return;

    if (character.kind === "npc") {
      npcs.push({
        id: character.id,
        key: character.key,
        name: character.name
      });
      return;
    }

    monsters.push({
      id: character.id,
      key: character.key,
      name: character.name
    });
  });

  return { players, npcs, monsters };
}

async function createPlayerCharacter(env, userId, username, charName, createdByUserId) {
  const name = String(charName || username || "").trim() || username;
  const key = buildCharacterKey("player", username);
  const data = buildDefaultSheet("player", name);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `
      insert into characters (
        id, sheet_key, owner_user_id, kind, name, data_json, created_by_user_id, created_at, updated_at
      )
      values (?, ?, ?, 'player', ?, ?, ?, ?, ?)
    `
  ).bind(id, key, userId, name, JSON.stringify(data), createdByUserId, now, now).run();

  return {
    id,
    key,
    kind: "player",
    ownerUserId: userId,
    ownerUsername: username,
    name,
    data
  };
}

async function createNpcCharacter(env, name, createdByUserId) {
  const cleanName = String(name || "").trim() || "NPC";
  const id = crypto.randomUUID();
  const key = buildCharacterKey("npc", id);
  const data = buildDefaultSheet("npc", cleanName);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `
      insert into characters (
        id, sheet_key, kind, name, data_json, created_by_user_id, created_at, updated_at
      )
      values (?, ?, 'npc', ?, ?, ?, ?, ?)
    `
  ).bind(id, key, cleanName, JSON.stringify(data), createdByUserId, now, now).run();

  return {
    id,
    key,
    kind: "npc",
    ownerUserId: null,
    ownerUsername: null,
    name: cleanName,
    data
  };
}

async function createMonsterCharacter(env, name, createdByUserId) {
  const cleanName = String(name || "").trim() || "Monstro";
  const id = crypto.randomUUID();
  const key = buildCharacterKey("monster", id);
  const data = buildDefaultSheet("monster", cleanName);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `
      insert into characters (
        id, sheet_key, kind, name, data_json, created_by_user_id, created_at, updated_at
      )
      values (?, ?, 'monster', ?, ?, ?, ?, ?)
    `
  ).bind(id, key, cleanName, JSON.stringify(data), createdByUserId, now, now).run();

  return {
    id,
    key,
    kind: "monster",
    ownerUserId: null,
    ownerUsername: null,
    name: cleanName,
    data
  };
}

async function deletePlayerByUsername(env, username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const existing = await env.DB.prepare(
    `
      select id, username
      from users
      where lower(username) = lower(?)
        and role = 'player'
      limit 1
    `
  ).bind(normalized).first();

  if (!existing) return null;

  await env.DB.prepare("delete from users where id = ?").bind(existing.id).run();
  return existing;
}

async function deleteCharacterByKey(env, key, kind) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const existing = await env.DB.prepare(
    `
      select id, sheet_key, kind, name
      from characters
      where lower(sheet_key) = lower(?)
        and kind = ?
      limit 1
    `
  ).bind(normalizedKey, kind).first();

  if (!existing) return null;

  await env.DB.prepare("delete from characters where id = ?").bind(existing.id).run();
  return existing;
}

export {
  assertCharacterAccess,
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
  saveCharacterBundle
};
