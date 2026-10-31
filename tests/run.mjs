// Usage: node tests/run.mjs "<query>" [out.png] [timeoutSec]
// Runs a headless test scenario (?test=...), prints console output + RESULT JSON, optional screenshot.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [query, out = '', timeoutSec = '240', w = '1280', h = '720'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const seen = new Map();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('willReadFrequently') || t.includes('PCFSoftShadowMap')) return;
  const key = t.slice(0, 120);
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  if (n <= 3) console.log(`[${m.type()}] ${t}`);
  else if (n === 4) console.log(`[${m.type()}] (repeats...)`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`));
const t0 = Date.now();
await page.goto(base + '?' + query, { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: Number(timeoutSec) * 1000, polling: 500 });
} catch {
  console.log('[timeout] __ready not set after ' + timeoutSec + 's');
}
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (out) await page.screenshot({ path: out });
await browser.close();
