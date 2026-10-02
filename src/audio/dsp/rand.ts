/**
 * Deterministic PRNG for sound synthesis (mulberry32 core, same algorithm family as
 * `src/core/rng.ts`). It lives here so the audio module is a self-contained leaf that can
 * be bundled into the synthesis worker without pulling in world code, and it adds a few
 * DSP-specific helpers (bipolar noise, log-uniform ranges, heavy-tailed amplitudes).
 */
export class Rand {
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
  /** Uniform float in [-1, 1) — white noise sample. */
  bi(): number {
    return this.next() * 2 - 1;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
  /** Log-uniform value in [lo, hi] (frequencies, durations). */
  log(lo: number, hi: number): number {
    return lo * Math.pow(hi / lo, this.next());
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)];
  }
  /** Approximately normal (mean 0, sd 1). */
  gauss(): number {
    const u = Math.max(1e-12, this.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * this.next());
  }
  /** Heavy-tailed amplitude in (0, 1]: most values small, a few large (crackles, grains). */
  tail(power = 3): number {
    return Math.pow(this.next(), power);
  }
  /** Independent child stream. */
  fork(salt: number): Rand {
    return new Rand(mix32(this.s, salt));
  }
}

/** FNV-1a string hash → uint32. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mixes two 32-bit values into a well distributed seed. */
export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
