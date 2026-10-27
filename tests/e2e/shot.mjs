// Usage: node tests/e2e/shot.mjs <out.png> [setupJS] [waitMs] [width] [height]
// Opens the running dev server, optionally evaluates setup code against window.__cosmos,
// waits for terrain streaming, then captures a screenshot and console errors.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Playwright is resolved from the environment (globally installed) or local node_modules.
const { chromium } = require('playwright');
const [out = 'shot.png', setup = '', waitMs = '8000', w = '960', h = '540'] = process.argv.slice(2);
const url = process.env.COSMOS_URL || 'http://localhost:5173/?test';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => !!window.__cosmos, null, { timeout: 30000 });
if (setup) await page.evaluate(setup);
await page.waitForTimeout(+waitMs);
const info = await page.evaluate(() => {
  const a = window.__cosmos;
  return { fps: a.fps ?? null, hud: document.querySelector('.hud-bottom')?.textContent, perf: document.querySelector('#hud-perf')?.textContent };
});
await page.screenshot({ path: out, timeout: 180000 });
console.log(JSON.stringify(info));
for (const e of errors.slice(0, 30)) console.log(e);
await browser.close();
