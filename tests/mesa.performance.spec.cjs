const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test("Mesa mantem drag de token leve (DOM)", async ({ page }) => {
  const baseUrl = await getMesaBaseUrl();
  await page.addInitScript(() => {
    window.__mesaLongTasks = [];
    try {
      const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          window.__mesaLongTasks.push({
            name: entry.name,
            duration: entry.duration
          });
        });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {}
  });

  await page.goto(`${baseUrl}/mesa.html`);
  await expect(page.locator("#mesaStage .mesa-token.is-minimal").first()).toBeVisible();
  await page.evaluate(() => { window.__mesaLongTasks = []; });

  await page.locator("#mesaStage").scrollIntoViewIfNeeded();
  const tokenBox = await page.locator("#mesaStage .mesa-token").first().boundingBox();
  expect(tokenBox).toBeTruthy();

  const start = { x: tokenBox.x + tokenBox.width / 2, y: tokenBox.y + tokenBox.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 0; index < 18; index += 1) {
    await page.mouse.move(start.x + index * 8, start.y + index * 5);
  }
  await page.mouse.up();

  const longTasks = await page.evaluate(() => window.__mesaLongTasks || []);
  const worst = longTasks.reduce((max, task) => Math.max(max, task.duration || 0), 0);
  expect(worst).toBeLessThan(120);
});

test("Mesa mantem desenho responsivo com o quadro no limite", async ({ page }) => {
  const baseUrl = await getMesaBaseUrl();
  await page.goto(`${baseUrl}/mesa.html`);
  await expect(page.locator("#mesaStageWrap")).toHaveAttribute("data-draw-ready", "true");

  const metric = await page.evaluate(() => {
    const total = typeof DRAW_MAX_STROKES === "number" ? DRAW_MAX_STROKES : 1500;
    _strokes = Array.from({ length: total }, (_, index) => ({
      id: `perf-${index}`,
      tool: "line",
      color: "#e84040",
      width: 3,
      x1: (index % 100) / 100,
      y1: ((index * 7) % 100) / 100,
      x2: ((index + 10) % 100) / 100,
      y2: ((index * 7 + 10) % 100) / 100,
      points: null,
      layer: "tokens"
    }));
    _activeStroke = { ..._strokes[0], id: "perf-active" };

    const samples = [];
    for (let index = 0; index < 5; index += 1) {
      const startedAt = performance.now();
      renderDrawings();
      samples.push(performance.now() - startedAt);
    }
    samples.sort((a, b) => a - b);

    // 300 riscos no teto de 400 pontos representam um quadro muito mais caro
    // que formas simples e expõem regressões do caminho livre do lápis.
    _activeStroke = null;
    const denseStrokes = Array.from({ length: 300 }, (_, strokeIndex) => ({
      id: `perf-pencil-${strokeIndex}`,
      tool: "pencil",
      color: "#e84040",
      width: 3,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      points: Array.from({ length: 400 }, (_, pointIndex) => [
        pointIndex / 399,
        ((pointIndex + strokeIndex) % 100) / 100
      ]),
      layer: "tokens"
    }));
    const denseStartedAt = performance.now();
    _strokes = denseStrokes;
    renderDrawings();
    const denseCold = performance.now() - denseStartedAt;

    _activeStroke = { ..._strokes[0], id: "perf-pencil-active", points: [[0, 0], [1, 1]] };
    const denseInteractiveSamples = [];
    for (let index = 0; index < 5; index += 1) {
      _activeStroke.points[1] = [1, index / 10];
      const interactiveStartedAt = performance.now();
      renderDrawings();
      denseInteractiveSamples.push(performance.now() - interactiveStartedAt);
    }

    return {
      median: samples[2],
      worst: samples.at(-1),
      strokes: total,
      denseCold,
      denseInteractive: Math.max(...denseInteractiveSamples)
    };
  });

  console.log(`PERF desenho: ${metric.strokes} formas, mediana=${metric.median.toFixed(1)}ms, pior=${metric.worst.toFixed(1)}ms; carga de 300 riscos densos=${metric.denseCold.toFixed(1)}ms; interacao densa=${metric.denseInteractive.toFixed(1)}ms`);
  expect(metric.worst).toBeLessThan(120);
  expect(metric.denseInteractive).toBeLessThan(120);
});

