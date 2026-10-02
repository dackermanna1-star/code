// Level 64 (The Underground School): a cavern too large to hear the end of, and a bell.
import { defineBed, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// the cave: sub-bass air movement, a hollow wash far off, nothing near
defineBed('tone_lv64_cave', { L: 14, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 70], ['lp', 70]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) lo[i] *= 0.55 + 0.45 * sw(i / sr);
  const wash = white(n, r); filter(wash, [['bp', 340, 1.2], ['lp', 900]], sr, true);
  const f = cyc(0.14, L);
  for (let i = 0; i < n; i++) wash[i] *= 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr + 1), 2);
  mixRms(out, lo, 0.55); mixRms(out, wash, 0.16);
  oscAdd(out, wavetable([[1, 1]]), cyc(43, L), 0.05, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(43.6, L), 0.04, sr, 0.3);
} });

// a bronze bell tolled three times high in a tower, the hum of it going on under the rock
defineShot('lv64_bell', { n: 1, dur: 11, sr: 22050, peak: 0.9, gen(S) {
  const f0 = 196;     // G3
  const partials = [[0.5, 5.5, 0.5], [1, 6.5, 1], [1.2, 4.8, 0.45], [1.5, 4.2, 0.3], [2.0, 3.6, 0.5], [2.5, 2.8, 0.2], [3.0, 2.4, 0.22], [4.1, 1.6, 0.12], [5.3, 1.1, 0.08]];
  const bong = (t, g) => {
    S.noise(t, 0.35 * g, 0.001, 0.015, [['bp', 2200, 1]]);
    S.thump(t, 0.4 * g, 110, 70, 0.05);
    S.ring(t + 0.003, partials.map(([m, d, a]) => [f0 * m, d, a * 0.5]), g);
  };
  bong(0.05, 1); bong(2.6, 0.9); bong(5.2, 0.85);
  S.filter([['lp', 5200]]);
} });
void envelope; void mulInto; void rmsOf;
