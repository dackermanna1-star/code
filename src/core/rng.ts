// Seeded PRNG (mulberry32) + helpers. Deterministic given the seed; cheap to fork.

export class Rng {
  private s: number;

  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Approximately normal (mean 0, sd 1) via sum of uniforms. */
  gauss(): number {
    return this.next() + this.next() + this.next() + this.next() - 2;
  }

  /** Uniform point in the unit ball. */
  inSphere(): { x: number; y: number; z: number } {
    for (;;) {
      const x = this.next() * 2 - 1,
        y = this.next() * 2 - 1,
        z = this.next() * 2 - 1;
      if (x * x + y * y + z * z <= 1) return { x, y, z };
    }
  }

  /** Uniform unit vector. */
  onSphere(): { x: number; y: number; z: number } {
    const p = this.inSphere();
    const l = Math.hypot(p.x, p.y, p.z) || 1;
    return { x: p.x / l, y: p.y / l, z: p.z / l };
  }

  /** A new independent generator derived from this one and an extra salt. */
  fork(salt = 0): Rng {
    return new Rng((Math.floor(this.next() * 4294967296) ^ hash32(salt)) >>> 0);
  }
}

/** 32-bit integer hash (for seeding from ids / quantised positions). */
export function hash32(x: number): number {
  let h = (x | 0) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Combine several numbers (floats are quantised to mm) into a 32-bit seed. */
export function seedFrom(...vals: number[]): number {
  let h = 0x811c9dc5;
  for (const v of vals) {
    h = hash32(h ^ Math.round(v * 1000));
  }
  return h >>> 0;
}
