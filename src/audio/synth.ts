/**
 * Low-level WebAudio synthesis toolkit used by the SFX, loop and music modules.
 *
 * Everything here is procedural: noise buffers, impulse responses and distortion curves
 * are generated at start-up, and every sound is built from oscillators, filtered noise,
 * envelopes and waveshapers. Nothing touches the DOM, so the module is safe to import anywhere.
 */
import type { AspectId } from '../core/ids';

export const MIN_GAIN = 0.0001;

/** Clamp a frequency into the range the context can represent. */
export function clampFreq(ctx: BaseAudioContext, f: number): number {
  if (!Number.isFinite(f)) return 440;
  const ny = ctx.sampleRate / 2 - 60;
  return Math.min(Math.max(f, 12), Math.min(20000, ny));
}

export function safeNum(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ */
/* Pre-generated buffers                                               */
/* ------------------------------------------------------------------ */

export type NoiseColor = 'white' | 'pink' | 'brown' | 'crackle' | 'drips' | 'ticks';

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** Sparse random clicks — fire, electricity, sparks, grinding. */
  crackle: AudioBuffer;
  /** Dense small droplets — rain, sizzles. */
  drips: AudioBuffer;
  /** One second of "tick ... tock" for clocks. */
  ticks: AudioBuffer;
}

function normalize(data: Float32Array, peak = 0.95): void {
  let m = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > m) m = a;
  }
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < data.length; i++) data[i] *= k;
  }
}

export function makeNoiseBank(ctx: BaseAudioContext): NoiseBank {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2);
  const white = ctx.createBuffer(1, len, sr);
  const pink = ctx.createBuffer(1, len, sr);
  const brown = ctx.createBuffer(1, len, sr);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    // Paul Kellet's refined pink filter.
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  // Remove DC from brown noise (it wanders).
  let mean = 0;
  for (let i = 0; i < len; i++) mean += b[i];
  mean /= len;
  for (let i = 0; i < len; i++) b[i] -= mean;
  normalize(w, 0.9);
  normalize(p, 0.95);
  normalize(b, 0.95);

  // Crackle: sparse decaying clicks with random polarity.
  const crackle = ctx.createBuffer(1, len, sr);
  const c = crackle.getChannelData(0);
  const crackleRate = 260 / sr;
  for (let i = 0; i < len; i++) {
    if (Math.random() < crackleRate) {
      const amp = Math.pow(Math.random(), 1.6) * (Math.random() < 0.5 ? -1 : 1);
      const L = 10 + Math.floor(Math.random() * 160);
      for (let j = 0; j < L && i + j < len; j++) {
        c[i + j] += amp * Math.exp(-j / (L * 0.25)) * (Math.random() * 2 - 1);
      }
    }
  }
  normalize(c, 0.95);

  // Drips: dense tiny clicks with a hint of pitch.
  const drips = ctx.createBuffer(1, len, sr);
  const d = drips.getChannelData(0);
  const dripRate = 900 / sr;
  for (let i = 0; i < len; i++) {
    if (Math.random() < dripRate) {
      const amp = (0.2 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1);
      const f = 1800 + Math.random() * 4200;
      const L = 40 + Math.floor(Math.random() * 120);
      for (let j = 0; j < L && i + j < len; j++) {
        d[i + j] += amp * Math.exp(-j / (L * 0.2)) * Math.sin((2 * Math.PI * f * j) / sr);
      }
    }
  }
  normalize(d, 0.9);

  // Ticks: 1 s, tick at 0 s (bright), tock at 0.5 s (darker).
  const tl = Math.floor(sr);
  const ticks = ctx.createBuffer(1, tl, sr);
  const tk = ticks.getChannelData(0);
  const click = (start: number, f: number, amp: number) => {
    const L = Math.floor(sr * 0.03);
    for (let j = 0; j < L && start + j < tl; j++) {
      const env = Math.exp(-j / (sr * 0.004));
      tk[start + j] += amp * env * (0.6 * Math.sin((2 * Math.PI * f * j) / sr) + 0.4 * (Math.random() * 2 - 1));
    }
  };
  click(0, 3300, 1);
  click(Math.floor(sr * 0.5), 2100, 0.8);
  normalize(tk, 0.95);

  return { white, pink, brown, crackle, drips, ticks };
}

