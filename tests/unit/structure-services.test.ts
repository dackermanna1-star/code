// Services and moving parts of the structure: switches/outlets where specified (tags, sparks),
// plumbing stub-outs at the published SERVICE_POINTS (water features), doors swinging into the
// right rooms, window sashes opening inwards, the sliding panel sliding over the fixed one,
// latches in their joint groups.
// Run: node --test tests/unit/structure-services.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { polyBounds, polyCentroid } from "../../src/geom/poly.ts";
import { qaxisAngle, qrot, vadd, vsub, type Vec3 } from "../../src/geom/vec.ts";
import { ROOMS, roomAt } from "../../src/world/plan.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { OPENINGS, buildStructure } from "../../src/world/structure.ts";
import { SERVICE_POINTS, WALL_TILE_T } from "../../src/world/structure/levels.ts";
import { ELECTRICAL } from "../../src/world/structure/services.ts";

const defs = buildStructure().map((p) => p.def);
const partByName = (d: AssemblyDef, n: string) => d.parts.find((p) => p.name === n);
const find = (suffix: string) => {
  for (const d of defs) for (const p of d.parts) if (p.name === suffix || p.name.endsWith(`_${suffix}`) || p.name.endsWith(suffix)) return { d, p };
  return null;
};

test("every electrical point exists with the right tags, height, face and sparks", () => {
  for (const e of ELECTRICAL) {
    const hit = defs.flatMap((d) => d.parts.filter((p) => p.name.endsWith(`${e.id}_plate`)).map((p) => ({ d, p })))[0];
    assert.ok(hit, `${e.id}: plate missing`);
    const c = polyCentroid(hit.p.poly);
    assert.ok(Math.abs(c.y - e.y) < 0.005, `${e.id}: height ${c.y}`);
    const tag = e.kind === "switch" ? `switch:${e.controls}` : "outlet";
    assert.ok(hit.p.tags?.includes(tag), `${e.id}: tag ${tag}`);
    // the plate faces the requested room
    const bb = polyBounds(hit.p.poly);
    const thin = bb.max.x - bb.min.x < bb.max.z - bb.min.z ? "x" : "z";
    let ok = false;
    for (const s of [-1, 1]) {
      const px = thin === "x" ? c.x + s * 0.06 : c.x,
        pz = thin === "z" ? c.z + s * 0.06 : c.z;
      if (roomAt(px, pz)?.id === e.room) ok = true;
    }
    assert.ok(ok, `${e.id}: not on a ${e.room} face`);
    if (e.at !== undefined) {
      const along = thin === "x" ? c.z : c.x;
      assert.ok(Math.abs(along - e.at) < 0.35, `${e.id}: at ${along.toFixed(3)} (asked ${e.at})`);
    }
    assert.ok((hit.d.features ?? []).some((f) => f.type === "sparks" && f.part === hit.p.name), `${e.id}: sparks`);
  }
  // every room with lights has a switch
  for (const r of ROOMS) if (r.lights.length) assert.ok(ELECTRICAL.some((e) => e.kind === "switch" && e.controls === r.id), `switch for ${r.id}`);
});

test("plumbing stub-outs match SERVICE_POINTS and carry mains-pressure water features", () => {
  for (const sp of SERVICE_POINTS) {
    for (const kind of ["cold", "hot"] as const) {
      const v = find(`${sp.id}_${kind}_valve`);
      const es = find(`${sp.id}_${kind}_escutcheon`);
      assert.ok(v && es, `${sp.id} ${kind} valve`);
      const c = polyCentroid(v!.p.poly);
      const along = Math.abs(c.x - sp.face) < 0.2 ? c.z : c.x;
      const want = sp.along + (kind === "cold" ? -0.1 : 0.1);
      assert.ok(Math.abs(along - want) < 1e-3, `${sp.id} ${kind}: along ${along} vs ${want}`);
      assert.ok(Math.abs(c.y - sp.valveY) < 1e-3, `${sp.id} ${kind}: y ${c.y}`);
      // escutcheon back face sits on the finished face (tile face where tiled)
      const eb = polyBounds(es!.p.poly);
      const faceDist = Math.min(Math.abs(eb.min.x - sp.face), Math.abs(eb.max.x - sp.face));
      assert.ok(faceDist < 1e-4, `${sp.id} ${kind}: escutcheon not on the face (${faceDist})`);
      const feats = v!.d.features ?? [];
      for (const part of [`${sp.id}_${kind}_riser`, `${sp.id}_${kind}_stub`, `${sp.id}_${kind}_valve`]) {
        const f = feats.find((q) => q.type === "water" && q.part.endsWith(part));
        assert.ok(f && f.type === "water" && f.pressure >= 0.6 && f.litres === undefined, `${part}: mains water feature`);
      }
    }
    if (sp.drainY !== null) {
      const fl = find(`${sp.id}_drain_flange`);
      assert.ok(fl, `${sp.id} drain`);
      assert.ok(Math.abs(polyCentroid(fl!.p.poly).y - sp.drainY) < 1e-3);
    }
  }
  // the vanity is tiled: its face coordinate includes the tile layer
  const vanity = SERVICE_POINTS.find((s) => s.id === "vanity")!;
  assert.ok(Math.abs(2.5 - 0.0575 - WALL_TILE_T - vanity.face) < 1e-9);
});

/** Rotate p about the axis through `pivot` by `deg` (right-hand rule, the joint convention). */
function rotateAbout(p: Vec3, pivot: Vec3, axis: Vec3, deg: number): Vec3 {
  return vadd(pivot, qrot(qaxisAngle(axis, (deg * Math.PI) / 180), vsub(p, pivot)));
}

