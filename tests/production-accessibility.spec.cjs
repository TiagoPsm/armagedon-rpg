const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');

test.afterAll(closeMesaTestServer);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tc_session', JSON.stringify({ username: 'gm', role: 'master', token: '', backend: false }));
  });
  await page.goto(`${await getMesaBaseUrl()}/index.html`);
  await page.waitForFunction(() => Boolean(window.UI));
  await page.evaluate(() => {
    const trigger = document.createElement('button');
    trigger.id = 'qaModalTrigger';
    trigger.textContent = 'Abrir confirmação';
    document.body.appendChild(trigger);
    trigger.focus();
  });
});

test('confirmation exposes its title and message to assistive technology', async ({ page }, info) => {
  await page.evaluate(() => { window.qaModalResult = UI.confirm('Esta operação remove apenas o registro selecionado.', { title: 'Excluir registro' }); });
  const dialog = page.getByRole('dialog', { name: 'Excluir registro' });
  await expect(dialog).toHaveAccessibleDescription('Esta operação remove apenas o registro selecionado.');
  await dialog.screenshot({ path: info.outputPath('confirmation-dialog.png') });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => qaModalResult)).toBe(false);
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
});

test('initial focus does not overwrite a keyboard action made immediately after opening', async ({ page }) => {
  await page.evaluate(() => {
    window.qaModalResult = UI.confirm('Confirmar edição?');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(100);
  await expect(page.locator('[data-modal-confirm]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('[data-modal-cancel]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
});

test('focus trapping excludes hidden ancestors, disabled fieldsets and negative tabindex', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.createElement('div');
    root.id = 'qaManagedRoot'; root.className = 'app-modal-root';
    root.innerHTML = `<section id="qaManagedPanel" class="app-modal-panel" role="dialog" aria-modal="true" aria-label="Editor de teste" tabindex="-1">
      <div hidden><button id="qaHidden">Oculto</button></div>
      <fieldset disabled><button id="qaDisabled">Desabilitado</button></fieldset>
      <button id="qaNegative" tabindex="-1">Não tabulável</button>
      <button id="qaFirst">Primeiro</button><button id="qaLast">Último</button>
    </section>`;
    document.body.appendChild(root);
    UI.activateModal(root, root.firstElementChild, { initialFocus: root.querySelector('#qaLast'), onDismiss: () => UI.deactivateModal(root) });
  });
  await expect(page.locator('#qaLast')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#qaFirst')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#qaLast')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
});

test('empty option lists still focus the visible dialog and can be dismissed', async ({ page }) => {
  await page.evaluate(() => { window.qaModalResult = UI.pickOption({ title: 'Sem destinos', options: [] }); });
  expect(await page.evaluate(() => document.querySelector('.ui-modal-panel').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => qaModalResult)).toBe(null);
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
});

test('closing a modal does not steal focus from a newly opened dialog', async ({ page }) => {
  await page.evaluate(() => {
    window.qaFirstResult = UI.confirm('Primeira confirmação');
    document.querySelector('[data-modal-confirm]').click();
    window.qaSecondResult = UI.confirm('Segunda confirmação');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(100);
  await expect(page.locator('[data-modal-confirm]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => qaFirstResult)).toBe(true);
  await expect.poll(() => page.evaluate(() => qaSecondResult)).toBe(false);
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
});

test('toast status region is present before updates and never takes keyboard focus', async ({ page }) => {
  await expect(page.locator('.ui-toast-root')).toHaveAttribute('role', 'status');
  await expect(page.locator('.ui-toast-root')).toHaveAttribute('aria-live', 'polite');
  await page.evaluate(() => UI.toast('Alteração salva.', { duration: 200 }));
  await expect(page.locator('.ui-toast-message')).toHaveText('Alteração salva.');
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
  await expect(page.locator('.ui-toast')).toHaveCount(0);
  await expect(page.locator('.ui-toast-root')).toBeAttached();
});

test('modal keyboard handlers are removed after repeated open and close', async ({ page }) => {
  await page.evaluate(async () => {
    for (let index = 0; index < 12; index++) {
      const result = UI.confirm('Verificação de ciclo');
      document.querySelector('[data-modal-cancel]').click();
      await result;
    }
    window.qaFreeKey = null;
    document.getElementById('qaModalTrigger').addEventListener('keydown', event => {
      window.setTimeout(() => { window.qaFreeKey = event.defaultPrevented; });
    }, { once: true });
  });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => qaFreeKey)).toBe(false);
  expect(await page.evaluate(() => document.body.classList.contains('modal-open'))).toBe(false);
});

test('only the most recently activated managed modal controls focus and Escape', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    window.qaDismissals = [];
    for (const id of ['qaParent', 'qaChild']) {
      const root = document.createElement('div'); root.id = id; root.className = 'app-modal-root';
      root.innerHTML = `<section class="app-modal-panel" role="dialog" aria-modal="true" aria-label="${id}" tabindex="-1"><button id="${id}Button">Fechar</button></section>`;
      document.body.appendChild(root);
      UI.activateModal(root, root.firstElementChild, {
        initialFocus: root.querySelector('button'),
        onDismiss: () => { qaDismissals.push(id); UI.deactivateModal(root); }
      });
      root.querySelector('button').focus();
    }
  });
  await expect(page.locator('#qaChildButton')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => qaDismissals)).toEqual(['qaChild']);
  await expect(page.locator('#qaParentButton')).toBeFocused();
  expect(await page.evaluate(() => document.body.classList.contains('modal-open'))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => qaDismissals)).toEqual(['qaChild', 'qaParent']);
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.body.classList.contains('modal-open'))).toBe(false);
});

