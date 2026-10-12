// End-to-end check: launch the game in headless Chromium, let the bot play by
// stepping frames deterministically (software WebGL is slow), take
// screenshots and fail on page errors.
// Usage: node tools/e2e.mjs [baseUrl] [outDir] [gameSeconds] [query] [width] [height]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? 'tests/output';
const seconds = Number(process.argv[4] ?? 60);
const query = process.argv[5] ?? 'autoplay=1&quality=medium&nosound=1';
const W = Number(process.argv[6] ?? 1280);
const H = Number(process.argv[7] ?? 960);
const shots = Number(process.env.SHOTS ?? 6);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`http ${r.status()} ${r.url()}`);
});
await page.goto(`${base}?${query}`);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.evaluate(() => window.__game.stage.stop());

const chunk = seconds / shots;
for (let i = 0; i < shots; i++) {
  const info = await page.evaluate((s) => {
    const { stage, game } = window.__game;
    const t = performance.now();
    stage.fastForward(s);
    stage.frame(1 / 60);
    const w = game.world;
    return {
      ms: Math.round(performance.now() - t),
      t: w ? Math.round(w.tick / 50) : 0,
      level: w?.levelNum,
      phase: w?.phase,
      kills: w?.player.stats.kills,
      money: w?.player.money,
      weapon: w?.player.weapon.id,
      enemies: w?.enemies.length,
      view: game.view.stats,
      calls: stage.renderer.info.render.calls,
    };
  }, chunk);
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${out}/e2e_${String(i).padStart(2, '0')}.png` });
}
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  process.exit(1);
}
console.log('OK');
