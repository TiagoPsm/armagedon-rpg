import {
  buildDefaultSheet,
  normalizeItem,
  normalizeInventorySlots,
  normalizeOwnedMemory,
  normalizeSheetData,
  sanitizeChance
} from "./sheet.js";
import { absorbSoulEssences, clampAmount, clampRank, getRankName } from "./soul-progression.js";

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function buildCharacterKey(kind, idOrUsername) {
  if (kind === "player") {
    return normalizeUsername(idOrUsername);
  }

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
    throw jsonError("Sessão inválida.", 401);
  }

  if (user.role === "master") {
    return true;
  }

  if (character.kind === "player" && character.ownerUserId === user.sub) {
    return true;
  }

  throw jsonError(
    mode === "write" ? "Você não pode alterar esta ficha." : "Você não pode acessar esta ficha.",
    403
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
  )
    .bind(normalizedKey)
    .first();

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
  const payload = JSON.stringify({
    ...normalizedData,
    charName: name
  });

  await env.DB.prepare(
    `
      update characters
      set name = ?, data_json = ?, updated_at = ?
      where id = ?
    `
  )
    .bind(name, payload, now, character.id)
    .run();

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
    String((baseData || {}).charName || character.name || "")
  );

  if (character.kind === "player") {
    const currentSlots = normalizeInventorySlots("player", currentData.inventorySlots, currentData.inv.length);

    if (actor.role !== "master" && normalizedData.inv.length > currentSlots) {
      throw jsonError("O inventário enviado ultrapassa a capacidade atual da mochila.", 409);
    }

    normalizedData.inventorySlots =
      actor.role === "master"
        ? normalizeInventorySlots("player", normalizedData.inventorySlots, normalizedData.inv.length)
        : currentSlots;
    normalizedData.ownedMemories =
      actor.role === "master" ? normalizedData.ownedMemories : currentData.ownedMemories;
    normalizedData.soulCore = actor.role === "master" ? normalizedData.soulCore : currentData.soulCore;
    normalizedData.charLevel = String(normalizedData.soulCore.rank);
  }

  if (character.kind === "npc") {
    normalizedData.inventorySlots = normalizeInventorySlots("npc", normalizedData.inventorySlots);
    normalizedData.charLevel = String(normalizedData.soulCore.rank);

    if (normalizedData.inv.length > normalizedData.inventorySlots) {
      throw jsonError("NPCs não podem ultrapassar o limite padrão de 30 slots.", 409);
    }
  }

  if (character.kind === "monster") {
    normalizedData.inventorySlots = 0;
    normalizedData.charLevel = String(normalizedData.soulCore.rank);
  }

  return persistCharacterData(env, character, normalizedData);
}

async function awardSoulEssenceToPlayer(env, actor, targetKey, essenceRank, amount) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode alimentar o núcleo de essência.", 403);
  }

  const target = await getCharacterByKey(env, targetKey);
  if (!target) {
    throw jsonError("Ficha não encontrada.", 404);
  }

  if (target.kind !== "player") {
    throw jsonError("Essências da alma só podem ser aplicadas a jogadores.", 400);
  }

  const normalizedEssenceRank = clampRank(essenceRank);
  const normalizedAmount = clampAmount(amount);
  const targetData = normalizeSheetData(target.data || {}, "player", target.name);
  const beforeCore = { ...targetData.soulCore };
  const result = absorbSoulEssences(targetData.soulCore, normalizedEssenceRank, normalizedAmount);

  targetData.soulCore = result.core;
  targetData.charLevel = String(result.core.rank);

  const saved = await persistCharacterData(env, target, targetData);

  return {
    character: saved,
    summary: {
      targetKey: target.key,
      amount: normalizedAmount,
      essenceRank: normalizedEssenceRank,
      essenceName: getRankName(normalizedEssenceRank),
      totalExperience: result.totalExperience,
      before: beforeCore,
      after: result.core,
      rankUps: result.rankUps
    }
  };
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

    if (user.role !== "master") {
      return;
    }

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
  )
    .bind(id, key, userId, name, JSON.stringify(data), createdByUserId, now, now)
    .run();

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
  )
    .bind(id, key, cleanName, JSON.stringify(data), createdByUserId, now, now)
    .run();

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
  )
    .bind(id, key, cleanName, JSON.stringify(data), createdByUserId, now, now)
    .run();

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
  )
    .bind(normalized)
    .first();

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
  )
    .bind(normalizedKey, kind)
    .first();

  if (!existing) return null;

  await env.DB.prepare("delete from characters where id = ?").bind(existing.id).run();
  return existing;
}

