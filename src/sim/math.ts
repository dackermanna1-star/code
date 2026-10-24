// Small math helpers used by the simulation. Hot loops work directly on
// typed arrays; these helpers are for setup code and per-frame work.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function len3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: V3, b: V3, out: V3 = v3()): V3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function normalize(a: V3): V3 {
  const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  if (l > 1e-12) {
    a.x /= l;
    a.y /= l;
    a.z /= l;
  }
  return a;
}

export function sub(a: V3, b: V3, out: V3 = v3()): V3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function add(a: V3, b: V3, out: V3 = v3()): V3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function scale(a: V3, s: number, out: V3 = v3()): V3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

export function dist(a: V3, b: V3): number {
  return len3(a.x - b.x, a.y - b.y, a.z - b.z);
}

// ---------------------------------------------------------------------------
// 3x3 matrices, row-major Float64Array(9). A rotation matrix maps local to
// world: world = R * local. Column k holds the local k-axis in world space.

export type Mat3 = Float64Array;

export function mat3(): Mat3 {
  const m = new Float64Array(9);
  m[0] = m[4] = m[8] = 1;
  return m;
}

export function mat3Identity(m: Mat3): Mat3 {
  m.fill(0);
  m[0] = m[4] = m[8] = 1;
  return m;
}

export function mat3Copy(src: ArrayLike<number>, dst: Mat3): Mat3 {
  for (let i = 0; i < 9; i++) dst[i] = src[i];
  return dst;
}

/** Rotation about +Y by yaw radians (positive yaw turns +Z toward +X). */
export function mat3FromYaw(yaw: number, m: Mat3 = mat3()): Mat3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  m[0] = c; m[1] = 0; m[2] = s;
  m[3] = 0; m[4] = 1; m[5] = 0;
  m[6] = -s; m[7] = 0; m[8] = c;
  return m;
}

/** Rotation from Euler angles applied in order: X (pitch), then Y (yaw), then Z (roll): R = Ry * Rx * Rz. */
export function mat3FromEuler(pitch: number, yaw: number, roll: number, m: Mat3 = mat3()): Mat3 {
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  // Rx
  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const t = new Float64Array(9);
  mat3Mul(ry, rx, t);
  mat3Mul(t, rz, m);
  return m;
}

/** Rotation of angle radians about unit axis. */
export function mat3FromAxisAngle(ax: number, ay: number, az: number, angle: number, m: Mat3 = mat3()): Mat3 {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  m[0] = t * ax * ax + c; m[1] = t * ax * ay - s * az; m[2] = t * ax * az + s * ay;
  m[3] = t * ax * ay + s * az; m[4] = t * ay * ay + c; m[5] = t * ay * az - s * ax;
  m[6] = t * ax * az - s * ay; m[7] = t * ay * az + s * ax; m[8] = t * az * az + c;
  return m;
}

export function mat3Mul(a: ArrayLike<number>, b: ArrayLike<number>, out: Mat3): Mat3 {
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8];
  const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8];
  out[0] = a0 * b0 + a1 * b3 + a2 * b6;
  out[1] = a0 * b1 + a1 * b4 + a2 * b7;
  out[2] = a0 * b2 + a1 * b5 + a2 * b8;
  out[3] = a3 * b0 + a4 * b3 + a5 * b6;
  out[4] = a3 * b1 + a4 * b4 + a5 * b7;
  out[5] = a3 * b2 + a4 * b5 + a5 * b8;
  out[6] = a6 * b0 + a7 * b3 + a8 * b6;
  out[7] = a6 * b1 + a7 * b4 + a8 * b7;
  out[8] = a6 * b2 + a7 * b5 + a8 * b8;
  return out;
}

export function mat3Det(m: ArrayLike<number>): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

export function mat3Invert(m: ArrayLike<number>, out: Mat3): boolean {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return false;
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
  return true;
}

export function mat3MulVec(m: ArrayLike<number>, x: number, y: number, z: number, out: V3): V3 {
  out.x = m[0] * x + m[1] * y + m[2] * z;
  out.y = m[3] * x + m[4] * y + m[5] * z;
  out.z = m[6] * x + m[7] * y + m[8] * z;
  return out;
}

export function mat3TMulVec(m: ArrayLike<number>, x: number, y: number, z: number, out: V3): V3 {
  out.x = m[0] * x + m[3] * y + m[6] * z;
  out.y = m[1] * x + m[4] * y + m[7] * z;
  out.z = m[2] * x + m[5] * y + m[8] * z;
  return out;
}

/** Build a rotation matrix from orthonormal right (X), up (Y), forward (Z) axes. */
export function mat3FromBasis(rx: V3, ry: V3, rz: V3, m: Mat3 = mat3()): Mat3 {
  m[0] = rx.x; m[1] = ry.x; m[2] = rz.x;
  m[3] = rx.y; m[4] = ry.y; m[5] = rz.y;
  m[6] = rx.z; m[7] = ry.z; m[8] = rz.z;
  return m;
}

// ---------------------------------------------------------------------------
// Quaternions as [x, y, z, w] Float64Array(4).

