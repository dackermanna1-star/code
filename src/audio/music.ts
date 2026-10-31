/**
 * Adaptive procedural battle score.
 *
 * A seeded "piece" picks key, mode, tempo, chord progression, drum / bass / arpeggio patterns and
 * instrumentation (by mood). A lookahead scheduler (25 ms tick, 150 ms horizon) drives a 16th-note
 * step sequencer on AudioContext time, so timing stays sample-accurate even when the main thread
 * hiccups (late steps are skipped, never bunched).
 *
 * Layers fade in with intensity:
 *   0+    pad drone + heartbeat pulse
 *   0.25+ bass ostinato + hats
 *   0.45+ full kit, fills, crashes and swells at phrase boundaries
 *   0.65+ arpeggio / string ostinato / bells (by mood)
 *   0.85+ epic layer: formant choir, taiko (epic/frantic), metallic hits (dark), high bells (ethereal)
 */
import type { MusicStinger } from './types';
import { MIN_GAIN, clampFreq, distortionCurve, midiToFreq, type NoiseBank, type NoiseColor } from './synth';

export type Mood = 'epic' | 'dark' | 'ethereal' | 'frantic';
type LeadKind = 'strings' | 'square' | 'bell' | 'saw';
type LayerName = 'pulse' | 'pad' | 'bass' | 'hats' | 'drums' | 'lead' | 'epic';
type FDesc = [BiquadFilterType, number, number?];

const LOOKAHEAD = 0.15;
const TICK_MS = 25;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Musical material                                                    */
/* ------------------------------------------------------------------ */

const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
} as const;
type ModeName = keyof typeof MODES;

/** Scale-degree progressions (0-based), one chord per bar or per two bars. */
const PROGS: Record<ModeName, number[][]> = {
  aeolian: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 5, 3, 4], [0, 3, 5, 6], [0, 2, 6, 5], [0, 5, 6, 4], [0, 3, 6, 2]],
  harmonic: [[0, 5, 3, 4], [0, 3, 4, 4], [0, 5, 1, 4], [0, 6, 5, 4], [0, 3, 5, 4]],
  phrygian: [[0, 1, 0, 6], [0, 1, 5, 6], [0, 6, 1, 0], [0, 3, 1, 0], [0, 1, 3, 1]],
  dorian: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 2, 3, 6], [0, 4, 3, 6], [0, 3, 6, 4]],
};

const KICKS: Record<string, number[]> = {
  four: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  rock: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  drive: [1, 0, 0, 0.7, 0, 0, 1, 0, 1, 0, 0, 0.7, 0, 0, 1, 0],
  gallop: [1, 0, 0.8, 0.8, 0, 0, 1, 0, 1, 0, 0.8, 0.8, 0, 0, 1, 0],
  half: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  broken: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
};
const SNARES: Record<string, number[]> = {
  back: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  backGhost: [0, 0, 0, 0, 1, 0, 0, 0.25, 0, 0, 0.25, 0, 1, 0, 0, 0.3],
  half: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  halfGhost: [0, 0, 0, 0.2, 0, 0, 0, 0, 1, 0, 0, 0.2, 0, 0, 0.25, 0],
};
const HATS: Record<string, number[]> = {
  eighths: [1, 0, 0.6, 0, 1, 0, 0.6, 0, 1, 0, 0.6, 0, 1, 0, 0.6, 0],
  off: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  sixteenths: [1, 0.4, 0.7, 0.4, 1, 0.4, 0.7, 0.4, 1, 0.4, 0.7, 0.4, 1, 0.4, 0.7, 0.4],
};
/** 0 rest, 1 root, 2 octave, 3 fifth. */
const BASSES: Record<string, number[]> = {
  eighths: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  ostinato: [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 3, 1],
  gallop: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 2, 1],
  synco: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 2, 1, 0],
  pulse: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 2],
  sparse: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
};
/** Chord-tone indices (k%3 = tone, k/3 = octave); -1 = rest. */
const ARPS: Record<string, number[]> = {
  up: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
  updown: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1],
  broken: [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 2, 4, 3, 1],
  pulse: [3, -1, 3, 0, 3, -1, 3, 1, 3, -1, 3, 2, 3, -1, 4, 3],
  climb: [0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 3, 2, 1],
};
const TAIKO_EPIC = [1, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.9, 0, 0, 0, 0.6, 0];
const TAIKO_DARK = [0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0.5, 0];

interface MoodPreset {
  modes: ModeName[];
  bpm: [number, number];
  kicks: string[];
  snares: string[];
  hats: string[];
  basses: string[];
  arps: string[];
  lead: LeadKind;
  vowel: 'a' | 'o';
  padType: OscillatorType;
  bassDrive: number;
  padCutoff: number;
}

