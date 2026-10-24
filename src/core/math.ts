import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

export function remap(v: number, a0: number, a1: number, b0: number, b1: number): number {
  return lerp(b0, b1, clamp01(invLerp(a0, a1, v)));
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(lambda: number, dt: number): number {
  return 1 - Math.exp(-lambda * dt);
}

export function dampTo(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * damp(lambda, dt);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + angleDiff(current, target) * damp(lambda, dt);
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOutBack(t: number, s = 1.70158): number {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

// ---------- seeded random ----------
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}

export const rng = new Rng((Date.now() ^ 0x5f3759df) >>> 0);

export function rand(a = 0, b = 1): number {
  return a + (b - a) * Math.random();
}

export function randInt(a: number, b: number): number {
  return Math.floor(rand(a, b + 1));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ---------- vector helpers (scratch objects to avoid GC) ----------
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _v4 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion();
export const _q2 = new THREE.Quaternion();
export const _m1 = new THREE.Matrix4();
export const _e1 = new THREE.Euler();

export const UP = new THREE.Vector3(0, 1, 0);
export const FORWARD = new THREE.Vector3(0, 0, -1);

export function randomUnitVector(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const th = Math.random() * TAU;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(th), u, s * Math.sin(th));
}

/** Random direction within a cone around `dir` (unit) with half-angle `spread` (radians). */
export function randomInCone(dir: THREE.Vector3, spread: number, out: THREE.Vector3): THREE.Vector3 {
  const cosA = Math.cos(spread);
  const z = cosA + (1 - cosA) * Math.random();
  const th = Math.random() * TAU;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  // build basis
  const t = Math.abs(dir.y) < 0.99 ? UP : _vX;
  _b1.crossVectors(t, dir).normalize();
  _b2.crossVectors(dir, _b1);
  return out
    .copy(dir)
    .multiplyScalar(z)
    .addScaledVector(_b1, r * Math.cos(th))
    .addScaledVector(_b2, r * Math.sin(th));
}
const _vX = new THREE.Vector3(1, 0, 0);
const _b1 = new THREE.Vector3();
const _b2 = new THREE.Vector3();

export function yawFromDir(x: number, z: number): number {
  // yaw such that forward (0,0,-1) rotated by yaw about Y points to (x,z)
  return Math.atan2(-x, -z);
}

export function dirFromYaw(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

export function distXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distSqXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/** Closest point parameters between segments p1-q1 and p2-q2; returns squared distance. */
export function segmentSegmentDistSq(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
  outC1?: THREE.Vector3,
  outC2?: THREE.Vector3,
): number {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  const EPS = 1e-8;
  if (a <= EPS && e <= EPS) {
    s = t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1x = p1.x + d1x * s, c1y = p1.y + d1y * s, c1z = p1.z + d1z * s;
  const c2x = p2.x + d2x * t, c2y = p2.y + d2y * t, c2z = p2.z + d2z * t;
  if (outC1) outC1.set(c1x, c1y, c1z);
  if (outC2) outC2.set(c2x, c2y, c2z);
  const dx = c1x - c2x, dy = c1y - c2y, dz = c1z - c2z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Ray vs oriented box (box given by inverse world matrix and half extents).
 * Returns entry distance along the (world) ray or -1. Ray dir must be normalized.
 */
export function rayOBB(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  invMatrix: THREE.Matrix4,
  half: THREE.Vector3,
  maxDist: number,
  outLocalPoint?: THREE.Vector3,
  outLocalNormal?: THREE.Vector3,
): number {
  _ro.copy(origin).applyMatrix4(invMatrix);
  _rd.copy(dir).transformDirection(invMatrix); // assumes rigid (no scale) so length stays 1
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 1;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? _ro.x : i === 1 ? _ro.y : _ro.z;
    const d = i === 0 ? _rd.x : i === 1 ? _rd.y : _rd.z;
    const h = i === 0 ? half.x : i === 1 ? half.y : half.z;
    if (Math.abs(d) < 1e-9) {
      if (o < -h || o > h) return -1;
    } else {
      let t1 = (-h - o) / d;
      let t2 = (h - o) / d;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = i;
        sign = s;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  const t = tmin < 0 ? 0 : tmin;
  if (t > maxDist) return -1;
  if (outLocalPoint) outLocalPoint.copy(_ro).addScaledVector(_rd, t);
  if (outLocalNormal) {
    outLocalNormal.set(0, 0, 0);
    if (axis === 0) outLocalNormal.x = sign;
    else if (axis === 1) outLocalNormal.y = sign;
    else if (axis === 2) outLocalNormal.z = sign;
  }
  return t;
}
const _ro = new THREE.Vector3();
const _rd = new THREE.Vector3();

/** Sphere vs OBB: returns penetration (>0 when overlapping) and closest local point. */
export function sphereOBB(
  center: THREE.Vector3,
  radius: number,
  invMatrix: THREE.Matrix4,
  half: THREE.Vector3,
  outLocalPoint?: THREE.Vector3,
): number {
  _ro.copy(center).applyMatrix4(invMatrix);
  const cx = clamp(_ro.x, -half.x, half.x);
  const cy = clamp(_ro.y, -half.y, half.y);
  const cz = clamp(_ro.z, -half.z, half.z);
  const dx = _ro.x - cx, dy = _ro.y - cy, dz = _ro.z - cz;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (outLocalPoint) outLocalPoint.set(cx, cy, cz);
  return radius - d;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
