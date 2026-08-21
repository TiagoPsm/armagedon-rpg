/* Etapa 117 — resize de token contra o Worker + Durable Object REAIS.
 *
 * O resto da suite roda com o realtime simulado. Este spec fecha o circuito:
 * dois NAVEGADORES de verdade, um mestre e um jogador, ligados ao Worker
 * (wrangler dev --local) e ao Durable Object. O jogador arrasta a alca do
 * proprio token e o token tem de CRESCER na tela do mestre.
 *
 * Como rodar (dois terminais):
 *   npx wrangler dev --config cloudflare/wrangler.toml --local --port 8799
 *   npx serve . --listen 8000
 *   $env:ARMAGEDON_LOCAL_WORKER="http://127.0.0.1:8799/api"
 *   $env:ARMAGEDON_LOCAL_SITE="http://127.0.0.1:8000"
 *   $env:ARMAGEDON_LOCAL_PLAYER_PASSWORD="<senha do jogador de teste>"
 *   npx playwright test tests/mesa-resize-worker.spec.cjs
 *
 * Sem as variaveis o spec se pula sozinho — nunca reprova por falta de
 * ambiente, e nunca finge que passou.
 */
const { test, expect } = require("@playwright/test");

const API  = process.env.ARMAGEDON_LOCAL_WORKER || "";
const SITE = process.env.ARMAGEDON_LOCAL_SITE || "http://127.0.0.1:8000";
const MASTER_USER = process.env.ARMAGEDON_LOCAL_MASTER_USER || "mestre";
const MASTER_PASS = process.env.ARMAGEDON_LOCAL_MASTER_PASSWORD || "";
const PLAYER_USER = process.env.ARMAGEDON_LOCAL_PLAYER_USER || "jogador1";
const PLAYER_PASS = process.env.ARMAGEDON_LOCAL_PLAYER_PASSWORD || "";

