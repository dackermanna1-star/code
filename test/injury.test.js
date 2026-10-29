import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { Sandbox } from '../src/game/sandbox.js';
import { raycastPeople } from '../src/game/weapons.js';

const segNames = new Ragdoll(new World()).segList.map((s) => s.name);
const shape = new BodyShape(segNames);

function scene(seed = 1) {
  const sb = new Sandbox({ shape, rng: makeRng(seed) });
  const person = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  for (let i = 0; i < 30; i++) sb.step(1 / 60);
  return { sb, person };
}

function shootAt(sb, person, weapon, seg, from = [0.02, 0, 4]) {
  const target = person.rd.segments[seg].body.pos.clone();
  const o = new Vec3(target.x + from[0], target.y + from[1], target.z + from[2]);
  return sb.fire(weapon, o, target.clone().sub(o).normalize());
}

function run(sb, seconds) {
  for (let i = 0; i < seconds * 60; i++) {
    sb.step(1 / 60);
    sb.drainFx();
  }
}

function finite(person) {
  return person.rd.allBodies().every((b) => b.pos.isFinite() && b.rot.isFinite() && b.vel.isFinite());
}

test('bullets hit the visible skin, not the collider: entry on the surface of the sculpt', () => {
  const { sb, person } = scene();
  const head = person.rd.segments.head.body.pos;
  const o = new Vec3(head.x, head.y, 3);
  const hits = raycastPeople(sb.people, shape, o, new Vec3(0, 0, -1), 10);
  const h = hits.filter((x) => x.seg.name === 'head').sort((a, b) => a.tIn - b.tIn)[0];
  assert.ok(h, 'ray through the head must hit it');
  // face front is ~9-10 cm ahead of the head centre in the sculpt
  const zEntry = 3 - h.tIn;
  assert.ok(zEntry > head.z + 0.06 && zEntry < head.z + 0.13, `entry z ${zEntry}`);
  assert.ok(h.tOut - h.tIn > 0.15 && h.tOut - h.tIn < 0.24, `head depth ${h.tOut - h.tIn}`);
});

test('a rifle round through the brain is immediately fatal and the body goes limp', () => {
  const { sb, person } = scene();
  shootAt(sb, person, 'rifle', 'head');
  run(sb, 0.1);
  assert.equal(person.injury.alive, false);
  assert.match(person.injury.deathCause, /brain/);
  run(sb, 2.5);
  assert.equal(person.ctl.mode, 'dead');
  assert.ok(person.rd.pelvis.pos.y < 0.45, 'body collapsed');
  assert.ok(finite(person));
});

test('a femur shot breaks the bone into two bodies, the leg gives way and the simulation stays stable', () => {
  const { sb, person } = scene(3);
  shootAt(sb, person, 'sniper', 'thighL', [0.0, 0.05, 4]);
  run(sb, 0.1);
  const seg = person.rd.segments.thighL;
  assert.ok(seg.fractured, 'femur fractured');
  assert.equal(person.rd.extraBodies.length, 1);
  assert.ok(person.ctl.legStrength.L < 0.1);
  run(sb, 3);
  assert.ok(person.rd.pelvis.pos.y < 0.5, 'fell');
  assert.ok(finite(person));
  // the knee is still attached to the distal fragment
  const knee = person.rd.joints.kneeL;
  assert.equal(knee.parent, seg.fractured.extra[0]);
  const pa = knee.parent.localToWorld(knee.anchorP, new Vec3());
  const pc = knee.child.localToWorld(knee.anchorC, new Vec3());
  assert.ok(pa.distanceTo(pc) < 0.01, 'knee joint holds after the fracture');
});

test('bleeding drains blood volume with blood-pressure-dependent rate; pressure and clotting slow it', () => {
  const { sb, person } = scene(5);
  shootAt(sb, person, 'pistol', 'thighR', [0.0, 0.02, 4]);
  run(sb, 0.2);
  const inj = person.injury;
  assert.ok(inj.wounds.length >= 1);
  const v0 = inj.blood;
  run(sb, 10);
  assert.ok(inj.blood < v0, 'lost blood');
  assert.ok(inj.lostExternal > 0);
  // physiology reacts: heart rate up
  assert.ok(inj.hr > 85, `hr ${inj.hr}`);
});

test('a heart wound causes loss of consciousness within seconds', () => {
  const { sb, person } = scene(2);
  // aim at the heart
  const chest = person.rd.segments.chest.body;
  const heart = chest.localToWorld(new Vec3(0.018, 1.29, 0.006).sub(person.rd.segments.chest.bindPos), new Vec3());
  const o = new Vec3(heart.x + 0.01, heart.y, heart.z + 4);
  sb.fire('pistol', o, heart.clone().sub(o).normalize());
  run(sb, 0.1);
  assert.ok(person.injury.cardiac < 0.5, 'heart damaged');
  let t = 0;
  while (person.injury.conscious && t < 40) {
    run(sb, 0.5);
    t += 0.5;
  }
  assert.ok(t < 30, `unconscious after ${t}s`);
});

