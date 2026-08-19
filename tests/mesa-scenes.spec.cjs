/* ============================================================
 * mesa-scenes.spec.cjs — Gaveta de cenas (Etapa 89)
 *
 * O que esta suite protege, alem de "o botao funciona":
 *
 *   1. NADA de window.prompt/confirm. Eram eles que tornavam o
 *      gerenciador de cenas inacessivel — leitor de tela anuncia
 *      mal e o popup nativo trava a aba. Um espiao reprova a suite
 *      se alguem os trouxer de volta.
 *   2. Foco preso na gaveta enquanto aberta, Esc fechando e o foco
 *      VOLTANDO para o botao que abriu. Sem isso, quem navega por
 *      teclado cai no <body> e recomeca do topo da pagina.
 *   3. Nenhuma requisicao de cena com a gaveta fechada (carga
 *      preguicosa) — o pedido do Tiago de site rapido vira teste.
 *   4. O jogador nunca ve nada disso.
 * ============================================================ */
const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

const ANA_TOKEN = {
  id: "ana", characterKey: "ana", x: 10, y: 10,
  visibleToPlayers: true, statsVisibleToPlayers: true, order: 1
};

const CENAS = [
  { id: "default", name: "Cena principal", updatedAt: null, active: true, mapUrl: "", tokenCount: 2 },
  { id: "scaverna01", name: "Caverna Sombria", updatedAt: null, active: false, mapUrl: "", tokenCount: 5 },
  { id: "sfloresta01", name: "Floresta Morta", updatedAt: null, active: false, mapUrl: "", tokenCount: 0 }
];

function seedMaster(page) {
  return page.addInitScript(token => {
    if (localStorage.getItem("__mesa_scenes_seeded")) return;
    localStorage.clear();
    localStorage.setItem("__mesa_scenes_seeded", "1");
    localStorage.setItem("tc_session", JSON.stringify({
      username: "mestre", role: "master", token: "", backend: false
    }));
    localStorage.setItem("tc_players", JSON.stringify([{ username: "ana", charname: "Ana Rubra" }]));
    localStorage.setItem("tc_sheets", JSON.stringify({
      ana: { charName: "Ana Rubra", vidaAtual: "8", vidaMax: "12", integAtual: "4", integMax: "6" }
    }));
    localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
      sceneVersion: 3, selectedTokenId: "", tokens: [token]
    }));
  }, ANA_TOKEN);
}

function seedPlayer(page) {
  return page.addInitScript(token => {
    if (localStorage.getItem("__mesa_scenes_seeded")) return;
    localStorage.clear();
    localStorage.setItem("__mesa_scenes_seeded", "1");
    localStorage.setItem("mesaRolePreview", "player");
    localStorage.setItem("tc_session", JSON.stringify({
      username: "ana", role: "player", token: "", backend: false
    }));
    localStorage.setItem("tc_players", JSON.stringify([{ username: "ana", charname: "Ana Rubra" }]));
    localStorage.setItem("tc_sheets", JSON.stringify({
      ana: { charName: "Ana Rubra", vidaAtual: "8", vidaMax: "12", integAtual: "4", integMax: "6" }
    }));
    localStorage.setItem("tc_virtual_mesa_mock_v1", JSON.stringify({
      sceneVersion: 3, selectedTokenId: "", tokens: [token]
    }));
  }, ANA_TOKEN);
}

async function waitForMesaSettled(page) {
  await page.waitForSelector("#mesaStageWrap");
  await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true);
}

/**
 * Backend simulado + espiao nos dialogos nativos.
 *
 * window.prompt/confirm sao substituidos por funcoes que REGISTRAM a chamada
 * e devolvem valor: se alguem voltar a usa-los, o fluxo continua passando mas
 * o espiao denuncia — o teste falha pelo motivo certo.
 */
