const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "_site");

/* A versao do bundle sai do CONTEUDO (hash), nunca mais de uma constante.
 *
 * O bug que isto conserta: as duas constantes de versao eram bumpadas na mao e
 * ficaram paradas em "2026-08-19-escala-1". Como navegador e CDN guardam por
 * URL, o site publicado seguiu servindo o bundle ANTIGO com o HTML NOVO. Foi
 * assim que o botao da camada apareceu com os DOIS rotulos ao mesmo tempo
 * ("TOKENS" e "MEU TOKEN"): o HTML ja trazia as duas variantes e o CSS que
 * esconde uma delas so existia no bundle novo, que ninguem baixou. A regra de
 * cache-busting do CLAUDE.md cobre o `?v=` das tags do repositorio — o do
 * bundle nao tinha dono, e falhou em silencio. Hash resolve por construcao:
 * mudou o conteudo, muda a URL. */
function bundleVersion(content) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
}

const files = [
  "index.html", "ficha.html", "mesa.html", "regras.html", "sugestoes.html",
  ".nojekyll", "logo-rpg-site.jpg", "logo-rpg-site.webp",
  "logo-rpg-armagedon.png", "logo-rpg-armagedon.webp",
  "Logo app.jpg", "Logo app.webp",
  "favicon.ico", "favicon.png", "favicon.webp",
  "apple-touch-icon.png", "apple-touch-icon.webp",
  "_headers"
];
const dirs = ["css", "js"];

const fichaCssBundle = "css/ficha-page.bundle.css";
const fichaJsBundle  = "js/ficha-page.bundle.js";
const mesaCssBundle  = "css/mesa-page.bundle.css";
const mesaJsBundle   = "js/mesa-page.bundle.js";

/* A LISTA de arquivos de cada bundle sai do proprio HTML, em ordem de
 * documento (Etapa 119). Antes eram dois arrays escritos a mao aqui, e eles
 * ja tinham divergido do HTML de duas maneiras:
 *
 *  - FALTAVAM arquivos. mesa-permissions.js, mesa-initiative.js e
 *    mesa-markers.js (e ficha-echos.js) ficavam de fora do bundle e sobravam
 *    como tags soltas DEPOIS dele. Funcionava por sorte: sao `defer`, entao a
 *    ordem de execucao segue a do documento — mas em producao esses arquivos
 *    rodavam depois de todo o resto, e no repositorio mesa-permissions.js
 *    roda ANTES de mesa-stage.js.
 *  - A ORDEM divergia. Em ficha.html o array comecava por ui.js e so depois
 *    runtime-config.js, invertendo o HTML: no site publicado a configuracao da
 *    API passava a ser definida DEPOIS de um modulo que ja tinha carregado.
 *
 * "A ordem dos scripts e um contrato" (CLAUDE.md). Um contrato copiado a mao
 * em dois lugares nao e contrato, e promessa. Agora o HTML e a unica fonte.
 */
const TAG_CSS = /<link\s+rel="stylesheet"\s+href="((?:css|js)\/[^"?]+)(?:\?[^"]*)?"[^>]*\/>/g;
const TAG_JS  = /<script\s+src="((?:css|js)\/[^"?]+)(?:\?[^"]*)?"(?:\s+defer)?\s*><\/script>/g;

function coletarDoHtml(html, regex, rotulo, htmlPath) {
  const achados = [];
  for (const m of html.matchAll(regex)) {
    achados.push({ file: m[1], inicio: m.index, fim: m.index + m[0].length });
  }
  if (achados.length === 0) return [];

  /* O bundle substitui a PRIMEIRA tag e apaga as demais. Isso so preserva a
   * ordem se as tags forem vizinhas: uma tag que nao entra no bundle (ou um
   * <script> inline) no meio do bloco seria empurrada para depois dele —
   * exatamente o defeito que esta etapa conserta. Entao o build RECUSA em vez
   * de publicar um artefato com ordem diferente da do repositorio. */
  const miolo = html.slice(achados[0].inicio, achados[achados.length - 1].fim);
  const marcador = rotulo === "js" ? "<script" : "<link";
  const total = (miolo.match(new RegExp(marcador, "g")) || []).length;
  if (total !== achados.length) {
    throw new Error(
      "[bundle] " + path.basename(htmlPath) + ": ha um " + marcador +
      " no meio do bloco de " + rotulo + " que nao entra no bundle. " +
      "Agrupar mudaria a ordem de execucao — mova-o para fora do bloco."
    );
  }
  return achados.map(a => a.file);
}

function listasDoHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  return {
    cssFiles: coletarDoHtml(html, TAG_CSS, "css", htmlPath),
    jsFiles:  coletarDoHtml(html, TAG_JS,  "js",  htmlPath)
  };
}

function removeDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDir(relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) return;
  copyDirRecursive(source, path.join(outDir, relativePath));
}