const MOODS: Record<Mood, MoodPreset> = {
  epic: { modes: ['aeolian', 'harmonic'], bpm: [140, 156], kicks: ['drive', 'gallop', 'rock'], snares: ['back', 'backGhost'], hats: ['eighths', 'off'], basses: ['ostinato', 'gallop', 'eighths'], arps: ['updown', 'broken', 'climb'], lead: 'strings', vowel: 'a', padType: 'sawtooth', bassDrive: 1.5, padCutoff: 1000 },
  dark: { modes: ['phrygian', 'harmonic', 'aeolian'], bpm: [132, 148], kicks: ['broken', 'rock', 'drive'], snares: ['backGhost', 'back'], hats: ['off', 'eighths'], basses: ['synco', 'eighths', 'pulse'], arps: ['pulse', 'broken', 'up'], lead: 'square', vowel: 'o', padType: 'sawtooth', bassDrive: 2.5, padCutoff: 700 },
  ethereal: { modes: ['dorian', 'aeolian'], bpm: [120, 136], kicks: ['half', 'broken'], snares: ['half', 'halfGhost'], hats: ['eighths', 'sixteenths'], basses: ['sparse', 'synco'], arps: ['updown', 'climb', 'up'], lead: 'bell', vowel: 'a', padType: 'triangle', bassDrive: 1, padCutoff: 1700 },
  frantic: { modes: ['phrygian', 'harmonic'], bpm: [158, 172], kicks: ['drive', 'four', 'gallop'], snares: ['back', 'backGhost'], hats: ['sixteenths', 'eighths'], basses: ['pulse', 'ostinato', 'gallop'], arps: ['up', 'pulse', 'broken'], lead: 'saw', vowel: 'a', padType: 'sawtooth', bassDrive: 5, padCutoff: 900 },
};

export interface PieceSpec {
  mood: Mood;
  bpm: number;
  /** MIDI note of the tonic in the bass register (28..39). */
  tonic: number;
  modeName: ModeName;
  mode: readonly number[];
  prog: number[];
  barsPerChord: number;
  kick: number[];
  snare: number[];
  hat: number[];
  bass: number[];
  arp: number[];
  lead: LeadKind;
  vowel: 'a' | 'o';
  padType: OscillatorType;
  bassDrive: number;
  padCutoff: number;
}

export function makeSpec(seed: number, mood: Mood): PieceSpec {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
  const m = MOODS[mood];
  const modeName = pick(m.modes);
  let prog = [...pick(PROGS[modeName])];
  if (r() < 0.45) prog = prog.concat(pick(PROGS[modeName]));
  return {
    mood,
    bpm: Math.round(m.bpm[0] + r() * (m.bpm[1] - m.bpm[0])),
    tonic: 28 + Math.floor(r() * 12),
    modeName,
    mode: MODES[modeName],
    prog,
    barsPerChord: prog.length > 4 ? 1 : r() < 0.5 ? 1 : 2,
    kick: KICKS[pick(m.kicks)],
    snare: SNARES[pick(m.snares)],
    hat: HATS[pick(m.hats)],
    bass: BASSES[pick(m.basses)],
    arp: ARPS[pick(m.arps)],
    lead: m.lead,
    vowel: m.vowel,
    padType: m.padType,
    bassDrive: m.bassDrive,
    padCutoff: m.padCutoff,
  };
}

function chordSemis(mode: readonly number[], deg: number): [number, number, number] {
  const tone = (k: number) => mode[k % 7] + 12 * Math.floor(k / 7);
  return [tone(deg), tone(deg + 2), tone(deg + 4)];
}

/* ------------------------------------------------------------------ */
/* Instruments                                                         */
/* ------------------------------------------------------------------ */

class Instruments {
  constructor(private ctx: BaseAudioContext, private nb: NoiseBank) {}

  private done(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    src.onended = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
  }

  private filters(src: AudioNode, specs: FDesc[], chain: AudioNode[]): AudioNode {
    let node = src;
    for (const [type, f, q] of specs) {
      const b = this.ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = clampFreq(this.ctx, f);
      if (q !== undefined) b.Q.value = q;
      node.connect(b);
      node = b;
      chain.push(b);
    }
    return node;
  }

