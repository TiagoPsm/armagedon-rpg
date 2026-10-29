const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '_site');
const files = ['js/mesa-page.bundle.js', 'css/mesa-page.bundle.css', 'js/ficha-page.bundle.js', 'css/ficha-page.bundle.css', 'js/api.js', 'js/runtime-config.js'];
function walk(dir) { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else files.push(path.relative(root, file).split(path.sep).join('/')); } }
walk(path.join(root, 'assets', 'avatars'));
const manifest = { version: 1, files: files.map(file => { const data = fs.readFileSync(path.join(root, file)); return { path: file, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') }; }) };
fs.writeFileSync(path.join(root, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Release manifest: ' + manifest.files.length + ' files.');
