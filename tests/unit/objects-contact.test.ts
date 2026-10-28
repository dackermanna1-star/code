// Unit tests: builder contact analysis (src/objects/lib/contact.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { polyBox, polyCylinder, polyTransform, polyVolume, polyCentroid, faceAttr } from "../../src/geom/poly.ts";
import { qeuler, v3, type Vec3 } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
import { polyContact, polySd, polyInside, polyPointDist, samplePoly, overlappingPairs, aabbOf, type Aabb } from "../../src/objects/lib/contact.ts";

const A = faceAttr(0);
const box = (sx: number, sy: number, sz: number, px = 0, py = 0, pz = 0, rot?: [number, number, number]) =>
  polyBox(v3(sx, sy, sz), A, { p: v3(px, py, pz), q: rot ? qeuler((rot[0] * Math.PI) / 180, (rot[1] * Math.PI) / 180, (rot[2] * Math.PI) / 180) : { x: 0, y: 0, z: 0, w: 1 } });
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("face contact between stacked boxes: area, centre, normal", () => {
  const a = box(1, 0.02, 0.4, 0, 0.01, 0);
  const b = box(0.2, 0.3, 0.1, 0.3, 0.17, -0.05);
  const c = polyContact(a, b, 0.003)!;
  assert.ok(c, "contact expected");
  assert.equal(c.kind, "face");
  assert.ok(near(c.area, 0.2 * 0.1, 1e-9), `area ${c.area}`);
  assert.ok(near(c.point.x, 0.3, 1e-9) && near(c.point.y, 0.02, 1e-9) && near(c.point.z, -0.05, 1e-9), JSON.stringify(c.point));
  assert.ok(near(c.normal.y, 1, 1e-9), "normal points from A to B (+Y)");
  assert.ok(Math.abs(c.sep) < 1e-9);
  assert.equal(c.penetrating, false);
  assert.ok(near(c.length, Math.hypot(0.2, 0.1), 1e-9));
});

test("tolerance: a 2 mm gap is touching at tol 3 mm, separated at tol 1 mm", () => {
  const a = box(0.5, 0.5, 0.5);
  const b = box(0.5, 0.5, 0.5, 0.502, 0, 0);
  const c = polyContact(a, b, 0.003)!;
  assert.ok(c && near(c.sep, 0.002, 1e-9) && c.kind === "face" && near(c.area, 0.25, 1e-9));
  assert.equal(polyContact(a, b, 0.001), null);
});

test("penetration is flagged and the patch centre lies inside the overlap", () => {
  const a = box(0.4, 0.4, 0.4);
  const b = box(0.4, 0.4, 0.4, 0, 0.39, 0);
  const c = polyContact(a, b, 0.003)!;
  assert.ok(c.penetrating, "1 cm overlap > 3 mm tolerance");
  assert.ok(near(c.sep, -0.01, 1e-9));
  assert.ok(c.point.y > 0.19 && c.point.y < 0.2);
});

test("edge contact: a box resting on its edge gives a line contact", () => {
  const a = box(1, 0.1, 1, 0, -0.05, 0);
  const h = Math.SQRT1_2 * 0.2; // 0.2 m cube rotated 45° about Z: its lowest edge at y = 0
  const b = box(0.2, 0.2, 0.2, 0, h, 0, [0, 0, 45]);
  const c = polyContact(a, b, 0.003)!;
  assert.ok(c, "edge contact expected");
  assert.equal(c.kind, "edge");
  assert.equal(c.area, 0);
  assert.ok(near(c.length, 0.2, 1e-6), `length ${c.length}`);
});

test("separated along an edge-edge axis only: SAT finds it (no false touch)", () => {
  // Two cubes rotated so that their closest features are edges crossing at right angles.
  const a = box(0.2, 0.2, 0.2, 0, 0, 0, [45, 0, 0]);
  const b = box(0.2, 0.2, 0.2, 0, 0.2 * Math.SQRT2 + 0.01, 0, [0, 0, 45]);
  assert.equal(polyContact(a, b, 0.003), null, "1 cm gap between crossing edges");
  assert.ok(polyContact(a, b, 0.02));
});

test("cylinder resting on a board: face contact equals the cap polygon area", () => {
  const board = box(1, 0.02, 0.1, 0, 0.01, 0);
  const cyl = polyTransform(polyCylinder(0.05, 0.05, 0.2, 12, A, A), { p: v3(0.3, 0.12, 0), q: { x: 0, y: 0, z: 0, w: 1 } });
  const c = polyContact(board, cyl)!;
  const capArea = 6 * 0.05 * 0.05 * Math.sin(Math.PI / 6);
  assert.ok(c && c.kind === "face" && near(c.area, Math.min(capArea, 0.1 * 0.1), 1e-6), `area ${c?.area}`);
});

test("signed distance, containment and point distance", () => {
  const b = box(1, 1, 1);
  assert.ok(polySd(b, v3(0, 0, 0)) < 0);
  assert.ok(near(polySd(b, v3(0.7, 0, 0)), 0.2, 1e-12));
  assert.ok(near(polyPointDist(b, v3(0.7, 0, 0)), 0.2, 1e-12));
  assert.ok(near(polyPointDist(b, v3(0.8, 0.8, 0)), Math.hypot(0.3, 0.3), 1e-12), "corner region uses the true distance");
  assert.equal(polyPointDist(b, v3(0.1, 0.1, 0.1)), 0);
  assert.ok(polyInside(box(0.2, 0.2, 0.2, 0.1, 0, 0), b));
  assert.ok(!polyInside(box(0.2, 0.2, 0.2, 0.45, 0, 0), b));
});

test("samplePoly: points inside, mean ≈ centroid (rotated thin sheet)", () => {
  const p = box(0.6, 0.002, 0.4, 0.1, 0.2, -0.3, [20, 35, 10]);
  const pts = samplePoly(p, 4000, new Rng(7));
  assert.equal(pts.length, 4000);
  let mx = 0,
    my = 0,
    mz = 0;
  for (const q of pts) {
    assert.ok(polySd(p, q) <= 1e-9, "sample outside");
    mx += q.x;
    my += q.y;
    mz += q.z;
  }
  const c = polyCentroid(p);
  assert.ok(Math.hypot(mx / 4000 - c.x, my / 4000 - c.y, mz / 4000 - c.z) < 0.01);
  assert.ok(polyVolume(p) > 0);
});

test("overlappingPairs matches brute force", () => {
  const rng = new Rng(3);
  const boxes: Aabb[] = [];
  for (let i = 0; i < 120; i++) {
    const c: Vec3 = { x: rng.range(0, 3), y: rng.range(0, 1), z: rng.range(0, 3) };
    const s = rng.range(0.05, 0.4);
    boxes.push({ min: { x: c.x - s, y: c.y - s, z: c.z - s }, max: { x: c.x + s, y: c.y + s, z: c.z + s } });
  }
  const pad = 0.01;
  const got = new Set(overlappingPairs(boxes, pad).map(([i, j]) => `${i},${j}`));
  let n = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      const ov = a.min.x <= b.max.x + pad && b.min.x <= a.max.x + pad && a.min.y <= b.max.y + pad && b.min.y <= a.max.y + pad && a.min.z <= b.max.z + pad && b.min.z <= a.max.z + pad;
      if (ov) {
        n++;
        assert.ok(got.has(`${i},${j}`), `missing pair ${i},${j}`);
      }
    }
  assert.equal(got.size, n);
  const bb = aabbOf(box(1, 2, 3, 1, 1, 1));
  assert.ok(near(bb.min.x, 0.5) && near(bb.max.z, 2.5));
});
