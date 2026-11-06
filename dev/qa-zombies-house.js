// ---- setup
const g = window.game, w = g.world, B = window.__B, BL = window.__BLOCKS;
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
g.world.zombieSpawns.forEach((s, i) => g.zombies.staticState.set(i, 0));
window.qa.setTime(12);
const { FACING_DIR, IS_DOOR } = await import('/src/world/blocks.js');
// find closed house doors near the suburbs with a roofed side and an open side
const found = [];
for (const d of w.doors.values()) {
  if (found.length > 40) break;
  if (d.open || d.locked || !(d.kind === 'door_wood' || d.kind === 'door_white')) continue;
  const z = w.getZone(d.x, d.z);
  if (z !== 3) continue;
  const [fx, , fz] = FACING_DIR[d.facing];
  const a = [d.x + fx * 2, d.z + fz * 2], b = [d.x - fx * 2, d.z - fz * 2];
  const ra = w.roofY(a[0], a[1]) > d.y + 2, rb = w.roofY(b[0], b[1]) > d.y + 2;
  if (ra === rb) continue;
  const inside = ra ? [fx, fz] : [-fx, -fz];
  // inside cell must be free floor, outside 12 blocks must be open ground
  const ix = d.x + inside[0] * 2, iz = d.z + inside[1] * 2;
  if (window.__SOLID[w.get(ix, d.y, iz)] || window.__SOLID[w.get(ix, d.y + 1, iz)]) continue;
  const ox = d.x - inside[0] * 12, oz = d.z - inside[1] * 12;
  if (w.roofY(ox, oz) > d.y) continue;
  found.push({ d, inside, ix, iz, ox, oz });
}
window.qa.houses = found;
return found.length + ' doors; first ' + JSON.stringify(found.slice(0, 3).map((f) => [f.d.x, f.d.y, f.d.z, f.d.kind, f.inside]));
// ---- house-gunshot (player inside, 3 walkers outside hear a gunshot)
const g = window.game, w = g.world;
const runOne = (k) => {
  const f = window.qa.houses[k];
  g.zombies.clearAll(); window.qa.hits = 0;
  const d = f.d;
  if (!w.getDoor(d.x, d.y, d.z)) return { k, skipped: 'door gone' };
  window.qa.tp(f.ix + 0.5, d.y, f.iz + 0.5, 0, 0);
  const zs = [];
  for (let i = 0; i < 3; i++) {
    const x = f.ox + (i - 1) * 2 + 0.5, z = f.oz + 0.5;
    const y = window.qa.ground(x, z, d.y + 3);
    if (y > 0) zs.push(g.zombies.spawn(x, y, z, { variant: 'walker' }));
  }
  g.noise(g.player.x, g.player.y + 1.5, g.player.z, 60, 'gunshot', true);
  let firstHit = null, doorBroken = null, entered = null;
  const states = {};
  window.qa.sim(70, 1 / 30, (t) => {
    for (const z of zs) states[z.state] = (states[z.state] || 0) + 1;
    if (doorBroken === null && !w.getDoor(d.x, d.y, d.z)) doorBroken = +t.toFixed(1);
    if (entered === null && zs.some((z) => w.roofY(Math.floor(z.x), Math.floor(z.z)) > z.y + 2)) entered = +t.toFixed(1);
    if (firstHit === null && window.qa.hits) { firstHit = +t.toFixed(1); return false; }
  });
  return { k, door: [d.x, d.y, d.z], doorHp: d.hp.toFixed(0), doorBroken, entered, firstHit, states, zs: zs.map((z) => z.state + '@' + Math.hypot(z.x - g.player.x, z.z - g.player.z).toFixed(1) + ' stuck' + z.stuckT.toFixed(1)) };
};
const out = [];
for (let k = 0; k < Math.min(5, window.qa.houses.length); k++) out.push(runOne(k));
return out;
// ---- house-quiet (player inside, crouched and quiet; zombies wander outside: should not break in)
const g = window.game, w = g.world;
const f = window.qa.houses[6] || window.qa.houses[0];
g.zombies.clearAll(); window.qa.hits = 0;
const d = f.d;
window.qa.tp(f.ix + 0.5, d.y, f.iz + 0.5, 0, 0);
const zs = [];
for (let i = 0; i < 6; i++) {
  const x = f.ox + (i - 3) * 2 + 0.5, z = f.oz + 0.5 + (i % 2) * 3;
  const y = window.qa.ground(x, z, d.y + 3);
  if (y > 0) zs.push(g.zombies.spawn(x, y, z, { variant: 'walker' }));
}
const states = {};
window.qa.sim(90, 1 / 30, (t) => { for (const z of zs) states[z.state] = (states[z.state] || 0) + 1; });
return { doorIntact: !!w.getDoor(d.x, d.y, d.z), doorHp: w.getDoor(d.x, d.y, d.z)?.hp, hits: window.qa.hits, states };
