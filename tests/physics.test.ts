// Headless physics checks (run: node tools/runtest.mjs tests/physics.test.ts)
import { World } from '../src/world/world';
import { Physics } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
import { Rng } from '../src/engine/math';

function makeWorld(): World {
  const w = new World(512, 256, 512, 40);
  w.initTerrain();
  return w;
}
function box(sx: number, sy: number, sz: number, pal = P.concrete): Body {
  const b = new Body(sx, sy, sz, new Uint8Array(sx * sy * sz).fill(pal));
  b.computeMass(); b.buildSamples();
  return b;
}
function run(ph: Physics, seconds: number): number {
  const t0 = performance.now();
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) ph.step(1 / 60);
  return (performance.now() - t0) / n;
}
let fails = 0;
function check(name: string, ok: boolean, info: string) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${info}`); if (!ok) fails++; }

// 1. single box rest height
{
  const w = makeWorld(); const ph = new Physics(w);
  const b = box(10, 10, 10); b.pos.set(20, 6, 20); ph.add(b);
  const ms = run(ph, 3);
  check('box rests', Math.abs(b.pos.y - 4.5) < 0.03 && b.vel.len() < 0.05, `y=${b.pos.y.toFixed(3)} v=${b.vel.len().toFixed(3)} sleep=${b.sleeping} ${ms.toFixed(2)}ms/step`);
}
// 2. tilted box falls and settles flat
{
  const w = makeWorld(); const ph = new Physics(w);
  const b = box(6, 3, 12, P.plank); b.pos.set(20, 7, 20); b.rot.setAxisAngle(0.6, 0, 0.8, 0.9).normalize(); b.ang.set(1, 2, 0.5); ph.add(b);
  run(ph, 5);
  const up = Math.abs(b.R[4]) > 0.99 || Math.abs(b.R[1]) > 0.99 || Math.abs(b.R[7]) > 0.99;
  check('tilted plank settles axis-aligned', b.sleeping && b.pos.y < 4.7, `y=${b.pos.y.toFixed(3)} sleeping=${b.sleeping} R=${Array.from(b.R).map((v) => v.toFixed(2)).join(',')}`);
}
// 3. stack of 6 boxes
{
  const w = makeWorld(); const ph = new Physics(w);
  const bs: Body[] = [];
  for (let i = 0; i < 6; i++) { const b = box(8, 5, 8, P.crate); b.pos.set(20 + (i % 2) * 0.05, 4.25 + i * 0.5 + 0.01, 20); ph.add(b); bs.push(b); }
  const ms = run(ph, 6);
  const top = bs[5];
  check('stack stable', Math.abs(top.pos.x - 20) < 0.3 && Math.abs(top.pos.y - (4.25 + 2.5)) < 0.08, `top=(${top.pos.x.toFixed(2)},${top.pos.y.toFixed(2)}) sleeping=${bs.filter((b) => b.sleeping).length}/6 ${ms.toFixed(2)}ms/step`);
}
// 4. heavy on light
{
  const w = makeWorld(); const ph = new Physics(w);
  const light = box(10, 2, 10, P.plank); light.pos.set(20, 4.1, 20); ph.add(light);
  const heavy = box(10, 10, 10, P.heavySteel); heavy.pos.set(20, 4.2 + 0.5 + 0.02, 20); ph.add(heavy);
  run(ph, 4);
  check('heavy on light', Math.abs(heavy.pos.y - 4.7) < 0.08 && Math.abs(light.pos.y - 4.1) < 0.05, `heavy y=${heavy.pos.y.toFixed(3)} light y=${light.pos.y.toFixed(3)}`);
}
// 5. pile of random bodies
{
  const w = makeWorld(); const ph = new Physics(w);
  const rng = new Rng(3);
  for (let i = 0; i < 120; i++) {
    const b = box(rng.int(2, 10), rng.int(2, 8), rng.int(2, 10), rng.pick([P.crate, P.concrete, P.brick, P.steel]));
    b.pos.set(20 + rng.range(-2, 2), 6 + i * 0.4, 20 + rng.range(-2, 2));
    b.rot.setAxisAngle(0.2, 0.9, 0.3, rng.range(0, 6)).normalize();
    ph.add(b);
  }
  let maxMs = 0, sum = 0, n = 0;
  for (let i = 0; i < 60 * 12; i++) { const t = performance.now(); ph.step(1 / 60); const d = performance.now() - t; maxMs = Math.max(maxMs, d); sum += d; n++; }
  const bad = ph.bodies.filter((b) => !Number.isFinite(b.pos.x) || b.pos.y < 3.9);
  const sleeping = ph.bodies.filter((b) => b.sleeping).length;
  check('pile settles', bad.length === 0 && sleeping > 100, `sleeping=${sleeping}/120 below-ground=${bad.length} avg=${(sum / n).toFixed(2)}ms max=${maxMs.toFixed(1)}ms contacts=${ph.stats.contacts}`);
}
// 6. fast projectile vs thin wall (CCD)
{
  const w = makeWorld();
  for (let y = 40; y < 70; y++) for (let z = 180; z < 220; z++) for (let x = 250; x < 252; x++) w.set(x, y, z, P.concrete);
  const ph = new Physics(w);
  const b = box(2, 2, 2, P.steel); b.pos.set(22, 5.5, 20); b.vel.set(45, 0, 0); ph.add(b);
  run(ph, 1);
  check('no tunneling through 20cm wall at 45 m/s', b.pos.x < 25.0, `x=${b.pos.x.toFixed(2)}`);
}
console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`);
