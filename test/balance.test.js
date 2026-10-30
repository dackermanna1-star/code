import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { DRIVE_RELATIVE } from '../src/physics/joints.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { Sandbox } from '../src/game/sandbox.js';

let skin = null; // visible-skin SDF for ballistics (built on demand)

function scene(seed = 1, settle = 1, shape = null) {
  const sb = new Sandbox({ rng: makeRng(seed), shape });
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

function shove(sb, person, x, z, J) {
  const chest = person.rd.segments.chest.body;
  sb.shove(chest, chest.pos.clone(), new Vec3(x, 0, z).normalize().scale(J), 0.15);
}

test('a resting articulated body reports no phantom solver velocities', () => {
  // ragdoll standing rigidly on stiff bind-pose drives: nothing moves, so the bodies' velocities
  // must be ~0 (a single Gauss-Seidel pass left a 600 Hz limit cycle reporting ~0.25 rad/s)
  const w = new World();
  const rd = new Ragdoll(w, { position: new Vec3(0, 0, 0) });
  rd.addToWorld();
  for (const j of rd.jointList) {
    const def = j.userData.def;
    j.driveMode = DRIVE_RELATIVE;
    j.target.identity();
    j.stiffness = def.k * 3;
    j.damping = def.d * Math.sqrt(3);
    j.maxTorque = def.tmax * 3;
  }
  let acc = 0, n = 0;
  for (let f = 0; f < 60; f++) {
    w.step(1 / 60);
    if (f < 30) continue;
    for (const b of rd.bodies) acc += b.angVel.lengthSq();
    n += rd.bodies.length;
  }
  const rms = Math.sqrt(acc / n);
  assert.ok(rms < 0.05, `phantom angular velocity ${rms.toFixed(3)} rad/s`);
});

test('quiet standing is stable but alive: small irregular sway, no jitter, no slip', () => {
  const { sb, person } = scene(2, 2);
  const ctl = person.ctl;
  const c0 = ctl.sens.com.clone();
  const feet0 = ['L', 'R'].map((s) => person.rd.segments['foot' + s].body.pos.clone());
  let sway = 0, n = 0, jit = 0, fell = false, steps = 0;
  run(sb, 8, () => {
    const c = ctl.sens.com;
    sway += (c.x - c0.x) ** 2 + (c.z - c0.z) ** 2;
    n++;
    for (const b of person.rd.bodies) jit += b.angVel.lengthSq();
    steps += ctl.events.filter((e) => e.type === 'step').length;
    if (ctl.mode !== 'balance') fell = true;
  });
  const swayMm = 1000 * Math.sqrt(sway / n);
  const jitter = Math.sqrt(jit / n / person.rd.bodies.length);
  const slip = Math.max(...['L', 'R'].map((s, i) => person.rd.segments['foot' + s].body.pos.distanceTo(feet0[i])));
  assert.equal(fell, false);
  assert.equal(steps, 0, 'no stepping while standing quietly');
  assert.ok(swayMm > 1 && swayMm < 10, `postural sway ${swayMm.toFixed(1)} mm RMS`);
  assert.ok(jitter < 0.05, `angular jitter ${jitter.toFixed(3)} rad/s`);
  assert.ok(slip < 0.002, `foot slip ${slip}`);
});

test('moderate pushes from all sides are recovered with a few steps, without stepping trauma', () => {
  for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const { sb, person } = scene(1);
    shove(sb, person, x, z, 45);
    let fell = false, steps = 0;
    run(sb, 5, () => {
      steps += person.ctl.events.filter((e) => e.type === 'step').length;
      if (person.ctl.mode !== 'balance') fell = true;
    });
    assert.equal(fell, false, `fell after a 45 N*s push (${x},${z})`);
    assert.ok(steps >= 1 && steps <= 8, `steps ${steps} for push (${x},${z})`);
    // footfalls are locomotion, not blunt trauma
    const footHurt = person.injury.wounds.some((w) => w.seg.name.startsWith('foot'));
    assert.equal(footHurt, false, 'stepping bruised a foot');
  }
});

