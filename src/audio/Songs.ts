/**
 * The jukebox records and the combat layer, written as small procedural
 * arrangements. Each song is a list of sections (chord per bar) and a `bar()`
 * function that schedules one bar of notes through `c.at(step, fn)`; the
 * MusicSystem calls it just ahead of time on the audio clock.
 */
import type { Band, BandStyle } from './Instruments';
import type { Rng } from './dsp';

export type ChordQ = 'maj' | 'min' | 'dom7' | 'maj7' | 'min7' | 'six' | 'dom9' | 'min6';
export interface Chord {
  /** pitch class 0..11 (C = 0) */
  root: number;
  q: ChordQ;
}

const INTERVALS: Record<ChordQ, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  six: [0, 4, 7, 9],
  dom9: [0, 4, 7, 10, 14],
  min6: [0, 3, 7, 9],
};

export const ch = (root: number, q: ChordQ = 'maj'): Chord => ({ root, q });
const pc = (m: number): number => ((m % 12) + 12) % 12;

/** lowest MIDI note >= lo with the chord's root pitch class */
export function rootAt(c: Chord, lo: number): number {
  return lo + pc(c.root - lo);
}

/** `n` consecutive chord tones going up from `lo` (close voicing) */
export function voicing(c: Chord, lo: number, n: number): number[] {
  const pcs = INTERVALS[c.q].map((i) => pc(c.root + i));
  const out: number[] = [];
  for (let m = lo; out.length < n && m < lo + 40; m++) if (pcs.includes(pc(m))) out.push(m);
  return out;
}

export interface BarCtx {
  t0: number;
  /** seconds per step */
  sd: number;
  steps: number;
  spb: number;
  beats: number;
  bar: number;
  sec: string;
  secBar: number;
  secLen: number;
  /** last bar of the section */
  last: boolean;
  chord: Chord;
  next: Chord;
  prev: Chord;
  b: Band;
  rng: Rng;
  /** schedule `fn` at `step` (fractional ok); `tight` = less humanization (drums) */
  at(step: number, fn: (t: number) => void, tight?: boolean): void;
  /** duration of `n` steps in seconds */
  s(n: number): number;
}

export interface Section {
  name: string;
  chords: Chord[];
  energy: number;
}

export interface SongDef {
  name: string;
  bpm: number;
  /** steps per beat: 3 = triplet / shuffle grid, 2 = eighths, 4 = sixteenths */
  spb: number;
  beats: number;
  style: BandStyle;
  seed: number;
  /** loudness trim so records play at similar levels */
  gain?: number;
  sections: Section[];
  bar(c: BarCtx): void;
}

export interface BarInfo {
  sec: string;
  secBar: number;
  secLen: number;
  chord: Chord;
  energy: number;
}

export function songBars(s: SongDef): BarInfo[] {
  const out: BarInfo[] = [];
  for (const sec of s.sections) sec.chords.forEach((chord, i) => out.push({ sec: sec.name, secBar: i, secLen: sec.chords.length, chord, energy: sec.energy }));
  return out;
}

// ---------------------------------------------------------------- lead lines

interface LN {
  s: number;
  n: number;
  d: number;
  /** bend up into the note (semitones) */
  b?: number;
  /** vibrato (cents) */
  v?: number;
  /** double stop: extra note this many semitones above */
  ds?: number;
  /** muted / chicken-picked */
  m?: boolean;
}
type Lick = LN[];
const L = (...a: [number, number, number, Partial<LN>?][]): Lick => a.map(([s, n, d, o]) => ({ s, n, d, ...(o ?? {}) }));

function playLick(c: BarCtx, lick: Lick, root: number, vel = 0.42, offset = 0): void {
  for (const x of lick) {
    const m = root + x.n;
    const st = x.s + offset;
    if (st < 0 || st >= c.steps) continue;
    const notes = x.ds !== undefined ? [m, m + x.ds] : [m];
    c.at(st, (t) => c.b.dyad(t, notes, c.s(x.d) * 0.95, x.ds !== undefined ? vel * 0.85 : vel, { lead: true, bend: x.b, vib: x.v, cluck: x.m, release: 0.05 }));
  }
}

/** Piano glissando through a scale between two notes over `span` steps. */
function gliss(c: BarCtx, step: number, from: number, to: number, span: number, scale: number[], vel = 0.2): void {
  const notes: number[] = [];
  const dir = to < from ? -1 : 1;
  for (let m = from; dir < 0 ? m >= to : m <= to; m += dir) if (scale.includes(pc(m))) notes.push(m);
  notes.forEach((m, i) => c.at(step + (i / notes.length) * span, (t) => c.b.piano(t, m, c.s(0.5), vel + 0.1 * (i / notes.length))));
}

/** Four bass notes walking from `from` toward the next chord root (last note adjacent to the target). */
function walkTo(from: number, to: number, scale: number[]): number[] {
  let tgt = to;
  while (tgt - from > 7) tgt -= 12;
  while (from - tgt > 7) tgt += 12;
  if (tgt === from) return [from, from + 7, from + 4, from + 2];
  const dir = tgt > from ? 1 : -1;
  const between: number[] = [];
  for (let m = from + dir; m !== tgt; m += dir) between.push(m);
  const diat = between.filter((m) => scale.includes(pc(m)));
  let three: number[];
  if (diat.length >= 3) three = diat.slice(-3);
  else {
    const set = new Set(diat);
    for (let i = between.length - 1; i >= 0 && set.size < 3; i--) set.add(between[i]);
    three = [...set].sort((a, b) => dir * (a - b));
    while (three.length < 3) three.unshift(from);
  }
  return [from, ...three.slice(-3)];
}

