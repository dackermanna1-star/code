import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/physics/world.js';
import { Body } from '../src/physics/body.js';
import { Shape } from '../src/physics/shapes.js';
import { Joint, DRIVE_RELATIVE } from '../src/physics/joints.js';
import { Vec3, Quat } from '../src/physics/math.js';

function makeBody(shape, mass, pos, rot = new Quat()) {
  const b = new Body();
  b.addShape(shape);
  b.setMassFromShapes(mass);
  b.setPose(pos, rot);
  return b;
}

function run(world, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) world.step(dt);
}

test('sphere falls and rests on the ground', () => {
  const w = new World();
  const b = w.addBody(makeBody(Shape.sphere(0.1), 1, new Vec3(0, 2, 0)));
  run(w, 3);
  assert.ok(Math.abs(b.pos.y - 0.1) < 0.005, `y=${b.pos.y}`);
  assert.ok(b.vel.length() < 0.05);
});

test('box rests flat without jitter', () => {
  const w = new World();
  const q = new Quat().setFromEuler(0.3, 0.2, 0.1);
  const b = w.addBody(makeBody(Shape.box(0.2, 0.1, 0.15), 5, new Vec3(0, 1, 0), q));
  run(w, 4);
  assert.ok(Math.abs(b.pos.y - 0.1) < 0.006, `y=${b.pos.y}`);
  assert.ok(b.vel.length() < 0.02, `v=${b.vel.length()}`);
  assert.ok(b.angVel.length() < 0.05, `w=${b.angVel.length()}`);
});

test('capsule rests on its side', () => {
  const w = new World();
  const q = new Quat().setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2 + 0.2);
  const b = w.addBody(makeBody(Shape.capsule(0.05, 0.2), 2, new Vec3(0, 0.6, 0), q));
  run(w, 4);
  assert.ok(Math.abs(b.pos.y - 0.05) < 0.005, `y=${b.pos.y}`);
  assert.ok(b.vel.length() < 0.02);
});

test('box stack of 4 stays stable', () => {
  const w = new World();
  const boxes = [];
  for (let i = 0; i < 4; i++) {
    boxes.push(w.addBody(makeBody(Shape.box(0.25, 0.25, 0.25), 10, new Vec3(0.01 * i, 0.25 + i * 0.505, 0))));
  }
  run(w, 5);
  for (let i = 0; i < 4; i++) {
    const b = boxes[i];
    assert.ok(Math.abs(b.pos.y - (0.25 + i * 0.5)) < 0.03, `box ${i} y=${b.pos.y}`);
    assert.ok(Math.abs(b.pos.x - 0.01 * i) < 0.05, `box ${i} x=${b.pos.x}`);
  }
});

test('sphere on rounded box and box on box contacts', () => {
  const w = new World();
  const base = w.addBody(makeBody(Shape.box(0.3, 0.1, 0.3, { radius: 0.02 }), 20, new Vec3(0, 0.12, 0)));
  const top = w.addBody(makeBody(Shape.box(0.1, 0.1, 0.1), 2, new Vec3(0.05, 0.6, 0)));
  const ball = w.addBody(makeBody(Shape.sphere(0.05), 0.5, new Vec3(-0.15, 0.8, 0.1)));
  run(w, 4);
  assert.ok(Math.abs(base.pos.y - 0.12) < 0.01, `base y=${base.pos.y}`);
  assert.ok(Math.abs(top.pos.y - (0.24 + 0.1)) < 0.015, `top y=${top.pos.y}`);
  assert.ok(ball.pos.y > 0.04);
});

test('pendulum chain keeps joints attached', () => {
  const w = new World();
  const anchor = new Body();
  anchor.addShape(Shape.sphere(0.02));
  anchor.setMassFromShapes(1);
  anchor.setPose(new Vec3(0, 3, 0), new Quat());
  anchor.makeStatic();
  w.addBody(anchor);
  let prev = anchor;
  const links = [];
  for (let i = 0; i < 8; i++) {
    const b = makeBody(Shape.capsule(0.03, 0.1), 1 + i * 0.5, new Vec3(0.125 + i * 0.25, 3, 0), new Quat().setFromAxisAngle(new Vec3(0, 0, 1), -Math.PI / 2));
    w.addBody(b);
    const j = new Joint(prev, b, {
      anchorP: prev === anchor ? new Vec3(0, 0, 0) : new Vec3(0, 0.125, 0),
      anchorC: new Vec3(0, -0.125, 0),
    });
    w.addJoint(j);
    b.ignore = new Set([prev]);
    links.push(b);
    prev = b;
  }
  let maxSep = 0;
  for (let i = 0; i < 300; i++) {
    w.step(1 / 60);
    for (const j of w.joints) {
      const pa = j.parent.localToWorld(j.anchorP, new Vec3());
      const pc = j.child.localToWorld(j.anchorC, new Vec3());
      maxSep = Math.max(maxSep, pa.distanceTo(pc));
    }
  }
  assert.ok(maxSep < 0.01, `max joint separation ${maxSep}`);
  for (const b of links) assert.ok(b.pos.isFinite());
});

