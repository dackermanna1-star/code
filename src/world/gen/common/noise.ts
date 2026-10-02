/**
 * Noise helpers for world generation (worker-safe, allocation-free sampling).
 *
 * `OctaveNoise` is a fractal simplex noise with explicitly weighted octaves and random per-octave
 * offsets (so the origin is not a special point). It plays the role of Minecraft's `NormalNoise`:
 * octave `i` has frequency `baseFreq * 2^i` and weight `weights[i]` (zero weights are skipped).
 * Output is normalised so that its standard deviation is approximately `sigma`.
 */
import { SimplexNoise } from '../../../core/noise';
import { Rng } from '../../../core/rng';

/** Empirical std of a single SimplexNoise octave (core/noise.ts). */
const STD2 = 0.443;
const STD3 = 0.426;

export interface OctaveOptions {
  /** Target standard deviation of the output (default 0.4). */
  sigma?: number;
  /** Multiplier for the y frequency (3D only). */
  yScale?: number;
  /** Frequency multiplier between octaves (default 2). */
  lacunarity?: number;
}

export class OctaveNoise {
  private readonly oct: SimplexNoise[] = [];
  private readonly fr: number[] = [];
  private readonly fy: number[] = [];
  private readonly w2: number[] = [];
  private readonly w3: number[] = [];
  private readonly ox: number[] = [];
  private readonly oy: number[] = [];
  private readonly oz: number[] = [];
  readonly count: number;
  /** Upper bound of |output| for 3D sampling (sum of weights * max simplex amplitude). */
  readonly max3: number;
  readonly max2: number;

  constructor(seed: number, baseFreq: number, weights: number[], opts: OctaveOptions = {}) {
    const rng = new Rng(seed ^ 0x5f3759df);
    const sigma = opts.sigma ?? 0.4;
    const lac = opts.lacunarity ?? 2;
    const ys = opts.yScale ?? 1;
    let sumSq = 0, sumAbs = 0;
    for (const w of weights) { sumSq += w * w; sumAbs += Math.abs(w); }
    const k2 = sigma / (STD2 * Math.sqrt(sumSq || 1));
    const k3 = sigma / (STD3 * Math.sqrt(sumSq || 1));
    let f = baseFreq;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      if (w !== 0) {
        this.oct.push(new SimplexNoise(rng.nextU32() | 0));
        this.fr.push(f);
        this.fy.push(f * ys);
        this.w2.push(w * k2);
        this.w3.push(w * k3);
        this.ox.push(rng.float(0, 4096));
        this.oy.push(rng.float(0, 4096));
        this.oz.push(rng.float(0, 4096));
      }
      f *= lac;
    }
    this.count = this.oct.length;
    this.max3 = sumAbs * k3;
    this.max2 = sumAbs * k2;
  }

  noise2(x: number, z: number): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) {
      const f = this.fr[i];
      s += this.w2[i] * this.oct[i].noise2(x * f + this.ox[i], z * f + this.oz[i]);
    }
    return s;
  }

  noise3(x: number, y: number, z: number): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) {
      const f = this.fr[i];
      s += this.w3[i] * this.oct[i].noise3(x * f + this.ox[i], y * this.fy[i] + this.oy[i], z * f + this.oz[i]);
    }
    return s;
  }
}

/** Single-octave 3D simplex with offsets and a frequency; output in [-1, 1] (raw simplex). */
export class RawNoise3 {
  private readonly n: SimplexNoise;
  private readonly ox: number;
  private readonly oy: number;
  private readonly oz: number;
  constructor(seed: number, readonly fxz: number, readonly fy: number) {
    const rng = new Rng(seed ^ 0x2545f491);
    this.n = new SimplexNoise(rng.nextU32() | 0);
    this.ox = rng.float(0, 4096);
    this.oy = rng.float(0, 4096);
    this.oz = rng.float(0, 4096);
  }
  at(x: number, y: number, z: number): number {
    return this.n.noise3(x * this.fxz + this.ox, y * this.fy + this.oy, z * this.fxz + this.oz);
  }
  /** Sample at (x, y, z) / d (Minecraft's weird scaled sampler input). */
  atScaled(x: number, y: number, z: number, inv: number): number {
    return this.n.noise3(x * inv * this.fxz + this.ox, y * inv * this.fy + this.oy, z * inv * this.fxz + this.oz);
  }
}

/** Single-octave 2D simplex with offsets. */
export class RawNoise2 {
  private readonly n: SimplexNoise;
  private readonly ox: number;
  private readonly oz: number;
  constructor(seed: number, readonly f: number) {
    const rng = new Rng(seed ^ 0x68e31da4);
    this.n = new SimplexNoise(rng.nextU32() | 0);
    this.ox = rng.float(0, 4096);
    this.oz = rng.float(0, 4096);
  }
  at(x: number, z: number): number {
    return this.n.noise2(x * this.f + this.ox, z * this.f + this.oz);
  }
}

/** Integer hash of (x, y, z, seed) -> uint32 (good avalanche). */
export function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
/** Hash -> float in [0, 1). */
export function hashF(x: number, y: number, z: number, seed: number): number {
  return hash3i(x, y, z, seed) / 4294967296;
}
/** 2D hash -> float in [0, 1). */
export function hash2F(x: number, z: number, seed: number): number {
  return hash3i(x, 0x51ed27, z, seed) / 4294967296;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (t: number, a: number, b: number) => a + t * (b - a);
/** Minecraft clampedMap. */
export const clampedMap = (v: number, a0: number, a1: number, b0: number, b1: number) => lerp(clamp((v - a0) / (a1 - a0), 0, 1), b0, b1);
