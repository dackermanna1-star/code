import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
export const chance = (p: number) => Math.random() < p;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const sign = (v: number) => (v < 0 ? -1 : 1);
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
export const angleLerp = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => clamp01(t) ** 3;
export const easeInOutCubic = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t: number) => {
  t = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** 0 -> 1 -> 0 bump over [a, b]. */
export const bump = (t: number, a: number, b: number) => {
  if (t <= a || t >= b) return 0;
  const x = (t - a) / (b - a);
  return Math.sin(x * Math.PI);
};
/** Piecewise ramp: 0 before a, rises to 1 at b, holds until c, falls to 0 at d. */
export const ramp4 = (t: number, a: number, b: number, c: number, d: number) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeInOutCubic((t - a) / (b - a));
  if (t <= c) return 1;
  return 1 - easeInOutCubic((t - c) / (d - c));
};

/** Seeded PRNG (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 2D (0..1). */
export function vnoise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm2(x: number, y: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise2(x * f, y * f);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

/** Critically damped-ish spring for scalar values. */
export class Spring {
  x = 0;
  v = 0;
  constructor(public k = 120, public d = 14, public target = 0) {}
  update(dt: number) {
    const a = -this.k * (this.x - this.target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(impulse: number) {
    this.v += impulse;
  }
}

export class Spring3 {
  x = new THREE.Vector3();
  v = new THREE.Vector3();
  constructor(public k = 120, public d = 14) {}
  update(dt: number) {
    // semi-implicit euler, sub-stepped for stability with stiff springs
    const steps = dt > 1 / 90 ? 2 : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.v.x += (-this.k * this.x.x - this.d * this.v.x) * h;
      this.v.y += (-this.k * this.x.y - this.d * this.v.y) * h;
      this.v.z += (-this.k * this.x.z - this.d * this.v.z) * h;
      this.x.addScaledVector(this.v, h);
    }
    return this.x;
  }
  kick(x: number, y: number, z: number) {
    this.v.x += x;
    this.v.y += y;
    this.v.z += z;
  }
  reset() {
    this.x.set(0, 0, 0);
    this.v.set(0, 0, 0);
  }
}

// Scratch objects (never hold references across calls)
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _v4 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion();
export const _q2 = new THREE.Quaternion();
export const _m1 = new THREE.Matrix4();
export const _m2 = new THREE.Matrix4();
export const _e1 = new THREE.Euler();
export const _c1 = new THREE.Color();

/** Ray vs oriented box given as inverse matrix. Returns t or -1. halfExtents in local space. */
export function rayOBB(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  inv: ArrayLike<number>, o: number,
  hx: number, hy: number, hz: number,
  cx: number, cy: number, cz: number,
  maxT: number,
): number {
  // transform ray into local space (inv is column-major 4x4 at offset o)
  const lox = inv[o] * ox + inv[o + 4] * oy + inv[o + 8] * oz + inv[o + 12] - cx;
  const loy = inv[o + 1] * ox + inv[o + 5] * oy + inv[o + 9] * oz + inv[o + 13] - cy;
  const loz = inv[o + 2] * ox + inv[o + 6] * oy + inv[o + 10] * oz + inv[o + 14] - cz;
  const ldx = inv[o] * dx + inv[o + 4] * dy + inv[o + 8] * dz;
  const ldy = inv[o + 1] * dx + inv[o + 5] * dy + inv[o + 9] * dz;
  const ldz = inv[o + 2] * dx + inv[o + 6] * dy + inv[o + 10] * dz;
  let tmin = 0;
  let tmax = maxT;
  // x slab
  if (Math.abs(ldx) < 1e-9) {
    if (lox < -hx || lox > hx) return -1;
  } else {
    let t1 = (-hx - lox) / ldx;
    let t2 = (hx - lox) / ldx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(ldy) < 1e-9) {
    if (loy < -hy || loy > hy) return -1;
  } else {
    let t1 = (-hy - loy) / ldy;
    let t2 = (hy - loy) / ldy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(ldz) < 1e-9) {
    if (loz < -hz || loz > hz) return -1;
  } else {
    let t1 = (-hz - loz) / ldz;
    let t2 = (hz - loz) / ldz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Ray vs sphere: returns entry t or -1 (origin inside counts as 0). */
export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  const t1 = tca + thc;
  if (t1 < 0) return -1;
  return t0 < 0 ? 0 : t0;
}

/** Closest distance squared between point and segment (2D XZ). */
export function distSqPointSeg2(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const len = abx * abx + abz * abz;
  let t = len > 0 ? (apx * abx + apz * abz) / len : 0;
  t = clamp01(t);
  const qx = ax + abx * t - px, qz = az + abz * t - pz;
  return qx * qx + qz * qz;
}

export function formatMoney(n: number) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}
