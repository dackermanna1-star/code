// Small pure helpers of the damage model: local part geometry at an impact point, strength
// scatter, fatigue sums and damage-point bookkeeping. PURE MODULE (no Babylon).

import type { Vec3 } from "../../geom/vec.ts";
import { polyChord, polyExtents, polyWidth, type ConvexPoly, type PolyFace } from "../../geom/poly.ts";
import type { Dent } from "../../geom/meshgen.ts";
import { hash32 } from "../../core/rng.ts";
import type { DamagePoint, PartState } from "./damage.ts";
import { K, TUNING } from "./tuning.ts";

export const fin = (x: number, fb = 0): number => (Number.isFinite(x) ? x : fb);
export const finVec = (v: Vec3 | undefined | null): v is Vec3 => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Effective solid volume: hull volume, reduced for hollow parts whose mass override is lighter. */
export function effVolume(part: PartState): number {
  const V = fin(part.volume, 0);
  const rho = part.mat.density;
  if (!(V > 0)) return 0;
  if (part.mass > 0 && rho > 0) return Math.min(V, part.mass / rho);
  return V;
}

/** Deterministic per-part strength scatter (log-normal, σ from TUNING), clamped to [0.65, 1.5]. */
export function partFlaw(part: PartState): number {
  const sigma = TUNING[part.mat.id]?.flaw ?? 0.1;
  let h = hash32((part.id | 0) ^ 0x5bd1e995);
  let s = 0;
  for (let i = 0; i < 4; i++) {
    h = hash32(h + i * 0x9e3779b9);
    s += h / 4294967296;
  }
  const g = (s - 2) * 1.732; // ~N(0,1) (sum of 4 uniforms has σ = 1/√3)
  return Math.min(1.5, Math.max(0.65, Math.exp(sigma * Math.max(-2.2, Math.min(2.2, g)))));
}

export interface LocalGeom {
  /** Outward normal of the face that was hit. */
  faceN: Vec3;
  face: PolyFace | null;
  /** Local thickness under the impact (m). */
  t: number;
  /** In-plane size at the hit (m): the plate's middle extent for planar parts, else the smallest
   *  principal extent perpendicular to the face normal. */
  inPlaneMin: number;
  /** True when the part is a plate (thin compared to its in-plane size). */
  planar: boolean;
}

/** Hit face: the face plane the point is closest to (outside ones first), ties → most against dir. */
export function hitFace(poly: ConvexPoly, p: Vec3, dir: Vec3, scale: number): PolyFace | null {
  let best: PolyFace | null = null,
    bs = -Infinity;
  for (const f of poly.faces) {
    const s = f.n.x * p.x + f.n.y * p.y + f.n.z * p.z - f.d - 1e-3 * scale * (f.n.x * dir.x + f.n.y * dir.y + f.n.z * dir.z);
    if (s > bs) {
      bs = s;
      best = f;
    }
  }
  return best;
}

export function localGeom(part: PartState, p: Vec3, dir: Vec3): LocalGeom {
  const poly = part.poly;
  const ext = part.ext;
  const scale = Math.max(1e-4, fin(ext[0], 0.1));
  const face = hitFace(poly, p, dir, scale);
  const faceN = face ? face.n : { x: -dir.x, y: -dir.y, z: -dir.z };
  const chord = (d: Vec3): number => {
    const c = polyChord(poly, p, d);
    return c ? c.tMax - c.tMin : Infinity;
  };
  let t = Math.min(chord(dir), chord({ x: -faceN.x, y: -faceN.y, z: -faceN.z }));
  if (!(t > 0) || !Number.isFinite(t)) t = polyWidth(poly, faceN);
  if (!(t > 0) || !Number.isFinite(t)) t = Math.max(1e-4, fin(ext[2], 0.01));
  // in-plane extents. A plate's in-plane size is a property of the plate itself (its two
  // largest principal extents), whatever face was hit: an edge hit on a door or table top must
  // not see the plate thickness as its "in-plane" size (that would turn every edge chip into a
  // whole-part failure). Bulky parts: principal axes except the one most aligned with the face.
  const planar = ext[2] < 0.3 * ext[1];
  let inPlaneMin = fin(ext[1], 0.1);
  if (!planar) try {
    const E = polyExtents(poly);
    let k = 0,
      bd = -1;
    for (let i = 0; i < 3; i++) {
      const a = E.axes[i];
      const d = Math.abs(a.x * faceN.x + a.y * faceN.y + a.z * faceN.z);
      if (d > bd) {
        bd = d;
        k = i;
      }
    }
    const rest = [0, 1, 2].filter((i) => i !== k).map((i) => E.ext[i]);
    inPlaneMin = Math.min(rest[0], rest[1]);
  } catch {
    /* keep fallback */
  }
  return { faceN, face, t, inPlaneMin: Math.max(1e-4, inPlaneMin), planar };
}

