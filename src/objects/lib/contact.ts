// Contact analysis between convex polyhedra, used by the builder DSL (autoBond, bond anchors,
// fastener counts, validation) and by tests (overlap checks).
//
//  * polyContact(A, B, tol): separating-axis test (face normals of both + edge×edge axes) with a
//    tolerance. When the parts are within `tol`, returns the contact patch: the overlap of A's
//    support features and B's anti-support features along the best axis, projected on that
//    plane — area, centroid (halfway between the two surfaces), extent (seam length) and kind
//    (face / edge / point), plus whether the interiors overlap by more than `tol`.
//  * polySd / polyInside: plane-based signed distance and containment.
//  * samplePoly: uniform random points inside a convex polyhedron (volume-weighted tetrahedra).
//  * overlappingPairs: sweep-and-prune over AABBs.
//
// Works directly on ConvexPoly data (verts + faces with outward unit normals and plane offsets),
// so it does not depend on the geometry module's implementation. PURE MODULE (no Babylon).

import type { Vec3 } from "../../geom/vec.ts";
import type { ConvexPoly } from "../../geom/poly.ts";
import type { Rng } from "../../core/rng.ts";

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export type ContactKind = "face" | "edge" | "point";

export interface Contact {
  /** Separation along the best separating axis (m); negative = overlap depth. Lower bound of the true distance. */
  sep: number;
  /** Unit contact normal pointing from A towards B. */
  normal: Vec3;
  /** Centre of the contact patch, halfway between the two surfaces. */
  point: Vec3;
  /** Area (m²) of the face-to-face contact patch; 0 for edge or point contacts. */
  area: number;
  /** Largest extent of the contact patch (m) — the seam length used for fastener counts. */
  length: number;
  kind: ContactKind;
  /** Interiors overlap by more than the tolerance that was used. */
  penetrating: boolean;
}

type P2 = [number, number];

interface PolyInfo {
  aabb: Aabb;
  /** Largest AABB extent (m), used for scale-aware epsilons. */
  scale: number;
  /** Unique face-normal axes (n and -n deduplicated). */
  normals: Vec3[];
  /** Unique edge directions (unit, sign-canonical); computed lazily. */
  edges: Vec3[] | null;
}

const infoCache = new WeakMap<ConvexPoly, PolyInfo>();

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

function addUniqueAxis(list: Vec3[], a: Vec3, cosTol: number): void {
  for (const b of list) if (Math.abs(dot(a, b)) > cosTol) return;
  list.push(a);
}

function polyInfo(p: ConvexPoly): PolyInfo {
  let inf = infoCache.get(p);
  if (inf) return inf;
  const aabb = aabbOf(p);
  const scale = Math.max(aabb.max.x - aabb.min.x, aabb.max.y - aabb.min.y, aabb.max.z - aabb.min.z, 1e-6);
  const normals: Vec3[] = [];
  for (const f of p.faces) addUniqueAxis(normals, f.n, 1 - 1e-9);
  inf = { aabb, scale, normals, edges: null };
  infoCache.set(p, inf);
  return inf;
}

function polyEdges(p: ConvexPoly, inf: PolyInfo): Vec3[] {
  if (inf.edges) return inf.edges;
  const edges: Vec3[] = [];
  const minLen = 1e-9 * inf.scale;
  for (const f of p.faces) {
    const idx = f.idx;
    for (let k = 0; k < idx.length; k++) {
      const a = p.verts[idx[k]];
      const b = p.verts[idx[(k + 1) % idx.length]];
      const ex = b.x - a.x,
        ey = b.y - a.y,
        ez = b.z - a.z;
      const l = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (l <= minLen) continue;
      addUniqueAxis(edges, { x: ex / l, y: ey / l, z: ez / l }, 1 - 1e-7);
    }
  }
  inf.edges = edges;
  return edges;
}

