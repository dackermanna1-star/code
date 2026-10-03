// Pure DSP toolkit for Munch Lab's procedural audio.
//
// Nothing in here touches Web Audio: every generator writes into plain Float32Arrays so that
// sounds can be pre-rendered once into AudioBuffers at runtime and unit-tested in node.

export const TAU = Math.PI * 2;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
export function gainToDb(g: number): number {
  return 20 * Math.log10(Math.max(Math.abs(g), 1e-12));
}
export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
/** Frequency ratio of a pitch offset in semitones. */
export function semis(st: number): number {
  return Math.pow(2, st / 12);
}
export function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}
/** Raised-cosine bump over 0..1 (0 at both ends, 1 in the middle). */
export function bump(x: number): number {
  return x <= 0 || x >= 1 ? 0 : 0.5 - 0.5 * Math.cos(TAU * x);
}
/** Attack/decay shape over 0..1: raised-cosine rise until `peakAt`, then a power-curve fall to 0. */
export function swell(x: number, peakAt = 0.3, fallPow = 2): number {
  if (x <= 0 || x >= 1) return 0;
  if (x < peakAt) return 0.5 - 0.5 * Math.cos((Math.PI * x) / peakAt);
  return Math.pow(1 - (x - peakAt) / (1 - peakAt), fallPow);
}

// ---------------------------------------------------------------------------------------------
// Random

/** Small seeded PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = (Math.floor(seed) ^ 0x2545f491) >>> 0;
  }
  /** 0..1 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Integer in [a, b] (inclusive). */
  int(a: number, b: number): number {
    return Math.min(b, Math.floor(a + (b - a + 1) * this.next()));
  }
  /** -1..1 */
  bi(): number {
    return this.next() * 2 - 1;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))];
  }
  /** v * (1 ± frac) */
  jit(v: number, frac: number): number {
    return v * (1 + this.bi() * frac);
  }
  /** Approximately normal, mean 0, sd 1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
  }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/** Per-sample noise sources (white / pink / brown) sharing one Rng. */
export class Noise {
  private p0 = 0;
  private p1 = 0;
  private p2 = 0;
  private p3 = 0;
  private p4 = 0;
  private p5 = 0;
  private p6 = 0;
  private br = 0;
  constructor(readonly rng: Rng) {}
  white(): number {
    return this.rng.next() * 2 - 1;
  }
  /** Paul Kellet's refined pink filter. */
  pink(): number {
    const w = this.rng.next() * 2 - 1;
    this.p0 = 0.99886 * this.p0 + w * 0.0555179;
    this.p1 = 0.99332 * this.p1 + w * 0.0750759;
    this.p2 = 0.969 * this.p2 + w * 0.153852;
    this.p3 = 0.8665 * this.p3 + w * 0.3104856;
    this.p4 = 0.55 * this.p4 + w * 0.5329522;
    this.p5 = -0.7616 * this.p5 - w * 0.016898;
    const out = this.p0 + this.p1 + this.p2 + this.p3 + this.p4 + this.p5 + this.p6 + w * 0.5362;
    this.p6 = w * 0.115926;
    return out * 0.11;
  }
  /** Leaky-integrated white noise (red/brown). */
  brown(): number {
    this.br = (this.br + 0.02 * (this.rng.next() * 2 - 1)) / 1.02;
    return this.br * 3.5;
  }
}

