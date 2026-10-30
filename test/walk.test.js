import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { Body } from '../src/physics/body.js';
import { Shape } from '../src/physics/shapes.js';
import { Sandbox } from '../src/game/sandbox.js';

function scene(seed = 1, settle = 1) {
  const sb = new Sandbox({ rng: makeRng(seed) });
  const person = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  run(sb, settle);
  return { sb, person };
}

function run(sb, seconds, cb) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    sb.step(1 / 60);
    sb.drainFx();
    if (cb && cb(i) === false) return;
  }
}

test('surfaceAt finds the top of a fixed prop, and the floor beside it', () => {
  const sb = new Sandbox({ rng: makeRng(1) });
  sb.addObstacle('step', new Vec3(2, 0, 0), 0);
  assert.ok(Math.abs(sb.world.surfaceAt(2, 0) - 0.18) < 0.005);
  assert.equal(sb.world.surfaceAt(4, 0), 0);
  // queried from below the top (a foot beside the platform) it is not the surface under the foot
  assert.equal(sb.world.surfaceAt(2, 0, 0.1), 0);
});

test('a body resting on a fixed prop is supported like on the floor (contact, load, no creep)', () => {
  const sb = new Sandbox({ rng: makeRng(1) });
  sb.addObstacle('step', new Vec3(0, 0, 0), 0);
  const b = new Body();
  b.addShape(Shape.box(0.1, 0.03, 0.12, { radius: 0.01, friction: 0.8 }));
  b.setMassFromShapes(1);
  b.setPose(new Vec3(0.05, 0.25, 0), b.rot);
  sb.world.addBody(b);
  run(sb, 1.5);
  const x0 = b.pos.x;
  // a sideways force below the friction limit must not make it creep
  for (let i = 0; i < 120; i++) {
    b.force.x += 4;
    sb.step(1 / 60);
  }
  assert.ok(b.groundContact, 'on the prop it reports ground contact');
  assert.ok(b.groundImpulse > 0.5 * 9.81 / 60, 'and carries its weight there');
  assert.ok(Math.abs(b.pos.y - (0.18 + 0.04)) < 0.01, `rests on top (y ${b.pos.y.toFixed(3)})`);
  assert.ok(Math.abs(b.pos.x - x0) < 0.003, `held by static friction (moved ${(b.pos.x - x0).toFixed(4)} m)`);
});

test('routes go around a crate but straight over a kerb', () => {
  const sb = new Sandbox({ rng: makeRng(1) });
  sb.addObstacle('crate', new Vec3(0, 0, 3), 0);
  sb.nav.rebuild(sb.obstacleVersion);
  const around = sb.nav.findPath(new Vec3(0, 0, 0), new Vec3(0, 0, 6));
  assert.ok(around && around.length >= 2, 'a detour has a corner');
  assert.ok(around.some((p) => Math.abs(p.x) > 0.6), 'and passes beside the crate');
  sb.clearObstacles();
  sb.addObstacle('curb', new Vec3(0, 0, 3), 0);
  sb.nav.rebuild(sb.obstacleVersion);
  const over = sb.nav.findPath(new Vec3(0, 0, 0), new Vec3(0, 0, 6));
  assert.equal(over.length, 1, 'a kerb is simply stepped over');
});

test('walks to a point 5 m away and stops there, without falling', () => {
  const { sb, person } = scene(1);
  const path = sb.walkTo(person, new Vec3(1, 0, 5));
  assert.ok(path, 'route found');
  let fell = false, steps = 0;
  run(sb, 14, () => {
    for (const e of person.ctl.events) {
      if (e.type === 'mode' && e.to === 'falling') fell = true;
      if (e.type === 'step') steps++;
    }
    if (person.ctl.nav.done) return false;
  });
  const p = person.rd.pelvis.pos;
  assert.equal(fell, false);
  assert.equal(person.ctl.nav.status, 'arrived');
  assert.ok(Math.hypot(p.x - 1, p.z - 5) < 0.6, `ends near the goal (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.ok(steps >= 6, `by stepping (${steps} steps)`);
});

test('walking turns round toward a goal behind and keeps the balance', () => {
  const { sb, person } = scene(2);
  sb.walkTo(person, new Vec3(-2.5, 0, -2.5));
  let fell = false;
  run(sb, 16, () => {
    for (const e of person.ctl.events) if (e.type === 'mode' && e.to === 'falling') fell = true;
    if (person.ctl.nav.done) return false;
  });
  assert.equal(fell, false);
  assert.equal(person.ctl.nav.status, 'arrived');
});
