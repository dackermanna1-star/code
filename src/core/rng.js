// Deterministic random utilities. Every procedural decision in the world
// flows from seeded generators so the alley is identical on every load.

export function hashU32(x) {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function hash2i(x, y, seed = 0) {
  return hashU32((x | 0) * 0x27d4eb2d ^ hashU32((y | 0) + 0x165667b1 * (seed | 0) + 0x9e3779b9));
}

export function hash3i(x, y, z, seed = 0) {
  return hashU32((x | 0) * 0x27d4eb2d ^ hashU32((y | 0) * 0x165667b1 ^ hashU32((z | 0) + 0x9e3779b9 * ((seed | 0) + 1))));
}

/** Uniform float in [0,1) from integer lattice coordinates. */
export function rand2(x, y, seed = 0) {
  return hash2i(x, y, seed) / 4294967296;
}

export function rand3(x, y, z, seed = 0) {
  return hash3i(x, y, z, seed) / 4294967296;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  normal(mean = 0, sd = 1) {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  weighted(items, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  fork(salt) {
    const s = typeof salt === 'string' ? hashString(salt) : salt >>> 0;
    return new RNG(hashU32(this.s ^ hashU32(s + 0x632be5ab)));
  }
}
