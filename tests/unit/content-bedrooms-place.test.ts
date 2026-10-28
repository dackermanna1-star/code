// Bedroom placements: inside their rooms, ≥ 1.5 cm from finished wall faces, resting exactly on
// the floor / on the measured surface of their support, no intersections (AABB; declared
// stacking/containment pairs are checked part-by-part instead), door swings and doorway paths
// clear, no clash with the fixtures agent's heaters/blinds/door stops/mirror, part budget,
// determinism. Run: node --test tests/unit/content-bedrooms-place.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { qeuler, qrot, v3, type Vec3 } from "../../src/geom/vec.ts";
import { polyTransform, type ConvexPoly } from "../../src/geom/poly.ts";
import { polyContact } from "../../src/objects/lib/contact.ts";
import { WALLS, type RoomId } from "../../src/world/plan.ts";
import { JAMB_T, SHIM, roomFaces } from "../../src/world/structure/levels.ts";
import { bedroomItems, furnishBedrooms, type BedroomItem } from "../../src/world/furnish/bedrooms.ts";

interface Box {
  min: Vec3;
  max: Vec3;
}
interface WItem {
  it: BedroomItem;
  parts: Array<{ name: string; poly: ConvexPoly; box: Box }>;
  box: Box;
}

const EPS = 0.002; // 2 mm tolerance
const CLEAR = 0.015; // wall clearance

function boxOf(poly: ConvexPoly): Box {
  const min = v3(Infinity, Infinity, Infinity),
    max = v3(-Infinity, -Infinity, -Infinity);
  for (const v of poly.verts) {
    min.x = Math.min(min.x, v.x);
    min.y = Math.min(min.y, v.y);
    min.z = Math.min(min.z, v.z);
    max.x = Math.max(max.x, v.x);
    max.y = Math.max(max.y, v.y);
    max.z = Math.max(max.z, v.z);
  }
  return { min, max };
}

function merge(a: Box, b: Box): Box {
  return {
    min: v3(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y), Math.min(a.min.z, b.min.z)),
    max: v3(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y), Math.max(a.max.z, b.max.z)),
  };
}

/** Overlap depth of two boxes (min over axes; ≤ 0 = disjoint or touching). */
function overlap(a: Box, b: Box): number {
  return Math.min(Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x), Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y), Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
}

function world(it: BedroomItem): WItem {
  const parts = it.placement.def.parts.map((p) => {
    const poly = polyTransform(p.poly, it.placement.xf);
    return { name: p.name, poly, box: boxOf(poly) };
  });
  let box = parts[0].box;
  for (const p of parts) box = merge(box, p.box);
  return { it, parts, box };
}

const ITEMS = bedroomItems();
const W = ITEMS.map(world);
const byId = new Map(W.map((w) => [w.it.id, w]));

function supportId(it: BedroomItem): string | null {
  const s = it.support;
  if (typeof s === "object") return "on" in s ? s.on : s.in;
  return null;
}

/** Deepest part-level penetration (m, > 0 = penetrating) between two items. */
function penetration(a: WItem, b: WItem): { depth: number; pair: string } {
  let depth = 0,
    pair = "";
  for (const pa of a.parts) {
    if (overlap(pa.box, b.box) <= 0) continue;
    for (const pb of b.parts) {
      if (overlap(pa.box, pb.box) <= 0) continue;
      const c = polyContact(pa.poly, pb.poly, 0.004);
      if (c && -c.sep > depth) {
        depth = -c.sep;
        pair = `${a.it.id}:${pa.name} × ${b.it.id}:${pb.name}`;
      }
    }
  }
  return { depth, pair };
}

test("yaw convention: front (+Z) turns to (sin yaw, 0, cos yaw)", () => {
  const f = (yaw: number) => qrot(qeuler(0, yaw, 0), v3(0, 0, 1));
  const close = (a: Vec3, b: Vec3) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
  assert.ok(close(f(0), v3(0, 0, 1)));
  assert.ok(close(f(Math.PI / 2), v3(1, 0, 0)));
  assert.ok(close(f(Math.PI), v3(0, 0, -1)));
  assert.ok(close(f(-Math.PI / 2), v3(-1, 0, 0)));
});

test("ids unique, rooms set, furnishBedrooms matches the items", () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const it of ITEMS) {
    assert.ok(it.placement.room === "master" || it.placement.room === "bed2");
    assert.equal(it.placement.def.room, it.placement.room);
    assert.equal(it.placement.type, it.placement.def.type);
    const s = supportId(it);
    if (s) assert.ok(byId.has(s), `${it.id}: unknown support ${s}`);
  }
  assert.equal(furnishBedrooms().length, ITEMS.length);
});

