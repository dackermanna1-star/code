// Unit tests: builder point-set generators (src/objects/lib/shapes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { v3, vsub, vlen, vdot, vnorm, type Vec3 } from "../../src/geom/vec.ts";
import { tubeSegments, arcPoints, frameBarPoints } from "../../src/objects/lib/shapes.ts";

const same = (a: Vec3, b: Vec3, eps = 1e-12) => vlen(vsub(a, b)) <= eps;

test("tube: neighbouring segments share their joint ring exactly (planar and non-planar paths)", () => {
  const paths: Vec3[][] = [
    [v3(0, 0, 0), v3(0.2, 0, 0), v3(0.2, 0.2, 0), v3(0.4, 0.25, 0)],
    [v3(0, 0, 0), v3(0.2, 0, 0), v3(0.2, 0.2, 0.1), v3(0.4, 0.2, 0.3), v3(0.3, 0.5, 0.2)],
  ];
  for (const path of paths) {
    const k = 7;
    const segs = tubeSegments(path, 0.01, k);
    assert.equal(segs.length, path.length - 1);
    for (let i = 0; i + 1 < segs.length; i++) {
      const end = segs[i].points.slice(k);
      const start = segs[i + 1].points.slice(0, k);
      for (let q = 0; q < k; q++) assert.ok(same(end[q], start[q]), `ring mismatch at joint ${i + 1}`);
      // the joint ring lies in the mitre (bisector) plane through the joint
      const m = vnorm(vsub(vnorm(vsub(path[i + 1], path[i])), vnorm(vsub(path[i + 1], path[i + 2]))));
      for (const p of start) assert.ok(Math.abs(vdot(vsub(p, path[i + 1]), m)) < 1e-12, "ring not in the mitre plane");
    }
  }
});

test("tube: end rings are circles of the tube radius perpendicular to the path", () => {
  const segs = tubeSegments([v3(0, 0, 0), v3(0, 0.3, 0), v3(0.3, 0.3, 0)], 0.02, 8);
  const ring0 = segs[0].points.slice(0, 8);
  for (const p of ring0) {
    assert.ok(Math.abs(vlen(p) - 0.02) < 1e-12);
    assert.ok(Math.abs(p.y) < 1e-12);
  }
  // 90° bend: the mitre ring is stretched by 1/cos(45°) along the bend direction, radius kept across it
  const joint = segs[0].points.slice(8);
  const radii = joint.map((p) => vlen(vsub(p, v3(0, 0.3, 0))));
  assert.ok(Math.abs(Math.min(...radii) - 0.02) < 1e-9);
  assert.ok(Math.abs(Math.max(...radii) - 0.02 * Math.SQRT2) < 1e-9);
});

test("tube: closed loop and degenerate inputs", () => {
  const tri = [90, 210, 330].map((a) => v3(Math.cos((a * Math.PI) / 180), 0, Math.sin((a * Math.PI) / 180)));
  const segs = tubeSegments(tri, 0.05, 6, true);
  assert.equal(segs.length, 3);
  for (let i = 0; i < 3; i++) {
    const end = segs[i].points.slice(6);
    const start = segs[(i + 1) % 3].points.slice(0, 6);
    for (let q = 0; q < 6; q++) assert.ok(same(end[q], start[q], 1e-9));
  }
  assert.throws(() => tubeSegments([v3(0, 0, 0)], 0.01), /at least 2/);
  assert.throws(() => tubeSegments([v3(0, 0, 0), v3(1, 0, 0), v3(0, 0, 0.01)], 0.01), /bend/);
  assert.throws(() => tubeSegments([v3(0, 0, 0), v3(1, 0, 0)], 0), /radius/);
  // duplicate points are ignored
  assert.equal(tubeSegments([v3(0, 0, 0), v3(0, 0, 0), v3(1, 0, 0)], 0.01).length, 1);
});

test("arcPoints and frameBarPoints", () => {
  const pts = arcPoints(v3(1, 2, 3), 0.5, 0, 90, 4, "xz");
  assert.equal(pts.length, 5);
  assert.ok(same(pts[0], v3(1.5, 2, 3), 1e-12) && same(pts[4], v3(1, 2, 3.5), 1e-12));
  // axis-based names: left bar = -X side, right bar = +X side
  const fb = frameBarPoints(1, 0.6, { top: 0.03, bottom: 0.03, left: 0.03, right: 0.05 }, 0, 0.02);
  assert.ok(Math.abs(fb.inner.x0 + 0.47) < 1e-12 && Math.abs(fb.inner.x1 - 0.45) < 1e-12);
  assert.ok(fb.left.every((p) => p.x < -0.46) && fb.right.every((p) => p.x > 0.44));
  assert.equal(fb.top.length, 8);
  assert.throws(() => frameBarPoints(0.1, 0.1, 0.06, 0, 0.01), /no opening/);
});
