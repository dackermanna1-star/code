// Low-level procedural synthesis toolkit shared by SFX recipes, loops and ambience beds.
// Everything here is built from stock Web Audio nodes; no audio assets.

export type NoiseKind = 'white' | 'pink' | 'brown' | 'crunch' | 'crackle';
export type NoiseBank = Readonly<Record<NoiseKind, AudioBuffer>>;

export interface Curves {
  /** Gentle tanh saturation. */
  readonly soft: Float32Array;
  /** Heavy drive, near square clipping (chainsaw / grit). */
  readonly hard: Float32Array;
  /** Amplitude quantiser (~4.5 bit) for lo-fi crunch. */
  readonly crush: Float32Array;
}

export type Vowel = 'a' | 'o' | 'u' | 'e' | 'i';
const FORMANTS: Record<Vowel, readonly [number, number, number]> = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  u: [325, 700, 2530],
  e: [400, 1700, 2600],
  i: [300, 2200, 2950],
};

const MIN_F = 1;
const MAX_F = 20000;
const clampF = (f: number): number => (f > MIN_F ? (f < MAX_F ? f : MAX_F) : MIN_F);
/** Oscillators may run very slowly (LFOs). */
const clampOsc = (f: number): number => (f > 0.001 ? (f < MAX_F ? f : MAX_F) : 0.001);
const SILENT = 0.0001;

/** Pre-generate the noise buffers once per context (never per play). */
export function makeNoiseBank(ctx: BaseAudioContext, seconds = 2): NoiseBank {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * seconds));
  const mk = (): [AudioBuffer, Float32Array] => {
    const b = ctx.createBuffer(1, n, sr);
    return [b, b.getChannelData(0)];
  };

  const [white, w] = mk();
  for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;

  // Paul Kellet's economy pink filter.
  const [pink, p] = mk();
  {
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + x * 0.099046;
      b1 = 0.963 * b1 + x * 0.2965164;
      b2 = 0.57 * b2 + x * 1.0526913;
      p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.18;
    }
  }

  // Leaky-integrated (brown/red) noise for rumbles.
  const [brown, br] = mk();
  {
    let last = 0;
    let peak = 1e-6;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      br[i] = last;
      const a = Math.abs(last);
      if (a > peak) peak = a;
    }
    const k = 0.95 / peak;
    for (let i = 0; i < n; i++) br[i] *= k;
  }

  // Sample-and-hold, bit-reduced white noise: crunchy lo-fi grit (~7 kHz effective rate, 5 bit).
  const [crunch, cr] = mk();
  {
    const hold = Math.max(1, Math.round(sr / 7000));
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (i % hold === 0) v = Math.round((Math.random() * 2 - 1) * 15) / 15;
      cr[i] = v;
    }
  }

  // Sparse random clicks/pops (fire crackle, acid, debris). ~45 events per second.
  const [crackle, ck] = mk();
  {
    ck.fill(0);
    const events = Math.floor(45 * seconds);
    for (let e = 0; e < events; e++) {
      const at = Math.floor(Math.random() * n);
      const len = 3 + Math.floor(Math.random() * (Math.random() < 0.2 ? 90 : 25));
      const amp = 0.25 + Math.random() * 0.75;
      for (let j = 0; j < len && at + j < n; j++) {
        ck[at + j] += (Math.random() * 2 - 1) * amp * Math.exp((-4 * j) / len);
      }
    }
    for (let i = 0; i < n; i++) ck[i] = Math.max(-1, Math.min(1, ck[i]));
  }

  return { white, pink, brown, crunch, crackle };
}

export function makeCurves(size = 1024): Curves {
  const soft = new Float32Array(size);
  const hard = new Float32Array(size);
  const crush = new Float32Array(size);
  const norm = Math.tanh(2.2);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    soft[i] = Math.tanh(2.2 * x) / norm;
    hard[i] = Math.max(-1, Math.min(1, Math.tanh(7 * x) * 1.05));
    crush[i] = Math.round(x * 11) / 11;
  }
  return { soft, hard, crush };
}

/**
 * Per-voice builder. A single instance is reused: `begin()` targets a new output/time and returns
 * the fresh list into which every created source is tracked (so a voice can be stopped early).
 * All `at` arguments are seconds relative to the voice start time `t`.
 */
export class Kit {
  /** Absolute start time of the voice being built. */
  t = 0;
  /** Pitch multiplier for this voice (includes random variation). */
  p = 1;
  /** Relative end time of everything scheduled so far. */
  end = 0;
  out!: AudioNode;
  sources: AudioScheduledSourceNode[] = [];

  constructor(readonly ctx: BaseAudioContext, readonly bank: NoiseBank, readonly curves: Curves) {}

