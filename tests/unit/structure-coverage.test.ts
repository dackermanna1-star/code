// Coverage tests for the built structure: openings are free of wall parts (only their own
// door/window parts), every room is enclosed by walls (except open-plan boundaries and the
// cased opening), floor finishes cover every room at y = 0 and ceilings at y = 2.7.
// Run: node --test tests/unit/structure-coverage.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOMS } from "../../src/world/plan.ts";
import { OPENINGS, buildStructure } from "../../src/world/structure.ts";
import { footprints } from "../../src/world/structure/layout.ts";
import { CEILING_Y, FRONT_JAMB_T, JAMB_T, SHIM, roomFaces } from "../../src/world/structure/levels.ts";
import { PartGrid, allParts } from "./structure-helpers.ts";

const defs = buildStructure().map((p) => p.def);
const grid = new PartGrid(allParts(defs));
const tagOf = (ref: { part: { tags?: string[] } }, prefix: string) => ref.part.tags?.find((t) => t.startsWith(prefix));

test("openings: rays through every clear opening hit only that opening's own door/window parts", () => {
  for (const o of OPENINGS) {
    const half = o.width / 2;
    let inU: number, y0: number, y1: number;
    if (o.kind === "door" || o.kind === "opening") {
      inU = SHIM + JAMB_T + 0.012;
      y0 = 0.03;
      y1 = o.head - SHIM - JAMB_T - 0.012;
    } else if (o.kind === "frontDoor") {
      inU = SHIM + FRONT_JAMB_T + 0.015;
      y0 = 0.03;
      y1 = o.head - SHIM - FRONT_JAMB_T - 0.015;
    } else if (o.kind === "slidingDoor") {
      inU = 0.005 + 0.05 + 0.01;
      y0 = 0.045;
      y1 = o.head - 0.07;
    } else {
      inU = 0.005 + 0.05 + 0.012;
      y0 = o.sill + 0.07;
      y1 = o.head - 0.07;
    }
    const L = o.depth + 0.6;
    let rays = 0;
    for (let i = 0; i <= 4; i++) {
      const u = -half + inU + ((2 * half - 2 * inU) * i) / 4;
      for (let j = 0; j <= 5; j++) {
        const y = y0 + ((y1 - y0) * j) / 5;
        const c = { x: o.center.x + o.tangent.x * u, z: o.center.z + o.tangent.z * u };
        const start: [number, number, number] = [c.x - o.normal.x * (L / 2), y, c.z - o.normal.z * (L / 2)];
        const hits = grid.hits(start, [o.normal.x, 0, o.normal.z], L);
        rays++;
        for (const h of hits) {
          const tag = tagOf(h.ref, "opening:");
          assert.equal(tag, o.fill ? `opening:${o.id}` : undefined, `${o.id} @u=${u.toFixed(2)} y=${y.toFixed(2)}: hit ${h.ref.asm.name}/${h.ref.part.name}`);
        }
        if (o.fill) assert.ok(hits.length > 0, `${o.id}: the ${o.fill} should fill its opening (u=${u.toFixed(2)}, y=${y.toFixed(2)})`);
      }
    }
    assert.ok(rays === 30);
  }
});

test("rooms are enclosed: rays leaving each room through its walls hit structure", () => {
  const fps = footprints();
  const arch = OPENINGS.filter((o) => o.fill === null);
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const f = roomFaces(r.id);
    const sides: Array<{ along: "x" | "z"; fixed: number; lo: number; hi: number; out: [number, number] }> = [
      { along: "x", fixed: f.z0, lo: f.x0, hi: f.x1, out: [0, -1] },
      { along: "x", fixed: f.z1, lo: f.x0, hi: f.x1, out: [0, 1] },
      { along: "z", fixed: f.x0, lo: f.z0, hi: f.z1, out: [-1, 0] },
      { along: "z", fixed: f.x1, lo: f.z0, hi: f.z1, out: [1, 0] },
    ];
    let checked = 0;
    for (const s of sides) {
      for (let a = s.lo + 0.04; a < s.hi - 0.04; a += 0.12) {
        const px = s.along === "x" ? a : s.fixed,
          pz = s.along === "x" ? s.fixed : a;
        const qx = px + s.out[0] * 0.03,
          qz = pz + s.out[1] * 0.03;
        const inWall = fps.some((fp) => qx >= fp.full.x0 && qx <= fp.full.x1 && qz >= fp.full.z0 && qz <= fp.full.z1);
        if (!inWall) continue; // open-plan boundary
        const inArch = arch.some((o) => {
          const du = (qx - o.center.x) * o.tangent.x + (qz - o.center.z) * o.tangent.z;
          const dn = (qx - o.center.x) * o.normal.x + (qz - o.center.z) * o.normal.z;
          return Math.abs(du) < o.width / 2 + 0.01 && Math.abs(dn) < o.depth / 2 + 0.05;
        });
        for (const y of [0.2, 0.7, 1.3, 1.9, 2.5]) {
          if (inArch && y < 2.12) continue;
          const start: [number, number, number] = [px - s.out[0] * 0.03, y, pz - s.out[1] * 0.03];
          const hits = grid.hits(start, [s.out[0], 0, s.out[1]], 0.45);
          assert.ok(hits.length > 0, `${r.id}: leak through the wall at (${px.toFixed(2)}, ${y}, ${pz.toFixed(2)})`);
          checked++;
        }
      }
    }
    assert.ok(checked > 40, `${r.id}: only ${checked} enclosure samples`);
  }
});

