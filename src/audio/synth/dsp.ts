// Pure DSP primitives for the procedural sound bank. No Web Audio dependency: everything
// renders into Float32Arrays so the whole bank can be generated (and unit-tested) in Node.
//
// Conventions: `sr` = sample rate (Hz), times in seconds, frequencies in Hz, `n0` = start
// sample index. Every "add*" function MIXES into `out` (never overwrites) and silently clips
// its writes to the buffer bounds, so generators can place events freely.

export const TAU = Math.PI * 2;
export const LN1000 = Math.log(1000); // 6.9078: decay rate α ↔ T60 (α = ln(1000)/T60)

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => (g > 1e-12 ? 20 * Math.log10(g) : -240);
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Decay rate (1/s) giving a 60 dB decay in t60 seconds. */
export const alphaFromT60 = (t60: number): number => LN1000 / Math.max(t60, 1e-4);

/** Allocate a buffer of `seconds` length (at least 1 sample). */
export function buf(sr: number, seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.ceil(seconds * sr)));
}

// ------------------------------------------------------------------------------ noise

/** Fast deterministic noise source (xorshift32). Cheap enough to call per sample. */
export class Noise {
  private s: number;
  // Paul Kellet "economy" pink filter state
  private p0 = 0;
  private p1 = 0;
  private p2 = 0;
  private brown = 0;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  u(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }

  /** White noise, uniform in [-1, 1). */
  white(): number {
    return this.u() * 2 - 1;
  }

  /** Pink-ish noise (−3 dB/oct), roughly unit peak. */
  pink(): number {
    const w = this.white();
    this.p0 = 0.99765 * this.p0 + w * 0.099046;
    this.p1 = 0.963 * this.p1 + w * 0.2965164;
    this.p2 = 0.57 * this.p2 + w * 1.0526913;
    return (this.p0 + this.p1 + this.p2 + w * 0.1848) * 0.25;
  }

  /** Brown-ish noise (−6 dB/oct, leaky integrator), roughly unit peak. */
  brownian(): number {
    this.brown = this.brown * 0.996 + this.white() * 0.06;
    return this.brown * 3.2;
  }

  /** Exponentially distributed interval with the given mean. */
  exp(mean: number): number {
    return -Math.log(1 - this.u() * 0.999999) * mean;
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.u();
  }

  /** Log-uniform in [lo, hi) (lo > 0). */
  logRange(lo: number, hi: number): number {
    return lo * Math.pow(hi / lo, this.u());
  }

  /** Approximately normal (mean 0, sd ~1). */
  gauss(): number {
    return (this.u() + this.u() + this.u() + this.u() - 2) * 1.732;
  }
}

// ------------------------------------------------------------------------------ filters

/** RBJ-cookbook biquad (transposed direct form II). Frequencies are clamped to a safe range. */
export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  private z1 = 0;
  private z2 = 0;

  private static w(sr: number, f: number): number {
    return (TAU * clamp(f, 5, sr * 0.49)) / sr;
  }

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    const inv = 1 / a0;
    this.b0 = b0 * inv;
    this.b1 = b1 * inv;
    this.b2 = b2 * inv;
    this.a1 = a1 * inv;
    this.a2 = a2 * inv;
    return this;
  }

  lowpass(sr: number, f: number, q = Math.SQRT1_2): this {
    const w = Biquad.w(sr, f);
    const cw = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.max(q, 0.05));
    return this.set((1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al);
  }

  highpass(sr: number, f: number, q = Math.SQRT1_2): this {
    const w = Biquad.w(sr, f);
    const cw = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.max(q, 0.05));
    return this.set((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al);
  }

  /** Band-pass with 0 dB peak gain. */
  bandpass(sr: number, f: number, q = 1): this {
    const w = Biquad.w(sr, f);
    const cw = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.max(q, 0.05));
    return this.set(al, 0, -al, 1 + al, -2 * cw, 1 - al);
  }

  peaking(sr: number, f: number, q: number, db: number): this {
    const w = Biquad.w(sr, f);
    const cw = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.max(q, 0.05));
    const A = Math.pow(10, db / 40);
    return this.set(1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A);
  }

  highshelf(sr: number, f: number, db: number): this {
    const w = Biquad.w(sr, f);
    const cw = Math.cos(w);
    const A = Math.pow(10, db / 40);
    const al = (Math.sin(w) / 2) * Math.SQRT2;
    const sq = 2 * Math.sqrt(A) * al;
    return this.set(
      A * (A + 1 + (A - 1) * cw + sq),
      -2 * A * (A - 1 + (A + 1) * cw),
      A * (A + 1 + (A - 1) * cw - sq),
      A + 1 - (A - 1) * cw + sq,
      2 * (A - 1 - (A + 1) * cw),
      A + 1 - (A - 1) * cw - sq,
    );
  }

  reset(): this {
    this.z1 = this.z2 = 0;
    return this;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  /** Filter a buffer range in place. */
  run(b: Float32Array, from = 0, to = b.length): Float32Array {
    const { b0, b1, b2, a1, a2 } = this;
    let z1 = this.z1,
      z2 = this.z2;
    const end = Math.min(to, b.length);
    for (let i = Math.max(0, from); i < end; i++) {
      const x = b[i];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      b[i] = y;
    }
    // Flush denormals / guard against blow-ups.
    this.z1 = Number.isFinite(z1) ? z1 : 0;
    this.z2 = Number.isFinite(z2) ? z2 : 0;
    return b;
  }
}

