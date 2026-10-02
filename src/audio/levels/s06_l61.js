// Level 61 (The Snackrooms): a warm room tone, popcorn popping, soft lounge muzak.
import { defineBed, defineLoop } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, oscAdd, wavetable, loopLfo } from '../dsp.js';
import { muzak, muzakLen, PROG } from './s06_muzak.js';

// a soft, warm hum: fridges in the next room, a ceiling fan, a little air
defineBed('tone_lv61_cosy', { L: 8, sr: 11025, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.6], [2, 0.3, 1], [3, 0.12, 2]]), cyc(60, L), 0.4, sr);
  oscAdd(out, wavetable([[1, 0.5], [2, 0.2, 1]]), cyc(90.2, L), 0.15, sr, 0.4);
  const air = white(n, r); filter(air, [['bp', 380, 0.5], ['lp', 1100]], sr, true);
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, air, rmsOf(out) * 0.6);
  const fan = cyc(1.5, L);
  for (let i = 0; i < n; i++) out[i] *= 1 + 0.06 * Math.sin((TAU * fan * i) / sr);
} });

// the popper: kernels going off at an uneven pace over a low kettle hum
defineLoop('lv61_popper', { L: 6, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.5], [2, 0.3, 1]]), cyc(70, L), 0.15, sr);
  for (let t = 0.05; t < L - 0.05; t += r.range(0.06, 0.35)) {
    const g = r.range(0.3, 1);
    S.noise(t, 0.6 * g, 0.0005, r.range(0.006, 0.02), [['bp', r.range(900, 2400), 1.6]]);
    S.ring(t, [[r.range(300, 600), 0.03, 0.2 * g]]);
  }
  const hiss = white(n, r); filter(hiss, [['bp', 4000, 0.6]], sr, true);
  mixRms(out, hiss, rmsOf(out) * 0.1);
  S.filter([['lp', 5500]]);
} });

// lounge muzak through a ceiling speaker
const BPM = 84;
defineLoop('lv61_muzak', { L: muzakLen(PROG.bossa, BPM), norm: ['rms', 0.14], gen(S, L) {
  muzak(S, L, { prog: PROG.bossa, bpm: BPM, dens: 0.6, detune: 12, wow: 0.005, wowCycles: 3, lp: 2200, lead: 'vibes', pad: 0.9, bass: 1.0 });
} });
