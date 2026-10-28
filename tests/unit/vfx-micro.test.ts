// Unit tests: micro-debris chunk meshes + ballistic simulation (pure modules, Node).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChunk, SHAPE_COUNT, SHAPE_HALF } from "../../src/vfx/chunks.ts";
import { MicroSim, MICRO_KIND_INDEX, DirtyRanges, type MicroSpawn } from "../../src/vfx/microSim.ts";

const FIXED_DT = 1 / 60;

function spawnArgs(kind: string, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, size = 0.015): MicroSpawn {
  return { kind: MICRO_KIND_INDEX[kind], x, y, z, vx, vy, vz, size, r: 1, g: 1, b: 1, a: 1, s0: 3, s1: 0, s2: 0.5, s3: 0 };
}

test("chunk meshes: valid, normalised, outward normals, Babylon front-face winding", () => {
  for (let s = 0; s < SHAPE_COUNT; s++) {
    const g = buildChunk(s);
    const n = g.positions.length / 3;
    assert.ok(n >= 12, `shape ${s} has vertices`);
    assert.equal(g.normals.length, g.positions.length);
    assert.equal(g.uvs.length, (n * 2));
    assert.equal(g.indices.length % 3, 0);
    // largest extent == 1, centred
    let mn = [Infinity, Infinity, Infinity],
      mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.positions.length; i += 3)
      for (let a = 0; a < 3; a++) {
        mn[a] = Math.min(mn[a], g.positions[i + a]);
        mx[a] = Math.max(mx[a], g.positions[i + a]);
      }
    const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    assert.ok(Math.abs(ext - 1) < 1e-5, `shape ${s} extent ${ext}`);
    for (let a = 0; a < 3; a++) assert.ok(Math.abs(mn[a] + mx[a]) < 1e-5, `shape ${s} centred on axis ${a}`);
    for (let a = 0; a < 3; a++) assert.ok(Math.abs(SHAPE_HALF[s * 3 + a] - (mx[a] - mn[a]) / 2) < 1e-6);
    // every triangle: cross(b-a, c-a) opposite to its (outward) stored normal → front-facing in Babylon
    let outwardOk = 0;
    for (let t = 0; t < g.indices.length; t += 3) {
      const [ia, ib, ic] = [g.indices[t] * 3, g.indices[t + 1] * 3, g.indices[t + 2] * 3];
      const ax = g.positions[ib] - g.positions[ia],
        ay = g.positions[ib + 1] - g.positions[ia + 1],
        az = g.positions[ib + 2] - g.positions[ia + 2];
      const bx = g.positions[ic] - g.positions[ia],
        by = g.positions[ic + 1] - g.positions[ia + 1],
        bz = g.positions[ic + 2] - g.positions[ia + 2];
      const cx = ay * bz - az * by,
        cy = az * bx - ax * bz,
        cz = ax * by - ay * bx;
      const d = cx * g.normals[ia] + cy * g.normals[ia + 1] + cz * g.normals[ia + 2];
      assert.ok(d < 0, `shape ${s} tri ${t / 3}: winding`);
      // outward: normal points away from the origin (all shapes are star-shaped around it, except the folded flake)
      const mxp = (g.positions[ia] + g.positions[ib] + g.positions[ic]) / 3,
        myp = (g.positions[ia + 1] + g.positions[ib + 1] + g.positions[ic + 1]) / 3,
        mzp = (g.positions[ia + 2] + g.positions[ib + 2] + g.positions[ic + 2]) / 3;
      if (mxp * g.normals[ia] + myp * g.normals[ia + 1] + mzp * g.normals[ia + 2] > 0) outwardOk++;
    }
    const tris = g.indices.length / 3;
    assert.ok(outwardOk / tris > (s === 7 ? 0.6 : 0.97), `shape ${s}: ${outwardOk}/${tris} outward`);
  }
});

test("DirtyRanges merges and normalises", () => {
  const d = new DirtyRanges();
  d.add(5);
  d.add(6);
  d.addRange(10, 20);
  d.add(500);
  d.normalize(1000);
  assert.equal(d.n, 2);
  assert.deepEqual([d.lo[0], d.hi[0], d.lo[1], d.hi[1]], [5, 20, 500, 501]);
  for (let i = 0; i < 20; i++) d.add(1000 + i * 200);
  d.normalize(3000);
  assert.ok(d.n >= 1 && d.n <= DirtyRanges.MAX);
  assert.ok(d.hi[d.n - 1] <= 3000);
});

