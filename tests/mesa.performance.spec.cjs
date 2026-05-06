const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

test("Mesa mantem drag leve em Canvas", async ({ page }) => {
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
  await expect(page.locator("#mesaStage canvas.mesa-stage-canvas")).toHaveCount(1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    window.__mesaLongTasks = [];
    const renderer = window.MesaRendererV2?.get?.(document.getElementById("mesaStage"));
    window.__mesaRenderCalls = 0;
    window.__mesaMovePatchCalls = 0;
    if (renderer && !renderer.__perfWrapped) {
      const originalRender = renderer.render.bind(renderer);
      const originalUpdateTokenPosition = renderer.updateTokenPosition?.bind(renderer);
      renderer.render = (...args) => {
        window.__mesaRenderCalls += 1;
        return originalRender(...args);
      };
      renderer.updateTokenPosition = (...args) => {
        window.__mesaMovePatchCalls += 1;
        return originalUpdateTokenPosition(...args);
      };
      renderer.__perfWrapped = true;
    }
    resolve();
  })));

  await page.locator("#mesaStage").scrollIntoViewIfNeeded();
  const stageBox = await page.locator("#mesaStage").boundingBox();
  expect(stageBox).toBeTruthy();

  const start = {
    x: stageBox.x + stageBox.width * 0.055 + 70,
    y: stageBox.y + stageBox.height * 0.075 + 70
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 0; index < 18; index += 1) {
    await page.mouse.move(start.x + index * 8, start.y + index * 5);
  }
  await page.mouse.up();

  const longTasks = await page.evaluate(() => window.__mesaLongTasks || []);
  const worst = longTasks.reduce((max, task) => Math.max(max, task.duration || 0), 0);
  expect(worst).toBeLessThan(120);
  const counters = await page.evaluate(() => ({
    renderCalls: window.__mesaRenderCalls || 0,
    movePatchCalls: window.__mesaMovePatchCalls || 0
  }));
  expect(counters.movePatchCalls).toBeGreaterThan(0);
  expect(counters.renderCalls).toBeLessThanOrEqual(2);
});
