// Level 95 (The Endless Corridor): five room tones that follow the light down. Near the arrival
// door the air rings thinly and high; each hundred metres it drops, until only a deep, slow
// throb is left in the dark.
import { defineBed } from '../registry.js';
import { white, filter, mixRms, oscAdd, wavetable, cyc, loopLfo, rmsOf } from '../dsp.js';

const FREQ = [7400, 2900, 880, 220, 55];
const RMS = [0.17, 0.18, 0.19, 0.19, 0.2];
FREQ.forEach((f0, k) => {
  defineBed('tone_lv95_' + k, { L: 10, sr: k > 2 ? 11025 : 22050, norm: ['rms', RMS[k]], gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const tab = wavetable(k > 2 ? [[1, 1], [2, 0.5, 0.5], [3, 0.2, 1]] : [[1, 1], [2, 0.08, 0.3]]);
    const lf = loopLfo(r, L, [1, 2]);
    oscAdd(out, tab, cyc(f0, L), (t) => 0.5 * (0.8 + 0.2 * lf(t)), sr);
    oscAdd(out, tab, cyc(f0 * 1.004, L), 0.35, sr, 0.4);
    if (k > 2) oscAdd(out, tab, cyc(f0 / 2, L), 0.5, sr, 0.2);
    // a hush of still air, lower and softer the further out
    const air = white(n, r);
    filter(air, k < 3 ? [['hp', 600], ['lp', 3200 - 700 * k]] : [['lp', 260 - 40 * (k - 3)], ['lp', 260 - 40 * (k - 3)]], sr, true);
    mixRms(out, air, rmsOf(out) * (k < 3 ? 0.5 : 0.9));
  } });
});
