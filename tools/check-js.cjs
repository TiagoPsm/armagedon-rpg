const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const roots = ["js", path.join("cloudflare", "src")];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

const files = roots.flatMap(root => walk(path.join(repoRoot, root)));
let failed = false;

function normalizeModuleSource(source) {
  return source
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+\{[^}]+\};?\s*$/gm, "")
    .replace(/\bexport\s+default\s+\{/g, "const __default__ = {")
    .replace(/\bexport\s+(async\s+function|function|class|const|let|var)\s+/g, "$1 ");
}

files.forEach(file => {
  const relativeFile = path.relative(repoRoot, file);
  const source = fs.readFileSync(file, "utf8");
  const checkSource = relativeFile.startsWith(`cloudflare${path.sep}src${path.sep}`)
    ? normalizeModuleSource(source)
    : source;

  try {
    new Function(checkSource);
  } catch (error) {
    failed = true;
    process.stderr.write(`${relativeFile}: ${error.message}\n`);
  }
});

if (failed) {
  process.exit(1);
}

console.log(`JS syntax OK (${files.length} files).`);
