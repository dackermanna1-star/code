// Level 38 (The Aquarium): filtration, pumps, water that is not there, glass under strain.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// a hall of filters: a deep hum, a trickle, a slow wash
defineBed('tone_lv38_filter', { L: 10, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 120], ['lp', 120]], sr, true);
  mixRms(out, lo, 0.35);
  oscAdd(out, wavetable([[1, 1], [2, 0.5], [3, 0.2]]), cyc(46, L), 0.06, sr);
  const g = loopLfo(r, L, [2, 3, 5]);
  const tr = white(n, r); filter(tr, [['bp', 2400, 1.2], ['hp', 1200]], sr, true);
  for (let i = 0; i < n; i++) tr[i] *= Math.max(0, 0.3 + 0.7 * g(i / sr)) * Math.pow(Math.abs(Math.sin(i * 0.0013 + g(i / sr) * 6)), 3);
  mixRms(out, tr, 0.05);
  for (let k = 0; k < 10; k++) S.bubble(r.range(0, L), 0.02, r.range(400, 1100), r.range(0.02, 0.05), 0.3);
  const w = white(n, r); filter(w, [['bp', 500, 0.7]], sr, true);
  for (let i = 0; i < n; i++) w[i] *= 0.5 + 0.5 * g(i / sr + 4);
  mixRms(out, w, 0.08);
} });

// a circulation pump: a heavy low turn with water churning in a pipe
defineLoop('lv38_pump', { L: 4, sr: 11025, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1], [2, 0.7], [3, 0.4], [5, 0.2]]), cyc(49, L), 0.5, sr);
  const g = white(n, r); filter(g, [['bp', 300, 1.0], ['lp', 900]], sr, true);
  const f = cyc(6, L);
  for (let i = 0; i < n; i++) g[i] *= 0.5 + 0.5 * Math.sin((TAU * f * i) / sr);
  mixRms(out, g, rmsOf(out) * 0.35);
  for (let k = 0; k < 12; k++) S.bubble(r.range(0, L), 0.03, r.range(250, 700), r.range(0.02, 0.06), 0.25);
  S.filter([['lp', 2200]]);
} });

// glass flexing under a load that is not there
defineShot('lv38_creak', { n: 2, dur: 4.2, sr: 11025, peak: 0.8, gen(S, k) {
  const { out, sr } = S, n = out.length;
  S.tone(0.2, 0.18, { f0: 180 + k * 40, f1: 130 + k * 30, glide: 1.6, att: 0.9, dec: 1.4, dur: 3.2, shape: 'saw', vib: 0.03, vibF: 11 });
  S.tone(0.6, 0.1, { f0: 360 + k * 60, f1: 250, glide: 1.2, att: 0.6, dec: 1.2, dur: 2.5, shape: 'tri', vib: 0.05, vibF: 17 });
  S.noise(0.1, 0.25, 0.8, 1.6, [['bp', 700, 2], ['lp', 1800]], 3);
  S.thump(2.6, 0.5, 90, 45, 0.25);
  filter(out, [['lp', 2500]], sr);
  mulInto(out, envelope(n, sr, [[0, 0.3], [0.8, 1], [3.2, 0.7], [4.2, 0]]));
} });

// water moving through pipes somewhere above
defineShot('lv38_gurgle', { n: 2, dur: 4, sr: 11025, peak: 0.8, gen(S, k) {
  const { r } = S;
  for (let t = 0.1; t < 3.4; t += r.range(0.08, 0.3)) S.bubble(t, r.range(0.15, 0.4), r.range(200, 800), r.range(0.03, 0.09), 0.3);
  S.noise(0.2, 0.3, 0.6, 1.8, [['bp', 400 + k * 60, 0.8], ['lp', 1200]], 3.4);
  S.filter([['lp', 2000]]);
} });
void TAU;
