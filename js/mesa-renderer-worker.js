let canvas = null;
let ctx = null;
let palette = {};
let latestSnapshot = null;
let latestLayouts = [];
let latestLayoutMap = new Map();
let latestOrderedTokens = [];
let latestSize = { width: 1, height: 1, dpr: 1 };
let backgroundCanvas = null;
let backgroundKey = "";
const imageCache = new Map();
const IMAGE_RETRY_MS = 30000;

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function roundRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function getSafePercent(current, max) {
  const numericMax = Number(max);
  if (!Number.isFinite(numericMax) || numericMax <= 0) return 0;
  return clamp(Number(current) / numericMax, 0, 1);
}

function getResourceBarColor(type, percent) {
  const safePercent = clamp(percent, 0, 1);
  if (type === "life") {
    const hue = Math.round(safePercent * 120);
    const lightness = 28 + safePercent * 22;
    return `hsl(${hue} 78% ${lightness}%)`;
  }

  if (type === "integrity") {
    const lightness = 14 + safePercent * 50;
    const saturation = 48 + safePercent * 30;
    return `hsl(204 ${saturation}% ${lightness}%)`;
  }

  return "rgba(255,255,255,0.16)";
}

async function loadBitmap(url) {
  const key = String(url || "").trim();
  if (!key) return null;

  const existing = imageCache.get(key);
  if (existing?.status === "ready") return existing.image;
  if (existing?.status === "loading") return null;
  if (existing?.status === "error" && Date.now() - existing.failedAt < IMAGE_RETRY_MS) return null;

  const record = {
    status: "loading",
    image: null,
    failedAt: 0
  };
  imageCache.set(key, record);

  try {
    const response = await fetch(key);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    record.image = await createImageBitmap(blob);
    record.status = "ready";
    drawLatest();
  } catch {
    record.status = "error";
    record.failedAt = Date.now();
  }

  return null;
}

function getBitmap(url) {
  const key = String(url || "").trim();
  if (!key) return null;
  const existing = imageCache.get(key);
  if (existing?.status === "ready") return existing.image;
  void loadBitmap(key);
  return null;
}

function drawImageCover(context, image, x, y, width, height) {
  const sourceWidth = image.width || width;
  const sourceHeight = image.height || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function fitCanvasText(context, text, maxWidth) {
  const source = String(text || "").trim();
  if (!source || context.measureText(source).width <= maxWidth) return source;

  const ellipsis = "...";
  let low = 0;
  let high = source.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (context.measureText(source.slice(0, mid).trimEnd() + ellipsis).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return source.slice(0, low).trimEnd() + ellipsis;
}

function appendCanvasEllipsis(context, text, maxWidth) {
  const source = String(text || "").trim();
  if (!source) return "";
  const ellipsis = "...";
  if (context.measureText(source + ellipsis).width <= maxWidth) return source + ellipsis;
  return fitCanvasText(context, source, maxWidth);
}

function wrapCanvasText(context, text, maxWidth, maxLines) {
  const source = String(text || "").trim();
  if (!source) return [];

  const words = source.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = context.measureText(word).width <= maxWidth ? word : fitCanvasText(context, word, maxWidth);
    if (lines.length >= maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  const usedText = lines.join(" ");
  if (usedText.length < source.length && lines.length) {
    lines[lines.length - 1] = appendCanvasEllipsis(context, lines[lines.length - 1], maxWidth);
  }

  return lines.slice(0, maxLines);
}

function drawStageAtmosphere(context, size) {
  context.save();
  context.globalAlpha = 0.42;
  context.strokeStyle = "rgba(255, 255, 255, 0.02)";
  context.lineWidth = 1;
  for (let x = 0; x <= size.width; x += 88) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, size.height);
    context.stroke();
  }
  for (let y = 0; y <= size.height; y += 88) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size.width, y);
    context.stroke();
  }

  const glow = context.createRadialGradient(
    size.width * 0.5,
    size.height * 0.54,
    0,
    size.width * 0.5,
    size.height * 0.54,
    Math.min(size.width, size.height) * 0.34
  );
  glow.addColorStop(0, "rgba(202, 74, 68, 0.07)");
  glow.addColorStop(0.38, "rgba(202, 74, 68, 0.025)");
  glow.addColorStop(1, "rgba(202, 74, 68, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size.width, size.height);
  context.restore();
}

