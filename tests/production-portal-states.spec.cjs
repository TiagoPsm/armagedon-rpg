const { test, expect } = require('@playwright/test');
const { getMesaBaseUrl, closeMesaTestServer } = require('./mesa-test-server.cjs');
test.afterAll(closeMesaTestServer);

for (const kind of ['Rule', 'Suggestion']) {
  const prefix = kind.toLowerCase(), plural = kind === 'Rule' ? 'rules' : 'suggestions';
  const file = kind === 'Rule' ? 'regras.html' : 'sugestoes.html';
  const record = title => ({ id: 'post-qa', title, content: 'Texto de teste.', description: 'Texto de teste.', author: 'gm', createdAt: Date.UTC(2026, 9, 2, 12), updatedAt: Date.UTC(2026, 9, 2, 12) });
  async function open(page) {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tc_session', JSON.stringify({ username: 'gm', role: 'master', backend: false }));
    });
    await page.goto(`${await getMesaBaseUrl()}/${file}`);
    await expect(page.locator(`#save${kind}Btn`)).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  async function useBackend(page) {
    await page.evaluate(() => { AUTH.isBackendEnabled = () => true; });
  }

  test(`Production ${file}: slow/offline list has visible retry without losing cached posts`, async ({ page }, info) => {
    await open(page); await useBackend(page);
    await page.evaluate(({ kind, record }) => {
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record];
    }, { kind, record: record('Publicação confirmada') });
    await page.evaluate(kind => window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`](), kind);
    await page.evaluate(kind => {
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = () => new Promise((_, reject) => window.rejectLoad = reject);
      void window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]().catch(() => {});
    }, kind);
    await expect(page.locator(`#${plural}List`)).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.rule-card-title')).toHaveText('Publicação confirmada');
    await page.evaluate(() => rejectLoad(new TypeError('Failed to fetch (request-id=secret-qa)')));
    await expect(page.locator(`#${plural}LoadStatus`)).toContainText('Não foi possível atualizar');
    await expect(page.locator(`#${plural}LoadStatus`)).not.toContainText('secret-qa');
    await expect(page.locator(`#${plural}List`)).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.rule-card-title')).toHaveText('Publicação confirmada');
    await page.screenshot({ path: info.outputPath('offline-list.png'), fullPage: true });
    await page.evaluate(({ kind, record }) => { APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record]; }, { kind, record: record('Lista recuperada') });
    await page.locator(`#${plural}LoadStatus button`).click();
    await expect(page.locator('.rule-card-title')).toHaveText('Lista recuperada');
    await expect(page.locator(`#${plural}LoadStatus`)).toBeHidden();
  });

  test(`Production ${file}: first load failure is not reported as an empty published list`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(kind => {
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => { throw new Error('HTTP 503'); };
      return window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]().catch(() => {});
    }, kind);
    await expect(page.locator(`#${plural}LoadStatus`)).toContainText('Não foi possível carregar');
    await expect(page.locator(`#${plural}List`)).not.toContainText(kind === 'Rule' ? 'Nenhuma regra publicada' : 'Nenhuma sugestao enviada');
    await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Tentar novamente');
  });

  test(`Production ${file}: late response never replaces a newer list`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(kind => {
      window.pendingLoads = [];
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = () => new Promise(resolve => pendingLoads.push(resolve));
      void window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]();
      void window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]();
    }, kind);
    await page.evaluate(record => pendingLoads[1]([record]), record('Resposta atual'));
    await expect(page.locator('.rule-card-title')).toHaveText('Resposta atual');
    await page.evaluate(record => pendingLoads[0]([record]), record('Resposta antiga'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('.rule-card-title')).toHaveText('Resposta atual');
  });

  test(`Production ${file}: stale rejection does not hide the latest confirmed response`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(kind => {
      window.pendingLoads = [];
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = () => new Promise((resolve, reject) => pendingLoads.push({ resolve, reject }));
      void window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]().catch(() => {});
      void window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]();
    }, kind);
    await page.evaluate(record => pendingLoads[1].resolve([record]), record('Lista atual confirmada'));
    await expect(page.locator('.rule-card-title')).toHaveText('Lista atual confirmada');
    await page.evaluate(() => pendingLoads[0].reject(new Error('Falha da consulta antiga')));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await expect(page.locator(`#${plural}LoadStatus`)).toBeHidden();
    await expect(page.locator(`#${plural}List`)).toHaveAttribute('aria-busy', 'false');
  });

  test(`Production ${file}: optional cache failure does not turn confirmed remote data into a loading failure`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(({ kind, record }) => {
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record];
      Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
    }, { kind, record: record('Servidor confirmado') });
    await page.evaluate(kind => window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`](), kind);
    await expect(page.locator('.rule-card-title')).toHaveText('Servidor confirmado');
    await expect(page.locator(`#${plural}LoadStatus`)).toBeHidden();
  });

  test(`Production ${file}: unknown write failure keeps draft and gives safe confirmation guidance`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.locator(`#${prefix}Title`).fill('Rascunho preservado');
    await page.locator(`#${prefix}Content`).fill('Conteúdo preservado.');
    await page.evaluate(kind => { APP[`create${kind}`] = async () => { throw new TypeError('Failed to fetch secret-qa'); }; }, kind);
    await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#${prefix}FormError`)).toContainText('confirmar');
    await expect(page.locator(`#${prefix}FormError`)).toContainText('antes de tentar novamente');
    await expect(page.locator(`#${prefix}FormError`)).not.toContainText('secret-qa');
    await expect(page.locator(`#${prefix}Title`)).toHaveValue('Rascunho preservado');
    await expect(page.locator(`#${prefix}Content`)).toHaveValue('Conteúdo preservado.');
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
    await expect(page.locator(`#${prefix}FormError`)).toHaveAttribute('role', 'alert');
    await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Atualizar lista');
  });

  test(`Production ${file}: a pre-write list cannot confirm an uncertain POST or remove its retry`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.locator(`#${prefix}Title`).fill('Resposta de escrita perdida');
    await page.locator(`#${prefix}Content`).fill('Rascunho que deve ser mantido.');
    await page.evaluate(kind => {
      window.writeCalls = 0;
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = () => new Promise(resolve => window.finishOldRead = resolve);
      window.oldRead = window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]();
      APP[`create${kind}`] = async () => { writeCalls++; throw new TypeError('Lost POST response'); };
    }, kind);
    await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Atualizar lista');
    await page.evaluate(async () => { finishOldRead([]); await oldRead; });
    await expect(page.locator(`#${plural}LoadStatus`)).toBeVisible();
    await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Atualizar lista');
    await expect(page.locator(`#${plural}List`)).not.toContainText('Nenhuma');
    await expect(page.locator(`#${prefix}Title`)).toHaveValue('Resposta de escrita perdida');
    await expect(page.locator(`#${prefix}FormError`)).toContainText('confirmar');
    await page.evaluate(({ kind, record }) => { APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record]; }, { kind, record: record('Publicação conferida depois da escrita') });
    await page.locator(`#${plural}LoadStatus button`).click();
    await expect(page.locator('.rule-card-title')).toHaveText('Publicação conferida depois da escrita');
    await expect(page.locator(`#${plural}LoadStatus`)).toBeHidden();
    expect(await page.evaluate(() => writeCalls)).toBe(1);
  });

  test(`Production ${file}: a pre-delete list cannot confirm an uncertain DELETE or remove its retry`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(({ kind, record }) => { APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record]; }, { kind, record: record('Publicação com resultado incerto') });
    await page.evaluate(kind => window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`](), kind);
    await page.evaluate(kind => {
      window.deleteCalls = 0;
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = () => new Promise(resolve => window.finishOldRead = resolve);
      window.oldRead = window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]();
      APP[`delete${kind}`] = async () => { deleteCalls++; throw new TypeError('Lost DELETE response'); };
    }, kind);
    await page.locator('.rule-btn-danger').click(); await page.locator('[data-modal-confirm]').click();
    await expect(page.locator('.ui-toast').last()).toContainText('Não foi possível confirmar');
    await page.evaluate(async () => { finishOldRead([]); await oldRead; });
    await expect(page.locator(`#${plural}LoadStatus`)).toBeVisible();
    await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Atualizar lista');
    await expect(page.locator('.rule-card-title')).toHaveText('Publicação com resultado incerto');
    await page.evaluate(kind => { APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => []; }, kind);
    await page.locator(`#${plural}LoadStatus button`).click();
    await expect(page.locator('.rule-card')).toHaveCount(0);
    await expect(page.locator(`#${plural}LoadStatus`)).toBeHidden();
    expect(await page.evaluate(() => deleteCalls)).toBe(1);
  });

  for (const mutation of ['POST', 'DELETE']) test(`Production ${file}: reads started during pending ${mutation} cannot replace an uncertain result`, async ({ page }) => {
    for (const settlement of ['resolve', 'reject']) {
      await open(page); await useBackend(page);
      await page.evaluate(({ kind, record, mutation }) => {
        APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => mutation === 'DELETE' ? [record] : [];
        window.mutationCalls = 0;
        APP[`${mutation === 'POST' ? 'create' : 'delete'}${kind}`] = () => {
          mutationCalls++;
          return new Promise((_, reject) => window.rejectMutation = reject);
        };
      }, { kind, record: record('Preservar até confirmação'), mutation });
      await page.evaluate(kind => window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`](), kind);
      if (mutation === 'POST') {
        await page.locator(`#${prefix}Title`).fill('Rascunho durante consulta');
        await page.locator(`#${prefix}Content`).fill('Conteúdo preservado.');
        await page.locator(`#save${kind}Btn`).click();
      } else {
        await page.locator('.rule-btn-danger').click(); await page.locator('[data-modal-confirm]').click();
      }
      await expect.poll(() => page.evaluate(() => mutationCalls)).toBe(1);
      await page.evaluate(kind => {
        APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = () => new Promise((resolve, reject) => { window.finishRead = resolve; window.rejectRead = reject; });
        window.oldRead = window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]().catch(() => {});
        rejectMutation(new TypeError('Unknown mutation result'));
      }, kind);
      await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Atualizar lista');
      await page.evaluate(async settlement => {
        if (settlement === 'resolve') finishRead([]);
        else rejectRead(new Error('Late read rejection'));
        await oldRead;
      }, settlement);
      await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Atualizar lista');
      await expect(page.locator(`#${plural}List`)).toHaveAttribute('aria-busy', 'false');
      if (mutation === 'POST') await expect(page.locator(`#${prefix}Title`)).toHaveValue('Rascunho durante consulta');
      else await expect(page.locator('.rule-card-title')).toHaveText('Preservar até confirmação');
      expect(await page.evaluate(() => mutationCalls)).toBe(1);
    }
  });

  test(`Production ${file}: invalid draft and cancelled deletion preserve a pending read and recover busy state`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(({ kind, record }) => { APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record]; }, { kind, record: record('Lista confirmada') });
    await page.evaluate(kind => window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`](), kind);
    await page.evaluate(kind => {
      window.mutationCalls = 0;
      APP[`create${kind}`] = APP[`delete${kind}`] = async () => { mutationCalls++; };
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = () => new Promise(resolve => window.finishRead = resolve);
      window.oldRead = window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`]();
    }, kind);
    await page.locator(`#save${kind}Btn`).click();
    await expect(page.locator(`#${prefix}FormError`)).toContainText('Informe');
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
    await page.locator('.rule-btn-danger').click(); await page.locator('[data-modal-cancel]').click();
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
    expect(await page.evaluate(() => mutationCalls)).toBe(0);
    await expect(page.locator(`#${plural}List`)).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(async () => { finishRead([]); await oldRead; });
    await expect(page.locator(`#${plural}List`)).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator(`#${plural}LoadStatus`)).toBeHidden();
  });

  test(`Production ${file}: delete is serialized and cancellation never touches data`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(({ kind, record }) => { APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record]; }, { kind, record: record('Publicação para excluir') });
    await page.evaluate(kind => window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`](), kind);
    await page.evaluate(kind => {
      window.deleteCalls = 0;
      APP[`delete${kind}`] = async () => { deleteCalls++; await new Promise(resolve => window.releaseDelete = resolve); };
    }, kind);
    await page.locator('.rule-btn-danger').click(); await page.locator('[data-modal-cancel]').click();
    expect(await page.evaluate(() => deleteCalls)).toBe(0);
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
    await page.locator('.rule-btn-danger').click(); await page.locator('[data-modal-confirm]').click();
    await expect.poll(() => page.evaluate(() => deleteCalls)).toBe(1);
    await expect(page.locator('.rule-btn-danger')).toBeDisabled();
    await expect(page.locator('.rule-btn-danger')).toHaveText('Excluindo…');
    await expect(page.locator(`#save${kind}Btn`)).toBeDisabled();
    await page.evaluate(kind => { void window[`delete${kind}`]('post-qa'); }, kind);
    expect(await page.evaluate(() => deleteCalls)).toBe(1);
    await page.evaluate(kind => {
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [];
      releaseDelete();
    }, kind);
    await expect(page.locator('.rule-card')).toHaveCount(0);
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
  });

  test(`Production ${file}: accepted deletion stays removed when the subsequent refresh fails`, async ({ page }) => {
    await open(page); await useBackend(page);
    await page.evaluate(({ kind, record }) => { APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => [record]; }, { kind, record: record('Exclusão confirmada') });
    await page.evaluate(kind => window[`render${kind === 'Rule' ? 'Rules' : 'Suggestions'}`](), kind);
    await page.evaluate(kind => {
      APP[`delete${kind}`] = async () => {};
      APP[kind === 'Rule' ? 'listRules' : 'listSuggestions'] = async () => { throw new Error('HTTP 503 secret-qa'); };
    }, kind);
    await page.locator('.rule-btn-danger').click(); await page.locator('[data-modal-confirm]').click();
    await expect(page.locator('.rule-card')).toHaveCount(0);
    await expect(page.locator('.ui-toast').last()).toContainText('excluída');
    await expect(page.locator('.ui-toast').last()).not.toContainText('secret-qa');
    await expect(page.locator(`#${plural}LoadStatus button`)).toHaveText('Tentar novamente');
    await expect(page.locator(`#save${kind}Btn`)).toBeEnabled();
  });
}
