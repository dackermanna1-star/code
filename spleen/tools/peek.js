// node tools/peek.js "<query>" <out> <simSeconds> [shots] [gapSec] [w] [h]
// Fast-forwards the sim with the autopilot, then renders + screenshots (several times with gaps).
const { chromium } = require('playwright'); const path = require('path');
const BAB = process.env.BAB || '/tmp/claude-0/bab/babylon.js';
(async () => {
  const [query, out, secs = '10', shots = '1', gap = '3', w = '1280', h = '720'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join('|')));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/GPU stall|GL Driver/.test(t)) errors.push(t); });
  await p.route('**/babylonjs@*/babylon.js', r => r.fulfill({ path: BAB, contentType: 'application/javascript' }));
  await p.addInitScript(() => { window.__TEST__ = true; });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?' + query);
  await p.waitForFunction(() => window.__SPLEEN && __SPLEEN.Game.state === 'play', null, { timeout: 30000 });
  await p.evaluate(() => { Gfx.engine().stopRenderLoop(); __SPLEEN.Game.autopilot = true; });
  for (let i = 0; i < +shots; i++) {
    await p.evaluate((n) => { __SPLEEN.step(n); __SPLEEN.render(2); }, Math.round((i === 0 ? +secs : +gap) * 60));
    await p.screenshot({ path: `${out}${+shots > 1 ? '_' + i : ''}.png` });
  }
  const info = await p.evaluate(() => { const S = __SPLEEN.SIM; return { f: S.floor.idx, room: S.room.type, en: S.enemies.map(e => e.type + (e.elite ? '*' : '')).join(','), hp: S.player.hp }; });
  console.log(JSON.stringify(info)); console.log(errors.length ? errors.join('\n') : 'no errors');
  await b.close();
})();
