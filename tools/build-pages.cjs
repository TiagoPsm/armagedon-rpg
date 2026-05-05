const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "_site");
const files = [
  "index.html",
  "ficha.html",
  "mesa.html",
  "regras.html",
  ".nojekyll",
  "logo-rpg-site.jpg",
  "logo-rpg-armagedon.png",
  "Logo app.jpg",
  "favicon.ico",
  "favicon.png",
  "apple-touch-icon.png"
];
const dirs = ["css", "js", "data"];

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

removeDir(outDir);
fs.mkdirSync(outDir, { recursive: true });
files.forEach(copyFile);
dirs.forEach(copyDir);

console.log(`GitHub Pages artifact ready: ${path.relative(repoRoot, outDir)}`);
