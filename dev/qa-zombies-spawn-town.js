// ---- setup
const g = window.game, w = g.world, mgr = g.zombies;
window.qa.god(true);
window.qa.spawns = [];
const orig = mgr.spawn.bind(mgr);
mgr.spawn = (x, y, z, o = {}) => {
  const zb = orig(x, y, z, o);
  const P = g.player;
  const ix = Math.floor(x), iz = Math.floor(z), iy = Math.floor(y);
  const inSolid = [0, 1].some((dy) => window.__SOLID[w.get(ix, iy + dy, iz)]);
  const d = Math.hypot(x - P.x, z - P.z);
  const roofed = w.roofY(ix, iz) > iy + 1;
  window.qa.spawns.push({ x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), d: +d.toFixed(1), inSolid, roofed, b1: w.get(ix, iy - 1, iz), b2: w.get(ix, iy - 2, iz), staticIdx: o.staticIdx ?? null, variant: zb.variant, zone: w.getZone(x, z), los: window.__los(w, P.x, P.y + P.eye, P.z, x, y + 1.6, z) });
  return zb;
};
window.qa.runSpawn = (x, z, hour, secs) => {
  const y = window.qa.ground(x, z, 30);
  window.qa.tp(x, y, z, 0, 0);
  window.qa.setTime(hour);
  mgr.clearAll(); mgr.staticState.clear(); window.qa.spawns = [];
  mgr.densityT = 0;
  const t0 = performance.now();
  window.qa.zt = { sum: 0, n: 0, max: 0 };
  const series = [];
  window.qa.sim(secs, 1 / 20, (t) => { if (Math.abs(t % 10) < 0.049) series.push(window.qa.summary().alive); });
  const sp = window.qa.spawns;
  const byZone = {};
  for (const s of sp) byZone[s.zone] = (byZone[s.zone] || 0) + 1;
  const alive = mgr.zombies.filter((z) => !z.dead);
  const st = {};
  for (const z of alive) st[z.state] = (st[z.state] || 0) + 1;
  return {
    pos: [x, y, z], zone: w.getZone(x, z), ld: +mgr.localDensity.toFixed(2), maxActive: mgr.maxActive, series, spawns: sp.length, static: sp.filter((s) => s.staticIdx !== null).length,
    indoor: sp.filter((s) => s.roofed).length, byZone, inSolid: sp.filter((s) => s.inSolid).length,
    seenAtSpawn: sp.filter((s) => s.los && s.d < 50 && s.staticIdx === null).map((s) => s.d),
    elevated: sp.filter((s) => s.staticIdx === null && !window.__SOLID[s.b2]).slice(0, 5),
    aliveNow: alive.length, states: st, zt: +(window.qa.zt.sum / window.qa.zt.n).toFixed(2), ztMax: +window.qa.zt.max.toFixed(1), wall: Math.round(performance.now() - t0),
  };
};
return 'ok';
// ---- downtown-day
return window.qa.runSpawn(496.5, 512.5, 12, 60);
// ---- downtown-night
return window.qa.runSpawn(496.5, 512.5, 23, 60);
// ---- start-area
const s = window.game.world.spawnPoints;
return { n: s.length, first: s.slice(0, 5) };
