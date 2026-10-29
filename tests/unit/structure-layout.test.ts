// Unit tests for the pure structure layout: wall frames, junction rules, abutments, thresholds,
// floor/ceiling coverage and the reference levels other agents rely on.
// Run: node --test tests/unit/structure-layout.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { Builder } from "../../src/objects/lib/builder.ts";
import { polyCentroid } from "../../src/geom/poly.ts";
import { ROOMS, WALLS, roomAt, roomById, type RoomId } from "../../src/world/plan.ts";
import { WallFrame, ceilingCoverage, floorCoverage, footprints, layout, openingInfos, partitionFaceIntervals, thresholds, wallSegmentInfos } from "../../src/world/structure/layout.ts";
import { CEILING_Y, FLOOR_Y, PARTITION_FACE, SERVICE_POINTS, SLAB_TOP_Y, WALL_TILE_ZONES, roomFaces } from "../../src/world/structure/levels.ts";
import { rectArea, rectIntersect } from "../../src/world/structure/rects.ts";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test("WallFrame matches the builder's group transform (yaw) for all four directions", () => {
  for (const [dx, dz] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]) {
    const f = new WallFrame(2, 3, dx, dz);
    const b = new Builder("t", "t", "structure", 0);
    b.group([f.ox, 0, f.oz], [0, f.yawDeg, 0], "", () => {
      b.box("p", "softwood", "wood_pine", [0.1, 0.1, 0.1], [1.5, 0.2, 0.7]);
    });
    b.world("p");
    const c = polyCentroid(b.build().parts[0].poly);
    const e = f.toWorld(1.5, 0.2, 0.7);
    assert.ok(close(c.x, e.x, 1e-9) && close(c.y, e.y, 1e-9) && close(c.z, e.z, 1e-9), `dir ${dx},${dz}: ${JSON.stringify(c)} vs ${JSON.stringify(e)}`);
    assert.ok(close(f.u(e.x, e.z), 1.5) && close(f.w(e.x, e.z), 0.7));
  }
});

test("concrete runs face the interior with +w and own the corners on the x-walls", () => {
  const L = layout();
  for (const c of L.concrete) {
    const mid = c.frame.toWorld((c.f0 + c.f1) / 2, 1, c.half + 0.2);
    assert.ok(mid.x > 0 && mid.x < 12.8 && mid.z > 0 && mid.z < 8.8, `${c.wall.id} +w must point inside`);
  }
  const south = L.byId.get("south")!;
  assert.ok(close(south.u0, -0.2) && close(south.u1, 13.0));
  const west = L.byId.get("west")!;
  // west concrete spans between the x-walls' concrete faces
  assert.ok(close(west.u1 - west.u0, 8.825));
});

test("partition junction rules: concrete ends, T junctions, L corners, end-to-end", () => {
  const L = layout();
  const run = (id: string) => L.partitions.find((p) => p.wall.id === id)!;
  const ml = run("p_master_living");
  assert.equal(ml.end0, "concrete");
  assert.equal(ml.end1, "free"); // wraps the corner with p_master_hall (z-wall runs through)
  assert.ok(close(ml.u0, -0.0125) && close(ml.u1, 4.4575));
  const mh = run("p_master_hall");
  assert.equal(mh.end1, "butt");
  assert.ok(close(mh.u1, 3.9425));
  const bu = run("p_bath_utility");
  assert.equal(bu.end0, "butt"); // T into p_hall_bath
  assert.ok(close(bu.u0, 0.0575));
  const lb = run("p_living_bed2"),
    kf = run("p_kitchen_foyer");
  assert.equal(lb.end1, "butt");
  assert.equal(kf.end0, "butt");
  assert.ok(close(lb.u1, 4.4) && close(kf.u0, 0)); // collinear, end to end
  const bf = run("p_bed2_foyer");
  assert.ok(close(bf.u0, 0.0575)); // T into the x = 9.2 line
  // abutments registered on the faces that get covered
  assert.ok(run("p_hall_bath").abutPos.some((a) => a.by === "p_bath_utility" && close(a.lo, 2.4425) && close(a.hi, 2.5575)));
  assert.ok(ml.abutPos.some((a) => a.by === "p_master_hall"));
  // exposed face intervals exclude abutments
  assert.deepEqual(
    partitionFaceIntervals(run("p_hall_bath"), 1).map((i) => i.map((v) => +v.toFixed(4))),
    [
      [-0.0125, 2.4425],
      [2.5575, 3.9425],
    ],
  );
});

