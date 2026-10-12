// Weapon showcase: for every weapon, line up a few creatures in the hunter's
// lane, fire, and capture the moment of firing and the aftermath.
// Usage: node tools/weapons.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? 'tests/output/weapons';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
await page.goto(`${base}?play=1&god=1&money=60000&level=3&quality=medium&nosound=1`);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.evaluate(() => {
  const { stage, game } = window.__game;
  stage.stop();
  stage.fastForward(2.2); // past the splash
  const w = game.world;
  w.level.ticks = -1e9; // freeze spawning
});

const weapons = ['pistol', 'magnum', 'mp5', 'grenades', 'shotgun', 'mac10', 'flunk', 'm4', 'awp', 'vintage', 'minigun'];
for (const id of weapons) {
  const r = await page.evaluate((id) => {
    const g = window.__game;
    const { stage, game } = g;
    const w = game.world;
    const p = w.player;
    for (const e of w.enemies) e.removed = true;
    p.x = 10;
    p.z = 2;
    p.vx = p.vz = 0;
    if (id !== 'pistol') p.selectOrBuy(id);
    else p.switchTo('pistol');
    p.weapon.bullets = p.weapon.def.clip;
    p.weapon.state = 'idle';
    // A line of targets in the lane (and one slightly off-lane).
    const types = id === 'awp' || id === 'm4' ? ['seal', 'seal', 'activist', 'penguin'] : ['seal', 'activist', 'penguin', 'seal'];
    types.forEach((t, i) => {
      const e = g.spawn(t, 4 - i * 3.2, 2.1 + (i % 2) * 0.35);
      e.vx = 0.3;
    });
    return { weapon: p.weapon.id };
  }, id);
  // Hold the fire key (the game reads the keyboard each frame).
  await page.keyboard.down('Space');
  const r2 = await page.evaluate((id) => {
    const { stage, game } = window.__game;
    const p = game.world.player;
    const fireFrames = id === 'vintage' ? 50 : id === 'minigun' ? 70 : id === 'grenades' || id === 'flunk' ? 8 : 12;
    for (let i = 0; i < fireFrames; i++) stage.frame(1 / 60, false);
    stage.frame(1 / 60);
    return { bullets: p.weapon.bullets, kills: p.stats.kills };
  }, id);
  Object.assign(r, r2);
  await page.screenshot({ path: `${out}/${id}_fire.png` });
  await page.keyboard.up('Space');
  await page.evaluate(() => {
    const { stage } = window.__game;
    stage.fastForward(1.8);
    stage.frame(1 / 60);
  });
  await page.screenshot({ path: `${out}/${id}_after.png` });
  console.log(id, JSON.stringify(r));
}
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  process.exit(1);
}
console.log('OK');
