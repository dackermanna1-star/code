// Services and moving parts of the structure: switches/outlets where specified (tags, sparks),
// plumbing stub-outs at the published SERVICE_POINTS (water features), doors swinging into the
// right rooms, window sashes opening inwards, the sliding panel sliding over the fixed one,
// latches in their joint groups.
// Run: node --test tests/unit/structure-services.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { polyBounds, polyCentroid, type ConvexPoly } from "../../src/geom/poly.ts";
import { qaxisAngle, qrot, vadd, vsub, type Vec3 } from "../../src/geom/vec.ts";
import { ROOMS, WALLS, roomAt } from "../../src/world/plan.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { OPENINGS, buildStructure } from "../../src/world/structure.ts";
import { SERVICE_POINTS, WALL_TILE_T } from "../../src/world/structure/levels.ts";
import { ELECTRICAL } from "../../src/world/structure/services.ts";
import { jointUnits, satDepth } from "./structure-helpers.ts";

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

const units = jointUnits(defs);
const doorUnits = units.filter((u) => u.asm.type === "wall_partition" || u.asm.type === "door_front");
const planOpening = (id: string) => WALLS.flatMap((w) => w.openings).find((o) => o.id === id)!;

test("doors swing into their `into` rooms, hinge on the plan's hinge side, and latch", () => {
  assert.equal(doorUnits.length, 5);
  for (const u of doorUnits) {
    assert.ok(u.opening, `${u.asm.name}: door parts carry opening:<id>`);
    const name = u.opening!;
    assert.equal(u.joints.length, 3, `${name}: 3 hinges`);
    assert.ok(u.joints.every((h) => h.kind === "hinge"));
    assert.ok(u.latch, `${name}: latch in the hinge group`);
    const into = planOpening(name).into!;
    assert.ok(OPENINGS.find((o) => o.id === name)!.rooms.includes(into), `${name}: room`);
    const latchPart = partByName(u.asm, u.latch!.a)!;
    const p0 = polyCentroid(latchPart.poly);
    const j = u.joints[0].joint!;
    const p1 = rotateAbout(p0, j.pivot, j.axis, 60);
    assert.equal(roomAt(p1.x, p1.z)?.id, into, `${name}: +60° should move the latch edge into ${into}`);
    // leaf opening limits
    assert.ok(j.min === 0 && j.max > (80 * Math.PI) / 180);
    if (u.asm.type === "door_front") assert.ok((u.latch!.strength ?? 0) >= 300, "deadbolt");
    else {
      // interior door frames are carried by their wall's framing (jambs nailed through shims to
      // the jacks, head jamb to the header), never by world bonds: wreck the wall, free the frame
      const mine = new Set(u.asm.parts.filter((p) => p.tags?.includes(`opening:${name}`)).map((p) => p.name));
      assert.ok(mine.size > 30, `${name}: ${mine.size} door parts`);
      assert.deepEqual(
        u.asm.bonds.filter((b) => b.b === "world" && mine.has(b.a)).map((b) => b.a),
        [],
        `${name}: world-anchored door parts`,
      );
      for (const side of ["L", "R"]) {
        const jack = `jack${side}_${name}`;
        const shims = u.asm.bonds.filter((b) => b.b === jack && b.a.startsWith(`${name}_shim${side}`));
        assert.equal(shims.length, 3, `${name}: jamb ${side} fixed through 3 shims to ${jack}`);
        for (const sb of shims) assert.ok(u.asm.bonds.some((b) => b.a === `${name}_jamb${side}` && b.b === sb.a), `${name}: jamb ${side} nailed to ${sb.a}`);
      }
      assert.ok(u.asm.bonds.some((b) => b.a === `${name}_shimHead` && b.b === `header_${name}`), `${name}: head jamb to header`);
    }
  }
  // hinge sides from the plan
  const pivotX = (id: string) => doorUnits.find((u) => u.opening === id)!.joints[0].joint!.pivot.x;
  assert.ok(Math.abs(pivotX("front_door") - 11.4) < 0.06, "front door hinges at x ≈ 11.4");
  assert.ok(Math.abs(pivotX("door_bath") - 1.4) < 0.06, "bathroom door hinges at x ≈ 1.4");
});

/** Plan footprints (x/z rectangles) of the fixtures furnishing places at the SERVICE_POINTS. */
const FIXTURE_ENVELOPES: Record<string, { w: number; d: number }> = {
  vanity: { w: 0.8, d: 0.46 }, // VANITY 0.8 × 0.46 m, centred on the drain
  washer: { w: 0.6, d: 0.6 },
  waterHeater: { w: 0.55, d: 0.55 }, // ≈ 0.55 m diameter tank
  kitchenSink: { w: 0.6, d: 0.6 }, // base cabinet depth
};

