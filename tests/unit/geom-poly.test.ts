import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoUV,
  faceAttr,
  polyBox,
  polyBeveledBox,
  polyCylinder,
  polyPrism,
  polyFromHull,
  polyTransform,
  polyClip,
  polyVolume,
  polyCentroid,
  polyBounds,
  polyWidth,
  polyExtents,
  polySignedDist,
  polyClosestPoint,
  polyPoints,
  polyFaceAreaOnPlane,
  polyClone,
  polyChord,
  polyContains,
  polyHiddenFaces,
  polySurfaceArea,
  hasUV,
  type ConvexPoly,
  type FaceAttr,
} from "../../src/geom/poly.ts";
import { quickHull } from "../../src/geom/hull.ts";
import { jacobiEigenSym3 } from "../../src/geom/util.ts";
import { qeuler, qaxisAngle, xapply, type Xform } from "../../src/geom/vec.ts";
import { latheTiles } from "../../src/geom/primitives.ts";
import { Rng } from "../../src/core/rng.ts";
import { assertValid, near, nearVec, v } from "./geom-helpers.ts";

const A = faceAttr(1);
const cross = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
const uvAt = (a: FaceAttr, p: { x: number; y: number; z: number }) => [dot(p, a.uv.u) + a.uv.u0, dot(p, a.uv.v) + a.uv.v0];

// ------------------------------------------------------------------ attributes / uv
test("autoUV: walls, floors, grain, offsets, non-mirrored", () => {
  const w = autoUV(v(0, 0, 1));
  nearVec(w.u, v(-1, 0, 0), 1e-12, "wall +Z u");
  nearVec(w.v, v(0, 1, 0), 1e-12, "wall +Z v");
  const e = autoUV(v(1, 0, 0), 0.3, 0.7);
  nearVec(e.u, v(0, 0, 1), 1e-12);
  nearVec(e.v, v(0, 1, 0), 1e-12);
  assert.equal(e.u0, 0.3);
  assert.equal(e.v0, 0.7);
  const top = autoUV(v(0, 1, 0));
  nearVec(top.u, v(1, 0, 0), 1e-12);
  nearVec(top.v, v(0, 0, 1), 1e-12);
  const bot = autoUV(v(0, -1, 0));
  nearVec(bot.u, v(1, 0, 0), 1e-12);
  nearVec(bot.v, v(0, 0, -1), 1e-12);
  // Babylon (left-handed) non-mirrored orientation: cross(u, v) = -n
  for (const n of [v(0, 0, 1), v(1, 0, 0), v(0, 1, 0), v(0, -1, 0), v(-0.6, 0.3, 0.74)]) {
    const l = Math.hypot(n.x, n.y, n.z);
    const nn = v(n.x / l, n.y / l, n.z / l);
    const m = autoUV(nn);
    nearVec(cross(m.u, m.v), v(-nn.x, -nn.y, -nn.z), 1e-9, "cross(u,v) = -n");
    near(dot(m.u, nn), 0, 1e-12, "u in plane");
    near(dot(m.v, nn), 0, 1e-12, "v in plane");
  }
  // grain projected into the face plane, v = n × u
  const g = autoUV(v(0, 1, 0), 0, 0, v(1, 0.3, 0));
  nearVec(g.u, v(1, 0, 0), 1e-12, "grain u");
  nearVec(g.v, cross(v(0, 1, 0), g.u), 1e-12, "grain v");
  // grain parallel to the normal → wall/floor rule
  const end = autoUV(v(1, 0, 0), 0, 0, v(1, 0, 0));
  nearVec(end.u, v(0, 0, 1), 1e-12);
});

test("faceAttr defaults and copies", () => {
  const a = faceAttr(5);
  assert.equal(a.surf, 5);
  assert.equal(a.tint, 0xffffff);
  assert.equal(a.interior, false);
  assert.equal(a.smooth, 0);
  assert.equal(hasUV(a), false);
  const uv = autoUV(v(0, 0, 1));
  const b = faceAttr(2, 0x808080, { smooth: 3, interior: true, uv });
  assert.equal(b.smooth, 3);
  assert.equal(b.interior, true);
  assert.ok(hasUV(b));
  assert.notEqual(b.uv, uv, "uv copied, not aliased");
});

