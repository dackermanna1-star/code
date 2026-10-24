/**
 * Synth instruments for the jukebox songs and the combat layer.
 *
 * A Band owns persistent per-instrument buses (filters, amp sims, organ
 * leslie, piano chorus, formant bank, slap-back...) created once per song
 * session. Notes only create a few nodes (source(s) + envelope, chords share
 * one envelope) that disconnect themselves when finished, so a busy bar stays
 * cheap: in Web Audio every connected node costs render time each quantum.
 */
import { getKit, mkOsc, mkNoise, mkFilter, mkGain, mkShaper, envPerc, autoDisconnect, mtof, rand, clamp, type Kit, type Curve } from './dsp';
import { VOWELS, type Vowel } from './Voice';

export type AmpStyle = 'clean' | 'twang' | 'crunch' | 'rock' | 'metal' | 'jazz';
export type DrumStyle = 'vintage' | 'brush' | 'rock' | 'punch';

export interface BandStyle {
  amp: AmpStyle;
  lead?: AmpStyle;
  drums: DrumStyle;
  organ?: boolean;
  piano?: boolean;
  sax?: boolean;
  steel?: boolean;
  voc?: boolean;
  /** honky-tonk piano: amount of detuned chorus doubling (0..1) */
  honky?: number;
  /** slap-back echo on the lead */
  slap?: number;
}

export interface GtrOpts {
  /** palm mute: short + dark */
  mute?: boolean;
  /** bend up into the note from `bend` semitones below */
  bend?: number;
  bendT?: number;
  /** vibrato depth in cents */
  vib?: number;
  release?: number;
  /** chicken pickin': very short, clucky */
  cluck?: boolean;
  lead?: boolean;
}

/** instruments are written at "full scale": the band bus brings the mix down to ~-20 dBFS RMS */
const BAND_LEVEL = 0.16;

const AMP: Record<AmpStyle, { drive: number; curve: keyof Kit['curves']; lp: number; mid: number; midF: number; post: number; hp: number }> = {
  clean: { drive: 0.8, curve: 'soft', lp: 5500, mid: 1, midF: 1800, post: 0.9, hp: 90 },
  twang: { drive: 1.1, curve: 'warm', lp: 7000, mid: 4, midF: 2600, post: 0.8, hp: 120 },
  jazz: { drive: 0.7, curve: 'soft', lp: 2600, mid: -2, midF: 1500, post: 1.0, hp: 80 },
  crunch: { drive: 3.2, curve: 'crunch', lp: 4200, mid: 3, midF: 1300, post: 0.32, hp: 100 },
  rock: { drive: 5, curve: 'crunch', lp: 4600, mid: 3, midF: 1500, post: 0.28, hp: 110 },
  metal: { drive: 14, curve: 'heavy', lp: 5200, mid: -4, midF: 700, post: 0.22, hp: 110 },
};

export class Band {
  readonly ac: BaseAudioContext;
  readonly kit: Kit;
  readonly out: GainNode;
  readonly style: BandStyle;
  /** extra reverb send for the "wet" instruments (steel, sax, voices) */
  readonly wetOut: GainNode;
  private persistent: AudioNode[] = [];
  private lfos: AudioScheduledSourceNode[] = [];

  private kickBus!: AudioNode;
  private kickClick!: AudioNode;
  private snareBus!: AudioNode;
  private snareNoise!: AudioNode;
  private hatBus!: AudioNode;
  private rideBus!: AudioNode;
  private crashBus!: AudioNode;
  private tomBus!: AudioNode;
  private bassBus!: AudioNode;
  private gtrIn!: AudioNode;
  private leadIn!: AudioNode;
  private organIn: AudioNode | null = null;
  private pianoIn: AudioNode | null = null;
  private saxIn: AudioNode | null = null;
  private saxBreath: AudioNode | null = null;
  private steelIn: AudioNode | null = null;
  private vocIn: AudioNode | null = null;
  private vocF: BiquadFilterNode[] = [];
  private vocG: GainNode[] = [];

