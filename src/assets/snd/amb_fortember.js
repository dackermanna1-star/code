// Fort Ember's ambience loop (zm_fort_ember): a hot evening wind over the mesa, whistling
// through the crenels in the gusts; a loose awning flapping somewhere; a crow or two far off;
// a long howl out in the wadi. Quiet and sparse: it plays under everything for a whole game.
import { stereoBed, swell, windLayer, scatter, pink, white, biquad, svf, normalize, mixInto, shape, TAU } from './ambkit.js';
import { addTail } from './dsp.js';

/** A distant crow: a harsh falling "caw" (harmonics + rasp), band-limited. */
function caw(sr, rng, f0) {
  const len = Math.ceil(0.32 * sr), x = new Float32Array(len);
  const rasp = white(len, rng);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr, u = t / 0.3;
    const f = f0 * (1.08 - 0.22 * u) * (1 + 0.012 * Math.sin(TAU * 31 * t));
    ph += TAU * f / sr;
    const env = Math.min(1, t / 0.02) * Math.max(0, 1 - u) ** 1.5;
    let s = 0;
    for (let k = 1; k <= 6; k++) s += Math.sin(ph * k) / (k * 0.8 + 0.2);
    x[i] = env * (0.6 * s + 0.9 * rasp[i] * (0.5 + 0.5 * Math.sin(ph)));
  }
  biquad(x, sr, 'bandpass', 1300, 0.8);
  biquad(x, sr, 'lowpass', 2600, 0.7);
  return normalize(x, 1);
}

/** A far-off howl: a slow rise and fall with vibrato, dulled by distance. */
function howl(sr, rng, dur, f0) {
  const len = Math.ceil(dur * sr), x = new Float32Array(len);
  const breath = pink(len, rng);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr, u = t / dur;
    const f = f0 * (1 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.3))) * (1 + 0.02 * Math.sin(TAU * 5.5 * t));
    ph += TAU * f / sr;
    const env = Math.sin(Math.PI * u) ** 1.6;
    x[i] = env * (Math.sin(ph) + 0.35 * Math.sin(2 * ph + 0.3) + 0.12 * Math.sin(3 * ph) + 0.15 * breath[i]);
  }
  biquad(x, sr, 'lowpass', 1100, 0.7);
  return normalize(x, 1);
}

export const AMB = {
  amb_fort_ember: {
    dur: 15, loop: 1.5, stereo: true, rms: 0.065, rate: 22050,
    fn: (P) => {
      const { sr, rng, loopLen: L } = P;
      const g = swell(rng, L, [[1, 0.5], [2, 0.45], [3, 0.3], [5, 0.2], [8, 0.1]]);
      // the events, shared by both channels (each panned): crows, the howl, the flapping awning
      const crows = [];
      scatter(rng, L, 2, (t) => crows.push({ t, f: 480 + rng() * 120, n: 2 + Math.floor(rng() * 2), pan: rng() * 2 - 1 }));
      const howlAt = { t: rng() * (L - 4), f: 330 + rng() * 60, dur: 2.2 + rng() * 0.6, pan: rng() * 2 - 1 };
      const flaps = [];
      scatter(rng, L, 3, (t) => flaps.push({ t, dur: 0.9 + rng() * 1.1, rate: 7 + rng() * 5, pan: rng() * 1.6 - 0.8 }));
      const crowBuf = crows.map((c) => Array.from({ length: c.n }, () => caw(sr, rng, c.f * (0.95 + rng() * 0.1))));
      const howlBuf = howl(sr, rng, howlAt.dur, howlAt.f);
      const howlWet = new Float32Array(howlBuf.length + Math.ceil(1.6 * sr));
      addTail(howlWet, howlBuf, sr, rng, { tau: 0.6, wet: 0.5, lp: 1400, lpEnd: 500, len: howlWet.length / sr });
      mixInto(howlWet, howlBuf, 0, 0.6);
      stereoBed(P, (ch, out) => {
        const side = ch ? 1 : -1, gain = (pan) => 0.5 + 0.5 * side * pan;
        // hot wind: the body, and a thin whistle through the crenels when it gusts
        windLayer(out, P, (t) => 0.3 + 0.55 * g(t - ch * 0.35), 0.8);
        const w = svf(pink(P.len, rng), sr, 'bp', (t) => 900 + 700 * g(t), 6);
        mixInto(out, shape(normalize(w, 1), sr, (t) => Math.pow(Math.max(0, g(t) - 0.45) / 0.55, 2)), 0, 0.12);
        // a loose awning flapping in the gusts
        for (const f of flaps) {
          const n = Math.ceil(f.dur * sr), x = pink(n, rng);
          biquad(x, sr, 'bandpass', 520, 1.1);
          for (let i = 0; i < n; i++) {
            const t = i / sr, u = t / f.dur;
            x[i] *= Math.pow(Math.abs(Math.sin(Math.PI * f.rate * t)), 6) * Math.sin(Math.PI * u);
          }
          mixInto(out, normalize(x, 1), f.t * sr, 0.09 * gain(f.pan));
        }
        // crows, far off
        crows.forEach((c, k) => crowBuf[k].forEach((b, j) => mixInto(out, b, (c.t + j * (0.42 + 0.05 * j)) * sr, 0.05 * gain(c.pan))));
        // the howl, out in the wadi
        mixInto(out, howlWet, howlAt.t * sr, 0.05 * gain(howlAt.pan));
      });
    },
  },
};