test.describe("Resize de token no Worker real (Etapa 117)", () => {
  test.skip(!API || !MASTER_PASS || !PLAYER_PASS,
    "defina ARMAGEDON_LOCAL_WORKER, ARMAGEDON_LOCAL_MASTER_PASSWORD e ARMAGEDON_LOCAL_PLAYER_PASSWORD");

  async function login(request, username, password) {
    const r = await request.post(`${API}/auth/login`, { data: { username, password } });
    const d = await r.json();
    expect(d.token, `login de ${username} falhou: ${JSON.stringify(d)}`).toBeTruthy();
    return d;
  }

  async function abrirMesa(context, sessao) {
    const page = await context.newPage();
    await page.addInitScript(([api, sess]) => {
      window.ARMAGEDON_CONFIG = { apiBaseUrl: api, realtimeEnabled: true };
      localStorage.setItem("tc_session", JSON.stringify(sess));
    }, [API, sessao]);
    await page.goto(`${SITE}/mesa.html`);
    await page.waitForFunction(() => typeof state !== "undefined" && Array.isArray(state.tokens));
    return page;
  }

  test("o jogador arrasta a alca e o token cresce na tela do mestre", async ({ browser, request }) => {
    const mestreLogin  = await login(request, MASTER_USER, MASTER_PASS);
    const jogadorLogin = await login(request, PLAYER_USER, PLAYER_PASS);

    // Cena conhecida: um token do jogador e um de outro personagem.
    const tokens = [
      { id: PLAYER_USER, characterKey: PLAYER_USER, type: "player", ownerUsername: PLAYER_USER,
        name: "Jogador Um", x: 25, y: 25, order: 1, tokenScale: 1, layer: "tokens",
        visibleToPlayers: true, statsVisibleToPlayers: true }
    ];
    await request.put(`${API}/mesa/scene`, {
      headers: { authorization: `Bearer ${mestreLogin.token}` },
      data: { sceneVersion: 1, tokenStyle: "minimal", tokens }
    });

    const ctxMestre  = await browser.newContext();
    const ctxJogador = await browser.newContext();
    const mestre = await abrirMesa(ctxMestre, {
      username: MASTER_USER, role: "master", token: mestreLogin.token, backend: true
    });
    const jogador = await abrirMesa(ctxJogador, {
      username: PLAYER_USER, role: "player", token: jogadorLogin.token, backend: true
    });

    // Os dois precisam estar mesmo no realtime — senao o teste "passaria"
    // provando nada (era exatamente assim que o bug se escondia).
    for (const [nome, page] of [["mestre", mestre], ["jogador", jogador]]) {
      await expect
        .poll(() => page.evaluate(() => state.realtimeStatus), { timeout: 20000, message: `${nome} nao conectou` })
        .toBe("online");
    }
    // O mestre destrava o movimento (o DO recusa move de jogador travado).
    await mestre.evaluate(() => { if (state.playersMoveLocked) toggleMesaMoveLock(); });

    const seletor = `.mesa-token[data-token-id="${PLAYER_USER}"]`;
    await mestre.locator(seletor).waitFor();
    const larguraAntes = (await mestre.locator(seletor).boundingBox()).width;

    // Jogador redimensiona pelo gesto real.
    await jogador.evaluate(id => selectToken(id), PLAYER_USER);
    const alca = jogador.locator(`${seletor} .mesa-token-handle[data-handle="se"]`);
    await expect(alca).toBeVisible();
    const box = await alca.boundingBox();
    await jogador.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await jogador.mouse.down();
    await jogador.mouse.move(box.x + 130, box.y + 130, { steps: 10 });
    await jogador.mouse.up();

    const escalaJogador = await jogador.evaluate(id => findToken(id).tokenScale, PLAYER_USER);
    expect(escalaJogador, "o token nem cresceu na tela de quem arrastou").toBeGreaterThan(1);

    // A prova: o mestre, do outro lado do Worker, ve o tamanho novo.
    await expect
      .poll(() => mestre.evaluate(id => findToken(id)?.tokenScale, PLAYER_USER),
        { timeout: 10000, message: "o resize do jogador nao chegou ao mestre" })
      .toBeCloseTo(escalaJogador, 2);

    const larguraDepois = (await mestre.locator(seletor).boundingBox()).width;
    expect(larguraDepois, "o token nao cresceu de fato na tela do mestre")
      .toBeGreaterThan(larguraAntes * 1.5);

    await ctxMestre.close();
    await ctxJogador.close();
  });

  /* Camada de baixo do mesmo circuito: o Durable Object em si. Aqui nao ha
     navegador — sao dois WebSockets crus contra o Worker local, para provar
     que o `tokenScale` atravessa o relay intacto e que a autorizacao continua
     de pe (delta forjado em token alheio nao passa). */
  test("o Durable Object retransmite o tokenScale e barra o resize forjado", async ({ request }) => {
    const mestreLogin  = await login(request, MASTER_USER, MASTER_PASS);
    const jogadorLogin = await login(request, PLAYER_USER, PLAYER_PASS);
    const wsBase = `${API.replace(/^http/, "ws")}/mesa/realtime`;

    function conectar(token) {
      return new Promise((res, rej) => {
        const ws = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`);
        ws.inbox = [];
        ws.addEventListener("message", e => { try { ws.inbox.push(JSON.parse(e.data)); } catch {} });
        ws.addEventListener("open", () => res(ws));
        ws.addEventListener("error", () => rej(new Error("falha no WebSocket")));
        setTimeout(() => rej(new Error("timeout no WebSocket")), 15000);
      });
    }
    const espera = ms => new Promise(r => setTimeout(r, ms));
    async function achar(ws, fn, ms = 4000) {
      const fim = Date.now() + ms;
      while (Date.now() < fim) {
        const hit = ws.inbox.find(fn);
        if (hit) return hit;
        await espera(100);
      }
      return null;
    }

    const mestre  = await conectar(mestreLogin.token);
    const jogador = await conectar(jogadorLogin.token);
    await espera(400);
    mestre.send(JSON.stringify({ type: "mesa:move:lock", locked: false, clientId: "mestre-teste" }));
    await espera(400);
    mestre.inbox.length = 0;

    jogador.send(JSON.stringify({
      type: "mesa:token:move", clientId: "c-jogador", messageId: "c-jogador:1", sceneVersion: 1,
      tokenId: PLAYER_USER, characterKey: PLAYER_USER, x: 31.5, y: 42.25, order: 1, tokenScale: 3
    }));

    const recebido = await achar(mestre, m => m.type === "mesa:token:move");
    expect(recebido, "o delta do jogador nao chegou ao mestre").toBeTruthy();
    expect(recebido.tokenScale, "o Worker/DO comeu o tokenScale").toBe(3);
    expect(recebido.x).toBe(31.5);
    expect(recebido.y).toBe(42.25);
    // O ator carimbado pelo DO e o que o cliente usa para validar posse.
    expect(recebido.actor).toMatchObject({ username: PLAYER_USER, role: "player" });

    // Forjado em token alheio: recusado no DO e invisivel para o mestre.
    mestre.inbox.length = 0;
    jogador.send(JSON.stringify({
      type: "mesa:token:move", clientId: "c-jogador", messageId: "c-jogador:2", sceneVersion: 1,
      tokenId: "outro", characterKey: "outro", x: 9, y: 9, order: 1, tokenScale: 12
    }));
    const ackForjado = await achar(jogador, m => m.type === "mesa:scene:ack" && m.messageId === "c-jogador:2");
    expect(ackForjado?.ok, "o DO aceitou resize em token alheio").toBe(false);
    expect(await achar(mestre, m => m.type === "mesa:token:move", 1500),
      "delta forjado vazou para o mestre").toBeNull();

    // Trava de movimento ligada: o resize do jogador nao passa (limite conhecido).
    mestre.send(JSON.stringify({ type: "mesa:move:lock", locked: true, clientId: "mestre-teste" }));
    await espera(500);
    jogador.send(JSON.stringify({
      type: "mesa:token:move", clientId: "c-jogador", messageId: "c-jogador:3", sceneVersion: 1,
      tokenId: PLAYER_USER, characterKey: PLAYER_USER, x: 50, y: 50, order: 1, tokenScale: 5
    }));
    const ackTravado = await achar(jogador, m => m.type === "mesa:scene:ack" && m.messageId === "c-jogador:3");
    expect(ackTravado?.ok, "com a trava ligada o resize do jogador deveria ser recusado").toBe(false);

    // Mestre redimensiona: sempre passa, com o tamanho intacto.
    mestre.send(JSON.stringify({ type: "mesa:move:lock", locked: false, clientId: "mestre-teste" }));
    await espera(400);
    jogador.inbox.length = 0;
    mestre.send(JSON.stringify({
      type: "mesa:token:move", clientId: "c-mestre", messageId: "c-mestre:1", sceneVersion: 1,
      tokenId: PLAYER_USER, characterKey: PLAYER_USER, x: 12, y: 13, order: 2, tokenScale: 4.5
    }));
    const doMestre = await achar(jogador, m => m.type === "mesa:token:move");
    expect(doMestre?.tokenScale, "o resize do mestre chegou sem o tamanho").toBe(4.5);

    mestre.close();
    jogador.close();
  });
});