const MAJOR = (key: number): number[] => [0, 2, 4, 5, 7, 9, 11].map((i) => pc(key + i));

// ======================================================================
// (a) IRON HORSE SHUFFLE: 12-bar blues shuffle in A, 96 bpm, triplet grid
// ======================================================================

const A7 = ch(9, 'dom7');
const D7b = ch(2, 'dom7');
const E7 = ch(4, 'dom7');
const A9 = ch(9, 'dom9');
const BLUES12 = [A7, D7b, A7, A7, D7b, D7b, A7, A7, E7, D7b, A7, E7];

/** A minor pentatonic licks relative to A4, 12 triplet steps per bar */
const BLUES_LICKS: Lick[] = [
  L([0, 7, 3, { b: 2, v: 25 }], [3, 7, 2], [5, 5, 1], [6, 3, 2], [8, 0, 1], [9, 0, 3, { v: 30 }]),
  L([0, 12, 1], [1, 10, 1], [2, 7, 1], [3, 10, 1], [4, 7, 1], [5, 5, 1], [6, 7, 1], [7, 5, 1], [8, 3, 1], [9, 0, 3, { v: 30 }]),
  L([0, -5, 2], [2, -2, 1], [3, 0, 2, { b: 1 }], [5, 3, 1], [6, 6, 1], [7, 7, 2, { v: 20 }], [9, 3, 2], [11, 0, 1]),
  L([0, 15, 6, { b: 2, v: 35 }], [6, 12, 2], [8, 10, 1], [9, 12, 3, { v: 25 }]),
  L([0, 7, 1, { ds: 5 }], [1, 7, 1, { ds: 5 }], [2, 7, 1, { ds: 5 }], [3, 7, 1, { ds: 5 }], [4, 7, 1, { ds: 5 }], [5, 7, 1, { ds: 5 }], [6, 5, 2, { b: 1 }], [8, 3, 1], [9, 0, 3, { v: 30 }]),
  L([2, -12, 1], [3, -9, 2, { b: 1 }], [5, -7, 1], [6, -5, 2], [8, -7, 1], [9, -9, 1], [10, -12, 2, { v: 20 }]),
  L([0, 10, 8, { b: 2, v: 30 }], [9, 7, 1], [10, 5, 1], [11, 3, 1]),
  L([0, 0, 2], [2, 3, 1], [3, 5, 2, { b: 1 }], [5, 3, 1], [6, 0, 2], [8, -2, 1], [9, 0, 3, { v: 25 }]),
];
/** classic turnaround: descending line under a held E, then onto E7 */
const TURN_A = L([0, 0, 3, { ds: 7 }], [3, -1, 3, { ds: 8 }], [6, -2, 3, { ds: 9 }], [9, -3, 3, { ds: 10 }]);
const TURN_E = L([0, -5, 5, { ds: 4, v: 15 }], [6, -8, 1], [7, -7, 1], [8, -6, 1], [9, -5, 3, { ds: 7 }]);

