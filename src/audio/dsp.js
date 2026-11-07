// =============================================================================
// DSP toolkit for the audio module:
//  * seeded RNG, maths helpers
//  * shared noise bank (white / pink / brown / slow "wobble" modulators) as
//    looping AudioBuffers - every procedural source is built from these
//  * synthetic impulse responses (cabin, lavatory)
//  * an offline sample synthesiser (SynthBuf) with physically-motivated
//    primitives: damped modal resonators (impacts on plastic / metal), filtered
//    noise bursts (air, friction), stick-slip creaks, crackle (paper),
//    bubbles (water) and pitch-dropping thumps. Foley is rendered once into
//    AudioBuffers with these and cached.
// =============================================================================

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const dbToGain = (db) => Math.pow(10, db / 20);

/** mulberry32 seeded RNG -> () => [0,1) */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------- RBJ biquad (JS)
export class Biquad {
  constructor(type, f, q = 0.707, sr = 48000, gainDb = 0) { this.set(type, f, q, sr, gainDb); this.z1 = 0; this.z2 = 0; }
  set(type, f, q, sr, gainDb = 0) {
    const w = 2 * Math.PI * clamp(f, 5, sr * 0.49) / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass': b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'highpass': b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'bandpass': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
      case 'peaking': b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; break;
      default: b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  /** transposed direct form II */
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  run(arr, from = 0, to = arr.length) { for (let i = from; i < to; i++) arr[i] = this.tick(arr[i]); return arr; }
}

// ----------------------------------------------------------------------------- noise generators
function whiteArr(n, r) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r() * 2 - 1; return a; }
function pinkArr(n, r) {
  const a = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    a[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
  }
  return a;
}
function brownArr(n, r) {
  const a = new Float32Array(n); let y = 0;
  for (let i = 0; i < n; i++) { y = (y + 0.02 * (r() * 2 - 1)) * 0.99; a[i] = y; }
  return a;
}
function normRms(a, target = 0.25) {
  let s = 0, m = 0; for (let i = 0; i < a.length; i++) s += a[i]; m = s / a.length;
  let e = 0; for (let i = 0; i < a.length; i++) { a[i] -= m; e += a[i] * a[i]; }
  const k = target / Math.sqrt(e / a.length + 1e-20); for (let i = 0; i < a.length; i++) a[i] *= k;
  return a;
}
/** Make a loop seamless by crossfading the tail into the head. */
function seamless(a, sr, fade = 0.25) {
  const n = Math.min(Math.floor(fade * sr), a.length >> 2), L = a.length - n;
  const out = new Float32Array(L);
  out.set(a.subarray(0, L));
  for (let i = 0; i < n; i++) { const t = i / n; out[i] = a[i] * Math.sqrt(t) + a[L + i] * Math.sqrt(1 - t); }
  return out;
}

