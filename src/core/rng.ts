// Deterministic random number utilities. Everything procedural derives from a run seed.

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** mulberry32 */
  nextU32(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  next(): number {
    return this.nextU32() / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    // inclusive
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  fork(salt: number): Rng {
    return new Rng(hash2(this.nextU32(), salt));
  }
}

export function hash1(a: number): number {
  let h = a | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hash2(a: number, b: number): number {
  return hash1(hash1(a) ^ Math.imul(b | 0, 0x9e3779b1));
}

export function hash3(a: number, b: number, c: number): number {
  return hash1(hash2(a, b) ^ Math.imul(c | 0, 0x85ebca77));
}

export function hash4(a: number, b: number, c: number, d: number): number {
  return hash1(hash3(a, b, c) ^ Math.imul(d | 0, 0xc2b2ae3d));
}

/** Float in [0,1) from integer coordinates. */
export function rand3(a: number, b: number, c: number, seed: number): number {
  return hash4(a, b, c, seed) / 4294967296;
}

/** Fast, non-deterministic-per-run RNG used inside the cellular simulation (xorshift32). */
export class FastRng {
  s: number;
  constructor(seed = 0x1234567) {
    this.s = seed >>> 0 || 1;
  }
  u32(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s;
  }
  f(): number {
    return this.u32() / 4294967296;
  }
  int(n: number): number {
    return this.u32() % n;
  }
}
