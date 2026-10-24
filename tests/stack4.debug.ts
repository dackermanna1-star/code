import { World } from '../src/world/world';
import { Physics, SOLVER } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
const N = +(process.argv[2] || 2);
SOLVER.iterations = +(process.argv[3] || 30);
const fric = +(process.argv[4] ?? 0.6);
SOLVER.warm = process.argv[5] !== 'nowarm';
SOLVER.maxPerBucket = +(process.argv[6] || 4);
if (process.argv[7]) SOLVER.warmFriction = process.argv[7] === '1';
if (process.argv[8]) SOLVER.warmScale = +process.argv[8];
if (process.argv[9]) SOLVER.baumgarte = +process.argv[9];
const w = new World(512, 256, 512, 40); w.initTerrain();
const ph = new Physics(w);
const bs: Body[] = [];
for (let i = 0; i < N; i++) {
  const b = new Body(8, 5, 8, new Uint8Array(320).fill(P.crate)); b.computeMass(); b.buildSamples(); b.friction = fric;
  b.pos.set(20, 4.25 + i * 0.5 + 0.001, 20); ph.add(b); bs.push(b);
}
let maxAng = 0;
for (let s = 0; s < 120; s++) { ph.step(1 / 60); for (const b of bs) maxAng = Math.max(maxAng, b.ang.len()); }
console.log(`N=${N} it=${SOLVER.iterations} fric=${fric} maxAng=${maxAng.toFixed(3)} top=${bs[N - 1].pos.y.toFixed(3)} sleeping=${bs.filter((b) => b.sleeping).length}`);
