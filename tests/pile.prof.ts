import { World } from '../src/world/world';
import { Physics } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
import { Rng } from '../src/engine/math';
const w = new World(512, 256, 512, 40); w.initTerrain();
const ph = new Physics(w);
const rng = new Rng(3);
for (let i = 0; i < 120; i++) {
  const sx = rng.int(2, 10), sy = rng.int(2, 8), sz = rng.int(2, 10);
  const b = new Body(sx, sy, sz, new Uint8Array(sx * sy * sz).fill(rng.pick([P.crate, P.concrete, P.brick, P.steel])));
  b.computeMass(); b.buildSamples();
  b.pos.set(20 + rng.range(-2, 2), 6 + i * 0.4, 20 + rng.range(-2, 2));
  b.rot.setAxisAngle(0.2, 0.9, 0.3, rng.range(0, 6)).normalize();
  ph.add(b);
}
const t0 = performance.now();
for (let i = 0; i < 60 * 8; i++) ph.step(1 / 60);
console.log('total', (performance.now() - t0).toFixed(0), 'ms; samples avg', (ph.bodies.reduce((a, b) => a + b.nSamples, 0) / ph.bodies.length).toFixed(0));
