// Level 11 (The Ruined City): wind in empty canyons, the hum of signals that still run, a far-off collapse.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// wind funnelling between towers: a low moan, slow gusts, the hiss of dust
defineBed('tone_lv11_ruin', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 170], ['lp', 170]], sr, true);
  const gust = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) lo[i] *= 0.45 + 0.55 * gust(i / sr);
  mixRms(out, lo, 0.2);
  const moan = white(n, r); filter(moan, [['bp', 340, 2.5], ['bp', 340, 2.5]], sr, true);
  const g2 = loopLfo(r, L, [1, 3]);
  for (let i = 0; i < n; i++) { const g = Math.max(0, 0.35 + 0.65 * g2(i / sr)); moan[i] *= g * g; }
  mixRms(out, moan, 0.07);
  const dust = white(n, r); filter(dust, [['hp', 2200], ['lp', 4600]], sr, true);
  const g3 = loopLfo(r, L, [2, 5]);
  for (let i = 0; i < n; i++) dust[i] *= 0.4 + 0.6 * Math.max(0, g3(i / sr));
  mixRms(out, dust, rmsOf(out) * 0.06);
} });

// a traffic signal's controller: a faint mains hum with the odd tick of a relay
defineLoop('lv11_buzz', { L: 4, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.4], [2, 1, 1], [3, 0.25, 2], [4, 0.3, 0.5]]), cyc(100, L), 1, sr);
  const hiss = white(n, r); filter(hiss, [['bp', 3000, 1.2]], sr, true);
  mixRms(out, hiss, rmsOf(out) * 0.1);
  S.click(1.3, 0.2, 2200, 0.002).click(2.9, 0.16, 1800, 0.002);
} });

// masonry letting go in the distance: a rumble, a slide of rubble, one heavy settle
defineShot('lv11_collapse', { n: 3, dur: 6, sr: 11025, peak: 0.8, gen(S, k) {
  const r = S.r;
  S.thump(0.15, 0.9, 62 - k * 6, 30, 0.5);
  S.noise(0.1, 0.5, 0.2, 1.4, [['lp', 280], ['lp', 280]], 3.2);
  for (let i = 0; i < 18 + k * 4; i++) { const t = 0.3 + r() * 2.8; S.noise(t, r.range(0.05, 0.25), 0.002, r.range(0.03, 0.12), [['bp', r.range(500, 1600), 1.2]]); S.ring(t, [[r.range(260, 700), 0.05, 0.08]]); }
  S.thump(3.4, 0.5, 48, 28, 0.35);
  S.noise(3.4, 0.3, 0.05, 1.2, [['lp', 200]], 2.4);
  S.filter([['lp', 3000]]);
} });
