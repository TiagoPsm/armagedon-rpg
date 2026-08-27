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

// Marcadores de status (Etapa 46): whitelist espelhada de js/mesa-stage.js
// (MESA_STATUS_MARKERS) — mudou la, mude aqui. Max 8 por token.
const SCENE_STATUS_MARKERS = new Set([
  "veneno", "sangramento", "queimando", "congelado", "atordoado", "derrubado",
  "amaldicoado", "abencoado", "medo", "invisivel", "inconsciente", "morto"
]);
const MAX_STATUS_MARKERS = 8;

function normalizeSceneStatusMarkers(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach(rawKey => {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!SCENE_STATUS_MARKERS.has(key) || seen.has(key)) return;
    seen.add(key);
    result.push(key);
  });
  return result.slice(0, MAX_STATUS_MARKERS);
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
    // Guarda-corpo espelhado de MESA_TOKEN_SCALE_MIN/MAX em js/mesa-stage.js —
    // mudou la, mude aqui. O tamanho real vem do encaixe em celulas (grade);
    // o piso caiu para 0,1 na Etapa 69 para caber 1 celula em grades finas.
    tokenScale: Math.round(clamp(token?.tokenScale, 0.1, 12) * 100) / 100 || 1,
    statusMarkers: normalizeSceneStatusMarkers(token?.statusMarkers),
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

// Fog of War (Etapa 47): névoa amarrada ao mapa. Ops de pincel circular em
// frações do mapa exibido ({ mode, u, v, r }), aplicadas na ordem; névoa
// ativa sem ops = tudo coberto. Cap de 400 ops. Espelha js/mesa-fog.js.
const MAX_FOG_OPS = 400;

function normalizeSceneFog(fog) {
  if (!fog || typeof fog !== "object") return null;
  const round4 = value => Math.round(Number(value) * 10000) / 10000;
  const clampNum = (value, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  };
  const ops = (Array.isArray(fog.ops) ? fog.ops : [])
    .map(op => {
      if (!op || typeof op !== "object") return null;
      const mode = op.mode === "hide" ? "hide" : (op.mode === "reveal" ? "reveal" : null);
      const u = clampNum(op.u, -1, 2);
      const v = clampNum(op.v, -1, 2);
      const r = clampNum(op.r, 0.005, 1);
      if (!mode || u === null || v === null || r === null) return null;
      return { mode, u: round4(u), v: round4(v), r: round4(r) };
    })
    .filter(Boolean)
    .slice(0, MAX_FOG_OPS);
  const enabled = fog.enabled === true;
  // Base do mapa (2026-07-28): "revealed" = tudo descoberto com a nevoa ainda
  // ativa (as ops de "hide" e que cobrem). Cena antiga sem o campo e qualquer
  // valor invalido caem em "hidden", o comportamento de sempre.
  const base = fog.base === "revealed" ? "revealed" : "hidden";
  if (!enabled && !ops.length && base === "hidden") return null;
  return { enabled, base, ops };
}

// Desenhos oficiais da cena: traços em frações 0–1 do palco, mesmos campos do
// mesa-drawing.js. Caps evitam inflar o D1; a camada "dm" é filtrada no GET
// para não-mestres (mesmo contrato dos tokens secretos).
/* Ferramentas aceitas na cena (Etapa 123; texto retirado na Etapa 126).
 *
 * Esta lista e o portao: forma fora dela e DESCARTADA em silencio ao salvar —
 * apareceria na tela de quem desenhou e sumiria no F5. Por isso cone e seta so
 * puderam existir junto com um deploy do Worker.
 *
 * cone e arrow reaproveitam x1,y1 -> x2,y2 (origem e ponta), sem campo novo.
 * Nenhuma forma tem campo proprio: `text`, `size` e `wrap` sairam com a
 * ferramenta de texto na Etapa 126 e nao ha mais o que preservar aqui. */
