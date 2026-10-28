// Pure polyhedron helpers used by the destruction runtime that the geometry contract does not
// cover: oriented-box detection (cheap box colliders), shared contact area between touching
// convex parts (strength of `fused` bonds), surface lookup for micro-debris tinting, and crack
// filtering for fragments. PURE: operates on ConvexPoly data only (no geom calls, no Babylon).

import type { Vec3, Quat } from "../../geom/vec.ts";
import type { ConvexPoly, PolyFace } from "../../geom/poly.ts";
import type { Crack, Dent } from "../../geom/meshgen.ts";

export interface BoxInfo {
  center: Vec3;
  /** Rotation taking the box's local axes (X,Y,Z) to its edge directions. */
  rot: Quat;
  /** Full edge lengths along the rotated local axes. */
  size: Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * Detect a (possibly rotated) rectangular box: 8 vertices, 6 quad faces whose normals form
 * three mutually orthogonal ± pairs, every vertex lying at an extreme along each axis.
 * Returns null for anything else (beveled boxes, trapezoids, Voronoi cells...).
 */
export function detectBox(poly: ConvexPoly, relTol = 1e-4): BoxInfo | null {
  if (poly.verts.length !== 8 || poly.faces.length !== 6) return null;
  for (const f of poly.faces) if (f.idx.length !== 4) return null;
  const axes: Vec3[] = [];
  for (const f of poly.faces) {
    const n = f.n;
    let found = false;
    for (const a of axes) {
      const d = dot(a, n);
      if (Math.abs(Math.abs(d) - 1) < 1e-4) {
        found = true;
        break;
      }
      if (Math.abs(d) > 1e-4) return null; // neither parallel nor orthogonal
    }
    if (!found) axes.push({ x: n.x, y: n.y, z: n.z });
  }
  if (axes.length !== 3) return null;
  // right-handed basis
  let [u, v, w] = axes;
  const c = cross(u, v);
  if (dot(c, w) < 0) w = { x: -w.x, y: -w.y, z: -w.z };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of poly.verts) {
    const pr = [dot(p, u), dot(p, v), dot(p, w)];
    for (let k = 0; k < 3; k++) {
      if (pr[k] < lo[k]) lo[k] = pr[k];
      if (pr[k] > hi[k]) hi[k] = pr[k];
    }
  }
  const size = { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] };
  const scale = Math.max(size.x, size.y, size.z);
  if (!(scale > 0)) return null;
  const tol = relTol * scale + 1e-7;
  for (const p of poly.verts) {
    const pr = [dot(p, u), dot(p, v), dot(p, w)];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(pr[k] - lo[k]) > tol && Math.abs(pr[k] - hi[k]) > tol) return null;
    }
  }
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const center = {
    x: u.x * mid[0] + v.x * mid[1] + w.x * mid[2],
    y: u.y * mid[0] + v.y * mid[1] + w.y * mid[2],
    z: u.z * mid[0] + v.z * mid[1] + w.z * mid[2],
  };
  return { center, rot: quatFromBasis(u, v, w), size };
}

/**
 * Unit quaternion of the rotation whose columns are (u, v, w): rotates +X to u, +Y to v, +Z to w
 * (with the conventions of src/geom/vec.ts qrot). The basis must be orthonormal, right-handed.
 */
export function quatFromBasis(u: Vec3, v: Vec3, w: Vec3): Quat {
  const m00 = u.x,
    m01 = v.x,
    m02 = w.x;
  const m10 = u.y,
    m11 = v.y,
    m12 = w.y;
  const m20 = u.z,
    m21 = v.z,
    m22 = w.z;
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, qw: number;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    qw = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, qw) || 1;
  return { x: x / l, y: y / l, z: z / l, w: qw / l };
}

// ------------------------------------------------------------------ shared contact area

/** Signed area of a 2D polygon (CCW positive). */
function area2(xs: number[], ys: number[]): number {
  let a = 0;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) a += xs[j] * ys[i] - xs[i] * ys[j];
  return a / 2;
}

/** Area of the intersection of two convex 2D polygons (Sutherland–Hodgman, any winding). */
export function convexIntersectionArea(ax: number[], ay: number[], bx: number[], by: number[]): number {
  if (ax.length < 3 || bx.length < 3) return 0;
  // orient the clipper CCW
  let cx = bx,
    cy = by;
  if (area2(bx, by) < 0) {
    cx = bx.slice().reverse();
    cy = by.slice().reverse();
  }
  let px = ax.slice(),
    py = ay.slice();
  for (let i = 0; i < cx.length && px.length >= 3; i++) {
    const x0 = cx[i],
      y0 = cy[i];
    const x1 = cx[(i + 1) % cx.length],
      y1 = cy[(i + 1) % cy.length];
    const ex = x1 - x0,
      ey = y1 - y0;
    const side = (x: number, y: number): number => ex * (y - y0) - ey * (x - x0); // >= 0 inside (left of edge)
    const nx: number[] = [],
      ny: number[] = [];
    for (let k = 0; k < px.length; k++) {
      const sx = px[k],
        sy = py[k];
      const tx = px[(k + 1) % px.length],
        ty = py[(k + 1) % py.length];
      const ss = side(sx, sy),
        ts = side(tx, ty);
      if (ss >= 0) {
        nx.push(sx);
        ny.push(sy);
      }
      if ((ss >= 0) !== (ts >= 0)) {
        const t = ss / (ss - ts);
        nx.push(sx + (tx - sx) * t);
        ny.push(sy + (ty - sy) * t);
      }
    }
    px = nx;
    py = ny;
  }
  return px.length >= 3 ? Math.abs(area2(px, py)) : 0;
}