// ------------------------------------------------------------------ constructors
test("polyBox: volume, faces in +X,-X,+Y,-Y,+Z,-Z order, explicit uv kept, transform", () => {
  const attrs = [0, 1, 2, 3, 4, 5].map((s) => faceAttr(s));
  attrs[2].uv = autoUV(v(0, 1, 0), 1.5, 2.5);
  const b = polyBox(v(1, 2, 3), attrs);
  assertValid(b, "box");
  near(polyVolume(b), 6, 1e-12);
  const normals = [v(1, 0, 0), v(-1, 0, 0), v(0, 1, 0), v(0, -1, 0), v(0, 0, 1), v(0, 0, -1)];
  for (const f of b.faces) {
    const k = f.attr.surf;
    nearVec(f.n, normals[k], 1e-12, `face surf ${k}`);
    assert.ok(hasUV(f.attr), "uv derived per face");
  }
  const top = b.faces.find((f) => f.attr.surf === 2)!;
  assert.equal(top.attr.uv.u0, 1.5, "explicit uv kept");
  assert.notEqual(top.attr, attrs[2], "attr not aliased");
  const xf: Xform = { p: v(3, -1, 2), q: qeuler(0.4, 1.1, -0.3) };
  const t = polyBox(v(1, 2, 3), A, xf);
  assertValid(t, "box xf");
  near(polyVolume(t), 6, 1e-9);
  nearVec(polyCentroid(t), xf.p, 1e-9);
  const bb = polyBounds(b);
  nearVec(bb.min, v(-0.5, -1, -1.5), 1e-12);
  nearVec(bb.max, v(0.5, 1, 1.5), 1e-12);
});

test("polyBeveledBox: analytic volume, 26 faces, dominant-axis attrs", () => {
  const attrs = [0, 1, 2, 3, 4, 5].map((s) => faceAttr(s));
  for (const [sx, sy, sz, e] of [
    [1, 2, 3, 0.1],
    [0.6, 0.1, 0.4, 0.02],
    [0.05, 0.05, 0.05, 0.01],
  ]) {
    const p = polyBeveledBox(v(sx, sy, sz), e, attrs);
    assertValid(p, "bevel");
    assert.equal(p.faces.length, 26);
    const hx = sx / 2,
      hy = sy / 2,
      hz = sz / 2;
    const exact = 8 * hx * hy * hz - 2 * e * e * (2 * hx - 2 * e + 2 * hy - 2 * e + 2 * hz - 2 * e) - (20 / 3) * e ** 3;
    near(polyVolume(p), exact, 1e-12 * Math.max(1, exact) + 1e-15, "bevel volume");
    for (const f of p.faces) {
      // the attr comes from the face's dominant axis
      const axes = [f.n.x, -f.n.x, f.n.y, -f.n.y, f.n.z, -f.n.z];
      assert.ok(axes[f.attr.surf] >= Math.max(...axes) - 1e-6);
    }
  }
  // tiny bevel → plain box; huge bevel clamped
  assert.equal(polyBeveledBox(v(1, 1, 1), 0, A).faces.length, 6);
  assertValid(polyBeveledBox(v(1, 1, 1), 5, A), "clamped bevel");
});

test("polyCylinder: volumes (cylinder, frustum, cone), smooth vn, caps, degenerate", () => {
  const side = faceAttr(1, 0xffffff, { smooth: 1 });
  const seg = 24;
  const areaPoly = (r: number) => 0.5 * seg * r * r * Math.sin((2 * Math.PI) / seg);
  const c = polyCylinder(0.5, 0.5, 2, seg, side, A);
  assertValid(c, "cyl");
  near(polyVolume(c), areaPoly(0.5) * 2, 1e-12);
  assert.equal(c.faces.length, seg + 2);
  const f = polyCylinder(0.4, 0.2, 1.5, seg, side, A);
  assertValid(f, "frustum");
  const A1 = areaPoly(0.4),
    A2 = areaPoly(0.2);
  near(polyVolume(f), (1.5 / 3) * (A1 + A2 + Math.sqrt(A1 * A2)), 1e-12);
  const cone = polyCylinder(0.3, 0, 1, 16, side, A);
  assertValid(cone, "cone");
  near(polyVolume(cone), (0.5 * 16 * 0.09 * Math.sin((2 * Math.PI) / 16)) / 3, 1e-12);
  // smooth sides carry unit, outward, analytic normals; caps flat
  for (const face of c.faces) {
    if (Math.abs(face.n.y) > 0.9) {
      assert.equal(face.vn, undefined);
      continue;
    }
    assert.ok(face.vn && face.vn.length === face.idx.length);
    face.idx.forEach((vi, k) => {
      const p = c.verts[vi],
        n = face.vn![k];
      near(Math.hypot(n.x, n.y, n.z), 1, 1e-12);
      near(n.x * p.z - n.z * p.x, 0, 1e-12, "radial");
      near(n.y, 0, 1e-12);
    });
  }
  const flat = polyCylinder(0.5, 0.5, 1, 8, A, A);
  assert.ok(flat.faces.every((x) => !x.vn), "flat sides without vn");
  assert.equal(polyCylinder(0.5, 0.5, 1, 2, A, A).faces.length, 5, "segments clamped to 3");
  assert.equal(polyCylinder(0, 0, 1, 8, A, A).faces.length, 0, "degenerate → empty");
  assert.equal(polyCylinder(NaN, 0.1, 1, 8, A, A).faces.length, 8 + 1, "NaN radius → cone, no NaN");
});

