const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepare } = require('../tools/prepare-static-avatars.cjs');
test('catalogo preserva bytes, deduplica imagens e nao publica mapas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-test-'));
  const data = Buffer.from('RIFFxxxxWEBPtest-original'), hash = crypto.createHash('sha256').update(data).digest('hex');
  fs.writeFileSync(path.join(dir, 'original.webp'), data);
  const item = { file: 'original.webp', sha256: hash, size: data.length };
  const report = { completeListing: true, objects: [{ ...item, key: 'avatars/ana.webp' }, { ...item, key: 'avatars/echo-one.webp' }, { ...item, key: 'maps/master/one.webp' }], avatarReferences: [{ key: 'ana', avatar: 'https://api/api/avatars/ana' }] };
  const result = prepare(report, dir, path.join(dir, 'out'), true);
  assert.equal(result.files.length, 1); assert.equal(result.unresolved.length, 0);
  assert.equal(result.catalog.entries.ana.sha256, hash); assert.equal(result.catalog.mapHashes, undefined);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'out', hash + '.webp')), data);
  assert.throws(() => prepare({ ...report, avatarReferences: [{ key: 'missing', avatar: 'https://api/api/avatars/missing' }] }, dir, path.join(dir, 'out'), true), /Unresolved/);
  fs.writeFileSync(path.join(dir, 'original.webp'), Buffer.from('changed'));
  assert.throws(() => prepare(report, dir, path.join(dir, 'out')), /verification/);
});
test('leitura legada redireciona sem precisar de bucket e desconhecidos retornam 404', async () => {
  const { legacyStaticAvatarResponse } = await import('../cloudflare/src/static-avatars.js');
  const source = { enabled: true, origin: 'https://static.local', entries: { ana: { path: 'assets/avatars/' + 'a'.repeat(64) + '.webp' } } };
  const response = legacyStaticAvatarResponse('Ana', source);
  assert.equal(response.status, 302); assert.equal(response.headers.get('Location'), 'https://static.local/' + source.entries.ana.path);
  assert.equal(legacyStaticAvatarResponse('missing', source).status, 404);
  assert.equal(legacyStaticAvatarResponse('ana', { ...source, enabled: false }), null);
});
test('modo estatico aceita somente a referencia publicada ou o avatar ja salvo', async () => {
  const { allowsStaticAvatarEdit } = await import('../cloudflare/src/static-avatars.js');
  const file = 'assets/avatars/' + 'a'.repeat(64) + '.webp';
  const catalog = { enabled: true, origin: 'https://static.local', entries: { ana: { path: file } } };
  assert.equal(allowsStaticAvatarEdit('legacy', 'legacy', 'ana', catalog), true);
  assert.equal(allowsStaticAvatarEdit('legacy', 'https://static.local/' + file, 'ana', catalog), true);
  assert.equal(allowsStaticAvatarEdit('legacy', 'data:image/webp;base64,YWJj', 'ana', catalog), false);
  assert.equal(allowsStaticAvatarEdit('legacy', 'https://other/avatar.webp', 'ana', catalog), false);
});