const blues: SongDef = {
  name: 'Iron Horse Shuffle',
  bpm: 96,
  spb: 3,
  beats: 4,
  seed: 101,
  style: { amp: 'crunch', lead: 'rock', drums: 'vintage', organ: true, slap: 0.12 },
  sections: [
    { name: 'intro', chords: [E7, D7b, A7, E7], energy: 0.45 },
    { name: 'head', chords: BLUES12, energy: 0.55 },
    { name: 'head2', chords: BLUES12, energy: 0.6 },
    { name: 'solo', chords: BLUES12, energy: 0.72 },
    { name: 'head3', chords: BLUES12.slice(0, 11), energy: 0.62 },
    { name: 'end', chords: [A9], energy: 0.5 },
  ],
  bar(c) {
    const { b, rng, sec, secBar } = c;
    const K = 69;
    if (sec === 'end') {
      c.at(0, (t) => {
        b.kick(t, 0.95);
        b.crash(t, 0.7);
        b.bass(t, 33, c.s(9), 0.8);
        b.strum(t, [45, 52, 55, 59, 61, 64], c.s(10), 0.42, true, 0.014);
        b.organ(t, voicing(A9, 55, 4), c.s(10), 0.14);
      }, true);
      c.at(0, (t) => b.gtr(t + 0.03, K + 7, c.s(9), 0.4, { lead: true, bend: 2, vib: 35 }));
      return;
    }
    // drums: shuffle ride / hats on the beat + the third triplet
    const ride = sec === 'solo';
    for (let beat = 0; beat < 4; beat++) {
      const s0 = beat * 3;
      const acc = beat % 2 ? 0.1 : 0;
      c.at(s0, (t) => (ride ? b.ride(t, 0.5 + acc) : b.hat(t, 0.5 + acc)), true);
      c.at(s0 + 2, (t) => (ride ? b.ride(t, 0.32) : b.hat(t, 0.3)), true);
    }
    c.at(0, (t) => b.kick(t, 0.9), true);
    c.at(6, (t) => b.kick(t, 0.72), true);
    if (rng() < 0.45) c.at(5, (t) => b.kick(t, 0.38), true);
    if (rng() < 0.3) c.at(11, (t) => b.kick(t, 0.32), true);
    c.at(3, (t) => b.snare(t, 0.8), true);
    if (c.last) {
      c.at(9, (t) => b.snare(t, 0.55), true);
      c.at(10, (t) => b.snare(t, 0.65), true);
      c.at(11, (t) => b.snare(t, 0.8), true);
    } else {
      c.at(9, (t) => b.snare(t, 0.85), true);
      if (rng() < 0.5) c.at(8, (t) => b.snare(t, 0.5, 'ghost'), true);
    }
    if (secBar === 0 && sec !== 'intro') c.at(0, (t) => b.crash(t, 0.5), true);

    // bass: boogie walk 1 3 5 6 b7 6 5 3 (long-short)
    const br = rootAt(c.chord, 33);
    const walk = [0, 4, 7, 9, 10, 9, 7, 4];
    for (let k = 0; k < 8; k++) {
      const step = (k >> 1) * 3 + (k & 1) * 2;
      const m = br + walk[k];
      c.at(step, (t) => b.bass(t, m, c.s(k & 1 ? 1 : 2) * 0.9, k & 1 ? 0.5 : 0.66));
    }
    // rhythm guitar: R5 R6 Rb7 R6 shuffle dyads
    const gr = rootAt(c.chord, 40);
    const mv = [7, 9, 10, 9];
    for (let beat = 0; beat < 4; beat++)
      for (const sub of [0, 2]) {
        const top = gr + mv[beat];
        const long = sub === 0;
        c.at(beat * 3 + sub, (t) => b.dyad(t, [gr, top], c.s(long ? 1.8 : 0.9), long ? 0.42 : 0.32, { mute: !long, release: 0.03 }));
      }
    // organ: pads, or offbeat stabs in later choruses
    const ov = voicing(c.chord, 55, 4);
    if (sec === 'head2' || sec === 'head3') {
      c.at(5, (t) => b.organ(t, ov, c.s(1.4), 0.16));
      c.at(11, (t) => b.organ(t, ov, c.s(1.4), 0.16));
    } else c.at(0, (t) => b.organ(t, ov, c.s(11.7), sec === 'solo' ? 0.1 : 0.12));
    // lead guitar
    if (sec === 'intro') playLick(c, secBar === 0 ? BLUES_LICKS[1] : secBar === 1 ? BLUES_LICKS[3] : secBar === 2 ? TURN_A : TURN_E, K);
    else if (sec === 'solo') {
      if (secBar === 10) playLick(c, TURN_A, K);
      else if (secBar === 11) playLick(c, TURN_E, K);
      else playLick(c, BLUES_LICKS[Math.floor(rng() * BLUES_LICKS.length)], K, 0.44);
    } else {
      if (secBar === 3 || secBar === 7) playLick(c, BLUES_LICKS[[5, 7, 2, 0][Math.floor(rng() * 4)]], K, 0.36);
      if (secBar === 10) playLick(c, TURN_A, K, 0.36);
      if (secBar === 11) playLick(c, TURN_E, K, 0.36);
    }
  },
};

// ======================================================================
// (b) WHISKEY ROCKET: fast rock'n'roll in E, 160 bpm, straight eighths
// ======================================================================

const E = ch(4);
const A = ch(9);
const B7 = ch(11, 'dom7');
const E6 = ch(4, 'six');
const RR12 = [E, E, E, E, A, A, E, E, B7, A, E, B7];
const E_MAJ = MAJOR(4);

/** Chuck Berry style lines relative to the current chord root (8 steps per bar) */
const RR_LICKS: Lick[] = [
  L([0, 4, 1, { b: 1, ds: 3 }], [1, 4, 1, { ds: 3 }], [2, 4, 1, { ds: 3 }], [3, 4, 1, { ds: 3 }], [4, 7, 1, { ds: 5 }], [5, 7, 1, { ds: 5 }], [6, 4, 1, { ds: 3 }], [7, 0, 1]),
  L([0, 7, 0.6, { ds: 5 }], [0.667, 7, 0.6, { ds: 5 }], [1.333, 7, 0.6, { ds: 5 }], [2, 7, 0.6, { ds: 5 }], [2.667, 7, 0.6, { ds: 5 }], [3.333, 7, 0.6, { ds: 5 }], [4, 9, 1, { ds: 3 }], [5, 7, 1, { ds: 5 }], [6, 4, 2, { ds: 3, v: 20 }]),
  L([0, 0, 1], [1, 3, 0.5], [1.5, 4, 0.5], [2, 7, 1], [3, 9, 1], [4, 10, 1], [5, 9, 1], [6, 7, 1], [7, 4, 1]),
  L([0, 12, 2, { b: 2, v: 30 }], [2, 10, 1], [3, 7, 1], [4, 9, 1], [5, 7, 1], [6, 4, 2, { v: 20 }]),
  L([0, 7, 1, { b: 2, ds: 5 }], [1, 7, 1, { b: 2, ds: 5 }], [2, 7, 1, { b: 2, ds: 5 }], [3, 7, 1, { b: 2, ds: 5 }], [4, 12, 2, { v: 25 }], [6, 9, 1], [7, 7, 1]),
  L([0, -5, 1], [1, -3, 1], [2, -2, 1], [3, 0, 1], [4, 3, 1, { b: 1 }], [5, 0, 1], [6, -5, 2]),
];

