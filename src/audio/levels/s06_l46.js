// Level 46 (The Red Supermarket): dead air, chillers, and the sound of the lights letting go.
import { defineBed, defineLoop } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, oscAdd, wavetable, loopLfo } from '../dsp.js';

// a heavy, slow room tone: two slightly detuned low sines beating, dull air, a trace of whine
defineBed('tone_lv46_store', { L: 10, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.35, 1], [3, 0.1, 2]]);
  oscAdd(out, tab, cyc(41, L), 0.5, sr);
  oscAdd(out, tab, cyc(41.4, L), 0.45, sr, 0.3);
  oscAdd(out, tab, cyc(82.1, L), 0.15, sr, 0.6);
  const air = white(n, r); filter(air, [['bp', 300, 0.6], ['lp', 700]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) air[i] *= 0.45 + 0.55 * (0.5 + 0.5 * sw(i / sr));
  mixRms(out, air, rmsOf(out) * 0.55);
  oscAdd(out, wavetable([[1, 1]]), cyc(3150, L), 0.003, sr);
} });

// chiller case: compressor, fan, and a loose panel that buzzes with it
defineLoop('lv46_fridge', { L: 4, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.6], [2, 0.5, 1], [3, 0.25, 2], [4, 0.14, 0.4], [6, 0.06, 1]]), cyc(50, L), 1, sr);
  const fan = white(n, r); filter(fan, [['bp', 600, 0.7], ['lp', 1400]], sr, true);
  mixRms(out, fan, rmsOf(out) * 0.3);
  const rat = white(n, r); filter(rat, [['bp', 900, 6]], sr, true);
  const f = cyc(100, L);
  for (let i = 0; i < n; i++) rat[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 8);
  mixRms(out, rat, rmsOf(out) * 0.12);
  const sw = cyc(0.25, L);
  for (let i = 0; i < n; i++) out[i] *= 0.85 + 0.15 * Math.sin((TAU * sw * i) / sr);
} });
