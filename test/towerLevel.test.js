// Last Lookout level: the layout's gameplay shape (spawns reach the gates, chokepoints, budgets)
// and the render modules' import hygiene (no DOM at module load).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, isWalkable, isWater, buildWalkGrid, riverZ, riverW } from '../src/tower/level/layout.js';

const CELL = 1; // m, BFS grid

function bfsFromGates(grid) {
  const { nx, nz, minX, minZ, cell, data } = grid;
  const dist = new Int32Array(nx * nz).fill(-1);
  const queue = new Int32Array(nx * nz);
  let qh = 0, qt = 0;
  for (const g of LAYOUT.compound.gates) {
    // the attack spot: 1 m outside the gate's middle
    const mx = (g.a[0] + g.b[0]) / 2 + g.normal[0] * 1.0, mz = (g.a[1] + g.b[1]) / 2 + g.normal[1] * 1.0;
    const i = Math.floor((mx - minX) / cell), j = Math.floor((mz - minZ) / cell);
    const k = j * nx + i;
    assert.equal(data[k], 1, `gate ${g.id} attack spot walkable`);
    if (dist[k] < 0) { dist[k] = 0; queue[qt++] = k; }
  }
  while (qh < qt) {
    const k = queue[qh++];
    const i = k % nx, j = (k / nx) | 0;
    const d = dist[k] + 1;
    if (i > 0 && data[k - 1] && dist[k - 1] < 0) { dist[k - 1] = d; queue[qt++] = k - 1; }
    if (i < nx - 1 && data[k + 1] && dist[k + 1] < 0) { dist[k + 1] = d; queue[qt++] = k + 1; }
    if (j > 0 && data[k - nx] && dist[k - nx] < 0) { dist[k - nx] = d; queue[qt++] = k - nx; }
    if (j < nz - 1 && data[k + nx] && dist[k + nx] < 0) { dist[k + nx] = d; queue[qt++] = k + nx; }
  }
  return dist;
}

function gridFromIsWalkable(cell) {
  const B = LAYOUT.bounds;
  const nx = Math.floor((B.maxX - B.minX) / cell), nz = Math.floor((B.maxZ - B.minZ) / cell);
  const data = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) data[j * nx + i] = isWalkable(B.minX + (i + 0.5) * cell, B.minZ + (j + 0.5) * cell) ? 1 : 0;
  }
  return { nx, nz, minX: B.minX, minZ: B.minZ, cell, data };
}

test('level: every spawn reaches a gate over the walkable ground (isWalkable BFS)', () => {
  const grid = gridFromIsWalkable(CELL);
  const dist = bfsFromGates(grid);
  for (const s of LAYOUT.spawns) {
    const i = Math.floor((s.pos[0] - grid.minX) / CELL), j = Math.floor((s.pos[1] - grid.minZ) / CELL);
    const d = dist[j * grid.nx + i];
    assert.ok(d > 0, `spawn ${s.id} (${s.label}) has a route to a gate`);
    // a route is never absurdly long (no maze): under 2.2x the straight distance
    assert.ok(d * CELL < Math.hypot(s.pos[0], s.pos[1]) * 2.2, `spawn ${s.id}: route ${d} m`);
  }
});

