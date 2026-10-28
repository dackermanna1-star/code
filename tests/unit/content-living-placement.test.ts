// Living / dining room placements: inside the room with ≥ 1.5 cm clearance from finished wall
// faces, on the floor or exactly on their support (± 2 mm), no unintended intersections
// (AABB for unrelated items; exact part-vs-part test for stacked/contained/tucked items), clear
// paths through the hall opening, the foyer arch and to the balcony slider, deterministic.
// Run: node --test tests/unit/content-living-placement.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { qeuler, qrot, v3 } from "../../src/geom/vec.ts";
import { polyTransform, type ConvexPoly } from "../../src/geom/poly.ts";
import { aabbOf, polyContact, type Aabb } from "../../src/objects/lib/contact.ts";
import { roomFaces, PARTITION_FACE, BASEBOARD_T } from "../../src/world/structure/levels.ts";
import { ELECTRICAL } from "../../src/world/structure/services.ts";
import { CEILING_H } from "../../src/world/plan.ts";
import { footprintPoints, furnishLiving, furnishLivingItems, surfaceAt, worldAabb, yawQ, type LivingItem } from "../../src/world/furnish/living.ts";
import { LIVING_OBJECTS } from "../../src/objects/living/index.ts";

const items = furnishLivingItems();
const byId = new Map(items.map((i) => [i.id, i]));
const boxes = new Map(items.map((i) => [i.id, worldAabb(i.def, i.xf)]));
const isWall = (it: LivingItem) => !!it.tags?.includes("wall");

/** Items this one rests on / stands inside / is tucked under, transitively. */
function ancestors(it: LivingItem, out = new Set<string>()): Set<string> {
  const direct = [...(it.on ?? []), ...(it.tags ?? []).filter((t) => t.startsWith("inside:") || t.startsWith("tucked:")).map((t) => t.split(":")[1])];
  for (const id of direct) {
    if (out.has(id)) continue;
    out.add(id);
    ancestors(byId.get(id)!, out);
  }
  return out;
}
const anc = new Map(items.map((i) => [i.id, ancestors(i)]));
function related(a: LivingItem, b: LivingItem): boolean {
  const A = anc.get(a.id)!,
    B = anc.get(b.id)!;
  if (A.has(b.id) || B.has(a.id)) return true;
  for (const x of A) if (B.has(x)) return true;
  return false;
}

function boxOverlap(a: Aabb, b: Aabb, pad = 0): boolean {
  return a.min.x < b.max.x - pad && b.min.x < a.max.x - pad && a.min.y < b.max.y - pad && b.min.y < a.max.y - pad && a.min.z < b.max.z - pad && b.min.z < a.max.z - pad;
}

const worldPolys = new Map<string, ConvexPoly[]>();
function polysOf(it: LivingItem): ConvexPoly[] {
  let p = worldPolys.get(it.id);
  if (!p) {
    p = it.def.parts.map((pt) => polyTransform(pt.poly, it.xf));
    worldPolys.set(it.id, p);
  }
  return p;
}

/** Deepest interpenetration (m, positive) between any two parts of two placed items. */
function maxPenetration(a: LivingItem, b: LivingItem): { depth: number; what: string } {
  const pa = polysOf(a),
    pb = polysOf(b);
  const ba = pa.map(aabbOf),
    bb = pb.map(aabbOf);
  let depth = 0,
    what = "";
  for (let i = 0; i < pa.length; i++)
    for (let j = 0; j < pb.length; j++) {
      if (!boxOverlap(ba[i], bb[j])) continue;
      const c = polyContact(pa[i], pb[j], 0);
      if (c && -c.sep > depth) {
        depth = -c.sep;
        what = `${a.def.parts[i].name} × ${b.def.parts[j].name}`;
      }
    }
  return { depth, what };
}

test("yaw convention: front +Z is turned to (sin yaw, 0, cos yaw)", () => {
  const f = (deg: number) => qrot(yawQ(deg), v3(0, 0, 1));
  const e = 1e-9;
  assert.ok(Math.abs(f(90).x - 1) < e && Math.abs(f(90).z) < e, "90° → +X (east)");
  assert.ok(Math.abs(f(-90).x + 1) < e, "−90° → −X (west)");
  assert.ok(Math.abs(f(180).z + 1) < e, "180° → −Z (south)");
  const q = qeuler(0, 0.3, 0);
  assert.deepEqual(yawQ((0.3 * 180) / Math.PI), q);
});

