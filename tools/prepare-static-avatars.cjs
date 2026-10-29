const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const keyOf = key => String(key).replace(/[^a-z0-9_-]/gi, '_').toLowerCase().slice(0, 64);
function prepare(report, recoveryDir, destination, enabled = false) {
  if (!report.completeListing || !Array.isArray(report.objects)) throw Error('Complete verified inventory required');
  const entries = {}, files = [];
  fs.mkdirSync(destination, { recursive: true });
  function copy(key, bytes, ext) {
    if (!['jpg', 'webp', 'png', 'gif', 'avif'].includes(ext)) throw Error('Unsupported avatar format');
    const digest = sha(bytes), relative = 'assets/avatars/' + digest + '.' + ext;
    const file = path.join(destination, digest + '.' + ext);
    if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { flag: 'wx' });
    else if (sha(fs.readFileSync(file)) !== digest) throw Error('Destination checksum differs');
    entries[keyOf(key)] = { path: relative, sha256: digest, bytes: bytes.length };
    files.push(relative);
  }
  // Match legacy GET preference: webp wins over jpg for the same identifier.
  for (const object of [...report.objects].sort((a, b) => Number(a.key.endsWith('.webp')) - Number(b.key.endsWith('.webp')))) {
    const absolute = path.resolve(recoveryDir, object.file);
    if (!absolute.startsWith(path.resolve(recoveryDir) + path.sep)) throw Error('Invalid recovery path');
    const bytes = fs.readFileSync(absolute); if (sha(bytes) !== object.sha256 || bytes.length !== object.size) throw Error('Recovery verification failed');
    if (object.key.startsWith('avatars/')) copy(object.key.slice(8).replace(/\.[^.]+$/, ''), bytes, path.extname(object.file).slice(1));
  }
  const unresolved = [];
  for (const ref of report.avatarReferences || []) {
    if (!ref.avatar) continue;
    const inline = ref.avatar.match(/^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
    if (inline) { copy(ref.key, Buffer.from(inline[2], 'base64'), inline[1] === 'jpeg' ? 'jpg' : inline[1]); continue; }
    let key;
    try { key = decodeURIComponent(new URL(ref.avatar).pathname.match(/\/api\/avatars\/([^/]+)$/)?.[1] || ''); } catch {}
    if (!key || !entries[keyOf(key)]) unresolved.push({ kind: ref.kind, key: ref.key, reason: 'Avatar reference not recovered' });
    else entries[keyOf(ref.key)] = { ...entries[keyOf(key)] };
  }
  if (enabled && unresolved.length) throw Error('Unresolved avatar references; activation refused');
  const catalog = { version: 1, enabled, origin: 'https://armagedon-rpg.pages.dev', entries };
  return { catalog, unresolved, files: [...new Set(files)] };
}
if (require.main === module) {
  (async () => {
    const dir = path.join(root, 'local-backups', 'r2-recovery');
    const report = JSON.parse(fs.readFileSync(path.join(dir, 'recovery.json'), 'utf8'));
    const manifestPath = path.join(root, 'assets', 'avatars', 'manifest.json');
    const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const candidatePath = path.join(dir, 'static-avatar-plan.json');
    let result = prepare(report, dir, path.join(root, 'assets', 'avatars'));
    const add = process.argv.indexOf('--add'), key = process.argv.find(a => a.startsWith('--key='))?.slice(6);
    if (add >= 0) {
      if (!key || !/^[a-z0-9_:-]{1,96}$/i.test(key) || !process.argv[add + 1]) throw Error('Use --add image-file --key=character-key (or echo-ID)');
      const bytes = fs.readFileSync(path.resolve(process.argv[add + 1]));
      if (bytes.length > 10 * 1024 * 1024) throw Error('Avatar exceeds 10 MB');
      const info = await require('sharp')(bytes).metadata(), ext = ({ webp: 'webp', jpeg: 'jpg', png: 'png' })[info.format];
      if (!ext) throw Error('Use WebP, JPEG or PNG');
      await require('sharp')(bytes).resize(1, 1).png().toBuffer();
      const hash = sha(bytes), file = hash + '.' + ext;
      const originals = path.join(root, 'local-backups', 'avatar-originals'); fs.mkdirSync(originals, { recursive: true });
      for (const target of [path.join(originals, file), path.join(root, 'assets', 'avatars', file)]) {
        if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: 'wx' });
        else if (sha(fs.readFileSync(target)) !== hash) throw Error('Existing image differs');
      }
      const pending = fs.existsSync(candidatePath) ? JSON.parse(fs.readFileSync(candidatePath, 'utf8')).catalog.entries : {};
      result.catalog.entries = { ...result.catalog.entries, ...current.entries, ...pending, [keyOf(key)]: { path: 'assets/avatars/' + file, sha256: hash, bytes: bytes.length } };
    }
    if (process.argv.includes('--activate')) {
      if (!fs.existsSync(candidatePath)) throw Error('Prepare assets first');
      result = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
      if (result.unresolved.length) throw Error('Unresolved avatar references');
      for (const base of ['https://armagedon-rpg.pages.dev', 'https://tiagopsm.github.io/armagedon-rpg']) {
        for (const item of Object.values(result.catalog.entries)) {
          const r = await fetch(base + '/' + item.path, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
          if (!r.ok || sha(Buffer.from(await r.arrayBuffer())) !== item.sha256) throw Error('Publish and verify assets on both sites before activation');
        }
      }
      result.catalog.enabled = true;
      fs.writeFileSync(path.join(dir, 'activation-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), entries: Object.keys(result.catalog.entries).length }, null, 2));
    }
    // A first staging release must retain an already-active catalog. New entries
    // are activated only after the original bytes are reachable on both sites.
    const catalog = current.enabled && !process.argv.includes('--activate') ? current : result.catalog;
    fs.writeFileSync(manifestPath, JSON.stringify(catalog, null, 2));
    fs.writeFileSync(path.join(root, 'js', 'avatar-catalog.js'), '// Generated; no credentials.\nwindow.ARMAGEDON_AVATAR_CATALOG = ' + JSON.stringify(catalog) + ';\n');
    fs.writeFileSync(path.join(dir, 'static-avatar-plan.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ files: result.files.length, unresolved: result.unresolved.length, enabled: catalog.enabled, remoteWrites: 0 }));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { prepare, keyOf };
