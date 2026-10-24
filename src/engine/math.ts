// Small, allocation-conscious math library (vectors, quaternions, 3x3 / 4x4 matrices).

export class Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  copy(v: Vec3): this { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }
  add(v: Vec3): this { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v: Vec3): this { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s: number): this { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v: Vec3, s: number): this { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v: Vec3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v: Vec3): this {
    const x = this.y * v.z - this.z * v.y, y = this.z * v.x - this.x * v.z, z = this.x * v.y - this.y * v.x;
    this.x = x; this.y = y; this.z = z; return this;
  }
  len(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  lenSq(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize(): this { const l = this.len(); if (l > 1e-12) this.scale(1 / l); return this; }
  distTo(v: Vec3): number { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  lerp(v: Vec3, t: number): this { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  applyQuat(q: Quat): this {
    // v' = q v q^-1 (optimized)
    const x = this.x, y = this.y, z = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + (qy * tz - qz * ty);
    this.y = y + qw * ty + (qz * tx - qx * tz);
    this.z = z + qw * tz + (qx * ty - qy * tx);
    return this;
  }
  applyQuatInv(q: Quat): this {
    const x = this.x, y = this.y, z = this.z;
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + (qy * tz - qz * ty);
    this.y = y + qw * ty + (qz * tx - qx * tz);
    this.z = z + qw * tz + (qx * ty - qy * tx);
    return this;
  }
}

export class Quat {
  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
  set(x: number, y: number, z: number, w: number): this { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q: Quat): this { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone(): Quat { return new Quat(this.x, this.y, this.z, this.w); }
  identity(): this { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
  normalize(): this {
    let l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (l < 1e-12) { this.identity(); return this; }
    l = 1 / l; this.x *= l; this.y *= l; this.z *= l; this.w *= l; return this;
  }
  setAxisAngle(ax: number, ay: number, az: number, angle: number): this {
    const h = angle * 0.5, s = Math.sin(h);
    this.x = ax * s; this.y = ay * s; this.z = az * s; this.w = Math.cos(h); return this;
  }
  /** this = a * b */
  multiply(a: Quat, b: Quat): this {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  /** Integrate angular velocity w (world space) over dt. */
  integrate(wx: number, wy: number, wz: number, dt: number): this {
    const hx = wx * dt * 0.5, hy = wy * dt * 0.5, hz = wz * dt * 0.5;
    const x = this.x, y = this.y, z = this.z, w = this.w;
    this.x += hx * w + hy * z - hz * y;
    this.y += hy * w + hz * x - hx * z;
    this.z += hz * w + hx * y - hy * x;
    this.w += -hx * x - hy * y - hz * z;
    return this.normalize();
  }
  slerp(b: Quat, t: number): this {
    let cos = this.x * b.x + this.y * b.y + this.z * b.z + this.w * b.w;
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0: number, s1: number;
    if (cos > 0.9995) { s0 = 1 - t; s1 = t; }
    else {
      const a = Math.acos(cos), sa = Math.sin(a);
      s0 = Math.sin((1 - t) * a) / sa; s1 = Math.sin(t * a) / sa;
    }
    this.x = this.x * s0 + bx * s1; this.y = this.y * s0 + by * s1;
    this.z = this.z * s0 + bz * s1; this.w = this.w * s0 + bw * s1;
    return this.normalize();
  }
  /** Writes the rotation as a 3x3 row-major matrix into m (offset o). */
  toMat3(m: Float32Array | Float64Array, o = 0): void {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    m[o + 0] = 1 - (yy + zz); m[o + 1] = xy - wz; m[o + 2] = xz + wy;
    m[o + 3] = xy + wz; m[o + 4] = 1 - (xx + zz); m[o + 5] = yz - wx;
    m[o + 6] = xz - wy; m[o + 7] = yz + wx; m[o + 8] = 1 - (xx + yy);
  }
}

// ---------------------------------------------------------------------------
// 4x4 matrices: column-major Float32Array(16) like OpenGL.

export type Mat4 = Float32Array;

export function mat4(): Mat4 { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }

export function mat4Identity(m: Mat4): Mat4 { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; }

export function mat4Mul(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4 + 0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export function mat4Invert(out: Mat4, a: Mat4): Mat4 | null {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1.0 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

/** Perspective with reversed-Z disabled; standard GL clip space. */
export function mat4Perspective(out: Mat4, fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function mat4Ortho(out: Mat4, l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  out.fill(0);
  out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = -2 / (f - n);
  out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = -(f + n) / (f - n); out[15] = 1;
  return out;
}

export function mat4LookAt(out: Mat4, ex: number, ey: number, ez: number, cx: number, cy: number, cz: number, ux: number, uy: number, uz: number): Mat4 {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  l = Math.hypot(xx, xy, xz); if (l < 1e-9) { xx = 1; xy = 0; xz = 0; } else { xx /= l; xy /= l; xz /= l; }
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

/** Model matrix from position + quaternion + uniform scale, with an extra local pre-offset (ox,oy,oz) applied before rotation. */
export function mat4FromRTS(out: Mat4, q: Quat, px: number, py: number, pz: number, s: number, ox = 0, oy = 0, oz = 0): Mat4 {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m00 = (1 - (yy + zz)) * s, m01 = (xy + wz) * s, m02 = (xz - wy) * s;
  const m10 = (xy - wz) * s, m11 = (1 - (xx + zz)) * s, m12 = (yz + wx) * s;
  const m20 = (xz + wy) * s, m21 = (yz - wx) * s, m22 = (1 - (xx + yy)) * s;
  out[0] = m00; out[1] = m01; out[2] = m02; out[3] = 0;
  out[4] = m10; out[5] = m11; out[6] = m12; out[7] = 0;
  out[8] = m20; out[9] = m21; out[10] = m22; out[11] = 0;
  out[12] = px + m00 * ox + m10 * oy + m20 * oz;
  out[13] = py + m01 * ox + m11 * oy + m21 * oz;
  out[14] = pz + m02 * ox + m12 * oy + m22 * oz;
  out[15] = 1;
  return out;
}

// ---------------------------------------------------------------------------
// Misc helpers

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Integer hash -> [0, 2^32) */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
export function hash2(x: number, y: number): number { return hash3(x, y, 0x5bd1e995); }
/** Hash -> [0,1) */
export const hashf = (x: number, y: number, z: number) => hash3(x, y, z) / 4294967296;

/** Seeded PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed = 1) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(a + (b - a + 1) * this.next()); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}

/** 2D value noise with smooth interpolation, [0,1). */
export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hashf(xi, yi, seed), b = hashf(xi + 1, yi, seed), c = hashf(xi, yi + 1, seed), d = hashf(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x: number, y: number, octaves: number, seed = 0): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < octaves; i++) { s += a * valueNoise2(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export function valueNoise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const s = seed * 7919;
  const c000 = hashf(xi, yi, zi + s), c100 = hashf(xi + 1, yi, zi + s), c010 = hashf(xi, yi + 1, zi + s), c110 = hashf(xi + 1, yi + 1, zi + s);
  const c001 = hashf(xi, yi, zi + 1 + s), c101 = hashf(xi + 1, yi, zi + 1 + s), c011 = hashf(xi, yi + 1, zi + 1 + s), c111 = hashf(xi + 1, yi + 1, zi + 1 + s);
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u, x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
