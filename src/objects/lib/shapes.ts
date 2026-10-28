// Point-set generators for convex parts the builder makes from hulls:
//  * tubeSegments: a polyline swept by a k-gon, split into convex segments with exact MITRE
//    joints — the joint cross-section (an ellipse in the bisecting plane) is computed once per
//    joint and shared by both neighbouring segments, so neighbours touch face-to-face (fused
//    bonds get real seam areas) for any path, planar or not. Frames are parallel-transported to
//    minimise twist; planar paths get rings aligned with the bend axis (no twist at all).
//  * arcPoints: points on a circular arc in a principal plane (handles, rings, bent pipes).
//  * frameBarPoints: four mitred bars of a rectangular frame (picture frames, sashes, doors).
// PURE MODULE (no Babylon).

import { v3, vadd, vsub, vscale, vdot, vcross, vlen, vnorm, vperp, qaxisAngle, qrot, type Vec3 } from "../../geom/vec.ts";

export interface TubeSegment {
  /** Hull points: start ring followed by end ring. */
  points: Vec3[];
  from: Vec3;
  to: Vec3;
  /** Centre-line length (m). */
  length: number;
  /** Unit direction from -> to. */
  dir: Vec3;
}

const clamp1 = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);

/** Rotate u by the minimal rotation taking unit a to unit b, then re-orthogonalise against b. */
function transport(u: Vec3, a: Vec3, b: Vec3): Vec3 {
  const axis = vcross(a, b);
  const s = vlen(axis);
  const c = clamp1(vdot(a, b));
  let r = u;
  if (s > 1e-12) r = qrot(qaxisAngle(vscale(axis, 1 / s), Math.atan2(s, c)), u);
  const proj = vsub(r, vscale(b, vdot(r, b)));
  const l = vlen(proj);
  return l > 1e-9 ? vscale(proj, 1 / l) : vperp(b);
}

/**
 * Split a swept tube into convex segments.
 * @param path centre-line points (>= 2 distinct; >= 3 when closed)
 * @param radius tube radius (m)
 * @param sides polygon sides of the cross-section (>= 3)
 * @param closed connect the last point back to the first
 * @param maxBendDeg largest allowed turn at a joint (sharper turns need an extra point)
 */
export function tubeSegments(path: readonly Vec3[], radius: number, sides = 8, closed = false, maxBendDeg = 150): TubeSegment[] {
  if (!(radius > 0) || !Number.isFinite(radius)) throw new Error(`tube: bad radius ${radius}`);
  const k = Math.max(3, Math.floor(sides));
  const P: Vec3[] = [];
  for (const p of path) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) throw new Error("tube: non-finite path point");
    if (!P.length || vlen(vsub(p, P[P.length - 1])) > 1e-6) P.push(p);
  }
  if (closed && P.length > 2 && vlen(vsub(P[0], P[P.length - 1])) <= 1e-6) P.pop();
  const n = P.length;
  if (n < 2 || (closed && n < 3)) throw new Error(`tube: path needs at least ${closed ? 3 : 2} distinct points`);
  const segCount = closed ? n : n - 1;
  const T: Vec3[] = [];
  for (let i = 0; i < segCount; i++) T.push(vnorm(vsub(P[(i + 1) % n], P[i])));

  // Mitre normal, bend angle and stretch direction per joint.
  const maxBend = (maxBendDeg * Math.PI) / 180;
  const M: Vec3[] = [];
  const PHI: number[] = [];
  const DIR: Array<Vec3 | null> = [];
  for (let j = 0; j < n; j++) {
    const tin = closed ? T[(j - 1 + segCount) % segCount] : j > 0 ? T[j - 1] : null;
    const tout = closed ? T[j % segCount] : j < segCount ? T[j] : null;
    if (tin && tout) {
      const phi = Math.acos(clamp1(vdot(tin, tout)));
      if (phi > maxBend) throw new Error(`tube: bend of ${((phi * 180) / Math.PI).toFixed(0)}° at point ${j} exceeds ${maxBendDeg}° — add intermediate points`);
      M.push(vnorm(vadd(tin, tout)));
      PHI.push(phi);
      DIR.push(phi > 1e-6 ? vnorm(vsub(tout, tin)) : null);
    } else {
      M.push((tin ?? tout)!);
      PHI.push(0);
      DIR.push(null);
    }
  }

  // Initial frame: the first bend axis (exact, twist-free rings for planar paths).
  let U: Vec3 | null = null;
  for (let i = 1; i < segCount && !U; i++) {
    const a = vcross(T[i - 1], T[i]);
    if (vlen(a) > 1e-6) {
      const pa = vsub(a, vscale(M[0], vdot(a, M[0])));
      if (vlen(pa) > 1e-6) U = vnorm(pa);
    }
  }
  if (!U && closed && segCount >= 2) {
    const a = vcross(T[segCount - 1], T[0]);
    const pa = vsub(a, vscale(M[0], vdot(a, M[0])));
    if (vlen(pa) > 1e-6) U = vnorm(pa);
  }
  if (!U) U = vperp(M[0]);

  const rings: Vec3[][] = [];
  for (let j = 0; j < n; j++) {
    if (j > 0) U = transport(U, M[j - 1], M[j]);
    const m = M[j];
    const W = vcross(m, U);
    const d = DIR[j];
    const s = d ? 1 / Math.cos(PHI[j] / 2) : 1;
    const ring: Vec3[] = [];
    for (let q = 0; q < k; q++) {
      const th = (2 * Math.PI * q) / k;
      let v = vadd(vscale(U, Math.cos(th)), vscale(W, Math.sin(th)));
      if (d) v = vadd(v, vscale(d, (s - 1) * vdot(v, d)));
      ring.push(vadd(P[j], vscale(v, radius)));
    }
    rings.push(ring);
  }

  const out: TubeSegment[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = P[i],
      b = P[(i + 1) % n];
    out.push({ points: rings[i].concat(rings[(i + 1) % n]), from: a, to: b, length: vlen(vsub(b, a)), dir: T[i] });
  }
  return out;
}

