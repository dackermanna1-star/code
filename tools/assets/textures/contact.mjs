// Render texture contact sheets with headless Chromium (SwiftShader WebGL).
// usage: node tools/assets/textures/contact.mjs <outDir> [--port 5261] [--groups terrain,building,bark,veg,decal,hdri] [--hdri partly_cloudy_1k]
// static_server.mjs must be running on the port.
import { chromium } from 'playwright';
import fs from 'fs';
const out = process.argv[2];
const opt = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = opt('--port', '5261');
const groups = opt('--groups', 'terrain,building,bark,veg,decal,hdri').split(',');
const hdri = opt('--hdri', 'partly_cloudy_1k');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
for (const g of groups) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/repo/tools/assets/textures/contact.html?group=${g}&hdri=${hdri}`, { waitUntil: 'load', timeout: 120000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 900000) {
    if (await page.evaluate(() => window.__done === true || !!window.__error)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const err = await page.evaluate(() => window.__error || null);
  const dataUrl = await page.evaluate(() => { const c = document.getElementById('sheet'); return c && c.width ? c.toDataURL('image/jpeg', 0.9) : null; });
  if (dataUrl) fs.writeFileSync(`${out}/contact_${g}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(g, err ? 'ERROR ' + err : 'ok', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  await page.close();
}
await browser.close();
