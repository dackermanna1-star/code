// Level 21 (Numbered Hotel): the air of an enormous sealed building and a chime nobody answers.
import { defineBed, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, mixInto } from '../dsp.js';

// big air handling a long way off: a low turbine thrum, a thin band of moving air, a cold hiss
defineBed('tone_lv21_air', { L: 12, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const rum = white(n, r); filter(rum, [['lp', 110], ['lp', 110]], sr, true);
  const air = white(n, r); filter(air, [['bp', 380, 0.7], ['lp', 1100]], sr, true);
  const hiss = white(n, r); filter(hiss, [['hp', 1800], ['lp', 3600]], sr, true);
  const lf = loopLfo(r, L, [1, 2, 4]);
  for (let i = 0; i < n; i++) { const e = 1 + 0.2 * lf(i / sr); air[i] *= e; hiss[i] *= 0.6 + 0.4 * lf(i / sr + 1.7); }
  mixRms(out, rum, 0.5); mixRms(out, air, 0.3); mixRms(out, hiss, 0.05);
  oscAdd(out, wavetable([[1, 1], [2, 0.4], [3, 0.2]]), cyc(41, L), (t) => 0.05 * (1 + 0.3 * Math.sin((TAU * 3 * t) / L)), sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(41.5, L), 0.03, sr);
  void rmsOf; void mixInto;
} });

// three descending notes of an announcement jingle, then silence
defineShot('lv21_chime', { n: 2, dur: 5.5, sr: 22050, peak: 0.6, gen(S, k) {
  const f = k === 0 ? [784, 659.3, 523.3] : [659.3, 523.3, 392];
  f.forEach((hz, i) => {
    const t = 0.1 + i * 0.62;
    S.tone(t, 0.5, { f0: hz, att: 0.012, dec: 1.0, dur: 1.6, shape: 'sin' });
    S.tone(t, 0.12, { f0: hz * 2, att: 0.008, dec: 0.5, dur: 1.0, shape: 'sin' });
    S.click(t, 0.06, 2500, 0.002);
  });
  S.filter([['lp', 3200], ['hp', 180]]);
} });
