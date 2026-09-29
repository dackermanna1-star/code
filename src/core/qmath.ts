/** Allocation-free quaternion/vector helpers on typed arrays (x, y, z, w). */

export function qFromEuler(out: Float32Array | number[], o: number, x: number, y: number, z: number) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 - s1 * s2 * s3;
}

/** out = a * b */
export function qMul(out: Float32Array | number[], o: number, a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[o] = ax * bw + aw * bx + ay * bz - az * by;
  out[o + 1] = ay * bw + aw * by + az * bx - ax * bz;
  out[o + 2] = az * bw + aw * bz + ax * by - ay * bx;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Rotate vector (vx,vy,vz) by quaternion q at qo; writes into out[o..o+2]. */
export function qRot(out: Float32Array | number[], o: number, q: ArrayLike<number>, qo: number, vx: number, vy: number, vz: number) {
  const qx = q[qo], qy = q[qo + 1], qz = q[qo + 2], qw = q[qo + 3];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[o] = vx + qw * tx + (qy * tz - qz * ty);
  out[o + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[o + 2] = vz + qw * tz + (qx * ty - qy * tx);
}

/** Inverse-rotate (conjugate) vector by quaternion. */
export function qRotInv(out: Float32Array | number[], o: number, q: ArrayLike<number>, qo: number, vx: number, vy: number, vz: number) {
  const qx = -q[qo], qy = -q[qo + 1], qz = -q[qo + 2], qw = q[qo + 3];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[o] = vx + qw * tx + (qy * tz - qz * ty);
  out[o + 1] = vy + qw * ty + (qz * tx - qx * tz);
  out[o + 2] = vz + qw * tz + (qx * ty - qy * tx);
}

export function qSlerp(out: Float32Array | number[], o: number, a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, t: number) {
  let ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let k0: number, k1: number;
  if (cos > 0.9995) {
    k0 = 1 - t;
    k1 = t;
  } else {
    const sin = Math.sqrt(1 - cos * cos);
    const ang = Math.atan2(sin, cos);
    k0 = Math.sin((1 - t) * ang) / sin;
    k1 = Math.sin(t * ang) / sin;
  }
  let x = ax * k0 + bx * k1, y = ay * k0 + by * k1, z = az * k0 + bz * k1, w = aw * k0 + bw * k1;
  const l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l;
  out[o + 1] = y / l;
  out[o + 2] = z / l;
  out[o + 3] = w / l;
  void ax; void ay; void az; void aw;
}

export function qYaw(out: Float32Array | number[], o: number, yaw: number) {
  out[o] = 0;
  out[o + 1] = Math.sin(yaw / 2);
  out[o + 2] = 0;
  out[o + 3] = Math.cos(yaw / 2);
}
