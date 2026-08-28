/* ============================================================
 * mesa-paridade-online.spec.cjs — SOMENTE LEITURA (2026-08-28)
 *
 * Pergunta do Tiago: "mestre e jogadores estao vendo as mesmas
 * coisas na mesa (desenhos e posicao dos tokens)?"
 *
 * Abre os DOIS clientes contra a producao, espera o boot, e
 * compara o que cada um tem em memoria. Nao move, nao desenha,
 * nao cria nem apaga nada — so le o estado renderizado.
 *
 * Divergencias LEGITIMAS (nao sao dessincronia):
 *   - token/traco da camada "dm" (secreta do mestre)
 *   - token com visibleToPlayers = false
 * O teste desconta as duas antes de comparar.
 * ============================================================ */
const { test, expect } = require("@playwright/test");

const SITE = (process.env.ARMAGEDON_SITE_URL || "https://tiagopsm.github.io/armagedon-rpg").replace(/\/+$/, "");
const API  = (process.env.ARMAGEDON_API_BASE_URL || "https://armagedon-api.tiagopsm2008.workers.dev/api").replace(/\/+$/, "");

const CREDS = {
  master: [process.env.ARMAGEDON_MASTER_USERNAME, process.env.ARMAGEDON_MASTER_PASSWORD],
  player: [process.env.ARMAGEDON_PLAYER_USERNAME, process.env.ARMAGEDON_PLAYER_PASSWORD]
};

test.describe("Paridade mestre x jogador (producao, somente leitura)", () => {
  test.skip(!CREDS.master[0] || !CREDS.player[0], "Sem credenciais online.");

  async function login(request, [user, pass]) {
    const res = await request.post(`${API}/auth/login`, { data: { username: user, password: pass } });
    expect(res.ok(), `login de ${user} falhou`).toBeTruthy();
    return res.json();
  }

  test("os dois veem os mesmos tokens (posicao) e os mesmos desenhos", async ({ browser, request }) => {
    const master = await login(request, CREDS.master);
    const player = await login(request, CREDS.player);

    const abrir = async (sessao, papel, tag) => {
      const context = await browser.newContext();
      await context.addInitScript(({ token, username, role }) => {
        localStorage.setItem("tc_session_token", token);
        localStorage.setItem("tc_session", JSON.stringify({ username, role, token, backend: true }));
      }, { token: sessao.token, username: sessao.user.username, role: papel });
      const page = await context.newPage();
      await page.goto(`${SITE}/mesa.html?${tag}=${Date.now()}`);
      await page.waitForFunction(() => typeof state !== "undefined" && state.bootCompleted === true, { timeout: 20000 });
      return { context, page };
    };

    const mestre  = await abrir(master, "master", "paridade-master");
    const jogador = await abrir(player, "player", "paridade-player");

    // Folga para o WebSocket assentar e os deltas de boot chegarem.
    await mestre.page.waitForTimeout(4000);

    const ler = page => page.evaluate(() => {
      const tokens = (typeof getRenderedTokens === "function" ? getRenderedTokens() : [])
        .map(t => ({
          id: String(t.id),
          x: Math.round(Number(t.x) * 100) / 100,
          y: Math.round(Number(t.y) * 100) / 100,
          escala: Math.round(Number(t.tokenScale || 1) * 100) / 100,
          layer: String(t.layer || ""),
          visivel: t.visibleToPlayers !== false
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const desenhos = (typeof getDrawingsSnapshot === "function" ? getDrawingsSnapshot() : [])
        .map(s => ({ id: String(s.id || ""), layer: String(s.layer || "") }))
        .sort((a, b) => a.id.localeCompare(b.id));
      return { tokens, desenhos, papel: state.role, cena: state.sceneVersion };
    });

    const noMestre  = await ler(mestre.page);
    const noJogador = await ler(jogador.page);

    // O que o mestre ESPERA que o jogador veja, descontadas as camadas secretas.
    const esperado = {
      tokens: noMestre.tokens.filter(t => t.layer !== "dm" && t.visivel),
      desenhos: noMestre.desenhos.filter(s => s.layer !== "dm")
    };

    console.log("MESTRE :", JSON.stringify(noMestre, null, 1));
    console.log("JOGADOR:", JSON.stringify(noJogador, null, 1));
    console.log("SEGREDO:", JSON.stringify({
      tokensDm: noMestre.tokens.filter(t => t.layer === "dm").length,
      tokensOcultos: noMestre.tokens.filter(t => t.layer !== "dm" && !t.visivel).length,
      tracosDm: noMestre.desenhos.filter(s => s.layer === "dm").length
    }));

    expect(noMestre.papel).toBe("master");
    expect(noJogador.papel).toBe("player");
    expect(esperado.tokens.length + esperado.desenhos.length,
      "cena publicada vazia: nao ha o que comparar").toBeGreaterThan(0);

    expect(noJogador.tokens.map(t => `${t.id}@${t.x},${t.y}x${t.escala}`),
      "posicao/tamanho de token divergem entre mestre e jogador")
      .toEqual(esperado.tokens.map(t => `${t.id}@${t.x},${t.y}x${t.escala}`));

    expect(noJogador.desenhos.map(s => s.id),
      "os desenhos visiveis divergem entre mestre e jogador")
      .toEqual(esperado.desenhos.map(s => s.id));

    await mestre.context.close();
    await jogador.context.close();
  });
});
