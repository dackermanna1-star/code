/**
 * Synth instruments for the jukebox songs and the combat layer.
 *
 * A Band owns persistent per-instrument buses (filters, amp sims, organ
 * leslie, formant bank, slap-back...) created once per song session; notes only
 * create a couple of nodes (source(s) + envelope) that connect into those
 * buses, so a busy bar stays cheap.
 */
import { getKit, mkOsc, mkNoise, mkFilter, mkGain, mkShaper, envPerc, mtof, rand, clamp, type Kit, type Curve } from './dsp';
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
  /** piano detune between the two strings (cents): honky-tonk ~12 */
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
  private persistent: AudioNode[] = [];
  private lfos: AudioScheduledSourceNode[] = [];

  private kickBus: AudioNode;
  private kickClick: AudioNode;
  private snareBus: AudioNode;
  private snareNoise: AudioNode;
  private hatBus: AudioNode;
  private rideBus: AudioNode;
  private crashBus: AudioNode;
  private tomBus: AudioNode;
  private bassBus: AudioNode;
  private gtrIn: AudioNode;
  private leadIn: AudioNode;
  private organIn: AudioNode | null = null;
  private pianoIn: AudioNode | null = null;
  private saxIn: AudioNode | null = null;
  private saxBreath: AudioNode | null = null;
  private steelIn: AudioNode | null = null;
  private vocIn: AudioNode | null = null;
  private vocF: BiquadFilterNode[] = [];
  private vocG: GainNode[] = [];
  /** extra reverb send for the "wet" instruments (steel, sax, voices) */
  readonly wetOut: GainNode;

  constructor(ac: BaseAudioContext, out: AudioNode, style: BandStyle) {
    this.ac = ac;
    this.kit = getKit(ac);
    this.style = style;
    this.out = this.keep(mkGain(ac, 1));
    this.out.connect(out);
    this.wetOut = this.keep(mkGain(ac, 1));
    const now = ac.currentTime;
    const punchy = style.drums === 'rock' || style.drums === 'punch';

    // ---- drums
    const drums = this.keep(mkGain(ac, 1));
    drums.connect(this.out);
    if (punchy) {
      const pre = this.keep(mkGain(ac, 0.9));
      const ws = this.keep(mkShaper(ac, this.kit.curves.soft));
      const post = this.keep(mkGain(ac, 1));
      pre.connect(ws);
      ws.connect(post);
      post.connect(drums);
      this.kickBus = pre;
    } else {
      const lp = this.keep(mkFilter(ac, 'lowpass', 2200, 0.7));
      lp.connect(drums);
      this.kickBus = lp;
    }
    const kc = this.keep(mkFilter(ac, 'bandpass', punchy ? 3500 : 2500, 1.2));
    kc.connect(drums);
    this.kickClick = kc;
    this.snareBus = drums;
    const sn1 = this.keep(mkFilter(ac, 'highpass', style.drums === 'brush' ? 1500 : 900, 0.7));
    const sn2 = this.keep(mkFilter(ac, 'peaking', 3800, 0.8, 3));
    const sn3 = this.keep(mkFilter(ac, 'lowpass', style.drums === 'brush' ? 7000 : 10000, 0.6));
    sn1.connect(sn2);
    sn2.connect(sn3);
    sn3.connect(drums);
    this.snareNoise = sn1;
    const h1 = this.keep(mkFilter(ac, 'highpass', 7000, 0.8));
    const h2 = this.keep(mkFilter(ac, 'lowpass', 12500, 0.6));
    h1.connect(h2);
    h2.connect(drums);
    this.hatBus = h1;
    const r1 = this.keep(mkFilter(ac, 'highpass', 2800, 0.6));
    const r2 = this.keep(mkFilter(ac, 'peaking', 5500, 0.7, 2));
    const r3 = this.keep(mkFilter(ac, 'lowpass', 11000, 0.6));
    r1.connect(r2);
    r2.connect(r3);
    r3.connect(drums);
    this.rideBus = r1;
    const c1 = this.keep(mkFilter(ac, 'highpass', 3200, 0.6));
    const c2 = this.keep(mkFilter(ac, 'lowpass', 11000, 0.6));
    c1.connect(c2);
    c2.connect(drums);
    this.crashBus = c1;
    this.tomBus = drums;

    // ---- bass
    const bl = this.keep(mkFilter(ac, 'lowpass', 2400, 0.7));
    const bh = this.keep(mkFilter(ac, 'highpass', 35, 0.7));
    bl.connect(bh);
    bh.connect(this.out);
    this.bassBus = bl;

    // ---- guitars
    this.gtrIn = this.makeAmp(style.amp, this.out);
    const leadAmp = this.makeAmp(style.lead ?? style.amp, this.out);
    this.leadIn = leadAmp;
    if (style.slap) {
      // slap-back echo, taken from a tap after the lead amp input
      const d = this.keep(ac.createDelay(0.5));
      d.delayTime.value = 0.105;
      const fb = this.keep(mkGain(ac, 0.12));
      const mix = this.keep(mkGain(ac, style.slap));
      const lp = this.keep(mkFilter(ac, 'lowpass', 3500, 0.7));
      leadAmp.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(mix);
      mix.connect(this.out);
    }

    // ---- organ with a simple leslie (modulated delay + tremolo)
    if (style.organ) {
      const inp = this.keep(mkGain(ac, 1));
      const dry = this.keep(mkGain(ac, 0.7));
      const dl = this.keep(ac.createDelay(0.05));
      dl.delayTime.value = 0.004;
      const wet = this.keep(mkGain(ac, 0.55));
      const lfo = this.lfo('sine', 6.1, now);
      const depth = this.keep(mkGain(ac, 0.0011));
      lfo.connect(depth);
      depth.connect(dl.delayTime);
      const trem = this.keep(mkGain(ac, 0.85));
      const tl = this.keep(mkGain(ac, 0.13));
      lfo.connect(tl);
      tl.connect(trem.gain);
      const lp = this.keep(mkFilter(ac, 'lowpass', 4200, 0.6));
      const ws = this.keep(mkShaper(ac, this.kit.curves.soft));
      const post = this.keep(mkGain(ac, 0.8));
      inp.connect(dry);
      inp.connect(dl);
      dl.connect(wet);
      dry.connect(trem);
      wet.connect(trem);
      trem.connect(ws);
      ws.connect(lp);
      lp.connect(post);
      post.connect(this.out);
      this.organIn = inp;
    }
    if (style.piano) {
      const lp = this.keep(mkFilter(ac, 'lowpass', 7000, 0.6));
      const hp = this.keep(mkFilter(ac, 'highpass', 70, 0.7));
      lp.connect(hp);
      hp.connect(this.out);
      this.pianoIn = lp;
    }
    if (style.sax) {
      // body formants of a tenor sax
      const p1 = this.keep(mkFilter(ac, 'peaking', 520, 1.4, 6));
      const p2 = this.keep(mkFilter(ac, 'peaking', 1450, 1.8, 4));
      const lp = this.keep(mkFilter(ac, 'lowpass', 3400, 0.8));
      const ws = this.keep(mkShaper(ac, this.kit.curves.warm));
      const post = this.keep(mkGain(ac, 0.55));
      p1.connect(p2);
      p2.connect(ws);
      ws.connect(lp);
      lp.connect(post);
      post.connect(this.out);
      post.connect(this.wetOut);
      this.saxIn = p1;
      const br = this.keep(mkFilter(ac, 'bandpass', 1800, 0.9));
      br.connect(post);
      this.saxBreath = br;
    }
    if (style.steel) {
      const lp = this.keep(mkFilter(ac, 'lowpass', 2700, 0.9));
      const pk = this.keep(mkFilter(ac, 'peaking', 1100, 1, 2));
      const post = this.keep(mkGain(ac, 0.7));
      lp.connect(pk);
      pk.connect(post);
      post.connect(this.out);
      post.connect(this.wetOut);
      this.steelIn = lp;
    }
    if (style.voc) {
      const inp = this.keep(mkGain(ac, 1));
      const sum = this.keep(mkGain(ac, 1));
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
      const chest = this.keep(mkFilter(ac, 'lowpass', 500, 0.7));
      const cg = this.keep(mkGain(ac, 0.25));
      inp.connect(chest);
      chest.connect(cg);
      cg.connect(sum);
      const lp = this.keep(mkFilter(ac, 'lowpass', 3600, 0.6));
      const post = this.keep(mkGain(ac, 1.6));
      sum.connect(lp);
      lp.connect(post);
      post.connect(this.out);
      post.connect(this.wetOut);
      this.vocIn = inp;
    }
  }

  private keep<T extends AudioNode>(n: T): T {
    this.persistent.push(n);
    return n;
  }

  private lfo(type: OscillatorType, f: number, t: number): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(t);
    this.lfos.push(o);
    return o;
  }

  private makeAmp(style: AmpStyle, out: AudioNode): AudioNode {
    const ac = this.ac;
    const a = AMP[style];
    const hp = this.keep(mkFilter(ac, 'highpass', a.hp, 0.7));
    const pre = this.keep(mkGain(ac, a.drive));
    const ws = this.keep(mkShaper(ac, this.kit.curves[a.curve] as Curve, a.drive > 2 ? '2x' : 'none'));
    const dc = this.keep(mkFilter(ac, 'highpass', 60, 0.7));
    const mid = this.keep(mkFilter(ac, 'peaking', a.midF, 0.9, a.mid));
    const cab1 = this.keep(mkFilter(ac, 'lowpass', a.lp, 0.8));
    const cab2 = this.keep(mkFilter(ac, 'lowpass', a.lp * 1.6, 0.5));
    const post = this.keep(mkGain(ac, a.post));
    hp.connect(pre);
    pre.connect(ws);
    ws.connect(dc);
    dc.connect(mid);
    mid.connect(cab1);
    cab1.connect(cab2);
    cab2.connect(post);
    post.connect(out);
    return hp;
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
    const end = t + tau * 6 + 0.01;
    const o = mkOsc(ac, 'sine', punchy ? 155 : 112, t, end);
    o.frequency.exponentialRampToValueAtTime(punchy ? 47 : 52, t + (punchy ? 0.045 : 0.06));
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel, 0.002, tau);
    o.connect(g);
    g.connect(this.kickBus);
    const n = mkNoise(ac, this.kit.white, t, t + 0.03);
    const ng = mkGain(ac, 0);
    envPerc(ng.gain, t, vel * (punchy ? 0.55 : 0.25), 0.0005, 0.004);
    n.connect(ng);
    ng.connect(this.kickClick);
  }

  snare(t: number, vel: number, kind: 'snare' | 'rim' | 'ghost' | 'brush' = 'snare'): void {
    const ac = this.ac;
    if (kind === 'rim') {
      // side stick: woody "tock"
      const o = mkOsc(ac, 'triangle', rand(780, 840), t, t + 0.08);
      const g = mkGain(ac, 0);
      envPerc(g.gain, t, vel * 0.5, 0.0008, 0.012);
      o.connect(g);
      g.connect(this.snareBus);
      const n = mkNoise(ac, this.kit.white, t, t + 0.06);
      const ng = mkGain(ac, 0);
      envPerc(ng.gain, t, vel * 0.5, 0.0005, 0.008);
      n.connect(ng);
      ng.connect(this.snareNoise);
      return;
    }
    const rock = this.style.drums === 'rock' || this.style.drums === 'punch';
    const brush = kind === 'brush' || (this.style.drums === 'brush' && kind !== 'ghost');
    const v = kind === 'ghost' ? vel * 0.35 : vel;
    const o = mkOsc(ac, 'triangle', rock ? 195 : 185, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(rock ? 165 : 160, t + 0.03);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, v * (brush ? 0.25 : 0.55), 0.001, rock ? 0.05 : 0.04);
    o.connect(g);
    g.connect(this.snareBus);
    const n = mkNoise(ac, this.kit.white, t, t + 0.75);
    const ng = mkGain(ac, 0);
    const tau = brush ? 0.11 : rock ? 0.085 : 0.07;
    envPerc(ng.gain, t, v * (brush ? 0.5 : 0.85), brush ? 0.012 : 0.001, tau);
    n.connect(ng);
    ng.connect(this.snareNoise);
  }

  hat(t: number, vel: number, open = false): void {
    const ac = this.ac;
    const tau = open ? 0.17 : rand(0.018, 0.028);
    const n = mkNoise(ac, this.kit.white, t, t + tau * 6 + 0.02);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel * 0.55, 0.0006, tau);
    n.connect(g);
    g.connect(this.hatBus);
  }

  ride(t: number, vel: number, bell = false): void {
    const ac = this.ac;
    const n = mkNoise(ac, this.kit.white, t, t + 1.8);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel * 0.22, 0.001, 0.28);
    n.connect(g);
    g.connect(this.rideBus);
    // the "ping"
    const f = bell ? 2350 : 3050;
    for (const [r, a, tau] of [[1, 0.09, 0.22], [1.48, 0.05, 0.13], [2.11, 0.035, 0.08]] as const) {
      const o = mkOsc(ac, 'sine', f * r, t, t + tau * 6 + 0.01);
      const og = mkGain(ac, 0);
      envPerc(og.gain, t, vel * a * (bell ? 1.6 : 1), 0.0006, tau);
      o.connect(og);
      og.connect(this.rideBus);
    }
  }

  crash(t: number, vel: number): void {
    const ac = this.ac;
    const n = mkNoise(ac, this.kit.white, t, t + 4);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel * 0.45, 0.002, 0.6);
    n.connect(g);
    g.connect(this.crashBus);
    const mg = mkGain(ac, 0);
    envPerc(mg.gain, t, vel * 0.05, 0.002, 0.45);
    mg.connect(this.crashBus);
    for (const f of [341, 497, 763, 1032]) {
      const o = mkOsc(ac, 'square', f * rand(0.98, 1.02), t, t + 3);
      o.connect(mg);
    }
  }

  tom(t: number, f: number, vel: number): void {
    const ac = this.ac;
    const o = mkOsc(ac, 'sine', f * 1.25, t, t + 0.8);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = mkGain(ac, 0);
    envPerc(g.gain, t, vel * 0.8, 0.002, 0.12);
    o.connect(g);
    g.connect(this.tomBus);
    const n = mkNoise(ac, this.kit.white, t, t + 0.1);
    const ng = mkGain(ac, 0);
    envPerc(ng.gain, t, vel * 0.2, 0.001, 0.012);
    n.connect(ng);
    ng.connect(this.snareNoise);
  }

  // ------------------------------------------------------------------ bass

  bass(t: number, midi: number, dur: number, vel: number, kind: 'finger' | 'pick' | 'upright' = 'finger'): void {
    const ac = this.ac;
    const f = mtof(midi);
    const end = t + dur + 0.25;
    const upright = kind === 'upright';
    const o = mkOsc(ac, upright ? 'triangle' : 'sawtooth', f, t, end);
    const lp = mkFilter(ac, 'lowpass', f * 4, kind === 'pick' ? 2.2 : 1.1);
    const c0 = Math.min(kind === 'pick' ? f * 16 : upright ? f * 7 : f * 9, 4500);
    lp.frequency.setValueAtTime(c0, t);
    lp.frequency.setTargetAtTime(Math.max(f * 2.2, 140), t + 0.004, kind === 'pick' ? 0.07 : 0.1);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + (upright ? 0.007 : 0.004));
    if (upright) g.gain.setTargetAtTime(0, t + 0.01, clamp(dur, 0.12, 0.6) * 0.55);
    else g.gain.setTargetAtTime(vel * 0.62, t + 0.01, 0.12);
    g.gain.setTargetAtTime(0, t + dur, 0.035);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.bassBus);
    // sub sine keeps the weight while the filter closes
    const s = mkOsc(ac, 'sine', f, t, end);
    const sg = mkGain(ac, 0);
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(vel * 0.55, t + 0.006);
    if (upright) sg.gain.setTargetAtTime(0, t + 0.01, clamp(dur, 0.12, 0.6) * 0.7);
    sg.gain.setTargetAtTime(0, t + dur, 0.035);
    s.connect(sg);
    sg.connect(this.bassBus);
  }

  // ------------------------------------------------------------------ guitars

  gtr(t: number, midi: number, dur: number, vel: number, o: GtrOpts = {}): void {
    const ac = this.ac;
    const f = mtof(midi);
    const end = t + dur + (o.mute || o.cluck ? 0.2 : 0.5);
    const d0 = rand(-4, 4);
    const osc = mkOsc(ac, 'sawtooth', f, t, end, d0);
    if (o.bend) {
      osc.detune.setValueAtTime(d0 - o.bend * 100, t);
      osc.detune.linearRampToValueAtTime(d0, t + (o.bendT ?? 0.12));
    }
    if (o.vib) {
      const l = mkOsc(ac, 'sine', rand(5.2, 6.2), t, end);
      const lg = mkGain(ac, 0);
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + Math.min(0.15, dur * 0.3));
      lg.gain.linearRampToValueAtTime(o.vib, t + Math.min(0.4, dur * 0.7));
      l.connect(lg);
      lg.connect(osc.detune);
    }
    const lp = mkFilter(ac, 'lowpass', 1000, o.mute ? 1.4 : 1.0);
    const dark = o.mute || o.cluck;
    lp.frequency.setValueAtTime(Math.min(f * (dark ? 5 : 12), 7000), t);
    lp.frequency.setTargetAtTime(Math.min(f * (dark ? 2 : 4), 3500), t + 0.002, dark ? 0.03 : 0.22);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    if (o.cluck) g.gain.setTargetAtTime(0, t + 0.004, 0.025);
    else if (o.mute) g.gain.setTargetAtTime(0, t + 0.004, 0.055);
    else {
      g.gain.setTargetAtTime(vel * 0.45, t + 0.005, 0.35);
      g.gain.setTargetAtTime(0, t + dur, o.release ?? 0.06);
    }
    osc.connect(lp);
    lp.connect(g);
    g.connect(o.lead ? this.leadIn : this.gtrIn);
  }

  /** Strummed chord (down = low to high). */
  strum(t: number, midis: number[], dur: number, vel: number, down = true, spread = 0.011, o: GtrOpts = {}): void {
    const notes = down ? midis : [...midis].reverse();
    notes.forEach((m, i) => this.gtr(t + i * spread * rand(0.8, 1.2), m, dur - i * spread, vel * (1 - i * 0.05), o));
  }

  // ------------------------------------------------------------------ keys

  organ(t: number, midis: number[], dur: number, vel: number): void {
    if (!this.organIn) return;
    const ac = this.ac;
    for (const m of midis) {
      const o = mkOsc(ac, this.kit.waves.organ, mtof(m) / 2, t, t + dur + 0.1, rand(-3, 3));
      const g = mkGain(ac, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.008);
      g.gain.setValueAtTime(vel, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      o.connect(g);
      g.connect(this.organIn);
    }
    // key click
    const n = mkNoise(ac, this.kit.white, t, t + 0.02);
    const ng = mkGain(ac, 0);
    envPerc(ng.gain, t, vel * 0.08, 0.0005, 0.002);
    n.connect(ng);
    ng.connect(this.organIn);
  }

  piano(t: number, midi: number, dur: number, vel: number): void {
    if (!this.pianoIn) return;
    const ac = this.ac;
    const f = mtof(midi);
    const decay = clamp(2.4 - (midi - 48) * 0.04, 0.35, 2.6);
    const end = t + Math.min(dur, decay * 2) + 0.3;
    const o1 = mkOsc(ac, this.kit.waves.piano, f, t, end);
    const o2 = mkOsc(ac, this.kit.waves.piano, f, t, end, this.style.honky ?? 4);
    const lp = mkFilter(ac, 'lowpass', 1000, 0.5);
    lp.frequency.setValueAtTime(Math.min(f * (4 + 9 * vel), 9000), t);
    lp.frequency.setTargetAtTime(Math.min(f * 2.5, 3500), t + 0.003, 0.3);
    const g = mkGain(ac, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.004, decay * 0.32);
    g.gain.setTargetAtTime(0, t + dur, 0.07);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(this.pianoIn);
  }

  chordPiano(t: number, midis: number[], dur: number, vel: number, roll = 0): void {
    midis.forEach((m, i) => this.piano(t + i * roll, m, dur, vel * (0.9 + 0.1 * Math.random())));
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
    const n = mkNoise(ac, this.kit.white, t, end);
    const ng = mkGain(ac, 0);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(vel * 0.35, t + 0.02);
    ng.gain.setTargetAtTime(vel * 0.08, t + 0.03, 0.05);
    ng.gain.setTargetAtTime(0, t + dur, 0.05);
    n.connect(ng);
    ng.connect(this.saxBreath);
  }

  /** Pedal steel: volume-pedal swell, slide in from `slide` semitones, slow vibrato. */
  steel(t: number, midis: number[], dur: number, vel: number, slide = 0): void {
    if (!this.steelIn) return;
    const ac = this.ac;
    for (const m of midis) {
      const f = mtof(m);
      const end = t + dur + 0.8;
      const o = mkOsc(ac, 'sawtooth', f, t, end);
      if (slide) {
        const fs = f * Math.pow(2, slide / 12);
        o.frequency.setValueAtTime(fs, t);
        o.frequency.setValueAtTime(fs, t + 0.1);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.42);
      }
      const l = mkOsc(ac, 'sine', 5, t, end);
      const lg = mkGain(ac, 0);
      lg.gain.setValueAtTime(0, t + 0.3);
      lg.gain.linearRampToValueAtTime(9, t + 0.8);
      l.connect(lg);
      lg.connect(o.detune);
      const g = mkGain(ac, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.22);
      g.gain.setTargetAtTime(vel * 0.7, t + 0.25, 0.8);
      g.gain.setTargetAtTime(0, t + dur, 0.22);
      o.connect(g);
      g.connect(this.steelIn);
    }
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
    for (const m of midis) {
      const f = mtof(m);
      const end = t + dur + 0.6;
      const o = mkOsc(ac, this.kit.waves.glottal, f, t, end, rand(-7, 7));
      const l = mkOsc(ac, 'sine', rand(4.8, 5.8), t, end);
      const lg = mkGain(ac, 0);
      lg.gain.setValueAtTime(0, t + 0.15);
      lg.gain.linearRampToValueAtTime(rand(10, 18), t + 0.6);
      l.connect(lg);
      lg.connect(o.detune);
      const g = mkGain(ac, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + att);
      g.gain.setTargetAtTime(vel * 0.85, t + att, 0.5);
      g.gain.setTargetAtTime(0, t + dur, Math.min(0.15, att + 0.05));
      o.connect(g);
      g.connect(this.vocIn);
    }
  }
}