function pianoSolo(c: BarCtx): void {
  const b = c.b;
  const tri = voicing(c.chord, 72, 3);
  const rr = rootAt(c.chord, 72);
  switch (c.secBar % 4) {
    case 0: // pounding triplet chords
      for (let i = 0; i < 12; i++) c.at(i * (2 / 3), (t) => b.chordPiano(t, tri, c.s(0.5), i % 3 === 0 ? 0.3 : 0.22));
      break;
    case 1: // trill on the third and fourth
      for (let i = 0; i < 14; i++) c.at(i * 0.5, (t) => b.piano(t, rr + (i % 2 ? 5 : 4), c.s(0.45), 0.24));
      c.at(7, (t) => b.chordPiano(t, tri, c.s(0.9), 0.3));
      break;
    case 2: // gliss down, then stabs
      gliss(c, 0, 91, 72, 3.5, E_MAJ, 0.18);
      c.at(4, (t) => b.chordPiano(t, tri, c.s(1), 0.3));
      c.at(6, (t) => b.chordPiano(t, tri, c.s(1), 0.3));
      break;
    default: {
      // bluesy right hand with a grace-note crush (b3 -> 3)
      const line: [number, number][] = [[0, 3], [0.25, 4], [1, 7], [2, 12], [3, 10], [3.5, 7], [4, 9], [5, 7], [6, 4], [7, 0]];
      for (const [s, n] of line) c.at(s, (t) => b.piano(t, rr + n, c.s(0.9), 0.28));
    }
  }
  const lh = rootAt(c.chord, 40);
  for (const k of [0, 2, 4, 6]) c.at(k, (t) => {
    b.piano(t, lh, c.s(1.8), 0.2);
    b.piano(t, lh + 12, c.s(1.8), 0.16);
  });
}

