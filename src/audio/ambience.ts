// Biome ambience beds: slowly evolving detuned drones + filtered noise layers + sparse random
// one-shots (drips, rumbles, creaks, wind, insects, machinery...). Everything is kept quiet: the
// beds sit under the SFX and should be felt more than heard.

import type { Kit, NoiseKind, Vowel } from './synth';
import type { AmbienceId } from './types';

type EventFn = (k: Kit, v: number) => void;

interface DroneLayer {
  type: OscillatorType;
  notes: number[];
  /** ± detune spread in cents (two oscillators per note). */
  detune: number;
  /** Lowpass cutoff wander range [lo, hi] Hz (ignored when `vowel` is set). */
  cutoff: [number, number];
  /** Lowpass resonance in dB. */
  q: number;
  gain: number;
  /** Filter LFO rate (Hz). */
  lfo: number;
  /** Optional slow tremolo [rate Hz, depth fraction]. */
  trem?: [number, number];
  /** Route through a formant bank (choir-ish) instead of a lowpass. */
  vowel?: Vowel;
}

interface NoiseLayer {
  kind: NoiseKind;
  ftype: BiquadFilterType;
  freq: [number, number];
  q: number;
  gain: number;
  lfo: number;
  /** Slow amplitude gusting depth (fraction of gain). */
  gust?: number;
}

interface EventDef {
  fn: EventFn;
  /** Mean seconds between occurrences (Poisson-ish). */
  every: number;
  vol: number;
  /** Fraction of instances that sound distant (darker, wetter). */
  far?: number;
}

export interface ReverbProfile {
  feedback: number;
  damp: number;
  wet: number;
}

export interface BedDef {
  level: number;
  reverb: ReverbProfile;
  drones: DroneLayer[];
  noises: NoiseLayer[];
  events: EventDef[];
  /** Reverb send for events. */
  eventWet: number;
}

// ------------------------------------------------------------------ ambient one-shots
const drip: EventFn = (k, v) => {
  const f = k.r(900, 2600);
  k.tone('sine', f, f * k.r(1.5, 1.9), 0, 0.05, 0.35 * v, k.out, 0.001);
  k.click(0, 0.05 * v, 3000, k.out, 0.004);
  if (k.chance(0.4)) {
    const at = k.r(0.3, 1.2);
    k.tone('sine', f * k.r(0.9, 1.1), f * 1.7, at, 0.05, 0.25 * v, k.out, 0.001);
  }
};

const rumble: EventFn = (k, v) => {
  const dur = k.r(2.5, 5);
  const g = k.gain(0);
  const lp = k.filter('lowpass', k.r(70, 130), 3, g);
  k.noise('brown', 0, dur, lp, 0.7);
  k.swell(g.gain, 0, dur * 0.35, 0.9 * v, dur * 0.15, dur * 0.5);
  k.tone('sine', k.r(32, 45), 28, 0, dur, 0.3 * v, k.out, dur * 0.3);
  if (k.chance(0.5)) for (let i = 0, n = k.ri(2, 5); i < n; i++) k.click(k.r(dur * 0.3, dur * 0.8), 0.04 * v, k.r(800, 2500), k.out, 0.02);
};

const creak: EventFn = (k, v) => {
  // Stick-slip wood creak: slow pulse train through wooden resonances.
  const dur = k.r(0.6, 1.6);
  const out = k.gain(1);
  const body = k.filter('bandpass', k.r(250, 400), 4, out);
  const bp = k.filter('bandpass', k.r(700, 1400), 7, out);
  const env = k.gain(0);
  env.connect(body);
  env.connect(bp);
  const base = k.r(25, 70);
  const o = k.osc('sawtooth', base, 0, dur, env);
  k.path(o.frequency, [
    [0, base],
    [dur * k.r(0.3, 0.6), base * k.r(1.2, 1.6)],
    [dur, base * k.r(0.7, 1)],
  ]);
  k.lfo(k.r(5, 11), base * 0.15, o.frequency, 'triangle', 0, dur);
  k.swell(env.gain, 0, dur * 0.3, 0.35 * v, dur * 0.3, dur * 0.4);
};

