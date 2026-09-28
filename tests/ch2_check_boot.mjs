// Ch2 regression check 1: boot + ~20 s simulated play with the director and bots on.
// Prints load stats and any errors (page errors / console errors / "[frame]" are in the log dump).
export default async ({ page, evalg, wait, logs }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  let st;
  for (let i = 0; i < 120; i++) { await wait(1000); st = await evalg(() => window.session?.state); if (st === 'playing') break; }
  console.log('state', st);
  const r0 = await evalg(() => {
    const g = window.game, L = g.level;
    g.director.enabled = true; g.cheats.botsIdle = false; g.cheats.god = true;
    return { nav: L.nav.N, loadMs: Math.round(g.loadMs), boxes: L.col.n, lights: L.lights.length, progStart: +L.progressAt(...L.flowStart).toFixed(3), progEnd: +L.progressAt(...L.flowEnd).toFixed(3), items: g.items.items.length, doors: L.doors.length, windows: (L.windows || []).length };
  });
  console.log(JSON.stringify(r0));
  // 4 s in the safe room, then out into the concourse and along the platform
  for (const [x, y, z, t] of [[-4.5, 0, 5.5, 4], [3, 0, 6.6, 4], [15, 0, 11, 4], [27, 0, 6, 4], [45, -5, 5, 4]]) {
    const r = await evalg(([x, y, z, t]) => {
      const g = window.game, p = g.player;
      p.teleport(x, y, z, -Math.PI / 2);
      g.advance(t);
      return { at: [x, z], t: +g.time.toFixed(1), dir: g.director.state, commons: g.infected.commons.length, specials: g.infected.specials.length, errs: g.errCount || 0, bots: g.survivors.filter((s) => s !== p).map((s) => +s.pos.distanceTo(p.pos).toFixed(1)) };
    }, [x, y, z, t]);
    console.log(JSON.stringify(r));
  }
  // a few real frames through the normal loop (catches [frame] errors)
  await wait(3000);
  console.log('errCount', await evalg(() => window.game.errCount || 0));
  const bad = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  console.log('ERRORS', bad.length);
};