function faceTo2D(poly: ConvexPoly, f: PolyFace, u: Vec3, v: Vec3): [number[], number[]] {
  const xs: number[] = [],
    ys: number[] = [];
  for (const i of f.idx) {
    const p = poly.verts[i];
    xs.push(dot(p, u));
    ys.push(dot(p, v));
  }
  return [xs, ys];
}

/**
 * Contact area (m²) between two touching convex polyhedra: the overlap of a pair of coplanar,
 * opposite-facing faces (|dA + dB| ≤ tol). Returns 0 if they share no face plane (edge/point
 * contact or not touching).
 */
export function sharedFaceArea(A: ConvexPoly, B: ConvexPoly, tol = 0.004): number {
  let best = 0;
  for (const fa of A.faces) {
    for (const fb of B.faces) {
      if (dot(fa.n, fb.n) > -0.995) continue;
      if (Math.abs(fa.d + fb.d) > tol) continue;
      const n = fa.n;
      const ref = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      let u = cross(n, ref);
      const ul = Math.hypot(u.x, u.y, u.z) || 1;
      u = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
      const v = cross(n, u);
      const [ax, ay] = faceTo2D(A, fa, u, v);
      const [bx, by] = faceTo2D(B, fb, u, v);
      const a = convexIntersectionArea(ax, ay, bx, by);
      if (a > best) best = a;
    }
  }
  return best;
}

/** Area of one face (m²). */
export function faceArea(poly: ConvexPoly, f: PolyFace): number {
  let x = 0,
    y = 0,
    z = 0;
  const p0 = poly.verts[f.idx[0]];
  for (let i = 1; i + 1 < f.idx.length; i++) {
    const p1 = poly.verts[f.idx[i]],
      p2 = poly.verts[f.idx[i + 1]];
    const c = cross({ x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }, { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z });
    x += c.x;
    y += c.y;
    z += c.z;
  }
  return Math.hypot(x, y, z) / 2;
}

/** Index of the face whose plane is closest to p (the face p lies on), preferring exterior faces on ties. */
export function nearestFace(poly: ConvexPoly, p: Vec3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < poly.faces.length; i++) {
    const f = poly.faces[i];
    const d = Math.abs(dot(f.n, p) - f.d) + (f.attr.interior ? 1e-4 : 0);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Index of the largest-area face; `exteriorFirst` prefers original (non-cut) surfaces. */
export function largestFace(poly: ConvexPoly, exteriorFirst = true): number {
  let best = 0;
  let bestA = -1;
  for (let i = 0; i < poly.faces.length; i++) {
    const f = poly.faces[i];
    let a = faceArea(poly, f);
    if (exteriorFirst && !f.attr.interior) a *= 4;
    if (a > bestA) {
      bestA = a;
      best = i;
    }
  }
  return best;
}

/** max over faces of dot(n,p) - d (≤ 0 inside); local copy so pure helpers need no geom import. */
export function signedDistance(poly: ConvexPoly, p: Vec3): number {
  let m = -Infinity;
  for (const f of poly.faces) {
    const d = f.n.x * p.x + f.n.y * p.y + f.n.z * p.z - f.d;
    if (d > m) m = d;
  }
  return m;
}

/**
 * Cracks that still lie on the surface of a fragment: keeps runs of consecutive polyline points
 * within `tol` of the fragment's boundary (|signed distance| ≤ tol), splitting polylines where
 * they leave it. Used so fragments of a cracked part keep the crack lines on their surviving
 * exterior faces.
 */
export function filterCracks(cracks: readonly Crack[], poly: ConvexPoly, tol = 0.002): Crack[] {
  const out: Crack[] = [];
  for (const c of cracks) {
    let run: Vec3[] = [];
    for (const p of c.points) {
      const sd = signedDistance(poly, p);
      if (sd <= tol && sd >= -tol) run.push(p);
      else {
        if (run.length >= 2) out.push({ points: run, n: c.n, width: c.width });
        run = [];
      }
    }
    if (run.length >= 2) out.push({ points: run, n: c.n, width: c.width });
  }
  return out;
}

/** Merge the closest dent pairs until at most `max` remain (keeps the visual deformation). */
export function mergeDents(dents: Dent[], max: number): void {
  while (dents.length > max) {
    let bi = 0,
      bj = 1,
      bd = Infinity;
    for (let i = 0; i < dents.length; i++) {
      for (let j = i + 1; j < dents.length; j++) {
        const a = dents[i].p,
          b = dents[j].p;
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    const A = dents[bi],
      B = dents[bj];
    const wa = A.depth,
      wb = B.depth;
    const ws = wa + wb || 1;
    const p = { x: (A.p.x * wa + B.p.x * wb) / ws, y: (A.p.y * wa + B.p.y * wb) / ws, z: (A.p.z * wa + B.p.z * wb) / ws };
    let dx = A.dir.x * wa + B.dir.x * wb,
      dy = A.dir.y * wa + B.dir.y * wb,
      dz = A.dir.z * wa + B.dir.z * wb;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const sep = Math.sqrt(bd) / 2;
    const merged: Dent = {
      p,
      dir: { x: dx, y: dy, z: dz },
      r: Math.max(A.r, B.r, sep + Math.min(A.r, B.r)),
      depth: Math.max(wa, wb) + 0.3 * Math.min(wa, wb),
    };
    dents.splice(bj, 1);
    dents[bi] = merged;
  }
}