test("part budget (~1,600 for the area) and item count", () => {
  const parts = ITEMS.reduce((s, i) => s + i.placement.def.parts.length, 0);
  console.log(`bedrooms: ${ITEMS.length} assemblies, ${parts} parts`);
  assert.ok(parts <= 1600, `${parts} parts`);
  assert.ok(ITEMS.length >= 60);
});

test("items stay inside their room, ≥ 1.5 cm from finished wall faces", () => {
  for (const w of W) {
    const F = roomFaces(w.it.placement.room);
    const b = w.box;
    if (w.it.support === "wall") {
      // hung on a wall: back face 2–30 mm off one wall, inside the room rectangle
      const gaps = [b.min.x - F.x0, F.x1 - b.max.x, b.min.z - F.z0, F.z1 - b.max.z];
      const min = Math.min(...gaps);
      assert.ok(min >= 0.002 && min <= 0.03, `${w.it.id}: wall gap ${(min * 1000).toFixed(1)} mm`);
      for (const g of gaps) assert.ok(g >= 0.002, `${w.it.id} pokes into a wall`);
      const anchored = w.it.placement.def.bonds.some((bd) => bd.b === "world");
      assert.ok(anchored, `${w.it.id}: wall item must hang on a nail/tape (world bond)`);
      continue;
    }
    assert.ok(b.min.x >= F.x0 + CLEAR - 1e-9, `${w.it.id}: ${(b.min.x - F.x0).toFixed(4)} m from the west face`);
    assert.ok(b.max.x <= F.x1 - CLEAR + 1e-9, `${w.it.id}: ${(F.x1 - b.max.x).toFixed(4)} m from the east face`);
    assert.ok(b.min.z >= F.z0 + CLEAR - 1e-9, `${w.it.id}: ${(b.min.z - F.z0).toFixed(4)} m from the south face`);
    assert.ok(b.max.z <= F.z1 - CLEAR + 1e-9, `${w.it.id}: ${(F.z1 - b.max.z).toFixed(4)} m from the north face`);
    assert.ok(b.max.y <= 2.7 - 0.05, `${w.it.id} too tall`);
  }
});

test("resting: floor items on y = 0, others on the measured surface of their support (±2 mm)", () => {
  for (const w of W) {
    const it = w.it;
    if (it.support === "wall") continue;
    if (it.support === "floor") {
      assert.ok(Math.abs(w.box.min.y) <= EPS, `${it.id}: base at y = ${w.box.min.y.toFixed(4)}`);
      continue;
    }
    assert.ok(it.restY !== undefined, `${it.id}: restY missing`);
    const restY = it.restY!;
    const contact = it.contact ? w.parts.filter((p) => it.contact!.some((c) => p.name.startsWith(c))) : w.parts.filter((p) => p.box.min.y <= w.box.min.y + 0.001);
    assert.ok(contact.length > 0, `${it.id}: no contact parts`);
    const low = Math.min(...contact.map((p) => p.box.min.y));
    assert.ok(Math.abs(low - restY) <= EPS, `${it.id}: underside ${low.toFixed(4)} vs surface ${restY.toFixed(4)}`);
    const sup = byId.get(supportId(it)!)!;
    const xzOverlap = (a: Box, b: Box) => Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 0.002 && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 0.002;
    const supported = sup.parts.some((sp) => Math.abs(sp.box.max.y - restY) <= EPS && contact.some((cp) => xzOverlap(sp.box, cp.box)));
    assert.ok(supported, `${it.id}: nothing of ${sup.it.id} at y = ${restY.toFixed(4)} under it`);
  }
});

test("no intersections: AABBs disjoint unless declared; declared pairs do not penetrate", () => {
  const declared = (a: BedroomItem, b: BedroomItem): boolean => !!a.overlaps?.includes(b.id) || !!b.overlaps?.includes(a.id) || supportId(a) === b.id || supportId(b) === a.id;
  const problems: string[] = [];
  for (let i = 0; i < W.length; i++)
    for (let j = i + 1; j < W.length; j++) {
      const a = W[i],
        b = W[j];
      const ov = overlap(a.box, b.box);
      if (ov <= EPS) continue;
      if (!declared(a.it, b.it)) {
        problems.push(`${a.it.id} × ${b.it.id}: AABB overlap ${(ov * 1000).toFixed(1)} mm`);
        continue;
      }
      const p = penetration(a, b);
      if (p.depth > EPS) problems.push(`${p.pair}: penetration ${(p.depth * 1000).toFixed(1)} mm`);
    }
  assert.deepEqual(problems, []);
});

