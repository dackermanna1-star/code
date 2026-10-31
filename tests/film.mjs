// Usage: node tests/film.mjs "<query>" <outPrefix> <frames> <stepEvery> [w h]
// Captures consecutive gameplay frames from ?test=film and tiles them with ImageMagick.
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [query, prefix = 'tests/out/film', frames = '16', every = '3', w = '640', h = '360'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.text().startsWith('cam ')) console.log(m.text()); });
await page.goto(base + '?' + query, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const files = [];
for (let i = 0; i < Number(frames); i++) {
  await page.evaluate((k) => window.__film.step(k), Number(every));
  const f = `${prefix}_${String(i).padStart(3, '0')}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
execSync(`montage ${files.join(' ')} -tile 4x -geometry +2+2 ${prefix}_sheet.png`);
console.log('sheet', `${prefix}_sheet.png`);
