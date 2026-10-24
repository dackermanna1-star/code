// Scripted headless scenario: node tools/scenario.mjs <outDir> <scenario.json> [width] [height]
// Scenario: { "query": "autoplay", "steps": [ {"eval": "js"}, {"wait": ms}, {"shot": "name"}, {"frames": n} ] }
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const outDir = process.argv[2];
const sc = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const W = +(process.argv[4] || 960), H = +(process.argv[5] || 540);
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join('dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto(`http://localhost:${server.address().port}/?${sc.query || 'autoplay'}`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000, polling: 250 });
console.log('ready after', Date.now() - t0, 'ms');
for (const st of sc.steps) {
  if (st.eval) { const r = await page.evaluate(st.eval); if (r !== undefined) console.log('eval ->', JSON.stringify(r)); }
  if (st.wait) await page.waitForTimeout(st.wait);
  if (st.frames) {
    await page.evaluate((n) => new Promise((res) => { const f0 = window.__game.frames; const chk = () => (window.__game.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), st.frames);
  }
  if (st.shot) { await page.screenshot({ path: path.join(outDir, st.shot + '.png'), timeout: 180000 }); console.log('shot', st.shot, JSON.stringify(await page.evaluate(() => window.__game.extraStats ? window.__game.extraStats() : null))); }
}
console.log(logs.slice(0, 80).join('\n'));
await browser.close();
server.close();
