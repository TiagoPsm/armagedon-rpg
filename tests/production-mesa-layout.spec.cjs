const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');

test.afterAll(closeMesaTestServer);

async function openMesa(page, width, scale = 1) {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tc_session', JSON.stringify({ username: 'gm', role: 'master', token: '', backend: false }));
    localStorage.setItem('tc_players', JSON.stringify([
      { username: 'ana', charname: 'Protagonista' },
      { username: 'long', charname: 'Guardião das ruínas de São Cristóvão' },
      { username: 'continuous', charname: 'PersonagemComNomeExtremamenteLongoSemEspaços' }
    ]));
    localStorage.setItem('tc_sheets', JSON.stringify({
      ana: { charName: 'Protagonista', vidaAtual: '8', vidaMax: '12' },
      long: { charName: 'Guardião das ruínas de São Cristóvão', vidaAtual: '8', vidaMax: '12' },
      continuous: { charName: 'PersonagemComNomeExtremamenteLongoSemEspaços', vidaAtual: '8', vidaMax: '12' }
    }));
  });
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(scale => document.documentElement.style.fontSize = `${16 * scale}px`, scale);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

for (const width of [1024, 1280, 1440, 1920, 2560]) {
  for (const scale of [1, 1.5]) {
    test(`production Mesa layout ${width}px, text ${scale * 100}%`, async ({ page }, info) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await openMesa(page, width, scale);
      const overflow = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('.vtt-toolbar button span, .vtt-role-badge strong, .roster-entry, .roster-entry-name, .roster-entry button')];
        return nodes.filter(element => element.getClientRects().length).flatMap(element => {
          const box = element.getBoundingClientRect();
          const parent = element.closest('button, .roster-entry, .vtt-toolbar').getBoundingClientRect();
          return element.scrollWidth > element.clientWidth + 1 || box.left < parent.left - 1 || box.right > parent.right + 1
            ? [{ text: element.textContent.trim(), width: element.clientWidth, scroll: element.scrollWidth }] : [];
        });
      });
      await page.screenshot({ path: info.outputPath('mesa-layout.png') });
      expect(overflow).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect(await page.locator('.vtt-canvas').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(width * .6);
      expect(errors).toEqual([]);
    });
  }
}

test('production roster actions retain descriptive names and delegated behavior', async ({ page }) => {
  await openMesa(page, 1280);
  const row = page.locator('.roster-entry').filter({ hasText: 'Guardião das ruínas de São Cristóvão' });
  if (await row.locator('[data-roster-action="add"]').count()) await row.locator('[data-roster-action="add"]').click();
  await expect(row.locator('[data-roster-action="focus"]')).toHaveAccessibleName('Focar Guardião das ruínas de São Cristóvão');
  await expect(row.locator('[data-roster-action="remove"]')).toHaveAccessibleName('Retirar Guardião das ruínas de São Cristóvão da cena');
  await row.locator('[data-roster-action="focus"]').focus();
  await page.keyboard.press('Tab');
  await expect(row.locator('[data-roster-action="remove"]')).toBeFocused();
  expect(await row.locator('[data-roster-action="remove"]').evaluate(button => getComputedStyle(button).outlineStyle)).toBe('solid');
  await row.locator('[data-roster-action="focus"]').click();
  await expect(page.locator('.token-inspector-name')).toHaveText('Guardião das ruínas de São Cristóvão');
  await row.locator('[data-roster-action="remove"]').click();
  await expect(row.locator('[data-roster-action="add"]')).toBeVisible();
});

test('production inspector preserves a readable name and dock follows enlarged rail', async ({ page }, info) => {
  await openMesa(page, 1440, 1.5);
  await page.evaluate(() => {
    const entry = state.roster.find(item => item.id === 'ana');
    if (!findToken('ana')) addTokenToStage(entry);
    selectToken('ana');
  });
  await page.locator('.token-inspector-name').scrollIntoViewIfNeeded();
  const name = await page.locator('.token-inspector-name').evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, wrap: getComputedStyle(element).whiteSpace }));
  expect(name.scroll).toBeLessThanOrEqual(name.width + 1);
  expect(name.wrap).not.toBe('nowrap');
  expect(await page.locator('.token-inspector-name').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length;
  })).toBe(1);
  const railAndDock = await page.evaluate(() => ({ rail: document.querySelector('.vtt-toolbar').getBoundingClientRect().right, dock: document.querySelector('.mesa-dock-left').getBoundingClientRect().left }));
  expect(railAndDock.dock).toBeGreaterThan(railAndDock.rail);
  await page.screenshot({ path: info.outputPath('inspector-text-150.png') });
});
