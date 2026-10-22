// Outdoor impulse response: a few early reflections from nearby objects,
// distinct slapback echoes off terrain and treelines, and a diffuse, lumpy
// ("rolling") tail whose high frequencies die faster than the lows.
import { Rng, burst, hp1, lp1, mixAt, mixNorm, normalize, samples, scale, smoothRandom, svf, white } from '../dsp.js';

export function outdoorIR(sr, seed = 7, length = 2.6, rt60 = 2.4) {
  const rng = new Rng(seed);
  const n = samples(sr, length);
  const channels = [];
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(n);
    const tail = white(n, rng.seed());
    const roll = smoothRandom(n, Math.round(length * 3), rng);
    const fine = smoothRandom(n, Math.round(length * 14), rng);
    const pre = samples(sr, 0.012);
    const build = samples(sr, 0.07);
    const decay = Math.exp(-6.91 / (rt60 * sr));
    let e = 1;
    for (let i = 0; i < n; i++) {
      if (i < pre) {
        tail[i] = 0;
        continue;
      }
      const b = Math.min(1, (i - pre) / build);
      const m = Math.max(0.1, 0.7 + 0.35 * roll[i] + 0.2 * fine[i]);
      tail[i] *= b * b * e * m;
      e *= decay;
    }
    svf(tail, 'lp', (t) => 500 + 5500 * Math.exp(-t / 0.4), 0.6, sr);
    hp1(tail, 70, sr);
    normalize(tail, 1);
    mixAt(x, tail, 0, 0.35, sr);
    // Early reflections off nearby objects: short, already a little dull.
    for (let k = 0; k < 8; k++) {
      const blip = burst(sr, rng.seed(), 0.0002, 0.0015, 0.008);
      lp1(lp1(blip, rng.range(2500, 6000), sr), 6000, sr);
      mixNorm(x, blip, rng.range(0.012, 0.09), rng.range(0.15, 0.4) * (rng.chance(0.5) ? 1 : -1), sr);
    }
    const slaps = [
      [rng.range(0.14, 0.2), 0.6, 3000],
      [rng.range(0.32, 0.45), 0.35, 2000],
      [rng.range(0.6, 0.85), 0.2, 1300],
    ];
    for (const [t, a, lp] of slaps) {
      const blip = burst(sr, rng.seed(), 0.0005, 0.012, 0.06);
      lp1(lp1(blip, lp, sr), lp, sr);
      mixNorm(x, blip, t + (c ? rng.range(0.005, 0.02) : 0), a, sr);
    }
    let energy = 0;
    for (let i = 0; i < n; i++) energy += x[i] * x[i];
    scale(x, 1 / Math.sqrt(energy));
    const fade = samples(sr, 0.2);
    for (let i = 0; i < fade; i++) x[n - fade + i] *= 1 - i / fade;
    channels.push(x);
  }
  return channels;
}