  /** Percussive filtered noise. shape 'swell' = reverse-cymbal rise. */
  noise(t: number, color: NoiseColor, dur: number, peak: number, specs: FDesc[], dest: AudioNode, opts: { rate?: number; attack?: number; shape?: 'exp' | 'swell' | 'hold' } = {}): void {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.nb[color];
    s.loop = true;
    s.playbackRate.value = opts.rate ?? 1;
    const chain: AudioNode[] = [];
    const node = this.filters(s, specs, chain);
    const g = ctx.createGain();
    const pk = Math.max(MIN_GAIN * 2, peak);
    const a = Math.max(0.001, opts.attack ?? 0.001);
    if (opts.shape === 'swell') {
      g.gain.setValueAtTime(MIN_GAIN, t);
      g.gain.exponentialRampToValueAtTime(pk, t + dur);
      g.gain.linearRampToValueAtTime(MIN_GAIN, t + dur + 0.03);
    } else if (opts.shape === 'hold') {
      g.gain.setValueAtTime(MIN_GAIN, t);
      g.gain.linearRampToValueAtTime(pk, t + a);
      g.gain.setValueAtTime(pk, t + Math.max(a, dur * 0.7));
      g.gain.linearRampToValueAtTime(MIN_GAIN, t + dur);
    } else {
      g.gain.setValueAtTime(MIN_GAIN, t);
      g.gain.linearRampToValueAtTime(pk, t + a);
      g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + Math.max(a + 0.005, dur));
    }
    node.connect(g);
    g.connect(dest);
    const buf = this.nb[color];
    s.start(t, buf.duration > 0.5 ? Math.random() * (buf.duration - 0.4) : 0);
    s.stop(t + dur + 0.05);
    chain.push(g);
    this.done(s, chain);
  }

  /** Simple enveloped oscillator. */
  osc(
    t: number,
    type: OscillatorType,
    f: number,
    dur: number,
    peak: number,
    dest: AudioNode,
    o: { f2?: number; glide?: number; attack?: number; filter?: FDesc[]; detune?: number; release?: number; vibrato?: number; shape?: 'exp' | 'hold' } = {},
  ): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(clampFreq(ctx, f), t);
    if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(clampFreq(ctx, o.f2), t + (o.glide ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    const chain: AudioNode[] = [];
    if (o.vibrato) {
      const v = ctx.createOscillator();
      v.frequency.value = 4.8 + Math.random() * 0.6;
      const vg = ctx.createGain();
      vg.gain.value = f * o.vibrato;
      v.connect(vg);
      vg.connect(osc.frequency);
      v.start(t);
      v.stop(t + dur + (o.release ?? 0.05) + 0.05);
      chain.push(vg);
      this.done(v, [vg]);
    }
    const node = this.filters(osc, o.filter ?? [], chain);
    const g = ctx.createGain();
    const pk = Math.max(MIN_GAIN * 2, peak);
    const a = Math.max(0.001, o.attack ?? 0.002);
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(pk, t + a);
    let end = t + Math.max(a + 0.005, dur);
    if (o.shape === 'hold') {
      const rel = o.release ?? 0.3;
      g.gain.setValueAtTime(pk, end);
      g.gain.exponentialRampToValueAtTime(MIN_GAIN, end + rel);
      end += rel;
    } else {
      g.gain.exponentialRampToValueAtTime(MIN_GAIN, end);
    }
    node.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(end + 0.05);
    chain.push(g);
    this.done(osc, chain);
  }

  kick(t: number, vel: number, dest: AudioNode): void {
    this.osc(t, 'sine', 155, 0.45, vel, dest, { f2: 46, glide: 0.12, attack: 0.002 });
    this.noise(t, 'white', 0.012, 0.25 * vel, [['highpass', 2500]], dest);
  }

  snare(t: number, vel: number, dest: AudioNode): void {
    this.noise(t, 'white', 0.18, 0.5 * vel, [['highpass', 1200], ['peaking', 4000, 1]], dest);
    this.osc(t, 'triangle', 205, 0.1, 0.35 * vel, dest, { f2: 150, glide: 0.06 });
  }

  hat(t: number, vel: number, dest: AudioNode, open: boolean): void {
    this.noise(t, 'white', open ? 0.3 : 0.045, 0.3 * vel, [['highpass', 7200], ['peaking', 10000, 1]], dest);
  }

  tom(t: number, f: number, vel: number, dest: AudioNode): void {
    this.osc(t, 'sine', f * 1.5, 0.35, 0.8 * vel, dest, { f2: f, glide: 0.06 });
    this.noise(t, 'pink', 0.06, 0.3 * vel, [['lowpass', 900]], dest);
  }

  taiko(t: number, vel: number, dest: AudioNode): void {
    this.osc(t, 'sine', 80, 0.9, vel, dest, { f2: 47, glide: 0.18 });
    this.osc(t, 'triangle', 165, 0.12, 0.25 * vel, dest, { f2: 90, glide: 0.08 });
    this.noise(t, 'brown', 0.16, 0.5 * vel, [['lowpass', 500]], dest);
  }

  crash(t: number, vel: number, dest: AudioNode, dur = 2.2): void {
    this.noise(t, 'white', dur, 0.32 * vel, [['highpass', 4200]], dest);
    this.noise(t, 'white', dur * 0.6, 0.12 * vel, [['bandpass', 8500, 0.6]], dest);
  }

  /** Reverse-cymbal swell ending exactly at t + dur. */
  swell(t: number, dur: number, vel: number, dest: AudioNode): void {
    this.noise(t, 'white', dur, 0.4 * vel, [['highpass', 2500]], dest, { shape: 'swell' });
  }

  bass(t: number, f: number, dur: number, vel: number, dest: AudioNode, cutoff: number, drive: number): void {
    const ctx = this.ctx;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = clampFreq(ctx, f);
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = clampFreq(ctx, f / 2);
    const subG = ctx.createGain();
    subG.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(clampFreq(ctx, cutoff * 2.8), t);
    lp.frequency.exponentialRampToValueAtTime(clampFreq(ctx, cutoff), t + 0.1);
    const ws = ctx.createWaveShaper();
    ws.curve = distortionCurve(drive);
    const g = ctx.createGain();
    const end = t + Math.max(0.03, dur);
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.setValueAtTime(vel * 0.8, end - 0.02);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, end + 0.04);
    saw.connect(lp);
    sub.connect(subG);
    subG.connect(lp);
    lp.connect(ws);
    ws.connect(g);
    g.connect(dest);
    saw.start(t);
    sub.start(t);
    saw.stop(end + 0.08);
    sub.stop(end + 0.08);
    this.done(saw, [lp, ws, g]);
    this.done(sub, [subG]);
  }

  padNote(t: number, f: number, dur: number, vel: number, dest: AudioNode, type: OscillatorType): void {
    for (const d of [-7, 7]) this.osc(t, type, f, dur, vel * 0.5, dest, { attack: 0.5, detune: d, shape: 'hold', release: 0.7 });
  }

  lead(t: number, f: number, dur: number, vel: number, dest: AudioNode, kind: LeadKind): void {
    switch (kind) {
      case 'strings':
        this.osc(t, 'sawtooth', f, dur, vel * 0.5, dest, { attack: 0.012 });
        this.osc(t, 'sawtooth', f, dur, vel * 0.5, dest, { attack: 0.012, detune: 9 });
        break;
      case 'square':
        this.osc(t, 'square', f, dur * 1.6, vel * 0.7, dest, { attack: 0.003, filter: [['lowpass', 1800, 2]] });
        break;
      case 'saw':
        this.osc(t, 'sawtooth', f, dur * 1.4, vel * 0.55, dest, { attack: 0.003 });
        this.osc(t, 'sawtooth', f * 1.006, dur * 1.4, vel * 0.45, dest, { attack: 0.003 });
        break;
      case 'bell': {
        const ctx = this.ctx;
        const car = ctx.createOscillator();
        const mod = ctx.createOscillator();
        car.frequency.value = clampFreq(ctx, f);
        mod.frequency.value = clampFreq(ctx, f * 3.5);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(f * 2.2, t);
        mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + 1.2);
        mod.connect(mg);
        mg.connect(car.frequency);
        const g = ctx.createGain();
        const len = Math.max(0.8, dur);
        g.gain.setValueAtTime(MIN_GAIN, t);
        g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.003);
        g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + len);
        car.connect(g);
        g.connect(dest);
        car.start(t);
        mod.start(t);
        car.stop(t + len + 0.05);
        mod.stop(t + len + 0.05);
        this.done(car, [g]);
        this.done(mod, [mg]);
        break;
      }
    }
  }

  choirNote(t: number, f: number, dur: number, vel: number, dest: AudioNode): void {
    for (const d of [-12, 0, 12]) this.osc(t, 'sawtooth', f, dur, vel * 0.33, dest, { attack: 0.7, detune: d + (Math.random() * 4 - 2), shape: 'hold', release: 0.8, vibrato: 0.006 });
  }

  metalHit(t: number, f: number, vel: number, dest: AudioNode): void {
    const ratios = [1, 1.48, 2.13, 2.91, 3.7];
    ratios.forEach((r, k) => this.osc(t, 'sine', f * r, 1.6 - k * 0.25, (vel * 0.4) / (1 + k * 0.5), dest, { attack: 0.002 }));
    this.noise(t, 'white', 0.05, 0.25 * vel, [['bandpass', 3500, 0.8]], dest);
  }

  pulse(t: number, vel: number, dest: AudioNode): void {
    this.osc(t, 'sine', 64, 0.22, vel, dest, { f2: 40, glide: 0.12, attack: 0.004 });
  }

  subDrone(t: number, f: number, dur: number, vel: number, dest: AudioNode): void {
    this.osc(t, 'sine', f, dur, vel, dest, { attack: 0.8, shape: 'hold', release: 0.8 });
  }

  air(t: number, dur: number, vel: number, dest: AudioNode): void {
    this.noise(t, 'pink', dur, vel, [['bandpass', 5500, 0.6]], dest, { attack: Math.min(1, dur * 0.4), shape: 'hold' });
  }

  /** Brass-ish chord: saw stack with a filter envelope (opens, then settles). */
  brass(t: number, freqs: number[], dur: number, vel: number, dest: AudioNode, opts: { peakCut?: number; restCut?: number; attack?: number; drive?: number } = {}): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.5;
    const a = opts.attack ?? 0.25;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(clampFreq(ctx, opts.peakCut ?? 2400), t + a);
    lp.frequency.exponentialRampToValueAtTime(clampFreq(ctx, opts.restCut ?? 800), t + a + Math.max(0.2, dur * 0.5));
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(vel, t + a * 0.6);
    g.gain.setValueAtTime(vel, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);
    let out: AudioNode = lp;
    if (opts.drive) {
      const ws = ctx.createWaveShaper();
      ws.curve = distortionCurve(opts.drive);
      lp.connect(ws);
      out = ws;
    }
    out.connect(g);
    g.connect(dest);
    let last: OscillatorNode | null = null;
    for (const f of freqs) {
      for (const d of [-9, 0, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = clampFreq(ctx, f);
        o.detune.value = d;
        const og = ctx.createGain();
        og.gain.value = 1 / (freqs.length * 2.2);
        o.connect(og);
        og.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
        this.done(o, [og]);
        last = o;
      }
    }
    if (last) this.done(last, [lp, g]);
  }

  boom(t: number, vel: number, dest: AudioNode): void {
    this.osc(t, 'sine', 70, 2.2, vel, dest, { f2: 26, glide: 1.6, attack: 0.003 });
    this.noise(t, 'brown', 1.5, 0.5 * vel, [['lowpass', 600]], dest);
    this.noise(t, 'white', 0.05, 0.4 * vel, [['highpass', 1500]], dest);
  }

  impact(t: number, tonic: number, vel: number, dest: AudioNode): void {
    this.boom(t, vel, dest);
    this.crash(t, vel, dest, 2.6);
    this.taiko(t, vel, dest);
    this.brass(t, [midiToFreq(tonic + 12), midiToFreq(tonic + 19), midiToFreq(tonic + 24)], 1.6, 0.4 * vel, dest, { attack: 0.03, peakCut: 3000, restCut: 500, drive: 2 });
  }
}