/** Axis-aligned bounds of a polyhedron's vertices. */
export function aabbOf(p: ConvexPoly): Aabb {
  let nx = Infinity,
    ny = Infinity,
    nz = Infinity,
    xx = -Infinity,
    xy = -Infinity,
    xz = -Infinity;
  for (const v of p.verts) {
    if (v.x < nx) nx = v.x;
    if (v.y < ny) ny = v.y;
    if (v.z < nz) nz = v.z;
    if (v.x > xx) xx = v.x;
    if (v.y > xy) xy = v.y;
    if (v.z > xz) xz = v.z;
  }
  return { min: { x: nx, y: ny, z: nz }, max: { x: xx, y: xy, z: xz } };
}

export function aabbOverlap(a: Aabb, b: Aabb, pad = 0): boolean {
  return (
    a.min.x <= b.max.x + pad &&
    b.min.x <= a.max.x + pad &&
    a.min.y <= b.max.y + pad &&
    b.min.y <= a.max.y + pad &&
    a.min.z <= b.max.z + pad &&
    b.min.z <= a.max.z + pad
  );
}

/** True if `inner` (expanded by eps) lies within `outer`. */
export function aabbContains(outer: Aabb, inner: Aabb, eps = 0): boolean {
  return (
    inner.min.x >= outer.min.x - eps &&
    inner.min.y >= outer.min.y - eps &&
    inner.min.z >= outer.min.z - eps &&
    inner.max.x <= outer.max.x + eps &&
    inner.max.y <= outer.max.y + eps &&
    inner.max.z <= outer.max.z + eps
  );
}

function project(p: ConvexPoly, ax: Vec3): [number, number] {
  let lo = Infinity,
    hi = -Infinity;
  for (const v of p.verts) {
    const d = v.x * ax.x + v.y * ax.y + v.z * ax.z;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

/** Plane-based signed distance proxy: max over faces of dot(n, q) - d (<= 0 inside). */
export function polySd(p: ConvexPoly, q: Vec3): number {
  let m = -Infinity;
  for (const f of p.faces) {
    const s = f.n.x * q.x + f.n.y * q.y + f.n.z * q.z - f.d;
    if (s > m) m = s;
  }
  return m;
}

/** True if every vertex of `inner` lies inside `outer` (within eps). */
export function polyInside(inner: ConvexPoly, outer: ConvexPoly, eps = 1e-6): boolean {
  for (const v of inner.verts) if (polySd(outer, v) > eps) return false;
  return true;
}

/** Euclidean distance from a point to a convex polyhedron (0 inside). */
export function polyPointDist(p: ConvexPoly, q: Vec3): number {
  if (polySd(p, q) <= 0) return 0;
  // Outside: the closest point lies on a face polygon whose plane faces q.
  let best = Infinity;
  for (const f of p.faces) {
    const h = f.n.x * q.x + f.n.y * q.y + f.n.z * q.z - f.d;
    if (h <= 0) continue;
    const px = q.x - f.n.x * h,
      py = q.y - f.n.y * h,
      pz = q.z - f.n.z * h; // projection on the face plane
    let inside = true;
    let edgeBest = Infinity;
    const idx = f.idx;
    for (let k = 0; k < idx.length; k++) {
      const a = p.verts[idx[k]],
        b = p.verts[idx[(k + 1) % idx.length]];
      const ex = b.x - a.x,
        ey = b.y - a.y,
        ez = b.z - a.z;
      // outward edge normal within the face plane: e x n
      const ox = ey * f.n.z - ez * f.n.y,
        oy = ez * f.n.x - ex * f.n.z,
        oz = ex * f.n.y - ey * f.n.x;
      if ((px - a.x) * ox + (py - a.y) * oy + (pz - a.z) * oz > 0) inside = false;
      // distance from q to the edge segment
      const l2 = ex * ex + ey * ey + ez * ez;
      let t = l2 > 0 ? ((q.x - a.x) * ex + (q.y - a.y) * ey + (q.z - a.z) * ez) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = q.x - (a.x + ex * t),
        dy = q.y - (a.y + ey * t),
        dz = q.z - (a.z + ez * t);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < edgeBest) edgeBest = d;
    }
    const d = inside ? h : edgeBest;
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : polySd(p, q);
}

// --------------------------------------------------------------------------- 2D helpers

function cross2(o: P2, a: P2, b: P2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Convex hull (Andrew's monotone chain), CCW, collinear points removed. Returns 1, 2 or >= 3 points. */
function hull2(pts: P2[], eps: number): P2[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // dedupe
  const u: P2[] = [];
  for (const q of p) {
    const l = u[u.length - 1];
    if (!l || Math.abs(l[0] - q[0]) > eps || Math.abs(l[1] - q[1]) > eps) u.push(q);
  }
  if (u.length < 3) return u;
  const lower: P2[] = [];
  for (const q of u) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], q) <= eps * eps) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (let i = u.length - 1; i >= 0; i--) {
    const q = u[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], q) <= eps * eps) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  const h = lower.concat(upper);
  if (h.length >= 3) return h;
  // all collinear: return the two extreme points
  return [u[0], u[u.length - 1]];
}

