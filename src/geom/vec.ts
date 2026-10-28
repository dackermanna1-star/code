// Minimal pure 3D math used by engine-agnostic modules (geometry, fracture, damage model).
// Babylon's Vector3/Quaternion are structurally compatible with Vec3/Quat (x,y,z[,w]) so
// engine code can pass them in directly. Functions never mutate inputs unless named *To/*InPlace.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Rigid transform: rotate by q, then translate by p. */
export interface Xform {
  p: Vec3;
  q: Quat;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const vclone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const vset = (o: Vec3, x: number, y: number, z: number): Vec3 => {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
};
export const vcopy = (o: Vec3, a: Vec3): Vec3 => {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  return o;
};
export const vadd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vmul = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z });
export const vaddScaled = (a: Vec3, b: Vec3, s: number): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vcross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const vlen = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vlenSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const vdist = (a: Vec3, b: Vec3): number => Math.sqrt(vdistSq(a, b));
export const vdistSq = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
export const vnorm = (a: Vec3): Vec3 => {
  const l = vlen(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
};
export const vlerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const vneg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });
export const vmin = (a: Vec3, b: Vec3): Vec3 => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) });
export const vmax = (a: Vec3, b: Vec3): Vec3 => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) });
export const vequals = (a: Vec3, b: Vec3, eps = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;

/** Any unit vector perpendicular to n (n must be unit length). */
export const vperp = (n: Vec3): Vec3 => {
  const a = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  return vnorm(vcross(n, a));
};

// ---------------------------------------------------------------- quaternions
export const qident = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });
export const qclone = (q: Quat): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });
export const qaxisAngle = (axis: Vec3, angle: number): Quat => {
  const a = vnorm(axis);
  const s = Math.sin(angle / 2);
  return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(angle / 2) };
};
/** Hamilton product: applying the result equals applying b first, then a. */
export const qmul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
export const qconj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const qnorm = (q: Quat): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};
/** Rotate vector v by unit quaternion q. */
export const qrot = (q: Quat, v: Vec3): Vec3 => {
  // t = 2 * cross(q.xyz, v); v' = v + w*t + cross(q.xyz, t)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
};
/** Euler (radians) → quaternion, applying yaw (Y), then pitch (X), then roll (Z) like Babylon's RotationYawPitchRoll. */
export const qeuler = (x: number, y: number, z: number): Quat => {
  const qy = qaxisAngle({ x: 0, y: 1, z: 0 }, y);
  const qx = qaxisAngle({ x: 1, y: 0, z: 0 }, x);
  const qz = qaxisAngle({ x: 0, y: 0, z: 1 }, z);
  return qmul(qy, qmul(qx, qz));
};

// ---------------------------------------------------------------- transforms
export const xident = (): Xform => ({ p: v3(), q: qident() });
export const xform = (p: Vec3, q: Quat = qident()): Xform => ({ p: vclone(p), q: qclone(q) });
export const xapply = (t: Xform, v: Vec3): Vec3 => vadd(qrot(t.q, v), t.p);
export const xapplyDir = (t: Xform, v: Vec3): Vec3 => qrot(t.q, v);
/** a∘b : apply b first, then a. */
export const xmul = (a: Xform, b: Xform): Xform => ({ p: xapply(a, b.p), q: qmul(a.q, b.q) });
export const xinv = (t: Xform): Xform => {
  const qi = qconj(t.q);
  return { p: vneg(qrot(qi, t.p)), q: qi };
};

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
