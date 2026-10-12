// End-to-end check: launch the game in headless Chromium, let the bot play,
// take screenshots and fail on page errors.
// Usage: node tools/e2e.mjs [baseUrl] [outDir] [seconds] [query]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? 'tests/output';
const seconds = Number(process.argv[4] ?? 30);
const query = process.argv[5] ?? 'autoplay=1&speed=2&quality=medium';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
await page.goto(`${base}?${query}`);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
const t0 = Date.now();
let shot = 0;
while ((Date.now() - t0) / 1000 < seconds) {
  await page.waitForTimeout(Math.max(1000, (seconds * 1000) / 6));
  const info = await page.evaluate(() => {
    const g = window.__game.game;
    const w = g.world;
    return w
      ? { tick: w.tick, level: w.levelNum, phase: w.phase, kills: w.player.stats.kills, money: w.player.money, enemies: w.enemies.length, view: g.view.stats }
      : null;
  });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${out}/e2e_${String(shot++).padStart(2, '0')}.png` });
}
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  process.exit(1);
}
console.log('OK');