test("surfaceAt finds the top of a support, and shelves below a limit", () => {
  const con = byId.get("console")!;
  const top = surfaceAt(con.def, con.xf, con.xf.p.x, con.xf.p.z);
  assert.ok(top !== null && Math.abs(top - 0.48) < 1e-6, `console top ${top}`);
  const shelf = surfaceAt(con.def, con.xf, con.xf.p.x, con.xf.p.z, 0.45);
  assert.ok(shelf !== null && Math.abs(shelf - 0.268) < 1e-6, `middle shelf ${shelf}`);
  assert.equal(surfaceAt(con.def, con.xf, 8.5, 0.5), null);
});

test("every placement is a registered living type in the living room, ids unique", () => {
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const it of items) {
    assert.equal(it.room, "living");
    assert.ok(LIVING_OBJECTS[it.type], `unregistered type ${it.type}`);
    assert.equal(it.def.type, it.type);
    for (const k of ["x", "y", "z"] as const) assert.ok(Number.isFinite(it.xf.p[k]));
  }
  assert.equal(furnishLiving().length, items.length);
});

test("inside the room with ≥ 1.5 cm clearance from finished wall faces (wall-hung: 2 mm, not into the wall)", () => {
  const r = roomFaces("living");
  assert.ok(Math.abs(r.x0 - (4.0 + PARTITION_FACE)) < 1e-9 && Math.abs(r.x1 - (9.2 - PARTITION_FACE)) < 1e-9);
  for (const it of items) {
    const b = boxes.get(it.id)!;
    const c = isWall(it) ? 0.002 : 0.015;
    assert.ok(b.min.x >= r.x0 + c - 1e-9, `${it.id}: west clearance ${(b.min.x - r.x0).toFixed(4)}`);
    assert.ok(b.max.x <= r.x1 - c + 1e-9, `${it.id}: east clearance ${(r.x1 - b.max.x).toFixed(4)}`);
    assert.ok(b.min.z >= r.z0 + 0.015, `${it.id}: south clearance ${b.min.z.toFixed(4)}`);
    assert.ok(b.max.z <= 5.0 - 0.01, `${it.id}: crosses into the kitchen (z ${b.max.z.toFixed(3)})`);
    assert.ok(b.min.y >= -1e-6 && b.max.y <= CEILING_H - 0.4, `${it.id}: height ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)}`);
    if (isWall(it)) assert.ok(b.min.y > 0.9, `${it.id} hangs too low`);
    if (!isWall(it) && b.min.y < 0.09 + 1e-6) {
      // floor-level parts must also clear the 12 mm baseboards
      assert.ok(b.min.x >= r.x0 + BASEBOARD_T && b.max.x <= r.x1 - BASEBOARD_T);
    }
  }
});

test("resting on the floor (y = 0) or on its support: in contact (gap ≤ 2 mm, no penetration > 2 mm)", () => {
  for (const it of items) {
    const b = boxes.get(it.id)!;
    if (isWall(it)) continue;
    if (!it.on) {
      assert.ok(Math.abs(b.min.y) < 0.001, `${it.id}: base at y = ${b.min.y.toFixed(4)}`);
      continue;
    }
    // independent contact check: closest approach between the item's parts and its supports'
    let best = Infinity;
    for (const sid of it.on) {
      const s = byId.get(sid)!;
      for (const pa of polysOf(it))
        for (const pb of polysOf(s)) {
          const c = polyContact(pa, pb, 0.01);
          if (c && c.sep < best) best = c.sep;
        }
    }
    assert.ok(best <= 0.002 && best >= -0.002, `${it.id}: gap to its support ${(best * 1000).toFixed(1)} mm`);
    // and its lowest point is the contact: nothing of it hangs below the support surface
    const fp = footprintPoints(it.def, it.xf);
    let top = -Infinity;
    for (const p of fp)
      for (const sid of it.on) {
        const s = byId.get(sid)!;
        const y = surfaceAt(s.def, s.xf, p.x, p.z, b.min.y + 0.01);
        if (y !== null) top = Math.max(top, y);
      }
    assert.ok(Math.abs(b.min.y - top) <= 0.002, `${it.id}: base ${b.min.y.toFixed(4)} vs support surface ${top.toFixed(4)}`);
  }
});

