// Seeded PRNG utilities (sfc32 + string hashing). Never use Math.random in generation.

export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mix two 32-bit integers into a well distributed 32-bit hash. */
export function hash2(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

export function seedOf(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return hash2(Math.floor(seed) | 0, Math.floor(seed / 4294967296) | 0);
  }
  return hashString(String(seed));
}

export class Rng {
  constructor(seed) {
    const s = seedOf(seed);
    this.seed = s;
    // splitmix32 init
    let x = s;
    const sm = () => {
      x = (x + 0x9e3779b9) | 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm() | 1;
    for (let i = 0; i < 10; i++) this.u32();
  }

  u32() {
    let a = this.a, b = this.b, c = this.c, d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** float in [0,1) */
  next() { return this.u32() / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  /** integer in [a, b] inclusive */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** pick from [[item, weight], ...] */
  pickW(list) {
    let tot = 0;
    for (let i = 0; i < list.length; i++) tot += list[i][1];
    let r = this.next() * tot;
    for (let i = 0; i < list.length; i++) {
      r -= list[i][1];
      if (r <= 0) return list[i][0];
    }
    return list[list.length - 1][0];
  }
  /** standard normal */
  gauss() {
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
  }
  /** normal clamped to +-k sigma */
  gaussC(mean, sd, k = 2.5) {
    let g = this.gauss();
    if (g > k) g = k; else if (g < -k) g = -k;
    return mean + sd * g;
  }
  /** skewed toward low values: x^p */
  pow(a, b, p) { return a + (b - a) * Math.pow(this.next(), p); }
  /** exponential with mean m */
  exp(m) { return -Math.log(1 - this.next() * 0.999999) * m; }
  /** derived independent generator; label can be a number or string */
  fork(label) {
    const l = typeof label === 'number' ? label | 0 : hashString(String(label));
    return new Rng(hash2(this.seed ^ 0x5bd1e995, l) ^ (this.u32() & 0));
  }
  /** derived generator that also depends on current state (consumes one draw) */
  spawn() { return new Rng(hash2(this.u32(), this.seed)); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}
