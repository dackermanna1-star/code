/**
 * Low level DSP helpers shared by the procedural audio modules.
 *
 * Everything takes a BaseAudioContext so the same code renders into a realtime
 * AudioContext or an OfflineAudioContext (tests / measurements).
 */

export type Rng = () => number;

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randi = (a: number, b: number): number => Math.floor(a + Math.random() * (b - a + 1));
export const chance = (p: number): boolean => Math.random() < p;
export function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
/** log-uniform random value (good for frequencies) */
export const expRand = (a: number, b: number): number => Math.exp(rand(Math.log(a), Math.log(b)));
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Small deterministic PRNG (music uses seeded randomness so songs are stable). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- shared resources

export type Curve = Float32Array<ArrayBuffer>;

/** Per-context shared buffers / curves / waves (generated once, reused by every sound). */
export interface Kit {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** vinyl surface noise: sparse clicks + faint hiss */
  crackle: AudioBuffer;
  curves: {
    /** tanh(2.5x): thickens sine thumps */
    sat: Curve;
    /** gentle tape style soft clip */
    soft: Curve;
    /** asymmetric tube-ish (clean/edge of breakup amps) */
    warm: Curve;
    /** crunchy amp */
    crunch: Curve;
    /** high gain (combat layer) */
    heavy: Curve;
  };
  waves: {
    /** glottal-ish source spectrum (1/n^1.25) for voices */
    glottal: PeriodicWave;
    /** drawbar organ, fundamental is the 16' (play at f/2) */
    organ: PeriodicWave;
    piano: PeriodicWave;
  };
}

const kits = new WeakMap<BaseAudioContext, Kit>();

export function getKit(ac: BaseAudioContext): Kit {
  let k = kits.get(ac);
  if (!k) {
    k = buildKit(ac);
    kits.set(ac, k);
  }
  return k;
}

function buildKit(ac: BaseAudioContext): Kit {
  return {
    white: makeNoise(ac, 'white', 2.5, 11),
    pink: makeNoise(ac, 'pink', 2.5, 23),
    brown: makeNoise(ac, 'brown', 3, 37),
    crackle: makeCrackle(ac, 4.3, 41),
    curves: {
      sat: makeCurve((x) => Math.tanh(2.5 * x) / Math.tanh(2.5)),
      soft: makeCurve((x) => (Math.abs(x) < 1 ? 1.5 * x - 0.5 * x * x * x : Math.sign(x))),
      warm: makeCurve((x) => (x >= 0 ? Math.tanh(1.8 * x) / Math.tanh(1.8) : (Math.tanh(1.3 * x) / Math.tanh(1.3)) * 0.94)),
      crunch: makeCurve((x) => {
        const y = x >= 0 ? Math.tanh(4 * x) : Math.tanh(3.2 * x) * 0.96;
        return y / Math.tanh(4);
      }),
      heavy: makeCurve((x) => {
        const k = 9;
        const y = x >= 0 ? 1 - Math.exp(-k * x) : -(1 - Math.exp(k * 0.85 * x)) * 0.97;
        return y;
      }),
    },
    waves: {
      glottal: makeWave(ac, Array.from({ length: 56 }, (_, i) => 1 / Math.pow(i + 1, 1.25))),
      // harmonics of the 16' fundamental: 16' 8' 5 1/3' 4' . 2 2/3' . 2'
      organ: makeWave(ac, [0.7, 1.0, 0.55, 0.5, 0, 0.22, 0, 0.16]),
      piano: makeWave(ac, [1, 0.52, 0.36, 0.25, 0.17, 0.11, 0.035, 0.06, 0.04, 0.025, 0.02, 0.012, 0.008]),
    },
  };
}

function makeWave(ac: BaseAudioContext, amps: number[]): PeriodicWave {
  const n = amps.length + 1;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 1; i < n; i++) imag[i] = amps[i - 1];
  return ac.createPeriodicWave(real, imag, { disableNormalization: false });
}

export function makeCurve(f: (x: number) => number, n = 2048): Curve {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = f((i / (n - 1)) * 2 - 1);
  return c;
}

function removeDcAndNormalize(d: Float32Array, peak: number): void {
  let mean = 0;
  for (let i = 0; i < d.length; i++) mean += d[i];
  mean /= d.length;
  let mx = 1e-9;
  for (let i = 0; i < d.length; i++) {
    d[i] -= mean;
    mx = Math.max(mx, Math.abs(d[i]));
  }
  const k = peak / mx;
  for (let i = 0; i < d.length; i++) d[i] *= k;
}

/** crossfade the tail into the head so looping never clicks */
function makeLoopable(d: Float32Array, n: number): void {
  const L = d.length;
  for (let i = 0; i < n; i++) {
    const a = i / n;
    d[L - n + i] = d[L - n + i] * (1 - a) + d[i] * a;
  }
}

function makeNoise(ac: BaseAudioContext, kind: 'white' | 'pink' | 'brown', seconds: number, seed: number): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const r = mulberry32(seed);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
    removeDcAndNormalize(d, 0.95);
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    }
    removeDcAndNormalize(d, 0.95);
  }
  makeLoopable(d, Math.floor(sr * 0.01));
  return buf;
}

