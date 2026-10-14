// Hollow Creek's ambience loop (zm_hollow_creek). Owned by the map's builder.
// FRAMEWORK PLACEHOLDER: a still night - crickets on both sides and a faint breeze.
import { stereoBed, swell, windLayer, addTone, TAU } from './ambkit.js';

export const AMB = {
  amb_hollow_creek: {
    dur: 10, loop: 1.0, stereo: true, rms: 0.06, rate: 22050,
    fn: (P) => {
      const g = swell(P.rng, P.loopLen);
      stereoBed(P, (ch, out) => {
        windLayer(out, P, (t) => 0.3 * g(t - ch * 0.5), 0.5);
        // a cricket per side: trains of short chirps (three pulses each) every ~0.6 s
        const f = ch ? 4400 : 4050;
        for (let t = 0.1 + P.rng() * 0.3; t < P.loopLen + 0.5; t += 0.55 + P.rng() * 0.15) {
          for (let k = 0; k < 3; k++) addTone(out, P.sr, t + k * 0.034, { f, amp: 0.22, tau: 0.009, a: 0.002, len: 0.024 });
        }
        // a distant one, quieter and slower, panned across
        for (let t = 0.3; t < P.loopLen; t += 1.1) addTone(out, P.sr, t, { f: 3700, amp: 0.05 * (0.5 + 0.5 * Math.sin(TAU * t / P.loopLen + ch)), tau: 0.03, len: 0.08 });
      });
    },
  },
};
