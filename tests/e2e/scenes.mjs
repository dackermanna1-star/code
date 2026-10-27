// Usage: node tests/e2e/scenes.mjs <outdir> <scenes.json>
// scenes.json: [{ "name": "...", "setup": "<js using app>", "wait": ms }]
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [outDir, scenesFile, W = '960', H = '540'] = process.argv.slice(2);
const scenes = JSON.parse(fs.readFileSync(scenesFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.COSMOS_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(url);
await page.waitForFunction(() => !!window.__cosmos, null, { timeout: 60000 });
for (const sc of scenes) {
  const t0 = Date.now();
  await page.evaluate(`(async () => { const app = window.__cosmos; ${sc.setup} })()`);
  if (sc.settle) await page.evaluate(`window.__cosmos.settle && window.__cosmos.settle(${sc.settle})`);
  await page.waitForTimeout(sc.wait ?? 6000);
  const perf = await page.evaluate(() => document.querySelector('#hud-perf')?.textContent);
  await page.screenshot({ path: `${outDir}/${sc.name}.png`, timeout: 180000 });
  console.log(sc.name, ((Date.now() - t0) / 1000).toFixed(1) + 's', perf);
}
for (const e of [...new Set(errors)].slice(0, 20)) console.log('ERR', e);
await browser.close();
