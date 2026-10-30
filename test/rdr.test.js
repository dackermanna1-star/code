import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { Sandbox } from '../src/game/sandbox.js';
import { KillCam } from '../src/modes/killCam.js';

const segNames = new Ragdoll(new World()).segList.map((s) => s.name);
const shape = new BodyShape(segNames);

function standing(seed, reactions) {
  const sb = new Sandbox({ shape, rng: makeRng(seed) });
  sb.setReactions(reactions);
  const p = sb.spawnPerson(new Vec3(0, 0, 0), 0);
  for (let i = 0; i < 60; i++) {
    sb.step(1 / 60);
    sb.drainFx();
  }
  return { sb, p };
}

function headShot(sb, p, weapon = 'rifle') {
  const t = p.rd.segments.head.body.pos.clone();
  const o = new Vec3(t.x + 0.01, t.y + 0.02, t.z + 8);
  sb.fire(weapon, o, t.clone().sub(o).normalize());
}

test('realistic: a round through the brain drops the body at once', () => {
  const { sb, p } = standing(1, 'realistic');
  headShot(sb, p);
  let deadAt = null;
  for (let i = 0; i < 30 && deadAt === null; i++) {
    sb.step(1 / 60);
    sb.drainFx();
    if (p.ctl.mode === 'dead') deadAt = i / 60;
  }
  assert.ok(deadAt !== null && deadAt < 0.1, `limp at ${deadAt}`);
});

test('RDR: head-shot, the body staggers a step or two on dying legs, then drops', () => {
  let stepped = 0;
  for (const seed of [1, 2, 3]) {
    const { sb, p } = standing(seed, 'rdr');
    headShot(sb, p);
    let steps = 0, deadAt = null;
    for (let i = 0; i < 120; i++) {
      sb.step(1 / 60);
      sb.drainFx();
      for (const e of p.ctl.events) if (e.type === 'step' && deadAt === null) steps++;
      if (p.ctl.mode === 'dead' && deadAt === null) deadAt = i / 60;
    }
    assert.equal(p.injury.alive, false);
    assert.ok(deadAt !== null && deadAt > 0.3 && deadAt < 1.6, `stayed up ${deadAt} s before dropping`);
    if (steps >= 1) stepped++;
  }
  assert.ok(stepped >= 2, `stumbling steps in ${stepped}/3`);
});

test('kill cam: a sniper head shot is flown in, applied on arrival, and hands back', () => {
  const { sb, p } = standing(4, 'realistic');
  const scene = new THREE.Scene();
  const silent = new Proxy({}, { get: () => () => {} });
  const kc = new KillCam({ sandbox: () => sb, scene: () => scene, audio: silent, canvas: null, xray: () => null });
  kc.mode = 'always';
  const h = p.rd.segments.head.body.pos;
  const origin = new Vec3(h.x + 0.5, h.y + 0.1, h.z + 15);
  const dir = new Vec3(h.x - origin.x, h.y - origin.y, h.z - origin.z).normalize();
  assert.equal(kc.tryStart('sniper', origin, dir, null), true);
  assert.equal(kc.update(0.1), 0, 'the world waits while the round flies');
  assert.equal(p.injury.alive, true, 'not hit yet');
  let acc = 0, real = 0;
  while (kc.active && real < 10) {
    const ts = kc.update(1 / 60);
    real += 1 / 60;
    acc += ts / 60;
    while (acc >= 1 / 60) {
      sb.step(1 / 60);
      for (const e of sb.drainFx()) kc.onFx(e);
      acc -= 1 / 60;
    }
  }
  assert.equal(kc.active, false, `handed back after ${real.toFixed(1)} s`);
  assert.ok(real > 2 && real < 8);
  assert.equal(p.injury.alive, false, 'the round arrived');
});

function steps(sb, seconds, cb) {
  for (let i = 0, n = Math.round(seconds * 60); i < n; i++) {
    sb.step(1 / 60);
    sb.drainFx();
    if (cb) cb(i / 60);
  }
}

test('a concussive knockout can lock the arms in the fencing posture, then they drop', () => {
  let seen = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const { sb, p } = standing(seed, 'realistic');
    p.injury.knockOut(12, 0.95);
    const F = p.ctl.fencing;
    if (!F) continue;
    seen++;
    const rd = p.rd, hand = rd.segments['hand' + F.ext].body, ch = rd.segments.chest.body;
    let held = 0, n = 0;
    steps(sb, F.dur + 2.5, (t) => {
      if (t < 2 || t > F.dur) return;
      const fwd = ch.localDirToWorld(new Vec3(0, 0, 1), new Vec3());
      n++;
      if (hand.pos.clone().sub(ch.pos).dot(fwd) > 0.35 && hand.pos.y > 0.15) held++;
    });
    assert.ok(held > 0.8 * n, `seed ${seed}: the ${F.ext} arm held up ${held}/${n} frames`);
    assert.equal(p.ctl.fencing, null);
    assert.ok(hand.pos.y < 0.2, `seed ${seed}: the arm still raised (${hand.pos.y.toFixed(2)} m) after the reflex`);
  }
  assert.ok(seen >= 2, `fencing posture in ${seen}/4 knockouts`);
});

test('after brain death the cord fires a few spasms, then the body lies still', () => {
  const { sb, p } = standing(3, 'realistic');
  sb.fire('sniper', p.rd.segments.head.body.pos.clone().add(new Vec3(0.3, 0.1, 12)), new Vec3(-0.3, -0.1, -12).normalize());
  assert.equal(p.injury.alive, false);
  assert.ok(p.ctl.twitches && p.ctl.twitches.list.length >= 3, 'spasms scheduled for a brain death');
  let late = 0, worst = 0;
  steps(sb, 8, (t) => {
    if (t < 2.2) return;
    for (const b of p.rd.allBodies()) {
      const v = b.vel.length();
      worst = Math.max(worst, v);
      if (t < 6) late = Math.max(late, v);
    }
  });
  assert.ok(late > 0.2, `no visible spasm after the body was down (peak ${late.toFixed(2)} m/s)`);
  assert.ok(worst < 3, `a spasm flung a limb at ${worst.toFixed(2)} m/s`);
  assert.equal(p.ctl.twitches, null);
});