/** Stereo reverb impulse response: pre-delay, early reflections, darkening exponential tail. */
export function makeImpulseResponse(ctx: BaseAudioContext, seconds = 2.2, preDelay = 0.012): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (seconds + preDelay));
  const ir = ctx.createBuffer(2, len, sr);
  const k = Math.log(1000) / seconds; // -60 dB at `seconds`
  const pd = Math.floor(preDelay * sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pd; i < len; i++) {
      const t = (i - pd) / sr;
      // Progressive damping: high frequencies die sooner.
      const coef = Math.min(0.97, 0.15 + t * 0.55);
      const x = Math.random() * 2 - 1;
      lp = lp * coef + x * (1 - coef);
      data[i] = lp * Math.exp(-k * t) * (1 + 1.5 * (1 - coef));
    }
    // Early reflections.
    for (let r = 0; r < 9; r++) {
      const at = pd + Math.floor((0.006 + Math.random() * 0.075) * sr);
      if (at < len) data[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - r * 0.04);
    }
    normalize(data, 0.7);
  }
  return ir;
}

const curveCache = new Map<number, Float32Array<ArrayBuffer>>();
/** tanh waveshaper curve; amount ~1 (warm) .. 30 (heavy grit). */
export function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = Math.round(amount * 10) / 10;
  const hit = curveCache.get(key);
  if (hit) return hit;
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(key);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(key * x) / norm;
  }
  curveCache.set(key, curve);
  return curve;
}

/**
 * Final safety soft-clipper. Unity gain below 0.6 (≈ -4.4 dBFS), smooth tanh knee above,
 * so the output can never exceed ~0.91 even if the limiter lets a transient through.
 */
export function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/* ------------------------------------------------------------------ */
/* Voice tracking                                                      */
/* ------------------------------------------------------------------ */

/**
 * A voice owns the nodes of one triggered sound. It tracks every scheduled source so the whole
 * sub-graph can be disconnected once the last one has ended, and can be "stolen" (faded fast).
 */
export class Voice {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly send: GainNode;
  readonly panner: StereoPannerNode | null;
  readonly id: string;
  readonly startTime: number;
  endTime: number;
  onFinished: ((v: Voice) => void) | null = null;
  private pending = 0;
  private finished = false;
  private sources: AudioScheduledSourceNode[] = [];

  constructor(private ctx: BaseAudioContext, dest: AudioNode, reverbIn: AudioNode, pan: number, id: string, t: number) {
    this.id = id;
    this.startTime = t;
    this.endTime = t;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.send = ctx.createGain();
    this.send.gain.value = 0;
    this.input.connect(this.output);
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, safeNum(pan)));
      this.output.connect(panner);
      panner.connect(dest);
      panner.connect(this.send);
    } else {
      this.output.connect(dest);
      this.output.connect(this.send);
    }
    this.send.connect(reverbIn);
    this.panner = panner;
  }

  get sourceCount(): number {
    return this.pending;
  }

  track(src: AudioScheduledSourceNode, stopAt: number): void {
    this.pending++;
    this.sources.push(src);
    if (stopAt > this.endTime) this.endTime = stopAt;
    src.onended = () => {
      this.pending--;
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
      if (this.pending <= 0) this.finish();
    };
  }

  /** Fade out quickly and stop everything (voice stealing). */
  steal(): void {
    if (this.finished) return;
    const now = this.ctx.currentTime;
    try {
      const g = this.output.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.03);
    } catch {
      /* ignore */
    }
    for (const s of this.sources) {
      try {
        s.stop(now + 0.05);
      } catch {
        /* not started / already stopped */
      }
    }
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    try {
      this.input.disconnect();
      this.output.disconnect();
      this.send.disconnect();
      this.panner?.disconnect();
    } catch {
      /* ignore */
    }
    this.sources.length = 0;
    this.onFinished?.(this);
  }

  get isFinished(): boolean {
    return this.finished;
  }
}

/* ------------------------------------------------------------------ */
/* Recipe context + building blocks                                    */
/* ------------------------------------------------------------------ */

/** Everything a sound recipe needs. */
export interface Sc {
  ctx: BaseAudioContext;
  /** Start time (context seconds). */
  t: number;
  /** Dry destination for this voice. */
  out: AudioNode;
  /** Pitch multiplier (user pitch × random variation × slow-mo). */
  p: number;
  /** Intensity 0..1. */
  i: number;
  /** Time stretch (>1 in slow motion). */
  st: number;
  aspect?: AspectId;
  v: Voice;
  nb: NoiseBank;
  /** Set this voice's reverb send (0..1). */
  rev(level: number): void;
}

export type EnvShape = 'exp' | 'lin' | 'swell' | 'hold' | 'bell';

