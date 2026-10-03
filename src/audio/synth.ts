// Gesture-level synthesis helpers ("thump", "click", "noise burst", "bubble", ...) that render
// into a mono Float32Array. SFX recipes are short scripts composed of these.

import {
  Rng,
  Noise,
  Svf,
  OnePole,
  Biquad,
  TAU,
  clamp,
  addMode,
  addPluck,
  addFm,
  addInto,
  peak,
  type PluckOpts,
  type FmOpts,
} from './dsp';

/** [frequency ratio, amplitude, decay time-constant (s)] */
export type Partial3 = readonly [number, number, number];

export interface EnvOpts {
  /** raised-cosine attack (s) */
  attack?: number;
  /** full level hold after the attack (s) */
  hold?: number;
  /** exponential decay time constant after attack+hold (s); default dur/3 */
  tau?: number;
  /** custom envelope over x = 0..1 (overrides attack/hold/tau) */
  env?: (x: number) => number;
}

export interface NoiseOpts extends EnvOpts {
  dur: number;
  /** peak amplitude of this component */
  amp?: number;
  color?: 'white' | 'pink' | 'brown';
  type?: 'lp' | 'hp' | 'bp' | 'none';
  /** filter cutoff/centre (Hz) at the start ... */
  f?: number;
  /** ... and at the end (exponential sweep) */
  f2?: number;
  /** custom cutoff curve (Hz) over x = 0..1 */
  fcurve?: (x: number) => number;
  q?: number;
  /** extra fixed one-pole low-pass / high-pass (Hz) */
  lp?: number;
  hp?: number;
  /** sinusoidal tremolo */
  am?: { rate: number; depth: number };
  /** random smooth amplitude flutter: points per second + depth */
  flutter?: { rate: number; depth: number };
}

export interface ToneOpts extends EnvOpts {
  dur: number;
  /** Hz, or a curve over x = 0..1 */
  f: number | ((x: number) => number);
  amp?: number;
  /** harmonic amplitudes 1..n (default [1]) */
  harm?: readonly number[];
  /** vibrato: rate Hz, depth in semitones */
  vib?: { rate: number; depth: number };
  /** release fade at the very end (s) */
  release?: number;
}

function envAt(o: EnvOpts, tt: number, x: number, dur: number): number {
  if (o.env) return o.env(x);
  const a = Math.max(o.attack ?? 0.002, 1e-5);
  const h = o.hold ?? 0;
  if (tt < a) return 0.5 - 0.5 * Math.cos((Math.PI * tt) / a);
  if (tt < a + h) return 1;
  const tau = o.tau ?? dur / 3;
  return Math.exp(-(tt - a - h) / tau);
}

export class Sig {
  readonly d: Float32Array;
  readonly nz: Noise;
  constructor(
    readonly sr: number,
    dur: number,
    readonly rng: Rng,
  ) {
    this.d = new Float32Array(Math.max(8, Math.ceil(dur * sr)));
    this.nz = new Noise(rng);
  }
  get dur(): number {
    return this.d.length / this.sr;
  }
  idx(t: number): number {
    return Math.max(0, Math.round(t * this.sr));
  }

  /** Adds `src` at time t, scaled so that its peak equals `amp`. */
  private place(src: Float32Array, t: number, amp: number): this {
    const p = peak(src);
    if (p > 0) addInto(this.d, src, this.idx(t), amp / p);
    return this;
  }