const rock: SongDef = {
  name: 'Whiskey Rocket',
  bpm: 160,
  spb: 2,
  beats: 4,
  seed: 202,
  gain: 0.95,
  style: { amp: 'rock', lead: 'rock', drums: 'rock', piano: true, honky: 0.6, slap: 0.22 },
  sections: [
    { name: 'intro', chords: [E, E, E, B7], energy: 0.7 },
    { name: 'v1', chords: RR12, energy: 0.8 },
    { name: 'v2', chords: RR12, energy: 0.85 },
    { name: 'gsolo', chords: RR12, energy: 0.95 },
    { name: 'psolo', chords: RR12, energy: 0.9 },
    { name: 'v3', chords: RR12.slice(0, 11), energy: 0.9 },
    { name: 'end', chords: [E6, E6], energy: 0.85 },
  ],
  bar(c) {
    const { b, rng, sec, secBar } = c;
    const lr = rootAt(c.chord, 60);
    if (sec === 'intro' && secBar < 2) {
      // unaccompanied guitar intro, drum pickup into the band
      playLick(c, RR_LICKS[secBar === 0 ? 0 : 1], 64, 0.46);
      if (secBar === 1) {
        c.at(6, (t) => b.snare(t, 0.5), true);
        c.at(7, (t) => b.snare(t, 0.7), true);
        c.at(7.5, (t) => b.snare(t, 0.8), true);
      }
      return;
    }
    if (sec === 'end') {
      const v = [47, 52, 56, 61, 64];
      if (secBar === 0) {
        for (let i = 0; i < 16; i++) c.at(i * 0.5, (t) => b.strum(t, v, c.s(0.45), 0.2 + i * 0.01, i % 2 === 0, 0.004, { release: 0.02 }));
        for (let i = 0; i < 16; i++) c.at(i * 0.5, (t) => b.snare(t, 0.22 + i * 0.035), true);
        c.at(0, (t) => b.bass(t, 40, c.s(7.8), 0.7, 'pick'));
        c.at(0, (t) => b.crash(t, 0.45), true);
        gliss(c, 4, 76, 88, 3.6, E_MAJ, 0.16);
      } else {
        c.at(0, (t) => {
          b.kick(t, 1);
          b.crash(t, 0.8);
          b.bass(t, 28, c.s(7), 0.85, 'pick');
          b.strum(t, [40, ...v], c.s(7.5), 0.45, true, 0.012);
          b.chordPiano(t, [64, 68, 71, 73, 76], c.s(7), 0.32);
        }, true);
        c.at(0, (t) => b.gtr(t + 0.03, 76, c.s(7), 0.38, { lead: true, vib: 30 }));
      }
      return;
    }
    const stop = sec === 'psolo' && secBar < 4;
    // drums
    if (!stop) {
      const ride = sec === 'gsolo';
      for (let i = 0; i < 8; i++) c.at(i, (t) => (ride ? b.ride(t, i % 2 ? 0.3 : 0.48) : b.hat(t, i % 2 ? 0.3 : 0.48)), true);
      c.at(0, (t) => b.kick(t, 0.95), true);
      c.at(4, (t) => b.kick(t, 0.85), true);
      if (rng() < 0.35) c.at(3, (t) => b.kick(t, 0.5), true);
      if (rng() < 0.3) c.at(7, (t) => b.kick(t, 0.45), true);
      c.at(2, (t) => b.snare(t, 0.9), true);
      if (c.last) {
        c.at(5, (t) => b.snare(t, 0.6), true);
        c.at(6, (t) => b.snare(t, 0.75), true);
        c.at(6.5, (t) => b.snare(t, 0.7), true);
        c.at(7, (t) => b.snare(t, 0.85), true);
        c.at(7.5, (t) => b.snare(t, 0.9), true);
      } else c.at(6, (t) => b.snare(t, 0.9), true);
      if (secBar === 0) c.at(0, (t) => b.crash(t, 0.55), true);
    } else
      c.at(0, (t) => {
        b.kick(t, 0.95);
        b.crash(t, 0.55);
      }, true);
    // bass boogie
    const br = rootAt(c.chord, 28);
    const walk = [0, 4, 7, 9, 10, 9, 7, 4];
    if (!stop)
      for (let k = 0; k < 8; k++) {
        const m = br + walk[k];
        c.at(k, (t) => b.bass(t, m, c.s(0.85), k % 2 ? 0.55 : 0.68, 'pick'));
      }
    else c.at(0, (t) => b.bass(t, br + 12, c.s(1.5), 0.75, 'pick'));
    // rhythm guitar: Chuck Berry 5-6 dyads
    const gr = rootAt(c.chord, 40);
    if (!stop)
      for (let k = 0; k < 8; k++) {
        const top = gr + ((k >> 1) % 2 ? 9 : 7);
        c.at(k, (t) => b.dyad(t, [gr, top], c.s(0.8), 0.37, { mute: true }));
      }
    else c.at(0, (t) => b.strum(t, [gr, gr + 7, gr + 12, gr + 16], c.s(1.5), 0.42, true, 0.01));
    // piano
    const pv = voicing(c.chord, 64, 3);
    if (sec === 'v1' || sec === 'v3') for (let k = 0; k < 8; k++) c.at(k, (t) => b.chordPiano(t, pv, c.s(0.6), k % 2 ? 0.3 : 0.22));
    else if (sec === 'v2' || sec === 'gsolo') for (const k of [1, 3, 5, 7]) c.at(k, (t) => b.chordPiano(t, pv, c.s(0.5), 0.28));
    else if (sec === 'intro') for (const k of [0, 2, 4, 6]) c.at(k, (t) => b.chordPiano(t, pv, c.s(0.9), 0.2));
    else if (sec === 'psolo') pianoSolo(c);
    // lead guitar
    if (sec === 'gsolo') playLick(c, RR_LICKS[Math.floor(rng() * RR_LICKS.length)], lr, 0.44);
    else if (sec === 'v2' && (secBar === 3 || secBar === 7)) playLick(c, RR_LICKS[[2, 5, 3][Math.floor(rng() * 3)]], lr, 0.36);
    if (c.last && sec !== 'v3' && sec !== 'psolo') gliss(c, 4, 88, 74, 3.5, E_MAJ, 0.16);
  },
};

// ======================================================================
// (c) DUST & DIESEL: country two-step in G, 120 bpm, sixteenth grid
// ======================================================================

const G = ch(7);
const C = ch(0);
const D = ch(2);
const D7 = ch(2, 'dom7');
const Em = ch(4, 'min');
const G6 = ch(7, 'six');
const VERSE = [G, G, C, C, G, G, D7, D7, G, G, C, C, G, D7, G, G];
const CHORUS = [C, C, G, G, D, D, G, G, C, C, G, Em, C, D7, G, G];
const G_MAJ = MAJOR(7);

const OPEN: Record<string, number[]> = {
  '7maj': [43, 47, 50, 55, 59, 67],
  '0maj': [48, 52, 55, 60, 64],
  '2maj': [50, 57, 62, 66],
  '2dom7': [50, 57, 60, 66],
  '4min': [40, 47, 52, 55, 59, 64],
  '7six': [43, 47, 50, 52, 59, 64],
};
const openVoicing = (c: Chord): number[] => OPEN[c.root + c.q] ?? voicing(c, 48, 4);

/** telecaster fills relative to G4, on beats 3-4 of a 16-step bar */
const TELE: Lick[] = [
  L([8, 7, 1, { m: true }], [9, 4, 1, { m: true }], [10, 2, 1, { m: true }], [11, 0, 1, { m: true }], [12, -3, 1, { m: true }], [13, -5, 1, { m: true }], [14, -3, 1], [15, 0, 1]),
  L([8, 4, 4, { b: 2 }], [12, 2, 2], [14, 0, 2, { v: 15 }]),
  L([8, -5, 1], [9, -4, 1], [10, -3, 1], [11, 0, 2], [13, 2, 1], [14, 4, 2]),
  L([8, -8, 2, { ds: 8 }], [10, -7, 2, { ds: 9 }], [12, -5, 2, { ds: 9 }], [14, -3, 2, { ds: 8 }]),
  L([8, 4, 2, { b: 1, ds: 3 }], [10, 4, 2, { ds: 3 }], [12, 0, 4, { v: 15 }]),
  L([8, 12, 1, { m: true }], [9, 9, 1, { m: true }], [10, 7, 1, { m: true }], [11, 9, 1, { m: true }], [12, 7, 1, { m: true }], [13, 4, 1, { m: true }], [14, 2, 1], [15, 4, 1, { b: 1 }]),
];

