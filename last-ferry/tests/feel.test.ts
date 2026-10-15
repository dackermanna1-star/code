// App-side game feel (src/game): hit-stop / slow-motion time control and the
// money pop-up aggregation that keeps crowds readable.
import { describe, expect, it } from 'vitest';
import { HITSTOP_CAP_MS, HITSTOP_WINDOW_S, SLOWMO_EASE_IN, SLOWMO_EASE_OUT, TimeControl } from '../src/game/TimeControl';
import { BUSY_AT, BUSY_WINDOW_S, CLUSTER_AT, MAX_IN_WINDOW, MoneyPops, type MoneyPop } from '../src/game/MoneyPops';

const DT = 1 / 60;

/** Advance `seconds` in frames of DT; returns the summed game time. */
function run(tc: TimeControl, seconds: number): number {
  let g = 0;
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) g += tc.advance(DT);
  return g;
}

describe('TimeControl: hit-stop', () => {
  it('freezes game time for the requested ms, then runs normally', () => {
    const tc = new TimeControl();
    expect(tc.hitstop(45)).toBe(45);
    expect(tc.frozen).toBe(true);
    expect(tc.advance(0.02)).toBe(0);
    expect(tc.advance(0.02)).toBe(0);
    // 5 ms of freeze left: the rest of the frame runs.
    expect(tc.advance(0.02)).toBeCloseTo(0.015, 6);
    expect(tc.frozen).toBe(false);
    expect(tc.advance(0.02)).toBeCloseTo(0.02, 6);
  });

  it('caps stacked hit-stop per sliding window', () => {
    const tc = new TimeControl();
    let granted = 0;
    for (let i = 0; i < 6; i++) granted += tc.hitstop(45);
    expect(granted).toBe(HITSTOP_CAP_MS);
    // Total frozen time equals the cap.
    const frozenFor = (() => {
      let t = 0;
      while (tc.frozen) {
        tc.advance(0.001);
        t += 0.001;
      }
      return t;
    })();
    expect(frozenFor).toBeCloseTo(HITSTOP_CAP_MS / 1000, 2);
    // Still inside the window: nothing more.
    expect(tc.hitstop(45)).toBe(0);
    // After the window has passed the budget is back.
    run(tc, HITSTOP_WINDOW_S);
    expect(tc.hitstop(45)).toBe(45);
  });

  it('a steady stream of headshot kills never freezes more than the cap allows', () => {
    const tc = new TimeControl();
    let frozen = 0;
    const total = 5;
    for (let f = 0; f < total / DT; f++) {
      if (f % 3 === 0) tc.hitstop(45); // a headshot kill every 50 ms
      const g = tc.advance(DT);
      frozen += DT - g;
    }
    expect(frozen / total).toBeLessThanOrEqual(HITSTOP_CAP_MS / 1000 / HITSTOP_WINDOW_S + 0.02);
  });
});

describe('TimeControl: slow motion', () => {
  it('eases in, holds and eases back out to full speed', () => {
    const tc = new TimeControl();
    tc.slowmo(0.35, 0.6);
    run(tc, SLOWMO_EASE_IN + 0.05);
    expect(tc.slow).toBeCloseTo(0.35, 5);
    // Game time during the hold runs at 35 %.
    const g = run(tc, 0.3);
    expect(g).toBeCloseTo(0.3 * 0.35, 2);
    run(tc, 0.3);
    expect(tc.slow).toBeGreaterThan(0.35);
    run(tc, SLOWMO_EASE_OUT + 0.1);
    expect(tc.slow).toBe(1);
    expect(tc.advance(DT)).toBeCloseTo(DT, 9);
  });

  it('overlapping requests keep the slowest scale and the longest hold', () => {
    const tc = new TimeControl();
    tc.slowmo(0.35, 0.6);
    run(tc, 0.1);
    tc.slowmo(0.25, 1.2);
    run(tc, 0.2);
    expect(tc.slow).toBeCloseTo(0.25, 5);
    run(tc, 0.9);
    expect(tc.slow).toBeCloseTo(0.25, 5);
    run(tc, 0.5 + SLOWMO_EASE_OUT);
    expect(tc.slow).toBe(1);
  });

  it('hit-stop inside slow motion freezes completely; reset clears both', () => {
    const tc = new TimeControl();
    tc.slowmo(0.3, 1);
    run(tc, 0.2);
    tc.hitstop(70);
    expect(tc.advance(0.05)).toBe(0);
    tc.reset();
    expect(tc.frozen).toBe(false);
    expect(tc.slow).toBe(1);
    expect(tc.advance(DT)).toBeCloseTo(DT, 9);
  });
});

