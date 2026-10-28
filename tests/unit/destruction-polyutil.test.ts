import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBox, quatFromBasis, sharedFaceArea, convexIntersectionArea, filterCracks, signedDistance, largestFace, nearestFace, faceArea } from "../../src/destruction/runtime/polyUtil.ts";
import { PartGrid } from "../../src/destruction/runtime/partGrid.ts";
import { qaxisAngle, qrot, qmul, vnorm } from "../../src/geom/vec.ts";
import { Rng } from "../../src/core/rng.ts";
import { boxPoly, taperedPoly, near } from "./destruction-helpers.ts";

test("detectBox: axis-aligned box", () => {
  const b = detectBox(boxPoly({ x: 1, y: 2, z: 3 }, { x: 0.4, y: 0.1, z: 0.8 }));
  assert.ok(b);
  assert.ok(near(b.center.x, 1) && near(b.center.y, 2) && near(b.center.z, 3));
  const dims = [b.size.x, b.size.y, b.size.z].sort();
  assert.ok(near(dims[0], 0.1) && near(dims[1], 0.4) && near(dims[2], 0.8));
  // rotation maps the local axes onto box edges: each rotated axis is ± a world axis here
  for (const ax of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
    const r = qrot(b.rot, ax);
    const m = Math.max(Math.abs(r.x), Math.abs(r.y), Math.abs(r.z));
    assert.ok(near(m, 1, 1e-9));
  }
});

test("detectBox: rotated box reproduces its corners", () => {
  const q = qmul(qaxisAngle({ x: 0, y: 1, z: 0 }, 0.7), qaxisAngle({ x: 1, y: 0, z: 0 }, 0.3));
  const poly = boxPoly({ x: -2, y: 0.5, z: 4 }, { x: 0.3, y: 0.05, z: 1.2 }, q);
  const b = detectBox(poly);
  assert.ok(b);
  // every corner of the detected box must coincide with a poly vertex
  for (let i = 0; i < 8; i++) {
    const l = { x: (i & 1 ? 0.5 : -0.5) * b.size.x, y: (i & 2 ? 0.5 : -0.5) * b.size.y, z: (i & 4 ? 0.5 : -0.5) * b.size.z };
    const r = qrot(b.rot, l);
    const p = { x: r.x + b.center.x, y: r.y + b.center.y, z: r.z + b.center.z };
    const hit = poly.verts.some((v) => near(v.x, p.x, 1e-6) && near(v.y, p.y, 1e-6) && near(v.z, p.z, 1e-6));
    assert.ok(hit, `corner ${i} matches`);
  }
});

