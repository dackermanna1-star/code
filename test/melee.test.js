import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { Sandbox } from '../src/game/sandbox.js';
import { MELEE_WEAPONS, MELEE_LIMITS, meleeParams } from '../src/game/melee.js';
import { bodyShape, finite } from '../tools/bench/common.mjs';

const shape = bodyShape();

function scene(seed = 1, opts = {}) {
  const sb = new Sandbox({ shape, rng: makeRng(seed) });
  const person = opts.zombie ? sb.spawnZombie(new Vec3(0, 0, 0), 0, opts.zombie) : sb.spawnPerson(new Vec3(0, 0, 0), 0);
  run(sb, opts.settle ?? 0.5);
  return { sb, person };
}

/** Steps the sandbox; returns the fx seen. cb(frame, fx) may return false to stop. */
function run(sb, seconds, cb) {
  const all = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sb.step(1 / 60);
    const fx = sb.drainFx();
    all.push(...fx);
    if (cb && cb(i, fx) === false) break;
  }
  return all;
}

/** World point of a bind-pose point of a segment (where that anatomy is now). */
function at(person, seg, bind) {
  const s = person.rd.segments[seg];
  return s.body.localToWorld(new Vec3(...bind).sub(s.bindPos), new Vec3());
}

/** A straight strike through `target`, coming from direction `from` (pointing back at the striker). */
function strike(sb, weapon, target, from, opts = {}) {
  const d = new Vec3(...from).normalize();
  return sb.meleeStrike(weapon, target.clone().addScaled(d, opts.back ?? 0.4), target.clone().addScaled(d, -(opts.through ?? 0.15)), opts);
}

test('a full-power bat swing to the ribs breaks ribs and the dummy staggers or goes down', () => {
  const { sb, person } = scene(1);
  sb.drainFx();
  const p0 = person.rd.pelvis.pos.clone();
  const res = strike(sb, 'bat', at(person, 'chest', [0.115, 1.26, 0.07]), [0.6, 0, 1], { charge: 1 });
  assert.equal(res.hits.length >= 1, true, 'the bat connects');
  const h = res.hits[0];
  assert.equal(h.seg, 'chest');
  assert.equal(h.kind, 'blunt');
  assert.ok(h.speed > 25, `bat-head speed ${h.speed.toFixed(1)} m/s`);
  assert.ok(h.applied <= MELEE_LIMITS.impulse && h.applied > 10, `impulse ${h.applied.toFixed(1)} N s`);
  const inj = person.injury;
  assert.ok(inj.ribFx.length >= 1, 'ribs broken');
  const ribs = h.fractures.find((f) => f.label === 'ribs');
  assert.ok(ribs && ribs.ribs.length >= 1, 'the hit reports the broken ribs');
  for (const r of ribs.ribs) assert.ok(r.side === 'L' && r.n >= 1 && r.n <= 12, `rib ${r.side}${r.n}`);
  let staggered = false, ev = null;
  const fx = run(sb, 2.5, () => {
    for (const e of person.ctl.events) if (e.type === 'step' || (e.type === 'mode' && e.to === 'falling')) staggered = true;
  });
  ev = fx.find((e) => e.type === 'injury' && e.event.type === 'fracture' && e.event.label === 'ribs');
  assert.ok(ev && ev.event.ribs.length >= 1 && ev.event.pointW, 'a rib fracture event for the visuals');
  const mh = fx.find((e) => e.type === 'meleeHit' && e.weapon === 'bat' && e.person === person);
  assert.ok(mh && mh.kind === 'blunt' && mh.seg === 'chest' && mh.fractures.length >= 1 && mh.point && mh.dir, 'meleeHit fx');
  staggered = staggered || person.rd.pelvis.pos.distanceTo(p0) > 0.12;
  assert.ok(staggered, 'stepped, stumbled or fell');
  assert.ok(inj.alive, 'a blow to the ribs is not immediately fatal');
  assert.ok(finite(person));
});

