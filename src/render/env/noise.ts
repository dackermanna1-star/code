// Small deterministic noise helpers (pure, allocation-free).

/** Integer hash → [0, 1). */
export function hash01(i: number, seed = 0): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

/**
 * 1D gradient (Perlin-style) noise in [-1, 1]: smooth (C2 quintic fade), zero at integer
 * lattice points, deterministic per seed. Used for camera shake and flicker.
 */
export function noise1(x: number, seed = 0): number {
  if (!Number.isFinite(x)) return 0;
  const i = Math.floor(x);
  const f = x - i;
  const g0 = hash01(i, seed) * 2 - 1;
  const g1 = hash01(i + 1, seed) * 2 - 1;
  const v0 = g0 * f;
  const v1 = g1 * (f - 1);
  const t = f * f * f * (f * (f * 6 - 15) + 10);
  // Max |v| of 1D gradient noise is 0.5; scale to ~[-1, 1].
  return (v0 + (v1 - v0) * t) * 2;
}

/** Fractal sum of `octaves` noise1 layers (lacunarity 2, gain 0.5), normalised to ~[-1, 1]. */
export function fbm1(x: number, seed = 0, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x * f, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}