/* ------------------------------------------------------------------ */
/* Piece: one running arrangement                                      */
/* ------------------------------------------------------------------ */

const LAYER_BASE: Record<LayerName, number> = { pulse: 0.55, pad: 0.3, bass: 0.42, hats: 0.22, drums: 0.72, lead: 0.24, epic: 0.5 };
const LAYERS: LayerName[] = ['pulse', 'pad', 'bass', 'hats', 'drums', 'lead', 'epic'];

function layerTargets(I: number): Record<LayerName, number> {
  return {
    pulse: 1 - smooth(0.3, 0.55, I),
    pad: 1 - 0.25 * I,
    bass: smooth(0.18, 0.35, I),
    hats: smooth(0.2, 0.38, I),
    drums: smooth(0.4, 0.55, I),
    lead: smooth(0.6, 0.75, I),
    epic: smooth(0.8, 0.92, I),
  };
}

class Piece {
  readonly out: GainNode;
  readonly spec: PieceSpec;
  readonly stepDur: number;
  nextTime: number;
  endAt = Infinity;
  ending = false;
  private step = 0;
  private targetI: number;
  private smoothI: number;
  private rng: () => number;
  private layers: Record<LayerName, GainNode>;
  private padBus: GainNode;
  private padFilter: BiquadFilterNode;
  private leadBus: GainNode;
  private choirBus: GainNode;
  private nodes: AudioNode[] = [];

