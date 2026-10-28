// Crack-line growth on a convex polyhedron face and crack clipping helpers. PURE.

import type { Vec3 } from "./vec.ts";
import type { ConvexPoly, PolyFace } from "./poly.ts";
import type { Rng } from "../core/rng.ts";
import type { Crack } from "./meshgen.ts";
import { closestOnFace } from "./poly.ts";
import { scaleOfPoints } from "./util.ts";

const vx = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** 2D frame of a face: origin on the plane, e1/e2 in-plane with cross(e1, e2) = n. */
export interface FaceFrame {
  o: Vec3;
  e1: Vec3;
  e2: Vec3;
  n: Vec3;
  /** Polygon corners in 2D (CCW). */
  px: number[];
  py: number[];
}

export function faceFrame(poly: ConvexPoly, f: PolyFace): FaceFrame {
  const V = poly.verts;
  const idx = f.idx;
  const n = f.n;
  // e1 along the longest edge
  let best = -1,
    ex = 1,
    ey = 0,
    ez = 0;
  for (let k = 0; k < idx.length; k++) {
    const a = V[idx[k]],
      b = V[idx[(k + 1) % idx.length]];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
    const l = dx * dx + dy * dy + dz * dz;
    if (l > best) {
      best = l;
      ex = dx;
      ey = dy;
      ez = dz;
    }
  }
  // make exactly in-plane
  const dn = ex * n.x + ey * n.y + ez * n.z;
  ex -= dn * n.x;
  ey -= dn * n.y;
  ez -= dn * n.z;
  let l = Math.hypot(ex, ey, ez);
  if (!(l > 1e-300)) {
    const a = Math.abs(n.x) < 0.9 ? vx(1, 0, 0) : vx(0, 1, 0);
    ex = n.y * a.z - n.z * a.y;
    ey = n.z * a.x - n.x * a.z;
    ez = n.x * a.y - n.y * a.x;
    l = Math.hypot(ex, ey, ez) || 1;
  }
  const e1 = vx(ex / l, ey / l, ez / l);
  const e2 = vx(n.y * e1.z - n.z * e1.y, n.z * e1.x - n.x * e1.z, n.x * e1.y - n.y * e1.x);
  const a0 = V[idx[0]];
  const s = n.x * a0.x + n.y * a0.y + n.z * a0.z - f.d;
  const o = vx(a0.x - n.x * s, a0.y - n.y * s, a0.z - n.z * s);
  const px: number[] = [],
    py: number[] = [];
  for (const i of idx) {
    const p = V[i];
    const dx = p.x - o.x,
      dy = p.y - o.y,
      dz = p.z - o.z;
    px.push(dx * e1.x + dy * e1.y + dz * e1.z);
    py.push(dx * e2.x + dy * e2.y + dz * e2.z);
  }
  return { o, e1, e2, n, px, py };
}

export function to2D(fr: FaceFrame, p: Vec3): [number, number] {
  const dx = p.x - fr.o.x,
    dy = p.y - fr.o.y,
    dz = p.z - fr.o.z;
  return [dx * fr.e1.x + dy * fr.e1.y + dz * fr.e1.z, dx * fr.e2.x + dy * fr.e2.y + dz * fr.e2.z];
}

export function to3D(fr: FaceFrame, x: number, y: number): Vec3 {
  return vx(fr.o.x + fr.e1.x * x + fr.e2.x * y, fr.o.y + fr.e1.y * x + fr.e2.y * y, fr.o.z + fr.e1.z * x + fr.e2.z * y);
}

/** Signed distance of (x,y) to the polygon boundary (positive inside). */
function insideDist(fr: FaceFrame, x: number, y: number): number {
  const m = fr.px.length;
  let d = Infinity;
  for (let k = 0; k < m; k++) {
    const ax = fr.px[k],
      ay = fr.py[k];
    const bx = fr.px[(k + 1) % m],
      by = fr.py[(k + 1) % m];
    const ex = bx - ax,
      ey = by - ay;
    const l = Math.hypot(ex, ey);
    if (!(l > 0)) continue;
    const s = (ex * (y - ay) - ey * (x - ax)) / l;
    if (s < d) d = s;
  }
  return d;
}

/** Largest t in [0,1] such that p + t(q-p) keeps at least `margin` inside the polygon. */
function clipT(fr: FaceFrame, px: number, py: number, qx: number, qy: number, margin: number): number {
  const m = fr.px.length;
  let t = 1;
  for (let k = 0; k < m; k++) {
    const ax = fr.px[k],
      ay = fr.py[k];
    const bx = fr.px[(k + 1) % m],
      by = fr.py[(k + 1) % m];
    const ex = bx - ax,
      ey = by - ay;
    const l = Math.hypot(ex, ey);
    if (!(l > 0)) continue;
    const dp = (ex * (py - ay) - ey * (px - ax)) / l - margin;
    const dq = (ex * (qy - ay) - ey * (qx - ax)) / l - margin;
    if (dq < 0) {
      const tt = dp <= 0 ? 0 : dp / (dp - dq);
      if (tt < t) t = tt;
    }
  }
  return t < 0 ? 0 : t;
}