test("detectBox: rejects non-boxes", () => {
  assert.equal(detectBox(taperedPoly({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 0.6)), null);
  const p = boxPoly({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  p.verts.pop();
  assert.equal(detectBox(p), null);
});

test("quatFromBasis inverts qrot for random rotations", () => {
  const rng = new Rng(42);
  for (let i = 0; i < 200; i++) {
    const q = qaxisAngle(vnorm(rng.onSphere()), rng.range(-Math.PI, Math.PI));
    const u = qrot(q, { x: 1, y: 0, z: 0 });
    const v = qrot(q, { x: 0, y: 1, z: 0 });
    const w = qrot(q, { x: 0, y: 0, z: 1 });
    const r = quatFromBasis(u, v, w);
    const u2 = qrot(r, { x: 1, y: 0, z: 0 });
    const v2 = qrot(r, { x: 0, y: 1, z: 0 });
    assert.ok(near(u2.x, u.x, 1e-9) && near(u2.y, u.y, 1e-9) && near(u2.z, u.z, 1e-9));
    assert.ok(near(v2.x, v.x, 1e-9) && near(v2.y, v.y, 1e-9) && near(v2.z, v.z, 1e-9));
  }
});

test("convexIntersectionArea: squares", () => {
  const sq = (x: number, y: number, s: number): [number[], number[]] => [
    [x, x + s, x + s, x],
    [y, y, y + s, y + s],
  ];
  const [ax, ay] = sq(0, 0, 1);
  const [bx, by] = sq(0.5, 0.5, 1);
  assert.ok(near(convexIntersectionArea(ax, ay, bx, by), 0.25, 1e-12));
  // clockwise clipper
  assert.ok(near(convexIntersectionArea(ax, ay, bx.slice().reverse(), by.slice().reverse()), 0.25, 1e-12));
  const [cx, cy] = sq(2, 2, 1);
  assert.equal(convexIntersectionArea(ax, ay, cx, cy), 0);
});

test("sharedFaceArea: stacked, offset, nested, separated", () => {
  const a = boxPoly({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  const stacked = boxPoly({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 1 });
  assert.ok(near(sharedFaceArea(a, stacked), 1, 1e-9));
  const offset = boxPoly({ x: 0.5, y: 1, z: 0 }, { x: 1, y: 1, z: 1 });
  assert.ok(near(sharedFaceArea(a, offset), 0.5, 1e-9));
  const small = boxPoly({ x: 0.1, y: 0.55, z: 0 }, { x: 0.2, y: 0.1, z: 0.3 });
  assert.ok(near(sharedFaceArea(a, small), 0.06, 1e-9));
  const far = boxPoly({ x: 0, y: 3, z: 0 }, { x: 1, y: 1, z: 1 });
  assert.equal(sharedFaceArea(a, far), 0);
  const edge = boxPoly({ x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 1 });
  assert.ok(sharedFaceArea(a, edge) < 1e-9, "edge contact has no area");
});

test("face helpers", () => {
  const a = boxPoly({ x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 0.5 });
  assert.ok(near(faceArea(a, a.faces[0]), 0.5));
  assert.ok(near(faceArea(a, a.faces[2]), 1.0));
  const lf = largestFace(a);
  assert.ok(near(faceArea(a, a.faces[lf]), 2));
  assert.equal(nearestFace(a, { x: 0, y: 0.5, z: 0 }), 2);
  assert.ok(near(signedDistance(a, { x: 0, y: 0, z: 0 }), -0.25));
  assert.ok(near(signedDistance(a, { x: 3, y: 0, z: 0 }), 2));
});

test("filterCracks keeps crack runs on the fragment surface", () => {
  const half = boxPoly({ x: -0.25, y: 0, z: 0 }, { x: 0.5, y: 1, z: 1 }); // x in [-0.5, 0]
  const crack = {
    points: [
      { x: -0.4, y: 0.5, z: 0 },
      { x: -0.2, y: 0.5, z: 0.1 },
      { x: 0.2, y: 0.5, z: 0.1 }, // outside the fragment
      { x: 0.4, y: 0.5, z: 0 },
    ],
    n: { x: 0, y: 1, z: 0 },
    width: 0.002,
  };
  const out = filterCracks([crack], half);
  assert.equal(out.length, 1);
  assert.equal(out[0].points.length, 2);
});

test("PartGrid: queries return every box containing the point, no duplicates", () => {
  const rng = new Rng(7);
  const boxes = [];
  for (let i = 0; i < 300; i++) {
    const c = { x: rng.range(0, 5), y: rng.range(0, 2.7), z: rng.range(0, 0.2) };
    const h = { x: rng.range(0.01, 0.4), y: rng.range(0.01, 0.6), z: rng.range(0.005, 0.1) };
    boxes.push({ min: { x: c.x - h.x, y: c.y - h.y, z: c.z - h.z }, max: { x: c.x + h.x, y: c.y + h.y, z: c.z + h.z } });
  }
  const grid = new PartGrid(boxes, 0.01);
  const out: number[] = [];
  for (let t = 0; t < 2000; t++) {
    const p = { x: rng.range(-0.5, 5.5), y: rng.range(-0.5, 3.2), z: rng.range(-0.2, 0.4) };
    grid.query(p, out);
    assert.equal(new Set(out).size, out.length);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const inside = p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
      if (inside) assert.ok(out.includes(i), `box ${i} contains the point but was not returned`);
    }
  }
  // radius queries are supersets
  const p = { x: 2, y: 1, z: 0.1 };
  const a = grid.query(p, [], 0).slice();
  const b = grid.query(p, [], 0.5);
  for (const i of a) assert.ok(b.includes(i));
});

test("PartGrid: empty grid is safe", () => {
  const g = new PartGrid([]);
  assert.deepEqual(g.query({ x: 0, y: 0, z: 0 }, []), []);
});
