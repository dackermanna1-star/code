import { World } from '../src/world/world';
import { Physics } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
const w = new World(512, 256, 512, 40); w.initTerrain();
const ph = new Physics(w);
const bs: Body[] = [];
const N = +(process.argv[2] || 3);
for (let i = 0; i < N; i++) {
  const b = new Body(8, 5, 8, new Uint8Array(320).fill(P.crate)); b.computeMass(); b.buildSamples();
  b.pos.set(20, 4.25 + i * 0.5 + 0.01, 20); ph.add(b); bs.push(b);
}
console.log('samples', bs[0].nSamples, 'mass', bs[0].mass.toFixed(1));
for (let s = 0; s < 240; s++) {
  ph.step(1 / 60);
  if (s % 20 === 0 || s < 5) console.log(s, ph.stats.contacts, bs.map((b) => `(${b.pos.x.toFixed(3)},${b.pos.y.toFixed(3)},${b.vel.len().toFixed(2)},${b.ang.len().toFixed(2)}${b.sleeping ? 'z' : ''})`).join(' '));
}
