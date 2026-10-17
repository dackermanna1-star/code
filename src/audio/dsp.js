// Sample-level DSP toolkit for procedural synthesis into Float32Arrays ("buffer recipes"),
// plus generated impulse responses, modulation curves and plucked strings.
// Pure JS with no AudioContext dependency, so the exact same code renders for the live
// context and for OfflineAudioContext (QA). Times are in seconds, frequencies in Hz.

export const TAU = Math.PI * 2;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-12, Math.abs(g)));
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const cents = (c) => Math.pow(2, c / 1200);
/** Exponential interpolation between two positive values (for frequency sweeps). */
export const xlerp = (a, b, t) => a * Math.pow(b / a, t);

// ---- randomness ------------------------------------------------------------------------------
/** mulberry32 PRNG → float in [0,1). Used for reproducible offline renders. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience wrapper around a [0,1) generator. Audio uses live randomness for per-play
 *  variation (Math.random) and a seeded generator for QA renders. */
export class Rand {
  constructor(fn = Math.random) { this.f = fn; }
  r() { return this.f(); }
  bi() { return this.f() * 2 - 1; }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  /** x scaled by a random factor in [1-amt, 1+amt]. */
  jit(x, amt = 0.1) { return x * (1 + (this.f() * 2 - 1) * amt); }
  /** Approximate standard normal. */
  gauss() { return (this.f() + this.f() + this.f() + this.f() - 2) * 1.732; }
  /** Child generator with an independent stream (stable under a seeded parent). */
  fork() { return new Rand(mulberry32((this.f() * 4294967296) >>> 0)); }
}

// ---- envelopes (functions of local time t in seconds) ----------------------------------------
/** Attack/decay: linear rise over `a`, exponential fall reaching -60 dB after `t60`. */
export const envAD = (a, t60) => (t) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-6.9078 * (t - a) / t60));
/** Piecewise-linear envelope through [[t, v], ...] (holds the ends). */
export function envPts(pts) {
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
        return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-9, t1 - t0));
      }
    }
    return pts[pts.length - 1][1];
  };
}
/** Smooth swell: raised-cosine hump from 0 at t=0 to 1 at `peak`, back to 0 at `len`. */
export const envHump = (peak, len) => (t) => {
  if (t <= 0 || t >= len) return 0;
  return t < peak ? 0.5 - 0.5 * Math.cos(Math.PI * t / peak) : 0.5 + 0.5 * Math.cos(Math.PI * (t - peak) / (len - peak));
};

// ---- filters -------------------------------------------------------------------------------
/** RBJ-cookbook biquad, processed per sample. Types: lp hp bp (0 dB peak) peak notch ls hs ap. */
export class BQ {
  constructor(sr, type = 'lp', f = 1000, q = 0.707, g = 0) {
    this.sr = sr; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    this.set(type, f, q, g);
  }
  set(type, f, q = 0.707, g = 0) {
    this.type = type;
    const w = TAU * clamp(f, 5, this.sr * 0.49) / this.sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * Math.max(1e-4, q));
    const A = Math.pow(10, g / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'ap': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'ls': case 'hs': {
        const s = type === 'ls' ? 1 : -1, sq = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - s * (A - 1) * cw + sq); b1 = 2 * s * A * ((A - 1) - s * (A + 1) * cw);
        b2 = A * ((A + 1) - s * (A - 1) * cw - sq); a0 = (A + 1) + s * (A - 1) * cw + sq;
        a1 = -2 * s * ((A - 1) + s * (A + 1) * cw); a2 = (A + 1) + s * (A - 1) * cw - sq;
        break;
      }
      default: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  /** Filter arr[from..to) in place. */
  proc(arr, from = 0, to = arr.length) { for (let i = from; i < to; i++) arr[i] = this.run(arr[i]); return arr; }
}

/** One-pole low-pass (cheap smoothing / damping). */
export class OnePole {
  constructor(sr, f) { this.sr = sr; this.y = 0; this.set(f); }
  set(f) { this.a = 1 - Math.exp(-TAU * f / this.sr); return this; }
  run(x) { this.y += this.a * (x - this.y); return this.y; }
}

/** Two-pole resonator: an input impulse of amplitude 1 rings as a sinusoid of amplitude ~1
 *  decaying to -60 dB after t60. Use for modal synthesis driven by an excitation signal. */