  constructor(ac: BaseAudioContext, out: AudioNode, style: BandStyle) {
    this.ac = ac;
    this.kit = getKit(ac);
    this.style = style;
    this.out = this.keep(mkGain(ac, BAND_LEVEL));
    this.out.connect(out);
    this.wetOut = this.keep(mkGain(ac, BAND_LEVEL));
    this.buildDrums();
    // bass
    this.bassBus = this.series(this.out, mkFilter(ac, 'lowpass', 2400, 0.7), mkFilter(ac, 'highpass', 35, 0.7));
    // guitars
    this.gtrIn = this.makeAmp(style.amp, this.out).input;
    const lead = this.makeAmp(style.lead ?? style.amp, this.out);
    this.leadIn = lead.input;
    if (style.slap) {
      // slap-back echo tapped after the lead amp (single repeat + a faint second)
      const d = this.keep(ac.createDelay(0.5));
      d.delayTime.value = 0.105;
      const fb = this.keep(mkGain(ac, 0.12));
      const lp = this.keep(mkFilter(ac, 'lowpass', 3500, 0.7));
      const mix = this.keep(mkGain(ac, style.slap));
      lead.output.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(mix);
      mix.connect(this.out);
    }
    if (style.organ) this.buildOrgan();
    if (style.piano) this.buildPiano();
    if (style.sax) {
      // body formants of a tenor sax
      const post = this.keep(mkGain(ac, 0.55));
      post.connect(this.out);
      post.connect(this.wetOut);
      this.saxIn = this.series(post, mkFilter(ac, 'peaking', 520, 1.4, 6), mkFilter(ac, 'peaking', 1450, 1.8, 4), mkShaper(ac, this.kit.curves.warm), mkFilter(ac, 'highpass', 50, 0.7), mkFilter(ac, 'lowpass', 3400, 0.8));
      this.saxBreath = this.series(post, mkFilter(ac, 'bandpass', 1800, 0.9));
    }
    if (style.steel) {
      const post = this.keep(mkGain(ac, 1.1));
      post.connect(this.out);
      post.connect(this.wetOut);
      this.steelIn = this.series(post, mkFilter(ac, 'lowpass', 2700, 0.9), mkFilter(ac, 'peaking', 1100, 1, 2));
    }
    if (style.voc) this.buildVoc();
  }

  // ------------------------------------------------------------------ persistent graph

  private keep<T extends AudioNode>(n: T): T {
    this.persistent.push(n);
    return n;
  }

  /** Chain `nodes` in order into `dest`; returns the chain input. */
  private series(dest: AudioNode, ...nodes: AudioNode[]): AudioNode {
    for (const n of nodes) this.keep(n);
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    nodes[nodes.length - 1].connect(dest);
    return nodes[0];
  }

