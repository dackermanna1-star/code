// Capture several camera views in one page load.
// usage: node tools/views.mjs <baseUrl> <outDir> <w> <h> "name:x,y,z,pitch,yaw[,eyeHeight]" ...
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const [url, outDir, w, h, ...views] = process.argv.slice(2);
const browser = await playwright.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export const createHotContext=()=>({accept(){},acceptExports(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const updateStyle=()=>{};export const removeStyle=()=>{};export const injectQuery=(u)=>u;export class ErrorOverlay{}' }));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000, polling: 500 });
for (const v of views) {
  const [name, spec] = v.split(':');
  const [x, y, z, pitch, yaw, eyeH] = spec.split(',').map(Number);
  await page.evaluate(([x, y, z, pitch, yaw, eyeH]) => window.__setView(x, y, z, pitch, yaw, eyeH), [x, y, z, pitch, yaw, eyeH ?? 53]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(-10).join('\n'));
await browser.close();
