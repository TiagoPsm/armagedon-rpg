const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const dir = path.resolve(__dirname, '..', 'local-backups', 'r2-recovery');
(async () => {
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'recovery.json'), 'utf8'));
  if (!report.completeListing) throw Error('Inventory incomplete');
  for (const item of report.objects) {
    const file = path.resolve(dir, item.file); if (!file.startsWith(dir + path.sep)) throw Error('Invalid recovery path');
    const bytes = fs.readFileSync(file);
    if (bytes.length !== item.size || crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('Recovery checksum mismatch');
    await sharp(bytes).resize(1, 1).png().toBuffer();
  }
  const result = { verifiedAt: new Date().toISOString(), files: report.objects.length, maps: report.objects.filter(o => o.key.startsWith('maps/')).length, avatars: report.objects.filter(o => o.key.startsWith('avatars/')).length, bytes: report.objects.reduce((n, o) => n + o.size, 0), remoteWrites: 0, remoteDeletes: 0 };
  fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
