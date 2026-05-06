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
});
