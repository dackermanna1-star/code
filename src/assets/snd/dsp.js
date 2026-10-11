// Low-level DSP helpers for the procedural CS 1.6 sound bank.
//
// Layers (transients, clicks, grains, partials, noise beds, tails) are
// generated directly into Float32Arrays here: exact, deterministic and cheap,
// and free of Web Audio so they can run in workers. Each finished mix is then
// rendered through its own OfflineAudioContext (see ../sounds.js) whose native
// master chain (DC highpass + 4th-order "22 kHz era" lowpass) runs on the
// audio threads, all contexts in parallel.

export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- random ---

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) with a few convenience helpers. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.bi = () => r() * 2 - 1;
  r.jit = (v, amt) => v * (1 + amt * (r() * 2 - 1));
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.logRange = (lo, hi) => lo * Math.pow(hi / lo, r());
  return r;
}

// --------------------------------------------------------------- filters ---

/** RBJ cookbook biquad coefficients, normalised: [b0, b1, b2, a1, a2]. q is linear. */
export function bqCoefs(type, f, q, sr, gainDb = 0) {
  const w = (TAU * Math.min(Math.max(f, 1), sr * 0.495)) / sr;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  const alpha = sn / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'bandpass': // constant 0 dB peak gain
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cs + s); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - s);
      a0 = A + 1 + (A - 1) * cs + s; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cs + s); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - s);
      a0 = A + 1 - (A - 1) * cs + s; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - s;
      break;
    }
    default:
      throw new Error('biquad type ' + type);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** In-place static biquad (transposed direct form II). */
export function biquad(x, sr, type, f, q = 0.707, gainDb = 0) {
  const [b0, b1, b2, a1, a2] = bqCoefs(type, f, q, sr, gainDb);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = b0 * xi + z1;
    z1 = b1 * xi - a1 * y + z2;
    z2 = b2 * xi - a2 * y;
    x[i] = y;
  }
  return x;
}

/** Apply a list of [type, f, q, gainDb] biquads in place. */
export function filt(x, sr, filters) {
  if (filters) for (const f of filters) biquad(x, sr, f[0], f[1], f[2] ?? 0.707, f[3] ?? 0);
  return x;
}

/**
 * Time-varying state-variable filter (Zavalishin TPT form), in place.
 * mode 'lp' | 'bp' (unity peak) | 'hp'; fc is Hz or t => Hz (updated every 16 samples).
 */
export function svf(x, sr, mode, fc, q = 0.707) {
  const fn = typeof fc === 'function' ? fc : null;
  const k = 1 / q;
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  const upd = (f) => {
    const g = Math.tan((Math.PI * Math.min(Math.max(f, 5), sr * 0.45)) / sr);
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
  };
  if (!fn) upd(fc);
  const m = mode === 'lp' ? 0 : mode === 'bp' ? 1 : 2;
  for (let i = 0; i < x.length; i++) {
    if (fn && (i & 15) === 0) upd(fn(i / sr));
    const v0 = x[i];
    const v3 = v0 - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    x[i] = m === 0 ? v2 : m === 1 ? k * v1 : v0 - k * v1 - v2;
  }
  return x;
}

/** One-pole lowpass whose cutoff glides exponentially from f0 to f1 over the buffer. */
export function glideLP(x, sr, f0, f1, passes = 2) {
  const n = x.length;
  const ratio = Math.pow(f1 / f0, 32 / Math.max(1, n));
  for (let p = 0; p < passes; p++) {
    let y = 0, fc = f0;
    for (let b = 0; b < n; b += 32) {
      const c = 1 - Math.exp((-TAU * fc) / sr);
      const m = Math.min(n, b + 32);
      for (let i = b; i < m; i++) {
        y += c * (x[i] - y);
        x[i] = y;
      }
      fc *= ratio;
    }
  }
  return x;
}

// ----------------------------------------------------------------- noise ---