test('drive holds a horizontal arm against gravity', () => {
  const w = new World();
  const base = new Body();
  base.addShape(Shape.box(0.1, 0.1, 0.1));
  base.setMassFromShapes(10);
  base.setPose(new Vec3(0, 1, 0), new Quat());
  base.makeStatic();
  w.addBody(base);
  const arm = makeBody(Shape.capsule(0.04, 0.15), 2, new Vec3(0.3, 1, 0), new Quat().setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2));
  w.addBody(arm);
  arm.ignore = new Set([base]);
  const j = new Joint(base, arm, { anchorP: new Vec3(0.1, 0, 0), anchorC: new Vec3(0, 0.2, 0) });
  // target relative rotation = initial
  const rel = new Quat().multiplyConjA(base.rot, arm.rot);
  j.setDrive(DRIVE_RELATIVE, rel, 500, 10, 200);
  w.addJoint(j);
  run(w, 3);
  const cur = new Quat().multiplyConjA(base.rot, arm.rot);
  const err = new Quat().multiplyConjB(cur, rel).angle();
  // expected static sag ~ torque/k = 2*9.81*0.2/500 = 0.0078 rad
  assert.ok(err < 0.03, `angle error ${err}`);
});

test('swing-twist limit stops a hanging link', () => {
  const w = new World();
  const base = new Body();
  base.addShape(Shape.box(0.1, 0.1, 0.1));
  base.setMassFromShapes(10);
  base.setPose(new Vec3(0, 2, 0), new Quat());
  base.makeStatic();
  w.addBody(base);
  // link hangs down along -Y; start it horizontal so it swings
  const link = makeBody(Shape.capsule(0.04, 0.2), 2, new Vec3(0, 1.65, 0));
  w.addBody(link);
  link.ignore = new Set([base]);
  const j = new Joint(base, link, {
    anchorP: new Vec3(0, -0.1, 0),
    anchorC: new Vec3(0, 0.25, 0),
    limits: { twist: [-0.2, 0.2], swingX: [-0.5, 0.5], swingZ: [-0.5, 0.5], mode: 'ellipse' },
  });
  w.addJoint(j);
  link.angVel.set(0, 0, 8); // kick it
  let maxAngle = 0;
  for (let i = 0; i < 200; i++) {
    w.step(1 / 60);
    const rel = new Quat().multiplyConjA(base.rot, link.rot);
    maxAngle = Math.max(maxAngle, rel.angle());
  }
  assert.ok(maxAngle < 0.56, `max swing ${maxAngle}`);
});

test('raycast hits capsule, sphere, rounded box with correct entry/exit', () => {
  const w = new World();
  const cap = w.addBody(makeBody(Shape.capsule(0.05, 0.2), 1, new Vec3(0, 1, 0)));
  const sph = w.addBody(makeBody(Shape.sphere(0.1), 1, new Vec3(0, 1, 2)));
  const box = w.addBody(makeBody(Shape.box(0.1, 0.1, 0.1, { radius: 0.02 }), 1, new Vec3(0, 1, 4)));
  const hits = w.raycastAll(new Vec3(0, 1, -2), new Vec3(0, 0, 1), 10);
  assert.equal(hits.length, 3);
  assert.equal(hits[0].body, cap);
  assert.ok(Math.abs(hits[0].tIn - 1.95) < 1e-4);
  assert.ok(Math.abs(hits[0].tOut - 2.05) < 1e-4);
  assert.equal(hits[1].body, sph);
  assert.ok(Math.abs(hits[1].tIn - 3.9) < 1e-4);
  assert.equal(hits[2].body, box);
  assert.ok(Math.abs(hits[2].tIn - 5.88) < 1e-3, `box tIn ${hits[2].tIn}`);
  assert.ok(Math.abs(hits[2].tOut - 6.12) < 1e-3, `box tOut ${hits[2].tOut}`);
  assert.ok(hits[2].normal.z < -0.99);
});

test('thrown ball transfers momentum to a hanging block', () => {
  const w = new World({ gravity: 0 });
  const block = w.addBody(makeBody(Shape.box(0.2, 0.2, 0.2), 10, new Vec3(0, 1, 0)));
  const ball = w.addBody(makeBody(Shape.sphere(0.05), 1, new Vec3(-1, 1, 0)));
  ball.vel.set(20, 0, 0);
  run(w, 0.5);
  const p = block.vel.x * 10 + ball.vel.x * 1;
  assert.ok(Math.abs(p - 20) < 0.5, `momentum ${p}`);
  assert.ok(block.vel.x > 1.0, `block v ${block.vel.x}`);
});
