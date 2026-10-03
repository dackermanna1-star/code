// Background music for Munch Lab: an original, endlessly varying "sunny café" loop.
//
//   ~100 BPM, light swing, C major, 7 chords (C Am F G G7 Dm Em)
//   ukulele strums / finger-picks (Karplus-Strong), marimba melody, round bass, glockenspiel
//   sparkles, shaker, and (in the "B" sections) a soft kick + brush backbeat.
//
// Everything here is pure: the Composer emits note events bar by bar (seconds relative to the
// start of the bar), the runtime schedules them with a look-ahead scheduler, and
// `renderMusicOffline` mixes the very same events into a Float32Array for unit tests.
//
// Structure (8-bar phrases, 4 phrases per cycle, two bars of intro on the first pass only):
//   A  : C  Am F  G7 | C  Am Dm G7        energy 1   (uke + bass + marimba, shaker from bar 3)
//   B  : F  G  Em Am | Dm G  C  Dm/G7     energy 2   (+ shaker, brush, kick, glock)
//   A2 : C  G  Am Em | F  C  Dm G7        energy 1.5
//   B2 : F  C  G  Am | F  Em Dm G7        energy 2   (ends on the dominant -> back to A)
// The melody is *composed per phrase* from rhythm cells + a random walk that is forced onto chord
// tones on strong beats, with call-and-answer repetition (bars 1-2 -> 3-4 -> 5-6 -> 7-8), so a
// cycle never repeats exactly. Each 32-bar cycle moves to a new key (C -> D -> A -> C ...): its
// last bar is played as the V7 of the next key, so every modulation is a plain dominant cadence.

import { Rng, clamp, dbToGain, integratedDb } from './dsp';
import { renderNote, type Inst } from './instruments';

export const BPM = 100;
export const BEAT = 60 / BPM;
export const BAR_SEC = BEAT * 4;
/** Position of the off-beat eighth inside a beat (0.5 = straight, 0.667 = full triplet swing). */
export const SWING = 0.6;
export const SLOTS_PER_BAR = 8;

export type ChordName = 'C' | 'Am' | 'F' | 'G' | 'G7' | 'Dm' | 'Em';
export interface ChordDef {
  /** pitch classes */
  pcs: readonly number[];
  /** ukulele voicing, strings G C E A (re-entrant GCEA tuning) as MIDI notes */
  uke: readonly number[];
  bass: { root: number; fifth: number; third: number };
}

export const CHORDS: Record<ChordName, ChordDef> = {
  C: { pcs: [0, 4, 7], uke: [67, 60, 64, 72], bass: { root: 48, fifth: 55, third: 52 } },
  Am: { pcs: [9, 0, 4], uke: [69, 60, 64, 69], bass: { root: 45, fifth: 52, third: 48 } },
  F: { pcs: [5, 9, 0], uke: [69, 60, 65, 69], bass: { root: 41, fifth: 48, third: 45 } },
  G: { pcs: [7, 11, 2], uke: [67, 62, 67, 71], bass: { root: 43, fifth: 50, third: 47 } },
  G7: { pcs: [7, 11, 2, 5], uke: [67, 62, 65, 71], bass: { root: 43, fifth: 50, third: 47 } },
  Dm: { pcs: [2, 5, 9], uke: [69, 62, 65, 69], bass: { root: 50, fifth: 45, third: 53 } },
  Em: { pcs: [4, 7, 11], uke: [67, 64, 67, 71], bass: { root: 52, fifth: 47, third: 55 } },
};

export type SectionName = 'intro' | 'A' | 'B' | 'A2' | 'B2';
type BarChords = ChordName | readonly [ChordName, ChordName];