// One shared pool of white noise; each request copies a run from a random
// offset. Far cheaper than running the PRNG for every sample of every layer.
const POOL_N = 1 << 19;
let POOL = null;
function pool() {
  if (!POOL) {
    POOL = new Float32Array(POOL_N);
    const r = makeRng(0x5eed);
    for (let i = 0; i < POOL_N; i++) POOL[i] = r() * 2 - 1;
  }
  return POOL;
}

export function white(n, rng) {
  const p = pool();
  const a = new Float32Array(n);
  let off = Math.floor(rng() * POOL_N);
  let i = 0;
  while (i < n) {
    const m = Math.min(n - i, POOL_N - off);
    a.set(p.subarray(off, off + m), i);
    i += m;
    off = 0;
  }
  // flip polarity at random so reused runs never correlate exactly
  if (rng() < 0.5) for (let k = 0; k < n; k++) a[k] = -a[k];
  return a;
}

/** Pink-ish noise (Paul Kellet's economy filter). */
export function pink(n, rng) {
  const a = white(n, rng);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = a[i];
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return a;
}

/** Brown (red) noise via a leaky integrator. */
export function brown(n, rng) {
  const a = white(n, rng);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = 0.996 * y + a[i] * 0.06;
    a[i] = y;
  }
  return a;
}

export function noise(n, rng, color = 'white') {
  return color === 'pink' ? pink(n, rng) : color === 'brown' ? brown(n, rng) : white(n, rng);
}

// ------------------------------------------------------------- utilities ---

export function peakOf(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > p) p = v;
  }
  return p;
}

export function normalize(x, peak = 1) {
  const p = peakOf(x);
  if (p > 0) {
    const s = peak / p;
    for (let i = 0; i < x.length; i++) x[i] *= s;
  }
  return x;
}

/** Mix src into out starting at sample index `at`. */
export function mixInto(out, src, at, amp = 1) {
  const i0 = Math.round(at);
  const start = Math.max(0, -i0);
  const end = Math.min(src.length, out.length - i0);
  for (let i = start; i < end; i++) out[i0 + i] += src[i] * amp;
  return out;
}

/** Linear attack, hold, exponential decay. */
export function envAHD(t, a, h, tau) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  t -= a;
  if (t < h) return 1;
  return Math.exp(-(t - h) / tau);
}

/** Smooth bell envelope that rises over `rise` and falls over `fall` (raised-cosine). */
export function envBell(t, rise, fall) {
  if (t < 0) return 0;
  if (t < rise) return 0.5 - 0.5 * Math.cos((Math.PI * t) / rise);
  t -= rise;
  if (t < fall) return 0.5 + 0.5 * Math.cos((Math.PI * t) / fall);
  return 0;
}

/** Soft clip (tanh) in place. Output is not renormalised. */
export function softclip(x, drive = 2, asym = 0) {
  const off = Math.tanh(drive * asym);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v !== 0 || asym) x[i] = Math.tanh(drive * (v + asym)) - off;
  }
  return x;
}

/** Multiply by an envelope function of time. */
export function applyEnv(x, sr, fn, t0 = 0) {
  for (let i = 0; i < x.length; i++) x[i] *= fn(i / sr - t0);
  return x;
}

// ----------------------------------------------------------- generators ---

/**
 * A peak-normalised noise burst: AHD envelope then static filters.
 * opts: { a, h, tau, len, color, filters, sweep: {mode, fc: t=>Hz, q} }
 */