describe('MoneyPops', () => {
  const flush = (mp: MoneyPops, now: number): MoneyPop[] => {
    const out: MoneyPop[] = [];
    mp.flush(now, (p) => out.push(p));
    return out;
  };

  it('a bounty and its headshot bonus become one pop-up', () => {
    const mp = new MoneyPops();
    mp.add(30, 'bounty', -5, 2.1, 1);
    mp.add(15, 'headshot', -5, 2.5, 1);
    const out = flush(mp, 0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ amount: 45, reason: 'headshot', x: -5, z: 1 });
  });

  it('many bodies paid in one frame merge into one cluster at their centre; nice shots stay separate', () => {
    const mp = new MoneyPops();
    for (let i = 0; i < CLUSTER_AT + 2; i++) mp.add(30, 'bounty', -10 + i * 2, 2, 0);
    mp.add(75, 'nice', -6, 2.2, 0);
    const out = flush(mp, 0);
    expect(out).toHaveLength(2);
    const cluster = out.find((p) => p.reason !== 'nice')!;
    expect(cluster.amount).toBe(30 * (CLUSTER_AT + 2));
    expect(cluster.x).toBeCloseTo(-6, 6);
    expect(out.find((p) => p.reason === 'nice')!.amount).toBe(75);
  });

  it('while busy, small payments fold into the next pop-up and the count stays capped', () => {
    const mp = new MoneyPops();
    const times: number[] = [];
    let t = 0;
    for (let f = 0; f < 180; f++) {
      // Two separate small kills per frame for three seconds (a nail-gun spree on crawlers).
      mp.add(15, 'bounty', -10 + (f % 7) * 3, 1, -3);
      mp.add(15, 'bounty', 4 - (f % 5) * 3, 1, 3);
      for (const _ of flush(mp, t)) times.push(t);
      t += DT;
    }
    // Never more than the cap inside any window.
    for (const t0 of times) expect(times.filter((x) => x >= t0 && x - t0 < BUSY_WINDOW_S).length).toBeLessThanOrEqual(MAX_IN_WINDOW);
    expect(times.length).toBeGreaterThan(3);
    expect(mp.stats.folded).toBeGreaterThan(0);
  });

  it('folded money with nothing to ride on still pops up once the screen calms down (every dollar is shown)', () => {
    const mp = new MoneyPops();
    const shown: MoneyPop[] = [];
    for (let i = 0; i < BUSY_AT; i++) {
      mp.add(60, 'bounty', -10 + i * 5, 2, 0);
      mp.flush(i * 0.05, (p) => shown.push(p));
    }
    // A cheap crawler while busy: folded…
    mp.add(15, 'bounty', 6, 1, 2);
    mp.flush(0.25, (p) => shown.push(p));
    expect(mp.stats.folded).toBe(1);
    expect(shown.reduce((a, p) => a + p.amount, 0)).toBe(4 * 60);
    // …and nothing follows: it goes out on its own where it was earned.
    for (let t = 0.3; t < 2.5; t += DT) mp.flush(t, (p) => shown.push(p));
    expect(shown.reduce((a, p) => a + p.amount, 0)).toBe(4 * 60 + 15);
    expect(shown[shown.length - 1]).toMatchObject({ amount: 15, x: 6, z: 2 });
  });

  it('big payments still show while busy', () => {
    const mp = new MoneyPops();
    for (let i = 0; i < BUSY_AT; i++) {
      mp.add(30, 'bounty', -10 + i * 5, 2, 0);
      flush(mp, i * 0.05);
    }
    mp.add(300, 'bounty', 0, 2, 0);
    const out = flush(mp, 0.3);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBeGreaterThanOrEqual(300);
  });
});
