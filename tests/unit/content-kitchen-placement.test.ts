// Kitchen placements: inside the room, >= 15 mm from finished wall faces, no interpenetration
// between assemblies (exact convex test on overlapping parts, > 0.3 mm), clear paths/door swings, every
// item resting on the floor or on what it sits on (±2 mm), part budget, determinism.
// Run: node --test tests/unit/content-kitchen-placement.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { kitchenLayout, furnishKitchen } from "../../src/world/furnish/kitchen.ts";
import { KF } from "../../src/objects/kitchen/layout.ts";
import { faceAttr, polyBox, polyTransform, type ConvexPoly } from "../../src/geom/poly.ts";
import { v3 } from "../../src/geom/vec.ts";
import { polyContact, aabbOf, type Aabb } from "../../src/objects/lib/contact.ts";
import { CEILING_Y, ELEC_PLATE_H, ELEC_PLATE_T, ELEC_PLATE_W, SERVICE_POINTS, WALL_TILE_T, WALL_TILE_ZONES } from "../../src/world/structure/levels.ts";
import { ELECTRICAL } from "../../src/world/structure/services.ts";

const L = kitchenLayout();
const P = L.placements;

interface WPart {
  name: string;
  poly: ConvexPoly;
  box: Aabb;
}
const world: WPart[][] = P.map((p) =>
  p.def.parts.map((q) => {
    const poly = polyTransform(q.poly, p.xf);
    return { name: q.name, poly, box: aabbOf(poly) };
  }),
);
const asmBox: Aabb[] = world.map((parts) => {
  const mn = { x: Infinity, y: Infinity, z: Infinity },
    mx = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const w of parts) {
    mn.x = Math.min(mn.x, w.box.min.x);
    mn.y = Math.min(mn.y, w.box.min.y);
    mn.z = Math.min(mn.z, w.box.min.z);
    mx.x = Math.max(mx.x, w.box.max.x);
    mx.y = Math.max(mx.y, w.box.max.y);
    mx.z = Math.max(mx.z, w.box.max.z);
  }
  return { min: mn, max: mx };
});
const overlap = (a: Aabb, b: Aabb, pad = 0): boolean =>
  a.min.x < b.max.x + pad && b.min.x < a.max.x + pad && a.min.y < b.max.y + pad && b.min.y < a.max.y + pad && a.min.z < b.max.z + pad && b.min.z < a.max.z + pad;
const wallMounted = (i: number): boolean => P[i].def.bonds.some((b) => b.b === "world") && ["kitchenWallCabinet", "rangeHood", "wallClock"].includes(P[i].type);

test("kitchen: placement count, room id and part budget (~1600)", () => {
  assert.ok(P.length > 80);
  const parts = P.reduce((s, p) => s + p.def.parts.length, 0);
  assert.ok(parts <= 1650, `${parts} parts`);
  for (const p of P) assert.equal(p.room, "kitchen");
  assert.equal(furnishKitchen().length, P.length);
  for (const p of P) for (const k of ["x", "y", "z"] as const) assert.ok(Number.isFinite(p.xf.p[k]));
});

