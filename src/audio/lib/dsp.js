// Offline DSP primitives for procedural buffer synthesis.
// All functions operate on Float32Array (mono). A "sound" is { sr, ch: Float32Array[] }.
import { noiseGen } from './rng.js';

export const TAU = Math.PI * 2;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-12, Math.abs(g)));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function makeSound(sr, channels) { return { sr, ch: channels }; }
export function monoSound(sr, data) { return { sr, ch: [data] }; }
export const secs = (sr, s) => Math.max(1, Math.round(sr * s));

// ---------------------------------------------------------------- biquads (RBJ cookbook)
export function biquadCoefs(type, f, Q, sr, gainDb = 0) {
  const w0 = (TAU * clamp(f, 5, sr * 0.495)) / sr;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const alpha = sw / (2 * Math.max(1e-4, Q));
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'highpass':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bandpass': // 0 dB peak
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch':
      b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + sq); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sq);
      a0 = (A + 1) + (A - 1) * cw + sq; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sq; break;
    }
    case 'highshelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sq);
      a0 = (A + 1) - (A - 1) * cw + sq; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sq; break;
    }
    default:
      throw new Error('biquad type ' + type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** In-place biquad over x[from..to). */
export function biquadRun(x, c, from = 0, to = x.length) {
  const { b0, b1, b2, a1, a2 } = c;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = from; i < to; i++) {
    const xi = x[i];
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    x[i] = yi;
  }
  return x;
}

/** In-place filter convenience. */
export function filt(x, type, f, Q, sr, gainDb = 0, from = 0, to = x.length) {
  return biquadRun(x, biquadCoefs(type, f, Q, sr, gainDb), from, to);
}

/** Zavalishin TPT state-variable filter: cheap per-sample modulation. */
export class SVF {
  constructor(f = 1000, Q = 0.707, sr = 48000) {
    this.ic1 = 0; this.ic2 = 0; this.lp = 0; this.bp = 0; this.hp = 0;
    this.set(f, Q, sr);
  }
  set(f, Q, sr) {
    const g = Math.tan((Math.PI * clamp(f, 5, sr * 0.49)) / sr);
    const k = 1 / Math.max(0.05, Q);
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.bp = v1; this.lp = v2; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

export function onePoleLP(x, fc, sr, from = 0, to = x.length) {
  const a = Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = from; i < to; i++) { y = x[i] + a * (y - x[i]); x[i] = y; }
  return x;
}
export function onePoleHP(x, fc, sr, from = 0, to = x.length) {
  const a = Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = from; i < to; i++) { y = x[i] + a * (y - x[i]); x[i] = x[i] - y; }
  return x;
}
export function dcBlock(x, sr, fc = 18) {
  filt(x, 'highpass', fc, 0.6, sr);
  return x;
}

// ---------------------------------------------------------------- modal synthesis
/** Add exp-decaying sinusoid (struck mode) starting at sample `start`. tau = 1/e time (s). */
export function addMode(out, start, f, tau, amp, sr, phase = 0) {
  if (!(f > 5) || f >= sr * 0.48 || amp === 0 || start >= out.length) return;
  const w = (TAU * f) / sr;
  const r = Math.exp(-1 / (tau * sr));
  const c = Math.cos(w) * r;
  const s = Math.sin(w) * r;
  let re = Math.cos(phase) * amp;
  let im = Math.sin(phase) * amp;
  start = Math.max(0, Math.round(start));
  // stop once below ~-90 dBFS-ish (relative to unit-peak buffers)
  const life = Math.max(3, Math.log(Math.max(1e-4, Math.abs(amp)) * 3e4));
  const n = Math.min(out.length - start, Math.ceil(tau * sr * life));
  for (let i = 0; i < n; i++) {
    out[start + i] += im;
    const t = re * c - im * s;
    im = re * s + im * c;
    re = t;
  }
}

