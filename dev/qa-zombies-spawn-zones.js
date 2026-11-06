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
  window.qa.spawns.push({ d, inSolid, b: inSolid ? [0, 1].map((dy) => window.__BLOCKS[w.get(ix, iy + dy, iz)].name).join('+') + ':' + y.toFixed(2) : null, staticIdx: o.staticIdx ?? null, zone: w.getZone(x, z), los: window.__los(w, P.x, P.y + P.eye, P.z, x, y + 1.6, z) });
  return zb;
};
window.qa.findZone = (zone, x0 = 512, z0 = 512) => {
  for (let r = 0; r < 500; r += 4) for (let a = 0; a < 6.28; a += 0.3) {
    const x = Math.floor(x0 + Math.cos(a) * r), z = Math.floor(z0 + Math.sin(a) * r);
    if (x < 50 || z < 50 || x > 970 || z > 970) continue;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) if (w.getZone(x + Math.cos(k) * 40, z + Math.sin(k) * 40) !== zone) ok = false;
    if (ok && w.getZone(x, z) === zone) return [x + 0.5, z + 0.5];
  }
  return null;
};
window.qa.runSpawn = (x, z, hour, secs) => {
  const y = window.qa.ground(x, z, 40);
  window.qa.tp(x, y, z, 0, 0);
  window.qa.setTime(hour);
  mgr.clearAll(); mgr.staticState.clear(); window.qa.spawns = [];
  mgr.densityT = 0;
  const attempts = { n: 0, ok: 0 };
  const ot = mgr.trySpawnAround.bind(mgr);
  mgr.trySpawnAround = () => { attempts.n++; const r = ot(); if (r) attempts.ok++; return r; };
  window.qa.sim(secs, 1 / 20);
  mgr.trySpawnAround = ot;
  const sp = window.qa.spawns;
  return { pos: [x, y, z], zone: w.getZone(x, z), ld: +mgr.localDensity.toFixed(2), attempts, spawns: sp.length, static: sp.filter((s) => s.staticIdx !== null).length, alive: mgr.zombies.filter((z) => !z.dead).length, inSolid: sp.filter((s) => s.inSolid).map((s) => s.b + (s.staticIdx !== null ? '(static)' : '')), seen: sp.filter((s) => s.los && s.d < 50 && s.staticIdx === null).length };
};
return 'ok';
// ---- camp-start
return window.qa.runSpawn(192.5, 180.5, 12, 40);
// ---- forest
const p = window.qa.findZone(1); return p && window.qa.runSpawn(p[0], p[1], 12, 40);
// ---- farm
const p = window.qa.findZone(2); return p && window.qa.runSpawn(p[0], p[1], 12, 40);
// ---- suburb
const p = window.qa.findZone(3); return p && window.qa.runSpawn(p[0], p[1], 12, 40);
// ---- wild-night
const p = window.qa.findZone(0); return p && window.qa.runSpawn(p[0], p[1], 23, 40);