test('a light jab fractures nothing and rarely knocks out', () => {
  for (const seed of [1, 2]) {
    for (const [seg, bind, from] of [['chest', [0.06, 1.3, 0.07], [0, 0, 1]], ['head', [0.05, 1.6, 0.03], [1, 0, 0.3]], ['head', [0, 1.575, 0.075], [0, 0, 1]]]) {
      const { sb, person } = scene(seed);
      const res = strike(sb, 'fists', at(person, seg, bind), from, { charge: 0, back: 0.3, through: 0.1 });
      assert.equal(res.hits.length, 1, 'one punch lands once');
      const h = res.hits[0];
      assert.ok(Math.abs(h.speed - meleeParams('fists', 0).speed) < 1, `jab speed ${h.speed.toFixed(1)}`);
      assert.equal(h.fractures.length, 0, `jab to the ${seg}: ${h.fractures.map((f) => f.label)}`);
      run(sb, 0.5);
      assert.equal(person.injury.fractures.length, 0);
      assert.equal(person.injury.conscious, true, `jab to the ${seg} knocked out`);
    }
  }
});

test('a full haymaker to the chin knocks out (the head is twisted hard); its jab counterpart does not', () => {
  for (const seed of [1, 2, 3]) {
    const { sb, person } = scene(seed);
    const res = strike(sb, 'fists', at(person, 'head', [0.03, 1.585, 0.07]), [1, 0, 0.4], { charge: 1, back: 0.3, through: 0.1 });
    const h = res.hits[0];
    assert.ok(h && h.seg === 'head', 'lands on the head');
    assert.ok(h.head && h.head.load > 1.1, `head load ${h.head && h.head.load.toFixed(2)}`);
    assert.ok(h.ko, `seed ${seed}: knocked out`);
    run(sb, 1);
    assert.equal(person.ctl.mode, 'unconscious', 'goes limp');
    assert.ok(person.injury.alive);
  }
  const { sb, person } = scene(1);
  const res = strike(sb, 'fists', at(person, 'head', [0.03, 1.585, 0.07]), [1, 0, 0.4], { charge: 0, back: 0.3, through: 0.1 });
  assert.ok(res.hits[0].head.load < 0.8 && !res.hits[0].ko, 'a jab to the same spot');
});

test('a liver shot drops the dummy to its knees', () => {
  const { sb, person } = scene(2);
  const res = strike(sb, 'fists', at(person, 'abdomen', [-0.085, 1.16, 0.085]), [-0.5, 0, 1], { charge: 1, back: 0.3, through: 0.1 });
  assert.equal(res.hits[0].seg, 'abdomen');
  let knelt = false;
  run(sb, 3, () => {
    if (person.ctl.kneel) knelt = true;
  });
  assert.ok(knelt, 'legs gave way: down on the knees');
  assert.ok(person.injury.alive && person.injury.conscious);
  assert.ok(person.rd.pelvis.pos.y < 0.6, `pelvis ${person.rd.pelvis.pos.y.toFixed(2)} m`);
});

test('a knife slash across the throat opens the great vessels; across the forearm it bleeds slowly', () => {
  const { sb, person } = scene(1);
  const c = at(person, 'neck', [0, 1.53, 0]);
  const res = sb.meleeStrike('knife', c.clone().add(new Vec3(0.14, 0, 0.02)), c.clone().add(new Vec3(-0.12, 0, 0.02)), { mode: 'slash', into: new Vec3(-0.4, 0, -1).normalize(), reach: 0.04, charge: 1 });
  const h = res.hits.find((x) => x.seg === 'neck');
  assert.ok(h && h.kind === 'cut', 'the edge is drawn across the neck');
  assert.ok(h.structures.some((s) => /carotid|jugular/.test(s)), `vessels: ${h.structures}`);
  assert.ok(person.injury.wounds.some((w) => w.incised && w.arterial), 'an arterial incised wound');
  sb.step(1 / 60);
  const neckRate = person.injury.bleedRate;
  assert.ok(neckRate > 15, `throat: ${neckRate.toFixed(1)} mL/s`);

  const b = scene(1);
  const f = at(b.person, 'forearmL', [0.27, 1.0, -0.004]);
  const r2 = b.sb.meleeStrike('knife', f.clone().add(new Vec3(0.12, 0, 0.02)), f.clone().add(new Vec3(-0.05, 0, 0.02)), { mode: 'slash', into: new Vec3(0, 0, -1), reach: 0.03, charge: 1 });
  assert.ok(r2.hits.length >= 1 && r2.hits.every((x) => x.seg === 'forearmL'), `forearm only: ${r2.hits.map((x) => x.seg)}`);
  b.sb.step(1 / 60);
  const armRate = b.person.injury.bleedRate;
  assert.ok(armRate > 0 && armRate < 5, `forearm: ${armRate.toFixed(2)} mL/s`);
  assert.ok(neckRate > 5 * armRate);
});

