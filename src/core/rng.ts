/**
 * Deterministic hashing and pseudo-random number generation.
 *
 * Every procedurally generated object derives its seed from the seeds of its
 * ancestors plus its own coordinates, so any object can be regenerated
 * bit-identically from its catalog identifier.
 */

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export function hashCombine(h: number, v: number): number {
  return mix32((h ^ (v >>> 0)) + 0x9e3779b9 + ((h << 6) >>> 0) + (h >>> 2));
}

/** Hash any finite number (integers up to 2^53 exactly, otherwise its bit pattern). */
export function hashNumber(h: number, x: number): number {
  if (Number.isInteger(x) && Math.abs(x) <= 9007199254740991) {
    const hi = Math.floor(x / 4294967296);
    const lo = x - hi * 4294967296;
    return hashCombine(hashCombine(h, lo), hi | 0);
  }
  F64[0] = x;
  return hashCombine(hashCombine(h, U32[0]), U32[1]);
}

export function hashString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = hashCombine(h, s.charCodeAt(i));
  return hashCombine(h, s.length);
}

export function seedOf(...parts: (number | string)[]): number {
  let h = 0x2545f491;
  for (const p of parts) h = typeof p === 'number' ? hashNumber(h, p) : hashString(h, p);
  return h;
}

/** Fast integer lattice hash used by noise functions. */
export function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

export function hashToUnit(h: number): number {
  return (mix32(h) >>> 0) / 4294967296;
}

/** sfc32 PRNG – small, fast, good statistical quality, fully deterministic. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = mix32(seed ^ 0xdeadbeef);
    this.b = mix32(seed + 0x9e3779b9);
    this.c = mix32(seed ^ 0x85ebca6b);
    this.d = 1;
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, bInclusive: number): number {
    return a + Math.floor(this.next() * (bInclusive - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  logUniform(a: number, b: number): number {
    return Math.exp(this.range(Math.log(a), Math.log(b)));
  }
  normal(mean = 0, sd = 1): number {
    let u = this.next();
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  /** Poisson-distributed integer (Knuth for small means, normal approx for large). */
  poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 40) return Math.max(0, Math.round(this.normal(mean, Math.sqrt(mean))));
    const L = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
  /** Random unit vector, written into out (array-like). */
  unitVector(out: { x: number; y: number; z: number }) {
    const z = this.range(-1, 1);
    const t = this.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    out.x = r * Math.cos(t);
    out.y = r * Math.sin(t);
    out.z = z;
    return out;
  }
  fork(salt: number | string): Rng {
    return new Rng(typeof salt === 'number' ? hashCombine(this.nextU32(), salt) : hashString(this.nextU32(), salt));
  }
}
