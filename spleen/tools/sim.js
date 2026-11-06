// Fast headless playthrough: node tools/sim.js "<query>" <seconds> [god]
// Runs the simulation (no rendering) with the autopilot and reports progress + errors.
const { chromium } = require('playwright');
const path = require('path');
const BAB = process.env.BAB || '/tmp/claude-0/bab/babylon.js';
(async () => {
  const [query = 'start=1&auto=1', seconds = '300'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver|ReadPixels|Babylon\.js v/.test(t)) errors.push(m.type() + ': ' + t); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  await page.route('**/babylonjs@*/babylon.js', (r) => r.fulfill({ path: BAB, contentType: 'application/javascript' }));
  await page.addInitScript(() => { window.__TEST__ = true; });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?' + query);
  await page.waitForFunction(() => window.__SPLEEN && __SPLEEN.Game && __SPLEEN.Game.state === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { Gfx.engine().stopRenderLoop(); __SPLEEN.Game.autopilot = true; });
  const total = +seconds, chunk = 10;
  let last = '';
  for (let t = 0; t < total; t += chunk) {
    const r = await page.evaluate((n) => {
      try { __SPLEEN.step(n); } catch (e) { return { err: e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ') }; }
      const S = __SPLEEN.SIM, G = __SPLEEN.Game, P = S.player;
      return {
        st: G.state, sub: G.sub, f: S.floor && S.floor.idx, room: S.room && S.room.id + ':' + S.room.type, hp: P && P.hp + '/' + (P.st && P.st.maxHp),
        en: S.enemies.length, kills: S.run && S.run.stats.kills, muts: P && P.mutations.length, iron: P && Math.floor(P.iron), boss: S.boss ? Math.round(S.boss.hp) : null,
        cleared: S.floor ? S.floor.rooms.filter(r => r.cleared).length + '/' + S.floor.rooms.length : '', t: Math.round(S.time),
      };
    }, chunk * 60);
    if (r.err) { console.log('EXCEPTION', r.err); break; }
    const line = JSON.stringify(r);
    if (line !== last) console.log(line);
    last = line;
    if (r.st !== 'play') break;
  }
  const summary = await page.evaluate(() => { const r = __SPLEEN.SIM.run; return r ? { won: r.won, floor: r.floorIdx, stats: r.stats, muts: __SPLEEN.SIM.player ? __SPLEEN.SIM.player.mutations : null } : null; });
  console.log('SUMMARY', JSON.stringify(summary));
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'no errors');
  await browser.close();
})();
