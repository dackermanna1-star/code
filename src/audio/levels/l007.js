// Level 7 (Thalassophobia): the open sea at night.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo } from '../dsp.js';

// low, slow swell of a lot of water, no wind, no birds
defineBed('tone_ocean', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const body = white(n, r); filter(body, [['lp', 140], ['lp', 140]], sr, true);
  const swell = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) body[i] *= 0.55 + 0.45 * swell(i / sr);
  mixRms(out, body, 0.2);
  const hiss = white(n, r); filter(hiss, [['bp', 700, 0.6], ['lp', 1600]], sr, true);
  const f = cyc(0.125, L);
  for (let i = 0; i < n; i++) hiss[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 3);
  mixRms(out, hiss, rmsOf(out) * 0.25);
} });

// small waves knocking against concrete pillars
defineLoop('lapping', { L: 6, norm: ['rms', 0.18], gen(S, L) {
  const r = S.r;
  for (let t = 0.1; t < L - 0.2; t += r.range(0.25, 0.9)) {
    S.noise(t, r.range(0.25, 0.6), 0.02, r.range(0.12, 0.3), [['bp', r.range(300, 700), 1.2], ['lp', 1800]]);
    if (r.chance(0.5)) S.bubble(t + r.range(0.02, 0.1), r.range(0.1, 0.25), r.range(500, 1100), r.range(0.03, 0.07));
  }
  S.filter([['lp', 2500]]);
} });

// a long groan of steel under pressure, far below: not a voice, not an animal
defineShot('deep_groan', { n: 2, dur: 7, sr: 11025, peak: 0.9, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  let ph = 0;
  const f0 = 38 + k * 6;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 + 6 * Math.sin(t * 0.7 + k) + 3 * Math.sin(t * 2.3);
    ph += (TAU * f) / sr;
    out[i] = Math.sin(ph) * 0.6 + Math.sin(ph * 2.01) * 0.25 + Math.sin(ph * 3.03) * 0.12;
  }
  const grit = white(n, r); filter(grit, [['bp', 220, 4]], sr);
  mixRms(out, grit, rmsOf(out) * 0.15);
  mulInto(out, envelope(n, sr, [[0, 0], [1.5, 0.6], [3.0, 1], [4.6, 0.7], [7, 0]]));
  filter(out, [['lp', 420]], sr);
} });