async function instalarBackendFalso(page, cenas = CENAS) {
  await page.evaluate(listaInicial => {
    window.__sceneCalls = [];
    window.__nativosChamados = [];
    window.prompt = (...args) => { window.__nativosChamados.push(["prompt", ...args]); return "via prompt"; };
    window.confirm = (...args) => { window.__nativosChamados.push(["confirm", ...args]); return true; };

    window.__cenas = listaInicial.map(cena => ({ ...cena }));
    window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
    window.APP = Object.assign({}, window.APP, {
      getMesaScenes: async () => {
        window.__sceneCalls.push(["list"]);
        return { activeId: window.__cenas.find(c => c.active)?.id || "default", scenes: window.__cenas.map(c => ({ ...c })) };
      },
      createMesaScene: async name => {
        window.__sceneCalls.push(["create", name]);
        window.__cenas.push({ id: `s${window.__cenas.length}`, name, updatedAt: null, active: false, mapUrl: "", tokenCount: 0 });
        return { id: `s${window.__cenas.length - 1}`, name };
      },
      renameMesaScene: async (id, name) => {
        window.__sceneCalls.push(["rename", id, name]);
        const alvo = window.__cenas.find(c => c.id === id);
        if (alvo) alvo.name = name;
        return { id, name };
      },
      deleteMesaScene: async id => {
        window.__sceneCalls.push(["delete", id]);
        window.__cenas = window.__cenas.filter(c => c.id !== id);
        return { ok: true };
      },
      activateMesaScene: async id => {
        window.__sceneCalls.push(["activate", id]);
        window.__cenas.forEach(c => { c.active = c.id === id; });
        return { activeId: id };
      }
    });
    return window.refreshMesaScenesUI();
  }, cenas);
}

async function abrirGaveta(page) {
  await page.locator("#mesaScenesToggle").click();
  await expect(page.locator("#mesaScenesDrawer")).toBeVisible();
  await expect.poll(() => page.locator(".mesa-scene-card").count()).toBeGreaterThan(0);
}

