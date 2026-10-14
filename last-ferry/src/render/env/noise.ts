// Small deterministic CPU noise used to sculpt the iceberg.

/** Mulberry32 PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 2D value noise in [0,1]. */
export function vnoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal value noise in roughly [0,1]. */
export function fbm(x: number, y: number, octaves = 5, seed = 0): number {
  let s = 0;
  let a = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * vnoise(x, y, seed + i * 31);
    norm += a;
    const nx = 0.8 * x - 0.6 * y;
    const ny = 0.6 * x + 0.8 * y;
    x = nx * 2.03 + 11.3;
    y = ny * 2.03 + 5.7;
    a *= 0.5;
  }
  return s / norm;
}

/** Ridged fractal noise in [0,1] (sharp crests, 1 on ridges). */
export function ridged(x: number, y: number, octaves = 4, seed = 0): number {
  let s = 0;
  let a = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x, y, seed + i * 17) * 2 - 1);
    s += a * n * n;
    norm += a;
    const nx = 0.8 * x - 0.6 * y;
    const ny = 0.6 * x + 0.8 * y;
    x = nx * 2.07 + 3.1;
    y = ny * 2.07 + 9.2;
    a *= 0.5;
  }
  return s / norm;
}
