// Recipe kit: a small context object that binds the sample rate and the
// variant's RNG to the DSP toolkit, plus reusable "sound atoms" (gunshot,
// thump, clicks, wood and metal strikes, wet squelches, bubbles …) that the
// recipes in sounds.ts combine.
import * as D from './dsp';
import type { Buf, Param, Rng, Shape, Vowel, VoiceOpts } from './dsp';

export class K {
  constructor(
    readonly sr: number,
    readonly rng: Rng,
    /** Variant index. */
    readonly v: number,
  ) {}

  n(d: number): number {
    return Math.max(1, Math.ceil(d * this.sr));
  }
  out(d: number): Buf {
    return D.buf(this.n(d));
  }
  r(a: number, b: number): number {
    return this.rng.range(a, b);
  }

  // generators
  noise(d: number): Buf {
    return D.noise(this.n(d), this.rng);
  }
  pink(d: number): Buf {
    return D.pink(this.n(d), this.rng);
  }
  brown(d: number): Buf {
    return D.brown(this.n(d), this.rng);
  }
  tone(d: number, f: Param, shape: Shape = 'sine', phase = 0, pw: Param = 0.5): Buf {
    return D.osc(this.n(d), this.sr, f, shape, phase, pw);
  }
  wander(d: number, rate: number): Buf {
    return D.wander(this.n(d), this.sr, rate, this.rng);
  }
  modal(d: number, modes: Array<[number, number, number]>): Buf {
    return D.modal(this.n(d), this.sr, modes, this.rng);
  }
  pluck(d: number, f: number, decay: number, bright: number): Buf {
    return D.pluck(this.n(d), this.sr, f, decay, bright, this.rng);
  }
  voice(d: number, o: VoiceOpts): Buf {
    return D.voice(this.n(d), this.sr, this.rng, o);
  }

  // envelopes
  perc(d: number, attack: number, decay: number, delay = 0): Buf {
    return D.perc(this.n(d), this.sr, attack, decay, delay);
  }
  env(d: number, pts: Array<[number, number]>): Buf {
    return D.env(this.n(d), this.sr, pts);
  }

  // processing (in place)
  lp(x: Buf, f: Param, q: Param = 0.707): Buf {
    return D.lp(x, this.sr, f, q);
  }
  hp(x: Buf, f: Param, q: Param = 0.707): Buf {
    return D.hp(x, this.sr, f, q);
  }
  bp(x: Buf, f: Param, q: Param = 1): Buf {
    return D.bp(x, this.sr, f, q);
  }
  peq(x: Buf, f: Param, q: Param, db: Param): Buf {
    return D.peq(x, this.sr, f, q, db);
  }
  shelf(x: Buf, type: 'lowshelf' | 'highshelf', f: number, db: number): Buf {
    return D.filter(x, this.sr, type, f, 0.707, db);
  }
  echo(x: Buf, delay: number, g: number, repeats = 1, lpHz = 2500): Buf {
    return D.echo(x, this.sr, delay, g, repeats, lpHz);
  }
  comb(x: Buf, delay: number, fb: number, mix = 0.5, damp = 0.2): Buf {
    return D.comb(x, this.sr, delay, fb, mix, damp);
  }
  /** dst += src * g at time `at` (s). */
  add(dst: Buf, src: Buf, g = 1, at = 0): Buf {
    return D.add(dst, src, g, at, this.sr);
  }
  mul = D.mul;
  gain = D.gain;
  drive = D.drive;
  warm = D.warm;
  fade(x: Buf, inMs = 1, outMs = 8): Buf {
    return D.fade(x, this.sr, inMs, outMs);
  }

  // ------------------------------------------------------------ atoms

  /** Enveloped, filtered noise burst. */
  burst(d: number, attack: number, decay: number, opts: { lp?: Param; hp?: Param; bp?: Param; q?: Param; pink?: boolean } = {}): Buf {
    const x = opts.pink ? this.pink(d) : this.noise(d);
    if (opts.bp !== undefined) this.bp(x, opts.bp, opts.q ?? 1);
    if (opts.hp !== undefined) this.hp(x, opts.hp);
    if (opts.lp !== undefined) this.lp(x, opts.lp, opts.bp === undefined ? (opts.q ?? 0.707) : 0.707);
    return this.mul(x, this.perc(d, attack, decay));
  }

  /** Sine thump with a pitch drop (kick / boom / body). */
  thump(d: number, f0: number, f1: number, decay: number, drop = 0.08): Buf {
    const x = this.tone(d, D.sweep(f0, f1, drop));
    return this.mul(x, this.perc(d, 0.001, decay));
  }

