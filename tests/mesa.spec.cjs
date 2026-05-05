const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test.describe("Mesa virtual", () => {
  test("renderiza palco Canvas e permite mover token local sem erro de console", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    const consoleErrors = [];
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${baseUrl}/mesa.html`);
    await expect(page.locator("#mesaStageWrap")).toBeVisible();
    await expect(page.locator("#mesaStage canvas.mesa-stage-canvas")).toHaveCount(1);

    await page.locator("#mesaStage").scrollIntoViewIfNeeded();
    const stageBox = await page.locator("#mesaStage").boundingBox();
    expect(stageBox).toBeTruthy();

    const start = {
      x: stageBox.x + stageBox.width * 0.055 + 70,
      y: stageBox.y + stageBox.height * 0.075 + 70
    };
    const end = {
      x: start.x + 120,
      y: start.y + 80
    };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();

    const savedScene = await page.evaluate(() => JSON.parse(localStorage.getItem("tc_virtual_mesa_mock_v1") || "{}"));
    expect(Array.isArray(savedScene.tokens)).toBe(true);
    expect(savedScene.tokens.length).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });
});
