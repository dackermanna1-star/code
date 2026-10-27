/**
 * 3D gradient noise (Perlin-style, quintic interpolation) with analytic
 * derivatives, cellular noise, and fractal helpers. Pure functions of their
 * inputs and an integer seed, so terrain generated in Web Workers matches the
 * terrain queried on the main thread for collision bit-for-bit.
 */
import { hash3i } from './rng';

// 12 cube-edge gradients, padded to 16 for cheap masking.
const GX = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const GY = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const GZ = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

/** Derivative output of the last noised() call: [dn/dx, dn/dy, dn/dz]. */
export const D = new Float64Array(3);

/** Gradient noise in roughly [-1, 1]. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  let h: number;
  h = hash3i(ix, iy, iz, seed) & 15; const va = GX[h] * fx + GY[h] * fy + GZ[h] * fz;
  h = hash3i(ix + 1, iy, iz, seed) & 15; const vb = GX[h] * (fx - 1) + GY[h] * fy + GZ[h] * fz;
  h = hash3i(ix, iy + 1, iz, seed) & 15; const vc = GX[h] * fx + GY[h] * (fy - 1) + GZ[h] * fz;
  h = hash3i(ix + 1, iy + 1, iz, seed) & 15; const vd = GX[h] * (fx - 1) + GY[h] * (fy - 1) + GZ[h] * fz;
  h = hash3i(ix, iy, iz + 1, seed) & 15; const ve = GX[h] * fx + GY[h] * fy + GZ[h] * (fz - 1);
  h = hash3i(ix + 1, iy, iz + 1, seed) & 15; const vf = GX[h] * (fx - 1) + GY[h] * fy + GZ[h] * (fz - 1);
  h = hash3i(ix, iy + 1, iz + 1, seed) & 15; const vg = GX[h] * fx + GY[h] * (fy - 1) + GZ[h] * (fz - 1);
  h = hash3i(ix + 1, iy + 1, iz + 1, seed) & 15; const vh = GX[h] * (fx - 1) + GY[h] * (fy - 1) + GZ[h] * (fz - 1);
  const k1 = vb - va, k2 = vc - va, k3 = ve - va;
  const k4 = va - vb - vc + vd, k5 = va - vc - ve + vg, k6 = va - vb - ve + vf;
  const k7 = -va + vb + vc - vd + ve - vf - vg + vh;
  return va + ux * k1 + uy * k2 + uz * k3 + ux * uy * k4 + uy * uz * k5 + uz * ux * k6 + ux * uy * uz * k7;
}

/** Gradient noise with analytic derivatives (written to D). */
export function noised(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const ha = hash3i(ix, iy, iz, seed) & 15;
  const hb = hash3i(ix + 1, iy, iz, seed) & 15;
  const hc = hash3i(ix, iy + 1, iz, seed) & 15;
  const hd = hash3i(ix + 1, iy + 1, iz, seed) & 15;
  const he = hash3i(ix, iy, iz + 1, seed) & 15;
  const hf = hash3i(ix + 1, iy, iz + 1, seed) & 15;
  const hg = hash3i(ix, iy + 1, iz + 1, seed) & 15;
  const hh = hash3i(ix + 1, iy + 1, iz + 1, seed) & 15;
  const va = GX[ha] * fx + GY[ha] * fy + GZ[ha] * fz;
  const vb = GX[hb] * (fx - 1) + GY[hb] * fy + GZ[hb] * fz;
  const vc = GX[hc] * fx + GY[hc] * (fy - 1) + GZ[hc] * fz;
  const vd = GX[hd] * (fx - 1) + GY[hd] * (fy - 1) + GZ[hd] * fz;
  const ve = GX[he] * fx + GY[he] * fy + GZ[he] * (fz - 1);
  const vf = GX[hf] * (fx - 1) + GY[hf] * fy + GZ[hf] * (fz - 1);
  const vg = GX[hg] * fx + GY[hg] * (fy - 1) + GZ[hg] * (fz - 1);
  const vh = GX[hh] * (fx - 1) + GY[hh] * (fy - 1) + GZ[hh] * (fz - 1);
  const k1 = vb - va, k2 = vc - va, k3 = ve - va;
  const k4 = va - vb - vc + vd, k5 = va - vc - ve + vg, k6 = va - vb - ve + vf;
  const k7 = -va + vb + vc - vd + ve - vf - vg + vh;
  // gradient part
  const g1x = GX[hb] - GX[ha], g1y = GY[hb] - GY[ha], g1z = GZ[hb] - GZ[ha];
  const g2x = GX[hc] - GX[ha], g2y = GY[hc] - GY[ha], g2z = GZ[hc] - GZ[ha];
  const g3x = GX[he] - GX[ha], g3y = GY[he] - GY[ha], g3z = GZ[he] - GZ[ha];
  const g4x = GX[ha] - GX[hb] - GX[hc] + GX[hd], g4y = GY[ha] - GY[hb] - GY[hc] + GY[hd], g4z = GZ[ha] - GZ[hb] - GZ[hc] + GZ[hd];
  const g5x = GX[ha] - GX[hc] - GX[he] + GX[hg], g5y = GY[ha] - GY[hc] - GY[he] + GY[hg], g5z = GZ[ha] - GZ[hc] - GZ[he] + GZ[hg];
  const g6x = GX[ha] - GX[hb] - GX[he] + GX[hf], g6y = GY[ha] - GY[hb] - GY[he] + GY[hf], g6z = GZ[ha] - GZ[hb] - GZ[he] + GZ[hf];
  const g7x = -GX[ha] + GX[hb] + GX[hc] - GX[hd] + GX[he] - GX[hf] - GX[hg] + GX[hh];
  const g7y = -GY[ha] + GY[hb] + GY[hc] - GY[hd] + GY[he] - GY[hf] - GY[hg] + GY[hh];
  const g7z = -GZ[ha] + GZ[hb] + GZ[hc] - GZ[hd] + GZ[he] - GZ[hf] - GZ[hg] + GZ[hh];
  const uxy = ux * uy, uyz = uy * uz, uzx = uz * ux, uxyz = uxy * uz;
  D[0] = GX[ha] + ux * g1x + uy * g2x + uz * g3x + uxy * g4x + uyz * g5x + uzx * g6x + uxyz * g7x
    + dux * (k1 + uy * k4 + uz * k6 + uyz * k7);
  D[1] = GY[ha] + ux * g1y + uy * g2y + uz * g3y + uxy * g4y + uyz * g5y + uzx * g6y + uxyz * g7y
    + duy * (k2 + ux * k4 + uz * k5 + uzx * k7);
  D[2] = GZ[ha] + ux * g1z + uy * g2z + uz * g3z + uxy * g4z + uyz * g5z + uzx * g6z + uxyz * g7z
    + duz * (k3 + uy * k5 + ux * k6 + uxy * k7);
  return va + ux * k1 + uy * k2 + uz * k3 + uxy * k4 + uyz * k5 + uzx * k6 + uxyz * k7;
}

