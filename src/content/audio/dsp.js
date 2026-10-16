// Pure DSP toolkit (no Web Audio objects): oscillators, filters, envelopes, modal resonators,
// noise, post-processing. Used by the buffer recipes both on the main thread and inside the
// render worker, so it must stay free of DOM / AudioContext references.

export const TAU = Math.PI * 2

/** Seeded PRNG (mulberry32) with helpers. r() → [0,1). */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  r.range = (lo, hi) => lo + (hi - lo) * r()
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r())
  r.pick = arr => arr[Math.floor(r() * arr.length)]
  r.chance = p => r() < p
  r.bi = () => r() * 2 - 1
  r.gauss = () => (r() + r() + r() + r() - 2) * 1.2247
  return r
}

/** FNV-1a string hash. */
export function hashStr(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
export const dbToGain = db => Math.pow(10, db / 20)
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12)
export const semis = s => Math.pow(2, s / 12)

// ---- filters -------------------------------------------------------------------------------

/** RBJ biquad, transposed direct form II. type: lp hp bp notch peak ls hs ap */
export class Biquad {
  constructor(sr, type = 'lp', f = 1000, q = 0.707, gain = 0) {
    this.sr = sr
    this.z1 = 0; this.z2 = 0
    this.set(type, f, q, gain)
  }
  set(type, f, q = 0.707, gain = 0) {
    const sr = this.sr
    f = f < 5 ? 5 : f > sr * 0.49 ? sr * 0.49 : f
    const w = (TAU * f) / sr, cw = Math.cos(w), sw = Math.sin(w)
    const alpha = sw / (2 * q), A = Math.pow(10, gain / 40)
    let b0, b1, b2, a0, a1, a2
    switch (type) {
      case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break
      case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break
      case 'ap': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break
      case 'ls': {
        const s = 2 * Math.sqrt(A) * alpha
        b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s)
        a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s
        break
      }
      case 'hs': {
        const s = 2 * Math.sqrt(A) * alpha
        b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s)
        a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s
        break
      }
      default: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0
    return this
  }
  process(x) {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
  reset() { this.z1 = this.z2 = 0 }
}

/** Topology-preserving state-variable filter: stable under fast modulation. */
export class SVF {
  constructor(sr, f = 1000, q = 0.707) {
    this.sr = sr
    this.ic1 = 0; this.ic2 = 0
    this.lp = 0; this.bp = 0; this.hp = 0; this.bpn = 0
    this.set(f, q)
  }
  set(f, q = 0.707) {
    f = f < 5 ? 5 : f > this.sr * 0.48 ? this.sr * 0.48 : f
    const g = Math.tan((Math.PI * f) / this.sr)
    this.k = 1 / q
    this.a1 = 1 / (1 + g * (g + this.k))
    this.a2 = g * this.a1
    this.a3 = g * this.a2
    return this
  }
  process(v0) {
    const v3 = v0 - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    this.lp = v2; this.bp = v1; this.bpn = this.k * v1
    this.hp = v0 - this.k * v1 - v2
    return v2
  }
}

/** One-pole lowpass / highpass. */
export class OnePole {
  constructor(sr, f = 1000) { this.sr = sr; this.y = 0; this.set(f) }
  set(f) { this.a = Math.exp((-TAU * Math.min(f, this.sr * 0.49)) / this.sr); return this }
  lp(x) { this.y = x + this.a * (this.y - x); return this.y }
  hp(x) { this.y = x + this.a * (this.y - x); return x - this.y }
}

/** Klatt-style 2-pole resonator (unity gain at DC) — formants, body modes. */
export class Reso {
  constructor(sr, f = 500, bw = 80) { this.sr = sr; this.y1 = 0; this.y2 = 0; this.set(f, bw) }
  set(f, bw) {
    const T = 1 / this.sr
    f = Math.min(f, this.sr * 0.47)
    this.C = -Math.exp(-TAU * bw * T)
    this.B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(TAU * f * T)
    this.A = 1 - this.B - this.C
    return this
  }
  process(x) {
    const y = this.A * x + this.B * this.y1 + this.C * this.y2
    this.y2 = this.y1; this.y1 = y
    return y
  }
}