test('light thrown objects are absorbed standing', () => {
  for (const [type, seg, speed] of [['soccerBall', 'chest', 24], ['brick', 'abdomen', 14], ['pipe', 'chest', 12]]) {
    const { sb, person } = scene(2);
    const t = person.rd.segments[seg].body.pos.clone();
    const o = new Vec3(t.x - 0.2, t.y + 0.1, 3.2);
    sb.throwObject(type, o, t.clone().sub(o).normalize(), speed);
    let fell = false;
    run(sb, 4, () => {
      const m = person.ctl.mode;
      if (m === 'falling' || m === 'ground') fell = true;
    });
    assert.equal(fell, false, `${type} to the ${seg} knocked the dummy down`);
  }
});

test('legs giving way: the dummy drops to its knees with the trunk upright before going down', () => {
  const { sb, person } = scene(1);
  const inj = person.injury;
  let kneelHead = -1, sawLegsFall = false, t = 0;
  run(sb, 6, () => {
    t += 1 / 60;
    const m = Math.min(1, t / 1.5);
    for (const s of ['L', 'R']) {
      inj.muscle['thigh' + s] = m;
      inj.muscle['shin' + s] = m;
    }
    const ctl = person.ctl;
    if (ctl.mode === 'falling' && ctl.fallCause === 'legs') sawLegsFall = true;
    const sg = person.rd.segments;
    const knees = sg.thighL.body.groundContact || sg.thighR.body.groundContact || sg.shinL.body.groundContact || sg.shinR.body.groundContact;
    if (kneelHead < 0 && knees && !sg.chest.body.groundContact) kneelHead = ctl.sens.headH;
  });
  assert.ok(sawLegsFall, 'weak legs should start a fall-to-knees');
  assert.ok(kneelHead > 1.0, `knees reached the floor with the head at ${kneelHead.toFixed(2)} m`);
  assert.equal(person.ctl.mode === 'balance', false);
});

test('catch-fall: a hard shove forward lands on the hands, not the face', () => {
  const { sb, person } = scene(1);
  shove(sb, person, 0, 1, 180);
  const head = person.rd.segments.head.body, chest = person.rd.segments.chest.body;
  const hands = ['handL', 'handR', 'forearmL', 'forearmR'].map((n) => person.rd.segments[n].body);
  let first = null, headV = 0;
  run(sb, 3, () => {
    for (const imp of sb.world.impactList) {
      if (imp.bodyB) continue;
      if (first === null && (imp.bodyA === head || imp.bodyA === chest)) first = 'trunk';
      if (first === null && hands.includes(imp.bodyA)) first = 'hands';
      if (imp.bodyA === head) headV = Math.max(headV, imp.speed);
    }
  });
  assert.equal(first, 'hands');
  assert.ok(headV < 2, `head hit the floor at ${headV.toFixed(2)} m/s`);
  assert.ok(person.injury.conscious, 'knocked out by a braced fall');
});

/** Run and report the fastest head-floor impact, whether it was knocked out, and the modes seen. */
function watchFall(sb, person, seconds, perFrame) {
  const head = person.rd.segments.head.body;
  let headV = 0;
  const modes = new Set();
  run(sb, seconds, (i) => {
    if (perFrame) perFrame(i / 60);
    for (const imp of sb.world.impactList) if (!imp.bodyB && imp.bodyA === head) headV = Math.max(headV, imp.speed);
    modes.add(person.ctl.mode);
  });
  const ko = person.injury.injuries.some((l) => /Knocked/.test(l.text));
  return { headV, ko, modes };
}

function setLegMuscle(person, m) {
  for (const s of ['L', 'R']) {
    person.injury.muscle['thigh' + s] = m;
    person.injury.muscle['shin' + s] = m;
  }
}

test('a momentary leg buckle is caught: the knees dip, the body stays up', () => {
  const { sb, person } = scene(1);
  let knees = false;
  const r = watchFall(sb, person, 3, (t) => {
    setLegMuscle(person, t < 0.15 ? 1 : 0);
    const sg = person.rd.segments;
    if (sg.shinL.body.groundContact || sg.shinR.body.groundContact) knees = true;
  });
  assert.ok(r.modes.has('falling'), 'the legs should give way');
  assert.equal(knees, false, 'a 0.15 s buckle should not put the knees on the floor');
  assert.equal(person.ctl.mode, 'balance');
});

