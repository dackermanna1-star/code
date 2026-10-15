// Boot a chapter in auto mode, let it run, collect stats/screenshots.
// usage: node tests/play.mjs <chapter|test> [seconds] [shots]
import { launch, shot } from './harness.mjs';
const which = process.argv[2] || 'test';
const secs = +(process.argv[3] || 10);
const url = which === 'test' ? 'http://localhost:5173/?test=arena&auto=1' : `http://localhost:5173/?chapter=${which}&auto=1`;
const { browser, page, errors, logs } = await launch({ url, width: 960, height: 540 });
const t0 = Date.now();
await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 180000 });
console.log('loaded in', (Date.now() - t0) / 1000, 's');
const info = () => page.evaluate(() => { const g = window.__game, w = g.world; return { nav: w.nav.count, inf: w.infected.length, alive: w.infected.filter(z=>z.alive).length, phase: w.director.phase, enabled: w.director.enabled, surv: w.survivors.map(s => [s.name, s.state, Math.round(s.health), s.body.pos.toArray().map(v=>+v.toFixed(1))]), fps: g.hud.fps, time: w.time.toFixed(1) }; });
console.log(JSON.stringify(await info()));
await shot(page, `play_${which}_0`);
for (let i = 1; i <= 3; i++) {
  await page.waitForTimeout(secs * 1000 / 3);
  console.log(JSON.stringify(await info()));
  await shot(page, `play_${which}_${i}`);
}
console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
console.log(logs.filter(l => l.includes('warn')).slice(0, 10).join('\n'));
await browser.close();
