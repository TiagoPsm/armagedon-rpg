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
const fichaCssFiles  = ["css/tokens.css","css/reset.css","css/components.css","css/ficha.css"];
const fichaJsFiles   = [
  "js/ui.js","js/runtime-config.js","js/api.js","js/auth.js","js/soul-essence.js",
  "js/ficha-core.js","js/ficha-master.js","js/ficha-sheet.js","js/ficha-inventory.js",
  "js/ficha-dice.js","js/ficha-habs.js","js/ficha-passives.js",
  "js/ficha-memories.js","js/ficha-soul.js","js/ficha-init.js"
];

const mesaCssBundle = "css/mesa-page.bundle.css";
const mesaJsBundle  = "js/mesa-page.bundle.js";
const mesaCssFiles  = [
  "css/tokens.css","css/reset.css","css/components.css","css/mesa.css",
  "css/mesa-stage.css","css/mesa-roster.css","css/mesa-inspector.css","css/mesa-map.css",
  "css/mesa-drawing.css","css/mesa-scenes.css"
];
// O Canvas renderer (mesa-renderer-v2.js + mesa-renderer-worker.js) foi removido
// em 2026-06-30: o token da Mesa e sempre o estilo redondo (DOM), sem Canvas.
const mesaJsFiles = [
  "js/runtime-config.js","js/api.js","js/ui.js","js/auth.js",
  "js/mesa-stage.js","js/mesa-roster.js","js/mesa-inspector.js",
  "js/mesa-storage.js","js/mesa-core.js","js/mesa-map.js",
  "js/mesa-grid.js","js/mesa-fog.js","js/mesa-scenes.js","js/mesa-ping.js","js/mesa-ruler.js","js/mesa-dice.js","js/mesa-drawing.js","js/mesa-select.js"
];

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

console.log("Bundling ficha...");
const fichaCssVersion = bundleFiles(fichaCssFiles, fichaCssBundle, "\n\n");
const fichaJsVersion  = bundleFiles(fichaJsFiles,  fichaJsBundle,  "\n;\n");
rewriteHtmlBundles(path.join(outDir, "ficha.html"), {
  cssFiles: fichaCssFiles, cssBundle: fichaCssBundle, cssVersion: fichaCssVersion,
  jsFiles:  fichaJsFiles,  jsBundle:  fichaJsBundle,  jsVersion:  fichaJsVersion,
});

console.log("  css v=" + fichaCssVersion + "  js v=" + fichaJsVersion);

console.log("Bundling mesa...");
const mesaCssVersion = bundleFiles(mesaCssFiles, mesaCssBundle, "\n\n");
const mesaJsVersion  = bundleFiles(mesaJsFiles,  mesaJsBundle,  "\n;\n");
rewriteHtmlBundles(path.join(outDir, "mesa.html"), {
  cssFiles: mesaCssFiles, cssBundle: mesaCssBundle, cssVersion: mesaCssVersion,
  jsFiles:  mesaJsFiles,  jsBundle:  mesaJsBundle,  jsVersion:  mesaJsVersion,
});

console.log("  css v=" + mesaCssVersion + "  js v=" + mesaJsVersion);

console.log("\nArtifact ready:", path.relative(repoRoot, outDir));