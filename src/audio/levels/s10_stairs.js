// Sounds of the yellow staircase (84) and the clock tower (40).
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, SR_LO, white, filterG, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// a stairwell that goes up and down for ever: a deep chord that beats slowly, a draught in the shaft
defineBed('tone_lv84', { L: 16, sr: SR_LO, norm: ['rms', 0.14], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.3, 1], [3, 0.12, 2]]);
  oscAdd(out, tab, cyc(55, L), 0.4, sr); oscAdd(out, tab, cyc(55.5, L), 0.3, sr, 0.4); oscAdd(out, tab, cyc(82.5, L), 0.14, sr, 0.2); yield;
  const air = white(n, r); yield* filterG(air, [['bp', 300, 0.5], ['lp', 700]], sr, true); yield;
  const lf = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) air[i] *= 0.4 + 0.6 * (0.5 + 0.5 * lf(i / sr));
  mixRms(out, air, rmsOf(out) * 0.6);
  for (let k = 0; k < 4; k++) { const t = r.range(0.5, L - 0.5); S.click(t, 0.05, 1600, 0.003).ring(t, [[r.range(900, 1500), 0.05, 0.04]]); }
} });

// a bare bulb: a soft filament buzz at double mains frequency
defineLoop('lv84_bulb', { L: 2, sr: SR_LO, norm: ['rms', 0.12], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.5, 1], [3, 0.3, 0.5], [5, 0.12, 2]]);
  oscAdd(out, tab, cyc(120, L), 0.5, sr); yield;
  const h = white(n, r); yield* filterG(h, [['bp', 2400, 1.2]], sr, true);
  const f = cyc(120, L);
  for (let i = 0; i < n; i++) h[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 3);
  mixRms(out, h, rmsOf(out) * 0.2);
} });

// ------------------------------------------------------------------ 40 THE CLOCK TOWER
// the inside of a huge movement: a slow tock that rolls round a stone space, gear trains grinding,
// the iron frame ticking as it warms and cools
defineBed('tone_lv40', { L: 8, sr: SR_LO, norm: ['rms', 0.15], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const rum = white(n, r); yield* filterG(rum, [['lp', 110], ['lp', 110]], sr, true); yield;
  mixRms(out, rum, 0.2);
  const gr = white(n, r); yield* filterG(gr, [['bp', 260, 1.2], ['lp', 700]], sr, true); yield;
  const f = cyc(3, L);
  for (let i = 0; i < n; i++) gr[i] *= 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 3);
  mixRms(out, gr, rmsOf(out) * 0.45); yield;
  // the great tock, twice in eight seconds, and the lesser clicks of the train behind it
  for (const t of [0.5, 4.5]) { S.thump(t, 0.7, 70, 40, 0.18).noise(t, 0.12, 0.002, 0.2, [['lp', 300]]).ring(t, [[210, 0.7, 0.05], [330, 0.5, 0.03]]); }
  for (let k = 0; k < 14; k++) { const t = r.range(0.1, L - 0.1); S.click(t, 0.05, 1400, 0.003).ring(t, [[r.range(500, 1100), 0.03, 0.03]]); }
} });

// a dial ticking: three loops with different rhythms, so no two clocks agree
for (const [name, period, f0] of [['a', 1.0, 150], ['b', 1.4, 120], ['c', 0.75, 190]]) {
  defineLoop('lv40_tick_' + name, { L: period * Math.round(4 / period), sr: SR_LO, norm: ['peak', 0.55], gen(S) {
    const r = S.r;
    const n = Math.round(4 / period);
    for (let k = 0; k < n; k++) {
      const t = 0.02 + k * period;
      S.thump(t, 0.7, f0, f0 * 0.5, 0.05).click(t, 0.4, 1200, 0.003).ring(t, [[r.jit(f0 * 3.1, 0.03), 0.12, 0.2], [r.jit(f0 * 6.4, 0.03), 0.07, 0.1]]);
    }
  } });
}

// a train of gears turning in the dark: a rolling grind with a wheeze of oil
defineLoop('lv40_gears', { L: 6, sr: SR_LO, norm: ['rms', 0.18], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.5], [2, 0.5, 1], [3, 0.3, 2], [5, 0.15, 0.5]]), cyc(38, L), 0.5, sr); yield;
  const g = white(n, r); yield* filterG(g, [['bp', 320, 1.6], ['lp', 900]], sr, true); yield;
  const f = cyc(2.5, L), f2 = cyc(0.5, L);
  for (let i = 0; i < n; i++) g[i] *= (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 2)) * (0.7 + 0.3 * Math.sin((TAU * f2 * i) / sr));
  mixRms(out, g, rmsOf(out) * 1.1);
  for (let k = 0; k < 15; k++) S.click(k * 0.4 + 0.05, 0.1, 900, 0.004);
} });

// the hour: a bronze bell struck by a hammer a long way up, ringing for ever in the stone
defineShot('lv40_bell', { n: 2, dur: 9, sr: SR_LO, peak: 0.85, gen(S, k) {
  const r = S.r, f0 = 98 + k * 14;
  S.thump(0.02, 0.5, f0 * 0.5, f0 * 0.3, 0.08).click(0.02, 0.3, 700, 0.004);
  S.ring(0.02, [[f0, 4.5, 0.5], [f0 * 2.01, 3.4, 0.4], [f0 * 2.4, 3.0, 0.3], [f0 * 3.0, 2.2, 0.25], [f0 * 4.1, 1.6, 0.15], [f0 * 5.4, 1.0, 0.1], [f0 * 6.9, 0.6, 0.06]]);
  S.ring(0.02, [[f0 * 1.004, 4.8, 0.3], [f0 * 2.012, 3.6, 0.2]]);
  void r;
} });