test("fixtures at the service points stay clear of every door's swing", () => {
  type R = { x0: number; x1: number; z0: number; z1: number };
  const envelopes: Array<{ id: string; r: R }> = SERVICE_POINTS.map((sp) => {
    const env = FIXTURE_ENVELOPES[sp.id];
    assert.ok(env, `${sp.id}: envelope`);
    const wall = WALLS.find((w) => w.id === sp.wall)!;
    const alongZ = Math.abs(wall.a[0] - wall.b[0]) < 1e-9;
    const room = ROOMS.find((r) => r.id === sp.room)!;
    const dir = alongZ ? Math.sign((room.x0 + room.x1) / 2 - sp.face) : Math.sign((room.z0 + room.z1) / 2 - sp.face);
    const [n0, n1] = [Math.min(sp.face, sp.face + dir * env.d), Math.max(sp.face, sp.face + dir * env.d)];
    const [a0, a1] = [sp.along - env.w / 2, sp.along + env.w / 2];
    return { id: sp.id, r: alongZ ? { x0: n0, x1: n1, z0: a0, z1: a1 } : { x0: a0, x1: a1, z0: n0, z1: n1 } };
  });
  // 2D SAT: rectangle vs convex quad
  const overlap2 = (r: R, q: Array<[number, number]>) => {
    const rect: Array<[number, number]> = [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x1, r.z1],
      [r.x0, r.z1],
    ];
    const axes: Array<[number, number]> = [
      [1, 0],
      [0, 1],
    ];
    for (let i = 0; i < q.length; i++) {
      const [ax, az] = q[i],
        [bx, bz] = q[(i + 1) % q.length];
      axes.push([-(bz - az), bx - ax]);
    }
    for (const [nx, nz] of axes) {
      const pr = (pts: Array<[number, number]>) => pts.map(([x, z]) => x * nx + z * nz);
      const a = pr(rect),
        b = pr(q);
      if (Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)) <= 1e-6) return false;
    }
    return true;
  };
  for (const u of doorUnits) {
    const j = u.joints[0].joint!;
    // leaf footprint at the closed pose (axis-aligned box over every moving part, handles included)
    const xs = u.moving.flatMap((p) => p.poly.verts.map((v) => v.x)),
      zs = u.moving.flatMap((p) => p.poly.verts.map((v) => v.z));
    const corners: Vec3[] = [
      { x: Math.min(...xs), y: 1, z: Math.min(...zs) },
      { x: Math.max(...xs), y: 1, z: Math.min(...zs) },
      { x: Math.max(...xs), y: 1, z: Math.max(...zs) },
      { x: Math.min(...xs), y: 1, z: Math.max(...zs) },
    ];
    const maxDeg = (j.max * 180) / Math.PI;
    for (let deg = 0; deg <= maxDeg + 1e-9; deg += 1) {
      const q = corners.map((c) => rotateAbout(c, j.pivot, j.axis, deg)).map((v): [number, number] => [v.x, v.z]);
      for (const e of envelopes) assert.ok(!overlap2(e.r, q), `${u.opening} at ${deg}° hits the ${e.id} envelope`);
    }
  }
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

test("casement sashes clear their own frame through the whole swing (rebate clearance)", () => {
  const rotPoly = (poly: ConvexPoly, pivot: Vec3, axis: Vec3, deg: number): ConvexPoly => ({
    verts: poly.verts.map((v) => rotateAbout(v, pivot, axis, deg)),
    faces: poly.faces.map((f) => ({ ...f, n: qrot(qaxisAngle(axis, (deg * Math.PI) / 180), f.n) })),
  });
  const sashes = units.filter((u) => u.asm.type === "window");
  assert.equal(sashes.length, 4);
  for (const u of sashes) {
    const j = u.joints[0].joint!;
    const frame = u.fixed.filter((p) => !p.noCollide);
    const sash = u.moving.filter((p) => !p.noCollide);
    let worst = 0;
    for (let deg = 0.5; deg <= (j.max * 180) / Math.PI + 1e-9; deg += 0.5) {
      for (const sp of sash) {
        const rp = rotPoly(sp.poly, j.pivot, j.axis, deg);
        const rb = polyBounds(rp);
        for (const fp of frame) {
          const fb = polyBounds(fp.poly);
          if (rb.max.x < fb.min.x || fb.max.x < rb.min.x || rb.max.y < fb.min.y || fb.max.y < rb.min.y || rb.max.z < fb.min.z || fb.max.z < rb.min.z) continue;
          worst = Math.max(worst, satDepth(rp, fp.poly));
        }
      }
    }
    assert.ok(worst < 2e-4, `${u.asm.name}: sash cuts ${(worst * 1000).toFixed(2)} mm into its frame while opening`);
  }
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