test("kitchen: everything inside the room, >= 15 mm from finished wall faces, below the ceiling", () => {
  const g = 0.015 - 1e-6;
  for (let i = 0; i < P.length; i++)
    for (const w of world[i]) {
      for (const v of w.poly.verts) {
        const where = `${P[i].type}#${i}.${w.name} at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
        assert.ok(v.x >= KF.x0 + g && v.x <= KF.x1 - g, `x clearance: ${where}`);
        assert.ok(v.z <= KF.z1 - g && v.z >= KF.z0, `z: ${where}`);
        assert.ok(v.y >= -1e-6 && v.y <= CEILING_Y - 0.005, `y: ${where}`);
      }
    }
});

test("kitchen: no interpenetration between assemblies (exact convex check, > 0.3 mm)", () => {
  // separate bodies that start interpenetrating get shoved apart by the solver (stacked dishes
  // explode), so even sub-millimetre overlaps count
  const bad: string[] = [];
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++) {
      if (!overlap(asmBox[i], asmBox[j])) continue;
      for (const a of world[i]) {
        if (!overlap(a.box, asmBox[j])) continue;
        for (const b of world[j]) {
          if (!overlap(a.box, b.box)) continue;
          const c = polyContact(a.poly, b.poly, 0);
          if (c && c.sep < -0.0003) bad.push(`${P[i].type}#${i}.${a.name} × ${P[j].type}#${j}.${b.name} (${(c.sep * 1000).toFixed(1)} mm)`);
        }
      }
    }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} interpenetrations`);
});

test("kitchen: items rest on the floor or on their support (±2 mm)", () => {
  const bad: string[] = [];
  for (let i = 0; i < P.length; i++) {
    if (wallMounted(i) || P[i].type === "knife") continue; // knives hang in their slots by the bolster
    // lowest vertex of the item
    let low = { x: 0, y: Infinity, z: 0 };
    for (const w of world[i]) for (const v of w.poly.verts) if (v.y < low.y) low = { x: v.x, y: v.y, z: v.z };
    const sup = L.on[i];
    if (sup < 0) {
      if (Math.abs(low.y) > 0.002) bad.push(`${P[i].type}#${i} floor gap ${(low.y * 1000).toFixed(1)} mm`);
      continue;
    }
    // highest surface under the lowest point among the support and its other contents
    const cands = [sup, ...L.on.map((s, k) => (s === sup && k !== i ? k : -1)).filter((k) => k >= 0)];
    let best = -Infinity;
    for (const k of cands)
      for (const w of world[k]) {
        if (low.x < w.box.min.x - 0.002 || low.x > w.box.max.x + 0.002 || low.z < w.box.min.z - 0.002 || low.z > w.box.max.z + 0.002) continue;
        if (w.box.max.y <= low.y + 0.0025) best = Math.max(best, w.box.max.y);
      }
    const gap = low.y - best;
    if (gap >= -0.002 && gap <= 0.002) continue;
    // nested items (bowls) rest rim-on-rim: accept a supporting convex contact within 2.5 mm
    let nested = false;
    for (const a of world[i]) {
      for (const k of cands)
        for (const w of world[k]) {
          if (!overlap(a.box, w.box, 0.003)) continue;
          const c = polyContact(a.poly, w.poly, 0.0025);
          if (c && c.sep >= -0.002 && c.sep <= 0.0025 && Math.abs(c.normal.y) > 0.3) nested = true;
        }
      if (nested) break;
    }
    if (!nested) bad.push(`${P[i].type}#${i} on ${P[sup].type}: gap ${(gap * 1000).toFixed(1)} mm`);
  }
  assert.deepEqual(bad, []);
});

test("kitchen: clear paths, fridge door swing and the foyer opening stay free", () => {
  const floorItems = P.map((_, i) => i);
  const zoneFree = (name: string, x0: number, x1: number, z0: number, z1: number, y1: number, except = ""): void => {
    for (const i of floorItems) {
      if (P[i].type === except) continue;
      for (const w of world[i]) {
        if (w.box.max.x <= x0 || w.box.min.x >= x1 || w.box.max.z <= z0 || w.box.min.z >= z1 || w.box.min.y >= y1) continue;
        assert.fail(`${name} blocked by ${P[i].type}#${i}.${w.name}`);
      }
    }
  };
  // working aisle between the north run (handles ~8.07) and the island (7.02): >= 0.9 m
  zoneFree("north aisle", 5.0, 8.2, 7.03, 7.95, 1.4);
  // aisle between the west run and the island
  zoneFree("west aisle", 4.75, 5.66, 6.1, 7.0, 1.4);
  // fridge doors swing to 90° (0.84 m) into the room in front of the fridge
  zoneFree("fridge door swing", 8.29, 9.12, 7.14, 7.985, 1.78, "fridge");
  // cased opening to the foyer (east wall, z 4.6..5.8): 0.9 m deep approach kept clear
  zoneFree("foyer opening", 8.2, KF.x1, 4.6, 5.87, 2.1);
  // the room's open side towards the living room (dining approach)
  zoneFree("living approach", 4.5, 8.5, 5.0, 5.75, 1.0);
});

