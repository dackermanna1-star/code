// Headless simulation tests (no browser needed): npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, SCENARIOS } from '../src/world/mapgen.js';
import { World } from '../src/sim/world.js';
import { attachAI } from '../src/ai/index.js';
import { WeaponMount } from '../src/sim/mount.js';
import { ballisticAngle, segSegClosest, segOBB, angleDiff } from '../src/core/math.js';
import { damageStructure } from '../src/sim/damage.js';
import { rng } from '../src/core/rng.js';
import { MOVE_INF, MOVE_TRACK } from '../src/world/nav.js';

test('every scenario generates a playable map', () => {
  for (const id of Object.keys(SCENARIOS)) {
    const m = generateMap(id, 7);
    assert.ok(m.objectives.length >= 3, `${id}: objectives`);
    assert.ok(m.deploy[0] && m.deploy[1], `${id}: deployment zones`);
    assert.ok(m.structures.list.length > 50, `${id}: structures`);
    assert.ok(m.trees.list.length > 1000, `${id}: trees`);
    for (const o of m.objectives) {
      assert.ok(Number.isFinite(o.y), `${id}: objective height`);
      assert.ok(Math.abs(o.x) < 1000 && Math.abs(o.z) < 1000, `${id}: objective inside the map`);
    }
    for (let i = 0; i < m.terrain.h.length; i += 997) assert.ok(Number.isFinite(m.terrain.h[i]), `${id}: finite heights`);
  }
});

test('paths connect both deployment zones to every objective', () => {
  const m = generateMap('town', 11);
  const w = new World(m, {});
  for (const d of m.deploy) {
    for (const o of w.objectives) {
      const p = w.nav.findPath(d.x, d.z, o.x, o.z, MOVE_INF, {});
      assert.ok(p && p.length >= 2, 'infantry path');
      const end = p[p.length - 1];
      assert.ok(Math.hypot(end.x - o.x, end.z - o.z) < 40, 'infantry path reaches the objective');
      const pv = w.nav.findPath(d.x, d.z, o.x, o.z, MOVE_TRACK, {});
      assert.ok(pv && pv.length >= 2, 'tracked path');
    }
  }
});

test('weapon mount fires bursts, pauses and reloads', () => {
  rng.seed(3);
  const m = new WeaponMount('lmg_556', null, 'hand');
  let shots = 0;
  let t = 0;
  while (t < 20) {
    m.update(0.016);
    shots += m.pull(0.016);
    t += 0.016;
  }
  // 800 rpm cyclic but with pauses between bursts: well below 266 rounds in 20 s.
  assert.ok(shots > 60 && shots < 266, `shots ${shots}`);
  const rpg = new WeaponMount('rpg', null, 'hand');
  assert.equal(rpg.pull(0.016), 1);
  assert.equal(rpg.pull(0.016), 0, 'single-shot launcher must reload');
  assert.ok(rpg.reloading);
});

test('math helpers', () => {
  const a = ballisticAngle(100, 500, 0, false);
  // Flat range for 100 m/s at angle a: v^2 sin(2a)/g = 500
  assert.ok(Math.abs((100 * 100 * Math.sin(2 * a)) / 9.81 - 500) < 0.5);
  const r = segSegClosest(0, 0, 0, 10, 0, 0, 5, 1, -1, 5, 1, 1);
  assert.ok(Math.abs(r.d2 - 1) < 1e-9);
  const h = segOBB(-10, 1, 0, 20, 0, 0, 0, 1, 0, 1, 1, 1, 0);
  assert.ok(h && Math.abs(h.t - 0.45) < 1e-9 && h.axis === 0 && h.sign === -1);
});

test('a full AI battle runs, fights and stays numerically sane', () => {
  rng.seed(42);
  const m = generateMap('valley', 42);
  const w = new World(m, { tickets: 800 });
  const army = { size: 300, infantry: 1, armor: 1, air: 1, artillery: 1, drones: 1, reinforcements: true };
  attachAI(w, [army, army]);
  assert.ok(w.units.length > 300, `spawned ${w.units.length}`);
  const kinds = new Set(w.units.map((u) => u.type));
  for (const k of ['rifleman', 'mbt', 'ifv', 'spg']) assert.ok(kinds.has(k), `has ${k}`);
  let shots = 0;
  let explosions = 0;
  let kills = 0;
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 150; i++) {
    w.update(dt);
    for (const e of w.events) {
      if (e.t === 'fire') shots++;
      else if (e.t === 'explosion') explosions++;
      else if (e.t === 'kill') kills++;
    }
    w.events.length = 0;
  }
  for (const u of w.units) {
    assert.ok(Number.isFinite(u.pos.x) && Number.isFinite(u.pos.y) && Number.isFinite(u.pos.z), `${u.type} position is finite`);
  }
  assert.ok(shots > 500, `shots fired: ${shots}`);
  assert.ok(explosions > 10, `explosions: ${explosions}`);
  assert.ok(kills > 10, `kills: ${kills}`);
  // Squads moved off their start lines.
  const moved = w.factions[0].squads.filter((s) => s.order).length;
  assert.ok(moved > 3, 'squads received orders');
});