test("no intersections: unrelated items' boxes are disjoint; stacked/contained/tucked items' parts do not interpenetrate", () => {
  const bad: string[] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i],
        b = items[j];
      const A = boxes.get(a.id)!,
        B = boxes.get(b.id)!;
      if (!boxOverlap(A, B, 0.0005)) continue;
      if (!related(a, b)) {
        bad.push(`${a.id} / ${b.id} (bounding boxes)`);
        continue;
      }
      const p = maxPenetration(a, b);
      if (p.depth > 0.002) bad.push(`${a.id} / ${b.id}: ${p.what} penetrate ${(p.depth * 1000).toFixed(1)} mm`);
    }
  assert.deepEqual(bad, []);
});

function zoneHits(x0: number, x1: number, z0: number, z1: number, yMax: number): string[] {
  const zone: Aabb = { min: v3(x0, 0, z0), max: v3(x1, yMax, z1) };
  return items.filter((it) => boxOverlap(boxes.get(it.id)!, zone)).map((it) => it.id);
}

test("clear paths: balcony slider (1 m deep), curtains, hall opening, foyer arch", () => {
  assert.deepEqual(zoneHits(5.0, 7.4, 0, 1.0, 2.2), [], "1 m in front of the balcony slider");
  assert.deepEqual(zoneHits(4.85, 8.95, 0, 0.2, 2.5), [], "curtain zone along the south wall");
  assert.deepEqual(zoneHits(4.06, 5.0, 4.25, 5.0, 2.1), [], "hall opening x = 4.0, z 4.4–5.6");
  assert.deepEqual(zoneHits(8.3, 9.14, 4.45, 5.0, 2.1), [], "foyer arch path");
  // a ≥ 0.85 m walkway links the hall opening, the dining area, the sofa and the slider
  assert.deepEqual(zoneHits(4.6, 5.45, 1.0, 4.25, 1.0).filter((id) => id !== "rug"), [], "walkway between the TV wall and the coffee table/dining");
});

test("wall-hung items and furniture leave switch/outlet plates free", () => {
  for (const e of ELECTRICAL.filter((p) => p.room === "living" && p.at !== undefined)) {
    const along = e.at!;
    let plate: Aabb;
    if (e.wall === "p_master_living") plate = { min: v3(4.0575, e.y - 0.0575, along - 0.035), max: v3(4.0575 + 0.014, e.y + 0.0575, along + 0.035) };
    else if (e.wall === "p_living_bed2") plate = { min: v3(9.1425 - 0.014, e.y - 0.0575, along - 0.035), max: v3(9.1425, e.y + 0.0575, along + 0.035) };
    else plate = { min: v3(along - 0.035, e.y - 0.0575, 0), max: v3(along + 0.035, e.y + 0.0575, 0.014) };
    for (const it of items) assert.ok(!boxOverlap(boxes.get(it.id)!, plate), `${it.id} covers ${e.id}`);
  }
});

test("budget, contents and determinism", () => {
  const parts = items.reduce((s, i) => s + i.def.parts.length, 0);
  const mass = items.reduce((s, i) => s + i.def.parts.reduce((m, p) => m + (p.mass ?? 0), 0), 0);
  void mass;
  console.log(`living: ${items.length} assemblies, ${parts} parts`);
  assert.ok(parts <= 1500, `part budget: ${parts}`);
  const count = (t: string) => items.filter((i) => i.type === t).length;
  assert.equal(count("tv55"), 1);
  assert.equal(count("chair"), 4);
  assert.ok(count("hardcoverBook") + count("paperbackBook") >= 30);
  assert.ok(count("throwPillow") >= 2);
  assert.equal(count("framedPainting"), 2);
  const again = furnishLivingItems();
  assert.equal(JSON.stringify(again.map((i) => [i.id, i.xf])), JSON.stringify(items.map((i) => [i.id, i.xf])));
  assert.equal(JSON.stringify(again.map((i) => i.def)), JSON.stringify(items.map((i) => i.def)));
});
