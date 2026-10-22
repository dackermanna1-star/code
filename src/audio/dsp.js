// Procedural DSP toolkit: seeded randomness, noise, filters, pulse shapes and
// buffer utilities. Everything works on Float32Array at an explicit sample rate
// so recipes can be rendered at whatever rate suits their bandwidth. Inner
// loops are written for V8: no per-sample closures or transcendental calls.

export const TAU = Math.PI * 2;
const INV_2_31 = 4.656612873077393e-10;

export class Rng {
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }

  // mulberry32
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  bi() {
    return this.next() * 2 - 1;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  jit(value, frac) {
    return value * (1 + frac * this.bi());
  }

  seed() {
    return ((this.next() * 4294967296) >>> 0) || 1;
  }

  // Mostly small values with an occasional large one (debris, crackle sizes).
  pow(exponent) {
    return Math.pow(this.next(), exponent);
  }

  // Exponentially distributed interval for a Poisson process of `rate` per second.
  exp(rate) {
    return -Math.log(1 - this.next() * 0.999999) / rate;
  }
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const samples = (sr, seconds) => Math.max(1, Math.round(seconds * sr));

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Rational tanh approximation, exact at |x| = 3 and clamped beyond.
export function fastTanh(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

// ---------------------------------------------------------------------------
// Noise

// Reusable scratch arrays for helper temporaries, so synthesis creates little
// garbage. A slot may only be used by one helper at a time and never across calls.
const slots = [];
export function scratch(slot, n, zero = false) {
  let buf = slots[slot];
  if (!buf || buf.length < n) {
    buf = new Float32Array(Math.max(n, 8192, buf ? buf.length * 2 : 0));
    slots[slot] = buf;
    return buf.subarray(0, n);
  }
  const view = buf.subarray(0, n);
  if (zero) view.fill(0);
  return view;
}

// Uniform white noise in [-amp, amp) from a 32-bit LCG (only the high bits matter here).
export function white(n, seed, amp = 1, into = null) {
  const out = into || new Float32Array(n);
  let s = (seed | 0) ^ 0x5bd1e995;
  const k = amp * INV_2_31;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    out[i] = s * k;
  }
  return out;
}

// Paul Kellet's economy pink filter; output roughly within [-1, 1].
export function pink(n, seed) {
  const out = new Float32Array(n);
  let s = (seed | 0) ^ 0x2c1b3c6d;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const w = s * INV_2_31;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return out;
}

// Leaky-integrated white noise (6 dB/oct above `corner` Hz), scaled to ~0.3 RMS.
export function brown(n, seed, sr, corner = 20) {
  const out = new Float32Array(n);
  const a = Math.exp((-TAU * corner) / sr);
  const g = 0.3 * Math.sqrt(3 * (1 - a * a)) * INV_2_31;
  let s = (seed | 0) ^ 0x7f4a7c15;
  let y = 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    y = a * y + s;
    out[i] = y * g;
  }
  return out;
}

