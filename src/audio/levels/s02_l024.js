// Level 24 (Blast Off): night wind over a launch complex, floodlight ballasts, a beeper that keeps counting.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// open ground at night: a long wind, mains hum from the substations, nothing else
defineBed('tone_g02_night', { L: 14, sr: 11025, norm: ['rms', 0.17], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const w = white(n, r); filter(w, [['lp', 420], ['lp', 420]], sr, true); yield;
  const gust = loopLfo(r, L, [1, 2, 3, 5]);
  for (let i = 0; i < n; i++) w[i] *= 0.35 + 0.65 * Math.max(0, gust(i / sr) * 1.4);
  mixRms(out, w, 0.3); yield;
  const hi = white(n, r); filter(hi, [['bp', 1100, 3], ['lp', 2500]], sr, true);
  const f = cyc(0.15, L);
  for (let i = 0; i < n; i++) hi[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 3);
  mixRms(out, hi, rmsOf(out) * 0.08); yield;
  oscAdd(out, wavetable([[1, 1], [2, 0.5, 1], [3, 0.25, 2], [4, 0.1, 0.3]]), cyc(50, L), 0.12, sr); yield;
  oscAdd(out, wavetable([[1, 1]]), cyc(100, L), 0.04, sr, 0.4);
} });

// ballast of a floodlight bank
defineLoop('g02_flood', { L: 2, sr: 11025, norm: ['rms', 0.2], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.2], [2, 1], [3, 0.15, 1], [4, 0.4, 2], [6, 0.2, 1], [8, 0.1, 0.3]]), cyc(100, L), 1, sr); yield;
  const z = white(n, r); filter(z, [['bp', 2400, 2]], sr, true);
  const f = cyc(100, L);
  for (let i = 0; i < n; i++) z[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 4);
  mixRms(out, z, rmsOf(out) * 0.08); yield;
  for (let j = 0; j < 2; j++) S.click(r.range(0, L), 0.05, 2000, 0.001);
} });

// the countdown clock: a beep every second, forever on the same second
defineLoop('g02_beep', { L: 4, sr: 11025, norm: ['peak', 0.5], gen(S, L) {
  for (let k = 0; k < 4; k++) S.tone(k, 0.6, { f0: 1480, att: 0.002, dec: 0.05, dur: 0.14, shape: 'sq' });
  S.filter([['lp', 3200], ['hp', 500]]);
} });

// oxygen venting from a stage: a hiss that swells and falls
defineLoop('g02_vent', { L: 6, norm: ['rms', 0.2], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['hp', 1200], ['lp', 7000]], sr, true); yield;
  const b = white(n, r); filter(b, [['lp', 300]], sr, true); yield;
  const f = cyc(0.33, L), g = cyc(0.17, L);
  for (let i = 0; i < n; i++) { const t = i / sr; const e = 0.7 + 0.2 * Math.sin(TAU * f * t) + 0.1 * Math.sin(TAU * g * t + 1); a[i] *= e; b[i] *= e * e; }
  mixRms(out, a, 0.18); mixRms(out, b, 0.12); yield;
  for (let j = 0; j < 4; j++) S.bubble(r.range(0, L), r.range(0.05, 0.12), r.range(120, 300), r.range(0.03, 0.08), 0.15);
} });

// the engines answer the button: a roar that builds, holds, and dies away
defineShot('g02_ignite', { n: 1, dur: 15, sr: 11025, peak: 0.95, *gen(S) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['lp', 700]], sr); yield;
  const b = white(n, r); filter(b, [['bp', 110, 0.7], ['lp', 240]], sr); yield;
  const c = white(n, r); filter(c, [['hp', 1800], ['lp', 5000]], sr); yield;
  const sub = new Float32Array(n);
  for (let i = 0; i < n; i++) sub[i] = Math.sin(TAU * 31 * i / sr) * 0.6 + Math.sin(TAU * 47 * i / sr) * 0.3;
  mixRms(out, a, 0.35); mixRms(out, b, 0.35); mixRms(out, c, 0.12); mixRms(out, sub, 0.2); yield;
  const lf = loopLfo(r, 3, [3, 7, 11]);
  for (let i = 0; i < n; i++) out[i] *= 0.8 + 0.3 * lf(i / sr);
  mulInto(out, envelope(n, sr, [[0, 0], [0.3, 0.1], [3, 0.8], [4.5, 1], [9, 1], [12, 0.4], [15, 0]]));
  filter(out, [['lp', 2600]], sr);
} });

// a rolling gust of night air
defineShot('g02_gust', { n: 2, dur: 5, sr: 11025, peak: 0.7, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['bp', 380 + k * 120, 0.7], ['lp', 1300]], sr);
  const b = white(n, r); filter(b, [['bp', 760 + k * 90, 9]], sr);
  mixRms(out, a, 0.3); mixRms(out, b, 0.05);
  mulInto(out, envelope(n, sr, [[0, 0], [1.3, 0.8], [2.4, 1], [3.8, 0.4], [5, 0]]));
} });

// steel cooling in the night air: a few long, thin rings
defineShot('g02_steel', { n: 3, dur: 5, sr: 11025, peak: 0.7, gen(S, k) {
  const r = S.r, f = r.range(160, 320) * (1 + k * 0.2);
  let t = 0.1;
  for (let j = 0; j < 2 + k; j++) {
    S.click(t, 0.4, 900, 0.003);
    S.ring(t, [[f * r.jit(1, 0.02), 1.4, 0.4], [f * 2.4, 1.0, 0.25], [f * 4.3, 0.6, 0.15], [f * 6.9, 0.4, 0.08]], 1 - j * 0.2);
    t += r.range(0.6, 1.6);
  }
  S.filter([['lp', 2500]]);
} });