const INTRO: readonly BarChords[] = ['C', 'G7'];
const SECTIONS: ReadonlyArray<{ name: SectionName; energy: number; bars: readonly BarChords[] }> = [
  { name: 'A', energy: 1, bars: ['C', 'Am', 'F', 'G7', 'C', 'Am', 'Dm', 'G7'] },
  { name: 'B', energy: 2, bars: ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', ['Dm', 'G7']] },
  { name: 'A2', energy: 1.5, bars: ['C', 'G', 'Am', 'Em', 'F', 'C', 'Dm', 'G7'] },
  { name: 'B2', energy: 2, bars: ['F', 'C', 'G', 'Am', 'F', 'Em', 'Dm', 'G7'] },
];

/** One note event. `t` is seconds from the start of its bar. */
export interface MusicNote {
  part: Inst;
  /** MIDI note for pitched parts; sample-variant index for shaker / kick / brush */
  midi: number;
  t: number;
  /** 0..1 */
  vel: number;
  /** playback detune in cents (unison strings, humanisation) */
  cents?: number;
  /** choke group: a new note in the same group damps the previous one (uke strings, bass) */
  ch?: string;
}

export interface BarInfo {
  /** absolute bar number since the start */
  index: number;
  section: SectionName;
  /** bar inside its 8-bar phrase (-1 during the intro) */
  barInPhrase: number;
  cycle: number;
  energy: number;
  chords: readonly [ChordName, ChordName];
  /** key of this bar in semitones above C */
  transpose: number;
  notes: MusicNote[];
}

/** Level of each part relative to its (peak-normalised) sample. */
export const PART_GAIN: Record<Inst, number> = {
  uke: 0.7,
  marimba: 0.55,
  glock: 0.3,
  bass: 0.52,
  shaker: 0.3,
  kick: 0.42,
  brush: 0.3,
};
export const PART_PAN: Record<Inst, number> = {
  uke: -0.25,
  marimba: 0.16,
  glock: 0.4,
  bass: 0,
  shaker: 0.3,
  kick: 0,
  brush: -0.2,
};
/** Overall music level target (integrated, K-weighted dB, pre-master) — sits well under the SFX reference. */
export const MUSIC_TARGET_DB = -32;
/**
 * Bus gain that brings the raw part mix (PART_GAIN x velocity) to MUSIC_TARGET_DB. Baked from
 * `renderMusicOffline` measurements; tests/audio.test.ts fails if it drifts by more than 1.5 dB.
 */
export const MUSIC_TRIM = 0.23;
/** Key of each 32-bar cycle (semitones from C). */
export const KEYS: readonly number[] = [0, 2, -3];

// ---------------------------------------------------------------------------------------------
// Scale helpers

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** Scale index -> MIDI (index 0 = C4). */
export function scaleMidi(idx: number): number {
  const o = Math.floor(idx / 7);
  const s = ((idx % 7) + 7) % 7;
  return 60 + o * 12 + MAJOR[s];
}
function isChordTone(idx: number, c: ChordDef): boolean {
  return c.pcs.includes(scaleMidi(idx) % 12);
}
/** Time (s) of an eighth-note slot within a bar, with swing. */
export function slotTime(slot: number): number {
  return (Math.floor(slot / 2) + (slot & 1 ? SWING : 0)) * BEAT;
}

// Melody register in scale indices: 3 = F4 (65) ... 14 = C6 (84)
const MEL_LO = 3;
const MEL_HI = 14;
const MEL_CENTER = 8;

type Cell = ReadonlyArray<readonly [slot: number, len: number]>;
const CELLS: readonly Cell[] = [
  [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2]],
  [[0, 3], [3, 1], [4, 2], [6, 1], [7, 1]],
  [[0, 2], [2, 2], [4, 4]],
  [[1, 1], [2, 1], [3, 2], [5, 1], [6, 2]],
  [[0, 1], [2, 1], [3, 1], [4, 3], [7, 1]],
  [[0, 4], [4, 2], [6, 2]],
  [[0, 2], [3, 1], [4, 1], [5, 1], [6, 2]],
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2]],
  [[2, 2], [4, 2], [6, 2]],
  [[0, 2], [3, 3], [6, 2]],
];
/** Cadence bars: the last note lands on beat 3 and rings. */
const END_CELLS: readonly Cell[] = [
  [[0, 2], [2, 1], [3, 1], [4, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 4]],
  [[0, 2], [3, 1], [4, 4]],
  [[0, 4], [4, 4]],
  [[1, 1], [2, 1], [3, 1], [4, 4]],
];
const STEP_VALUES = [-3, -2, -1, 0, 1, 2, 3];
const STEP_WEIGHTS = [0.05, 0.17, 0.29, 0.08, 0.29, 0.17, 0.05];

