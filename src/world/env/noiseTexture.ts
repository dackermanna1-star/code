// Tileable gradient-noise textures generated at startup (clouds, water normals, terrain macro variation).
import * as THREE from 'three';

function makePerm(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  const a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  let s = seed >>> 0 || 1;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return p;
}

const GX = new Float32Array(16), GZ = new Float32Array(16);
for (let i = 0; i < 16; i++) {
  GX[i] = Math.cos((i / 16) * Math.PI * 2);
  GZ[i] = Math.sin((i / 16) * Math.PI * 2);
}

/** Gradient noise with integer period P (lattice cells) on both axes, ~[-0.7, 0.7]. */
export function periodicNoise(perm: Uint8Array, x: number, z: number, P: number): number {
  const xf = Math.floor(x), zf = Math.floor(z);
  const fx = x - xf, fz = z - zf;
  const X0 = ((xf % P) + P) % P, Z0 = ((zf % P) + P) % P;
  const X1 = (X0 + 1) % P, Z1 = (Z0 + 1) % P;
  const g = (X: number, Z: number) => perm[perm[X & 255] + (Z & 255)] & 15;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = g(X0, Z0), b = g(X1, Z0), c = g(X0, Z1), d = g(X1, Z1);
  const n00 = GX[a] * fx + GZ[a] * fz;
  const n10 = GX[b] * (fx - 1) + GZ[b] * fz;
  const n01 = GX[c] * fx + GZ[c] * (fz - 1);
  const n11 = GX[d] * (fx - 1) + GZ[d] * (fz - 1);
  const x0 = n00 + u * (n10 - n00), x1 = n01 + u * (n11 - n01);
  return x0 + v * (x1 - x0);
}

/** Periodic fBm in roughly [0, 1]. `base` = lattice cells across the tile for the first octave. */
export function periodicFbm(perm: Uint8Array, u: number, v: number, base: number, octaves: number, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, f = base;
  for (let o = 0; o < octaves; o++) {
    sum += periodicNoise(perm, u * f + o * 31, v * f + o * 17, f) * amp;
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return Math.min(1, Math.max(0, 0.5 + (sum / norm) * 0.85));
}

/**
 * RGBA8 tileable noise: R = low-frequency fBm, G = mid fBm, B = high fBm, A = ridged/cellular-ish detail.
 */
export function createNoiseTexture(size = 256, seed = 7): THREE.DataTexture {
  const perm = makePerm(seed);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const o = (y * size + x) * 4;
      data[o] = periodicFbm(perm, u, v, 4, 5) * 255;
      data[o + 1] = periodicFbm(perm, u + 0.37, v + 0.11, 8, 4) * 255;
      data[o + 2] = periodicFbm(perm, u + 0.71, v + 0.53, 16, 3) * 255;
      const r = 1 - Math.abs(periodicNoise(perm, u * 12 + 5, v * 12 + 9, 12) * 1.6);
      data[o + 3] = Math.max(0, Math.min(1, r * r)) * 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Tileable water normal map from a sum of periodic noise octaves (RGB = normal, A = height). */
export function createWaterNormalTexture(size = 256, seed = 11): THREE.DataTexture {
  const perm = makePerm(seed);
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // stretched ripples + isotropic chop
      hgt[y * size + x] = periodicFbm(perm, u, v, 6, 5, 0.55) * 0.7 + periodicFbm(perm, u + 0.3, v + 0.6, 12, 3) * 0.3;
    }
  const data = new Uint8Array(size * size * 4);
  const k = 6.0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = hgt[y * size + ((x - 1 + size) % size)], r = hgt[y * size + ((x + 1) % size)];
      const d = hgt[((y - 1 + size) % size) * size + x], u = hgt[((y + 1) % size) * size + x];
      const nx = (l - r) * k, ny = (d - u) * k, nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      const o = (y * size + x) * 4;
      data[o] = (nx * inv * 0.5 + 0.5) * 255;
      data[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      data[o + 2] = (nz * inv * 0.5 + 0.5) * 255;
      data[o + 3] = hgt[y * size + x] * 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
