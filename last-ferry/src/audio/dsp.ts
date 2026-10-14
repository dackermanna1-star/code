// Pure DSP toolkit for baking procedural sounds into sample buffers (no Web
// Audio, no DOM): seeded noise, band-limited oscillators, RBJ biquads with
// time-varying cutoffs, envelopes, modal strikes, plucked strings and a
// formant voice for groans, screams, grunts, gulls and crowds.
//
// Everything is deterministic for a given seed, so a sound variant always
// bakes to the same samples (the preview and the tests rely on that).

export type Buf = Float32Array<ArrayBuffer>;
/** A parameter that is either constant or a function of time (s). */
export type Param = number | ((t: number) => number);

const TAU = Math.PI * 2;

// ------------------------------------------------------------------- rng

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** 0..1 (mulberry32). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** -1..1 */
  bi(): number {
    return this.next() * 2 - 1;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** FNV-1a hash of a string plus a number (seeds per sound + variant). */
export function hashSeed(str: string, n = 0): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= n + 0x9e37;
  h = Math.imul(h, 0x01000193);
  return h >>> 0;
}

// --------------------------------------------------------------- buffers

export const buf = (n: number): Buf => new Float32Array(Math.max(1, Math.ceil(n)));

const val = (p: Param, t: number) => (typeof p === 'number' ? p : p(t));

/** White noise. */
export function noise(n: number, rng: Rng): Buf {
  const o = buf(n);
  for (let i = 0; i < o.length; i++) o[i] = rng.bi();
  return o;
}

/** Pink noise (Paul Kellet). */
export function pink(n: number, rng: Rng): Buf {
  const o = buf(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < o.length; i++) {
    const w = rng.bi();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return o;
}

/** Brown (red) noise. */
export function brown(n: number, rng: Rng): Buf {
  const o = buf(n);
  let last = 0;
  for (let i = 0; i < o.length; i++) {
    last = (last + 0.02 * rng.bi()) / 1.02;
    o[i] = last * 3.5;
  }
  return o;
}

/** Smoothed random signal (control noise) with ~`rate` changes per second, -1..1. */
export function wander(n: number, sr: number, rate: number, rng: Rng): Buf {
  const o = buf(n);
  const step = Math.max(1, Math.floor(sr / Math.max(0.01, rate)));
  let a = rng.bi();
  let b = rng.bi();
  for (let i = 0; i < o.length; i++) {
    const k = i % step;
    if (k === 0 && i > 0) {
      a = b;
      b = rng.bi();
    }
    const f = k / step;
    const s = f * f * (3 - 2 * f);
    o[i] = a + (b - a) * s;
  }
  return o;
}

// ----------------------------------------------------------- oscillators

function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export type Shape = 'sine' | 'saw' | 'square' | 'tri' | 'pulse';

/** Band-limited oscillator (polyBLEP saw/square/pulse). `pw` = pulse width. */
export function osc(n: number, sr: number, f: Param, shape: Shape = 'sine', phase = 0, pw: Param = 0.5): Buf {
  const o = buf(n);
  let ph = phase - Math.floor(phase);
  const dynF = typeof f !== 'number';
  let dt = Math.min(0.49, Math.max(0, val(f, 0)) / sr);
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    // Time-varying pitch is evaluated every 8 samples (cheap, inaudible steps).
    if (dynF && (i & 7) === 0) dt = Math.min(0.49, Math.max(0, (f as (t: number) => number)(t)) / sr);
    let v: number;
    switch (shape) {
      case 'saw':
        v = 2 * ph - 1 - blep(ph, dt);
        break;
      case 'square':
      case 'pulse': {
        const w = shape === 'square' ? 0.5 : Math.min(0.95, Math.max(0.05, val(pw, t)));
        v = ph < w ? 1 : -1;
        v += blep(ph, dt);
        let p2 = ph - w;
        if (p2 < 0) p2 += 1;
        v -= blep(p2, dt);
        break;
      }
      case 'tri':
        v = 1 - 4 * Math.abs(ph - 0.5);
        break;
      default:
        v = Math.sin(TAU * ph);
    }
    o[i] = v;
    ph += dt;
    if (ph >= 1) ph -= 1;
  }
  return o;
}