  /** Filtered noise burst with envelope, optional sweeping filter and tremolo/flutter. */
  noise(t: number, o: NoiseOpts): this {
    const sr = this.sr;
    const n = Math.min(this.d.length - this.idx(t), Math.ceil(o.dur * sr));
    if (n <= 4) return this;
    const buf = new Float32Array(n);
    const nz = this.nz;
    const type = o.type ?? 'none';
    const q = o.q ?? 0.8;
    const svf = new Svf();
    const f0 = o.f ?? 1000;
    const f1 = o.f2 ?? f0;
    const lp1 = o.lp ? new OnePole().set(o.lp, sr) : null;
    const hp1 = o.hp ? new OnePole().set(o.hp, sr) : null;
    const color = o.color ?? 'white';
    const endFade = Math.min(0.004, o.dur * 0.2) * sr;
    let flut: Float32Array | null = null;
    if (o.flutter) {
      flut = new Float32Array(n);
      const pts = Math.max(3, Math.round(o.dur * o.flutter.rate));
      const vals = Array.from({ length: pts + 2 }, () => this.rng.next());
      for (let i = 0; i < n; i++) {
        const x = (i / n) * pts;
        const k = Math.floor(x);
        const fr = x - k;
        const s = fr * fr * (3 - 2 * fr);
        flut[i] = 1 - o.flutter.depth * (vals[k] + (vals[k + 1] - vals[k]) * s);
      }
    }
    let amPh = this.rng.next() * TAU;
    // settle coloured noise generators
    if (color !== 'white') for (let i = 0; i < 64; i++) color === 'pink' ? nz.pink() : nz.brown();
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const tt = i / sr;
      if (type !== 'none' && (i & 15) === 0) {
        const fc = o.fcurve ? o.fcurve(x) : f0 * Math.pow(f1 / f0, x);
        svf.set(fc, q, sr);
      }
      let s = color === 'pink' ? nz.pink() : color === 'brown' ? nz.brown() : nz.white();
      if (hp1) s = hp1.hp(s);
      if (lp1) s = lp1.lp(s);
      if (type !== 'none') {
        svf.run(s);
        s = type === 'lp' ? svf.lp : type === 'hp' ? svf.hp : svf.bpn;
      }
      let e = envAt(o, tt, x, o.dur);
      if (o.am) {
        e *= 1 - o.am.depth * (0.5 + 0.5 * Math.sin(amPh));
        amPh += (TAU * o.am.rate) / sr;
      }
      if (flut) e *= flut[i];
      const rem = n - i;
      if (rem < endFade) e *= rem / endFade;
      buf[i] = s * e;
    }
    return this.place(buf, t, o.amp ?? 0.5);
  }

  /** Very short resonant noise click (transients, crackle grains, ticks). */
  click(t: number, o: { f: number; q?: number; amp?: number; dur?: number }): this {
    const sr = this.sr;
    const q = o.q ?? 1.5;
    const dur = o.dur ?? 0.003;
    const ring = Math.min(0.08, (6 * q) / (Math.PI * o.f));
    const n = Math.min(this.d.length - this.idx(t), Math.ceil((dur + ring) * sr));
    if (n <= 2) return this;
    const buf = new Float32Array(n);
    const svf = new Svf().set(o.f, q, sr);
    const ne = Math.max(2, Math.round(dur * sr));
    const k = Math.exp(-3 / ne);
    let e = 1;
    for (let i = 0; i < n; i++) {
      const x = i < ne ? this.nz.white() * e : 0;
      e *= k;
      svf.run(x);
      buf[i] = svf.bpn;
    }
    const tailFade = Math.min(n, Math.round(0.0015 * sr));
    for (let i = 0; i < tailFade; i++) buf[n - 1 - i] *= i / tailFade;
    return this.place(buf, t, o.amp ?? 0.5);
  }

  /** Many small clicks spread over `span` seconds (crackles, crunches, rattles). */
  crackle(
    t: number,
    o: { span: number; count: number; f: readonly [number, number]; q?: number; amp?: number; dur?: readonly [number, number]; skew?: number; ampPow?: number },
  ): this {
    const r = this.rng;
    const amp = o.amp ?? 0.4;
    for (let k = 0; k < o.count; k++) {
      const u = Math.pow(r.next(), o.skew ?? 1);
      const a = amp * (0.2 + 0.8 * Math.pow(r.next(), o.ampPow ?? 1.5));
      this.click(t + u * o.span, {
        f: r.range(o.f[0], o.f[1]),
        q: o.q ?? 1.4,
        amp: a,
        dur: o.dur ? r.range(o.dur[0], o.dur[1]) : r.range(0.0008, 0.003),
      });
    }
    return this;
  }

  /** Low body thump: sine with an exponential pitch drop f0 → f1. */
  thump(t: number, o: { f0: number; f1?: number; drop?: number; tau?: number; amp?: number; attack?: number; harm?: number }): this {
    const sr = this.sr;
    const f1 = o.f1 ?? o.f0 * 0.7;
    const drop = o.drop ?? 0.025;
    const tau = o.tau ?? 0.06;
    const att = o.attack ?? 0.0012;
    const amp = o.amp ?? 0.8;
    const h2 = o.harm ?? 0;
    const i0 = this.idx(t);
    const n = Math.min(this.d.length - i0, Math.ceil((att + tau * 7) * sr));
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / sr;
      const f = f1 + (o.f0 - f1) * Math.exp(-tt / drop);
      ph += (TAU * f) / sr;
      const e = tt < att ? 0.5 - 0.5 * Math.cos((Math.PI * tt) / att) : Math.exp(-(tt - att) / tau);
      this.d[i0 + i] += amp * e * (Math.sin(ph) + h2 * Math.sin(2 * ph));
    }
    return this;
  }

  /** General oscillator: harmonic series with a frequency curve, envelope and vibrato. */
  tone(t: number, o: ToneOpts): this {
    const sr = this.sr;
    const i0 = this.idx(t);
    const n = Math.min(this.d.length - i0, Math.ceil(o.dur * sr));
    if (n <= 2) return this;
    const harm = o.harm ?? [1];
    const amp = o.amp ?? 0.5;
    const rel = Math.max(1, (o.release ?? 0.008) * sr);
    const fixed = typeof o.f === 'number' ? o.f : 0;
    const fcurve = typeof o.f === 'function' ? o.f : null;
    let ph = 0;
    let vph = this.rng.next() * TAU;
    const nyq = sr * 0.45;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const tt = i / sr;
      let f = fcurve ? fcurve(x) : fixed;
      if (o.vib) {
        f *= Math.pow(2, (o.vib.depth * Math.sin(vph)) / 12);
        vph += (TAU * o.vib.rate) / sr;
      }
      ph += (TAU * f) / sr;
      if (ph > 1e4) ph %= TAU;
      let s = 0;
      for (let k = 0; k < harm.length; k++) {
        if (f * (k + 1) > nyq) break;
        s += harm[k] * Math.sin(ph * (k + 1));
      }
      let e = envAt(o, tt, x, o.dur);
      const rem = n - i;
      if (rem < rel) e *= rem / rel;
      this.d[i0 + i] += amp * e * s;
    }
    return this;
  }

  /** Pitched blip with exponential glide f0 → f1 (time constant `glide`). */
  blip(
    t: number,
    o: { f0: number; f1?: number; glide?: number; dur: number; amp?: number; attack?: number; tau?: number; harm?: readonly number[] },
  ): this {
    const f1 = o.f1 ?? o.f0;
    const g = o.glide ?? o.dur / 3;
    const dur = o.dur;
    return this.tone(t, {
      dur,
      f: (x) => f1 + (o.f0 - f1) * Math.exp((-x * dur) / g),
      amp: o.amp,
      attack: o.attack ?? 0.002,
      tau: o.tau ?? dur / 3,
      harm: o.harm,
    });
  }

  /** Water bubble: sine with rising pitch and fast decay (Minnaert-ish). */
  bubble(t: number, o: { f: number; amp?: number; rise?: number; tau?: number }): this {
    const tau = o.tau ?? 0.03;
    const rise = o.rise ?? 0.6;
    const dur = tau * 6.5;
    return this.tone(t, {
      dur,
      f: (x) => o.f * (1 + rise * Math.min(1, (x * dur) / (3 * tau))),
      amp: o.amp ?? 0.5,
      attack: 0.0012,
      tau,
      harm: [1, 0.06],
    });
  }

  /** Struck object: bank of decaying partials. */
  modal(t: number, base: number, partials: readonly Partial3[], o: { amp?: number; attack?: number; spread?: number } = {}): this {
    const amp = o.amp ?? 1;
    const i0 = this.idx(t);
    for (const [ratio, a, tau] of partials) {
      const f = base * ratio * (1 + this.rng.bi() * (o.spread ?? 0.004));
      addMode(this.d, i0, this.sr, f, a * amp, tau, o.attack ?? 0.0006);
    }
    return this;
  }

  pluck(t: number, o: PluckOpts): this {
    addPluck(this.d, this.idx(t), this.sr, this.rng, o);
    return this;
  }

  fm(t: number, o: FmOpts): this {
    addFm(this.d, this.idx(t), this.sr, o);
    return this;
  }

  mix(src: Float32Array, t: number, gain = 1): this {
    addInto(this.d, src, this.idx(t), gain);
    return this;
  }

  // In-place processing over [from, end)
  lowpass(f: number, q = 0.707, from = 0): this {
    new Biquad().lowpass(f, q, this.sr).apply(this.d, this.idx(from));
    return this;
  }
  highpass(f: number, q = 0.707, from = 0): this {
    new Biquad().highpass(f, q, this.sr).apply(this.d, this.idx(from));
    return this;
  }
  peaking(f: number, q: number, db: number): this {
    new Biquad().peaking(f, q, db, this.sr).apply(this.d);
    return this;
  }
  highshelf(f: number, db: number): this {
    new Biquad().highshelf(f, db, this.sr).apply(this.d);
    return this;
  }
  gain(g: number): this {
    for (let i = 0; i < this.d.length; i++) this.d[i] *= g;
    return this;
  }
  /** Multiplies by a raised-cosine fade over [t0, t1] (1 → 0) and zeroes everything after. */
  fadeBetween(t0: number, t1: number): this {
    const a = this.idx(t0);
    const b = Math.min(this.d.length, Math.max(a + 1, this.idx(t1)));
    for (let i = a; i < this.d.length; i++) {
      const x = i >= b ? 1 : (i - a) / (b - a);
      this.d[i] *= 0.5 + 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
    }
    return this;
  }
}
