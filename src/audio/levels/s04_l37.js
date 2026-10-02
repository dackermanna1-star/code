// Level 37 (Suburban Loop): a quiet sunny afternoon. Wind, sprinklers, a wind chime.
import { defineBed, defineLoop } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// a soft breeze, leaves, a high airy shimmer
defineBed('tone_lv37_day', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 220], ['lp', 220]], sr, true);
  const gust = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) lo[i] *= 0.5 + 0.5 * gust(i / sr);
  mixRms(out, lo, 0.12);
  const lv = white(n, r); filter(lv, [['bp', 2800, 0.45], ['lp', 4200]], sr, true);
  const g2 = loopLfo(r, L, [2, 3, 4]);
  for (let i = 0; i < n; i++) { const g = Math.max(0, 0.45 + 0.55 * g2(i / sr)); lv[i] *= g * g; }
  mixRms(out, lv, 0.09);
  const air = white(n, r); filter(air, [['hp', 3600], ['lp', 5000]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.05);
} });

// an impulse sprinkler: the head steps round with a tick-tick-tick, spray hissing in between,
// then the arm swings back
defineLoop('lv37_sprinkler', { L: 6, sr: 22050, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const hiss = white(n, r); filter(hiss, [['bp', 5200, 0.7], ['hp', 2600]], sr, true);
  const env = new Float32Array(n);
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const t = 0.35 + k * 0.62;
    S.click(t, 0.5, 1400, 0.004).ring(t, [[r.range(900, 1300), 0.03, 0.2], [r.range(2200, 3000), 0.02, 0.1]]);
    S.thump(t + 0.002, 0.22, 240, 120, 0.02);
    for (let i = Math.round(t * sr); i < Math.min(n, Math.round((t + 0.52) * sr)); i++) env[i] = Math.max(env[i], Math.exp(-(i / sr - t) * 3.0) * 0.8 + 0.25);
  }
  // the return sweep
  for (let i = Math.round(4.3 * sr); i < Math.round(5.5 * sr); i++) { const u = (i / sr - 4.3) / 1.2; env[i] = Math.max(env[i], Math.sin(Math.PI * u) * 0.9); }
  for (let i = 0; i < n; i++) hiss[i] *= env[i];
  mixRms(out, hiss, rmsOf(out) * 1.3 + 0.01);
  const dr = white(n, r); filter(dr, [['bp', 1500, 1.2]], sr, true);
  const f = cyc(11, L);
  for (let i = 0; i < n; i++) dr[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 6) * env[i];
  mixRms(out, dr, rmsOf(out) * 0.25);
} });

// a wind chime: a few tubes struck by the breeze, far apart
defineLoop('lv37_chime', { L: 12, sr: 22050, norm: ['rms', 0.12], gen(S, L) {
  const r = S.r;
  const notes = [784, 880, 1047, 1175, 1319, 1568];
  let t = 0.4;
  while (t < L - 1.2) {
    const burst = r.int(1, 3);
    for (let k = 0; k < burst; k++) {
      const f = notes[r.int(0, notes.length - 1)] * (r.chance(0.3) ? 0.5 : 1);
      S.noise(t, 0.12, 0.0005, 0.004, [['bp', 3000, 1]]);
      S.ring(t, [[f, r.range(0.5, 1.1), 0.5], [f * 2.76, 0.25, 0.14], [f * 5.4, 0.1, 0.05]], r.range(0.5, 1));
      t += r.range(0.12, 0.5);
    }
    t += r.range(1.4, 3.4);
  }
  S.filter([['lp', 6000]]);
} });