export class Reson {
  constructor(sr, f, t60) {
    const w = TAU * clamp(f, 5, sr * 0.49) / sr, r = Math.exp(-6.9078 / (t60 * sr));
    this.c1 = 2 * r * Math.cos(w); this.c2 = -r * r; this.g = Math.sin(w); this.y1 = 0; this.y2 = 0;
  }
  run(x) { const y = this.g * x + this.c1 * this.y1 + this.c2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

// ---- noise -----------------------------------------------------------------------------------
/** Stateful coloured-noise source ('white' | 'pink' | 'brown'), unit-ish RMS. */
export class Noise {
  constructor(R, color = 'white') {
    this.R = R; this.color = color;
    this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0; this.br = 0;
  }
  next() {
    const w = this.R.f() * 2 - 1;
    if (this.color === 'white') return w;
    if (this.color === 'brown') { this.br = (this.br + 0.02 * w) / 1.02; return this.br * 3.5; }
    // Paul Kellet's refined pink filter
    this.b0 = 0.99886 * this.b0 + w * 0.0555179; this.b1 = 0.99332 * this.b1 + w * 0.0750759;
    this.b2 = 0.96900 * this.b2 + w * 0.1538520; this.b3 = 0.86650 * this.b3 + w * 0.3104856;
    this.b4 = 0.55000 * this.b4 + w * 0.5329522; this.b5 = -0.7616 * this.b5 - w * 0.0168980;
    const p = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362;
    this.b6 = w * 0.115926;
    return p * 0.11;
  }
}

// ---- buffer helpers ------------------------------------------------------------------------
export const alloc = (sr, sec) => new Float32Array(Math.max(1, Math.ceil(sr * sec)));
export const chans = (x) => (Array.isArray(x) ? x : [x]);

export function peakOf(x) {
  let p = 0;
  for (const c of chans(x)) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
}
/** Scale so the absolute peak (across channels) hits `db` dBFS. */
export function normalize(x, db = -6) {
  const p = peakOf(x);
  if (p < 1e-9) return x;
  const g = dbToGain(db) / p;
  for (const c of chans(x)) for (let i = 0; i < c.length; i++) c[i] *= g;
  return x;
}
export function gain(x, g) { for (const c of chans(x)) for (let i = 0; i < c.length; i++) c[i] *= g; return x; }
/** Short linear fades at both ends (de-click). */
export function edges(x, sr, fin = 0.002, fout = 0.01) {
  for (const c of chans(x)) {
    const ni = Math.min(c.length, Math.ceil(fin * sr)), no = Math.min(c.length, Math.ceil(fout * sr));
    for (let i = 0; i < ni; i++) c[i] *= i / ni;
    for (let i = 0; i < no; i++) c[c.length - 1 - i] *= i / no;
  }
  return x;
}
/** Remove DC with a gentle high-pass (~20 Hz). */
export function dcBlock(x, sr, f = 18) {
  for (const c of chans(x)) {
    const a = Math.exp(-TAU * f / sr); let x1 = 0, y1 = 0;
    for (let i = 0; i < c.length; i++) { const y = c[i] - x1 + a * y1; x1 = c[i]; y1 = y; c[i] = y; }
  }
  return x;
}
/** tanh saturation. Scale-invariant: the input is normalised to peak 1 first, so `drive`
 *  alone sets the amount of colour (≈1 gentle, 2 obvious, 3+ fuzz). Output peak = 1. */
export function saturate(x, drive = 2) {
  const p = peakOf(x);
  if (p < 1e-9) return x;
  const k = Math.tanh(drive), s = drive / p;
  for (const c of chans(x)) for (let i = 0; i < c.length; i++) c[i] = Math.tanh(c[i] * s) / k;
  return x;
}
/** Run a filter chain over a buffer (array of BQ/OnePole-like objects with run()). */
export function filt(arr, ...fs) {
  for (let i = 0; i < arr.length; i++) { let v = arr[i]; for (let k = 0; k < fs.length; k++) v = fs[k].run(v); arr[i] = v; }
  return arr;
}
/** Mix src into dst at sample offset (seconds) with gain. */
export function mixInto(dst, src, sr, t0 = 0, g = 1) {
  const n0 = Math.round(t0 * sr);
  const n = Math.min(src.length, dst.length - n0);
  for (let i = Math.max(0, -n0); i < n; i++) dst[n0 + i] += src[i] * g;
  return dst;
}
/** Trim trailing near-silence (keeps a short tail). */
export function trimTail(x, sr, floorDb = -70) {
  const th = dbToGain(floorDb) * Math.max(1e-6, peakOf(x));
  const cs = chans(x); let last = 0;
  for (const c of cs) for (let i = c.length - 1; i > last; i--) if (Math.abs(c[i]) > th) { last = i; break; }
  const n = Math.min(cs[0].length, last + Math.ceil(0.01 * sr));
  const out = cs.map((c) => c.slice(0, n));
  edges(out, sr, 0, 0.006);
  return Array.isArray(x) ? out : out[0];
}

// ---- generators that ADD into a buffer ------------------------------------------------------
/** Exponentially decaying sinusoid (one vibration mode). opts: phase, attack (s), glide:
 *  { to: Hz, tau: s } for a pitch drop, am: fn(t) extra amplitude envelope. */
export function ring(out, sr, t0, f, amp, t60, opts = {}) {
  const n0 = Math.round(t0 * sr);
  if (n0 >= out.length || amp === 0 || f >= sr * 0.49) return out;
  const len = Math.min(out.length - n0, Math.ceil(Math.min(t60 * 1.2, opts.maxDur || 60) * sr));
  const att = Math.max(1, Math.round((opts.attack || 0) * sr));
  const d = Math.exp(-6.9078 / (t60 * sr));
  if (!opts.glide && !opts.am) {
    // complex rotation: 4 mults per sample
    const w = TAU * f / sr, c = Math.cos(w), s = Math.sin(w);
    let re = Math.cos(opts.phase || 0) * amp, im = Math.sin(opts.phase || 0) * amp;
    for (let i = 0; i < len; i++) {
      const k = n0 + i;
      if (k >= 0) out[k] += i < att ? im * (i / att) : im;
      const nr = d * (re * c - im * s); im = d * (re * s + im * c); re = nr;
    }
    return out;
  }
  let ph = opts.phase || 0, e = amp;
  const g = opts.glide, am = opts.am;
  for (let i = 0; i < len; i++) {
    const t = i / sr, k = n0 + i;
    const ff = g ? g.to + (f - g.to) * Math.exp(-t / g.tau) : f;
    ph += TAU * ff / sr;
    if (k >= 0) out[k] += Math.sin(ph) * e * (i < att ? i / att : 1) * (am ? am(t) : 1);
    e *= d;
  }
  return out;
}

/** Struck object: several modes [[f, amp, t60], ...] plus an optional contact click. */
export function hit(out, sr, t0, modes, { gain: g = 1, R = null, click = 0, clickF = 4000, attack = 0.0005, spread = 0 } = {}) {
  for (const [f, a, t60] of modes) {
    const ff = spread && R ? f * (1 + R.bi() * spread) : f;
    ring(out, sr, t0, ff, a * g, t60, { phase: R ? R.r() * TAU : 0, attack });
  }
  if (click > 0) burst(out, sr, t0, { dur: 0.006, t60: 0.004, gain: click * g, R: R || new Rand(), filters: [['hp', clickF, 0.7]] });
  return out;
}

/** Filtered noise burst with an envelope. opts: dur, attack, t60 (decay), env fn(t) (overrides),
 *  color, filters: [[type, f | fn(u), q, gainDb]] (fn of normalised time u ∈ [0,1]), gain. */
export function burst(out, sr, t0, opts) {
  const R = opts.R || new Rand();
  const dur = opts.dur || 0.05, n0 = Math.round(t0 * sr), len = Math.min(out.length - n0, Math.ceil(dur * sr));
  if (len <= 0) return out;
  const nz = new Noise(R, opts.color || 'white');
  const env = opts.env || envAD(opts.attack || 0.0005, opts.t60 || dur);
  const fs = (opts.filters || []).map(([type, f, q, gdb]) => ({ type, f, q: q || 0.707, g: gdb || 0, bq: new BQ(sr, type, typeof f === 'function' ? f(0) : f, q || 0.707, gdb || 0) }));
  const dyn = fs.filter((x) => typeof x.f === 'function' || typeof x.q === 'function');
  const g = opts.gain ?? 1;
  for (let i = 0; i < len; i++) {
    if (dyn.length && (i & 31) === 0) {
      const u = i / len;
      for (const x of dyn) x.bq.set(x.type, typeof x.f === 'function' ? x.f(u) : x.f, typeof x.q === 'function' ? x.q(u) : x.q, x.g);
    }
    let v = nz.next();
    for (let k = 0; k < fs.length; k++) v = fs[k].bq.run(v);
    const k = n0 + i;
    if (k >= 0) out[k] += v * env(i / sr) * g;
  }
  return out;
}

/** Granular texture: Poisson-distributed micro-impacts (crackle, grit, rain, coal, leaves).
 *  opts: dur, rate fn(u) grains/s, amp fn(u), f [lo, hi] grain resonance, t60 [lo, hi],
 *  click (0..1 raw impulse mix), modes (1..3 partials per grain), R. */
export function grains(out, sr, t0, opts) {
  const R = opts.R || new Rand();
  const dur = opts.dur, rate = opts.rate, amp = opts.amp || (() => 1);
  const [flo, fhi] = opts.f || [2000, 6000], [tlo, thi] = opts.t60 || [0.005, 0.02];
  const modes = opts.modes || 1, click = opts.click ?? 0.3, g = opts.gain ?? 1;
  // Non-homogeneous Poisson process by thinning: draw at the peak rate, keep with p = rate/peak
  // (a time-varying rate that starts at 0 must not stall the process).
  const rateAt = typeof rate === 'function' ? rate : () => rate;
  let rmax = 0;
  for (let k = 0; k <= 64; k++) rmax = Math.max(rmax, rateAt(k / 64));
  if (rmax <= 0) return out;
  rmax *= 1.05;
  let t = 0;
  while (t < dur) {
    t += -Math.log(1 - R.r() * 0.999) / rmax;
    if (t >= dur) break;
    if (R.r() * rmax > rateAt(t / dur)) continue;
    const a = (typeof amp === 'function' ? amp(t / dur) : amp) * g * Math.pow(R.r(), opts.skew ?? 1.5);
    if (a < 1e-5) continue;
    const f = xlerp(flo, fhi, R.r()), tt = xlerp(tlo, thi, R.r());
    for (let m = 0; m < modes; m++) ring(out, sr, t0 + t, f * (m ? 1.5 + m * R.range(0.4, 1.3) : 1), a / (m + 1), tt / (m + 1), { phase: R.r() * TAU });
    if (click > 0) {
      const k = Math.round((t0 + t) * sr);
      if (k >= 0 && k < out.length) out[k] += a * click * (R.r() < 0.5 ? -1 : 1);
    }
  }
  return out;
}

/** Stick-slip friction (creaks, squeaks, scrapes): an impulse train whose rate follows
 *  rate(u) Hz with jitter, exciting a parallel bank of resonances res [[f, q, gain]].
 *  amp(u) envelope; tone (0..1) mixes in the raw pulse train (buzzier); R. */
export function stickSlip(out, sr, t0, opts) {
  const R = opts.R || new Rand();
  const dur = opts.dur, n0 = Math.round(t0 * sr), len = Math.min(out.length - n0, Math.ceil(dur * sr));
  if (len <= 0) return out;
  const res = (opts.res || [[600, 8, 1], [1400, 10, 0.6]]).map(([f, q, gg]) => ({ bq: new BQ(sr, 'bp', f, q), g: gg }));
  const hp = new BQ(sr, 'hp', opts.hp || 60, 0.7);
  const jit = opts.jitter ?? 0.15, tone = opts.tone ?? 0.15, g = opts.gain ?? 1;
  const slipW = Math.max(1, Math.round((opts.slip || 0.0006) * sr));
  const smoothJ = new OnePole(sr, opts.jitterRate || 30);
  let ph = 0, pulse = 0, pulseLeft = 0, pulseAmp = 0;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const j = smoothJ.run(R.bi() * jit * 3);
    ph += opts.rate(u) * (1 + j) / sr;
    if (ph >= 1) {
      ph -= Math.floor(ph);
      pulseLeft = slipW; pulseAmp = 1 + R.bi() * (opts.ampJitter ?? 0.35);
    }
    if (pulseLeft > 0) { pulse = pulseAmp * (pulseLeft / slipW); pulseLeft--; } else pulse = 0;
    const x = pulse + R.bi() * (opts.grit ?? 0.04);
    let y = x * tone;
    for (let k = 0; k < res.length; k++) y += res[k].bq.run(x) * res[k].g;
    const k = n0 + i;
    if (k >= 0) out[k] += hp.run(y) * opts.amp(u) * g;
  }
  return out;
}

/** Oscillator into a buffer with frequency fn f(t) and amplitude fn a(t).
 *  wave: 'sine' | 'tri' | 'saw' | 'square' | 'pulse' (band-limited by additive harmonics
 *  when `harm` > 0, else naive). */
export function tone(out, sr, t0, dur, { f, a, wave = 'sine', harm = 0, phase = 0, pw = 0.5 }) {
  const n0 = Math.round(t0 * sr), len = Math.min(out.length - n0, Math.ceil(dur * sr));
  let ph = phase;
  const ff = typeof f === 'function' ? f : () => f, aa = typeof a === 'function' ? a : () => a;
  for (let i = 0; i < len; i++) {
    const t = i / sr, fr = ff(t);
    ph += fr / sr; ph -= Math.floor(ph);
    let v;
    if (harm > 0) {
      v = 0;
      const nmax = Math.min(harm, Math.floor(sr / 2 / Math.max(1, fr)));
      for (let h = 1; h <= nmax; h++) {
        if (wave === 'square' && h % 2 === 0) continue;
        const s = Math.sin(TAU * ph * h);
        v += wave === 'tri' ? (h % 2 ? s * ((h - 1) / 2 % 2 ? -1 : 1) / (h * h) : 0) : s / h;
      }
      v *= wave === 'tri' ? 0.81 : 0.6;
    } else if (wave === 'saw') v = 2 * ph - 1;
    else if (wave === 'square') v = ph < 0.5 ? 1 : -1;
    else if (wave === 'pulse') v = ph < pw ? 1 : -1;
    else if (wave === 'tri') v = 1 - 4 * Math.abs(ph - 0.5);
    else v = Math.sin(TAU * ph);
    const k = n0 + i;
    if (k >= 0) out[k] += v * aa(t);
  }
  return out;
}

/** Glottal-ish source with jitter → formant filters; used for hums, murmurs and voices.
 *  opts: dur, f0 fn(t), amp fn(t), formants fn(t) → [[f, q, g], ...] (updated every 64 samples),
 *  breath (noise mix), jitter (cycle-to-cycle pitch), sub (sub-harmonic mix), R. */
export function voiced(out, sr, t0, opts) {
  const R = opts.R || new Rand();
  const dur = opts.dur, n0 = Math.round(t0 * sr), len = Math.min(out.length - n0, Math.ceil(dur * sr));
  const bank = opts.formants(0).map(([f, q]) => new BQ(sr, 'bp', f, q));
  let gains = opts.formants(0).map((x) => x[2] ?? 1);
  const lp = new BQ(sr, 'lp', opts.lp || 3500, 0.7);
  const nz = new Noise(R, 'pink');
  let ph = 0, ph2 = 0, jit = 0;
  const breath = opts.breath ?? 0.1, sub = opts.sub ?? 0, jAmt = opts.jitter ?? 0.01;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    if ((i & 63) === 0) {
      const fm = opts.formants(t);
      for (let k = 0; k < bank.length; k++) bank[k].set('bp', fm[k][0], fm[k][1]);
      gains = fm.map((x) => x[2] ?? 1);
    }
    const f0 = opts.f0(t) * (1 + jit);
    ph += f0 / sr;
    if (ph >= 1) { ph -= 1; jit = R.bi() * jAmt; }
    ph2 += f0 * 0.5 / sr; if (ph2 >= 1) ph2 -= 1;
    // asymmetric glottal pulse: quick closure → rich harmonics
    const gl = ph < 0.6 ? Math.sin(Math.PI * ph / 0.6) ** 2 : 0;
    const src = (gl - 0.3) + (sub ? sub * (ph2 < 0.5 ? 1 : -1) * 0.3 : 0) + nz.next() * breath;
    let y = 0;
    for (let k = 0; k < bank.length; k++) y += bank[k].run(src) * gains[k];
    const k = n0 + i;
    if (k >= 0) out[k] += lp.run(y) * opts.amp(t);
  }
  return out;
}