test("a chip dropped from 1.2 m bounces, slides, settles flat on the floor and freezes", () => {
  let probes = 0;
  const sim = new MicroSim({
    capacity: 100,
    groundProbe: () => {
      probes++;
      return 0;
    },
  });
  const i = sim.spawn(spawnArgs("ceramic", 0, 1.2, 0, 0.8, 0, 0.3));
  assert.ok(i >= 0);
  assert.equal(sim.movingCount, 1);
  let maxBounceY = 0;
  let touched = false;
  let settledAt = -1;
  for (let s = 0; s < 600; s++) {
    sim.step(FIXED_DT);
    const d = sim.debugSlot(i);
    if (d.y < 0.05) touched = true;
    if (touched) maxBounceY = Math.max(maxBounceY, d.y);
    if (d.state === 2) {
      settledAt = s;
      break;
    }
  }
  assert.ok(settledAt > 0, "settled");
  assert.ok(settledAt < 240, `settled within 4 s (took ${settledAt} steps)`);
  const d = sim.debugSlot(i);
  assert.equal(sim.movingCount, 0);
  assert.equal(sim.settledCount, 1);
  assert.ok(d.y > 0 && d.y < 0.012, `rests on the floor, y=${d.y}`);
  assert.ok(d.up > 0.999, `flat resting pose (axis alignment ${d.up})`);
  assert.ok(maxBounceY > 0.005 && maxBounceY < 0.25, `bounced a little (${maxBounceY})`);
  assert.equal(sim.checkInvariants(), null);
  // settled pieces cost nothing: no further probes except the slow re-check, matrix untouched
  const sb = sim.bins[d.bin]!;
  const m0 = Array.from(sb.mat.subarray(d.inst * 16, d.inst * 16 + 16));
  for (let s = 0; s < 30; s++) sim.step(FIXED_DT);
  assert.deepEqual(Array.from(sb.mat.subarray(d.inst * 16, d.inst * 16 + 16)), m0);
  assert.ok(probes < 40, `probes ${probes}`);
});

test("free fall matches ballistics for a dense chip (short drop: drag small)", () => {
  const sim = new MicroSim({ capacity: 10, groundProbe: () => -100 });
  const i = sim.spawn(spawnArgs("concrete", 0, 10, 0, 0, 0, 0, 0.02));
  for (let s = 0; s < 30; s++) sim.step(FIXED_DT);
  const d = sim.debugSlot(i);
  // semi-implicit Euler: y = 10 - g dt² N(N+1)/2 ; quadratic drag (k≈0.02/m) costs ~1 cm here
  const expected = 10 - (9.81 * FIXED_DT * FIXED_DT * (30 * 31)) / 2;
  assert.ok(d.y > expected && d.y - expected < 0.04, `y ${d.y} vs ${expected}`);
  // and drag is real: after a long fall the speed is below the vacuum value
  for (let s = 0; s < 90; s++) sim.step(FIXED_DT);
  const v = -sim.debugSlot(i).vy;
  assert.ok(v < 9.81 * 2 && v > 9.81 * 2 * 0.75, `v after 2 s = ${v}`);
});

test("paper flutters down slowly (terminal velocity ~1-2 m/s)", () => {
  const sim = new MicroSim({ capacity: 10, groundProbe: () => -100 });
  const i = sim.spawn(spawnArgs("paper", 0, 10, 0, 0, 0, 0, 0.03));
  for (let s = 0; s < 180; s++) sim.step(FIXED_DT);
  const d = sim.debugSlot(i);
  assert.ok(d.vy < -0.5 && d.vy > -3, `paper vy ${d.vy}`);
});

test("a piece sliding off a table edge falls to the floor", () => {
  // table top at 0.75 m for x < 0.3, floor elsewhere
  const sim = new MicroSim({ capacity: 10, groundProbe: (x, y) => (x < 0.3 && y >= 0.75 ? 0.75 : 0) });
  const i = sim.spawn(spawnArgs("wood", 0, 0.8, 0, 3.0, -0.5, 0, 0.02));
  for (let s = 0; s < 600; s++) {
    sim.step(FIXED_DT);
    if (sim.debugSlot(i).state === 2) break;
  }
  const d = sim.debugSlot(i);
  assert.equal(d.state, 2);
  assert.ok(d.x > 0.3, `slid past the edge (x=${d.x})`);
  assert.ok(d.y < 0.05, `fell to the floor (y=${d.y})`);
  assert.equal(sim.checkInvariants(), null);
});

