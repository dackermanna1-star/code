// Checks for the generative café music: musically valid output (diatonic, chord tones on strong
// beats, sane ranges, no clashes), structure (key cycle, variation), samples and calibrated level.
import { describe, expect, it } from 'vitest';
import {
  BAR_SEC, BEAT, BPM, CHORDS, Composer, KEYS, MUSIC_TARGET_DB, MUSIC_TRIM, SWING,
  keyOfBar, renderMusicOffline, slotTime, type BarInfo,
} from '../src/audio/music';
import { INSTRUMENTS, renderNote, type Inst } from '../src/audio/instruments';
import { allFinite, gainToDb, integratedDb, peak, rms } from '../src/audio/dsp';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const inKey = (midi: number, key: number) => MAJOR.includes((((midi - key) % 12) + 12) % 12);
const RANGE: Record<Inst, [number, number]> = { uke: [55, 76], marimba: [60, 88], glock: [74, 96], bass: [36, 60], shaker: [0, 1], kick: [0, 1], brush: [0, 1] };
const PITCHED = new Set<Inst>(['uke', 'marimba', 'glock', 'bass']);
const CYCLE = 2 + 32 * 3 + 4; // intro + three key cycles + a little

function bars(seed: number, n = CYCLE): BarInfo[] {
  const c = new Composer(seed);
  return Array.from({ length: n }, () => c.next());
}

describe('composer', () => {
  it('runs at ~100 BPM with a light swing', () => {
    expect(BPM).toBeGreaterThanOrEqual(90);
    expect(BPM).toBeLessThanOrEqual(110);
    expect(slotTime(1) / BEAT).toBeCloseTo(SWING, 6);
    expect(SWING).toBeGreaterThan(0.52);
    expect(SWING).toBeLessThan(0.67);
    expect(BAR_SEC).toBeCloseTo(4 * BEAT, 9);
  });

  for (const seed of [1, 2, 3, 4]) {
    it(`seed ${seed}: valid notes, diatonic, chord tones on strong beats, no clashes`, () => {
      let strong = 0;
      let strongChordTones = 0;
      for (const bar of bars(seed)) {
        expect(bar.notes.length).toBeGreaterThan(4);
        const key = bar.transpose;
        const nextKey = keyOfBar(bar.index + 1);
        for (const n of bar.notes) {
          expect(INSTRUMENTS).toContain(n.part);
          expect(n.t).toBeGreaterThanOrEqual(0);
          expect(n.t).toBeLessThan(BAR_SEC);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          const [lo, hi] = RANGE[n.part];
          expect(n.midi).toBeGreaterThanOrEqual(lo);
          expect(n.midi).toBeLessThanOrEqual(hi);
          // approach tones may already belong to the next bar's key
          if (PITCHED.has(n.part)) expect([bar.index, n.part, n.midi, inKey(n.midi, key) || inKey(n.midi, nextKey)]).toEqual([bar.index, n.part, n.midi, true]);
        }
        const mel = bar.notes.filter((n) => n.part === 'marimba');
        for (let i = 1; i < mel.length; i++) expect(mel[i].t - mel[i - 1].t).toBeGreaterThan(0.03);
        for (const n of mel) {
          const beat = Math.abs(n.t) < 0.01 ? 0 : Math.abs(n.t - 2 * BEAT) < 0.01 ? 1 : -1;
          if (beat < 0) continue;
          strong++;
          const chord = CHORDS[bar.chords[beat === 0 ? 0 : 1]];
          if (chord.pcs.some((pc) => (((n.midi - key - pc) % 12) + 12) % 12 === 0)) strongChordTones++;
        }
      }
      expect(strongChordTones / strong).toBeGreaterThan(0.85);
    });
  }

  it('moves through keys, each cycle ending on the dominant of the next', () => {
    expect(keyOfBar(0)).toBe(KEYS[0]);
    for (let cycle = 0; cycle < 6; cycle++) {
      const first = 2 + cycle * 32;
      const key = KEYS[cycle % KEYS.length];
      const next = KEYS[(cycle + 1) % KEYS.length];
      for (let b = first; b < first + 31; b++) expect(keyOfBar(b)).toBe(key);
      expect(keyOfBar(first + 31)).toBe(next);
    }
    // the cycle's last bar is a G7 shape (V7) transposed into the next key
    const last = bars(7)[2 + 31];
    expect(last.chords[1]).toBe('G7');
    expect(last.transpose).toBe(KEYS[1]);
  });

  it('never repeats a phrase exactly', () => {
    const all = bars(11);
    const phrase = (start: number) =>
      all.slice(start, start + 8).map((b) => b.notes.filter((n) => n.part === 'marimba').map((n) => n.midi - b.transpose).join(',')).join('|');
    const a0 = phrase(2);
    const a1 = phrase(2 + 32);
    const a2 = phrase(2 + 64);
    expect(a0).not.toBe(a1);
    expect(a1).not.toBe(a2);
  });
});

describe('instrument samples', () => {
  it('every note the composer can ask for renders clean', () => {
    const needed = new Set<string>();
    for (const seed of [1, 2, 3]) for (const bar of bars(seed)) for (const n of bar.notes) needed.add(`${n.part}:${n.midi}`);
    const sr = 32000;
    for (const key of needed) {
      const [part, m] = key.split(':');
      const b = renderNote(part as Inst, Number(m), sr);
      expect(allFinite(b)).toBe(true);
      expect(b.length / sr).toBeGreaterThan(0.05);
      const p = peak(b);
      expect(p).toBeGreaterThan(0.1);
      expect(p).toBeLessThanOrEqual(0.75);
      // has (mostly) decayed naturally before the closing fade, and ends in silence (no click)
      if (PITCHED.has(part as Inst)) {
        const fadeStart = b.length - Math.round(0.16 * sr);
        expect([key, rms(b, fadeStart - Math.round(0.02 * sr), fadeStart) / p < 0.1]).toEqual([key, true]);
      }
      expect(rms(b, b.length - Math.round(0.01 * sr)) / p).toBeLessThan(0.01);
      expect(Math.abs(b[b.length - 1])).toBeLessThan(1e-4);
    }
  });
});

describe('mix level', () => {
  it('MUSIC_TRIM brings the music to its target loudness, with plenty of headroom', () => {
    const sr = 32000;
    for (const seed of [1, 2]) {
      const { audio } = renderMusicOffline(70, sr, seed);
      expect(allFinite(audio)).toBe(true);
      const needed = MUSIC_TARGET_DB - integratedDb(audio, sr);
      expect(Math.abs(gainToDb(MUSIC_TRIM) - needed)).toBeLessThan(1.5);
      expect(peak(audio) * MUSIC_TRIM).toBeLessThan(0.5);
    }
  }, 60000);
});