/** Decaying sinusoid whose frequency glides exponentially from f0 to f1 (time constant glide). */
export function addGlideMode(out, start, f0, f1, glide, tau, amp, sr) {
  start = Math.max(0, Math.round(start));
  const n = Math.min(out.length - start, Math.ceil(tau * sr * 10));
  if (n <= 0) return;
  const kd = Math.exp(-1 / (tau * sr));
  const kg = Math.exp(-8 / (Math.max(1e-4, glide) * sr));
  let env = amp;
  let fd = f0 - f1;
  let re = 1, im = 0, c = 1, s = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 7) === 0) {
      const w = (TAU * (f1 + fd)) / sr;
      c = Math.cos(w); s = Math.sin(w);
      fd *= kg;
    }
    out[start + i] += env * im;
    const t = re * c - im * s;
    im = re * s + im * c;
    re = t;
    env *= kd;
  }
}

/** Water droplet / bubble (Minnaert resonance with rising pitch). rise: final/initial ratio over ~3 tau. */
export function addBubble(out, start, f0, rise, tau, amp, sr, attack = 0.0004) {
  start = Math.max(0, Math.round(start));
  const n = Math.min(out.length - start, Math.ceil(tau * sr * 9));
  if (n <= 0) return;
  const sigma = (rise - 1) / (3 * tau);
  const kd = Math.exp(-1 / (tau * sr));
  const na = Math.max(1, Math.round(attack * sr));
  let env = amp;
  let re = 1, im = 0, c = 1, s = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 7) === 0) {
      const t = i / sr;
      const w = (TAU * f0 * (1 + sigma * Math.min(t, 4 * tau))) / sr;
      c = Math.cos(w); s = Math.sin(w);
    }
    const a = i < na ? i / na : 1;
    out[start + i] += env * a * im;
    const t2 = re * c - im * s;
    im = re * s + im * c;
    re = t2;
    env *= kd;
  }
}

/**
 * Add a sinusoid whose frequency and amplitude are evaluated per block (rotation oscillator,
 * linear amplitude interpolation inside blocks). freqAt/ampAt take time in seconds from `start`.
 */
export function addOsc(out, start, n, sr, freqAt, ampAt, phase = 0, block = 32) {
  start = Math.max(0, Math.round(start));
  n = Math.min(Math.round(n), out.length - start);
  if (n <= 0) return;
  let re = Math.cos(phase), im = Math.sin(phase);
  let a0 = ampAt(0);
  for (let b = 0; b < n; b += block) {
    const m = Math.min(block, n - b);
    const w = (TAU * freqAt(b / sr)) / sr;
    const c = Math.cos(w), s = Math.sin(w);
    const a1 = ampAt((b + m) / sr);
    const da = (a1 - a0) / m;
    let a = a0;
    const o = start + b;
    for (let i = 0; i < m; i++) {
      out[o + i] += im * a;
      const t = re * c - im * s;
      im = re * s + im * c;
      re = t;
      a += da;
    }
    a0 = a1;
    const mag = Math.sqrt(re * re + im * im) || 1;
    re /= mag; im /= mag;
  }
}

// ---------------------------------------------------------------- noise
export function fillWhite(x, seed, amp = 1) {
  const nz = noiseGen(seed);
  for (let i = 0; i < x.length; i++) x[i] = nz() * amp;
  return x;
}
export function fillPink(x, seed, amp = 1) {
  const nz = noiseGen(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < x.length; i++) {
    const w = nz();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * amp;
    b6 = w * 0.115926;
  }
  return x;
}
export function fillBrown(x, seed, amp = 1, leak = 0.995) {
  const nz = noiseGen(seed);
  let y = 0;
  const g = (1 - leak) * 6;
  for (let i = 0; i < x.length; i++) {
    y = leak * y + nz() * g;
    x[i] = y * amp;
  }
  return x;
}

