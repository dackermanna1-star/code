// Level 17 (The Carrier): engines, a hull that never stops working, wind in rigging, far hatches.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, stickSlip } from '../dsp.js';

// the whole ship underfoot: deep engines, a slow swell in the level of everything (7.85 s, the sway)
defineBed('tone_g02_carrier', { L: 15.7, sr: 11025, norm: ['rms', 0.22], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.5, 1], [3, 0.2, 2]]);
  oscAdd(out, tab, cyc(31, L), 0.5, sr); oscAdd(out, tab, cyc(31.8, L), 0.4, sr, 0.3); oscAdd(out, tab, cyc(62.2, L), 0.15, sr, 0.6); yield;
  const rum = white(n, r); filter(rum, [['lp', 90], ['lp', 90]], sr, true); yield;
  const sw = cyc(1 / 7.85, L), th = cyc(3.3, L);
  for (let i = 0; i < n; i++) { const t = i / sr; rum[i] *= (0.7 + 0.3 * Math.sin(TAU * sw * t)) * (0.75 + 0.25 * Math.pow(0.5 + 0.5 * Math.sin(TAU * th * t), 2)); }
  mixRms(out, rum, rmsOf(out) * 0.8); yield;
  const res = white(n, r); filter(res, [['bp', 74, 14], ['bp', 138, 12]], sr, true);
  for (let i = 0; i < n; i++) res[i] *= 0.5 + 0.5 * Math.sin(TAU * sw * (i / sr) + 1.6);
  mixRms(out, res, rmsOf(out) * 0.12); yield;
  const air = white(n, r); filter(air, [['bp', 1800, 0.5], ['lp', 3600]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.04);
  for (let j = 0; j < 4; j++) { const t = r.range(0, L); S.click(t, 0.05, 900, 0.004).ring(t, [[r.range(140, 330), 0.12, 0.1]]); }
} });

// an engine room's cylinders: slow firing, a rattle riding on it
defineLoop('g02_diesel', { L: 3, sr: 11025, norm: ['rms', 0.22], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1], [2, 0.7, 1], [3, 0.5, 2], [4, 0.3, 0.5], [6, 0.15]]), cyc(24, L), 0.6, sr); yield;
  const rum = white(n, r); filter(rum, [['lp', 160]], sr, true);
  const f = cyc(8, L);
  for (let i = 0; i < n; i++) rum[i] *= 0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 3);
  mixRms(out, rum, rmsOf(out) * 0.9); yield;
  const tk = white(n, r); filter(tk, [['bp', 900, 3]], sr, true);
  for (let i = 0; i < n; i++) tk[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 8);
  mixRms(out, tk, rmsOf(out) * 0.18);
} });

// wind in a mast's rigging: a thin note that bends
defineLoop('g02_wire', { L: 6, sr: 11025, norm: ['rms', 0.14], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['bp', 880, 24], ['bp', 880, 24]], sr, true); yield;
  const b = white(n, r); filter(b, [['bp', 1320, 28]], sr, true);
  const f = cyc(0.33, L), g = cyc(0.17, L);
  for (let i = 0; i < n; i++) { const t = i / sr; const e = Math.max(0, 0.5 + 0.4 * Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * g * t + 2)); a[i] *= e; b[i] *= e * 0.6; }
  mixRms(out, a, 0.2); mixRms(out, b, 0.08);
  const low = white(n, r); filter(low, [['lp', 200]], sr, true); mixRms(out, low, 0.06);
} });

// the engines are asked for more
defineShot('g02_surge', { n: 1, dur: 8, sr: 11025, peak: 0.95, *gen(S) {
  const { out, r, sr } = S, n = out.length;
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = 27 + 16 * Math.sin(Math.min(1, t / 5) * Math.PI / 2);
    ph += (TAU * f) / sr; ph2 += (TAU * f * 2.01) / sr;
    out[i] = Math.sin(ph) * 0.6 + Math.sin(ph2) * 0.3;
  } yield;
  const rum = white(n, r); filter(rum, [['lp', 140], ['lp', 140]], sr); mixRms(out, rum, rmsOf(out) * 0.7); yield;
  const hi = white(n, r); filter(hi, [['bp', 700, 0.6], ['lp', 1800]], sr); mixRms(out, hi, rmsOf(out) * 0.18);
  mulInto(out, envelope(n, sr, [[0, 0], [2.4, 0.9], [4.5, 1], [6.2, 0.5], [8, 0]]));
  filter(out, [['lp', 900]], sr);
} });

// the hull taking a load: a long, low groan of steel on steel
defineShot('g02_hull_groan', { n: 3, dur: 8, sr: 11025, peak: 0.9, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const dur = 5 + k;
  S.add(stickSlip(r, dur, (t) => 7 + 7 * Math.sin(t * 0.9 + k), (t) => Math.pow(Math.sin(Math.PI * t / dur), 0.7), [[r.jit(64 + k * 8, 0.08), 12, 1], [r.jit(150, 0.1), 14, 0.6], [r.jit(330, 0.1), 12, 0.3]], sr), 0.3, 1);
  let ph = 0;
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr; ph += (TAU * (46 - 6 * t / 8 + 3 * Math.sin(t * 1.3))) / sr; tone[i] = Math.sin(ph) + 0.4 * Math.sin(2 * ph); }
  mixRms(out, tone, rmsOf(out) * 0.7);
  mulInto(out, envelope(n, sr, [[0, 0], [1.4, 0.7], [3.2, 1], [5.4, 0.6], [8, 0]]));
  filter(out, [['lp', 520]], sr);
} });

// a heavy hatch, somewhere along the hull, and the ship ringing afterwards
defineShot('g02_bulkhead', { n: 2, dur: 5, sr: 11025, peak: 0.9, gen(S, k) {
  const r = S.r, f = r.range(55, 80) * (1 + k * 0.25);
  S.thump(0.03, 0.8, 90, 40, 0.15);
  S.noise(0.03, 0.5, 0.001, 0.05, [['lp', 500]]);
  S.ring(0.03, [[f, 1.4, 0.5], [f * 2.3, 0.9, 0.3], [f * 4.2, 0.6, 0.2], [f * 7.1, 0.4, 0.1]]);
  for (const [d, g] of [[0.6, 0.3], [1.3, 0.14]]) { S.thump(0.03 + d, 0.4 * g, 80, 40, 0.1); S.ring(0.03 + d, [[f, 1, 0.3]], g); }
  S.filter([['lp', 1400]]);
} });

// metal struck far off along the deck
defineShot('g02_clang_far', { n: 2, dur: 4, sr: 11025, peak: 0.8, gen(S, k) {
  const r = S.r, f = r.range(170, 250) * (1 + k * 0.3);
  S.click(0.02, 0.6, 1200, 0.003);
  S.ring(0.02, [[f, 1.2, 0.4], [f * 2.76, 0.8, 0.3], [f * 5.4, 0.5, 0.2], [f * 8.9, 0.3, 0.1]]);
  S.ring(0.5, [[f * 0.99, 1.0, 0.15]]); S.ring(1.05, [[f * 1.01, 0.8, 0.07]]);
  S.filter([['lp', 2600]]);
} });