/** Clip a convex polygon (CCW) by the half-plane left of edge a->b (inclusive). */
function clipPolyByEdge(poly: P2[], a: P2, b: P2, eps: number): P2[] {
  const out: P2[] = [];
  const n = poly.length;
  if (!n) return out;
  const ex = b[0] - a[0],
    ey = b[1] - a[1];
  const el = Math.hypot(ex, ey) || 1;
  const side = (q: P2): number => (ex * (q[1] - a[1]) - ey * (q[0] - a[0])) / el; // signed distance, >0 = left/inside
  for (let i = 0; i < n; i++) {
    const p = poly[i],
      q = poly[(i + 1) % n];
    const sp = side(p),
      sq = side(q);
    const pin = sp >= -eps,
      qin = sq >= -eps;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Clip segment [p, q] by a convex CCW polygon; returns the clipped segment or null. */
function clipSegByPoly(p: P2, q: P2, poly: P2[], eps: number): [P2, P2] | null {
  let t0 = 0,
    t1 = 1;
  const dx = q[0] - p[0],
    dy = q[1] - p[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const el = Math.hypot(ex, ey) || 1;
    // inside: (e x (r - a)) / |e| >= -eps
    const fp = (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) / el + eps;
    const fd = (ex * dy - ey * dx) / el;
    if (Math.abs(fd) < 1e-18) {
      if (fp < 0) return null;
      continue;
    }
    const t = -fp / fd;
    if (fd > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [p[0] + dx * t0, p[1] + dy * t0],
    [p[0] + dx * t1, p[1] + dy * t1],
  ];
}

function polyArea2(poly: P2[]): { area: number; cx: number; cy: number } {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c;
    cx += (p[0] + q[0]) * c;
    cy += (p[1] + q[1]) * c;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-30) {
    let sx = 0,
      sy = 0;
    for (const p of poly) {
      sx += p[0];
      sy += p[1];
    }
    return { area: 0, cx: sx / (poly.length || 1), cy: sy / (poly.length || 1) };
  }
  return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}

function diameter2(pts: P2[]): number {
  let m = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d > m) m = d;
    }
  return m;
}

function pointSegDist2(p: P2, a: P2, b: P2): { d: number; c: P2 } {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const c: P2 = [a[0] + dx * t, a[1] + dy * t];
  return { d: Math.hypot(p[0] - c[0], p[1] - c[1]), c };
}

/** Closest pair between two small 2D point sets treated as polylines (fallback for near-misses). */
function closestPair2(A: P2[], B: P2[]): P2 {
  let best = Infinity;
  let mid: P2 = A[0];
  const segs = (S: P2[]): Array<[P2, P2]> => (S.length === 1 ? [[S[0], S[0]]] : S.map((p, i) => [p, S[(i + 1) % S.length]] as [P2, P2]));
  for (const p of A)
    for (const [a, b] of segs(B)) {
      const r = pointSegDist2(p, a, b);
      if (r.d < best) {
        best = r.d;
        mid = [(p[0] + r.c[0]) / 2, (p[1] + r.c[1]) / 2];
      }
    }
  for (const p of B)
    for (const [a, b] of segs(A)) {
      const r = pointSegDist2(p, a, b);
      if (r.d < best) {
        best = r.d;
        mid = [(p[0] + r.c[0]) / 2, (p[1] + r.c[1]) / 2];
      }
    }
  return mid;
}

