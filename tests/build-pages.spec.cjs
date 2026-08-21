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

/* Etapa 119: a ordem dos scripts e um contrato — e ela vale para o artefato
   publicado tambem. O bundle listava os arquivos a mao e ja tinha divergido:
   faltavam arquivos (que sobravam como tags soltas DEPOIS do bundle) e a
   ordem da Ficha estava invertida (ui.js antes de runtime-config.js). */
test.describe("Ordem dos scripts no bundle (Etapa 119)", () => {
  function refsDoHtml(html, tipo) {
    const re = tipo === "js"
      ? /<script\s+src="((?:css|js)\/[^"?]+)(?:\?[^"]*)?"(?:\s+defer)?\s*><\/script>/g
      : /<link\s+rel="stylesheet"\s+href="((?:css|js)\/[^"?]+)(?:\?[^"]*)?"[^>]*\/>/g;
    return [...html.matchAll(re)].map(m => m[1]);
  }
  function ordemNoBundle(bundleRel) {
    const txt = fs.readFileSync(path.join(siteDir, bundleRel), "utf8");
    return [...txt.matchAll(/^\/\* ((?:css|js)\/[^ ]+) \*\/$/gm)].map(m => m[1]);
  }

  for (const [pagina, cssBundle, jsBundle] of [
    ["mesa.html",  "css/mesa-page.bundle.css",  "js/mesa-page.bundle.js"],
    ["ficha.html", "css/ficha-page.bundle.css", "js/ficha-page.bundle.js"],
  ]) {
    test(`${pagina}: o bundle tem os mesmos arquivos, na mesma ordem do HTML`, () => {
      const fonte = fs.readFileSync(path.join(repoRoot, pagina), "utf8");
      expect(ordemNoBundle(jsBundle), `JS do bundle de ${pagina} fora de ordem`)
        .toEqual(refsDoHtml(fonte, "js"));
      expect(ordemNoBundle(cssBundle), `CSS do bundle de ${pagina} fora de ordem`)
        .toEqual(refsDoHtml(fonte, "css"));
    });

    test(`${pagina}: nenhuma tag css/js sobra fora do bundle no artefato`, () => {
      const publicado = lerHtml(pagina);
      const sobras = [...refsDoHtml(publicado, "js"), ...refsDoHtml(publicado, "css")]
        .filter(f => !f.endsWith(".bundle.js") && !f.endsWith(".bundle.css"));
      // Uma tag fora do bundle roda DEPOIS dele em producao, mesmo que no
      // repositorio ela venha antes — foi assim que mesa-permissions.js
      // passou a rodar depois de mesa-stage.js no site publicado.
      expect(sobras, "tag fora do bundle: a ordem publicada difere da do repositorio")
        .toEqual([]);
    });
  }

  test("um <script> inline no meio do bloco faz o build FALHAR, nao reordenar", () => {
    const alvo = path.join(repoRoot, "mesa.html");
    const original = fs.readFileSync(alvo, "utf8");
    const marca = '<script src="js/mesa-core.js';
    expect(original).toContain(marca);
    try {
      fs.writeFileSync(alvo, original.replace(marca, '<script>window.__intruso=1</script>\n  ' + marca), "utf8");
      let falhou = false;
      try {
        execFileSync(process.execPath, [path.join(repoRoot, "tools", "build-pages.cjs")],
          { cwd: repoRoot, stdio: "pipe" });
      } catch (e) {
        falhou = true;
        expect(String(e.stderr || e.stdout)).toContain("no meio do bloco");
      }
      expect(falhou, "o build agrupou por cima de um script inline em vez de recusar").toBe(true);
    } finally {
      fs.writeFileSync(alvo, original, "utf8");
      execFileSync(process.execPath, [path.join(repoRoot, "tools", "build-pages.cjs")], { cwd: repoRoot });
    }
  });
});