/** Smooth random control signal in ~[-1,1], knots at rateHz, smoothstep interpolation. */
export function smoothRandom(len, sr, rateHz, rng) {
  const out = new Float32Array(len);
  const step = Math.max(1, Math.round(sr / rateHz));
  let a = rng.range(-1, 1);
  let b = rng.range(-1, 1);
  let k = 0;
  for (let i = 0; i < len; i++) {
    if (k >= step) { k = 0; a = b; b = rng.range(-1, 1); }
    const t = k / step;
    const u = t * t * (3 - 2 * t);
    out[i] = a + (b - a) * u;
    k++;
  }
  return out;
}

let _scratch = new Float32Array(4096);
function scratch(n) {
  if (_scratch.length < n) _scratch = new Float32Array(Math.max(n, _scratch.length * 2));
  const v = _scratch.subarray(0, n);
  v.fill(0);
  return v;
}

/** Noise burst with attack + exponential decay, optionally filtered, added into out. */
export function addNoiseBurst(out, start, sr, o) {
  const dur = o.dur ?? 0.02;
  const s0 = Math.round(start);
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  if (n <= 0 || s0 < 0) return;
  const tmp = scratch(n);
  const nz = noiseGen(o.seed ?? 12345);
  const na = Math.max(1, Math.round((o.attack ?? 0.0005) * sr));
  const kd = Math.exp(-1 / ((o.tau ?? dur / 4) * sr));
  let env = 1;
  let end = n;
  for (let i = 0; i < n; i++) {
    const a = i < na ? (i / na) * (i / na) : 1;
    if (i >= na) {
      env *= kd;
      if (env < 1e-5) { end = i; break; }
    }
    tmp[i] = nz() * a * env;
  }
  // keep some room for filter ringing after the burst
  const m = Math.min(n, end + Math.round(0.004 * sr));
  if (o.hp) filt(tmp, 'highpass', o.hp, o.hpQ ?? 0.707, sr, 0, 0, m);
  if (o.lp) filt(tmp, 'lowpass', o.lp, o.lpQ ?? 0.707, sr, 0, 0, m);
  if (o.lp2) filt(tmp, 'lowpass', o.lp2, 0.707, sr, 0, 0, m);
  if (o.bp) filt(tmp, 'bandpass', o.bp, o.bpQ ?? 1, sr, 0, 0, m);
  if (o.peak) filt(tmp, 'peaking', o.peak, o.peakQ ?? 1, sr, o.peakDb ?? 6, 0, m);
  const amp = o.amp ?? 1;
  const nf = Math.min(m, Math.round(0.002 * sr));
  for (let i = 0; i < nf; i++) tmp[m - 1 - i] *= i / nf;
  for (let i = 0; i < m; i++) out[s0 + i] += tmp[i] * amp;
}

/** Sparse micro-impulse crackle. density(t01) -> events/sec; adds filtered clicks. */
export function addCrackle(out, start, sr, rng, o) {
  const dur = o.dur;
  const n = Math.min(out.length - Math.round(start), Math.ceil(dur * sr));
  if (n <= 0) return;
  const tmp = new Float32Array(n);
  const nz = noiseGen(rng.seed32());
  let t = 0;
  const rate = o.rate ?? 200;
  const shape = o.shape ?? ((u) => 1 - u);
  let guard = 0;
  while (t < dur && guard++ < 20000) {
    const u = t / dur;
    const r = Math.max(1, rate * Math.max(0.02, shape(u)));
    t += rng.exp(1 / r);
    if (t >= dur) break;
    const i0 = Math.round(t * sr);
    const len = Math.max(2, Math.round(rng.range(o.grainMin ?? 0.00008, o.grainMax ?? 0.0004) * sr));
    let a = (o.amp ?? 1) * Math.pow(rng.next(), o.ampPow ?? 2.5) * shape(u);
    if (rng.chance(o.bigProb ?? 0.05)) a *= rng.range(1.5, 3);
    for (let k = 0; k < len && i0 + k < n; k++) {
      const e = 1 - k / len;
      tmp[i0 + k] += nz() * a * e * e;
    }
    if (o.ring && rng.chance(o.ringProb ?? 0.5)) {
      addMode(tmp, i0, rng.logRange(o.ring[0], o.ring[1]), rng.range(o.ringTau?.[0] ?? 0.0005, o.ringTau?.[1] ?? 0.002), a * (o.ringAmp ?? 0.5), sr, 0);
    }
  }
  if (o.hp) filt(tmp, 'highpass', o.hp, 0.707, sr);
  if (o.lp) filt(tmp, 'lowpass', o.lp, 0.707, sr);
  if (o.bp) filt(tmp, 'bandpass', o.bp, o.bpQ ?? 0.8, sr);
  const s0 = Math.round(start);
  for (let i = 0; i < n; i++) out[s0 + i] += tmp[i];
}