test('a stab drives the blade in along its length: chest stab reaches the heart or lung', () => {
  const { sb, person } = scene(1);
  const t = at(person, 'chest', [0.03, 1.3, 0.08]);
  const res = sb.meleeStrike('knife', t.clone().add(new Vec3(0, 0, 0.3)), t.clone().add(new Vec3(0, 0, -0.15)), { mode: 'stab', charge: 1 });
  const h = res.hits[0];
  assert.ok(h && h.kind === 'stab' && h.seg === 'chest');
  assert.ok(h.depth > 0.04 && h.depth <= MELEE_WEAPONS.knife.blade, `depth ${h.depth.toFixed(3)} m`);
  assert.ok(h.structures.some((s) => /heart|lung/.test(s)), `structures ${h.structures}`);
  assert.ok(res.stopped, 'the blade stays in');
});

test('stamping on the head of a dummy lying on the floor fractures the skull; repeated stamps kill', () => {
  const { sb, person } = scene(1);
  person.injury.knockOut(600, 0.5);
  run(sb, 3);
  assert.ok(person.rd.segments.head.body.pos.y < 0.3, 'lying on the floor');
  let stamps = 0;
  while (person.injury.alive && stamps < 6) {
    const head = person.rd.segments.head.body.pos.clone();
    const along = head.clone().sub(person.rd.pelvis.pos);
    const across = new Vec3(-along.z, 0, along.x).normalize();
    const res = sb.meleeStrike('boot', head.clone().add(new Vec3(0, 0.4, 0)), head.clone().add(new Vec3(0, -0.1, 0)), { charge: 1, axis: across });
    stamps++;
    assert.ok(res.hits.some((x) => x.seg === 'head'), 'the boot lands on the head');
    if (stamps === 1) assert.ok(person.injury.fractures.some((f) => f.label === 'skull'), 'first stamp: skull fracture');
    run(sb, 0.5);
  }
  assert.equal(person.injury.alive, false, `alive after ${stamps} stamps`);
  assert.ok(stamps <= 4, `${stamps} stamps`);
  assert.match(person.injury.deathCause, /head|brain/);
  assert.ok(finite(person));
});

test('a full bat to the temple is fatal; to a forearm raised in the way it breaks the forearm', () => {
  const { sb, person } = scene(1);
  const res = strike(sb, 'bat', at(person, 'head', [0.07, 1.705, 0.02]), [1, 0, 0], { charge: 1 });
  assert.ok(res.hits[0].seg === 'head' && res.hits[0].fractures.some((f) => f.label === 'skull' && f.depressed));
  assert.equal(person.injury.alive, false);
  const b = scene(2);
  // the forearm hangs at the side of the thigh: a swing at it from the side
  const r2 = strike(b.sb, 'bat', at(b.person, 'forearmL', [0.27, 1.0, -0.04]), [1, 0, 0], { charge: 1 });
  assert.equal(r2.hits[0].seg, 'forearmL');
  assert.ok(r2.hits[0].fractures.some((f) => f.label === 'radius/ulna' && f.physical), 'forearm broken');
  run(b.sb, 0.1);
  assert.ok(b.person.rd.segments.forearmL.fractured, 'the forearm breaks physically');
  assert.ok(r2.hits.length === 1 || r2.speedLeft < 1, 'the bat is slowed by what it broke');
});

test('a swing driven step by step hits each body part once, slows on impact, and a miss is reported', () => {
  const { sb, person } = scene(3);
  const striker = sb.meleeStriker('bat', { charge: 1, by: 'player' });
  // a horizontal swing about the hands, 0.9 m in front-left of the dummy, through its chest
  const chest = at(person, 'chest', [0, 1.28, 0]);
  const hands = chest.clone().add(new Vec3(0.55, 0, 0.62));
  const reach = 0.85, w = 30 / (reach - 0.16); // sweet spot at 30 m/s
  const pose = (ang) => {
    const d = new Vec3(Math.sin(ang), 0, Math.cos(ang));
    return { a: hands.clone().addScaled(d, reach - 0.5), b: hands.clone().addScaled(d, reach) };
  };
  const toChest = Math.atan2(chest.x - hands.x, chest.z - hands.z);
  let ang = toChest + 1.0;
  const hits = [], fxSeen = [];
  sb.drainFx();
  for (let i = 0; i < 12; i++) {
    const r = striker.update(pose(ang), 1 / 60);
    hits.push(...r.hits);
    sb.step(1 / 60);
    fxSeen.push(...sb.drainFx());
    // the animation slows with what is left of the swing
    ang -= (w / 60) * r.speedLeft;
  }
  striker.end();
  fxSeen.push(...sb.drainFx());
  assert.ok(hits.length >= 1, 'connects');
  const bodies = hits.map((h) => h.body);
  assert.equal(new Set(bodies).size, bodies.length, 'no body hit twice');
  assert.ok(striker.speedLeft < 0.6, `slowed to ${striker.speedLeft.toFixed(2)}`);
  assert.ok(hits[0].speed > 15, `swing speed ${hits[0].speed.toFixed(1)} m/s`);
  assert.ok(fxSeen.some((e) => e.type === 'meleeHit' && e.by === 'player'), 'meleeHit fx carries who struck');
  assert.ok(!fxSeen.some((e) => e.type === 'meleeMiss'), 'no miss reported for a swing that hit');
  const miss = sb.meleeStriker('fists', { charge: 0.5 });
  miss.update(new Vec3(3, 1.5, 3), 1 / 60);
  miss.update(new Vec3(3, 1.5, 2.8), 1 / 60);
  miss.end();
  assert.ok(sb.drainFx().some((e) => e.type === 'meleeMiss' && e.weapon === 'fists'));
});