export function burst(sr, rng, { a = 0.0002, h = 0, tau = 0.01, len, color = 'white', filters, sweep, env } = {}) {
  const n = Math.max(16, Math.ceil((len ?? a + h + tau * 7) * sr));
  const x = noise(n, rng, color);
  if (env) {
    // evaluate the envelope every 32 samples and interpolate
    let e0 = env(0);
    for (let b = 0; b < n; b += 32) {
      const e1 = env((b + 32) / sr);
      const m = Math.min(32, n - b);
      for (let i = 0; i < m; i++) x[b + i] *= e0 + ((e1 - e0) * i) / 32;
      e0 = e1;
    }
  } else {
    const aN = Math.max(1, Math.round(a * sr));
    const hN = Math.round(h * sr);
    const d = Math.exp(-1 / (tau * sr));
    let i = 0;
    for (; i < aN && i < n; i++) x[i] *= i / aN;
    for (; i < aN + hN && i < n; i++);
    let e = 1;
    for (; i < n; i++) {
      x[i] *= e;
      e *= d;
    }
  }
  if (sweep) svf(x, sr, sweep.mode || 'bp', sweep.fc, sweep.q ?? 1);
  filt(x, sr, filters);
  return normalize(x, 1);
}

export function addBurst(out, sr, rng, t0, amp, opts) {
  return mixInto(out, burst(sr, rng, opts), t0 * sr, amp);
}

/**
 * Add an exponentially decaying sinusoid, optionally gliding from f to f1
 * with time constant `glide`, with optional vibrato (fractional depth `vib`).
 */
export function addTone(out, sr, t0, { f, f1 = f, glide = 0.05, amp = 1, tau = 0.05, a = 0.0003, phase = 0, len, vib = 0, vibF = 6, rel = 0 }) {
  if (Math.min(f, f1) > sr * 0.45) return out; // would alias at low sample rates
  const i0 = Math.round(t0 * sr);
  const n = Math.min(Math.ceil((len ?? a + tau * 7) * sr), out.length - i0);
  const kv = (TAU * vibF) / sr;
  const relN = rel * sr;
  const aN = Math.max(1, a * sr);
  const dEnv = Math.exp(-1 / (tau * sr));
  if (f === f1 && !vib && !relN) {
    // constant frequency: damped complex rotation (no per-sample transcendental)
    const w = (TAU * f) / sr;
    const cr = Math.cos(w) * dEnv, ci = Math.sin(w) * dEnv;
    let re = Math.cos(phase), im = Math.sin(phase);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      const nr = re * cr - im * ci;
      im = re * ci + im * cr;
      re = nr;
      if (j >= 0) out[j] += amp * (i < aN ? i / aN : 1) * im;
    }
    return out;
  }
  const dGl = Math.exp(-1 / (glide * sr));
  const w1 = (TAU * f1) / sr;
  let dw = (TAU * (f - f1)) / sr;
  let env = 1;
  let ph = phase;
  for (let i = 0; i < n; i++) {
    let w = w1 + dw;
    dw *= dGl;
    if (vib) w *= 1 + vib * Math.sin(kv * i);
    ph += w;
    if (ph > TAU) ph -= TAU;
    const j = i0 + i;
    if (j >= 0) {
      let e = env;
      if (i < aN) e *= i / aN;
      if (relN && i > n - relN) e *= (n - i) / relN;
      out[j] += amp * e * Math.sin(ph);
    }
    env *= dEnv;
  }
  return out;
}

/** Inharmonic partial ratios of a small struck metal part. */
export const METAL_RATIOS = [1, 1.47, 2.09, 2.56, 3.18, 3.91, 4.62];

/**
 * Metallic click: a bandpassed noise tick plus short inharmonic partials and
 * an optional lower "body" mode for heavier clunks.
 */
export function addMetal(out, sr, rng, t0, {
  f = 3000, amp = 1, tau = 0.015, fall = 0.78, n = 5, ratios = METAL_RATIOS, spread = 0.04,
  noise: nAmp = 0.9, noiseTau = 0.0008, noiseF, noiseQ = 1.1,
  body = 0, bodyF = 500, bodyTau = 0.02,
} = {}) {
  for (let k = 0; k < n; k++) {
    addTone(out, sr, t0, {
      f: f * ratios[k] * rng.jit(1, spread),
      amp: amp * 0.45 * Math.pow(0.72, k) * rng.range(0.55, 1),
      tau: tau * Math.pow(fall, k) * rng.jit(1, 0.2),
      phase: rng() * TAU,
      a: 0.00008,
    });
  }
  if (nAmp) addBurst(out, sr, rng, t0, amp * nAmp, { a: 0.00004, tau: noiseTau, filters: [['bandpass', noiseF ?? f * 1.25, noiseQ]] });
  // lower "clunk" mode of the part/receiver: kept short so clicks stay metallic
  if (body) addTone(out, sr, t0, { f: bodyF * rng.jit(1, 0.05), amp: amp * body * 0.65, tau: bodyTau * 0.6, phase: rng() * TAU, a: 0.00015 });
  return out;
}