const DRAW_TOOLS = new Set(["pencil", "line", "rect", "circle", "cone", "arrow"]);
// Etapa 74: tetos ampliados (300→1500 traços, 200→400 pontos), junto com o
// corpo do PUT /mesa/scene (256KB→1MB em index.js). Devem seguir iguais aos do
// cliente (js/mesa-drawing.js), senão o que fica na tela diverge do que salva.
const MAX_DRAWINGS = 1500;
const MAX_DRAW_POINTS = 400;

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
    // Autor do traço (Etapa 76): define quem pode apagá-lo. PRECISA
    // sobreviver ao round-trip — se for descartado aqui, todo traço volta
    // do banco como órfão e ninguém, além do mestre, apaga o próprio
    // desenho depois de um F5. Traço antigo (sem o campo) fica "" e vira
    // órfão de propósito: só o mestre alcança.
    author: normalizeText(stroke.author).slice(0, 40).toLowerCase(),
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
    // Etapa 54: palco ajustado a proporcao da imagem. Vive DENTRO do map
    // porque so faz sentido com mapa ativo e precisa trocar junto com ele na
    // troca de cena. Default false: cena antiga (sem o campo) mantem o
    // comportamento "cover" e as coordenadas que ja tem salvas.
    fit: map.fit === true,
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
  // Grade desligada, mas com escala propria, ainda vale como grade: a regua
  // funciona sem linha desenhada (Etapa 131).
  const escalaPropria = Number.isFinite(Number(grid.metersPerCell))
    && Math.abs(Number(grid.metersPerCell) - 1.5) > 0.001;
  if (grid.enabled !== true && grid.snap !== true && !escalaPropria) return null;
  const color = /^#[0-9a-f]{3,8}$/i.test(String(grid.color || "")) ? String(grid.color) : "#ffffff";
  return {
    enabled: grid.enabled === true,
    snap: grid.snap === true,
    cellFrac: Math.round(clamp(grid.cellFrac ?? 0.05, 0.01, 0.25) * 10000) / 10000,
    offsetXFrac: Math.round(clamp(grid.offsetXFrac ?? 0, 0, 1) * 10000) / 10000,
    offsetYFrac: Math.round(clamp(grid.offsetYFrac ?? 0, 0, 1) * 10000) / 10000,
    color,
    opacity: Math.round(clamp(grid.opacity ?? 0.18, 0.05, 0.8) * 100) / 100,
    /* Escala da cena (Etapa 131): quanto vale uma celula em metros, o numero
       que a regua usa. Campo que este arquivo nao conhece e descartado em
       silencio, entao sem ele a escala escolhida pelo mestre voltaria aos
       1,5 m no F5. Cena antiga nao tem o campo e cai no default do cliente. */
    metersPerCell: Math.round(clamp(grid.metersPerCell ?? 1.5, 0.1, 5000) * 100) / 100
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

  // Iniciativa (Etapa 77): duas fases — "rolling" (todos rolam no modal
  // central) e "order" (lista de ordem de turno com Voltar/Passar). Cada
  // entrada e um TOKEN da cena, nao um personagem: o mesmo monstro pode estar
  // duas vezes no palco e tem duas iniciativas. Cena antiga (sem `phase`)
  // reabre em "order" quando todo mundo ja tinha rolado.
  const rawInit = source?.initiative;
  const initiative = rawInit && rawInit.active ? (() => {
    const order = Array.isArray(rawInit.order) ? rawInit.order.slice(0, 50).map(e => {
      const type = TOKEN_TYPES.has(String(e?.type)) ? String(e.type) : "npc";
      return {
        id:            String(e?.id || e?.characterKey || "").slice(0, 64),
        characterKey:  String(e?.characterKey || e?.id || "").slice(0, 64),
        ownerUsername: normalizeText(e?.ownerUsername).toLowerCase().slice(0, 64),
        type,
        name:          String(e?.name || "?").slice(0, 64),
        secret:        e?.secret === true,
        // Quem nao e jogador rola sozinho quando os jogadores terminam.
        auto:          e?.auto === undefined ? type !== "player" : e.auto === true,
        roll:          Number.isFinite(e?.roll) ? e.roll : 0,
        modifier:      Number.isFinite(e?.modifier) ? e.modifier : 0,
        total:         Number.isFinite(e?.total) ? e.total : 0,
        rolled:        Boolean(e?.rolled)
      };
    }) : [];
    const declaredPhase = String(rawInit.phase || "");
    const phase = declaredPhase === "rolling" || declaredPhase === "order"
      ? declaredPhase
      : (order.length && order.every(entry => entry.rolled) ? "order" : "rolling");
    return {
      active:       true,
      phase,
      round:        (Number.isFinite(rawInit.round) && rawInit.round > 0) ? Math.floor(rawInit.round) : 1,
      currentIndex: Number.isFinite(rawInit.currentIndex) ? Math.floor(rawInit.currentIndex) : -1,
      order
    };
  })() : { active: false, phase: "rolling", round: 1, currentIndex: -1, order: [] };

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
    fog: normalizeSceneFog(source?.fog),
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

/* ── Múltiplas cenas (Etapa 48) ──────────────────────────────
 * A tabela mesa_scenes já é chaveada por id. O ponteiro da cena ATIVA e os
 * nomes vivem numa linha especial `meta:mesa` (data_json = { activeId,
 * names }), sem migração de schema. Jogadores SEMPRE leem a cena ativa;
 * o mestre pode ler/salvar qualquer cena via ?id=. */

const META_SCENE_ROW_ID = "meta:mesa";
const MAX_SCENES = 20;
const SCENE_NAME_MAX = 60;

/* ── PASTAS DE CENA (Etapa 96) ─────────────────────────────────────
 * Um nivel so, mais a raiz. Vivem no MESMO documento de metadados que ja
 * guarda nomes e cena ativa (linha `meta:mesa`): zero migracao de schema,
 * zero coluna nova. `folders` e a lista; `sceneFolders` diz em que pasta
 * cada cena esta — cena sem entrada esta na raiz. */
const MAX_SCENE_FOLDERS = 12;
const FOLDER_NAME_MAX = 40;

function isValidFolderId(value) {
  return /^f[a-z0-9]{1,32}$/.test(String(value || ""));
}

function normalizeFolderName(value, fallback = "Pasta sem nome") {
  const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, FOLDER_NAME_MAX);
  return name || fallback;
}