/**
 * Clip a polyline (3D points near the face plane) to the face polygon; returns 2D runs.
 */
export function clipPolyline2D(fr: FaceFrame, pts: Vec3[]): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> | null = null;
  const m = fr.px.length;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = to2D(fr, pts[i]);
    const [bx, by] = to2D(fr, pts[i + 1]);
    // Cyrus–Beck against the convex polygon
    let t0 = 0,
      t1 = 1;
    const dx = bx - ax,
      dy = by - ay;
    let ok = true;
    for (let k = 0; k < m && ok; k++) {
      const px = fr.px[k],
        py = fr.py[k];
      const qx = fr.px[(k + 1) % m],
        qy = fr.py[(k + 1) % m];
      const ex = qx - px,
        ey = qy - py;
      const num = ex * (ay - py) - ey * (ax - px); // inside >= 0
      const den = ex * dy - ey * dx;
      if (Math.abs(den) < 1e-30) {
        if (num < 0) ok = false;
        continue;
      }
      const t = -num / den;
      if (den > 0) {
        if (t > t0) t0 = t;
      } else if (t < t1) t1 = t;
      if (t0 > t1) ok = false;
    }
    if (!ok || t1 - t0 < 1e-12) {
      cur = null;
      continue;
    }
    const s0: [number, number] = [ax + dx * t0, ay + dy * t0];
    const s1: [number, number] = [ax + dx * t1, ay + dy * t1];
    if (cur && t0 <= 1e-12) cur.push(s1);
    else {
      cur = [s0, s1];
      runs.push(cur);
    }
    if (t1 < 1 - 1e-12) cur = null;
  }
  return runs;
}

/** Pick the face hit by an impact at `p` travelling along `dir` (into the part). */
export function pickFace(poly: ConvexPoly, p: Vec3, dir: Vec3): number {
  const scale = scaleOfPoints(poly.verts);
  const near = Math.max(0.005, 0.03 * scale);
  const dl = Math.hypot(dir.x, dir.y, dir.z);
  const d = dl > 1e-12 ? vx(dir.x / dl, dir.y / dl, dir.z / dl) : vx(0, 0, 0);
  let best = -1,
    bs = -Infinity;
  for (let fi = 0; fi < poly.faces.length; fi++) {
    const f = poly.faces[fi];
    if (f.idx.length < 3) continue;
    const q = closestOnFace(poly, f, p);
    const dist = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    const align = -(f.n.x * d.x + f.n.y * d.y + f.n.z * d.z);
    const score = align - (3 * dist) / near;
    if (score > bs) {
      bs = score;
      best = fi;
    }
  }
  return best;
}

/**
 * Grow branching crack polylines on the face of `poly` hit at `impact` (see meshgen.growCracks).
 */