/** Intersection of two convex 2D sets given as hulls (point, segment or CCW polygon). */
function intersect2(A: P2[], B: P2[], eps: number): P2[] | null {
  if (A.length >= 3 && B.length >= 3) {
    let out = A;
    for (let i = 0; i < B.length && out.length; i++) out = clipPolyByEdge(out, B[i], B[(i + 1) % B.length], eps);
    return out.length ? out : null;
  }
  if (A.length >= 3 || B.length >= 3) {
    const poly = A.length >= 3 ? A : B;
    const other = A.length >= 3 ? B : A;
    if (other.length === 2) {
      const s = clipSegByPoly(other[0], other[1], poly, eps);
      return s ? [s[0], s[1]] : null;
    }
    // point in polygon: inside every edge's left half-plane (within eps)
    const p = other[0];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const el = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (cross2(a, b, p) / el < -eps) return null;
    }
    return [p];
  }
  if (A.length === 2 && B.length === 2) {
    const [p, q] = A,
      [r, s] = B;
    const d1x = q[0] - p[0],
      d1y = q[1] - p[1],
      d2x = s[0] - r[0],
      d2y = s[1] - r[1];
    const den = d1x * d2y - d1y * d2x;
    const l1 = Math.hypot(d1x, d1y) || 1;
    if (Math.abs(den) <= eps * l1 * (Math.hypot(d2x, d2y) || 1)) {
      // parallel: collinear overlap?
      const off = Math.abs(d1x * (r[1] - p[1]) - d1y * (r[0] - p[0])) / l1;
      if (off > eps) return null;
      const ux = d1x / l1,
        uy = d1y / l1;
      const t = (x: P2): number => (x[0] - p[0]) * ux + (x[1] - p[1]) * uy;
      const a0 = 0,
        a1 = l1;
      const b0 = Math.min(t(r), t(s)),
        b1 = Math.max(t(r), t(s));
      const lo = Math.max(a0, b0),
        hi = Math.min(a1, b1);
      if (lo > hi + eps) return null;
      return [
        [p[0] + ux * lo, p[1] + uy * lo],
        [p[0] + ux * Math.max(lo, hi), p[1] + uy * Math.max(lo, hi)],
      ];
    }
    const t = ((r[0] - p[0]) * d2y - (r[1] - p[1]) * d2x) / den;
    const u = ((r[0] - p[0]) * d1y - (r[1] - p[1]) * d1x) / den;
    const tt = eps / l1;
    if (t < -tt || t > 1 + tt || u < -tt || u > 1 + tt) return null;
    return [[p[0] + d1x * t, p[1] + d1y * t]];
  }
  // point vs point/segment
  const pt = A.length === 1 ? A[0] : B[0];
  const other = A.length === 1 ? B : A;
  if (other.length === 1) return Math.hypot(pt[0] - other[0][0], pt[1] - other[0][1]) <= eps ? [pt] : null;
  return pointSegDist2(pt, other[0], other[1]).d <= eps ? [pt] : null;
}

// --------------------------------------------------------------------------- contact

/**
 * Contact between two convex polyhedra within tolerance `tol` (m), or null if some axis
 * separates them by more than `tol`. Pass tol = Infinity to always get the facing features
 * (used for anchors between non-touching parts). `faceAxesOnly` skips the edge×edge axes: much
 * cheaper and exact for face contacts, but may report edge-only near-misses as touching — use it
 * for anchors, not for deciding whether parts touch.
 */
