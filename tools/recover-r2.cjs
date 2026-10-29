// Read-only remote recovery. Never deletes objects or executes SQL writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'local-backups', 'r2-recovery');
const account = process.env.CLOUDFLARE_ACCOUNT_ID || 'f3ff1808454841dbff650286534b78e4';
const api = 'https://api.cloudflare.com/client/v4/accounts/' + account;
const bucket = 'armagedom-maps';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
async function main() {
  if (!process.argv.includes('--recover')) throw Error('Use --recover to read and preserve remote originals locally. No deletion is available.');
  const cfg = fs.readFileSync(path.join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml'), 'utf8');
  const token = process.env.CLOUDFLARE_API_TOKEN || cfg.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
  if (!token) throw Error('Cloudflare credentials unavailable; run wrangler whoami/login.');
  const headers = { Authorization: 'Bearer ' + token };
  async function json(url, options = {}) {
    const r = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw Error('Read failed: HTTP ' + r.status);
    const value = await r.json(); if (!value.success) throw Error('Cloudflare read failed'); return value;
  }
  fs.mkdirSync(dir, { recursive: true });
  const objects = []; let cursor = '', pages = 0;
  do {
    if (++pages > 10000) throw Error('Unexpected pagination');
    const result = await json(api + '/r2/buckets/' + bucket + '/objects' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
    objects.push(...result.result); cursor = result.result_info?.cursor || result.cursor || '';
    if (result.result_info?.is_truncated && !cursor) throw Error('Incomplete listing; cannot certify recovery');
  } while (cursor);
  const recovered = [];
  for (const object of objects) {
    const r = await fetch(api + '/r2/buckets/' + bucket + '/objects/' + encodeURIComponent(object.key), { headers, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw Error('Object read failed: HTTP ' + r.status);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length !== object.size) throw Error('Size mismatch; original preserved remotely');
    const etag = String(object.etag || '').replaceAll('"', '');
    if (/^[a-f0-9]{32}$/i.test(etag) && crypto.createHash('md5').update(bytes).digest('hex') !== etag.toLowerCase()) throw Error('Remote checksum mismatch');
    const info = await sharp(bytes).metadata();
    const ext = ({ jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif' })[info.format];
    if (!ext) throw Error('Unsupported original image format');
    const digest = sha(bytes), relative = 'objects/' + (object.key.startsWith('maps/') ? 'maps/' : 'avatars/') + digest + '.' + ext;
    const file = path.join(dir, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) { if (sha(fs.readFileSync(file)) !== digest) throw Error('Existing local recovery differs'); }
    else fs.writeFileSync(file, bytes, { flag: 'wx' });
    recovered.push({ key: object.key, etag, size: bytes.length, sha256: digest, file: relative, width: info.width, height: info.height, contentType: 'image/' + info.format });
  }
  // Export only avatar fields, not sheets or passwords. Needed for reference audit.
  const sql = "SELECT 'character' AS kind,id,sheet_key AS key,json_extract(data_json,'$.avatar') AS avatar FROM characters WHERE json_extract(data_json,'$.avatar') IS NOT NULL UNION ALL SELECT 'echo' AS kind,id,'echo-'||id AS key,json_extract(data_json,'$.avatar') AS avatar FROM echos WHERE json_extract(data_json,'$.avatar') IS NOT NULL";
  const rows = await json(api + '/d1/database/78995a50-1521-453e-b0c1-2b1b8b19f260/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }) });
  const references = rows.result.flatMap(r => r.results || []);
  const report = { version: 1, recoveredAt: new Date().toISOString(), bucket, completeListing: true, objects: recovered, avatarReferences: references, remoteWrites: 0, remoteDeletes: 0 };
  fs.writeFileSync(path.join(dir, 'recovery.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ recovered: recovered.length, bytes: recovered.reduce((n, r) => n + r.size, 0), avatarReferences: references.length, report: 'local-backups/r2-recovery/recovery.json', remoteWrites: 0 }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
