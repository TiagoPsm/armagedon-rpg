// Validacao isolada: apenas Worker/D1 locais; segredos aleatorios em memoria.
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const playwright = path.join(root, 'node_modules/@playwright/test/cli.js');
const config = path.join(root, 'cloudflare/wrangler.toml');
const stateDir = mkdtempSync(path.join(tmpdir(), 'armagedom-validation-'));
const masterPass = randomBytes(24).toString('hex');
const playerPass = randomBytes(24).toString('hex');
const helper = require(path.join(root, 'tests/mesa-test-server.cjs'));
function run(file, args, options = {}) {
  const r = spawnSync(process.execPath, [file, ...args], {cwd: root, encoding: 'utf8', windowsHide: true, ...options});
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error('Command failed: ' + path.basename(file) + ' (' + r.status + ')');
}
async function port() {
  const s = net.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise(r => s.close(r));
  return p;
}
let worker;
(async () => {
  try {
    run(wrangler, ['d1', 'execute', 'armagedon', '--local', '--config', config, '--persist-to', stateDir, '--file', path.join(root, 'cloudflare/d1/schema.sql')]);
    const workerPort = await port();
    const inspectorPort = await port();
    let logs = '';
    worker = spawn(process.execPath, [wrangler, 'dev', '--local', '--config', config, '--persist-to', stateDir, '--port', String(workerPort), '--inspector-port', String(inspectorPort), '--var', 'JWT_SECRET:' + randomBytes(32).toString('hex'), '--var', 'PASSWORD_PEPPER:' + randomBytes(32).toString('hex'), '--var', 'MASTER_BOOTSTRAP_PASSWORD:' + masterPass, '--show-interactive-dev-session=false'], {cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    worker.stdout.on('data', b => { logs += b; });
    worker.stderr.on('data', b => { logs += b; });
    const api = 'http://127.0.0.1:' + workerPort + '/api';
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(api + '/health'); if (r.ok) { ready = true; break; } } catch {}
      if (worker.exitCode !== null) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!ready) throw new Error('Local Worker did not become ready: ' + logs.replaceAll(masterPass, '[local password]'));
    const login = await fetch(api + '/auth/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'mestre', password: masterPass})});
    const session = await login.json();
    if (!login.ok || !session.token) throw new Error('Local master bootstrap failed: ' + login.status);
    const player = await fetch(api + '/directory/players', {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + session.token}, body: JSON.stringify({username: 'jogador1', password: playerPass, charName: 'Validation Player'})});
    if (player.status !== 201) throw new Error('Local player creation failed: ' + player.status + ' ' + await player.text());
    const site = await helper.getMesaBaseUrl();
    console.log('Worker local, D1, bootstrap e criacao de jogador: OK.');
    const env = {...process.env, ARMAGEDON_LOCAL_WORKER: api, ARMAGEDON_LOCAL_SITE: site, ARMAGEDON_LOCAL_MASTER_PASSWORD: masterPass, ARMAGEDON_LOCAL_PLAYER_PASSWORD: playerPass};
    // Asynchronous child keeps the local HTTP server responsive during browser tests.
    const result = await new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [playwright, 'test', 'tests/mesa-resize-worker.spec.cjs', 'tests/mesa-local-worker.spec.cjs', '--workers=1', '--reporter=line', '--output=test-results/worker-validation'], {cwd: root, env, windowsHide: true, stdio: 'inherit'});
      p.on('error', reject); p.on('exit', resolve);
    });
    if (result !== 0) throw new Error('Worker browser tests failed: ' + result);
  } finally {
    await helper.closeMesaTestServer();
    if (worker && worker.exitCode === null) {
      spawnSync('taskkill', ['/PID', String(worker.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
    }
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