export function polyContact(A: ConvexPoly, B: ConvexPoly, tol = 0.003, faceAxesOnly = false): Contact | null {
  if (!A.verts.length || !B.verts.length) return null;
  const ia = polyInfo(A),
    ib = polyInfo(B);
  if (Number.isFinite(tol) && !aabbOverlap(ia.aabb, ib.aabb, tol)) return null;
  const scale = Math.max(ia.scale, ib.scale);
  const eps = 1e-9 * scale;

  let bestSep = -Infinity;
  let bax = 0,
    bay = 1,
    baz = 0;
  let bestSign = 1;
  const AV = A.verts,
    BV = B.verts;
  // Separation along axis (x,y,z); records the best axis; true if separated by more than tol.
  const test = (x: number, y: number, z: number, isFace: boolean): boolean => {
    let aLo = Infinity,
      aHi = -Infinity,
      bLo = Infinity,
      bHi = -Infinity;
    for (let i = 0; i < AV.length; i++) {
      const v = AV[i];
      const d = v.x * x + v.y * y + v.z * z;
      if (d < aLo) aLo = d;
      if (d > aHi) aHi = d;
    }
    for (let i = 0; i < BV.length; i++) {
      const v = BV[i];
      const d = v.x * x + v.y * y + v.z * z;
      if (d < bLo) bLo = d;
      if (d > bHi) bHi = d;
    }
    const s1 = bLo - aHi; // B on the + side
    const s2 = aLo - bHi; // B on the - side
    const s = s1 >= s2 ? s1 : s2;
    // Face axes win ties so face contacts get the face normal (stable patches).
    if (s > bestSep + (isFace ? 0 : eps)) {
      bestSep = s;
      bax = x;
      bay = y;
      baz = z;
      bestSign = s1 >= s2 ? 1 : -1;
    }
    return s > tol;
  };
  for (const n of ia.normals) if (test(n.x, n.y, n.z, true)) return null;
  for (const n of ib.normals) if (test(n.x, n.y, n.z, true)) return null;
  if (!faceAxesOnly) {
    const ea0 = polyEdges(A, ia),
      eb0 = polyEdges(B, ib);
    for (const ea of ea0)
      for (const eb of eb0) {
        const cx = ea.y * eb.z - ea.z * eb.y,
          cy = ea.z * eb.x - ea.x * eb.z,
          cz = ea.x * eb.y - ea.y * eb.x;
        const l = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (l < 1e-6) continue;
        if (test(cx / l, cy / l, cz / l, false)) return null;
      }
  }
  const bestAx: Vec3 = { x: bax, y: bay, z: baz };

  const n: Vec3 = bestSign > 0 ? bestAx : { x: -bestAx.x, y: -bestAx.y, z: -bestAx.z };
  const [, aHi] = project(A, n);
  const [bLo] = project(B, n);
  const ft = Math.max(1e-7, 1e-5 * scale); // support-feature tolerance
  // In-plane basis.
  const ref = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  let ux = n.y * ref.z - n.z * ref.y,
    uy = n.z * ref.x - n.x * ref.z,
    uz = n.x * ref.y - n.y * ref.x;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const u: Vec3 = { x: ux, y: uy, z: uz };
  const w: Vec3 = { x: n.y * uz - n.z * uy, y: n.z * ux - n.x * uz, z: n.x * uy - n.y * ux };
  const SA: P2[] = [];
  for (const v of A.verts) if (dot(v, n) >= aHi - ft) SA.push([dot(v, u), dot(v, w)]);
  const SB: P2[] = [];
  for (const v of B.verts) if (dot(v, n) <= bLo + ft) SB.push([dot(v, u), dot(v, w)]);
  const eps2 = Math.max(1e-9, 1e-7 * scale);
  const HA = hull2(SA, eps2 * 0.1),
    HB = hull2(SB, eps2 * 0.1);
  let I = intersect2(HA, HB, eps2);
  let area = 0,
    cx = 0,
    cy = 0,
    length = 0;
  if (I && I.length) {
    if (I.length >= 3) {
      const r = polyArea2(I);
      area = r.area;
      cx = r.cx;
      cy = r.cy;
    } else {
      cx = I.reduce((s, p) => s + p[0], 0) / I.length;
      cy = I.reduce((s, p) => s + p[1], 0) / I.length;
    }
    length = diameter2(I);
  } else {
    const m = closestPair2(HA, HB);
    cx = m[0];
    cy = m[1];
    I = null;
  }
  const mid = (aHi + bLo) / 2;
  const point: Vec3 = {
    x: u.x * cx + w.x * cy + n.x * mid,
    y: u.y * cx + w.y * cy + n.y * mid,
    z: u.z * cx + w.z * cy + n.z * mid,
  };
  const kind: ContactKind = area > eps2 * eps2 * 100 ? "face" : length > 1e-4 * scale ? "edge" : "point";
  return { sep: bestSep, normal: n, point, area: kind === "face" ? area : 0, length, kind, penetrating: bestSep < -tol };
}

