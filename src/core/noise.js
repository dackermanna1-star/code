// Lattice value noise / fbm on the CPU, used for heightfields, weathering
// masks and layout jitter. Cheap and deterministic.
import { rand2, rand3 } from './rng.js';

const fade = (t) => t * t * (3 - 2 * t);

export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const a = rand2(xi, yi, seed);
  const b = rand2(xi + 1, yi, seed);
  const c = rand2(xi, yi + 1, seed);
  const d = rand2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function valueNoise3(x, y, z, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const l = (dx, dy, dz) => rand3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = l(0, 0, 0) + (l(1, 0, 0) - l(0, 0, 0)) * u;
  const x10 = l(0, 1, 0) + (l(1, 1, 0) - l(0, 1, 0)) * u;
  const x01 = l(0, 0, 1) + (l(1, 0, 1) - l(0, 0, 1)) * u;
  const x11 = l(0, 1, 1) + (l(1, 1, 1) - l(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** Fractal value noise in [0,1]. */
export function fbm2(x, y, octaves = 4, seed = 0, lacunarity = 2.0, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * f, y * f, seed + i * 131);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

export function fbm3(x, y, z, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * f, y * f, z * f, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Ridged noise in [0,1], high values along thin ridges (cracks, seams). */
export function ridge2(x, y, seed = 0) {
  const n = valueNoise2(x, y, seed) * 2 - 1;
  return 1 - Math.abs(n);
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp(x, a = 0, b = 1) {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
