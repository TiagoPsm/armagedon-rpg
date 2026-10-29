const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const files = ['cloudflare/wrangler.toml', 'js/mesa-movement-rules.js', 'js/mesa-template-rules.js', 'js/mesa-grid-rules.js', 'assets/avatars/manifest.json'];
function walk(dir) { for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const name = dir + '/' + item.name; if (item.isDirectory()) walk(name); else files.push(name); } }
walk('cloudflare/src');
const hash = crypto.createHash('sha256');
for (const file of files.sort()) if (fs.existsSync(path.join(root, file))) hash.update(file + '\0' + fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n') + '\0');
const fingerprint = hash.digest('hex');
if (process.argv.includes('--check-live')) {
  (async () => {
    const r = await fetch('https://armagedon-api.tiagopsm2008.workers.dev/api/health', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error('Cannot verify live Worker: HTTP ' + r.status);
    const live = await r.json();
    if (!process.env.GITHUB_OUTPUT) throw Error('GITHUB_OUTPUT missing');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `hash=${fingerprint}\nchanged=${live.buildHash !== fingerprint}\n`);
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
} else console.log(fingerprint);
