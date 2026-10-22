// Headless simulation tests (no browser needed): npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, SCENARIOS } from '../src/world/mapgen.js';
import { World } from '../src/sim/world.js';
import { attachAI } from '../src/ai/index.js';
import { WeaponMount } from '../src/sim/mount.js';
import { ballisticAngle, segSegClosest, segOBB } from '../src/core/math.js';
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
