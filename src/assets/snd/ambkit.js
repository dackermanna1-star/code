// Building blocks for map ambience loops (src/assets/snd/amb_*.js). A loop recipe renders
// dur + loop seconds; the bank crossfades the tail onto the start, so a bed whose
// modulations are periodic in P.loopLen (swell) loops without a seam.
import { TAU, biquad, normalize, mixInto, svf, pink, brown, white, addTone, addBurst } from './dsp.js';

export { TAU, biquad, normalize, mixInto, svf, pink, brown, white, addTone, addBurst };

/** A smooth 0..1 modulation, periodic in the loop length L (sum of its harmonics). */
export function swell(rng, L, harm = [[1, 0.55], [2, 0.4], [3, 0.3], [5, 0.2], [7, 0.12]]) {
  const h = harm.map(([k, a]) => [k, a, rng() * TAU]);
  const raw = (t) => { let s = 0; for (const [k, a, ph] of h) s += a * Math.sin((TAU * k * t) / L + ph); return s; };
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 1000; i++) { const v = raw((i / 1000) * L); if (v < mn) mn = v; if (v > mx) mx = v; }
  return (t) => Math.min(1, Math.max(0, (raw(t) - mn) / (mx - mn)));
}

/** Multiply x by fn(t) (evaluated every 32 samples, interpolated). */
export function shape(x, sr, fn) {
  let g0 = fn(0);
  for (let b = 0; b < x.length; b += 32) {
    const g1 = fn((b + 32) / sr);
    const m = Math.min(32, x.length - b);
    for (let i = 0; i < m; i++) x[b + i] *= g0 + ((g1 - g0) * i) / 32;
    g0 = g1;
  }
  return x;
}

/** A stereo bed: layer(ch, out) draws each channel (its own noise: a wide image). */
export function stereoBed(P, layer) {
  const chans = [];
  for (let ch = 0; ch < 2; ch++) { const out = new Float32Array(P.len); layer(ch, out); chans.push(out); }
  P.play(chans, P.out);
}

/** count events at random times over the loop: fn(t) for each. */
export function scatter(rng, L, count, fn) {
  for (let k = 0; k < count; k++) fn(rng() * L);
}

/** A soft wind layer into out (amp): low body plus a gusting band. */
export function windLayer(out, P, g, amp = 1) {
  const { rng, sr, len: n } = P;
  const a = brown(n, rng);
  biquad(a, sr, 'lowpass', 340, 0.7);
  mixInto(out, shape(normalize(a, 1), sr, (t) => 0.35 + 0.65 * g(t)), 0, 0.5 * amp);
  const b = svf(pink(n, rng), sr, 'bp', (t) => 240 + 600 * g(t), 0.9);
  mixInto(out, shape(normalize(b, 1), sr, (t) => 0.1 + Math.pow(g(t), 1.6)), 0, 0.7 * amp);
}
