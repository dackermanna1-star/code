// Procedural DSP toolkit shared by the sound-effect and music recipes.
// Everything renders straight into Float32Arrays (no Web Audio needed), so the
// same code runs in a Worker or on the main thread. Deterministic via mulberry32.

export const TAU = Math.PI * 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C#4' / 'Eb3' / 'A2' -> MIDI number */
export function midi(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
}
export const hz = (name) => mtof(midi(name));

// Adult male formant frequencies (Hz) F1..F4; scaled for other voices.
export const VOWELS = {
  a: [730, 1090, 2440, 3400], ae: [660, 1720, 2410, 3300], e: [530, 1840, 2480, 3400],
  i: [300, 2250, 3000, 3500], o: [570, 840, 2410, 3300], u: [320, 870, 2240, 3300],
  uh: [640, 1190, 2390, 3400], er: [490, 1350, 1690, 3300], oo: [440, 1020, 2240, 3300],
  m: [260, 1100, 2200, 3300], h: [550, 1500, 2500, 3500], aw: [650, 950, 2500, 3400],
};
const FORMANT_BW = [80, 100, 140, 200];

export function vlerp(a, b, x) {
  const A = typeof a === 'string' ? VOWELS[a] : a, B = typeof b === 'string' ? VOWELS[b] : b;
  return [A[0] + (B[0] - A[0]) * x, A[1] + (B[1] - A[1]) * x, A[2] + (B[2] - A[2]) * x, A[3] + (B[3] - A[3]) * x];
}
/** keyframed vowel path: [[t,'a'],[t2,'o'],...] -> fn(t) */
export function vpath(keys) {
  return (t) => {
    if (t <= keys[0][0]) return VOWELS[keys[0][1]] || keys[0][1];
    for (let k = 1; k < keys.length; k++) {
      if (t <= keys[k][0]) {
        const x = (t - keys[k - 1][0]) / Math.max(1e-6, keys[k][0] - keys[k - 1][0]);
        return vlerp(keys[k - 1][1], keys[k][1], x * x * (3 - 2 * x));
      }
    }
    const l = keys[keys.length - 1][1];
    return VOWELS[l] || l;
  };
}
/** piecewise-linear curve from [[t,v],...] -> fn(t) */
export function curve(pts) {
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let k = 1; k < pts.length; k++) {
      if (t <= pts[k][0]) {
        const x = (t - pts[k - 1][0]) / Math.max(1e-9, pts[k][0] - pts[k - 1][0]);
        return pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * x;
      }
    }
    return pts[pts.length - 1][1];
  };
}

