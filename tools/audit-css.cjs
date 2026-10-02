// Lightweight lexical guard: browsers silently discard malformed declarations.
// Validate delimiters without interpreting modern properties or changing CSS.
const fs = require('node:fs');
const path = require('node:path');
function syntaxErrors(source) {
  const stack = [], errors = [], closes = { ')': '(', ']': '[', '}': '{' };
  let quote = null, comment = false, line = 1;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (c === '\n') line++;
    if (comment) { if (c === '*' && n === '/') { comment = false; i++; } continue; }
    if (c === '\\') { if (n === '\n') line++; i++; continue; }
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '/' && n === '*') { comment = true; i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if ('([{'.includes(c)) stack.push({ c, line });
    else if (closes[c]) {
      if (stack.at(-1)?.c === closes[c]) stack.pop();
      else errors.push(`linha ${line}: fechamento inesperado ${c}`);
    }
  }
  if (quote) errors.push(`linha ${line}: texto sem fechamento`);
  if (comment) errors.push(`linha ${line}: comentario sem fechamento`);
  for (const item of stack) errors.push(`linha ${item.line}: ${item.c} sem fechamento`);
  return errors;
}
function auditDirectory(dir) {
  let count = 0, failed = false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { const result = auditDirectory(file); count += result.count; failed ||= result.failed; }
    else if (entry.name.endsWith('.css')) {
      count++;
      for (const error of syntaxErrors(fs.readFileSync(file, 'utf8'))) { console.error(`${file}: ${error}`); failed = true; }
    }
  }
  return { count, failed };
}
if (require.main === module) {
  const result = auditDirectory(path.resolve(__dirname, '../css'));
  if (result.failed) process.exitCode = 1;
  else console.log(`CSS delimiters OK (${result.count} files). Not a full CSS grammar validator.`);
}
module.exports = { syntaxErrors };