const pebbles: EventFn = (k, v) => {
  let t = 0;
  let gap = k.r(0.08, 0.16);
  let vol = 0.3 * v;
  for (let i = 0, n = k.ri(3, 8); i < n; i++) {
    k.click(t, vol, k.r(1500, 4000), k.out, 0.01);
    t += gap;
    gap *= 0.75;
    vol *= 0.8;
  }
};

const gust: EventFn = (k, v) => {
  const dur = k.r(2, 4);
  const g = k.gain(0);
  const bp = k.filter('bandpass', 300, 1.5, g);
  k.noise('pink', 0, dur, bp);
  k.path(bp.frequency, [
    [0, 300],
    [dur * 0.5, k.r(700, 1200)],
    [dur, 350],
  ]);
  k.swell(g.gain, 0, dur * 0.45, 0.5 * v, 0.1, dur * 0.5);
};

const howl: EventFn = (k, v) => {
  const dur = k.r(3, 5.5);
  const g = k.gain(0);
  const bp = k.filter('bandpass', 500, 9, g);
  k.noise('pink', 0, dur, bp);
  const f = k.r(380, 650);
  k.path(bp.frequency, [
    [0, f],
    [dur * 0.4, f * k.r(1.3, 1.7)],
    [dur, f * 0.9],
  ]);
  k.swell(g.gain, 0, dur * 0.4, 0.9 * v, dur * 0.2, dur * 0.4);
};

const chirps: EventFn = (k, v) => {
  const f = k.r(3800, 6500);
  const n = k.ri(2, 5);
  const total = n * 0.5;
  const gate = k.am(0.5, k.r(25, 45), 0.5, k.out, 'square', 0, total);
  for (let i = 0; i < n; i++) {
    k.tone('sine', f, f * 0.97, i * k.r(0.25, 0.45), k.r(0.08, 0.3), 0.06 * v, gate, 0.01);
  }
};

const croak: EventFn = (k, v) => {
  for (let i = 0, n = k.ri(1, 2); i < n; i++) {
    const at = i * k.r(0.5, 0.8);
    const dur = k.r(0.25, 0.45);
    const gate = k.am(0.5, k.r(12, 20), 0.5, k.out, 'square', at, dur);
    const bp = k.filter('bandpass', k.r(350, 600), 3, gate);
    k.tone('sawtooth', k.r(70, 110), 60, at, dur, 0.35 * v, bp, 0.02);
  }
};

const rustle: EventFn = (k, v) => {
  k.burst('crackle', 0, k.r(0.5, 1.2), 0.25 * v, 'bandpass', 2500, 1800, 0.8, k.out, 0.2);
  k.burst('pink', 0, k.r(0.5, 1.0), 0.06 * v, 'bandpass', 3000, 2000, 1, k.out, 0.2);
};

const moan: EventFn = (k, v) => {
  const f = k.r(90, 140);
  const dur = k.r(1.2, 2);
  k.fm(f, 1.5, 1.5, 0, dur, 0.12 * v, k.filter('lowpass', 600, 0), f * 0.7, 0.5, 0.4, 'sawtooth');
};

const clank: EventFn = (k, v) => {
  const f = k.r(180, 420);
  k.fm(f, 1.41, 3, 0, k.r(0.6, 1.4), 0.12 * v, k.out, f, 0.3, 0.001);
  k.fm(f * 2.37, 1.13, 2, 0, 0.4, 0.05 * v, k.out, f * 2.37, 0.2, 0.001);
  k.click(0, 0.2 * v, 2500, k.out, 0.008);
};

const thumps: EventFn = (k, v) => {
  const gap = k.r(0.35, 0.5);
  for (let i = 0, n = k.ri(3, 6); i < n; i++) {
    k.tone('sine', 70, 40, i * gap, 0.15, 0.3 * v, k.out, 0.002);
    k.burst('brown', i * gap, 0.1, 0.2 * v, 'lowpass', 500, 200, 0, k.out, 0.002);
  }
};

const steamPuff: EventFn = (k, v) => {
  k.burst('white', 0, k.r(0.6, 1.4), 0.12 * v, 'highpass', 2500, 4000, 0, k.out, 0.08);
};