test("polyPrism: area × depth, any winding, non-convex input hulled", () => {
  const tri: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
  ];
  const p = polyPrism(tri, 2, A, A);
  assertValid(p, "prism");
  near(polyVolume(p), 1, 1e-12);
  const rev = polyPrism(tri.slice().reverse(), 2, A, A);
  near(polyVolume(rev), 1, 1e-12);
  const concave = polyPrism(
    [
      [0, 0],
      [2, 0],
      [1, 0.5],
      [2, 2],
      [0, 2],
    ],
    1,
    A,
    A,
  );
  assertValid(concave, "hulled prism");
  near(polyVolume(concave), 4, 1e-12);
  assert.equal(polyPrism([[0, 0], [1, 1]], 1, A, A).faces.length, 0);
  const b = polyBounds(p);
  near(b.min.z, -1, 1e-12, "centred in z");
});

test("polyFromHull: contains points, convex, coplanar merge, degenerate inputs", () => {
  const rng = new Rng(9);
  // cube corners + face/edge/interior points → 6 quads, 8 vertices
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push(v(i & 1 ? 1 : 0, i & 2 ? 1 : 0, i & 4 ? 1 : 0));
  pts.push(v(0.5, 0.5, 0.5), v(0.5, 0.5, 1), v(1, 0.5, 0.5), v(0.5, 0, 0), v(0, 0.3, 1), v(1, 1, 0.5));
  const cube = polyFromHull(pts, A);
  assertValid(cube, "hull cube");
  assert.equal(cube.faces.length, 6);
  assert.equal(cube.verts.length, 8);
  near(polyVolume(cube), 1, 1e-12);
  // random sphere and blob clouds
  for (let trial = 0; trial < 20; trial++) {
    const cloud = [];
    const n = 4 + rng.int(0, 200);
    for (let i = 0; i < n; i++) {
      const s = trial % 2 ? rng.onSphere() : rng.inSphere();
      cloud.push(v(s.x * 0.3 + 1, s.y * 0.1, s.z * 0.2 - 2));
    }
    const h = polyFromHull(cloud, (nn) => faceAttr(nn.y > 0 ? 7 : 8));
    if (h.faces.length === 0) continue;
    assertValid(h, `hull ${trial}`);
    const [pe] = [1e-9];
    for (const p of cloud) assert.ok(polySignedDist(h, p) <= pe, "hull contains every input point");
    for (const f of h.faces) assert.equal(f.attr.surf, f.n.y > 0 ? 7 : 8, "attr callback by normal");
  }
  // coplanar → flat two-sided poly; collinear / too few → empty
  const flat = polyFromHull([v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0), v(0.5, 0.5, 0)], A);
  assert.equal(flat.faces.length, 2);
  assert.equal(polyVolume(flat), 0);
  assert.equal(polyFromHull([v(0, 0, 0), v(1, 1, 1), v(2, 2, 2)], A).faces.length, 0);
  assert.equal(polyFromHull([], A).faces.length, 0);
  assert.equal(quickHull([v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)]), null);
  // duplicates and NaN are ignored
  const dup = polyFromHull([...pts, ...pts, v(NaN, 0, 0)], A);
  assertValid(dup, "dups");
  near(polyVolume(dup), 1, 1e-12);
});

