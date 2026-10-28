// Hand-made convex polys for destruction runtime unit tests (no dependency on src/geom
// implementations, only on the data contract).

import type { ConvexPoly, FaceAttr, PolyFace } from "../../src/geom/poly.ts";
import { qrot, type Quat, type Vec3 } from "../../src/geom/vec.ts";

export function attr(surf = 0, interior = false): FaceAttr {
  return { surf, tint: 0xffffff, uv: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, u0: 0, v0: 0 }, interior, smooth: 0 };
}

const BOX_FACES: Array<{ idx: number[]; n: Vec3 }> = [
  { idx: [1, 3, 7, 5], n: { x: 1, y: 0, z: 0 } },
  { idx: [0, 4, 6, 2], n: { x: -1, y: 0, z: 0 } },
  { idx: [2, 6, 7, 3], n: { x: 0, y: 1, z: 0 } },
  { idx: [0, 1, 5, 4], n: { x: 0, y: -1, z: 0 } },
  { idx: [4, 5, 7, 6], n: { x: 0, y: 0, z: 1 } },
  { idx: [0, 2, 3, 1], n: { x: 0, y: 0, z: -1 } },
];

/** Axis-aligned box centred at c with full size s, optionally rotated by q about its centre. */
export function boxPoly(c: Vec3, s: Vec3, q?: Quat, surf = 0): ConvexPoly {
  const verts: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    let p: Vec3 = { x: (i & 1 ? 0.5 : -0.5) * s.x, y: (i & 2 ? 0.5 : -0.5) * s.y, z: (i & 4 ? 0.5 : -0.5) * s.z };
    if (q) p = qrot(q, p);
    verts.push({ x: p.x + c.x, y: p.y + c.y, z: p.z + c.z });
  }
  const faces: PolyFace[] = BOX_FACES.map((f) => {
    const n = q ? qrot(q, f.n) : { ...f.n };
    const p = verts[f.idx[0]];
    return { idx: f.idx.slice(), n, d: n.x * p.x + n.y * p.y + n.z * p.z, attr: attr(surf) };
  });
  return { verts, faces };
}

/** Frustum-like "box" whose top face is shrunk (8 verts, 6 quads, not a rectangular box). */
export function taperedPoly(c: Vec3, s: Vec3, topScale: number): ConvexPoly {
  const verts: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const top = !!(i & 2);
    const k = top ? topScale : 1;
    verts.push({ x: c.x + (i & 1 ? 0.5 : -0.5) * s.x * k, y: c.y + (top ? 0.5 : -0.5) * s.y, z: c.z + (i & 4 ? 0.5 : -0.5) * s.z * k });
  }
  const faces: PolyFace[] = BOX_FACES.map((f) => {
    const [a, b, d] = [verts[f.idx[0]], verts[f.idx[1]], verts[f.idx[2]]];
    const e1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const e2 = { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z };
    let n = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
    const l = Math.hypot(n.x, n.y, n.z);
    n = { x: n.x / l, y: n.y / l, z: n.z / l };
    return { idx: f.idx.slice(), n, d: n.x * a.x + n.y * a.y + n.z * a.z, attr: attr() };
  });
  return { verts, faces };
}

export const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;
