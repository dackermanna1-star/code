// Level 27 (The Red Corridor): a generator hum behind the walls that gets quieter step by step
// toward the east, until there is nothing left but your own footsteps.
import { defineBed } from '../registry.js';
import { TAU, white, filter, mixRms, oscAdd, wavetable, cyc, loopLfo, rmsOf } from '../dsp.js';

const LEVELS = [0.2, 0.135, 0.08, 0.04, 0.014, 0.0006];

LEVELS.forEach((rms, q) => {
  defineBed('tone_lv27_' + q, { L: 8, sr: 11025, norm: ['rms', rms], gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    // a diesel set somewhere in the building: 25 Hz firing rate with its harmonics
    const tab = wavetable([[1, 0.6], [2, 1], [3, 0.35, 1], [4, 0.5, 2], [6, 0.2, 0.4], [8, 0.1, 1.2]]);
    oscAdd(out, tab, cyc(25, L), 0.5, sr);
    oscAdd(out, wavetable([[1, 1], [2, 0.3]]), cyc(100.2, L), 0.12, sr, 0.3);
    const rum = white(n, r); filter(rum, [['lp', 90], ['lp', 90]], sr, true);
    const lf = loopLfo(r, L, [1, 2, 4]);
    for (let i = 0; i < n; i++) rum[i] *= 0.7 + 0.3 * lf(i / sr);
    mixRms(out, rum, rmsOf(out) * 0.8);
    // lamp ballasts: a thin buzz that wanders
    const hi = white(n, r); filter(hi, [['bp', 1800, 6], ['bp', 1800, 6]], sr, true);
    mixRms(out, hi, rmsOf(out) * 0.05);
    filter(out, [['lp', 900]], sr, true);
  } });
});
