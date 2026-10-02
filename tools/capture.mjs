// Screenshot an arbitrary project page (e.g. tools/poselab.html?moves=jab,cross)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const page = process.argv[2];
const out = process.argv[3];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await playwright.chromium.launch();
const p = await browser.newPage({ viewport: { width: +(process.env.W || 1200), height: +(process.env.H || 800) } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:${server.address().port}/${page}`);
await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 }).catch(() => {});
await p.screenshot({ path: out, fullPage: true });
console.log('saved', out, errs.length ? errs : '');
await browser.close();
server.close();
