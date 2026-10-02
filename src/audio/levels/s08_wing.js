// Level 72 (The Empty Hospital Wing): bright, clean, nobody answering.
import { defineBed, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// air handling in a sealed building: a smooth, wide band of moving air and a low mains hum
defineBed('tone_lv72_wing', { L: 12, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const air = white(n, r); filter(air, [['bp', 900, 0.5], ['lp', 3200]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) air[i] *= 0.65 + 0.35 * sw(i / sr);
  const lo = white(n, r); filter(lo, [['lp', 120], ['lp', 120]], sr, true);
  mixRms(out, air, 0.3); mixRms(out, lo, 0.35);
  oscAdd(out, wavetable([[1, 1], [2, 0.2]]), cyc(120, L), 0.02, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(7000, L), 0.004, sr);
} });

// the wing's intercom: the line opens with a click and a breath of hiss, three soft descending
// notes, then it closes with a pop; nobody speaks
defineShot('lv72_chime', { n: 2, dur: 5, peak: 0.85, gen(S, k) {
  const notes = k ? [987.77, 783.99, 659.25] : [1046.5, 830.61, 622.25];
  const bell = (f) => [[f, 0.7, 0.5], [f * 2.0, 0.35, 0.12], [f * 3.0, 0.2, 0.05]];
  S.click(0.05, 0.4, 1500, 0.004).noise(0.05, 0.05, 0.02, 0.4, [['bp', 3200, 0.6], ['hp', 1500]], 0.45);
  notes.forEach((f, i) => S.ring(0.5 + i * 0.62, bell(f), 1 - i * 0.12));
  S.noise(2.6, 0.04, 0.02, 0.5, [['bp', 3200, 0.6], ['hp', 1500]], 0.6).click(3.15, 0.5, 900, 0.006).thump(3.15, 0.2, 180, 90, 0.04);
  S.filter([['lp', 6000]]);
} });
void TAU; void rmsOf;
