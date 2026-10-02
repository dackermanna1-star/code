// Level 5 (Ornate Hotel): the hush of a very large gilded hall, a grandfather clock, the flap of
// a number plate changing, a clock striking somewhere far off. Nothing here is a voice.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, envelope } from '../dsp.js';

// air in a big room: a low wash, a faint breathing swell, a distant pair of organ-like tones
defineBed('tone_lv5_hall', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 170], ['lp', 170]], sr, true);
  const air = white(n, r); filter(air, [['bp', 600, 0.5], ['lp', 1400]], sr, true);
  const lf = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) { const e = 1 + 0.25 * lf(i / sr); lo[i] *= e; air[i] *= 0.7 + 0.3 * lf(i / sr + 3); }
  mixRms(out, lo, 0.5); mixRms(out, air, 0.12);
  const tab = wavetable([[1, 1], [2, 0.5], [3, 0.2]]);
  const sw = (t) => 0.5 + 0.5 * Math.sin((TAU * 2 * t) / L + 1);
  oscAdd(out, tab, cyc(55, L), (t) => 0.022 * (0.5 + 0.5 * Math.sin((TAU * t) / L)), sr);
  oscAdd(out, tab, cyc(82.4, L), (t) => 0.014 * sw(t), sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(1318, L), (t) => 0.0035 * sw(t + 3), sr);
} });

// a grandfather clock: a slow tick and a lower tock, once a second
defineLoop('lv5_tick', { L: 4, sr: 22050, norm: ['peak', 0.5], gen(S) {
  const r = S.r;
  for (let k = 0; k < 4; k++) {
    const t = k * 1.0, hi = k % 2 === 0;
    const f = hi ? 1180 : 940;
    S.click(t, 0.6, 1400, 0.0035).ring(t, [[f, 0.05, 0.4], [f * 2.3, 0.03, 0.15], [hi ? 310 : 260, 0.12, 0.35]], 0.7);
    S.thump(t, 0.12, 190, 120, 0.05);
    void r;
  }
  S.filter([['lp', 3200], ['hp', 120]]);
} });

// brass plate changing its mind: a ratchet of flaps
defineShot('lv5_flap', { n: 3, dur: 0.9, peak: 0.55, gen(S, k) {
  const r = S.r;
  let t = 0.02;
  const n = 9 + k * 3;
  for (let i = 0; i < n; i++) {
    const g = 0.5 + 0.5 * Math.pow(1 - i / (n + 2), 0.8);
    S.click(t, 0.5 * g, 1600 + r.range(0, 900), 0.0025);
    S.noise(t, 0.28 * g, 0.0006, 0.012, [['bp', 1400 + r.range(0, 700), 1.4]]);
    t += 0.028 + 0.012 * r.range(0, 1) + i * 0.0035;
  }
  S.ring(t - 0.02, [[2400, 0.03, 0.2], [3100, 0.025, 0.12]], 0.35);
  S.filter([['hp', 400], ['lp', 5200]]);
} });

// a tall clock striking the hour a long way off (tubular bells)
defineShot('lv5_chime', { n: 2, dur: 9, sr: 11025, peak: 0.6, gen(S, k) {
  const bell = (f, d) => [[f, d, 0.5], [f * 2.0, d * 0.5, 0.16], [f * 2.76, d * 0.3, 0.1], [f * 5.4, d * 0.15, 0.05], [f * 8.9, d * 0.08, 0.02]];
  const q = k === 0 ? [415.3, 370, 329.6, 246.9] : [329.6, 370, 415.3, 329.6];
  q.forEach((f, i) => S.noise(0.2 + i * 1.15, 0.05, 0.001, 0.006, [['bp', 2400, 1]]).ring(0.2 + i * 1.15, bell(f, 2.6), 1));
  S.ring(5.4, bell(164.8, 3.4), 0.9).noise(5.4, 0.06, 0.001, 0.008, [['bp', 1800, 1]]);
  S.filter([['lp', 3000]]);
} });
