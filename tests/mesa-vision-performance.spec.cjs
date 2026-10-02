const { test, expect } = require("@playwright/test");
const { cave } = require("./mesa-vision-fixtures.cjs");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
for (const dpr of [1, 2]) test.describe(`P1 DPR ${dpr}`, () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
  for (const [label, segments, tokens] of [["pequena", 100, 8], ["media", 800, 32], ["densa", 3000, 80]]) {
    test(`${label}: giro, movimento, pan e zoom`, async ({ page }, info) => {
      const errors = []; page.on("pageerror", e => errors.push(e.message));
      await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
      await page.locator("#mesaMapSettingsBtn").click(); await page.locator("#mesaVisionSelect").click();
      const metric = await page.evaluate(async ({ walls, tokens, label }) => {
        const sample = state.tokens[0]; state.selectedTokenId = "perf-0";
        state.tokens = Array.from({ length: tokens }, (_, i) => ({ ...sample, id: `perf-${i}`, type: "player", ownerUsername: "gm",
          x: 40 + i % 8 * 2, y: 40 + Math.floor(i / 8) * 2, visionRadius: .005, facingDeg: 0 }));
        const stage = document.getElementById("mesaStage");
        const started = performance.now();
        applyMesaVisionSnapshot({ enabled: true, walls, aspect: stage.clientHeight / stage.clientWidth, coneDeg: 120 });
        const prepareMs = performance.now() - started; mesaVisionPreview = true; mesaVisionMode = "select"; renderStage();
        const frames = {}, allocations = {};
        for (const phase of ["turn", "drag", "pan", "zoom"]) {
          const samples = [], intervals = []; let last = 0;
          for (let i = 0; i < 12; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const start = performance.now(); if (last) intervals.push(start - last); last = start;
            if (phase === "turn") state.tokens[0].facingDeg = i * 7;
            if (phase === "drag") {
              const origin = { x: state.tokens[0].x, y: state.tokens[0].y };
              state.drag = { tokenId: "perf-0", sceneId: state.sceneId || "default", vision: true, origin, waypoints: [], requested: { x: 40 + i / 4, y: 41 } };
              MesaMovement.preview(state.drag, state.drag.requested);
            }
            if (phase === "pan") panStage(i % 2 ? -3 : 3, 2);
            if (phase === "zoom") setStageZoom(1 + i / 4);
            renderStage(); samples.push(performance.now() - start);
          }
          const summary = values => { const a = values.sort((a, b) => a - b); return { median: a[Math.floor(a.length / 2)], p95: a[Math.ceil(a.length * .95) - 1], worst: a.at(-1) }; };
          frames[phase] = { workMs: summary(samples), intervalMs: summary(intervals) };
          allocations[phase] = ["mesaVisionCanvas", "mesaWallCanvas", "mesaMovementCanvas"].map(id => {
            const c = document.getElementById(id); return { id, width: c?.width || 0, height: c?.height || 0, bytes: (c?.width || 0) * (c?.height || 0) * 4 };
          });
          MesaMovement.clearPreview();
          state.drag = null;
        }
        return { label, segments: walls.length, tokens, viewport: [innerWidth, innerHeight], stage: [stage.clientWidth, stage.clientHeight], dpr: devicePixelRatio, prepareMs, frames, allocations };
      }, { walls: cave(segments), tokens, label });
      console.log(`P1 ${label} DPR${dpr}: prepare=${metric.prepareMs.toFixed(1)}ms; ${Object.entries(metric.frames).map(([key, v]) => `${key} med=${v.workMs.median.toFixed(1)} p95=${v.workMs.p95.toFixed(1)}ms`).join("; ")}; zoom RGBA=${(metric.allocations.zoom.reduce((n, c) => n + c.bytes, 0) / 1048576).toFixed(1)}MiB`);
      await info.attach("mesa-performance.json", { body: JSON.stringify(metric, null, 2), contentType: "application/json" });
      expect(metric.segments).toBe(segments); expect(errors).toEqual([]);
      expect(metric.allocations.drag.find(c => c.id === "mesaMovementCanvas").bytes).toBeGreaterThan(0);
      // A hang guard, not a promise of 60fps on every device.
      for (const phase of Object.values(metric.frames)) expect(phase.workMs.worst).toBeLessThan(1000);
    });
  }
});
