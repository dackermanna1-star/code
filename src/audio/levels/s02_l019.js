// Level 19 (Crawlspace): old timber settling, a draught through the gaps, a hum from the floor above.
import { defineBed, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, stickSlip } from '../dsp.js';

// close, dry and dead: a furnace humming somewhere above, wind finding its way between the boards
defineBed('tone_g02_crawl', { L: 12, sr: 11025, norm: ['rms', 0.18], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1], [2, 0.5, 1], [3, 0.15, 2]]), cyc(60, L), 0.2, sr); yield;
  const low = white(n, r); filter(low, [['lp', 100], ['lp', 100]], sr, true);
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) low[i] *= 0.6 + 0.4 * sw(i / sr);
  mixRms(out, low, rmsOf(out) * 0.8); yield;
  const wind = white(n, r); filter(wind, [['bp', 520, 6], ['bp', 760, 8]], sr, true);
  const f1 = cyc(0.12, L), f2 = cyc(0.2, L);
  for (let i = 0; i < n; i++) wind[i] *= Math.max(0, 0.35 + 0.4 * Math.sin((TAU * f1 * i) / sr) + 0.3 * Math.sin((TAU * f2 * i) / sr + 2));
  mixRms(out, wind, rmsOf(out) * 0.12); yield;
  for (let j = 0; j < 4; j++) { const t = r.range(0, L); S.click(t, 0.1, 900, 0.004).ring(t, [[r.range(250, 600), 0.04, 0.12]]); }
} });

// timber taking up a load: a few dry ticks and a short groan
defineShot('g02_settle', { n: 3, dur: 2.6, sr: 11025, peak: 0.8, gen(S, k) {
  const r = S.r, sr = S.sr;
  for (let j = 0; j < 2 + k; j++) {
    const t = 0.05 + j * r.range(0.18, 0.5);
    S.click(t, 0.5, 900, 0.004);
    S.ring(t, [[r.range(160, 320), 0.09, 0.5], [r.range(420, 800), 0.06, 0.3], [r.range(900, 1500), 0.03, 0.12]]);
  }
  const base = r.range(20, 36);
  S.add(stickSlip(r, 0.9, (t) => base * (1 - 0.5 * t), (t) => Math.sin(Math.PI * t / 0.9) * 0.6, [[r.jit(220, 0.1), 10, 1], [r.jit(480, 0.1), 12, 0.5]], sr), 0.4, 0.6);
  S.filter([['lp', 2400]]);
} });

// a long, slow creak, as of a beam being leaned on by the whole house
defineShot('g02_creak', { n: 3, dur: 4, sr: 11025, peak: 0.8, gen(S, k) {
  const r = S.r, sr = S.sr;
  const dur = 2.6 + k * 0.4;
  const res = [[r.jit(150 + k * 30, 0.1), 9, 1], [r.jit(330 + k * 40, 0.1), 12, 0.6], [r.jit(760, 0.1), 10, 0.3]];
  S.add(stickSlip(r, dur, (t) => 16 + 12 * Math.sin(t * 1.3 + k), (t) => Math.pow(Math.sin(Math.PI * t / dur), 0.8), res, sr), 0.2, 1);
  S.click(dur + 0.3, 0.3, 700, 0.004).ring(dur + 0.3, [[r.range(200, 300), 0.1, 0.3]]);
  S.filter([['lp', 2000]]);
} });

// wind whistling in a gap between boards, far off
defineShot('g02_wind_gap', { n: 2, dur: 5, sr: 11025, peak: 0.7, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r);
  filter(a, [['bp', 700 + k * 150, 14], ['bp', 700 + k * 150, 14]], sr);
  const b = white(n, r); filter(b, [['lp', 300]], sr);
  mixRms(out, a, 0.3); mixRms(out, b, 0.1);
  mulInto(out, envelope(n, sr, [[0, 0], [1.2, 0.8], [2.5, 1], [3.6, 0.5], [5, 0]]));
} });