/** Sum of exponentially decaying sines: a struck object. modes: [freq Hz, decay s (to 1/e), amp]. */
export function modal(n: number, sr: number, modes: Array<[number, number, number]>, rng?: Rng): Buf {
  const o = buf(n);
  for (const [f, d, a] of modes) {
    if (f <= 0 || f >= sr / 2) continue;
    const w = (TAU * f) / sr;
    const k = Math.exp(-1 / (Math.max(1e-4, d) * sr));
    // Recursive sine: y[n] = 2cos(w) y[n-1] - y[n-2], scaled by decay.
    const c = 2 * Math.cos(w);
    const ph = rng ? rng.next() * TAU : 0;
    let y1 = Math.sin(ph - w);
    let y2 = Math.sin(ph - 2 * w);
    let amp = a;
    for (let i = 0; i < o.length; i++) {
      const y = c * y1 - y2;
      y2 = y1;
      y1 = y;
      o[i] += y * amp;
      amp *= k;
      if (amp < 1e-5) break;
    }
  }
  return o;
}

/** Karplus-Strong plucked string. `decay` ≈ seconds to -60 dB, `bright` 0..1. */
export function pluck(n: number, sr: number, f: number, decay: number, bright: number, rng: Rng): Buf {
  const o = buf(n);
  const len = Math.max(2, Math.round(sr / f));
  const line = new Float32Array(len);
  for (let i = 0; i < len; i++) line[i] = rng.bi();
  const g = Math.pow(0.001, 1 / (decay * f));
  const b = 0.5 + 0.5 * Math.min(1, Math.max(0, bright));
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < o.length; i++) {
    const cur = line[idx];
    const y = g * (b * cur + (1 - b) * prev);
    prev = cur;
    line[idx] = y;
    o[i] = cur;
    idx = (idx + 1) % len;
  }
  return o;
}

// ---------------------------------------------------------------- filters

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'notch' | 'lowshelf' | 'highshelf';

/** RBJ cookbook biquad (transposed direct form II). */
export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  z1 = 0;
  z2 = 0;

  set(type: FilterType, sr: number, f: number, q = 0.707, gainDb = 0): this {
    const fc = Math.min(sr * 0.45, Math.max(10, f));
    const w = (TAU * fc) / sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const alpha = sn / (2 * Math.max(0.05, q));
    const A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'highpass':
        b0 = (1 + cs) / 2;
        b1 = -(1 + cs);
        b2 = (1 + cs) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'bandpass':
        // Constant 0 dB peak gain.
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1;
        b1 = -2 * cs;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A;
        b1 = -2 * cs;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cs;
        a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cs + s);
        b1 = 2 * A * (A - 1 - (A + 1) * cs);
        b2 = A * (A + 1 - (A - 1) * cs - s);
        a0 = A + 1 + (A - 1) * cs + s;
        a1 = -2 * (A - 1 + (A + 1) * cs);
        a2 = A + 1 + (A - 1) * cs - s;
        break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cs + s);
        b1 = -2 * A * (A - 1 + (A + 1) * cs);
        b2 = A * (A + 1 + (A - 1) * cs - s);
        a0 = A + 1 - (A - 1) * cs + s;
        a1 = 2 * (A - 1 - (A + 1) * cs);
        a2 = A + 1 - (A - 1) * cs - s;
        break;
      }
      default:
        b0 = (1 - cs) / 2;
        b1 = 1 - cs;
        b2 = (1 - cs) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }

  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/**
 * Filter `x` in place. Frequency, Q and gain may be functions of time; the
 * coefficients are then recomputed every `step` samples.
 */
export function filter(x: Buf, sr: number, type: FilterType, f: Param, q: Param = 0.707, gainDb: Param = 0, step = 16): Buf {
  const bq = new Biquad();
  const dyn = typeof f !== 'number' || typeof q !== 'number' || typeof gainDb !== 'number';
  bq.set(type, sr, val(f, 0), val(q, 0), val(gainDb, 0));
  for (let i = 0; i < x.length; i++) {
    if (dyn && i % step === 0 && i > 0) {
      const t = i / sr;
      bq.set(type, sr, val(f, t), val(q, t), val(gainDb, t));
    }
    const y = bq.run(x[i]);
    x[i] = Number.isFinite(y) ? y : 0;
  }
  return x;
}

