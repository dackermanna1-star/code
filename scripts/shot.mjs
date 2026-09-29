// Headless screenshot + console capture helper.
// usage: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height] [evalScript]
import { chromium } from 'playwright-core';

const [,, url = 'http://localhost:4173/', out = 'test-output/shot.png', waitMs = '6000', w = '1280', h = '720', evalScript = ''] = process.argv;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+waitMs);
if (evalScript) {
  const r = await page.evaluate(evalScript);
  if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r));
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