const country: SongDef = {
  name: 'Dust & Diesel',
  bpm: 120,
  spb: 4,
  beats: 4,
  seed: 303,
  gain: 1.15,
  style: { amp: 'clean', lead: 'twang', drums: 'brush', steel: true, slap: 0.25 },
  sections: [
    { name: 'intro', chords: [D7, D7, G, G], energy: 0.5 },
    { name: 'verse', chords: VERSE, energy: 0.6 },
    { name: 'chorus', chords: CHORUS, energy: 0.7 },
    { name: 'solo', chords: VERSE, energy: 0.75 },
    { name: 'chorus2', chords: CHORUS, energy: 0.72 },
    { name: 'tag', chords: [C, D7, G, G6], energy: 0.6 },
  ],
  bar(c) {
    const { b, rng, sec, secBar } = c;
    const K = 67;
    if (sec === 'tag' && secBar === 3) {
      c.at(0, (t) => {
        b.kick(t, 0.8);
        b.crash(t, 0.35);
        b.bass(t, 43, c.s(12), 0.7);
        b.strum(t, openVoicing(G6), c.s(14), 0.32, true, 0.016);
        b.steel(t, [71, 76], c.s(14), 0.12, -2);
      }, true);
      return;
    }
    const chorus = sec === 'chorus' || sec === 'chorus2';
    // drums: boom on 1 & 3, chick on 2 & 4
    c.at(0, (t) => b.kick(t, 0.85), true);
    c.at(8, (t) => b.kick(t, 0.7), true);
    if (rng() < 0.3) c.at(14, (t) => b.kick(t, 0.35), true);
    c.at(4, (t) => b.snare(t, 0.8), true);
    c.at(12, (t) => b.snare(t, 0.85), true);
    if (chorus || sec === 'solo') for (const s of [2, 6, 10, 14]) c.at(s, (t) => b.snare(t, 0.3, 'ghost'), true);
    for (let s = 0; s < 16; s += 2) c.at(s, (t) => b.hat(t, s % 4 === 2 ? 0.36 : 0.26), true);
    if (c.last) for (const s of [13, 14, 15]) c.at(s, (t) => b.snare(t, 0.4 + (s - 12) * 0.1), true);
    if (secBar === 0 && sec !== 'intro') c.at(0, (t) => b.crash(t, 0.35), true);
    // bass: root / fifth, walking into chord changes
    const br = rootAt(c.chord, 36);
    const changing = c.next.root !== c.chord.root && (secBar % 2 === 1 || c.last);
    if (changing) {
      walkTo(br, rootAt(c.next, 36), G_MAJ).forEach((m, i) => c.at(i * 4, (t) => b.bass(t, m, c.s(3.4), i ? 0.45 : 0.55)));
    } else {
      const fifth = br - 5 >= 31 ? br - 5 : br + 7;
      c.at(0, (t) => b.bass(t, br, c.s(6), 0.56));
      c.at(8, (t) => b.bass(t, fifth, c.s(6), 0.48));
    }
    // rhythm guitar "chick" on 2 & 4 (+ light up-strums in the chorus)
    const ov = openVoicing(c.chord);
    c.at(4, (t) => b.strum(t, ov, c.s(2.2), 0.24, true, 0.009));
    c.at(12, (t) => b.strum(t, ov, c.s(2.2), 0.24, true, 0.009));
    if (chorus) {
      c.at(6, (t) => b.strum(t, ov.slice(-3), c.s(1), 0.13, false, 0.007));
      c.at(14, (t) => b.strum(t, ov.slice(-3), c.s(1), 0.13, false, 0.007));
    }
    // pedal steel swells every two bars
    if (sec !== 'solo' && secBar % 2 === 0) {
      const sv = voicing(c.chord, 64, 2);
      const slide = rng() < 0.6 ? -2 : 0;
      c.at(0, (t) => b.steel(t + 0.02, sv, c.s(30), 0.12, slide));
    }
    // telecaster
    if (sec === 'intro') {
      if (secBar === 1) playLick(c, TELE[0], K, 0.4);
      if (secBar === 3) playLick(c, TELE[2], K, 0.4);
    } else if (sec === 'solo') {
      playLick(c, TELE[Math.floor(rng() * TELE.length)], K, 0.42, -8);
      playLick(c, TELE[Math.floor(rng() * TELE.length)], K, 0.42);
    } else if (sec === 'tag') {
      if (secBar === 2) playLick(c, TELE[5], K, 0.4);
    } else if (secBar % 4 === 3) playLick(c, TELE[Math.floor(rng() * TELE.length)], K, 0.36);
  },
};

// ======================================================================
// (d) BOOTH BY THE WINDOW: 50s doo-wop ballad in Bb, 72 bpm, 12/8
// ======================================================================

