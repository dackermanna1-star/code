/**
 * Core DSP primitives operating on Float32Array buffers (sample-rate agnostic: every
 * parameter is in seconds / Hz). Pure functions + tiny filter classes, no DOM — usable in
 * the synthesis worker, on the main thread and in Node.
 */
import type { Rand } from './rand';

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(1e-12, g));
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const semis = (s: number): number => Math.pow(2, s / 12);
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Allocate a mono buffer long enough for `seconds`. */
export function alloc(sr: number, seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.ceil(seconds * sr)));
}

// ---------------------------------------------------------------------------------------
// Envelopes / breakpoint curves. A curve is a flat array [t0, v0, t1, v1, ...], t ascending.
// ---------------------------------------------------------------------------------------

/** Piecewise-linear value of a breakpoint curve at time t (end values held). */
export function env(pts: readonly number[], t: number): number {
  const n = pts.length;
  if (n === 0) return 0;
  if (t <= pts[0]) return pts[1];
  for (let i = 2; i < n; i += 2) {
    if (t <= pts[i]) {
      const t0 = pts[i - 2];
      const t1 = pts[i];
      const v0 = pts[i - 1];
      const v1 = pts[i + 1];
      return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1;
    }
  }
  return pts[n - 1];
}

/** Like `env` but interpolates in the log domain (frequencies, pitches). Values must be > 0. */
export function envLog(pts: readonly number[], t: number): number {
  const n = pts.length;
  if (n === 0) return 1;
  if (t <= pts[0]) return pts[1];
  for (let i = 2; i < n; i += 2) {
    if (t <= pts[i]) {
      const t0 = pts[i - 2];
      const t1 = pts[i];
      const v0 = pts[i - 1];
      const v1 = pts[i + 1];
      if (t1 <= t0) return v1;
      return v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
    }
  }
  return pts[n - 1];
}

/** Scales the time axis of a curve (e.g. normalized 0..1 → seconds). */
export function scaleCurve(pts: readonly number[], tScale: number, vScale = 1): number[] {
  const o: number[] = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    o[i] = pts[i] * tScale;
    o[i + 1] = pts[i + 1] * vScale;
  }
  return o;
}

/** Samples a breakpoint curve to a per-sample control array (sequential walk, O(n)). */
export function curve(sr: number, n: number, pts: readonly number[], log = false, t0 = 0): Float32Array {
  const out = new Float32Array(n);
  const m = pts.length;
  if (m === 0) return out;
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / sr;
    while (seg + 2 < m && t > pts[seg + 2]) seg += 2;
    let v: number;
    if (t <= pts[0]) v = pts[1];
    else if (seg + 2 >= m) v = pts[m - 1];
    else {
      const ta = pts[seg];
      const tb = pts[seg + 2];
      const va = pts[seg + 1];
      const vb = pts[seg + 3];
      const u = tb > ta ? (t - ta) / (tb - ta) : 1;
      v = log ? va * Math.pow(vb / va, u) : va + (vb - va) * u;
    }
    out[i] = v;
  }
  return out;
}

/** Attack/decay envelope value: linear attack `a` seconds, exponential decay to -60 dB after `d`. */
export function adEnv(t: number, a: number, d: number): number {
  if (t < 0) return 0;
  if (t < a) return t / a;
  return Math.exp((-6.907755 * (t - a)) / d);
}

/** Multiplies a buffer by a breakpoint envelope (time in seconds from `from`). */
export function applyEnv(b: Float32Array, sr: number, pts: readonly number[], from = 0, to = b.length): Float32Array {
  const m = pts.length;
  let seg = 0;
  for (let i = from; i < to; i++) {
    const t = (i - from) / sr;
    while (seg + 2 < m && t > pts[seg + 2]) seg += 2;
    let v: number;
    if (t <= pts[0]) v = pts[1];
    else if (seg + 2 >= m) v = pts[m - 1];
    else {
      const ta = pts[seg];
      const tb = pts[seg + 2];
      v = pts[seg + 1] + ((pts[seg + 3] - pts[seg + 1]) * (t - ta)) / Math.max(1e-9, tb - ta);
    }
    b[i] *= v;
  }
  return b;
}

/** Multiplies by an exponential decay starting at `from` (−60 dB after t60 seconds). */
export function applyDecay(b: Float32Array, sr: number, t60: number, from = 0, attack = 0): Float32Array {
  const k = Math.exp(-6.907755 / (t60 * sr));
  const na = Math.round(attack * sr);
  let e = 1;
  for (let i = from; i < b.length; i++) {
    const j = i - from;
    if (j < na) b[i] *= j / na;
    else {
      b[i] *= e;
      e *= k;
    }
  }
  return b;
}

// ---------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------

export type BQType = 'lp' | 'hp' | 'bp' | 'notch' | 'peak' | 'ls' | 'hs' | 'ap';