test("Mesa reparte a primeira pintura de desenhos densos entre frames", async ({ page }) => {
  const baseUrl = await getMesaBaseUrl();
  await page.goto(`${baseUrl}/mesa.html`);
  await expect(page.locator("#mesaStageWrap")).toHaveAttribute("data-draw-ready", "true");

  const metric = await page.evaluate(async () => {
    _activeStroke = null;
    const denseStrokes = Array.from({ length: 300 }, (_, strokeIndex) => ({
      id: `progressive-pencil-${strokeIndex}`,
      tool: "pencil",
      color: "#e84040",
      width: 3,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      points: Array.from({ length: 400 }, (_, pointIndex) => [
        pointIndex / 399,
        ((pointIndex + strokeIndex) % 100) / 100
      ]),
      layer: "tokens"
    }));

    // Usa a entrada real de restauracao/snapshot; nao chama o renderer
    // progressivo diretamente, para proteger a ligacao que importa no boot.
    applyMesaSceneDrawingsFromSnapshot(denseStrokes);
    await new Promise((resolve, reject) => {
      const timeoutAt = performance.now() + 10_000;
      const poll = () => {
        if (_drawCanvasEl?.dataset.drawRenderState === "ready") {
          resolve();
          return;
        }
        if (performance.now() > timeoutAt) {
          reject(new Error("render progressivo nao terminou"));
          return;
        }
        requestAnimationFrame(poll);
      };
      poll();
    });
    return getDrawingsRenderMetrics();
  });

  console.log(`PERF progressivo: ${metric.strokes} riscos em ${metric.frames} frames; maior bloco=${metric.maxChunkMs.toFixed(1)}ms; total=${metric.totalMs.toFixed(1)}ms`);
  expect(metric.frames).toBeGreaterThan(10);
  expect(metric.maxChunkMs).toBeLessThan(80);
});

test("Mesa agrega salvamentos e preserva dados completos por flush", async ({ page }) => {
  const baseUrl = await getMesaBaseUrl();
  await page.goto(`${baseUrl}/mesa.html`);
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);

  const metric = await page.evaluate(() => {
    bumpMesaSceneVersion();
    const expectedTokens = createMesaScenePayloadFromState().tokens;
    const originalCreate = createMesaScenePayloadFromState;
    const originalStringify = JSON.stringify;
    let creates = 0;
    let stringifies = 0;

    createMesaScenePayloadFromState = (...args) => {
      creates += 1;
      return originalCreate(...args);
    };
    JSON.stringify = (...args) => {
      stringifies += 1;
      return originalStringify(...args);
    };

    try {
      for (let index = 0; index < 20; index += 1) persistState();
      const beforeFlush = { creates, stringifies };
      flushPersistState();
      const afterFlush = { creates, stringifies };
      const saved = JSON.parse(localStorage.getItem(mesaSceneStorageKey()));
      return { beforeFlush, afterFlush, savedTokens: saved.tokens, expectedTokens };
    } finally {
      createMesaScenePayloadFromState = originalCreate;
      JSON.stringify = originalStringify;
    }
  });

  expect(metric.beforeFlush).toEqual({ creates: 0, stringifies: 0 });
  // One normalized signature, one complete payload: display fields must survive.
  expect(metric.afterFlush).toEqual({ creates: 1, stringifies: 2 });
  expect(metric.savedTokens).toEqual(metric.expectedTokens);
  expect(metric.savedTokens.some(token => token.name && token.type)).toBe(true);
});

test("Mesa agrega redimensionamentos do canvas em um por frame", async ({ page }) => {
  const baseUrl = await getMesaBaseUrl();
  await page.goto(`${baseUrl}/mesa.html`);
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);

  const calls = await page.evaluate(async () => {
    const originalResize = _resizeDrawCanvas;
    let total = 0;
    _resizeDrawCanvas = () => { total += 1; };
    try {
      for (let index = 0; index < 20; index += 1) _scheduleDrawCanvasResize();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return total;
    } finally {
      _resizeDrawCanvas = originalResize;
    }
  });

  expect(calls).toBe(1);
});

test("Mesa tira o backup integral dos desenhos do evento de interacao", async ({ page }) => {
  const baseUrl = await getMesaBaseUrl();
  await page.goto(`${baseUrl}/mesa.html`);
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);

  const metric = await page.evaluate(() => {
    _flushDrawingsPersist();
    const originalStringify = JSON.stringify;
    let stringifies = 0;
    JSON.stringify = (...args) => {
      stringifies += 1;
      return originalStringify(...args);
    };
    try {
      for (let index = 0; index < 20; index += 1) _persistDrawings();
      const duringInteraction = stringifies;
      _flushDrawingsPersist();
      return { duringInteraction, afterFlush: stringifies };
    } finally {
      JSON.stringify = originalStringify;
    }
  });

  expect(metric).toEqual({ duringInteraction: 0, afterFlush: 1 });
});
