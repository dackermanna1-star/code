// Usage: node tests/shot.mjs "<query>" <out.png> [w] [h] [waitMs]
// Renders the page at http://localhost:5173/?<query> in headless Chromium (SwiftShader WebGL) and saves a PNG.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [query = '', out = 'tests/out/shot.png', w = '1280', h = '720', waitMs = '0'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
} catch {
  logs.push('[timeout] __ready not set');
}
if (Number(waitMs) > 0) await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out });
const errs = logs.filter((l) => l.includes('error') || l.includes('timeout') || l.includes('RESULT') || l.includes('t='));
console.log(errs.length ? errs.join('\n') : 'ok');
await browser.close();