/** RBJ-cookbook biquad, transposed direct form II. `bp` = constant 0 dB peak gain. */
export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  z1 = 0;
  z2 = 0;
  constructor(type?: BQType, sr?: number, f?: number, q = 0.7071, gainDb = 0) {
    if (type && sr && f) this.set(type, sr, f, q, gainDb);
  }
  set(type: BQType, sr: number, f: number, q = 0.7071, gainDb = 0): this {
    const fc = clamp(f, 5, sr * 0.49);
    const w = (TAU * fc) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const Q = Math.max(0.05, q);
    const alpha = sw / (2 * Q);
    const A = Math.pow(10, gainDb / 40);
    let b0 = 1;
    let b1 = 0;
    let b2 = 0;
    let a0 = 1;
    let a1 = 0;
    let a2 = 0;
    switch (type) {
      case 'lp':
        b0 = (1 - cw) / 2;
        b1 = 1 - cw;
        b2 = (1 - cw) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'hp':
        b0 = (1 + cw) / 2;
        b1 = -(1 + cw);
        b2 = (1 + cw) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'bp':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1;
        b1 = -2 * cw;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'ap':
        b0 = 1 - alpha;
        b1 = -2 * cw;
        b2 = 1 + alpha;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A;
        b1 = -2 * cw;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cw;
        a2 = 1 - alpha / A;
        break;
      case 'ls': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + s);
        b1 = 2 * A * (A - 1 - (A + 1) * cw);
        b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s;
        a1 = -2 * (A - 1 + (A + 1) * cw);
        a2 = A + 1 + (A - 1) * cw - s;
        break;
      }
      case 'hs': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + s);
        b1 = -2 * A * (A - 1 + (A + 1) * cw);
        b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s;
        a1 = 2 * (A - 1 - (A + 1) * cw);
        a2 = A + 1 - (A - 1) * cw - s;
        break;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }
  reset(): this {
    this.z1 = this.z2 = 0;
    return this;
  }
  tick(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  run(b: Float32Array, from = 0, to = b.length): Float32Array {
    const b0 = this.b0;
    const b1 = this.b1;
    const b2 = this.b2;
    const a1 = this.a1;
    const a2 = this.a2;
    let z1 = this.z1;
    let z2 = this.z2;
    for (let i = from; i < to; i++) {
      const x = b[i];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      b[i] = y;
    }
    this.z1 = z1;
    this.z2 = z2;
    return b;
  }
}

/** One-shot static filter helpers (return the same buffer). */
export const lowpass = (b: Float32Array, sr: number, f: number, q = 0.7071, from = 0, to = b.length) =>
  new Biquad('lp', sr, f, q).run(b, from, to);
export const highpass = (b: Float32Array, sr: number, f: number, q = 0.7071, from = 0, to = b.length) =>
  new Biquad('hp', sr, f, q).run(b, from, to);
export const bandpass = (b: Float32Array, sr: number, f: number, q = 1, from = 0, to = b.length) =>
  new Biquad('bp', sr, f, q).run(b, from, to);
export const peakEq = (b: Float32Array, sr: number, f: number, q: number, db: number) => new Biquad('peak', sr, f, q, db).run(b);
export const lowShelf = (b: Float32Array, sr: number, f: number, db: number) => new Biquad('ls', sr, f, 0.7071, db).run(b);
export const highShelf = (b: Float32Array, sr: number, f: number, db: number) => new Biquad('hs', sr, f, 0.7071, db).run(b);
export const notch = (b: Float32Array, sr: number, f: number, q = 2) => new Biquad('notch', sr, f, q).run(b);

/** Steeper (4-pole) low/high pass. */
export function lowpass4(b: Float32Array, sr: number, f: number): Float32Array {
  new Biquad('lp', sr, f, 0.5412).run(b);
  return new Biquad('lp', sr, f, 1.3066).run(b);
}
export function highpass4(b: Float32Array, sr: number, f: number): Float32Array {
  new Biquad('hp', sr, f, 0.5412).run(b);
  return new Biquad('hp', sr, f, 1.3066).run(b);
}

/** One-pole low-pass in place. */
export function lp1(b: Float32Array, sr: number, fc: number, from = 0, to = b.length): Float32Array {
  const a = Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = from; i < to; i++) {
    y = b[i] + a * (y - b[i]);
    b[i] = y;
  }
  return b;
}
/** One-pole high-pass in place. */
export function hp1(b: Float32Array, sr: number, fc: number, from = 0, to = b.length): Float32Array {
  const a = Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = from; i < to; i++) {
    y = b[i] + a * (y - b[i]);
    b[i] -= y;
  }
  return b;
}

/**
 * Zero-delay-feedback (TPT) state-variable filter — stable under fast modulation.
 * After `tick`, read `.lp`, `.bp` (peak gain Q; multiply by k for 0 dB), `.hp`.
 */
