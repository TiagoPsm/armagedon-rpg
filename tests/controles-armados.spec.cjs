/* ============================================================
 * controles-armados.spec.cjs — "todo botao visivel tem dono"
 * (Etapa 84; convencao nascida nas Etapas 81-83)
 *
 * A REGRA
 * -------
 * Botao ESTATICO (presente no HTML servido), visivel e habilitado quando
 * a pagina esta pronta, precisa provar que alguem o escuta: `onclick`
 * inline OU `data-armed="1"` posto pelo modulo no momento em que ele liga
 * o listener.
 *
 * POR QUE data-armed EXISTE
 * -------------------------
 * Handler registrado por addEventListener nao aparece no elemento, e
 * handler delegado nem sequer esta nele. `getEventListeners` so existe no
 * DevTools. Sem um marcador deixado por quem arma, a garantia "este botao
 * faz alguma coisa" simplesmente nao e verificavel — e foi assim que a
 * Mesa passou meses com o desenho, o Selecionar/Mover e o zoom mortos
 * durante o boot (Etapas 81-82), e a Ficha com a bandeja de dados
 * (Etapa 83). Todos visiveis, clicaveis e sem nenhum efeito.
 *
 * POR QUE SO O ESTATICO
 * ---------------------
 * Botao renderizado em runtime (mini-btn, stat-step-btn, marcadores do
 * token...) e criado pelo proprio modulo que ja esta vivo — por
 * construcao ele nao pode nascer morto. A familia de bugs mora nos
 * controles que o HTML entrega prontos ANTES de o JS armar. Por isso o
 * teste compara com o HTML SERVIDO, e nao com o DOM inteiro: exigir
 * marca de botao dinamico seria ruido sem risco correspondente.
 * ============================================================ */
const { test, expect } = require("@playwright/test");
const { closeMesaTestServer, getMesaBaseUrl } = require("./mesa-test-server.cjs");

test.afterAll(async () => {
  await closeMesaTestServer();
});

const PAGINAS = [
  { arquivo: "index.html",     pronto: "body" },
  { arquivo: "ficha.html",     pronto: "#sheetScreen, #masterScreen" },
  { arquivo: "mesa.html",      pronto: "#mesaStageWrap" },
  { arquivo: "regras.html",    pronto: "body" },
  { arquivo: "sugestoes.html", pronto: "body" },
  { arquivo: "echos.html",     pronto: "body" }
];

/** Assinatura estavel de um botao: id quando houver, senao a lista de
 *  classes. E o que permite casar o DOM vivo com o HTML servido. */
function assinaturasEstaticas(html) {
  const assinaturas = new Set();
  const tags = html.match(/<button\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const id = /\bid\s*=\s*"([^"]+)"/i.exec(tag);
    if (id) { assinaturas.add(`#${id[1]}`); continue; }
    const classe = /\bclass\s*=\s*"([^"]+)"/i.exec(tag);
    if (classe) {
      assinaturas.add("." + classe[1].trim().split(/\s+/).sort().join("."));
    }
  }
  return assinaturas;
}

for (const { arquivo, pronto } of PAGINAS) {
  test(`${arquivo}: todo botao estatico visivel tem dono`, async ({ page }) => {
    const baseUrl = await getMesaBaseUrl();

    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("tc_session", JSON.stringify({
        username: "mestre", role: "master", token: "", backend: false
      }));
      localStorage.setItem("tc_players", JSON.stringify([{ username: "ana", charname: "Ana Rubra" }]));
      localStorage.setItem("tc_sheets", JSON.stringify({ ana: { charName: "Ana Rubra" } }));
    });

    const url = `${baseUrl}/${arquivo}`;
    const estaticas = assinaturasEstaticas(await (await page.request.get(url)).text());

    await page.goto(url);
    await page.locator(pronto).first().waitFor();
    // A pagina precisa estar ASSENTADA: o alvo do teste e justamente o
    // controle que continua mudo depois de tudo carregar.
    await page.waitForLoadState("networkidle").catch(() => {});

    const mudos = await page.evaluate(listaEstatica => {
      const estaticos = new Set(listaEstatica);
      const fora = [];
      document.querySelectorAll("button").forEach(btn => {
        if (btn.disabled || !btn.offsetParent) return;
        const assinatura = btn.id
          ? `#${btn.id}`
          : "." + String(btn.className || "").trim().split(/\s+/).sort().join(".");
        if (!estaticos.has(assinatura)) return;            // renderizado em runtime
        if (btn.getAttribute("onclick")) return;           // dono explicito no HTML
        if (btn.dataset.armed === "1") return;             // dono declarado pelo modulo
        fora.push(assinatura);
      });
      return [...new Set(fora)];
    }, [...estaticas]);

    expect(
      mudos,
      `botoes estaticos visiveis sem onclick nem data-armed em ${arquivo}: ${mudos.join(", ")}`
    ).toEqual([]);
  });
}