export function growCracksImpl(
  poly: ConvexPoly,
  impact: Vec3,
  dir: Vec3,
  severity: number,
  rng: Rng,
  opts: { radial?: boolean; maxLength?: number; width?: number } = {},
): Crack[] {
  const sev = Math.min(1, Math.max(0, Number.isFinite(severity) ? severity : 0));
  if (sev <= 0 || poly.faces.length === 0) return [];
  const fi = pickFace(poly, impact, dir);
  if (fi < 0) return [];
  const f = poly.faces[fi];
  const fr = faceFrame(poly, f);
  const m = fr.px.length;
  // face size
  let diam = 0;
  for (let a = 0; a < m; a++)
    for (let b = a + 1; b < m; b++) diam = Math.max(diam, Math.hypot(fr.px[a] - fr.px[b], fr.py[a] - fr.py[b]));
  if (!(diam > 0)) return [];
  const width = Math.max(1e-5, opts.width ?? 0.0012);
  const maxLen = Math.max(1e-4, opts.maxLength ?? Math.min(0.8, Math.max(0.02, 0.5 * diam)));
  const margin = Math.min(0.0005, 0.01 * diam);
  // start point: closest point of the face to the impact, nudged inside
  const q = closestOnFace(poly, f, impact);
  let [sx, sy] = to2D(fr, q);
  let cx = 0,
    cy = 0;
  for (let k = 0; k < m; k++) {
    cx += fr.px[k];
    cy += fr.py[k];
  }
  cx /= m;
  cy /= m;
  for (let it = 0; it < 8 && insideDist(fr, sx, sy) < margin * 1.5; it++) {
    sx += (cx - sx) * 0.1;
    sy += (cy - sy) * 0.1;
  }
  if (insideDist(fr, sx, sy) < margin) {
    sx = cx;
    sy = cy;
  }

  const cracks: Crack[] = [];
  const emit = (pts: Array<[number, number]>, w: number) => {
    if (pts.length < 2) return;
    cracks.push({ points: pts.map(([x, y]) => to3D(fr, x, y)), n: vx(f.n.x, f.n.y, f.n.z), width: w });
  };

  // random-walk crack from (x,y) with heading a
  const walk = (x: number, y: number, a: number, length: number, w: number, jitter: number, branchP: number, depth: number): Array<[number, number]> => {
    const steps = Math.min(24, Math.max(3, Math.round((length / maxLen) * 14)));
    const step = length / steps;
    const pts: Array<[number, number]> = [[x, y]];
    let px = x,
      py = y;
    for (let s = 0; s < steps; s++) {
      a += rng.gauss() * jitter;
      let qx = px + step * Math.cos(a),
        qy = py + step * Math.sin(a);
      const t = clipT(fr, px, py, qx, qy, margin);
      qx = px + (qx - px) * t;
      qy = py + (qy - py) * t;
      if (t > 1e-6) pts.push([qx, qy]);
      if (t < 1) break;
      if (depth < 2 && s < steps - 1 && rng.chance(branchP)) {
        const side = rng.chance(0.5) ? 1 : -1;
        const rest = (steps - s - 1) * step;
        const br = walk(qx, qy, a + side * rng.range(0.35, 0.9), rest * rng.range(0.3, 0.65), w * 0.6, jitter * 1.1, branchP * 0.6, depth + 1);
        emit(br, w * 0.6);
      }
      px = qx;
      py = qy;
    }
    return pts;
  };

  if (opts.radial) {
    const R = Math.min(12, 6 + Math.round(sev * 4) + rng.int(0, 2));
    const base = rng.range(0, Math.PI * 2);
    const rays: Array<Array<[number, number]>> = [];
    const angles: number[] = [];
    let meanLen = 0;
    for (let j = 0; j < R; j++) {
      const a = base + ((j + rng.range(-0.25, 0.25)) * Math.PI * 2) / R;
      const len = maxLen * (0.35 + 0.65 * sev) * rng.range(0.6, 1.0);
      meanLen += len / R;
      angles.push(a);
      const ray = walk(sx, sy, a, len, width, 0.1, 0.05 * sev, 1);
      rays.push(ray);
      emit(ray, width);
    }
    const K = 1 + Math.floor(sev * 3);
    const fr0 = [0.15, 0.3, 0.5, 0.75];
    for (let k = 0; k < K; k++) {
      const rk = meanLen * fr0[k] * rng.range(0.85, 1.15);
      for (let j = 0; j < R; j++) {
        if (!rng.chance(0.35 + 0.5 * sev)) continue;
        const A = pointAtDist(rays[j], rk),
          B = pointAtDist(rays[(j + 1) % R], rk);
        if (!A || !B) continue;
        let a0 = angles[j],
          a1 = angles[(j + 1) % R];
        if (a1 < a0) a1 += Math.PI * 2;
        const am = (a0 + a1) / 2;
        const rm = rk * rng.range(0.92, 1.05);
        const M: [number, number] = [sx + rm * Math.cos(am), sy + rm * Math.sin(am)];
        if (insideDist(fr, M[0], M[1]) < margin) continue;
        emit([A, M, B], width * 0.7);
      }
    }
  } else {
    const count = 1 + Math.floor(sev * 3.5 + rng.next());
    const base = rng.range(0, Math.PI * 2);
    for (let c = 0; c < count; c++) {
      const a = base + ((c + rng.range(-0.4, 0.4)) * Math.PI * 2) / count;
      const len = maxLen * (0.25 + 0.75 * sev) * rng.range(0.6, 1.0);
      emit(walk(sx, sy, a, len, width, 0.3, 0.12 * sev + 0.03, 0), width);
    }
  }
  return cracks;
}

/** Point on a polyline at Euclidean distance r from its first point (first crossing), or null. */
function pointAtDist(pts: Array<[number, number]>, r: number): [number, number] | null {
  const [x0, y0] = pts[0];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i],
      [bx, by] = pts[i + 1];
    const da = Math.hypot(ax - x0, ay - y0),
      db = Math.hypot(bx - x0, by - y0);
    if (da <= r && db >= r) {
      const t = db - da > 1e-12 ? (r - da) / (db - da) : 0;
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
  }
  return null;
}
