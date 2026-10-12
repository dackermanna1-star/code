// Full-game visual run: the bot plays all levels in god mode (escapes don't end
// the game) and we capture frames at the same stages as the reference
// screenshots, plus every boss fight.
// Usage: node tools/fullrun.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? 'tests/output/fullrun';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
await page.goto(`${base}?autoplay=1&god=1&quality=medium&nosound=1`);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
await page.evaluate(() => window.__game.stage.stop());

const checkpoints = [
  { name: 'ref1_level1_start', when: (s) => s.level === 1 && s.t >= 7 },
  { name: 'boss1_fatseal', when: (s) => s.level === 1 && s.boss && s.bossLife < 0.9 },
  { name: 'ref2_level2_end', when: (s) => s.level === 2 && s.progress > 0.93 },
  { name: 'boss2_penguins', when: (s) => s.level === 2 && s.boss && s.bossLife < 0.8 },
  { name: 'level3_mid', when: (s) => s.level === 3 && s.progress > 0.5 },
  { name: 'boss3_bear', when: (s) => s.level === 3 && s.boss && s.bossLife < 0.8 },
  { name: 'ref3_level4_mid', when: (s) => s.level === 4 && s.progress > 0.45 },
  { name: 'boss4_turtle', when: (s) => s.level === 4 && s.boss && s.bossT > 6 },
  { name: 'ref4_level5', when: (s) => s.level === 5 && s.progress > 0.6 },
  { name: 'ref5_boss_walrus', when: (s) => s.level === 5 && s.boss && s.bossT > 8 },
  { name: 'level6_last_seal', when: (s) => s.level === 6 && s.boss },
  { name: 'end', when: (s) => s.phase === 'victory' },
];

let next = 0;
const t0 = Date.now();
while (next < checkpoints.length && (Date.now() - t0) / 1000 < 150 * 60) {
  page.setDefaultTimeout(600000);
  const s = await page.evaluate(() => {
    const { stage, game } = window.__game;
    stage.fastForward(1.5);
    const w = game.world;
    const L = w.level;
    if (L.seenBosses && L.bossSeenAt == null) L.bossSeenAt = w.tick;
    return {
      t: w.tick / 50,
      level: w.levelNum,
      phase: w.phase,
      progress: L.progress,
      boss: L.seenBosses,
      bossLife: L.bossLife,
      bossT: L.seenBosses ? (w.tick - L.bossSeenAt) / 50 : 0,
      kills: w.player.stats.kills,
      money: w.player.money,
      weapon: w.player.weapon.id,
      calls: stage.renderer.info.render.calls,
      view: game.view.stats,
    };
  });
  while (next < checkpoints.length && checkpoints[next].when(s)) {
    await page.evaluate(() => window.__game.stage.frame(1 / 60));
    await page.screenshot({ path: `${out}/${checkpoints[next].name}.png`, timeout: 240000 });
    console.log(checkpoints[next].name, JSON.stringify(s));
    next++;
  }
  if (s.phase === 'victory' || s.phase === 'gameover') break;
}
console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  process.exit(1);
}