export const lp = (x: Buf, sr: number, f: Param, q: Param = 0.707) => filter(x, sr, 'lowpass', f, q);
export const hp = (x: Buf, sr: number, f: Param, q: Param = 0.707) => filter(x, sr, 'highpass', f, q);
export const bp = (x: Buf, sr: number, f: Param, q: Param = 1) => filter(x, sr, 'bandpass', f, q);
export const peq = (x: Buf, sr: number, f: Param, q: Param, db: Param) => filter(x, sr, 'peak', f, q, db);

/** One-pole lowpass (cheap smoothing / tilt). */
export function lp1(x: Buf, sr: number, f: number): Buf {
  const a = Math.exp((-TAU * f) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = x[i] * (1 - a) + y * a;
    x[i] = y;
  }
  return x;
}

/** DC blocker / gentle highpass. */
export function dcBlock(x: Buf, r = 0.995): Buf {
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - x1 + r * y1;
    x1 = x[i];
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Feedback comb (resonant metallic / hollow colouring), in place. */
export function comb(x: Buf, sr: number, delaySec: number, fb: number, mix = 0.5, damp = 0.2): Buf {
  const len = Math.max(1, Math.round(delaySec * sr));
  const line = new Float32Array(len);
  let idx = 0;
  let lpz = 0;
  for (let i = 0; i < x.length; i++) {
    const d = line[idx];
    lpz = d * (1 - damp) + lpz * damp;
    line[idx] = x[i] + lpz * fb;
    x[i] = x[i] * (1 - mix) + d * mix;
    idx = (idx + 1) % len;
  }
  return x;
}

/** Echo: adds `repeats` decaying, darkening copies of x into itself. */
export function echo(x: Buf, sr: number, delaySec: number, gain: number, repeats = 1, lpHz = 2500): Buf {
  const d = Math.round(delaySec * sr);
  const src = Float32Array.from(x);
  let g = gain;
  let cur: Buf = src;
  for (let r = 1; r <= repeats; r++) {
    cur = lp1(Float32Array.from(cur), sr, lpHz);
    const off = d * r;
    for (let i = 0; i + off < x.length; i++) x[i + off] += cur[i] * g;
    g *= gain;
  }
  return x;
}

// -------------------------------------------------------------- envelopes

/** Linear attack then exponential decay (time constant `decay`, s). */
export function perc(n: number, sr: number, attack: number, decay: number, delay = 0): Buf {
  const o = buf(n);
  const a = Math.max(1, attack * sr);
  const d0 = Math.round(delay * sr);
  const k = Math.exp(-1 / (Math.max(1e-4, decay) * sr));
  let v = 1;
  for (let i = d0; i < o.length; i++) {
    const j = i - d0;
    if (j < a) o[i] = j / a;
    else {
      v *= k;
      o[i] = v;
    }
  }
  return o;
}

/** Piecewise-linear envelope through [t, v] points (held before/after). */
export function env(n: number, sr: number, pts: Array<[number, number]>): Buf {
  const o = buf(n);
  const f = curve(pts);
  for (let i = 0; i < o.length; i++) o[i] = f(i / sr);
  return o;
}

/** Piecewise-linear function of time through [t, v] points. */
export function curve(pts: Array<[number, number]>): (t: number) => number {
  const p = pts.slice().sort((a, b) => a[0] - b[0]);
  return (t: number) => {
    if (t <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (t <= p[i][0]) {
        const [t0, v0] = p[i - 1];
        const [t1, v1] = p[i];
        return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
      }
    }
    return p[p.length - 1][1];
  };
}

/** Exponential sweep from f0 to f1 over `dur` s (held after). */
export function sweep(f0: number, f1: number, dur: number, delay = 0): (t: number) => number {
  const r = Math.log(Math.max(1e-6, f1) / Math.max(1e-6, f0));
  return (t: number) => {
    const u = Math.min(1, Math.max(0, (t - delay) / Math.max(1e-6, dur)));
    return f0 * Math.exp(r * u);
  };
}

// ----------------------------------------------------------------- mixing

/** dst += src * g, starting at `at` seconds (clipped to dst). */
export function add(dst: Buf, src: Buf, g = 1, at = 0, sr = 48000): Buf {
  const off = Math.round(at * sr);
  const n = Math.min(src.length, dst.length - off);
  for (let i = Math.max(0, -off); i < n; i++) dst[i + off] += src[i] * g;
  return dst;
}

/** x *= e (element-wise, e may be shorter: the rest is zeroed). */
export function mul(x: Buf, e: Buf): Buf {
  const n = Math.min(x.length, e.length);
  for (let i = 0; i < n; i++) x[i] *= e[i];
  for (let i = n; i < x.length; i++) x[i] = 0;
  return x;
}

export function gain(x: Buf, g: number): Buf {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** Soft saturation, normalised so a full-scale input stays full-scale. */
export function drive(x: Buf, k: number): Buf {
  const n = Math.tanh(k);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * k) / n;
  return x;
}

/** Asymmetric "tube" saturation (adds even harmonics: warmer / rougher). */
export function warm(x: Buf, k: number, bias = 0.25): Buf {
  const off = Math.tanh(bias * k);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh((x[i] + bias) * k) - off;
  return dcBlock(x);
}

export function peakOf(x: Buf): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > p) p = a;
  }
  return p;
}