  begin(out: AudioNode, t: number, p: number): AudioScheduledSourceNode[] {
    this.out = out;
    this.t = t;
    this.p = p;
    this.end = 0;
    this.sources = [];
    return this.sources;
  }

  // ---------------------------------------------------------------- randomness
  r(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }
  ri(a: number, b: number): number {
    return Math.floor(this.r(a, b + 1));
  }
  chance(p: number): boolean {
    return Math.random() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  extend(rel: number): void {
    if (rel > this.end) this.end = rel;
  }

  // ---------------------------------------------------------------- plain nodes
  gain(v: number, dest: AudioNode = this.out): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  /** Note: for lowpass/highpass Web Audio's Q is resonance in dB; for bandpass/peaking it is plain Q. */
  filter(type: BiquadFilterType, freq: number, q = 0, dest: AudioNode = this.out): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = clampF(freq);
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  shaper(curve: Float32Array, dest: AudioNode = this.out, oversample: OverSampleType = 'none'): WaveShaperNode {
    const s = this.ctx.createWaveShaper();
    s.curve = curve;
    s.oversample = oversample;
    s.connect(dest);
    return s;
  }

  pan(v: number, dest: AudioNode = this.out): AudioNode {
    if (typeof this.ctx.createStereoPanner !== 'function') return this.gain(1, dest);
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v));
    p.connect(dest);
    return p;
  }

  // ---------------------------------------------------------------- sources
  private track(src: AudioScheduledSourceNode): void {
    this.sources.push(src);
  }

  /** Oscillator at `freq` (already absolute Hz; not multiplied by p) from at → at+dur. */
  osc(type: OscillatorType, freq: number, at: number, dur: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = clampOsc(freq);
    o.connect(dest);
    const s = this.t + Math.max(0, at);
    o.start(s);
    o.stop(s + dur + 0.03);
    this.track(o);
    this.extend(at + dur + 0.03);
    return o;
  }

  /** Looping noise from a random offset of a pre-generated buffer. */
  noise(kind: NoiseKind, at: number, dur: number, dest: AudioNode, rate = 1): AudioBufferSourceNode {
    const b = this.bank[kind];
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.playbackRate.value = Math.max(0.05, Math.min(8, rate));
    src.connect(dest);
    const s = this.t + Math.max(0, at);
    src.start(s, Math.random() * Math.max(0, b.duration - 0.05));
    src.stop(s + dur + 0.03);
    this.track(src);
    this.extend(at + dur + 0.03);
    return src;
  }

  /** Never-ending oscillator (ambience/loops); caller stops it via the tracked source list. */
  oscForever(type: OscillatorType, freq: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = clampOsc(freq);
    o.detune.value = detune;
    o.connect(dest);
    o.start(this.t);
    this.track(o);
    return o;
  }

  noiseForever(kind: NoiseKind, dest: AudioNode, rate = 1): AudioBufferSourceNode {
    const b = this.bank[kind];
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.playbackRate.value = rate;
    src.connect(dest);
    src.start(this.t, Math.random() * Math.max(0, b.duration - 0.05));
    this.track(src);
    return src;
  }

  /** LFO: sine (or other) oscillator scaled by `depth` and connected into `param`. */
  lfo(rate: number, depth: number, param: AudioParam, type: OscillatorType = 'sine', at = 0, dur = -1): OscillatorNode {
    const g = this.ctx.createGain();
    g.gain.value = depth;
    g.connect(param);
    if (dur < 0) return this.oscForever(type, rate, g);
    return this.osc(type, rate, at, dur, g);
  }

  /**
   * Amplitude-modulation stage: a gain centred on `base` wobbling by ±depth at `rate` Hz
   * (keep depth <= base so it never inverts). `dur < 0` = runs forever. Returns its input.
   */
  am(base: number, rate: number, depth: number, dest: AudioNode = this.out, type: OscillatorType = 'sine', at = 0, dur = -1): GainNode {
    const g = this.gain(base, dest);
    this.lfo(rate, depth, g.gain, type, at, dur);
    return g;
  }

  // ---------------------------------------------------------------- automation
  /** Percussive envelope: 0 → peak over a, hold h, exponential decay to silence over d. */
  perc(param: AudioParam, at: number, a: number, peak: number, d: number, h = 0): void {
    const s = this.t + Math.max(0, at);
    const pk = Math.max(SILENT * 2, peak);
    a = Math.max(0.0005, a);
    d = Math.max(0.005, d);
    h = Math.max(0, h);
    param.setValueAtTime(0, s);
    param.linearRampToValueAtTime(pk, s + a);
    if (h > 0) param.setValueAtTime(pk, s + a + h);
    param.exponentialRampToValueAtTime(SILENT, s + a + h + d);
    param.setValueAtTime(0, s + a + h + d + 0.001);
    this.extend(Math.max(0, at) + a + h + d + 0.01);
  }

  /** Swell envelope: linear rise to peak over a, sustain s, exponential release r. */
  swell(param: AudioParam, at: number, a: number, peak: number, sus: number, r: number): void {
    this.perc(param, at, a, peak, r, sus);
  }

  /** Exponential sweep of a positive-valued param from → to over dur. */
  sweep(param: AudioParam, at: number, from: number, to: number, dur: number): void {
    const s = this.t + Math.max(0, at);
    param.setValueAtTime(clampF(from), s);
    param.exponentialRampToValueAtTime(clampF(to), s + Math.max(0.005, dur));
  }

  /** Piecewise exponential path through (time, value) points (times relative to the voice). */
  path(param: AudioParam, points: ReadonlyArray<readonly [number, number]>): void {
    if (points.length === 0) return;
    param.setValueAtTime(clampF(points[0][1]), this.t + Math.max(0, points[0][0]));
    for (let i = 1; i < points.length; i++) {
      param.exponentialRampToValueAtTime(clampF(points[i][1]), this.t + Math.max(0, points[i][0]));
    }
  }

  /** Random step jitter of a frequency param (buzzy electricity, creaks). */
  jitter(param: AudioParam, at: number, dur: number, base: number, spread: number, steps: number): void {
    const s = this.t + Math.max(0, at);
    for (let i = 0; i < steps; i++) {
      param.setValueAtTime(clampF(base * (1 + (Math.random() * 2 - 1) * spread)), s + (dur * i) / steps);
    }
  }

  // ---------------------------------------------------------------- composite voices
  /** Oscillator with exponential glide f0 → f1 (multiplied by p) and a percussive envelope. */
  tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    at: number,
    dur: number,
    vol: number,
    dest: AudioNode = this.out,
    a = 0.003,
  ): OscillatorNode {
    const g = this.gain(0, dest);
    const o = this.osc(type, f0 * this.p, at, dur, g);
    if (f1 !== f0) this.sweep(o.frequency, at, f0 * this.p, f1 * this.p, dur);
    this.perc(g.gain, at, a, vol, Math.max(0.005, dur - a));
    return o;
  }

  /** Filtered noise burst with an exponential filter sweep f0 → f1 (multiplied by p). */
  burst(
    kind: NoiseKind,
    at: number,
    dur: number,
    vol: number,
    ftype: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    dest: AudioNode = this.out,
    a = 0.002,
    rate = 1,
  ): BiquadFilterNode {
    const g = this.gain(0, dest);
    const f = this.filter(ftype, f0 * this.p, q, g);
    this.noise(kind, at, dur, f, rate);
    if (f1 !== f0) this.sweep(f.frequency, at, f0 * this.p, f1 * this.p, dur);
    this.perc(g.gain, at, a, vol, Math.max(0.005, dur - a));
    return f;
  }

  /** Tiny bandpassed noise tick. */
  click(at: number, vol: number, freq: number, dest: AudioNode = this.out, len = 0.012): void {
    this.burst('white', at, len, vol, 'bandpass', freq, freq, 1.4, dest, 0.0005);
  }

  /** Two-operator FM tone: carrier cf (glide to cf1) modulated by cf*ratio with index (glide to index1). */
  fm(
    cf: number,
    ratio: number,
    index: number,
    at: number,
    dur: number,
    vol: number,
    dest: AudioNode = this.out,
    cf1 = cf,
    index1 = index,
    a = 0.003,
    carrierType: OscillatorType = 'sine',
  ): OscillatorNode {
    const g = this.gain(0, dest);
    const car = this.osc(carrierType, cf * this.p, at, dur, g);
    const mg = this.ctx.createGain();
    mg.connect(car.frequency);
    const mod = this.osc('sine', cf * ratio * this.p, at, dur, mg);
    const s = this.t + Math.max(0, at);
    mg.gain.setValueAtTime(Math.max(1, cf * ratio * index * this.p), s);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, cf1 * ratio * index1 * this.p), s + dur);
    if (cf1 !== cf) {
      this.sweep(car.frequency, at, cf * this.p, cf1 * this.p, dur);
      this.sweep(mod.frequency, at, cf * ratio * this.p, cf1 * ratio * this.p, dur);
    }
    this.perc(g.gain, at, a, vol, Math.max(0.005, dur - a));
    return car;
  }

  /** Inharmonic struck-bell / glass tone. */
  bell(f: number, at: number, dur: number, vol: number, dest: AudioNode = this.out, bright = 1): void {
    const partials: ReadonlyArray<readonly [number, number, number]> = [
      [1, 1, 1],
      [2.76, 0.5 * bright, 0.55],
      [5.4, 0.28 * bright, 0.3],
      [8.93, 0.14 * bright, 0.18],
    ];
    for (const [ratio, amp, dk] of partials) {
      const pf = f * ratio * this.p;
      if (pf > 16000) continue;
      const g = this.gain(0, dest);
      this.osc('sine', pf * this.r(0.997, 1.003), at, dur * dk, g);
      this.perc(g.gain, at, 0.002, vol * amp, dur * dk);
    }
  }

  /** Parallel formant bank (3 bandpasses) — returns its input node. */
  formant(vowel: Vowel, dest: AudioNode = this.out, q = 9, shift = 1): GainNode {
    const input = this.ctx.createGain();
    const [f1, f2, f3] = FORMANTS[vowel];
    const amps = [1, 0.55, 0.25];
    [f1, f2, f3].forEach((f, i) => {
      const g = this.gain(amps[i] * 2.2, dest);
      const bp = this.filter('bandpass', f * shift, q, g);
      input.connect(bp);
    });
    return input;
  }
}

