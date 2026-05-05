const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const htmlFiles = ["index.html", "ficha.html", "mesa.html", "regras.html"];
const publishedRoots = new Set(["css", "data", "js"]);
const localRefPattern = /\b(?:src|href)=["']([^"']+)["']/g;
const cssUrlPattern = /url\((?!['"]?(?:data:|https?:|#))['"]?([^'")]+)['"]?\)/g;
let failed = false;

function fail(message) {
  failed = true;
  console.error(message);
}

function stripQuery(ref) {
  return String(ref || "").split("#")[0].split("?")[0];
}

function isLocalRef(ref) {
  const clean = stripQuery(ref);
  return Boolean(
    clean
    && !clean.startsWith("http:")
    && !clean.startsWith("https:")
    && !clean.startsWith("mailto:")
    && !clean.startsWith("tel:")
    && !clean.startsWith("#")
    && !clean.startsWith("%23")
    && !clean.startsWith("//")
  );
}

function resolveRef(fromFile, ref) {
  const clean = decodeURIComponent(stripQuery(ref));
  return path.resolve(path.dirname(fromFile), clean);
}

function assertLocalRef(fromFile, ref) {
  if (!isLocalRef(ref)) return;
  const clean = stripQuery(ref);
  if (clean.endsWith(".html") && !htmlFiles.includes(path.basename(clean))) return;
  const target = resolveRef(fromFile, ref);
  if (!target.startsWith(repoRoot) || !fs.existsSync(target)) {
    fail(`Referencia local quebrada em ${path.relative(repoRoot, fromFile)}: ${ref}`);
  }
}

htmlFiles.forEach(fileName => {
  const filePath = path.join(repoRoot, fileName);
  const html = fs.readFileSync(filePath, "utf8");
  const ids = new Map();
  let match;

  while ((match = localRefPattern.exec(html))) {
    assertLocalRef(filePath, match[1]);
  }

  const idPattern = /\bid=["']([^"']+)["']/g;
  while ((match = idPattern.exec(html))) {
    const id = match[1];
    ids.set(id, (ids.get(id) || 0) + 1);
  }

  [...ids.entries()].forEach(([id, count]) => {
    if (count > 1) fail(`ID duplicado em ${fileName}: ${id}`);
  });

  if (/assets\/logo-rpg-armagedon\.png/.test(html)) {
    fail(`Fallback de logo aponta para assets/ em ${fileName}`);
  }
});

publishedRoots.forEach(root => {
  const dir = path.join(repoRoot, root);
  if (!fs.existsSync(dir)) return;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    fs.readdirSync(current, { withFileTypes: true }).forEach(entry => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith(".css")) return;
      const css = fs.readFileSync(fullPath, "utf8");
      let match;
      while ((match = cssUrlPattern.exec(css))) {
        assertLocalRef(fullPath, match[1]);
      }
    });
  }
});

const authSource = fs.readFileSync(path.join(repoRoot, "js", "auth.js"), "utf8");
if (!/window\.AUTH\s*=/.test(authSource)) {
  fail("window.AUTH nao foi encontrado em js/auth.js");
}

if (failed) {
  process.exit(1);
}

console.log("Static audit OK.");
