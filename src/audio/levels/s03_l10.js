// Level 10 (Foggy Grassland): fog swallows sound. Soft air, grass hiss, a far hum from the wires.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

defineBed('tone_lv10_fog', { L: 14, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const air = white(n, r); filter(air, [['lp', 480], ['lp', 480]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) air[i] *= 0.6 + 0.4 * sw(i / sr);
  mixRms(out, air, 0.3);
  const gr = white(n, r); filter(gr, [['bp', 2300, 0.7], ['lp', 3600]], sr, true);
  const sw2 = loopLfo(r, L, [2, 3, 5]);
  for (let i = 0; i < n; i++) gr[i] *= Math.max(0, 0.45 + 0.55 * sw2(i / sr));
  mixRms(out, gr, 0.06);
  oscAdd(out, wavetable([[1, 1]]), cyc(41, L), 0.02, sr);
} });

// a breath of wind coming through the grass from far off and passing on
defineShot('lv10_gust', { n: 2, dur: 6, sr: 11025, peak: 0.7, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['lp', 700 + k * 200], ['lp', 700 + k * 200]], sr);
  const b = white(n, r); filter(b, [['bp', 2200, 0.8], ['lp', 3400]], sr);
  mixRms(out, a, 0.5); mixRms(out, b, 0.12);
  mulInto(out, envelope(n, sr, [[0, 0], [2.2, 0.8], [3.0, 1], [4.4, 0.4], [6, 0]]));
} });

// wires on poles: a mains hum that is not quite in tune with itself
defineLoop('lv10_hum', { L: 4, sr: 11025, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.5], [3, 0.2], [4, 0.1]]);
  oscAdd(out, tab, cyc(50, L), 0.5, sr);
  oscAdd(out, tab, cyc(100.5, L), 0.25, sr, 0.3);
  const w = white(n, r); filter(w, [['bp', 600, 2], ['lp', 1400]], sr, true);
  mixRms(out, w, rmsOf(out) * 0.15);
  const f = cyc(0.5, L);
  for (let i = 0; i < n; i++) out[i] *= 0.85 + 0.15 * Math.sin((TAU * f * i) / sr);
} });
