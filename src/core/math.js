// Small math + random helpers shared across the engine.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export function dampAngle(a, b, lambda, dt) {
  const d = wrapAngle(b - a);
  return a + d * (1 - Math.exp(-lambda * dt));
}

// Deterministic PRNG (mulberry32) so procedural content is stable between runs.
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

export const rand = Math.random;
export const randRange = (a, b) => a + (b - a) * Math.random();
export const randInt = (a, b) => Math.floor(a + (b - a + 1) * Math.random());
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

export function shuffle(arr, r = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// Random unit vector inside a cone around dir (in radians).
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
export function coneSpread(dir, angle, out = new THREE.Vector3(), r1 = Math.random(), r2 = Math.random()) {
  if (angle <= 0) return out.copy(dir);
  // Build basis.
  const up = Math.abs(dir.y) < 0.99 ? _tmpA.set(0, 1, 0) : _tmpA.set(1, 0, 0);
  const right = _tmpB.crossVectors(dir, up).normalize();
  const upv = up.crossVectors(right, dir).normalize();
  // Gaussian-ish distribution (more hits near center).
  const rr = Math.sqrt(r1) * Math.tan(angle) * (0.35 + 0.65 * Math.sqrt(r1));
  const th = r2 * TAU;
  out.copy(dir).addScaledVector(right, Math.cos(th) * rr).addScaledVector(upv, Math.sin(th) * rr).normalize();
  return out;
}

export function distSq3(ax, ay, az, bx, by, bz) {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}
export function distXZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Closest distance from point P to segment AB (squared) + param t.
export function pointSegDistSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t - px, cy = ay + aby * t - py, cz = az + abz * t - pz;
  return cx * cx + cy * cy + cz * cz;
}

// Ray vs capsule (segment A-B radius r). Returns distance along ray or -1.
// Ray direction must be normalized.
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  // Approximate via closest-approach between ray and segment, then refine with sphere test.
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = ox - ax, wy = oy - ay, wz = oz - az;
  const a = 1; // d.d
  const b = dx * ux + dy * uy + dz * uz;
  const c = ux * ux + uy * uy + uz * uz;
  const d = dx * wx + dy * wy + dz * wz;
  const e = ux * wx + uy * wy + uz * wz;
  const den = a * c - b * b;
  let sc, tc;
  if (den < 1e-8) {
    sc = 0;
    tc = c > 1e-8 ? e / c : 0;
  } else {
    sc = (b * e - c * d) / den;
    tc = (a * e - b * d) / den;
  }
  tc = clamp(tc, 0, 1);
  // Closest point on segment
  const qx = ax + ux * tc, qy = ay + uy * tc, qz = az + uz * tc;
  // Sphere intersection at q
  const mx = ox - qx, my = oy - qy, mz = oz - qz;
  const bb = mx * dx + my * dy + mz * dz;
  const cc = mx * mx + my * my + mz * mz - r * r;
  if (cc > 0 && bb > 0) return -1;
  const disc = bb * bb - cc;
  if (disc < 0) return -1;
  const t = -bb - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}

// Ray vs sphere
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}

export const V3 = () => new THREE.Vector3();
export const UP = new THREE.Vector3(0, 1, 0);

// Easing
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Value noise for procedural animation jitter
export function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
