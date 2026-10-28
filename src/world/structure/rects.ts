// Small 2D helpers (axis-aligned rectangles in plan x/z, 1D intervals) used to lay out the
// apartment structure: room coverage = room rectangle minus wall footprints, sheet/tile/plank
// layouts, etc. PURE.

import type { Rect2 } from "./levels.ts";

export type { Rect2 };
export type Interval = [number, number];

/** Geometric tolerance for layout comparisons (m). */
export const LEPS = 1e-6;

export const rect = (x0: number, x1: number, z0: number, z1: number): Rect2 => ({ x0, x1, z0, z1 });

export const rectArea = (r: Rect2): number => Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);

export const rectW = (r: Rect2): number => r.x1 - r.x0;
export const rectD = (r: Rect2): number => r.z1 - r.z0;

export function rectIntersect(a: Rect2, b: Rect2, eps = LEPS): Rect2 | null {
  const x0 = Math.max(a.x0, b.x0),
    x1 = Math.min(a.x1, b.x1),
    z0 = Math.max(a.z0, b.z0),
    z1 = Math.min(a.z1, b.z1);
  if (x1 - x0 <= eps || z1 - z0 <= eps) return null;
  return { x0, x1, z0, z1 };
}

export function rectInflate(r: Rect2, d: number): Rect2 {
  return { x0: r.x0 - d, x1: r.x1 + d, z0: r.z0 - d, z1: r.z1 + d };
}

export function rectContainsPoint(r: Rect2, x: number, z: number, eps = 0): boolean {
  return x >= r.x0 - eps && x <= r.x1 + eps && z >= r.z0 - eps && z <= r.z1 + eps;
}

/** a minus b as up to 4 disjoint rectangles (full-height side strips along z, then caps). */
export function rectSubtract(a: Rect2, b: Rect2, eps = LEPS): Rect2[] {
  const o = rectIntersect(a, b, eps);
  if (!o) return [a];
  const out: Rect2[] = [];
  if (o.x0 - a.x0 > eps) out.push({ x0: a.x0, x1: o.x0, z0: a.z0, z1: a.z1 });
  if (a.x1 - o.x1 > eps) out.push({ x0: o.x1, x1: a.x1, z0: a.z0, z1: a.z1 });
  if (o.z0 - a.z0 > eps) out.push({ x0: o.x0, x1: o.x1, z0: a.z0, z1: o.z0 });
  if (a.z1 - o.z1 > eps) out.push({ x0: o.x0, x1: o.x1, z0: o.z1, z1: a.z1 });
  return out;
}

export function rectsSubtract(list: Rect2[], b: Rect2, eps = LEPS): Rect2[] {
  const out: Rect2[] = [];
  for (const r of list) for (const p of rectSubtract(r, b, eps)) out.push(p);
  return out;
}

/** Merge rectangles that share a full edge (repeatedly) to reduce artificial seams. */
export function mergeRects(list: Rect2[], eps = 1e-5): Rect2[] {
  const rs = list.map((r) => ({ ...r }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i],
          b = rs[j];
        const sameX = Math.abs(a.x0 - b.x0) < eps && Math.abs(a.x1 - b.x1) < eps;
        const sameZ = Math.abs(a.z0 - b.z0) < eps && Math.abs(a.z1 - b.z1) < eps;
        let m: Rect2 | null = null;
        if (sameX && (Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps)) {
          m = { x0: a.x0, x1: a.x1, z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) };
        } else if (sameZ && (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps)) {
          m = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: a.z0, z1: a.z1 };
        }
        if (m) {
          rs[i] = m;
          rs.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return rs;
}

/**
 * Pieces of `cell` covered by a union of DISJOINT rectangles, merged where they form larger
 * rectangles (a plank crossing two coverage rectangles stays one piece when it can).
 */
export function clipToUnion(cell: Rect2, union: Rect2[], eps = LEPS): Rect2[] {
  const pieces: Rect2[] = [];
  for (const u of union) {
    const r = rectIntersect(cell, u, eps);
    if (r) pieces.push(r);
  }
  return pieces.length > 1 ? mergeRects(pieces) : pieces;
}

/** Drop slivers thinner than `minDim` in either direction. */
export function dropSlivers(list: Rect2[], minDim: number): Rect2[] {
  return list.filter((r) => rectW(r) >= minDim && rectD(r) >= minDim);
}

/** Bounding box of a non-empty rectangle list. */
export function rectsBounds(list: Rect2[]): Rect2 {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const r of list) {
    b.x0 = Math.min(b.x0, r.x0);
    b.x1 = Math.max(b.x1, r.x1);
    b.z0 = Math.min(b.z0, r.z0);
    b.z1 = Math.max(b.z1, r.z1);
  }
  return b;
}

// ------------------------------------------------------------------ intervals
/** Breakpoints splitting [a, b] into n = ceil(len/max) equal pieces (includes both ends). */
export function splitEven(a: number, b: number, max: number): number[] {
  const len = b - a;
  if (!(len > 0)) return [a, b];
  const n = Math.max(1, Math.ceil(len / max - 1e-9));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(i === n ? b : a + (len * i) / n);
  return out;
}

/** Merge-sorted union of intervals. */
export function intervalsUnion(list: Interval[], eps = LEPS): Interval[] {
  const s = list.filter((i) => i[1] - i[0] > eps).map((i) => [i[0], i[1]] as Interval).sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [];
  for (const i of s) {
    const last = out[out.length - 1];
    if (last && i[0] <= last[1] + eps) last[1] = Math.max(last[1], i[1]);
    else out.push(i);
  }
  return out;
}

/** list minus cut. */
export function intervalsSubtract(list: Interval[], cut: Interval, eps = LEPS): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    if (cut[1] <= a + eps || cut[0] >= b - eps) {
      out.push([a, b]);
      continue;
    }
    if (cut[0] - a > eps) out.push([a, cut[0]]);
    if (b - cut[1] > eps) out.push([cut[1], b]);
  }
  return out;
}

export function intervalsSubtractAll(list: Interval[], cuts: Interval[], eps = LEPS): Interval[] {
  let r = list;
  for (const c of cuts) r = intervalsSubtract(r, c, eps);
  return r;
}

export function intervalIntersect(a: Interval, b: Interval, eps = LEPS): Interval | null {
  const lo = Math.max(a[0], b[0]),
    hi = Math.min(a[1], b[1]);
  return hi - lo > eps ? [lo, hi] : null;
}

export const overlapLen = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
