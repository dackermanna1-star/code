// The time-of-day palette (src/render/env/tod.ts, read-only here): one night
// from sunset (chapter 1) through blue hour (chapter 2) to deep night
// (chapter 3). Pure data and interpolation, no WebGL.
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../src/config/chapters';
import { todAt, type TodState } from '../src/render/env/tod';
import todSource from '../src/render/env/tod.ts?raw';

/** Every number in a palette (scalars and RGB triples), by field. */
function numbers(s: TodState): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'number') out.push([k, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => out.push([`${k}[${i}]`, x as number]));
  }
  return out;
}

describe('time of day (todAt)', () => {
  it('the key moments are in order, from 0 (sunset) to 1 (deep night)', () => {
    // KEYS is private to tod.ts: read its times from the source (entries open with "[\n    <t>,").
    const src = todSource;
    const body = src.slice(src.indexOf('const KEYS'), src.indexOf('];', src.indexOf('const KEYS')));
    const times = [...body.matchAll(/^ {2}\[\s*\n\s*([0-9.]+),/gm)].map((m) => Number(m[1]));
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBe(1);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it('every field is finite all night long (0..1 in 0.01 steps) and changes smoothly', () => {
    let prev: Array<[string, number]> | null = null;
    for (let i = 0; i <= 100; i++) {
      const cur = numbers(todAt(i / 100));
      for (const [k, v] of cur) expect(Number.isFinite(v), `${k} at t=${i / 100}`).toBe(true);
      if (prev) {
        expect(cur.map(([k]) => k)).toEqual(prev.map(([k]) => k));
        // No jumps: a key out of order would make a field leap between two neighbouring samples.
        for (let j = 0; j < cur.length; j++) {
          const span = Math.max(1, Math.abs(prev[j][1]), Math.abs(cur[j][1]));
          expect(Math.abs(cur[j][1] - prev[j][1]) / span, `${cur[j][0]} at t=${i / 100}`).toBeLessThan(0.75);
        }
      }
      prev = cur;
    }
  });

  it('chapter 1 opens on a sunset: a warm key light, a strong sun glow', () => {
    const s = todAt(0.05);
    expect(s.keyColor[0]).toBeGreaterThanOrEqual(0.9);
    expect(s.sunGlow[0]).toBeGreaterThan(2);
    expect(s.sunDisc[0]).toBeGreaterThan(0);
    expect(todAt(CHAPTERS[0].timeOfDay[0]).sunGlow[0]).toBeGreaterThan(2);
  });

  it('chapter 2 opens on blue hour: a cool key light, the sun gone, a dim horizon', () => {
    for (const t of [0.335, CHAPTERS[1].timeOfDay[0]]) {
      const s = todAt(t);
      expect(s.keyColor[2]).toBeGreaterThan(s.keyColor[0]);
      expect(s.sunDisc).toEqual([0, 0, 0]);
      expect(s.horizon[0]).toBeLessThan(0.5);
    }
  });

  it('chapter 3 is deep night: the lamps are fully on and the stars are out by the end', () => {
    const a = todAt(CHAPTERS[2].timeOfDay[0]);
    const b = todAt(CHAPTERS[2].timeOfDay[1]);
    expect(a.lamps).toBeGreaterThan(0.95);
    expect(b.stars).toBeGreaterThan(a.stars);
    expect(b.stars).toBeGreaterThan(0.9);
    expect(b.sunGlow[0]).toBeLessThan(0.1);
  });

  it('clamps outside 0..1 and can fill a palette in place', () => {
    expect(numbers(todAt(-1))).toEqual(numbers(todAt(0)));
    expect(numbers(todAt(2))).toEqual(numbers(todAt(1)));
    const out = todAt(0.2);
    const same = todAt(0.6, out);
    expect(same).toBe(out);
    expect(numbers(same)).toEqual(numbers(todAt(0.6)));
  });
});
