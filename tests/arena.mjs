// Usage: node tests/arena.mjs <outPrefix> [w h]  — fixed-camera views of the arena (game paused, HUD hidden)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [prefix = 'tests/out/arena', w = '960', h = '540'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(base + '?bot=1&god=1' + (process.env.Q ? '&' + process.env.Q : ''), { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.waitForTimeout(Number(process.env.WAIT ?? 2500));
const views = [
  ['overview', [0, 9, 13.5], [0, 0, -1]],
  ['north', [0, 1.7, 6], [0, 2.2, -12]],
  ['south', [0, 1.7, -6], [0, 2.2, 12]],
  ['east', [-7, 1.7, 0], [14, 2.2, 0]],
  ['west', [7, 1.7, 0], [-14, 2.2, 0]],
  ['floor', [2.5, 1.2, 3.5], [-1, 0, -1]],
];
await page.evaluate(() => { const g = window.game; g.paused = true; document.getElementById('hud').style.display = 'none'; for (const m of document.querySelectorAll('.menu')) m.style.display = 'none'; });
for (const [name, pos, look] of views) {
  await page.evaluate(([p, l]) => { const c = window.game.cam.camera; c.position.set(p[0], p[1], p[2]); c.lookAt(l[0], l[1], l[2]); c.updateMatrixWorld(); }, [pos, look]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${prefix}_${name}.png` });
}
await browser.close();
console.log('done');
