// Dev helper: screenshot the running app in headless Chromium.
// usage: node scripts/shot.mjs "<query>" out.png [frames] [width] [height]
// env: QUALITY=low|medium|high, EVAL="js to run after frames", EVAL_FRAMES=frames to wait after EVAL,
//      EVAL2="js to run after those frames", WAIT_MS=extra wait, APP_URL=page to load
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const query = process.argv[2] ?? '';
const out = process.argv[3] ?? 'shot.png';
const frames = Number(process.argv[4] ?? 60);
const width = Number(process.argv[5] ?? 1280);
const height = Number(process.argv[6] ?? 720);
const base = process.env.APP_URL ?? 'http://localhost:5173/';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const quality = process.env.QUALITY ?? 'low';
await page.addInitScript((q) => {
  try {
    const s = JSON.parse(localStorage.getItem('wf.settings') || '{}');
    s.quality = q;
    s.showFps = true;
    localStorage.setItem('wf.settings', JSON.stringify(s));
  } catch {}
}, quality);
const t0 = Date.now();
await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'load' });
await page.waitForFunction((n) => (window.__frames ?? 0) >= n, frames, { timeout: 600000 }).catch((e) => logs.push('wait failed: ' + e.message));
console.log(`frames reached in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (process.env.EVAL) {
  const r = await page.evaluate(process.env.EVAL).catch((e) => 'eval error: ' + e.message);
  if (r !== undefined) console.log('eval:', typeof r === 'string' ? r : JSON.stringify(r));
  if (process.env.EVAL_FRAMES) {
    const target = await page.evaluate(() => window.__frames) + Number(process.env.EVAL_FRAMES);
    await page.waitForFunction((n) => (window.__frames ?? 0) >= n, target, { timeout: 600000 }).catch((e) => logs.push('wait2 failed: ' + e.message));
  }
  if (process.env.EVAL2) {
    const r2 = await page.evaluate(process.env.EVAL2).catch((e) => 'eval2 error: ' + e.message);
    if (r2 !== undefined) console.log('eval2:', typeof r2 === 'string' ? r2 : JSON.stringify(r2));
  }
}
if (process.env.WAIT_MS) await page.waitForTimeout(Number(process.env.WAIT_MS));
await page.screenshot({ path: out, timeout: 180000 });
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 40).join('\n'));
await browser.close();
