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

const TOKEN_TYPES = new Set(["player", "npc", "monster", "echo"]);
const MAX_URL_LENGTH = 600;

function normalizeTokenType(value) {
  const type = String(value || "").trim().toLowerCase();
  return TOKEN_TYPES.has(type) ? type : "";
}

// Avatares chegam como URL (R2/HTTP). Base64/data-URIs são rejeitados para a
// cena não inflar o D1 — o cliente cai no fallback de iniciais.
function normalizeTokenImageUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.length > MAX_URL_LENGTH) return "";
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}

function normalizeVital(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(999999, Math.round(numeric)));
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
    layer: token?.layer === "dm" ? "dm" : "tokens",
    order: normalizeOrder(token?.order),
    tokenScale: Math.round(clamp(token?.tokenScale, 0.25, 4) * 100) / 100 || 1,
    // Dados de exibição embutidos: permitem que jogadores (que não recebem
    // NPCs/monstros no /api/directory) renderizem qualquer token da cena.
    type: normalizeTokenType(token?.type),
    name: normalizeText(token?.name),
    ownerUsername: normalizeText(token?.ownerUsername).toLowerCase(),
    imageUrl: normalizeTokenImageUrl(token?.imageUrl),
    currentLife: normalizeVital(token?.currentLife),
    maxLife: normalizeVital(token?.maxLife),
    currentIntegrity: normalizeVital(token?.currentIntegrity),
    maxIntegrity: normalizeVital(token?.maxIntegrity)
  };
}

// Desenhos oficiais da cena: traços em frações 0–1 do palco, mesmos campos do
// mesa-drawing.js. Caps evitam inflar o D1; a camada "dm" é filtrada no GET
// para não-mestres (mesmo contrato dos tokens secretos).
const DRAW_TOOLS = new Set(["pencil", "line", "rect", "circle"]);
const MAX_DRAWINGS = 300;
const MAX_DRAW_POINTS = 200;

function normalizeDrawFraction(value) {
  return Math.round(clamp(value, 0, 1) * 10000) / 10000;
}

function normalizeSceneDrawing(stroke) {
  if (!stroke || typeof stroke !== "object") return null;
  const tool = String(stroke.tool || "").trim().toLowerCase();
  if (!DRAW_TOOLS.has(tool)) return null;

  const color = /^#[0-9a-f]{3,8}$/i.test(String(stroke.color || "")) ? String(stroke.color) : "#e84040";
  const width = clamp(stroke.width, 1, 12) || 3;
  const normalized = {
    id: normalizeText(stroke.id).slice(0, 40),
    tool,
    color,
    width,
    layer: stroke.layer === "dm" ? "dm" : "tokens",
    x1: normalizeDrawFraction(stroke.x1),
    y1: normalizeDrawFraction(stroke.y1),
    x2: normalizeDrawFraction(stroke.x2),
    y2: normalizeDrawFraction(stroke.y2),
    points: null
  };
  if (!normalized.id) return null;

  if (tool === "pencil") {
    const points = Array.isArray(stroke.points) ? stroke.points : [];
    normalized.points = points
      .slice(0, MAX_DRAW_POINTS)
      .filter(point => Array.isArray(point) && point.length >= 2)
      .map(point => [normalizeDrawFraction(point[0]), normalizeDrawFraction(point[1])]);
    if (normalized.points.length < 2) return null;
  }

  return normalized;
}

// Mapa oficial da cena: referência ao arquivo no R2 + transform normalizado.
// Permite que jogadores carreguem o mapa no boot sem o mestre online.
function normalizeSceneMap(map) {
  if (!map || typeof map !== "object") return null;
  const url = normalizeTokenImageUrl(map.url);
  if (!url) return null;

  const rawTransform = map.transform && typeof map.transform === "object" ? map.transform : {};
  return {
    id: normalizeText(map.id).slice(0, 80),
    url,
    transform: {
      xFrac: Math.round(clamp(rawTransform.xFrac ?? 0, -8, 8) * 10000) / 10000,
      yFrac: Math.round(clamp(rawTransform.yFrac ?? 0, -8, 8) * 10000) / 10000,
      scale: Math.round(clamp(rawTransform.scale ?? 1, 0.05, 20) * 10000) / 10000 || 1
    }
  };
}