test.describe("Gaveta de cenas — mestre (Etapa 89)", () => {
  test("botao abre a gaveta e os cartoes descrevem cada cena", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);

    await expect(page.locator("#mesaScenesToggle")).toBeVisible();
    await expect(page.locator("#mesaScenesToggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#mesaScenesDrawer")).toBeHidden();

    await abrirGaveta(page);
    await expect(page.locator("#mesaScenesToggle")).toHaveAttribute("aria-expanded", "true");

    const cartoes = await page.evaluate(() =>
      [...document.querySelectorAll(".mesa-scene-card")].map(card => ({
        nome: card.querySelector(".mesa-scene-card-name").textContent,
        ativa: card.classList.contains("is-active"),
        // A cena ativa nao oferece "ativar" de novo nem "excluir".
        ativarDesabilitado: card.querySelector('[data-scene-action="activate"]').disabled,
        temExcluir: Boolean(card.querySelector('[data-scene-action="delete"]')),
        meta: card.querySelector(".mesa-scene-card-meta").textContent
      }))
    );

    expect(cartoes).toEqual([
      { nome: "Cena principal",  ativa: true,  ativarDesabilitado: true,  temExcluir: false, meta: "2 tokens" },
      { nome: "Caverna Sombria", ativa: false, ativarDesabilitado: false, temExcluir: true,  meta: "5 tokens" },
      { nome: "Floresta Morta",  ativa: false, ativarDesabilitado: false, temExcluir: true,  meta: "0 tokens" }
    ]);

    // A cena ativa tambem e dita em texto, nao so pela cor da borda.
    await expect(page.locator("#mesaScenesActiveLabel")).toContainText("Cena principal");
  });

  test("ativar uma cena chama a API e anuncia o resultado", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    await page.locator('[data-scene-action="activate"][data-scene-id="scaverna01"]').click();

    await expect(page.locator("#mesaScenesStatus")).toContainText("Caverna Sombria");
    const chamadas = await page.evaluate(() => window.__sceneCalls);
    expect(chamadas).toContainEqual(["activate", "scaverna01"]);
    // A lista se redesenha com a nova ativa.
    await expect(page.locator(".mesa-scene-card.is-active .mesa-scene-card-name")).toHaveText("Caverna Sombria");
  });

  test("criar cena usa dialogo proprio, com validacao — nunca window.prompt", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    await page.locator("#mesaSceneCreateBtn").click();
    await expect(page.locator("#mesaSceneNameDialog")).toBeVisible();
    // O foco cai no campo: quem usa teclado ja pode digitar.
    await expect(page.locator("#mesaSceneNameField")).toBeFocused();

    // Nome vazio nao passa, e o erro e anunciado (role="alert").
    await page.locator("#mesaSceneNameSubmit").click();
    await expect(page.locator("#mesaSceneNameError")).toHaveText(/nome/i);
    expect(await page.evaluate(() => window.__sceneCalls.filter(c => c[0] === "create").length)).toBe(0);

    await page.locator("#mesaSceneNameField").fill("Cripta do Sino");
    await page.locator("#mesaSceneNameSubmit").click();

    await expect(page.locator("#mesaSceneNameDialog")).toBeHidden();
    await expect(page.locator("#mesaScenesStatus")).toContainText("Cripta do Sino");
    expect(await page.evaluate(() => window.__sceneCalls)).toContainEqual(["create", "Cripta do Sino"]);
    expect(await page.evaluate(() => window.__nativosChamados)).toEqual([]);
  });

  test("renomear abre com o nome atual e salva", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    await page.locator('[data-scene-action="rename"][data-scene-id="scaverna01"]').click();
    await expect(page.locator("#mesaSceneNameField")).toHaveValue("Caverna Sombria");

    await page.locator("#mesaSceneNameField").fill("Caverna Profunda");
    await page.locator("#mesaSceneNameSubmit").click();

    await expect(page.locator("#mesaSceneNameDialog")).toBeHidden();
    expect(await page.evaluate(() => window.__sceneCalls)).toContainEqual(["rename", "scaverna01", "Caverna Profunda"]);
    await expect(page.locator('.mesa-scene-card[data-scene-id="scaverna01"] .mesa-scene-card-name')).toHaveText("Caverna Profunda");
    expect(await page.evaluate(() => window.__nativosChamados)).toEqual([]);
  });

  test("excluir confirma no dialogo do site — nunca window.confirm", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    await page.locator('[data-scene-action="delete"][data-scene-id="sfloresta01"]').click();

    // O dialogo do site (UI.confirm) aparece e diz o que se perde.
    const confirmacao = page.locator(".ui-modal-panel");
    await expect(confirmacao).toBeVisible();
    await expect(confirmacao).toContainText("Floresta Morta");
    await confirmacao.locator("[data-modal-confirm]").click();

    await expect(page.locator("#mesaScenesStatus")).toContainText("excluida");
    expect(await page.evaluate(() => window.__sceneCalls)).toContainEqual(["delete", "sfloresta01"]);
    expect(await page.evaluate(() => window.__nativosChamados)).toEqual([]);
    await expect(page.locator('.mesa-scene-card[data-scene-id="sfloresta01"]')).toHaveCount(0);
  });

  test("cancelar a exclusao nao apaga nada", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    await page.locator('[data-scene-action="delete"][data-scene-id="sfloresta01"]').click();
    await page.locator(".ui-modal-panel [data-modal-cancel]").click();

    expect(await page.evaluate(() => window.__sceneCalls.filter(c => c[0] === "delete"))).toEqual([]);
    await expect(page.locator('.mesa-scene-card[data-scene-id="sfloresta01"]')).toHaveCount(1);
  });

  test("busca filtra a lista e diz quantas sobraram", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    await page.locator("#mesaScenesSearch").fill("cav");
    await expect(page.locator(".mesa-scene-card")).toHaveCount(1);
    await expect(page.locator("#mesaScenesStatus")).toContainText("1 cena encontrada");

    await page.locator("#mesaScenesSearch").fill("zzz");
    await expect(page.locator(".mesa-scene-card")).toHaveCount(0);
    await expect(page.locator("#mesaScenesEmpty")).toBeVisible();
  });
});