test('level: the river splits the valley; the spawns beyond it need a bridge', () => {
  // open water is not walkable, a bridge deck is
  for (let x = -240; x <= 240; x += 20) {
    if (LAYOUT.bridges.some((b) => x >= b.minX - 1 && x <= b.maxX + 1)) continue;
    assert.equal(isWalkable(x, riverZ(x)), false, `water at x=${x}`);
    assert.equal(isWater(x, riverZ(x)), true);
  }
  for (const b of LAYOUT.bridges) {
    const x = (b.minX + b.maxX) / 2;
    assert.equal(isWater(x, riverZ(x)), false, `bridge ${b.id} deck is not water`);
    assert.ok(riverZ(x) - riverW(x) > b.minZ && riverZ(x) + riverW(x) < b.maxZ, `bridge ${b.id} spans the water`);
  }
  // with the bridges closed, the southern spawns are cut off (they really are chokepoints)
  const saved = LAYOUT.bridges.splice(0);
  try {
    const grid = gridFromIsWalkable(2);
    const dist = bfsFromGates(grid);
    const south = LAYOUT.spawns.filter((s) => s.pos[1] > riverZ(s.pos[0]));
    assert.ok(south.length >= 2, 'some spawns are across the river');
    for (const s of south) {
      const i = Math.floor((s.pos[0] - grid.minX) / 2), j = Math.floor((s.pos[1] - grid.minZ) / 2);
      assert.ok(dist[j * grid.nx + i] < 0, `spawn ${s.id} only reaches the tower over a bridge`);
    }
  } finally {
    LAYOUT.bridges.push(...saved);
  }
});

test('level: budgets and schema', () => {
  assert.ok(LAYOUT.colliders.length <= 150, `colliders ${LAYOUT.colliders.length} <= 150`);
  for (const c of LAYOUT.colliders) {
    assert.equal(c.c.length, 3);
    assert.equal(c.h.length, 3);
    for (const v of [...c.c, ...c.h, c.yaw]) assert.ok(Number.isFinite(v), `collider ${c.kind} finite`);
    assert.ok(c.h[0] > 0 && c.h[1] > 0 && c.h[2] > 0);
    assert.ok(typeof c.kind === 'string' && typeof c.material === 'string');
    assert.ok(c.c[1] - c.h[1] > -0.01, `${c.kind} rests on the ground or above`);
  }
  assert.ok(LAYOUT.spawns.length >= 8);
  for (const s of LAYOUT.spawns) {
    const r = Math.hypot(s.pos[0], s.pos[1]);
    assert.ok(r >= 170 && r <= 250, `spawn ${s.id} at ${r.toFixed(0)} m`);
    assert.ok(isWalkable(s.pos[0], s.pos[1]), `spawn ${s.id} walkable`);
    assert.ok(Math.abs(Math.hypot(s.dir[0], s.dir[1]) - 1) < 0.02, `spawn ${s.id} dir is a unit vector`);
    // facing roughly toward the tower
    assert.ok(-(s.dir[0] * s.pos[0] + s.dir[1] * s.pos[1]) / r > 0.7, `spawn ${s.id} faces the valley`);
  }
  const B = LAYOUT.bounds;
  assert.ok(B.minX >= -260 && B.maxX <= 260 && B.minZ >= -260 && B.maxZ <= 260);
  assert.ok(LAYOUT.floodlightMounts.length >= 4 && LAYOUT.floodlightMounts.length <= 6);
  assert.equal(new Set(LAYOUT.floodlightMounts.map((m) => m.id)).size, LAYOUT.floodlightMounts.length);
  assert.ok(LAYOUT.barrelSpots.length >= 6 && LAYOUT.barrelSpots.length <= 10);
  for (const [x, z] of LAYOUT.barrelSpots) assert.ok(isWalkable(x, z, 0.5), `barrel spot ${x},${z} free`);
  assert.ok(LAYOUT.trapZones.length > 0);
  for (const t of LAYOUT.trapZones) assert.ok(Math.max(Math.abs(t.minX), Math.abs(t.maxX), Math.abs(t.minZ), Math.abs(t.maxZ)) <= 155);
  assert.ok(LAYOUT.cover.cornfield.length > 0);
  for (const m of LAYOUT.rangeMarkers) assert.ok(Math.abs(Math.hypot(m.pos[0], m.pos[1]) - m.dist) < 7, `marker ${m.dist}`);
  const dists = new Set(LAYOUT.rangeMarkers.map((m) => m.dist));
  for (const d of [100, 150, 200, 250]) assert.ok(dists.has(d), `a ${d} m marker`);
  const sm = LAYOUT.sentryMount;
  assert.equal(sm.pos.length, 3);
  assert.ok(sm.arc[0] < sm.arc[1]);
  const T = LAYOUT.tower;
  assert.equal(T.legs.length, 4);
  assert.equal(T.legTop.length, 4);
  assert.ok(T.eye[1] > T.cabin.floorY + 1.2 && T.eye[1] < T.cabin.floorY + 2);
  assert.ok(Math.abs(T.eye[0]) < T.cabin.half[0] && Math.abs(T.eye[2]) < T.cabin.half[1]);
});

