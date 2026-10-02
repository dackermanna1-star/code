// Level 9 (9999 Darkness Ave.): a suburban night with nobody about.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// air moving through trees a long way off, a very low hush, the faint buzz of the grid
defineBed('tone_lv9_night', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const rum = white(n, r); filter(rum, [['lp', 150], ['lp', 150]], sr, true);
  const gust = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) rum[i] *= 0.55 + 0.45 * gust(i / sr);
  mixRms(out, rum, 0.2);
  const lv = white(n, r); filter(lv, [['bp', 1900, 0.5], ['lp', 3200]], sr, true);
  const g2 = loopLfo(r, L, [2, 3, 5]);
  for (let i = 0; i < n; i++) { const g = 0.5 + 0.5 * g2(i / sr); lv[i] *= g * g * g; }
  mixRms(out, lv, 0.06);
  oscAdd(out, wavetable([[1, 1], [2, 0.45, 1], [3, 0.2, 2]]), cyc(100, L), 0.014, sr);
  const hiss = white(n, r); filter(hiss, [['hp', 2600], ['lp', 4800]], sr, true);
  mixRms(out, hiss, rmsOf(out) * 0.04);
} });

// an air-conditioner compressor: a flat mains hum with a slow fan beating on top
defineLoop('lv9_ac', { L: 4, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.6], [2, 0.5, 1], [3, 0.22, 2], [4, 0.12, 0.4], [6, 0.05, 1.2]]), cyc(59.5, L), 1, sr);
  const fan = white(n, r); filter(fan, [['bp', 520, 0.8], ['lp', 1500]], sr, true);
  const f = cyc(23, L);
  for (let i = 0; i < n; i++) fan[i] *= 0.6 + 0.4 * Math.sin((TAU * f * i) / sr);
  mixRms(out, fan, rmsOf(out) * 0.5);
  const rum = white(n, r); filter(rum, [['lp', 140], ['lp', 140]], sr, true);
  mixRms(out, rum, rmsOf(out) * 0.35);
} });

// the grid draws a little harder somewhere: a swell of mains hum and a few cracks, far away
defineShot('lv9_surge', { n: 2, dur: 5, sr: 11025, peak: 0.7, gen(S, k) {
  const { out, r, sr } = S;
  const tab = wavetable([[1, 1], [2, 0.5, 1], [3, 0.25, 2], [4, 0.12, 0.5]]);
  oscAdd(out, tab, 100 + k * 0.7, (t) => { const u = Math.sin((Math.PI * t) / 5); return u * u * 0.5; }, sr);
  const air = white(out.length, r); filter(air, [['bp', 400, 0.8]], sr);
  for (let i = 0; i < out.length; i++) { const u = Math.sin((Math.PI * i) / out.length); out[i] += air[i] * u * u * 0.12; }
  S.grit(0.8, 0.25, 3.5, 22, 0.4, [['hp', 1800]]);
  S.filter([['lp', 3200]]);
} });