// ---- modulation curves ----------------------------------------------------------------------
/** Loopable smooth random curve in [-1, 1] (cosine-interpolated random points). */
export function smoothCurve(sr, sec, pointsPerSec, R) {
  const n = Math.ceil(sr * sec), pts = Math.max(2, Math.round(sec * pointsPerSec));
  const v = []; for (let i = 0; i < pts; i++) v.push(R.bi());
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * pts, k = Math.floor(x), fr = x - k;
    const a = v[k % pts], b = v[(k + 1) % pts];
    out[i] = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * fr));
  }
  return out;
}

// ---- impulse responses -----------------------------------------------------------------------
/** Generated stereo reverb impulse response. opts: t60, pre (pre-delay), damp [hiStart, hiEnd]
 *  (time-varying low-pass → frequency-dependent decay), early [[t, gain], ...], flutter
 *  { period, decay, count } (parallel-wall echoes), echoes [[t, gain]] (discrete late echoes),
 *  lowcut, onset (tail fade-in). Normalised to unit energy so spaces are level-comparable. */
export function makeIR(sr, opts, R = new Rand(mulberry32(7))) {
  const t60 = opts.t60, len = Math.ceil(sr * (opts.len || Math.min(6, t60 * 1.15 + (opts.pre || 0))));
  const pre = Math.round((opts.pre || 0) * sr), onset = Math.max(1, Math.round((opts.onset ?? 0.012) * sr));
  const [d0, d1] = opts.damp || [9000, 3000];
  const out = [new Float32Array(len), new Float32Array(len)];
  for (let ch = 0; ch < 2; ch++) {
    const o = out[ch], lp = new OnePole(sr, d0), lp2 = new OnePole(sr, d0);
    const nz = new Noise(R, 'white');
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      if ((i & 63) === 0) { const f = xlerp(d0, d1, Math.min(1, t / t60)); lp.set(f); lp2.set(f); }
      const e = Math.exp(-6.9078 * t / t60) * Math.min(1, (i - pre) / onset);
      o[i] += lp2.run(lp.run(nz.next())) * e;
    }
    // early reflections (slightly different per channel → width)
    for (const [t, g] of opts.early || []) {
      const k = Math.round((t * (ch ? 1.07 : 0.95) + (opts.pre || 0) * 0.3) * sr);
      if (k < len) { o[k] += g * (R.r() < 0.5 ? -1 : 1) * 1.5; if (k + 1 < len) o[k + 1] += g * 0.6; }
    }
    if (opts.flutter) {
      const { period, decay, count } = opts.flutter;
      for (let j = 1; j <= count; j++) {
        const k = Math.round((pre / sr + j * period * (ch ? 1.013 : 1)) * sr);
        if (k < len) o[k] += Math.pow(decay, j) * 1.2 * (j % 2 ? 1 : -1);
      }
    }
    for (const [t, g] of opts.echoes || []) {
      // a smeared, darker copy of a short burst = a distant wall
      const k0 = Math.round((t + (ch ? 0.011 : 0)) * sr), sl = new OnePole(sr, d1 * 0.7);
      for (let i = 0; i < sr * 0.08 && k0 + i < len; i++) o[k0 + i] += sl.run(R.bi()) * g * Math.exp(-i / (sr * 0.02)) * 3;
    }
    if (opts.lowcut) { const hp = new BQ(sr, 'hp', opts.lowcut, 0.7); hp.proc(o); }
  }
  // unit energy
  let e = 0; for (const o of out) for (let i = 0; i < len; i++) e += o[i] * o[i];
  const g = 1 / Math.sqrt(Math.max(1e-12, e / 2));
  for (const o of out) for (let i = 0; i < len; i++) o[i] *= g;
  return out;
}

