/**
 * Fast procedural noise for texture painting (worker-safe, no allocations in hot paths):
 * improved Perlin noise 2D/3D, fBm / ridged / turbulence, Worley (cellular) F1/F2 and
 * small hashing helpers. All functions are deterministic.
 */

const P = new Uint8Array(512);
(() => {
  // fixed permutation (seeded LCG shuffle) so textures are identical in every thread
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 0x2545f491;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function grad3(h: number, x: number, y: number, z: number): number {
  const hh = h & 15;
  const u = hh < 8 ? x : y;
  const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
  return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
}
function grad2(h: number, x: number, y: number): number {
  switch (h & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

/** Improved Perlin noise, roughly in [-1, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  x -= fx; y -= fy; z -= fz;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
  const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad3(P[AA], x, y, z), grad3(P[BA], x - 1, y, z), u), lerp(grad3(P[AB], x, y - 1, z), grad3(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad3(P[AA + 1], x, y, z - 1), grad3(P[BA + 1], x - 1, y, z - 1), u), lerp(grad3(P[AB + 1], x, y - 1, z - 1), grad3(P[BB + 1], x - 1, y - 1, z - 1), u), v),
    w,
  );
}

/** Improved Perlin noise 2D, roughly in [-1, 1]. */
export function noise2(x: number, y: number): number {
  const fx = Math.floor(x), fy = Math.floor(y);
  const X = fx & 255, Y = fy & 255;
  x -= fx; y -= fy;
  const u = fade(x), v = fade(y);
  const A = P[X] + Y, B = P[X + 1] + Y;
  return lerp(lerp(grad2(P[A], x, y), grad2(P[B], x - 1, y), u), lerp(grad2(P[A + 1], x, y - 1), grad2(P[B + 1], x - 1, y - 1), u), v) * 0.9;
}

/** Fractal Brownian motion (3D), ~[-1, 1]. */
export function fbm3(x: number, y: number, z: number, oct = 4, lac = 2.03, gain = 0.5): number {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x, y, z);
    n += a;
    a *= gain;
    x = x * lac + 17.3; y = y * lac + 9.1; z = z * lac + 3.7;
  }
  return s / n;
}

export function fbm2(x: number, y: number, oct = 4, lac = 2.03, gain = 0.5): number {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x, y);
    n += a;
    a *= gain;
    x = x * lac + 17.3; y = y * lac + 9.1;
  }
  return s / n;
}

/** Ridged multifractal (3D) in [0, 1]: sharp creases (veins, cracks, wrinkles). */
export function ridged3(x: number, y: number, z: number, oct = 3, lac = 2.1, gain = 0.5): number {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    const r = 1 - Math.abs(noise3(x, y, z));
    s += a * r * r;
    n += a;
    a *= gain;
    x = x * lac + 5.1; y = y * lac + 1.3; z = z * lac + 7.7;
  }
  return s / n;
}

/** Turbulence (abs fBm) in [0, 1]. */
export function turb3(x: number, y: number, z: number, oct = 4): number {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * Math.abs(noise3(x, y, z));
    n += a;
    a *= 0.5;
    x = x * 2.01 + 3.3; y = y * 2.01 + 1.9; z = z * 2.01 + 7.1;
  }
  return s / n;
}

/** Integer hash -> [0, 1). */
export function hash31(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function hash21(x: number, y: number): number {
  return hash31(x, y, 0x5bd1e995);
}

/** Result slots for worley (reused). */
export const W = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0, cz: 0 };

/** 3D Worley noise: fills W.f1/f2 (distances) and W.id (cell hash 0..1) of the nearest cell. */
export function worley3(x: number, y: number, z: number, jitter = 0.9): typeof W {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let f1 = 1e9, f2 = 1e9, id = 0, cx = 0, cy = 0, cz = 0;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const gx = ix + dx, gy = iy + dy, gz = iz + dz;
        const h1 = hash31(gx, gy, gz);
        const px = gx + 0.5 + (h1 - 0.5) * jitter;
        const py = gy + 0.5 + (hash31(gz, gx, gy + 71) - 0.5) * jitter;
        const pz = gz + 0.5 + (hash31(gy + 13, gz, gx) - 0.5) * jitter;
        const ddx = px - x, ddy = py - y, ddz = pz - z;
        const d = ddx * ddx + ddy * ddy + ddz * ddz;
        if (d < f1) { f2 = f1; f1 = d; id = h1; cx = px; cy = py; cz = pz; }
        else if (d < f2) f2 = d;
      }
  W.f1 = Math.sqrt(f1); W.f2 = Math.sqrt(f2); W.id = id; W.cx = cx; W.cy = cy; W.cz = cz;
  return W;
}

/** 2D Worley noise (see worley3). */
export function worley2(x: number, y: number, jitter = 0.9): typeof W {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, cx = 0, cy = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const gx = ix + dx, gy = iy + dy;
      const h1 = hash21(gx, gy);
      const px = gx + 0.5 + (h1 - 0.5) * jitter;
      const py = gy + 0.5 + (hash21(gy + 31, gx) - 0.5) * jitter;
      const ddx = px - x, ddy = py - y;
      const d = ddx * ddx + ddy * ddy;
      if (d < f1) { f2 = f1; f1 = d; id = h1; cx = px; cy = py; }
      else if (d < f2) f2 = d;
    }
  W.f1 = Math.sqrt(f1); W.f2 = Math.sqrt(f2); W.id = id; W.cx = cx; W.cy = cy; W.cz = 0;
  return W;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
