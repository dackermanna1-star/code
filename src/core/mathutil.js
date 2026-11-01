// Small math helpers shared by every system. Conventions:
//  - World units are metres, +Y is up, +X east, +Z south.
//  - A yaw of 0 faces +Z; forward vector = (sin(yaw), 0, cos(yaw)).
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, clamp01(invLerp(a0, a1, v)));
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const angleDiff = (from, to) => wrapAngle(to - from);
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
export function approachAngle(a, b, maxStep) {
  const d = angleDiff(a, b);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}
export function approach(v, target, maxStep) {
  return v < target ? Math.min(v + maxStep, target) : Math.max(v - maxStep, target);
}
export const yawTo = (dx, dz) => Math.atan2(dx, dz);
export const dist2 = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
export const len2 = (x, z) => Math.sqrt(x * x + z * z);

/** Angle (radians, 0..PI) between a facing yaw and the direction to a point. */
export function facingAngleTo(yaw, fx, fz, tx, tz) {
  return Math.abs(angleDiff(yaw, yawTo(tx - fx, tz - fz)));
}

/** Closest point on an axis-aligned rectangle to (px,pz). */
export function closestOnRect(px, pz, minX, minZ, maxX, maxZ) {
  return [clamp(px, minX, maxX), clamp(pz, minZ, maxZ)];
}

export function formatClock(minutes) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