/**
 * Convolution-free cave reverb (Schroeder/Moorer style): pre-delay → band-limit → two allpass
 * diffusers → four parallel damped feedback combs (lowpass inside each loop) split across L/R.
 *
 * Every feedback cycle contains exactly ONE DelayNode on purpose: browsers add an implicit
 * render-quantum delay on cycle edges, which breaks the losslessness of cross-coupled feedback
 * delay networks (a Hadamard/rotation FDN measurably blows up in Chromium at g > ~0.8), whereas
 * single-delay loops stay stable for any gain < 1.
 */
export class CaveReverb {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly fb: GainNode[] = [];
  private readonly damp: BiquadFilterNode[] = [];
  private static readonly TIMES = [0.0431, 0.0547, 0.0683, 0.0797];
  private static readonly MEAN = 0.06145;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 0.5;
    const pre = ctx.createDelay(0.2);
    pre.delayTime.value = 0.022;
    const lowcut = ctx.createBiquadFilter();
    lowcut.type = 'highpass';
    lowcut.frequency.value = 180;
    lowcut.Q.value = -3;
    const highcut = ctx.createBiquadFilter();
    highcut.type = 'lowpass';
    highcut.frequency.value = 5500;
    highcut.Q.value = -3;
    const scale = ctx.createGain();
    scale.gain.value = 0.3;
    this.input.connect(pre).connect(lowcut).connect(highcut).connect(scale);
    const diffused = this.allpass(this.allpass(scale, 0.0127, 0.6), 0.0071, 0.6);