const zapFar: EventFn = (k, v) => {
  const lp = k.filter('lowpass', 2500, 0);
  const o = k.tone('sawtooth', 80, 80, 0, 0.15, 0.2 * v, lp, 0.001);
  k.jitter(o.frequency, 0, 0.15, 80, 0.5, 8);
  k.burst('crackle', 0, 0.2, 0.3 * v, 'bandpass', 2000, 2000, 1, lp, 0.001);
};

const beep: EventFn = (k, v) => {
  const lp = k.filter('lowpass', 3000, 0);
  const f = k.pick([880, 1174.7, 1318.5]);
  k.tone('square', f, f, 0, 0.07, 0.035 * v, lp, 0.002);
  if (k.chance(0.5)) k.tone('square', f * 0.75, f * 0.75, 0.12, 0.07, 0.03 * v, lp, 0.002);
};

const servo: EventFn = (k, v) => {
  const bp = k.filter('bandpass', 900, 4);
  const dur = k.r(0.4, 0.8);
  const o = k.tone('sawtooth', 300, 300, 0, dur, 0.05 * v, bp, 0.05);
  k.path(o.frequency, [
    [0, 300],
    [dur * 0.5, 620],
    [dur, 380],
  ]);
};

const iceCrack: EventFn = (k, v) => {
  k.click(0, 0.3 * v, 4000, k.out, 0.006);
  k.tone('sine', k.r(2500, 3500), 1200, 0, 0.12, 0.08 * v, k.out, 0.001);
  for (let i = 0, n = k.ri(2, 5); i < n; i++) k.click(k.r(0.02, 0.3), k.r(0.05, 0.15) * v, k.r(3000, 7000), k.out, 0.005);
  k.burst('white', 0, 0.3, 0.06 * v, 'bandpass', 6000, 3000, 3, k.out, 0.002);
};

const tinkle: EventFn = (k, v) => {
  k.bell(k.r(2000, 3500), 0, 0.6, 0.05 * v);
};

const twinkle: EventFn = (k, v) => {
  const notes = [1760, 1975.5, 2217.5, 2637, 2960, 3520];
  let t = 0;
  for (let i = 0, n = k.ri(1, 3); i < n; i++) {
    k.bell(k.pick(notes), t, k.r(1.2, 2.2), 0.05 * v, k.out, 0.5);
    t += k.r(0.15, 0.4);
  }
};

const padNote: EventFn = (k, v) => {
  const f = k.pick([220, 277.18, 329.63, 440, 554.37]);
  const o = k.tone('sine', f, f, 0, 4, 0.06 * v, k.out, 1.5);
  k.lfo(4.5, 6, o.detune, 'sine', 0, 4);
};

const holyBell: EventFn = (k, v) => {
  const f = k.pick([587.33, 659.25, 739.99, 880, 987.77, 1174.66]);
  k.bell(f, 0, 3, 0.06 * v, k.out, 0.4);
};

const shimmer: EventFn = (k, v) => {
  k.burst('white', 0, 2.5, 0.025 * v, 'bandpass', 7000, 9000, 6, k.out, 1.0);
};

const bird: EventFn = (k, v) => {
  for (let i = 0, n = k.ri(2, 4); i < n; i++) {
    k.tone('sine', k.r(2400, 3000), k.r(3200, 4200), i * 0.12, 0.07, 0.05 * v, k.out, 0.005);
  }
};

const fireWhoosh: EventFn = (k, v) => {
  k.burst('pink', 0, 1.2, 0.12 * v, 'lowpass', 300, 900, 0, k.out, 0.4);
  k.burst('crackle', 0.2, 1.0, 0.05 * v, 'bandpass', 2000, 2000, 0.8, k.out, 0.3);
};

/**
 * Sparse "music": a soft, slow-decaying pluck (sine + quiet octave/fifth partials, lowpassed)
 * picked from a biome-specific minor scale, occasionally answered by a second note.
 */
