/** Small fast deterministic PRNG (mulberry32 / splitmix-ish). Safe to use in workers. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** Uniform uint32 */
  nextU32(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** Uniform float in [0,1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }
  /** Integer in [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  /** Integer in [lo, hi] inclusive */
  range(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  float(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Approximately normal distributed (mean 0, sd 1). */
  gaussian(): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** Derive a deterministic seed for a chunk/feature from a world seed. */
export function seedFor(worldSeed: number, ...parts: number[]): number {
  let h = worldSeed | 0;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x5bd1e995);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Convert an arbitrary string seed to a 32-bit integer (Java String.hashCode style). */
export function seedFromString(s: string): number {
  const n = Number(s);
  if (s.trim() !== '' && Number.isFinite(n)) return n | 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
