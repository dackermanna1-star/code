// LAST LOOKOUT: the game core, headless (zombies animated / physical, ballistics, defences, waves).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { TowerGame } from '../src/tower/game/game.js';
import { LAYOUT, isWalkable, lookoutEye, buildWalkGrid } from '../src/tower/level/layout.js';

const shape = new BodyShape(new Ragdoll(new World()).segList.map((s) => s.name));
const DT = 1 / 60;

function game(seed = 1, opts = {}) {
  const g = new TowerGame({ layout: LAYOUT, isWalkable, shape, rng: makeRng(seed), walkGrid, ...opts });
  g.director.phase = 'fight'; // no wave director unless a test starts one
  g.director.toSpawn = 0;
  g.director.total = 0;
  return g;
}

function run(g, seconds, cb) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    g.step(DT);
    const ev = g.drainEvents();
    if (cb && cb(i * DT, ev) === false) return i * DT;
  }
  return seconds;
}

const eye = new Vec3(...LAYOUT.tower.eye);
const walkGrid = buildWalkGrid(1);
/** The sniper's eye for a target: at the window he looks through (as the game places it). */
function eyeFor(p) {
  const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
  return new Vec3(...lookoutEye(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))));
}

/** Aim from the tower at a segment of a zombie (drop compensated) and fire. */
function shootAt(g, z, seg = 'head', rifle = null) {
  if (rifle) g.equip('rifle', rifle);
  g.rifle.state = 'idle';
  g.rifle.ammo = Math.max(g.rifle.ammo, 1);
  const p = z.person.rd.segments[seg].body.pos.clone();
  const e = eyeFor(p);
  const d = p.distanceTo(e);
  const tf = d / 790;
  p.y += 0.5 * 9.81 * tf * tf;
  // lead a walking target by the round's flight time
  if (z.animated && z.state === 'walk') {
    p.x += Math.sin(z.facing) * z.speed() * tf;
    p.z += Math.cos(z.facing) * z.speed() * tf;
  }
  return g.fire(e, p.sub(e).normalize());
}

/** A point `dist` m out from a gate, in front of it. */
function nearGate(i, dist) {
  const gt = LAYOUT.compound.gates[i];
  const cx = (gt.a[0] + gt.b[0]) / 2, cz = (gt.a[1] + gt.b[1]) / 2;
  return new Vec3(cx + gt.normal[0] * dist, 0, cz + gt.normal[1] * dist);
}

test('zombies walk to the gates on the flow field and batter them', () => {
  const g = game(1);
  const zs = LAYOUT.compound.gates.map((gt, i) => {
    const p = nearGate(i, 30);
    return g.horde.spawn('walker', p, Math.atan2(-gt.normal[0], -gt.normal[1]));
  });
  let hp0 = g.gate.hp;
  run(g, 60, () => !zs.every((z) => z.state === 'attack') || undefined);
  for (const z of zs) assert.equal(z.state, 'attack', `walker ${z.id} stuck in ${z.state} at ${z.root.pos.x.toFixed(1)},${z.root.pos.z.toFixed(1)}`);
  run(g, 3);
  assert.ok(g.gate.hp < hp0, 'the gate takes damage');
  // nobody walked through the fence
  const R = LAYOUT.compound.rect;
  for (const z of zs) assert.ok(!(z.root.pos.x > R.minX + 0.3 && z.root.pos.x < R.maxX - 0.3 && z.root.pos.z > R.minZ + 0.3 && z.root.pos.z < R.maxZ - 0.3), 'inside the compound');
});

test('a head shot from the tower wakes, kills and pays; the corpse settles and is frozen', () => {
  const g = game(2);
  const z = g.horde.spawn('walker', nearGate(0, 120), Math.PI);
  run(g, 1);
  assert.ok(z.animated);
  const cash0 = g.cash;
  // (a walker coming straight on holds its arms out in front of its face: a player may need a
  // second or third round)
  let kill = null;
  for (let k = 0; k < 3 && !kill; k++) {
    shootAt(g, z, 'head');
    run(g, 2.5, (t, ev) => {
      for (const e of ev) if (e.type === 'kill') kill = e;
    });
  }
  run(g, 6, (t, ev) => {
    for (const e of ev) if (e.type === 'kill') kill = e;
  });
  assert.ok(kill, 'killed');
  assert.ok(kill.cash > 0);
  assert.equal(kill.head, kill.bonuses.some((b) => /HEADSHOT/.test(b)), 'a head-shot kill carries the bonus');
  assert.ok(g.cash > cash0);
  assert.equal(z.state, 'frozen');
});

test('a leg shot drops a walker; it comes back to its clip limping or crawling', () => {
  let ok = 0;
  for (const seed of [3, 4, 5]) {
    const g = game(seed);
    const z = g.horde.spawn('walker', nearGate(1, 60), 0);
    run(g, 1);
    shootAt(g, z, 'thighL', 'whisper');
    let woke = false;
    run(g, 16, () => {
      if (z.state === 'phys') woke = true;
    });
    assert.ok(woke, 'the hit made it physical');
    if (z.alive && z.animated) ok++;
  }
  assert.ok(ok >= 2, `back in the clip after a leg shot in ${ok}/3`);
});

