// Boss fight harness: node tools/bosstest.js "<floors e.g. 1,2,3>" "<extra query>" [maxSeconds]
// For each floor N: boot straight into the boss room, run the autopilot in fast sim,
// report kill time, max phase reached, hits taken, death, and any errors.
const { chromium } = require('playwright');
const path = require('path');
const BAB = process.env.BAB || '/tmp/claude-0/bab/babylon.js';
(async () => {
  const [floors = '1,2,3,4,5,6', extra = 'god=1', maxS = '240'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const f of floors.split(',')) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver|ReadPixels|Babylon\.js v/.test(t)) errors.push(m.type() + ': ' + t); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
    await page.route('**/babylonjs@*/babylon.js', (r) => r.fulfill({ path: BAB, contentType: 'application/javascript' }));
    await page.addInitScript(() => { window.__TEST__ = true; });
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + `?start=1&boss=1&seed=5&floor=${f}&${extra}`);
    await page.waitForFunction(() => window.__SPLEEN && __SPLEEN.Game && __SPLEEN.Game.state === 'play', null, { timeout: 30000 });
    const res = await page.evaluate((maxS) => {
      Gfx.engine().stopRenderLoop();
      const D = __SPLEEN, S = D.SIM; D.Game.autopilot = true;
      const boss = S.boss; const id = boss && boss.bossId;
      let t = 0, maxPhase = 1, killT = null, err = null, maxEnemies = 0, maxShots = 0;
      const phaseT = {};
      try {
        while (t < maxS) {
          D.step(30); t += 0.5;
          if (boss && boss.phase > maxPhase) { maxPhase = boss.phase; phaseT[maxPhase] = +(t - 2.4).toFixed(1); }
          maxEnemies = Math.max(maxEnemies, S.enemies.length); maxShots = Math.max(maxShots, S.eshots.length);
          if (S.run.stats.bossesKilled > 0 && killT == null) { killT = t - 2.4; }
          if (killT != null && t > killT + 5) break;
          if (S.player.dead || D.Game.state !== 'play') break;
        }
      } catch (e) { err = e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | '); }
      const P = S.player;
      return { id, hp0: boss && Math.round(boss.maxHp), bossHp: boss && Math.round(boss.hp), killT: killT && +killT.toFixed(1), maxPhase, phaseT, hits: S.run.stats.hitsTaken, dead: P.dead, playerHp: P.hp + '/' + P.st.maxHp,
        cleared: S.room.cleared, interact: S.interact.map(i => i.kind), maxEnemies, maxShots, err, dmg: +P.baseDmg().toFixed(2) };
    }, +maxS);
    console.log(`floor ${f}:`, JSON.stringify(res));
    if (errors.length) console.log('  ERRORS:\n  ' + [...new Set(errors)].slice(0, 12).join('\n  '));
    await page.close();
  }
  await browser.close();
})();
