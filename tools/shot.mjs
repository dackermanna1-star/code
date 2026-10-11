// Headless screenshot helper used during development.
// usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs] [evalJs]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const [url, out, w = '1024', h = '768', wait = '3000', evalJs] = process.argv.slice(2);
const browser = await playwright.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
// stub the Vite HMR client so file edits elsewhere don't reload the page mid-capture
await page.route('**/@vite/client', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: 'export const createHotContext=()=>({accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const updateStyle=()=>{};export const removeStyle=()=>{};export const injectQuery=(u)=>u;export class ErrorOverlay{}',
}));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
if (wait === 'ready') {
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => window.__ready === true).catch(() => false)) break;
    if (logs.some((l) => l.startsWith('[pageerror]') || /Error:/.test(l))) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
}
if (evalJs) {
  if (wait !== 'ready') await page.waitForTimeout(+wait);
  const r = await page.evaluate(evalJs);
  if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r));
  await page.waitForTimeout(500);
} else if (wait !== 'ready') {
  await page.waitForTimeout(+wait);
}
await page.screenshot({ path: out });
console.log(logs.slice(-40).join('\n'));
await browser.close();
