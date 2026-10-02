const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);
const failures = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; failures.set(page, errors); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (localStorage.getItem('__ui_audit_seed')) return;
    localStorage.clear();
    localStorage.setItem('__ui_audit_seed', '1');
    localStorage.setItem('tc_session', JSON.stringify({ username: 'gm', role: 'master', token: '', backend: false }));
    localStorage.setItem('tc_players', JSON.stringify([{ username: 'ana', charname: 'Ana Rubra' }]));
    localStorage.setItem('tc_sheets', JSON.stringify({ ana: { charName: 'Ana Rubra', vidaAtual: '8', vidaMax: '12' } }));
  });
});
for (const kind of ['Rule', 'Suggestion']) {
  const plural = kind === 'Rule' ? 'rules' : 'suggestions', prefix = kind.toLowerCase();
  const file = kind === 'Rule' ? 'regras.html' : 'sugestoes.html';
  async function fillPost(page) {
    await open(page, file);
    await page.locator(`#${prefix}Title`).fill('Registro QA');
    await page.locator(`#${prefix}Content`).fill('Conteúdo de teste local.');
  }
  test(`QA ${file}: create/edit/cancel/delete and F5 preserve posts`, async ({ page }) => {
    await fillPost(page); await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#${plural}List .rule-card`)).toHaveCount(1);
    await page.locator(`#${plural}List button`).filter({ hasText: 'Editar' }).click();
    await page.locator(`#${prefix}Title`).fill('Não salvar'); await page.locator(kind === 'Rule' ? '#cancelEditBtn' : '#cancelSuggestionEditBtn').click();
    await expect(page.locator('.rule-card-title')).toHaveText('Registro QA');
    await page.reload(); await expect(page.locator('.rule-card-title')).toHaveText('Registro QA');
    await page.locator(`#${plural}List button`).filter({ hasText: 'Editar' }).click();
    await page.locator(`#${prefix}Title`).fill('Registro atualizado'); await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator('.rule-card-title')).toHaveText('Registro atualizado');
    await page.locator(`#${plural}List button`).filter({ hasText: 'Excluir' }).click(); await page.locator('[data-modal-cancel]').click();
    await expect(page.locator('.rule-card-title')).toHaveText('Registro atualizado');
    await page.locator(`#${plural}List button`).filter({ hasText: 'Excluir' }).click(); await page.locator('[data-modal-confirm]').click();
    await expect(page.locator(`#${plural}List .rule-card`)).toHaveCount(0);
  });
  test(`QA ${file}: slow save cannot be submitted twice`, async ({ page }) => {
    await fillPost(page);
    await page.evaluate(kind => {
      window.auditCalls = 0; AUTH.isBackendEnabled = () => true;
      APP[`create${kind}`] = async () => { auditCalls++; await new Promise(resolve => window.releasePost = resolve); };
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [];
    }, kind);
    await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#save${kind}Btn`)).toBeDisabled();
    await page.evaluate(kind => { void window[`save${kind}`](); }, kind);
    expect(await page.evaluate(() => auditCalls)).toBe(1);
    await page.evaluate(() => releasePost()); await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
  });
  test(`QA ${file}: failed deletion gives feedback without losing the post`, async ({ page }) => {
    await fillPost(page); await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#${plural}List .rule-card`)).toHaveCount(1);
    await page.evaluate(kind => { AUTH.isBackendEnabled = () => true; APP[`delete${kind}`] = async () => { throw new Error('Falha de rede simulada'); }; }, kind);
    await page.locator(`#${plural}List button`).filter({ hasText: 'Excluir' }).click(); await page.locator('[data-modal-confirm]').click();
    await expect(page.locator('.ui-toast').last()).toContainText('Não foi possível confirmar a exclusão');
    await expect(page.locator('.ui-toast').last()).not.toContainText('Falha de rede simulada');
    await expect(page.locator(`#${plural}List .rule-card`)).toHaveCount(1);
  });
  test(`QA ${file}: failed write preserves draft and accepted write is not duplicated after refresh failure`, async ({ page }) => {
    await fillPost(page);
    await page.evaluate(kind => {
      AUTH.isBackendEnabled = () => true;
      APP[`create${kind}`] = async () => { throw new Error('Falha ao salvar simulada'); };
    }, kind);
    await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#${prefix}FormError`)).toContainText('Não foi possível confirmar o salvamento');
    await expect(page.locator(`#${prefix}FormError`)).not.toContainText('Falha ao salvar simulada');
    await expect(page.locator(`#${prefix}Title`)).toHaveValue('Registro QA');
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
    await page.evaluate(kind => {
      window.auditCalls = 0; APP[`create${kind}`] = async () => { auditCalls++; };
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => { throw new Error('Falha na lista'); };
    }, kind);
    await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#${prefix}FormStatus`)).toContainText('salva');
    await expect(page.locator(`#${prefix}Title`)).toHaveValue('');
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
    await page.locator(`#save${kind}Btn`).click();
    expect(await page.evaluate(() => auditCalls)).toBe(1);
  });
}
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));
async function open(page, file) {
  await page.goto(`${await getMesaBaseUrl()}/${file}`);
  if (file === 'mesa.html') await expect.poll(() => page.evaluate(() => state.bootCompleted)).toBe(true);
  else await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getTiming().iterations)).map(a => a.finished.catch(() => {}))));
}
async function noPageOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
for (const width of [1280, 390]) for (const file of ['index.html', 'ficha.html', 'mesa.html', 'regras.html', 'sugestoes.html', 'echos.html']) {
  test(`QA ${file}: boot/layout ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await open(page, file);
    await noPageOverflow(page);
    await page.screenshot({ path: info.outputPath('page.png'), fullPage: true });
  });
}
for (const width of [1024, 1366, 1920]) test(`QA Mesa: tools remain contained at ${width}px and text 150%`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await open(page, 'mesa.html');
  await page.locator('#mesaMapSettingsBtn').click();
  await page.locator('#mesaDrawToggleBtn').click();
  for (const scale of [1, 1.5]) {
    await page.evaluate(scale => document.documentElement.style.fontSize = `${scale * 16}px`, scale);
    await noPageOverflow(page);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#mesaMapTransform button, #mesaDrawFlyout button, #mesaMapTransform input, #mesaDrawFlyout input, #mesaMapTransform select, #mesaDrawFlyout select')].filter(e => e.getClientRects().length).flatMap(e => {
      const r = e.getBoundingClientRect(), p = e.closest('#mesaMapTransform, #mesaDrawFlyout').getBoundingClientRect();
      // Inputs/selects scroll internally by design; native select padding also
      // differs across engines. Boxes must fit; button captions must not clip.
      return r.left < p.left - 1 || r.right > p.right + 1 || (e.tagName === 'BUTTON' && e.scrollWidth > e.clientWidth + 2) ? [{ id: e.id || e.className, left: r.left, right: r.right, panel: [p.left, p.right], width: e.clientWidth, scroll: e.scrollWidth }] : [];
    }));
    await expect.poll(() => page.locator('#mesaDrawFlyout').evaluate(e => getComputedStyle(e).opacity)).toBe('1');
    await page.screenshot({ path: info.outputPath(`tools-${scale}.png`) });
    expect(overflow).toEqual([]);
    expect(await page.locator('#mesaDecorationList').evaluate(e => e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width)).toBeGreaterThan(.95);
    expect(await page.evaluate(() => [...document.querySelectorAll('.vtt-sidebar-block-head > *')].filter(e => e.getClientRects().length).every(e => {
      const r = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1;
    }))).toBe(true);
  }
});
test('QA drawing menu respects reduced motion and keeps keyboard focus visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page, 'mesa.html');
  await page.locator('#mesaDrawToggleBtn').click();
  expect(await page.locator('#mesaDrawFlyout').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  await page.locator('#mesaTemplateCircle').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('#mesaTemplateCone')).toBeFocused();
  expect(await page.locator('#mesaTemplateCone').evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe('none');
});
for (const editor of ['light', 'grid', 'drawing']) test(`QA facing handle never competes with the ${editor} editor`, async ({ page }) => {
  await open(page, 'mesa.html');
  await page.locator('#mesaMapSettingsBtn').click(); await page.locator('#mesaVisionToggle').check();
  await page.locator('.mesa-token-avatar').first().hover();
  await expect(page.locator('#mesaFacingControls')).toBeVisible();
  if (editor === 'light') await page.locator('#mesaLightCreate').evaluate(b => b.click());
  if (editor === 'grid') await page.locator('#mesaGridCalibrate').evaluate(b => b.click());
  if (editor === 'drawing') await page.evaluate(() => { setDrawTool('pencil'); requestMesaVisionRender(); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.locator('#mesaFacingControls').isVisible()).toBe(false);
});
