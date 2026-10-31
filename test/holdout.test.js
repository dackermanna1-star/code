// HOLDOUT: the on-foot mode's core, headless (the chase, rounds, points, barricades, guns, the
// crate, the bench, field kits, pickups, grenades, the player's bounds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, makeRng } from '../src/physics/math.js';
import { World } from '../src/physics/world.js';
import { Ragdoll } from '../src/human/ragdoll.js';
import { BodyShape } from '../src/human/bodyShape.js';
import { LAYOUT, buildWalkGrid } from '../src/tower/level/layout.js';
import { HoldoutGame } from '../src/tower/holdout/game.js';
import { AREAS, DOORS, SPAWNS, LOCKERS, CRATE_SPOTS, BENCH, PERKS, GUNS, ROUNDS, HERO, inRect } from '../src/tower/holdout/areas.js';
import { raycastPeople } from '../src/game/weapons.js';

const shape = new BodyShape(new Ragdoll(new World()).segList.map((s) => s.name));
const walkGrid = buildWalkGrid(1, 0.35, { skip: (c) => c.kind === 'gate' });
const DT = 1 / 60;

/** A game with the round director held (tests spawn their own zombies unless they start rounds). */
function game(seed = 1, opts = {}) {
  const g = new HoldoutGame({ layout: LAYOUT, shape, walkGrid, rng: makeRng(seed), ...opts });
  g.phase = 'break';
  g.timer = 1e9;
  return g;
}

function idle() {
  return { move: { x: 0, z: 0 }, look: { dx: 0, dy: 0 }, sprint: false, crouch: false, jump: false, fire: false, ads: false, pressed: new Set(), wheel: 0 };
}

function run(g, seconds, input = idle, cb = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    g.step(DT, typeof input === 'function' ? input(i * DT) : input);
    const ev = g.drainEvents();
    if (cb && cb(i * DT, ev) === false) return i * DT;
  }
  return seconds;
}

/** Look straight at a point (the view's recoil taken out). */
function aimAt(g, p) {
  const pl = g.player, e = pl.eye(new Vec3());
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
  pl.yaw = Math.atan2(-dx, -dz) - g.recoil.y;
  pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)) - g.recoil.p;
}