test("doors swing into their `into` rooms, hinge on the plan's hinge side, and latch", () => {
  const doors = defs.filter((d) => d.type === "door_interior" || d.type === "door_front");
  assert.equal(doors.length, 5);
  for (const d of doors) {
    const hinges = d.bonds.filter((b) => b.kind === "hinge");
    assert.equal(hinges.length, 3, `${d.name}: 3 hinges`);
    const g = hinges[0].joint!.group;
    assert.ok(hinges.every((h) => h.joint!.group === g));
    const latch = d.bonds.find((b) => b.kind === "latch");
    assert.ok(latch && latch.joint!.group === g, `${d.name}: latch in the hinge group`);
    const id = d.parts[0].tags!.find((t) => t.startsWith("opening:"))!.slice(8);
    const op = OPENINGS.find((o) => o.id === id)!;
    const into = op.rooms.find((r) => r && (d.type === "door_front" ? r === "foyer" : r === d.room));
    assert.ok(into, `${d.name}: room`);
    const latchPart = partByName(d, latch!.a)!;
    const p0 = polyCentroid(latchPart.poly);
    const j = hinges[0].joint!;
    const p1 = rotateAbout(p0, j.pivot, j.axis, 60);
    assert.equal(roomAt(p1.x, p1.z)?.id, d.room, `${d.name}: +60° should move the latch edge into ${d.room}`);
    // leaf opening limits
    assert.ok(j.min === 0 && j.max > (80 * Math.PI) / 180);
    if (d.type === "door_front") assert.ok((latch!.strength ?? 0) >= 300, "deadbolt");
  }
  // hinge sides from the plan
  const fd = defs.find((d) => d.type === "door_front")!;
  assert.ok(Math.abs(fd.bonds.find((b) => b.kind === "hinge")!.joint!.pivot.x - 11.4) < 0.06, "front door hinges at x ≈ 11.4");
  const bath = defs.find((d) => d.name === "Bathroom Door")!;
  assert.ok(Math.abs(bath.bonds.find((b) => b.kind === "hinge")!.joint!.pivot.x - 1.4) < 0.06, "bathroom door hinges at x ≈ 1.4");
});

test("casement sashes open inwards; the sliding panel slides over the fixed panel", () => {
  const windows = defs.filter((d) => d.type === "window");
  assert.equal(windows.length, 4);
  for (const d of windows) {
    const h = d.bonds.find((b) => b.kind === "hinge")!;
    const latch = d.bonds.find((b) => b.kind === "latch")!;
    assert.ok(latch && latch.joint!.group === h.joint!.group);
    const p0 = polyCentroid(partByName(d, latch.a)!.poly);
    const p1 = rotateAbout(p0, h.joint!.pivot, h.joint!.axis, 45);
    const r0 = roomAt(p0.x, p0.z),
      r1 = roomAt(p1.x, p1.z);
    assert.ok(!r0, `${d.name}: sash starts in the wall plane`);
    assert.equal(r1?.id, d.room, `${d.name}: sash opens into the room`);
  }
  const sd = defs.find((d) => d.type === "door_sliding")!;
  const sl = sd.bonds.filter((b) => b.kind === "slider");
  assert.equal(sl.length, 2);
  const j = sl[0].joint!;
  const moving = polyCentroid(partByName(sd, sl[0].a)!.poly);
  const fixed = polyCentroid(partByName(sd, "fixed_bottom")!.poly);
  const moved = vadd(moving, { x: j.axis.x * j.max, y: 0, z: j.axis.z * j.max });
  assert.ok(Math.abs(moved.x - fixed.x) < Math.abs(moving.x - fixed.x) - 0.5, "opens towards the fixed panel");
  assert.ok(j.max > 0.9 && j.max < 1.25);
  assert.ok(sd.bonds.some((b) => b.kind === "latch" && b.joint!.group === j.group));
  // tempered glass in the sliding door and the balcony railing, annealed in the windows
  assert.ok(sd.parts.filter((p) => p.tags?.includes("glass")).every((p) => p.mat === "temperedGlass"));
  for (const w of windows) assert.ok(w.parts.filter((p) => p.tags?.includes("glass")).every((p) => p.mat === "glass"));
  const bal = defs.find((d) => d.type === "balcony")!;
  assert.ok(bal.parts.filter((p) => p.tags?.includes("glass")).length >= 5);
});

test("walls carry wall tiles where specified and baseboards elsewhere", () => {
  const bathWalls = defs.filter((d) => d.parts.some((p) => p.tags?.includes("wall-tile")) && (d.room === "bath" || d.name.includes("Bathroom")));
  const tiles = defs.flatMap((d) => d.parts.filter((p) => p.tags?.includes("wall-tile")));
  assert.ok(tiles.length > 600, `${tiles.length} wall tiles`);
  assert.ok(bathWalls.length >= 3);
  const boards = defs.flatMap((d) => d.parts.filter((p) => p.tags?.includes("baseboard")));
  assert.ok(boards.length > 30, `${boards.length} baseboards`);
  // no baseboard inside the bathroom
  for (const b of boards) {
    const c = polyCentroid(b.poly);
    assert.notEqual(roomAt(c.x, c.z)?.id, "bath", "baseboard in the bathroom");
  }
  // every partition stud is pine and vertical members are 38 × 89
  const studs = defs.flatMap((d) => d.parts.filter((p) => p.name.startsWith("stud_")));
  assert.ok(studs.length > 60);
  for (const s of studs) {
    const bb = polyBounds(s.poly);
    const dims = [bb.max.x - bb.min.x, bb.max.z - bb.min.z].sort((a, b) => a - b);
    assert.equal(s.mat, "softwood");
    assert.ok(Math.abs(dims[0] - 0.038) < 1e-6 && Math.abs(dims[1] - 0.089) < 1e-6, `${s.name} ${dims}`);
  }
});
