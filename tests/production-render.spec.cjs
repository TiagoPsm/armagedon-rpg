const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.evaluate(async () => {
    const sample = state.tokens[0];
    state.role = 'master';
    state.session = { username: 'gm', role: 'master', backend: false };
    state.tokens = [{ ...sample, id: 'own', type: 'player', ownerUsername: 'ana', name: 'Ana', x: 40, y: 40, visionRadius: .04, facingDeg: 0 },
      { ...sample, id: 'other', type: 'npc', ownerUsername: '', name: 'Outro', x: 65, y: 40, visionRadius: .04 }];
    state.selectedTokenId = 'own';
    window._mesaInitiativeState = { active: true, phase: 'order', round: 1, currentIndex: 0, order: state.tokens.map(t => ({ id: t.id, characterKey: t.id, name: t.name, type: t.type, ownerUsername: t.ownerUsername, secret: false, auto: true, rolled: true, roll: 10, modifier: 0, total: 10 })) };
    renderAll(); renderInitiative();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
});
test('Guide render: camera changes preserve initiative nodes and keyboard focus', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const button = document.querySelector('[data-init-remove="own"]'); button.focus();
    const list = document.querySelector('.init-order-list');
    let mutations = 0, summaryCalls = 0, initiativeCalls = 0;
    const observer = new MutationObserver(events => mutations += events.length); observer.observe(list, { childList: true });
    const summary = renderSummary, initiative = renderInitiative;
    renderSummary = () => { summaryCalls++; return summary(); };
    renderInitiative = () => { initiativeCalls++; return initiative(); };
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now(); setStageZoom(1 + i * .01); renderStage();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      samples.push(performance.now() - start);
    }
    observer.disconnect();
    return { connected: button.isConnected, focused: document.activeElement === button, mutations, summaryCalls, initiativeCalls, samples };
  });
  await info.attach('render-work.json', { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result.connected).toBe(true); expect(result.focused).toBe(true);
  expect(result.mutations).toBe(0); expect(result.summaryCalls).toBe(0); expect(result.initiativeCalls).toBe(0);
});

test('Guide render: asynchronously hydrated portraits update without a combat action', async ({ page }) => {
  await page.evaluate(async () => {
    state.tokens[0].initials = 'NEW';
    scheduleMesaRender({ stage: true, roster: true }); scheduleMesaRender({ summary: true, stage: true }); renderInitiative();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('.init-entry').first().locator('.init-avatar-fallback')).toHaveText('NEW');
  await page.evaluate(async () => {
    state.tokens[0].imageUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
    scheduleMesaRender({ summary: true, stage: true }); renderInitiative(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('.init-entry').first().locator('.init-avatar img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
});
