// Radio sounds at 16 kHz: squelch open/close, band-limited static and an
// unintelligible formant-synthesised voice used when speech synthesis is off.
import {
  TAU,
  biquad,
  blepSaw,
  burst,
  circular,
  finish,
  hp1,
  lp1,
  mixAt,
  mixNorm,
  mixWrap,
  normalize,
  samples,
  softClip,
  svf,
  white,
} from '../dsp.js';

function radioBand(x, sr) {
  biquad(x, 'hp', 330, 0.7, sr);
  biquad(x, 'hp', 330, 0.7, sr);
  biquad(x, 'lp', 3000, 0.7, sr);
  biquad(x, 'lp', 3000, 0.7, sr);
  return x;
}

export function squelchOpen(rng, sr) {
  const out = new Float32Array(samples(sr, 0.16));
  for (let i = samples(sr, 0.002); i < out.length; i++) out[i] = 0.8;
  hp1(out, 120, sr);
  const nb = burst(sr, rng.seed(), 0.001, 0.02, 0.08);
  biquad(nb, 'bp', rng.range(1500, 2200), 0.7, sr);
  mixNorm(out, nb, 0.003, 0.6, sr);
  if (rng.chance(0.6)) {
    const n = samples(sr, 0.06);
    const fsk = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const f = ((i / samples(sr, 0.008)) | 0) % 2 ? 2400 : 1600;
      ph += (TAU * f) / sr;
      fsk[i] = Math.sin(ph) * Math.sin((Math.PI * i) / n);
    }
    mixAt(out, fsk, 0.05, 0.25, sr);
  }
  radioBand(out, sr);
  return finish(out, sr, { drive: 1.5, fade: 0.01, dc: 0, target: 0.8 });
}

export function squelchClose(rng, sr) {
  const out = new Float32Array(samples(sr, 0.26));
  const n = samples(sr, 0.24);
  const x = white(n, rng.seed());
  const hold = samples(sr, 0.03);
  const d = Math.exp(-1 / (rng.range(0.035, 0.055) * sr));
  let e = 1;
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, i / samples(sr, 0.002));
    x[i] *= a * e;
    if (i > hold) e *= d;
  }
  mixAt(out, x, 0.004, 0.9, sr);
  const click = samples(sr, 0.004);
  out[click] += 0.6;
  radioBand(out, sr);
  return finish(out, sr, { drive: 1.6, fade: 0.01, dc: 0, target: 0.8 });
}

// Two-second seamless loop of receiver hiss, crackle and a little hum.
export function radioStatic(rng, sr) {
  const n = samples(sr, 2);
  const x = white(n, rng.seed());
  circular(x, samples(sr, 0.1), (b) => radioBand(b, sr));
  normalize(x, 1);
  const crack = new Float32Array(n);
  for (let k = 0; k < 50; k++) {
    const len = samples(sr, rng.range(0.0005, 0.003));
    const p = white(len, rng.seed());
    const a = 0.2 + 0.8 * rng.pow(2);
    for (let i = 0; i < len; i++) p[i] *= a * (1 - i / len);
    mixWrap(crack, p, rng.int(n), 1);
  }
  circular(crack, samples(sr, 0.05), (b) => hp1(b, 800, sr));
  normalize(crack, 1);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    x[i] += 0.5 * crack[i] + 0.05 * Math.sin(TAU * 100 * t) + 0.03 * Math.sin(TAU * 150 * t);
  }
  return normalize(x, 0.9);
}

// Formants (F1, F2, F3) of a handful of vowels.
const VOWELS = [
  [730, 1090, 2440], [270, 2290, 3010], [300, 870, 2240], [530, 1840, 2480],
  [570, 840, 2410], [440, 1020, 2240], [660, 1720, 2410], [490, 1350, 1690],
];

