// ---- setup
const g = window.game, w = g.world, B = window.__B;
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
g.world.zombieSpawns.forEach((s, i) => g.zombies.staticState.set(i, 0));
window.qa.setTime(12);
const { FACING_DIR } = await import('/src/world/blocks.js');
const { standable } = await import('/src/entities/pathfind.js');
const ST = new Set([B.stairs_wood, B.stairs_concrete]);
// scan a few town areas for indoor staircases (bottom step with floor in front, landing at the top)
const stairs = [];
const areas = [[496, 512, 120], [650, 320, 80], [430, 320, 80]];
for (const [cx, cz, R] of areas) {
  for (let x = cx - R; x < cx + R && stairs.length < 30; x++) for (let z = cz - R; z < cz + R && stairs.length < 30; z++) {
    for (let y = 21; y < 24; y++) {
      const id = w.get(x, y, z);
      if (!ST.has(id)) continue;
      const f = w.getMeta(x, y, z) & 3;
      const [fx, , fz] = FACING_DIR[f];
      // bottom step: the cell in front must be floor-level standable, below must not be a stair
      if (ST.has(w.get(x + fx, y - 1, z + fz)) || !standable(w, x + fx, y, z + fz)) continue;
      if (w.roofY(x, z) <= y + 3) continue;
      // climb
      let cxx = x, cy = y, czz = z, n = 0;
      while (ST.has(w.get(cxx - fx, cy + 1, czz - fz)) && n < 12) { cxx -= fx; cy++; czz -= fz; n++; }
      const lx = cxx - fx, ly = cy + 1, lz = czz - fz;
      if (n < 2 || !standable(w, lx, ly, lz)) continue;
      stairs.push({ bottom: [x + fx, y, z + fz], dir: [-fx, -fz], top: [lx, ly, lz], steps: n + 1 });
    }
  }
}
window.qa.stairs = stairs;
window.qa.standable = standable;
return stairs.length + ' ' + JSON.stringify(stairs.slice(0, 4));
// ---- stairs-chase
const g = window.game, w = g.world;
const out = [];
for (let k = 0; k < Math.min(6, window.qa.stairs.length); k++) {
  const s = window.qa.stairs[k];
  g.zombies.clearAll(); window.qa.hits = 0;
  // player one step beyond the landing
  const [tx, ty, tz] = s.top;
  const px = tx + s.dir[0], pz = tz + s.dir[1];
  const ok = window.qa.ground(px + 0.5, pz + 0.5, ty + 1) === ty;
  window.qa.tp((ok ? px : tx) + 0.5, ty, (ok ? pz : tz) + 0.5, 0, 0);
  const [bx, by, bz] = s.bottom;
  const free = [];
  for (let r = 2; r <= 5 && free.length < 2; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || free.length >= 2) continue;
    const x = bx + dx, z = bz + dz;
    if (window.qa.standable(w, x, by, z) === 1 && window.qa.standable(w, x, by - 1, z) === 0) free.push([x, z]);
  }
  const zs = free.map(([x, z], i) => g.zombies.spawn(x + 0.5, by, z + 0.5, { variant: i === 0 ? 'walker' : k % 2 ? 'crawler' : 'runner' }));
  for (const z of zs) z.startChase(false);
  let firstHit = null, maxY = 0;
  window.qa.sim(40, 1 / 30, (t) => { for (const z of zs) maxY = Math.max(maxY, z.y - by); if (firstHit === null && window.qa.hits) firstHit = +t.toFixed(1); });
  out.push({ k, steps: s.steps, firstHit, hits: window.qa.hits, maxClimb: +maxY.toFixed(2), need: ty - by, zs: zs.map((z) => z.variant + ':' + z.state + ' dy=' + (z.y - by).toFixed(1) + ' d=' + Math.hypot(z.x - g.player.x, z.z - g.player.z).toFixed(1) + ' stuck=' + z.stuckT.toFixed(1)) });
}
return out;
