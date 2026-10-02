// Level 43 (The Long Drive): open land, a steady wind, steel singing in it.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// a broad wind over flat country: low body, slow gusts, a thin hiss through grass
defineBed('tone_lv43_wind', { L: 16, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 260], ['lp', 260]], sr, true);
  const gust = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) lo[i] *= 0.45 + 0.55 * gust(i / sr);
  mixRms(out, lo, 0.2);
  const mid = white(n, r); filter(mid, [['bp', 650, 0.5], ['lp', 1500]], sr, true);
  const g2 = loopLfo(r, L, [2, 3, 4]);
  for (let i = 0; i < n; i++) { const g = Math.max(0, 0.4 + 0.6 * g2(i / sr)); mid[i] *= g * g; }
  mixRms(out, mid, 0.1);
  const hs = white(n, r); filter(hs, [['hp', 2500], ['lp', 5000]], sr, true);
  mixRms(out, hs, rmsOf(out) * 0.04);
} });

// wind singing through the pillars and rails of a viaduct: thin, wavering notes
defineLoop('lv43_whistle', { L: 8, sr: 11025, norm: ['rms', 0.12], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  for (const [f, q, g] of [[470, 40, 1], [705, 50, 0.7], [1180, 60, 0.4]]) {
    const w = white(n, r); filter(w, [['bp', f, q], ['bp', f, q]], sr, true);
    const lf = loopLfo(r, L, [1, 2, 3]);
    for (let i = 0; i < n; i++) { const a = Math.max(0, 0.45 + 0.55 * lf(i / sr)); w[i] *= a * a; }
    mixRms(out, w, 0.1 * g);
  }
  const air = white(n, r); filter(air, [['bp', 900, 0.6], ['lp', 2000]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.25);
} });

// a loose steel panel knocks once against its frame, a long way off
defineShot('lv43_clank', { n: 3, dur: 4, sr: 22050, peak: 0.7, gen(S, k) {
  const r = S.r;
  const f = 210 + k * 38;
  S.noise(0.02, 0.5, 0.0005, 0.01, [['bp', 900, 1]]);
  S.ring(0.02, [[f, 0.9, 0.5], [f * 2.76, 0.5, 0.3], [f * 5.4, 0.3, 0.16], [f * 8.93, 0.18, 0.08], [r.range(1800, 2600), 0.2, 0.06]]);
  S.thump(0.02, 0.2, 90, 60, 0.12);
  S.filter([['lp', 3200]]);
} });