test('a flurry of strikes keeps every impulse bounded and every body finite', () => {
  const { sb, person } = scene(4);
  const rng = makeRng(99);
  const weapons = ['bat', 'fists', 'boot', 'knife'];
  const segs = person.rd.segList.map((s) => s.name);
  let n = 0, maxApplied = 0;
  for (let i = 0; i < 36; i++) {
    const w = weapons[i % 4];
    const seg = segs[Math.floor(rng() * segs.length)];
    const t = person.rd.segments[seg].body.pos.clone();
    const ang = rng() * Math.PI * 2;
    const from = [Math.sin(ang), (rng() - 0.3) * 0.8, Math.cos(ang)];
    const res = strike(sb, w, t, from, { charge: rng(), mode: rng() < 0.5 ? 'slash' : 'stab', into: new Vec3(-from[0], 0, -from[2]) });
    for (const h of res.hits) {
      n++;
      maxApplied = Math.max(maxApplied, h.applied);
      assert.ok(h.applied <= MELEE_LIMITS.impulse + 1e-9, `impulse ${h.applied}`);
      assert.ok(Number.isFinite(h.force) && Number.isFinite(h.energy));
    }
    run(sb, 0.1);
    for (const b of person.rd.allBodies()) {
      assert.ok(b.vel.length() < 40 && b.angVel.length() < 95, `${b.name} v ${b.vel.length().toFixed(1)} w ${b.angVel.length().toFixed(1)}`);
    }
  }
  assert.ok(n > 15, `${n} hits`);
  run(sb, 2);
  assert.ok(finite(person), 'finite after the flurry');
  for (const b of person.rd.allBodies()) assert.ok(b.pos.y > -0.2 && b.pos.y < 3, `${b.name} at ${b.pos.y.toFixed(2)} m`);
});

test('zombies take melee damage: blows wear down their hp, a full bat to the head destroys one', () => {
  const { sb, person: z } = scene(3, { zombie: 'walker' });
  const hp0 = z.injury.hp;
  strike(sb, 'fists', at(z, 'chest', [0.06, 1.3, 0.07]), [0, 0, 1], { charge: 1, back: 0.3, through: 0.1 });
  const hp1 = z.injury.hp;
  assert.ok(hp1 < hp0 && z.injury.alive, `punch: ${hp0} -> ${hp1.toFixed(0)}`);
  run(sb, 0.3);
  // (beside the sternum, between the ribs)
  const t = at(z, 'abdomen', [0.04, 1.14, 0.08]);
  const stab = sb.meleeStrike('knife', t.clone().add(new Vec3(0, 0, 0.3)), t.clone().add(new Vec3(0, 0, -0.15)), { mode: 'stab', charge: 1 });
  assert.equal(stab.hits[0].kind, 'stab');
  const hp2 = z.injury.hp;
  assert.ok(hp2 < hp1 && z.injury.alive, `stab: ${hp1.toFixed(0)} -> ${hp2.toFixed(0)}`);
  assert.equal(z.injury.conscious, true, 'the undead do not get knocked out');
  run(sb, 0.3);
  strike(sb, 'bat', at(z, 'head', [0.07, 1.705, 0.02]), [1, 0, 0], { charge: 1 });
  assert.equal(z.injury.alive, false, 'skull crushed');
});
