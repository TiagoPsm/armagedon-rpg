const { test, expect } = require("@playwright/test");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
test("P2 mask stays sharp and binary under zoom/pan, skips identical paints", async ({ page }, info) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.evaluate(() => {
    const sample = state.tokens[0]; state.tokens = [{ ...sample, id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", x: 45, y: 45, visionRadius: .025, facingDeg: 0 }];
    state.role = "player"; state.session = { role: "player", username: "ana" }; state.selectedTokenId = "ana";
    applyMesaVisionSnapshot({ enabled: true, aspect: 1, walls: [] }); applyMesaRolePermissions("player"); renderAll();
  });
  for (const zoom of [1, 2.84, 4, 2]) {
    await page.evaluate(zoom => { setStageZoom(zoom); panStage(3, -7); }, zoom);
    await expect.poll(() => page.locator("#mesaVisionCanvas").evaluate(c => c.width / c.getBoundingClientRect().width)).toBeGreaterThanOrEqual(1.99);
    const result = await page.evaluate(() => {
      const c = document.getElementById("mesaVisionCanvas"), r = c.getBoundingClientRect(), stage = document.getElementById("mesaStageInner").getBoundingClientRect();
      renderMesaVision(); const before = c.dataset.paints; for (let i = 0; i < 10; i++) renderMesaVision();
      const sample = x => { const px = (stage.left + x * stage.width - r.left) / r.width * c.width, py = (stage.top + .475 * stage.height - r.top) / r.height * c.height;
        return c.getContext("2d").getImageData(Math.floor(px), Math.floor(py), 1, 1).data[3]; };
      return { before, after: c.dataset.paints, alpha: [sample(.43), sample(.52)], pixels: c.width * c.height, budget: innerWidth * innerHeight * devicePixelRatio ** 2 };
    });
    expect(result.before).toBe(result.after); expect(result.alpha).toEqual([255, 0]);
    expect(result.pixels).toBeLessThan(result.budget * 1.05);
  }
  await page.screenshot({ path: info.outputPath("viewport-zoom.png") }); expect(errors).toEqual([]);
});