function drawCachedStageAtmosphere(context, size) {
  const key = `${size.width}x${size.height}@${size.dpr || 1}`;
  if (!backgroundCanvas || backgroundKey !== key) {
    const pixelWidth = Math.max(1, Math.round(size.width * (size.dpr || 1)));
    const pixelHeight = Math.max(1, Math.round(size.height * (size.dpr || 1)));
    backgroundCanvas = new OffscreenCanvas(pixelWidth, pixelHeight);
    const backgroundContext = backgroundCanvas.getContext("2d", { alpha: true });
    if (backgroundContext) {
      backgroundContext.setTransform(size.dpr || 1, 0, 0, size.dpr || 1, 0, 0);
      backgroundContext.clearRect(0, 0, size.width, size.height);
      drawStageAtmosphere(backgroundContext, size);
      backgroundKey = key;
    }
  }

  if (backgroundCanvas) {
    context.drawImage(backgroundCanvas, 0, 0, size.width, size.height);
    return;
  }
  drawStageAtmosphere(context, size);
}

function drawPill(context, label, x, y, width, type) {
  const height = 22;
  const colors = type === "player"
    ? [palette.blueSoft, palette.blue]
    : type === "npc"
      ? [palette.goldSoft, palette.gold]
      : type === "monster"
        ? [palette.redSoft, palette.red]
        : ["rgba(255,255,255,0.04)", "rgba(255,248,236,0.55)"];

  roundRectPath(context, x, y, width, height, 999);
  context.fillStyle = colors[0];
  context.fill();
  context.strokeStyle = colors[1];
  context.stroke();
  context.fillStyle = type === "state" ? palette.textSoft : colors[1];
  context.font = "600 10px Cinzel, serif";
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillText(String(label || "").toUpperCase(), x + width / 2, y + height / 2 + 0.5, width - 10);
}

function drawBadges(context, token, x, y, maxWidth) {
  const typeLabel = String(token.typeLabel || "Token");
  const pill = String(token.statePillLabel || "");
  const typeWidth = Math.min(maxWidth, Math.max(58, 16 + typeLabel.length * 6.5));
  drawPill(context, typeLabel, x, y, typeWidth, token.type);
  if (!pill) return;

  const pillWidth = Math.min(maxWidth - typeWidth - 8, Math.max(52, 16 + pill.length * 5.8));
  if (pillWidth > 34) drawPill(context, pill, x + maxWidth - pillWidth, y, pillWidth, "state");
}