// ---------------------------------------------------------------- utilities
export function peakOf(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i] < 0 ? -x[i] : x[i]; if (v > m) m = v; }
  return m;
}
export function rmsOf(x, from = 0, to = x.length) {
  let s = 0;
  to = Math.min(to, x.length);
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}
export function scale(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
export function normalizePeak(x, peak = 0.9) {
  const p = peakOf(x);
  if (p > 1e-9) scale(x, peak / p);
  return x;
}
export function normalizeRms(x, rms = 0.1) {
  const r = rmsOf(x);
  if (r > 1e-9) scale(x, rms / r);
  return x;
}
export function fadeIn(x, n) {
  n = Math.min(n, x.length);
  for (let i = 0; i < n; i++) x[i] *= i / n;
  return x;
}
export function fadeOut(x, n) {
  n = Math.min(n, x.length);
  const L = x.length;
  for (let i = 0; i < n; i++) x[L - 1 - i] *= i / n;
  return x;
}
export function mixInto(dst, src, offset = 0, gain = 1) {
  offset = Math.round(offset);
  const n = Math.min(src.length, dst.length - offset);
  for (let i = Math.max(0, -offset); i < n; i++) dst[offset + i] += src[i] * gain;
  return dst;
}
/** Trim trailing near-silence (keeps a short fade). */
export function trimTail(x, sr, thresh = 1e-4) {
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < thresh) end--;
  end = Math.min(x.length, end + Math.round(0.005 * sr));
  const y = x.slice(0, Math.max(8, end));
  fadeOut(y, Math.min(y.length, Math.round(0.004 * sr)));
  return y;
}

/**
 * Seamless loop: x has N + X samples (generated continuously). Returns N samples where the
 * first X samples crossfade (equal power) from x[N..N+X) into x[0..X), so out[N-1] -> out[0] is continuous.
 */
export function makeLoop(x, N, X) {
  const out = x.slice(0, N);
  for (let i = 0; i < X; i++) {
    const t = (i + 0.5) / X;
    const a = Math.sin(t * Math.PI * 0.5);
    const b = Math.cos(t * Math.PI * 0.5);
    out[i] = x[i] * a + x[N + i] * b;
  }
  return out;
}

/** Envelope from breakpoints [[t,v],...] (seconds), linear, sampled at sr into len samples. */
export function envBreak(len, sr, pts) {
  const out = new Float32Array(len);
  let k = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const [t0, v0] = pts[k];
    const [t1, v1] = pts[Math.min(k + 1, pts.length - 1)];
    const u = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 1;
    out[i] = v0 + (v1 - v0) * u;
  }
  return out;
}

/** Feedback comb with one-pole damping in the loop (in-place returns new array). */
export function combLP(x, sr, delaySec, fb, dampHz, mix = 1) {
  const D = Math.max(1, Math.round(delaySec * sr));
  const buf = new Float32Array(D);
  const a = Math.exp((-TAU * dampHz) / sr);
  let lp = 0;
  let w = 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const y = buf[w];
    lp = y + a * (lp - y);
    buf[w] = x[i] + lp * fb;
    w = w + 1 === D ? 0 : w + 1;
    out[i] = x[i] * (1 - mix) + y * mix;
  }
  return out;
}