const Bb = ch(10);
const Gm = ch(7, 'min');
const Eb = ch(3);
const F7 = ch(5, 'dom7');
const Ebm = ch(3, 'min');
const G7 = ch(7, 'dom7');
const Cm = ch(0, 'min');
const Bb6 = ch(10, 'six');
const DW_A = [Bb, Gm, Eb, F7, Bb, Gm, Eb, F7];
const DW_BRIDGE = [Eb, Ebm, Bb, G7, Cm, F7, Bb, F7];

type Mel = [number, number, number][];
/** sax melody [step, semitones above Bb3, steps] per bar */
const MEL_A: Mel[] = [
  [[0, 16, 6], [6, 14, 3], [9, 12, 3]],
  [[0, 12, 3], [3, 9, 6], [9, 4, 3]],
  [[0, 5, 3], [3, 9, 3], [6, 12, 3], [9, 14, 3]],
  [[0, 16, 6], [6, 14, 3], [9, 11, 3]],
  [[0, 12, 9], [9, 7, 3]],
  [[0, 9, 3], [3, 11, 3], [6, 12, 3], [9, 16, 3]],
  [[0, 17, 6], [6, 16, 3], [9, 14, 3]],
  [[0, 14, 6], [6, 11, 3], [9, 14, 3]],
];
const MEL_A2_END: Mel = [[0, 14, 3], [3, 11, 3], [6, 12, 6]];
const MEL_BRIDGE: Mel[] = [
  [[0, 9, 9], [9, 12, 3]],
  [[0, 8, 9], [9, 12, 3]],
  [[0, 7, 6], [6, 4, 6]],
  [[0, 4, 6], [6, 7, 3], [9, 9, 3]],
  [[0, 5, 9], [9, 9, 3]],
  [[0, 11, 6], [6, 14, 3], [9, 17, 3]],
  [[0, 16, 12]],
  [[0, 14, 6], [6, 11, 3], [9, 7, 3]],
];
const MEL_OUT: Mel[] = [[[0, 16, 6], [6, 14, 3], [9, 12, 3]], [[0, 12, 12]], [[0, 9, 3], [3, 12, 3], [6, 14, 6]], [[0, 14, 6], [6, 11, 6]], [[0, 12, 22]], []];

const doowop: SongDef = {
  name: 'Booth by the Window',
  bpm: 72,
  spb: 3,
  beats: 4,
  seed: 404,
  gain: 1.3,
  style: { amp: 'jazz', drums: 'vintage', piano: true, sax: true, voc: true, honky: 0.12 },
  sections: [
    { name: 'intro', chords: [Bb, Gm, Eb, F7], energy: 0.25 },
    { name: 'a1', chords: DW_A, energy: 0.3 },
    { name: 'a2', chords: DW_A, energy: 0.32 },
    { name: 'bridge', chords: DW_BRIDGE, energy: 0.36 },
    { name: 'a3', chords: DW_A, energy: 0.34 },
    { name: 'outro', chords: [Bb, Gm, Eb, F7, Bb6, Bb6], energy: 0.25 },
  ],
  bar(c) {
    const { b, rng, sec, secBar } = c;
    const final = sec === 'outro' && secBar >= 4;
    if (final && secBar === 5) return; // let the last chord ring
    // drums: soft triplet ride, backbeat
    if (!final) {
      for (let s = 0; s < 12; s++) c.at(s, (t) => b.ride(t, s % 3 === 0 ? 0.3 : 0.17), true);
      c.at(0, (t) => b.kick(t, 0.62), true);
      c.at(6, (t) => b.kick(t, 0.42), true);
      c.at(3, (t) => b.snare(t, 0.5), true);
      c.at(9, (t) => b.snare(t, 0.55), true);
      if (c.last && sec !== 'outro') {
        c.at(10, (t) => b.snare(t, 0.3), true);
        c.at(11, (t) => b.snare(t, 0.4), true);
      }
    } else
      c.at(0, (t) => {
        b.kick(t, 0.6);
        b.ride(t, 0.4, true);
      }, true);
    // piano: the classic repeated triplet chords
    if (!final) {
      const pv = voicing(c.chord, 62, 3);
      for (let s = 0; s < 12; s++) c.at(s, (t) => b.chordPiano(t, pv, c.s(0.9), s % 3 === 0 ? 0.15 : 0.1));
      const lh = rootAt(c.chord, 46);
      c.at(0, (t) => b.piano(t, lh, c.s(5), 0.16));
      c.at(6, (t) => b.piano(t, lh + 7, c.s(5), 0.12));
    } else [46, 53, 58, 62, 65, 67, 70].forEach((m, i) => c.at(i * 0.35, (t) => b.piano(t, m, c.s(20), 0.2)));
    // upright bass: root, fifth, octave, chromatic approach
    if (!final) {
      const br = rootAt(c.chord, 34);
      const nr = rootAt(c.next, 34);
      const appr = nr === br ? br + 5 : nr + (nr > br ? -1 : 1);
      c.at(0, (t) => b.bass(t, br, c.s(5), 0.7, 'upright'));
      c.at(6, (t) => b.bass(t, br + 7, c.s(3), 0.55, 'upright'));
      c.at(9, (t) => b.bass(t, br + 12, c.s(2), 0.5, 'upright'));
      c.at(11, (t) => b.bass(t, appr, c.s(1), 0.5, 'upright'));
    } else c.at(0, (t) => b.bass(t, 34, c.s(20), 0.7, 'upright'));
    // backing vocals
    const vv = voicing(c.chord, 55, 3);
    if (sec === 'intro' || (sec === 'outro' && !final)) {
      // "doo .. doo .. doo-doo waah"
      c.at(0, (t) => b.ooh(t, vv, c.s(2.2), 0.13, 'oo', 0.03));
      c.at(3, (t) => b.ooh(t, vv, c.s(2.2), 0.13, 'oo', 0.03));
      c.at(6, (t) => b.ooh(t, vv, c.s(0.9), 0.12, 'oo', 0.02));
      c.at(7, (t) => b.ooh(t, vv, c.s(0.9), 0.12, 'oo', 0.02));
      c.at(9, (t) => b.ooh(t, vv, c.s(2.6), 0.15, 'ah', 0.05));
    } else if (final) c.at(0, (t) => b.ooh(t, [58, 62, 67], c.s(22), 0.15, 'ah', 0.4));
    else c.at(0, (t) => b.ooh(t, vv, c.s(11.6), 0.11, sec === 'bridge' ? 'ah' : 'oo', 0.25));
    // tenor sax melody
    const mel =
      sec === 'a1' || sec === 'a3'
        ? MEL_A[secBar]
        : sec === 'a2'
          ? secBar === 7
            ? MEL_A2_END
            : MEL_A[secBar]
          : sec === 'bridge'
            ? MEL_BRIDGE[secBar]
            : sec === 'outro'
              ? MEL_OUT[secBar]
              : null;
    if (mel)
      for (const [s, n, d] of mel) {
        const scoop = rng() < 0.35 ? 1 : 0;
        c.at(s, (t) => b.sax(t, 58 + n, c.s(d) * 0.97, 0.3, scoop, d >= 6 ? 18 : 10));
      }
  },
};

