/**
 * Deterministic randomness for the world: a seeded PRNG (mulberry32), integer
 * hashing and smooth value noise. Everything that shapes a level's layout is
 * derived from these so the same level always produces the same route.
 */

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1 - 1e-9));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  /** Pick a key from a weight table. */
  weighted<K extends string>(table: Partial<Record<K, number>>): K {
    let total = 0;
    for (const k in table) total += table[k] ?? 0;
    let r = this.next() * total;
    let last: K | undefined;
    for (const k in table) {
      last = k;
      r -= table[k] ?? 0;
      if (r <= 0) return k;
    }
    return last as K;
  }
}

/** Integer hash -> [0, 1). */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth 1D value noise in [-1, 1] (C2 continuous). */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const u = fade(x - i);
  return lerp(hash2(i, 0, seed), hash2(i + 1, 0, seed), u) * 2 - 1;
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const u = fade(x - ix);
  const v = fade(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
