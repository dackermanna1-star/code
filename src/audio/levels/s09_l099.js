// Level 99 (The Last Hallway): a held chord in the hall that swells toward the last door, and a
// grey hush in the service corridors behind it. All of it is mechanical: reeds, ductwork, air.
import { defineBed, defineLoop } from '../registry.js';
import { white, filter, mixRms, oscAdd, wavetable, cyc, loopLfo, rmsOf } from '../dsp.js';

defineBed('tone_lv99', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.55, 0.3], [3, 0.3, 1.1], [4, 0.12, 0.6], [6, 0.05, 2]]);
  const lf = loopLfo(r, L, [1, 2]);
  for (const [f, g, ph] of [[55, 0.7, 0], [55.3, 0.5, 0.5], [82.4, 0.3, 0.2], [110, 0.35, 0.9], [164.8, 0.12, 0.4]]) oscAdd(out, tab, cyc(f, L), (t) => g * (0.8 + 0.2 * lf(t + ph)), sr, ph);
  const air = white(n, r); filter(air, [['bp', 400, 0.5], ['lp', 900]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.1);
  filter(out, [['lp', 700]], sr, true);
} });

defineBed('tone_lv99b', { L: 10, sr: 11025, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const air = white(n, r); filter(air, [['lp', 380], ['lp', 380]], sr, true);
  const lf = loopLfo(r, L, [1, 3]);
  for (let i = 0; i < n; i++) air[i] *= 0.65 + 0.35 * lf(i / sr);
  mixRms(out, air, 0.5);
  oscAdd(out, wavetable([[1, 1], [2, 0.4]]), cyc(50, L), 0.1, sr);
} });

// the last door: the hall's chord, brighter and slowly rising and falling
defineLoop('lv99_final', { L: 8, sr: 11025, norm: ['rms', 0.22], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.6, 0.4], [3, 0.35, 1], [4, 0.2, 2], [5, 0.12, 0.3]]);
  const lf = loopLfo(r, L, [1, 2]);
  for (const [f, g, ph] of [[110, 0.6, 0], [110.5, 0.45, 0.4], [165, 0.35, 0.3], [220, 0.3, 0.8], [277.2, 0.2, 0.1], [329.6, 0.15, 0.5]]) oscAdd(out, tab, cyc(f, L), (t) => g * (0.7 + 0.3 * lf(t + ph * 3)), sr, ph);
  const air = white(n, r); filter(air, [['bp', 1200, 0.6], ['lp', 3000]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.06);
  filter(out, [['lp', 1500]], sr, true);
} });
