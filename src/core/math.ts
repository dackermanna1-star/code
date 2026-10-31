import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const remap01 = (a: number, b: number, v: number) => clamp01(invLerp(a, b, v));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t: number) => {
  t = clamp01(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Wrap angle to [-PI, PI]. */
export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const angleDiff = (a: number, b: number) => wrapAngle(b - a);
export const lerpAngle = (a: number, b: number, t: number) => a + angleDiff(a, b) * t;

/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));
export const dampAngle = (current: number, target: number, lambda: number, dt: number) =>
  current + angleDiff(current, target) * (1 - Math.exp(-lambda * dt));

/** Critically damped spring (Holden). halflife in seconds. Mutates state arrays [x, v]. */
export function springDamper(state: { x: number; v: number }, target: number, halflife: number, dt: number) {
  const y = (4 * 0.69314718056) / (halflife + 1e-5) / 2;
  const j0 = state.x - target;
  const j1 = state.v + j0 * y;
  const eydt = Math.exp(-y * dt);
  state.x = eydt * (j0 + j1 * dt) + target;
  state.v = eydt * (state.v - j1 * y * dt);
}

/** Decay offset & velocity toward zero (inertialization). */
export function decaySpring(x: number, v: number, halflife: number, dt: number): [number, number] {
  const y = (4 * 0.69314718056) / (halflife + 1e-5) / 2;
  const j1 = v + x * y;
  const eydt = Math.exp(-y * dt);
  return [eydt * (x + j1 * dt), eydt * (v - j1 * y * dt)];
}

// ---------------------------------------------------------------- easing
export type EaseName =
  | 'linear' | 'smooth' | 'in' | 'out' | 'inout' | 'in3' | 'out3' | 'snap' | 'back' | 'hold' | 'expoIn';

export function ease(name: EaseName | undefined, t: number): number {
  t = clamp01(t);
  switch (name) {
    case undefined:
    case 'smooth':
    case 'inout':
      return t * t * (3 - 2 * t);
    case 'linear':
      return t;
    case 'in':
      return t * t;
    case 'in3':
      return t * t * t;
    case 'expoIn':
      return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'out3':
      return 1 - Math.pow(1 - t, 3);
    case 'snap':
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case 'back': {
      const c1 = 1.70158 * 0.6;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case 'hold':
      return t < 1 ? 0 : 1;
  }
  return t;
}

/** Uniform Catmull-Rom between p1 and p2. */
export const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

// ---------------------------------------------------------------- random
export class RNG {
  private s: number;
  constructor(seed = 1234567) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    // xorshift32
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  chance(p: number) {
    return this.next() < p;
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}
export const rng = new RNG((Date.now() & 0xffffff) | 1);
export const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length) % arr.length];
export const chance = (p: number) => Math.random() < p;

/** Weighted pick avoiding recently used keys. */
export function weightedPick<T>(items: T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------- vectors / quats
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _v4 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion();
export const _q2 = new THREE.Quaternion();
export const _m1 = new THREE.Matrix4();
export const _e1 = new THREE.Euler();

const _ex = new THREE.Vector3();
const _ey = new THREE.Vector3();
const _ez = new THREE.Vector3();
const _bm = new THREE.Matrix4();

/** Quaternion whose local X maps to `x` direction, and Y as close as possible to `upHint` (both world). */
export function basisFromXY(x: THREE.Vector3, upHint: THREE.Vector3, out: THREE.Quaternion) {
  _ex.copy(x).normalize();
  _ez.crossVectors(_ex, upHint);
  if (_ez.lengthSq() < 1e-8) {
    _ez.set(0, 0, 1).cross(_ex);
    if (_ez.lengthSq() < 1e-8) _ez.set(1, 0, 0).cross(_ex);
  }
  _ez.normalize();
  _ey.crossVectors(_ez, _ex).normalize();
  _bm.makeBasis(_ex, _ey, _ez);
  return out.setFromRotationMatrix(_bm);
}

/** Quaternion from a primary axis (mapped from restPrimary) and a secondary hint (mapped from restSecondary). */
export function alignAxes(
  restPrimary: THREE.Vector3,
  restSecondary: THREE.Vector3,
  primary: THREE.Vector3,
  secondaryHint: THREE.Vector3,
  out: THREE.Quaternion,
) {
  // R = B(primary, secondary) * B(restPrimary, restSecondary)^-1
  basisFromXY(restPrimary, restSecondary, _q1);
  basisFromXY(primary, secondaryHint, _q2);
  return out.copy(_q2).multiply(_q1.invert());
}

export function eulerDeg(p: number, y: number, r: number, out: THREE.Quaternion, order: THREE.EulerOrder = 'YXZ') {
  _e1.set(p * DEG, y * DEG, r * DEG, order);
  return out.setFromEuler(_e1);
}

/** Scaled angle-axis (log map) of a quaternion -> vector. */
export function quatToScaledAxis(q: THREE.Quaternion, out: THREE.Vector3) {
  let { x, y, z, w } = q;
  if (w < 0) {
    x = -x; y = -y; z = -z; w = -w;
  }
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-8) return out.set(x * 2, y * 2, z * 2);
  const angle = 2 * Math.atan2(len, w);
  const s = angle / len;
  return out.set(x * s, y * s, z * s);
}
export function scaledAxisToQuat(v: THREE.Vector3, out: THREE.Quaternion) {
  const angle = v.length();
  if (angle < 1e-8) return out.set(v.x * 0.5, v.y * 0.5, v.z * 0.5, 1).normalize();
  const h = angle * 0.5;
  const s = Math.sin(h) / angle;
  return out.set(v.x * s, v.y * s, v.z * s, Math.cos(h));
}

export const yawToQuat = (yaw: number, out: THREE.Quaternion) => out.setFromAxisAngle(_yAxis, yaw);
const _yAxis = new THREE.Vector3(0, 1, 0);
export const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const X_AXIS = new THREE.Vector3(1, 0, 0);
export const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Rotate (x,z) by yaw (character faces +Z at yaw 0, +X is character's left). */
export function rotY(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}
/** yaw such that +Z rotated by yaw points along (dx, dz). */
export const yawFromDir = (dx: number, dz: number) => Math.atan2(dx, dz);

export function hash11(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function valueNoise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash11(i + seed * 17.13);
  const b = hash11(i + 1 + seed * 17.13);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