export class SVF {
  ic1 = 0;
  ic2 = 0;
  lp = 0;
  bp = 0;
  hp = 0;
  tick(x: number, g: number, k: number): void {
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - k * v1 - v2;
  }
  reset(): void {
    this.ic1 = this.ic2 = this.lp = this.bp = this.hp = 0;
  }
}

export type SweepMode = 'lp' | 'hp' | 'bp' | 'notch';

/**
 * Time-varying SVF over a buffer region. `f` and `q` are breakpoint curves in seconds from
 * `from` (frequency interpolated logarithmically) or constants. `bp` is normalized to 0 dB.
 */
export function sweep(
  b: Float32Array,
  sr: number,
  mode: SweepMode,
  f: number | readonly number[],
  q: number | readonly number[] = 0.7071,
  from = 0,
  to = b.length,
): Float32Array {
  const s = new SVF();
  const blk = 16;
  const maxF = sr * 0.45;
  const wl = mode === 'lp' || mode === 'notch' ? 1 : 0;
  const wh = mode === 'hp' || mode === 'notch' ? 1 : 0;
  const wb = mode === 'bp' ? 1 : 0;
  for (let i = from; i < to; i += blk) {
    const t = (i - from) / sr;
    const fc = clamp(typeof f === 'number' ? f : envLog(f, t), 8, maxF);
    const qq = Math.max(0.1, typeof q === 'number' ? q : env(q, t));
    const g = Math.tan((Math.PI * fc) / sr);
    const k = 1 / qq;
    const e = Math.min(to, i + blk);
    const kb = wb * k;
    for (let j = i; j < e; j++) {
      s.tick(b[j], g, k);
      b[j] = wl * s.lp + wh * s.hp + kb * s.bp;
    }
  }
  return b;
}

/** Same as `sweep` but with per-sample frequency array (Hz). */
export function sweepArr(b: Float32Array, sr: number, mode: SweepMode, f: Float32Array, q: number, from = 0): Float32Array {
  const s = new SVF();
  const k = 1 / Math.max(0.1, q);
  const maxF = sr * 0.45;
  const wl = mode === 'lp' || mode === 'notch' ? 1 : 0;
  const wh = mode === 'hp' || mode === 'notch' ? 1 : 0;
  const kb = mode === 'bp' ? k : 0;
  let g = 0;
  for (let j = 0; j < f.length && from + j < b.length; j++) {
    if ((j & 7) === 0) g = Math.tan((Math.PI * clamp(f[j], 8, maxF)) / sr);
    s.tick(b[from + j], g, k);
    b[from + j] = wl * s.lp + wh * s.hp + kb * s.bp;
  }
  return b;
}

// ---------------------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------------------

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Fresh noise buffer (normalized to roughly unit peak). */
export function noise(r: Rand, n: number, color: NoiseColor = 'white'): Float32Array {
  const o = new Float32Array(n);
  addNoise(o, r, 0, n, 1, color);
  return o;
}

/** Adds noise of a colour into [from, to). Pink uses Paul Kellet's refined filter. */
export function addNoise(o: Float32Array, r: Rand, from: number, to: number, amp: number, color: NoiseColor = 'white'): Float32Array {
  to = Math.min(to, o.length);
  if (color === 'white') {
    for (let i = from; i < to; i++) o[i] += amp * r.bi();
  } else if (color === 'pink') {
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    const g = amp * 0.11;
    for (let i = from; i < to; i++) {
      const w = r.bi();
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      o[i] += g * (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362);
      b6 = w * 0.115926;
    }
  } else {
    let y = 0;
    for (let i = from; i < to; i++) {
      y = (y + 0.02 * r.bi()) / 1.02;
      o[i] += amp * y * 3.5;
    }
  }
  return o;
}

/** Smooth random signal (band-limited random walk) — for slow modulations (wobble, gusts). */
export function smoothRandom(r: Rand, sr: number, n: number, rate: number): Float32Array {
  const o = new Float32Array(n);
  const step = Math.max(1, Math.round(sr / Math.max(0.01, rate)));
  let a = r.bi();
  let b = r.bi();
  for (let i = 0; i < n; i++) {
    const ph = (i % step) / step;
    if (i % step === 0 && i > 0) {
      a = b;
      b = r.bi();
    }
    const s = ph * ph * (3 - 2 * ph);
    o[i] = a + (b - a) * s;
  }
  return o;
}

// ---------------------------------------------------------------------------------------
// Buffer utilities
// ---------------------------------------------------------------------------------------

/** Adds `src` into `dst` starting at sample `at` with gain. */
export function mix(dst: Float32Array, src: Float32Array, at = 0, gain = 1): Float32Array {
  const s0 = Math.max(0, at);
  const n = Math.min(src.length - (s0 - at), dst.length - s0);
  for (let i = 0; i < n; i++) dst[s0 + i] += src[i + (s0 - at)] * gain;
  return dst;
}

