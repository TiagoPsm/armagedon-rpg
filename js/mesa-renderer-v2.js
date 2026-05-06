(function () {
  const RENDERER_VERSION = "2026-05-06-drag-polish-1";
  const DEFAULT_WORKER_URL = "js/mesa-renderer-worker.js?v=2026-05-06-drag-polish-1";
  const MAX_DPR = 2;
  const IMAGE_RETRY_MS = 30000;

  const PALETTE = {
    page: "#07080c",
    card: "rgba(13, 15, 22, 0.92)",
    cardSoft: "rgba(28, 16, 22, 0.86)",
    border: "rgba(255, 248, 236, 0.08)",
    selected: "rgba(255, 248, 236, 0.24)",
    text: "rgba(255, 248, 236, 0.94)",
    textSoft: "rgba(212, 201, 182, 0.78)",
    red: "rgba(176, 47, 57, 0.78)",
    redSoft: "rgba(176, 47, 57, 0.2)",
    gold: "rgba(176, 143, 50, 0.74)",
    goldSoft: "rgba(176, 143, 50, 0.16)",
    blue: "rgba(93, 114, 212, 0.7)",
    blueSoft: "rgba(93, 114, 212, 0.16)"
  };

  function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
  }

  function getRendererPreference() {
    const value = String(localStorage.getItem("mesaRenderer") || "auto").trim().toLowerCase();
    return ["auto", "worker", "canvas", "dom"].includes(value) ? value : "auto";
  }

  function canUseWorkerCanvas(canvas) {
    return Boolean(
      window.Worker
      && canvas
      && typeof canvas.transferControlToOffscreen === "function"
      && window.OffscreenCanvas
    );
  }

  function resolveTokenDimensions() {
    const viewportWidth = Math.max(320, window.innerWidth || 1280);
    const width = viewportWidth <= 760
      ? clamp(viewportWidth * 0.58, 164, 176)
      : clamp(viewportWidth * 0.108, 184, 196);

    return {
      width,
      height: Math.round(width * 1.58),
      padding: Math.round(width * 0.078),
      radius: Math.round(width * 0.13)
    };
  }

  function fitCanvasText(ctx, text, maxWidth) {
    const source = String(text || "").trim();
    if (!source || ctx.measureText(source).width <= maxWidth) return source;

    const ellipsis = "...";
    let low = 0;
    let high = source.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (ctx.measureText(source.slice(0, mid).trimEnd() + ellipsis).width <= maxWidth) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return source.slice(0, low).trimEnd() + ellipsis;
  }

  function appendCanvasEllipsis(ctx, text, maxWidth) {
    const source = String(text || "").trim();
    if (!source) return "";
    const ellipsis = "...";
    if (ctx.measureText(source + ellipsis).width <= maxWidth) return source + ellipsis;
    return fitCanvasText(ctx, source, maxWidth);
  }

  function wrapCanvasText(ctx, text, maxWidth, maxLines) {
    const source = String(text || "").trim();
    if (!source) return [];

    const words = source.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);
      current = ctx.measureText(word).width <= maxWidth ? word : fitCanvasText(ctx, word, maxWidth);
      if (lines.length >= maxLines - 1) break;
    }

    if (current && lines.length < maxLines) lines.push(current);

    const usedText = lines.join(" ");
    if (usedText.length < source.length && lines.length) {
      lines[lines.length - 1] = appendCanvasEllipsis(ctx, lines[lines.length - 1], maxWidth);
    }

    return lines.slice(0, maxLines);
  }

  function normalizeSnapshot(snapshot) {
    const source = snapshot && typeof snapshot === "object" ? snapshot : {};
    return {
      tokens: Array.isArray(source.tokens) ? source.tokens : [],
      selectedTokenId: String(source.selectedTokenId || ""),
      draggingTokenId: String(source.draggingTokenId || ""),
      isFullscreen: Boolean(source.isFullscreen),
      isPlayerPerspective: Boolean(source.isPlayerPerspective)
    };
  }

  class MainThreadImageCache {
    constructor(onUpdate) {
      this.onUpdate = onUpdate;
      this.records = new Map();
    }

    get(url) {
      const key = String(url || "").trim();
      if (!key) return null;

      const existing = this.records.get(key);
      if (existing?.status === "ready") return existing.image;
      if (existing?.status === "loading") return null;
      if (existing?.status === "error" && Date.now() - existing.failedAt < IMAGE_RETRY_MS) return null;

      const record = {
        status: "loading",
        image: null,
        failedAt: 0
      };
      this.records.set(key, record);

      const image = new Image();
      image.decoding = "async";
      image.loading = "eager";
      image.onload = async () => {
        try {
          if (window.createImageBitmap) {
            record.image = await window.createImageBitmap(image);
          } else {
            record.image = image;
          }
          record.status = "ready";
          this.onUpdate?.();
        } catch {
          record.image = image;
          record.status = "ready";
          this.onUpdate?.();
        }
      };
      image.onerror = () => {
        record.status = "error";
        record.failedAt = Date.now();
      };
      image.src = key;
      return null;
    }
  }

  class MesaRendererV2 {
    constructor(stage, options = {}) {
      this.stage = stage;
      this.options = options;
      this.mode = "dom-legacy";
      this.enabled = false;
      this.canvas = null;
      this.ctx = null;
      this.worker = null;
      this.workerReady = false;
      this.ownsWorkerCanvas = false;
      this.snapshot = normalizeSnapshot({});
      this.layouts = new Map();
      this.orderedTokens = [];
      this.drawFrame = 0;
      this.resizeObserver = null;
      this.backgroundCanvas = null;
      this.backgroundKey = "";
      this.imageCache = new MainThreadImageCache(() => this.requestDraw());
      this.lastWidth = 0;
      this.lastHeight = 0;
      this.dpr = 1;
      this.handleVisibilityChange = () => {
        if (document.visibilityState === "visible") this.requestDraw();
      };
    }

    init() {
      if (!this.stage || this.enabled) return this.enabled;

      const preference = getRendererPreference();
      if (preference === "dom") {
        this.mode = "dom-legacy";
        return false;
      }

      this.canvas = document.createElement("canvas");
      this.canvas.className = "mesa-stage-canvas";
      this.canvas.setAttribute("aria-hidden", "true");
      this.stage.prepend(this.canvas);

      const workerPreferred = preference === "worker" || preference === "auto";
      if (workerPreferred && canUseWorkerCanvas(this.canvas)) {
        try {
          const offscreen = this.canvas.transferControlToOffscreen();
          this.worker = new Worker(this.options.workerUrl || DEFAULT_WORKER_URL);
          this.worker.postMessage({
            type: "init",
            canvas: offscreen,
            palette: PALETTE,
            maxDpr: MAX_DPR
          }, [offscreen]);
          this.workerReady = true;
          this.ownsWorkerCanvas = true;
          this.mode = "canvas-worker";
        } catch (error) {
          console.warn("Renderer worker da Mesa indisponivel; usando Canvas principal.", error);
          this.worker = null;
          this.workerReady = false;
          this.ownsWorkerCanvas = false;
        }
      }

      if (!this.workerReady) {
        this.mode = "canvas-main";
        this.ctx = this.canvas.getContext("2d", { alpha: true });
      }

      if (!this.ctx && !this.workerReady) {
        this.destroy();
        return false;
      }

      this.enabled = true;
      this.stage.classList.add("is-canvas-renderer");
      this.stage.dataset.renderer = this.mode;
      this.resizeObserver = new ResizeObserver(() => this.requestDraw());
      this.resizeObserver.observe(this.stage);
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      return true;
    }

    destroy() {
      if (this.drawFrame) {
        cancelAnimationFrame(this.drawFrame);
        this.drawFrame = 0;
      }
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      try {
        this.worker?.terminate();
      } catch {}
      this.worker = null;
      this.workerReady = false;
      this.ctx = null;
      this.canvas?.remove();
      this.canvas = null;
      this.stage?.classList.remove("is-canvas-renderer");
      if (this.stage?.dataset) delete this.stage.dataset.renderer;
      this.enabled = false;
      this.mode = "dom-legacy";
      this.layouts.clear();
      this.orderedTokens = [];
      this.backgroundCanvas = null;
      this.backgroundKey = "";
    }

    render(snapshot) {
      if (!this.enabled && !this.init()) return false;
      this.snapshot = normalizeSnapshot(snapshot);
      this.computeLayouts();
      this.requestDraw();
      return true;
    }

    setDraggingToken(tokenId) {
      this.snapshot.draggingTokenId = String(tokenId || "");
      if (this.workerReady) {
        this.worker.postMessage({
          type: "dragging-token",
          tokenId: this.snapshot.draggingTokenId
        });
        return;
      }
      this.requestDraw();
    }

    updateTokenPosition(tokenId, xPercent, yPercent, order) {
      if (!this.enabled) return false;
      const id = String(tokenId || "");
      const token = this.snapshot.tokens.find(entry => String(entry.id) === id);
      if (!token) return false;

      const nextX = clamp(Number(xPercent), 0, 100);
      const nextY = clamp(Number(yPercent), 0, 100);
      const nextOrder = Number.isFinite(Number(order)) ? Number(order) : token.order;
      const orderChanged = Number(token.order || 0) !== Number(nextOrder || 0);
      token.x = nextX;
      token.y = nextY;
      token.order = nextOrder;

      const size = this.lastWidth && this.lastHeight
        ? { width: this.lastWidth, height: this.lastHeight, dpr: this.dpr, changed: false }
        : this.ensureCanvasSize();
      const layout = this.layouts.get(id);
      if (size && layout) {
        layout.x = (nextX / 100) * size.width;
        layout.y = (nextY / 100) * size.height;
      }
      if (orderChanged) this.sortOrderedTokens();

      if (this.workerReady) {
        this.worker.postMessage({
          type: "move-token",
          tokenId: id,
          x: nextX,
          y: nextY,
          order: nextOrder,
          layout: layout ? { ...layout } : null
        });
        return true;
      }

      this.requestDraw();
      return true;
    }

    requestDraw() {
      if (!this.enabled) return;
      if (document.visibilityState === "hidden") return;
      if (this.drawFrame) return;
      this.drawFrame = requestAnimationFrame(() => {
        this.drawFrame = 0;
        this.draw();
      });
    }

    ensureCanvasSize() {
      if (!this.stage || !this.canvas) return null;
      const rect = this.stage.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = clamp(window.devicePixelRatio || 1, 1, MAX_DPR);
      const changed = width !== this.lastWidth || height !== this.lastHeight || dpr !== this.dpr;

      if (!this.ownsWorkerCanvas) {
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
          this.canvas.width = pixelWidth;
          this.canvas.height = pixelHeight;
        }
      }

      this.lastWidth = width;
      this.lastHeight = height;
      this.dpr = dpr;
      return { width, height, dpr, changed };
    }

    computeLayouts(size = this.ensureCanvasSize()) {
      if (!size) return;

      const metrics = resolveTokenDimensions();
      this.layouts.clear();
      this.sortOrderedTokens();
      this.orderedTokens.forEach(token => {
        const x = clamp((Number(token.x) || 0) / 100, 0, 1) * size.width;
        const y = clamp((Number(token.y) || 0) / 100, 0, 1) * size.height;
        this.layouts.set(String(token.id), {
          x,
          y,
          width: metrics.width,
          height: metrics.height,
          padding: metrics.padding,
          radius: metrics.radius
        });
      });
    }

    sortOrderedTokens() {
      this.orderedTokens = [...this.snapshot.tokens]
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    draw() {
      const size = this.ensureCanvasSize();
      if (!size) return;
      if (size.changed) this.computeLayouts(size);

      if (this.workerReady) {
        this.worker.postMessage({
          type: "render",
          size,
          snapshot: this.snapshot,
          layouts: [...this.layouts.entries()]
        });
        return;
      }

      const ctx = this.ctx;
      if (!ctx) return;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      this.drawCachedStageAtmosphere(ctx, size);
      this.orderedTokens.forEach(token => this.drawToken(ctx, token));
    }

    drawCachedStageAtmosphere(ctx, size) {
      const key = `${size.width}x${size.height}@${size.dpr}`;
      if (!this.backgroundCanvas || this.backgroundKey !== key) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(size.width * size.dpr));
        canvas.height = Math.max(1, Math.round(size.height * size.dpr));
        const backgroundCtx = canvas.getContext("2d", { alpha: true });
        if (backgroundCtx) {
          backgroundCtx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
          backgroundCtx.clearRect(0, 0, size.width, size.height);
          this.drawStageAtmosphere(backgroundCtx, size);
          this.backgroundCanvas = canvas;
          this.backgroundKey = key;
        }
      }

      if (this.backgroundCanvas) {
        ctx.drawImage(this.backgroundCanvas, 0, 0, size.width, size.height);
        return;
      }
      this.drawStageAtmosphere(ctx, size);
    }

    drawStageAtmosphere(ctx, size) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      const grid = 88;
      for (let x = 0; x <= size.width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.height);
        ctx.stroke();
      }
      for (let y = 0; y <= size.height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size.width, y);
        ctx.stroke();
      }
      const glow = ctx.createRadialGradient(size.width * 0.5, size.height * 0.54, 0, size.width * 0.5, size.height * 0.54, Math.min(size.width, size.height) * 0.34);
      glow.addColorStop(0, "rgba(202, 74, 68, 0.07)");
      glow.addColorStop(0.38, "rgba(202, 74, 68, 0.025)");
      glow.addColorStop(1, "rgba(202, 74, 68, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.restore();
    }

    drawToken(ctx, token) {
      const layout = this.layouts.get(String(token.id));
      if (!layout) return;

      const selected = String(token.id) === this.snapshot.selectedTokenId;
      const dragging = String(token.id) === this.snapshot.draggingTokenId;
      const hidden = Boolean(token.hiddenForMaster);
      const alpha = hidden ? 0.54 : 1;
      const { x, y, width, height, padding, radius } = layout;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = dragging ? "rgba(0, 0, 0, 0.46)" : "rgba(0, 0, 0, 0.34)";
      ctx.shadowBlur = dragging ? 24 : selected ? 26 : 16;
      ctx.shadowOffsetY = dragging ? 16 : 12;

      roundRectPath(ctx, x, y, width, height, radius);
      const fill = ctx.createLinearGradient(x, y, x + width, y + height);
      fill.addColorStop(0, PALETTE.cardSoft);
      fill.addColorStop(1, PALETTE.card);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.strokeStyle = selected ? PALETTE.selected : PALETTE.border;
      ctx.stroke();

      const scar = ctx.createRadialGradient(x + width * 0.18, y + 18, 0, x + width * 0.18, y + 18, width * 0.62);
      scar.addColorStop(0, "rgba(176, 47, 57, 0.16)");
      scar.addColorStop(1, "rgba(176, 47, 57, 0)");
      ctx.fillStyle = scar;
      ctx.fill();

      this.drawBadges(ctx, token, x + padding, y + padding, width - padding * 2);
      this.drawAvatar(ctx, token, x + padding, y + padding + 34, width - padding * 2);
      this.drawTokenText(ctx, token, x + padding, y + padding + 34 + (width - padding * 2) / 1.2 + 14, width - padding * 2);
      this.drawBars(ctx, token, x + padding, y + height - padding - 39, width - padding * 2);
      ctx.restore();
    }

    drawBadges(ctx, token, x, y, maxWidth) {
      const typeLabel = String(token.typeLabel || "Token");
      const pill = String(token.statePillLabel || "");
      const typeWidth = Math.min(maxWidth, Math.max(58, 16 + typeLabel.length * 6.5));
      this.drawPill(ctx, typeLabel, x, y, typeWidth, token.type);
      if (pill) {
        const pillWidth = Math.min(maxWidth - typeWidth - 8, Math.max(52, 16 + pill.length * 5.8));
        if (pillWidth > 34) this.drawPill(ctx, pill, x + maxWidth - pillWidth, y, pillWidth, "state");
      }
    }

    drawPill(ctx, label, x, y, width, type) {
      const height = 22;
      const colors = type === "player"
        ? [PALETTE.blueSoft, PALETTE.blue]
        : type === "npc"
          ? [PALETTE.goldSoft, PALETTE.gold]
          : type === "monster"
            ? [PALETTE.redSoft, PALETTE.red]
            : ["rgba(255,255,255,0.04)", "rgba(255,248,236,0.55)"];
      roundRectPath(ctx, x, y, width, height, 999);
      ctx.fillStyle = colors[0];
      ctx.fill();
      ctx.strokeStyle = colors[1].replace("0.7", "0.28").replace("0.74", "0.28").replace("0.78", "0.3");
      ctx.stroke();
      ctx.fillStyle = type === "state" ? PALETTE.textSoft : colors[1];
      ctx.font = "600 10px Cinzel, serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(label.toUpperCase(), x + width / 2, y + height / 2 + 0.5, width - 10);
    }

    drawAvatar(ctx, token, x, y, width) {
      const height = width / 1.2;
      roundRectPath(ctx, x, y, width, height, 16);
      const bg = ctx.createLinearGradient(x, y, x + width, y + height);
      bg.addColorStop(0, "rgba(55, 58, 84, 0.72)");
      bg.addColorStop(1, "rgba(11, 12, 18, 0.95)");
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.stroke();

      const image = this.imageCache.get(token.imageUrl);
      if (image) {
        ctx.save();
        roundRectPath(ctx, x, y, width, height, 16);
        ctx.clip();
        this.drawImageCover(ctx, image, x, y, width, height);
        ctx.restore();
        return;
      }

      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 ${Math.max(28, width * 0.2)}px "Cinzel Decorative", Cinzel, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(token.initials || "AR"), x + width / 2, y + height / 2 + 2, width - 18);
    }

    drawImageCover(ctx, image, x, y, width, height) {
      const sourceWidth = image.width || image.naturalWidth || width;
      const sourceHeight = image.height || image.naturalHeight || height;
      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    }

    drawTokenText(ctx, token, x, y, width) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = "600 15px Cinzel, serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const nameLines = wrapCanvasText(ctx, token.name || "Sem nome", width, 2);
      nameLines.forEach((line, index) => {
        ctx.fillText(line, x, y + index * 15, width);
      });

      ctx.fillStyle = PALETTE.textSoft;
      ctx.font = "13px Crimson Text, serif";
      const ownerY = y + Math.max(1, nameLines.length) * 15 + 3;
      ctx.fillText(fitCanvasText(ctx, token.ownerCopy || "", width), x, ownerY, width);
    }

    drawBars(ctx, token, x, y, width) {
      if (!token.canViewStats) {
        this.drawSingleBar(ctx, "Vida", "Oculto", 1, x, y, width, "hidden");
        this.drawSingleBar(ctx, "Integridade", "Oculto", 1, x, y + 22, width, "hidden");
        return;
      }

      this.drawSingleBar(
        ctx,
        "Vida",
        `${token.currentLife}/${token.maxLife}`,
        getSafePercent(token.currentLife, token.maxLife),
        x,
        y,
        width,
        "life"
      );
      this.drawSingleBar(
        ctx,
        "Integridade",
        `${token.currentIntegrity}/${token.maxIntegrity}`,
        getSafePercent(token.currentIntegrity, token.maxIntegrity),
        x,
        y + 22,
        width,
        "integrity"
      );
    }

    drawSingleBar(ctx, label, value, percent, x, y, width, type) {
      ctx.fillStyle = PALETTE.textSoft;
      ctx.font = "10px Crimson Text, serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, x, y, width / 2);
      ctx.textAlign = "right";
      ctx.fillText(value, x + width, y, width / 2);

      const barY = y + 5;
      roundRectPath(ctx, x, barY, width, 7, 999);
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.fill();

      const fillWidth = Math.max(5, width * clamp(percent, 0, 1));
      roundRectPath(ctx, x, barY, fillWidth, 7, 999);
      const fill = ctx.createLinearGradient(x, barY, x + width, barY);
      if (type === "life") {
        fill.addColorStop(0, "#7d121b");
        fill.addColorStop(1, "#cc474f");
      } else if (type === "integrity") {
        fill.addColorStop(0, "#7e6320");
        fill.addColorStop(1, "#d9b45c");
      } else {
        fill.addColorStop(0, "rgba(255,255,255,0.08)");
        fill.addColorStop(1, "rgba(255,255,255,0.18)");
      }
      ctx.fillStyle = fill;
      ctx.fill();
    }

    hitTest(clientX, clientY) {
      if (!this.enabled || !this.stage) return null;
      const rect = this.stage.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const tokens = [...this.snapshot.tokens].sort((a, b) => (b.order || 0) - (a.order || 0));

      for (const token of tokens) {
        const layout = this.layouts.get(String(token.id));
        if (!layout) continue;
        if (
          x >= layout.x
          && x <= layout.x + layout.width
          && y >= layout.y
          && y <= layout.y + layout.height
        ) {
          return {
            tokenId: String(token.id),
            bounds: { ...layout },
            localX: x - layout.x,
            localY: y - layout.y
          };
        }
      }

      return null;
    }
  }

  function getSafePercent(current, max) {
    const numericMax = Number(max);
    if (!Number.isFinite(numericMax) || numericMax <= 0) return 0;
    return clamp(Number(current) / numericMax, 0, 1);
  }

  let renderer = null;

  window.MesaRendererV2 = {
    version: RENDERER_VERSION,
    get(stage, options = {}) {
      if (renderer && renderer.stage === stage) return renderer;
      renderer?.destroy();
      renderer = new MesaRendererV2(stage, options);
      renderer.init();
      return renderer;
    },
    reset() {
      renderer?.destroy();
      renderer = null;
    }
  };
})();
