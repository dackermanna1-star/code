// Level 13 (Barney's Bog): black water, slow bubbles, wood that creaks under its own weight.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

defineBed('tone_lv13_bog', { L: 12, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 170], ['lp', 170]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) lo[i] *= 0.55 + 0.45 * sw(i / sr);
  mixRms(out, lo, 0.32);
  const mid = white(n, r); filter(mid, [['bp', 520, 1.2], ['lp', 1100]], sr, true);
  const sw2 = loopLfo(r, L, [2, 3]);
  for (let i = 0; i < n; i++) mid[i] *= Math.max(0, 0.3 + 0.7 * sw2(i / sr));
  mixRms(out, mid, 0.06);
  // two low notes that never quite agree
  const tab = wavetable([[1, 1], [2, 0.3]]);
  oscAdd(out, tab, cyc(55, L), 0.05, sr);
  oscAdd(out, tab, cyc(58.33, L), 0.04, sr, 0.4);
  // swamp gas coming up
  for (let k = 0; k < 9; k++) S.bubble(r.range(0, L), r.range(0.04, 0.1), r.range(180, 520), r.range(0.03, 0.08), 0.3);
} });

// timber under load: slow groans, now and then a knock
defineLoop('lv13_creak', { L: 10, sr: 11025, norm: ['peak', 0.55], gen(S, L) {
  const r = S.r;
  for (const t0 of [0.6, 4.1, 7.0]) {
    const f = r.range(150, 260);
    S.tone(t0, 0.5, { f0: f, f1: f * r.range(0.6, 0.85), glide: 0.5, att: 0.1, dec: 0.4, dur: 1.1, shape: 'saw', vib: 0.05, vibF: 11 });
    S.noise(t0, 0.18, 0.2, 0.5, [['bp', f * 3, 2], ['lp', 1800]], 1.2);
  }
  for (const t0 of [2.4, 8.8]) S.thump(t0, 0.35, 120, 70, 0.1).noise(t0, 0.15, 0.001, 0.05, [['bp', 400, 1.5]]);
  S.filter([['lp', 2400]]);
} });

// far away: a heavy board settles and the whole structure answers
defineShot('lv13_settle', { n: 3, dur: 4.2, sr: 11025, peak: 0.85, gen(S, k) {
  const r = S.r;
  S.thump(0.1, 0.8, 110 - k * 10, 55, 0.18);
  S.noise(0.1, 0.4, 0.003, 0.12, [['bp', 300 + k * 60, 1.5], ['lp', 1600]]);
  const f = 190 + k * 35;
  S.tone(0.35, 0.28, { f0: f, f1: f * 0.62, glide: 0.8, att: 0.12, dec: 0.7, dur: 1.8, shape: 'saw', vib: 0.06, vibF: 9 });
  for (let i = 0; i < 4; i++) S.noise(0.9 + i * r.range(0.25, 0.5), 0.2, 0.001, 0.04, [['bp', r.range(300, 900), 2]]);
  S.filter([['lp', 2000]]);
} });
