/**
 * Small synthesis building blocks used by the sound effects. Each one creates
 * a short-lived sub graph (sources stop by themselves) feeding `out`, and
 * returns the time at which it is silent.
 */
import { getKit, mkOsc, mkNoise, mkFilter, mkGain, mkShaper, envPerc, noiseComp, rand } from './dsp';

export interface ThumpOpts {
  f0: number;
  f1: number;
  /** pitch drop time */
  drop: number;
  /** amplitude decay time constant */
  tau: number;
  amp: number;
  att?: number;
  /** 0..1 pre-gain into a tanh shaper: adds harmonics so lows read on small speakers */
  drive?: number;
  type?: OscillatorType;
}

/** Pitch-dropping sine: the body of every punch, kick drum and fall. */
export function thump(ac: BaseAudioContext, out: AudioNode, t: number, o: ThumpOpts): number {
  const att = o.att ?? 0.0015;
  const end = t + att + o.tau * 6 + 0.01;
  const osc = mkOsc(ac, o.type ?? 'sine', o.f0, t, end);
  osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 12), t + o.drop);
  const g = mkGain(ac, 0);
  envPerc(g.gain, t, o.amp, att, o.tau);
  if (o.drive) {
    // the sine is full scale: the shaper curve itself sets the amount of harmonics
    const ws = mkShaper(ac, o.drive > 0.6 ? getKit(ac).curves.sat : getKit(ac).curves.soft);
    osc.connect(ws);
    ws.connect(g);
  } else osc.connect(g);
  g.connect(out);
  return end;
}

export interface NoiseOpts {
  buf?: 'white' | 'pink' | 'brown';
  type: BiquadFilterType;
  f: number;
  q?: number;
  /** sweep filter to f1 over `sweep` seconds (exponential) */
  f1?: number;
  sweep?: number;
  att?: number;
  hold?: number;
  tau: number;
  amp: number;
  rate?: number;
}

/** Filtered noise burst (slaps, cracks, sprays, thuds). */
export function noiseHit(ac: BaseAudioContext, out: AudioNode, t: number, o: NoiseOpts): number {
  const k = getKit(ac);
  const att = o.att ?? 0.001;
  const hold = o.hold ?? 0;
  const end = t + att + hold + o.tau * 6 + 0.01;
  const src = mkNoise(ac, k[o.buf ?? 'white'], t, end, o.rate ?? 1);
  const q = o.q ?? 0.707;
  const f = mkFilter(ac, o.type, o.f, q);
  if (o.f1 !== undefined) {
    f.frequency.setValueAtTime(o.f, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.sweep ?? o.tau * 3));
  }
  const g = mkGain(ac, 0);
  const comp = (o.buf ?? 'white') === 'white' ? noiseComp(o.type, Math.sqrt(o.f * (o.f1 ?? o.f)), q, ac.sampleRate) * 0.35 : 0.6;
  const amp = o.amp * comp;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + att);
  if (hold > 0) g.gain.setValueAtTime(amp, t + att + hold);
  g.gain.setTargetAtTime(0, t + att + hold, o.tau);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  return end;
}

export interface GrainOpts {
  type?: BiquadFilterType;
  f: number;
  q?: number;
  /** number of grains */
  n: number;
  /** time span the grains are scattered over (denser at the start) */
  spread: number;
  amp: number;
  /** grain length */
  grain?: number;
  buf?: 'white' | 'pink';
}

/**
 * Granular clicks through one filter: bone crunch, splinters, gravel, blood
 * pats. One source + one gain no matter how many grains.
 */
export function grains(ac: BaseAudioContext, out: AudioNode, t: number, o: GrainOpts): number {
  const k = getKit(ac);
  const times: number[] = [];
  for (let i = 0; i < o.n; i++) times.push(Math.pow(Math.random(), 1.5) * o.spread);
  times.sort((a, b) => a - b);
  const type = o.type ?? 'bandpass';
  const q = o.q ?? 1.2;
  const comp = noiseComp(type, o.f, q, ac.sampleRate) * 0.35;
  const g = mkGain(ac, 0);
  g.gain.setValueAtTime(0, t);
  let last = t;
  for (const dt of times) {
    const t0 = Math.max(t + dt, last + 0.0004);
    const gd = (o.grain ?? 0.0022) * rand(0.6, 1.5);
    const a = o.amp * comp * rand(0.4, 1) * (1 - (0.55 * dt) / Math.max(o.spread, 1e-3));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(a, t0 + 0.00025);
    g.gain.linearRampToValueAtTime(0, t0 + 0.00025 + gd);
    last = t0 + 0.00025 + gd;
  }
  const end = last + 0.02;
  const src = mkNoise(ac, k[o.buf ?? 'white'], t, end);
  const f = mkFilter(ac, type, o.f, q);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  return end;
}

