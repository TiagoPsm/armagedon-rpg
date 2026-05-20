#!/usr/bin/env node
/**
 * minify.cjs
 *
 * Minifica CSS e JS dentro do _site/ (artefato gerado por build-pages.cjs).
 *
 * Uso:
 *   node tools/minify.cjs            # CSS + JS
 *   node tools/minify.cjs --css      # apenas CSS
 *   node tools/minify.cjs --js       # apenas JS
 *
 * Importante:
 *   - Roda em cima do _site/, mantendo a origem intocada.
 *   - Substitui arquivos no _site/ pelo seu equivalente minificado.
 *   - Mantém sourceMap=false para evitar adicionar peso.
 */

const fs = require("node:fs");
const path = require("node:path");
const CleanCSS = require("clean-css");
const { minify: terserMinify } = require("terser");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(PROJECT_ROOT, "_site");

const args = process.argv.slice(2);
const doCSS = args.length === 0 || args.includes("--css");
const doJS = args.length === 0 || args.includes("--js");

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

function listFilesRecursive(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, ext));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

function minifyCss() {
  console.log("\n🎨 Minificando CSS...");
  const cleanCSS = new CleanCSS({
    level: {
      1: {
        all: true,
        normalizeUrls: false
      },
      2: {
        restructureRules: true,
        removeDuplicateRules: true,
        mergeAdjacentRules: true,
        mergeIntoShorthands: true,
        mergeMedia: true,
        removeEmpty: true
      }
    },
    returnPromise: false
  });

  const files = listFilesRecursive(path.join(SITE_DIR, "css"), ".css");
  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const result = cleanCSS.minify(source);

    if (result.errors.length) {
      console.log(`  ⚠ Erro em ${path.relative(SITE_DIR, file)}: ${result.errors.join("; ")}`);
      continue;
    }

    const before = Buffer.byteLength(source, "utf8");
    const after = Buffer.byteLength(result.styles, "utf8");
    fs.writeFileSync(file, result.styles, "utf8");

    totalBefore += before;
    totalAfter += after;

    const pct = ((1 - after / before) * 100).toFixed(1);
    console.log(`  ✓ ${path.relative(SITE_DIR, file)}: ${fmtKB(before)} → ${fmtKB(after)} (-${pct}%)`);
  }

  const pct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : "0.0";
  console.log(`\n  📊 CSS total: ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)} (-${pct}%)`);
  return { before: totalBefore, after: totalAfter };
}

async function minifyJs() {
  console.log("\n📜 Minificando JS...");

  const files = listFilesRecursive(path.join(SITE_DIR, "js"), ".js");
  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");

    try {
      // Preservar runtime-config.js sem mangle agressivo (define globals)
      const isRuntimeConfig = file.endsWith("runtime-config.js");

      const result = await terserMinify(source, {
        compress: {
          drop_console: false,    // mantém console.log existentes
          drop_debugger: true,
          passes: 2
        },
        mangle: !isRuntimeConfig,
        format: {
          comments: false,
          ascii_only: false
        },
        sourceMap: false
      });

      if (!result.code) {
        console.log(`  ⚠ Sem output: ${path.relative(SITE_DIR, file)}`);
        continue;
      }

      const before = Buffer.byteLength(source, "utf8");
      const after = Buffer.byteLength(result.code, "utf8");
      fs.writeFileSync(file, result.code, "utf8");

      totalBefore += before;
      totalAfter += after;

      const pct = ((1 - after / before) * 100).toFixed(1);
      console.log(`  ✓ ${path.relative(SITE_DIR, file)}: ${fmtKB(before)} → ${fmtKB(after)} (-${pct}%)`);
    } catch (err) {
      console.log(`  ⚠ Erro em ${path.relative(SITE_DIR, file)}: ${err.message}`);
    }
  }

  const pct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : "0.0";
  console.log(`\n  📊 JS total: ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)} (-${pct}%)`);
  return { before: totalBefore, after: totalAfter };
}

async function main() {
  console.log("\n🔨 Minificação — Armagedon RPG");
  console.log("=".repeat(60));

  if (!fs.existsSync(SITE_DIR)) {
    console.error(`\n❌ _site/ não existe. Rode "npm run build:pages" primeiro.\n`);
    process.exit(1);
  }

  let cssResult = { before: 0, after: 0 };
  let jsResult = { before: 0, after: 0 };

  if (doCSS) cssResult = minifyCss();
  if (doJS) jsResult = await minifyJs();

  const totalBefore = cssResult.before + jsResult.before;
  const totalAfter = cssResult.after + jsResult.after;
  const pct = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : "0.0";

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Total: ${fmtKB(totalBefore)} → ${fmtKB(totalAfter)} (-${pct}%)\n`);
}

main().catch((err) => {
  console.error("\n❌ Erro fatal:", err);
  process.exit(1);
});
