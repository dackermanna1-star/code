// Small math helpers used throughout the simulation. Angles are radians; yaw 0
// faces +Z and increases toward +X (yaw = atan2(dx, dz)).

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const GRAVITY = 9.81;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => saturate((v - a) / (b - a));

export function smoothstep(e0, e1, x) {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

// Signed shortest rotation from a to b.
export const angleDiff = (a, b) => wrapAngle(b - a);

export function approach(current, target, maxStep) {
  const d = target - current;
  if (d > maxStep) return current + maxStep;
  if (d < -maxStep) return current - maxStep;
  return target;
}

export function approachAngle(current, target, maxStep) {
  const d = angleDiff(current, target);
  if (d > maxStep) return wrapAngle(current + maxStep);
  if (d < -maxStep) return wrapAngle(current - maxStep);
  return target;
}

// Frame-rate independent exponential smoothing factor.
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const yawTo = (dx, dz) => Math.atan2(dx, dz);

export function dist2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distSq2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function distSq3(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return dx * dx + dy * dy + dz * dz;
}

// Parameter t in [0,1] of the point on segment a->b closest to p.
export function segClosestT(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-9) return 0;
  return saturate(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2);
}

export function segPointDistSq(ax, ay, az, bx, by, bz, px, py, pz) {
  const t = segClosestT(ax, ay, az, bx, by, bz, px, py, pz);
  const cx = ax + (bx - ax) * t - px;
  const cy = ay + (by - ay) * t - py;
  const cz = az + (bz - az) * t - pz;
  return cx * cx + cy * cy + cz * cz;
}

// Ray (origin o, direction d not necessarily unit) vs sphere. Returns the
// parametric t of the first hit in [0, maxT] or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT = 1) {
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-12) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= maxT ? t : -1;
}

const _obbOut = { t: 0, axis: 0, sign: 0 };

// Segment p0 + d*t (t in [0,1]) against a box rotated about Y by `yaw`,
// centred at (cx, cy, cz) with half extents (hx, hy, hz). Returns the shared
// result object { t, axis (0=x,1=y,2=z in box space), sign } or null.
export function segOBB(px, py, pz, dx, dy, dz, cx, cy, cz, hx, hy, hz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // World -> box space: rotate by -yaw about Y. Box local +Z is world (sin, 0, cos).
  const rx = px - cx;
  const rz = pz - cz;
  const lx = rx * c - rz * s;
  const lz = rx * s + rz * c;
  const ly = py - cy;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  const ldy = dy;
  let tmin = 0;
  let tmax = 1;
  let axis = -1;
  let sign = 0;
  const o = [lx, ly, lz];
  const d = [ldx, ldy, ldz];
  const h = [hx, hy, hz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < -h[i] || o[i] > h[i]) return null;
    } else {
      const inv = 1 / d[i];
      let t1 = (-h[i] - o[i]) * inv;
      let t2 = (h[i] - o[i]) * inv;
      let sgn = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        sgn = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = i;
        sign = sgn;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  _obbOut.t = tmin;
  _obbOut.axis = axis;
  _obbOut.sign = sign;
  return _obbOut;
}

// Point inside a Y-rotated box (2D footprint test plus height range).
export function pointInOBB2(px, pz, cx, cz, hx, hz, yaw, margin = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const rx = px - cx;
  const rz = pz - cz;
  const lx = rx * c - rz * s;
  const lz = rx * s + rz * c;
  return Math.abs(lx) <= hx + margin && Math.abs(lz) <= hz + margin;
}

// Launch elevation that hits a target `dx` metres away horizontally and `dy`
// metres higher with muzzle speed v (no drag). Returns NaN if out of range.
export function ballisticAngle(v, dx, dy, high = false, g = GRAVITY) {
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return NaN;
  const root = Math.sqrt(disc);
  const a = high ? (v2 + root) / (g * dx) : (v2 - root) / (g * dx);
  return Math.atan(a);
}

// Time for a projectile at speed s to reach a target at relative position
// (px,py,pz) moving with velocity (vx,vy,vz). Returns -1 if unreachable.
export function interceptTime(px, py, pz, vx, vy, vz, s) {
  const a = vx * vx + vy * vy + vz * vz - s * s;
  const b = 2 * (px * vx + py * vy + pz * vz);
  const c = px * px + py * py + pz * pz;
  if (Math.abs(a) < 1e-6) {
    return Math.abs(b) < 1e-6 ? -1 : Math.max(-c / b, -1);
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const r = Math.sqrt(disc);
  const t1 = (-b - r) / (2 * a);
  const t2 = (-b + r) / (2 * a);
  const t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : -1;
}

// Rotate a unit direction randomly within a cone of half-angle `spread` (radians),
// using a gaussian-ish distribution. Writes to `out` ({x,y,z}).
export function scatterDir(dx, dy, dz, spread, rnd, out) {
  // Build an orthonormal basis around d.
  let ux;
  let uy;
  let uz;
  if (Math.abs(dy) < 0.99) {
    ux = -dz;
    uy = 0;
    uz = dx;
  } else {
    ux = 1;
    uy = 0;
    uz = 0;
  }
  let l = Math.hypot(ux, uy, uz);
  ux /= l;
  uy /= l;
  uz /= l;
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;
  const r = spread * Math.sqrt(-2 * Math.log(Math.max(1e-6, rnd.next()))) * 0.5;
  const th = rnd.next() * TAU;
  const a = Math.tan(Math.min(r, 1.2));
  const ca = Math.cos(th) * a;
  const sa = Math.sin(th) * a;
  out.x = dx + ux * ca + vx * sa;
  out.y = dy + uy * ca + vy * sa;
  out.z = dz + uz * ca + vz * sa;
  l = Math.hypot(out.x, out.y, out.z);
  out.x /= l;
  out.y /= l;
  out.z /= l;
  return out;
}

export function normalize3(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l > 1e-9) {
    v.x /= l;
    v.y /= l;
    v.z /= l;
  }
  return v;
}

// Military-style compass bearing text for a yaw (0 = north = +Z... map north is -Z, see describeBearing).
export function bearingDegrees(dx, dz) {
  // Map north is -Z (top of the minimap), east is +X.
  let deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

export function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

const _ss = { s: 0, t: 0, d2: 0 };

// Closest points between segments P(s) = p1 + s*(q1-p1) and Q(t) = p2 + t*(q2-p2),
// s,t in [0,1]. Returns shared { s, t, d2 } (squared distance).
export function segSegClosest(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s;
  let t;
  if (a <= 1e-9 && e <= 1e-9) {
    s = 0;
    t = 0;
  } else if (a <= 1e-9) {
    s = 0;
    t = saturate(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      t = 0;
      s = saturate(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? saturate((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = saturate(-c / a);
      } else if (t > 1) {
        t = 1;
        s = saturate((b - c) / a);
      }
    }
  }
  const cx = p1x + d1x * s - (p2x + d2x * t);
  const cy = p1y + d1y * s - (p2y + d2y * t);
  const cz = p1z + d1z * s - (p2z + d2z * t);
  _ss.s = s;
  _ss.t = t;
  _ss.d2 = cx * cx + cy * cy + cz * cz;
  return _ss;
}