/** One-pole low-pass coefficient for cutoff fc. */
export const onePole = (sr: number, fc: number): number => Math.exp((-TAU * clamp(fc, 1, sr * 0.49)) / sr);

/** In-place one-pole high-pass (DC blocker by default). */
export function highpass1(b: Float32Array, sr: number, fc = 15): Float32Array {
  const R = clamp(1 - (TAU * fc) / sr, 0, 0.99999);
  let x1 = 0,
    y1 = 0;
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = x - x1 + R * y1;
    x1 = x;
    y1 = y;
    b[i] = y;
  }
  return b;
}

/** In-place one-pole low-pass. */
export function lowpass1(b: Float32Array, sr: number, fc: number): Float32Array {
  const a = onePole(sr, fc);
  let y = 0;
  for (let i = 0; i < b.length; i++) {
    y = b[i] + a * (y - b[i]);
    b[i] = y;
  }
  return b;
}

/** Filter chain description used by noise helpers. */
export interface FilterSpec {
  hp?: number;
  lp?: number;
  /** Band-pass centre and Q. */
  bp?: number;
  q?: number;
}

function makeChain(sr: number, f: FilterSpec): Biquad[] {
  const c: Biquad[] = [];
  if (f.hp && f.hp > 0) c.push(new Biquad().highpass(sr, f.hp));
  if (f.lp && f.lp > 0 && f.lp < sr * 0.49) c.push(new Biquad().lowpass(sr, f.lp));
  if (f.bp && f.bp > 0) c.push(new Biquad().bandpass(sr, f.bp, f.q ?? 1));
  return c;
}

// ------------------------------------------------------------------------------ modal

/**
 * Add a damped sinusoid amp·e^(−αt)·sin(2πft + φ) starting at n0 (recursive oscillator:
 * 2 multiplies per sample). Stops when the envelope falls below max(floor, |amp|·relFloor)
 * (default −60 dB relative to its own peak — inaudible in any mix, and it bounds the cost).
 */
export function addMode(out: Float32Array, n0: number, sr: number, f: number, amp: number, alpha: number, phase = 0, floor = 3e-6, relFloor = 1e-3): void {
  if (!(f > 0) || f >= sr * 0.49 || !(Math.abs(amp) > floor) || !Number.isFinite(alpha)) return;
  const a = Math.max(alpha, 0.05);
  const w = (TAU * f) / sr;
  const r = Math.exp(-a / sr);
  const c = 2 * r * Math.cos(w);
  const r2 = r * r;
  const fl = Math.max(floor, Math.abs(amp) * relFloor);
  const nLife = Math.ceil((Math.log(fl / Math.abs(amp)) / -a) * sr);
  let start = Math.round(n0);
  const end = Math.min(out.length, start + Math.max(2, nLife));
  let y2 = amp * Math.sin(phase); // y[0]
  let y1 = amp * r * Math.sin(w + phase); // y[1]
  // Skip samples before the buffer start (rare: negative n0).
  if (start < 0) {
    for (let k = start; k < 0 && k + 2 <= end; k++) {
      const y = c * y1 - r2 * y2;
      y2 = y1;
      y1 = y;
    }
    start = 0;
  }
  if (start < out.length) out[start] += y2;
  if (start + 1 < end) out[start + 1] += y1;
  for (let i = start + 2; i < end; i++) {
    const y = c * y1 - r2 * y2;
    out[i] += y;
    y2 = y1;
    y1 = y;
  }
}

export interface Mode {
  f: number;
  a: number;
  /** Decay rate (1/s). */
  alpha: number;
  phase?: number;
}

export function addModes(out: Float32Array, n0: number, sr: number, modes: readonly Mode[], gain = 1): void {
  for (const m of modes) addMode(out, n0, sr, m.f, m.a * gain, m.alpha, m.phase ?? 0);
}