    const merger = ctx.createChannelMerger(2);
    CaveReverb.TIMES.forEach((t, i) => {
      const d = ctx.createDelay(0.5);
      d.delayTime.value = t;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.Q.value = -3; // dB: Butterworth, no resonant peak inside the loop
      const g = ctx.createGain();
      g.gain.value = 0;
      diffused.connect(d);
      d.connect(lp);
      lp.connect(g);
      g.connect(d);
      d.connect(merger, 0, i % 2);
      this.fb.push(g);
      this.damp.push(lp);
    });
    merger.connect(this.output);
    this.setProfile(0.75, 2600, 0.5, 0.01);
  }

  /** Schroeder allpass: v = x + g·v[n-D]; y = -g·v + v[n-D]. One delay per cycle. */
  private allpass(input: AudioNode, delay: number, g: number): AudioNode {
    const ctx = this.ctx;
    const v = ctx.createGain();
    input.connect(v);
    const d = ctx.createDelay(0.1);
    d.delayTime.value = delay;
    v.connect(d);
    const fb = ctx.createGain();
    fb.gain.value = g;
    d.connect(fb);
    fb.connect(v);
    const out = ctx.createGain();
    d.connect(out);
    const ff = ctx.createGain();
    ff.gain.value = -g;
    v.connect(ff);
    ff.connect(out);
    return out;
  }

  /**
   * Retune for a space. `feedback` is the loop gain of an average-length comb, ~0.6 (small room)
   * .. 0.88 (huge cave); longer combs get proportionally more so all decay together.
   * `damp` = in-loop lowpass Hz, `wet` = return level.
   */
  setProfile(feedback: number, damp: number, wet: number, time = 2): void {
    const now = this.ctx.currentTime;
    const tc = Math.max(0.001, time / 3);
    const fbk = Math.max(0, Math.min(0.9, feedback));
    CaveReverb.TIMES.forEach((t, i) => {
      const gi = Math.min(0.93, Math.pow(fbk, t / CaveReverb.MEAN));
      this.fb[i].gain.setTargetAtTime(gi, now, tc);
      this.damp[i].frequency.setTargetAtTime(clampF(damp), now, tc);
    });
    this.output.gain.setTargetAtTime(Math.max(0, wet), now, tc);
  }
}