function musicNotes(notes: readonly number[]): EventFn {
  return (k, v) => {
    const lp = k.filter('lowpass', k.r(900, 1600), 0);
    const phrase = k.chance(0.35) ? 2 : 1;
    let at = 0;
    for (let i = 0; i < phrase; i++) {
      const f = k.pick(notes);
      const dur = k.r(3, 4.5);
      k.tone('sine', f, f, at, dur, 0.07 * v, lp, 0.04);
      k.tone('triangle', f * 2, f * 2, at, dur * 0.5, 0.012 * v, lp, 0.03);
      k.tone('sine', f * 3, f * 3, at, dur * 0.3, 0.008 * v, lp, 0.02);
      at += k.r(0.8, 1.8);
    }
  };
}

// ------------------------------------------------------------------ bed definitions
const D = (
  type: OscillatorType,
  notes: number[],
  detune: number,
  cutoff: [number, number],
  q: number,
  gain: number,
  lfo: number,
  extra: Partial<DroneLayer> = {},
): DroneLayer => ({ type, notes, detune, cutoff, q, gain, lfo, ...extra });

const N = (
  kind: NoiseKind,
  ftype: BiquadFilterType,
  freq: [number, number],
  q: number,
  gain: number,
  lfo: number,
  gust?: number,
): NoiseLayer => ({ kind, ftype, freq, q, gain, lfo, gust });

const E = (fn: EventFn, every: number, vol: number, far = 0.5): EventDef => ({ fn, every, vol, far });

