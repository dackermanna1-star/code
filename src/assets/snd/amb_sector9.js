// Sector 9's ambience loop (zm_sector9). Owned by the map's builder.
// FRAMEWORK PLACEHOLDER: an underground plant - mains hum, ventilation hiss, the odd tick.
import { stereoBed, swell, scatter, addTone, pink, biquad, normalize, mixInto, shape, TAU } from './ambkit.js';

export const AMB = {
  amb_sector9: {
    dur: 10, loop: 1.0, stereo: true, rms: 0.06, rate: 16000,
    fn: (P) => {
      const g = swell(P.rng, P.loopLen, [[1, 0.5], [2, 0.3], [4, 0.2]]);
      stereoBed(P, (ch, out) => {
        // mains hum: 50 Hz and its harmonics, beating slightly (periodic in the loop)
        for (let i = 0; i < P.len; i++) {
          const t = i / P.sr;
          const b = 1 + 0.15 * Math.sin(TAU * 2 * t / P.loopLen + ch);
          out[i] += 0.3 * b * Math.sin(TAU * 50 * t) + 0.18 * Math.sin(TAU * 100 * t + 0.4) + 0.08 * Math.sin(TAU * 150 * t + ch);
        }
        // the ventilation: a band of air that breathes slowly
        const a = pink(P.len, P.rng);
        biquad(a, P.sr, 'bandpass', 1400, 0.6);
        mixInto(out, shape(normalize(a, 1), P.sr, (t) => 0.5 + 0.5 * g(t)), 0, 0.3);
        scatter(P.rng, P.loopLen, 6, (t) => addTone(out, P.sr, t, { f: 1800 + P.rng() * 1600, amp: 0.15, tau: 0.02, len: 0.05 }));
      });
    },
  },
};
