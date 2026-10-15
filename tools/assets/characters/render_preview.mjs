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
try { await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 }); } catch (e) { logs.push('TIMEOUT'); }
const info = await page.evaluate(() => window.__info);
const el = await page.$('body > canvas:last-of-type');
await el.screenshot({ path: out });
if (process.argv.includes('--info')) console.log(JSON.stringify(info));
if (logs.length) console.log(logs.join('\n'));
await browser.close();
