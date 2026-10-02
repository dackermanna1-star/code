// Level 32 (Hallway 32): the building's old heating under the floor and, somewhere in the walls,
// a mechanical clock that never moves its hands: one dry tick every second.
import { defineBed } from '../registry.js';
import { white, filter, mixRms, oscAdd, wavetable, cyc, loopLfo, rmsOf } from '../dsp.js';

defineBed('tone_lv32', { L: 8, sr: 22050, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const rum = white(n, r); filter(rum, [['lp', 110], ['lp', 110]], sr, true);
  const lf = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) rum[i] *= 0.7 + 0.3 * lf(i / sr);
  mixRms(out, rum, 0.5);
  oscAdd(out, wavetable([[1, 1], [2, 0.5, 0.4], [3, 0.2, 1]]), cyc(48, L), 0.09, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(96.3, L), 0.03, sr, 0.3);
  const air = white(n, r); filter(air, [['bp', 700, 0.5], ['lp', 1600]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.12);
  // the clock
  for (let t = 0.5; t < L; t += 1) {
    S.click(t, 0.5, 1800, 0.0016);
    S.tone(t + 0.004, 0.05, { f0: 520, f1: 330, att: 0.0005, dec: 0.02, dur: 0.03 });
  }
} });
