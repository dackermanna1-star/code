// Level 42 (White Apartment): almost nothing. A faint airy hush and a very quiet chord that never
// resolves, like the sound of an empty white room heard through the ears themselves.
import { defineBed } from '../registry.js';
import { TAU, white, filter, mixRms, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

defineBed('tone_lv42_hush', { L: 20, sr: 11025, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const air = white(n, r); filter(air, [['bp', 1800, 0.4], ['lp', 4200]], sr, true);
  const lo = white(n, r); filter(lo, [['lp', 200], ['lp', 200]], sr, true);
  const lf = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.6 + 0.4 * lf(i / sr);
  mixRms(out, air, 0.1); mixRms(out, lo, 0.12);
  const tab = wavetable([[1, 1], [2, 0.15]]);
  const swell = (ph) => (t) => 0.5 + 0.5 * Math.sin((TAU * 1 * t) / L + ph);
  oscAdd(out, tab, cyc(261.6, L), (t) => 0.018 * swell(0)(t), sr);
  oscAdd(out, tab, cyc(329.6, L), (t) => 0.014 * swell(1.6)(t), sr);
  oscAdd(out, tab, cyc(493.9, L), (t) => 0.011 * swell(3.1)(t), sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(2093, L), (t) => 0.004 * swell(4.4)(t), sr);
} });
