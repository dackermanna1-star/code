import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { Sandbox } from '../src/game/sandbox.js';
import { layDown, getUpTracker } from '../tools/bench/lying.mjs';

function lying(kind, seed = 1, yaw = 0) {
  const sb = new Sandbox({ rng: makeRng(seed) });
  const person = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  layDown(person, kind, yaw);
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

/** Fore-aft and sideways distance between the feet in the heading frame. */
function stance(person) {
  const ctl = person.ctl, h = ctl.heading;
  const L = ctl.soleCenter('L', new Vec3()), R = ctl.soleCenter('R', new Vec3());
  const dx = R.x - L.x, dz = R.z - L.z;
  return { fore: dx * Math.sin(h) + dz * Math.cos(h), width: Math.abs(dx * Math.cos(h) - dz * Math.sin(h)) };
}

test('lying face down, an uninjured dummy gets up through hands and knees, half kneel, rise and step-up', () => {
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
  for (const ph of ['push', 'quad', 'kneel', 'lunge', 'rise', 'stepup']) assert.ok(s.phases.some((p) => p.startsWith(ph)), `no ${ph} phase`);
  assert.ok(s.standAt > 0, 'never stood for a second');
  assert.ok(maxPelvis > 0.8, `pelvis only reached ${maxPelvis.toFixed(2)} m`);
  // physics-driven: the helpers stay small (net external force a few percent of body weight on
  // average, net external torque well below what the muscles produce)
  assert.ok(s.helperF < 0.05, `helper force ${(100 * s.helperF).toFixed(1)}% of body weight`);
  assert.ok(s.helperT < 80, `helper torque ${s.helperT.toFixed(0)} N*m`);
});

test('the get-up ends standing in a normal stance (back foot stepped up), not a split stance, and stays up', () => {
  const { sb, person } = lying('prone', 2, 1.3);
  let handOver = null, fell = false;
  run(sb, 16, () => {
    const ctl = person.ctl;
    for (const e of ctl.events) if (e.type === 'mode' && e.from === 'getup' && e.to === 'balance' && !handOver) handOver = stance(person);
    if (handOver && ctl.mode === 'falling') fell = true;
  });
  assert.ok(handOver, 'never handed over to standing balance');
  assert.ok(Math.abs(handOver.fore) < 0.2, `feet ${handOver.fore.toFixed(2)} m apart front to back at the hand-over`);
  assert.ok(handOver.width > 0.1 && handOver.width < 0.4, `stance width ${handOver.width.toFixed(2)} m`);
  assert.equal(fell, false, 'fell after standing up');
  assert.equal(person.ctl.mode, 'balance');
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

test('with a broken forearm the dummy gets up on its other arm at the first attempt, the broken one held in', () => {
  const { sb, person } = lying('prone', 3);
  run(sb, 0.05);
  person.injury.breakLongBone(person.rd.segments.forearmL, 0.5, false);
  const tr = getUpTracker(person, 2);
  let leaned = false;
  run(sb, 16, (t) => {
    tr.tick(t);
    const g = person.ctl.gu;
    // the broken arm is never used as a support
    if (person.ctl.mode === 'getup' && g && (g.useArm.L || (g.hand.L && g.hand.L.planted))) leaned = true;
  });
  const s = tr.summary();
  assert.ok(finite(person));
  assert.equal(leaned, false, 'leaned on the broken arm');
  assert.equal(s.firstOk, true, `first attempt failed: ${s.phases.join(' ')}`);
  assert.ok(s.standAt > 0, 'never stood');
});

test('a get-up that is knocked over mid-rise falls protectively (bracing), it does not just collapse', () => {
  const { sb, person } = lying('prone', 1);
  let shoved = false, toppled = null;
  run(sb, 12, () => {
    const ctl = person.ctl;
    if (!shoved && ctl.mode === 'getup' && ctl.gu && ctl.gu.phase === 'rise' && ctl.gu.t > 0.5) {
      const ch = person.rd.segments.chest.body;
      sb.shove(ch, ch.pos.clone(), new Vec3(Math.cos(ctl.gu.psi) * 120, 0, -Math.sin(ctl.gu.psi) * 120), 0.15);
      shoved = true;
    }
    for (const e of ctl.events) if (e.type === 'getupFail' && toppled === null) toppled = { reason: e.reason, mode: null };
    if (toppled && toppled.mode === null) toppled.mode = ctl.mode;
  });
  assert.ok(shoved, 'never got to the rise');
  assert.ok(toppled, 'the shove did not end the attempt');
  assert.equal(toppled.mode, 'falling', `went to ${toppled.mode} (${toppled.reason}) instead of a protective fall`);
  assert.ok(finite(person));
});

test('with a broken femur the dummy does not get up, and in pain it turns onto the uninjured side', () => {
  const { sb, person } = lying('supine', 4);
  run(sb, 0.05);
  person.injury.breakLongBone(person.rd.segments.thighL, 0.5, false);
  let triedUp = false, onSide = 0, painful = 0;
  run(sb, 14, () => {
    if (person.ctl.mode === 'getup') triedUp = true;
    // while it hurts badly: on the right side (left, broken leg up), roll angle near +pi/2
    if (person.ctl.pain > 0.45) {
      painful++;
      const phi = rollAngle(person);
      if (phi > 0.7 && phi < 2.3) onSide++;
    }
  });
  assert.ok(finite(person));
  assert.equal(triedUp, false);
  assert.equal(person.ctl.mode, 'ground');
  assert.ok(painful > 60, 'the broken femur never hurt');
  assert.ok(onSide > 0.3 * painful, `on the uninjured side for only ${onSide} of ${painful} painful frames`);
});
