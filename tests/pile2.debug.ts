import { World } from '../src/world/world';
import { Physics } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
import { Rng } from '../src/engine/math';
const w = new World(512, 256, 512, 40); w.initTerrain();
const ph = new Physics(w);
const rng = new Rng(3);
for (let i = 0; i < 120; i++) {
  const b = new Body(rng.int(2, 10), rng.int(2, 8), rng.int(2, 10), new Uint8Array(0));
  b.vox = new Uint8Array(b.sx * b.sy * b.sz).fill(rng.pick([P.crate, P.concrete, P.brick, P.steel]));
  b.computeMass(); b.buildSamples();
  b.pos.set(20 + rng.range(-2, 2), 6 + i * 0.4, 20 + rng.range(-2, 2));
  b.rot.setAxisAngle(0.2, 0.9, 0.3, rng.range(0, 6)).normalize();
  ph.add(b);
}
const bad = new Set<number>();
for (let i = 0; i < 60 * 12; i++) {
  ph.step(1 / 60);
  for (const b of ph.bodies) {
    // lowest point of the body: check all voxel corners via aabb min
    if (b.aabb[1] < 3.95 && !bad.has(b.id)) {
      bad.add(b.id);
      console.log('step', i, 'body', b.id, 'dims', b.sx, b.sy, b.sz, 'pos', b.pos.x.toFixed(2), b.pos.y.toFixed(2), b.pos.z.toFixed(2), 'aabbMinY', b.aabb[1].toFixed(3), 'vel', b.vel.len().toFixed(2), 'samples', b.nSamples, 'contacts', b.contacts);
    }
  }
}
for (const b of ph.bodies) if (b.pos.y < 3.9 || !Number.isFinite(b.pos.y)) console.log('FINAL below', b.id, b.sx, b.sy, b.sz, b.pos.x.toFixed(2), b.pos.y.toFixed(2), b.pos.z.toFixed(2), b.sleeping);
const far = ph.bodies.filter((b) => Math.hypot(b.pos.x - 20, b.pos.z - 20) > 8);
console.log('far bodies', far.map((b) => `${b.id}@(${b.pos.x.toFixed(1)},${b.pos.y.toFixed(1)},${b.pos.z.toFixed(1)})`).join(' '));
