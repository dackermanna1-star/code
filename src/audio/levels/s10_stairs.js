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