function copyDirRecursive(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const s = path.join(source, entry.name);
    const t = path.join(target, entry.name);
    if (entry.isDirectory()) { copyDirRecursive(s, t); return; }
    if (entry.isFile()) fs.copyFileSync(s, t);
  });
}

function bundleFiles(relativeFiles, targetRelativePath, separator) {
  const target = path.join(outDir, targetRelativePath);
  const content = relativeFiles.map(f => {
    const source = path.join(repoRoot, f);
    if (!fs.existsSync(source)) { console.warn("  [bundle] nao encontrado:", f); return "/* NOT FOUND */"; }
    return "/* " + f + " */\n" + fs.readFileSync(source, "utf8").trim();
  }).join(separator);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content + "\n", "utf8");
  return bundleVersion(content);
}

// Substitui tags CSS/JS individuais pelo bundle — suporta defer e ?v= cache-busting
function rewriteHtmlBundles(htmlPath, opts) {
  let html = fs.readFileSync(htmlPath, "utf8");
  const cssSet = new Set(opts.cssFiles);
  const jsSet  = new Set(opts.jsFiles);
  let cssInserted = false;
  let jsInserted  = false;

  // <link rel="stylesheet" href="css/foo.css" /> (com ou sem ?v=)
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"?]+)(?:\?[^"]*)?"[^>]*\/>/g, (m, href) => {
    if (!cssSet.has(href)) return m;
    if (cssInserted) return "";
    cssInserted = true;
    return '<link rel="stylesheet" href="' + opts.cssBundle + "?v=" + opts.cssVersion + '" />';
  });

  // <script src="js/foo.js" defer></script>  ou  <script src="js/foo.js"></script>
  html = html.replace(/<script\s+src="([^"?]+)(?:\?[^"]*)?"(?:\s+defer)?\s*><\/script>/g, (m, src) => {
    if (!jsSet.has(src)) return m;
    if (jsInserted) return "";
    jsInserted = true;
    return '<script src="' + opts.jsBundle + "?v=" + opts.jsVersion + '" defer></script>';
  });

  fs.writeFileSync(htmlPath, html, "utf8");
  if (!cssInserted) console.warn("  [bundle] CSS nao substituido em", path.basename(htmlPath));
  if (!jsInserted)  console.warn("  [bundle]  JS nao substituido em", path.basename(htmlPath));
}

// Build
removeDir(outDir);
fs.mkdirSync(outDir, { recursive: true });
files.forEach(copyFile);
dirs.forEach(copyDir);

const ficha = listasDoHtml(path.join(repoRoot, "ficha.html"));
const mesa  = listasDoHtml(path.join(repoRoot, "mesa.html"));

console.log("Bundling ficha...");
const fichaCssVersion = bundleFiles(ficha.cssFiles, fichaCssBundle, "\n\n");
const fichaJsVersion  = bundleFiles(ficha.jsFiles,  fichaJsBundle,  "\n;\n");
rewriteHtmlBundles(path.join(outDir, "ficha.html"), {
  cssFiles: ficha.cssFiles, cssBundle: fichaCssBundle, cssVersion: fichaCssVersion,
  jsFiles:  ficha.jsFiles,  jsBundle:  fichaJsBundle,  jsVersion:  fichaJsVersion,
});
console.log("  css v=" + fichaCssVersion + " (" + ficha.cssFiles.length + " arquivos)" +
            "  js v=" + fichaJsVersion + " (" + ficha.jsFiles.length + " arquivos)");

console.log("Bundling mesa...");
const mesaCssVersion = bundleFiles(mesa.cssFiles, mesaCssBundle, "\n\n");
const mesaJsVersion  = bundleFiles(mesa.jsFiles,  mesaJsBundle,  "\n;\n");
rewriteHtmlBundles(path.join(outDir, "mesa.html"), {
  cssFiles: mesa.cssFiles, cssBundle: mesaCssBundle, cssVersion: mesaCssVersion,
  jsFiles:  mesa.jsFiles,  jsBundle:  mesaJsBundle,  jsVersion:  mesaJsVersion,
});
console.log("  css v=" + mesaCssVersion + " (" + mesa.cssFiles.length + " arquivos)" +
            "  js v=" + mesaJsVersion + " (" + mesa.jsFiles.length + " arquivos)");

console.log("\nArtifact ready:", path.relative(repoRoot, outDir));