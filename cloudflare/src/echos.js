import { normalizeEchoRarity, normalizeSheetData } from "./sheet.js";

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

/* ── RANK E XP DO ECHO ─────────────────────────────────────────────
   O Echo evolui com rank próprio (independente do dono). Começa em
   rank 1 e sobe quando o mestre concede XP. O limite cresce a cada
   rank; o rank 7 é o máximo (sem novo limite). */

const ECHO_RANKS = [
  { rank: 1, name: "Fragmento" },
  { rank: 2, name: "Sombra" },
  { rank: 3, name: "Forma" },
  { rank: 4, name: "Essência" },
  { rank: 5, name: "Manifestação" },
  { rank: 6, name: "Eco Verdadeiro" },
  { rank: 7, name: "Ressonância" }
];

const ECHO_XP_LIMIT_BY_RANK = {
  1: 100,
  2: 250,
  3: 500,
  4: 1000,
  5: 2000,
  6: 4000
};

const ECHO_ATTRIBUTES = ["forca", "agilidade", "inteligencia", "resistencia", "alma"];
const ECHO_OWNER_KINDS = new Set(["player", "npc"]);

function toInt(value, fallback = 0) {
  const numeric = Number.parseInt(value, 10);
  return Number.isNaN(numeric) ? fallback : numeric;
}

function clampEchoRank(value) {
  const numeric = toInt(value, 1);
  return Math.min(7, Math.max(1, numeric));
}

function getEchoRankName(rank) {
  return ECHO_RANKS.find(entry => entry.rank === clampEchoRank(rank))?.name || ECHO_RANKS[0].name;
}

function getEchoXpLimit(rank) {
  return ECHO_XP_LIMIT_BY_RANK[clampEchoRank(rank)] || 0;
}

function createSkillId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEchoHab(hab = {}) {
  const type = String(hab.type || "ativa").trim().toLowerCase() === "passiva" ? "passiva" : "ativa";
  return {
    id: String(hab.id || createSkillId("echohab")),
    name: String(hab.name || ""),
    type,
    trigger: String(hab.trigger || hab.gatilho || ""),
    desc: String(hab.desc || "")
  };
}

function normalizeEchoPassive(passive = {}) {
  return {
    id: String(passive.id || createSkillId("echopass")),
    name: String(passive.name || ""),
    source: String(passive.source || ""),
    effect: String(passive.effect || passive.desc || "")
  };
}

function normalizeEchoStats(stats = {}) {
  const normalized = {};
  ECHO_ATTRIBUTES.forEach(attr => {
    normalized[attr] = Math.max(0, toInt(stats[attr], 0));
  });
  normalized.vidaMax = Math.max(0, toInt(stats.vidaMax, 0));
  normalized.vidaAtual = Math.max(0, toInt(stats.vidaAtual, normalized.vidaMax));
  normalized.integMax = Math.max(0, toInt(stats.integMax, 0));
  normalized.integAtual = Math.max(0, toInt(stats.integAtual, normalized.integMax));
  return normalized;
}

function buildEchoStatsFromMonster(monsterData = {}) {
  return normalizeEchoStats({
    forca: toInt(monsterData.attrForca, 0),
    agilidade: toInt(monsterData.attrAgilidade, 0),
    inteligencia: toInt(monsterData.attrInteligencia, 0),
    resistencia: toInt(monsterData.attrResistencia, 0),
    alma: toInt(monsterData.attrAlma, 0),
    vidaMax: toInt(monsterData.vidaMax, 0),
    vidaAtual: toInt(monsterData.vidaAtual, 0) || toInt(monsterData.vidaMax, 0),
    integMax: toInt(monsterData.integMax, 0),
    integAtual: toInt(monsterData.integAtual, 0) || toInt(monsterData.integMax, 0)
  });
}

