// Headless screenshot harness: node scripts/shot.mjs [url] [outdir] [scenario]
// Boots the game in Chromium, reports console errors, and captures views.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'scripts/shots';
const scenario = process.argv[4] || 'tour';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
try {
  await page.waitForFunction(() => window.__game && document.getElementById('title'), null, { timeout: 120000 });
} catch (e) {
  await page.screenshot({ path: `${out}/fail.png` });
  console.log('BOOT FAILED. loading text:', await page.evaluate(() => document.querySelector('.ld-t')?.textContent));
  for (const e2 of errors.slice(0, 40)) console.log(e2);
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1500);
console.log('fps', await page.evaluate(() => window.__game.engine.fps));
await page.screenshot({ path: `${out}/00_title.png`, timeout: 120000 });
await page.evaluate(() => { document.querySelector('#title .btn.primary').click(); });
await page.waitForTimeout(1000);

const views = {
  tour: [
    ['01_entry', -0.55, 3.9, Math.PI, 0],
    ['02_living', -1.0, 0.2, Math.PI * 0.85, -0.05],
    ['03_living_tv', -3.6, -2.3, -Math.PI / 2, -0.1],
    ['04_kitchen', -3.2, 0.6, Math.PI * 0.3, -0.15],
    ['05_bedroom', 2.0, 0.6, -Math.PI * 0.75, -0.1],
    ['06_bath', 1.6, 2.4, -Math.PI * 0.6, -0.2],
    ['07_closet', 5.5, 2.0, Math.PI, -0.1],
    ['08_window', -3.0, -3.8, 0, 0.0],
  ],
};
async function setTime(min) { await page.evaluate((m) => { window.__game.state.time = m; }, min); }
for (const [name, x, z, yaw, pitch] of views[scenario] || views.tour) {
  await page.evaluate(([x, z, yaw, pitch]) => { const G = window.__game; G.player.teleport(x, z, yaw); G.player.pitch = pitch; }, [x, z, yaw, pitch]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
}
// night shot
await setTime(1440 + 21 * 60);
await page.evaluate(() => { const G = window.__game; G.player.teleport(-1.0, 0.2, Math.PI * 0.85); G.player.pitch = 0.0; });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/09_night.png`, timeout: 120000 });
const stats = await page.evaluate(() => { const G = window.__game; const r = G.engine.renderer.info; return { fps: G.engine.fps, calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, items: G.items.list.length }; });
console.log('STATS', JSON.stringify(stats));
console.log('ERRORS', errors.length);
for (const e of errors.slice(0, 40)) console.log(e);
await browser.close();
