// Render a preview grid with headless Chromium (SwiftShader WebGL).
// usage: node render_preview.mjs <cfg-url-path> <out.png> [--port 5231]
// The static_server.mjs must be running on the port.
import { chromium } from 'playwright';
const [cfgPath, out] = process.argv.slice(2);
const opt = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = opt('--port', '5231');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/repo/tools/assets/characters/preview.html?cfg=${encodeURIComponent(cfgPath)}`, { waitUntil: 'load', timeout: 120000 });
let failed = false; page.on('pageerror', () => { failed = true; });
const t0 = Date.now();
while (!failed && Date.now() - t0 < 600000) { if (await page.evaluate(() => window.__done === true)) break; await new Promise((r) => setTimeout(r, 500)); }
if (failed) logs.push('PAGE ERROR - aborted'); else if (Date.now() - t0 >= 600000) logs.push('TIMEOUT');
const info = await page.evaluate(() => window.__info);
// read the labelled canvas directly (element screenshots time out on very tall sheets)
const dataUrl = await page.evaluate(() => { const c = document.querySelector('body > canvas:last-of-type'); return c && c.width ? c.toDataURL('image/png') : null; });
if (dataUrl) (await import('fs')).writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
else logs.push('no canvas');
if (process.argv.includes('--info')) console.log(JSON.stringify(info));
if (logs.length) console.log(logs.join('\n'));
await browser.close();