/** Hinged doors swinging into the bedrooms: hinge axis on the wall face, leaf width, swing side. */
function bedroomDoors(): Array<{ id: string; room: RoomId; hx: number; face: number; leaf: number; dirX: number; dirZ: number; x0: number; x1: number }> {
  const out: Array<{ id: string; room: RoomId; hx: number; face: number; leaf: number; dirX: number; dirZ: number; x0: number; x1: number }> = [];
  for (const wall of WALLS)
    for (const op of wall.openings) {
      if (op.kind !== "door" || (op.into !== "master" && op.into !== "bed2")) continue;
      const alongX = Math.abs(wall.b[1] - wall.a[1]) < 1e-9;
      assert.ok(alongX, "bedroom doors are on walls along x");
      const dir = Math.sign(wall.b[0] - wall.a[0]);
      const p0 = wall.a[0] + dir * op.from,
        p1 = wall.a[0] + dir * op.to;
      const x0 = Math.min(p0, p1),
        x1 = Math.max(p0, p1);
      const hingeEnd = op.hinge === "a" ? p0 : p1;
      const toHinge = Math.sign(hingeEnd - (x0 + x1) / 2);
      const hx = hingeEnd - toHinge * (SHIM + JAMB_T);
      const F = roomFaces(op.into);
      const intoZ = (F.z0 + F.z1) / 2 > wall.a[1] ? 1 : -1;
      const face = intoZ < 0 ? F.z1 : F.z0;
      out.push({ id: op.id, room: op.into, hx, face, leaf: x1 - x0 - 2 * (SHIM + JAMB_T), dirX: -toHinge, dirZ: intoZ, x0, x1 });
    }
  return out;
}

test("door swings (quarter disc + 5 cm) and 0.85 m doorway paths stay clear", () => {
  const doors = bedroomDoors();
  assert.equal(doors.length, 2);
  for (const d of doors) {
    const R = d.leaf + 0.05;
    for (const w of W) {
      if (w.it.placement.room !== d.room || w.it.support === "wall") continue;
      const b = w.box;
      // clip the item's footprint to the swing quadrant, then test its distance to the hinge
      const qx0 = d.dirX < 0 ? -Infinity : d.hx,
        qx1 = d.dirX < 0 ? d.hx : Infinity;
      const qz0 = d.dirZ < 0 ? -Infinity : d.face,
        qz1 = d.dirZ < 0 ? d.face : Infinity;
      const cx0 = Math.max(b.min.x, qx0),
        cx1 = Math.min(b.max.x, qx1),
        cz0 = Math.max(b.min.z, qz0),
        cz1 = Math.min(b.max.z, qz1);
      if (cx0 <= cx1 && cz0 <= cz1) {
        const px = Math.min(Math.max(d.hx, cx0), cx1),
          pz = Math.min(Math.max(d.face, cz0), cz1);
        const dist = Math.hypot(px - d.hx, pz - d.face);
        assert.ok(dist > R, `${w.it.id} is inside the swing of ${d.id} (${dist.toFixed(3)} m from the hinge)`);
      }
      // clear path: 0.85 m wide (centred on the opening), 1 m into the room
      const mid = (d.x0 + d.x1) / 2;
      const pz0 = d.dirZ < 0 ? d.face - 1.0 : d.face,
        pz1 = d.dirZ < 0 ? d.face : d.face + 1.0;
      const inPath = Math.min(b.max.x, mid + 0.425) - Math.max(b.min.x, mid - 0.425) > 0 && Math.min(b.max.z, pz1) - Math.max(b.min.z, pz0) > 0;
      assert.ok(!inPath, `${w.it.id} blocks the path through ${d.id}`);
    }
  }
});

test("no clash with the fixtures (heaters, blinds, door stops, mirror, lights)", async (t) => {
  let fixtures: Array<{ type: string; def: { parts: Array<{ poly: ConvexPoly }> }; xf: { p: Vec3; q: { x: number; y: number; z: number; w: number } }; room: string }>;
  try {
    const mod = await import("../../src/world/furnish/fixtures.ts");
    fixtures = mod.furnishFixtures();
  } catch (e) {
    t.skip(`fixtures module unavailable: ${(e as Error).message}`);
    return;
  }
  const mine = W;
  let checked = 0;
  for (const f of fixtures) {
    if (f.room !== "master" && f.room !== "bed2") continue;
    let fb: Box | null = null;
    for (const p of f.def.parts) {
      const bb = boxOf(polyTransform(p.poly, f.xf));
      fb = fb ? merge(fb, bb) : bb;
    }
    checked++;
    for (const w of mine) {
      const ov = overlap(w.box, fb!);
      assert.ok(ov <= EPS, `${w.it.id} intersects fixture ${f.type} (${(ov * 1000).toFixed(1)} mm)`);
    }
  }
  assert.ok(checked > 0, "no fixtures in the bedrooms?");
});

test("deterministic layout", () => {
  const a = bedroomItems();
  assert.equal(a.length, ITEMS.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].id, ITEMS[i].id);
    assert.deepEqual(a[i].placement.xf, ITEMS[i].placement.xf);
    assert.equal(JSON.stringify(a[i].placement.def), JSON.stringify(ITEMS[i].placement.def));
  }
});