function isValidSceneId(value) {
  const id = String(value || "");
  return /^[a-z0-9_-]{1,40}$/.test(id) && !id.startsWith("meta");
}

function normalizeSceneName(value, fallback = "Cena sem nome") {
  const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, SCENE_NAME_MAX);
  return name || fallback;
}

async function getMesaSceneMeta(env) {
  const row = await env.DB.prepare(
    "select data_json from mesa_scenes where id = ? limit 1"
  ).bind(META_SCENE_ROW_ID).first();
  const data = parseSceneData(row?.data_json);
  const activeId = isValidSceneId(data?.activeId) ? String(data.activeId) : DEFAULT_SCENE_ID;
  const names = {};
  if (data?.names && typeof data.names === "object") {
    Object.entries(data.names).forEach(([id, name]) => {
      if (isValidSceneId(id)) names[id] = normalizeSceneName(name);
    });
  }
  const folders = [];
  if (Array.isArray(data?.folders)) {
    data.folders.forEach(folder => {
      if (!isValidFolderId(folder?.id)) return;
      if (folders.some(existente => existente.id === folder.id)) return;
      folders.push({ id: String(folder.id), name: normalizeFolderName(folder?.name) });
    });
  }
  // Cena so fica numa pasta que existe: pasta apagada por outra via deixa a
  // cena na raiz, sem virar orfa apontando para nada.
  const sceneFolders = {};
  if (data?.sceneFolders && typeof data.sceneFolders === "object") {
    Object.entries(data.sceneFolders).forEach(([sceneId, folderId]) => {
      if (!isValidSceneId(sceneId) || !isValidFolderId(folderId)) return;
      if (!folders.some(folder => folder.id === folderId)) return;
      sceneFolders[sceneId] = String(folderId);
    });
  }
  return { activeId, names, folders: folders.slice(0, MAX_SCENE_FOLDERS), sceneFolders };
}

