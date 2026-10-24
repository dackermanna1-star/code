import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.ts';
import { Heightfield } from '../src/sim/terrain.ts';
import { SoftBodyBuilder, SoftBody } from '../src/sim/softbody.ts';
import { Collider } from '../src/sim/colliders.ts';
import { mat3FromYaw } from '../src/sim/math.ts';

function flatWorld(): World {
  const w = new World();
  const t = new Heightfield(65, 65, 4, -128, -128);
  w.terrain = t;
  return w;
}

function makeBox(size = 1, mass = 80, k = 2e5, c = 60): SoftBody {
  const b = new SoftBodyBuilder();
  b.addPart('box');
  const h = size / 2;
  const ids: number[] = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) ids.push(b.addNode(x, y, z, { mass: mass / 8 }));
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) b.addBeam(ids[i], ids[j], { k, c });
  // faces
  const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  for (const q of f) b.addQuad(ids[q[0]], ids[q[1]], ids[q[2]], ids[q[3]]);
  return b.build();
}

test('box falls and rests on terrain', () => {
  const w = flatWorld();
  const box = makeBox();
  box.place(mat3FromYaw(0.3), 0, 3, 0);
  w.addBody(box);
  for (let i = 0; i < 2000 * 3; i++) w.substep();
  box.computeBounds();
  assert.ok(Math.abs(box.min[1]) < 0.01, `min y ${box.min[1]}`);
  assert.ok(box.maxSpeed < 0.05, `speed ${box.maxSpeed}`);
  assert.ok(!box.unstable);
});

test('box slides to a stop and stacks on a static box collider', () => {
  const w = flatWorld();
  const plat = Collider.box(2, 0.5, 2).setPosition(0, 0.5, 0);
  w.addStatic(plat);
  const box = makeBox();
  box.place(mat3FromYaw(0), 0, 2.5, 0, 0, 0, 0);
  w.addBody(box);
  for (let i = 0; i < 2000 * 3; i++) w.substep();
  box.computeBounds();
  assert.ok(Math.abs(box.min[1] - 1.0) < 0.02, `rests on platform at y=${box.min[1]}`);
});

test('two boxes collide via node-triangle contacts', () => {
  const w = flatWorld();
  const a = makeBox();
  const b = makeBox();
  a.place(mat3FromYaw(0), -2, 0.5, 0, 6, 0, 0);
  b.place(mat3FromYaw(0), 2, 0.5, 0, -6, 0, 0);
  w.addBody(a);
  w.addBody(b);
  for (let i = 0; i < 2000 * 2; i++) w.substep();
  a.computeBounds();
  b.computeBounds();
  // they must not interpenetrate deeply
  assert.ok(a.max[0] < b.min[0] + 0.25, `a.max ${a.max[0]} b.min ${b.min[0]}`);
});

test('beam yields plastically under heavy impact', () => {
  const w = flatWorld();
  const wall = Collider.box(0.5, 2, 3).setPosition(3, 2, 0);
  w.addStatic(wall);
  const b = makeBox(1, 80, 2e5, 60);
  for (let i = 0; i < b.m; i++) {
    b.bYC[i] = b.bYC0[i] = 4000;
    b.bYT[i] = b.bYT0[i] = 4000;
  }
  b.place(mat3FromYaw(0), 0, 0.5, 0, 20, 0, 0);
  w.addBody(b);
  for (let i = 0; i < 2000 * 1; i++) w.substep();
  let deformed = 0;
  for (let i = 0; i < b.m; i++) if (b.beamStrain(i) > 0.02) deformed++;
  assert.ok(deformed > 0, 'some beams deformed');
  assert.ok(b.deformEnergy > 100, `energy ${b.deformEnergy}`);
});

