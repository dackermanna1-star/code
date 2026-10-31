/** Small math toolkit shared by simulation and presentation. */

export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const vcopy = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const vadd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vsub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vscale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const vlen = (a: Vec2): number => Math.hypot(a.x, a.y);
export const vdist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const vdot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const vlerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function vnorm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}
export function vrot(a: Vec2, ang: number): Vec2 {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const remap = (a: number, b: number, c: number, d: number, v: number): number => lerp(c, d, clamp01(invLerp(a, b, v)));
export const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}
/** Shortest-path angle interpolation. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Critically damped spring (good for cameras). Mutates the state object. */
export interface Spring {
  value: number;
  velocity: number;
}
export function springStep(s: Spring, target: number, omega: number, dt: number): void {
  // Exact solution for critically damped harmonic oscillator.
  const x = s.value - target;
  const exp = Math.exp(-omega * dt);
  const temp = (s.velocity + omega * x) * dt;
  s.velocity = (s.velocity - omega * temp) * exp;
  s.value = target + (x + temp) * exp;
}

/* ----------------------------------------------------------- easing ---- */
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  /** Snappy "anime strike" curve: holds, then snaps. */
  snap: (t: number) => (t < 0.15 ? 0 : 1 - Math.pow(1 - (t - 0.15) / 0.85, 5)),
};
export type EaseName = keyof typeof ease;

/* ------------------------------------------------------- geometry ---- */

/** Squared distance between segments p1-q1 and p2-q2. */
export function segSegDistSq(
  p1x: number, p1y: number, q1x: number, q1y: number,
  p2x: number, p2y: number, q2x: number, q2y: number,
): number {
  const d1x = q1x - p1x, d1y = q1y - p1y;
  const d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s: number, t: number;
  const EPS = 1e-9;
  if (a <= EPS && e <= EPS) {
    return rx * rx + ry * ry;
  }
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y;
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
  const cx = p1x + d1x * s - (p2x + d2x * t);
  const cy = p1y + d1y * s - (p2y + d2y * t);
  return cx * cx + cy * cy;
}

/** Squared distance from point to segment. */
export function pointSegDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp01(t);
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

/** Capsule: segment (ax,ay)-(bx,by) with radius r. */
export interface Capsule {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}
export function capsuleOverlap(c1: Capsule, c2: Capsule): boolean {
  const rr = c1.r + c2.r;
  return segSegDistSq(c1.ax, c1.ay, c1.bx, c1.by, c2.ax, c2.ay, c2.bx, c2.by) <= rr * rr;
}
export function capsuleCircle(c: Capsule, x: number, y: number, r: number): boolean {
  const rr = c.r + r;
  return pointSegDistSq(x, y, c.ax, c.ay, c.bx, c.by) <= rr * rr;
}
export function capsuleCenter(c: Capsule): Vec2 {
  return { x: (c.ax + c.bx) / 2, y: (c.ay + c.by) / 2 };
}

/* --------------------------------------------------------- noise ---- */

/** Cheap smooth 1D value noise in [-1, 1]. Deterministic. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i + seed * 131), hash1(i + 1 + seed * 131), u) * 2 - 1;
}
function hash1(n: number): number {
  let h = Math.imul(n | 0, 374761393) ^ 0x27d4eb2d;
  h = Math.imul(h ^ (h >>> 15), 668265263);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

/** Fractal 1D noise. */
export function fbm1(x: number, octaves = 4, seed = 0): number {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * noise1(x * f, seed + i * 17);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
