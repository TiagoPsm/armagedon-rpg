#!/usr/bin/env node
/**
 * optimize-images.cjs
 *
 * Otimiza imagens PNG/JPG do projeto:
 * - Comprime PNG mantendo qualidade visual
 * - Gera versão WebP correspondente (muito menor)
 *
 * Uso:
 *   node tools/optimize-images.cjs
 *
 * Saída:
 *   - <nome>.png  → recomprimida (sem perda visual)
 *   - <nome>.webp → versão WebP (~85% menor que PNG)
 */

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const PROJECT_ROOT = path.resolve(__dirname, "..");

// Imagens a otimizar (do mais pesado para o mais leve)
const TARGETS = [
  { file: "logo-rpg-armagedon.png", quality: 85, maxWidth: 1024 },
  { file: "Logo app.jpg",           quality: 85, maxWidth: 1024 },
  { file: "logo-rpg-site.jpg",      quality: 88, maxWidth: 512  },
  { file: "apple-touch-icon.png",   quality: 90, maxWidth: 512  },
  { file: "favicon.png",            quality: 92, maxWidth: 256  }
];

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

async function optimize(target) {
  const srcPath = path.join(PROJECT_ROOT, target.file);
  if (!fs.existsSync(srcPath)) {
    console.log(`  ⚠ Skip (não encontrado): ${target.file}`);
    return null;
  }

  const ext = path.extname(target.file).toLowerCase();
  const base = target.file.slice(0, -ext.length);
  const webpPath = path.join(PROJECT_ROOT, `${base}.webp`);

  const before = fs.statSync(srcPath).size;

  // Lê via fs primeiro para contornar problemas do OneDrive/Windows
  const srcBuffer = fs.readFileSync(srcPath);

  // 1) Reescreve PNG/JPG otimizado (mesmo formato, melhor compressão)
  const buffer = await sharp(srcBuffer)
    .resize({
      width: target.maxWidth,
      withoutEnlargement: true,
      fit: "inside"
    })
    .toBuffer();

  let optimizedBuffer;
  if (ext === ".png") {
    optimizedBuffer = await sharp(buffer)
      .png({ compressionLevel: 9, palette: true, quality: target.quality })
      .toBuffer();
  } else {
    optimizedBuffer = await sharp(buffer)
      .jpeg({ quality: target.quality, mozjpeg: true })
      .toBuffer();
  }

  // Só sobrescreve se reduziu
  if (optimizedBuffer.length < before) {
    fs.writeFileSync(srcPath, optimizedBuffer);
  }

  // 2) Gera WebP
  await sharp(buffer)
    .webp({ quality: target.quality, effort: 6 })
    .toFile(webpPath);

  const afterOriginal = fs.statSync(srcPath).size;
  const afterWebp = fs.statSync(webpPath).size;
  const totalSavings = before - Math.min(afterOriginal, afterWebp);
  const pct = ((totalSavings / before) * 100).toFixed(1);

  console.log(`  ✓ ${target.file}`);
  console.log(`      Antes:    ${fmtKB(before)}`);
  console.log(`      Original: ${fmtKB(afterOriginal)}  (mesmo formato, recompressed)`);
  console.log(`      WebP:     ${fmtKB(afterWebp)}  (-${pct}%)`);

  return {
    file: target.file,
    before,
    afterOriginal,
    afterWebp,
    savings: totalSavings
  };
}

async function main() {
  console.log("\n🖼️  Otimização de imagens — Armagedon RPG\n");
  console.log("=".repeat(60));

  let totalBefore = 0;
  let totalAfterBest = 0;

  for (const target of TARGETS) {
    try {
      const result = await optimize(target);
      if (result) {
        totalBefore += result.before;
        totalAfterBest += Math.min(result.afterOriginal, result.afterWebp);
      }
    } catch (err) {
      console.log(`  ⚠ Erro processando ${target.file}: ${err.message}`);
    }
  }

  console.log("=".repeat(60));
  console.log(`\n📊 Total:`);
  console.log(`   Antes:        ${fmtKB(totalBefore)}`);
  console.log(`   Depois (melhor): ${fmtKB(totalAfterBest)}`);
  console.log(`   Economia:     ${fmtKB(totalBefore - totalAfterBest)} (${(((totalBefore - totalAfterBest) / totalBefore) * 100).toFixed(1)}%)\n`);
}

main().catch((err) => {
  console.error("\n❌ Erro:", err.message);
  process.exit(1);
});