// In-place pink / brown colouring of an existing noise buffer, so loops can run
// them inside circular() and stay seamless.
export function pinkFilter(x) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < x.length; i++) {
    const w = x[i];
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    x[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return x;
}

export function brownFilter(x, sr, corner = 20) {
  const a = Math.exp((-TAU * corner) / sr);
  const g = 0.3 * Math.sqrt(3 * (1 - a * a));
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = a * y + x[i];
    x[i] = y * g;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Filters (all in place, return the buffer)

export function lp1(x, fc, sr, from = 0, to = x.length) {
  const a = Math.exp((-TAU * Math.min(fc, sr * 0.49)) / sr);
  const b = 1 - a;
  let y = 0;
  for (let i = from; i < to; i++) {
    y = b * x[i] + a * y;
    x[i] = y;
  }
  return x;
}

export function hp1(x, fc, sr, from = 0, to = x.length) {
  const a = Math.exp((-TAU * fc) / sr);
  const b = 1 - a;
  let y = 0;
  for (let i = from; i < to; i++) {
    y = b * x[i] + a * y;
    x[i] -= y;
  }
  return x;
}

export function biquadCoefs(type, f, q, sr, db = 0) {
  const w = (TAU * Math.min(f, sr * 0.45)) / sr;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const alpha = sw / (2 * q);
  const A = Math.pow(10, db / 40);
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  switch (type) {
    case 'hp':
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
      break;
    case 'bp': // constant 0 dB peak
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
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
    case 'lowshelf':
    case 'highshelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      const s = type === 'lowshelf' ? 1 : -1;
      b0 = A * (A + 1 - s * (A - 1) * cw + sq);
      b1 = 2 * s * A * (A - 1 - s * (A + 1) * cw);
      b2 = A * (A + 1 - s * (A - 1) * cw - sq);
      a0 = A + 1 + s * (A - 1) * cw + sq;
      a1 = -2 * s * (A - 1 + s * (A + 1) * cw);
      a2 = A + 1 + s * (A - 1) * cw - sq;
      break;
    }
    default: // 'lp'
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cw;
      a2 = 1 - alpha;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function biquad(x, type, f, q, sr, db = 0, from = 0, to = x.length) {
  const { b0, b1, b2, a1, a2 } = biquadCoefs(type, f, q, sr, db);
  let z1 = 0;
  let z2 = 0;
  for (let i = from; i < to; i++) {
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
  return x;
}

const BLOCK = 32;

// Topology-preserving state-variable filter whose cutoff can move freely.
// `fcAt(t)` gives the cutoff in Hz, t in seconds from `from`; evaluated per 32 samples.
// Band output is normalised to unity peak gain.
export function svf(x, mode, fcAt, q, sr, from = 0, to = x.length) {
  const k = 1 / q;
  const mL = mode === 'lp' ? 1 : 0;
  const mB = mode === 'bp' ? k : 0;
  const mH = mode === 'hp' ? 1 : 0;
  const maxF = sr * 0.45;
  const nb = Math.ceil((to - from) / BLOCK);
  const A1 = new Float64Array(nb);
  const A2 = new Float64Array(nb);
  const A3 = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    const fc = clamp(fcAt((b * BLOCK) / sr), 10, maxF);
    const g = Math.tan((Math.PI * fc) / sr);
    const a1 = 1 / (1 + g * (g + k));
    A1[b] = a1;
    A2[b] = g * a1;
    A3[b] = g * g * a1;
  }
  let ic1 = 0;
  let ic2 = 0;
  for (let b = 0; b < nb; b++) {
    const a1 = A1[b];
    const a2 = A2[b];
    const a3 = A3[b];
    const start = from + b * BLOCK;
    const end = Math.min(to, start + BLOCK);
    for (let j = start; j < end; j++) {
      const v0 = x[j];
      const v3 = v0 - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      x[j] = mL * v2 + mB * v1 + mH * (v0 - k * v1 - v2);
    }
  }
  return x;
}

// Cheap time-varying 12 dB/oct lowpass (two one-poles) for sweeps that need no resonance.
export function lpSweep(x, fcAt, sr, from = 0, to = x.length) {
  let y1 = 0;
  let y2 = 0;
  const maxF = sr * 0.45;
  for (let i = from; i < to; i += BLOCK) {
    const a = Math.exp((-TAU * clamp(fcAt((i - from) / sr), 5, maxF)) / sr);
    const b = 1 - a;
    const end = Math.min(to, i + BLOCK);
    for (let j = i; j < end; j++) {
      y1 = b * x[j] + a * y1;
      y2 = b * y1 + a * y2;
      x[j] = y2;
    }
  }
  return x;
}

// Exponential glide from f0 towards f1 with time constant tau (for svf cutoffs).
export const glide = (f0, f1, tau) => (t) => f1 + (f0 - f1) * Math.exp(-t / tau);

// Treats `x` as one period of a repeating signal: the filter state is pre-rolled
// over the end of the buffer so the processed result loops without a seam.
export function circular(x, preroll, fn) {
  const n = x.length;
  const pre = Math.min(preroll, n);
  const tmp = new Float32Array(pre + n);
  tmp.set(x.subarray(n - pre), 0);
  tmp.set(x, pre);
  fn(tmp);
  x.set(tmp.subarray(pre));
  return x;
}

// ---------------------------------------------------------------------------
// Pulse and tone shapes (all add into `out`, `at` in seconds)

// Friedlander blast wave p(t) = (1 - t/T) e^(-b t/T): sharp rise, decay, weak negative phase.
export function addFriedlander(out, at, amp, T, b, sr) {
  const i0 = Math.round(at * sr);
  const n = Math.min(out.length - i0, Math.ceil(T * 9 * sr));
  const dec = Math.exp(-b / (T * sr));
  const invT = 1 / (T * sr);
  let e = 1;
  for (let i = 0; i < n; i++) {
    const ramp = i === 0 ? 0.55 : 1;
    out[i0 + i] += amp * ramp * (1 - i * invT) * e;
    e *= dec;
  }
}

// Supersonic N-wave: instant overpressure, linear fall to underpressure, instant recovery.
export function addNWave(out, at, amp, dur, sr) {
  const i0 = Math.round(at * sr);
  const n = Math.max(2, Math.round(dur * sr));
  if (i0 + n + 1 >= out.length) return;
  for (let i = 0; i <= n; i++) {
    const edge = i === 0 || i === n ? 0.6 : 1;
    out[i0 + i] += amp * edge * (1 - (2 * i) / n);
  }
}

// Decaying sine whose frequency glides exponentially from f0 to f1 (rotation oscillator).
export function addTone(out, at, amp, f0, f1, glideTau, decayTau, sr, attack = 0.0006) {
  const i0 = Math.round(at * sr);
  const n = Math.min(out.length - i0, Math.ceil(decayTau * 5.5 * sr));
  const dec = Math.exp(-1 / (decayTau * sr));
  const gdec = Math.exp(-BLOCK / (Math.max(glideTau, 1e-4) * sr));
  const att = Math.max(1, Math.round(attack * sr));
  let e = amp;
  let g = 1;
  let c = 1;
  let s = 0;
  for (let i = 0; i < n; i += BLOCK) {
    const w = (TAU * (f1 + (f0 - f1) * g)) / sr;
    g *= gdec;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const end = Math.min(n, i + BLOCK);
    for (let j = i; j < end; j++) {
      const nc = c * cw - s * sw;
      s = c * sw + s * cw;
      c = nc;
      out[i0 + j] += (j < att ? j / att : 1) * e * s;
      e *= dec;
    }
  }
}

// Adds amp * env[i] * (sin θ + h2 sin 2θ) where the frequency comes from fAt(t)
// once per 32-sample block (rotating phasor; sin 2θ = 2 sin θ cos θ is free).
export function addSweepSine(out, at, n, fAt, env, amp, sr, h2 = 0) {
  const i0 = Math.round(at * sr);
  const len = Math.min(n, out.length - i0);
  let c = 1;
  let s = 0;
  for (let i = 0; i < len; i += BLOCK) {
    const w = (TAU * fAt(i / sr)) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const end = Math.min(len, i + BLOCK);
    for (let j = i; j < end; j++) {
      const nc = c * cw - s * sw;
      s = c * sw + s * cw;
      c = nc;
      out[i0 + j] += amp * (env ? env[j] : 1) * (s + 2 * h2 * s * c);
    }
  }
  return out;
}

// Modal resonator bank: each mode {f, d (decay s), a (amp)} rings via a 2-pole recursion.
export function addModes(out, at, amp, modes, sr) {
  const i0 = Math.round(at * sr);
  if (i0 >= out.length) return;
  for (const m of modes) {
    if (m.f >= sr * 0.48) continue;
    const n = Math.min(out.length - i0, Math.ceil(m.d * 6 * sr));
    const w = (TAU * m.f) / sr;
    const r = Math.exp(-1 / (m.d * sr));
    const c = 2 * r * Math.cos(w);
    const r2 = r * r;
    let y2 = 0;
    let y1 = amp * m.a * Math.sin(w);
    if (n > 1) out[i0 + 1] += y1;
    for (let i = 2; i < n; i++) {
      const y = c * y1 - r2 * y2;
      out[i0 + i] += y;
      y2 = y1;
      y1 = y;
    }
  }
}

// White noise shaped by a linear attack and exponential decay (tau); `slot` uses scratch memory.
export function burst(sr, seed, attack, tau, length = tau * 7, slot = -1) {
  const n = samples(sr, attack + length);
  const x = white(n, seed, 1, slot >= 0 ? scratch(slot, n) : null);
  const att = Math.min(n, Math.max(1, Math.round(attack * sr)));
  for (let i = 0; i < att; i++) x[i] *= i / att;
  const dec = Math.exp(-1 / (tau * sr));
  let e = 1;
  for (let i = att; i < n; i++) {
    x[i] *= e;
    e *= dec;
  }
  return x;
}

// Smooth random control signal in [-1, 1] with `points` segments (smoothstep interpolation).
export function smoothRandom(n, points, rng, periodic = false, into = null) {
  const count = Math.max(1, points);
  const vals = new Float32Array(count + 1);
  for (let i = 0; i <= count; i++) vals[i] = rng.bi();
  if (periodic) vals[count] = vals[0];
  const out = into || new Float32Array(n);
  const seg = n / count;
  for (let k = 0; k < count; k++) {
    const i0 = Math.round(k * seg);
    const i1 = Math.min(n, Math.round((k + 1) * seg));
    const a = vals[k];
    const d = vals[k + 1] - a;
    const inv = 1 / Math.max(1, i1 - i0);
    for (let i = i0; i < i1; i++) {
      const f = (i - i0) * inv;
      out[i] = a + d * f * f * (3 - 2 * f);
    }
  }
  return out;
}

// PolyBLEP residual for band-limited sawtooth / square oscillators.
export function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

export function blepSaw(phase, dt) {
  return 2 * phase - 1 - polyBlep(phase, dt);
}

export function blepSquare(phase, dt) {
  const p2 = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5;
  return (phase < 0.5 ? 1 : -1) + polyBlep(phase, dt) - polyBlep(p2, dt);
}

// ---------------------------------------------------------------------------
// Buffer utilities

export function mixAt(dst, src, at, gain, sr) {
  const i0 = Math.round(at * sr);
  if (i0 >= dst.length) return dst;
  const n = Math.min(src.length, dst.length - i0);
  const s0 = i0 < 0 ? -i0 : 0;
  for (let i = s0; i < n; i++) dst[i0 + i] += src[i] * gain;
  return dst;
}

// Mixes `src` scaled so that its own peak lands at `gain`.
export function mixNorm(dst, src, at, gain, sr) {
  const p = peak(src);
  return p > 1e-9 ? mixAt(dst, src, at, gain / p, sr) : dst;
}

// Adds `src` into a circular buffer (wraps around the end), for seamless loops.
export function mixWrap(dst, src, startIndex, gain) {
  const n = dst.length;
  let j = ((startIndex % n) + n) % n;
  for (let i = 0; i < src.length; i++) {
    dst[j] += src[i] * gain;
    j++;
    if (j === n) j = 0;
  }
  return dst;
}

export function scale(x, g) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

export function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}

export function rms(x, from = 0, to = x.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

export function normalize(x, target = 0.95) {
  const p = peak(x);
  if (p > 1e-9) scale(x, target / p);
  return x;
}

// Saturation of a peak-normalised signal; output peak stays near 1.
export function softClip(x, drive, pre = 1) {
  const norm = 1 / fastTanh(drive);
  const k = drive * pre;
  for (let i = 0; i < x.length; i++) {
    const v = k * x[i];
    if (v > 3) {
      x[i] = norm;
    } else if (v < -3) {
      x[i] = -norm;
    } else {
      const v2 = v * v;
      x[i] = ((v * (27 + v2)) / (27 + 9 * v2)) * norm;
    }
  }
  return x;
}

export function fadeIn(x, seconds, sr) {
  const n = Math.min(x.length, samples(sr, seconds));
  for (let i = 0; i < n; i++) x[i] *= i / n;
  return x;
}

export function fadeOut(x, seconds, sr) {
  const n = Math.min(x.length, samples(sr, seconds));
  const s = x.length - n;
  for (let i = 0; i < n; i++) {
    const g = 1 - i / n;
    x[s + i] *= g * g;
  }
  return x;
}

// Multiplies by an exponential decay starting at `at` seconds.
export function decayFrom(x, at, tau, sr) {
  const i0 = Math.max(0, Math.round(at * sr));
  const d = Math.exp(-1 / (tau * sr));
  let e = 1;
  for (let i = i0; i < x.length; i++) {
    x[i] *= e;
    e *= d;
  }
  return x;
}

// Halves the sample rate: [1/4, 1/2, 1/4] pre-filter then drop every other sample.
export function decimate2(x) {
  const n = x.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 2;
    const a = j > 0 ? x[j - 1] : 0;
    const c = j + 1 < x.length ? x[j + 1] : 0;
    out[i] = 0.25 * a + 0.5 * x[j] + 0.25 * c;
  }
  return out;
}

// Adds delayed, low-passed copies of the first `srcSeconds` of the signal.
// taps: [{ t, g, lp }]; taps sharing the same lp reuse one filtered copy.
export function addEchoes(x, srcSeconds, taps, sr) {
  const src = x.slice(0, Math.min(x.length, samples(sr, srcSeconds)));
  const cache = new Map();
  for (const tap of taps) {
    const key = tap.lp || 0;
    let copy = cache.get(key);
    if (!copy) {
      copy = key ? lp1(lp1(src.slice(), key, sr), key * 1.4, sr) : src;
      cache.set(key, copy);
    }
    mixAt(x, copy, tap.t, tap.g, sr);
  }
  return x;
}

// Random echo pattern: n taps between t0 and t1, gains falling off with delay.
export function echoTaps(rng, n, t0, t1, g0, lpNear, lpFar) {
  const taps = [];
  for (let i = 0; i < n; i++) {
    const t = rng.range(t0, t1);
    const u = (t - t0) / Math.max(1e-6, t1 - t0);
    taps.push({ t, g: g0 * (1 - 0.75 * u) * rng.range(0.6, 1), lp: u < 0.4 ? lpNear : lpFar });
  }
  return taps;
}

// Final mastering of a one-shot in one fused pass: optional saturation, DC
// removal and fade-out, then peak normalisation.
export function finish(x, sr, { drive = 0, dc = 18, fade = 0.02, target = 0.95 } = {}) {
  const p = peak(x);
  if (p < 1e-9) return x;
  const n = x.length;
  const clip = drive > 0;
  const norm = clip ? 1 / fastTanh(drive) : 1;
  const k = clip ? drive / p : 1;
  const a = dc > 0 ? Math.exp((-TAU * dc) / sr) : 0;
  const b = 1 - a;
  const fadeLen = Math.min(n, samples(sr, fade));
  const fadeStart = n - fadeLen;
  let y = 0;
  let pk = 0;
  for (let i = 0; i < n; i++) {
    let v = x[i];
    if (clip) {
      v *= k;
      if (v > 3) v = norm;
      else if (v < -3) v = -norm;
      else v = ((v * (27 + v * v)) / (27 + 9 * v * v)) * norm;
    }
    if (dc > 0) {
      y = b * v + a * y;
      v -= y;
    }
    if (i >= fadeStart) {
      const g = 1 - (i - fadeStart) / fadeLen;
      v *= g * g;
    }
    x[i] = v;
    pk = Math.max(pk, Math.abs(v));
  }
  return pk > 1e-9 ? scale(x, target / pk) : x;
}