export function fillWhite(out: Float32Array, rng: Rng): Float32Array {
  for (let i = 0; i < out.length; i++) out[i] = rng.next() * 2 - 1;
  return out;
}
export function fillPink(out: Float32Array, rng: Rng): Float32Array {
  const n = new Noise(rng);
  for (let i = 0; i < out.length; i++) out[i] = n.pink();
  return out;
}
export function fillBrown(out: Float32Array, rng: Rng): Float32Array {
  const n = new Noise(rng);
  for (let i = 0; i < out.length; i++) out[i] = n.brown();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Filters

/** RBJ-cookbook biquad (transposed direct form II). */
export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  z1 = 0;
  z2 = 0;
  private setN(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }
  private w(f: number, sr: number): number {
    return (TAU * clamp(f, 5, sr * 0.49)) / sr;
  }
  lowpass(f: number, q: number, sr: number): this {
    const w = this.w(f, sr), cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.setN((1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al);
  }
  highpass(f: number, q: number, sr: number): this {
    const w = this.w(f, sr), cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.setN((1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al);
  }
  /** Band-pass with 0 dB peak gain. */
  bandpass(f: number, q: number, sr: number): this {
    const w = this.w(f, sr), cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.setN(al, 0, -al, 1 + al, -2 * cs, 1 - al);
  }
  notch(f: number, q: number, sr: number): this {
    const w = this.w(f, sr), cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.setN(1, -2 * cs, 1, 1 + al, -2 * cs, 1 - al);
  }
  peaking(f: number, q: number, db: number, sr: number): this {
    const w = this.w(f, sr), cs = Math.cos(w), al = Math.sin(w) / (2 * q), A = Math.pow(10, db / 40);
    return this.setN(1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A);
  }
  lowshelf(f: number, db: number, sr: number, q = 0.7071): this {
    const w = this.w(f, sr), cs = Math.cos(w), A = Math.pow(10, db / 40), al = Math.sin(w) / (2 * q), sA = 2 * Math.sqrt(A) * al;
    return this.setN(
      A * (A + 1 - (A - 1) * cs + sA),
      2 * A * (A - 1 - (A + 1) * cs),
      A * (A + 1 - (A - 1) * cs - sA),
      A + 1 + (A - 1) * cs + sA,
      -2 * (A - 1 + (A + 1) * cs),
      A + 1 + (A - 1) * cs - sA,
    );
  }
  highshelf(f: number, db: number, sr: number, q = 0.7071): this {
    const w = this.w(f, sr), cs = Math.cos(w), A = Math.pow(10, db / 40), al = Math.sin(w) / (2 * q), sA = 2 * Math.sqrt(A) * al;
    return this.setN(
      A * (A + 1 + (A - 1) * cs + sA),
      -2 * A * (A - 1 + (A + 1) * cs),
      A * (A + 1 + (A - 1) * cs - sA),
      A + 1 - (A - 1) * cs + sA,
      2 * (A - 1 - (A + 1) * cs),
      A + 1 - (A - 1) * cs - sA,
    );
  }
  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  apply(buf: Float32Array, from = 0, to = buf.length): Float32Array {
    for (let i = from; i < to; i++) buf[i] = this.run(buf[i]);
    return buf;
  }
  reset(): this {
    this.z1 = this.z2 = 0;
    return this;
  }
}

/** Topology-preserving state-variable filter (stable under fast cutoff modulation). */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;
  k = 1;
  lp = 0;
  bp = 0;
  hp = 0;
  set(f: number, q: number, sr: number): this {
    const g = Math.tan((Math.PI * clamp(f, 5, sr * 0.49)) / sr);
    this.k = 1 / Math.max(q, 0.05);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  /** Runs one sample; returns the low-pass output (lp/bp/hp are all updated). */
  run(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
    return v2;
  }
  /** Band-pass output normalised to unity gain at the centre frequency. */
  get bpn(): number {
    return this.bp * this.k;
  }
}

/** One-pole low/high-pass. */
export class OnePole {
  private a = 0;
  z = 0;
  set(f: number, sr: number): this {
    this.a = Math.exp((-TAU * clamp(f, 1, sr * 0.49)) / sr);
    return this;
  }
  lp(x: number): number {
    this.z = x + this.a * (this.z - x);
    return this.z;
  }
  hp(x: number): number {
    return x - this.lp(x);
  }
}

export function dcBlock(buf: Float32Array, sr: number, fc = 15): Float32Array {
  const R = Math.exp((-TAU * fc) / sr);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = x - x1 + R * y1;
    x1 = x;
    y1 = y;
    buf[i] = y;
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------
// Oscillators & generators

/** PolyBLEP residual for band-limited saw/pulse waves. */
export function polyBlep(t: number, dt: number): number {
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

/**
 * Adds an exponentially decaying sinusoid (one resonant "mode" of a struck object) using a
 * rotating phasor — cheap and exact. `tau` is the amplitude time constant (s).
 */
export function addMode(
  out: Float32Array,
  start: number,
  sr: number,
  freq: number,
  amp: number,
  tau: number,
  attack = 0.0006,
): void {
  if (freq <= 0 || freq >= sr * 0.47 || amp === 0 || start >= out.length) return;
  const s0 = Math.max(0, Math.floor(start));
  const w = (TAU * freq) / sr;
  const r = Math.exp(-1 / (Math.max(tau, 1e-4) * sr));
  const cw = Math.cos(w) * r;
  const sw = Math.sin(w) * r;
  let c = 1;
  let s = 0;
  const n = Math.min(out.length - s0, Math.ceil(tau * sr * 7.5));
  const att = Math.max(1, attack * sr);
  for (let i = 0; i < n; i++) {
    const e = i < att ? 0.5 - 0.5 * Math.cos((Math.PI * i) / att) : 1;
    out[s0 + i] += amp * s * e;
    const nc = c * cw - s * sw;
    s = c * sw + s * cw;
    c = nc;
  }
}

export interface PluckOpts {
  f: number;
  amp?: number;
  /** seconds until the fundamental has decayed by 60 dB */
  t60?: number;
  /** 0..1 excitation brightness */
  bright?: number;
  /** pick position along the string 0..0.5 (adds a comb notch) */
  pick?: number;
  /** render length in seconds (default t60) */
  dur?: number;
}

/** Karplus-Strong plucked string with allpass fine-tuning and decay control. */
export function addPluck(out: Float32Array, start: number, sr: number, rng: Rng, o: PluckOpts): void {
  const s0 = Math.max(0, Math.floor(start));
  if (s0 >= out.length) return;
  const f = clamp(o.f, 20, sr / 4);
  const N = sr / f;
  const L = Math.max(2, Math.floor(N - 0.5 - 0.3));
  const frac = N - 0.5 - L; // allpass delay in [0.3, 1.3)
  const C = (1 - frac) / (1 + frac);
  const Hf = Math.cos((Math.PI * f) / sr); // gain of the 2-point average at f
  const t60 = o.t60 ?? 1.5;
  const rho = Math.min(0.99995, Math.pow(0.001, 1 / (t60 * f)) / Hf);
  const bright = clamp(o.bright ?? 0.5, 0, 1);
  const lp = new OnePole().set(300 + bright * bright * 9000, sr);
  const noise = new Noise(rng);
  const exc = new Float32Array(L);
  for (let k = 0; k < 3; k++) for (let i = 0; i < L; i++) exc[i] = lp.lp(noise.white()); // settle the filter
  let mean = 0;
  for (let i = 0; i < L; i++) mean += exc[i];
  mean /= L;
  const dl = new Float32Array(L);
  const pd = Math.max(1, Math.round(clamp(o.pick ?? 0.18, 0.02, 0.5) * L));
  let pk = 0;
  for (let i = 0; i < L; i++) {
    dl[i] = exc[i] - mean - 0.85 * (exc[(i - pd + L) % L] - mean);
    pk = Math.max(pk, Math.abs(dl[i]));
  }
  const g = (o.amp ?? 1) / (pk || 1);
  const n = Math.min(out.length - s0, Math.round((o.dur ?? t60) * sr));
  let ptr = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const x = dl[ptr];
    const avg = rho * 0.5 * (x + prev);
    prev = x;
    const ap = C * avg + apX - C * apY;
    apX = avg;
    apY = ap;
    dl[ptr] = ap;
    if (++ptr >= L) ptr = 0;
    out[s0 + i] += x * g;
  }
}

export interface FmOpts {
  f: number;
  ratio?: number;
  index?: number;
  /** modulation-index decay time constant */
  indexTau?: number;
  /** amplitude decay time constant */
  tau?: number;
  amp?: number;
  attack?: number;
  dur?: number;
}

/** Two-operator FM plink / bell. */
export function addFm(out: Float32Array, start: number, sr: number, o: FmOpts): void {
  const s0 = Math.max(0, Math.floor(start));
  if (s0 >= out.length) return;
  const ratio = o.ratio ?? 2;
  const I0 = o.index ?? 1.5;
  const itau = o.indexTau ?? 0.08;
  const tau = o.tau ?? 0.3;
  const amp = o.amp ?? 1;
  const n = Math.min(out.length - s0, Math.round((o.dur ?? tau * 7) * sr));
  const wc = (TAU * o.f) / sr;
  const wm = wc * ratio;
  const att = Math.max(1, (o.attack ?? 0.001) * sr);
  const ka = Math.exp(-1 / (tau * sr));
  const ki = Math.exp(-1 / (itau * sr));
  let ea = 1;
  let ei = I0;
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < n; i++) {
    const a = i < att ? 0.5 - 0.5 * Math.cos((Math.PI * i) / att) : 1;
    out[s0 + i] += amp * a * ea * Math.sin(pc + ei * Math.sin(pm));
    ea *= ka;
    ei *= ki;
    pc += wc;
    pm += wm;
    if (pc > 1e4) {
      pc %= TAU;
      pm %= TAU;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Smooth random curves

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

/** Smooth random curve in about -1..1 that is exactly periodic over n samples. */
export function periodicWobble(n: number, points: number, rng: Rng): Float32Array {
  const P = Math.max(3, Math.round(points));
  const pts = Array.from({ length: P }, () => rng.bi());
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * P;
    const k = Math.floor(x);
    out[i] = catmull(pts[(k - 1 + P) % P], pts[k % P], pts[(k + 1) % P], pts[(k + 2) % P], x - k);
  }
  return out;
}

/** Smooth random curve in about -1..1 over n samples (not periodic). */
export function smoothRandom(n: number, points: number, rng: Rng): Float32Array {
  const P = Math.max(2, Math.round(points));
  const pts = Array.from({ length: P + 3 }, () => rng.bi());
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / Math.max(1, n)) * P;
    const k = Math.floor(x);
    out[i] = catmull(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], x - k);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Buffer utilities

export function fadeIn(buf: Float32Array, n: number): Float32Array {
  const m = Math.min(Math.floor(n), buf.length);
  for (let i = 0; i < m; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / m);
  return buf;
}
export function fadeOut(buf: Float32Array, n: number): Float32Array {
  const L = buf.length;
  const m = Math.min(Math.floor(n), L);
  for (let i = 0; i < m; i++) buf[L - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / m);
  return buf;
}
export function scale(buf: Float32Array, g: number): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}
/** dst[at + i (mod len)] += src[i] * gain — for seamless event placement in loops. */
export function addWrapped(dst: Float32Array, src: Float32Array, at: number, gain = 1): void {
  const L = dst.length;
  let j = ((Math.floor(at) % L) + L) % L;
  for (let i = 0; i < src.length; i++) {
    dst[j] += src[i] * gain;
    if (++j >= L) j = 0;
  }
}
export function addInto(dst: Float32Array, src: Float32Array, at: number, gain = 1): void {
  const s0 = Math.floor(at);
  const n = Math.min(src.length, dst.length - s0);
  for (let i = Math.max(0, -s0); i < n; i++) dst[s0 + i] += src[i] * gain;
}

/**
 * Turns a buffer of length L + X into a seamless loop of length L by equal-power cross-fading
 * the overhanging tail (X samples) into the head. Use for uncorrelated (noisy) material.
 */
export function makeSeamless(src: Float32Array, L: number): Float32Array {
  const X = Math.min(src.length - L, L);
  const out = src.slice(0, L);
  for (let i = 0; i < X; i++) {
    const t = ((i + 0.5) / X) * (Math.PI / 2);
    out[i] = src[i] * Math.sin(t) + src[L + i] * Math.cos(t);
  }
  return out;
}

/** Drops the silent tail (below `relDb` under the peak), keeping a short faded pad. */
export function trimTail(buf: Float32Array, sr: number, relDb = -62, padSec = 0.004): Float32Array {
  const thr = peak(buf) * dbToGain(relDb);
  let last = buf.length - 1;
  while (last > 0 && Math.abs(buf[last]) <= thr) last--;
  const len = Math.min(buf.length, last + 1 + Math.round(padSec * sr));
  const out = len < buf.length ? buf.slice(0, len) : buf;
  return fadeOut(out, Math.min(len, Math.round(padSec * sr) + 8));
}

// ---------------------------------------------------------------------------------------------
// Analysis

export function peak(buf: Float32Array): number {
  let m = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > m) m = a;
  }
  return m;
}
export function rms(buf: Float32Array, from = 0, to = buf.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, to - from));
}
export function allFinite(buf: Float32Array): boolean {
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) return false;
  return true;
}
/** ITU-R BS.1770 style K-weighting (pre-filter shelf + RLB high-pass). */
export function kWeight(buf: Float32Array, sr: number): Float32Array {
  const out = Float32Array.from(buf);
  new Biquad().highshelf(1681.97, 4.0, sr, 0.7072).apply(out);
  new Biquad().highpass(38.14, 0.5003, sr).apply(out);
  return out;
}
/** Max short-term (window `win` s) K-weighted loudness in dB (≈ LUFS momentary max for short sounds). */
export function momentaryMaxDb(buf: Float32Array, sr: number, win = 0.1): number {
  const k = kWeight(buf, sr);
  const W = Math.max(1, Math.round(win * sr));
  const cum = new Float64Array(k.length + 1);
  for (let i = 0; i < k.length; i++) cum[i + 1] = cum[i] + k[i] * k[i];
  const hop = Math.max(1, W >> 3);
  let best = 0;
  for (let s = 0; s < k.length; s += hop) {
    const e = Math.min(k.length, s + W);
    const ms = (cum[e] - cum[s]) / W;
    if (ms > best) best = ms;
  }
  return 10 * Math.log10(best + 1e-20) - 0.691;
}
/** Mean K-weighted loudness over the whole buffer in dB (for loops / continuous material). */
export function integratedDb(buf: Float32Array, sr: number): number {
  const k = kWeight(buf, sr);
  let s = 0;
  for (let i = 0; i < k.length; i++) s += k[i] * k[i];
  return 10 * Math.log10(s / Math.max(1, k.length) + 1e-20) - 0.691;
}
/**
 * Scales `buf` in place so its loudness hits `targetDb`, then pulls it down further if the peak
 * would exceed `peakCap`. Returns the applied gain.
 */
