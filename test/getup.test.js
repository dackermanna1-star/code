import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { Sandbox } from '../src/game/sandbox.js';
import { layDown, getUpTracker } from '../tools/bench/lying.mjs';

function lying(kind, seed = 1) {
  const sb = new Sandbox({ rng: makeRng(seed) });
  const person = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  layDown(person, kind, 0);
  return { sb, person };
}

function run(sb, seconds, cb) {
  for (let i = 0; i < seconds * 60; i++) {
    sb.step(1 / 60);
    sb.drainFx();
    if (cb && cb(i / 60) === false) return;
  }
}

function finite(person) {
  return person.rd.allBodies().every((b) => b.pos.isFinite() && b.rot.isFinite() && b.vel.isFinite());
}

/** Roll angle about the trunk's long axis: 0 face down, +-pi face up, +-pi/2 on a side. */
function rollAngle(person) {
  const ch = person.rd.segments.chest.body;
  const f = ch.localDirToWorld(new Vec3(0, 0, 1), new Vec3()), l = ch.localDirToWorld(new Vec3(1, 0, 0), new Vec3());
  return Math.atan2(l.y, -f.y);
}

test('lying face down, an uninjured dummy gets up through hands and knees, half kneel and rise', () => {
  const { sb, person } = lying('prone');
  const tr = getUpTracker(person, 1);
  let maxPelvis = 0;
  run(sb, 14, (t) => {
    tr.tick(t);
    if (person.ctl.mode === 'balance') maxPelvis = Math.max(maxPelvis, person.rd.pelvis.pos.y);
  });
  const s = tr.summary();
  assert.ok(finite(person));
  assert.equal(s.firstOk, true, `first attempt failed: ${s.phases.join(' ')}`);
  for (const ph of ['push', 'quad', 'kneel', 'lunge', 'rise']) assert.ok(s.phases.some((p) => p.startsWith(ph)), `no ${ph} phase`);
  assert.ok(s.standAt > 0, 'never stood for a second');
  assert.ok(maxPelvis > 0.8, `pelvis only reached ${maxPelvis.toFixed(2)} m`);
  // physics-driven: the helper forces stay small (a few percent of body weight on average)
  assert.ok(s.helperFrac < 0.05, `helper ${(100 * s.helperFrac).toFixed(1)}% of body weight`);
});

test('lying face up, the dummy rolls over onto its front before pushing up', () => {
  const { sb, person } = lying('supine');
  const tr = getUpTracker(person);
  let prone = false;
  run(sb, 7, (t) => {
    tr.tick(t);
    if (person.ctl.mode === 'getup' && person.ctl.gu.phase === 'push') {
      prone = Math.abs(rollAngle(person)) < 0.8;
      return false;
    }
  });
  assert.ok(tr.summary().phases[0].startsWith('roll'), 'did not start with a roll');
  assert.ok(prone, 'not face down when the push-up started');
});

test('with a broken femur the dummy does not get up, and in pain it turns onto the uninjured side', () => {
  const { sb, person } = lying('supine', 4);
  run(sb, 0.05);
  person.injury.breakLongBone(person.rd.segments.thighL, 0.5, false);
  let triedUp = false;
  run(sb, 14, () => {
    if (person.ctl.mode === 'getup') triedUp = true;
  });
  assert.ok(finite(person));
  assert.equal(triedUp, false);
  assert.equal(person.ctl.mode, 'ground');
  // on the right side (left, broken leg up): roll angle near +pi/2
  const phi = rollAngle(person);
  assert.ok(person.ctl.pain < 0.5 || (phi > 0.7 && phi < 2.3), `roll angle ${phi.toFixed(2)} with pain ${person.ctl.pain.toFixed(2)}`);
});
