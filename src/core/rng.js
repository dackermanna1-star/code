// Deterministic hashing, PRNG and noise.

export function hash32(x) {
  x = x | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

// combine a running hash with another integer
export function hc(h, v) {
  return hash32((h ^ Math.imul(v | 0, 0x9e3779b1)) + 0x7f4a7c15);
}

export function hash2(a, b, s = 0) { return hc(hc(hash32(s ^ 0x51ed27), a), b); }
export function hash3(a, b, c, s = 0) { return hc(hc(hc(hash32(s ^ 0x2c1b3c6d), a), b), c); }
export function hash4(a, b, c, d, s = 0) { return hc(hc(hc(hc(hash32(s ^ 0x297a2d39), a), b), c), d); }

export function rand2(a, b, s = 0) { return hash2(a, b, s) / 4294967296; }
export function rand3(a, b, c, s = 0) { return hash3(a, b, c, s) / 4294967296; }

export function strHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x1234567; }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  weighted(pairs) {
    let tot = 0;
    for (const p of pairs) tot += Math.max(0, p[1]);
    let r = this.next() * tot;
    for (const p of pairs) {
      r -= Math.max(0, p[1]);
      if (r <= 0) return p[0];
    }
    return pairs[pairs.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  fork(salt) { return new RNG(hc(this.s, typeof salt === 'string' ? strHash(salt) : salt)); }
}

function sfade(t) { return t * t * (3 - 2 * t); }

// 2D value noise, unbounded domain, returns 0..1
export function vnoise2(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = sfade(xf), v = sfade(zf);
  const a = rand2(xi, zi, seed), b = rand2(xi + 1, zi, seed);
  const c = rand2(xi, zi + 1, seed), d = rand2(xi + 1, zi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function fbm2(x, z, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise2(x * f, z * f, seed + i * 131) * a;
    n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}

// 3D value noise for continuous variation (e.g. wall stains)
export function vnoise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = sfade(x - xi), v = sfade(y - yi), w = sfade(z - zi);
  const r = (i, j, k) => rand3(xi + i, yi + j, zi + k, seed);
  const x00 = r(0, 0, 0) + (r(1, 0, 0) - r(0, 0, 0)) * u;
  const x10 = r(0, 1, 0) + (r(1, 1, 0) - r(0, 1, 0)) * u;
  const x01 = r(0, 0, 1) + (r(1, 0, 1) - r(0, 0, 1)) * u;
  const x11 = r(0, 1, 1) + (r(1, 1, 1) - r(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