test('a climber goes over the fence and up a leg; shot off, it falls as a ragdoll', () => {
  const g = game(6);
  const p = nearGate(0, 16);
  p.x += 4;
  const z = g.horde.spawn('climber', p, Math.PI);
  run(g, 40, () => (z.state === 'climb' && z.root.pos.y > 9 ? false : undefined));
  assert.equal(z.state, 'climb', `climber in ${z.state}`);
  const y0 = z.person.rd.pelvis.pos.y;
  assert.ok(y0 > 8);
  shootAt(g, z, 'chest', 'anvil');
  run(g, 4);
  assert.ok(z.state === 'phys' || z.state === 'dead' || z.state === 'frozen', z.state);
  assert.ok(z.person.rd.pelvis.pos.y < 1, `fell to ${z.person.rd.pelvis.pos.y.toFixed(2)} m`);
});

test('barbed wire trips a walker into physics; a landmine throws and wrecks the ones on it', () => {
  const g = game(7);
  const z = g.horde.spawn('walker', nearGate(2, 40), 0);
  const gt = LAYOUT.compound.gates[2];
  const w = nearGate(2, 32);
  g.owned.defences.wire = 1;
  // the wire across the path (perpendicular to the gate's normal: direction (cos yaw, -sin yaw))
  assert.ok(g.placeTrap('wire', w, Math.atan2(-gt.normal[0], -gt.normal[1])).ok);
  let tripped = false;
  run(g, 20, (t, ev) => {
    if (ev.some((e) => e.type === 'tripped')) tripped = true;
  });
  assert.ok(tripped, 'tripped over the wire');
  const g2 = game(8);
  const zs = [0, 1, 2].map((i) => g2.horde.spawn('walker', nearGate(3, 30 + i * 0.9), 0));
  g2.owned.defences.mine = 1;
  assert.ok(g2.placeTrap('mine', nearGate(3, 26)).ok);
  let boom = false;
  run(g2, 15, (t, ev) => {
    if (ev.some((e) => e.type === 'explosion')) boom = true;
  });
  assert.ok(boom, 'the mine went off');
  assert.ok(zs.filter((z) => !z.alive || z.mode === 'crawl').length >= 1, 'the mine wrecked someone');
});

test('a big blast stays within the physics budget: corpses settle and freeze', () => {
  const g = game(9, { maxPhysical: 8 });
  const zs = [];
  for (let i = 0; i < 24; i++) zs.push(g.horde.spawn('walker', new Vec3(60 + (i % 6) * 1.1, 0, 60 + Math.floor(i / 6) * 1.1), 0));
  run(g, 0.5);
  g.explode(new Vec3(63, 0.3, 61.5), { radius: 7, power: 1.4 });
  let peak = 0;
  run(g, 6, () => {
    peak = Math.max(peak, g.horde.physicalCount);
  });
  assert.ok(g.horde.physicalCount <= 8, `still ${g.horde.physicalCount} physical after 6 s`);
  assert.ok(zs.every((z) => z.state !== 'phys' || z.physT < 14));
  void peak;
});

test('80 animated zombies cost little per physics step', () => {
  const g = game(10);
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2;
    g.horde.spawn('walker', new Vec3(Math.cos(a) * 150, 0, Math.sin(a) * 150), a + Math.PI);
  }
  run(g, 1);
  const t0 = performance.now();
  run(g, 3);
  const ms = (performance.now() - t0) / 180;
  assert.ok(ms < 6, `${ms.toFixed(2)} ms per step for 80 animated zombies`);
});

test('the shop: rifles, ammo, upgrades, defences, placement rules; a run saves and restores', () => {
  const g = game(11);
  g.cash = 20000;
  assert.ok(g.buy('rifle', 'sr10').ok);
  assert.equal(g.rifle.id, 'sr10');
  assert.ok(g.buy('ammo', 'ap').ok);
  assert.equal(g.owned.ammo.ap, 15);
  assert.ok(g.equip('ammo', 'ap').ok);
  assert.ok(g.buy('upgrade', 'magazine').ok);
  assert.equal(g.rifle.mag, 15);
  assert.ok(!g.buy('upgrade', 'magazine').ok, 'maxed');
  const r = g.buy('defence', 'mine');
  assert.ok(r.ok && r.place === 'ground');
  assert.ok(!g.placeTrap('mine', new Vec3(240, 0, 240)).ok, 'outside the trap zone');
  assert.ok(g.placeTrap('mine', new Vec3(20, 0, 40)).ok);
  assert.ok(!g.placeTrap('mine', new Vec3(22, 0, 40)).ok, 'none left');
  g.gate.hp = 400;
  assert.ok(g.buy('defence', 'repair').ok);
  assert.ok(g.gate.hp > 400);
  assert.ok(g.buy('defence', 'sentry').ok && g.defences.sentry);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = game(12);
  g2.newRun(s);
  assert.equal(g2.cash, g.cash);
  assert.ok(g2.owned.rifles.has('sr10'));
  assert.equal(g2.defences.mines.length, 1);
  assert.ok(g2.defences.sentry);
  assert.equal(g2.director.phase, 'shop');
});

test('a wave runs from its intro to the shop', () => {
  const g = game(13);
  g.director.phase = 'title';
  assert.ok(g.nextWave());
  const kinds = new Set();
  run(g, 120, (t, ev) => {
    for (const e of ev) if (e.type === 'zombieSpawned') kinds.add(e.zombie.kind);
    // a perfect marksman: everything dies as soon as it appears
    for (const z of g.horde.list) if (z.alive && z.animated) z.person.injury.kill('test');
    if (g.director.phase === 'shop') return false;
  });
  assert.equal(g.director.phase, 'shop');
  assert.ok(g.stats.kills >= g.director.total, `${g.stats.kills} kills of ${g.director.total}`);
  assert.ok(kinds.has('walker'));
});
