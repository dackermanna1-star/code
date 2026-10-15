// 2D geometry helpers for authored layout data (pure, allocation-light).
import type { Polygon, XZ } from './types';

export const xz = (x: number, z: number): XZ => ({ x, z });

export function dist(a: XZ, b: XZ): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function polylineLength(pts: readonly XZ[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** Centripetal-ish Catmull-Rom (uniform) through the points, resampled every `step` meters. */
export function smoothPolyline(pts: readonly XZ[], step: number, closed = false): XZ[] {
  const n = pts.length;
  if (n < 3) return resamplePolyline(pts, step);
  const out: XZ[] = [];
  const get = (i: number): XZ => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) return { x: 2 * pts[0].x - pts[1].x, z: 2 * pts[0].z - pts[1].z };
    if (i >= n) return { x: 2 * pts[n - 1].x - pts[n - 2].x, z: 2 * pts[n - 1].z - pts[n - 2].z };
    return pts[i];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = dist(p1, p2);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  if (!closed) out.push({ ...pts[n - 1] });
  return out;
}

/** Linear resampling of a polyline every `step` meters (keeps both ends). */
export function resamplePolyline(pts: readonly XZ[], step: number): XZ[] {
  const out: XZ[] = [];
  if (pts.length === 0) return out;
  out.push({ ...pts[0] });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = dist(a, b);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

/** Interpolate a per-point attribute along a polyline that was resampled from `src` (by arc-length fraction). */
export function interpolateAlong(src: readonly XZ[], values: readonly number[], dst: readonly XZ[]): number[] {
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + dist(src[i - 1], src[i]));
  const total = cum[cum.length - 1] || 1;
  const dcum = [0];
  for (let i = 1; i < dst.length; i++) dcum.push(dcum[i - 1] + dist(dst[i - 1], dst[i]));
  const dtotal = dcum[dcum.length - 1] || 1;
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i < dst.length; i++) {
    const s = (dcum[i] / dtotal) * total;
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const span = cum[k + 1] - cum[k] || 1;
    const t = Math.min(1, Math.max(0, (s - cum[k]) / span));
    out.push(values[k] + (values[Math.min(k + 1, values.length - 1)] - values[k]) * t);
  }
  return out;
}

export interface SegmentHit {
  /** Distance to the polyline. */
  d: number;
  /** Segment index. */
  i: number;
  /** Parameter on segment i (0..1). */
  t: number;
  /** Signed side: >0 = left of travel direction (in x/z with z down means... see sideOf). */
  side: number;
}

/** Closest point query against a polyline. */
export function distToPolyline(p: XZ, pts: readonly XZ[], out?: SegmentHit): SegmentHit {
  const res = out ?? { d: Infinity, i: 0, t: 0, side: 0 };
  res.d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1e-9;
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + dx * t - p.x, cz = a.z + dz * t - p.z;
    const d = Math.sqrt(cx * cx + cz * cz);
    if (d < res.d) {
      res.d = d;
      res.i = i;
      res.t = t;
      res.side = dx * (p.z - a.z) - dz * (p.x - a.x);
    }
  }
  return res;
}

export function pointInPolygon(p: XZ, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Oriented rectangle (center, half extents along local X/Z, rotation about +Y). */
export interface OBB {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

/**
 * Rotation convention matches three.js rotation.y: local (lx, lz) maps to world
 * (x + lx*cos + lz*sin, z - lx*sin + lz*cos).
 */
export function localToWorld(o: { x: number; z: number; rot: number }, lx: number, lz: number): XZ {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}

export function worldToLocal(o: { x: number; z: number; rot: number }, x: number, z: number): XZ {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const dx = x - o.x, dz = z - o.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** Signed distance from a point to an OBB (negative inside). */
export function obbSignedDistance(o: OBB, x: number, z: number): number {
  const l = worldToLocal(o, x, z);
  const qx = Math.abs(l.x) - o.hw, qz = Math.abs(l.z) - o.hd;
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0);
}

export function obbCorners(o: OBB): XZ[] {
  return [
    localToWorld(o, -o.hw, -o.hd),
    localToWorld(o, o.hw, -o.hd),
    localToWorld(o, o.hw, o.hd),
    localToWorld(o, -o.hw, o.hd),
  ];
}

/** Separating-axis overlap test for two OBBs (with optional extra margin). */
export function obbOverlap(a: OBB, b: OBB, margin = 0): boolean {
  const axes = [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2];
  const ca = obbCorners({ ...a, hw: a.hw + margin, hd: a.hd + margin });
  const cb = obbCorners(b);
  for (const ang of axes) {
    const ax = Math.cos(ang), az = -Math.sin(ang);
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ca) {
      const v = p.x * ax + p.z * az;
      amin = Math.min(amin, v);
      amax = Math.max(amax, v);
    }
    for (const p of cb) {
      const v = p.x * ax + p.z * az;
      bmin = Math.min(bmin, v);
      bmax = Math.max(bmax, v);
    }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}

/** Axis-aligned bounds of a set of points. */
export function bounds(pts: readonly XZ[], pad = 0): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.x > x1) x1 = p.x;
    if (p.z > z1) z1 = p.z;
  }
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

/** Intersection of segments p1-p2 and p3-p4: returns params (t on first, u on second) or null. */
export function segmentIntersect(p1: XZ, p2: XZ, p3: XZ, p4: XZ): { t: number; u: number; x: number; z: number } | null {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x, d2z = p4.z - p3.z;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / den;
  const u = ((p3.x - p1.x) * d1z - (p3.z - p1.z) * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: p1.x + d1x * t, z: p1.z + d1z * t };
}

/** Point and tangent at arc length s along a polyline. */
export function pointAtLength(pts: readonly XZ[], s: number): { x: number; z: number; tx: number; tz: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = dist(a, b);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L > 0 ? Math.min(1, Math.max(0, (s - acc) / L)) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / (L || 1), tz: (b.z - a.z) / (L || 1) };
    }
    acc += L;
  }
  const p = pts[pts.length - 1];
  return { x: p.x, z: p.z, tx: 1, tz: 0 };
}

/** Yaw (rotation.y) that makes local +Z face along world direction (dx, dz). */
export function rotYFacing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