// ------------------------------------------------------------------ transforms
test("polyTransform preserves volume and keeps uv attached to material points", () => {
  const rng = new Rng(3);
  const base = polyBeveledBox(v(0.7, 0.3, 0.5), 0.04, [0, 1, 2, 3, 4, 5].map((s) => faceAttr(s)));
  for (let k = 0; k < 10; k++) {
    const xf: Xform = { p: v(rng.range(-5, 5), rng.range(-5, 5), rng.range(-5, 5)), q: qaxisAngle(rng.onSphere(), rng.range(0, 6.28)) };
    const t = polyTransform(base, xf);
    assertValid(t, "transformed");
    near(polyVolume(t), polyVolume(base), 1e-12);
    t.faces.forEach((f, fi) => {
      const f0 = base.faces[fi];
      for (const vi of f0.idx) {
        const p0 = base.verts[vi];
        const p1 = xapply(xf, p0);
        const [u0, v0] = uvAt(f0.attr, p0);
        const [u1, v1] = uvAt(f.attr, p1);
        near(u1, u0, 1e-9, "u attached");
        near(v1, v0, 1e-9, "v attached");
      }
    });
  }
  // non-finite transform → identity, never NaN
  const bad = polyTransform(base, { p: v(NaN, 0, 0), q: { x: NaN, y: 0, z: 0, w: 1 } });
  assertValid(bad, "nan xf");
});

// ------------------------------------------------------------------ clipping
function randomPlane(rng: Rng, c: { x: number; y: number; z: number }, spread: number) {
  const n = rng.onSphere();
  const p = v(c.x + rng.range(-spread, spread), c.y + rng.range(-spread, spread), c.z + rng.range(-spread, spread));
  return { n: v(n.x, n.y, n.z), d: n.x * p.x + n.y * p.y + n.z * p.z };
}

test("polyClip + complementary clip conserve volume (boxes, cylinders, hulls)", () => {
  const rng = new Rng(77);
  const shapes: ConvexPoly[] = [
    polyBox(v(1, 0.5, 0.25), A),
    polyCylinder(0.2, 0.15, 0.6, 20, faceAttr(1, 0xffffff, { smooth: 1 }), A, { p: v(1, 2, 3), q: qeuler(0.3, 0.2, 0.1) }),
    polyFromHull(Array.from({ length: 60 }, () => rng.onSphere()), A),
  ];
  for (const s of shapes) {
    const V = polyVolume(s);
    const c = polyCentroid(s);
    for (let k = 0; k < 40; k++) {
      const { n, d } = randomPlane(rng, c, 0.3);
      const a = polyClip(s, n, d, faceAttr(9));
      const b = polyClip(s, v(-n.x, -n.y, -n.z), -d, faceAttr(9));
      const va = a ? polyVolume(a) : 0,
        vb = b ? polyVolume(b) : 0;
      near(va + vb, V, 1e-9 * V, "complementary clips");
      if (a && a !== s) assertValid(a, "clip a");
      if (b && b !== s) assertValid(b, "clip b");
    }
  }
});

test("polyClip exactly through vertices and edges, on faces, no-cut and all-cut", () => {
  const b = polyBox(v(1, 1, 1), A);
  // diagonal plane through two opposite edges
  const d1 = polyClip(b, v(1, -1, 0), 0, faceAttr(2))!;
  assertValid(d1, "through edges");
  near(polyVolume(d1), 0.5, 1e-12);
  assert.equal(d1.faces.length, 5);
  // plane through three corners (cuts off a corner tetrahedron exactly at vertices)
  const n = v(1, 1, 1);
  const corner = polyClip(b, n, 0.5, faceAttr(2))!; // x+y+z <= 0.5 passes through (0.5,0.5,-0.5) etc.
  assertValid(corner, "through vertices");
  near(polyVolume(corner), 1 - 1 / 6, 1e-12);
  // plane through a single vertex only, from outside → unchanged
  assert.equal(polyClip(b, n, 1.5, faceAttr(2)), b, "touching at a vertex: unchanged");
  // plane on a face: keep → same object, opposite → null
  assert.equal(polyClip(b, v(1, 0, 0), 0.5, faceAttr(2)), b);
  assert.equal(polyClip(b, v(-1, 0, 0), -0.5, faceAttr(2)), null);
  assert.equal(polyClip(b, v(0, 1, 0), -0.7, faceAttr(2)), null, "all cut");
  // cap attributes
  const cut = polyClip(b, v(0, 0, 1), 0.1, faceAttr(4, 0x123456))!;
  const cap = cut.faces.find((f) => f.attr.surf === 4)!;
  assert.equal(cap.attr.tint, 0x123456);
  assert.ok(hasUV(cap.attr), "cap uv auto-derived");
  nearVec(cap.n, v(0, 0, 1), 1e-12);
  near(cap.d, 0.1, 1e-12);
  const g = polyClip(b, v(0, 1, 0), 0.2, faceAttr(4), v(1, 0, 0))!;
  nearVec(g.faces.find((f) => f.attr.surf === 4)!.attr.uv.u, v(1, 0, 0), 1e-12, "cap uv along grain");
  // null cap: copies nearest face attr
  const sides = [0, 1, 2, 3, 4, 5].map((s) => faceAttr(s));
  const b6 = polyBox(v(1, 1, 1), sides);
  const nc = polyClip(b6, v(0.1, 1, 0), 0.3, null)!;
  const newFace = nc.faces.find((f) => Math.abs(f.n.x - 0.0995) < 1e-3)!;
  assert.equal(newFace.attr.surf, 2, "cap copies +Y attr");
  // non-unit normals are normalised (d scaled accordingly)
  const s2 = polyClip(b, v(0, 0, 2), 0.2, faceAttr(4))!;
  near(polyVolume(s2), 0.6, 1e-12);
});