function planSyllables(rng, len) {
  const syl = [];
  let t = 0.05;
  while (t < len - 0.15) {
    const dur = rng.range(0.09, 0.22);
    syl.push({ t, dur, v: rng.pick(VOWELS), cons: rng.chance(0.65) ? rng.pick(['f', 's', 'p', 'p']) : null, accent: rng.bi() });
    t += dur + (rng.chance(0.18) ? rng.range(0.06, 0.14) : rng.range(0, 0.03));
  }
  return syl;
}

// Unintelligible radio voice: glottal buzz through moving vowel formants with
// syllable-rate amplitude and intonation, consonant noise, radio band and clipping.
export function babble(rng, sr, faction) {
  const len = rng.range(1.2, 1.9);
  const n = samples(sr, len);
  const B = 16;
  const nb = Math.ceil(n / B) + 1;
  const F = [new Float32Array(nb), new Float32Array(nb), new Float32Array(nb)];
  const amp = new Float32Array(nb);
  const pitch = new Float32Array(nb);
  const f0 = faction === 0 ? rng.range(98, 112) : rng.range(118, 132);
  const fscale = faction === 0 ? 1 : 1.07;
  const syl = planSyllables(rng, len);
  let prev = syl[0].v;
  for (let b = 0; b < nb; b++) {
    for (let k = 0; k < 3; k++) F[k][b] = prev[k] * fscale;
    pitch[b] = f0;
  }
  for (const s of syl) {
    const b0 = Math.floor((s.t * sr) / B);
    const b1 = Math.min(nb, Math.floor(((s.t + s.dur) * sr) / B));
    for (let b = b0; b < b1; b++) {
      const u = (b - b0) / Math.max(1, b1 - b0);
      const glide = Math.min(1, u / 0.25);
      for (let k = 0; k < 3; k++) F[k][b] = (prev[k] + (s.v[k] - prev[k]) * glide) * fscale;
      amp[b] = Math.pow(Math.sin(Math.PI * u), 0.6) * (0.75 + 0.25 * s.accent);
      pitch[b] = f0 * (1 + 0.12 * s.accent * Math.sin(Math.PI * u)) * (1 - (0.15 * s.t) / len);
    }
    for (let b = b1; b < nb; b++) for (let k = 0; k < 3; k++) F[k][b] = s.v[k] * fscale;
    prev = s.v;
  }
  const src = new Float32Array(n);
  const asp = white(n, rng.seed());
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const b = (i / B) | 0;
    const dt = (pitch[b] * (1 + 0.01 * Math.sin(i * 0.003))) / sr;
    ph += dt;
    if (ph >= 1) ph -= 1;
    src[i] = amp[b] * (blepSaw(ph, dt) + 0.15 * asp[i]);
  }
  lp1(src, 3500, sr);
  const out = new Float32Array(n);
  const gains = [1, 0.7, 0.35];
  const qs = [7, 10, 12];
  for (let k = 0; k < 3; k++) {
    const f = F[k];
    const band = svf(src.slice(), 'bp', (t) => f[Math.min(nb - 1, ((t * sr) / B) | 0)], qs[k], sr);
    for (let i = 0; i < n; i++) out[i] += gains[k] * band[i];
  }
  normalize(out, 1);
  for (const s of syl) {
    if (!s.cons) continue;
    const at = Math.max(0, s.t - 0.02);
    if (s.cons === 'p') {
      const p = burst(sr, rng.seed(), 0.0005, 0.004, 0.03);
      mixNorm(out, p, at, 0.5, sr);
    } else {
      const fr = burst(sr, rng.seed(), 0.01, 0.02, 0.06);
      hp1(hp1(fr, s.cons === 's' ? 4000 : 2500, sr), 2500, sr);
      mixNorm(out, fr, at, 0.25, sr);
    }
  }
  radioBand(out, sr);
  normalize(out, 1);
  softClip(out, 3);
  const hiss = white(n, rng.seed());
  radioBand(hiss, sr);
  mixNorm(out, hiss, 0, 0.06, sr);
  return finish(out, sr, { drive: 0, fade: 0.04, dc: 0, target: 0.85 });
}