/** Smooth spectral weight of a contact pulse with corner frequency fc (4th-order rolloff). */
export function contactWeight(f: number, fc: number): number {
  const x = f / Math.max(fc, 1);
  return 1 / Math.sqrt(1 + x * x * x * x);
}

/**
 * Low "thump": a sine whose pitch drops from f·(1+drop) to f over `dropTime`, with a fast
 * attack (atk) and exponential decay (time constant `decay`). Models body/cavity thuds.
 */
export function addThump(out: Float32Array, n0: number, sr: number, f: number, amp: number, decay: number, drop = 0.3, dropTime = 0.012, atk = 0.0015): void {
  const s = Math.round(n0);
  const len = Math.min(Math.ceil(decay * 7 * sr), out.length - s);
  // Incremental exponentials (one multiply each per sample instead of Math.exp).
  const kd = Math.exp(-1 / (decay * sr));
  const ka = Math.exp(-1 / (Math.max(atk, 1e-5) * sr));
  const kp = Math.exp(-1 / (Math.max(dropTime, 1e-5) * sr));
  let ed = 1,
    ea = 1,
    ep = 1,
    ph = 0;
  const w0 = (TAU * f) / sr;
  for (let i = 0; i < len; i++) {
    ph += w0 * (1 + drop * ep);
    const k = s + i;
    if (k >= 0) out[k] += amp * (1 - ea) * ed * Math.sin(ph);
    ed *= kd;
    ea *= ka;
    ep *= kp;
  }
}

// ------------------------------------------------------------------------------ noise events

export interface BurstOpts extends FilterSpec {
  /** Attack time (s), linear. */
  attack?: number;
  /** Exponential decay time constant (s). Ignored when `hold` shapes the envelope. */
  decay: number;
  /** Optional flat hold before the decay (s). */
  hold?: number;
  color?: "white" | "pink" | "brown";
  /** Granular roughness 0..1: multiplies by sparse random impulses (gritty crunch). */
  grit?: number;
}

/** Add a filtered noise burst (attack / hold / exponential decay envelope). */
export function addNoiseBurst(out: Float32Array, n0: number, sr: number, noise: Noise, amp: number, o: BurstOpts): void {
  const attack = Math.max(o.attack ?? 0.0005, 1 / sr);
  const hold = o.hold ?? 0;
  const nA = Math.max(1, Math.round(attack * sr));
  const nH = Math.round(hold * sr);
  const len = nA + nH + Math.ceil(o.decay * 7 * sr);
  const kd = Math.exp(-1 / (Math.max(o.decay, 1e-5) * sr));
  const chain = makeChain(sr, o);
  const nc = chain.length;
  const grit = clamp(o.grit ?? 0, 0, 1);
  const pSpike = 0.02 + 0.1 * (1 - grit);
  const color = o.color === "pink" ? 1 : o.color === "brown" ? 2 : 0;
  const s = Math.round(n0);
  let g = 1;
  let ed = 1;
  for (let i = 0; i < len; i++) {
    const k = s + i;
    if (k >= out.length) break;
    let env: number;
    if (i < nA) env = i / nA;
    else if (i < nA + nH) env = 1;
    else {
      env = ed;
      ed *= kd;
    }
    let x = color === 1 ? noise.pink() : color === 2 ? noise.brownian() : noise.white();
    if (grit > 0) {
      // Sparse random amplitude spikes -> gritty, crunchy texture.
      if (noise.u() < pSpike) g = 0.2 + noise.u() * 1.8;
      else g = g * 0.995 + 0.005 * (1 - grit);
      x *= g;
    }
    for (let c = 0; c < nc; c++) x = chain[c].process(x);
    if (k >= 0) out[k] += amp * env * x;
  }
}

/** Short "click": a few cycles of a strongly damped resonance plus a tiny broadband spike. */
export function addClick(out: Float32Array, n0: number, sr: number, amp: number, f: number, decay: number, noise?: Noise): void {
  addMode(out, n0, sr, f, amp, 1 / Math.max(decay, 1e-4), 0);
  if (noise) {
    const n = Math.min(Math.ceil(0.0006 * sr), 64);
    for (let i = 0; i < n; i++) {
      const k = Math.round(n0) + i;
      if (k >= 0 && k < out.length) out[k] += amp * 0.6 * noise.white() * (1 - i / n);
    }
  }
}

// ------------------------------------------------------------------------------ resonators

export interface Resonance {
  f: number;
  /** Quality factor (f / bandwidth). */
  q: number;
  g: number;
}