test("hard cap recycles the oldest settled pieces first", () => {
  const sim = new MicroSim({ capacity: 50, groundProbe: () => 0 });
  const first: number[] = [];
  for (let k = 0; k < 50; k++) first.push(sim.spawn(spawnArgs("gypsum", k * 0.05, 0.02, 0)));
  for (let s = 0; s < 300; s++) sim.step(FIXED_DT);
  assert.equal(sim.settledCount, 50);
  // 10 more (airborne) → 10 oldest settled recycled
  for (let k = 0; k < 10; k++) assert.ok(sim.spawn(spawnArgs("glass", 0, 1, 1)) >= 0);
  assert.equal(sim.count, 50);
  assert.equal(sim.recycled, 10);
  assert.equal(sim.movingCount, 10);
  assert.equal(sim.checkInvariants(), null);
  // when everything is airborne, the oldest overall goes
  const sim2 = new MicroSim({ capacity: 5, groundProbe: () => -100 });
  const ids: number[] = [];
  for (let k = 0; k < 8; k++) ids.push(sim2.spawn(spawnArgs("metal", k, 5, 0)));
  assert.equal(sim2.count, 5);
  assert.equal(sim2.checkInvariants(), null);
  // shrinking capacity recycles too
  sim.setCapacity(20);
  assert.equal(sim.count, 20);
  assert.equal(sim.checkInvariants(), null);
});

test("kick wakes settled debris and throws it around; it settles again", () => {
  const sim = new MicroSim({ capacity: 200, groundProbe: () => 0 });
  for (let k = 0; k < 100; k++) sim.spawn(spawnArgs("concrete", (k % 10) * 0.05, 0.05, Math.floor(k / 10) * 0.05));
  for (let s = 0; s < 300; s++) sim.step(FIXED_DT);
  assert.equal(sim.settledCount, 100);
  const n = sim.kick(0.25, 0, 0.25, 0.4, 3);
  assert.ok(n > 30, `kicked ${n}`);
  assert.ok(sim.movingCount > 20);
  assert.equal(sim.checkInvariants(), null);
  for (let s = 0; s < 600; s++) sim.step(FIXED_DT);
  assert.equal(sim.movingCount, 0);
  assert.equal(sim.checkInvariants(), null);
});

test("settled debris falls when its support disappears (round-robin recheck)", () => {
  let tableThere = true;
  const sim = new MicroSim({ capacity: 50, groundProbe: (_x, y) => (tableThere && y >= 0.75 ? 0.75 : 0), recheckPerStep: 4 });
  for (let k = 0; k < 20; k++) sim.spawn(spawnArgs("ceramic", k * 0.02, 0.8, 0));
  for (let s = 0; s < 300; s++) sim.step(FIXED_DT);
  assert.equal(sim.settledCount, 20);
  assert.ok(sim.debugSlot(0).y > 0.74);
  tableThere = false;
  for (let s = 0; s < 400; s++) sim.step(FIXED_DT);
  let onFloor = 0;
  for (let k = 0; k < 20; k++) if (sim.debugSlot(k).y < 0.05) onFloor++;
  assert.equal(onFloor, 20, `all fell (${onFloor})`);
  assert.equal(sim.checkInvariants(), null);
});

test("robustness: invalid input rejected, NaN never appears, no-ground pieces get removed", () => {
  const sim = new MicroSim({ capacity: 20, groundProbe: () => null });
  assert.equal(sim.spawn(spawnArgs("glass", NaN, 1, 0)), -1);
  assert.equal(sim.spawn(spawnArgs("glass", 0, 1, 0, 0, 0, 0, 0)), -1);
  assert.equal(sim.spawn({ ...spawnArgs("glass", 0, 1, 0), kind: 99 }), -1);
  assert.equal(sim.rejected, 3);
  const i = sim.spawn(spawnArgs("glass", 0, 1, 0, 1e9, Infinity, NaN));
  assert.ok(i >= 0);
  sim.step(0);
  sim.step(-1);
  sim.step(NaN);
  for (let s = 0; s < 200; s++) sim.step(FIXED_DT);
  const d = sim.debugSlot(i);
  assert.ok(!d.alive || Number.isFinite(d.y));
  // falls forever (no ground) → removed below y = -30
  for (let s = 0; s < 400; s++) sim.step(FIXED_DT);
  assert.equal(sim.count, 0);
  assert.equal(sim.checkInvariants(), null);
  // throwing probe is treated as no ground
  const sim2 = new MicroSim({
    capacity: 5,
    groundProbe: () => {
      throw new Error("boom");
    },
  });
  assert.ok(sim2.spawn(spawnArgs("wood", 0, 1, 0)) >= 0);
  sim2.step(FIXED_DT);
});

