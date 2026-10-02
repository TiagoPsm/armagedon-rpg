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
    const stage = document.getElementById('mesaStage');
    applyMesaVisionSnapshot({ enabled: true, walls: [], aspect: stage.clientHeight / stage.clientWidth, coneDeg: 120 });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
});
test('Guide render: camera and facing preserve initiative nodes and keyboard focus', async ({ page }, info) => {
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
      const start = performance.now(); state.tokens[0].facingDeg = i * 9; requestMesaVisionRender();
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
test('Guide render: player summary and initiative update immediately when a cone hides or reveals a token', async ({ page }) => {
  const result = await page.evaluate(async () => {
    state.session = { username: 'ana', role: 'player', backend: false };
    state.role = 'player';
    const frame = async () => { requestMesaVisionRender(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); };
    const seen = () => ({ tokens: getRenderedTokens().map(t => t.id), entries: [...document.querySelectorAll('.init-name')].map(e => e.textContent), count: document.getElementById('activeTokenCount').textContent });
    state.tokens[0].facingDeg = 0; await frame(); const before = seen();
    state.tokens[0].facingDeg = 180; await frame(); const hidden = seen();
    state.tokens[0].facingDeg = 0; await frame(); const restored = seen();
    return { before, hidden, restored };
  });
  expect(result.before.tokens).toEqual(['own', 'other']); expect(result.before.entries).toEqual(['Ana', 'Outro']);
  expect(result.hidden.tokens).toEqual(['own']); expect(result.hidden.entries).toEqual(['Ana']); expect(result.hidden.count).toBe('1');
  expect(result.restored).toEqual(result.before);
});

test('Guide render: asynchronously hydrated portraits update without a combat action', async ({ page }) => {
  await page.evaluate(async () => {
    state.tokens[0].initials = 'NEW';
    scheduleMesaRender({ stage: true, roster: true }); requestMesaVisionRender();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('.init-entry').first().locator('.init-avatar-fallback')).toHaveText('NEW');
  await page.evaluate(async () => {
    state.tokens[0].imageUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
    requestMesaVisionRender(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(page.locator('.init-entry').first().locator('.init-avatar img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
});