async function saveMesaSceneMeta(env, meta) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `
      insert into mesa_scenes (id, data_json, created_at, updated_at)
      values (?, ?, ?, ?)
      on conflict(id) do update set
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `
  )
    .bind(META_SCENE_ROW_ID, JSON.stringify(meta), now, now)
    .run();
}

function requireMaster(actor, action) {
  if (actor?.role !== "master") {
    throw jsonError(`Apenas o mestre pode ${action}.`, 403);
  }
}

function sceneDisplayName(meta, id) {
  if (meta.names[id]) return meta.names[id];
  return id === DEFAULT_SCENE_ID ? "Cena principal" : "Cena sem nome";
}

/**
 * Lista as cenas com o minimo para desenhar um cartao (Etapa 89).
 *
 * O cartao mostra a imagem de mapa que a cena ja tem e quantos tokens ela
 * carrega. Ler `data_json` inteiro para descobrir isso seria caro — uma cena
 * com desenhos e nevoa passa de centenas de KB, vezes ate 20 cenas, a cada
 * abertura da gaveta. `json_extract`/`json_array_length` fazem a conta DENTRO
 * do SQLite e devolvem so a URL e o numero: a resposta continua pequena.
 */
async function listMesaScenes(env, actor) {
  requireMaster(actor, "listar as cenas");
  const meta = await getMesaSceneMeta(env);
  const rows = await env.DB.prepare(
    `select id, updated_at,
            json_extract(data_json, '$.map.url') as map_url,
            json_array_length(json_extract(data_json, '$.tokens')) as token_count
       from mesa_scenes
      where id not like 'meta%'
      order by created_at asc`
  ).all();
  const scenes = (rows?.results || [])
    .filter(row => isValidSceneId(row.id))
    .map(row => ({
      id: row.id,
      name: sceneDisplayName(meta, row.id),
      updatedAt: row.updated_at || null,
      active: row.id === meta.activeId,
      // Mesma normalizacao da cena: cartao nunca aponta para URL que a cena
      // em si recusaria.
      mapUrl: normalizeTokenImageUrl(row.map_url) || "",
      tokenCount: Number.isFinite(row.token_count) ? Number(row.token_count) : 0,
      folderId: meta.sceneFolders[row.id] || ""
    }));
  // A cena default existe mesmo sem linha (nasce no primeiro PUT).
  if (!scenes.some(scene => scene.id === DEFAULT_SCENE_ID)) {
    scenes.unshift({
      id: DEFAULT_SCENE_ID,
      name: sceneDisplayName(meta, DEFAULT_SCENE_ID),
      updatedAt: null,
      active: meta.activeId === DEFAULT_SCENE_ID,
      mapUrl: "",
      tokenCount: 0,
      folderId: meta.sceneFolders[DEFAULT_SCENE_ID] || ""
    });
  }
  return { scenes, activeId: meta.activeId, folders: meta.folders };
}

