// Chapter 1 boot check: load, stats, then ~20 s of simulated play with director + bots on.
// Reports page errors / console errors (incl. "[frame]") collected by play.mjs.
export default async ({ page, evalg, wait, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  let st;
  for (let i = 0; i < 90; i++) { await wait(1000); st = await evalg(() => window.session?.state); if (st === 'playing') break; }
  console.log('state', st);
  const r = await evalg(() => {
    const g = window.game, L = g.level;
    const b = L.bounds;
    return {
      nav: L.nav.N, navMs: Math.round(L.navBuildMs), loadMs: Math.round(g.loadMs), boxes: L.col.n, lights: L.lights.length, meshes: L.meshes.length,
      bounds: b && [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ].map((v) => Math.round(v)),
      progStart: L.progressAt(...L.flowStart), progEnd: L.progressAt(...L.flowEnd),
      items: g.items.items.length, doors: L.doors.length, windows: L.windows?.length, usables: g.usables.length, director: g.director.enabled,
    };
  });
  console.log(JSON.stringify(r));
  // 20 s of simulated play, director on, bots on; leave the roof so the director engages
  for (let k = 0; k < 10; k++) {
    const s = await evalg((k) => {
      const g = window.game;
      try { g.advance(2); } catch (e) { return { err: e.message + ' | ' + (e.stack || '').split('\n').slice(0, 5).join(' | ') }; }
      return { t: g.time.toFixed(1), commons: g.infected.commons.filter((c) => !c.dead).length, specials: g.infected.specials.map((s) => s.kind).join(','), dir: g.director.state, errCount: g.errCount || 0, hp: g.survivors.map((s) => Math.round(s.totalHealth)).join(',') };
    }, k);
    console.log(JSON.stringify(s));
  }
  // a few real frames (render path)
  await wait(3000);
  // force a mob + specials to exercise the director
  const m = await evalg(() => {
    const g = window.game;
    try {
      const n = g.director.spawnMob(15, { where: 'any', minD: 10, maxD: 40 });
      g.advance(6);
      return { mob: n, commons: g.infected.commons.filter((c) => !c.dead).length, errCount: g.errCount || 0 };
    } catch (e) { return { err: e.message + ' | ' + (e.stack || '').split('\n').slice(0, 5).join(' | ') }; }
  });
  console.log('mob', JSON.stringify(m));
  await wait(2000);
  const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  console.log('ERRORS:', errs.length);
};