export const SONGS: SongDef[] = [blues, rock, country, doowop];

// ======================================================================
// combat layer (non-diegetic): driving drums, palm-muted power chords, bass
// ======================================================================

export const COMBAT_FALLBACK = { bpm: 140, spb: 2, beats: 4, chords: [ch(4, 'min'), ch(4, 'min'), ch(0), ch(2)] };

/** One bar of the combat layer following `c.chord` and the song's grid. `x` = intensity 0..1. */
export function combatBar(c: BarCtx, x: number, idx: number): void {
  const { b } = c;
  const spb = c.spb;
  const triplet = spb === 3;
  const pulse = spb === 4 ? 2 : 1;
  const n = Math.round(c.steps / pulse);
  const tier = x < 0.3 ? 0 : x < 0.62 ? 1 : 2;
  const phrase = idx % 4;
  const br = rootAt(c.chord, 28);
  const gr = rootAt(c.chord, 40);
  const acc = triplet ? [1, 0, 1] : n === 8 ? [1, 0, 0, 1, 0, 0, 1, 0] : [1, 0];
  // cymbals
  for (let i = 0; i < n; i++) {
    const s = i * pulse;
    const onBeat = s % spb === 0;
    if (tier === 2) c.at(s, (t) => b.ride(t, onBeat ? 0.42 : 0.26), true);
    else c.at(s, (t) => b.hat(t, onBeat ? 0.5 : 0.3, phrase === 3 && i === n - 1), true);
  }
  // kick / snare backbone
  for (let beat = 0; beat < c.beats; beat++) {
    const s = beat * spb;
    const off = triplet ? 2 : pulse;
    if (beat % 2 === 0) {
      c.at(s, (t) => b.kick(t, 0.95), true);
      if (tier >= 1) c.at(s + off, (t) => b.kick(t, 0.6), true);
    } else {
      c.at(s, (t) => b.snare(t, 0.9), true);
      if (tier === 2) c.at(s + off, (t) => b.kick(t, 0.55), true);
    }
  }
  if (tier >= 1 && phrase === 0) c.at(0, (t) => b.crash(t, 0.55), true);
  if (tier >= 1 && phrase === 3) {
    const s0 = (c.beats - 1) * spb;
    const fills = triplet ? [0, 1, 2] : spb === 4 ? [0, 1, 2, 3] : [0, 0.5, 1, 1.5];
    const toms = [196, 165, 131, 98];
    fills.forEach((f, i) => c.at(s0 + f, (t) => b.tom(t, toms[i], 0.8), true));
  }
  // bass + guitar
  const open = new Set<number>();
  if (tier === 2) {
    open.add(0);
    open.add(triplet ? 6 : n / 2);
  }
  for (let i = 0; i < n; i++) {
    const s = i * pulse;
    const a = acc[i % acc.length];
    const oct = i === n - 1 && idx % 2 === 1 ? 12 : 0;
    c.at(s, (t) => b.bass(t, br + oct, c.s(pulse) * 0.85, a ? 0.72 : 0.52, 'pick'));
    if (tier < 1) continue;
    if (open.has(i)) {
      c.at(s, (t) => b.dyad(t, [gr, gr + 7, gr + 12], c.s(pulse * 2.6), 0.5));
    } else if (!open.has(i - 1)) {
      c.at(s, (t) => b.dyad(t, [gr, gr + 7], c.s(pulse) * 0.8, a ? 0.52 : 0.37, { mute: true }));
    }
  }
}