export function quatFromMat3(m: ArrayLike<number>, q: Float64Array): Float64Array {
  const m00 = m[0], m01 = m[1], m02 = m[2];
  const m10 = m[3], m11 = m[4], m12 = m[5];
  const m20 = m[6], m21 = m[7], m22 = m[8];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1.0);
    q[3] = 0.25 / s;
    q[0] = (m21 - m12) * s;
    q[1] = (m02 - m20) * s;
    q[2] = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    q[3] = (m21 - m12) / s;
    q[0] = 0.25 * s;
    q[1] = (m01 + m10) / s;
    q[2] = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    q[3] = (m02 - m20) / s;
    q[0] = (m01 + m10) / s;
    q[1] = 0.25 * s;
    q[2] = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    q[3] = (m10 - m01) / s;
    q[0] = (m02 + m20) / s;
    q[1] = (m12 + m21) / s;
    q[2] = 0.25 * s;
  }
  return q;
}

export function mat3FromQuat(q: ArrayLike<number>, m: Mat3): Mat3 {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy - wz; m[2] = xz + wy;
  m[3] = xy + wz; m[4] = 1 - (xx + zz); m[5] = yz - wx;
  m[6] = xz - wy; m[7] = yz + wx; m[8] = 1 - (xx + yy);
  return m;
}

const _qr = new Float64Array(9);
/**
 * Extract the rotational part of a general 3x3 matrix A (row-major), warm
 * started with quaternion q (updated in place). Müller et al. 2016,
 * "A Robust Method to Extract the Rotational Part of Deformations".
 */
export function extractRotation(A: ArrayLike<number>, q: Float64Array, iterations = 6): Float64Array {
  // Columns of A
  const a0x = A[0], a0y = A[3], a0z = A[6];
  const a1x = A[1], a1y = A[4], a1z = A[7];
  const a2x = A[2], a2y = A[5], a2z = A[8];
  for (let it = 0; it < iterations; it++) {
    mat3FromQuat(q, _qr);
    const r0x = _qr[0], r0y = _qr[3], r0z = _qr[6];
    const r1x = _qr[1], r1y = _qr[4], r1z = _qr[7];
    const r2x = _qr[2], r2y = _qr[5], r2z = _qr[8];
    // omega = sum(r_i x a_i) / (|sum(r_i . a_i)| + eps)
    let ox = r0y * a0z - r0z * a0y + r1y * a1z - r1z * a1y + r2y * a2z - r2z * a2y;
    let oy = r0z * a0x - r0x * a0z + r1z * a1x - r1x * a1z + r2z * a2x - r2x * a2z;
    let oz = r0x * a0y - r0y * a0x + r1x * a1y - r1y * a1x + r2x * a2y - r2y * a2x;
    const d = Math.abs(r0x * a0x + r0y * a0y + r0z * a0z + r1x * a1x + r1y * a1y + r1z * a1z + r2x * a2x + r2y * a2y + r2z * a2z) + 1e-9;
    ox /= d; oy /= d; oz /= d;
    const w = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (w < 1e-9) break;
    const half = 0.5 * w;
    const s = Math.sin(half) / w;
    const dqx = ox * s, dqy = oy * s, dqz = oz * s, dqw = Math.cos(half);
    // q = dq * q
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] = dqw * qx + dqx * qw + dqy * qz - dqz * qy;
    q[1] = dqw * qy - dqx * qz + dqy * qw + dqz * qx;
    q[2] = dqw * qz + dqx * qy - dqy * qx + dqz * qw;
    q[3] = dqw * qw - dqx * qx - dqy * qy - dqz * qz;
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    q[0] /= n; q[1] /= n; q[2] /= n; q[3] /= n;
  }
  return q;
}

/**
 * Eigen-decomposition of a symmetric 3x3 matrix (row-major) by cyclic Jacobi
 * rotations. Eigenvalues go to `values` in ascending order; eigenvector k is
 * column k of `vectors` (row-major).
 */
export function symEigen3(m: ArrayLike<number>, values: Float64Array, vectors: Float64Array): void {
  const a = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 12; sweep++) {
    const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5];
    if (off < 1e-24 * (a[0] * a[0] + a[4] * a[4] + a[8] * a[8] + 1e-30)) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const apq = a[p * 3 + q];
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k * 3 + p], akq = a[k * 3 + q];
          a[k * 3 + p] = c * akp - s * akq;
          a[k * 3 + q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p * 3 + k], aqk = a[q * 3 + k];
          a[p * 3 + k] = c * apk - s * aqk;
          a[q * 3 + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k * 3 + p], vkq = v[k * 3 + q];
          v[k * 3 + p] = c * vkp - s * vkq;
          v[k * 3 + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i * 4] - a[j * 4]);
  for (let k = 0; k < 3; k++) {
    const src = order[k];
    values[k] = a[src * 4];
    for (let r = 0; r < 3; r++) vectors[r * 3 + k] = v[r * 3 + src];
  }
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32)

export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ---------------------------------------------------------------------------
// Value noise / fBm for terrain and textures.

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise2(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

export function fbm2(x: number, z: number, octaves = 5, seed = 0, lacunarity = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, z * freq, seed + o * 17);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function ridged2(x: number, z: number, octaves = 5, seed = 0): number {
  let amp = 0.5, freq = 1, sum = 0, prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(valueNoise2(x * freq, z * freq, seed + o * 31));
    n *= n;
    sum += n * amp * prev;
    prev = n;
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}
