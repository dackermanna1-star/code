// Level 53 (The Blue Hallway): a cool, glassy room tone and the small sound a door makes when it
// stops being there.
import { defineBed, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, oscAdd, wavetable, cyc, loopLfo, rmsOf, envelope, mulInto } from '../dsp.js';

defineBed('tone_lv53', { L: 12, sr: 22050, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  // a held, slightly detuned pad (tile and glass ring like this), breathing slowly
  const tab = wavetable([[1, 1], [2, 0.18, 0.4], [3, 0.07, 1.1]]);
  for (const [f, g, ph] of [[110, 0.5, 0], [110.4, 0.4, 0.3], [165, 0.2, 0.6], [220.3, 0.16, 0.2], [329.6, 0.06, 0.9]]) oscAdd(out, tab, cyc(f, L), g, sr, ph);
  const lf = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) out[i] *= 0.78 + 0.22 * lf(i / sr);
  // a faint high shimmer, like air moving over a vent grille
  const air = white(n, r); filter(air, [['bp', 3600, 5], ['bp', 5200, 4]], sr, true);
  const lf2 = loopLfo(r, L, [2, 5]);
  for (let i = 0; i < n; i++) air[i] *= 0.5 + 0.5 * lf2(i / sr);
  mixRms(out, air, rmsOf(out) * 0.08);
  const lo = white(n, r); filter(lo, [['lp', 120], ['lp', 120]], sr, true);
  mixRms(out, lo, rmsOf(out) * 0.35);
} });

// a door-sized thud, then a long soft exhale: the paint settling over where it was
defineShot('lv53_vanish', { n: 3, dur: 2.4, peak: 0.8, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  S.thump(0.02, 0.8, 95 - k * 8, 48, 0.22);
  S.noise(0.02, 0.3, 0.002, 0.12, [['bp', 420 + k * 60, 1.2], ['lp', 1400]]);
  const air = white(n, r); filter(air, [['bp', 900, 0.7], ['lp', 2400]], sr);
  mixRms(out, air, rmsOf(out) * 0.4 + 0.02);
  mulInto(out, envelope(n, sr, [[0, 0.5], [0.04, 1], [0.25, 0.5], [1.2, 0.18], [2.4, 0]]));
  S.ring(0.03, [[210 + k * 17, 0.7, 0.2], [415 + k * 30, 0.5, 0.1], [830, 0.4, 0.05]], 0.5);
} });
