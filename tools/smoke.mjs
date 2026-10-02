// Browser smoke test: serves the project, loads the page in headless
// Chromium, records console errors and captures screenshots over time.
//   node tools/smoke.mjs [page=index.html] [seconds=20] [outDir=tools/out] [query]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const page = process.argv[2] || 'index.html';
const seconds = +(process.argv[3] || 20);
const outDir = path.resolve(process.argv[4] || path.join(root, 'tools', 'out'));
const setup = process.argv[5] || '';
fs.mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await playwright.chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 1600), height: +(process.env.H || 900) }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await p.goto(`http://localhost:${port}/${page}`);
await p.waitForTimeout(800);
if (setup) await p.evaluate(setup);
const shots = +(process.env.SHOTS || 4);
for (let i = 0; i < shots; i++) {
  await p.waitForTimeout((seconds * 1000) / shots);
  const file = path.join(outDir, `shot-${i}.png`);
  await p.screenshot({ path: file });
  const info = await p.evaluate(() => {
    const a = window.__arena;
    if (!a || !a.sim) return null;
    const s = a.sim;
    return { t: s.time.toFixed(1), theme: s.level.theme, cond: s.level.condition, alive: s.enemiesAlive, ko: s.stats.defeated, hp: s.hero.hp.toFixed(0), mind: s.hero.brain.mind, over: !!s.over, cam: a.cam.mode, zoom: a.cam.zoom.toFixed(2) };
  });
  console.log(file, JSON.stringify(info));
}
console.log('console errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
server.close();