  constructor(private ctx: BaseAudioContext, private inst: Instruments, dest: AudioNode, seed: number, mood: Mood, start: number, intensity: number, fadeIn: number) {
    this.spec = makeSpec(seed, mood);
    this.rng = mulberry32(seed ^ 0x51ed270b);
    this.stepDur = 60 / this.spec.bpm / 4;
    this.nextTime = start;
    this.targetI = this.smoothI = intensity;

    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(MIN_GAIN, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(1, start + Math.max(0.05, fadeIn));
    this.out.connect(dest);

    const t0 = layerTargets(intensity);
    const mk = (name: LayerName): GainNode => {
      const g = ctx.createGain();
      g.gain.value = t0[name] * LAYER_BASE[name];
      g.connect(this.out);
      this.nodes.push(g);
      return g;
    };
    this.layers = { pulse: mk('pulse'), pad: mk('pad'), bass: mk('bass'), hats: mk('hats'), drums: mk('drums'), lead: mk('lead'), epic: mk('epic') };

    // Pad: shared lowpass.
    this.padBus = ctx.createGain();
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.Q.value = 0.8;
    this.padFilter.frequency.value = clampFreq(ctx, this.spec.padCutoff * (0.7 + 0.8 * intensity));
    this.padBus.connect(this.padFilter);
    this.padFilter.connect(this.layers.pad);

    // Lead: lowpass + tempo-synced dotted-eighth feedback delay.
    this.leadBus = ctx.createGain();
    const leadLp = ctx.createBiquadFilter();
    leadLp.type = 'lowpass';
    leadLp.frequency.value = this.spec.lead === 'bell' ? 9000 : this.spec.lead === 'strings' ? 2700 : 3600;
    this.leadBus.connect(leadLp);
    leadLp.connect(this.layers.lead);
    const delay = ctx.createDelay(2);
    delay.delayTime.value = this.stepDur * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 2800;
    const wet = ctx.createGain();
    wet.gain.value = this.spec.lead === 'bell' ? 0.42 : 0.26;
    leadLp.connect(delay);
    delay.connect(fbLp);
    fbLp.connect(fb);
    fb.connect(delay);
    fbLp.connect(wet);
    wet.connect(this.layers.lead);

    // Choir: shared formant bank.
    this.choirBus = ctx.createGain();
    const formants: [number, number, number][] = this.spec.vowel === 'a'
      ? [[800, 7, 1], [1150, 9, 0.55], [2900, 11, 0.22]]
      : [[420, 7, 1], [820, 9, 0.5], [2600, 11, 0.14]];
    for (const [f, q, g] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g * 2.6;
      this.choirBus.connect(bp);
      bp.connect(gg);
      gg.connect(this.layers.epic);
      this.nodes.push(bp, gg);
    }
    this.nodes.push(this.padBus, this.padFilter, this.leadBus, leadLp, delay, fb, fbLp, wet, this.choirBus);
  }

  setIntensity(v: number, now: number): void {
    this.targetI = v;
    const t = layerTargets(v);
    for (const name of LAYERS) this.layers[name].gain.setTargetAtTime(t[name] * LAYER_BASE[name], now, 0.8);
    this.padFilter.frequency.setTargetAtTime(clampFreq(this.ctx, this.spec.padCutoff * (0.7 + 0.8 * v)), now, 1.0);
  }

  fadeOut(now: number, seconds: number): void {
    this.ending = true;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, Math.max(0.02, seconds / 4));
    this.endAt = now + seconds + 0.1;
  }

