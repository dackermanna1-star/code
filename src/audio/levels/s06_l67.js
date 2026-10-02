// Level 67 (The Endless Kitchen): extraction fans, pilot flames, thermostats ticking in the steel.
import { defineBed, defineLoop } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, oscAdd, wavetable, loopLfo } from '../dsp.js';

// ventilation: a wide roar with a slow tone of blades in it, and the room's low rumble
defineBed('tone_lv67_kitchen', { L: 8, sr: 11025, norm: ['rms', 0.22], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const roar = white(n, r); filter(roar, [['lp', 1500], ['hp', 90]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) roar[i] *= 0.75 + 0.25 * sw(i / sr);
  mixRms(out, roar, 0.3);
  oscAdd(out, wavetable([[1, 0.6], [2, 0.3, 1]]), cyc(31, L), 0.25, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(118, L), 0.05, sr, 0.2);
  const hiss = white(n, r); filter(hiss, [['hp', 3000], ['lp', 5000]], sr, true);
  mixRms(out, hiss, rmsOf(out) * 0.06);
} });

// a bank of ovens at temperature: gas hiss, a low flutter, thermostats clicking at their own pace
defineLoop('lv67_ovens', { L: 8, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const hiss = white(n, r); filter(hiss, [['bp', 2600, 0.5], ['lp', 6000]], sr, true);
  mixRms(out, hiss, 0.2);
  const rum = white(n, r); filter(rum, [['lp', 110], ['lp', 110]], sr, true);
  mixRms(out, rum, rmsOf(out) * 0.8);
  for (let k = 0; k < 5; k++) {
    const t = r.range(0.2, L - 0.4);
    S.click(t, 0.5, 2200, 0.003).ring(t, [[r.range(1200, 2600), 0.02, 0.25], [r.range(500, 900), 0.04, 0.2]]);
    S.click(t + 0.12, 0.3, 1800, 0.002);
  }
  const fa = cyc(0.5, L);
  for (let i = 0; i < n; i++) out[i] *= 1 + 0.08 * Math.sin((TAU * fa * i) / sr);
} });

// the extraction hood overhead: a steady fan with a blade tone and a hollow duct
defineLoop('lv67_hood', { L: 4, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const air = white(n, r); filter(air, [['bp', 520, 0.45], ['lp', 1800]], sr, true);
  mixRms(out, air, 0.4);
  const blade = cyc(87, L);
  for (let i = 0; i < n; i++) air[i] = 0;
  oscAdd(out, wavetable([[1, 0.5], [2, 0.4, 1], [3, 0.25, 2], [4, 0.1, 0.3]]), blade, rmsOf(out) * 0.4, sr);
  const duct = white(n, r); filter(duct, [['bp', 180, 3]], sr, true);
  mixRms(out, duct, rmsOf(out) * 0.3);
} });
