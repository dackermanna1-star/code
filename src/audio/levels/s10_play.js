// Sounds of the foggy playground (52): a muffled quiet, chains that creak without a wind,
// a roundabout turning on a dry bearing.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, SR_LO, white, filterG, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, squeak } from '../dsp.js';

// fog swallows sound: a pressure in the ears, a faint breathing of the air, a drop now and then
defineBed('tone_lv52', { L: 14, sr: SR_LO, norm: ['rms', 0.1], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1], [2, 0.2, 1]]), cyc(41, L), 0.4, sr); yield;
  const air = white(n, r); yield* filterG(air, [['bp', 1500, 0.4], ['lp', 3200]], sr, true); yield;
  const lf = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.5 + 0.5 * (0.5 + 0.5 * lf(i / sr));
  mixRms(out, air, rmsOf(out) * 0.18);
  const low = white(n, r); yield* filterG(low, [['lp', 120], ['lp', 120]], sr, true); yield;
  mixRms(out, low, rmsOf(out) * 0.5);
  for (const t of [2.2, 7.9, 11.3]) S.bubble(t, 0.05, r.range(1500, 2300), r.range(0.006, 0.012), 0.4);
} });

// a dry chain swinging: two creaks per turn, a few links ticking
defineLoop('lv52_creak', { L: 3.2, sr: SR_LO, norm: ['peak', 0.5], gen(S) {
  const { r, sr } = S;
  S.add(squeak(r, 0.42, 760, 520, sr), 0.02, 0.5);
  S.add(squeak(r, 0.3, 560, 700, sr), 1.62, 0.4);
  for (const t of [0.08, 0.3, 1.66, 1.9]) S.click(t, 0.12, 2500, 0.002);
  for (let k = 0; k < 6; k++) S.noise(r.range(0.1, 3.0), 0.05, 0.002, 0.03, [['hp', 2600]]);
} });

// a roundabout going round on its own: a rumble in the bearing, a thin squeal that comes and goes
defineLoop('lv52_bearing', { L: 6, sr: SR_LO, norm: ['rms', 0.14], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1], [2, 0.4, 1]]), cyc(52, L), 0.3, sr); yield;
  const g = white(n, r); yield* filterG(g, [['bp', 420, 0.9], ['lp', 1100]], sr, true); yield;
  const f = cyc(1 / 3, L);
  for (let i = 0; i < n; i++) g[i] *= 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 2);
  mixRms(out, g, rmsOf(out) * 0.8);
  const fs = cyc(1180, L), fl = cyc(1 / 6, L);
  oscAdd(out, wavetable([[1, 1], [2, 0.2]]), fs, (t) => 0.02 * Math.pow(Math.max(0, Math.sin(TAU * fl * t + 1.2)), 3), sr);
} });

// something metal knocks once, far off in the white
defineShot('lv52_clank', { n: 3, dur: 1.8, sr: SR_LO, peak: 0.7, gen(S, k) {
  const r = S.r;
  S.click(0.02, 0.6, 1500, 0.003);
  S.ring(0.02, [[r.jit(330 + k * 40, 0.05), 0.35, 0.3], [r.jit(640 + k * 60, 0.05), 0.22, 0.2], [r.jit(1290, 0.05), 0.1, 0.1]]);
} });