// ---- plucked string (Karplus–Strong) --------------------------------------------------------
/** Plucked string tone. opts: dur, bright (0..1 initial excitation brightness), damp (0..1
 *  loop damping → sustain), pick (0..1 pick position → comb), R. Returns a Float32Array. */
export function pluckString(sr, f, opts = {}) {
  const R = opts.R || new Rand();
  const dur = opts.dur || 2, out = alloc(sr, dur);
  // loop delay = N samples + 0.5 (averaging filter) + all-pass fractional delay
  const D = sr / f - 0.5;
  let N = Math.floor(D), frac = D - N;
  if (frac < 0.15) { N -= 1; frac += 1; }
  const apC = (1 - frac) / (1 + frac);
  const line = new Float32Array(N);
  const exc = new OnePole(sr, 600 + 9000 * (opts.bright ?? 0.5));
  for (let i = 0; i < N; i++) line[i] = exc.run(R.bi());
  // pick-position comb on the excitation (plucking near the bridge = brighter, thinner)
  const pk = Math.max(1, Math.round(N * (opts.pick ?? 0.18)));
  const tmp = line.slice();
  for (let i = 0; i < N; i++) line[i] = tmp[i] - tmp[(i - pk + N) % N];
  let mean = 0; for (let i = 0; i < N; i++) mean += line[i]; mean /= N;
  for (let i = 0; i < N; i++) line[i] -= mean;
  const loss = 0.990 + 0.0098 * (opts.damp ?? 0.6);
  let idx = 0, apX1 = 0, apY1 = 0, last = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = line[idx];
    const avg = 0.5 * (cur + last) * loss;
    const ap = apC * avg + apX1 - apC * apY1; apX1 = avg; apY1 = ap;
    line[idx] = ap;
    last = cur;
    out[i] = cur;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  return out;
}