export const BEDS: Readonly<Record<Exclude<AmbienceId, 'none'>, BedDef>> = {
  // Gentle starry night: soft A-major-9 sine pad, faint breeze, distant twinkling bells.
  menu: {
    level: 0.9,
    reverb: { feedback: 0.82, damp: 3500, wet: 0.7 },
    drones: [
      D('sine', [110, 164.81, 277.18, 493.88], 6, [900, 1600], 0, 0.1, 0.05, { trem: [0.07, 0.3] }),
      D('triangle', [55, 82.41], 4, [300, 500], 0, 0.06, 0.03),
    ],
    noises: [N('pink', 'lowpass', [350, 650], 0, 0.025, 0.06, 0.6)],
    events: [E(twinkle, 2.8, 1, 0.3), E(padNote, 9, 1, 0)],
    eventWet: 0.9,
  },
  // Open air at the mountain foot: wind with gusts and whistles, faint low drone, rare birds.
  surface: {
    level: 1.1,
    reverb: { feedback: 0.5, damp: 3000, wet: 0.15 },
    drones: [D('sine', [49, 73.42], 5, [150, 260], 0, 0.04, 0.04)],
    noises: [
      N('pink', 'bandpass', [300, 650], 0.8, 0.14, 0.05, 0.6),
      N('white', 'bandpass', [2000, 3200], 6, 0.008, 0.09, 0.8),
    ],
    events: [E(gust, 7, 1, 0.3), E(bird, 14, 1, 0.5), E(creak, 22, 0.6, 1)],
    eventWet: 0.2,
  },
  // The Mines: low detuned A/E drone, room rumble, water drips, creaking timber, distant rumbles.
  mines: {
    level: 0.85,
    reverb: { feedback: 0.8, damp: 2400, wet: 0.55 },
    drones: [
      D('sawtooth', [55, 82.41], 9, [140, 320], 3, 0.1, 0.04, { trem: [0.05, 0.25] }),
      D('sine', [110, 164.81], 4, [400, 700], 0, 0.025, 0.07),
    ],
    noises: [N('brown', 'lowpass', [90, 160], 0, 0.08, 0.03)],
    events: [
      E(drip, 3.5, 1, 0.4),
      E(creak, 11, 1, 0.6),
      E(rumble, 16, 0.9, 1),
      E(pebbles, 13, 0.8, 0.6),
      E(moan, 40, 0.8, 1),
      E(musicNotes([110, 130.81, 146.83, 164.81, 196]), 24, 1, 0),
    ],
    eventWet: 0.75,
  },
  // Coal Pits: darker F/C/F# (tritone) drone, distant fire crackle bed, rumbles, steam, falling grit.
  coalpits: {
    level: 0.7,
    reverb: { feedback: 0.78, damp: 2000, wet: 0.5 },
    drones: [D('sawtooth', [43.65, 65.41, 92.5], 10, [110, 260], 4, 0.11, 0.035, { trem: [0.06, 0.3] })],
    noises: [
      N('brown', 'lowpass', [110, 190], 0, 0.1, 0.04),
      N('crackle', 'bandpass', [1400, 2200], 0.7, 0.015, 0.08, 0.7),
    ],
    events: [
      E(rumble, 10, 1, 1),
      E(steamPuff, 15, 0.8, 0.7),
      E(drip, 7, 0.8, 0.5),
      E(pebbles, 9, 0.9, 0.5),
      E(fireWhoosh, 18, 1, 1),
      E(musicNotes([87.31, 103.83, 123.47, 130.81]), 28, 1, 0),
    ],
    eventWet: 0.7,
  },
  // Snowy Depths: resonant howling wind, cold glassy E/B overtones over a deep drone, ice cracks.
  snow: {
    level: 1.0,
    reverb: { feedback: 0.84, damp: 3200, wet: 0.55 },
    drones: [
      D('sawtooth', [41.2, 61.74], 8, [110, 200], 2, 0.08, 0.03),
      D('sine', [329.63, 493.88], 5, [2000, 4000], 0, 0.014, 0.05, { trem: [0.09, 0.6] }),
    ],
    noises: [
      N('pink', 'bandpass', [380, 850], 4, 0.07, 0.05, 0.7),
      N('white', 'highpass', [3500, 5000], 0, 0.008, 0.07, 0.6),
    ],
    events: [E(howl, 9, 1, 0.4), E(gust, 8, 0.9, 0.3), E(iceCrack, 12, 1, 0.5), E(tinkle, 6, 1, 0.5), E(rumble, 25, 0.8, 1), E(musicNotes([164.81, 196, 246.94, 293.66]), 22, 1, 0)],
    eventWet: 0.7,
  },
  // Hiisi Base: throbbing 50 Hz machine hum, low industrial drone, clanks, steam, piston thumps.
  hiisi: {
    level: 0.9,
    reverb: { feedback: 0.72, damp: 2200, wet: 0.45 },
    drones: [
      D('square', [50, 100], 3, [220, 380], 2, 0.06, 0.06, { trem: [1.3, 0.35] }),
      D('sawtooth', [36.71, 55], 7, [90, 150], 2, 0.06, 0.03),
    ],
    noises: [N('brown', 'lowpass', [150, 250], 0, 0.06, 0.05)],
    events: [
      E(clank, 8, 1, 0.6),
      E(steamPuff, 12, 1, 0.5),
      E(thumps, 14, 1, 0.7),
      E(drip, 10, 0.7, 0.5),
      E(zapFar, 30, 0.6, 1),
    ],
    eventWet: 0.6,
  },
  // Underground Jungle: warm humid D minor drone, insect trills, drips, frog croaks, leaf rustles.
  jungle: {
    level: 1.1,
    reverb: { feedback: 0.76, damp: 3000, wet: 0.5 },
    drones: [
      D('triangle', [73.42, 110, 174.61], 8, [250, 520], 2, 0.08, 0.045, { trem: [0.08, 0.3] }),
    ],
    noises: [N('pink', 'lowpass', [700, 1100], 0, 0.03, 0.05, 0.4)],
    events: [
      E(chirps, 2.5, 1, 0.5),
      E(drip, 3, 0.9, 0.4),
      E(croak, 9, 1, 0.5),
      E(rustle, 12, 1, 0.4),
      E(moan, 30, 0.6, 1),
      E(musicNotes([146.83, 174.61, 220, 261.63]), 26, 1, 0),
    ],
    eventWet: 0.55,
  },
  // The Vault: 60 Hz electrical hum and faint high whine, deep C/G drone, zaps, beeps, servos.
  vault: {
    level: 1.25,
    reverb: { feedback: 0.7, damp: 4000, wet: 0.4 },
    drones: [
      D('sawtooth', [60, 120, 180], 2, [300, 480], 2, 0.05, 0.07, { trem: [0.5, 0.2] }),
      D('sine', [3900, 7800], 3, [9000, 12000], 0, 0.004, 0.05),
      D('sawtooth', [32.7, 49], 6, [80, 130], 2, 0.05, 0.03),
    ],
    noises: [
      N('white', 'bandpass', [8000, 10000], 4, 0.004, 0.07),
      N('brown', 'lowpass', [120, 180], 0, 0.05, 0.04),
    ],
    events: [E(zapFar, 6, 1, 0.5), E(beep, 9, 1, 0.3), E(servo, 13, 1, 0.5), E(clank, 11, 0.9, 0.6)],
    eventWet: 0.5,
  },
  // Holy Mountain: calm choir-like D major pad ("ah" formants), soft bells and shimmer.
  holymountain: {
    level: 1.1,
    reverb: { feedback: 0.86, damp: 3800, wet: 0.75 },
    drones: [
      D('sawtooth', [146.83, 220, 293.66, 369.99], 7, [0, 0], 0, 0.035, 0.05, { vowel: 'a', trem: [0.07, 0.35] }),
      D('sine', [73.42], 3, [300, 400], 0, 0.06, 0.03),
    ],
    noises: [],
    events: [E(holyBell, 5, 1, 0.3), E(shimmer, 12, 1, 0)],
    eventWet: 0.9,
  },
};

