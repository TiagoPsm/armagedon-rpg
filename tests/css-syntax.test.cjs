const test = require('node:test');
const assert = require('node:assert/strict');
const { syntaxErrors } = require('../tools/audit-css.cjs');
test('CSS guard catches silently discarded inspector colors', () => {
  assert.ok(syntaxErrors('.empty { color: var(--text-soft)); }').length);
});
test('CSS guard accepts nested calc, media, attributes, comments and escaped URLs', () => {
  assert.deepEqual(syntaxErrors('/* ) */ @media (width > 10px) { [data-x="}"] { width: calc(var(--sp-2) * 2); background: url(a\\)b.png); content: "\\\"("; } }'), []);
});
test('CSS guard rejects unterminated strings, comments and blocks', () => {
  for (const s of ['a {', '/* missing', 'a { content: "missing', 'a { width: calc(1px; }']) assert.ok(syntaxErrors(s).length);
});