test("kitchen: clear of the backsplash tiles, switch/outlet plates and the sink stub-outs", () => {
  // keep-out boxes in world space: [label, x0, x1, y0, y1, z0, z1, allowed placement types]
  const boxes: Array<[string, number, number, number, number, number, number, string[]]> = [];
  for (const zn of WALL_TILE_ZONES)
    if (zn.room === "kitchen" && zn.side === "n") boxes.push([`backsplash tiles`, zn.from, zn.to, zn.y0, zn.y1, KF.z1 - WALL_TILE_T - 0.015, KF.z1, []]);
  const face: Record<string, { axis: "x" | "z"; at: number; dir: 1 | -1 }> = {
    p_utility_kitchen: { axis: "x", at: KF.x0, dir: 1 },
    p_kitchen_foyer: { axis: "x", at: KF.x1, dir: -1 },
    north: { axis: "z", at: KF.z1, dir: -1 },
  };
  for (const e of ELECTRICAL) {
    if (e.room !== "kitchen" || e.at === undefined || !face[e.wall]) continue;
    const f = face[e.wall];
    const proud = ELEC_PLATE_T + (e.kind === "switch" ? 0.006 : 0) + 0.01; // plate (+ rocker) + 1 cm
    const n0 = f.dir > 0 ? f.at : f.at - proud,
      n1 = f.dir > 0 ? f.at + proud : f.at;
    const [a0, a1] = [e.at - ELEC_PLATE_W / 2, e.at + ELEC_PLATE_W / 2];
    const [y0, y1] = [e.y - ELEC_PLATE_H / 2, e.y + ELEC_PLATE_H / 2];
    if (f.axis === "x") boxes.push([e.id, n0, n1, y0, y1, a0, a1, []]);
    else boxes.push([e.id, a0, a1, y0, y1, n0, n1, []]);
  }
  // sink stub-outs (valve bodies 5..45 mm off the face, drain stub to 58 mm): only the north run's
  // supply/drain lines connect there
  const sp = SERVICE_POINTS.find((s) => s.id === "kitchenSink")!;
  boxes.push(["sink stub-outs", sp.face, sp.face + 0.06, Math.min(sp.valveY, sp.drainY ?? sp.valveY) - 0.03, sp.valveY + 0.03, sp.along - 0.13, sp.along + 0.13, ["kitchenNorthRun"]]);
  assert.ok(boxes.length >= 7, `keep-out boxes: ${boxes.map((b) => b[0]).join(", ")}`);
  const bad: string[] = [];
  for (const [label, x0, x1, y0, y1, z0, z1, allowed] of boxes) {
    const keep = polyBox(v3(x1 - x0, y1 - y0, z1 - z0), faceAttr(0), { p: v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q: { x: 0, y: 0, z: 0, w: 1 } });
    const kb = aabbOf(keep);
    for (let i = 0; i < P.length; i++) {
      if (allowed.includes(P[i].type) || !overlap(asmBox[i], kb)) continue;
      for (const w of world[i]) {
        if (!overlap(w.box, kb)) continue;
        const c = polyContact(w.poly, keep, 0);
        if (c && c.sep < -1e-4) bad.push(`${label} × ${P[i].type}#${i}.${w.name} (${(c.sep * 1000).toFixed(1)} mm)`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("kitchen: layout is deterministic", () => {
  const a = JSON.stringify(kitchenLayout().placements.map((p) => [p.type, p.xf, p.def.parts.length]));
  const b = JSON.stringify(kitchenLayout().placements.map((p) => [p.type, p.xf, p.def.parts.length]));
  assert.equal(a, b);
});
