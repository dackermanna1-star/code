// Smoke-test the hosted build (`vite build --mode artifact`): serves dist-artifact
// and answers the jsDelivr import-map URLs from local node_modules (same
// versions), then boots the game and plays a few seconds with the autopilot.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist-artifact');
const out = process.argv[2] || 'test-output/artifact';
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
// "/" mimics the artifact host: it wraps the page body in its own skeleton
const skeleton = (page) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui;background:#fafaf7}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(skeleton(fs.readFileSync(path.join(root, 'sizzle-and-stack.html'), 'utf8')));
    return;
  }
  const p = path.join(root, decodeURIComponent(url.pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(4180);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const cdn = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('vibrate')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.route('https://cdn.jsdelivr.net/npm/**', async (route) => {
  const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.*)$/);
  const pkg = m && path.resolve('node_modules', m[1]);
  const file = m && path.join(pkg, m[3]);
  const ver = m && JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;
  if (!m || !fs.existsSync(file) || ver !== m[2]) { cdn.push(`MISS ${route.request().url()} (local ${ver})`); return route.abort(); }
  cdn.push(`ok ${m[1]}@${m[2]}/${m[3]}`);
  await route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8'), headers: { 'access-control-allow-origin': '*' } });
});
await page.goto('http://localhost:4180/?test=1');
await page.waitForSelector('.load-start button', { timeout: 300000 });
await page.screenshot({ path: `${out}/0-loaded.png` });
await page.evaluate(() => localStorage.clear());
await page.click('.load-start button');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/1-title.png` });
const fontOk = await page.evaluate(() => document.fonts.check('700 20px Fredoka'));
await page.evaluate(() => { window.__game.progress.data.tutorialDone = true; });
await page.click('.title-btns .btn.yellow');
await page.waitForFunction(() => window.__game.state === 'day', null, { timeout: 180000 });
await page.evaluate(() => window.__game.startBot(1));
await page.evaluate(() => (window.__game.engine.timeScale = 4));
await page.waitForFunction(() => window.__game.orders.orders.length > 0, null, { timeout: 300000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/2-playing.png` });
console.log('font loaded:', fontOk);
console.log('cdn requests:\n' + cdn.join('\n'));
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
server.close();