test("polyClip interpolates per-vertex normals and stays valid under repeated clipping", () => {
  const rng = new Rng(5);
  let p: ConvexPoly | null = polyCylinder(0.3, 0.3, 1, 32, faceAttr(1, 0xffffff, { smooth: 1 }), A);
  for (let k = 0; k < 25 && p; k++) {
    const { n, d } = randomPlane(rng, polyCentroid(p), 0.1);
    const q = polyClip(p, n, d, faceAttr(9));
    if (!q) continue;
    assertValid(q, `clip ${k}`);
    for (const f of q.faces) {
      if (!f.vn) continue;
      for (let i = 0; i < f.idx.length; i++) {
        const pt = q.verts[f.idx[i]],
          m = f.vn[i];
        const r = Math.hypot(pt.x, pt.z);
        // analytic cylinder normal is radial; chord interpolation keeps it within a few degrees
        if (r > 0.29) assert.ok((m.x * pt.x + m.z * pt.z) / r > 0.99, "interpolated vn ≈ radial");
      }
    }
    p = q;
  }
});

test("polyClip robust across scales (2 mm button … 5 m slab)", () => {
  const rng = new Rng(11);
  for (const s of [0.002, 0.05, 1, 5]) {
    const b = polyBox(v(s, s * 0.4, s * 0.1), A);
    const V = polyVolume(b);
    for (let k = 0; k < 30; k++) {
      const { n, d } = randomPlane(rng, v(0, 0, 0), s * 0.3);
      const a = polyClip(b, n, d, faceAttr(9));
      const c = polyClip(b, v(-n.x, -n.y, -n.z), -d, faceAttr(9));
      near((a ? polyVolume(a) : 0) + (c ? polyVolume(c) : 0), V, 1e-8 * V + 1e-12, `scale ${s}`);
      if (a && a !== b) assertValid(a, `scale ${s}`);
    }
  }
});