export interface ModalOpts {
  f: number;
  ratios: number[];
  taus: number[];
  amps: number[];
  amp: number;
  att?: number;
  /** random detune per partial (fraction) */
  jitter?: number;
  /** start this factor sharp and settle (impact pitch glide) */
  bend?: number;
  bendT?: number;
}

/** Sum of exponentially decaying sine partials: wood, metal, glass, ceramic resonances. */
export function modal(ac: BaseAudioContext, out: AudioNode, t: number, o: ModalOpts): number {
  let end = t;
  const att = o.att ?? 0.0006;
  const fmax = Math.min(ac.sampleRate * 0.45, 13000);
  for (let i = 0; i < o.ratios.length; i++) {
    const fr = o.f * o.ratios[i] * (1 + (Math.random() * 2 - 1) * (o.jitter ?? 0.006));
    if (fr >= fmax || fr < 20) continue;
    const tau = o.taus[i] ?? o.taus[o.taus.length - 1];
    const e = t + att + tau * 6 + 0.01;
    const osc = mkOsc(ac, 'sine', o.bend ? fr * o.bend : fr, t, e);
    if (o.bend) osc.frequency.exponentialRampToValueAtTime(fr, t + (o.bendT ?? 0.06));
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, o.amp * (o.amps[i] ?? 0.15), att, tau);
    osc.connect(g);
    g.connect(out);
    end = Math.max(end, e);
  }
  return end;
}

/** One decaying sine (+ optional second partial): glass tinkles, shards, bells. */
export function ping(ac: BaseAudioContext, out: AudioNode, t: number, f: number, tau: number, amp: number, f2 = 0): number {
  const e = t + tau * 6 + 0.01;
  const g = mkGain(ac, 0);
  envPerc(g.gain, t, amp, 0.0005, tau);
  const o = mkOsc(ac, 'sine', f, t, e);
  o.connect(g);
  if (f2 > 0 && f2 < ac.sampleRate * 0.45) {
    const o2 = mkOsc(ac, 'sine', f2, t, e);
    const g2 = mkGain(ac, 0.5);
    o2.connect(g2);
    g2.connect(g);
  }
  g.connect(out);
  return e;
}

/** Wet resonant noise sweeping down: flesh squelch, gore. */
export function squelch(ac: BaseAudioContext, out: AudioNode, t: number, o: { f0: number; f1: number; dur: number; amp: number; q?: number; bumps?: number }): number {
  const k = getKit(ac);
  const end = t + o.dur + 0.06;
  const src = mkNoise(ac, k.white, t, end);
  const q = o.q ?? 4;
  const f = mkFilter(ac, 'bandpass', o.f0, q);
  f.frequency.setValueAtTime(o.f0, t);
  f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = mkGain(ac, 0);
  const comp = noiseComp('bandpass', Math.sqrt(o.f0 * o.f1), q, ac.sampleRate) * 0.35;
  const n = o.bumps ?? 3;
  const seg = o.dur / n;
  g.gain.setValueAtTime(0, t);
  let tt = t;
  for (let i = 0; i < n; i++) {
    const a = o.amp * comp * (1 - i / (n + 1.5)) * rand(0.7, 1);
    g.gain.linearRampToValueAtTime(a, tt + seg * 0.22);
    g.gain.linearRampToValueAtTime(a * 0.3, tt + seg);
    tt += seg;
  }
  g.gain.linearRampToValueAtTime(0, end - 0.005);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  return end;
}

/** Wet little bloops (rising sine chirps) scattered in time: blood drops, bubbles. */
export function droplets(ac: BaseAudioContext, out: AudioNode, t: number, o: { n: number; spread: number; amp: number; lo?: number; hi?: number }): number {
  let end = t;
  for (let i = 0; i < o.n; i++) {
    const t0 = t + Math.pow(Math.random(), 1.3) * o.spread;
    const f0 = rand(o.lo ?? 320, o.hi ?? 850);
    const d = rand(0.012, 0.028);
    const e = t0 + d + 0.03;
    const osc = mkOsc(ac, 'sine', f0, t0, e);
    osc.frequency.exponentialRampToValueAtTime(f0 * rand(1.7, 2.5), t0 + d);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t0, o.amp * rand(0.4, 1) * (1 - (0.5 * (t0 - t)) / Math.max(o.spread, 1e-3)), 0.002, d * 0.4);
    osc.connect(g);
    g.connect(out);
    end = Math.max(end, e);
  }
  return end;
}

/** Shared lowpass node for a sound (tame harsh highs of shards etc.). */
export function lowpassTo(ac: BaseAudioContext, out: AudioNode, f: number, q = 0.5): BiquadFilterNode {
  const lp = mkFilter(ac, 'lowpass', f, q);
  lp.connect(out);
  return lp;
}