test('level: gates match their colliders', () => {
  const gates = LAYOUT.compound.gates;
  assert.equal(gates.length, 4);
  assert.deepEqual(gates.map((g) => g.id).sort(), ['east', 'north', 'south', 'west']);
  for (const g of gates) {
    const col = LAYOUT.colliders.filter((c) => c.kind === 'gate' && c.gate === g.id);
    assert.equal(col.length, 1, `one collider for gate ${g.id}`);
    const c = col[0];
    const mx = (g.a[0] + g.b[0]) / 2, mz = (g.a[1] + g.b[1]) / 2;
    assert.ok(Math.abs(c.c[0] - mx) < 0.05 && Math.abs(c.c[2] - mz) < 0.05, `gate ${g.id} collider centred on the gate`);
    const half = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) / 2;
    const along = Math.abs(g.b[0] - g.a[0]) > Math.abs(g.b[1] - g.a[1]) ? c.h[0] : c.h[2];
    assert.ok(Math.abs(along - half) < 0.05, `gate ${g.id} collider spans the opening`);
    // the normal points out of the compound
    assert.ok(g.normal[0] * mx + g.normal[1] * mz > 0);
    // the gate seals the fence: the gate line's middle is blocked, the outside attack spot is free
    assert.equal(isWalkable(mx, mz), false);
    assert.equal(isWalkable(mx + g.normal[0] * 1.2, mz + g.normal[1] * 1.2), true);
  }
  // the compound is sealed: from inside, nothing reaches outside without a gate collider removed
  const grid = gridFromIsWalkable(0.5);
  const { nx, minX, minZ, data } = grid;
  const k0 = Math.floor((0 - minZ) / 0.5) * nx + Math.floor((-5.5 - minX) / 0.5); // inside, west of the legs
  assert.equal(data[k0], 1);
  const seen = new Uint8Array(data.length);
  const stack = [k0];
  seen[k0] = 1;
  let escaped = false;
  while (stack.length && !escaped) {
    const k = stack.pop();
    const i = k % nx, j = (k / nx) | 0;
    const x = minX + (i + 0.5) * 0.5, z = minZ + (j + 0.5) * 0.5;
    if (Math.abs(x) > 9 || Math.abs(z) > 9) escaped = true;
    for (const n of [k - 1, k + 1, k - nx, k + nx]) if (data[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
  }
  assert.equal(escaped, false, 'the compound fence and gates are closed');
});

test('level: buildWalkGrid agrees with isWalkable', () => {
  const g = buildWalkGrid(1);
  let checked = 0;
  for (let j = 0; j < g.nz; j += 3) {
    for (let i = 0; i < g.nx; i += 3) {
      const x = g.minX + (i + 0.5) * g.cell, z = g.minZ + (j + 0.5) * g.cell;
      assert.equal(g.data[j * g.nx + i] === 1, isWalkable(x, z), `cell ${x},${z}`);
      checked++;
    }
  }
  assert.ok(checked > 20000);
});

test('level & render modules: no DOM at module load', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
  const mods = ['retro', 'textures', 'levelScene', 'sky', 'props', 'ambience'];
  for (const m of mods) {
    const mod = await import(`../src/tower/render/${m}.js`);
    assert.ok(Object.keys(mod).length > 0, `${m}.js exports something`);
  }
  const ls = await import('../src/tower/render/levelScene.js');
  assert.equal(typeof ls.buildLevelScene, 'function');
  const rr = await import('../src/tower/render/retro.js');
  assert.equal(typeof rr.RetroRenderer, 'function');
});