  /** Skip steps without scheduling them (resync after a stall). */
  skip(n: number): void {
    this.step += n;
    this.nextTime += n * this.stepDur;
    this.smoothI = this.targetI;
  }

  dispose(): void {
    try {
      this.out.disconnect();
      for (const n of this.nodes) n.disconnect();
    } catch {
      /* ignore */
    }
  }

  scheduleStep(): void {
    const t = this.nextTime;
    const st = this.step;
    const s = st % 16;
    const bar = Math.floor(st / 16);
    const spec = this.spec;
    const inst = this.inst;
    this.smoothI += (this.targetI - this.smoothI) * (1 - Math.exp(-this.stepDur / 0.9));
    const I = Math.max(this.smoothI, this.targetI * 0.98);
    const lv = layerTargets(I);
    const L = this.layers;
    const vel = () => 0.88 + 0.24 * this.rng();
    const chord = chordSemis(spec.mode, spec.prog[Math.floor(bar / spec.barsPerChord) % spec.prog.length]);
    const chordStart = s === 0 && bar % spec.barsPerChord === 0;
    const chordDur = spec.barsPerChord * 16 * this.stepDur;
    const tonic = spec.tonic;

    // Heartbeat pulse (fades out as the fight heats up).
    if (lv.pulse > 0.02 && (s === 0 || s === 3)) inst.pulse(t, s === 0 ? 1 : 0.7, L.pulse);

    // Pad + drones.
    if (chordStart) {
      for (const c of chord) inst.padNote(t, midiToFreq(tonic + 24 + c), chordDur + 0.3, 0.32, this.padBus, spec.padType);
      inst.padNote(t, midiToFreq(tonic + 12 + chord[0]), chordDur + 0.3, 0.22, this.padBus, 'sine');
      if (spec.mood === 'dark') inst.subDrone(t, midiToFreq(tonic + chord[0]), chordDur + 0.4, 0.5, L.pad);
      if (spec.mood === 'ethereal') inst.air(t, chordDur + 0.4, 0.07, L.pad);
    }

    // Bass ostinato.
    if (lv.bass > 0.02) {
      const b = spec.bass[s];
      if (b > 0) {
        const semi = chord[0] % 12 + (b === 2 ? 12 : b === 3 ? 7 : 0);
        let len = 1;
        while (len < 4 && spec.bass[(s + len) % 16] === 0) len++;
        inst.bass(t, midiToFreq(tonic + semi), len * this.stepDur * 0.88, 0.85 * vel(), L.bass, 220 + 1700 * I, spec.bassDrive);
      }
    }

    // Hats.
    if (lv.hats > 0.02) {
      const pat = I > 0.86 ? HATS.sixteenths : spec.hat;
      const h = pat[s];
      if (h > 0) inst.hat(t, h * vel(), L.hats, false);
      if (s === 14 && bar % 2 === 1) inst.hat(t, 0.6, L.hats, true);
    }

    // Kit, fills, crashes, swells.
    if (lv.drums > 0.02) {
      const bigFill = bar % 8 === 7 && s >= 8;
      const smallFill = bar % 4 === 3 && s >= 12;
      if (bigFill || smallFill) {
        const tf = [196, 175, 147, 131, 110, 98, 87, 73];
        if (bigFill ? s % 1 === 0 : s % 2 === 0 || s === 15) inst.tom(t, tf[(s - 8) % 8], (0.6 + 0.05 * (s - 8)) * vel(), L.drums);
        if (s === 12 || (bigFill && s === 8)) inst.kick(t, 0.8, L.drums);
      } else {
        const k = spec.kick[s];
        if (k > 0) inst.kick(t, k * vel(), L.drums);
        const sn = spec.snare[s];
        if (sn > 0) inst.snare(t, sn * vel(), L.drums);
      }
      if (s === 0 && bar % 8 === 0 && bar > 0) inst.crash(t, 0.9, L.drums, 2.2);
      if (s === 0 && bar % 8 === 7) inst.swell(t, 16 * this.stepDur, 0.5, L.drums);
    }

    // Arp / ostinato lead.
    if (lv.lead > 0.02) {
      const every = spec.lead === 'bell' ? 2 : 1;
      const k = spec.arp[s];
      if (s % every === 0 && k >= 0) {
        const semi = chord[k % 3] + 12 * Math.floor(k / 3);
        const oct = spec.lead === 'bell' ? 36 : 24;
        const dur = spec.lead === 'bell' ? this.stepDur * 6 : this.stepDur * 0.8;
        inst.lead(t, midiToFreq(tonic + oct + semi), dur, 0.5 * vel(), this.leadBus, spec.lead);
      }
    }

    // Epic layer.
    if (lv.epic > 0.02) {
      if (chordStart) {
        for (const c of chord) inst.choirNote(t, midiToFreq(tonic + 24 + c), chordDur + 0.2, 0.3, this.choirBus);
        inst.choirNote(t, midiToFreq(tonic + 36 + chord[0]), chordDur + 0.2, 0.18, this.choirBus);
      }
      switch (spec.mood) {
        case 'epic':
          if (TAIKO_EPIC[s] > 0) inst.taiko(t, TAIKO_EPIC[s] * vel(), L.epic);
          if (s === 0 && bar % 4 === 0) inst.crash(t, 0.5, L.epic, 2.5);
          break;
        case 'frantic':
          if (s % 4 === 0) inst.taiko(t, (s === 0 ? 1 : 0.7) * vel(), L.epic);
          break;
        case 'dark':
          if (s === 0) inst.metalHit(t, midiToFreq(tonic + 36 + chord[0]), 0.55, L.epic);
          if (TAIKO_DARK[s] > 0) inst.taiko(t, TAIKO_DARK[s] * vel(), L.epic);
          break;
        case 'ethereal':
          if (s === 0 || s === 8) inst.lead(t, midiToFreq(tonic + 48 + chord[s === 0 ? 0 : 2]), 1.8, 0.32, L.epic, 'bell');
          break;
      }
    }

    this.step++;
    this.nextTime += this.stepDur;
  }
}

