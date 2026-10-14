/**
 * Small seedable PRNG (mulberry32) so games and simulations are reproducible.
 * The logic never touches Math.random: pass a seed (the app can use e.g.
 * Date.now() for a fresh game).
 */
export class Rng {
  private s: number;
  constructor(seed = 0x5eed) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Float in [a, b). */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Integer in [a, b] inclusive, like Python's randint. */
  int(a: number, b: number): number {
    return Math.floor(a + (b - a + 1) * this.next());
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
