// Level 30 (The Avian Conservatory): fans and misters, dripping leaves, wet air. No birds.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// humid, still air: a far fan, a soft wash of mist, drips on broad leaves
defineBed('tone_lv30_humid', { L: 12, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 200], ['lp', 200]], sr, true);
  mixRms(out, lo, 0.3);
  const g = loopLfo(r, L, [1, 2, 3]);
  const air = white(n, r); filter(air, [['bp', 3200, 0.7], ['lp', 6000]], sr, true);
  for (let i = 0; i < n; i++) air[i] *= 0.4 + 0.6 * (0.5 + 0.5 * g(i / sr));
  mixRms(out, air, 0.1);
  oscAdd(out, wavetable([[1, 1], [2, 0.5]]), cyc(24, L), 0.03, sr);
  for (let k = 0; k < 9; k++) S.bubble(r.range(0, L), 0.06, r.range(900, 1700), r.range(0.008, 0.02), 0.5);
} });

// a big ceiling fan: slow blade passes, a soft rush
defineLoop('lv30_fan', { L: 4, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['bp', 500, 0.6], ['lp', 1200]], sr, true);
  const f = cyc(1.5 * 4, L);
  for (let i = 0; i < n; i++) a[i] *= 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 2);
  mixRms(out, a, 0.3);
  oscAdd(out, wavetable([[1, 1], [2, 0.4]]), cyc(32, L), 0.1, sr);
  const b = white(n, r); filter(b, [['lp', 140], ['lp', 140]], sr, true);
  mixRms(out, b, rmsOf(out) * 0.4);
} });

// a mister: a fine hiss through nozzles
defineLoop('lv30_mister', { L: 3, sr: 11025, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const h = white(n, r); filter(h, [['hp', 2500], ['lp', 5200]], sr, true);
  mixRms(out, h, 0.3);
  const g = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) out[i] *= 0.8 + 0.2 * g(i / sr);
  for (let k = 0; k < 6; k++) S.bubble(r.range(0, L), 0.03, r.range(1400, 2600), r.range(0.006, 0.014), 0.4);
} });

// the misting cycle starts: valves, then a hiss that swells through the house
defineShot('lv30_mist_on', { n: 1, dur: 5, sr: 11025, peak: 0.8, gen(S) {
  const { out, r, sr } = S, n = out.length;
  S.thump(0.0, 0.5, 100, 50, 0.12).click(0.0, 0.4, 800, 0.004);
  S.thump(0.4, 0.4, 90, 45, 0.12).click(0.4, 0.3, 800, 0.004);
  const h = white(n, r); filter(h, [['hp', 2000], ['lp', 5200]], sr);
  mulInto(h, envelope(n, sr, [[0, 0], [0.6, 0], [2.4, 1], [4.0, 0.9], [5, 0]]));
  for (let i = 0; i < n; i++) out[i] += h[i] * 0.5;
  const lo = white(n, r); filter(lo, [['lp', 300]], sr);
  mulInto(lo, envelope(n, sr, [[0, 0], [0.8, 0], [2.6, 0.6], [5, 0]]));
  mixRms(out, lo, rmsOf(out) * 0.3);
} });
