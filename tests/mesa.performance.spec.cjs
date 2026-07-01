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