/** Distance from p to the nearest edge face of a plate (faces roughly perpendicular to faceN). */
export function edgeDistance(poly: ConvexPoly, p: Vec3, faceN: Vec3): number {
  let m = Infinity;
  for (const f of poly.faces) {
    if (Math.abs(f.n.x * faceN.x + f.n.y * faceN.y + f.n.z * faceN.z) > 0.5) continue;
    const s = f.d - (f.n.x * p.x + f.n.y * p.y + f.n.z * p.z);
    if (s < m) m = s;
  }
  return Math.max(0, m);
}

/** Fatigue radius (m): wide enough for repeated hits "at the same spot", scaled with the part. */
export function fatigueRadius(part: PartState, contact: number): number {
  return Math.min(0.4, Math.max(0.03, 3 * contact, 0.08 * fin(part.ext[0], 0.1)));
}

/** Distance-weighted sum of remembered damage near p (J). */
export function fatigueSum(dmg: readonly DamagePoint[], p: Vec3, R: number): number {
  let D = 0;
  const R2 = R * R;
  for (const d of dmg) {
    if (!d || !finVec(d.p) || !(d.e > 0)) continue;
    const dx = d.p.x - p.x,
      dy = d.p.y - p.y,
      dz = d.p.z - p.z;
    const q = (dx * dx + dy * dy + dz * dz) / R2;
    if (q >= 1) continue;
    const s = 1 - q;
    D += d.e * s * s;
  }
  return D;
}

/** New damage list with energy e added at p: merged into a nearby point, capped in length. */
export function addDamage(dmg: readonly DamagePoint[], p: Vec3, e: number, mergeR: number): DamagePoint[] {
  const out: DamagePoint[] = [];
  for (const d of dmg) if (d && finVec(d.p) && d.e > 0 && Number.isFinite(d.e)) out.push({ p: { x: d.p.x, y: d.p.y, z: d.p.z }, e: d.e });
  if (!(e > 0) || !Number.isFinite(e)) return out;
  let bi = -1,
    bd = mergeR * mergeR;
  for (let i = 0; i < out.length; i++) {
    const q = out[i].p;
    const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
    if (dd <= bd) {
      bd = dd;
      bi = i;
    }
  }
  if (bi >= 0) {
    const d = out[bi];
    const s = d.e + e;
    d.p = { x: (d.p.x * d.e + p.x * e) / s, y: (d.p.y * d.e + p.y * e) / s, z: (d.p.z * d.e + p.z * e) / s };
    d.e = s;
  } else out.push({ p: { x: p.x, y: p.y, z: p.z }, e });
  // cap: merge the closest pair until within budget
  while (out.length > K.maxDmgPoints) {
    let a = 0,
      b = 1,
      m = Infinity;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const dd = (out[i].p.x - out[j].p.x) ** 2 + (out[i].p.y - out[j].p.y) ** 2 + (out[i].p.z - out[j].p.z) ** 2;
        if (dd < m) {
          m = dd;
          a = i;
          b = j;
        }
      }
    const A = out[a],
      B = out[b];
    const s = A.e + B.e;
    A.p = { x: (A.p.x * A.e + B.p.x * B.e) / s, y: (A.p.y * A.e + B.p.y * B.e) / s, z: (A.p.z * A.e + B.p.z * B.e) / s };
    A.e = s;
    out.splice(b, 1);
  }
  return out;
}

/** Current dent displacement at p (same falloff as meshgen: depth·(1 − d²/r²)²). */
export function dentDepthAt(dents: readonly Dent[], p: Vec3): number {
  let s = 0;
  for (const d of dents) {
    if (!d || !finVec(d.p) || !(d.r > 0)) continue;
    const q = ((d.p.x - p.x) ** 2 + (d.p.y - p.y) ** 2 + (d.p.z - p.z) ** 2) / (d.r * d.r);
    if (q >= 1) continue;
    const w = 1 - q;
    s += fin(d.depth, 0) * w * w;
  }
  return s;
}

/** Crumple metric of a sheet: Σ depth·r² / (ext0·ext1·ext2). */
export function crumpleMetric(dents: readonly Dent[], ext: readonly number[]): number {
  let s = 0;
  for (const d of dents) if (d && d.r > 0 && d.depth > 0) s += d.depth * d.r * d.r;
  const den = Math.max(1e-12, ext[0] * ext[1] * ext[2]);
  return s / den;
}