export class Biquad {
  constructor(sr) { this.sr = sr; this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(type, f, q = 0.707, gainDb = 0) {
    const sr = this.sr;
    f = Math.min(Math.max(f, 5), sr * 0.48);
    q = Math.max(q, 0.05);
    const w = TAU * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'notch': b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'peak': { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break; }
      case 'ls': case 'hs': {
        const A = Math.pow(10, gainDb / 40), s2 = 2 * Math.sqrt(A) * al;
        if (type === 'ls') {
          b0 = A * ((A + 1) - (A - 1) * cs + s2); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s2);
          a0 = (A + 1) + (A - 1) * cs + s2; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s2;
        } else {
          b0 = A * ((A + 1) + (A - 1) * cs + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s2);
          a0 = (A + 1) - (A - 1) * cs + s2; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s2;
        }
        break;
      }
      default: b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; // lp
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Klatt-style 2-pole resonator with unity DC gain (formants). */
export class Reso {
  constructor(sr) { this.sr = sr; this.A = 1; this.B = 0; this.C = 0; this.y1 = 0; this.y2 = 0; }
  set(f, bw) {
    const sr = this.sr;
    f = Math.min(f, sr * 0.46);
    const C = -Math.exp(-TAU * bw / sr), B = 2 * Math.exp(-Math.PI * bw / sr) * Math.cos(TAU * f / sr);
    this.A = 1 - B - C; this.B = B; this.C = C;
  }
  p(x) { const y = this.A * x + this.B * this.y1 + this.C * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

// Freeverb (Jezar) — used for music and for baked reflections on some SFX.
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const APS = [556, 441, 341, 225];
function verbChannel(input, sr, room, damp, spread, out, gain) {
  const scale = sr / 44100, n = input.length;
  const fb = 0.7 + room * 0.28, d1 = damp * 0.4, d2 = 1 - d1;
  const combs = COMBS.map((l) => ({ b: new Float32Array(Math.max(8, Math.round((l + spread) * scale))), i: 0, s: 0 }));
  const aps = APS.map((l) => ({ b: new Float32Array(Math.max(4, Math.round((l + spread) * scale))), i: 0 }));
  for (let k = 0; k < n; k++) {
    const x = input[k] * 0.015;
    let acc = 0;
    for (let c = 0; c < 8; c++) {
      const cb = combs[c], y = cb.b[cb.i];
      cb.s = y * d2 + cb.s * d1;
      cb.b[cb.i] = x + cb.s * fb;
      if (++cb.i >= cb.b.length) cb.i = 0;
      acc += y;
    }
    for (let a = 0; a < 4; a++) {
      const ap = aps[a], bo = ap.b[ap.i];
      ap.b[ap.i] = acc + bo * 0.5;
      if (++ap.i >= ap.b.length) ap.i = 0;
      acc = bo - acc;
    }
    out[k] += acc * gain;
  }
}

export class Synth {
  constructor(sr, seed) {
    this.sr = sr;
    this.r = mulberry32(seed || 1);
    this._g = null;
  }
  // ---------------------------------------------------------------- random
  rand(a = 0, b = 1) { return a + (b - a) * this.r(); }
  randi(a, b) { return Math.floor(this.rand(a, b + 1)); }
  randn() { // gaussian (Box-Muller)
    if (this._g !== null) { const g = this._g; this._g = null; return g; }
    const u = Math.max(1e-9, this.r()), v = this.r();
    const m = Math.sqrt(-2 * Math.log(u));
    this._g = m * Math.sin(TAU * v);
    return m * Math.cos(TAU * v);
  }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  jit(x, f = 0.1) { return x * (1 + (this.r() * 2 - 1) * f); }
  // ---------------------------------------------------------------- buffers
  len(sec) { return Math.max(1, Math.round(sec * this.sr)); }
  buf(sec) { return new Float32Array(this.len(sec)); }
  dur(x) { return x.length / this.sr; }
  _pf(p) {
    if (typeof p === 'number') return () => p;
    if (typeof p === 'function') { const sr = this.sr; return (i) => p(i / sr); }
    if (p && p.length) return (i) => p[i < p.length ? i : p.length - 1];
    return () => 0;
  }
  // ---------------------------------------------------------------- sources
  noise(sec) { const x = this.buf(sec), r = this.r; for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1; return x; }
  pink(sec) {
    const x = this.buf(sec), r = this.r;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < x.length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return x;
  }
  brown(sec) {
    const x = this.buf(sec), r = this.r;
    let y = 0;
    for (let i = 0; i < x.length; i++) { y = (y + (r() * 2 - 1) * 0.04) * 0.998; x[i] = y * 2.5; }
    return x;
  }
  /** slowly varying random signal (smoothed noise) in [-1,1]-ish, rate in Hz */
  wobble(sec, rate) {
    const x = this.buf(sec), r = this.r, n = x.length;
    const step = Math.max(1, Math.round(this.sr / Math.max(0.01, rate)));
    let a = r() * 2 - 1, b = r() * 2 - 1;
    for (let i = 0; i < n; i++) {
      const k = i % step;
      if (k === 0 && i > 0) { a = b; b = r() * 2 - 1; }
      const u = k / step, s = u * u * (3 - 2 * u);
      x[i] = a + (b - a) * s;
    }
    return x;
  }
  osc(type, sec, f, phase = 0) {
    const x = this.buf(sec), F = this._pf(f), sr = this.sr;
    let ph = phase;
    for (let i = 0; i < x.length; i++) {
      const fr = F(i), dt = fr / sr;
      let v;
      switch (type) {
        case 'saw': v = 2 * ph - 1; v -= polyblep(ph, dt); break;
        case 'square': v = ph < 0.5 ? 1 : -1; v += polyblep(ph, dt); v -= polyblep((ph + 0.5) % 1, dt); break;
        case 'tri': v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
        default: v = Math.sin(TAU * ph);
      }
      x[i] = v;
      ph += dt; ph -= Math.floor(ph);
    }
    return x;
  }
  sine(sec, f, ph) { return this.osc('sine', sec, f, ph); }
  /** frequency sweep curve helper: exponential glide f0->f1 with time constant tau */
  glide(f0, f1, tau) { return (t) => f1 + (f0 - f1) * Math.exp(-t / tau); }
  /** FM operator pair */
  fm(sec, fc, ratio, index, phase = 0) {
    const x = this.buf(sec), F = this._pf(fc), I = this._pf(index), sr = this.sr;
    let pc = phase, pm = 0;
    for (let i = 0; i < x.length; i++) {
      const f = F(i);
      x[i] = Math.sin(TAU * pc + I(i) * Math.sin(TAU * pm));
      pc += f / sr; pm += f * ratio / sr;
      if (pc > 1) pc -= 1; if (pm > 1) pm -= 1;
    }
    return x;
  }
  // ---------------------------------------------------------------- envelopes
  /** piecewise linear envelope from [[t,v],...] */
  env(sec, pts) {
    const x = this.buf(sec), c = curve(pts), sr = this.sr;
    for (let i = 0; i < x.length; i++) x[i] = c(i / sr);
    return x;
  }
  /** attack (linear) then exponential decay with time-constant tau */
  ad(sec, att, tau) {
    const x = this.buf(sec), sr = this.sr;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] = t < att ? t / att : Math.exp(-(t - att) / tau);
    }
    return x;
  }
  // ---------------------------------------------------------------- processing (in place unless noted)
  mul(x, m) {
    if (typeof m === 'number') { for (let i = 0; i < x.length; i++) x[i] *= m; return x; }
    const M = this._pf(m);
    for (let i = 0; i < x.length; i++) x[i] *= M(i);
    return x;
  }
  filter(x, type, f, q = 0.707, gain = 0) {
    const bq = new Biquad(this.sr);
    if (typeof f === 'number' && typeof q === 'number') {
      bq.set(type, f, q, gain);
      for (let i = 0; i < x.length; i++) x[i] = bq.p(x[i]);
      return x;
    }
    const F = this._pf(f), Q = this._pf(q);
    for (let i = 0; i < x.length; i++) {
      if ((i & 15) === 0) bq.set(type, F(i), Q(i), gain);
      x[i] = bq.p(x[i]);
    }
    return x;
  }
  lp(x, f, q = 0.707) { return this.filter(x, 'lp', f, q); }
  hp(x, f, q = 0.707) { return this.filter(x, 'hp', f, q); }
  bp(x, f, q = 1) { return this.filter(x, 'bp', f, q); }
  peq(x, f, q, db) { return this.filter(x, 'peak', f, q, db); }
  lp2(x, f, q = 0.707) { this.filter(x, 'lp', f, q); return this.filter(x, 'lp', f, q); }
  hp2(x, f, q = 0.707) { this.filter(x, 'hp', f, q); return this.filter(x, 'hp', f, q); }
  onepole(x, f) {
    const a = Math.exp(-TAU * f / this.sr);
    let y = 0;
    for (let i = 0; i < x.length; i++) { y = x[i] * (1 - a) + y * a; x[i] = y; }
    return x;
  }
  dcblock(x) {
    let px = 0, py = 0;
    for (let i = 0; i < x.length; i++) { const y = x[i] - px + 0.997 * py; px = x[i]; py = y; x[i] = y; }
    return x;
  }
  sat(x, drive = 2) {
    const k = 1 / Math.tanh(drive);
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) * k;
    return x;
  }
  /** asymmetric soft clip, adds even harmonics (grit) */
  grit(x, drive = 2, asym = 0.3) {
    for (let i = 0; i < x.length; i++) { const v = x[i] * drive + asym; x[i] = Math.tanh(v) - Math.tanh(asym); }
    return this.dcblock(x);
  }
  crush(x, bits = 8) {
    const q = Math.pow(2, bits - 1);
    for (let i = 0; i < x.length; i++) x[i] = Math.round(x[i] * q) / q;
    return x;
  }
  /** sample & hold decimation (lo-fi rate reduction) */
  decimate(x, factor) {
    let hold = 0, acc = 0;
    for (let i = 0; i < x.length; i++) {
      acc += 1;
      if (acc >= factor) { acc -= factor; hold = x[i]; }
      x[i] = hold;
    }
    return x;
  }
  /** add src into dst at time `at` (seconds) */
  mix(dst, src, at = 0, gain = 1) {
    const o = Math.round(at * this.sr);
    const s0 = Math.max(0, -o), e = Math.min(src.length, dst.length - o);
    for (let i = s0; i < e; i++) dst[o + i] += src[i] * gain;
    return dst;
  }
  add(dst, ...srcs) { for (const s of srcs) this.mix(dst, s, 0, 1); return dst; }
  peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
  rmsOf(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); }
  norm(x, peak = 0.9) { const p = this.peakOf(x); if (p > 1e-9) this.mul(x, peak / p); return x; }
  fade(x, inSec = 0.002, outSec = 0.01) {
    const ni = Math.min(x.length, Math.round(inSec * this.sr)), no = Math.min(x.length, Math.round(outSec * this.sr));
    for (let i = 0; i < ni; i++) x[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / ni);
    for (let i = 0; i < no; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / no);
    return x;
  }
  reverse(x) { return x.reverse(); }
  copy(x) { return new Float32Array(x); }
  /** linear-interp resample (ratio>1 = higher pitch/shorter) */
  resample(x, ratio) {
    const n = Math.max(1, Math.floor(x.length / ratio)), y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * ratio, k = Math.floor(p), f = p - k;
      y[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f;
    }
    return y;
  }
  /** feedback echo with lowpass in the loop */
  echo(x, delay, fb = 0.35, wet = 0.4, lpf = 3000) {
    const d = Math.max(1, Math.round(delay * this.sr)), line = new Float32Array(d);
    let idx = 0, s = 0;
    const a = Math.exp(-TAU * lpf / this.sr);
    for (let i = 0; i < x.length; i++) {
      const y = line[idx];
      s = y * (1 - a) + s * a;
      line[idx] = x[i] + s * fb;
      if (++idx >= d) idx = 0;
      x[i] += s * wet;
    }
    return x;
  }
  /** mono reverb (wet added in place) */
  verb(x, { room = 0.7, damp = 0.4, wet = 0.25 } = {}) {
    const inp = new Float32Array(x);
    verbChannel(inp, this.sr, room, damp, 0, x, wet * 3);
    return x;
  }
  /** stereo reverb of a send pair, added into outL/outR */
  verbStereo(inL, inR, outL, outR, { room = 0.8, damp = 0.4, wet = 0.3 } = {}) {
    verbChannel(inL, this.sr, room, damp, 0, outL, wet * 3);
    verbChannel(inR, this.sr, room, damp, 23, outR, wet * 3);
  }
  // ---------------------------------------------------------------- modal / physical
  /**
   * Bank of decaying resonators (modal synthesis). modes: [[freq, tau(sec), amp], ...]
   * exc: excitation signal (defaults to a unit impulse).
   */
  modes(sec, modes, exc = null) {
    const n = this.len(sec), out = new Float32Array(n), sr = this.sr;
    for (const [f, tau, amp] of modes) {
      if (f >= sr * 0.47) continue;
      const r = Math.exp(-1 / (tau * sr)), th = TAU * f / sr;
      const b1 = 2 * r * Math.cos(th), b2 = -r * r, g = amp * Math.sin(th);
      let y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        const xin = exc ? (i < exc.length ? exc[i] * g : 0) : (i === 0 ? g : 0);
        const y = xin + b1 * y1 + b2 * y2;
        y2 = y1; y1 = y;
        out[i] += y;
        if (!exc && i > 0 && Math.abs(y) < 1e-7 && Math.abs(y2) < 1e-7) break;
      }
    }
    return out;
  }
  /** short decaying noise burst */
  burst(sec, tau, att = 0.0005) {
    const x = this.noise(sec), sr = this.sr;
    for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] *= (t < att ? t / att : Math.exp(-(t - att) / tau)); }
    return x;
  }
  /** resonant click: noise burst into a narrow band */
  click(f = 2500, q = 4, tau = 0.006, sec = 0.06) {
    const x = this.burst(sec, tau);
    return this.bp(x, f, q);
  }
  /** decaying sine thump with pitch drop */
  thump(sec, f0, f1, tauF, tauA, att = 0.001) {
    const F = this.glide(f0, f1, tauF);
    const x = this.osc('sine', sec, F);
    const sr = this.sr;
    for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] *= (t < att ? t / att : Math.exp(-(t - att) / tauA)); }
    return x;
  }
  /** granular scatter: calls fn(t, k) count times, mixing returned arrays at time t */
  scatter(sec, count, tFn, fn) {
    const out = this.buf(sec);
    for (let k = 0; k < count; k++) { const t = tFn(k); const g = fn(t, k); if (g) this.mix(out, g, t, 1); }
    return out;
  }
  /** Karplus-Strong plucked string */
  ks(f, sec, { bright = 0.5, decay = 0.996, pick = 0.15, excite = null } = {}) {
    const sr = this.sr, n = this.len(sec), out = new Float32Array(n);
    const period = sr / f, N = Math.max(2, Math.floor(period - 0.5)), frac = period - 0.5 - N;
    const line = new Float32Array(N + 2);
    // excitation: filtered noise burst
    const ex = excite || this.noise(N / sr + 0.0001);
    if (!excite) this.onepole(ex, 400 + bright * 9000);
    for (let i = 0; i < N; i++) line[i] = ex[i % ex.length] || 0;
    // pick position comb
    const pd = Math.max(1, Math.round(N * pick));
    for (let i = N - 1; i >= pd; i--) line[i] -= line[i - pd] * 0.8;
    const c = (1 - frac) / (1 + frac); // allpass fractional delay
    let idx = 0, prev = 0, apx = 0, apy = 0;
    for (let i = 0; i < n; i++) {
      const y = line[idx];
      const lpv = (y + prev) * 0.5 * decay;
      prev = y;
      const ap = c * lpv + apx - c * apy; apx = lpv; apy = ap;
      line[idx] = ap;
      if (++idx >= N) idx = 0;
      out[i] = y;
    }
    return out;
  }
  // ---------------------------------------------------------------- voice
  /**
   * Formant voice synthesiser: glottal pulse train (Rosenberg) + aspiration -> cascade formants.
   * o: { dur, f0, amp, vowel (string|array|fn(t)), breath, jitter, shimmer, fry, rough, growl,
   *      growlRate, fscale, bw, oq, tilt }
   */
  voice(o) {
    const sr = this.sr, n = this.len(o.dur), out = new Float32Array(n), r = this.r;
    const F0 = this._pf(o.f0 ?? 120), AMP = this._pf(o.amp ?? 1), BR = this._pf(o.breath ?? 0.1);
    const FRY = this._pf(o.fry ?? 0), GROWL = this._pf(o.growl ?? 0);
    const jitter = o.jitter ?? 0.012, shimmer = o.shimmer ?? 0.08, rough = o.rough ?? 0;
    const fscale = o.fscale ?? 1, bws = o.bw ?? 1, oq = o.oq ?? 0.6;
    let vowelFn;
    if (typeof o.vowel === 'function') vowelFn = o.vowel;
    else { const v = typeof o.vowel === 'string' ? VOWELS[o.vowel] : (o.vowel || VOWELS.uh); vowelFn = () => v; }
    const res = [new Reso(sr), new Reso(sr), new Reso(sr), new Reso(sr), new Reso(sr)];
    const tilt = new Biquad(sr).set('lp', o.tilt ?? 5000, 0.6);
    const asp = new Biquad(sr).set('hp', 700, 0.7);
    const growlRate = o.growlRate ?? 38;
    let ph = 0, curF = F0(0), pAmp = 1, alt = 1, gPrev = 0, gr = 0, grT = 0, grPh = 0;
    const Tp = oq * 0.66, Tn = oq * 0.34;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        const t = i / sr, v = vowelFn(t);
        for (let k = 0; k < 4; k++) res[k].set(v[k] * fscale, FORMANT_BW[k] * bws * (1 + k * 0.1));
        res[4].set(4300 * fscale, 300 * bws);
      }
      ph += curF / sr;
      if (ph >= 1) {
        ph -= 1;
        let f = F0(i) * (1 + jitter * this.randn());
        const fr = FRY(i);
        if (fr > 0 && r() < fr) f *= 0.3 + r() * 0.35; // creaky long period
        curF = Math.max(20, f);
        pAmp = Math.max(0, 1 + shimmer * this.randn());
        alt = rough > 0 ? (alt > 0.99 ? 1 - rough : 1) : 1;
      }
      const g = ph < Tp ? 0.5 * (1 - Math.cos(Math.PI * ph / Tp)) : ph < oq ? Math.cos(0.5 * Math.PI * (ph - Tp) / Tn) : 0;
      const dg = (g - gPrev) * sr / curF; gPrev = g;
      // growl: false-vocal-fold style amplitude chaos
      const gd = GROWL(i);
      let gm = 1;
      if (gd > 0) {
        grPh += growlRate * (0.8 + 0.4 * r()) / sr;
        if (grPh >= 1) { grPh -= 1; grT = r(); }
        gr += (grT - gr) * 0.02;
        gm = 1 - gd * (0.5 + 0.5 * Math.sin(TAU * grPh)) * (0.4 + 0.6 * gr);
      }
      const b = Math.min(1, Math.max(0, BR(i)));
      const nz = asp.p(r() * 2 - 1) * (0.35 + 0.65 * g);
      let src = tilt.p(dg * 0.25 * pAmp * alt) * (1 - b) + nz * b * 0.9;
      src *= gm;
      let y = src;
      for (let k = 0; k < 5; k++) y = res[k].p(y);
      out[i] = y * AMP(i);
    }
    // normalise roughly so callers can scale predictably
    this.dcblock(out);
    const pk = this.peakOf(out);
    if (pk > 1e-9) this.mul(out, 0.8 / pk);
    return out;
  }
  // ---------------------------------------------------------------- loops
  /** x has length >= L+X; returns L samples whose end flows into its start (crossfade). */
  loopXfade(x, L, X) {
    const out = new Float32Array(L);
    out.set(x.subarray(0, L));
    X = Math.min(X, x.length - L, L);
    for (let i = 0; i < X; i++) {
      const u = i / X, a = Math.sin(0.5 * Math.PI * u), b = Math.cos(0.5 * Math.PI * u);
      out[i] = x[i] * a + x[L + i] * b;
    }
    return out;
  }
  /** wrap-add everything past L back to the start (for event based loops) */
  wrap(x, L) {
    const out = new Float32Array(L);
    for (let i = 0; i < x.length; i++) out[i % L] += x[i];
    return out;
  }
}

function polyblep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export function peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
export function rmsOf(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); }

/** soft limiter on a set of channels: keeps peaks below ceil with tanh knee */
export function softLimit(chs, ceil = 0.98, knee = 0.7) {
  const k0 = ceil * knee, span = ceil - k0;
  for (const x of chs) {
    for (let i = 0; i < x.length; i++) {
      const v = x[i], a = Math.abs(v);
      if (a > k0) x[i] = Math.sign(v) * (k0 + span * Math.tanh((a - k0) / span));
    }
  }
}