/** Fixed delay line with fractional read. */
export class Delay {
  constructor(maxSamples) { this.buf = new Float32Array(maxSamples + 2); this.n = maxSamples + 2; this.w = 0 }
  write(x) { this.buf[this.w] = x; this.w = (this.w + 1) % this.n }
  read(d) {
    let p = this.w - 1 - d
    while (p < 0) p += this.n
    const i = Math.floor(p), f = p - i
    const a = this.buf[i % this.n], b = this.buf[(i + 1) % this.n]
    return a + (b - a) * f
  }
}

// ---- oscillators ---------------------------------------------------------------------------

export function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1 }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1 }
  return 0
}

/** Band-limited phase-accumulating oscillator. Call next*(freq) once per sample. */
export class Osc {
  constructor(sr, phase = 0) { this.sr = sr; this.ph = phase }
  step(f) { const dt = f / this.sr; this.ph += dt; if (this.ph >= 1) this.ph -= Math.floor(this.ph); return dt }
  sine(f) { this.step(f); return Math.sin(TAU * this.ph) }
  saw(f) { const dt = this.step(f); return 2 * this.ph - 1 - blep(this.ph, Math.min(dt, 0.5)) }
  square(f, pw = 0.5) {
    const dt = Math.min(this.step(f), 0.5)
    let v = this.ph < pw ? 1 : -1
    v += blep(this.ph, dt)
    let t2 = this.ph - pw; if (t2 < 0) t2 += 1
    v -= blep(t2, dt)
    return v
  }
  tri(f) { this.step(f); return 1 - 4 * Math.abs(this.ph - 0.5) }
}

// ---- noise ---------------------------------------------------------------------------------

export class Pink {
  constructor() { this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0 }
  next(w) {
    this.b0 = 0.99886 * this.b0 + w * 0.0555179; this.b1 = 0.99332 * this.b1 + w * 0.0750759
    this.b2 = 0.969 * this.b2 + w * 0.153852; this.b3 = 0.8665 * this.b3 + w * 0.3104856
    this.b4 = 0.55 * this.b4 + w * 0.5329522; this.b5 = -0.7616 * this.b5 - w * 0.016898
    const p = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362
    this.b6 = w * 0.115926
    return p * 0.11
  }
}
export class Brown {
  constructor() { this.v = 0 }
  next(w) { this.v = (this.v + 0.02 * w) / 1.02; return this.v * 3.5 }
}

/** Smooth random signal (value noise) — call next() per sample; rate = changes per second. */
export class Wander {
  constructor(r, sr, rate) { this.r = r; this.sr = sr; this.rate = rate; this.a = r.bi(); this.b = r.bi(); this.t = 0 }
  next() {
    this.t += this.rate / this.sr
    if (this.t >= 1) { this.t -= 1; this.a = this.b; this.b = this.r.bi() }
    return this.a + (this.b - this.a) * smooth(this.t)
  }
}

// ---- envelopes -----------------------------------------------------------------------------

/** Attack/decay envelope value at t (s): linear attack a, exponential decay tau. */
export const adEnv = (t, a, tau) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / tau))
/** Trapezoid: fade in a, hold until len-r, fade out r (smooth). */
export function trap(t, len, a, r) {
  if (t < 0 || t > len) return 0
  if (t < a) return smooth(t / a)
  if (t > len - r) return smooth((len - t) / r)
  return 1
}
/** Gaussian bump centred at c with width w (s). */
export const bump = (t, c, w) => Math.exp(-((t - c) * (t - c)) / (2 * w * w))

// ---- buffer helpers ------------------------------------------------------------------------