test("probe budget: a 400-piece burst does few raycasts thanks to the per-step cache", () => {
  let probes = 0;
  const sim = new MicroSim({
    capacity: 1000,
    groundProbe: () => {
      probes++;
      return 0;
    },
  });
  for (let k = 0; k < 400; k++) sim.spawn(spawnArgs("glass", 1 + (k % 7) * 0.01, 1.2, 2 + (k % 5) * 0.01, Math.cos(k) * 2, 1, Math.sin(k) * 2));
  assert.ok(probes <= 48, `spawn probes ${probes}`);
  for (let s = 0; s < 600; s++) sim.step(FIXED_DT);
  assert.equal(sim.movingCount, 0, "all settled");
  assert.equal(sim.checkInvariants(), null);
});

test("fuzz: random spawns/kicks/capacity changes keep invariants", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const sim = new MicroSim({ capacity: 300, groundProbe: (x) => (x > 0 ? 0 : 0.4) });
  const kinds = Object.keys(MICRO_KIND_INDEX);
  for (let step = 0; step < 1500; step++) {
    const r = rnd();
    if (r < 0.3) {
      const n = 1 + Math.floor(rnd() * 20);
      for (let k = 0; k < n; k++)
        sim.spawn(spawnArgs(kinds[Math.floor(rnd() * kinds.length)], rnd() * 2 - 1, 0.5 + rnd(), rnd() * 2 - 1, rnd() * 4 - 2, rnd() * 3, rnd() * 4 - 2, 0.005 + rnd() * 0.03));
    } else if (r < 0.33) sim.kick(rnd() * 2 - 1, 0, rnd() * 2 - 1, 0.5, 2 + rnd() * 3);
    else if (r < 0.335) sim.setCapacity(100 + Math.floor(rnd() * 400));
    else if (r < 0.34) sim.disturb(0, 0, 0, 1);
    sim.step(FIXED_DT);
    if (step % 50 === 0) assert.equal(sim.checkInvariants(), null, `step ${step}`);
  }
  assert.equal(sim.checkInvariants(), null);
  for (const sb of sim.activeBins) {
    sb.matDirty.normalize(sb.count);
    for (let r = 0; r < sb.matDirty.n; r++) assert.ok(sb.matDirty.lo[r] >= 0 && sb.matDirty.hi[r] <= sb.count);
  }
});

test("performance: 5000 pieces (all moving, then all settled)", () => {
  const sim = new MicroSim({ capacity: 6000, groundProbe: () => 0, maxProbesPerStep: 48 });
  for (let k = 0; k < 5000; k++) sim.spawn(spawnArgs(k % 2 ? "glass" : "wood", (k % 70) * 0.03, 0.6 + (k % 13) * 0.1, Math.floor(k / 70) * 0.03, Math.cos(k) * 2, Math.sin(k * 3), Math.sin(k) * 2));
  // warm up JIT
  for (let s = 0; s < 20; s++) sim.step(FIXED_DT);
  const t0 = performance.now();
  const N = 30;
  for (let s = 0; s < N; s++) sim.step(FIXED_DT);
  const movingMs = (performance.now() - t0) / N;
  for (let s = 0; s < 900 && sim.movingCount > 0; s++) sim.step(FIXED_DT);
  assert.equal(sim.movingCount, 0);
  const t1 = performance.now();
  for (let s = 0; s < 100; s++) sim.step(FIXED_DT);
  const settledMs = (performance.now() - t1) / 100;
  console.log(`micro sim: 5000 moving ${movingMs.toFixed(3)} ms/step, 5000 settled ${settledMs.toFixed(4)} ms/step`);
  assert.ok(settledMs < 0.1, `settled cost ${settledMs}`);
  assert.ok(movingMs < 4, `moving cost ${movingMs}`); // generous: shared CI machine
});
