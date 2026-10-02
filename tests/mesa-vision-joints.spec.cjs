const { test, expect } = require("@playwright/test");
const { cases } = require("./mesa-vision-fixtures.cjs");
const { getMesaBaseUrl, closeMesaTestServer } = require("./mesa-test-server.cjs");
test.afterAll(closeMesaTestServer);
for (const fixture of cases) test(`V1 ${fixture.name}: mask pixels agree with visibility`, async ({ page }, info) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`); await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.evaluate(fixture => {
    const sample = state.tokens[0];
    state.tokens = [{ ...sample, id: "ana", characterKey: "ana", type: "player", ownerUsername: "ana", x: 29.5, y: 39.5, visionRadius: .005, facingDeg: 0 }];
    state.selectedTokenId = "ana"; state.role = "player"; state.session = { username: "ana", role: "player" };
    const s = document.getElementById("mesaStage");
    applyMesaVisionSnapshot({ enabled: true, walls: fixture.walls, aspect: s.clientHeight / s.clientWidth, coneDeg: 120 });
    applyMesaRolePermissions("player"); renderAll();
  }, fixture);
  const samples = await page.evaluate(() => {
    renderMesaVision();
    const c = document.getElementById("mesaVisionCanvas"), ctx = c.getContext("2d"), rect = c.getBoundingClientRect(), stage = document.getElementById("mesaStageInner").getBoundingClientRect();
    const origin = MesaVisionRules.center(findToken("ana"), mesaVision), samples = [];
    for (let x = .08; x < .95; x += .1) for (let y = .08; y < .95; y += .1) {
      const px = (stage.left + x * stage.width - rect.left) / rect.width * c.width;
      const py = (stage.top + y * stage.height - rect.top) / rect.height * c.height;
      if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
      const alpha = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data[3];
      // Boundary antialias pixels are not binary; only compare interior samples.
      if (alpha > 5 && alpha < 250) continue;
      samples.push({ alpha, visible: mesaVisionGeometry.canSee(origin, { x, y: y * mesaVision.aspect }, 0), x, y });
    }
    return samples;
  });
  expect(samples.length).toBeGreaterThan(30);
  for (const s of samples) expect(s.alpha < 128, `${fixture.name}: ${s.x},${s.y}`).toBe(s.visible);
  expect(errors).toEqual([]);
  if (fixture.name === "corner" || fixture.name === "cave") await page.screenshot({ path: info.outputPath(`${fixture.name}.png`) });
});
