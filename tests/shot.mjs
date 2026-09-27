// Headless screenshot helper: node tests/shot.mjs <url> <out.png> [waitMs] [evalScript]
import { chromium } from 'playwright';
const [,, url = 'http://localhost:5173/', out = 'tests/out/shot.png', wait = '4000', script = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(parseInt(wait));
if (script) {
  try { const r = await page.evaluate(script); if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 2000)); } catch (e) { console.log('eval error', e.message); }
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out });
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
