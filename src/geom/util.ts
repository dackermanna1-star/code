// Internal numeric helpers shared by the geometry module. PURE (no Babylon).
//
// Tolerance policy: every geometric epsilon is RELATIVE to the size of the shape being
// processed (parts range from 2 mm buttons to 5 m slabs), with a tiny absolute floor.

import type { Vec3 } from "./vec.ts";

/** Plane classification tolerance (fraction of the shape scale). */
export const REL_PLANE_EPS = 1e-9;
/** Vertex welding tolerance (fraction of the shape scale). */
export const REL_WELD_EPS = 1e-7;
/** Absolute floor for any tolerance (m). */
export const ABS_EPS_FLOOR = 1e-13;

/** Largest axis-aligned extent of a point set (>= 1e-9 so tolerances never vanish). */
export function scaleOfPoints(verts: readonly Vec3[]): number {
  if (verts.length === 0) return 1e-9;
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  for (const p of verts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  const s = Math.max(x1 - x0, y1 - y0, z1 - z0);
  return s > 1e-9 && Number.isFinite(s) ? s : 1e-9;
}

/** Same as scaleOfPoints for an interleaved xyz array. */
export function scaleOfFlat(p: ArrayLike<number>, count = p.length / 3): number {
  if (count === 0) return 1e-9;
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = p[3 * i],
      y = p[3 * i + 1],
      z = p[3 * i + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const s = Math.max(x1 - x0, y1 - y0, z1 - z0);
  return s > 1e-9 && Number.isFinite(s) ? s : 1e-9;
}

/**
 * Newell normal of a polygon (NOT normalised: its length is twice the polygon area).
 * Robust for non-planar / nearly degenerate polygons.
 */
export function newellNormal(verts: readonly Vec3[], idx: readonly number[]): Vec3 {
  let nx = 0,
    ny = 0,
    nz = 0;
  const m = idx.length;
  if (m < 3) return { x: 0, y: 0, z: 0 };
  // centre on the first vertex to limit cancellation for far-from-origin polygons
  const o = verts[idx[0]];
  for (let i = 0; i < m; i++) {
    const a = verts[idx[i]],
      b = verts[idx[i + 1 === m ? 0 : i + 1]];
    const ax = a.x - o.x,
      ay = a.y - o.y,
      az = a.z - o.z;
    const bx = b.x - o.x,
      by = b.y - o.y,
      bz = b.z - o.z;
    nx += (ay - by) * (az + bz);
    ny += (az - bz) * (ax + bx);
    nz += (ax - bx) * (ay + by);
  }
  return { x: nx, y: ny, z: nz };
}

/** Area of a planar polygon given its vertex loop. */
export function polygonArea(verts: readonly Vec3[], idx: readonly number[]): number {
  const n = newellNormal(verts, idx);
  return 0.5 * Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
}

/**
 * Eigen-decomposition of a symmetric 3x3 matrix (row-major m[9]) by cyclic Jacobi rotations.
 * Returns eigenvalues and orthonormal eigenvectors (columns), unsorted.
 */
export function jacobiEigenSym3(m: readonly number[]): { values: [number, number, number]; vectors: [Vec3, Vec3, Vec3] } {
  const a = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]];
  // V = identity (columns are eigenvectors)
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[1]) + Math.abs(a[2]) + Math.abs(a[5]);
    const diag = Math.abs(a[0]) + Math.abs(a[4]) + Math.abs(a[8]);
    if (off <= 1e-22 + diag * 1e-15) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const apq = a[3 * p + q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = a[3 * p + p],
          aqq = a[3 * q + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1),
          s = t * c;
        // A' = Jᵀ A J for the rotation in the (p,q) plane
        for (let k = 0; k < 3; k++) {
          const akp = a[3 * k + p],
            akq = a[3 * k + q];
          a[3 * k + p] = c * akp - s * akq;
          a[3 * k + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[3 * p + k],
            aqk = a[3 * q + k];
          a[3 * p + k] = c * apk - s * aqk;
          a[3 * q + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[3 * k + p],
            vkq = v[3 * k + q];
          v[3 * k + p] = c * vkp - s * vkq;
          v[3 * k + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return {
    values: [a[0], a[4], a[8]],
    vectors: [
      { x: v[0], y: v[3], z: v[6] },
      { x: v[1], y: v[4], z: v[7] },
      { x: v[2], y: v[5], z: v[8] },
    ],
  };
}

/** 2D convex hull (Andrew's monotone chain). Returns CCW points without duplicates/collinear points. */
export function convexHull2D(pts: ReadonlyArray<readonly [number, number]>, eps = 0): Array<[number, number]> {
  const p = pts
    .filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))
    .map((q) => [q[0], q[1]] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  let size = 0;
  for (const q of p) {
    const dx = Math.max(Math.abs(q[0]), Math.abs(q[1]));
    if (dx > size) size = dx;
  }
  const tol = eps > 0 ? eps : 1e-12 * Math.max(size, 1e-9) * Math.max(size, 1e-9);
  const lower: Array<[number, number]> = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= tol) lower.pop();
    lower.push(q);
  }
  const upper: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= tol) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** True when every component of v is a finite number. */
export const isFiniteVec = (v: Vec3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
