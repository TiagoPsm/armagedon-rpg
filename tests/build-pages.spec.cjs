/* O artefato publicado (_site) tem de se comportar como o repositorio.
 *
 * O bug que motivou este spec (Etapa 118): a versao dos bundles era uma
 * constante bumpada na mao. Ela ficou parada, o CDN e o navegador continuaram
 * servindo o CSS ANTIGO com o HTML NOVO, e o botao da camada apareceu com os
 * DOIS rotulos ("TOKENS" e "MEU TOKEN") no site publicado — enquanto tudo
 * passava no repositorio. Testar so o codigo-fonte nunca acharia isso.
 */
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const siteDir = path.join(repoRoot, "_site");

test.beforeAll(() => {
  execFileSync(process.execPath, [path.join(repoRoot, "tools", "build-pages.cjs")], { cwd: repoRoot });
});

function lerHtml(nome) {
  return fs.readFileSync(path.join(siteDir, nome), "utf8");
}

test.describe("Artefato do GitHub Pages (Etapa 118)", () => {
  test("a URL do bundle muda quando o conteudo muda", () => {
    const antes = lerHtml("mesa.html").match(/mesa-page\.bundle\.css\?v=([a-z0-9]+)/)[1];

    // Mexe num arquivo que entra no bundle e reconstroi.
    const alvo = path.join(repoRoot, "css", "mesa.css");
    const original = fs.readFileSync(alvo, "utf8");
    try {
      fs.writeFileSync(alvo, original + "\n/* marcador temporario de teste */\n", "utf8");
      execFileSync(process.execPath, [path.join(repoRoot, "tools", "build-pages.cjs")], { cwd: repoRoot });
      const depois = lerHtml("mesa.html").match(/mesa-page\.bundle\.css\?v=([a-z0-9]+)/)[1];
      expect(depois, "conteudo mudou e a URL do bundle ficou igual — cache servira o CSS velho")
        .not.toBe(antes);
    } finally {
      fs.writeFileSync(alvo, original, "utf8");
      execFileSync(process.execPath, [path.join(repoRoot, "tools", "build-pages.cjs")], { cwd: repoRoot });
    }
  });

  test("nenhum arquivo referenciado pelo HTML fica de fora do que e publicado", () => {
    for (const nome of ["mesa.html", "ficha.html", "index.html"]) {
      const html = lerHtml(nome);
      const refs = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
      for (const ref of refs) {
        expect(fs.existsSync(path.join(siteDir, ref)), `${nome} aponta para ${ref}, que nao foi publicado`)
          .toBe(true);
      }
    }
  });

  test("o CSS que decide o rotulo por papel chega ao bundle da Mesa", () => {
    const bundle = fs.readFileSync(path.join(siteDir, "css", "mesa-page.bundle.css"), "utf8");
    const html = lerHtml("mesa.html");
    // Se o HTML traz as duas variantes, o CSS que esconde uma delas tem de
    // estar publicado junto — senao o botao mostra as duas de uma vez.
    expect(html).toContain('data-role-label="master"');
    expect(html).toContain('data-role-label="player"');
    expect(bundle, "o bundle publicado nao esconde a variante do outro papel")
      .toContain('[data-role-label="master"]');
  });
});