// Grade oficial da cena (Etapa 42): amarrada ao MAPA — a célula é uma fração
// da largura exibida da imagem (cellFrac), então pan/zoom do mapa movem a
// grade junto sem re-sincronizar nada. Visível a todos (sem camada "dm").
function normalizeSceneGrid(grid) {
  if (!grid || typeof grid !== "object") return null;
  if (grid.enabled !== true && grid.snap !== true) return null;
  const color = /^#[0-9a-f]{3,8}$/i.test(String(grid.color || "")) ? String(grid.color) : "#ffffff";
  return {
    enabled: grid.enabled === true,
    snap: grid.snap === true,
    cellFrac: Math.round(clamp(grid.cellFrac ?? 0.05, 0.01, 0.25) * 10000) / 10000,
    offsetXFrac: Math.round(clamp(grid.offsetXFrac ?? 0, 0, 1) * 10000) / 10000,
    offsetYFrac: Math.round(clamp(grid.offsetYFrac ?? 0, 0, 1) * 10000) / 10000,
    color,
    opacity: Math.round(clamp(grid.opacity ?? 0.18, 0.05, 0.8) * 100) / 100
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

  const rawInit = source?.initiative;
  const initiative = rawInit && rawInit.active ? {
    active:       true,
    round:        (Number.isFinite(rawInit.round) && rawInit.round > 0) ? Math.floor(rawInit.round) : 1,
    currentIndex: Number.isFinite(rawInit.currentIndex) ? Math.floor(rawInit.currentIndex) : -1,
    order: Array.isArray(rawInit.order) ? rawInit.order.slice(0, 50).map(e => ({
      id:           String(e?.id || e?.characterKey || "").slice(0, 64),
      characterKey: String(e?.characterKey || e?.id || "").slice(0, 64),
      name:         String(e?.name || "?").slice(0, 64),
      roll:         Number.isFinite(e?.roll) ? e.roll : 0,
      modifier:     Number.isFinite(e?.modifier) ? e.modifier : 0,
      total:        Number.isFinite(e?.total) ? e.total : 0,
      rolled:       Boolean(e?.rolled)
    })) : []
  } : { active: false, round: 1, currentIndex: -1, order: [] };

  const drawings = Array.isArray(source?.drawings)
    ? source.drawings.map(normalizeSceneDrawing).filter(Boolean).slice(0, MAX_DRAWINGS)
    : [];

  return {
    sceneVersion: normalizeSceneVersion(source?.sceneVersion),
    selectedTokenId: normalizeText(source?.selectedTokenId).toLowerCase(),
    tokens,
    initiative,
    map: normalizeSceneMap(source?.map),
    grid: normalizeSceneGrid(source?.grid),
    drawings
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

async function getMesaScene(env, actor) {
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

  const scene = mapSceneRow(row);
  if (actor?.role !== "master") {
    // Traços da camada secreta do mestre não vazam para jogadores.
    scene.data.drawings = scene.data.drawings.filter(stroke => stroke.layer !== "dm");
    scene.data.tokens = scene.data.tokens
      .filter(token => token.layer !== "dm")
      .map(token => {
        if (token.statsVisibleToPlayers) return token;
        // Vitais de tokens com status oculto não vazam para jogadores.
        return {
          ...token,
          currentLife: null,
          maxLife: null,
          currentIntegrity: null,
          maxIntegrity: null
        };
      });
  }
  return scene;
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

  return getMesaScene(env, actor);
}

export { getMesaScene, normalizeMesaScene, saveMesaScene };