async function insertTransferAudit(env, transferType, actorUserId, sourceCharacterId, targetCharacterId, payload) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `
      insert into transfer_audit (
        id, transfer_type, actor_user_id, source_character_id, target_character_id, payload_json, created_at
      )
      values (?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      id,
      transferType,
      actorUserId || null,
      sourceCharacterId || null,
      targetCharacterId || null,
      JSON.stringify(payload || {}),
      now
    )
    .run();
}

async function transferItemBetweenPlayers(env, actor, sourceKey, targetKey, itemIndex) {
  const source = await getCharacterByKey(env, sourceKey);
  const target = await getCharacterByKey(env, targetKey);

  if (!source || !target) {
    throw jsonError("Ficha de origem ou destino não encontrada.", 404);
  }

  if (source.kind !== "player" || target.kind !== "player") {
    throw jsonError("A troca de item só pode acontecer entre jogadores.", 400);
  }

  if (source.id === target.id) {
    throw jsonError("A origem e o destino não podem ser a mesma ficha.", 400);
  }

  assertCharacterAccess(actor, source, "write");

  const sourceData = normalizeSheetData(source.data || {}, "player", source.name);
  const targetData = normalizeSheetData(target.data || {}, "player", target.name);
  const index = Number.parseInt(itemIndex, 10);

  if (Number.isNaN(index) || index < 0 || index >= sourceData.inv.length) {
    throw jsonError("Item de origem não encontrado.", 404);
  }

  const targetCapacity = Math.max(
    normalizeInventorySlots("player", targetData.inventorySlots, targetData.inv.length),
    targetData.inv.length
  );

  if (targetData.inv.length >= targetCapacity) {
    throw jsonError("O jogador de destino está com a mochila cheia.", 409);
  }

  const transferredItem = normalizeItem(sourceData.inv[index]);
  sourceData.inv.splice(index, 1);
  targetData.inv.push(transferredItem);

  await persistCharacterData(env, source, sourceData);
  await persistCharacterData(env, target, targetData);

  await insertTransferAudit(env, "item-player-to-player", actor.sub, source.id, target.id, {
    item: transferredItem,
    sourceKey: source.key,
    targetKey: target.key
  });

  return {
    item: transferredItem,
    sourceKey: source.key,
    targetKey: target.key
  };
}

async function transferMemoryBetweenPlayers(env, actor, sourceKey, targetKey, memoryIndex) {
  const source = await getCharacterByKey(env, sourceKey);
  const target = await getCharacterByKey(env, targetKey);

  if (!source || !target) {
    throw jsonError("Ficha de origem ou destino não encontrada.", 404);
  }

  if (source.kind !== "player" || target.kind !== "player") {
    throw jsonError("A transferência só pode acontecer entre jogadores.", 400);
  }

  if (source.id === target.id) {
    throw jsonError("A origem e o destino não podem ser a mesma ficha.", 400);
  }

  assertCharacterAccess(actor, source, "write");

  const sourceData = normalizeSheetData(source.data || {}, "player", source.name);
  const targetData = normalizeSheetData(target.data || {}, "player", target.name);
  const index = Number.parseInt(memoryIndex, 10);

  if (Number.isNaN(index) || index < 0 || index >= sourceData.ownedMemories.length) {
    throw jsonError("Memória não encontrada.", 404);
  }

  const transferredMemory = normalizeOwnedMemory(sourceData.ownedMemories[index]);
  sourceData.ownedMemories.splice(index, 1);
  targetData.ownedMemories.push(transferredMemory);

  await persistCharacterData(env, source, sourceData);
  await persistCharacterData(env, target, targetData);

  await insertTransferAudit(env, "memory-player-to-player", actor.sub, source.id, target.id, {
    memory: transferredMemory,
    sourceKey: source.key,
    targetKey: target.key
  });

  return {
    memory: transferredMemory,
    sourceKey: source.key,
    targetKey: target.key
  };
}

async function rollMonsterMemoryDrop(env, actor, monsterKey, dropIndex) {
  const monster = await getCharacterByKey(env, monsterKey);
  if (!monster) {
    throw jsonError("Monstro não encontrado.", 404);
  }

  if (monster.kind !== "monster") {
    throw jsonError("A rolagem só vale para monstros.", 400);
  }

  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode rolar drops de memória.", 403);
  }

  const monsterData = normalizeSheetData(monster.data || {}, "monster", monster.name);
  const index = Number.parseInt(dropIndex, 10);
  const drop = monsterData.memoryDrops[index];

  if (!drop) {
    throw jsonError("Drop de memória não encontrado.", 404);
  }

  const chance = Number.parseFloat(sanitizeChance(drop.chance, "0")) || 0;
  const rolled = Number((Math.random() * 100).toFixed(1));
  const success = chance > 0 && rolled <= chance;

  return {
    rolled,
    chance,
    success,
    drop: {
      index,
      name: drop.name,
      desc: drop.desc
    }
  };
}

async function awardMonsterMemoryDrop(env, actor, monsterKey, dropIndex, targetKey) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode enviar memórias de monstros.", 403);
  }

  const monster = await getCharacterByKey(env, monsterKey);
  const target = await getCharacterByKey(env, targetKey);

  if (!monster || !target) {
    throw jsonError("Monstro ou destino não encontrado.", 404);
  }

  if (monster.kind !== "monster") {
    throw jsonError("A origem precisa ser um monstro.", 400);
  }

  if (!["player", "npc"].includes(target.kind)) {
    throw jsonError("Memórias de monstro só podem ser enviadas para jogadores ou NPCs.", 400);
  }

  const monsterData = normalizeSheetData(monster.data || {}, "monster", monster.name);
  const targetData = normalizeSheetData(target.data || {}, target.kind, target.name);
  const index = Number.parseInt(dropIndex, 10);
  const drop = monsterData.memoryDrops[index];

  if (!drop) {
    throw jsonError("Drop de memória não encontrado.", 404);
  }

  const memory = normalizeOwnedMemory({
    name: drop.name,
    desc: drop.desc,
    source: monster.name
  });

  targetData.ownedMemories.push(memory);
  await persistCharacterData(env, target, targetData);

  await insertTransferAudit(env, "memory-drop-award", actor.sub, monster.id, target.id, {
    memory,
    monsterKey: monster.key,
    targetKey: target.key
  });

  return {
    memory,
    monsterKey: monster.key,
    targetKey: target.key
  };
}

export {
  assertCharacterAccess,
  awardMonsterMemoryDrop,
  awardSoulEssenceToPlayer,
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
};
