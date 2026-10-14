// Blackwater Docks' ambience loop (zm_blackwater). Owned by the map's builder.
// FRAMEWORK PLACEHOLDER: water slapping the quay, a raw wind off the harbour.
import { stereoBed, swell, windLayer, brown, biquad, normalize, mixInto, shape, TAU } from './ambkit.js';

export const AMB = {
  amb_blackwater: {
    dur: 10, loop: 1.0, stereo: true, rms: 0.07, rate: 16000,
    fn: (P) => {
      const g = swell(P.rng, P.loopLen);
      stereoBed(P, (ch, out) => {
        windLayer(out, P, (t) => g(t - ch * 0.6), 0.9);
        // lapping: low noise in swells of ~1.4 s (7 per loop), each with a quick slap
        const w = brown(P.len, P.rng);
        biquad(w, P.sr, 'lowpass', 520, 0.8);
        const lap = (t) => { const u = ((t / P.loopLen) * 7 + ch * 0.3) % 1; return Math.pow(Math.sin(Math.PI * u), 6) * (0.6 + 0.4 * Math.sin(TAU * 2 * t / P.loopLen)); };
        mixInto(out, shape(normalize(w, 1), P.sr, lap), 0, 0.6);
      });
    },
  },
};