test("door openings: hinge side and swing side follow the plan", () => {
  const L = layout();
  for (const r of L.partitions) {
    for (const o of r.openings) {
      if (o.op.kind !== "door") continue;
      // swing side room = into
      const p = r.frame.toWorld((o.r0 + o.r1) / 2, 1, o.swingSide * 0.4);
      const room = ROOMS.find((q) => p.x >= q.x0 && p.x <= q.x1 && p.z >= q.z0 && p.z <= q.z1);
      assert.equal(room?.id, o.op.into, `${o.op.id} swings into ${o.op.into}`);
    }
  }
  const fd = L.byId.get("north")!.openings.find((o) => o.op.id === "front_door")!;
  const hingeU = fd.hingeSide < 0 ? fd.r0 : fd.r1;
  assert.ok(close(L.byId.get("north")!.frame.toWorld(hingeU, 0, 0).x, 11.4), "front door hinges at x = 11.4");
});

test("thresholds: every door/arch gets a full-depth saddle; open plan transitions get strips", () => {
  const th = thresholds();
  for (const id of ["door_master", "door_bath", "door_utility", "door_bed2", "arch_foyer"]) assert.ok(th.some((t) => t.id === `th_${id}`), id);
  const open = th.filter((t) => t.id.startsWith("th_open"));
  assert.equal(open.length, 2, "living|kitchen and hall|kitchen");
  for (let i = 0; i < th.length; i++) for (let j = i + 1; j < th.length; j++) assert.equal(rectIntersect(th[i].rect, th[j].rect, 1e-6), null, `${th[i].id} overlaps ${th[j].id}`);
  assert.equal(th.find((t) => t.id === "th_door_bath")!.owner, "bath");
  assert.equal(th.find((t) => t.id === "th_door_bed2")!.owner, "bed2");
});

test("floor coverage + thresholds + wall footprints tile every indoor room exactly", () => {
  const fps = footprints();
  const th = thresholds();
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const cov = floorCoverage(r.id);
    const plan = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
    // coverage pieces are disjoint
    for (let i = 0; i < cov.length; i++) for (let j = i + 1; j < cov.length; j++) assert.equal(rectIntersect(cov[i], cov[j], 1e-7), null);
    // sample the plan rectangle: every point is in coverage, a threshold or a wall footprint
    for (let x = r.x0 + 0.013; x < r.x1; x += 0.097) {
      for (let z = r.z0 + 0.011; z < r.z1; z += 0.089) {
        const inR = (q: { x0: number; x1: number; z0: number; z1: number }) => x >= q.x0 - 1e-9 && x <= q.x1 + 1e-9 && z >= q.z0 - 1e-9 && z <= q.z1 + 1e-9;
        const ok = cov.some(inR) || th.some((t) => inR(t.rect)) || fps.some((f) => inR(f.full));
        assert.ok(ok, `${r.id}: (${x.toFixed(3)}, ${z.toFixed(3)}) uncovered`);
      }
    }
    const a = cov.reduce((s, q) => s + rectArea(q), 0);
    assert.ok(a > 0.8 * rectArea(plan) * 0.85, `${r.id} coverage area ${a}`);
  }
});

test("ceiling coverage covers each room's clear rectangle", () => {
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const cov = ceilingCoverage(r.id);
    const f = roomFaces(r.id);
    const a = cov.reduce((s, q) => s + rectArea(q), 0);
    assert.ok(a >= rectArea(f) - 1e-6, `${r.id}: ${a} < ${rectArea(f)}`);
  }
});