test('a downed soldier bleeds out unless a squadmate treats him', () => {
  rng.seed(9);
  const m = generateMap('valley', 9);
  const w = new World(m, { tickets: 800 });
  const army = { size: 250, infantry: 1, armor: 1, air: 0, artillery: 0, drones: 0, reinforcements: false };
  attachAI(w, [army, army]);
  const sq = w.factions[0].squads.find((s) => s.members && s.members.length >= 6 && !s.mounted);
  const p = sq.members[2];
  w.downSoldier(p, null, null);
  assert.ok(p.alive && p.downed && p.dying, 'down but alive');
  assert.ok(!sq.members.includes(p), 'out of the squad');
  p.downed.bleed = 1e9; // long enough for help to arrive
  let helped = false;
  for (let i = 0; i < 30 * 40 && !p.downed.stable; i++) {
    w.update(1 / 30);
    w.events.length = 0;
    if (sq.members.some((x) => x.task && x.task.type === 'aid' && x.task.patient === p)) helped = true;
  }
  assert.ok(helped, 'a squadmate went to help');
  assert.ok(p.downed.stable && p.alive, 'bleeding stopped');
  // Without help the wound is fatal.
  const q = sq.members[3];
  w.downSoldier(q, null, null);
  q.downed.bleed = 0.5;
  q.downed.stable = false;
  for (let i = 0; i < 30; i++) w.update(1 / 30);
  assert.ok(!q.alive, 'bled out');
});

test('buildings break down in stages before collapsing', () => {
  const m = generateMap('town', 4);
  const w = new World(m, {});
  const s = m.structures.list.find((b) => b.kind === 'building' && b.h > 6);
  const full = s.solidH;
  const hit = (k) => damageStructure(w, s, s.maxHp * k, null);
  hit(0.35);
  assert.equal(s.stage, 1, 'holed');
  hit(0.35);
  assert.equal(s.stage, 2, 'roof and upper floors gone');
  assert.ok(s.solidH < full && s.solidH === s.ruinH, 'lower shell');
  assert.ok(w.events.some((e) => e.t === 'building_ruined'));
  hit(0.4);
  assert.ok(s.destroyed && s.solidH === s.rubbleH, 'collapsed to rubble');
});

test('a soldier played by a person ignores his AI and squad and goes where he is steered', () => {
  rng.seed(4);
  const m = generateMap('valley', 4);
  const w = new World(m, { tickets: 800 });
  const army = { size: 250, infantry: 1, armor: 1, air: 0, artillery: 0, drones: 0, reinforcements: false };
  attachAI(w, [army, army]);
  const sq = w.factions[0].squads.find((s) => s.members && s.members.length >= 6 && !s.mounted);
  const u = sq.leader;
  u.player = { damageScale: 0.5 };
  u.ctrl = { x: 1, z: 0, mode: 'run' };
  u.stop();
  u.yaw = 1.2;
  const x0 = u.pos.x;
  const z0 = u.pos.z;
  for (let i = 0; i < 60; i++) {
    w.update(1 / 30);
    w.events.length = 0;
  }
  assert.ok(u.pos.x - x0 > 4, `moved east ${(u.pos.x - x0).toFixed(1)} m`);
  assert.ok(Math.abs(u.pos.z - z0) < 2.5, 'kept to the steered line');
  assert.equal(u.yaw, 1.2, 'the player turns him, not the AI');
  assert.notEqual(sq.leader, u, 'the squad picks another leader');
  // The player takes reduced damage.
  const hp = u.hp;
  w.damageSoldier(u, 20, null, null, false);
  assert.equal(hp - u.hp, 10);
});

test('a player drives a tank, flies a helicopter and steers a jet', () => {
  rng.seed(5);
  const m = generateMap('valley', 5);
  const w = new World(m, { tickets: 800 });
  const army = { size: 250, infantry: 1, armor: 1, air: 0, artillery: 0, drones: 0, reinforcements: false };
  attachAI(w, [army, army]);
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      w.update(1 / 30);
      w.events.length = 0;
    }
  };
  // Tank: full throttle, no steering, then a right turn.
  const tank = w.units.find((u) => u.type === 'mbt' && u.alive);
  tank.player = {};
  tank.ctrl = { throttle: 1, steer: 0 };
  const yaw0 = tank.yaw;
  const p0 = tank.pos.clone();
  step(90);
  const fwd = (tank.pos.x - p0.x) * Math.sin(yaw0) + (tank.pos.z - p0.z) * Math.cos(yaw0);
  assert.ok(fwd > 8, `tank drove forward ${fwd.toFixed(1)} m`);
  assert.ok(Math.abs(angleDiff(yaw0, tank.yaw)) < 0.05, 'and kept straight');
  tank.ctrl.steer = 1;
  const y1 = tank.yaw;
  step(30);
  assert.ok(angleDiff(y1, tank.yaw) < -0.3, 'steering right turns right (yaw decreases)');
  // Helicopter: climb straight up and turn to a heading.
  const heli = w.spawnUnit('attack_heli', 0, 0, 0, {});
  heli.pos.y = w.terrain.heightAt(0, 0) + 40;
  heli.player = {};
  heli.ctrl = { vx: 0, vz: 0, vy: 8, yaw: 1 };
  const h0 = heli.pos.y;
  step(60);
  assert.ok(heli.pos.y > h0 + 6, 'helicopter climbs');
  step(90); // turning at its own rate
  assert.ok(Math.abs(angleDiff(1, heli.yaw)) < 0.2, 'helicopter turns to the heading');
  // Jet: flies toward where the player looks.
  const jet = w.spawnUnit('jet', 0, 0, 0, {});
  jet.pos.y = w.terrain.heightAt(0, 0) + 500;
  jet.speed = 200;
  jet.yaw = 0;
  jet.player = {};
  jet.ctrl = { dx: 1, dy: 0, dz: 0, speed: 220 };
  step(150);
  assert.ok(jet.alive, 'jet still flying');
  assert.ok(Math.abs(angleDiff(Math.PI / 2, jet.yaw)) < 0.2, `jet turned east (${jet.yaw.toFixed(2)})`);
});