/**
 * Apply an amplitude envelope.
 * - exp: attack then exponential decay to silence at t0+dur (percussive)
 * - lin: attack then linear decay
 * - swell: exponential rise to peak at t0+dur then cut (reverse-cymbal feel)
 * - hold: attack, sustain, short release at the end
 * - bell: smooth rise to peak at `attack`, smooth exp fall (whooshes)
 */
export function applyEnv(param: AudioParam, t0: number, peak: number, attack: number, dur: number, shape: EnvShape = 'exp'): void {
  const pk = Math.max(MIN_GAIN * 2, safeNum(peak, 0));
  const a = Math.max(0.001, safeNum(attack, 0.002));
  const d = Math.max(a + 0.004, safeNum(dur, 0.1));
  param.cancelScheduledValues(t0);
  switch (shape) {
    case 'swell':
      param.setValueAtTime(MIN_GAIN, t0);
      param.exponentialRampToValueAtTime(pk, t0 + d);
      param.linearRampToValueAtTime(MIN_GAIN, t0 + d + 0.025);
      break;
    case 'hold': {
      const rel = Math.min(0.12, d * 0.3);
      param.setValueAtTime(MIN_GAIN, t0);
      param.linearRampToValueAtTime(pk, t0 + a);
      param.setValueAtTime(pk, t0 + Math.max(a, d - rel));
      param.linearRampToValueAtTime(MIN_GAIN, t0 + d);
      break;
    }
    case 'lin':
      param.setValueAtTime(MIN_GAIN, t0);
      param.linearRampToValueAtTime(pk, t0 + a);
      param.linearRampToValueAtTime(MIN_GAIN, t0 + d);
      break;
    case 'bell':
      param.setValueAtTime(MIN_GAIN, t0);
      param.exponentialRampToValueAtTime(pk, t0 + a);
      param.exponentialRampToValueAtTime(MIN_GAIN, t0 + d);
      break;
    default:
      if (a <= 0.0015) param.setValueAtTime(pk, t0);
      else {
        param.setValueAtTime(MIN_GAIN, t0);
        param.linearRampToValueAtTime(pk, t0 + a);
      }
      param.exponentialRampToValueAtTime(MIN_GAIN, t0 + d);
  }
}

export interface FilterSpec {
  type: BiquadFilterType;
  f: number;
  /** Glide target frequency. */
  f2?: number;
  /** Glide duration (s). */
  glide?: number;
  q?: number;
  gain?: number;
  curve?: 'exp' | 'lin';
  /** Scale frequencies by the voice pitch (default true). */
  track?: boolean;
}

export function makeFilter(sc: Sc, spec: FilterSpec, t0: number): BiquadFilterNode {
  const f = sc.ctx.createBiquadFilter();
  f.type = spec.type;
  f.Q.value = safeNum(spec.q ?? 0.707, 0.707);
  if (spec.gain !== undefined) f.gain.value = spec.gain;
  const k = spec.track === false ? 1 : sc.p;
  const f0 = clampFreq(sc.ctx, spec.f * k);
  f.frequency.setValueAtTime(f0, t0);
  if (spec.f2 !== undefined) {
    const f1 = clampFreq(sc.ctx, spec.f2 * k);
    const g = Math.max(0.004, (spec.glide ?? 0.2) * sc.st);
    if (spec.curve === 'lin') f.frequency.linearRampToValueAtTime(f1, t0 + g);
    else f.frequency.exponentialRampToValueAtTime(f1, t0 + g);
  }
  return f;
}

function chainFilters(sc: Sc, src: AudioNode, specs: FilterSpec | FilterSpec[] | undefined, t0: number): AudioNode {
  if (!specs) return src;
  const list = Array.isArray(specs) ? specs : [specs];
  let node = src;
  for (const s of list) {
    const f = makeFilter(sc, s, t0);
    node.connect(f);
    node = f;
  }
  return node;
}

export function shaper(sc: Sc, amount: number): WaveShaperNode {
  const ws = sc.ctx.createWaveShaper();
  ws.curve = distortionCurve(amount);
  ws.oversample = '2x';
  return ws;
}

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f2?: number;
  glide?: number;
  glideCurve?: 'exp' | 'lin';
  /** Offset from sc.t (s). */
  t?: number;
  dur: number;
  attack?: number;
  peak: number;
  env?: EnvShape;
  detune?: number;
  filter?: FilterSpec | FilterSpec[];
  dist?: number;
  vibrato?: { rate: number; depth: number };
  dest?: AudioNode;
  /** Don't apply the voice pitch multiplier (for absolute pitches). */
  absolute?: boolean;
}

