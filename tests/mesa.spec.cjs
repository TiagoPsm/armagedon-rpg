const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test.describe("Mesa virtual", () => {
  async function readFirstCanvasTokenLayout(page) {
    return page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => {
        const stage = document.getElementById("mesaStage");
        const renderer = window.MesaRendererV2?.get?.(stage);
        const first = renderer?.layouts ? [...renderer.layouts.values()][0] : null;
        resolve(first ? {
          x: first.x,
          y: first.y,
          width: first.width,
          height: first.height
        } : null);
      });
    }));
  }

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

  test("mantem cards do palco no mesmo tamanho ao selecionar e alternar tela cheia", async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();
    await page.goto(`${baseUrl}/mesa.html`);
    await expect(page.locator("#mesaStage canvas.mesa-stage-canvas")).toHaveCount(1);

    await page.locator("#mesaStage").scrollIntoViewIfNeeded();
    const normalLayout = await readFirstCanvasTokenLayout(page);
    expect(normalLayout).toBeTruthy();
    expect(normalLayout.width).toBeGreaterThanOrEqual(184);

    const stageBox = await page.locator("#mesaStage").boundingBox();
    expect(stageBox).toBeTruthy();
    await page.mouse.click(stageBox.x + normalLayout.x + 18, stageBox.y + normalLayout.y + 18);

    const selectedNormalLayout = await readFirstCanvasTokenLayout(page);
    expect(Math.abs(selectedNormalLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(selectedNormalLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    await page.locator("#fullscreenMesaBtn").click();
    await expect(page.locator("#mesaPanelStage")).toHaveClass(/is-pseudo-fullscreen/);
    const fullscreenLayout = await readFirstCanvasTokenLayout(page);
    expect(Math.abs(fullscreenLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(fullscreenLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    const fullscreenStageBox = await page.locator("#mesaStage").boundingBox();
    expect(fullscreenStageBox).toBeTruthy();
    await page.mouse.click(fullscreenStageBox.x + fullscreenLayout.x + 18, fullscreenStageBox.y + fullscreenLayout.y + 18);
    const selectedFullscreenLayout = await readFirstCanvasTokenLayout(page);
    expect(Math.abs(selectedFullscreenLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(selectedFullscreenLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);

    await page.locator("#fullscreenMesaBtn").click();
    await expect(page.locator("#mesaPanelStage")).not.toHaveClass(/is-pseudo-fullscreen/);
    const backToNormalLayout = await readFirstCanvasTokenLayout(page);
    expect(Math.abs(backToNormalLayout.width - normalLayout.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(backToNormalLayout.height - normalLayout.height)).toBeLessThanOrEqual(1);
  });
});
