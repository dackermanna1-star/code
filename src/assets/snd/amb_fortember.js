// Fort Ember's ambience loop (zm_fort_ember). Owned by the map's builder.
// FRAMEWORK PLACEHOLDER: an evening wind over the palisade and a fire crackling nearby.
import { stereoBed, swell, windLayer, scatter, addBurst, pink, biquad, normalize, mixInto, shape } from './ambkit.js';

export const AMB = {
  amb_fort_ember: {
    dur: 10, loop: 1.0, stereo: true, rms: 0.07, rate: 22050,
    fn: (P) => {
      const g = swell(P.rng, P.loopLen);
      stereoBed(P, (ch, out) => {
        windLayer(out, P, (t) => g(t - ch * 0.4), 0.8);
        // the fire: a low roar that flickers, and sparse crackles
        const f = pink(P.len, P.rng);
        biquad(f, P.sr, 'lowpass', 420, 0.7);
        const fl = swell(P.rng, P.loopLen, [[3, 0.5], [7, 0.4], [13, 0.3], [29, 0.2]]);
        mixInto(out, shape(normalize(f, 1), P.sr, (t) => 0.4 + 0.6 * fl(t)), 0, 0.35);
        scatter(P.rng, P.loopLen, 70, (t) => addBurst(out, P.sr, P.rng, t, 0.25 + P.rng() * 0.5, { a: 0.0003, tau: 0.004 + P.rng() * 0.006, color: 'white', filters: [['highpass', 1800, 0.7]] }));
      });
    },
  },
};
