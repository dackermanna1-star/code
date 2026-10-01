// Cheap hash-based value noise (deterministic, seedable, optionally periodic in x).

function h2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function hashf(ix, iy, seed) { return h2(ix, iy, seed); }

/** 2D value noise in [0,1). periodX (lattice units, integer) makes it tile horizontally. */
export function vnoise(x, y, seed, periodX = 0, periodY = 0) {
  const fx0 = Math.floor(x), fy0 = Math.floor(y);
  const fx = x - fx0, fy = y - fy0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  let x0 = fx0, x1 = fx0 + 1, y0 = fy0, y1 = fy0 + 1;
  if (periodX > 0) {
    x0 = ((x0 % periodX) + periodX) % periodX;
    x1 = ((x1 % periodX) + periodX) % periodX;
  }
  if (periodY > 0) {
    y0 = ((y0 % periodY) + periodY) % periodY;
    y1 = ((y1 % periodY) + periodY) % periodY;
  }
  const a = h2(x0, y0, seed), b = h2(x1, y0, seed);
  const c = h2(x0, y1, seed), d = h2(x1, y1, seed);
  const ab = a + (b - a) * sx, cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

export function fbm(x, y, seed, oct = 4, lac = 2.03, gain = 0.5, periodX = 0) {
  let amp = 1, sum = 0, norm = 0, f = 1, p = periodX;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 1013, p > 0 ? Math.round(p * f) : 0);
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}

/** 1D smooth value noise in [0,1) */
export function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = h2(i, 0, seed), b = h2(i + 1, 0, seed);
  return a + (b - a) * s;
}

/** 1D fbm in [-1,1] (approx) */
export function noise1s(x, seed, oct = 2) {
  let amp = 1, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * (noise1(x * f, seed + i * 7919) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}
