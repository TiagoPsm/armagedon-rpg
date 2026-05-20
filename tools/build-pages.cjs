const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "_site");
const files = [
  "index.html",
  "ficha.html",
  "mesa.html",
  "regras.html",
  "sugestoes.html",
  ".nojekyll",
  "logo-rpg-site.jpg",
  "logo-rpg-site.webp",
  "logo-rpg-armagedon.png",
  "logo-rpg-armagedon.webp",
  "Logo app.jpg",
  "Logo app.webp",
  "favicon.ico",
  "favicon.png",
  "favicon.webp",
  "apple-touch-icon.png",
  "apple-touch-icon.webp"
];
const dirs = ["css", "js", "data"];
const fichaCssBundle = "css/ficha-page.bundle.css";
const fichaJsBundle = "js/ficha-page.bundle.js";
const fichaCssFiles = [
  "css/design-tokens.css",
  "css/reset.css",
  "css/animations.css",
  "css/style.css",
  "css/ficha-base.css",
  "css/ficha-layout.css",
  "css/ficha-inventory-memory.css",
  "css/ficha-master.css",
  "css/ficha-dice-soul.css",
  "css/ficha-responsive.css",
  "css/ui.css",
  "css/ficha-refinements.css",
  "css/global-refinements.css"
];
const fichaJsFiles = [
  "js/ui.js",
  "js/runtime-config.js",
  "js/api.js",
  "js/auth.js",
  "js/soul-essence.js",
  "js/ficha-core.js",
  "js/ficha-master.js",
  "js/ficha-sheet.js",
  "js/ficha-inventory.js",
  "js/ficha-dice.js",
  "js/ficha-habs.js",
  "js/ficha-passives.js",
  "js/ficha-memories.js",
  "js/ficha-soul.js",
  "js/ficha-init.js"
];

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  const target = path.join(outDir, relativePath);
  copyDirRecursive(source, target);
}

function copyDirRecursive(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const sourceEntry = path.join(source, entry.name);
    const targetEntry = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourceEntry, targetEntry);
      return;
    }
    if (entry.isFile()) {
      fs.copyFileSync(sourceEntry, targetEntry);
    }
  });
}

function bundleFiles(relativeFiles, targetRelativePath, separator) {
  const target = path.join(outDir, targetRelativePath);
  const content = relativeFiles
    .map(relativeFile => {
      const source = path.join(repoRoot, relativeFile);
      return [
        `/* ${relativeFile} */`,
        fs.readFileSync(source, "utf8").trim()
      ].join("\n");
    })
    .join(separator);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content}\n`, "utf8");
}

function rewriteFichaHtmlForPublishedBundles() {
  const fichaPath = path.join(outDir, "ficha.html");
  let html = fs.readFileSync(fichaPath, "utf8");
  const cssSet = new Set(fichaCssFiles);
  const jsSet = new Set(fichaJsFiles);
  let cssInserted = false;
  let jsInserted = false;

  html = html.replace(/  <link rel="stylesheet" href="([^"]+)" \/>\r?\n/g, (match, href) => {
    const clean = href.split("?")[0];
    if (!cssSet.has(clean)) return match;
    if (cssInserted) return "";
    cssInserted = true;
    return `  <link rel="stylesheet" href="${fichaCssBundle}?v=2026-05-12-ficha-fast-1" />\n`;
  });

  html = html.replace(/  <script src="([^"]+)"><\/script>\r?\n/g, (match, src) => {
    const clean = src.split("?")[0];
    if (!jsSet.has(clean)) return match;
    if (jsInserted) return "";
    jsInserted = true;
    return `  <script src="${fichaJsBundle}?v=2026-05-12-ficha-fast-1"></script>\n`;
  });

  fs.writeFileSync(fichaPath, html, "utf8");
}

removeDir(outDir);
fs.mkdirSync(outDir, { recursive: true });
files.forEach(copyFile);
dirs.forEach(copyDir);
bundleFiles(fichaCssFiles, fichaCssBundle, "\n\n");
bundleFiles(fichaJsFiles, fichaJsBundle, "\n;\n");
rewriteFichaHtmlForPublishedBundles();

console.log(`GitHub Pages artifact ready: ${path.relative(repoRoot, outDir)}`);
