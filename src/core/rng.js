// Deterministic random helpers. Everything in the world is generated from seeds so the
// city is identical on every visit — which is what makes its small changes noticeable.

/** mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seeded RNG with convenience methods. */
export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0
    this._next = mulberry32(this.seed)
  }
  next() { return this._next() }
  float(min = 0, max = 1) { return min + (max - min) * this._next() }
  int(min, max) { return Math.floor(min + (max - min + 1) * this._next()) } // inclusive
  chance(p) { return this._next() < p }
  pick(arr) { return arr[Math.floor(this._next() * arr.length)] }
  /** Weighted pick: items = [[value, weight], ...] */
  weighted(items) {
    let total = 0
    for (const [, w] of items) total += w
    let r = this._next() * total
    for (const [v, w] of items) { r -= w; if (r <= 0) return v }
    return items[items.length - 1][0]
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  /** Gaussian-ish via sum of uniforms. */
  normal(mean = 0, sd = 1) {
    return mean + sd * (this._next() + this._next() + this._next() + this._next() - 2) * 1.2247
  }
  fork(salt) { return new RNG(hash2(this.seed, salt)) }
}

/** Integer hash of two ints → uint32. */
export function hash2(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

/** Integer hash of three ints → uint32. */
export function hash3(a, b, c) {
  return hash2(hash2(a, b), c)
}

/** Hash → float in [0,1). */
export function hashf(a, b = 0, c = 0) {
  return hash3(a, b, c) / 4294967296
}

/** String → uint32 (FNV-1a). */
export function hashString(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Smooth value noise in 2D, range [0,1). Cheap and deterministic. */
export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hashf(xi, yi, seed), b = hashf(xi + 1, yi, seed)
  const c = hashf(xi, yi + 1, seed), d = hashf(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Fractal value noise (fbm) in 2D, range roughly [0,1). */
export function fbm2(x, y, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * f, y * f, seed + i * 17)
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / norm
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