test('Escape reserved by an input widget or IME does not dismiss the dialog', async ({ page }) => {
  await page.evaluate(() => {
    window.qaModalResult = UI.confirm('Confirmar após digitar?');
    const consumed = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    consumed.preventDefault(); document.activeElement.dispatchEvent(consumed);
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.ui-modal-root')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => qaModalResult)).toBe(false);
});

test('central confirmation returns to its managed editor without dismissing both', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.createElement('div'); root.id = 'qaEditor'; root.className = 'app-modal-root';
    root.innerHTML = '<section class="app-modal-panel" role="dialog" aria-modal="true" aria-label="Editor de teste" tabindex="-1"><button id="qaEditorAction">Escolher tipo</button></section>';
    document.body.appendChild(root); window.qaEditorDismissed = false;
    UI.activateModal(root, root.firstElementChild, { initialFocus: root.querySelector('button'), onDismiss: () => { qaEditorDismissed = true; UI.deactivateModal(root); } });
  });
  await expect(page.locator('#qaEditorAction')).toBeFocused();
  await page.evaluate(() => { window.qaModalResult = UI.pickOption({ title: 'Tipo', options: [{ value: 'a', label: 'Opção A' }] }); });
  await expect(page.locator('[data-modal-option="a"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => qaModalResult)).toBe(null);
  await expect(page.locator('#qaEditorAction')).toBeFocused();
  expect(await page.evaluate(() => qaEditorDismissed)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
  expect(await page.evaluate(() => qaEditorDismissed)).toBe(true);
});

test('managed modal restores its trigger even when caller hides it first', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.createElement('div'); root.id = 'qaHideBeforeClose'; root.className = 'app-modal-root';
    root.innerHTML = '<section class="app-modal-panel" role="dialog" aria-modal="true" aria-label="Editor de teste" tabindex="-1"><button id="qaHideAction">Fechar</button></section>';
    document.body.appendChild(root);
    UI.activateModal(root, root.firstElementChild, { initialFocus: root.querySelector('button') });
  });
  await expect(page.locator('#qaHideAction')).toBeFocused();
  await page.evaluate(() => { const root = document.getElementById('qaHideBeforeClose'); root.hidden = true; UI.deactivateModal(root); });
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
  await page.waitForTimeout(80);
  await expect(page.locator('#qaModalTrigger')).toBeFocused();
  expect(await page.evaluate(() => document.body.classList.contains('modal-open'))).toBe(false);
});

test('hover and focus prefetch only the current Ficha document, not stale assets', async ({ page }) => {
  const link = page.locator('a[href="ficha.html"]').first();
  await link.hover(); await link.focus();
  const hints = await page.evaluate(() => [...document.querySelectorAll('link[rel="prefetch"]')].map(link => new URL(link.href).pathname).filter(path => path.includes('ficha')));
  expect(hints).toEqual(['/ficha.html']);
});

test('scene manager visibility also updates its accessible visibility and restores focus', async ({ page }) => {
  await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
  await page.waitForFunction(() => state.bootCompleted);
  await page.evaluate(async () => {
    AUTH.isBackendEnabled = () => true;
    APP.getMesaScenes = async () => ({ activeId: 'default', scenes: [], folders: [] });
    await refreshMesaScenesUI();
  });
  await expect(page.locator('#mesaScenesToggle')).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#mesaScenesToggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mesaScenesDrawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mesaScenesDrawer')).toBeHidden();
  await expect(page.locator('#mesaScenesToggle')).toBeFocused();
  await page.evaluate(async () => { AUTH.isBackendEnabled = () => false; await refreshMesaScenesUI(); });
  await expect(page.locator('#mesaScenesToggle')).toBeHidden();
  await expect(page.locator('#mesaScenesToggle')).toHaveAttribute('aria-hidden', 'true');
});

for (const file of ['index.html', 'ficha.html', 'mesa.html', 'regras.html', 'sugestoes.html', 'echos.html']) {
  test(`shared confirmation preserves keyboard semantics in ${file}`, async ({ page }) => {
    await page.goto(`${await getMesaBaseUrl()}/${file}`);
    if (file === 'mesa.html') await page.waitForFunction(() => state.bootCompleted);
    else await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      const trigger = document.createElement('button'); trigger.id = 'qaSharedTrigger'; trigger.textContent = 'Abrir';
      document.body.appendChild(trigger); trigger.focus();
      window.qaSharedResult = UI.confirm('Aplicar alteração de interface?', { title: 'Confirmação compartilhada' });
    });
    await expect(page.getByRole('dialog', { name: 'Confirmação compartilhada' })).toHaveAccessibleDescription('Aplicar alteração de interface?');
    await expect(page.locator('[data-modal-cancel]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-modal-confirm]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#qaSharedTrigger')).toBeFocused();
    await expect.poll(() => page.evaluate(() => qaSharedResult)).toBe(false);
  });
}