  private lfo(type: OscillatorType, f: number): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(this.ac.currentTime);
    this.lfos.push(o);
    return o;
  }

  private buildDrums(): void {
    const ac = this.ac;
    const punchy = this.style.drums === 'rock' || this.style.drums === 'punch';
    const brush = this.style.drums === 'brush';
    const drums = this.keep(mkGain(ac, 1));
    drums.connect(this.out);
    this.kickBus = punchy ? this.series(drums, mkShaper(ac, this.kit.curves.soft)) : this.series(drums, mkFilter(ac, 'lowpass', 2200, 0.7));
    this.kickClick = this.series(drums, mkFilter(ac, 'bandpass', punchy ? 3500 : 2500, 1.2));
    this.snareBus = drums;
    this.tomBus = drums;
    this.snareNoise = this.series(drums, mkFilter(ac, 'highpass', brush ? 1500 : 900, 0.7), mkFilter(ac, 'peaking', 3800, 0.8, 3), mkFilter(ac, 'lowpass', brush ? 7000 : 10000, 0.6));
    this.hatBus = this.series(drums, mkFilter(ac, 'highpass', 7000, 0.8), mkFilter(ac, 'lowpass', 12500, 0.6));
    this.rideBus = this.series(drums, mkFilter(ac, 'highpass', 2800, 0.6), mkFilter(ac, 'peaking', 5500, 0.7, 2), mkFilter(ac, 'lowpass', 11000, 0.6));
    this.crashBus = this.series(drums, mkFilter(ac, 'highpass', 3200, 0.6), mkFilter(ac, 'lowpass', 11000, 0.6));
  }

  private makeAmp(style: AmpStyle, out: AudioNode): { input: AudioNode; output: AudioNode } {
    const ac = this.ac;
    const a = AMP[style];
    const post = this.keep(mkGain(ac, a.post));
    post.connect(out);
    const input = this.series(
      post,
      mkFilter(ac, 'highpass', a.hp, 0.7),
      mkGain(ac, a.drive),
      mkShaper(ac, this.kit.curves[a.curve] as Curve, a.drive > 4 ? '2x' : 'none'),
      mkFilter(ac, 'highpass', 60, 0.7),
      mkFilter(ac, 'peaking', a.midF, 0.9, a.mid),
      mkFilter(ac, 'lowpass', a.lp, 0.8),
      mkFilter(ac, 'lowpass', a.lp * 1.6, 0.5),
    );
    return { input, output: post };
  }

  private buildOrgan(): void {
    // simple leslie: modulated delay + tremolo, a touch of preamp grit
    const ac = this.ac;
    const post = this.keep(mkGain(ac, 1.0));
    post.connect(this.out);
    const trem = this.keep(mkGain(ac, 0.85));
    trem.connect(this.series(post, mkShaper(ac, this.kit.curves.soft), mkFilter(ac, 'lowpass', 4200, 0.6)));
    const inp = this.keep(mkGain(ac, 1));
    const dry = this.keep(mkGain(ac, 0.7));
    const dl = this.keep(ac.createDelay(0.05));
    dl.delayTime.value = 0.004;
    const wet = this.keep(mkGain(ac, 0.55));
    const lfo = this.lfo('sine', 6.1);
    const depth = this.keep(mkGain(ac, 0.0011));
    const tl = this.keep(mkGain(ac, 0.13));
    lfo.connect(depth);
    depth.connect(dl.delayTime);
    lfo.connect(tl);
    tl.connect(trem.gain);
    inp.connect(dry);
    inp.connect(dl);
    dl.connect(wet);
    dry.connect(trem);
    wet.connect(trem);
    this.organIn = inp;
  }

  private buildPiano(): void {
    const ac = this.ac;
    const inp = this.keep(mkGain(ac, 1));
    const outF = this.series(this.out, mkFilter(ac, 'lowpass', 7000, 0.6), mkFilter(ac, 'highpass', 70, 0.7));
    const h = this.style.honky ?? 0;
    if (h > 0) {
      // honky-tonk: a slowly drifting, slightly detuned doubling instead of a second oscillator per note
      const dry = this.keep(mkGain(ac, 1));
      const dl = this.keep(ac.createDelay(0.05));
      dl.delayTime.value = 0.012;
      const wet = this.keep(mkGain(ac, 0.75 * h));
      const lfo = this.lfo('sine', 0.9);
      const depth = this.keep(mkGain(ac, 0.0015));
      lfo.connect(depth);
      depth.connect(dl.delayTime);
      inp.connect(dry);
      inp.connect(dl);
      dl.connect(wet);
      dry.connect(outF);
      wet.connect(outF);
    } else inp.connect(outF);
    this.pianoIn = inp;
  }

  private buildVoc(): void {
    const ac = this.ac;
    const post = this.keep(mkGain(ac, 2.1));
    post.connect(this.out);
    post.connect(this.wetOut);
    const sum = this.keep(mkGain(ac, 1));
    sum.connect(this.series(post, mkFilter(ac, 'lowpass', 3600, 0.6)));
    const inp = this.keep(mkGain(ac, 1));
    const v = VOWELS.oo;
    for (let i = 0; i < 3; i++) {
      const f = this.keep(mkFilter(ac, 'bandpass', v.f[i] * 1.12, [5, 8, 10][i]));
      const g = this.keep(mkGain(ac, v.g[i]));
      inp.connect(f);
      f.connect(g);
      g.connect(sum);
      this.vocF.push(f);
      this.vocG.push(g);
    }
    inp.connect(this.series(sum, mkFilter(ac, 'lowpass', 500, 0.7), mkGain(ac, 0.25)));
    this.vocIn = inp;
  }

  /** Stop LFOs and disconnect the persistent graph at time `at`. */
  dispose(at: number): void {
    for (const l of this.lfos) {
      try {
        l.stop(at);
      } catch {
        /* already stopped */
      }
    }
    const nodes = this.persistent;
    this.persistent = [];
    this.lfos = [];
    // offline contexts render after scheduling: never disconnect there
    if (!('close' in this.ac) || typeof setTimeout !== 'function') return;
    const delay = Math.max(0, (at - this.ac.currentTime) * 1000) + 150;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, delay);
  }

  // ------------------------------------------------------------------ drums

  kick(t: number, vel: number): void {
    const ac = this.ac;
    const punchy = this.style.drums === 'rock' || this.style.drums === 'punch';
    const tau = punchy ? 0.08 : 0.095;
    const o = mkOsc(ac, 'sine', punchy ? 155 : 112, t, t + tau * 6 + 0.01);
    o.frequency.exponentialRampToValueAtTime(punchy ? 47 : 52, t + (punchy ? 0.045 : 0.06));
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel, 0.002, tau);
    o.connect(g);
    g.connect(this.kickBus);
    autoDisconnect(o, g);
    const n = mkNoise(ac, this.kit.white, t, t + 0.03);
    const ng = mkGain(ac, 0);
    envPerc(ng.gain, t, vel * (punchy ? 0.55 : 0.25), 0.0005, 0.004);
    n.connect(ng);
    ng.connect(this.kickClick);
    autoDisconnect(n, ng);
  }

  snare(t: number, vel: number, kind: 'snare' | 'rim' | 'ghost' | 'brush' = 'snare'): void {
    const ac = this.ac;
    if (kind === 'rim') {
      // side stick: woody "tock"
      const o = mkOsc(ac, 'triangle', rand(780, 840), t, t + 0.08);
      const g = mkGain(ac, 0);
      envPerc(g.gain, t, vel * 0.8, 0.0008, 0.012);
      o.connect(g);
      g.connect(this.snareBus);
      autoDisconnect(o, g);
      const n = mkNoise(ac, this.kit.white, t, t + 0.06);
      const ng = mkGain(ac, 0);
      envPerc(ng.gain, t, vel * 0.8, 0.0005, 0.008);
      n.connect(ng);
      ng.connect(this.snareNoise);
      autoDisconnect(n, ng);
      return;
    }
    const rock = this.style.drums === 'rock' || this.style.drums === 'punch';
    const brush = kind === 'brush' || (this.style.drums === 'brush' && kind !== 'ghost');
    const v = kind === 'ghost' ? vel * 0.35 : vel;
    const o = mkOsc(ac, 'triangle', rock ? 195 : 185, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(rock ? 165 : 160, t + 0.03);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, v * (brush ? 0.55 : 1.2), 0.001, rock ? 0.05 : 0.04);
    o.connect(g);
    g.connect(this.snareBus);
    autoDisconnect(o, g);
    const tau = brush ? 0.11 : rock ? 0.085 : 0.07;
    const n = mkNoise(ac, this.kit.white, t, t + tau * 6 + 0.02);
    const ng = mkGain(ac, 0);
    envPerc(ng.gain, t, v * (brush ? 1.1 : 1.9), brush ? 0.012 : 0.001, tau);
    n.connect(ng);
    ng.connect(this.snareNoise);
    autoDisconnect(n, ng);
  }

  hat(t: number, vel: number, open = false): void {
    const tau = open ? 0.17 : rand(0.018, 0.028);
    const n = mkNoise(this.ac, this.kit.white, t, t + tau * 6 + 0.02);
    const g = mkGain(this.ac, 0);
    envPerc(g.gain, t, vel * 1.6, 0.0006, tau);
    n.connect(g);
    g.connect(this.hatBus);
    autoDisconnect(n, g);
  }

  ride(t: number, vel: number, bell = false): void {
    const ac = this.ac;
    const n = mkNoise(ac, this.kit.white, t, t + 1.7);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel * 0.55, 0.001, 0.28);
    n.connect(g);
    g.connect(this.rideBus);
    autoDisconnect(n, g);
    // the "ping": two inharmonic partials sharing one envelope
    const f = bell ? 2350 : 3050;
    const pg = mkGain(ac, 0);
    envPerc(pg.gain, t, vel * 0.22 * (bell ? 1.6 : 1), 0.0006, 0.19);
    const o1 = mkOsc(ac, 'sine', f, t, t + 1.2);
    const o2 = mkOsc(ac, 'sine', f * 1.48, t, t + 1.2);
    const o2g = mkGain(ac, 0.5);
    o1.connect(pg);
    o2.connect(o2g);
    o2g.connect(pg);
    pg.connect(this.rideBus);
    autoDisconnect(o1, pg, o2g);
  }

  crash(t: number, vel: number): void {
    const ac = this.ac;
    const n = mkNoise(ac, this.kit.white, t, t + 3.8);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel * 0.45, 0.002, 0.6);
    n.connect(g);
    g.connect(this.crashBus);
    autoDisconnect(n, g);
    const mg = mkGain(ac, 0);
    envPerc(mg.gain, t, vel * 0.05, 0.002, 0.45);
    mg.connect(this.crashBus);
    let first: OscillatorNode | null = null;
    for (const f of [341, 497, 763]) {
      const o = mkOsc(ac, 'square', f * rand(0.98, 1.02), t, t + 2.8);
      o.connect(mg);
      first ??= o;
    }
    autoDisconnect(first!, mg);
  }

  tom(t: number, f: number, vel: number): void {
    const ac = this.ac;
    const o = mkOsc(ac, 'sine', f * 1.25, t, t + 0.8);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel * 0.8, 0.002, 0.12);
    o.connect(g);
    g.connect(this.tomBus);
    autoDisconnect(o, g);
    const n = mkNoise(ac, this.kit.white, t, t + 0.1);
    const ng = mkGain(ac, 0);
    envPerc(ng.gain, t, vel * 0.2, 0.001, 0.012);
    n.connect(ng);
    ng.connect(this.snareNoise);
    autoDisconnect(n, ng);
  }

  // ------------------------------------------------------------------ bass

  bass(t: number, midi: number, dur: number, vel: number, kind: 'finger' | 'pick' | 'upright' = 'finger'): void {
    const ac = this.ac;
    const f = mtof(midi);
    const upright = kind === 'upright';
    const o = mkOsc(ac, upright ? 'triangle' : 'sawtooth', f, t, t + dur + 0.25);
    const lp = mkFilter(ac, 'lowpass', f * 4, kind === 'pick' ? 2.2 : 1.1);
    const c0 = Math.min(kind === 'pick' ? f * 16 : upright ? f * 7 : f * 9, 4500);
    lp.frequency.setValueAtTime(c0, t);
    lp.frequency.setTargetAtTime(Math.max(f * 2.2, 140), t + 0.004, kind === 'pick' ? 0.07 : 0.1);
    const g = mkGain(ac, 0);
    const v = vel * 0.95;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + (upright ? 0.007 : 0.004));
    if (upright) g.gain.setTargetAtTime(0, t + 0.01, clamp(dur, 0.12, 0.6) * 0.55);
    else g.gain.setTargetAtTime(v * 0.62, t + 0.01, 0.12);
    g.gain.setTargetAtTime(0, t + dur, 0.035);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.bassBus);
    autoDisconnect(o, lp, g);
  }

  // ------------------------------------------------------------------ guitars

  /** One or more simultaneous notes (dyad / power chord) sharing a pluck filter + envelope. */
  dyad(t: number, midis: number[], dur: number, vel: number, o: GtrOpts = {}): void {
    const ac = this.ac;
    const lowest = Math.min(...midis);
    const f = mtof(lowest);
    const dark = o.mute || o.cluck;
    const end = t + dur + (dark ? 0.2 : 0.5);
    const lp = mkFilter(ac, 'lowpass', 1000, o.mute ? 1.4 : 1.0);
    lp.frequency.setValueAtTime(Math.min(f * (dark ? 6 : 14), 7000), t);
    lp.frequency.setTargetAtTime(Math.min(f * (dark ? 2.5 : 5), 3500), t + 0.002, dark ? 0.03 : 0.22);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    if (o.cluck) g.gain.setTargetAtTime(0, t + 0.004, 0.025);
    else if (o.mute) g.gain.setTargetAtTime(0, t + 0.004, 0.055);
    else {
      g.gain.setTargetAtTime(vel * 0.45, t + 0.005, 0.35);
      g.gain.setTargetAtTime(0, t + dur, o.release ?? 0.06);
    }
    lp.connect(g);
    g.connect(o.lead ? this.leadIn : this.gtrIn);
    let first: OscillatorNode | null = null;
    for (const m of midis) {
      const d0 = rand(-5, 5);
      const osc = mkOsc(ac, 'sawtooth', mtof(m), t, end, d0);
      if (o.bend && m === lowest) {
        osc.detune.setValueAtTime(d0 - o.bend * 100, t);
        osc.detune.linearRampToValueAtTime(d0, t + (o.bendT ?? 0.12));
      }
      osc.connect(lp);
      first ??= osc;
    }
    if (o.vib && first) {
      const l = mkOsc(ac, 'sine', rand(5.2, 6.2), t, end);
      const lg = mkGain(ac, 0);
      lg.gain.setValueAtTime(0, t + Math.min(0.15, dur * 0.3));
      lg.gain.linearRampToValueAtTime(o.vib, t + Math.min(0.4, dur * 0.7));
      l.connect(lg);
      lg.connect(first.detune);
      autoDisconnect(l, lg);
    }
    if (first) autoDisconnect(first, lp, g);
  }

  /** Single guitar note. */
  gtr(t: number, midi: number, dur: number, vel: number, o: GtrOpts = {}): void {
    this.dyad(t, [midi], dur, vel, o);
  }

  /** Strummed chord (down = low to high). */
  strum(t: number, midis: number[], dur: number, vel: number, down = true, spread = 0.011, o: GtrOpts = {}): void {
    const notes = down ? midis : [...midis].reverse();
    notes.forEach((m, i) => this.dyad(t + i * spread * rand(0.8, 1.2), [m], dur - i * spread, vel * (1 - i * 0.05), o));
  }

  // ------------------------------------------------------------------ keys

  organ(t: number, midis: number[], dur: number, vel: number): void {
    if (!this.organIn) return;
    const ac = this.ac;
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.setValueAtTime(vel, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    g.connect(this.organIn);
    let first: OscillatorNode | null = null;
    for (const m of midis) {
      const o = mkOsc(ac, this.kit.waves.organ, mtof(m) / 2, t, t + dur + 0.08, rand(-3, 3));
      o.connect(g);
      first ??= o;
    }
    if (first) autoDisconnect(first, g);
    // key click
    const n = mkNoise(ac, this.kit.white, t, t + 0.02);
    const ng = mkGain(ac, 0);
    envPerc(ng.gain, t, vel * 0.08, 0.0005, 0.002);
    n.connect(ng);
    ng.connect(this.organIn);
    autoDisconnect(n, ng);
  }

  /** Piano notes struck together (one shared hammer filter + decay). */
  chordPiano(t: number, midis: number[], dur: number, vel: number, roll = 0): void {
    if (!this.pianoIn || !midis.length) return;
    if (roll > 0) {
      midis.forEach((m, i) => this.chordPiano(t + i * roll, [m], dur, vel));
      return;
    }
    const ac = this.ac;
    const mid = midis[Math.floor(midis.length / 2)];
    const f = mtof(mid);
    const decay = clamp(2.4 - (mid - 48) * 0.04, 0.35, 2.6);
    const end = t + Math.min(dur, decay * 2) + 0.3;
    const lp = mkFilter(ac, 'lowpass', 1000, 0.5);
    lp.frequency.setValueAtTime(Math.min(f * (4 + 9 * vel), 9000), t);
    lp.frequency.setTargetAtTime(Math.min(f * 2.5, 3500), t + 0.003, 0.3);
    const g = mkGain(ac, 0);
    const v = vel / Math.sqrt(midis.length);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 1.4, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.004, decay * 0.32);
    g.gain.setTargetAtTime(0, t + dur, 0.07);
    lp.connect(g);
    g.connect(this.pianoIn);
    let first: OscillatorNode | null = null;
    for (const m of midis) {
      const o = mkOsc(ac, this.kit.waves.piano, mtof(m), t, end, rand(-2, 2));
      o.connect(lp);
      first ??= o;
    }
    autoDisconnect(first!, lp, g);
  }

  piano(t: number, midi: number, dur: number, vel: number): void {
    this.chordPiano(t, [midi], dur, vel);
  }

  // ------------------------------------------------------------------ leads

  sax(t: number, midi: number, dur: number, vel: number, glide = 0, vib = 16): void {
    if (!this.saxIn || !this.saxBreath) return;
    const ac = this.ac;
    const f = mtof(midi);
    const end = t + dur + 0.25;
    const o = mkOsc(ac, 'sawtooth', f, t, end);
    if (glide) {
      o.frequency.setValueAtTime(f * Math.pow(2, -glide / 12), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.075);
    }
    if (vib && dur > 0.3) {
      const l = mkOsc(ac, 'sine', rand(4.8, 5.6), t, end);
      const lg = mkGain(ac, 0);
      lg.gain.setValueAtTime(0, t + Math.min(0.25, dur * 0.4));
      lg.gain.linearRampToValueAtTime(vib, t + Math.min(0.6, dur * 0.85));
      l.connect(lg);
      lg.connect(o.detune);
      autoDisconnect(l, lg);
    }
    const lp = mkFilter(ac, 'lowpass', f * 3, 0.8);
    lp.frequency.setValueAtTime(f * 1.8, t);
    lp.frequency.linearRampToValueAtTime(Math.min(f * 6, 4200), t + 0.06);
    lp.frequency.setTargetAtTime(Math.min(f * 4, 3200), t + 0.1, 0.3);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.035);
    g.gain.setTargetAtTime(vel * 0.78, t + 0.05, 0.3);
    g.gain.setTargetAtTime(0, t + dur, 0.05);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.saxIn);
    autoDisconnect(o, lp, g);
    const n = mkNoise(ac, this.kit.white, t, end);
    const ng = mkGain(ac, 0);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(vel * 0.35, t + 0.02);
    ng.gain.setTargetAtTime(vel * 0.08, t + 0.03, 0.05);
    ng.gain.setTargetAtTime(0, t + dur, 0.05);
    n.connect(ng);
    ng.connect(this.saxBreath);
    autoDisconnect(n, ng);
  }

  /** Pedal steel: volume-pedal swell, slide in from `slide` semitones, slow vibrato. */
  steel(t: number, midis: number[], dur: number, vel: number, slide = 0): void {
    if (!this.steelIn) return;
    const ac = this.ac;
    const end = t + dur + 0.8;
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.22);
    g.gain.setTargetAtTime(vel * 0.7, t + 0.25, 0.8);
    g.gain.setTargetAtTime(0, t + dur, 0.22);
    g.connect(this.steelIn);
    const l = mkOsc(ac, 'sine', 5, t, end);
    const lg = mkGain(ac, 0);
    lg.gain.setValueAtTime(0, t + 0.3);
    lg.gain.linearRampToValueAtTime(9, t + 0.8);
    l.connect(lg);
    autoDisconnect(l, lg);
    let first: OscillatorNode | null = null;
    for (const m of midis) {
      const f = mtof(m);
      const o = mkOsc(ac, 'sawtooth', f, t, end);
      if (slide) {
        const fs = f * Math.pow(2, slide / 12);
        o.frequency.setValueAtTime(fs, t);
        o.frequency.setValueAtTime(fs, t + 0.1);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.42);
      }
      lg.connect(o.detune);
      o.connect(g);
      first ??= o;
    }
    if (first) autoDisconnect(first, g);
  }

  /** Backing vocal chord on a shared formant bank. */
  ooh(t: number, midis: number[], dur: number, vel: number, vowel: Vowel = 'oo', att = 0.18): void {
    if (!this.vocIn) return;
    const ac = this.ac;
    const v = VOWELS[vowel];
    for (let i = 0; i < 3; i++) {
      this.vocF[i].frequency.setTargetAtTime(v.f[i] * 1.12, t, 0.06);
      this.vocG[i].gain.setTargetAtTime(v.g[i], t, 0.06);
    }
    const end = t + dur + 0.6;
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + att);
    g.gain.setTargetAtTime(vel * 0.85, t + att, 0.5);
    g.gain.setTargetAtTime(0, t + dur, Math.min(0.15, att + 0.05));
    g.connect(this.vocIn);
    let first: OscillatorNode | null = null;
    for (const m of midis) {
      const o = mkOsc(ac, this.kit.waves.glottal, mtof(m), t, end, rand(-7, 7));
      // each singer gets an own vibrato
      const l = mkOsc(ac, 'sine', rand(4.8, 5.8), t, end);
      const lg = mkGain(ac, 0);
      lg.gain.setValueAtTime(0, t + 0.15);
      lg.gain.linearRampToValueAtTime(rand(10, 18), t + 0.6);
      l.connect(lg);
      lg.connect(o.detune);
      autoDisconnect(l, lg);
      o.connect(g);
      first ??= o;
    }
    if (first) autoDisconnect(first, g);
  }
}
