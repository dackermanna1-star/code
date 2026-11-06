// QA (world) helper: keeps one headless Chromium page with the game open and evaluates snippets sent over HTTP.
// Usage: node dev/qa-world-daemon.cjs [gamePort=5304] [ctlPort=5314]
//   curl -s localhost:5314/load?q=autostart=1%26test=1%26seed=millbrook   (navigate + wait until playing)
//   curl -s --data-binary @snippet.js localhost:5314/eval                  (body = async function body, `g` = window.game)
//   curl -s localhost:5314/shot?name=foo                                    (dev/out/qa-world-foo.png)
//   curl -s localhost:5314/errors                                           (console errors since last call)
const http = require('http');
const { chromium } = require('playwright');
const gamePort = process.argv[2] || 5304;
const ctlPort = Number(process.argv[3] || 5314);
let page, browser;
let errors = [];
async function boot() {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 500)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
}
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => r(s)); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o, null, 1)); };
  try {
    if (u.pathname === '/load') {
      const q = u.searchParams.get('q') || 'autostart=1&test=1&seed=millbrook';
      await page.goto(`http://localhost:${gamePort}/?${q}`, { waitUntil: 'commit', timeout: 120000 });
      if (q.includes('autostart')) await page.waitForFunction(() => window.game && window.game.state === 'playing', null, { timeout: 300000 });
      else await page.waitForFunction(() => window.game && window.game.state === 'menu', null, { timeout: 60000 });
      return send({ ok: true });
    }
    if (u.pathname === '/eval') {
      const src = await body(req);
      const out = await page.evaluate(async (src) => {
        const g = window.game;
        // eslint-disable-next-line no-new-func
        const fn = new Function('g', 'return (async () => {' + src + '\n})()');
        try { return { ok: true, v: await fn(g) }; } catch (e) { return { ok: false, err: String(e && e.stack || e) }; }
      }, src);
      return send(out);
    }
    if (u.pathname === '/wait') { await page.waitForTimeout(Number(u.searchParams.get('ms') || 1000)); return send({ ok: true }); }
    if (u.pathname === '/shot') {
      const name = u.searchParams.get('name') || 'shot';
      await page.screenshot({ path: `dev/out/qa-world-${name}.png`, timeout: 120000 });
      return send({ ok: true, path: `dev/out/qa-world-${name}.png` });
    }
    if (u.pathname === '/errors') { const e = [...new Set(errors)]; errors = []; return send(e); }
    if (u.pathname === '/quit') { send({ ok: true }); await browser.close(); process.exit(0); }
    send({ err: 'unknown' });
  } catch (e) { send({ ok: false, err: String(e && e.message || e) }); }
}).listen(ctlPort, async () => { await boot(); console.log('qa daemon ready on', ctlPort); });
