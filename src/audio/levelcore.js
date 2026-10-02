// Sounds of the level system itself: the hum of a level door, the door opening, the swell when
// a new level appears, and the phone's beeps.
import { defineShot, defineLoop, defineUi } from './registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, oscAdd, wavetable, cyc, rmsOf } from './dsp.js';

// a warm, slightly detuned organ-like hum behind a closed door: unlike anything else in the building
defineLoop('door_hum', { L: 4, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.35], [3, 0.12], [4, 0.05]]);
  oscAdd(out, tab, cyc(110, L), 0.5, sr);
  oscAdd(out, tab, cyc(110.5, L), 0.4, sr, 0.3);
  oscAdd(out, tab, cyc(164.75, L), 0.22, sr, 0.6);
  oscAdd(out, tab, cyc(220.25, L), 0.12, sr, 0.1);
  const air = white(n, r); filter(air, [['bp', 900, 0.8], ['lp', 2400]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.18);
  const fa = cyc(0.25, L), fb = cyc(0.75, L);
  for (let i = 0; i < n; i++) out[i] *= 0.82 + 0.12 * Math.sin((TAU * fa * i) / sr) + 0.06 * Math.sin((TAU * fb * i) / sr + 1);
  filter(out, [['lp', 1800]], sr, true);
} });

// latch, a heavy hinge, then air rushing past
defineShot('door_open', { n: 2, dur: 2.6, peak: 0.85, gen(S, k) {
  const r = S.r;
  S.click(0, 0.6, 1800, 0.004).click(0.03, 0.4, 2600, 0.003);
  S.thump(0.05, 0.35, 140, 70, 0.12);
  // creak: a slowly gliding resonant squeal
  S.tone(0.22, 0.12, { f0: 340 + k * 40, f1: 220 + k * 30, glide: 0.9, att: 0.08, dec: 0.5, dur: 0.8, shape: 'saw', vib: 0.04, vibF: 13 });
  S.noise(0.15, 0.5, 0.5, 1.6, [['bp', 700, 0.6], ['lp', 2600]], 2.2);
  S.noise(0.2, 0.3, 0.9, 1.2, [['lp', 180]], 2.0);
  void r;
} });

// the swell under the title card: a low chord opening up, with a little shimmer on top
defineShot('arrive', { n: 3, dur: 7, peak: 0.8, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const roots = [55, 49, 61.74];
  const f0 = roots[k];
  const tab = wavetable([[1, 1], [2, 0.5], [3, 0.25], [5, 0.08]]);
  for (const [m, g, ph] of [[1, 0.5, 0], [1.5, 0.3, 0.2], [2, 0.25, 0.5], [3, 0.12, 0.1], [4.01, 0.06, 0.7]]) oscAdd(out, tab, f0 * m, g, sr, ph);
  const sh = white(n, r); filter(sh, [['bp', 3200, 3], ['bp', 3200, 3]], sr);
  mixRms(out, sh, rmsOf(out) * 0.08);
  mulInto(out, envelope(n, sr, [[0, 0], [1.8, 0.7], [3.2, 1], [5.2, 0.45], [7, 0]]));
  filter(out, [['lp', 2200]], sr);
} });

// the phone's locator beep and the double beep when you face the door
defineShot('phone_ping', { n: 1, dur: 0.18, peak: 0.7, gen(S) {
  S.tone(0, 0.6, { f0: 1760, att: 0.001, dec: 0.05, dur: 0.07, shape: 'sq' }).filter([['lp', 3800], ['hp', 300]]);
} });
defineShot('phone_lock', { n: 1, dur: 0.32, peak: 0.7, gen(S) {
  S.tone(0, 0.55, { f0: 2093, att: 0.001, dec: 0.04, dur: 0.06, shape: 'sq' }).tone(0.11, 0.55, { f0: 2637, att: 0.001, dec: 0.06, dur: 0.08, shape: 'sq' }).filter([['lp', 4200], ['hp', 300]]);
} });
defineUi('phone_up', { dur: 0.3, gen(S) {
  S.click(0, 0.5, 900, 0.006).tone(0.05, 0.3, { f0: 1175, att: 0.001, dec: 0.04, dur: 0.05, shape: 'sq' }).filter([['lp', 3500]]);
} });
defineUi('phone_down', { dur: 0.25, gen(S) {
  S.tone(0, 0.25, { f0: 880, att: 0.001, dec: 0.04, dur: 0.05, shape: 'sq' }).click(0.07, 0.5, 900, 0.006).filter([['lp', 3200]]);
} });
