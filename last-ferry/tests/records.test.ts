// Run records (Best nights) survive anything localStorage can hold.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RUNS_KEY, loadRuns } from '../src/ui/options';

function withStorage(value: string | null): void {
  const store = new Map<string, string>();
  if (value !== null) store.set(RUNS_KEY, value);
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
}

afterEach(() => vi.unstubAllGlobals());

describe('loadRuns', () => {
  it('drops entries an older build, a manual edit or a partial write left behind (no NaN:NaN in the table)', () => {
    withStorage(
      JSON.stringify([
        { kills: 5, money: 100, chapter: 1 },
        { kills: 12, money: 900, chapter: 2, timeSec: 'soon', victory: false, date: 1 },
        { kills: 30, money: 2400, chapter: 3, timeSec: 812.4, victory: 'yes', date: 2 },
        { kills: 7, money: null, chapter: 1, timeSec: 60, victory: false, date: 3 },
        null,
        'x',
        { kills: Infinity, money: 1, chapter: 1, timeSec: 1, victory: false, date: 4 },
        { kills: 41, money: 5200, chapter: 3, timeSec: 1300, victory: true, date: 5 },
      ]),
    );
    const runs = loadRuns();
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ kills: 30, money: 2400, chapter: 3, timeSec: 812.4, victory: false, date: 2 });
    expect(runs[1]).toEqual({ kills: 41, money: 5200, chapter: 3, timeSec: 1300, victory: true, date: 5 });
  });

  it('anything that is not a list (or no storage at all) is an empty table', () => {
    withStorage('{"kills":5}');
    expect(loadRuns()).toEqual([]);
    withStorage('not json');
    expect(loadRuns()).toEqual([]);
    vi.unstubAllGlobals();
    expect(loadRuns()).toEqual([]);
  });
});