test("reference levels and room faces", () => {
  assert.equal(FLOOR_Y, 0);
  assert.equal(CEILING_Y, 2.7);
  assert.equal(SLAB_TOP_Y, -0.02);
  const m = roomFaces("master");
  assert.ok(close(m.x0, 0) && close(m.x1, 4.0 - PARTITION_FACE) && close(m.z1, 4.4 - PARTITION_FACE));
  const k = roomFaces("kitchen");
  assert.ok(close(k.z0, 5.0), "open side keeps the plan boundary");
  assert.ok(close(k.z1, 8.8), "concrete side keeps the plan boundary");
  for (const z of WALL_TILE_ZONES) assert.ok(z.to > z.from && z.y1 > z.y0);
  for (const sp of SERVICE_POINTS) assert.ok(WALLS.some((w) => w.id === sp.wall), sp.id);
});

test("metadata: OPENINGS and WALL_SEGMENTS", () => {
  const ops = openingInfos();
  const ids = WALLS.flatMap((w) => w.openings.map((o) => o.id)).sort();
  assert.deepEqual(ops.map((o) => o.id).sort(), ids);
  for (const o of ops) {
    assert.ok(o.width > 0.5 && o.height > 1);
    assert.ok(Math.abs(Math.hypot(o.normal.x, o.normal.z) - 1) < 1e-9);
    assert.equal(o.corners.length, 4);
    for (const c of o.corners) assert.ok(Number.isFinite(c.x + c.y + c.z));
    if (o.kind === "window") assert.ok(o.exterior);
  }
  const win = ops.find((o) => o.id === "win_master")!;
  assert.deepEqual(win.rooms.filter(Boolean), ["master"]);
  const segs = wallSegmentInfos();
  assert.ok(segs.length > 20);
  for (const s of segs) {
    assert.ok(s.y1 > s.y0 && s.transmissionLossDb > 20 && s.surfaceDensity > 10);
    assert.ok(Number.isFinite(s.a[0] + s.a[1] + s.b[0] + s.b[1]));
  }
  // the south wall has solid pieces below every window
  assert.ok(segs.some((s) => s.wallId === "south" && s.y1 <= 0.9 + 1e-9 && s.y1 > 0.5));
  // rooms[] is right along the WHOLE piece on both sides (pieces split where a side's room changes)
  for (const s of segs) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    assert.ok(L > 0.004, `${s.wallId}: degenerate piece`);
    const tx = (s.b[0] - s.a[0]) / L,
      tz = (s.b[1] - s.a[1]) / L;
    const off = s.thickness / 2 + 0.05;
    const sides = new Set<string>();
    for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      const x = s.a[0] + tx * L * f,
        z = s.a[1] + tz * L * f;
      const l = roomAt(x - tz * off, z + tx * off)?.id ?? null,
        r = roomAt(x + tz * off, z - tx * off)?.id ?? null;
      // corner stubs inside the crossing wall's thickness face no room (merged into the piece)
      if (l !== null || r !== null) sides.add(JSON.stringify([l, r]));
    }
    assert.equal(sides.size, 1, `${s.wallId} ${s.a}→${s.b}: rooms change along the piece ${[...sides].join(" ")}`);
    const [l, r] = JSON.parse([...sides][0]) as [string | null, string | null];
    const ok = (s.rooms[0] === l && s.rooms[1] === r) || (s.rooms[0] === r && s.rooms[1] === l);
    assert.ok(ok, `${s.wallId} ${s.a}→${s.b}: rooms ${JSON.stringify(s.rooms)} but sides are ${l} / ${r}`);
  }
  // the examples that used to be mislabelled by the midpoint room
  const north = segs.filter((s) => s.wallId === "north" && s.y0 < 0 && s.y1 > 2.9).map((s) => s.rooms[1]);
  for (const r of ["bath", "utility", "kitchen", "foyer"]) assert.ok(north.includes(r as RoomId), `north wall bounds ${r}`);
  const west = segs.filter((s) => s.wallId === "west").map((s) => s.rooms[1]);
  for (const r of ["master", "hallW", "bath"]) assert.ok(west.includes(r as RoomId), `west wall bounds ${r}`);
});

test("rooms of the plan all resolve", () => {
  for (const r of ROOMS) assert.equal(roomById(r.id as RoomId).id, r.id);
});