export function tone(sc: Sc, o: ToneOpts): OscillatorNode {
  const ctx = sc.ctx;
  const t0 = sc.t + (o.t ?? 0) * sc.st;
  const dur = o.dur * sc.st;
  const k = o.absolute ? 1 : sc.p;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  const f0 = clampFreq(ctx, o.f * k);
  osc.frequency.setValueAtTime(f0, t0);
  if (o.f2 !== undefined) {
    const f1 = clampFreq(ctx, o.f2 * k);
    const g = Math.max(0.004, (o.glide ?? o.dur) * sc.st);
    if (o.glideCurve === 'lin') osc.frequency.linearRampToValueAtTime(f1, t0 + g);
    else osc.frequency.exponentialRampToValueAtTime(f1, t0 + g);
  }
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  applyEnv(g.gain, t0, o.peak, (o.attack ?? 0.002) * sc.st, dur, o.env ?? 'exp');
  let node: AudioNode = osc;
  if (o.dist) {
    const ws = shaper(sc, o.dist);
    node.connect(ws);
    node = ws;
  }
  node = chainFilters(sc, node, o.filter, t0);
  node.connect(g);
  g.connect(o.dest ?? sc.out);
  const stopAt = t0 + dur + 0.05;
  if (o.vibrato) {
    const l = ctx.createOscillator();
    l.frequency.value = o.vibrato.rate;
    const lg = ctx.createGain();
    lg.gain.value = o.vibrato.depth * f0;
    l.connect(lg);
    lg.connect(osc.frequency);
    l.start(t0);
    l.stop(stopAt);
    sc.v.track(l, stopAt);
  }
  osc.start(t0);
  osc.stop(stopAt);
  sc.v.track(osc, stopAt);
  return osc;
}

export interface NoiseOpts {
  color?: NoiseColor;
  t?: number;
  dur: number;
  attack?: number;
  peak: number;
  env?: EnvShape;
  filter?: FilterSpec | FilterSpec[];
  rate?: number;
  dist?: number;
  dest?: AudioNode;
  /** Amplitude modulation (tremolo / flutter). */
  am?: { rate: number; depth: number };
}

export function noise(sc: Sc, o: NoiseOpts): AudioBufferSourceNode {
  const ctx = sc.ctx;
  const t0 = sc.t + (o.t ?? 0) * sc.st;
  const dur = o.dur * sc.st;
  const src = ctx.createBufferSource();
  const buf = sc.nb[o.color ?? 'white'];
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = Math.max(0.05, safeNum(o.rate ?? 1, 1) * (o.color === 'ticks' ? 1 : Math.sqrt(sc.p)));
  let node: AudioNode = src;
  if (o.dist) {
    const ws = shaper(sc, o.dist);
    node.connect(ws);
    node = ws;
  }
  node = chainFilters(sc, node, o.filter, t0);
  const g = ctx.createGain();
  applyEnv(g.gain, t0, o.peak, (o.attack ?? 0.002) * sc.st, dur, o.env ?? 'exp');
  node.connect(g);
  let outNode: AudioNode = g;
  const stopAt = t0 + dur + 0.05;
  if (o.am) {
    const amg = ctx.createGain();
    amg.gain.value = 1 - o.am.depth * 0.5;
    const l = ctx.createOscillator();
    l.frequency.value = o.am.rate;
    const lg = ctx.createGain();
    lg.gain.value = o.am.depth * 0.5;
    l.connect(lg);
    lg.connect(amg.gain);
    g.connect(amg);
    outNode = amg;
    l.start(t0);
    l.stop(stopAt);
    sc.v.track(l, stopAt);
  }
  outNode.connect(o.dest ?? sc.out);
  const offset = buf.duration > 0.3 ? Math.random() * (buf.duration - 0.25) : 0;
  src.start(t0, offset);
  src.stop(stopAt);
  sc.v.track(src, stopAt);
  return src;
}

/** Kick-like pitched thump: sine (or other) sweeping f0 -> f1. */
export function thump(
  sc: Sc,
  o: { f0: number; f1: number; dur: number; peak: number; t?: number; glide?: number; dist?: number; type?: OscillatorType; dest?: AudioNode; attack?: number },
): OscillatorNode {
  return tone(sc, {
    type: o.type ?? 'sine',
    f: o.f0,
    f2: o.f1,
    glide: o.glide ?? o.dur * 0.55,
    t: o.t,
    dur: o.dur,
    peak: o.peak,
    attack: o.attack ?? 0.001,
    dist: o.dist,
    dest: o.dest,
  });
}