test('a resting stack falls asleep and a moving box wakes it', () => {
  const w = flatWorld();
  const boxes: SoftBody[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c <= 2 - r; c++) {
      const b = makeBox();
      b.canSleep = true;
      b.place(mat3FromYaw(0), c * 1.05 + r * 0.525, 0.5 + r * 1.01, 0);
      w.addBody(b);
      boxes.push(b);
    }
  }
  for (let i = 0; i < 2000 * 4; i++) w.substep();
  assert.ok(boxes.every((b) => b.sleeping), `asleep: ${boxes.map((b) => b.sleeping).join(',')}`);
  const hit = makeBox();
  hit.place(mat3FromYaw(0), -4, 0.5, 0, 8, 0, 0);
  w.addBody(hit);
  for (let i = 0; i < 2000 * 1; i++) w.substep();
  assert.ok(!boxes[0].sleeping, 'struck box woke up');
  boxes[0].computeBounds();
  // 80 kg at 8 m/s shoves the whole 480 kg pile a few centimetres against ground friction
  assert.ok(boxes[0].min[0] > -0.5 + 0.03, `struck box moved: min x ${boxes[0].min[0]}`);
});

test('a sleeping box is woken by a slow, firm push', () => {
  const w = flatWorld();
  const box = makeBox();
  box.canSleep = true;
  box.place(mat3FromYaw(0), 0, 0.5, 0);
  w.addBody(box);
  for (let i = 0; i < 2000 * 2; i++) w.substep();
  assert.ok(box.sleeping);
  // a heavy pusher starting at rest right next to it, driven by a steady force
  const pusher = makeBox(1, 400, 1e6, 300);
  pusher.place(mat3FromYaw(0), -1.04, 0.5, 0);
  w.addBody(pusher);
  for (let i = 0; i < 2000 * 2; i++) {
    for (let n = 0; n < pusher.n; n++) pusher.frc[n * 3] = 0;
    w.substep();
    for (let n = 0; n < pusher.n; n++) pusher.vel[n * 3] += (3000 / 400) / 2000;
  }
  box.computeBounds();
  assert.ok(box.min[0] > 0, `pushed box moved: min x ${box.min[0]}`);
});

test('flat sheets of beams settle instead of fluttering', () => {
  // a 5x5 grid of nodes joined by in-plane beams: the middle node can only be
  // held out of plane by the plate damper
  const b = new SoftBodyBuilder();
  b.addPart('sheet');
  const id = (i: number, j: number) => i * 5 + j;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) b.addNode(i * 0.5, 1, j * 0.5, { mass: 1.5, fixed: i === 0 || i === 4 || j === 0 || j === 4 });
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i < 4) b.addBeam(id(i, j), id(i + 1, j), { k: 3e5, c: 80 });
      if (j < 4) b.addBeam(id(i, j), id(i, j + 1), { k: 3e5, c: 80 });
      if (i < 4 && j < 4) b.addBeam(id(i, j), id(i + 1, j + 1), { k: 3e5, c: 80 });
    }
  }
  const sheet = b.build();
  assert.ok(sheet.pdNode.length >= 9, `plate dampers ${sheet.pdNode.length}`);
  const w = new World();
  w.addBody(sheet);
  const mid = id(2, 2);
  sheet.vel[mid * 3 + 1] = 1;
  for (let i = 0; i < 2000; i++) w.substep();
  const vy = Math.abs(sheet.vel[mid * 3 + 1]);
  assert.ok(vy < 0.05, `middle node still moving at ${vy} m/s after 1 s`);
});

test('bodies spawned on a slope are lifted clear of the ground', () => {
  const w = new World();
  const t = new Heightfield(65, 65, 4, -128, -128);
  for (let j = 0; j < 65; j++) for (let i = 0; i < 65; i++) t.heights[j * 65 + i] = (i - 32) * 4 * 0.15;
  w.terrain = t;
  const long = makeBox(3, 1600, 5e6, 1000);
  long.place(mat3FromYaw(0), 0, t.heightAt(0, 0) + 1.5, 0);
  w.liftClear(long);
  for (let n = 0; n < long.n; n++) assert.ok(long.pos[n * 3 + 1] >= t.heightAt(long.pos[n * 3], long.pos[n * 3 + 2]));
  w.addBody(long);
  let peak = 0;
  for (let i = 0; i < 2000; i++) {
    w.substep();
    peak = Math.max(peak, long.kineticEnergy());
  }
  assert.ok(peak < 1600 * 9.81 * 0.5, `peak kinetic energy ${peak.toFixed(0)} J`);
});
