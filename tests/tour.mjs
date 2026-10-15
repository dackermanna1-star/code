// Screenshot tour of a chapter's viewpoints (level.tour). usage: node tests/tour.mjs <chapter> [names...] [--res=240]
import { launch, shot } from './harness.mjs';
const ch = process.argv[2] || '0';
const only = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const res = (process.argv.find((a) => a.startsWith('--res=')) || '--res=240').slice(6);
const flash = process.argv.includes('--flashlight');
const { browser, page, errors } = await launch({ url: `http://localhost:5173/?chapter=${ch}&auto=1&res=${res}` });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.waitForFunction(() => window.__game && (window.__game.state === 'playing' || window.__game.loadError), null, { timeout: 240000 });
const tour = await page.evaluate(() => window.__game.world.level.tour || []);
for (const [name, x, y, z, yaw, pitch] of tour) {
  if (only.length && !only.includes(name)) continue;
  await page.evaluate(([x, y, z, yaw, pitch, flash]) => {
    const g = window.__game, w = g.world;
    w.director.enabled = false; w.director.start = () => {};
    for (const zz of w.infected) zz.remove(); w.infected.length = 0;
    const p = w.player;
    w.survivors.forEach((s, i) => { s.body.pos.set(x + Math.sin(yaw) * (0.8 + i * 0.5), y + 0.05, z + Math.cos(yaw) * (0.8 + i * 0.5)); s.body.vel.set(0, 0, 0); s.controller && s !== p && (s.controller.think = () => {}); });
    p.body.pos.set(x, y + 0.05, z);
    g.player.yaw = yaw; g.player.pitch = pitch; p.flashlight = flash;
  }, [x, y, z, yaw, pitch, flash]);
  await page.waitForTimeout(1600);
  await shot(page, `tour${ch}_${name}`);
  console.log('shot', name);
}
console.log('errors:', errors.filter((e) => !e.includes('Failed to load')).slice(0, 5).join('\n') || 'none');
await browser.close();