function parseEchoData(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeEchoData(data = {}) {
  return {
    avatar: String(data.avatar || ""),
    desc: String(data.desc || ""),
    habs: Array.isArray(data.habs) ? data.habs.map(normalizeEchoHab) : [],
    passives: Array.isArray(data.passives) ? data.passives.map(normalizeEchoPassive) : [],
    stats: normalizeEchoStats(data.stats || {})
  };
}

function mapEchoRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerCharacterId: row.owner_character_id,
    ownerKey: row.owner_key || null,
    ownerName: row.owner_name || null,
    ownerUserId: row.owner_user_id || null,
    sourceMonsterId: row.source_monster_id || null,
    sourceMonsterName: row.source_monster_name || "",
    name: row.name || "",
    customName: row.custom_name || "",
    rarity: normalizeEchoRarity(row.rarity),
    rank: clampEchoRank(row.rank),
    xp: Math.max(0, toInt(row.xp, 0)),
    notes: row.notes || "",
    data: parseEchoData(row.data_json),
    obtainedAt: row.obtained_at || null,
    grantedByUserId: row.granted_by_user_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function serializeEcho(echo) {
  if (!echo) return null;
  const data = normalizeEchoData(echo.data);
  const rank = clampEchoRank(echo.rank);
  const xpLimit = getEchoXpLimit(rank);
  const rawXp = Math.max(0, toInt(echo.xp, 0));
  const xp = xpLimit > 0 ? Math.min(rawXp, xpLimit) : rawXp;

  return {
    id: echo.id,
    ownerCharacterId: echo.ownerCharacterId,
    ownerKey: echo.ownerKey,
    ownerName: echo.ownerName,
    sourceMonsterId: echo.sourceMonsterId,
    sourceMonsterName: echo.sourceMonsterName,
    name: echo.name,
    customName: echo.customName,
    displayName: String(echo.customName || echo.name || "Echo").trim() || "Echo",
    rarity: normalizeEchoRarity(echo.rarity),
    rank,
    rankName: getEchoRankName(rank),
    xp,
    xpLimit,
    saturation: xpLimit > 0 ? Number(Math.min(1, xp / xpLimit).toFixed(3)) : 1,
    notes: echo.notes || "",
    avatar: data.avatar,
    desc: data.desc,
    habs: data.habs,
    passives: data.passives,
    stats: data.stats,
    obtainedAt: echo.obtainedAt,
    grantedByUserId: echo.grantedByUserId,
    createdAt: echo.createdAt,
    updatedAt: echo.updatedAt
  };
}

const ECHO_SELECT = `
  select
    e.id,
    e.owner_character_id,
    e.source_monster_id,
    e.source_monster_name,
    e.name,
    e.custom_name,
    e.rarity,
    e.rank,
    e.xp,
    e.notes,
    e.data_json,
    e.obtained_at,
    e.granted_by_user_id,
    e.created_at,
    e.updated_at,
    o.sheet_key as owner_key,
    o.name as owner_name,
    o.owner_user_id as owner_user_id
  from echos e
  left join characters o on o.id = e.owner_character_id
`;

async function getCharacterRowByKey(env, key) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (!normalizedKey) return null;

  const row = await env.DB.prepare(
    `
      select id, sheet_key, kind, owner_user_id, name, data_json
      from characters
      where lower(sheet_key) = lower(?)
      limit 1
    `
  )
    .bind(normalizedKey)
    .first();

  if (!row) return null;
  return {
    id: row.id,
    key: row.sheet_key,
    kind: row.kind,
    ownerUserId: row.owner_user_id || null,
    name: row.name,
    data: parseEchoData(row.data_json)
  };
}

async function getEchoRowById(env, echoId) {
  const id = String(echoId || "").trim();
  if (!id) return null;
  const row = await env.DB.prepare(`${ECHO_SELECT} where e.id = ? limit 1`).bind(id).first();
  return mapEchoRow(row);
}

function assertEchoReadAccess(actor, echo) {
  if (!actor || !echo) {
    throw jsonError("Echo não encontrado.", 404);
  }
  if (actor.role === "master") return true;
  if (echo.ownerUserId && echo.ownerUserId === actor.sub) return true;
  throw jsonError("Você não pode acessar este Echo.", 403);
}

async function getEchoBundleById(env, actor, echoId) {
  const echo = await getEchoRowById(env, echoId);
  if (!echo) throw jsonError("Echo não encontrado.", 404);
  assertEchoReadAccess(actor, echo);
  return serializeEcho(echo);
}

async function listEchos(env, actor, options = {}) {
  let rows;

  if (actor.role === "master") {
    const ownerKey = String(options.ownerKey || "").trim().toLowerCase();
    if (ownerKey) {
      const owner = await getCharacterRowByKey(env, ownerKey);
      if (!owner) return [];
      rows = await env.DB.prepare(
        `${ECHO_SELECT} where e.owner_character_id = ? order by e.created_at desc`
      )
        .bind(owner.id)
        .all();
    } else {
      rows = await env.DB.prepare(`${ECHO_SELECT} order by e.created_at desc`).all();
    }
  } else {
    rows = await env.DB.prepare(
      `${ECHO_SELECT} where o.owner_user_id = ? order by e.created_at desc`
    )
      .bind(actor.sub)
      .all();
  }

  return (rows?.results || []).map(row => serializeEcho(mapEchoRow(row)));
}