  /** Mechanical click: very short resonant noise tick. */
  click(f: number, q = 4, decay = 0.006, d = 0.05): Buf {
    const x = this.noise(d);
    this.bp(x, f, q);
    return this.mul(x, this.perc(d, 0.0003, decay));
  }

  /** Wooden knock (planks, crates). */
  wood(f: number, decay = 0.05, d = 0.3): Buf {
    const m = this.modal(d, [
      [f, decay, 1],
      [f * 2.31, decay * 0.6, 0.5],
      [f * 3.89, decay * 0.4, 0.3],
      [f * 5.3, decay * 0.25, 0.15],
    ]);
    const n = this.burst(d, 0.0004, 0.006, { bp: f * 3, q: 1.2 });
    return this.add(m, n, 0.8);
  }

  /** Metal strike (inharmonic modes). */
  metal(f: number, decay = 0.4, d = 1, bright = 1): Buf {
    const ratios = [1, 1.47, 2.09, 2.56, 3.21, 4.1, 5.43];
    const modes: Array<[number, number, number]> = ratios.map((r, i) => [f * r * this.r(0.99, 1.01), decay * Math.pow(0.78, i), Math.pow(0.7, i) * (i > 2 ? bright : 1)]);
    const m = this.modal(d, modes);
    return this.add(m, this.click(f * 3, 2, 0.003, Math.min(d, 0.05)), 0.6);
  }

  /** Wet squelch: resonant noise with a falling band (flesh hits, splats). */
  squelch(d: number, f0: number, f1: number, decay: number, q = 3): Buf {
    const x = this.noise(d);
    this.bp(x, D.sweep(f0, f1, d * 0.8), q);
    return this.mul(x, this.perc(d, 0.002, decay));
  }

  /** Water/gore bubble: a short sine chirping upward. */
  bubble(f: number, d = 0.06): Buf {
    const x = this.tone(d, D.sweep(f, f * this.r(1.4, 2.2), d));
    return this.mul(x, this.perc(d, 0.002, d * 0.35));
  }

  /** Scrape / slide (metal on metal, cloth): swept band of noise. */
  slide(d: number, f0: number, f1: number, q = 3, attack = 0.01): Buf {
    const x = this.noise(d);
    this.bp(x, D.sweep(f0, f1, d), q);
    return this.mul(x, this.env(d, [[0, 0], [attack, 1], [d * 0.7, 0.6], [d, 0]]));
  }

  /**
   * Gunshot: a sharp crack, a fast-closing blast of noise, a low body thump,
   * a rumbling tail and a slap-back echo off the ferry's hull.
   */
  gunshot(o: {
    d: number;
    crack: number;
    blastDecay: number;
    blastLp0: number;
    blastLp1: number;
    thumpF0: number;
    thumpF1: number;
    thumpDecay: number;
    thumpGain: number;
    tail: number;
    tailGain: number;
    drive: number;
    slap?: number;
    slapGain?: number;
  }): Buf {
    const { d } = o;
    const out = this.out(d);
    // Crack: ~2 ms of bright noise.
    const crack = this.burst(0.02, 0.0001, 0.0018, { hp: 1800 });
    this.add(out, crack, o.crack);
    // Blast.
    const blast = this.noise(d);
    this.lp(blast, D.sweep(o.blastLp0, o.blastLp1, o.blastDecay * 2.5), 0.8);
    this.mul(blast, this.perc(d, 0.0003, o.blastDecay));
    this.add(out, blast, 1);
    // Body.
    this.add(out, this.thump(d, o.thumpF0, o.thumpF1, o.thumpDecay, o.thumpDecay * 0.7), o.thumpGain);
    this.drive(out, o.drive);
    // Tail: pink rumble that darkens as it fades.
    const tail = this.pink(d);
    this.lp(tail, D.sweep(2200, 380, o.tail), 0.6);
    this.mul(tail, this.perc(d, 0.004, o.tail * 0.4));
    this.add(out, tail, o.tailGain, 0.004);
    if (o.slap) this.echo(out, o.slap, o.slapGain ?? 0.22, 2, 1600);
    return this.fade(out, 0.2, 30);
  }

  /** Formant groan with zombie defaults (low, creaky, breathy, wet). */
  groan(d: number, o: Partial<VoiceOpts> & { vowels: Array<[number, Vowel]>; f0: Param; amp: Param }): Buf {
    return this.voice(d, { tract: 0.88, breath: 0.22, jitter: 0.035, fry: 0.4, gurgle: 0.2, bw: 1.35, bright: 0.3, ...o });
  }

  /** Stereo spread of a mono buffer. */
  wide(x: Buf, ms = 9, side = 0.3): [Buf, Buf] {
    return D.widen(x, this.sr, ms, side);
  }
}