const AMBIENCE_IDS: ReadonlySet<string> = new Set(['none', ...Object.keys(BEDS)]);

export function normalizeAmbienceId(id: string): AmbienceId {
  return (AMBIENCE_IDS.has(id) ? id : 'none') as AmbienceId;
}

// ------------------------------------------------------------------ runtime bed
interface Wander {
  param: AudioParam;
  lo: number;
  hi: number;
}

interface EventVoice {
  end: number;
  nodes: AudioNode[];
}

const MAX_EVENT_VOICES = 6;

/** Exponentially distributed wait with mean `m`, clamped so nothing is ever too regular or too dense. */
function waitTime(m: number): number {
  return Math.min(m * 3, Math.max(m * 0.25, -Math.log(1 - Math.random()) * m));
}

export class AmbienceBed {
  readonly out: GainNode;
  private readonly droneBus: GainNode;
  private readonly evtBus: GainNode;
  private readonly sends: GainNode[] = [];
  private readonly sources: AudioScheduledSourceNode[];
  private readonly wander: Wander[] = [];
  private readonly drift: OscillatorNode[] = [];
  private readonly next: number[];
  private readonly events: EventVoice[] = [];
  private evolveAt: number;
  /** Absolute time after which this bed can be disposed (set by fadeOut). */
  stopAt = Infinity;

  constructor(
    readonly id: AmbienceId,
    private readonly def: BedDef,
    private readonly kit: Kit,
    dest: AudioNode,
    reverbIn: AudioNode,
    now: number,
  ) {
    const ctx = kit.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.droneBus = ctx.createGain();
    this.droneBus.connect(this.out);
    this.evtBus = ctx.createGain();
    this.evtBus.connect(this.out);
    const dSend = ctx.createGain();
    dSend.gain.value = 0.15;
    this.droneBus.connect(dSend);
    dSend.connect(reverbIn);
    const eSend = ctx.createGain();
    eSend.gain.value = def.eventWet;
    this.evtBus.connect(eSend);
    eSend.connect(reverbIn);
    this.sends.push(dSend, eSend);

    this.sources = kit.begin(this.droneBus, now, 1);
    for (const layer of def.drones) this.buildDrone(layer);
    for (const layer of def.noises) this.buildNoise(layer);

    this.next = def.events.map((e) => now + waitTime(e.every) * 0.6 + 1.5);
    this.evolveAt = now + 4;
  }

