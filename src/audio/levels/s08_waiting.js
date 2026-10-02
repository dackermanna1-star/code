// Level 22 (The Waiting Room): a quiet doctor's office that never fills.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// ventilation behind the ceiling, the building's mains, and nothing else
defineBed('tone_lv22_room', { L: 10, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 140], ['lp', 140]], sr, true);
  const air = white(n, r); filter(air, [['bp', 420, 0.6], ['lp', 1100]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) air[i] *= 0.6 + 0.4 * sw(i / sr);
  mixRms(out, lo, 0.45); mixRms(out, air, 0.2);
  oscAdd(out, wavetable([[1, 1], [2, 0.5]]), cyc(100, L), 0.03, sr);
} });

// a wall clock with a loud mechanism: tick and tock, one second apart
defineLoop('lv22_tick', { L: 2, norm: ['peak', 0.55], gen(S) {
  S.click(0.01, 0.9, 1800, 0.003).ring(0.01, [[2900, 0.02, 0.2], [1100, 0.03, 0.15]]);
  S.click(1.01, 0.7, 1500, 0.003).ring(1.01, [[2400, 0.02, 0.2], [900, 0.03, 0.15]]);
} });

// the doctor's-office chime: a soft two-note ding-dong from a ceiling speaker, no voice after it
defineShot('lv22_chime', { n: 1, dur: 4.2, peak: 0.8, gen(S) {
  const bell = (f) => [[f, 1.2, 0.5], [f * 2.0, 0.6, 0.18], [f * 2.76, 0.4, 0.08], [f * 5.4, 0.15, 0.03]];
  S.noise(0.02, 0.05, 0.001, 0.004, [['bp', 3000, 1]]).ring(0.02, bell(783.99), 1);
  S.noise(0.82, 0.05, 0.001, 0.004, [['bp', 2400, 1]]).ring(0.82, bell(587.33), 1.05);
  S.filter([['lp', 5000]]);
} });
// a service bell on a counter
defineShot('lv22_bell', { n: 2, dur: 2.2, peak: 0.8, gen(S, k) {
  const f = 2600 + k * 160;
  S.click(0.003, 0.5, 3000, 0.0015).ring(0.003, [[f, 0.6, 0.5], [f * 2.4, 0.3, 0.2], [f * 4.1, 0.2, 0.08], [f * 0.5, 0.4, 0.15]]);
} });
void TAU; void rmsOf;
