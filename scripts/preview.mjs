// Screenshot the item preview grid: node scripts/preview.mjs "cat=food" out.png
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const query = process.argv[2] || '';
const out = process.argv[3] || 'scripts/shots/preview.png';
const port = process.env.PORT || 5173;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/preview.html?${query}`);
try { await page.waitForFunction(() => window.__previewDone && window.__previewDone(), null, { timeout: 240000 }); } catch { console.log('timeout waiting for thumbnails'); }
console.log(await page.evaluate(() => document.getElementById('status').textContent));
await page.screenshot({ path: out, fullPage: true, timeout: 120000 });
for (const e of errors.slice(0, 30)) console.log('ERR', e);
await browser.close();