/** Run `input` through a parallel bank of band-pass resonators and mix into `out` at n0. */
export function resonate(out: Float32Array, n0: number, sr: number, input: Float32Array, bank: readonly Resonance[], gain = 1, tail = 0.3): void {
  const filters = bank.filter((r) => r.f > 20 && r.f < sr * 0.45).map((r) => ({ bq: new Biquad().bandpass(sr, r.f, r.q), g: r.g }));
  const len = Math.min(input.length + Math.ceil(tail * sr), out.length - Math.round(n0));
  const s = Math.round(n0);
  for (let i = 0; i < len; i++) {
    const x = i < input.length ? input[i] : 0;
    let y = 0;
    for (let k = 0; k < filters.length; k++) y += filters[k].bq.process(x) * filters[k].g;
    const j = s + i;
    if (j >= 0) out[j] += y * gain;
  }
}

/**
 * Stick-slip friction excitation: a pulse train whose instantaneous slip rate follows
 * `freq(t)` with random period jitter and amplitude `amp(t)`. Feed through `resonate` to get
 * creaks, squeals and groans (frequency-modulated friction).
 */
export function stickSlip(sr: number, noise: Noise, dur: number, freq: (t: number) => number, amp: (t: number) => number, jitter = 0.08, sharp = 0.6): Float32Array {
  const out = buf(sr, dur);
  let t = 0;
  while (t < dur) {
    const f = Math.max(freq(t), 5);
    const period = (1 / f) * (1 + jitter * noise.gauss());
    const a = amp(t);
    const i0 = Math.floor(t * sr);
    if (a > 1e-5 && i0 < out.length) {
      // Each slip: sharp release (positive spike) followed by a softer negative recovery.
      const w = Math.max(2, Math.round((sharp * 0.0008 + 0.0002) * sr));
      const s = a * (0.75 + 0.5 * noise.u());
      for (let k = 0; k < w * 3 && i0 + k < out.length; k++) {
        const x = k < w ? 1 - k / w : -0.33 * (1 - (k - w) / (2 * w));
        out[i0 + k] += s * x;
      }
    }
    t += Math.max(period, 1 / sr);
  }
  return out;
}

// ------------------------------------------------------------------------------ events in time

/**
 * Inhomogeneous Poisson process on [0, dur): calls `cb(t)` for each event. `rate(t)` in
 * events/s must not exceed `maxRate` (thinning).
 */
export function poisson(noise: Noise, dur: number, maxRate: number, rate: (t: number) => number, cb: (t: number) => void): number {
  if (!(maxRate > 0)) return 0;
  let t = 0;
  let n = 0;
  for (;;) {
    t += noise.exp(1 / maxRate);
    if (t >= dur) break;
    if (noise.u() * maxRate < rate(t)) {
      cb(t);
      n++;
    }
  }
  return n;
}

/**
 * Bounce sequence of a small piece dropped with impact speed v0 (m/s) and restitution e:
 * returns [time, relative amplitude] pairs (amplitude ∝ impact speed).
 */
export function bounces(v0: number, e: number, maxN = 8, minV = 0.12, g = 9.81): Array<[number, number]> {
  const res: Array<[number, number]> = [];
  let t = 0;
  let v = v0;
  for (let i = 0; i < maxN && v > minV; i++) {
    res.push([t, v / v0]);
    v *= e;
    t += (2 * v) / g;
  }
  return res;
}

// ------------------------------------------------------------------------------ envelopes & post

/** Multiply by a piecewise-linear envelope given as [time, gain] points (sorted by time). */
export function applyEnvelope(b: Float32Array, sr: number, pts: ReadonlyArray<readonly [number, number]>): Float32Array {
  if (pts.length === 0) return b;
  let seg = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / sr;
    while (seg < pts.length - 1 && t > pts[seg + 1][0]) seg++;
    let g: number;
    if (t <= pts[0][0]) g = pts[0][1];
    else if (seg >= pts.length - 1) g = pts[pts.length - 1][1];
    else {
      const [t0, g0] = pts[seg];
      const [t1, g1] = pts[seg + 1];
      g = t1 > t0 ? g0 + ((g1 - g0) * (t - t0)) / (t1 - t0) : g1;
    }
    b[i] *= g;
  }
  return b;
}

export function fadeIn(b: Float32Array, sr: number, sec: number): Float32Array {
  const n = Math.min(b.length, Math.ceil(sec * sr));
  for (let i = 0; i < n; i++) b[i] *= i / n;
  return b;
}

