// Usage: node tests/live.mjs "<query>" <outPrefix> <shots> <intervalSec> [w h]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [query, prefix = 'tests/out/live', shots = '3', interval = '10', w = '1280', h = '720'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const seen = new Set();
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') {
    if (t.includes('willReadFrequently') || t.includes('PCFSoftShadowMap') || seen.has(t)) return;
    seen.add(t);
    console.log(`[${m.type()}] ${t}`);
  }
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 5).join('\n')}`));
await page.goto(base + '?' + query, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
for (let i = 0; i < Number(shots); i++) {
  await page.waitForTimeout(Number(interval) * 1000);
  const f = `${prefix}_${i}.png`;
  await page.screenshot({ path: f });
  const info = await page.evaluate(() => {
    const g = window.game;
    return g ? { t: g.time.toFixed(1), wave: g.waves.wave, corpses: g.corpses.count, fps: 0 } : null;
  });
  console.log(f, JSON.stringify(info));
}
await browser.close();
