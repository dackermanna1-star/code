// Usage: node tools/shot.mjs <url> <out.png> [waitMs] [width] [height] [evalScript]
import { chromium } from 'playwright-core';
const [url, out, wait = '1500', w = '1280', h = '960', script = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
if (script) await page.evaluate(script);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