export function buf(seconds, sr) { return new Float32Array(Math.max(1, Math.round(seconds * sr))) }

/** Peak of one or more channels. */
export function peakOf(chs) {
  let p = 0
  for (const d of chs) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > p) p = v }
  return p
}
export function rmsOf(chs) {
  let s = 0, n = 0
  for (const d of chs) { for (let i = 0; i < d.length; i++) s += d[i] * d[i]; n += d.length }
  return Math.sqrt(s / Math.max(1, n))
}

/** Scale channels so the peak equals `peak`. */
export function normalizePeak(chs, peak = 0.9) {
  const p = peakOf(chs)
  if (p < 1e-9) return chs
  const g = peak / p
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g
  return chs
}
/** Scale to an RMS target, but never past a peak ceiling. */
export function normalizeRms(chs, rms = 0.1, ceiling = 0.95) {
  const r = rmsOf(chs), p = peakOf(chs)
  if (r < 1e-9) return chs
  const g = Math.min(rms / r, ceiling / Math.max(p, 1e-9))
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g
  return chs
}

/** Short fades at both ends (ms) to avoid clicks. */
export function fadeEdges(d, sr, inMs = 3, outMs = 8) {
  const ni = Math.min(d.length, Math.floor((inMs / 1000) * sr)), no = Math.min(d.length, Math.floor((outMs / 1000) * sr))
  for (let i = 0; i < ni; i++) d[i] *= i / ni
  for (let i = 0; i < no; i++) d[d.length - 1 - i] *= i / no
  return d
}

/** Remove DC with a gentle highpass (in place). */
export function dcBlock(d, sr, f = 18) {
  const hp = new Biquad(sr, 'hp', f, 0.6)
  for (let i = 0; i < d.length; i++) d[i] = hp.process(d[i])
  return d
}

/**
 * Make a seamless loop: the generated signal is `len + x` samples long; the last x samples are
 * cross-faded (equal power) into the first x, and the result is `len` samples.
 */
export function loopify(src, x) {
  const len = src.length - x
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) out[i] = src[i]
  for (let i = 0; i < x; i++) {
    const t = i / x
    const a = Math.sin(t * Math.PI / 2), b = Math.cos(t * Math.PI / 2)
    out[i] = src[i] * a + src[len + i] * b
  }
  return out
}

/** Add src into dst at sample offset with gain. */
export function mixInto(dst, src, offset = 0, gain = 1) {
  const n = Math.min(src.length, dst.length - offset)
  for (let i = Math.max(0, -offset); i < n; i++) dst[offset + i] += src[i] * gain
  return dst
}

/** Apply an in-place filter chain built from Biquads. */
export function filt(d, sr, specs) {
  const fs = specs.map(s => new Biquad(sr, s[0], s[1], s[2] ?? 0.707, s[3] ?? 0))
  for (let i = 0; i < d.length; i++) {
    let v = d[i]
    for (let k = 0; k < fs.length; k++) v = fs[k].process(v)
    d[i] = v
  }
  return d
}

/** Soft clip in place. */
export function softClip(d, drive = 1.5) {
  const n = Math.tanh(drive)
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * drive) / n
  return d
}

/**
 * Flutter / slapback echo between parallel blocks: taps [[delaySec, gain], ...] with a lowpass
 * on the echoes (in place, output keeps length).
 */
export function echoes(d, sr, taps, lp = 2500) {
  const src = Float32Array.from(d)
  for (const [delay, g] of taps) {
    const off = Math.floor(delay * sr)
    const f = new Biquad(sr, 'lp', lp, 0.6)
    for (let i = 0; i + off < d.length; i++) d[i + off] += f.process(src[i]) * g
  }
  return d
}

