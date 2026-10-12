// Headless test driver: opens the game in Chromium, waits for window.__ready, injects a
// script file, then calls window.__drive() (async) until it returns done, printing its log.
// __drive returns { done, log?, shot? (page screenshot), png? (data URL), wait? (ms), json? }.
// The page exposes window.__game (the Game). Console errors and lines starting "[sim]" are
// printed. Note: bullet hits need g.frame() (hitboxes follow the models), and a canvas
// toDataURL is blank (use shot: true).
// usage: node tools/drive.mjs <url> <script.js> [outPrefix]
//   e.g. node tools/drive.mjs "http://localhost:5173/?autostart=1&mode=zombies&allies=3" my.js /tmp/out
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('/home/user/code/node_modules/playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const [url, script, outPrefix = '/tmp/drive'] = process.argv.slice(2);
const browser = await playwright.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const logs = [];
page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (m.type() === 'error' || /^\[sim\]/.test(m.text())) console.log(t); });
page.on('pageerror', (e) => { console.log(`[pageerror] ${e.message}\n${e.stack}`); });
await page.route('**/@vite/client', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: 'export const createHotContext=()=>({accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const updateStyle=()=>{};export const removeStyle=()=>{};export const injectQuery=(u)=>u;export class ErrorOverlay{}',
}));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
const deadline = Date.now() + 300000;
while (Date.now() < deadline) {
  if (await page.evaluate(() => window.__ready === true).catch(() => false)) break;
  await page.waitForTimeout(500);
}
console.log(`ready after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.evaluate(fs.readFileSync(script, 'utf8'));
let n = 0;
while (true) {
  const r = await page.evaluate(() => window.__drive());
  if (r.log) console.log(r.log);
  if (r.png) {
    const f = `${outPrefix}_${n++}.png`;
    fs.writeFileSync(f, Buffer.from(r.png.split(',')[1], 'base64'));
    console.log('wrote', f);
  }
  if (r.shot) { const f = `${outPrefix}_${n++}.png`; await page.screenshot({ path: f }); console.log('shot', f); }
  if (r.wait) await page.waitForTimeout(r.wait);
  if (r.json) { fs.writeFileSync(`${outPrefix}.json`, r.json); console.log('wrote', `${outPrefix}.json`); }
  if (r.done) break;
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
