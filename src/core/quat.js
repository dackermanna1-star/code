// Minimal quaternion / vector math on plain arrays (engine-free). Quaternions are [x,y,z,w],
// standard Hamilton products; same conventions as Babylon.Quaternion.
export const qIdentity = () => [0, 0, 0, 1];
export function qSet(o, x, y, z, w) { o[0] = x; o[1] = y; o[2] = z; o[3] = w; return o; }
export function qCopy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; }
export function qMul(o, a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}
export function qConj(o, a) { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; }
export function qNorm(o, a = o) {
  const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
  o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l; return o;
}
export function qAxisAngle(o, ax, ay, az, ang) {
  const h = ang / 2, s = Math.sin(h);
  o[0] = ax * s; o[1] = ay * s; o[2] = az * s; o[3] = Math.cos(h); return o;
}
/** Babylon's RotationYawPitchRoll (roll about z, then pitch about x, then yaw about y). */
export function qYPR(o, yaw, pitch, roll) {
  const hr = roll / 2, hp = pitch / 2, hy = yaw / 2;
  const sr = Math.sin(hr), cr = Math.cos(hr), sp = Math.sin(hp), cp = Math.cos(hp), sy = Math.sin(hy), cy = Math.cos(hy);
  o[0] = cy * sp * cr + sy * cp * sr;
  o[1] = sy * cp * cr - cy * sp * sr;
  o[2] = cy * cp * sr - sy * sp * cr;
  o[3] = cy * cp * cr + sy * sp * sr;
  return o;
}
export function qSlerp(o, a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0, k1;
  if (cos > 0.9995) { k0 = 1 - t; k1 = t; }
  else { const th = Math.acos(cos), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  o[0] = a[0] * k0 + bx * k1; o[1] = a[1] * k0 + by * k1; o[2] = a[2] * k0 + bz * k1; o[3] = a[3] * k0 + bw * k1;
  return qNorm(o);
}
/** Rotate vector v by q into out. */
export function qRotate(out, q, v) {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}
/** Quaternion from an orthonormal basis (columns x, y, z). */
export function qFromBasis(o, x, y, z) {
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); o[3] = 0.25 / s; o[0] = (m21 - m12) * s; o[1] = (m02 - m20) * s; o[2] = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); o[3] = (m21 - m12) / s; o[0] = 0.25 * s; o[1] = (m01 + m10) / s; o[2] = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); o[3] = (m02 - m20) / s; o[0] = (m01 + m10) / s; o[1] = 0.25 * s; o[2] = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); o[3] = (m10 - m01) / s; o[0] = (m02 + m20) / s; o[1] = (m12 + m21) / s; o[2] = 0.25 * s; }
  return qNorm(o);
}
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export function vSub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
export function vAdd(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
export function vScale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; }
export function vLen(a) { return Math.hypot(a[0], a[1], a[2]); }
export function vNorm(o, a = o) { const l = vLen(a) || 1; o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o; }
export function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function vCross(o, a, b) { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; }
export function vLerp(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; }
