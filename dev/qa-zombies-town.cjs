// QA: spawning in town (day / night), placement validity, static spawn activation, zombie update cost.
// Usage: node dev/qa-zombies-town.cjs [port] [poiMatch] [hour] [seconds]
const { boot } = require('./qa-zombies-lib.cjs');
const port = process.argv[2] || 5302;
const match = process.argv[3] || 'downtown';
const hour = +(process.argv[4] || 12);
const secs = +(process.argv[5] || 30);
(async () => {
  const { browser, page, ev, shot, settle, report } = await boot({ port });
  await ev(async () => {
    const { SOLID } = await import('/src/world/blocks.js');
    const { lineOfSight } = await import('/src/world/raycast.js');
    window.__SOLID = SOLID; window.__los = lineOfSight;
  });
  const pois = await ev(() => window.game.world.pois.map((q) => ({ name: q.name, type: q.type, x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2 })));
  const q = pois.find((q) => q.name.toLowerCase().includes(match)) || pois.find((q) => q.type === match);
  console.log('POI', JSON.stringify(q));
  await ev(([x, z, h]) => {
    const g = window.game, w = g.world;
    // find a road / ground cell near the POI centre
    let best = null;
    for (let r = 0; r < 30 && !best; r++) for (let dx = -r; dx <= r && !best; dx++) for (let dz = -r; dz <= r && !best; dz++) {
      const ix = Math.floor(x + dx), iz = Math.floor(z + dz);
      const top = w.roofY(ix, iz);
      if (top <= 22 && window.__SOLID[w.get(ix, top, iz)]) best = [ix + 0.5, top + 1, iz + 0.5];
    }
    window.qa.tp(best[0], best[1], best[2], 0, 0);
    window.qa.setTime(h);
    window.qa.god(true);
    g.zombies.clearAll();
    g.zombies.staticState.clear();
  }, [q.x, q.z, hour]);
  await settle(3000);
  await ev(() => {
    const g = window.game, mgr = g.zombies;
    window.qa.spawns = [];
    const orig = mgr.spawn.bind(mgr);
    mgr.spawn = (x, y, z, o = {}) => {
      const zb = orig(x, y, z, o);
      const P = g.player, w = g.world;
      const ix = Math.floor(x), iz = Math.floor(z), iy = Math.floor(y);
      const inSolid = [0, 1].some((dy) => window.__SOLID[w.get(ix, iy + dy, iz)]);
      const d = Math.hypot(x - P.x, z - P.z);
      const roofed = w.roofY(ix, iz) > iy + 1;
      window.qa.spawns.push({ x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), d: +d.toFixed(1), inSolid, roofed, below: w.get(ix, iy - 1, iz), below2: w.get(ix, iy - 2, iz), staticIdx: o.staticIdx ?? null, variant: zb.variant, zone: w.getZone(x, z), los: window.__los(w, P.x, P.y + P.eye, P.z, x, y + 1.6, z) });
      return zb;
    };
  });
  for (let i = 0; i < secs / 5; i++) {
    await page.waitForTimeout(5000);
    const s = await ev(() => ({ ...window.qa.summary(), zt: (window.qa.zt.sum / Math.max(1, window.qa.zt.n)).toFixed(2), ztMax: window.qa.zt.max.toFixed(1), fps: window.game.fps.toFixed(0), upd: window.game.perf.update.toFixed(1), dens: window.game.zombies.localDensity.toFixed(2), maxA: window.game.zombies.maxActive }));
    console.log('t=' + (i + 1) * 5, JSON.stringify(s));
    await ev(() => { window.qa.zt = { sum: 0, n: 0, max: 0 }; });
  }
  const sp = await ev(() => window.qa.spawns);
  const byZone = {};
  for (const s of sp) byZone[s.zone] = (byZone[s.zone] || 0) + 1;
  console.log('spawns', sp.length, 'static', sp.filter((s) => s.staticIdx !== null).length, 'roofed(indoor)', sp.filter((s) => s.roofed).length, 'byZone', JSON.stringify(byZone));
  const bad = sp.filter((s) => s.inSolid || (s.los && s.d < 45 && s.staticIdx === null));
  console.log('suspicious', bad.length, JSON.stringify(bad.slice(0, 8)));
  const elevated = sp.filter((s) => s.staticIdx === null && s.below2 === 0);
  console.log('elevated (air 2 below)', elevated.length, JSON.stringify(elevated.slice(0, 6)));
  const now = await ev(() => {
    const g = window.game, w = g.world, out = [];
    for (const z of g.zombies.zombies) {
      if (z.dead) continue;
      const ix = Math.floor(z.x), iy = Math.floor(z.y + 0.05), iz = Math.floor(z.z);
      out.push({ id: z.id, v: z.variant, st: z.state, y: +z.y.toFixed(2), d: +(z.distP || 0).toFixed(0), solid: !!(window.__SOLID[w.get(ix, iy, iz)] || window.__SOLID[w.get(ix, iy + 1, iz)]), stuck: +z.stuckT.toFixed(1), lod: z.lod });
    }
    return out;
  });
  console.log('alive', now.length, 'inSolid', JSON.stringify(now.filter((z) => z.solid)));
  const st = {};
  for (const z of now) st[z.st] = (st[z.st] || 0) + 1;
  console.log('states', JSON.stringify(st));
  await shot(`town-${match}-${hour}`);
  report();
  await browser.close();
})();
