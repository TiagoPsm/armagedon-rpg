const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');

test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tc_session', JSON.stringify({ username: 'gm', role: 'master', token: '', backend: false }));
    localStorage.setItem('tc_players', JSON.stringify([{ username: 'ana', charname: 'Ana Rubra' }]));
    localStorage.setItem('tc_sheets', JSON.stringify({ ana: { charName: 'Ana Rubra', vidaAtual: '8', vidaMax: '12' } }));
  });
});
async function open(page, file) {
  await page.goto(`${await getMesaBaseUrl()}/${file}`);
  if (file === 'mesa.html') await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  else await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getTiming().iterations)).map(a => a.finished.catch(() => {}))));
}
async function contrast(page, selector, pseudo = null) {
  return page.locator(selector).first().evaluate((el, pseudo) => {
    const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = color => color.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    // These selected controls sit on solid opaque panels; no image/gradient
    // estimate is substituted for visual inspection of the playfield.
    let node = el, bg = [0, 0, 0];
    while (node) {
      const current = rgb(getComputedStyle(node).backgroundColor);
      if (current.length === 3 || current[3] === 1) { bg = current; break; }
      node = node.parentElement;
    }
    const fg = rgb(getComputedStyle(el, pseudo).color), a = luminance(fg), b = luminance(bg);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), fg, bg };
  }, pseudo);
}
for (const file of ['regras.html', 'sugestoes.html']) {
  test(`Guide contrast: readable placeholders and current navigation in ${file}`, async ({ page }) => {
    await open(page, file);
    for (const [selector, pseudo] of [['.form-input', '::placeholder'], ['.rules-textarea', '::placeholder'], ['.nav-link.active', null]]) {
      expect(await contrast(page, selector, pseudo), selector).toMatchObject({ ratio: expect.any(Number) });
      expect((await contrast(page, selector, pseudo)).ratio, selector).toBeGreaterThanOrEqual(4.5);
    }
    await page.locator(file === 'regras.html' ? '#saveRuleBtn' : '#saveSuggestionBtn').click();
    expect((await contrast(page, '.form-error')).ratio).toBeGreaterThanOrEqual(4.5);
  });
}
test('Guide contrast: empty state remains legible without brightening disabled decoration', async ({ page }) => {
  await open(page, 'ficha.html');
  const color = await page.evaluate(() => {
    const empty = document.createElement('p'); empty.className = 'empty-msg'; empty.textContent = 'Nenhum personagem cadastrado'; document.body.append(empty);
    return getComputedStyle(empty).color;
  });
  expect(color).toBe('rgb(138, 130, 114)');
});

for (const width of [1024, 1280, 1440, 1920, 2560]) for (const file of ['index.html', 'ficha.html', 'mesa.html', 'regras.html', 'sugestoes.html', 'echos.html']) {
  test(`Guide desktop: ${file} at ${width}px`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 }); await open(page, file);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const result = await page.locator('.header-shell:visible').first().evaluate(header => {
      const r = header.getBoundingClientRect();
      return [...header.querySelectorAll('.brand, .main-nav, .header-actions')].filter(el => el.getClientRects().length).flatMap(el => {
        const b = el.getBoundingClientRect();
        return b.left < r.left - 1 || b.right > r.right + 1 ? [{ name: el.className, left: b.left, right: b.right, parent: [r.left, r.right] }] : [];
      });
    });
    expect(result).toEqual([]);
    if (file !== 'echos.html') await expect(page.locator('.nav-link.active:visible')).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}

for (const file of ['index.html', 'ficha.html', 'mesa.html', 'regras.html', 'sugestoes.html', 'echos.html']) {
  test(`Guide header: ${file} keeps navigation available with text 150% at 1024px`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1024, height: 1000 }); await open(page, file);
    await page.evaluate(() => document.documentElement.style.fontSize = '24px');
    const overflow = await page.locator('.header-shell:visible').first().evaluate(header => {
      const r = header.getBoundingClientRect();
      return [...header.querySelectorAll('a, button')].filter(el => el.getClientRects().length).some(el => {
        const b = el.getBoundingClientRect(); return b.left < r.left || b.right > r.right;
      });
    });
    expect(overflow).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('header-150.png') });
  });
}
