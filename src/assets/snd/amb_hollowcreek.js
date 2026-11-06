// Hollow Creek's ambience loop (zm_hollow_creek): a mountain town at night. Layers, all periodic
// in the loop or placed well inside it so it repeats without a seam:
//   - wind in the pines: a low body that gusts, and a needle hiss that follows the gusts
//   - crickets: a near voice each side and a fainter chorus, swelling and easing off
//   - a dog far off down the valley (two short bouts of barking, low-passed by distance)
//   - an owl once, on the other side
//   - the neon sign's electrical buzz: very faint mains hum with the odd flickering crackle
// Kept quiet and sparse (rms 0.06): it plays for twenty minutes under the fight.
import { stereoBed, swell, windLayer, addTone, addBurst, pink, biquad, normalize, mixInto, shape, svf, TAU } from './ambkit.js';

/** One cricket chirp: `pulses` short tone bursts at f, 34 ms apart. */
function chirp(out, sr, t, f, amp, pulses = 3) {
  for (let k = 0; k < pulses; k++) addTone(out, sr, t + k * 0.034, { f, amp, tau: 0.008, a: 0.002, len: 0.022 });
}

/** One bark: a falling voiced tone with two harmonics and a breathy burst (lowpassed later). */
function bark(out, sr, rng, t, amp) {
  const f = 480 + rng() * 80;
  addTone(out, sr, t, { f, f1: f * 0.62, glide: 0.05, amp, tau: 0.05, a: 0.006, len: 0.16 });
  addTone(out, sr, t, { f: f * 2, f1: f * 1.24, glide: 0.05, amp: amp * 0.45, tau: 0.04, a: 0.006, len: 0.14 });
  addTone(out, sr, t, { f: f * 3, f1: f * 1.86, glide: 0.05, amp: amp * 0.2, tau: 0.03, a: 0.006, len: 0.1 });
  addBurst(out, sr, rng, t, amp * 0.35, { a: 0.004, tau: 0.04, color: 'pink', filters: [['bandpass', 900, 1.2]] });
}

export const AMB = {
  amb_hollow_creek: {
    dur: 14, loop: 1.0, stereo: true, rms: 0.06, rate: 22050,
    fn: (P) => {
      const L = P.loopLen, sr = P.sr, rng = P.rng;
      const gust = swell(rng, L);
      const leaf = swell(rng, L, [[2, 0.5], [3, 0.4], [5, 0.3], [8, 0.2]]);
      const chorus = swell(rng, L, [[1, 0.6], [2, 0.3], [3, 0.2]]);
      // events, shared so the two channels agree on them (panned by level)
      const dogSide = rng() < 0.5 ? 0 : 1;
      const bouts = [[2.2 + rng() * 0.8, 2], [8.6 + rng() * 1.2, 3]];
      const owlT = 5.4 + rng() * 1.2;
      const crackles = [1.3 + rng() * 2, 6.8 + rng() * 2, 11.2 + rng() * 1.2];
      // the near crickets' timing (each side its own rhythm)
      const rhythm = [0.52 + rng() * 0.06, 0.61 + rng() * 0.06];
      stereoBed(P, (ch, out) => {
        // wind in the pines
        windLayer(out, P, (t) => 0.25 + 0.6 * gust(t - ch * 0.35), 0.42);
        const hiss = svf(pink(P.len, rng), sr, 'bp', (t) => 2400 + 1400 * leaf(t - ch * 0.2), 0.8);
        mixInto(out, shape(normalize(hiss, 1), sr, (t) => 0.04 + 0.3 * Math.pow(gust(t - ch * 0.35), 2)), 0, 0.08);
        // crickets: the near one on this side, then a faint chorus further off
        const per = rhythm[ch], f = ch ? 4520 : 4180;
        for (let t = 0.05 + ch * 0.21; t < P.len / sr - 0.1; t += per + rng() * 0.05) chirp(out, sr, t, f, 0.16 * (0.55 + 0.45 * chorus(t)), 3);
        for (let t = 0.3 + rng() * 0.2; t < P.len / sr - 0.1; t += 0.37 + rng() * 0.25) chirp(out, sr, t, 3700 + rng() * 500, 0.045 * (0.4 + 0.6 * chorus(t + 3)), 2 + (rng() < 0.5 ? 1 : 0));
        // the dog, far down the valley
        const dog = new Float32Array(P.len);
        for (const [t0, n] of bouts) for (let k = 0; k < n; k++) bark(dog, sr, rng, t0 + k * (0.32 + rng() * 0.08), 0.5);
        biquad(dog, sr, 'lowpass', 1100, 0.7);
        mixInto(out, dog, 0, ch === dogSide ? 0.22 : 0.1);
        // the owl, on the other side: hoo ... hoo-hoo
        const owl = ch === dogSide ? 0.04 : 0.1;
        addTone(out, sr, owlT, { f: 392, f1: 372, glide: 0.2, amp: owl, tau: 0.16, a: 0.04, len: 0.36, rel: 0.08 });
        addTone(out, sr, owlT + 0.62, { f: 380, f1: 360, glide: 0.1, amp: owl * 0.8, tau: 0.08, a: 0.03, len: 0.16, rel: 0.05 });
        addTone(out, sr, owlT + 0.84, { f: 384, f1: 352, glide: 0.25, amp: owl, tau: 0.22, a: 0.04, len: 0.5, rel: 0.12 });
        // the neon: a faint mains buzz (periodic in the loop) with flickering crackles
        for (let i = 0; i < P.len; i++) {
          const t = i / sr, s = Math.sin(TAU * 120 * t);
          out[i] += 0.012 * (s + 0.5 * Math.sin(TAU * 240 * t + 0.7) + 0.3 * Math.sign(s) * 0.4) * (0.7 + 0.3 * Math.sin(TAU * 3 * t / L + ch));
        }
        for (const t of crackles) for (let k = 0; k < 4; k++) addBurst(out, sr, rng, t + k * (0.03 + rng() * 0.05), 0.05, { a: 0.0005, tau: 0.006, color: 'white', filters: [['highpass', 2500, 0.7]] });
      });
    },
  },
};
