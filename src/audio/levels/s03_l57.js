// Level 57 (The Yellow Forest): the building's own sound, spread out under a sky that is a ceiling.
import { defineBed } from '../registry.js';
import { TAU, white, filter, mixRms, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

defineBed('tone_lv57_damp', { L: 10, sr: 22050, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 180], ['lp', 180]], sr, true);
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) lo[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, lo, 0.4);
  const air = white(n, r); filter(air, [['bp', 900, 0.5], ['lp', 1800], ['hp', 200]], sr, true);
  mixRms(out, air, 0.15);
  oscAdd(out, wavetable([[1, 1], [2, 0.5], [4, 0.2]]), cyc(60, L), 0.04, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(9100, L), (t) => 0.01 * (1 + 0.4 * Math.sin((TAU * 3 * t) / L)), sr);
} });