export function fadeOut(b: Float32Array, sr: number, sec: number): Float32Array {
  const n = Math.min(b.length, Math.ceil(sec * sr));
  const s = b.length - n;
  for (let i = 0; i < n; i++) b[s + i] *= 1 - (i + 1) / n;
  return b;
}

export function mixInto(dst: Float32Array, src: Float32Array, n0 = 0, gain = 1): void {
  const s = Math.round(n0);
  const end = Math.min(dst.length, s + src.length);
  for (let i = Math.max(0, s); i < end; i++) dst[i] += src[i - s] * gain;
}

export function scale(b: Float32Array, g: number): Float32Array {
  for (let i = 0; i < b.length; i++) b[i] *= g;
  return b;
}

/** tanh soft saturation (drive > 0), level-compensated. */
export function softClip(b: Float32Array, drive: number): Float32Array {
  const k = Math.max(drive, 1e-3);
  const n = 1 / Math.tanh(k);
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * k) * n;
  return b;
}

export function peakOf(b: Float32Array): number {
  let p = 0;
  for (let i = 0; i < b.length; i++) {
    const a = Math.abs(b[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Max RMS over sliding windows of `win` seconds (hop = win/2): a cheap loudness proxy. */
export function maxWindowRms(b: Float32Array, sr: number, win = 0.05): number {
  const n = Math.max(16, Math.round(win * sr));
  const hop = Math.max(8, n >> 1);
  if (b.length <= n) {
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / Math.max(1, n));
  }
  let best = 0;
  for (let st = 0; st + n <= b.length; st += hop) {
    let s = 0;
    for (let i = st; i < st + n; i++) s += b[i] * b[i];
    if (s > best) best = s;
  }
  return Math.sqrt(best / n);
}

export function rmsOf(b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, b.length));
}

/**
 * Trim the silent tail: keep up to the last sample above `thresholdDb` (relative to peak),
 * then apply a short fade. Returns a new, tight Float32Array.
 */
export function trimTail(b: Float32Array, sr: number, thresholdDb = -66, fadeSec = 0.008, minSec = 0.01): Float32Array {
  const p = peakOf(b);
  if (p <= 0) return b.slice(0, Math.max(1, Math.ceil(minSec * sr)));
  const th = p * dbToGain(thresholdDb);
  let last = b.length - 1;
  while (last > 0 && Math.abs(b[last]) < th) last--;
  const len = Math.min(b.length, Math.max(Math.ceil(minSec * sr), last + 1 + Math.ceil(fadeSec * sr)));
  const o = b.slice(0, len);
  fadeOut(o, sr, Math.min(fadeSec, len / sr / 2));
  return o;
}

/** Replace NaN/Infinity by 0 (defensive; generators should never produce them). */
export function sanitize(b: Float32Array): number {
  let bad = 0;
  for (let i = 0; i < b.length; i++) {
    if (!Number.isFinite(b[i])) {
      b[i] = 0;
      bad++;
    }
  }
  return bad;
}

/**
 * Turn a buffer of length L+X into a seamless loop of length L: the last X samples are
 * equal-power crossfaded into the first X.
 */
export function makeLoop(b: Float32Array, xfade: number): Float32Array {
  const X = Math.max(1, Math.min(Math.floor(xfade), Math.floor(b.length / 3)));
  const L = b.length - X;
  const o = b.slice(0, L);
  for (let i = 0; i < X; i++) {
    const t = (i + 0.5) / X;
    const gi = Math.sin((t * Math.PI) / 2);
    const go = Math.cos((t * Math.PI) / 2);
    o[i] = b[i] * gi + b[L + i] * go;
  }
  return o;
}

/**
 * Normalise a one-shot (or loop) so that its loudness proxy hits `targetDb` (dBFS of the
 * max 50 ms RMS for one-shots, whole-file RMS for loops) without exceeding `peakDb`.
 * Returns the applied gain.
 */
export function normalize(chans: Float32Array[], sr: number, targetDb: number, peakDb: number, loop = false): number {
  let peak = 0;
  let loud = 0;
  for (const c of chans) {
    peak = Math.max(peak, peakOf(c));
    // Loudness is measured on a perceptually weighted copy (2nd-order high-pass at 200 Hz,
    // roughly A-weighting below 1 kHz) so bass-heavy thuds are not under-normalised.
    const w = new Biquad().highpass(sr, 200, 0.6).run(c.slice());
    loud = Math.max(loud, loop ? rmsOf(w) : maxWindowRms(w, sr, 0.05));
  }
  if (!(peak > 0) || !(loud > 0)) return 1;
  const g = Math.min(dbToGain(targetDb) / loud, dbToGain(peakDb) / peak);
  for (const c of chans) scale(c, g);
  return g;
}
