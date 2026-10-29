// Local-only benchmark. No campaign credentials, external network or writes to D1.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const ref = process.argv.find(a => a.startsWith('--ref='))?.slice(6);
const label = process.argv.find(a => a.startsWith('--label='))?.slice(8) || (ref ? 'baseline' : 'optimized');
const renderers = Number(process.argv.find(a => a.startsWith('--renderers='))?.slice(12) || 1);
if (!Number.isInteger(renderers) || renderers < 1 || renderers > 7) throw Error('Use --renderers=1..7');
if (!/^[a-z0-9_-]+$/i.test(label)) throw Error('Invalid label');
let source = root;
if (ref) {
  source = fs.mkdtempSync(path.join(os.tmpdir(), 'armagedom-benchmark-'));
  const archive = path.join(source, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', '--output', archive, ref], { cwd: root });
  execFileSync('tar', ['-xf', archive, '-C', source]);
}
if (process.argv.includes('--artifact')) {
  if (ref) {
    const env = { ...process.env, NODE_PATH: path.join(root, 'node_modules') };
    execFileSync(process.execPath, [path.join(source, 'tools/build-pages.cjs')], { cwd: source, env });
    execFileSync(process.execPath, [path.join(source, 'tools/minify.cjs')], { cwd: source, env });
  }
  source = path.join(source, '_site');
  if (!fs.existsSync(source)) throw Error('Run npm run build before benchmarking artifacts');
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = path.resolve(source, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(source + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
});
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] || 0;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const samples = [];
  try {
    browser = await chromium.launch({ args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    for (const count of [30, 60]) for (let run = 1; run <= 3; run++) {
      const contexts = [];
      try {
        const pages = [];
        for (let user = 0; user < renderers; user++) {
          const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); contexts.push(context);
          await context.addInitScript(() => {
            window.ARMAGEDON_CONFIG = { apiBaseUrl: location.origin + '/api', realtimeEnabled: false, mesaLocalScenes: true };
            localStorage.setItem('tc_session', JSON.stringify({ username: 'mestre', role: 'master', backend: false }));
            function markReady() {
              try {
                const ficha = location.pathname.endsWith('/ficha.html');
                const screen = ficha && document.getElementById('masterScreen');
                if (ficha ? screen && getComputedStyle(screen).display !== 'none' : typeof state !== 'undefined' && state.bootCompleted) {
                  window.__benchReadyMs = performance.now(); return;
                }
              } catch { /* global lexical state may still be initializing */ }
              if (performance.now() < 30000) requestAnimationFrame(markReady);
            }
            requestAnimationFrame(markReady);
          });
          const page = await context.newPage(); pages.push(page);
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.enable');
          await cdp.send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*workers.dev*'] });
        }
        for (const cache of ['cold', 'warm']) {
          const loads = await Promise.all(pages.map(async page => {
            const start = performance.now(); await page.goto(base + '/mesa.html', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.__benchReadyMs > 0);
            return { readyMs: await page.evaluate(() => window.__benchReadyMs), controllerReadyMs: performance.now() - start, resources: await page.evaluate(() => performance.getEntriesByType('resource').reduce((s, e) => ({ requests: s.requests + (e.transferSize > 0 ? 1 : 0), bytes: s.bytes + e.transferSize }), { requests: 0, bytes: 0 })) };
          }));
          const host = pages[0]; await host.bringToFront();
          const motion = await host.evaluate(async count => {
            const seed = buildRoster()[0];
            state.tokens = Array.from({ length: count }, (_, i) => ({ ...seed, id: 'bench-' + i, characterKey: 'bench-' + i, x: 5 + (i % 10) * 8, y: 10 + Math.floor(i / 10) * 12, tokenScale: .4, layer: 'tokens' }));
            applyMesaSceneDrawingsFromSnapshot(count === 60 ? Array.from({ length: 1500 }, (_, i) => ({ id: 'stroke-' + i, tool: 'line', width: 2, color: '#ffffff', layer: 'tokens', x1: .1, y1: .1, x2: .2, y2: .2 })) : []);
            renderStage();
            // Initial scene painting is measured by page readiness, not charged
            // to an animation that has not begun. Settle equally in both refs.
            await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
            const times = [], tasks = []; let previous = performance.now();
            const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => e.duration))); observer.observe({ type: 'longtask' });
            const token = state.tokens[0], from = { x: token.x, y: token.y }; token.x = 60;
            MesaMovement.animate(from, token, [{ x: 60, y: token.y }], 1000);
            for (let i = 0; i < 140 && MesaMovement.isAnimating(token); i++) { await new Promise(requestAnimationFrame); const now = performance.now(); times.push(now - previous); previous = now; }
            observer.disconnect(); return { times, tasks };
          }, count);
          const ficha = pages[0], start = performance.now();
          await ficha.goto(base + '/ficha.html', { waitUntil: 'domcontentloaded' }); await ficha.locator('#masterScreen').waitFor({ state: 'visible' });
          await ficha.waitForFunction(() => window.__benchReadyMs > 0);
          samples.push({ count, run, cache, mesa: loads, fichaReadyMs: await ficha.evaluate(() => window.__benchReadyMs), fichaControllerReadyMs: performance.now() - start, motionP95Ms: percentile(motion.times, .95), worstTaskMs: Math.max(0, ...motion.tasks) });
        }
      } finally { await Promise.all(contexts.map(c => c.close())); }
      console.log(label + ': ' + count + ' tokens, run ' + run + '/3');
    }
    const report = { label, ref: ref || null, environment: { node: process.version, chromium: browser.version(), platform: os.platform(), cpu: os.cpus()[0]?.model, viewport: '1440x900', renderers }, scope: renderers + ' local renderer(s); six-player protocol measured separately with real local Worker. Seven simultaneous local renderers are an additional CPU stress test, not six remote computers. Fonts blocked equally. No internet latency or production performance claims.', samples };
    // Playwright clears test-results on each run; keep measurement evidence
    // outside that disposable directory and outside the published artifact.
    const out = path.join(root, 'local-backups', 'benchmarks'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, label + '.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ label, medianMesaReadyMs: percentile(samples.flatMap(s => s.mesa.map(p => p.readyMs)), .5), medianMotionP95Ms: percentile(samples.map(s => s.motionP95Ms), .5) }));
  } finally { await browser?.close(); server.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; server.close(); });
