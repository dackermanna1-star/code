// Level 35 (Static Fields): the air is a radio between stations.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, svf, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// hiss, a mains hum underneath, a carrier whine so faint you doubt it
defineBed('tone_lv35_static', { L: 8, sr: 22050, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const h = white(n, r); filter(h, [['bp', 2600, 0.35], ['lp', 7500], ['hp', 300]], sr, true);
  const sw = loopLfo(r, L, [2, 3, 7]);
  for (let i = 0; i < n; i++) h[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, h, 0.3);
  const lo = white(n, r); filter(lo, [['lp', 120], ['lp', 120]], sr, true);
  mixRms(out, lo, 0.1);
  const tab = wavetable([[1, 1], [2, 0.4], [3, 0.2]]);
  oscAdd(out, tab, cyc(50, L), 0.03, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(7440, L), (t) => 0.012 * (1 + 0.5 * Math.sin((TAU * 2 * t) / L)), sr);
  S.grit(0, 0.12, L, 90, L * 10, [['hp', 1800]]);
} });

// the same air while the phone is tuning: louder, whistling, crackling
defineBed('tone_lv35_tuned', { L: 8, sr: 22050, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const h = white(n, r); filter(h, [['bp', 3200, 0.3], ['lp', 9000], ['hp', 200]], sr, true);
  const sw = loopLfo(r, L, [3, 5, 11]);
  for (let i = 0; i < n; i++) h[i] *= 0.55 + 0.45 * Math.abs(sw(i / sr));
  mixRms(out, h, 0.4);
  // heterodyne whistles that wander
  const f1 = cyc(1180, L), f2 = cyc(1186.5, L), lf = loopLfo(r, L, [1, 2]);
  let ph1 = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, m = 1 + 0.06 * lf(t);
    ph1 += (TAU * f1 * m) / sr; ph2 += (TAU * f2) / sr;
    out[i] += 0.04 * (Math.sin(ph1) * Math.sin(ph2));
  }
  oscAdd(out, wavetable([[1, 1]]), cyc(2400, L), (t) => 0.025 * Math.max(0, lf(t)), sr);
  S.grit(0, 0.25, L, 220, L * 14, [['hp', 1500]]);
} });

// retuning: a squeal sweeping through the band, a pop on arrival
defineShot('lv35_tune', { n: 3, dur: 0.9, sr: 22050, peak: 0.8, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const w = white(n, r);
  svf(w, 'bpn', 5, (t) => 300 + (2600 + k * 500) * Math.min(1, t / 0.35) * (k % 2 ? 1 : 0.7), sr);
  mixRms(out, w, 0.5);
  mulInto(out, envelope(n, sr, [[0, 0], [0.03, 1], [0.35, 0.7], [0.5, 0.2], [0.9, 0]]));
  S.click(0.36, 0.5, 900, 0.004);
  S.noise(0.38, 0.3, 0.002, 0.08, [['bp', 2200, 0.6]]);
} });

// a mast's carrier: a thin tone beating with another, and a little hiss around it
defineLoop('lv35_carrier', { L: 6, sr: 11025, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.15]]);
  oscAdd(out, tab, cyc(1480, L), 0.4, sr);
  oscAdd(out, tab, cyc(1483.5, L), 0.35, sr, 0.3);
  const w = white(n, r); filter(w, [['bp', 3000, 0.5], ['lp', 4500]], sr, true);
  mixRms(out, w, rmsOf(out) * 0.22);
  const f = cyc(0.5, L);
  for (let i = 0; i < n; i++) out[i] *= 0.8 + 0.2 * Math.sin((TAU * f * i) / sr);
} });
