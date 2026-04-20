const { randomUUID } = require("crypto");
const { httpError } = require("../utils/http-error");
const {
  buildDefaultSheet,
  normalizeInventorySlots,
  normalizeItem,
  normalizeOwnedMemory,
  normalizeSheetData,
  sanitizeChance
} = require("../utils/sheet");

function buildCharacterKey(kind, idOrUsername) {
  if (kind === "player") return String(idOrUsername || "").trim().toLowerCase();
  return `${kind}:${idOrUsername}`;
}

function mapCharacterRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    key: row.sheet_key,
    kind: row.kind,
    ownerUserId: row.owner_user_id,
    ownerUsername: row.owner_username || null,
    name: row.name,
    data: row.data || {}
  };
}

async function getCharacterByKey(client, key, options = {}) {
  const lock = options.forUpdate ? "for update of c" : "";
  const result = await client.query(
    `
      select
        c.id,
        c.sheet_key,
        c.kind,
        c.owner_user_id,
        c.name,
        c.data,
        u.username as owner_username
      from characters c
      left join users u on u.id = c.owner_user_id
      where c.sheet_key = $1
      limit 1
      ${lock}
    `,
    [String(key || "").trim().toLowerCase()]
  );

  return mapCharacterRow(result.rows[0]);
}

async function getCharacterBundleByKey(client, key) {
  const character = await getCharacterByKey(client, key);
  if (!character) return null;
  return serializeCharacter(character);
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
    throw httpError(401, "Sessão inválida.");
  }

  if (user.role === "master") return true;

  if (character.kind === "player" && character.ownerUserId === user.sub) {
    return true;
  }

  throw httpError(
    403,
    mode === "write"
      ? "Você não pode alterar esta ficha."
      : "Você não pode acessar esta ficha."
  );
}

function persistNameFromData(currentName, normalizedData) {
  return String(normalizedData.charName || currentName || "").trim() || currentName || "Sem nome";
}

async function persistCharacterData(client, character, normalizedData) {
  const name = persistNameFromData(character.name, normalizedData);

  await client.query(
    `
      update characters
      set name = $2,
          data = $3::jsonb,
          updated_at = now()
      where id = $1
    `,
    [character.id, name, JSON.stringify({ ...normalizedData, charName: name })]
  );

  return getCharacterBundleByKey(client, character.key);
}

async function saveCharacterBundle(client, character, payload, actor) {
  const baseData = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
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
      throw httpError(409, "O inventário enviado ultrapassa a capacidade atual da mochila.");
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
      throw httpError(409, "NPCs não podem ultrapassar o limite padrão de 10 slots.");
    }
  }

  return persistCharacterData(client, character, normalizedData);
}