test('thrown objects cause blunt trauma scaled by mass and speed', () => {
  // a football to the face is harmless, a baseball at 32 m/s concusses
  const results = {};
  for (const type of ['soccerBall', 'baseball']) {
    const { sb, person } = scene(7);
    const head = person.rd.segments.head.body.pos;
    const o = new Vec3(head.x, head.y + 0.05, 3);
    sb.throwObject(type, o, head.clone().sub(o).normalize());
    run(sb, 1);
    results[type] = person.injury;
  }
  assert.equal(results.soccerBall.koTimer, 0);
  assert.ok(results.soccerBall.concussion < 0.2);
  assert.ok(results.baseball.concussion > 0.2, `baseball concussion ${results.baseball.concussion}`);
});

// ------------------------------------------------------------------------------------------------
// Lethality and physiology guarantees. Shots are fired at a standing dummy; long time spans then run
// the physiology alone (no physics), which is what decides survival and is much faster.

/** Fire along the segment's own axes at an anatomical point (bind-pose coordinates). */
function shootBind(sb, person, weapon, seg, bindPt, from = [0, 0, 1]) {
  const s = person.rd.segments[seg];
  const t = s.body.localToWorld(new Vec3(...bindPt).sub(s.bindPos), new Vec3());
  const o = t.clone().add(s.body.localDirToWorld(new Vec3(...from), new Vec3()));
  return sb.fire(weapon, o, t.clone().sub(o).normalize());
}

/** Physiology only for `seconds`; returns the time of death (or null) and a few samples. */
function physiology(person, seconds, each) {
  const inj = person.injury;
  for (let i = 0; i < seconds * 60; i++) {
    inj.update(1 / 60);
    inj.events.length = 0;
    if (each) each(i / 60, inj);
    if (!inj.alive) return i / 60;
  }
  return null;
}

test('a magazine emptied into the body kills within 30 s (it does not stay unconscious)', () => {
  const { sb, person } = scene(4);
  const segs = ['chest', 'abdomen', 'pelvis', 'thighL', 'thighR', 'upperArmL', 'upperArmR'];
  for (let i = 0; i < 20; i++) {
    shootAt(sb, person, 'smg', segs[i % 7], [((i * 41) % 11) / 30 - 0.18, ((i * 29) % 9) / 60 - 0.12, 4]);
    run(sb, 1 / 30);
  }
  assert.ok(!person.injury.structSev.brain && !person.injury.structSev.brainstem, 'no head hits in this volley');
  const t = physiology(person, 60);
  assert.ok(t !== null && t < 30, `dead after ${t} s`);
  assert.doesNotMatch(person.injury.deathCause, /brain/);
});

test('cardiac arrest becomes clinical death after a short agonal phase with gasps and no pulse', () => {
  const { sb, person } = scene(2);
  shootBind(sb, person, 'pistol', 'chest', [0.0, 1.36, -0.03]); // aorta
  run(sb, 0.2);
  const inj = person.injury;
  let gasp = 0, arrestAt = null, sawNoPulse = false;
  const t = physiology(person, 120, (time, s) => {
    if (s.arrestTime >= 0 && s.alive) {
      if (arrestAt === null) arrestAt = time;
      gasp = Math.max(gasp, person.ctl.respiration);
      const v = s.vitals();
      sawNoPulse = sawNoPulse || (v.hr === 0 && v.spo2 === null && v.status === 'cardiac arrest');
    }
  });
  assert.ok(arrestAt !== null, 'circulation stopped');
  assert.ok(t !== null && t - arrestAt < 12, `death ${t} s, arrest ${arrestAt} s`);
  assert.ok(gasp > 0.8, `agonal gasp depth ${gasp}`);
  assert.ok(sawNoPulse, 'pulseless vitals during the agonal phase');
  assert.match(inj.deathCause, /exsanguination|heart|fibrillation/);
});

test('a severed femoral artery: compensated shock first, then decompensation and death within minutes', () => {
  const { sb, person } = scene(3);
  shootBind(sb, person, 'pistol', 'thighL', [0.075, 0.75, 0.022]);
  run(sb, 0.2);
  const inj = person.injury;
  assert.ok(inj.structSev['femoral artery L'] > 0.9, 'femoral artery hit');
  let map30 = 0, hr30 = 0;
  const t = physiology(person, 300, (time, s) => {
    if (Math.abs(time - 30) < 1e-3) {
      map30 = s.mapF;
      hr30 = s.hr;
    }
  });
  // class II at 30 s: pressure maintained by tachycardia and vasoconstriction
  assert.ok(map30 > 65 && hr30 > 115, `MAP ${map30.toFixed(0)} HR ${hr30.toFixed(0)} at 30 s`);
  // bleeding does not stall at low pressure: the spiral ends in arrest
  assert.ok(t !== null && t > 60 && t < 240, `dead after ${t} s`);
  assert.match(inj.deathCause, /exsanguination/);
  assert.ok(inj.blood < 3300, `blood left ${inj.blood.toFixed(0)}`);
});