async function createMesaScene(env, actor, payload) {
  requireMaster(actor, "criar cenas");
  const existing = await listMesaScenes(env, actor);
  if (existing.scenes.length >= MAX_SCENES) {
    throw jsonError(`Limite de ${MAX_SCENES} cenas atingido.`, 400);
  }
  const id = "s" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const name = normalizeSceneName(payload?.name, "Nova cena");
  const now = new Date().toISOString();
  const emptyScene = normalizeMesaScene({});

  const meta = await getMesaSceneMeta(env);
  meta.names[id] = name;
  await env.DB.batch([
    env.DB.prepare(
      `
        insert into mesa_scenes (id, data_json, created_by_user_id, updated_by_user_id, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?)
      `
    ).bind(id, JSON.stringify(emptyScene), actor.sub, actor.sub, now, now),
    env.DB.prepare(
      `
        insert into mesa_scenes (id, data_json, created_at, updated_at)
        values (?, ?, ?, ?)
        on conflict(id) do update set data_json = excluded.data_json, updated_at = excluded.updated_at
      `
    ).bind(META_SCENE_ROW_ID, JSON.stringify(meta), now, now)
  ]);

  return { id, name, active: false };
}

async function renameMesaScene(env, actor, sceneId, payload) {
  requireMaster(actor, "renomear cenas");
  if (!isValidSceneId(sceneId)) throw jsonError("Cena invalida.", 400);
  const meta = await getMesaSceneMeta(env);
  meta.names[sceneId] = normalizeSceneName(payload?.name);
  await saveMesaSceneMeta(env, meta);
  return { id: sceneId, name: meta.names[sceneId] };
}

async function deleteMesaScene(env, actor, sceneId) {
  requireMaster(actor, "excluir cenas");
  if (!isValidSceneId(sceneId)) throw jsonError("Cena invalida.", 400);
  if (sceneId === DEFAULT_SCENE_ID) {
    throw jsonError("A cena principal nao pode ser excluida.", 400);
  }
  const meta = await getMesaSceneMeta(env);
  if (sceneId === meta.activeId) {
    throw jsonError("Ative outra cena antes de excluir a cena ativa.", 400);
  }
  delete meta.names[sceneId];
  delete meta.sceneFolders[sceneId];   // senao a cena excluida deixaria lixo na pasta
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("delete from mesa_scenes where id = ?").bind(sceneId),
    env.DB.prepare(
      `
        insert into mesa_scenes (id, data_json, created_at, updated_at)
        values (?, ?, ?, ?)
        on conflict(id) do update set data_json = excluded.data_json, updated_at = excluded.updated_at
      `
    ).bind(META_SCENE_ROW_ID, JSON.stringify(meta), now, now)
  ]);
  return { ok: true, id: sceneId };
}

async function activateMesaScene(env, actor, sceneId) {
  requireMaster(actor, "trocar a cena ativa");
  if (!isValidSceneId(sceneId)) throw jsonError("Cena invalida.", 400);
  if (sceneId !== DEFAULT_SCENE_ID) {
    const row = await env.DB.prepare("select id from mesa_scenes where id = ? limit 1").bind(sceneId).first();
    if (!row) throw jsonError("Cena nao encontrada.", 404);
  }
  const meta = await getMesaSceneMeta(env);
  meta.activeId = sceneId;
  await saveMesaSceneMeta(env, meta);
  return { activeId: sceneId, name: sceneDisplayName(meta, sceneId) };
}

// Resolve qual cena o ator enxerga: jogador SEMPRE a ativa; mestre pode
// pedir uma especifica via ?id= (invalida cai na ativa).
function resolveSceneIdForActor(meta, actor, requestedId) {
  if (actor?.role === "master" && isValidSceneId(requestedId)) return String(requestedId);
  return meta.activeId;
}