export type Plane = "xy" | "xz" | "yz" | "zy";

/**
 * `segments + 1` points on a circular arc around `center` in a principal plane, from a0 to a1
 * (degrees). Plane "xy": angle 0 = +X, 90 = +Y; "xz": 0 = +X, 90 = +Z; "yz": 0 = +Y, 90 = +Z;
 * "zy": 0 = +Z, 90 = +Y.
 */
export function arcPoints(center: Vec3, radius: number, a0Deg: number, a1Deg: number, segments: number, plane: Plane = "xy"): Vec3[] {
  const segs = Math.max(1, Math.floor(segments));
  const e1 = plane === "yz" ? v3(0, 1, 0) : plane === "zy" ? v3(0, 0, 1) : v3(1, 0, 0);
  const e2 = plane === "xy" || plane === "zy" ? v3(0, 1, 0) : v3(0, 0, 1);
  const out: Vec3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = ((a0Deg + ((a1Deg - a0Deg) * i) / segs) * Math.PI) / 180;
    out.push(vadd(center, vadd(vscale(e1, radius * Math.cos(a)), vscale(e2, radius * Math.sin(a)))));
  }
  return out;
}

export interface BarWidths {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Hull points of the 4 mitred bars of a rectangular frame lying in the XY plane, centred on the
 * origin, outer size w × h, spanning z0..z1. Bars may have different widths (a door frame with a
 * wide lock stile); mitres run from each outer corner to the matching inner corner.
 * Names are AXIS-based: "left" = the -X bar, "right" = the +X bar (Babylon is left-handed, so seen
 * from the front the -X bar is on the viewer's right).
 */
export function frameBarPoints(
  w: number,
  h: number,
  bar: number | BarWidths,
  z0: number,
  z1: number,
): { top: Vec3[]; bottom: Vec3[]; left: Vec3[]; right: Vec3[]; inner: { x0: number; x1: number; y0: number; y1: number } } {
  const bw: BarWidths = typeof bar === "number" ? { top: bar, bottom: bar, left: bar, right: bar } : bar;
  const x0 = -w / 2,
    x1 = w / 2,
    y0 = -h / 2,
    y1 = h / 2;
  const ix0 = x0 + bw.left,
    ix1 = x1 - bw.right,
    iy0 = y0 + bw.bottom,
    iy1 = y1 - bw.top;
  if (!(ix1 > ix0 + 1e-4) || !(iy1 > iy0 + 1e-4)) throw new Error(`frameBarPoints: bars (${JSON.stringify(bw)}) leave no opening in ${w} × ${h}`);
  if (!(z1 > z0)) throw new Error("frameBarPoints: z1 must exceed z0");
  const quad = (pts: Array<[number, number]>): Vec3[] => {
    const out: Vec3[] = [];
    for (const z of [z0, z1]) for (const [x, y] of pts) out.push(v3(x, y, z));
    return out;
  };
  return {
    bottom: quad([
      [x0, y0],
      [x1, y0],
      [ix1, iy0],
      [ix0, iy0],
    ]),
    right: quad([
      [x1, y0],
      [x1, y1],
      [ix1, iy1],
      [ix1, iy0],
    ]),
    top: quad([
      [x1, y1],
      [x0, y1],
      [ix0, iy1],
      [ix1, iy1],
    ]),
    left: quad([
      [x0, y1],
      [x0, y0],
      [ix0, iy0],
      [ix0, iy1],
    ]),
    inner: { x0: ix0, x1: ix1, y0: iy0, y1: iy1 },
  };
}
