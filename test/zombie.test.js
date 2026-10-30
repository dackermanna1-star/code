import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { Sandbox } from '../src/game/sandbox.js';

const segNames = new Ragdoll(new World()).segList.map((s) => s.name);
const shape = new BodyShape(segNames);

function run(sb, seconds, cb) {
  for (let i = 0; i < seconds * 60; i++) {
    sb.step(1 / 60);
    sb.drainFx();
    if (cb && cb(i / 60) === false) return;
  }
}

function fakePlayer(x, z) {
  const p = { pos: new Vec3(x, 0, z), height: 1.75, radius: 0.3, alive: true, hits: 0, damage(a) { this.hits++; this.taken = (this.taken || 0) + a; } };
  return p;
}

function shootAt(sb, person, weapon, seg, from = [0.02, 0, 4]) {
  const target = person.rd.segments[seg].body.pos.clone();
  const o = new Vec3(target.x + from[0], target.y + from[1], target.z + from[2]);
  return sb.fire(weapon, o, target.clone().sub(o).normalize());
}

test('a walker goes after the player and claws it, without falling over', () => {
  const sb = new Sandbox({ shape, rng: makeRng(2) });
  const pl = fakePlayer(0, 3);
  sb.setPlayer(pl);
  const z = sb.spawnZombie(new Vec3(0, 0, -2), 0, 'walker');
  let falls = 0;
  run(sb, 14, () => {
    for (const e of z.ctl.events) if (e.type === 'mode' && e.to === 'falling') falls++;
    if (pl.hits >= 2) return false;
  });
  assert.equal(falls, 0);
  assert.ok(pl.hits >= 2, `hit the player (${pl.hits} hits)`);
  const d = Math.hypot(z.rd.pelvis.pos.x - pl.pos.x, z.rd.pelvis.pos.z - pl.pos.z);
  assert.ok(d < 1.3, `came up to arm's length (${d.toFixed(2)} m)`);
});

test('the undead shrug off torso rounds but not a round through the brain', () => {
  const sb = new Sandbox({ shape, rng: makeRng(3) });
  const z = sb.spawnZombie(new Vec3(0, 0, 0), 0, 'walker');
  run(sb, 0.5);
  for (let i = 0; i < 2; i++) {
    shootAt(sb, z, 'pistol', 'abdomen', [0.03 * i, 0, 4]);
    run(sb, 0.4);
  }
  assert.equal(z.injury.alive, true, 'two pistol rounds to the belly do not stop a zombie');
  assert.equal(z.ctl.conscious, true);
  assert.ok(z.injury.hp < z.injury.hpMax, 'but they wear it down');
  shootAt(sb, z, 'pistol', 'head', [0.0, 0.02, 4]);
  run(sb, 0.2);
  assert.equal(z.injury.alive, false, 'a head shot does');
});

test("a brute's helmet stops rounds until it comes off", () => {
  const sb = new Sandbox({ shape, rng: makeRng(4) });
  const z = sb.spawnZombie(new Vec3(0, 0, 0), 0, 'brute');
  run(sb, 0.5);
  const left0 = z.injury.armor.helmet;
  const paths = shootAt(sb, z, 'pistol', 'head', [0, 0.03, 4]);
  run(sb, 0.2);
  assert.equal(z.injury.alive, true, 'the helmet took it');
  assert.equal(z.injury.armor.helmet, left0 - 1);
  assert.ok(paths[0].hits.some((h) => h.armor), 'reported as an armour hit');
  for (let i = 0; i < left0 - 1; i++) {
    shootAt(sb, z, 'pistol', 'head', [0, 0.03, 4]);
    run(sb, 0.2);
  }
  assert.equal(z.injury.armor.helmet, 0, 'worn through');
  shootAt(sb, z, 'rifle', 'head', [0, 0.03, 6]);
  run(sb, 0.2);
  assert.equal(z.injury.alive, false, 'bare-headed, it goes down');
});

test('a runner runs (> 1.4 m/s over 10 m) and stays on its feet', () => {
  const sb = new Sandbox({ shape, rng: makeRng(1) });
  const pl = fakePlayer(0, 11.2);
  sb.setPlayer(pl);
  const z = sb.spawnZombie(new Vec3(0, 0, -11), 0, 'runner');
  let tA = null, tB = null, falls = 0;
  run(sb, 18, (t) => {
    for (const e of z.ctl.events) if (e.type === 'mode' && e.to === 'falling') falls++;
    const pz = z.rd.pelvis.pos.z;
    if (tA === null && pz > -5) tA = t;
    if (tB === null && pz > 5) {
      tB = t;
      return false;
    }
  });
  assert.equal(falls, 0);
  assert.ok(tB !== null, 'covered the stretch');
  const v = 10 / (tB - tA);
  assert.ok(v > 1.4, `speed ${v.toFixed(2)} m/s`);
});

test('without a player, zombies go for the living dummies (and the blows are physical)', () => {
  const sb = new Sandbox({ shape, rng: makeRng(5) });
  const dummy = sb.spawnPerson(new Vec3(0, 0, 2.5), Math.PI);
  const z = sb.spawnZombie(new Vec3(0, 0, -1), 0, 'walker');
  let hits = 0;
  for (let i = 0; i < 14 * 60 && hits < 2; i++) {
    sb.step(1 / 60);
    for (const e of sb.drainFx()) if (e.type === 'zombieHit' && e.victim === dummy) hits++;
  }
  assert.ok(hits >= 1, 'struck the dummy');
  assert.equal(z.zombie.target.person, dummy);
});