/* ------------------------------------------------------------------ */
/* Music system                                                        */
/* ------------------------------------------------------------------ */

export class MusicSystem {
  /** Pieces feed this; it passes through sidechain / duck / silence gains. */
  private input: GainNode;
  private sidechain: GainNode;
  private duck: GainNode;
  private silence: GainNode;
  /** Stingers bypass duck / silence so they always punch through. */
  private stingerBus: GainNode;
  private filter: BiquadFilterNode;
  private out: GainNode;
  private inst: Instruments;
  private pieces: Piece[] = [];
  private current: Piece | null = null;
  private intensity = 0.25;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private ctx: BaseAudioContext, nb: NoiseBank, private offline: boolean, dest: AudioNode, reverbIn: AudioNode) {
    this.inst = new Instruments(ctx, nb);
    this.input = ctx.createGain();
    this.sidechain = ctx.createGain();
    this.duck = ctx.createGain();
    this.silence = ctx.createGain();
    this.stingerBus = ctx.createGain();
    this.stingerBus.gain.value = 1.4;
    const mix = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = clampFreq(ctx, 20000);
    this.filter.Q.value = 0.6;
    this.out = ctx.createGain();
    this.out.gain.value = 0.17; // music sits ~-10..-12 dB under the effects
    const send = ctx.createGain();
    send.gain.value = 0.16;
    this.input.connect(this.sidechain);
    this.sidechain.connect(this.duck);
    this.duck.connect(this.silence);
    this.silence.connect(mix);
    this.stingerBus.connect(mix);
    mix.connect(this.filter);
    this.filter.connect(this.out);
    this.out.connect(dest);
    this.out.connect(send);
    send.connect(reverbIn);
  }

  get key(): { tonic: number; mode: readonly number[] } {
    const sp = this.current?.spec;
    return sp ? { tonic: sp.tonic, mode: sp.mode } : { tonic: 33, mode: MODES.aeolian };
  }

  start(seed: number, mood?: Mood): void {
    const now = this.ctx.currentTime;
    const m: Mood = mood ?? (['epic', 'dark', 'ethereal', 'frantic'] as const)[(seed >>> 3) % 4];
    const hadPrevious = !!this.current;
    if (this.current) this.current.fadeOut(now, 1.6);
    const piece = new Piece(this.ctx, this.inst, this.input, seed >>> 0, m, now + 0.08, this.intensity, hadPrevious ? 1.4 : 0.6);
    this.pieces.push(piece);
    this.current = piece;
    this.ensureTimer();
    this.tick();
  }

  stop(fade = 1.5): void {
    const now = this.ctx.currentTime;
    for (const p of this.pieces) if (!p.ending) p.fadeOut(now, Math.max(0.05, fade));
    this.current = null;
  }

  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    const now = this.ctx.currentTime;
    for (const p of this.pieces) if (!p.ending) p.setIntensity(this.intensity, now);
  }

  setSlowmo(a: number): void {
    const f = 20000 * Math.pow(2600 / 20000, a);
    this.filter.frequency.setTargetAtTime(clampFreq(this.ctx, f), this.ctx.currentTime, 0.08);
  }

  silenceFor(seconds: number): void {
    const now = this.ctx.currentTime;
    const g = this.silence.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0.015, now, 0.03);
    g.setTargetAtTime(1, now + Math.max(0.05, seconds), 0.3);
  }

  duckFor(amount: number, seconds: number): void {
    const now = this.ctx.currentTime;
    const g = this.duck.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Math.max(0, 1 - amount), now, 0.04);
    g.setTargetAtTime(1, now + Math.max(0.02, seconds), 0.25);
  }

  /** Very short dip for huge impacts. */
  sidechainDip(amount: number): void {
    const now = this.ctx.currentTime;
    const g = this.sidechain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Math.max(0, 1 - amount), now, 0.01);
    g.setTargetAtTime(1, now + 0.09, 0.16);
  }

  /** Schedule everything up to absolute context time `until` (offline rendering / tests). */
  pump(until: number): void {
    for (const p of this.pieces) {
      while (p.nextTime < until && p.nextTime < p.endAt) p.scheduleStep();
    }
  }

  private ensureTimer(): void {
    if (this.offline || this.timer !== null || typeof setInterval === 'undefined') return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    try {
      const now = this.ctx.currentTime;
      const horizon = now + LOOKAHEAD;
      for (const p of this.pieces) {
        if (p.nextTime < now - 0.06) {
          // We fell behind (tab hidden / GC pause): resync without a burst of late notes.
          const behind = now - p.nextTime;
          p.skip(Math.ceil(behind / p.stepDur));
        }
        while (p.nextTime < horizon && p.nextTime < p.endAt) p.scheduleStep();
      }
      this.pieces = this.pieces.filter((p) => {
        if (p.ending && now > p.endAt + 0.5) {
          p.dispose();
          return false;
        }
        return true;
      });
      if (this.pieces.length === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    } catch {
      /* never let the scheduler throw */
    }
  }

  stinger(kind: MusicStinger): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const { tonic, mode } = this.key;
    const d = this.stingerBus;
    const inst = this.inst;
    const n = (semi: number) => midiToFreq(tonic + semi);
    switch (kind) {
      case 'clash':
        inst.metalHit(t, n(36 + 7), 0.7, d);
        inst.crash(t, 0.35, d, 1.2);
        inst.noise(t + 0.02, 'white', 0.45, 0.25, [['bandpass', 1200, 0.8]], d, { attack: 0.3, shape: 'hold' });
        break;
      case 'transform': {
        const r = 2.0;
        inst.noise(t, 'white', r, 0.45, [['highpass', 600]], d, { shape: 'swell' });
        inst.brass(t, [n(12), n(19)], r + 0.1, 0.35, d, { attack: r * 0.9, peakCut: 4000, restCut: 3500 });
        // Accelerating snare roll.
        let tt = t;
        let gap = 0.25;
        while (tt < t + r - 0.03) {
          inst.snare(tt, 0.25 + 0.6 * ((tt - t) / r), d);
          tt += gap;
          gap = Math.max(0.035, gap * 0.86);
        }
        inst.impact(t + r, tonic, 0.9, d);
        break;
      }
      case 'laststand': {
        inst.boom(t, 1, d);
        for (const k of [0.7, 1.6, 2.5]) {
          inst.pulse(t + k, 1, d);
          inst.pulse(t + k + 0.22, 0.75, d);
        }
        const ch = chordSemis(mode, 0);
        for (const c of ch) inst.choirNote(t + 0.3, n(24 + c), 3.6, 0.42, d);
        break;
      }
      case 'ko':
        inst.impact(t, tonic, 1, d);
        this.silenceFor(2.8);
        inst.swell(t + 1.3, 1.5, 0.7, d);
        break;
      case 'victory': {
        // Picardy third: tonic MAJOR chord, brass swell, timpani roll, crash, rising bells.
        const maj = [24, 28, 31, 36];
        inst.brass(t, maj.map(n), 4.2, 0.55, d, { attack: 0.9, peakCut: 3200, restCut: 1600 });
        for (let k = 0; k < 14; k++) inst.taiko(t + k * 0.07, 0.2 + 0.05 * k, d);
        inst.crash(t + 1.0, 1, d, 3);
        maj.concat([40, 43, 48]).forEach((semi, k) => inst.lead(t + 1.0 + k * 0.11, n(semi + 12), 1.6, 0.35, d, 'bell'));
        this.setIntensity(0.12);
        break;
      }
      case 'ultimate': {
        const tt = t;
        inst.brass(tt, [n(0 + 12), n(7 + 12), n(12 + 12)], 2.6, 0.75, d, { attack: 0.12, peakCut: 2200, restCut: 420, drive: 3 });
        inst.osc(tt, 'sine', n(0), 2.4, 0.6, d, { attack: 0.05 });
        inst.noise(tt, 'pink', 1.2, 0.2, [['bandpass', 600, 0.7]], d, { attack: 0.1 });
        inst.taiko(tt, 1, d);
        break;
      }
      case 'phase': {
        const r = 1.2;
        inst.swell(t, r, 0.8, d);
        const tf = [196, 175, 147, 131, 110, 98];
        tf.forEach((f, k) => inst.tom(t + r - 0.6 + k * 0.1, f, 0.7, d));
        inst.crash(t + r, 0.9, d, 2.4);
        inst.kick(t + r, 1, d);
        break;
      }
    }
  }
}
