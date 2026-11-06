// ---- setup
const g = window.game, Q = window.qaArena;
const A = Q.setup(44);
window.qa.god(true);
g.noSpawn = true;
g.zombies.clearAll();
window.qa.setTime(12);
Q.wipe(44, 7);
return A;
// ---- crowd-stacking (16 walkers chase a stationary player)
const g = window.game, Q = window.qaArena, P = g.player;
g.zombies.clearAll(); window.qa.hits = 0;
Q.tp(22.5, 0, 30, 0);
const zs = [];
for (let i = 0; i < 16; i++) { const z = Q.z(10 + (i % 8) * 3, 0, 6 + Math.floor(i / 8) * 3, i % 5 === 0 ? 'runner' : 'walker'); z.startChase(false); zs.push(z); }
let minPair = 99, minPairT = 0, overlapFrames = 0, frames = 0;
const px0 = [P.x, P.z];
window.qa.sim(25, 1 / 30, (t) => {
  if (t < 12) return;
  frames++;
  let over = false;
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
    const d = Math.hypot(zs[i].x - zs[j].x, zs[i].z - zs[j].z);
    if (d < minPair) { minPair = d; minPairT = t; }
    if (d < 0.35) over = true;
  }
  if (over) overlapFrames++;
});
const dists = zs.map((z) => Math.hypot(z.x - P.x, z.z - P.z));
return { minPair: +minPair.toFixed(2), minPairT: +minPairT.toFixed(1), overlapPct: +(100 * overlapFrames / frames).toFixed(1), within2: dists.filter((d) => d < 2).length, within4: dists.filter((d) => d < 4).length, hits: window.qa.hits, playerMoved: +Math.hypot(P.x - px0[0], P.z - px0[1]).toFixed(2), states: zs.map((z) => z.state[0]).join('') };
// ---- shot crowd
// ---- ragdoll-wall-stairs
const g = window.game, Q = window.qaArena;
g.zombies.clearAll();
Q.wipe(44, 7);
Q.box(10, 0, 10, 30, 2, 10, 'wall_white');
Q.set(22, 0, 16, 'stairs_wood', 2); Q.set(22, 1, 17, 'stairs_wood', 2); Q.set(22, 0, 17, 'planks_oak');
Q.tp(22.5, 0, 26, 0);
const V = (await import('/src/entities/zombie/ZombieModel.js')) && null;
const zA = Q.z(18.5, 0, 11.4, 'walker'), zB = Q.z(22.5, 0.5, 16.5, 'walker'), zC = Q.z(26.5, 0, 11.5, 'brute');
window.qa.sim(0.3, 1 / 30);
const Vec = zA.visual.root.position.constructor;
zA.takeDamage(999, { part: 'torso', dir: new Vec(0, 0, -1), knockback: 2, force: 3 }); // thrown into the wall
zB.takeDamage(999, { part: 'head', dir: new Vec(0, 0, 1), knockback: 1 });
zC.takeDamage(999, { part: 'torso', dir: new Vec(0, 0, -1), knockback: 2, force: 4 });
const res = {};
const track = { A: zA, B: zB, C: zC };
const hist = { A: [], B: [], C: [] };
let settled = {};
window.qa.sim(9, 1 / 30, (t) => { for (const k in track) { const p = track[k].visual.getBodyPosition(new Vec()); hist[k].push([t, p.x, p.y, p.z]); if (!settled[k] && !track[k].ragdolling) settled[k] = +t.toFixed(2); } });
for (const k in track) {
  const h = hist[k].filter((p) => p[0] > 7);
  let jit = 0; for (const p of h) jit = Math.max(jit, Math.hypot(p[1] - h[0][1], p[2] - h[0][2], p[3] - h[0][3]));
  const last = hist[k][hist[k].length - 1];
  // any particle inside a solid block?
  const rd = track[k].visual.ragdoll;
  let inside = 0;
  if (rd) for (let i = 0; i < rd.pos.length / 3; i++) { if (window.__SOLID[g.world.get(Math.floor(rd.pos[i * 3]), Math.floor(rd.pos[i * 3 + 1]), Math.floor(rd.pos[i * 3 + 2]))]) { const id = g.world.get(Math.floor(rd.pos[i * 3]), Math.floor(rd.pos[i * 3 + 1]), Math.floor(rd.pos[i * 3 + 2])); if (window.__BLOCKS[id].render === 'cube') inside++; } }
  res[k] = { settled: settled[k] ?? null, jitter: +jit.toFixed(4), pel: [+(last[1] - Q.A.x).toFixed(2), +(last[2] - Q.A.y).toFixed(2), +(last[3] - Q.A.z).toFixed(2)], particlesInCubes: inside };
}
Q.tp(22.5, 0, 19, 0); g.player.pitch = -0.5;
return res;
// ---- settle 4000
// ---- shot ragdolls
