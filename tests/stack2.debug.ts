import { World } from '../src/world/world';
import { Physics, SOLVER } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
SOLVER.iterations = +(process.argv[2] || 10);
const w = new World(512, 256, 512, 40); w.initTerrain();
const ph = new Physics(w);
const bs: Body[] = [];
for (let i = 0; i < 6; i++) {
  const b = new Body(8, 5, 8, new Uint8Array(320).fill(P.crate)); b.computeMass(); b.buildSamples();
  b.pos.set(20, 4.25 + i * 0.5 + 0.001, 20); ph.add(b); bs.push(b);
}
for (let s = 0; s < 300; s++) {
  SOLVER.warmHits = 0;
  ph.step(1 / 60);
  if (s % 30 === 0) console.log(s, 'contacts', ph.stats.contacts, 'warm', SOLVER.warmHits, bs.map((b) => `${b.ang.len().toFixed(2)}${b.sleeping ? 'z' : ''}`).join(' '), 'top', bs[5].pos.x.toFixed(3), bs[5].pos.y.toFixed(3));
}
