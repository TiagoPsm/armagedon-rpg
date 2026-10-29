const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
test('busca real por chave ignora caixa e passa de SCAN para SEARCH com migracao aditiva', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync('cloudflare/d1/schema.sql', 'utf8'));
  db.exec('DROP INDEX IF EXISTS characters_sheet_key_lower_idx');
  const insert = db.prepare("INSERT INTO characters(id,sheet_key,kind,name) VALUES(?,?,'npc',?)");
  db.exec('BEGIN'); for (let i = 0; i < 10000; i++) insert.run('id-' + i, 'npc:Name-' + i, 'NPC ' + i); db.exec('COMMIT');
  const sql = 'SELECT c.id,c.data_json,u.username FROM characters c LEFT JOIN users u ON u.id=c.owner_user_id WHERE lower(c.sheet_key)=lower(?) LIMIT 1';
  const before = db.prepare('EXPLAIN QUERY PLAN ' + sql).all('NPC:NAME-9999').map(r => r.detail).join(';');
  const migration = fs.readFileSync('cloudflare/d1/migrations/20261029_character_lookup.sql', 'utf8'); db.exec(migration); db.exec(migration);
  const after = db.prepare('EXPLAIN QUERY PLAN ' + sql).all('NPC:NAME-9999').map(r => r.detail).join(';');
  assert.match(before, /SCAN c/); assert.match(after, /SEARCH c USING INDEX characters_sheet_key_lower_idx/);
  assert.equal(db.prepare(sql).get('NPC:NAME-9999').id, 'id-9999');
  console.log(JSON.stringify({ rows: 10000, before, after })); db.close();
});