/** Cluster of sine partials (bells, blades, glass). */
export function partials(
  sc: Sc,
  o: {
    base: number;
    ratios: number[];
    decay: number | number[];
    peak: number;
    t?: number;
    type?: OscillatorType;
    gains?: number[];
    attack?: number;
    dest?: AudioNode;
    jitter?: number;
    vibrato?: { rate: number; depth: number };
  },
): void {
  const n = o.ratios.length;
  const norm = 1 / Math.sqrt(n);
  for (let k = 0; k < n; k++) {
    const decay = Array.isArray(o.decay) ? o.decay[k % o.decay.length] : o.decay * (1 - k * 0.6 / n);
    const gain = (o.gains ? o.gains[k % o.gains.length] : 1 / (1 + k * 0.35)) * o.peak * norm;
    const j = o.jitter ? 1 + (Math.random() * 2 - 1) * o.jitter : 1;
    tone(sc, {
      type: o.type ?? 'sine',
      f: o.base * o.ratios[k] * j,
      t: o.t,
      dur: Math.max(0.02, decay),
      peak: gain,
      attack: o.attack ?? 0.001,
      dest: o.dest,
      vibrato: o.vibrato,
    });
  }
}

/** Two-operator FM tone with decaying modulation index. */
export function fm(
  sc: Sc,
  o: {
    f: number;
    f2?: number;
    ratio: number;
    index: number;
    index2?: number;
    dur: number;
    peak: number;
    t?: number;
    attack?: number;
    glide?: number;
    env?: EnvShape;
    carrierType?: OscillatorType;
    filter?: FilterSpec | FilterSpec[];
    dest?: AudioNode;
  },
): void {
  const ctx = sc.ctx;
  const t0 = sc.t + (o.t ?? 0) * sc.st;
  const dur = o.dur * sc.st;
  const stopAt = t0 + dur + 0.05;
  const car = ctx.createOscillator();
  car.type = o.carrierType ?? 'sine';
  const mod = ctx.createOscillator();
  const f0 = clampFreq(ctx, o.f * sc.p);
  car.frequency.setValueAtTime(f0, t0);
  mod.frequency.setValueAtTime(clampFreq(ctx, f0 * o.ratio), t0);
  if (o.f2 !== undefined) {
    const f1 = clampFreq(ctx, o.f2 * sc.p);
    const g = Math.max(0.004, (o.glide ?? o.dur) * sc.st);
    car.frequency.exponentialRampToValueAtTime(f1, t0 + g);
    mod.frequency.exponentialRampToValueAtTime(clampFreq(ctx, f1 * o.ratio), t0 + g);
  }
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(Math.max(0, o.index * f0), t0);
  mg.gain.linearRampToValueAtTime(Math.max(0, (o.index2 ?? o.index * 0.1) * f0), t0 + dur);
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = ctx.createGain();
  applyEnv(g.gain, t0, o.peak, (o.attack ?? 0.002) * sc.st, dur, o.env ?? 'exp');
  const node = chainFilters(sc, car, o.filter, t0);
  node.connect(g);
  g.connect(o.dest ?? sc.out);
  car.start(t0);
  mod.start(t0);
  car.stop(stopAt);
  mod.stop(stopAt);
  sc.v.track(car, stopAt);
  sc.v.track(mod, stopAt);
}

/** LFO modulating an AudioParam for the lifetime [t0, t0+dur]. */
export function lfo(sc: Sc, param: AudioParam, rate: number, depth: number, t0: number, dur: number, type: OscillatorType = 'sine'): OscillatorNode {
  const l = sc.ctx.createOscillator();
  l.type = type;
  l.frequency.value = rate;
  const g = sc.ctx.createGain();
  g.gain.value = depth;
  l.connect(g);
  g.connect(param);
  const stopAt = t0 + dur + 0.05;
  l.start(t0);
  l.stop(stopAt);
  sc.v.track(l, stopAt);
  return l;
}

/** Create a gain node feeding `dest` (default voice out). */
export function bus(sc: Sc, gain = 1, dest?: AudioNode): GainNode {
  const g = sc.ctx.createGain();
  g.gain.value = gain;
  g.connect(dest ?? sc.out);
  return g;
}

/** Gain node passing through a waveshaper into dest. */
export function distBus(sc: Sc, amount: number, gain = 1, dest?: AudioNode): GainNode {
  const g = sc.ctx.createGain();
  g.gain.value = gain;
  const ws = shaper(sc, amount);
  g.connect(ws);
  ws.connect(dest ?? sc.out);
  return g;
}

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
