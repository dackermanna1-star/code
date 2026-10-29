import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_CUBE_FACES,
  CUBE_FACE_AXES,
  addCircleTexels,
  boxDisplacement,
  circleHitsRect,
  cubeFaceMask,
  emptyRect,
  projectBoxToFace,
  rectIsEmpty,
  RectSet,
  unionRect,
} from "../../src/render/env/shadowMath.ts";

/** Exact face membership of a point (light at the origin): q·axis ≥ |q·other| for both others. */
function pointFaces(x: number, y: number, z: number): number {
  const q = [x, y, z];
  let m = 0;
  CUBE_FACE_AXES.forEach(([a, s], f) => {
    const c = s * q[a];
    if (c >= Math.abs(q[(a + 1) % 3]) - 1e-12 && c >= Math.abs(q[(a + 2) % 3]) - 1e-12 && c > 0) m |= 1 << f;
  });
  return m;
}

test("cube face axes follow Babylon's PointLight order (+X, -X, -Y, +Y, +Z, -Z)", () => {
  assert.deepEqual(
    CUBE_FACE_AXES.map(([a, s]) => `${s > 0 ? "+" : "-"}${"XYZ"[a]}`),
    ["+X", "-X", "-Y", "+Y", "+Z", "-Z"],
  );
});

test("cubeFaceMask never misses a face that any point of the sphere falls into", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
  for (let i = 0; i < 3000; i++) {
    const cx = rnd() * 6,
      cy = rnd() * 3,
      cz = rnd() * 6;
    const r = Math.abs(rnd()) * 1.5 + 0.01;
    const mask = cubeFaceMask(cx, cy, cz, r);
    for (let k = 0; k < 60; k++) {
      // random point inside the sphere
      let px, py, pz;
      do {
        px = rnd();
        py = rnd();
        pz = rnd();
      } while (px * px + py * py + pz * pz > 1);
      const f = pointFaces(cx + px * r, cy + py * r, cz + pz * r);
      assert.equal(f & ~mask, 0, `sphere (${cx},${cy},${cz}) r=${r} misses faces ${f & ~mask}`);
    }
  }
});

test("cubeFaceMask culls: a small sphere straight along an axis touches one face", () => {
  assert.equal(cubeFaceMask(3, 0, 0, 0.2), 1);
  assert.equal(cubeFaceMask(-3, 0, 0, 0.2), 2);
  assert.equal(cubeFaceMask(0, -3, 0, 0.2), 4);
  assert.equal(cubeFaceMask(0, 3, 0, 0.2), 8);
  assert.equal(cubeFaceMask(0, 0, 3, 0.2), 16);
  assert.equal(cubeFaceMask(0, 0, -3, 0.2), 32);
  // near a diagonal edge: the two adjacent faces
  assert.equal(cubeFaceMask(3, 0, 3, 0.2), 1 | 16);
  // enclosing the light: everything; garbage input: everything (conservative)
  assert.equal(cubeFaceMask(0.1, 0, 0, 0.5), ALL_CUBE_FACES);
  assert.equal(cubeFaceMask(NaN, 0, 0, 0.5), ALL_CUBE_FACES);
});

test("boxDisplacement bounds the motion of every box corner and is 0 for identical poses", () => {
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.equal(boxDisplacement(ident, ident, 1, 2, 3, 0.5, 0.5, 0.5), 0);
  // pure translation
  const moved = ident.slice();
  moved[12] = 0.003;
  moved[14] = -0.004;
  assert.ok(Math.abs(boxDisplacement(ident, moved, 0.2, 0, 0, 1, 1, 1) - 0.005) < 1e-9);
  // rotation about Y by a small angle: the bound covers the true corner displacement
  const a = 0.01;
  const rot = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  const c = [0.3, 0.1, -0.2],
    e = [0.6, 0.4, 0.9];
  const bound = boxDisplacement(ident, rot, c[0], c[1], c[2], e[0], e[1], e[2]);
  let worst = 0;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const p = [c[0] + sx * e[0], c[1] + sy * e[1], c[2] + sz * e[2]];
        const q = [p[0] * rot[0] + p[1] * rot[4] + p[2] * rot[8], p[0] * rot[1] + p[1] * rot[5] + p[2] * rot[9], p[0] * rot[2] + p[1] * rot[6] + p[2] * rot[10]];
        worst = Math.max(worst, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
      }
  assert.ok(bound >= worst - 1e-9, `${bound} < ${worst}`);
  assert.ok(bound < worst * 3, "bound reasonably tight");
  assert.equal(boxDisplacement(ident, [NaN, ...ident.slice(1)], 0, 0, 0, 1, 1, 1), Infinity);
});