  private buildDrone(l: DroneLayer): void {
    const k = this.kit;
    const amp = k.gain(l.gain / Math.max(1, l.notes.length), this.droneBus);
    if (l.trem) k.lfo(l.trem[0] * k.r(0.8, 1.25), l.gain / Math.max(1, l.notes.length) * l.trem[1], amp.gain);
    let input: AudioNode;
    if (l.vowel) {
      input = k.formant(l.vowel, amp, 6);
    } else {
      const lp = k.filter('lowpass', (l.cutoff[0] + l.cutoff[1]) / 2, l.q, amp);
      const depth = (l.cutoff[1] - l.cutoff[0]) * 0.25;
      if (depth > 0) k.lfo(l.lfo * k.r(0.8, 1.25), depth, lp.frequency);
      this.wander.push({ param: lp.frequency, lo: l.cutoff[0] + depth, hi: Math.max(l.cutoff[0] + depth, l.cutoff[1] - depth) });
      input = lp;
    }
    const mix = k.gain(0.5, input);
    for (const f of l.notes) {
      for (const sign of [-1, 1]) {
        const o = k.oscForever(l.type, f, mix, sign * l.detune * k.r(0.6, 1.2));
        this.drift.push(o);
      }
    }
  }

  private buildNoise(l: NoiseLayer): void {
    const k = this.kit;
    const amp = k.gain(l.gain, this.droneBus);
    if (l.gust) k.lfo(k.r(0.05, 0.1), l.gain * l.gust * 0.6, amp.gain);
    const f = k.filter(l.ftype, (l.freq[0] + l.freq[1]) / 2, l.q, amp);
    const depth = (l.freq[1] - l.freq[0]) * 0.25;
    if (depth > 0) k.lfo(l.lfo * k.r(0.8, 1.25), depth, f.frequency);
    this.wander.push({ param: f.frequency, lo: l.freq[0] + depth, hi: Math.max(l.freq[0] + depth, l.freq[1] - depth) });
    k.noiseForever(l.kind, f, k.r(0.92, 1.08));
  }

  fadeIn(now: number, time: number): void {
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.def.level, now + time);
  }

  fadeOut(now: number, time: number): void {
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + time);
    this.stopAt = now + time + 0.1;
    for (const s of this.sources) {
      try {
        s.stop(this.stopAt);
      } catch {
        /* already stopped */
      }
    }
  }

  /** Slow evolution (filter wander, detune drift) + sparse random one-shots. */
  update(now: number): void {
    if (this.stopAt !== Infinity) return;
    const k = this.kit;
    // Evolve: wander a filter and drift some detunes every few seconds.
    if (now >= this.evolveAt) {
      this.evolveAt = now + k.r(5, 12);
      if (this.wander.length) {
        const w = this.wander[Math.floor(Math.random() * this.wander.length)];
        w.param.setTargetAtTime(k.r(w.lo, w.hi), now, k.r(3, 6));
      }
      for (let i = 0; i < 2 && this.drift.length; i++) {
        const o = this.drift[Math.floor(Math.random() * this.drift.length)];
        o.detune.setTargetAtTime(k.r(-14, 14), now, k.r(4, 8));
      }
    }
    // Reap finished event voices.
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].end <= now) {
        for (const n of this.events[i].nodes) n.disconnect();
        this.events.splice(i, 1);
      }
    }
    // Spawn events.
    for (let i = 0; i < this.def.events.length; i++) {
      if (now < this.next[i]) continue;
      const e = this.def.events[i];
      this.next[i] = now + waitTime(e.every);
      if (this.events.length >= MAX_EVENT_VOICES) continue;
      this.spawn(e, now);
    }
  }

  private spawn(e: EventDef, now: number): void {
    const k = this.kit;
    const ctx = k.ctx;
    const far = Math.random() < (e.far ?? 0.5);
    const g = ctx.createGain();
    g.gain.value = far ? k.r(0.35, 0.6) : k.r(0.7, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = far ? k.r(600, 1600) : k.r(4000, 12000);
    lp.Q.value = -3;
    g.connect(lp);
    const nodes: AudioNode[] = [g, lp];
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = k.r(-0.85, 0.85);
      lp.connect(p);
      p.connect(this.evtBus);
      nodes.push(p);
    } else {
      lp.connect(this.evtBus);
    }
    const t = now + 0.02;
    k.begin(g, t, k.r(0.95, 1.05));
    e.fn(k, e.vol);
    this.events.push({ end: t + k.end + 0.1, nodes });
  }

  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const ev of this.events) for (const n of ev.nodes) n.disconnect();
    this.events.length = 0;
    for (const s of this.sends) s.disconnect();
    this.droneBus.disconnect();
    this.evtBus.disconnect();
    this.out.disconnect();
  }
}
