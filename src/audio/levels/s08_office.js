// Level 51 (The Empty Office): a dark open floor before the working day.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// ventilation far above the ceiling tiles, a transformer's hum somewhere in the core, and the
// faintest ring of a thousand monitors left on
defineBed('tone_lv51_night', { L: 8, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 110], ['lp', 110]], sr, true);
  const air = white(n, r); filter(air, [['bp', 620, 0.7], ['lp', 1600]], sr, true);
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, lo, 0.5); mixRms(out, air, 0.16);
  const tab = wavetable([[1, 1], [2, 0.3], [3, 0.08]]);
  oscAdd(out, tab, cyc(60, L), 0.05, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(5850, L), 0.006, sr);
} });

// a bank of CRTs: line-frequency whine and a soft buzz
defineLoop('lv51_whine', { L: 2, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1]]), cyc(4300, L), 0.22, sr);
  oscAdd(out, wavetable([[1, 1], [2, 0.4], [3, 0.2]]), cyc(120, L), 0.5, sr);
  const hiss = white(n, r); filter(hiss, [['hp', 2500], ['lp', 7000]], sr, true);
  mixRms(out, hiss, rmsOf(out) * 0.2);
  const f = cyc(0.5, L);
  for (let i = 0; i < n; i++) out[i] *= 0.85 + 0.15 * Math.sin((TAU * f * i) / sr);
} });

// a laser printer far off across the floor: motor, paper feed, fuser tick, the last sheet dropping
defineShot('lv51_printer', { n: 2, dur: 6, sr: 11025, peak: 0.8, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  S.tone(0.2, 0.18, { f0: 120 + k * 15, f1: 210 + k * 20, glide: 0.5, att: 0.1, dec: 4.8, dur: 4.9, shape: 'tri' });
  for (let t = 0.9; t < 4.6; t += 0.07) S.noise(t, 0.25, 0.004, 0.035, [['bp', 1900 + k * 300, 1.2], ['lp', 3800]]);
  for (let t = 0.7; t < 4.8; t += 0.5) S.click(t, 0.18, 1400, 0.004);
  S.thump(5.0, 0.5, 130, 70, 0.08).noise(5.0, 0.3, 0.003, 0.05, [['lp', 900]]);
  void out; void r; void sr; void n;
} });