test('legs lost for a second: down on the knees and the hands, no face-first head strike', () => {
  for (const seed of [1, 2]) {
    const { sb, person } = scene(seed);
    const r = watchFall(sb, person, 8, (t) => setLegMuscle(person, t < 1 ? 1 : 0));
    assert.ok(r.headV < 2, `head hit the floor at ${r.headV.toFixed(2)} m/s`);
    assert.equal(r.ko, false, 'knocked out by a fall to the knees');
  }
});

test('partly damaged legs: kneel, then a controlled descent onto the hands and the floor', () => {
  for (const m of [0.6, 0.7]) {
    const { sb, person } = scene(1);
    const sg = person.rd.segments;
    let handsFirst = null;
    const r = watchFall(sb, person, 9, () => {
      setLegMuscle(person, m);
      const hands = sg.handL.body.groundContact || sg.handR.body.groundContact;
      const trunk = sg.chest.body.groundContact || sg.head.body.groundContact;
      if (handsFirst === null && (hands || trunk)) handsFirst = hands && !trunk;
    });
    assert.equal(handsFirst, true, `muscle damage ${m}: the hands should reach the floor before the chest or face`);
    assert.ok(r.headV < 2, `head hit the floor at ${r.headV.toFixed(2)} m/s`);
    assert.equal(r.ko, false);
  }
});

test('rifle shot to the abdomen off the midline: no knock-out from the fall that follows', () => {
  skin = skin || new BodyShape(new Ragdoll(new World()).segList.map((s) => s.name));
  for (const dx of [-0.05, 0.05]) {
    const { sb, person } = scene(1, 1, skin);
    const t = person.rd.segments.abdomen.body.pos.clone();
    t.x += dx;
    const o = new Vec3(t.x, t.y + 0.02, t.z + 4);
    sb.fire('rifle', o, t.clone().sub(o).normalize());
    const r = watchFall(sb, person, 8);
    assert.ok(r.headV < 2, `head hit the floor at ${r.headV.toFixed(2)} m/s (dx ${dx})`);
    assert.equal(r.ko, false, `knocked out after a gut shot (dx ${dx})`);
  }
});

test('a dead body on the floor comes to rest (no creeping across the floor)', () => {
  for (const [x, z] of [[0, -1], [1, 0]]) {
    const { sb, person } = scene(1);
    shove(sb, person, x, z, 120);
    person.injury.kill('test');
    run(sb, 20);
    const p0 = person.rd.segList.map((s) => s.body.pos.clone());
    run(sb, 30);
    const d = person.rd.segList.map((s, i) => s.body.pos.distanceTo(p0[i]));
    const pel = d[person.rd.segList.indexOf(person.rd.segments.pelvis)];
    assert.ok(pel < 0.01, `pelvis crept ${(pel * 1000).toFixed(1)} mm in 30 s (push ${x},${z})`);
    assert.ok(Math.max(...d) < 0.03, `a segment crept ${(Math.max(...d) * 1000).toFixed(1)} mm in 30 s (push ${x},${z})`);
  }
});

test('settle steps never lift a foot that still carries the body', () => {
  const { sb, person } = scene(1);
  shove(sb, person, 1, 0, 60);
  const ctl = person.ctl;
  const c = new Vec3();
  let steps = 0, worst = 0;
  run(sb, 7, () => {
    for (const e of ctl.events) {
      if (e.type !== 'step') continue;
      steps++;
      if (e.kind !== 'settle') continue;
      ctl.soleCenter(e.foot === 'L' ? 'R' : 'L', c);
      worst = Math.max(worst, Math.hypot(ctl.sens.com.x - c.x, ctl.sens.com.z - c.z));
    }
  });
  assert.equal(ctl.mode, 'balance');
  assert.ok(worst < 0.05, `settle step taken with the COM ${(worst * 100).toFixed(1)} cm from the stance foot`);
  assert.ok(steps <= 9, `${steps} steps to recover from a 60 N*s side push`);
});
