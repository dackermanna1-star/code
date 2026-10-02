// Level 33 (The Rain Room): rain on a roof the size of a district, water pouring off the towers,
// thunder that is only the building settling.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { white, filter, mixRms, rmsOf, loopLfo, mulInto, envelope } from '../dsp.js';

function rain(S, L, heavy) {
  const { out, r, sr } = S, n = out.length;
  const hiss = white(n, r); filter(hiss, [['bp', 3200, 0.5], ['lp', 7000]], sr, true);
  const mid = white(n, r); filter(mid, [['bp', 1100, 0.6], ['lp', 2600]], sr, true);
  const lo = white(n, r); filter(lo, [['lp', heavy ? 240 : 150], ['lp', heavy ? 240 : 150]], sr, true);
  const lf = loopLfo(r, L, [2, 3, 5]);
  for (let i = 0; i < n; i++) { const e = 1 + (heavy ? 0.12 : 0.2) * lf(i / sr); hiss[i] *= e; mid[i] *= 1 + 0.25 * lf(i / sr + 1.3); }
  mixRms(out, hiss, heavy ? 0.5 : 0.36); mixRms(out, mid, heavy ? 0.34 : 0.22); mixRms(out, lo, heavy ? 0.42 : 0.2);
  // single drops somewhere in the hall
  const drops = heavy ? 36 : 22;
  for (let k = 0; k < drops; k++) S.noise(r.range(0, L - 0.1), r.range(0.05, 0.16), 0.0006, r.range(0.01, 0.03), [['bp', r.range(1500, 4200), 2]]);
  void rmsOf;
}
defineBed('tone_lv33_rain', { L: 10, sr: 11025, norm: ['rms', 0.2], gen(S, L) { rain(S, L, false); } });
defineBed('tone_lv33_heavy', { L: 10, sr: 11025, norm: ['rms', 0.26], gen(S, L) { rain(S, L, true); } });

// water pouring down a tower face and splashing into the street
defineLoop('lv33_fall', { L: 6, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['bp', 900, 0.5], ['lp', 3200]], sr, true);
  const b = white(n, r); filter(b, [['lp', 300], ['lp', 300]], sr, true);
  const lf = loopLfo(r, L, [3, 5, 8]);
  for (let i = 0; i < n; i++) a[i] *= 0.75 + 0.25 * lf(i / sr);
  mixRms(out, a, 0.5); mixRms(out, b, 0.35);
} });

defineShot('lv33_thunder', { n: 2, dur: 9, sr: 11025, peak: 0.85, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const rum = white(n, r); filter(rum, [['lp', 120], ['lp', 90]], sr);
  mulInto(rum, envelope(n, sr, [[0, 0], [0.6, 0.7], [1.4, 1], [3.5, 0.6], [6, 0.25], [9, 0]]));
  mixRms(out, rum, 0.5);
  const crack = white(n, r); filter(crack, [['bp', 700, 0.7], ['lp', 2200]], sr);
  mulInto(crack, envelope(n, sr, [[0, 0], [0.3 + k * 0.1, 0.0], [0.45 + k * 0.1, 0.8], [0.9, 0.2], [2.4, 0.08], [3.5, 0]]));
  mixRms(out, crack, 0.22);
} });