/** A marksman: each step, if the sights are on a zombie's head, squeeze (semi-auto: every other step). */
function marksman(g) {
  let tap = false;
  return () => {
    const inp = idle();
    const pl = g.player;
    let best = null, bd = 40;
    for (const z of g.horde.list) {
      if (!z.alive || (z.animated && z.rising)) continue;
      const q = z.person.rd.segments.head.body.pos;
      const d = Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    inp.ads = true;
    if (best) {
      aimAt(g, best);
      tap = !tap;
      inp.fire = tap;
    }
    if (g.gun) g.gun.spare = g.gun.reserve; // (a bottomless pouch: the aim is what is tested)
    if (g.gun && g.gun.ammo === 0) inp.pressed.add('KeyR');
    return inp;
  };
}

test('the area data sits on open ground: spawns, guns, the crate, the bench, field kits, barricades', () => {
  const free = (x, z) => walkGrid.data[Math.floor(z - walkGrid.minZ) * walkGrid.nx + Math.floor(x - walkGrid.minX)] === 1;
  const areaAt = (x, z) => AREAS.find((a) => inRect(a.rect, x, z));
  for (const [id, list] of Object.entries(SPAWNS)) for (const p of list) assert.ok(free(p[0], p[1]) && areaAt(p[0], p[1]).id === id, `spawn ${id} ${p}`);
  for (const l of LOCKERS) assert.ok(free(l.pos[0], l.pos[1]) && areaAt(l.pos[0], l.pos[1]).id === l.area, l.id);
  for (const c of CRATE_SPOTS) assert.ok(free(c.pos[0], c.pos[1]) && areaAt(c.pos[0], c.pos[1]).id === c.area, c.id);
  assert.ok(free(BENCH.pos[0], BENCH.pos[1]) && areaAt(BENCH.pos[0], BENCH.pos[1]).id === BENCH.area);
  for (const p of PERKS) assert.ok(free(p.pos[0], p.pos[1]) && areaAt(p.pos[0], p.pos[1]).id === p.area, p.id);
  for (const d of DOORS) {
    const [x, z] = d.pos;
    const sides = d.axis === 'x' ? [[x, z - 1.5], [x, z + 1.5]] : [[x - 1.5, z], [x + 1.5, z]];
    const ids = sides.map((s) => areaAt(s[0], s[1]).id).sort().join();
    assert.equal(ids, [d.a, d.b].sort().join(), d.id);
    for (const s of sides) assert.ok(free(s[0], s[1]), `${d.id} side ${s}`);
  }
  // every area can be reached from the Lookout through the barricades
  const seen = new Set(['lookout']);
  for (let k = 0; k < 10; k++) for (const d of DOORS) if (seen.has(d.a) || seen.has(d.b)) seen.add(d.a).add(d.b);
  assert.equal(seen.size, AREAS.length);
});

test('the dead rise out of the ground and run the player down across the valley; their blows hurt; health comes back', () => {
  const g = game(1);
  const pl = g.player;
  // one in the Lookout's far corner, one behind the trailer wreck
  const a = g.horde.spawnRising('walker', new Vec3(30, 0, -26), 0, 260, 'jog');
  const b = g.horde.spawnRising('walker', new Vec3(-30, 0, -28), 0, 260, 'sprint');
  assert.equal(a.state, 'getup');
  assert.ok(a.root.pos.y < -0.5, 'starts below the ground');
  let attacks = 0, hurt = 0;
  run(g, 30, idle, (t, ev) => {
    for (const e of ev) {
      if (e.type === 'attack') attacks++;
      if (e.type === 'hurt') hurt += e.amount;
    }
    if (hurt > 0 && attacks >= 2) return false;
  });
  assert.ok(attacks >= 2, `${attacks} attacks (a: ${a.state} ${a.root.pos.x.toFixed(1)},${a.root.pos.z.toFixed(1)}; b: ${b.state})`);
  assert.ok(hurt > 0 && pl.health < pl.maxHealth, 'the player took a blow');
  assert.equal(a.root.pos.y, 0, 'on the surface');
  // out of reach: the player walks away and gets health back
  for (const z of [a, b]) z.person.injury.kill('test');
  run(g, 1);
  const h0 = pl.health;
  run(g, 7);
  assert.ok(pl.health > h0 && pl.health <= pl.maxHealth, `regenerated ${h0.toFixed(0)} -> ${pl.health.toFixed(0)}`);
});

test('the chase field leads the horde through the compound\'s open gates to a player inside', () => {
  const g = game(2);
  g.player.pos.set(2.5, 0, -2.5); // inside the fence, by a tower leg
  g.chase.rebuild(2.5, -2.5);
  const zs = [[0, -25], [25, 2], [-20, 18], [3, 26]].map(([x, z]) => g.horde.spawnRising('walker', new Vec3(x, 0, z), 0, 260, 'jog'));
  const R = LAYOUT.compound.rect;
  run(g, 40, idle, () => {
    g.player.health = g.player.maxHealth; // (not what is tested here)
    g.player.pos.set(2.5, 0, -2.5);
    if (zs.every((z) => z.state === 'attack')) return false;
  });
  for (const z of zs) {
    const p = z.root.pos;
    assert.equal(z.state, 'attack', `stuck in ${z.state} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    assert.ok(p.x > R.minX && p.x < R.maxX && p.z > R.minZ && p.z < R.maxZ, 'inside the compound');
  }
});

test('a head shot wakes, kills and pays (a hit, a kill, the head); a body shot only wounds a walker', () => {
  const g = game(3);
  const z = g.horde.spawnRising('walker', new Vec3(0, 0, -14), 0, 260, 'walk');
  run(g, 2);
  const p0 = g.points;
  const inp = idle();
  inp.fire = true;
  inp.ads = true;
  // (a walker coming on holds its arms up before its face: it may take a second round)
  let kill = null, shots = 0;
  for (let k = 0; k < 4 && !kill; k++) {
    g.arsenal.state = 'idle';
    g.gun.cool = 0;
    g.arsenal.adsAmount = 1;
    aimAt(g, z.person.rd.segments.head.body.pos);
    shots++;
    run(g, 1.5, (t) => (t < DT ? inp : idle()), (t, ev) => {
      for (const e of ev) if (e.type === 'kill') kill = e;
    });
  }
  assert.ok(kill, 'killed');
  assert.ok(kill.head);
  assert.equal(g.points - p0, 10 * shots + 50 + 50);
  assert.ok(z.state === 'dead' || z.state === 'frozen');
  // a chest shot with the pistol: the walker goes down or staggers, and comes on
  const y = g.horde.spawnRising('walker', new Vec3(4, 0, -14), 0, 260, 'walk');
  run(g, 2.5);
  g.arsenal.state = 'idle';
  aimAt(g, y.person.rd.segments.chest.body.pos);
  run(g, 0.05, (t) => (t < DT ? inp : idle()));
  assert.ok(y.alive, 'one pistol round to the chest does not finish a walker');
  assert.ok(y.person.injury.hp < 260);
});

test('barricades: points open the next area (and the player may walk in); the ones between open areas fall by themselves', () => {
  const g = game(4);
  const pl = g.player;
  const north = DOORS.find((d) => d.id === 'd-farm');
  assert.ok(!g.allowedAt(2, -40), 'the farm is closed');
  pl.pos.set(north.pos[0], 0, north.pos[1] + 1.2);
  g.points = 900;
  g.updatePrompt();
  assert.equal(g.prompt.kind, 'door');
  assert.ok(!g.prompt.can, 'cannot afford it');
  assert.ok(!g.use());
  g.points = 5000;
  assert.ok(g.use());
  assert.equal(g.points, 5000 - north.price);
  assert.ok(g.open.has('farm') && g.allowedAt(2, -40));
  // walk north into the farm
  const walk = idle();
  walk.move.z = 1;
  pl.yaw = 0;
  run(g, 3, walk);
  assert.ok(pl.pos.z < -40, `walked in to z=${pl.pos.z.toFixed(1)}`);
  // the chase field reaches the farm
  g.chase.rebuild(pl.pos.x, pl.pos.z);
  assert.ok(isFinite(g.chase.distanceAt(40, -110)));
  // open the highway from the Lookout: the farm-highway barricade comes down by itself
  pl.pos.set(33.4, 0, 0);
  let autos = 0;
  g.updatePrompt();
  assert.equal(g.prompt.id, 'd-highway');
  g.use();
  for (const e of g.drainEvents()) if (e.type === 'doorOpened' && e.auto) autos++;
  assert.ok(g.doorsOpen.has('d-farm-h') && autos === 1);
});

test('the player cannot walk through a wreck or out of the open ground, but walks through the open gates', () => {
  const g = game(5);
  const pl = g.player;
  // the pickup wreck inside the compound sits at 45 degrees: walk into its flank
  pl.pos.set(-3.0, 0, -3.0);
  pl.yaw = Math.atan2(3, 3); // facing (-1, -1)/sqrt2 ... toward the wreck's middle
  const walk = idle();
  walk.move.z = 1;
  run(g, 2, walk);
  const d = Math.hypot(pl.pos.x + 5, pl.pos.z + 5);
  assert.ok(d > 0.9, `stopped by the wreck (${d.toFixed(2)} m from its middle)`);
  // the Lookout's edge: walking east out of it stops at the line
  pl.pos.set(30, 0, 10);
  pl.yaw = -Math.PI / 2;
  run(g, 3, walk);
  assert.ok(pl.pos.x < 35 && pl.pos.x > 33, `held at x=${pl.pos.x.toFixed(2)}`);
  // out of the compound through the south gate
  pl.pos.set(0, 0, 4);
  pl.yaw = Math.PI;
  run(g, 3, walk);
  assert.ok(pl.pos.z > 9, `out of the gate at z=${pl.pos.z.toFixed(2)}`);
});

test('guns: lockers sell a gun into a free hand, then in place of the one held; ammunition at half price', () => {
  const g = game(6);
  const pl = g.player;
  g.points = 10000;
  const smg = LOCKERS.find((l) => l.id === 'l-smg');
  pl.pos.set(smg.pos[0], 0, smg.pos[1] + 1);
  g.updatePrompt();
  assert.equal(g.prompt.kind, 'locker');
  assert.ok(g.use());
  assert.deepEqual(g.arsenal.guns.map((x) => x.type), ['pistol', 'smg']);
  run(g, 1.2);
  assert.equal(g.gun.type, 'smg');
  // ammunition at half price
  g.gun.spare = 0;
  const p0 = g.points;
  g.use();
  assert.equal(p0 - g.points, Math.round(smg.price / 2));
  assert.equal(g.gun.spare, g.gun.reserve);
  // a third gun goes in place of the SMG in hand
  const rev = LOCKERS.find((l) => l.id === 'l-revolver');
  pl.pos.set(rev.pos[0], 0, rev.pos[1] + 1);
  g.use();
  assert.deepEqual(g.arsenal.guns.map((x) => x.type), ['pistol', 'revolver']);
});

test('the crate hands out a random gun to take; after a few rolls it moves on and refunds the roll', () => {
  const g = game(7);
  const pl = g.player;
  g.points = 50000;
  g.open.add('farm');
  g.updateOpen();
  const C = g.crate;
  pl.pos.set(C.spot.pos[0] + 1.2, 0, C.spot.pos[1]);
  C.movesAt = 3;
  g.maxSlots = 3;
  const got = [];
  for (let k = 0; k < 2; k++) {
    g.updatePrompt();
    assert.equal(g.prompt.kind, 'crate');
    assert.ok(g.use());
    run(g, 3.7);
    assert.equal(C.state, 'offer');
    g.updatePrompt();
    assert.equal(g.prompt.kind, 'crateTake');
    got.push(C.gun);
    assert.ok(GUNS[C.gun]);
    g.use();
    run(g, 0.8);
  }
  assert.ok(got.every((t) => g.ownsGun(t)), got.join());
  // the third roll: off it goes
  const spot0 = C.spot, p0 = g.points;
  g.use();
  run(g, 3.7);
  assert.equal(C.state, 'leaving');
  assert.equal(g.points, p0, 'refunded');
  run(g, 5.5);
  assert.equal(C.state, 'idle');
  assert.notEqual(C.spot, spot0);
});

test('field kits and the gunsmith: Kevlar, Quick Hands, Third Arm; a rebuilt gun hits harder from a bigger magazine', () => {
  const g = game(8);
  const pl = g.player;
  g.points = 50000;
  for (const id of ['farm', 'highway', 'orchard', 'corn', 'village', 'river']) g.open.add(id);
  g.updateOpen();
  const at = (pos) => pl.pos.set(pos[0] + 1, 0, pos[1]);
  at(PERKS.find((p) => p.id === 'kevlar').pos);
  g.use();
  assert.equal(pl.maxHealth, HERO.kevlarHp);
  at(PERKS.find((p) => p.id === 'quick').pos);
  g.use();
  assert.equal(g.gun.reload, GUNS.pistol.reload * 0.5);
  at(PERKS.find((p) => p.id === 'thirdArm').pos);
  g.use();
  assert.equal(g.maxSlots, 3);
  at(BENCH.pos);
  run(g, 0.6);
  const before = g.gun;
  assert.ok(g.use());
  assert.ok(g.gun.up && g.gun.mag > before.mag && g.gun.key === 'pistol+');
  g.updatePrompt();
  assert.ok(g.prompt.disabled, 'one rebuild per gun');
  // the rebuilt pistol against the stock one: wrecking damage to a walker's chest
  const dmg = (type) => {
    const h = game(9);
    const z = h.horde.spawnRising('walker', new Vec3(0, 0, -6), 0, 5000, 'walk');
    run(h, 2);
    h.arsenal.guns = [h.makeGun('pistol', type === 'up')];
    h.arsenal.index = 0;
    h.arsenal.state = 'idle';
    aimAt(h, z.person.rd.segments.chest.body.pos);
    const inp = idle();
    inp.fire = true;
    run(h, 0.05, (t) => (t < DT ? inp : idle()));
    return 5000 - z.person.injury.hp;
  };
  const a = dmg('stock'), b = dmg('up');
  assert.ok(b > a * 1.6, `rebuilt ${b.toFixed(0)} vs stock ${a.toFixed(0)}`);
});

test('pickups: ammunition refills, FURY kills with any hit, the SHOCKWAVE drops every one of the dead', () => {
  const g = game(10);
  const pl = g.player;
  g.gun.spare = 3;
  g.grenades = 0;
  const p = g.dropPickup(new Vec3(pl.pos.x + 0.5, 0, pl.pos.z));
  p.kind = 'ammo';
  run(g, 0.1);
  assert.equal(g.gun.spare, g.gun.reserve);
  assert.equal(g.grenades, HERO.maxGrenades);
  // fury: one pistol round to the chest of a 5000 hp walker kills it
  const f = g.dropPickup(new Vec3(pl.pos.x, 0, pl.pos.z + 0.5));
  f.kind = 'fury';
  run(g, 0.1);
  assert.ok(g.buffs.fury > g.time);
  const z = g.horde.spawnRising('walker', new Vec3(0, 0, -10), 0, 5000, 'walk');
  run(g, 2);
  g.arsenal.state = 'idle';
  aimAt(g, z.person.rd.segments.chest.body.pos);
  const inp = idle();
  inp.fire = true;
  run(g, 0.3, (t) => (t < DT ? inp : idle()));
  assert.ok(!z.alive, 'fury kill');
  // the shockwave
  const zs = [[20, 20], [-25, 10], [10, -30]].map(([x, zz]) => g.horde.spawnRising('walker', new Vec3(x, 0, zz), 0, 5000, 'walk'));
  run(g, 1);
  const s = g.dropPickup(new Vec3(pl.pos.x - 0.5, 0, pl.pos.z));
  s.kind = 'shockwave';
  const p0 = g.points;
  run(g, 2.5);
  assert.ok(zs.every((x) => !x.alive), 'all dead');
  assert.ok(g.points >= p0 + 400);
});

test('a grenade bounces, goes off and throws the dead around it', () => {
  const g = game(11);
  const pl = g.player;
  const zs = [0, 1, 2].map((i) => g.horde.spawnRising('walker', new Vec3(-1 + i, 0, -9), 0, 260, 'walk'));
  run(g, 1.6);
  for (const z of zs) {
    z.root.pos.z = -9; // (hold them still)
  }
  aimAt(g, new Vec3(0, 0, -9));
  const inp = idle();
  inp.pressed = new Set(['KeyG']);
  let boom = null, bounced = false;
  run(g, 3.5, (t) => (t < DT ? inp : idle()), (t, ev) => {
    for (const e of ev) {
      if (e.type === 'explosion') boom = e;
      if (e.type === 'grenadeBounce') bounced = true;
    }
    for (const z of zs) if (z.animated && z.state === 'walk') z.root.pos.z = -9;
  });
  assert.ok(boom, 'went off');
  assert.ok(bounced);
  assert.ok(Math.hypot(boom.pos.x, boom.pos.z + 9) < 4.5, `landed at ${boom.pos.x.toFixed(1)},${boom.pos.z.toFixed(1)}`);
  assert.ok(zs.filter((z) => !z.alive).length >= 2, 'it killed');
  assert.equal(g.grenades, HERO.grenades - 1);
});

test('rounds: a marksman clears round 1, the break, then round 2 comes with more of them', () => {
  const g = new HoldoutGame({ layout: LAYOUT, shape, walkGrid, rng: makeRng(12) });
  const bot = marksman(g);
  const spawned = {};
  let ended = 0;
  run(g, 200, bot, (t, ev) => {
    for (const e of ev) {
      if (e.type === 'zombieSpawned') spawned[g.round] = (spawned[g.round] || 0) + 1;
      if (e.type === 'roundEnd') ended = e.n;
    }
    // (the marksman is not tested here: keep him alive)
    g.player.health = g.player.maxHealth;
    if (g.round === 2 && g.phase === 'fight' && (spawned[2] || 0) >= 3) return false;
  });
  assert.equal(ended, 1, 'round 1 over');
  assert.equal(spawned[1], ROUNDS.count(1));
  assert.ok(g.round === 2 && ROUNDS.count(2) > ROUNDS.count(1));
  assert.ok(g.stats.kills >= ROUNDS.count(1));
  assert.ok(g.points > 500 + ROUNDS.count(1) * 60);
});

test('the player dies when overrun: game over with the round reached', () => {
  const g = game(13);
  for (let i = 0; i < 6; i++) g.horde.spawnRising('walker', new Vec3(Math.cos(i) * 6, 0, 2.5 + Math.sin(i) * 6), 0, 260, 'jog');
  let over = null;
  run(g, 40, idle, (t, ev) => {
    for (const e of ev) if (e.type === 'over') over = e;
    if (over) return false;
  });
  assert.ok(over, 'dead');
  assert.ok(!g.player.alive);
});

test('30 animated zombies chasing the player cost little per step', () => {
  const g = game(14);
  g.open = new Set(AREAS.map((a) => a.id));
  g.updateOpen();
  g.chase.rebuild(g.player.pos.x, g.player.pos.z);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    g.horde.spawnRising('walker', new Vec3(Math.cos(a) * 60, 0, Math.sin(a) * 60), a + Math.PI, 260, 'walk');
  }
  run(g, 2);
  const t0 = performance.now();
  const walk = idle();
  walk.move.z = 1;
  run(g, 3, (t) => {
    g.player.yaw = t * 0.8; // walking in circles: the field keeps rebuilding
    return walk;
  });
  const ms = (performance.now() - t0) / 180;
  assert.ok(ms < 5, `${ms.toFixed(2)} ms per step`);
});

void raycastPeople;

test('a head shot does not drop them on the spot: they stumble on for a moment, then go down dead', () => {
  let ok = 0, tried = 0;
  for (const seed of [21, 22, 23, 24]) {
    const g = game(seed);
    const z = g.horde.spawnRising('walker', new Vec3(0, 0, -8), 0, 260, 'walk');
    run(g, 2.5, idle, () => {
      g.player.health = g.player.maxHealth;
    });
    let mortal = null;
    for (let k = 0; k < 4 && !mortal; k++) {
      g.arsenal.state = 'idle';
      g.gun.cool = 0;
      g.arsenal.adsAmount = 1;
      aimAt(g, z.person.rd.segments.head.body.pos);
      const inp = idle();
      inp.fire = true;
      inp.ads = true;
      run(g, 0.4, (t) => (t < DT ? inp : idle()), (t, ev) => {
        g.player.health = g.player.maxHealth;
        for (const e of ev) if (e.type === 'sandbox' && e.fx.type === 'injury' && e.fx.event.type === 'mortal') mortal = { t: g.time, p: z.person.rd.pelvis.pos.clone() };
      });
    }
    if (!mortal) continue;
    tried++;
    const stillUp = z.alive || g.time - mortal.t > 0.3;
    let deadAt = null;
    run(g, 3, idle, () => {
      g.player.health = g.player.maxHealth;
      if (deadAt === null && !z.alive) deadAt = g.time;
    });
    const moved = Math.hypot(z.person.rd.pelvis.pos.x - mortal.p.x, z.person.rd.pelvis.pos.z - mortal.p.z);
    if (stillUp && deadAt !== null && deadAt - mortal.t > 0.3 && deadAt - mortal.t < 2 && moved > 0.25 && z.person.rd.pelvis.pos.y < 0.5) ok++;
  }
  assert.ok(tried >= 2, `brain hits in ${tried}/4`);
  assert.ok(ok >= tried - 1, `stumbled then dropped in ${ok}/${tried}`);
});