/** Shared bank of looping modulation / noise buffers for one AudioContext. */
export class NoiseBank {
  constructor(ctx, seconds = 6) {
    const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
    const mk = (arr) => { const b = ctx.createBuffer(1, arr.length, sr); b.copyToChannel(arr, 0); return b; };
    const R = rng(7331);
    this.ctx = ctx;
    this.white = mk(seamless(normRms(whiteArr(n, R)), sr));
    this.pink = [mk(seamless(normRms(pinkArr(n, R)), sr)), mk(seamless(normRms(pinkArr(n + 977, R)), sr)), mk(seamless(normRms(pinkArr(n + 2311, R)), sr))];
    this.brown = [mk(seamless(normRms(brownArr(n, R)), sr)), mk(seamless(normRms(brownArr(n + 1543, R)), sr))];
    // slow random modulators (periodic over the loop: sum of sines at k/len) - mean 0, peak ~1
    const len = 24, wn = Math.floor(len * 3000);
    this.wobble = [0, 1, 2, 3].map((s) => {
      const r = rng(101 + s * 17), a = new Float32Array(wn), parts = [];
      for (let k = 0; k < 9; k++) parts.push({ f: (2 + Math.floor(r() * (s === 3 ? 160 : 40))) / len, p: r() * Math.PI * 2, a: 0.4 + r() });
      let m = 0;
      for (let i = 0; i < wn; i++) { let v = 0; const t = i / 3000; for (const q of parts) v += q.a * Math.sin(2 * Math.PI * q.f * t + q.p); a[i] = v; m = Math.max(m, Math.abs(v)); }
      for (let i = 0; i < wn; i++) a[i] /= m;
      const b = ctx.createBuffer(1, wn, 3000); b.copyToChannel(a, 0); return b;
    });
    this._i = 0;
  }
  /** A started, looping source of the given buffer at a random offset. */
  source(buf, { rate = 1, offset } = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    const off = offset != null ? offset : ((this._i++ * 0.6180339) % 1) * buf.duration;
    s.start(0, off);
    return s;
  }
  pinkSrc(k = 0, o) { return this.source(this.pink[k % this.pink.length], o); }
  brownSrc(k = 0, o) { return this.source(this.brown[k % this.brown.length], o); }
  whiteSrc(o) { return this.source(this.white, o); }
  wobbleSrc(k = 0, rate = 1) { return this.source(this.wobble[k % this.wobble.length], { rate }); }
}

/** Synthetic room impulse response (stereo): early reflections + exponentially decaying filtered noise. */
export function makeIR(ctx, { decay = 0.4, length = 0.6, early = [], bright = 4000, seed = 3, predelay = 0.004 } = {}) {
  const sr = ctx.sampleRate, n = Math.floor(length * sr), b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed + ch * 31), a = new Float32Array(n), lp = new Biquad('lowpass', bright, 0.6, sr);
    const p0 = Math.floor(predelay * sr);
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      a[i] = (r() * 2 - 1) * Math.exp(-6.9 * t / decay) * (1 - Math.exp(-t * 900));
    }
    lp.run(a);
    for (const [t, g] of early) { const i = Math.floor((t + (ch ? 0.0013 : 0)) * sr); if (i < n) a[i] += g * (ch ? 0.9 : 1); }
    let e = 0; for (let i = 0; i < n; i++) e += a[i] * a[i];
    const k = 1 / Math.sqrt(e + 1e-12); for (let i = 0; i < n; i++) a[i] *= k * 0.9;
    b.copyToChannel(a, ch);
  }
  return b;
}

// ============================================================================= offline sample synthesis
/** Mono sample buffer under construction (seconds-based API). */
export class SynthBuf {
  constructor(sr, dur, seed = 1) {
    this.sr = sr; this.n = Math.ceil(dur * sr); this.d = new Float32Array(this.n); this.r = rng(seed);
  }
  idx(t) { return Math.max(0, Math.min(this.n, Math.floor(t * this.sr))); }
  rand(a = 0, b = 1) { return a + (b - a) * this.r(); }

  /** Damped sinusoid modes: list of [freqHz, amp, decaySec]. Small random detune per mode. */
  modes(t0, list, gain = 1, { attack = 0.0006, detune = 0.01, chirp = 0 } = {}) {
    const sr = this.sr, i0 = this.idx(t0), d = this.d;
    for (const [f0, a, dec] of list) {
      const f = f0 * (1 + this.rand(-detune, detune)), ph = this.rand(0, 6.283);
      const len = Math.min(this.n - i0, Math.ceil(dec * 7 * sr));
      const w = 2 * Math.PI * f / sr, k = Math.exp(-1 / (dec * sr)), at = Math.max(1, attack * sr);
      let env = 1, phase = ph;
      for (let i = 0; i < len; i++) {
        const atk = i < at ? i / at : 1;
        phase += w * (1 + chirp * env);
        d[i0 + i] += gain * a * env * atk * Math.sin(phase);
        env *= k;
      }
    }
    return this;
  }

