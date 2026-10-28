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