/** Standard fBm in roughly [-1, 1]. */
export function fbm(x: number, y: number, z: number, seed: number, octaves: number, lacunarity = 2.0, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + i * 1013);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1] (sharp crests), with crest-weighted detail. */
export function ridged(x: number, y: number, z: number, seed: number, octaves: number, lacunarity = 2.0, gain = 0.5, sharp = 2.0): number {
  let sum = 0, amp = 0.5, f = 1, weight = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise3(x * f, y * f, z * f, seed + i * 7919));
    n = Math.pow(n, sharp) * weight;
    weight = Math.min(1, n * 2);
    sum += n * amp;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/**
 * "Eroded" fBm: octaves are attenuated where the accumulated slope is steep,
 * producing smooth valleys and sharp ridges similar to fluvial erosion
 * (after I. Quilez). Returns roughly [-1, 1].
 */
export function erodedFbm(x: number, y: number, z: number, seed: number, octaves: number, erosion = 1.0, gain = 0.5): number {
  let sum = 0, amp = 1, f = 1, dx = 0, dy = 0, dz = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = noised(x * f, y * f, z * f, seed + i * 2741);
    dx += D[0] * amp * f; dy += D[1] * amp * f; dz += D[2] * amp * f;
    const slope2 = (dx * dx + dy * dy + dz * dz) / (f * f);
    sum += (amp * n) / (1 + erosion * slope2);
    norm += amp;
    amp *= gain;
    f *= 2.0;
  }
  return sum / norm;
}

/** Cellular noise output */
export const CELL = { f1: 0, f2: 0, id1: 0, id2: 0, cx: 0, cy: 0, cz: 0 };

/** 3D Worley noise: nearest two feature point distances (cell units) and ids. */
export function cellular3(x: number, y: number, z: number, seed: number, jitter = 0.9): typeof CELL {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let f1 = 1e9, f2 = 1e9, id1 = 0, id2 = 0, bx = 0, by = 0, bz = 0;
  for (let k = -1; k <= 1; k++)
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, cz = iz + k;
        const h = hash3i(cx, cy, cz, seed);
        const px = cx + 0.5 + jitter * (((h & 1023) / 1023) - 0.5);
        const py = cy + 0.5 + jitter * ((((h >>> 10) & 1023) / 1023) - 0.5);
        const pz = cz + 0.5 + jitter * ((((h >>> 20) & 1023) / 1023) - 0.5);
        const dx = px - x, dy = py - y, dz = pz - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < f1) {
          f2 = f1; id2 = id1;
          f1 = d; id1 = h; bx = px; by = py; bz = pz;
        } else if (d < f2) {
          f2 = d; id2 = h;
        }
      }
  CELL.f1 = Math.sqrt(f1);
  CELL.f2 = Math.sqrt(f2);
  CELL.id1 = id1;
  CELL.id2 = id2;
  CELL.cx = bx; CELL.cy = by; CELL.cz = bz;
  return CELL;
}
