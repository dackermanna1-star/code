// Headless screenshot helper: node tools/shot.mjs "<query>" out.png [w h] [waitMs]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [,, query = '', out = 'shot.png', w = '900', h = '1100', wait = '500'] = process.argv;
const url = (process.env.APP_URL || 'http://localhost:5173/') + (query ? '?' + query : '');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(url);
try {
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
} catch (e) { logs.push('timeout waiting for ready'); }
await page.waitForTimeout(+wait);
const err = await page.evaluate(() => window.__error);
if (err) logs.push('APP ERROR: ' + err);
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await browser.close();
