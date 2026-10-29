const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
test('catalogo ativo resolve avatar antigo e bloqueia uploads sem rede', async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  const result = await page.evaluate(async () => {
    const file = 'assets/avatars/' + 'a'.repeat(64) + '.webp';
    window.ARMAGEDON_AVATAR_CATALOG = { enabled: true, origin: 'https://static.local', entries: { ana: { path: file }, 'echo-one': { path: file } } };
    window.MESA_RECOVERY_MAP_HASHES = { 'maps/master/old.webp': 'b'.repeat(64) };
    let network = 0; const original = fetch; window.fetch = () => { network++; throw Error('Unexpected network'); };
    const refused = [];
    for (const fn of [() => APP.uploadAvatar('ana', new Blob()), () => APP.uploadEchoAvatar('one', new Blob())]) { try { await fn(); } catch { refused.push(true); } }
    const url = APP.resolveAvatarUrl('https://old/api/avatars/Ana');
    const echo = APP.resolveAvatarUrl('https://old/api/avatars/echo-one');
    const map = APP.resolveSceneMap({ id: 'old', url: 'https://old/api/mesa/map/maps%2Fmaster%2Fold.webp' });
    window.fetch = original; return { network, refused: refused.length, url, echo, map };
  });
  expect(result.network).toBe(0); expect(result.refused).toBe(2);
  expect(result.url).toBe(result.echo); expect(result.url).toContain('https://static.local/assets/avatars/');
  expect(result.map).toMatchObject({ id: 'old', localOnly: true, hash: 'b'.repeat(64) }); expect(result.map).not.toHaveProperty('url');
});

test('ficha informa publicacao de avatares sem oferecer envio direto', async ({ page }, info) => {
  await page.addInitScript(() => {
    const catalog = { enabled: true, entries: {}, origin: location.origin };
    Object.defineProperty(window, 'ARMAGEDON_AVATAR_CATALOG', { configurable: true, get: () => catalog, set() {} });
    window.ARMAGEDON_CONFIG = { apiBaseUrl: location.origin + '/api', realtimeEnabled: false };
    localStorage.setItem('tc_session', JSON.stringify({ username: 'mestre', role: 'master', backend: false }));
    localStorage.setItem('tc_players', JSON.stringify([{ username: 'ana', charname: 'Ana' }]));
    localStorage.setItem('tc_sheets', JSON.stringify({ ana: { charName: 'Ana', inv: [] } }));
  });
  await page.goto(`${await getMesaBaseUrl()}/ficha.html`);
  await expect(page.locator('#masterScreen')).toBeVisible();
  await page.evaluate(() => openSheet(createPlayerTarget('ana'), true));
  await expect(page.locator('#sheetScreen')).toBeVisible();
  await expect(page.locator('#avatarFile')).toBeDisabled();
  await expect(page.locator('#avatarFile').locator('..')).toBeHidden();
  await expect(page.getByText('As imagens sao atualizadas pelo mestre nas publicacoes do site.', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('ficha-avatar-estatico.png'), fullPage: true });
  await page.goto(`${await getMesaBaseUrl()}/echos.html`);
  const html = await page.evaluate(() => renderEchoModalContent({ id: 'one', name: 'Echo', rarity: 'comum', rank: 1, xp: 0, xpLimit: 100, stats: {}, abilities: [], passives: [] }));
  expect(html).toContain('As imagens sao atualizadas'); expect(html).not.toContain('echoAvatarFile');
});