  /** Filtered noise burst. env: 'exp' (attack/decay) | 'swell' (sin^p window) | fn(t01) */
  noise(t0, dur, { gain = 1, attack = 0.002, decay = null, env = 'exp', color = 'white', lp = null, hp = null, bp = null, bpq = 1, peak = null, curve = 1, lpEnd = null } = {}) {
    const sr = this.sr, i0 = this.idx(t0), len = Math.min(this.n - i0, Math.ceil(dur * sr));
    if (len <= 0) return this;
    const a = new Float32Array(len), r = this.r;
    let b0 = 0, b1 = 0, b2 = 0, y = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      else if (color === 'brown') { y = (y + 0.06 * w) * 0.995; a[i] = y * 2; }
      else a[i] = w;
    }
    const filters = [];
    if (hp || color === 'brown') filters.push(new Biquad('highpass', hp || 45, 0.707, sr));
    if (lp && !lpEnd) filters.push(new Biquad('lowpass', lp, 0.707, sr));
    if (bp) { filters.push(new Biquad('bandpass', bp, bpq, sr)); }
    if (peak) filters.push(new Biquad('peaking', peak[0], peak[1], sr, peak[2]));
    for (const f of filters) f.run(a);
    if (lp && lpEnd) { // sweeping low-pass
      const f = new Biquad('lowpass', lp, 0.707, sr);
      for (let i = 0; i < len; i++) { if ((i & 63) === 0) f.set('lowpass', lp * Math.pow(lpEnd / lp, i / len), 0.707, sr); a[i] = f.tick(a[i]); }
    }
    const dec = decay ?? dur / 4;
    for (let i = 0; i < len; i++) {
      const t = i / sr, u = i / len;
      let e;
      if (env === 'exp') e = (attack > 0 ? Math.min(1, t / attack) : 1) * Math.exp(-t / dec);
      else if (env === 'swell') e = Math.pow(Math.sin(Math.PI * Math.pow(u, curve)), 2);
      else if (env === 'flat') e = Math.min(1, t / Math.max(1e-4, attack)) * Math.min(1, (dur - t) / Math.max(1e-4, dec));
      else e = env(u, t);
      this.d[i0 + i] += a[i] * e * gain;
    }
    return this;
  }

  /** Low thud whose pitch drops (impact of a heavy object / floor thump). */
  thump(t0, { f0 = 120, f1 = 55, decay = 0.09, gain = 1, click = 0.15, clickLp = 2500 } = {}) {
    const sr = this.sr, i0 = this.idx(t0), len = Math.min(this.n - i0, Math.ceil(decay * 8 * sr));
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / (decay * 0.6));
      ph += 2 * Math.PI * f / sr;
      this.d[i0 + i] += gain * Math.sin(ph) * Math.exp(-t / decay) * Math.min(1, t * 2000);
    }
    if (click > 0) this.noise(t0, 0.03, { gain: gain * click, attack: 0.0003, decay: 0.006, lp: clickLp });
    return this;
  }

  /** Stick-slip friction creak: irregular impulse train through resonances. */
  creak(t0, dur, { rate = 60, rateEnd = null, jitter = 0.35, res = [[700, 8], [1500, 10]], gain = 1, env = 'swell' } = {}) {
    const sr = this.sr, i0 = this.idx(t0), len = Math.min(this.n - i0, Math.ceil(dur * sr));
    if (len <= 0) return this;
    const a = new Float32Array(len);
    let next = 0;
    for (let i = 0; i < len; i++) {
      if (i >= next) {
        const u = i / len, rr = rateEnd ? rate + (rateEnd - rate) * u : rate;
        a[i] = (this.r() * 0.6 + 0.4) * (this.r() < 0.5 ? -1 : 1);
        next = i + Math.max(1, Math.floor(sr / rr * (1 + this.rand(-jitter, jitter))));
      }
    }
    const out = new Float32Array(len);
    for (const [f, q] of res) { const b = new Biquad('bandpass', f, q, sr); for (let i = 0; i < len; i++) out[i] += b.tick(a[i]); }
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const e = env === 'swell' ? Math.pow(Math.sin(Math.PI * u), 1.5) : Math.exp(-u * 4);
      this.d[i0 + i] += out[i] * e * gain * 3;
    }
    return this;
  }

  /** Paper / plastic crackle: sparse random clicks through a bandpass. */
  crackle(t0, dur, { density = 400, bp = 3500, q = 0.8, gain = 1, env = 'swell' } = {}) {
    const sr = this.sr, i0 = this.idx(t0), len = Math.min(this.n - i0, Math.ceil(dur * sr));
    if (len <= 0) return this;
    const a = new Float32Array(len), p = density / sr;
    for (let i = 0; i < len; i++) if (this.r() < p) { const g = Math.pow(this.r(), 2.2); const L = 3 + Math.floor(this.r() * 30); for (let k = 0; k < L && i + k < len; k++) a[i + k] += g * (this.r() * 2 - 1) * Math.exp(-k / 6); }
    new Biquad('bandpass', bp, q, sr).run(a);
    new Biquad('highpass', 700, 0.7, sr).run(a);
    for (let i = 0; i < len; i++) { const u = i / len; const e = env === 'swell' ? Math.pow(Math.sin(Math.PI * u), 0.8) : Math.exp(-u * 3); this.d[i0 + i] += a[i] * e * gain * 4; }
    return this;
  }

  /** Water: random bubble resonances (rising chirps) on top of a noisy stream. */
  bubbles(t0, dur, { rate = 120, fMin = 500, fMax = 3200, gain = 1 } = {}) {
    const sr = this.sr;
    const count = Math.floor(rate * dur);
    for (let k = 0; k < count; k++) {
      const t = t0 + this.r() * dur, f = fMin * Math.pow(fMax / fMin, this.r()), dec = 0.004 + 0.012 * this.r() * (1000 / f);
      const i0 = this.idx(t), len = Math.min(this.n - i0, Math.ceil(dec * 6 * sr)), g = gain * (0.2 + 0.8 * this.r()) * 0.3;
      let ph = 0;
      for (let i = 0; i < len; i++) { const tt = i / sr; ph += 2 * Math.PI * f * (1 + tt / dec * 0.12) / sr; this.d[i0 + i] += g * Math.sin(ph) * Math.exp(-tt / dec); }
    }
    return this;
  }

  /** Steady tone with harmonics (motors, hums). */
  tone(t0, dur, { f = 400, fEnd = null, harm = [1], gain = 1, attack = 0.05, release = 0.1, vib = 0, vibRate = 5 } = {}) {
    const sr = this.sr, i0 = this.idx(t0), len = Math.min(this.n - i0, Math.ceil(dur * sr));
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, u = i / len, ff = (fEnd ? f + (fEnd - f) * u : f) * (1 + vib * Math.sin(2 * Math.PI * vibRate * t));
      ph += 2 * Math.PI * ff / sr;
      let v = 0; for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(ph * (h + 1));
      const e = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
      this.d[i0 + i] += gain * v * e;
    }
    return this;
  }

  /** Global post filter */
  filter(type, f, q = 0.707, gainDb = 0) { new Biquad(type, f, q, this.sr, gainDb).run(this.d); return this; }
  /** Soft saturation */
  saturate(drive = 1.5) { const k = Math.tanh(drive); for (let i = 0; i < this.n; i++) this.d[i] = Math.tanh(this.d[i] * drive) / k; return this; }
  normalize(peak = 0.9) {
    let m = 0; for (let i = 0; i < this.n; i++) { const v = Math.abs(this.d[i]); if (v > m) m = v; }
    if (m > 0) { const k = peak / m; for (let i = 0; i < this.n; i++) this.d[i] *= k; }
    // remove DC + fade out tail
    const f = Math.min(this.n, Math.floor(this.sr * 0.01));
    for (let i = 0; i < f; i++) this.d[this.n - 1 - i] *= i / f;
    return this;
  }
  toBuffer(ctx) { const b = ctx.createBuffer(1, this.n, this.sr); b.copyToChannel(this.d, 0); return b; }
}