/**
 * Granular crunch: `count` micro noise grains, each through its own random
 * bandpass, scattered over [t0, t0+span] (shape > 1 clusters them early) with
 * an exponential amplitude decay.
 */
export function addGrains(out, sr, rng, {
  t0 = 0, span = 0.1, count = 30, shape = 1.5, dur = [0.0005, 0.003], amp = [0.3, 1],
  decay = 0.05, f = [1000, 5000], q = [1, 3], type = 'bandpass',
} = {}) {
  for (let g = 0; g < count; g++) {
    const u = Math.pow(rng(), shape);
    const t = t0 + u * span;
    const d = rng.range(dur[0], dur[1]);
    const nd = Math.max(4, Math.ceil(d * sr));
    const x = new Float32Array(nd + Math.ceil(0.003 * sr));
    for (let i = 0; i < nd; i++) {
      const w = Math.sin((Math.PI * i) / nd);
      x[i] = (rng() * 2 - 1) * w * w;
    }
    biquad(x, sr, type, rng.logRange(f[0], f[1]), rng.range(q[0], q[1]));
    normalize(x, 1);
    mixInto(out, x, t * sr, rng.range(amp[0], amp[1]) * Math.exp(-(t - t0) / decay));
  }
  return out;
}

/**
 * Filtered noise "scrape" between t0 and t0+dur (bell envelope) through a
 * bandpass sweeping f0 -> f1. `grit` adds amplitude roughness.
 */
export function addScrape(out, sr, rng, t0, dur, { f0 = 2000, f1 = 3000, q = 1.5, amp = 0.5, grit = 0.5, rise = 0.3, color = 'white' } = {}) {
  const n = Math.ceil((dur + 0.01) * sr);
  const x = noise(n, rng, color);
  let r = 0;
  const rc = Math.exp(-1 / (0.0015 * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    r = rc * r + (1 - rc) * (rng() < 0.08 ? rng() * 4 : 0);
    x[i] *= envBell(t, dur * rise, dur * (1 - rise)) * (1 - grit + grit * Math.min(2, r * 3));
  }
  svf(x, sr, 'bp', (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / dur)), q);
  normalize(x, 1);
  return mixInto(out, x, t0 * sr, amp);
}

/**
 * Glottal pulse train (derivative of a Rosenberg flow pulse) following the
 * f0(t) contour, with jitter and shimmer. Used for abstract formant grunts.
 */
export function glottal(n, sr, rng, f0Fn, { jitter = 0.015, shimmer = 0.08, open = 0.42, close = 0.16 } = {}) {
  const out = new Float32Array(n);
  let ph = 0, prev = 0, amp = 1, jit = 1;
  for (let i = 0; i < n; i++) {
    const f0 = f0Fn(i / sr) * jit;
    ph += f0 / sr;
    if (ph >= 1) {
      ph -= 1;
      jit = 1 + jitter * (rng() * 2 - 1);
      amp = 1 - shimmer * rng();
    }
    let u;
    if (ph < open) u = 0.5 * (1 - Math.cos((Math.PI * ph) / open));
    else if (ph < open + close) u = Math.cos((Math.PI * (ph - open)) / (2 * close));
    else u = 0;
    u *= amp;
    out[i] = (u - prev) * 20;
    prev = u;
  }
  return out;
}