test.describe("Gaveta de cenas — teclado e foco (Etapa 89)", () => {
  test("Esc fecha a gaveta e devolve o foco ao botao que abriu", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);

    await page.locator("#mesaScenesToggle").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#mesaScenesDrawer")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#mesaScenesDrawer")).toBeHidden();
    await expect(page.locator("#mesaScenesToggle")).toBeFocused();
    await expect(page.locator("#mesaScenesToggle")).toHaveAttribute("aria-expanded", "false");
  });

  test("o foco fica preso dentro da gaveta enquanto ela esta aberta", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    // Uma volta inteira de Tab nao pode escapar para o palco atras.
    for (let passo = 0; passo < 25; passo += 1) {
      await page.keyboard.press("Tab");
      const dentro = await page.evaluate(() =>
        document.getElementById("mesaScenesDrawerPanel").contains(document.activeElement)
      );
      expect(dentro, `Tab numero ${passo + 1} escapou da gaveta`).toBe(true);
    }
  });

  test("Esc dentro do dialogo de nome fecha SO o dialogo", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);
    await abrirGaveta(page);

    await page.locator("#mesaSceneCreateBtn").click();
    await expect(page.locator("#mesaSceneNameDialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#mesaSceneNameDialog")).toBeHidden();
    // A gaveta continua aberta: o Esc pertencia ao dialogo de cima.
    await expect(page.locator("#mesaScenesDrawer")).toBeVisible();
  });
});

test.describe("Gaveta de cenas — carga e permissao (Etapa 89)", () => {
  test("gaveta fechada nao pede a lista de cenas", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page);

    // refreshMesaScenesUI ja rodou (dentro do instalarBackendFalso) e o boot
    // tambem chama. Nenhum dos dois pode custar requisicao com a gaveta
    // fechada — a lista so e buscada quando alguem vai olhar.
    expect(await page.evaluate(() => window.__sceneCalls.filter(c => c[0] === "list"))).toEqual([]);

    await abrirGaveta(page);
    expect(await page.evaluate(() => window.__sceneCalls.filter(c => c[0] === "list").length)).toBe(1);
  });

  test("as miniaturas carregam so quando entram na tela", async ({ page }) => {
    await seedMaster(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);
    await instalarBackendFalso(page, [
      { id: "default", name: "Com mapa", updatedAt: null, active: true, mapUrl: "logo-rpg-site.webp", tokenCount: 1 }
    ]);
    await abrirGaveta(page);

    const img = await page.evaluate(() => {
      const el = document.querySelector(".mesa-scene-thumb img");
      return el ? { loading: el.loading, decoding: el.decoding, alt: el.alt } : null;
    });
    // alt vazio de proposito: a imagem e decorativa, o nome da cena ja esta
    // no texto do cartao — leitor de tela nao deve ler duas vezes.
    expect(img).toEqual({ loading: "lazy", decoding: "async", alt: "" });
  });

  test("jogador nunca ve o botao nem a gaveta", async ({ page }) => {
    await seedPlayer(page);
    await page.goto(`${await getMesaBaseUrl()}/mesa.html`);
    await waitForMesaSettled(page);

    const visivel = await page.evaluate(async () => {
      window.AUTH = Object.assign({}, window.AUTH, { isBackendEnabled: () => true });
      window.APP = Object.assign({}, window.APP, { getMesaScenes: async () => ({ scenes: [], activeId: "default" }) });
      await window.refreshMesaScenesUI();
      // Tentativa direta: a funcao global tambem tem que recusar.
      window.openMesaScenesDrawer?.();
      return {
        botao: !document.getElementById("mesaScenesToggle").hidden,
        gaveta: !document.getElementById("mesaScenesDrawer").hidden
      };
    });

    expect(visivel).toEqual({ botao: false, gaveta: false });
  });
});