async function insertEchoAudit(env, transferType, actorUserId, sourceCharacterId, targetCharacterId, payload) {
  await env.DB.prepare(
    `
      insert into transfer_audit (
        id, transfer_type, actor_user_id, source_character_id, target_character_id, payload_json, created_at
      )
      values (?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      crypto.randomUUID(),
      transferType,
      actorUserId || null,
      sourceCharacterId || null,
      targetCharacterId || null,
      JSON.stringify(payload || {}),
      new Date().toISOString()
    )
    .run();
}

async function persistEcho(env, echo) {
  const now = new Date().toISOString();
  const data = normalizeEchoData(echo.data);
  await env.DB.prepare(
    `
      update echos
      set name = ?, custom_name = ?, rarity = ?, rank = ?, xp = ?, notes = ?, data_json = ?, updated_at = ?
      where id = ?
    `
  )
    .bind(
      String(echo.name || "Echo"),
      String(echo.customName || ""),
      normalizeEchoRarity(echo.rarity),
      clampEchoRank(echo.rank),
      Math.max(0, toInt(echo.xp, 0)),
      String(echo.notes || ""),
      JSON.stringify(data),
      now,
      echo.id
    )
    .run();

  return getEchoRowById(env, echo.id);
}

async function rollMonsterEchoDrop(env, actor, monsterKey) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode rolar o drop de Echo.", 403);
  }

  const monster = await getCharacterRowByKey(env, monsterKey);
  if (!monster) {
    throw jsonError("Monstro não encontrado.", 404);
  }
  if (monster.kind !== "monster") {
    throw jsonError("O drop de Echo só vale para monstros.", 400);
  }

  const monsterData = normalizeSheetData(monster.data || {}, "monster", monster.name);
  const config = monsterData.echoDropConfig || { chance: "0", defaultRarity: "comum" };
  const chance = Number.parseFloat(config.chance) || 0;
  const rolled = Number((Math.random() * 100).toFixed(1));
  const success = chance > 0 && rolled <= chance;

  return {
    rolled,
    chance,
    success,
    defaultRarity: normalizeEchoRarity(config.defaultRarity),
    monsterName: monster.name
  };
}

async function awardMonsterEchoDrop(env, actor, monsterKey, targetKey, options = {}) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode conceder Echos.", 403);
  }

  const monster = await getCharacterRowByKey(env, monsterKey);
  const target = await getCharacterRowByKey(env, targetKey);

  if (!monster || !target) {
    throw jsonError("Monstro ou destino não encontrado.", 404);
  }
  if (monster.kind !== "monster") {
    throw jsonError("A origem do Echo precisa ser um monstro.", 400);
  }
  if (!ECHO_OWNER_KINDS.has(target.kind)) {
    throw jsonError("Echos só podem ser concedidos a jogadores ou NPCs.", 400);
  }

  const monsterData = normalizeSheetData(monster.data || {}, "monster", monster.name);
  const config = monsterData.echoDropConfig || { chance: "0", defaultRarity: "comum" };
  const stats = options.stats ? normalizeEchoStats(options.stats) : buildEchoStatsFromMonster(monsterData);

  const data = normalizeEchoData({
    avatar: String(monsterData.avatar || ""),
    desc: String(options.desc || monsterData.charNotes || ""),
    habs: Array.isArray(monsterData.habs) ? monsterData.habs : [],
    passives: Array.isArray(monsterData.passives) ? monsterData.passives : [],
    stats
  });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rarity = normalizeEchoRarity(options.rarity || config.defaultRarity);

  await env.DB.prepare(
    `
      insert into echos (
        id, owner_character_id, source_monster_id, source_monster_name,
        name, custom_name, rarity, rank, xp, notes, data_json,
        obtained_at, granted_by_user_id, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, '', ?, 1, 0, '', ?, ?, ?, ?, ?)
    `
  )
    .bind(
      id,
      target.id,
      monster.id,
      monster.name,
      monster.name,
      rarity,
      JSON.stringify(data),
      now,
      actor.sub,
      now,
      now
    )
    .run();

  await insertEchoAudit(env, "echo-drop-award", actor.sub, monster.id, target.id, {
    echoId: id,
    monsterKey: monster.key,
    targetKey: target.key,
    rarity
  });

  const echo = await getEchoRowById(env, id);
  return {
    echo: serializeEcho(echo),
    monsterKey: monster.key,
    targetKey: target.key
  };
}

async function updateEcho(env, actor, echoId, patch = {}) {
  const echo = await getEchoRowById(env, echoId);
  if (!echo) throw jsonError("Echo não encontrado.", 404);
  assertEchoReadAccess(actor, echo);

  const data = normalizeEchoData(echo.data);
  const next = { ...echo, data };

  // Jogador edita apenas nome customizado e anotações; o resto é do mestre.
  if (Object.prototype.hasOwnProperty.call(patch, "customName")) {
    next.customName = String(patch.customName || "").slice(0, 80);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    next.notes = String(patch.notes || "").slice(0, 2000);
  }

  if (actor.role === "master") {
    if (Object.prototype.hasOwnProperty.call(patch, "name")) {
      next.name = String(patch.name || "Echo").slice(0, 80) || "Echo";
    }
    if (Object.prototype.hasOwnProperty.call(patch, "rarity")) {
      next.rarity = normalizeEchoRarity(patch.rarity);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "rank")) {
      next.rank = clampEchoRank(patch.rank);
      next.xp = Math.min(next.xp, getEchoXpLimit(next.rank) || next.xp);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "xp")) {
      next.xp = Math.max(0, toInt(patch.xp, 0));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "desc")) {
      next.data.desc = String(patch.desc || "");
    }
    if (Object.prototype.hasOwnProperty.call(patch, "avatar")) {
      next.data.avatar = String(patch.avatar || "");
    }
    if (Array.isArray(patch.habs)) {
      next.data.habs = patch.habs.map(normalizeEchoHab);
    }
    if (Array.isArray(patch.passives)) {
      next.data.passives = patch.passives.map(normalizeEchoPassive);
    }
    if (patch.stats && typeof patch.stats === "object") {
      next.data.stats = normalizeEchoStats(patch.stats);
    }
  }

  const saved = await persistEcho(env, next);
  return serializeEcho(saved);
}

// Atualiza só o avatar (usado pela rota de upload de imagem do Echo).
async function setEchoAvatar(env, actor, echoId, avatarUrl) {
  const echo = await getEchoRowById(env, echoId);
  if (!echo) throw jsonError("Echo não encontrado.", 404);
  assertEchoReadAccess(actor, echo);

  const next = { ...echo, data: normalizeEchoData(echo.data) };
  next.data.avatar = String(avatarUrl || "");
  const saved = await persistEcho(env, next);
  return serializeEcho(saved);
}

async function deleteEcho(env, actor, echoId) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode remover Echos.", 403);
  }
  const echo = await getEchoRowById(env, echoId);
  if (!echo) throw jsonError("Echo não encontrado.", 404);

  await env.DB.prepare("delete from echos where id = ?").bind(echo.id).run();
  return { ok: true, id: echo.id };
}

async function grantEchoExperience(env, actor, echoId, amount) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode conceder XP ao Echo.", 403);
  }
  const echo = await getEchoRowById(env, echoId);
  if (!echo) throw jsonError("Echo não encontrado.", 404);

  const gain = Math.max(0, toInt(amount, 0));
  let rank = clampEchoRank(echo.rank);
  let xp = Math.max(0, toInt(echo.xp, 0)) + gain;
  const rankUps = [];

  while (rank < 7) {
    const limit = getEchoXpLimit(rank);
    if (limit <= 0 || xp < limit) break;
    xp -= limit;
    rank += 1;
    rankUps.push(rank);
  }
  if (rank >= 7) xp = 0;

  const saved = await persistEcho(env, { ...echo, rank, xp });

  return {
    echo: serializeEcho(saved),
    summary: {
      gained: gain,
      rankUps,
      rank,
      rankName: getEchoRankName(rank)
    }
  };
}

// Transferência direta (somente mestre). Jogadores usam o fluxo de propostas
// (transfer_proposals, tipo 'echo') tratado em characters.js.
async function transferEchoBetweenPlayers(env, actor, echoId, targetKey) {
  if (actor.role !== "master") {
    throw jsonError("Transferência direta de Echo exige o mestre. Jogadores usam proposta com aceite.", 403);
  }
  const echo = await getEchoRowById(env, echoId);
  if (!echo) throw jsonError("Echo não encontrado.", 404);

  const target = await getCharacterRowByKey(env, targetKey);
  if (!target) throw jsonError("Ficha de destino não encontrada.", 404);
  if (!ECHO_OWNER_KINDS.has(target.kind)) {
    throw jsonError("Echos só podem pertencer a jogadores ou NPCs.", 400);
  }
  if (echo.ownerCharacterId === target.id) {
    throw jsonError("O Echo já pertence a esta ficha.", 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare("update echos set owner_character_id = ?, updated_at = ? where id = ?")
    .bind(target.id, now, echo.id)
    .run();

  await insertEchoAudit(env, "echo-player-to-player", actor.sub, echo.ownerCharacterId, target.id, {
    echoId: echo.id,
    targetKey: target.key
  });

  const saved = await getEchoRowById(env, echo.id);
  return {
    echo: serializeEcho(saved),
    targetKey: target.key
  };
}

export {
  ECHO_RANKS,
  ECHO_XP_LIMIT_BY_RANK,
  awardMonsterEchoDrop,
  deleteEcho,
  getEchoBundleById,
  grantEchoExperience,
  listEchos,
  rollMonsterEchoDrop,
  setEchoAvatar,
  transferEchoBetweenPlayers,
  updateEcho
};
