// Seeded pseudo-random utilities used by all offline synthesis.
// Real-time scheduling may use Math.random; buffer synthesis must use these.

export function hash32(x) {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic hash of up to three integers -> [0,1). */
export function hash01(a, b = 0, c = 0) {
  const h = hash32((a | 0) ^ hash32(((b | 0) + 0x165667b1) | 0) ^ hash32(((c | 0) ^ 0x5bd1e995) | 0));
  return h / 4294967296;
}

export class Rng {
  constructor(seed = 1) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  /** mulberry32 */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  /** inclusive integer range */
  int(a, b) { return a + Math.floor((b - a + 1) * this.next()); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gauss() {
    let u = 0;
    while (u === 0) u = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
  /** exponential with given mean */
  exp(mean) { return -Math.log(1 - this.next() * 0.999999) * mean; }
  /** log-uniform in [a,b] */
  logRange(a, b) { return a * Math.pow(b / a, this.next()); }
  seed32() { return (this.next() * 4294967296) >>> 0; }
  /** independent child stream (consumes one value of this stream) */
  fork(label = '') { return new Rng(hash32(this.seed32() ^ hashStr(String(label)))); }
}

/** Independent stream derived from a base seed and a label (does not consume). */
export function deriveRng(baseSeed, label) {
  return new Rng(hash32((baseSeed >>> 0) ^ hashStr(String(label))));
}

/** Fast white noise generator in [-1,1) (xorshift32). */
export function noiseGen(seed) {
  let s = (seed | 0) || 0x2545f491;
  return function () {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s * 4.656612873077393e-10;
  };
}