function makeCrackle(ac: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const r = mulberry32(seed);
  // faint surface hiss (slightly low passed)
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += 0.35 * (r() * 2 - 1 - lp);
    d[i] = lp * 0.05;
  }
  // clicks: poisson process, mostly tiny, a few pops
  let pos = 0;
  while (true) {
    pos += Math.floor((-Math.log(1 - r()) * sr) / 38);
    if (pos >= len - 40) break;
    const big = r() < 0.03;
    const a = big ? 0.5 + r() * 0.4 : 0.04 + Math.pow(r(), 3) * 0.35;
    const sgn = r() < 0.5 ? -1 : 1;
    const ringLen = big ? 24 : 4 + Math.floor(r() * 8);
    for (let k = 0; k < ringLen; k++) d[pos + k] += sgn * a * Math.exp(-k / (big ? 6 : 2.2)) * (k % 2 ? -0.55 : 1);
  }
  removeDcAndNormalize(d, 0.9);
  makeLoopable(d, Math.floor(sr * 0.01));
  return buf;
}

/**
 * Synthetic room impulse response: a few early reflections followed by an
 * exponentially decaying diffuse tail whose high frequencies die faster than
 * the lows (wooden room). Normalized to unit energy per channel.
 */
export function makeRoomIR(
  ac: BaseAudioContext,
  o: { seconds: number; rt60: number; preDelay: number; hfStart: number; hfEnd: number; early: number; seed?: number },
): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.floor(o.seconds * sr);
  const buf = ac.createBuffer(2, len, sr);
  const r = mulberry32(o.seed ?? 7);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const pre = Math.floor(o.preDelay * sr);
    let y1 = 0;
    let y2 = 0;
    for (let i = pre; i < len; i++) {
      const tt = (i - pre) / sr;
      const env = Math.exp((-6.9078 * tt) / o.rt60) * Math.min(1, tt / 0.018);
      const fc = o.hfStart * Math.pow(o.hfEnd / o.hfStart, Math.min(1, tt / o.rt60));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      const w = r() * 2 - 1;
      y1 += a * (w - y1);
      y2 += a * (y1 - y2);
      // no energy compensation on purpose: lows decay with rt60, highs die faster
      d[i] = y2 * env;
    }
    // early reflections (decorrelated per channel)
    const taps = 12;
    for (let k = 0; k < taps; k++) {
      const tt = 0.003 + Math.pow(r(), 0.8) * 0.05;
      const idx = Math.floor(tt * sr);
      if (idx + 3 >= len) continue;
      const amp = o.early * (0.35 + 0.65 * r()) * (1 - tt / 0.06) * (r() < 0.5 ? -1 : 1);
      // tiny smear so taps are not perfect impulses
      d[idx] += amp * 0.6;
      d[idx + 1] += amp;
      d[idx + 2] += amp * 0.45;
    }
    // unit energy
    let e = 0;
    for (let i = 0; i < len; i++) e += d[i] * d[i];
    const k = 1 / Math.sqrt(Math.max(e, 1e-9));
    for (let i = 0; i < len; i++) d[i] *= k;
  }
  return buf;
}

// ---------------------------------------------------------------- node helpers

export function mkOsc(ac: BaseAudioContext, type: OscillatorType | PeriodicWave, freq: number, t: number, stop: number, detune = 0): OscillatorNode {
  const o = ac.createOscillator();
  if (typeof type === 'string') o.type = type as OscillatorType;
  else o.setPeriodicWave(type as PeriodicWave);
  o.frequency.value = freq;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.value = detune;
  o.start(t);
  o.stop(stop);
  return o;
}

/** Looping noise source starting at a random offset (so every instance differs). */
export function mkNoise(ac: BaseAudioContext, buf: AudioBuffer, t: number, stop: number, rate = 1): AudioBufferSourceNode {
  const s = ac.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  if (rate !== 1) s.playbackRate.value = rate;
  s.start(t, Math.random() * (buf.duration - 0.05));
  s.stop(stop);
  return s;
}

export function mkFilter(ac: BaseAudioContext, type: BiquadFilterType, freq: number, Q = 0.707, gainDb = 0): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.min(freq, ac.sampleRate * 0.49);
  f.Q.value = Q;
  if (gainDb) f.gain.value = gainDb;
  return f;
}

export function mkGain(ac: BaseAudioContext, v = 0): GainNode {
  const g = ac.createGain();
  g.gain.value = v;
  return g;
}

export function mkShaper(ac: BaseAudioContext, curve: Curve, oversample: OverSampleType = 'none'): WaveShaperNode {
  const w = ac.createWaveShaper();
  w.curve = curve;
  w.oversample = oversample;
  return w;
}

/** Connect nodes in series, returns the last one. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

// ---------------------------------------------------------------- envelopes

/** 0 -> peak (linear, `att`) then exponential decay with time constant `tau`. Returns the ~-52dB time. */
export function envPerc(p: AudioParam, t: number, peak: number, att: number, tau: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + att);
  p.setTargetAtTime(0, t + att, tau);
  return t + att + tau * 6;
}

/** attack / hold / exponential release */
export function envAHR(p: AudioParam, t: number, peak: number, att: number, hold: number, tau: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + att);
  if (hold > 0) p.setValueAtTime(peak, t + att + hold);
  p.setTargetAtTime(0, t + att + hold, tau);
  return t + att + hold + tau * 6;
}

/** Rough RMS compensation for filtered white noise so `amp` means roughly "peak level". */
export function noiseComp(type: BiquadFilterType, f: number, q: number, sr: number): number {
  const nyq = sr / 2;
  let bw: number;
  if (type === 'bandpass') bw = (f / Math.max(q, 0.1)) * 1.57;
  else if (type === 'lowpass') bw = f * 1.15;
  else if (type === 'highpass') bw = Math.max(nyq - f, 1500);
  else bw = nyq;
  return Math.min(9, Math.sqrt(nyq / Math.min(Math.max(bw, 20), nyq)));
}
