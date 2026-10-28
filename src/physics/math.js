// Allocation-free vector / quaternion / matrix helpers used by the physics engine.
// All mutating methods operate in place and return `this` so they can be chained.

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone() {
    return new Vec3(this.x, this.y, this.z);
  }

  setZero() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }

  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  scale(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  addScaled(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v) {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  normalize() {
    const l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    if (l > 1e-12) {
      const inv = 1 / l;
      this.x *= inv;
      this.y *= inv;
      this.z *= inv;
    }
    return this;
  }

  distanceTo(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  distanceToSq(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  lerp(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  lerpVectors(a, b, t) {
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    this.z = a.z + (b.z - a.z) * t;
    return this;
  }

  // Rotate this vector by unit quaternion q.
  applyQuat(q) {
    const x = this.x, y = this.y, z = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    // v' = v + w * t + cross(q.xyz, t)
    this.x = x + qw * tx + (qy * tz - qz * ty);
    this.y = y + qw * ty + (qz * tx - qx * tz);
    this.z = z + qw * tz + (qx * ty - qy * tx);
    return this;
  }

  // Rotate by the inverse of unit quaternion q.
  applyQuatInv(q) {
    const x = this.x, y = this.y, z = this.z;
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + (qy * tz - qz * ty);
    this.y = y + qw * ty + (qz * tx - qx * tz);
    this.z = z + qw * tz + (qx * ty - qy * tx);
    return this;
  }

  // this = M * this for a 3x3 row-major matrix stored in a flat array.
  applyMat3(m) {
    const x = this.x, y = this.y, z = this.z;
    this.x = m[0] * x + m[1] * y + m[2] * z;
    this.y = m[3] * x + m[4] * y + m[5] * z;
    this.z = m[6] * x + m[7] * y + m[8] * z;
    return this;
  }

  // Any unit vector perpendicular to this one (this must be normalized).
  anyPerpendicular(out) {
    if (Math.abs(this.x) < 0.57) {
      out.set(0, this.z, -this.y);
    } else {
      out.set(this.y, -this.x, 0);
    }
    return out.normalize();
  }

  toArray(arr = [], offset = 0) {
    arr[offset] = this.x;
    arr[offset + 1] = this.y;
    arr[offset + 2] = this.z;
    return arr;
  }

  fromArray(arr, offset = 0) {
    this.x = arr[offset];
    this.y = arr[offset + 1];
    this.z = arr[offset + 2];
    return this;
  }

  isFinite() {
    return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
  }
}

export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  copy(q) {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }

  clone() {
    return new Quat(this.x, this.y, this.z, this.w);
  }

  identity() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
    return this;
  }

  // this = a * b
  multiplyQuats(a, b) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w;
    const bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  multiply(q) {
    return this.multiplyQuats(this, q);
  }

  premultiply(q) {
    return this.multiplyQuats(q, this);
  }

  // this = conj(a) * b   (relative rotation from a to b, expressed in a's frame)
  multiplyConjA(a, b) {
    const ax = -a.x, ay = -a.y, az = -a.z, aw = a.w;
    const bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  // this = a * conj(b)
  multiplyConjB(a, b) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w;
    const bx = -b.x, by = -b.y, bz = -b.z, bw = b.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  conjugate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  dot(q) {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  normalize() {
    let l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (l < 1e-12) {
      return this.identity();
    }
    l = 1 / l;
    this.x *= l;
    this.y *= l;
    this.z *= l;
    this.w *= l;
    return this;
  }

  // Make w non-negative (same rotation, shortest-arc representation).
  canonical() {
    if (this.w < 0) {
      this.x = -this.x;
      this.y = -this.y;
      this.z = -this.z;
      this.w = -this.w;
    }
    return this;
  }

  setFromAxisAngle(axis, angle) {
    const h = angle * 0.5;
    const s = Math.sin(h);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(h);
    return this;
  }

  // Exponential map: rotation vector (axis * angle) -> quaternion.
  setFromRotVec(v) {
    const angle = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (angle < 1e-9) {
      this.x = v.x * 0.5;
      this.y = v.y * 0.5;
      this.z = v.z * 0.5;
      this.w = 1;
      return this.normalize();
    }
    const s = Math.sin(angle * 0.5) / angle;
    this.x = v.x * s;
    this.y = v.y * s;
    this.z = v.z * s;
    this.w = Math.cos(angle * 0.5);
    return this;
  }

  // Logarithmic map (shortest arc): quaternion -> rotation vector.
  toRotVec(out) {
    let x = this.x, y = this.y, z = this.z, w = this.w;
    if (w < 0) {
      x = -x;
      y = -y;
      z = -z;
      w = -w;
    }
    const s = Math.sqrt(x * x + y * y + z * z);
    if (s < 1e-9) {
      return out.set(2 * x, 2 * y, 2 * z);
    }
    const angle = 2 * Math.atan2(s, w);
    const k = angle / s;
    return out.set(x * k, y * k, z * k);
  }

  angle() {
    const s = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    return 2 * Math.atan2(s, Math.abs(this.w));
  }

  // Rotation taking unit vector a onto unit vector b (shortest arc).
  setFromUnitVectors(a, b) {
    let r = a.x * b.x + a.y * b.y + a.z * b.z + 1;
    if (r < 1e-8) {
      r = 0;
      if (Math.abs(a.x) > Math.abs(a.z)) {
        this.x = -a.y;
        this.y = a.x;
        this.z = 0;
        this.w = r;
      } else {
        this.x = 0;
        this.y = -a.z;
        this.z = a.y;
        this.w = r;
      }
    } else {
      this.x = a.y * b.z - a.z * b.y;
      this.y = a.z * b.x - a.x * b.z;
      this.z = a.x * b.y - a.y * b.x;
      this.w = r;
    }
    return this.normalize();
  }

  // From an orthonormal basis given as the columns of a rotation matrix.
  setFromBasis(xa, ya, za) {
    const m11 = xa.x, m12 = ya.x, m13 = za.x;
    const m21 = xa.y, m22 = ya.y, m23 = za.y;
    const m31 = xa.z, m32 = ya.z, m33 = za.z;
    const trace = m11 + m22 + m33;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      this.w = 0.25 / s;
      this.x = (m32 - m23) * s;
      this.y = (m13 - m31) * s;
      this.z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
      this.w = (m32 - m23) / s;
      this.x = 0.25 * s;
      this.y = (m12 + m21) / s;
      this.z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
      this.w = (m13 - m31) / s;
      this.x = (m12 + m21) / s;
      this.y = 0.25 * s;
      this.z = (m23 + m32) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
      this.w = (m21 - m12) / s;
      this.x = (m13 + m31) / s;
      this.y = (m23 + m32) / s;
      this.z = 0.25 * s;
    }
    return this.normalize();
  }

  setFromEuler(x, y, z, order = 'XYZ') {
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    switch (order) {
      case 'XYZ':
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 + s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case 'YXZ':
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case 'ZXY':
        this.x = s1 * c2 * c3 - c1 * s2 * s3;
        this.y = c1 * s2 * c3 + s1 * c2 * s3;
        this.z = c1 * c2 * s3 + s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case 'ZYX':
        this.x = s1 * c2 * c3 - c1 * s2 * s3;
        this.y = c1 * s2 * c3 + s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      case 'YZX':
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 + s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case 'XZY':
        this.x = s1 * c2 * c3 - c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 + s1 * s2 * c3;
        this.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
    }
    return this;
  }

  slerp(qb, t) {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);
    const x = this.x, y = this.y, z = this.z, w = this.w;
    let cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z;
    let bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
    if (cosHalfTheta < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
      cosHalfTheta = -cosHalfTheta;
    }
    if (cosHalfTheta >= 0.9995) {
      this.x = x + t * (bx - x);
      this.y = y + t * (by - y);
      this.z = z + t * (bz - z);
      this.w = w + t * (bw - w);
      return this.normalize();
    }
    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);
    const ra = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const rb = Math.sin(t * halfTheta) / sinHalfTheta;
    this.x = x * ra + bx * rb;
    this.y = y * ra + by * rb;
    this.z = z * ra + bz * rb;
    this.w = w * ra + bw * rb;
    return this;
  }

  slerpQuats(qa, qb, t) {
    return this.copy(qa).slerp(qb, t);
  }

  // q <- normalize(q + 0.5 * dt * [w, 0] * q)  (first-order integration of world angular velocity)
  integrate(w, dt) {
    const hx = 0.5 * dt * w.x, hy = 0.5 * dt * w.y, hz = 0.5 * dt * w.z;
    const x = this.x, y = this.y, z = this.z, qw = this.w;
    this.x += hx * qw + hy * z - hz * y;
    this.y += hy * qw + hz * x - hx * z;
    this.z += hz * qw + hx * y - hy * x;
    this.w += -hx * x - hy * y - hz * z;
    return this.normalize();
  }

  isFinite() {
    return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z) && Number.isFinite(this.w);
  }
}