export function normalizeLoudness(
  buf: Float32Array,
  sr: number,
  targetDb: number,
  peakCap: number,
  mode: 'momentary' | 'integrated' = 'momentary',
): number {
  const cur = mode === 'momentary' ? momentaryMaxDb(buf, sr) : integratedDb(buf, sr);
  if (!Number.isFinite(cur) || cur < -150) return 1;
  let g = dbToGain(targetDb - cur);
  const p = peak(buf) * g;
  if (p > peakCap) g *= peakCap / p;
  scale(buf, g);
  return g;
}

/** Soft-knee saturation: linear below `knee`, smoothly approaching `ceil`. */
export function softClip(x: number, knee = 0.6, ceil = 0.95): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const r = ceil - knee;
  const y = knee + r * Math.tanh((a - knee) / r);
  return x < 0 ? -y : y;
}

/** Stereo reverb impulse response: decaying, progressively darker noise + a few early reflections. */
export function makeReverbIR(sr: number, dur: number, seed: number): [Float32Array, Float32Array] {
  const n = Math.max(16, Math.round(dur * sr));
  const rng = new Rng(seed);
  const chans: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const b = new Float32Array(n);
    const nz = new Noise(rng);
    const lp = new OnePole();
    const pre = Math.round(0.011 * sr) + ch * Math.round(0.0017 * sr);
    const t60 = dur * 0.8;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      if (((i - pre) & 31) === 0) lp.set(900 + 6500 * Math.exp(-t * 3), sr);
      const env = Math.exp((-6.9 * t) / t60) * (1 - Math.exp(-t / 0.006));
      b[i] = lp.lp(nz.white()) * env;
    }
    const ref = peak(b);
    for (let k = 0; k < 7; k++) {
      const at = pre + Math.round(rng.range(0.002, 0.04) * sr);
      if (at < n) b[at] += rng.bi() * ref * (0.9 - k * 0.1);
    }
    fadeOut(b, Math.round(0.04 * sr));
    let e = 0;
    for (let i = 0; i < n; i++) e += b[i] * b[i];
    scale(b, 1 / Math.sqrt(e || 1));
    chans.push(b);
  }
  return [chans[0], chans[1]];
}
