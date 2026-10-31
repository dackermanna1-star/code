/**
 * Deterministic, seedable pseudo-random number generation.
 *
 * Every random decision in the simulation (fighter generation, AI choices,
 * hazards, cinematic selection) flows through an Rng instance so that a battle
 * is fully reproducible from its seed. Presentation-only effects may use their
 * own Rng streams; they never feed back into the simulation.
 */

/** Hash an arbitrary string into a 32-bit seed (cyrb53-style mix, truncated). */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** splitmix32 — used to expand a single seed into well-distributed state words. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  /** Number of values drawn so far (useful for debugging determinism). */
  draws = 0;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm();
    // Warm up.
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  /** sfc32 core: fast, small state, good statistical quality. */
  nextU32(): number {
    this.draws++;
    const a = this.a, b = this.b, c = this.c, d = this.d;
    const t = (((a + b) >>> 0) + d) >>> 0;
    this.d = (d + 1) >>> 0;
    this.a = b ^ (b >>> 9);
    this.b = (c + (c << 3)) >>> 0;
    const cr = (c << 21) | (c >>> 11);
    this.c = (cr + t) >>> 0;
    return t;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** -1 or +1 with equal probability. */
  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick. Weights <= 0 are never chosen (unless all are <= 0). */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i]);
    if (total <= 0) return items[Math.floor(this.next() * items.length)];
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      const w = Math.max(0, weights[i]);
      if (r < w) return items[i];
      r -= w;
    }
    return items[items.length - 1];
  }

  /** Weighted pick from [item, weight] tuples. */
  weightedPairs<T>(pairs: readonly (readonly [T, number])[]): T {
    return this.weighted(
      pairs.map((p) => p[0]),
      pairs.map((p) => p[1]),
    );
  }

  /**
   * Softmax selection: picks an index with probability proportional to
   * exp(score / temperature). Low temperature = greedy, high = exploratory.
   */
  softmaxIndex(scores: readonly number[], temperature: number): number {
    if (scores.length === 0) return -1;
    let max = -Infinity;
    for (const s of scores) if (s > max) max = s;
    const t = Math.max(1e-4, temperature);
    const w = scores.map((s) => (Number.isFinite(s) ? Math.exp((s - max) / t) : 0));
    let total = 0;
    for (const x of w) total += x;
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < w.length; i++) {
      if (r < w[i]) return i;
      r -= w[i];
    }
    return w.length - 1;
  }

  /** Standard normal via Box–Muller. */
  gaussian(mean = 0, std = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Derive an independent child stream (deterministic). */
  fork(label: string): Rng {
    return new Rng((this.nextU32() ^ hashString(label)) >>> 0);
  }
}

/** Create a fresh random seed for a new battle (only place Math.random is used). */
export function freshSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Human-friendly seed codes like "7F3A-91C2". */
export function seedToCode(seed: number): string {
  const hex = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function codeToSeed(code: string): number | null {
  const clean = code.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 0 || clean.length > 8) return null;
  const n = parseInt(clean, 16);
  return Number.isFinite(n) ? n >>> 0 : null;
}