/** Adds `src` at time `t` seconds. */
export function mixAt(dst: Float32Array, src: Float32Array, sr: number, t: number, gain = 1): Float32Array {
  return mix(dst, src, Math.round(t * sr), gain);
}

export function scale(b: Float32Array, g: number): Float32Array {
  for (let i = 0; i < b.length; i++) b[i] *= g;
  return b;
}

export function peakAbs(b: Float32Array): number {
  let p = 0;
  for (let i = 0; i < b.length; i++) {
    const a = Math.abs(b[i]);
    if (a > p) p = a;
  }
  return p;
}

export function rmsOf(b: Float32Array, from = 0, to = b.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Soft saturation tanh(drive·x)/tanh(drive). */
export function softClip(b: Float32Array, drive = 1.5): Float32Array {
  const n = 1 / Math.tanh(drive);
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) * n;
  return b;
}

/** Asymmetric saturation (adds even harmonics — growls, overdriven voices). */
export function asymClip(b: Float32Array, drive = 2, bias = 0.2): Float32Array {
  const off = Math.tanh(bias * drive);
  for (let i = 0; i < b.length; i++) b[i] = (Math.tanh((b[i] + bias) * drive) - off) / drive;
  return b;
}

/** Fade-in/out edges (raised-cosine). */
export function fade(b: Float32Array, sr: number, inSec: number, outSec: number): Float32Array {
  const ni = Math.min(b.length, Math.round(inSec * sr));
  const no = Math.min(b.length, Math.round(outSec * sr));
  for (let i = 0; i < ni; i++) b[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ni);
  for (let i = 0; i < no; i++) b[b.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / no);
  return b;
}

export function reverse(b: Float32Array): Float32Array {
  b.reverse();
  return b;
}

/** Resamples by `ratio` (>1 = higher pitch & shorter) with cubic Hermite interpolation. */
export function resample(b: Float32Array, ratio: number): Float32Array {
  const n = Math.max(1, Math.floor((b.length - 1) / ratio));
  const o = new Float32Array(n);
  const L = b.length;
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const k = Math.floor(p);
    const t = p - k;
    const y0 = b[k > 0 ? k - 1 : 0];
    const y1 = b[k];
    const y2 = b[k + 1 < L ? k + 1 : L - 1];
    const y3 = b[k + 2 < L ? k + 2 : L - 1];
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    o[i] = ((c3 * t + c2) * t + c1) * t + y1;
  }
  return o;
}

/** Variable-rate playback (pitch curve) — `rate` per output sample. */
export function varispeed(b: Float32Array, rate: Float32Array): Float32Array {
  const o = new Float32Array(rate.length);
  let p = 0;
  const L = b.length - 1;
  for (let i = 0; i < rate.length; i++) {
    const k = Math.floor(p);
    if (k >= L) break;
    const t = p - k;
    o[i] = b[k] + (b[k + 1] - b[k]) * t;
    p += rate[i];
  }
  return o;
}

/** Removes DC with a gentle high-pass. */
export function dcBlock(b: Float32Array, sr: number, fc = 12): Float32Array {
  const R = Math.exp((-TAU * fc) / sr);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = x - x1 + R * y1;
    x1 = x;
    y1 = y;
    b[i] = y;
  }
  return b;
}

/** Returns the channels truncated after the last sample above `thresh` (+pad), with a short fade. */
export function trimTail(ch: Float32Array[], sr: number, thresh = 2e-4, pad = 0.015): Float32Array[] {
  let peak = 0;
  for (const c of ch) peak = Math.max(peak, peakAbs(c));
  if (peak <= 0) return ch.map((c) => c.subarray(0, Math.min(c.length, Math.round(0.05 * sr))));
  const th = peak * thresh;
  let last = 0;
  for (const c of ch) {
    for (let i = c.length - 1; i > last; i--) {
      if (Math.abs(c[i]) > th) {
        last = i;
        break;
      }
    }
  }
  const n = Math.min(ch[0].length, last + Math.round(pad * sr));
  return ch.map((c) => {
    const o = c.slice(0, n);
    fade(o, sr, 0, Math.min(0.012, n / sr / 4));
    return o;
  });
}

/** Mono → stereo pair with optional decorrelation (short Haas + filter). */
export function toStereo(m: Float32Array, sr: number, width = 0): Float32Array[] {
  const L = m.slice();
  const R = m.slice();
  if (width > 0) {
    const d = Math.round(0.00035 * width * sr) + 1;
    for (let i = R.length - 1; i >= d; i--) R[i] = R[i] * (1 - width * 0.5) + R[i - d] * width * 0.5;
  }
  return [L, R];
}
