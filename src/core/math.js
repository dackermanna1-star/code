export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : 1);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smoothstep = (t) => t * t * (3 - 2 * t);

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shift angle `a` by multiples of 2π so that it lies closest to `ref`. */
export function nearAngle(a, ref) {
  return ref + wrapAngle(a - ref);
}

/** Exponential smoothing factor for frame-rate independent lerps. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise, deterministic for a seed. Returns ~[-1, 1]. */
export function makeNoise1D(seed = 1) {
  const r = mulberry32(seed);
  const table = new Float32Array(512);
  for (let i = 0; i < 512; i++) table[i] = r() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i & 511];
    const b = table[(i + 1) & 511];
    return a + (b - a) * smoothstep(f);
  };
}

/**
 * Two-bone inverse kinematics.
 * Returns world-space directions of the two segments so that the chain rooted at
 * (sx, sy) reaches toward (tx, ty). `bend` (+1 / -1) chooses which side the middle joint
 * bulges to (counter-clockwise or clockwise from the root→target line).
 */
export function ik2(sx, sy, tx, ty, l1, l2, bend) {
  const dx = tx - sx;
  const dy = ty - sy;
  const d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 1e-3;
  const minD = Math.abs(l1 - l2) + 1e-3;
  const dd = clamp(d, minD, maxD);
  const phi = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1);
  const a = Math.acos(cosA);
  const a1 = phi + bend * a;
  const ex = sx + Math.cos(a1) * l1;
  const ey = sy + Math.sin(a1) * l1;
  const tx2 = sx + Math.cos(phi) * dd;
  const ty2 = sy + Math.sin(phi) * dd;
  const a2 = Math.atan2(ty2 - ey, tx2 - ex);
  return { a1, a2, ex, ey, reach: d <= maxD };
}

export function rotate(x, y, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function formatTime(t) {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