// ------------------------------------------------------------------ measures
test("measures: centroid, width, extents, signed distance, closest point, chord", () => {
  const xf: Xform = { p: v(2, 1, -3), q: qeuler(0.2, 0.9, 0.4) };
  const plank = polyBox(v(1.2, 0.025, 0.2), A, xf);
  nearVec(polyCentroid(plank), xf.p, 1e-12);
  const { ext, axes } = polyExtents(plank);
  near(ext[0], 1.2, 1e-9);
  near(ext[1], 0.2, 1e-9);
  near(ext[2], 0.025, 1e-9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(dot(axes[i], axes[j]), i === j ? 1 : 0, 1e-9, "orthonormal axes");
  near(polyWidth(plank, axes[0]), 1.2, 1e-9);
  const b = polyBox(v(2, 2, 2), A);
  near(polySignedDist(b, v(0, 0, 0)), -1, 1e-12);
  near(polySignedDist(b, v(3, 0, 0)), 2, 1e-12);
  assert.ok(polyContains(b, v(1, 1, 1)) && !polyContains(b, v(1.01, 0, 0)));
  nearVec(polyClosestPoint(b, v(0.2, 0.3, 0.4)), v(0.2, 0.3, 0.4), 0, "inside");
  nearVec(polyClosestPoint(b, v(3, 0.5, 0)), v(1, 0.5, 0), 1e-12, "face");
  nearVec(polyClosestPoint(b, v(3, 3, 0.2)), v(1, 1, 0.2), 1e-12, "edge");
  nearVec(polyClosestPoint(b, v(3, -4, 5)), v(1, -1, 1), 1e-12, "corner");
  const ch = polyChord(b, v(0, 0.5, 0), v(1, 0, 0))!;
  near(ch.tMin, -1, 1e-12);
  near(ch.tMax, 1, 1e-12);
  assert.equal(polyChord(b, v(0, 5, 0), v(1, 0, 0)), null);
  near(polySurfaceArea(b), 24, 1e-12);
  // empty poly is harmless
  const e: ConvexPoly = { verts: [], faces: [] };
  assert.equal(polyVolume(e), 0);
  nearVec(polyBounds(e).min, v(0, 0, 0), 0);
  assert.equal(polySignedDist(e, v(0, 0, 0)), Infinity);
});

test("polyPoints unique packed float32; polyClone deep; polyFaceAreaOnPlane", () => {
  const c = polyCylinder(0.1, 0.1, 0.2, 12, A, A);
  const pts = polyPoints(c);
  assert.ok(pts instanceof Float32Array);
  assert.equal(pts.length, 24 * 3);
  const k = polyClone(c);
  k.verts[0].x = 99;
  k.faces[0].attr.surf = 42;
  assert.notEqual(c.verts[0].x, 99);
  assert.notEqual(c.faces[0].attr.surf, 42);
  const b = polyBox(v(1, 2, 3), A);
  near(polyFaceAreaOnPlane(b, v(1, 0, 0), 0.5), 6, 1e-12);
  near(polyFaceAreaOnPlane(b, v(-1, 0, 0), -0.5), 6, 1e-12, "either orientation");
  near(polyFaceAreaOnPlane(b, v(0, 0, 2), 3), 2, 1e-12, "non-unit normal");
  assert.equal(polyFaceAreaOnPlane(b, v(1, 0, 0), 0.2), 0);
});

test("polyHiddenFaces: touching faces of stacked boxes and fused lathe tiles", () => {
  const lo = polyBox(v(1, 1, 1), A);
  const hi = polyBox(v(1, 1, 1), A, { p: v(0, 1, 0), q: { x: 0, y: 0, z: 0, w: 1 } });
  const h = polyHiddenFaces(lo, [hi]);
  assert.equal(h.size, 1);
  nearVec(lo.faces[[...h][0]].n, v(0, 1, 0), 1e-12);
  // a smaller box on top does not hide the big top face
  const small = polyBox(v(0.5, 1, 0.5), A, { p: v(0, 1, 0), q: { x: 0, y: 0, z: 0, w: 1 } });
  assert.equal(polyHiddenFaces(lo, [small]).size, 0);
  assert.equal(polyHiddenFaces(small, [lo]).size, 1);
  const tiles = latheTiles({ profile: [[0.1, 0], [0.12, 0.1]], thickness: 0.01, segments: 8, outer: faceAttr(1, 0xffffff, { smooth: 1 }), inner: faceAttr(2, 0xffffff, { smooth: 2 }), edge: faceAttr(3) });
  const polys = tiles.map((t) => t.poly);
  for (const t of polys) {
    const hid = polyHiddenFaces(t, polys);
    assert.equal(hid.size, 2, "both radial seam faces hidden (closed ring)");
    for (const fi of hid) assert.equal(t.faces[fi].attr.surf, 3);
  }
});

test("jacobiEigenSym3 decomposes symmetric matrices", () => {
  const rng = new Rng(1);
  for (let k = 0; k < 50; k++) {
    const a = rng.range(-2, 2),
      b = rng.range(-2, 2),
      c = rng.range(-2, 2),
      d = rng.range(-2, 2),
      e = rng.range(-2, 2),
      f = rng.range(-2, 2);
    const m = [a, d, e, d, b, f, e, f, c];
    const { values, vectors } = jacobiEigenSym3(m);
    for (let i = 0; i < 3; i++) {
      const x = vectors[i];
      const mx = v(m[0] * x.x + m[1] * x.y + m[2] * x.z, m[3] * x.x + m[4] * x.y + m[5] * x.z, m[6] * x.x + m[7] * x.y + m[8] * x.z);
      nearVec(mx, v(values[i] * x.x, values[i] * x.y, values[i] * x.z), 1e-9);
    }
  }
});
