// QA: natural spawning (density, placement validity, visibility at spawn), static spawns, perf.
const { boot } = require('./qa-zombies-lib.cjs');
const port = process.argv[2] || 5302;
(async () => {
  const { browser, page, ev, shot, settle, report } = await boot({ port });
  await settle(2000);
  const info = await ev(() => {
    const g = window.game, P = g.player;
    return { p: [P.x.toFixed(1), P.y.toFixed(1), P.z.toFixed(1)], zone: g.world.getZone(P.x, P.z), statics: g.world.zombieSpawns.length, staticTotal: g.world.zombieSpawns.reduce((a, s) => a + s.count, 0), indoorStatics: g.world.zombieSpawns.filter((s) => s.indoor).length, maxActive: g.zombies.maxActive, localDensity: g.zombies.localDensity };
  });
  console.log('start', JSON.stringify(info));
  // record spawn events: wrap spawn()
  await ev(() => {
    const g = window.game, mgr = g.zombies;
    window.qa.spawns = [];
    const orig = mgr.spawn.bind(mgr);
    mgr.spawn = (x, y, z, o = {}) => {
      const zb = orig(x, y, z, o);
      const P = g.player, w = g.world;
      const { lineOfSight } = window.__ray || {};
      const ix = Math.floor(x), iz = Math.floor(z), iy = Math.floor(y);
      const roof = w.roofY(ix, iz);
      const inSolid = [0, 1].some((dy) => { const id = w.get(ix, iy + dy, iz); return id && window.__SOLID && window.__SOLID[id]; });
      const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
      const fwd = P.forward(new zb.visual.root.position.constructor());
      const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
      window.qa.spawns.push({ x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), d: +d.toFixed(1), dot: +dot.toFixed(2), roof, belowRoof: roof >= iy, inSolid, staticIdx: o.staticIdx ?? null, variant: zb.variant, zone: w.getZone(x, z), los: window.__los ? window.__los(w, P.x, P.y + P.eye, P.z, x, y + 1.6, z) : null });
      return zb;
    };
  });
  await ev(async () => {
    const { SOLID } = await import('/src/world/blocks.js');
    const { lineOfSight } = await import('/src/world/raycast.js');
    window.__SOLID = SOLID; window.__los = lineOfSight;
  });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    const s = await ev(() => ({ ...window.qa.summary(), zt: (window.qa.zt.sum / Math.max(1, window.qa.zt.n)).toFixed(2), ztMax: window.qa.zt.max.toFixed(1), fps: window.game.fps.toFixed(0), upd: window.game.perf.update.toFixed(1) }));
    console.log('t=' + (i + 1) * 5, JSON.stringify(s));
    await ev(() => { window.qa.zt = { sum: 0, n: 0, max: 0 }; });
  }
  const sp = await ev(() => window.qa.spawns);
  console.log('spawns', sp.length);
  const bad = sp.filter((s) => s.inSolid || (s.los && s.d < 60));
  console.log('suspicious spawns', bad.length, JSON.stringify(bad.slice(0, 10)));
  const byZone = {};
  for (const s of sp) byZone[s.zone] = (byZone[s.zone] || 0) + 1;
  console.log('byZone', JSON.stringify(byZone), 'static', sp.filter((s) => s.staticIdx !== null).length, 'inView(los)', sp.filter((s) => s.los).length);
  console.log(JSON.stringify(sp.slice(0, 12)));
  // positions now: any zombie inside solid / below ground / on roofs?
  const now = await ev(() => {
    const g = window.game, w = g.world, out = [];
    for (const z of g.zombies.zombies) {
      if (z.dead) continue;
      const ix = Math.floor(z.x), iy = Math.floor(z.y + 0.05), iz = Math.floor(z.z);
      const id0 = w.get(ix, iy, iz), id1 = w.get(ix, iy + 1, iz);
      out.push({ id: z.id, v: z.variant, st: z.state, x: +z.x.toFixed(1), y: +z.y.toFixed(2), z: +z.z.toFixed(1), d: +(z.distP || 0).toFixed(0), solid: !!(window.__SOLID[id0] || window.__SOLID[id1]), b0: id0, b1: id1, roof: w.roofY(ix, iz), stuck: +z.stuckT.toFixed(1) });
    }
    return out;
  });
  console.log('alive now', now.length, 'inSolid', JSON.stringify(now.filter((z) => z.solid).slice(0, 10)));
  console.log('states sample', JSON.stringify(now.slice(0, 20)));
  await shot('spawn');
  report();
  await browser.close();
})();