// --------------------------------------------------------------------------- sampling & pairs

/** Volume of a convex polyhedron (tetrahedra fan from the vertex average). */
export function polyVolumeOf(p: ConvexPoly): number {
  const c = vertexAverage(p);
  let vol = 0;
  for (const f of p.faces) {
    const i0 = f.idx[0];
    for (let k = 1; k + 1 < f.idx.length; k++) vol += tetVol(c, p.verts[i0], p.verts[f.idx[k]], p.verts[f.idx[k + 1]]);
  }
  return vol;
}

function vertexAverage(p: ConvexPoly): Vec3 {
  let x = 0,
    y = 0,
    z = 0;
  for (const v of p.verts) {
    x += v.x;
    y += v.y;
    z += v.z;
  }
  const n = p.verts.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

function tetVol(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const bx = b.x - a.x,
    by = b.y - a.y,
    bz = b.z - a.z;
  const cx = c.x - a.x,
    cy = c.y - a.y,
    cz = c.z - a.z;
  const dx = d.x - a.x,
    dy = d.y - a.y,
    dz = d.z - a.z;
  return Math.abs(bx * (cy * dz - cz * dy) - by * (cx * dz - cz * dx) + bz * (cx * dy - cy * dx)) / 6;
}

/** `count` uniformly distributed random points inside a convex polyhedron. */
export function samplePoly(p: ConvexPoly, count: number, rng: Rng): Vec3[] {
  const c = vertexAverage(p);
  const tets: Array<[Vec3, Vec3, Vec3]> = [];
  const cum: number[] = [];
  let total = 0;
  for (const f of p.faces) {
    const v0 = p.verts[f.idx[0]];
    for (let k = 1; k + 1 < f.idx.length; k++) {
      const v1 = p.verts[f.idx[k]],
        v2 = p.verts[f.idx[k + 1]];
      const vol = tetVol(c, v0, v1, v2);
      if (vol <= 0) continue;
      total += vol;
      tets.push([v0, v1, v2]);
      cum.push(total);
    }
  }
  const out: Vec3[] = [];
  if (!tets.length) return out;
  for (let i = 0; i < count; i++) {
    const r = rng.next() * total;
    let lo = 0,
      hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const [a, b, d] = tets[lo];
    // uniform point in tetra (c, a, b, d) by folding the unit cube
    let s = rng.next(),
      t = rng.next(),
      u = rng.next();
    if (s + t > 1) {
      s = 1 - s;
      t = 1 - t;
    }
    if (t + u > 1) {
      const tmp = u;
      u = 1 - s - t;
      t = 1 - tmp;
    } else if (s + t + u > 1) {
      const tmp = u;
      u = s + t + u - 1;
      s = 1 - t - tmp;
    }
    const w0 = 1 - s - t - u;
    out.push({
      x: c.x * w0 + a.x * s + b.x * t + d.x * u,
      y: c.y * w0 + a.y * s + b.y * t + d.y * u,
      z: c.z * w0 + a.z * s + b.z * t + d.z * u,
    });
  }
  return out;
}

/** All index pairs (i < j) whose AABBs overlap within `pad` (sweep and prune on x). */
export function overlappingPairs(boxes: readonly Aabb[], pad = 0): Array<[number, number]> {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].min.x - boxes[b].min.x);
  const active: number[] = [];
  const out: Array<[number, number]> = [];
  for (const i of order) {
    const bi = boxes[i];
    for (let k = active.length - 1; k >= 0; k--) {
      if (boxes[active[k]].max.x + pad < bi.min.x) active.splice(k, 1);
    }
    for (const j of active) {
      const bj = boxes[j];
      if (bj.min.y <= bi.max.y + pad && bi.min.y <= bj.max.y + pad && bj.min.z <= bi.max.z + pad && bi.min.z <= bj.max.z + pad) {
        out.push(i < j ? [i, j] : [j, i]);
      }
    }
    active.push(i);
  }
  return out;
}
