// Blackwater Docks' ambience loop (zm_blackwater): a foggy harbour at grey dawn. Layers, all
// periodic in the loop or placed well inside it so it repeats without a seam:
//   - the water: a low swell lapping at the quay and the piles, a soft slap at each wave
//   - a raw breath of wind off the water
//   - gulls far off, a couple of calls each side
//   - mooring ropes creaking as the freighter shifts against her fenders
//   - a buoy bell out in the fog, struck twice by the swell
//   - a foghorn far down the coast: one low, soft blast
// Kept low and sparse (rms 0.06): it plays for twenty minutes under the fight.
import { stereoBed, swell, windLayer, addTone, addBurst, brown, pink, biquad, normalize, mixInto, shape } from './ambkit.js';

/** A gull's call: a few falling "kee-ow" cries with a nasal overtone. */
function gull(out, sr, rng, t, amp, n) {
  for (let k = 0; k < n; k++) {
    const t0 = t + k * (0.26 + rng() * 0.06), f = 1500 + rng() * 260;
    addTone(out, sr, t0, { f, f1: f * 0.62, glide: 0.08, amp, tau: 0.09, a: 0.02, len: 0.22, vib: 0.02, vibF: 28 });
    addTone(out, sr, t0, { f: f * 2.01, f1: f * 1.25, glide: 0.08, amp: amp * 0.35, tau: 0.07, a: 0.02, len: 0.18 });
  }
}

/** A rope creak: a rough, rising groan (a buzzy tone ground by noise). */
function creak(out, sr, rng, t, amp) {
  const f = 150 + rng() * 60, len = 0.5 + rng() * 0.3;
  for (let k = 0; k < 5; k++) addTone(out, sr, t, { f: f * (k + 1), f1: f * (k + 1) * 1.18, glide: len * 0.6, amp: amp / (k + 1.2), tau: len * 0.5, a: 0.06, len, vib: 0.05, vibF: 17 + k * 3 });
  addBurst(out, sr, rng, t + 0.05, amp * 0.4, { a: 0.05, tau: len * 0.4, color: 'pink', filters: [['bandpass', f * 3, 2.5]] });
}

/** The buoy bell: inharmonic partials, a long ring. */
function bell(out, sr, t, amp) {
  for (const [r, a, tau] of [[1, 1, 1.4], [2.76, 0.55, 0.8], [5.4, 0.3, 0.45], [8.93, 0.16, 0.25]]) addTone(out, sr, t, { f: 680 * r, amp: amp * a, tau, a: 0.002, len: tau * 4 });
}

export const AMB = {
  amb_blackwater: {
    dur: 15, loop: 1.0, stereo: true, rms: 0.06, rate: 16000,
    fn: (P) => {
      const L = P.loopLen, sr = P.sr, rng = P.rng, n = P.len;
      const gust = swell(rng, L);
      const tide = swell(rng, L, [[1, 0.5], [3, 0.35], [4, 0.25]]);
      // the events, rendered once per side (each channel hears its own side louder)
      const side = [new Float32Array(n), new Float32Array(n)];
      for (const [t, s, k] of [[1.6 + rng(), 0, 3], [6.2 + rng(), 1, 2], [10.4 + rng() * 1.5, rng() < 0.5 ? 0 : 1, 4]]) gull(side[s], sr, rng, t, 0.5 * 0.16, k);
      for (const s of side) biquad(s, sr, 'lowpass', 2600, 0.7); // (gulls far off: low-passed by distance)
      for (const [t, s] of [[3.1 + rng(), 0], [8.4 + rng(), 1], [12.2 + rng() * 0.8, 0]]) creak(side[s], sr, rng, t, 0.07);
      const far = new Float32Array(n);
      for (const t of [4.6 + rng() * 0.6, 11.3 + rng() * 0.8]) bell(far, sr, t, 0.05);
      const hornT = 7.2 + rng();
      for (const [k, a] of [[1, 1], [2, 0.6], [3, 0.35], [4, 0.2], [5, 0.12]]) addTone(far, sr, hornT, { f: 98 * k, amp: a * 0.05, tau: 9, a: 0.35, len: 2.6, rel: 0.6, vib: 0.004, vibF: 4.5 });
      biquad(far, sr, 'lowpass', 1800, 0.7);
      stereoBed(P, (ch, out) => {
        // the water: a dark swell, eight laps a loop (offset per side), each with a slap
        const w = brown(n, rng);
        biquad(w, sr, 'lowpass', 420, 0.7);
        const lap = (t) => { const u = ((t / L) * 8 + ch * 0.37) % 1; return 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * u), 4) * (0.6 + 0.4 * tide(t)); };
        mixInto(out, shape(normalize(w, 1), sr, lap), 0, 0.55);
        const slap = pink(n, rng);
        biquad(slap, sr, 'bandpass', 460, 1.4);
        const sl = (t) => { const u = ((t / L) * 8 + ch * 0.37 + 0.42) % 1; return Math.pow(Math.max(0, 1 - Math.abs(u - 0.5) * 7), 2); };
        mixInto(out, shape(normalize(slap, 1), sr, sl), 0, 0.22);
        // wind off the water
        windLayer(out, P, (t) => 0.2 + 0.5 * gust(t - ch * 0.5), 0.3);
        // gulls and ropes (this side loud, the other side soft), the bell and the horn out in the fog
        mixInto(out, side[ch], 0, 1);
        mixInto(out, side[1 - ch], 0, 0.45);
        mixInto(out, far, ch ? 12 : 0, 0.8);
      });
    },
  },
};
