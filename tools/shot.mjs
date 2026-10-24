// Headless smoke test: serves dist/, loads the game, waits until meshing is done, saves screenshots.
// usage: node tools/shot.mjs [outDir] [query] [width] [height] [extraWaitMs]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const outDir = process.argv[2] || 'shots';
const query = process.argv[3] || '';
const W = +(process.argv[4] || 960), H = +(process.argv[5] || 540);
const extraWait = +(process.argv[6] || 1500);
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join('dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/?${query}`);
try {
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000, polling: 500 });
} catch (e) { logs.push('[test] timeout waiting for ready'); }
const tReady = Date.now() - t0;
await page.waitForTimeout(extraWait);
await page.screenshot({ path: path.join(outDir, 'shot.png') });
const stats = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return null;
  const s = { frames: g.frames, quads: g.meshes?.quadCount, active: g.meshes?.active.length, pool: g.renderer?.pool.highWater, drawn: g.renderer?.stats };
  if (g.extraStats) Object.assign(s, g.extraStats());
  return s;
});
console.log(JSON.stringify({ readyMs: tReady, stats }, null, 1));
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
server.close();
