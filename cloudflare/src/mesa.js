const DEFAULT_SCENE_ID = "default";
const MAX_TOKENS = 120;
const MAX_TEXT_LENGTH = 160;

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, MAX_TEXT_LENGTH);
}

function normalizeOrder(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 1;
  return Math.max(1, Math.min(9999, numeric));
}

function normalizeSceneVersion(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, numeric);
}

function parseSceneData(value) {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeSceneToken(token) {
  const characterKey = normalizeText(token?.characterKey || token?.id).toLowerCase();
  if (!characterKey) return null;

  return {
    id: normalizeText(token?.id || characterKey).toLowerCase(),
    characterKey,
    x: Math.round(clamp(token?.x, 0, 100) * 100) / 100,
    y: Math.round(clamp(token?.y, 0, 100) * 100) / 100,
    visibleToPlayers: token?.visibleToPlayers !== false,
    statsVisibleToPlayers: token?.statsVisibleToPlayers === true,
    order: normalizeOrder(token?.order)
  };
}

function normalizeMesaScene(payload) {
  const source =
    payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;
  const tokens = Array.isArray(source?.tokens)
    ? source.tokens.map(normalizeSceneToken).filter(Boolean).slice(0, MAX_TOKENS)
    : [];

  return {
    sceneVersion: normalizeSceneVersion(source?.sceneVersion),
    previewPlayerView: Boolean(source?.previewPlayerView),
    selectedTokenId: normalizeText(source?.selectedTokenId).toLowerCase(),
    tokens
  };
}

function mapSceneRow(row) {
  const data = normalizeMesaScene(parseSceneData(row?.data_json));
  return {
    id: row?.id || DEFAULT_SCENE_ID,
    data,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    updatedByUserId: row?.updated_by_user_id || null
  };
}

async function getMesaScene(env) {
  const row = await env.DB.prepare(
    `
      select id, data_json, created_at, updated_at, updated_by_user_id
      from mesa_scenes
      where id = ?
      limit 1
    `
  )
    .bind(DEFAULT_SCENE_ID)
    .first();

  return mapSceneRow(row);
}

async function saveMesaScene(env, actor, payload) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode salvar a cena da Mesa.", 403);
  }

  const data = normalizeMesaScene(payload);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `
      insert into mesa_scenes (
        id, data_json, created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        data_json = excluded.data_json,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = excluded.updated_at
    `
  )
    .bind(DEFAULT_SCENE_ID, JSON.stringify(data), actor.sub, actor.sub, now, now)
    .run();

  return getMesaScene(env);
}

export { getMesaScene, normalizeMesaScene, saveMesaScene };