function drawAvatar(context, token, x, y, width) {
  const height = width / 1.2;
  roundRectPath(context, x, y, width, height, 16);
  const bg = context.createLinearGradient(x, y, x + width, y + height);
  bg.addColorStop(0, "rgba(55, 58, 84, 0.72)");
  bg.addColorStop(1, "rgba(11, 12, 18, 0.95)");
  context.fillStyle = bg;
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.05)";
  context.stroke();

  const image = getBitmap(token.imageUrl);
  if (image) {
    context.save();
    roundRectPath(context, x, y, width, height, 16);
    context.clip();
    drawImageCover(context, image, x, y, width, height);
    context.restore();
    return;
  }

  context.fillStyle = palette.text;
  context.font = `700 ${Math.max(28, width * 0.2)}px "Cinzel Decorative", Cinzel, serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(token.initials || "AR"), x + width / 2, y + height / 2 + 2, width - 18);
}

function drawTokenText(context, token, x, y, width) {
  context.fillStyle = palette.text;
  context.font = "600 15px Cinzel, serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const nameLines = wrapCanvasText(context, token.name || "Sem nome", width, 2);
  nameLines.forEach((line, index) => {
    context.fillText(line, x, y + index * 15, width);
  });

  context.fillStyle = palette.textSoft;
  context.font = "13px Crimson Text, serif";
  const ownerY = y + Math.max(1, nameLines.length) * 15 + 3;
  context.fillText(fitCanvasText(context, token.ownerCopy || "", width), x, ownerY, width);
}

function drawSingleBar(context, label, value, percent, x, y, width, type) {
  context.fillStyle = palette.textSoft;
  context.font = "10px Crimson Text, serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(label, x, y, width / 2);
  context.textAlign = "right";
  context.fillText(value, x + width, y, width / 2);

  const barY = y + 5;
  roundRectPath(context, x, barY, width, 7, 999);
  context.fillStyle = "rgba(255, 255, 255, 0.06)";
  context.fill();

  const fillWidth = Math.max(5, width * clamp(percent, 0, 1));
  roundRectPath(context, x, barY, fillWidth, 7, 999);
  context.fillStyle = getResourceBarColor(type, percent);
  context.fill();
}

function drawBars(context, token, x, y, width) {
  if (!token.canViewStats) {
    drawSingleBar(context, "Vida", "Oculto", 1, x, y, width, "hidden");
    drawSingleBar(context, "Integridade", "Oculto", 1, x, y + 22, width, "hidden");
    return;
  }

  drawSingleBar(context, "Vida", `${token.currentLife}/${token.maxLife}`, getSafePercent(token.currentLife, token.maxLife), x, y, width, "life");
  drawSingleBar(context, "Integridade", `${token.currentIntegrity}/${token.maxIntegrity}`, getSafePercent(token.currentIntegrity, token.maxIntegrity), x, y + 22, width, "integrity");
}

function drawToken(context, token, layout, snapshot) {
  if (!layout) return;

  const selected = String(token.id) === String(snapshot.selectedTokenId || "");
  const dragging = String(token.id) === String(snapshot.draggingTokenId || "");
  const alpha = token.hiddenForMaster ? 0.54 : 1;
  const { x, y, width, height, padding, radius } = layout;

  context.save();
  context.globalAlpha = alpha;
  context.shadowColor = dragging ? "rgba(0, 0, 0, 0.46)" : "rgba(0, 0, 0, 0.34)";
  context.shadowBlur = dragging ? 34 : selected ? 30 : 18;
  context.shadowOffsetY = dragging ? 20 : 14;

  roundRectPath(context, x, y, width, height, radius);
  const fill = context.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, palette.cardSoft);
  fill.addColorStop(1, palette.card);
  context.fillStyle = fill;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = selected ? 1.5 : 1;
  context.strokeStyle = selected ? palette.selected : palette.border;
  context.stroke();

  const scar = context.createRadialGradient(x + width * 0.18, y + 18, 0, x + width * 0.18, y + 18, width * 0.62);
  scar.addColorStop(0, "rgba(176, 47, 57, 0.16)");
  scar.addColorStop(1, "rgba(176, 47, 57, 0)");
  context.fillStyle = scar;
  context.fill();

  drawBadges(context, token, x + padding, y + padding, width - padding * 2);
  drawAvatar(context, token, x + padding, y + padding + 34, width - padding * 2);
  drawTokenText(context, token, x + padding, y + padding + 34 + (width - padding * 2) / 1.2 + 14, width - padding * 2);
  drawBars(context, token, x + padding, y + height - padding - 39, width - padding * 2);
  context.restore();
}

function drawLatest() {
  if (!ctx || !latestSnapshot) return;
  const size = latestSize;
  ctx.setTransform(size.dpr || 1, 0, 0, size.dpr || 1, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  drawCachedStageAtmosphere(ctx, size);

  latestOrderedTokens.forEach(token => {
    drawToken(ctx, token, latestLayoutMap.get(String(token.id)), latestSnapshot);
  });
}

function sortLatestTokens() {
  latestOrderedTokens = [...(latestSnapshot?.tokens || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function updateLatestTokenPosition(data) {
  if (!latestSnapshot) return;
  const tokenId = String(data.tokenId || "");
  const token = (latestSnapshot.tokens || []).find(entry => String(entry.id) === tokenId);
  if (!token) return;

  const previousOrder = Number(token.order || 0);
  token.x = clamp(Number(data.x), 0, 100);
  token.y = clamp(Number(data.y), 0, 100);
  if (Number.isFinite(Number(data.order))) token.order = Number(data.order);
  if (data.layout) latestLayoutMap.set(tokenId, data.layout);
  if (previousOrder !== Number(token.order || 0)) sortLatestTokens();
  drawLatest();
}

self.onmessage = event => {
  const data = event.data || {};

  if (data.type === "init") {
    canvas = data.canvas;
    palette = data.palette || {};
    ctx = canvas?.getContext?.("2d", { alpha: true }) || null;
    return;
  }

  if (data.type === "render") {
    if (!canvas || !ctx) return;
    latestSize = data.size || latestSize;
    latestSnapshot = data.snapshot || latestSnapshot;
    latestLayouts = data.layouts || latestLayouts;
    latestLayoutMap = new Map(latestLayouts || []);
    sortLatestTokens();
    const pixelWidth = Math.max(1, Math.round(latestSize.width * latestSize.dpr));
    const pixelHeight = Math.max(1, Math.round(latestSize.height * latestSize.dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    drawLatest();
  }

  if (data.type === "move-token") {
    updateLatestTokenPosition(data);
  }

  if (data.type === "dragging-token") {
    if (!latestSnapshot) return;
    latestSnapshot.draggingTokenId = String(data.tokenId || "");
    drawLatest();
  }
};