test("floor finishes cover every room with a flush surface at y = 0", () => {
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const f = roomFaces(r.id);
    let n = 0,
      joints = 0;
    for (let x = f.x0 + 0.025; x < f.x1 - 0.02; x += 0.11) {
      for (let z = f.z0 + 0.025; z < f.z1 - 0.02; z += 0.13) {
        const hits = grid.hits([x, 0.15, z], [0, -1, 0], 0.5);
        assert.ok(hits.length > 0, `${r.id}: hole in the floor at (${x.toFixed(2)}, ${z.toFixed(2)})`);
        const h = hits[0];
        const isFloor = h.ref.asm.type.startsWith("floor_") && (h.ref.asm.room === r.id || h.ref.part.tags?.includes("threshold"));
        assert.ok(isFloor, `${r.id}: (${x.toFixed(2)}, ${z.toFixed(2)}) first hit is ${h.ref.asm.name}/${h.ref.part.name}`);
        // tile rooms: a ray may fall into a 3 mm grout joint and meet the mortar bed 10 mm down
        const grout = h.ref.part.tags?.includes("tile-bed") && Math.abs(h.t - 0.16) < 1e-6;
        if (grout) joints++;
        assert.ok(Math.abs(h.t - 0.15) < 1e-6 || grout, `${r.id}: floor surface at y=${(0.15 - h.t).toFixed(4)} at (${x.toFixed(2)}, ${z.toFixed(2)}) (${h.ref.part.name})`);
        n++;
      }
    }
    assert.ok(n > 20, `${r.id}: ${n} samples`);
    assert.ok(joints <= Math.ceil(n * 0.06), `${r.id}: ${joints}/${n} samples in grout joints`);
  }
});

test("ceilings cover every room at y = 2.7", () => {
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const f = roomFaces(r.id);
    for (let x = f.x0 + 0.025; x < f.x1 - 0.02; x += 0.13) {
      for (let z = f.z0 + 0.025; z < f.z1 - 0.02; z += 0.15) {
        const hits = grid.hits([x, 2.0, z], [0, 1, 0], 1.2);
        assert.ok(hits.length > 0, `${r.id}: hole in the ceiling at (${x.toFixed(2)}, ${z.toFixed(2)})`);
        const h = hits[0];
        assert.equal(h.ref.asm.type, "ceiling", `${r.id}: first hit above (${x.toFixed(2)}, ${z.toFixed(2)}) is ${h.ref.asm.name}/${h.ref.part.name}`);
        assert.equal(h.ref.asm.room, r.id);
        assert.ok(Math.abs(2.0 + h.t - CEILING_Y) < 1e-6);
      }
    }
  }
});

test("the shell is closed: slabs above and below every interior point", () => {
  for (let x = 0.1; x < 12.8; x += 0.5) {
    for (let z = 0.1; z < 8.8; z += 0.5) {
      const down = grid.hits([x, -0.03, z], [0, -1, 0], 0.3);
      assert.ok(down.some((h) => h.ref.asm.type === "slab_floor"), `no floor slab under (${x}, ${z})`);
      const up = grid.hits([x, 2.74, z], [0, 1, 0], 0.3);
      assert.ok(up.some((h) => h.ref.asm.type === "slab_ceiling"), `no ceiling slab above (${x}, ${z})`);
    }
  }
});

test("the front door opens onto a walkable, enclosed corridor stub", () => {
  const down = grid.hits([10.9, 0.5, 9.6], [0, -1, 0], 1);
  assert.ok(down.length > 0 && down[0].ref.asm.type === "corridor", "corridor floor outside the front door");
  assert.ok(Math.abs(0.5 - down[0].t - 0.005) < 1e-6, "carpet top 5 mm above the apartment floor");
  for (const [d, max] of [
    [[-1, 0, 0], 3.2],
    [[1, 0, 0], 2.0],
    [[0, 0, 1], 1.2],
  ] as Array<[[number, number, number], number]>) {
    const h = grid.hits([10.9, 1.2, 9.6], d, max);
    assert.ok(h.length > 0, `corridor open towards ${d}`);
  }
  const up = grid.hits([10.9, 1.2, 9.6], [0, 1, 0], 2);
  assert.ok(up.length > 0 && up[0].ref.asm.type === "corridor", "corridor ceiling");
});