/**
 * Small feedback-delay-network reverb (4 lines, Hadamard). Returns {L,R} with length input+tail.
 */
export function fdnReverb(input, sr, o = {}) {
  const rt60 = o.rt60 ?? 0.8;
  const size = o.size ?? 1;
  const damp = o.damp ?? 4000;
  const pd = Math.round((o.predelay ?? 0.005) * sr);
  const tail = Math.round((o.tail ?? Math.min(2.5, rt60)) * sr);
  const len = input.length + tail;
  const base = o.delays ?? [0.0313, 0.0379, 0.0431, 0.0497];
  const D = base.map((b) => Math.max(4, Math.round(b * size * sr)));
  const b0 = new Float32Array(D[0]), b1 = new Float32Array(D[1]), b2 = new Float32Array(D[2]), b3 = new Float32Array(D[3]);
  let i0 = 0, i1 = 0, i2 = 0, i3 = 0;
  const g = D.map((d) => Math.pow(10, (-3 * d) / (rt60 * sr)) * 0.5); // 0.5 = Hadamard-4 normalization
  const a = Math.exp((-TAU * damp) / sr);
  let l0 = 0, l1 = 0, l2 = 0, l3 = 0;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const inG = 0.5;
  for (let n = 0; n < len; n++) {
    const xi = n >= pd && n - pd < input.length ? input[n - pd] * inG : 0;
    const v0 = b0[i0], v1 = b1[i1], v2 = b2[i2], v3 = b3[i3];
    L[n] = v0 + v2 * 0.7 - v1 * 0.3;
    R[n] = v1 + v3 * 0.7 - v2 * 0.3;
    // Hadamard 4
    const h0 = v0 + v1 + v2 + v3;
    const h1 = v0 - v1 + v2 - v3;
    const h2 = v0 + v1 - v2 - v3;
    const h3 = v0 - v1 - v2 + v3;
    l0 = h0 + a * (l0 - h0); l1 = h1 + a * (l1 - h1); l2 = h2 + a * (l2 - h2); l3 = h3 + a * (l3 - h3);
    b0[i0] = l0 * g[0] + xi; b1[i1] = l1 * g[1] - xi; b2[i2] = l2 * g[2] + xi; b3[i3] = l3 * g[3] - xi;
    if (++i0 === D[0]) i0 = 0;
    if (++i1 === D[1]) i1 = 0;
    if (++i2 === D[2]) i2 = 0;
    if (++i3 === D[3]) i3 = 0;
  }
  return { L, R };
}

/** Mono convenience: input + wet reverb (mono sum), same length as input + tail. */
export function addRoom(input, sr, o = {}) {
  const { L, R } = fdnReverb(input, sr, o);
  const wet = o.wet ?? 0.3;
  const dry = o.dry ?? 1;
  const out = new Float32Array(L.length);
  for (let i = 0; i < out.length; i++) out[i] = (i < input.length ? input[i] * dry : 0) + (L[i] + R[i]) * 0.5 * wet;
  return out;
}

/** Cooperative yielding helper so long synthesis does not block the page. */
export function makeYielder(budgetMs = 12) {
  let last = now();
  let chan = null;
  const queue = [];
  if (typeof MessageChannel !== 'undefined') {
    chan = new MessageChannel();
    chan.port1.onmessage = () => { const r = queue.shift(); if (r) r(); };
  }
  const yieldNow = () =>
    new Promise((res) => {
      const sch = globalThis.scheduler;
      if (sch && typeof sch.yield === 'function') sch.yield().then(res, res);
      else if (chan) { queue.push(res); chan.port2.postMessage(0); }
      else setTimeout(res, 0);
    });
  const fn = async () => {
    const t = now();
    if (t - last > budgetMs) {
      await yieldNow();
      last = now();
    }
  };
  fn.close = () => { if (chan) { chan.port1.onmessage = null; chan.port1.close(); chan.port2.close(); } };
  return fn;
}
function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
