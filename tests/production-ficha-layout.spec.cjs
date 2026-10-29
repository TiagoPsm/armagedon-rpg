const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');

test.afterAll(closeMesaTestServer);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tc_session', JSON.stringify({ username: 'gm', role: 'master', token: '', backend: false }));
    localStorage.setItem('tc_players', JSON.stringify([{ username: 'ana', charname: 'Ana Rubra' }]));
    localStorage.setItem('tc_sheets', JSON.stringify({ ana: { charName: 'Ana Rubra', vidaAtual: '8', vidaMax: '12' } }));
  });
});

for (const width of [1024, 1280, 1440, 1920, 2560]) {
  for (const scale of [1, 1.5]) {
    test(`production Ficha hierarchy ${width}px, text ${scale * 100}%`, async ({ page }, info) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${await getMesaBaseUrl()}/ficha.html`);
      await expect(page.locator('#newUser')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(scale => document.documentElement.style.fontSize = `${16 * scale}px`, scale);
      const layout = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const hero = box('.master-hero'), main = box('.master-hero-main'), form = box('.master-card-create .form-row');
        const user = box('#newUser'), pass = box('#newPass'), character = box('#newChar');
        const outside = [...document.querySelectorAll('.master-hero-meta > *, .master-hero-meta strong, .master-card-create .form-group, .master-card-create input')].filter(element => {
          const rect = element.getBoundingClientRect();
          const parent = element.closest('.master-hero, .master-card-create').getBoundingClientRect();
          const cardStyle = element.tagName === 'STRONG' ? getComputedStyle(element.parentElement) : null;
          const contentWidth = cardStyle ? element.parentElement.clientWidth - parseFloat(cardStyle.paddingLeft) - parseFloat(cardStyle.paddingRight) : Infinity;
          return rect.left < parent.left - 1 || rect.right > parent.right + 1 || rect.width > contentWidth + 1;
        }).map(element => element.id || element.className);
        return {
          heroRatio: main.width / hero.width, characterRatio: character.width / form.width,
          alignedFirstRow: Math.abs(user.top - pass.top) < 1, passBelow: pass.top > user.bottom, characterBelow: character.top > pass.bottom,
          formColumns: getComputedStyle(document.querySelector('.master-card-create .form-row')).gridTemplateColumns.split(' ').length,
          outside, overflow: document.documentElement.scrollWidth - innerWidth
        };
      });
      if (layout.overflow > 1) {
        const wideElements = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
          const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.right > innerWidth + 1;
        }).map(element => ({ node: element.tagName, id: element.id, className: element.className, right: element.getBoundingClientRect().right })).slice(0, 30));
        await info.attach('horizontal-overflow', { body: JSON.stringify(wideElements, null, 2), contentType: 'application/json' });
      }
      await page.screenshot({ path: info.outputPath('ficha-desktop.png'), fullPage: true });
      expect(layout.heroRatio).toBeGreaterThan(.3);
      expect(layout.characterRatio).toBeGreaterThan(.95);
      expect(layout.formColumns > 1 ? layout.alignedFirstRow : layout.passBelow).toBe(true);
      expect(layout.characterBelow).toBe(true);
      expect(layout.outside).toEqual([]);
      expect(layout.overflow).toBeLessThanOrEqual(1);
      expect(await page.locator('#newUser').evaluate(input => {
        const style = getComputedStyle(input), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
        context.font = `${style.fontSize} ${style.fontFamily}`;
        const space = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return context.measureText(input.placeholder).width <= space + 1;
      })).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('production Ficha layout preserves input order, labels, and keyboard access', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${await getMesaBaseUrl()}/ficha.html`);
  await expect(page.locator('#newUser')).toBeVisible();
  await expect(page.locator('#newUser')).toHaveAccessibleName('Usuário');
  await expect(page.locator('#newPass')).toHaveAccessibleName('Senha');
  await expect(page.locator('#newChar')).toHaveAccessibleName('Nome do personagem');
  await page.locator('#newUser').focus();
  await page.keyboard.press('Tab'); await expect(page.locator('#newPass')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#newChar')).toBeFocused();
  expect(await page.locator('.master-card-create input').count()).toBe(3);
});
