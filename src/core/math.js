// Small math toolkit shared by every system. Pure functions, no allocation in hot paths.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function invLerp(a, b, v) {
  if (a === b) return v >= b ? 1 : 0;
  return clamp01((v - a) / (b - a));
}

export function remap(v, a, b, c, d) {
  return lerp(c, d, invLerp(a, b, v));
}

export function smoothstep(a, b, v) {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
}

// Frame-rate independent exponential smoothing.
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  return Math.max(v - delta, target);
}

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function sign(v) {
  return v < 0 ? -1 : 1;
}

export function len(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

// Squared distance from point P to segment AB.
export function segPointDist2(ax, ay, bx, by, px, py) {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 1e-9 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t - px;
  const cy = ay + aby * t - py;
  return cx * cx + cy * cy;
}

function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// Squared distance between segments AB and CD.
export function segSegDist2(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    segPointDist2(ax, ay, bx, by, cx, cy),
    segPointDist2(ax, ay, bx, by, dx, dy),
    segPointDist2(cx, cy, dx, dy, ax, ay),
    segPointDist2(cx, cy, dx, dy, bx, by),
  );
}

// Unity-style critically damped spring. State lives in `s` = { v }.
export function smoothDamp(cur, target, s, smoothTime, dt, maxSpeed = Infinity) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = cur - target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const t = cur - change;
  const temp = (s.v + omega * change) * dt;
  s.v = (s.v - omega * temp) * exp;
  let out = t + (change + temp) * exp;
  if (target - cur > 0 === out > target) {
    out = target;
    s.v = (out - target) / dt;
  }
  return out;
}

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => {
    const u = t - 1;
    return u * u * u + 1;
  },
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t) => {
    const c1 = 1.70158;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// Cheap smooth 1D value noise in [-1, 1], used for camera shake and flicker.
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}