async function getMesaScene(env, actor, requestedId) {
  const meta = await getMesaSceneMeta(env);
  const sceneId = resolveSceneIdForActor(meta, actor, requestedId);
  const row = await env.DB.prepare(
    `
      select id, data_json, created_at, updated_at, updated_by_user_id
      from mesa_scenes
      where id = ?
      limit 1
    `
  )
    .bind(sceneId)
    .first();

  const scene = mapSceneRow(row);
  scene.id = sceneId;
  // Flag para o chamador: broadcast de cena so faz sentido quando o PUT/GET
  // e da cena ATIVA (salvar uma cena em preparo nao mexe na mesa dos outros).
  scene.active = sceneId === meta.activeId;
  scene.name = sceneDisplayName(meta, sceneId);
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

async function saveMesaScene(env, actor, payload, requestedId) {
  if (actor.role !== "master") {
    throw jsonError("Apenas o mestre pode salvar a cena da Mesa.", 403);
  }

  const meta = await getMesaSceneMeta(env);
  const sceneId = resolveSceneIdForActor(meta, actor, requestedId);
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
    .bind(sceneId, JSON.stringify(data), actor.sub, actor.sub, now, now)
    .run();

  return getMesaScene(env, actor, sceneId);
}

/* ── PASTAS ──────────────────────────────────────────────────────── */

async function createMesaSceneFolder(env, actor, payload) {
  requireMaster(actor, "criar pastas");
  const meta = await getMesaSceneMeta(env);
  if (meta.folders.length >= MAX_SCENE_FOLDERS) {
    throw jsonError(`Limite de ${MAX_SCENE_FOLDERS} pastas atingido.`, 400);
  }
  const id = "f" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const name = normalizeFolderName(payload?.name, "Nova pasta");
  meta.folders.push({ id, name });
  await saveMesaSceneMeta(env, meta);
  return { id, name };
}

async function renameMesaSceneFolder(env, actor, folderId, payload) {
  requireMaster(actor, "renomear pastas");
  if (!isValidFolderId(folderId)) throw jsonError("Pasta invalida.", 400);
  const meta = await getMesaSceneMeta(env);
  const folder = meta.folders.find(entry => entry.id === folderId);
  if (!folder) throw jsonError("Pasta nao encontrada.", 404);
  folder.name = normalizeFolderName(payload?.name, folder.name);
  await saveMesaSceneMeta(env, meta);
  return { id: folderId, name: folder.name };
}

/**
 * Excluir pasta NUNCA exclui cena: as cenas dela voltam para a raiz.
 * Uma pasta e organizacao, nao dono do conteudo.
 */
async function deleteMesaSceneFolder(env, actor, folderId) {
  requireMaster(actor, "excluir pastas");
  if (!isValidFolderId(folderId)) throw jsonError("Pasta invalida.", 400);
  const meta = await getMesaSceneMeta(env);
  if (!meta.folders.some(entry => entry.id === folderId)) {
    throw jsonError("Pasta nao encontrada.", 404);
  }
  meta.folders = meta.folders.filter(entry => entry.id !== folderId);
  Object.keys(meta.sceneFolders).forEach(sceneId => {
    if (meta.sceneFolders[sceneId] === folderId) delete meta.sceneFolders[sceneId];
  });
  await saveMesaSceneMeta(env, meta);
  return { ok: true, id: folderId };
}

/** folderId vazio = mover para a raiz. */
async function setMesaSceneFolder(env, actor, sceneId, payload) {
  requireMaster(actor, "organizar cenas em pastas");
  if (!isValidSceneId(sceneId)) throw jsonError("Cena invalida.", 400);
  const folderId = String(payload?.folderId || "");
  const meta = await getMesaSceneMeta(env);
  if (!folderId) {
    delete meta.sceneFolders[sceneId];
  } else {
    if (!isValidFolderId(folderId)) throw jsonError("Pasta invalida.", 400);
    if (!meta.folders.some(entry => entry.id === folderId)) {
      throw jsonError("Pasta nao encontrada.", 404);
    }
    meta.sceneFolders[sceneId] = folderId;
  }
  await saveMesaSceneMeta(env, meta);
  return { id: sceneId, folderId };
}

export {
  activateMesaScene,
  createMesaScene,
  createMesaSceneFolder,
  deleteMesaSceneFolder,
  setMesaSceneFolder,
  renameMesaSceneFolder,
  deleteMesaScene,
  getMesaScene,
  getMesaSceneMeta,
  isValidSceneId,
  listMesaScenes,
  normalizeMesaScene,
  normalizeSceneName,
  renameMesaScene,
  saveMesaScene
};
