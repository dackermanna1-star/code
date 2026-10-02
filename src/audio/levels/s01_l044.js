// Level 44 (The Basement Stairs): a quiet house at night. Wood settling, a pipe somewhere, nothing else.
import { defineBed, defineShot } from '../registry.js';
import { white, filter, mixRms, loopLfo, mulInto, envelope } from '../dsp.js';

defineBed('tone_lv44_house', { L: 12, sr: 11025, norm: ['rms', 0.17], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 90], ['lp', 90]], sr, true);
  const air = white(n, r); filter(air, [['bp', 500, 0.8], ['lp', 1100]], sr, true);
  const lf = loopLfo(r, L, [1, 3]);
  for (let i = 0; i < n; i++) { lo[i] *= 1 + 0.25 * lf(i / sr); air[i] *= 0.5 + 0.5 * lf(i / sr + 2); }
  mixRms(out, lo, 0.5); mixRms(out, air, 0.08);
  S.tone(L * 0.5, 0.006, { f0: 50, att: 0.5, dec: 2, dur: 4, shape: 'sin' });
} });

// old timber settling: a dry knock and a short creak with a long tail of nothing
defineShot('lv44_creak', { n: 3, dur: 2.4, sr: 11025, peak: 0.7, gen(S, k) {
  const r = S.r;
  S.thump(0.05, 0.5, 130 + k * 25, 70, 0.1).noise(0.05, 0.25, 0.001, 0.05, [['bp', 400 + k * 80, 2]]);
  S.tone(0.3, 0.14, { f0: 190 + k * 30, f1: 130 + k * 20, glide: 0.5, att: 0.1, dec: 0.4, dur: 0.7, shape: 'saw', vib: 0.03, vibF: 11 });
  if (r.chance(0.6)) S.thump(1.2, 0.25, 110, 60, 0.12);
  S.filter([['lp', 1800], ['hp', 60]]);
} });
void mulInto; void envelope;