test("texel rectangles: circle footprint, padding, clamping, union and overlap", () => {
  const r = emptyRect();
  assert.ok(rectIsEmpty(r));
  // map 100 texels of 0.1 m starting at (-5, -5)
  assert.ok(addCircleTexels(r, 0, 0, 0.25, -5, -5, 0.1, 0.1, 100, 1));
  assert.deepEqual(r, { x0: 46, y0: 46, x1: 54, y1: 54 });
  // off the map: untouched, false
  assert.equal(addCircleTexels(r, 50, 0, 0.25, -5, -5, 0.1, 0.1, 100, 1), false);
  assert.deepEqual(r, { x0: 46, y0: 46, x1: 54, y1: 54 });
  // clamped at the edge
  addCircleTexels(r, -4.95, 4.95, 0.2, -5, -5, 0.1, 0.1, 100, 2);
  assert.equal(r.x0, 0);
  assert.equal(r.y1, 100);
  unionRect(r, 10, 10, 10, 20); // empty input ignored
  assert.equal(r.x1, 54);
  const q = { x0: 10, y0: 10, x1: 20, y1: 20 };
  assert.ok(circleHitsRect(q, -3.5, -3.5, 0.1, -5, -5, 0.1, 0.1)); // centre at texel 15
  assert.ok(!circleHitsRect(q, 0, 0, 0.1, -5, -5, 0.1, 0.1));
  assert.ok(circleHitsRect(q, -2.95, -3.5, 0.1, -5, -5, 0.1, 0.1)); // touches x1 = -3.0
  assert.ok(!circleHitsRect(emptyRect(), -3.5, -3.5, 1, -5, -5, 0.1, 0.1));
  // non-square texels (a 16 × 8 m light-space box on a 100² map): rows follow the y texel size
  const ns = emptyRect();
  assert.ok(addCircleTexels(ns, 0, 0, 0.4, -8, -4, 0.16, 0.08, 100, 0));
  assert.deepEqual(ns, { x0: 47, y0: 45, x1: 53, y1: 55 });
  assert.ok(circleHitsRect(ns, 0, 0, 0.01, -8, -4, 0.16, 0.08));
  assert.ok(!circleHitsRect(ns, 0, 0.6, 0.1, -8, -4, 0.16, 0.08)); // row 57.5..: outside y1 = 55
});

test("RectSet keeps distant regions apart, merges overlapping / near ones, caps the count", () => {
  const s = new RectSet(3, 4);
  assert.ok(s.empty);
  s.add(0, 0, 10, 10);
  s.add(100, 100, 110, 110);
  assert.equal(s.count, 2);
  s.add(12, 0, 20, 10); // within slack of the first
  assert.equal(s.count, 2);
  assert.deepEqual(s.bounds({ x0: 0, y0: 0, x1: 0, y1: 0 }), { x0: 0, y0: 0, x1: 110, y1: 110 });
  s.add(200, 0, 210, 10);
  assert.equal(s.count, 3);
  // a rectangle bridging two existing ones coalesces them
  s.add(18, 0, 105, 105);
  assert.equal(s.count, 2);
  // over the cap: joins the rectangle it grows least
  const t = new RectSet(2, 0);
  t.add(0, 0, 10, 10);
  t.add(100, 0, 110, 10);
  t.add(115, 0, 120, 10);
  assert.equal(t.count, 2);
  assert.ok(t.hitsCircle(117 * 0.1, 0.5, 0.05, 0, 0, 0.1, 0.1));
  assert.ok(!t.hitsCircle(50 * 0.1, 0.5, 0.05, 0, 0, 0.1, 0.1));
  // rectangles in the set never overlap after coalescing, so the area is exact
  const u = new RectSet(8, 0);
  u.add(0, 0, 10, 10);
  u.add(5, 5, 15, 15);
  assert.equal(u.count, 1);
  assert.equal(u.area(), 225);
  u.add(0, 0, 0, 10); // empty input ignored
  assert.equal(u.count, 1);
  const v = new RectSet(8, 0);
  v.addAll(u);
  v.add(50, 50, 60, 60);
  assert.equal(v.count, 2);
  v.clear();
  assert.ok(v.empty);
});

test("RectSet.hitsRect uses half-open rectangles", () => {
  const s = new RectSet();
  s.add(10, 10, 20, 20);
  assert.ok(s.hitsRect(15, 15, 30, 30));
  assert.ok(!s.hitsRect(20, 10, 30, 20)); // touching edges only: no overlap
});

test("projectBoxToFace covers every projected point of the box, including boxes straddling the near plane", () => {
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const out = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let seed = 99;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
  const size = 256,
    near = 0.05;
  for (let i = 0; i < 400; i++) {
    const c = [rnd() * 2, rnd() * 2, rnd() * 3];
    const e = [Math.abs(rnd()) * 0.8 + 0.01, Math.abs(rnd()) * 0.3 + 0.01, Math.abs(rnd()) * 0.8 + 0.01];
    const hit = projectBoxToFace(view, c[0] - e[0], c[1] - e[1], c[2] - e[2], c[0] + e[0], c[1] + e[1], c[2] + e[2], size, near, 0, out);
    for (let k = 0; k < 120; k++) {
      const p = [c[0] + rnd() * e[0], c[1] + rnd() * e[1], c[2] + rnd() * e[2]];
      if (p[2] <= near) continue;
      const nx = p[0] / p[2],
        ny = p[1] / p[2];
      if (Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;
      const tx = (nx + 1) * size * 0.5,
        ty = (ny + 1) * size * 0.5;
      assert.ok(hit, `box ${c}±${e} reported as missing a visible point`);
      assert.ok(tx >= out.x0 - 1e-9 && tx <= out.x1 + 1e-9 && ty >= out.y0 - 1e-9 && ty <= out.y1 + 1e-9, `point (${tx},${ty}) outside ${JSON.stringify(out)}`);
    }
  }
  // a flat disc just above the light (a fan's blades) only touches the upper band of a side face
  assert.ok(projectBoxToFace(view, -0.66, 0.12, -0.66, 0.66, 0.2, 0.66, size, near, 0, out));
  assert.ok(out.y0 > size * 0.5 && out.y1 === size, JSON.stringify(out));
  // entirely behind: miss
  assert.equal(projectBoxToFace(view, -1, -1, -3, 1, 1, -2, size, near, 0, out), false);
});
