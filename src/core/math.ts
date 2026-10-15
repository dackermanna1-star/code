import * as THREE from 'three';

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v: number, a0: number, a1: number, b0: number, b1: number) => lerp(b0, b1, clamp(invLerp(a0, a1, v), 0, 1));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** Frame-rate independent exponential smoothing factor: lerp(a, b, damp(lambda, dt)). */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed difference b - a in radians. */
export const angleDiff = (a: number, b: number) => wrapAngle(b - a);

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * t;
}

/** Direction vector for yaw/pitch (yaw 0 = -Z north, +yaw = turn left; +pitch = up). */
export function dirFromYawPitch(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

/** Yaw that looks along the XZ direction (dx, dz). */
export function yawFromDir(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Closest distance between segment p→q and segment a→b; returns params via out. */
export function segmentSegmentDistSq(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): { d2: number; s: number; t: number } {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s: number, t: number;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t);
  const cy = p1.y + d1y * s - (p2.y + d2y * t);
  const cz = p1.z + d1z * s - (p2.z + d2z * t);
  return { d2: cx * cx + cy * cy + cz * cz, s, t };
}

/**
 * Ray vs capsule (segment a→b, radius r). Returns distance along the ray or -1.
 * `dir` must be normalized.
 */
export function rayCapsule(
  ro: THREE.Vector3,
  dir: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
): number {
  // Based on Inigo Quilez's capsule intersection.
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const oax = ro.x - a.x, oay = ro.y - a.y, oaz = ro.z - a.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * dir.x + bay * dir.y + baz * dir.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dir.x * oax + dir.y * oay + dir.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard;
  let B = baba * rdoa - baoa * bard;
  let C = baba * oaoa - baoa * baoa - r * r * baba;
  let h = B * B - A * C;
  if (h >= 0 && A > 1e-12) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : -1;
    // caps
    const ocx = y <= 0 ? oax : ro.x - b.x;
    const ocy = y <= 0 ? oay : ro.y - b.y;
    const ocz = y <= 0 ? oaz : ro.z - b.z;
    B = dir.x * ocx + dir.y * ocy + dir.z * ocz;
    C = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    h = B * B - C;
    if (h > 0) {
      const tt = -B - Math.sqrt(h);
      return tt >= 0 ? tt : -1;
    }
    return -1;
  }
  // ray parallel to the axis: test the end spheres
  let best = -1;
  for (const cpt of [a, b]) {
    const ocx = ro.x - cpt.x, ocy = ro.y - cpt.y, ocz = ro.z - cpt.z;
    const bb = dir.x * ocx + dir.y * ocy + dir.z * ocz;
    const cc = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    const hh = bb * bb - cc;
    if (hh > 0) {
      const tt = -bb - Math.sqrt(hh);
      if (tt >= 0 && (best < 0 || tt < best)) best = tt;
    }
  }
  return best;
}
