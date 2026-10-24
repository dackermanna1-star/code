// CPU-profile the browser main thread for a number of frames: node tools/profile.mjs <frames> [query] [evalJs]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const frames = +(process.argv[2] || 120);
const query = process.argv[3] || 'autoplay';
const setup = process.argv[4] || '';
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
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:${server.address().port}/?${query}`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000, polling: 250 });
if (setup) await page.evaluate(setup);
await page.evaluate((n) => new Promise((res) => { const f0 = window.__game.frames; const chk = () => (window.__game.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), 20);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.evaluate((n) => new Promise((res) => { const f0 = window.__game.frames; const chk = () => (window.__game.frames - f0 >= n ? res() : requestAnimationFrame(chk)); chk(); }), frames);
const wall = Date.now() - t0;
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas;
const counts = new Map();
for (let i = 0; i < profile.samples.length; i++) counts.set(profile.samples[i], (counts.get(profile.samples[i]) || 0) + (dt[i] || 0));
let total = 0;
for (const [id, us] of counts) {
  const n = byId.get(id);
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + us);
  total += us;
}
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log(`frames ${frames}, wall ${wall} ms, sampled ${(total / 1000).toFixed(0)} ms`);
for (const [k, us] of top) console.log(`${(us / 1000).toFixed(1).padStart(8)} ms  ${(100 * us / total).toFixed(1).padStart(5)}%  ${k}`);
await browser.close();
server.close();