/** Cheap mono diffuse reverb (Schroeder): returns a new array of wet signal (same length). */
export function diffuse(d, sr, decay = 1.2, damp = 3000, mix = 0.3) {
  const combs = [1116, 1188, 1277, 1356].map(n => Math.floor(n * sr / 44100))
  const aps = [556, 441, 341].map(n => Math.floor(n * sr / 44100))
  const cb = combs.map(n => ({ b: new Float32Array(n), i: 0, lp: 0, g: Math.pow(10, (-3 * n / sr) / decay) }))
  const ab = aps.map(n => ({ b: new Float32Array(n), i: 0 }))
  const dampA = Math.exp(-TAU * damp / sr)
  for (let i = 0; i < d.length; i++) {
    const x = d[i]
    let y = 0
    for (const c of cb) {
      const o = c.b[c.i]
      c.lp = o + dampA * (c.lp - o)
      c.b[c.i] = x + c.lp * c.g
      c.i = (c.i + 1) % c.b.length
      y += o
    }
    y *= 0.25
    for (const a of ab) {
      const o = a.b[a.i]
      const v = y + o * 0.5
      a.b[a.i] = v
      a.i = (a.i + 1) % a.b.length
      y = o - v * 0.5
    }
    d[i] = x * (1 - mix * 0.5) + y * mix
  }
  return d
}

/**
 * Modal impact: adds sum of damped sinusoids into dst starting at sample offset.
 * modes: [[freq, amp, decaySec], ...]. jitter adds slight frequency spread (beating).
 */
export function addModes(dst, sr, offset, modes, gain = 1, r = null, attack = 0.0006) {
  const atk = Math.max(1, Math.floor(attack * sr))
  for (const [f, a, dec] of modes) {
    if (f >= sr * 0.48) continue
    const n = Math.min(dst.length - offset, Math.floor(dec * 7 * sr))
    const w = (TAU * f) / sr
    const k = Math.exp(-1 / (dec * sr))
    // recursive sine oscillator (cheap): y[n] = 2cos(w) y[n-1] - y[n-2]
    const c = 2 * Math.cos(w)
    const ph = r ? r() * TAU : 0
    let y1 = Math.sin(ph - w), y2 = Math.sin(ph - 2 * w)
    let e = 1
    for (let i = 0; i < n; i++) {
      const y = c * y1 - y2
      y2 = y1; y1 = y
      const at = i < atk ? i / atk : 1
      dst[offset + i] += y * a * e * at * gain
      e *= k
    }
  }
  return dst
}

/** Short filtered noise burst into dst (impulse excitation, grit, clicks). */
export function addBurst(dst, sr, offset, len, r, { f = 2000, q = 1, type = 'bp', gain = 1, tau = null, attack = 0 } = {}) {
  const n = Math.min(dst.length - offset, Math.floor(len * sr))
  if (n <= 0) return dst
  const bq = new Biquad(sr, type, f, q)
  const ta = tau ?? len / 4
  const na = Math.max(1, Math.floor(attack * sr))
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const e = (i < na ? i / na : 1) * Math.exp(-t / ta)
    dst[offset + i] += bq.process(r.bi()) * e * gain
  }
  return dst
}

/** Resample (linear) by a rate (>1 = faster/higher). Returns new array. */
export function resample(d, rate) {
  const n = Math.floor(d.length / rate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const p = i * rate, k = Math.floor(p), f = p - k
    const a = d[k] ?? 0, b = d[k + 1] ?? a
    out[i] = a + (b - a) * f
  }
  return out
}

/** Make stereo from mono with a tiny decorrelation (Haas + filter). */
export function widen(d, sr, ms = 9) {
  const off = Math.floor((ms / 1000) * sr)
  const L = Float32Array.from(d)
  const R = new Float32Array(d.length)
  const ap = new Biquad(sr, 'ap', 900, 0.5)
  for (let i = 0; i < d.length; i++) R[i] = ap.process(i >= off ? d[i - off] : 0) * 0.8 + d[i] * 0.2
  return [L, R]
}
