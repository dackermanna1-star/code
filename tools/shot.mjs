// Headless browser driver for automated testing & screenshots.
// Usage: node tools/shot.mjs <url> <out.png> [waitMs] [--eval "js expr"] [--width 1280 --height 720]
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const url = args[0];
const out = args[1] || 'shot.png';
const waitMs = Number(args[2] || 5000);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const evalExpr = opt('eval', null);
const width = Number(opt('width', 1280)), height = Number(opt('height', 720));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(waitMs);
if (evalExpr) {
  try { const r = await page.evaluate(evalExpr); console.log('EVAL:', typeof r === 'string' ? r : JSON.stringify(r, null, 1)); }
  catch (e) { console.log('EVAL ERROR:', e.message); }
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