/** Piecewise-linear interpolation through [[t, v], ...]. */
export function pwl(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i][0]) {
        const [t0, v0] = points[i - 1];
        const [t1, v1] = points[i];
        return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
      }
    }
    return points[points.length - 1][1];
  };
}

/**
 * Reverberant tail, computed directly (no convolution): a diffuse part that is
 * noise shaped by the dry signal's energy run through an exponential decay
 * (statistically what convolving with an exponentially decaying noise IR gives),
 * plus discrete slap echoes (delayed, windowed copies of the dry: dust2's walls),
 * all darkened over time by a gliding lowpass. Mixes into `out` (may be `dry`).
 */
export function addTail(out, dry, sr, rng, { tau = 0.3, pre = 0.006, lp = 4000, lpEnd = 900, slaps = [], wet = 0.3, hp = 120, slapWin = 0.2, len } = {}) {
  const n = Math.min(out.length, len ? Math.ceil(len * sr) : out.length);
  const tail = white(n, rng); // shaped in place
  const d2 = Math.exp(-2 / (tau * sr));
  const k = 2 / (tau * sr);
  const preN = Math.round(pre * sr);
  const att = 1 - Math.exp(-16 / (0.004 * sr));
  const dn = Math.min(dry.length, n - preN);
  let E = 0, A = 0, A0 = 0;
  for (let b = 0; b < n; b += 16) {
    const m = Math.min(n, b + 16);
    for (let i = b; i < m; i++) {
      const j = i - preN;
      if (j >= 0 && j < dn) {
        const v = dry[j];
        E = E * d2 + v * v;
      } else E *= d2;
    }
    A0 = A;
    A += att * (Math.sqrt(k * E) - A);
    for (let i = b; i < m; i++) tail[i] *= A0 + ((A - A0) * (i - b)) / 16;
  }
  const winN = Math.min(dry.length, Math.round(slapWin * sr));
  const fadeStart = Math.round(winN * 0.5);
  for (const [t, a] of slaps) {
    const off = Math.round(t * sr);
    // two slightly offset copies so the echo is a little smeared, not a digital copy
    const off2 = off + Math.round(rng.range(0.002, 0.006) * sr);
    for (let i = 0; i < winN; i++) {
      const w = i < fadeStart ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - fadeStart)) / (winN - fadeStart));
      const v = dry[i] * w * a;
      if (off + i < n) tail[off + i] += v * 0.65;
      if (off2 + i < n) tail[off2 + i] -= v * 0.35;
    }
  }
  glideLP(tail, sr, lp, lpEnd, 2);
  if (hp) biquad(tail, sr, 'highpass', hp, 0.7);
  return mixInto(out, tail, 0, wet);
}

// ---------------------------------------------------------- mix target ---

/**
 * What a recipe draws into: `arr()` hands out scratch buffers of the render
 * length, `play(data)` mixes a mono buffer (or [L, R]) into the output. Pure
 * JS, so recipes run unchanged in a Web Worker or on the main thread.
 */
export class Mix {
  constructor(sr, rng, length, numberOfChannels = 1) {
    this.sr = sr;
    this.rng = rng;
    this.len = length;
    this.dur = length / sr;
    this.out = 'out';
    this.numberOfChannels = numberOfChannels;
    this._ch = null;
  }

  arr(sec = this.dur) {
    return new Float32Array(Math.min(this.len, Math.ceil(sec * this.sr)));
  }

  // (the second argument mirrors a Web Audio destination; there is only one here)
  play(data, _dest = this.out, t = 0) {
    const chs = Array.isArray(data) ? data : [data];
    if (!this._ch && !t && chs.length === this.numberOfChannels && chs.every((c) => c.length === this.len)) {
      this._ch = chs; // first full-length play: adopt the buffers, no copy
      return;
    }
    if (!this._ch) this._ch = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.len));
    this._ch.forEach((c, i) => mixInto(c, chs[Math.min(i, chs.length - 1)], t * this.sr));
  }

  get channels() {
    if (!this._ch) this._ch = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.len));
    return this._ch;
  }
}