export function normalize(x: Buf, peak = 0.95): Buf {
  const p = peakOf(x);
  if (p > 1e-9) gain(x, peak / p);
  return x;
}

/** Short fades at both ends (clicks). */
export function fade(x: Buf, sr: number, inMs = 1, outMs = 8): Buf {
  const a = Math.min(x.length, Math.round((inMs / 1000) * sr));
  const b = Math.min(x.length, Math.round((outMs / 1000) * sr));
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

/** Resample by `ratio` (>1 = higher pitch, shorter). Linear interpolation. */
export function resample(x: Buf, ratio: number): Buf {
  const n = Math.max(1, Math.floor(x.length / ratio));
  const o = buf(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const j = Math.floor(p);
    const f = p - j;
    o[i] = (x[j] ?? 0) * (1 - f) + (x[j + 1] ?? 0) * f;
  }
  return o;
}

/** Copy a mono buffer to a slightly decorrelated stereo pair (Haas + tilt). */
export function widen(x: Buf, sr: number, ms = 9, side = 0.3): [Buf, Buf] {
  const d = Math.round((ms / 1000) * sr);
  const l = Float32Array.from(x);
  const r = buf(x.length);
  for (let i = 0; i < x.length; i++) r[i] = x[i] * (1 - side) + (i >= d ? x[i - d] : 0) * side;
  for (let i = 0; i < x.length; i++) l[i] = x[i] * (1 - side * 0.5) + (i >= d * 2 ? x[i - d * 2] : 0) * side * 0.5;
  return [l, r];
}

// ---------------------------------------------------------- formant voice

/** Formant frequencies (Hz) for a few vowels (adult male). */
export const VOWELS = {
  a: [730, 1090, 2440, 3400],
  o: [570, 840, 2410, 3300],
  u: [300, 870, 2240, 3200],
  uh: [640, 1190, 2390, 3300],
  e: [530, 1840, 2480, 3400],
  i: [270, 2290, 3010, 3600],
  ae: [660, 1720, 2410, 3400],
  er: [490, 1350, 1690, 3200],
  ou: [400, 750, 2400, 3200],
} as const;
export type Vowel = keyof typeof VOWELS;

export interface VoiceOpts {
  /** Fundamental (Hz) over time. */
  f0: Param;
  /** Vowel path: [t, vowel] points (formants glide linearly between them). */
  vowels: Array<[number, Vowel]>;
  /** Scale all formants (vocal-tract size: <1 bigger / lower). */
  tract?: number;
  /** Amplitude envelope over time. */
  amp: Param;
  /** Aspiration noise 0..1. */
  breath?: number;
  /** Random f0 wobble, fraction (0.02 = ±2%). */
  jitter?: number;
  /** Vocal fry / creak 0..1: irregular, skipped glottal pulses. */
  fry?: number;
  /** Wet gurgle 0..1: fast random amplitude + pitch modulation. */
  gurgle?: number;
  /** Formant bandwidth scale (wider = muddier). */
  bw?: number;
  /** Glottal brightness 0..1 (pressed / screaming voices are brighter). */
  bright?: number;
}

/**
 * A glottal pulse train (band-limited saw with jitter, fry and aspiration)
 * through a cascade of four time-varying formant resonators.
 */
export function voice(n: number, sr: number, rng: Rng, o: VoiceOpts): Buf {
  const out = buf(n);
  const tract = o.tract ?? 1;
  const breath = o.breath ?? 0.08;
  const jitter = o.jitter ?? 0.01;
  const fry = o.fry ?? 0;
  const gurgle = o.gurgle ?? 0;
  const bwScale = o.bw ?? 1;
  const bright = Math.min(1, Math.max(0, o.bright ?? 0.4));
  const wob = wander(n, sr, 6, rng);
  const gw = gurgle > 0 ? wander(n, sr, 14 + rng.next() * 8, rng) : null;
  const vpts = o.vowels.slice().sort((a, b) => a[0] - b[0]);
  const fmt = (t: number, k: number) => {
    if (t <= vpts[0][0]) return VOWELS[vpts[0][1]][k];
    for (let i = 1; i < vpts.length; i++) {
      if (t <= vpts[i][0]) {
        const a = VOWELS[vpts[i - 1][1]][k];
        const b = VOWELS[vpts[i][1]][k];
        const u = (t - vpts[i - 1][0]) / Math.max(1e-6, vpts[i][0] - vpts[i - 1][0]);
        const s = u * u * (3 - 2 * u);
        return a + (b - a) * s;
      }
    }
    return VOWELS[vpts[vpts.length - 1][1]][k];
  };
  // Resonator states (2-pole, unity gain at the centre).
  const BW = [80, 100, 140, 200];
  const st = [0, 0, 0, 0, 0, 0, 0, 0];
  const co = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const setCo = (t: number) => {
    for (let k = 0; k < 4; k++) {
      const f = Math.min(sr * 0.45, fmt(t, k) * tract);
      const bw = BW[k] * bwScale * (1 + 0.6 * gurgle);
      const r = Math.exp((-Math.PI * bw) / sr);
      const c = -r * r;
      const b = 2 * r * Math.cos((TAU * f) / sr);
      co[k * 3] = 1 - b - c;
      co[k * 3 + 1] = b;
      co[k * 3 + 2] = c;
    }
  };
  setCo(0);
  let ph = 0;
  let f0v = val(o.f0, 0);
  let av = val(o.amp, 0);
  let pulseAmp = 1;
  let tilt = 0;
  const tiltA = Math.exp((-TAU * (500 + 2500 * bright)) / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (i % 32 === 0) setCo(t);
    if ((i & 7) === 0) {
      f0v = val(o.f0, t);
      av = val(o.amp, t);
    }
    let f0 = f0v * (1 + jitter * wob[i]);
    if (gw) f0 *= 1 + 0.12 * gurgle * gw[i];
    const dt = Math.min(0.45, Math.max(0, f0) / sr);
    // Glottal source: saw with a blep, then a one-pole tilt.
    let src = (2 * ph - 1 - blep(ph, dt)) * pulseAmp;
    ph += dt;
    if (ph >= 1) {
      ph -= 1;
      // New glottal period: fry skips / weakens pulses irregularly.
      pulseAmp = fry > 0 && rng.next() < fry * 0.55 ? rng.next() * (1 - fry * 0.8) : 1 - fry * 0.25 * rng.next();
    }
    tilt = src * (1 - tiltA) + tilt * tiltA;
    src = tilt * 2.2;
    // Aspiration (more of it in the open phase).
    src += rng.bi() * breath * (0.4 + 0.6 * ph);
    let a = av;
    if (gw) a *= Math.max(0, 1 - gurgle * 0.85 * (0.5 + 0.5 * gw[i]));
    src *= a;
    // Cascade of formants.
    let y = src;
    for (let k = 0; k < 4; k++) {
      const yk = co[k * 3] * y + co[k * 3 + 1] * st[k * 2] + co[k * 3 + 2] * st[k * 2 + 1];
      st[k * 2 + 1] = st[k * 2];
      st[k * 2] = yk;
      y = yk;
    }
    out[i] = Number.isFinite(y) ? y : 0;
  }
  // The resonator cascade has a large, formant-dependent gain: return a
  // predictable level (peak 0.9) so callers can saturate it musically.
  return normalize(dcBlock(out), 0.9);
}

// ------------------------------------------------------------- utilities

/** Sequence of short events (impulses → callback) at random times, e.g. crackles. */
export function scatter(dur: number, rate: number, rng: Rng, fn: (t: number, i: number) => void, start = 0): void {
  let t = start;
  let i = 0;
  while (true) {
    t += -Math.log(1 - rng.next() * 0.999) / Math.max(1e-3, rate);
    if (t >= dur) break;
    fn(t, i++);
  }
}

/** True when every sample is finite. */
export function finite(x: Buf): boolean {
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return false;
  return true;
}

export function rms(x: Buf): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}