test('single non-vital wounds are survivable for minutes', () => {
  for (const [seg, pt] of [['upperArmR', null], ['thighL', [0.135, 0.72, 0.02]]]) {
    const { sb, person } = scene(3);
    if (pt) shootBind(sb, person, 'pistol', seg, pt);
    else shootAt(sb, person, 'pistol', seg, [0.03, 0.05, 4]);
    run(sb, 0.5);
    const t = physiology(person, 300);
    assert.equal(t, null, `${seg} wound killed after ${t} s`);
    assert.ok(person.injury.blood > 4300, `${seg}: blood ${person.injury.blood.toFixed(0)}`);
    assert.ok(person.injury.vitals().iss < 16, 'not a major trauma');
  }
});

test('high cervical cord injury: apnoea, desaturation over minutes, hypoxic arrest', () => {
  const { sb, person } = scene(3);
  shootBind(sb, person, 'pistol', 'neck', [0, 1.575, -0.045], [0, 0, -1]); // from behind
  run(sb, 0.2);
  const inj = person.injury;
  assert.equal(inj.spinal, 'C1');
  assert.equal(inj.breathing, 0);
  let sat30 = 1, sat120 = 1;
  const t = physiology(person, 300, (time, s) => {
    if (Math.abs(time - 30) < 1e-3) sat30 = s.spo2;
    if (Math.abs(time - 120) < 1e-3) sat120 = s.spo2;
  });
  assert.ok(sat30 > 0.9, `oxygen stores last: SpO2 ${sat30.toFixed(2)} at 30 s`);
  assert.ok(sat120 < 0.75, `then desaturates: SpO2 ${sat120.toFixed(2)} at 120 s`);
  assert.ok(t !== null && t < 240, `dead after ${t} s`);
  assert.match(inj.deathCause, /respiratory/);
});

test('face, jaw and scalp-graze shots are not fatal; a channel through the brain is', () => {
  for (const [pt, from] of [[[0, 1.61, 0.055], [1.5, 0, 0.15]], [[0, 1.778, -0.015], [1.5, 0, 0]]]) {
    const { sb, person } = scene(3);
    shootBind(sb, person, 'pistol', 'head', pt, from);
    run(sb, 0.2);
    assert.ok(person.injury.alive, `${pt}: ${person.injury.deathCause}`);
    assert.equal(physiology(person, 240), null);
  }
  const { sb, person } = scene(3);
  shootBind(sb, person, 'pistol', 'head', [0, 1.7, 0.0], [0, 0, 1]);
  run(sb, 0.1);
  assert.equal(person.injury.alive, false);
  assert.match(person.injury.deathCause, /brain/);
  assert.ok(person.injury.vitals().iss >= 25, 'penetrating brain injury is AIS 5+');
});

test('repeated hits on one vessel do not multiply its bleeding; total bleeding never exceeds cardiac output', () => {
  const { sb, person } = scene(2);
  for (let i = 0; i < 4; i++) shootBind(sb, person, 'pistol', 'chest', [0.0, 1.36, -0.03]);
  const inj = person.injury;
  let aorta = 0;
  for (const w of inj.wounds) for (const b of w.bleeds || []) if (/aort/.test(b.label)) aorta += b.q;
  assert.ok(aorta > 0 && aorta <= 120 + 110 + 1e-6, `aortic bleeding ${aorta}`);
  for (let i = 0; i < 120; i++) {
    inj.update(1 / 60);
    assert.ok(inj.bleedRate <= Math.max(inj.co, 5000 / 60) * 1.05, `bleed ${inj.bleedRate} > CO ${inj.co}`);
  }
});

test('an ordinary fall after a shove does not break the forearm or hand', () => {
  let broken = 0;
  for (const seed of [1, 2]) {
    const { sb, person } = scene(seed);
    const chest = person.rd.segments.chest.body;
    sb.shove(chest, chest.pos.clone(), new Vec3(0, 0, -160), 0.15);
    run(sb, 5);
    broken += person.injury.fractures.filter((f) => /hand|forearm|radius/.test(f.seg + f.label)).length;
    // the back of the head may strike the floor (concussion), but this is not major trauma
    assert.ok(person.injury.alive && person.injury.vitals().iss < 16, `ISS ${person.injury.vitals().iss}`);
  }
  assert.equal(broken, 0);
});