interface MelNote {
  slot: number;
  len: number;
  midi: number;
  vel: number;
  landing: boolean;
}

function chordAtSlot(bc: readonly [ChordName, ChordName], slot: number): ChordDef {
  return CHORDS[slot < 4 ? bc[0] : bc[1]];
}

function normBar(b: BarChords): readonly [ChordName, ChordName] {
  return typeof b === 'string' ? [b, b] : b;
}

/** Nearest chord tone (in scale steps) to `idx` inside the melody register. */
function snapToChord(idx: number, c: ChordDef, r: Rng): number {
  for (let d = 0; d <= 4; d++) {
    const order = d === 0 ? [0] : r.chance(0.5) ? [d, -d] : [-d, d];
    for (const s of order) {
      const k = idx + s;
      if (k >= MEL_LO && k <= MEL_HI && isChordTone(k, c)) return k;
    }
  }
  return clamp(idx, MEL_LO, MEL_HI);
}

function randomSteps(n: number, r: Rng, dir: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let d = r.weighted(STEP_VALUES, STEP_WEIGHTS);
    if (dir !== 0 && d !== 0 && r.chance(0.4)) d = Math.abs(d) * dir;
    out.push(d);
  }
  return out;
}

/** Composes the melody of one 8-bar phrase (array of 8 bars of notes). `cur` is a scale index. */
function composeMelody(chords: readonly (readonly [ChordName, ChordName])[], r: Rng, startIdx: number): { bars: MelNote[][]; last: number } {
  const bars: MelNote[][] = [];
  const cells: Cell[] = [];
  const steps: number[][] = [];
  const dir = r.pick([-1, 0, 0, 1]);
  const endA = r.pick(END_CELLS);
  const endB = r.pick(END_CELLS);
  const cellA1 = r.pick(CELLS);
  let cellA2 = r.pick(CELLS);
  if (cellA2 === cellA1) cellA2 = r.pick(CELLS);
  const cellB1 = r.pick(CELLS);
  const cellB2 = r.chance(0.5) ? cellA2 : r.pick(CELLS);
  cells.push(cellA1, cellA2, cellA1, endA, cellB1, cellB2, cellA1, endB);
  const stepsA1 = randomSteps(cellA1.length, r, dir);
  const stepsA2 = randomSteps(cellA2.length, r, dir);
  const stepsB1 = randomSteps(cellB1.length, r, -dir);
  const stepsB2 = cellB2 === cellA2 && r.chance(0.5) ? stepsA2.map((s) => -s) : randomSteps(cellB2.length, r, -dir);
  steps.push(
    stepsA1,
    stepsA2,
    stepsA1, // bar 3 answers bar 1 (same shape, new harmony)
    randomSteps(endA.length, r, -1),
    stepsB1,
    stepsB2,
    stepsA1,
    randomSteps(endB.length, r, -1),
  );

  let cur = startIdx;
  for (let b = 0; b < 8; b++) {
    const bc = chords[b];
    const cell = cells[b];
    const isEnd = b === 3 || b === 7;
    const out: MelNote[] = [];
    // chance to leave the very first bars empty so the uke / bass can set the scene
    for (let i = 0; i < cell.length; i++) {
      const [slot, len] = cell[i];
      const chord = chordAtSlot(bc, slot);
      let delta = steps[b][i] ?? 0;
      // variation of the repeated bars
      if ((b === 2 || b === 6) && r.chance(0.18)) delta += r.pick([-1, 1]);
      let k = cur + delta;
      // keep inside the register and drift back to the centre
      if (k > MEL_HI || k < MEL_LO) k = cur - delta;
      if (Math.abs(cur - MEL_CENTER) > 3 && Math.abs(k - MEL_CENTER) > Math.abs(cur - MEL_CENTER) && r.chance(0.6)) k = cur - delta;
      k = clamp(k, MEL_LO, MEL_HI);
      const last = i === cell.length - 1;
      const strong = slot === 0 || slot === 4 || len >= 3 || (b === 0 && i === 0) || (isEnd && last);
      if (strong || (len >= 2 && (slot & 1) === 0)) k = snapToChord(k, chord, r);
      // cadences: land on a stable tone, preferably root / third (leading tone over G7)
      if (isEnd && last) {
        const pick = chord.pcs.length === 4 ? r.pick([11, 2, 11]) : b === 7 ? r.weighted([chord.pcs[0], chord.pcs[1], chord.pcs[2]], [0.55, 0.3, 0.15]) : r.pick(chord.pcs);
        let best = k;
        let bd = 99;
        for (let c = MEL_LO; c <= MEL_HI; c++) {
          if (scaleMidi(c) % 12 !== pick) continue;
          const d = Math.abs(c - cur) + Math.abs(c - MEL_CENTER) * 0.15;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        k = best;
      }
      // avoid sitting on the same note for too long
      if (k === cur && i > 0 && !strong && r.chance(0.5)) {
        const alt = k + r.pick([-1, 1]);
        if (alt >= MEL_LO && alt <= MEL_HI) k = alt;
      }
      const phraseLift = 0.04 * Math.sin((Math.PI * (b + 0.5)) / 8);
      out.push({
        slot,
        len,
        midi: scaleMidi(k),
        vel: clamp((strong ? 0.82 : 0.66) + phraseLift + r.range(-0.07, 0.07), 0.3, 1),
        landing: isEnd && last,
      });
      cur = k;
    }
    bars.push(out);
  }
  return { bars, last: cur };
}

// ---------------------------------------------------------------------------------------------
// Accompaniment patterns

type Strum = readonly [slot: number, dir: 'd' | 'u', vel: number];
const STRUMS: readonly (readonly Strum[])[] = [
  // "folk": D . D U . U D U
  [[0, 'd', 0.85], [2, 'd', 0.5], [3, 'u', 0.48], [5, 'u', 0.45], [6, 'd', 0.6], [7, 'u', 0.38]],
  // "chuck" on 2 and 4
  [[0, 'd', 0.55], [2, 'd', 0.62], [3, 'u', 0.34], [6, 'd', 0.66], [7, 'u', 0.34]],
  // steady with soft off-beat ups
  [[0, 'd', 0.85], [2, 'd', 0.55], [3, 'u', 0.3], [4, 'd', 0.7], [6, 'd', 0.55], [7, 'u', 0.3]],
  // syncopated
  [[0, 'd', 0.85], [3, 'u', 0.48], [4, 'd', 0.6], [5, 'u', 0.4], [7, 'u', 0.4]],
];
/** Finger-picking: string index (0..3 = G C E A) per eighth slot, -1 = rest. */
const PICKS: readonly (readonly number[])[] = [
  [1, 2, 3, 2, 0, 2, 3, 2],
  [1, 3, 2, 3, 0, 3, 2, 3],
  [0, 2, 3, 2, 1, 2, 3, -1],
  [1, -1, 3, 2, 0, -1, 3, 2],
];

type BassKind = 'r' | '5' | '3' | 'o' | 'a';
type BassHit = readonly [slot: number, kind: BassKind, vel: number];
const BASS_PATTERNS: readonly (readonly BassHit[])[] = [
  [[0, 'r', 0.95], [3, 'r', 0.55], [4, '5', 0.75], [7, 'a', 0.5]],
  [[0, 'r', 0.95], [2, '5', 0.6], [4, 'r', 0.8], [6, '5', 0.6]],
  [[0, 'r', 0.95], [2, '3', 0.65], [4, '5', 0.75], [6, 'a', 0.6]],
  [[0, 'r', 0.95], [5, '5', 0.55]],
  [[0, 'r', 0.95], [3, '5', 0.6], [4, 'o', 0.7], [7, 'a', 0.45]],
];

/** Diatonic approach note below the next root (in the major key `key` semitones above C). */
function approachBelow(nextRoot: number, key: number): number {
  return MAJOR.includes((((nextRoot - 1 - key) % 12) + 12) % 12) ? nextRoot - 1 : nextRoot - 2;
}

/** Key (transposition from C) of absolute bar `index`; a cycle's final bar already sits in the next key. */
export function keyOfBar(index: number): number {
  if (index < INTRO.length) return KEYS[0];
  const k = index - INTRO.length;
  const phraseNo = Math.floor(k / 8);
  const cycle = Math.floor(phraseNo / SECTIONS.length);
  const lastBarOfCycle = phraseNo % SECTIONS.length === SECTIONS.length - 1 && k % 8 === 7;
  return KEYS[(cycle + (lastBarOfCycle ? 1 : 0)) % KEYS.length];
}

// ---------------------------------------------------------------------------------------------
// Composer

export class Composer {
  private rng: Rng;
  private bar = 0;
  private cur = 9; // melody scale index (A5-ish start)
  private melody: MelNote[][] = [];
  private ukePat = 0;
  private bassPat = 0;
  private pickStyle = false;

  constructor(seed = 1) {
    this.rng = new Rng(seed * 2654435 + 17);
  }

  /** Absolute index of the next bar that `next()` will return. */
  get position(): number {
    return this.bar;
  }

  next(): BarInfo {
    const r = this.rng;
    const index = this.bar++;
    let section: SectionName;
    let energy: number;
    let barInPhrase: number;
    let cycle = 0;
    let bc: readonly [ChordName, ChordName];
    let nextBc: readonly [ChordName, ChordName];
    const introLen = INTRO.length;
    if (index < introLen) {
      section = 'intro';
      energy = 1;
      barInPhrase = -1;
      bc = normBar(INTRO[index]);
      nextBc = index + 1 < introLen ? normBar(INTRO[index + 1]) : normBar(SECTIONS[0].bars[0]);
    } else {
      const k = index - introLen;
      const phraseNo = Math.floor(k / 8);
      barInPhrase = k % 8;
      cycle = Math.floor(phraseNo / SECTIONS.length);
      const sec = SECTIONS[phraseNo % SECTIONS.length];
      section = sec.name;
      energy = sec.energy;
      bc = normBar(sec.bars[barInPhrase]);
      if (barInPhrase < 7) nextBc = normBar(sec.bars[barInPhrase + 1]);
      else nextBc = normBar(SECTIONS[(phraseNo + 1) % SECTIONS.length].bars[0]);
      if (barInPhrase === 0) this.planPhrase(sec, phraseNo, cycle);
    }

    const tr = keyOfBar(index);
    const trNext = keyOfBar(index + 1);
    const notes: MusicNote[] = [];
    const hum = () => r.bi() * 0.005;
    const withHum = (n: MusicNote): MusicNote => ((n.t = Math.max(0, n.t + hum())), n);

    // --- ukulele ---------------------------------------------------------------------------
    const intro = section === 'intro';
    const usePick = this.pickStyle && energy < 2 && !(r.chance(0.12));
    if (usePick) {
      const pat = PICKS[(this.ukePat + (barInPhrase & 4 ? 1 : 0)) % PICKS.length];
      for (let s = 0; s < 8; s++) {
        const si = pat[s];
        if (si < 0) continue;
        const chord = chordAtSlot(bc, s);
        const accent = s === 0 ? 1 : s % 2 === 0 ? 0.78 : 0.62;
        notes.push(withHum({ part: 'uke', midi: chord.uke[si] + tr, t: slotTime(s), vel: clamp(0.62 * accent + r.range(-0.06, 0.06), 0.2, 1), ch: `u${si}` }));
      }
    } else {
      const pat = STRUMS[(this.ukePat + (energy >= 2 && r.chance(0.3) ? 2 : 0)) % STRUMS.length];
      for (const [slot, dir, vel] of pat) {
        if (intro && index === 0 && slot > 0 && r.chance(0.3)) continue;
        this.strum(notes, chordAtSlot(bc, slot), slotTime(slot), dir, vel * (1 + r.range(-0.1, 0.1)), r, tr);
      }
    }

    // --- bass ------------------------------------------------------------------------------
    if (!(intro && index === 0)) {
      const pat = BASS_PATTERNS[(this.bassPat + (barInPhrase === 3 || barInPhrase === 7 ? 4 : 0)) % BASS_PATTERNS.length];
      for (const [slot, kind, vel] of pat) {
        const chord = chordAtSlot(bc, slot);
        const b = chord.bass;
        let midi = b.root + tr;
        if (kind === '5') midi = b.fifth + tr;
        else if (kind === '3') midi = b.third + tr;
        else if (kind === 'o') midi = (b.root + 12 > 55 ? b.root : b.root + 12) + tr;
        // approach the *sounding* next root (which may already be in the next key)
        else if (kind === 'a') midi = approachBelow(CHORDS[nextBc[0]].bass.root + trNext, trNext);
        // never approach a note we are already on
        if (kind === 'a' && midi === b.root + tr && bc[0] === nextBc[0]) midi = b.fifth + tr;
        notes.push(withHum({ part: 'bass', midi, t: slotTime(slot), vel: clamp(vel + r.range(-0.07, 0.07), 0.2, 1), ch: 'b' }));
      }
    }

    // --- melody ----------------------------------------------------------------------------
    if (!intro) {
      for (const n of this.melody[barInPhrase] ?? []) {
        const t = slotTime(n.slot);
        notes.push(withHum({ part: 'marimba', midi: n.midi + tr, t, vel: n.vel }));
        if (n.landing && n.len >= 4) notes.push({ part: 'glock', midi: (n.midi + 12 > 91 ? n.midi : n.midi + 12) + tr, t: t + 0.004, vel: 0.5 });
        else if (n.len >= 2 && n.slot > 0 && (n.slot & 1) === 0 && r.chance(0.12)) {
          // tiny grace note from one scale step below (never on the downbeat: it would sound as a
          // simultaneous second with the main note)
          const below = scaleMidi(this.midiToIdx(n.midi) - 1);
          notes.push({ part: 'marimba', midi: below + tr, t: t - 0.07, vel: n.vel * 0.45 });
        }
      }
    }

    // --- glockenspiel sparkles (phrase turnarounds + section starts) ---------------------------
    if (!intro && (barInPhrase === 7 || (barInPhrase === 0 && energy >= 2) || (barInPhrase === 4 && energy >= 2 && r.chance(0.5)))) {
      if (barInPhrase !== 7 || r.chance(0.7)) {
        const chord = barInPhrase === 7 ? CHORDS[nextBc[0]] : CHORDS[bc[0]];
        const tones = chord.pcs.slice(0, 3).map((pc) => 79 + ((((pc - 79) % 12) + 12) % 12)).sort((a, b) => a - b);
        const ordered = r.chance(0.3) ? tones.slice().reverse() : tones;
        const t0 = barInPhrase === 7 ? slotTime(5) : slotTime(r.pick([0, 2]));
        const trG = barInPhrase === 7 ? trNext : tr;
        ordered.forEach((m, i) => notes.push({ part: 'glock', midi: m + trG, t: t0 + i * 0.13, vel: 0.5 - i * 0.07 }));
      }
    }

    // --- percussion --------------------------------------------------------------------------
    const shakerOn = energy >= 1.5 || intro || barInPhrase >= 2;
    if (shakerOn) {
      const sparse = energy < 1.5 && !intro;
      for (let s = 0; s < 8; s++) {
        if (r.chance(0.07)) continue;
        if (sparse && s % 2 === 0 && s !== 0) continue;
        const off = s & 1;
        const vel = (off ? 0.55 : 0.3) * (s === 5 || s === 1 ? 1 : 0.9) * (sparse ? 0.8 : 1);
        notes.push({ part: 'shaker', midi: off && (s === 3 || s === 7) ? 1 : 0, t: Math.max(0, slotTime(s) + r.bi() * 0.003), vel: clamp(vel + r.range(-0.06, 0.06), 0.1, 1) });
      }
    }
    if (energy >= 2) {
      notes.push({ part: 'kick', midi: 0, t: 0, vel: 0.5 + r.range(-0.05, 0.05) });
      notes.push({ part: 'kick', midi: 1, t: slotTime(4), vel: 0.34 + r.range(-0.05, 0.05) });
      notes.push({ part: 'brush', midi: 0, t: slotTime(2) + 0.004, vel: 0.55 + r.range(-0.05, 0.05) });
      notes.push({ part: 'brush', midi: 1, t: slotTime(6) + 0.004, vel: 0.45 + r.range(-0.05, 0.05) });
    } else if (energy >= 1.5 && barInPhrase >= 4) {
      notes.push({ part: 'brush', midi: 0, t: slotTime(2) + 0.004, vel: 0.32 });
      notes.push({ part: 'brush', midi: 1, t: slotTime(6) + 0.004, vel: 0.26 });
    }

    notes.sort((a, b) => a.t - b.t);
    return { index, section, barInPhrase, cycle, energy, chords: bc, transpose: tr, notes };
  }

  private midiToIdx(m: number): number {
    for (let i = -7; i < 28; i++) if (scaleMidi(i) === m) return i;
    return MEL_CENTER;
  }

  private strum(notes: MusicNote[], chord: ChordDef, t: number, dir: 'd' | 'u', vel: number, r: Rng, tr: number): void {
    const order = dir === 'd' ? [0, 1, 2, 3] : [3, 2, 1, 0];
    const gaps = dir === 'd' ? 0.011 : 0.008;
    const w = dir === 'd' ? [1, 0.9, 0.82, 0.78] : [1, 0.85, 0.7, 0.62];
    const t0 = t + r.bi() * 0.004;
    order.forEach((si, k) => {
      const midi = chord.uke[si];
      // re-entrant unison strings (same pitch twice): detune slightly so they shimmer instead of doubling in phase
      const dup = chord.uke.indexOf(midi) !== si;
      notes.push({
        part: 'uke',
        midi: midi + tr,
        t: Math.max(0, t0 + k * gaps),
        vel: clamp(vel * w[k] * (1 + r.range(-0.08, 0.08)), 0.1, 1),
        cents: dup ? 5 : r.range(-1.5, 1.5),
        ch: `u${si}`,
      });
    });
  }

  private planPhrase(sec: { name: SectionName; energy: number; bars: readonly BarChords[] }, phraseNo: number, cycle: number): void {
    const r = this.rng;
    const chords = sec.bars.map(normBar);
    // keep the line continuous: restart close to the previous landing note
    const { bars, last } = composeMelody(chords, r, clamp(this.cur + r.pick([-1, 0, 0, 1]), MEL_LO + 1, MEL_HI - 2));
    this.cur = last;
    this.melody = bars;
    // the first bars of some phrases are left to the rhythm section
    if (r.chance(phraseNo === 0 ? 1 : 0.3)) this.melody[0] = [];
    // after a few cycles shuffle in a couple of fully "open" bars to keep it breathing
    if (cycle > 0 && r.chance(0.25)) this.melody[4] = [];
    this.ukePat = r.int(0, STRUMS.length - 1);
    this.bassPat = r.int(0, BASS_PATTERNS.length - 2);
    this.pickStyle = sec.energy < 2 && r.chance(0.35);
  }
}

// ---------------------------------------------------------------------------------------------
// Offline rendering (tests / calibration)

const sampleCache = new Map<string, Float32Array>();
/** Cached instrument sample (peak-normalised). */
export function sampleFor(part: Inst, midi: number, sr: number): Float32Array {
  const key = `${part}:${midi}:${sr}`;
  let s = sampleCache.get(key);
  if (!s) {
    s = renderNote(part, midi, sr);
    sampleCache.set(key, s);
  }
  return s;
}

/** A choked note fades with this time constant (s) from the moment the next note in its group starts ... */
export const CHOKE_TC = 0.012;
/** ... and is cut this long (s) after it. */
export const CHOKE_CUT = 0.1;

/**
 * Mixes `bars` bars from a fresh composer into a mono buffer, exactly like the runtime player does
 * (part gains x velocity, detune, choke groups). `parts` renders a subset (for balance checks).
 */
export function renderMusicOffline(
  bars: number,
  sr: number,
  seed = 1,
  startBar = 0,
  parts?: readonly Inst[],
): { audio: Float32Array; infos: BarInfo[] } {
  const comp = new Composer(seed);
  const infos: BarInfo[] = [];
  const total = Math.ceil((bars * BAR_SEC + 2.5) * sr);
  const out = new Float32Array(total);
  const evs: { n: MusicNote; at: number; choke: number }[] = [];
  for (let b = 0; b < startBar + bars; b++) {
    const info = comp.next();
    if (b < startBar) continue;
    infos.push(info);
    const base = (b - startBar) * BAR_SEC;
    for (const n of info.notes) evs.push({ n, at: base + n.t, choke: Infinity });
  }
  evs.sort((a, b) => a.at - b.at);
  const lastIn = new Map<string, { at: number; choke: number }>();
  for (const e of evs) {
    if (!e.n.ch) continue;
    const prev = lastIn.get(e.n.ch);
    if (prev && e.at > prev.at) prev.choke = Math.min(prev.choke, e.at);
    lastIn.set(e.n.ch, e);
  }
  for (const { n, at: atSec, choke } of evs) {
    if (parts && !parts.includes(n.part)) continue;
    const src = sampleFor(n.part, n.midi, sr);
    const g = n.vel * PART_GAIN[n.part];
    const at = Math.round(atSec * sr);
    const rate = n.cents ? Math.pow(2, n.cents / 1200) : 1;
    const chokeAt = Number.isFinite(choke) ? Math.round((choke - atSec) * sr) : Infinity;
    const len = Math.min(Math.floor((src.length - 1) / rate), chokeAt + Math.round(CHOKE_CUT * sr));
    const kChoke = Math.exp(-1 / (CHOKE_TC * sr));
    let env = 1;
    for (let i = 0; i < len && at + i < total; i++) {
      const p = i * rate;
      const k = Math.floor(p);
      if (i >= chokeAt) env *= kChoke;
      out[at + i] += (src[k] + (src[k + 1] - src[k]) * (p - k)) * g * env;
    }
  }
  return { audio: out, infos };
}

/** Gain (linear) that brings the offline mix to `MUSIC_TARGET_DB`. Used by tests; the runtime bakes `MUSIC_TRIM`. */
export function musicTrimFor(buf: Float32Array, sr: number): number {
  return dbToGain(MUSIC_TARGET_DB - integratedDb(buf, sr));
}
