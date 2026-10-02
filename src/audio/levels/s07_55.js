// Level 55 (The Infinite Library): a held breath of a room, paper, wood, a clock very far away.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// almost silence: soft air, the faint warm hum of lamp filaments, the settling of wood
defineBed('tone_lv55_hush', { L: 12, sr: 11025, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['lp', 500], ['lp', 500]], sr, true);
  const g = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) a[i] *= 0.6 + 0.4 * g(i / sr);
  mixRms(out, a, 0.3);
  oscAdd(out, wavetable([[1, 1], [2, 0.4], [3, 0.2]]), cyc(60, L), 0.03, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(120, L), 0.015, sr);
  const h = white(n, r); filter(h, [['hp', 3000], ['lp', 6000]], sr, true);
  mixRms(out, h, 0.012);
  for (let k = 0; k < 4; k++) S.click(r.range(0, L), 0.05, 900, 0.004);
} });

// a page turned: paper, then the soft weight of the cover
defineShot('lv55_page', { n: 3, dur: 0.9, sr: 11025, peak: 0.7, gen(S, k) {
  const { r } = S;
  S.noise(0.02, 0.5, 0.05, 0.25, [['bp', 2600 + k * 300, 0.8], ['hp', 1200]], 0.5);
  for (let t = 0.05; t < 0.35; t += r.range(0.02, 0.06)) S.grit(t, r.range(0.1, 0.3), 0.03, 800, 0.01, [['hp', 2000]]);
  S.thump(0.4, 0.25, 140, 80, 0.05);
} });

// a clock far away strikes (a low bell in a wooden case), four times
defineShot('lv55_clock', { n: 1, dur: 9, sr: 11025, peak: 0.7, gen(S) {
  for (let i = 0; i < 4; i++) {
    const t = 0.1 + i * 1.6, f = 196;
    S.ring(t, [[f, 2.0, 0.5], [f * 2.4, 1.0, 0.25], [f * 4.1, 0.4, 0.12], [f * 6.6, 0.15, 0.05]], 0.9);
    S.click(t, 0.1, 1200, 0.003);
  }
  S.filter([['lp', 2400]]);
} });

// a library ladder rolls along its rail, then stops against a post
defineShot('lv55_ladder', { n: 2, dur: 4, sr: 11025, peak: 0.7, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const rumble = white(n, r); filter(rumble, [['bp', 220 + k * 60, 1.2], ['lp', 700]], sr);
  mulInto(rumble, envelope(n, sr, [[0, 0], [0.2, 0.7], [2.4, 0.8], [2.9, 0]]));
  for (let i = 0; i < n; i++) out[i] += rumble[i] * 0.5;
  for (let t = 0.3; t < 2.7; t += r.range(0.18, 0.32)) S.click(t, 0.2, 800, 0.004).thump(t, 0.12, 150, 90, 0.04);
  S.thump(2.95, 0.7, 110, 55, 0.14).click(2.95, 0.5, 1000, 0.004);
  S.ring(2.96, [[620, 0.12, 0.2], [1480, 0.08, 0.1]], 0.4);
  S.filter([['lp', 2600]]);
} });

// timber settling
defineShot('lv55_creak', { n: 2, dur: 3, sr: 11025, peak: 0.7, gen(S, k) {
  S.tone(0.1, 0.2, { f0: 90 + k * 20, f1: 60 + k * 14, glide: 0.7, att: 0.4, dec: 0.8, dur: 2.2, shape: 'saw', vib: 0.05, vibF: 14 });
  S.noise(0.15, 0.2, 0.3, 0.9, [['bp', 400, 2], ['lp', 1200]], 2);
  S.filter([['lp', 1800]]);
} });
void TAU; void rmsOf;
