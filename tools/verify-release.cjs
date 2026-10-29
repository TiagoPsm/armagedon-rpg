const fs = require('node:fs');
const crypto = require('node:crypto');
const base = process.argv[2];
if (!base || !/^https:\/\//.test(base)) throw Error('Usage: node tools/verify-release.cjs https://site');
const manifest = JSON.parse(fs.readFileSync('_site/release-manifest.json', 'utf8'));
(async () => {
  for (const page of ['index', 'ficha', 'mesa', 'echos', 'regras', 'sugestoes']) {
    const r = await fetch(base.replace(/\/$/, '') + '/' + page + '.html', { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw Error(page + ': HTTP ' + r.status);
  }
  for (const file of manifest.files) {
    let valid = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const r = await fetch(base.replace(/\/$/, '') + '/' + file.path + '?verify=' + file.sha256, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (r.ok && crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex') === file.sha256) { valid = true; break; }
      } catch { /* retry only this idempotent public GET */ }
      if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (!valid) throw Error('Published file differs: ' + file.path);
  }
  console.log('Verified six pages and ' + manifest.files.length + ' files at ' + base);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