// Symmetric 3x3 matrices stored row-major in Float64Array(9).
export function mat3Identity(out = new Float64Array(9)) {
  out.fill(0);
  out[0] = out[4] = out[8] = 1;
  return out;
}

export function mat3Invert(m, out = new Float64Array(9)) {
  const a = m[0], b = m[1], c = m[2];
  const d = m[3], e = m[4], f = m[5];
  const g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) {
    out.fill(0);
    return out;
  }
  const inv = 1 / det;
  out[0] = A * inv;
  out[1] = -(b * i - c * h) * inv;
  out[2] = (b * f - c * e) * inv;
  out[3] = B * inv;
  out[4] = (a * i - c * g) * inv;
  out[5] = -(a * f - c * d) * inv;
  out[6] = C * inv;
  out[7] = -(a * h - b * g) * inv;
  out[8] = (a * e - b * d) * inv;
  return out;
}

// out = R(q) * diag(d) * R(q)^T   (rotate a diagonal inertia tensor into another frame)
export function mat3RotateDiag(q, dx, dy, dz, out = new Float64Array(9)) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - z * w), r02 = 2 * (x * z + y * w);
  const r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - x * w);
  const r20 = 2 * (x * z - y * w), r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y);
  out[0] = r00 * r00 * dx + r01 * r01 * dy + r02 * r02 * dz;
  out[1] = r00 * r10 * dx + r01 * r11 * dy + r02 * r12 * dz;
  out[2] = r00 * r20 * dx + r01 * r21 * dy + r02 * r22 * dz;
  out[3] = out[1];
  out[4] = r10 * r10 * dx + r11 * r11 * dy + r12 * r12 * dz;
  out[5] = r10 * r20 * dx + r11 * r21 * dy + r12 * r22 * dz;
  out[6] = out[2];
  out[7] = out[5];
  out[8] = r20 * r20 * dx + r21 * r21 * dy + r22 * r22 * dz;
  return out;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Move `current` toward `target` by at most `maxDelta`.
export function approach(current, target, maxDelta) {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Deterministic PRNG (mulberry32) so simulations are reproducible in tests.
export function makeRng(seed = 1234567) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1D value noise in [-1, 1] — used for procedural (non-canned) muscle variation.
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let v = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