async function listDirectory(client, user) {
  const result = await client.query(
    `
      select
        c.id,
        c.sheet_key,
        c.kind,
        c.owner_user_id,
        c.name,
        c.data,
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
  );

  const players = [];
  const npcs = [];
  const monsters = [];

  result.rows.forEach(row => {
    const character = serializeCharacter(mapCharacterRow(row));
    const inventorySlots = character.data.inventorySlots || 0;
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

async function createPlayerCharacter(client, userId, username, charName, createdByUserId) {
  const name = String(charName || username || "").trim() || username;
  const key = buildCharacterKey("player", username);
  const data = buildDefaultSheet("player", name);

  const inserted = await client.query(
    `
      insert into characters (id, sheet_key, owner_user_id, kind, name, data, created_by_user_id)
      values ($1, $2, $3, 'player', $4, $5::jsonb, $6)
      returning
        id,
        sheet_key,
        kind,
        owner_user_id,
        name,
        data
    `,
    [randomUUID(), key, userId, name, JSON.stringify(data), createdByUserId]
  );

  return serializeCharacter({
    ...mapCharacterRow(inserted.rows[0]),
    ownerUsername: username
  });
}

async function createNpcCharacter(client, name, createdByUserId) {
  const cleanName = String(name || "").trim() || "NPC";
  const id = randomUUID();
  const key = buildCharacterKey("npc", id);
  const data = buildDefaultSheet("npc", cleanName);

  const inserted = await client.query(
    `
      insert into characters (id, sheet_key, kind, name, data, created_by_user_id)
      values ($1, $2, 'npc', $3, $4::jsonb, $5)
      returning id, sheet_key, kind, owner_user_id, name, data
    `,
    [id, key, cleanName, JSON.stringify(data), createdByUserId]
  );

  return serializeCharacter(mapCharacterRow(inserted.rows[0]));
}

async function createMonsterCharacter(client, name, createdByUserId) {
  const cleanName = String(name || "").trim() || "Monstro";
  const id = randomUUID();
  const key = buildCharacterKey("monster", id);
  const data = buildDefaultSheet("monster", cleanName);

  const inserted = await client.query(
    `
      insert into characters (id, sheet_key, kind, name, data, created_by_user_id)
      values ($1, $2, 'monster', $3, $4::jsonb, $5)
      returning id, sheet_key, kind, owner_user_id, name, data
    `,
    [id, key, cleanName, JSON.stringify(data), createdByUserId]
  );

  return serializeCharacter(mapCharacterRow(inserted.rows[0]));
}

async function deletePlayerByUsername(client, username) {
  const result = await client.query(
    `
      delete from users
      where lower(username) = lower($1)
        and role = 'player'
      returning id, username
    `,
    [String(username || "").trim().toLowerCase()]
  );

  return result.rows[0] || null;
}

async function deleteCharacterByKey(client, key, kind) {
  const result = await client.query(
    `
      delete from characters
      where sheet_key = $1
        and kind = $2
      returning id, sheet_key, kind, name
    `,
    [String(key || "").trim().toLowerCase(), kind]
  );

  return result.rows[0] || null;
}

async function transferItemBetweenPlayers(client, actor, sourceKey, targetKey, itemIndex) {
  const source = await getCharacterByKey(client, sourceKey, { forUpdate: true });
  const target = await getCharacterByKey(client, targetKey, { forUpdate: true });

  if (!source || !target) throw httpError(404, "Ficha de origem ou destino não encontrada.");
  if (source.kind !== "player" || target.kind !== "player") {
    throw httpError(400, "A troca de item só pode acontecer entre jogadores.");
  }
  if (source.id === target.id) {
    throw httpError(400, "A origem e o destino não podem ser a mesma ficha.");
  }

  assertCharacterAccess(actor, source, "write");

  const sourceData = normalizeSheetData(source.data || {}, "player", source.name);
  const targetData = normalizeSheetData(target.data || {}, "player", target.name);
  const index = Number.parseInt(itemIndex, 10);

  if (Number.isNaN(index) || index < 0 || index >= sourceData.inv.length) {
    throw httpError(404, "Item de origem não encontrado.");
  }

  const targetCapacity = Math.max(
    normalizeInventorySlots("player", targetData.inventorySlots, targetData.inv.length),
    targetData.inv.length
  );

  if (targetData.inv.length >= targetCapacity) {
    throw httpError(409, "O jogador de destino está com a mochila cheia.");
  }

  const transferredItem = normalizeItem(sourceData.inv[index]);
  sourceData.inv.splice(index, 1);
  targetData.inv.push(transferredItem);

  await persistCharacterData(client, source, sourceData);
  await persistCharacterData(client, target, targetData);

  await client.query(
    `
      insert into transfer_audit (transfer_type, actor_user_id, source_character_id, target_character_id, payload)
      values ('item-player-to-player', $1, $2, $3, $4::jsonb)
    `,
    [
      actor.sub,
      source.id,
      target.id,
      JSON.stringify({
        item: transferredItem,
        sourceKey: source.key,
        targetKey: target.key
      })
    ]
  );

  return {
    item: transferredItem,
    sourceKey: source.key,
    targetKey: target.key
  };
}

async function transferMemoryBetweenPlayers(client, actor, sourceKey, targetKey, memoryIndex) {
  const source = await getCharacterByKey(client, sourceKey, { forUpdate: true });
  const target = await getCharacterByKey(client, targetKey, { forUpdate: true });

  if (!source || !target) throw httpError(404, "Ficha de origem ou destino não encontrada.");
  if (source.kind !== "player" || target.kind !== "player") {
    throw httpError(400, "A transferência só pode acontecer entre jogadores.");
  }
  if (source.id === target.id) {
    throw httpError(400, "A origem e o destino não podem ser a mesma ficha.");
  }

  assertCharacterAccess(actor, source, "write");

  const sourceData = normalizeSheetData(source.data || {}, "player", source.name);
  const targetData = normalizeSheetData(target.data || {}, "player", target.name);
  const index = Number.parseInt(memoryIndex, 10);

  if (Number.isNaN(index) || index < 0 || index >= sourceData.ownedMemories.length) {
    throw httpError(404, "Memória não encontrada.");
  }

  const transferredMemory = normalizeOwnedMemory(sourceData.ownedMemories[index]);
  sourceData.ownedMemories.splice(index, 1);
  targetData.ownedMemories.push(transferredMemory);

  await persistCharacterData(client, source, sourceData);
  await persistCharacterData(client, target, targetData);

  await client.query(
    `
      insert into transfer_audit (transfer_type, actor_user_id, source_character_id, target_character_id, payload)
      values ('memory-player-to-player', $1, $2, $3, $4::jsonb)
    `,
    [
      actor.sub,
      source.id,
      target.id,
      JSON.stringify({
        memory: transferredMemory,
        sourceKey: source.key,
        targetKey: target.key
      })
    ]
  );

  return {
    memory: transferredMemory,
    sourceKey: source.key,
    targetKey: target.key
  };
}

async function rollMonsterMemoryDrop(client, actor, monsterKey, dropIndex) {
  const monster = await getCharacterByKey(client, monsterKey);
  if (!monster) throw httpError(404, "Monstro não encontrado.");
  if (monster.kind !== "monster") throw httpError(400, "A rolagem só vale para monstros.");
  if (actor.role !== "master") throw httpError(403, "Apenas o mestre pode rolar drops de memória.");

  const monsterData = normalizeSheetData(monster.data || {}, "monster", monster.name);
  const index = Number.parseInt(dropIndex, 10);
  const drop = monsterData.memoryDrops[index];

  if (!drop) throw httpError(404, "Drop de memória não encontrado.");

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

async function awardMonsterMemoryDrop(client, actor, monsterKey, dropIndex, targetKey) {
  if (actor.role !== "master") throw httpError(403, "Apenas o mestre pode enviar memórias de monstros.");

  const monster = await getCharacterByKey(client, monsterKey, { forUpdate: true });
  const target = await getCharacterByKey(client, targetKey, { forUpdate: true });

  if (!monster || !target) throw httpError(404, "Monstro ou destino não encontrado.");
  if (monster.kind !== "monster") throw httpError(400, "A origem precisa ser um monstro.");
  if (!["player", "npc"].includes(target.kind)) {
    throw httpError(400, "Memórias de monstro só podem ser enviadas para jogadores ou NPCs.");
  }

  const monsterData = normalizeSheetData(monster.data || {}, "monster", monster.name);
  const targetData = normalizeSheetData(target.data || {}, target.kind, target.name);
  const index = Number.parseInt(dropIndex, 10);
  const drop = monsterData.memoryDrops[index];

  if (!drop) throw httpError(404, "Drop de memória não encontrado.");

  const memory = normalizeOwnedMemory({
    name: drop.name,
    desc: drop.desc,
    source: monster.name
  });

  targetData.ownedMemories.push(memory);
  await persistCharacterData(client, target, targetData);

  await client.query(
    `
      insert into transfer_audit (transfer_type, actor_user_id, source_character_id, target_character_id, payload)
      values ('memory-drop-award', $1, $2, $3, $4::jsonb)
    `,
    [
      actor.sub,
      monster.id,
      target.id,
      JSON.stringify({
        memory,
        monsterKey: monster.key,
        targetKey: target.key
      })
    ]
  );

  return {
    memory,
    monsterKey: monster.key,
    targetKey: target.key
  };
}

module.exports = {
  assertCharacterAccess,
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
  rollMonsterMemoryDrop,
  saveCharacterBundle,
  transferItemBetweenPlayers,
  transferMemoryBetweenPlayers
};



