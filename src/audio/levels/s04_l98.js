// Level 98 (The Blackout District): moonlit, windless dark with the odd creak of wood.
import { defineBed, defineShot } from '../registry.js';
import { white, filter, mixRms, rmsOf, loopLfo } from '../dsp.js';

// wind through bare branches a long way off, and a very low room of air
defineBed('tone_lv98_moon', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 120], ['lp', 120]], sr, true);
  const gust = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) lo[i] *= 0.5 + 0.5 * gust(i / sr);
  mixRms(out, lo, 0.18);
  const br = white(n, r); filter(br, [['bp', 700, 0.8], ['lp', 1400]], sr, true);
  const g2 = loopLfo(r, L, [1, 3, 5]);
  for (let i = 0; i < n; i++) { const g = Math.max(0, 0.3 + 0.7 * g2(i / sr)); br[i] *= g * g; }
  mixRms(out, br, 0.08);
  const hs = white(n, r); filter(hs, [['hp', 3000], ['lp', 5000]], sr, true);
  mixRms(out, hs, rmsOf(out) * 0.02);
} });

// timber settling: a slow creak that rises and falls
defineShot('lv98_creak', { n: 3, dur: 3, sr: 11025, peak: 0.6, gen(S, k) {
  const f0 = 150 + k * 45;
  S.tone(0.1, 0.3, { f0, f1: f0 * 1.5, glide: 0.5, att: 0.25, dec: 0.45, dur: 1.5, shape: 'saw', vib: 0.06, vibF: 8 + k });
  S.tone(0.7, 0.2, { f0: f0 * 1.9, f1: f0 * 1.2, glide: 0.4, att: 0.1, dec: 0.3, dur: 1.0, shape: 'saw', vib: 0.05, vibF: 11 });
  S.noise(0.1, 0.18, 0.3, 0.6, [['bp', 600, 2]], 1.8);
  S.filter([['bp', 520, 0.7], ['lp', 1700]]);
} });
