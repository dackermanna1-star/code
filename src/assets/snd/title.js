// Title screen recipes: the main menu's theme (a dusk drone loop) and the stinger when a
// run starts.

import { TAU, addBurst, addTone, addMetal, biquad, pink, normalize, mixInto } from './dsp.js';
import { foley } from './weapons.js';

/**
 * Dark, slow and tense: a low drone and a detuned minor pad moving A minor -> F (8 s
 * each), a distant two-beat pulse once a second, a far-off metallic toll every 8 s and a
 * thin wind bed. Every part is periodic in the loop length, so the folded loop is seamless.
 */
function theme(P) {
  const { sr, rng } = P;
  const L = P.loopLen, n = P.len;
  // chord weight: 1 on A minor (0..8 s), 0 on F (8..16 s), with 2 s glides between
  const wA = (t) => Math.min(1, Math.max(0, 0.5 + 1.6 * Math.cos((TAU * t) / L)));
  const chordA = [110, 130.81, 164.81, 220];
  const chordF = [87.31, 110, 130.81, 174.61];
  const chans = [];
  for (let ch = 0; ch < 2; ch++) {
    const out = new Float32Array(n);
    const det = ch ? 1.0031 : 0.9972;
    // drone: root an octave below the chord, a few harmonics
    let pa = rng() * TAU, pf = rng() * TAU;
    // pad: three detuned partials per chord tone
    const ph = Array.from({ length: 24 }, () => rng() * TAU);
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = wA(t);
      pa += (TAU * 55 * det) / sr;
      pf += (TAU * 43.65 * det) / sr;
      const swell = 0.75 + 0.25 * Math.sin((TAU * 2 * t) / L + ch);
      let s = (w * (Math.sin(pa) + 0.45 * Math.sin(2 * pa) + 0.2 * Math.sin(3 * pa))
        + (1 - w) * (Math.sin(pf) + 0.45 * Math.sin(2 * pf) + 0.2 * Math.sin(3 * pf))) * 0.5 * swell;
      let pad = 0;
      for (let k = 0; k < 4; k++) {
        for (let d = 0; d < 3; d++) {
          const j = k * 6 + d * 2;
          const dt = 1 + (d - 1) * 0.004 * det;
          ph[j] += (TAU * chordA[k] * dt) / sr;
          ph[j + 1] += (TAU * chordF[k] * dt) / sr;
          pad += w * Math.sin(ph[j]) + (1 - w) * Math.sin(ph[j + 1]);
        }
      }
      // the pad breathes in and out over each chord
      const breathe = 0.5 + 0.5 * Math.sin((TAU * 4 * t) / L - 1.2 + ch * 0.4);
      s += pad * 0.05 * (0.35 + 0.65 * breathe);
      out[i] = s;
    }
    biquad(out, sr, 'lowpass', 900, 0.6);
    // pulse: a low double thump each second (lub-dub), quieter on the off beats
    const pulse = new Float32Array(n);
    for (let t0 = 0; t0 < n / sr; t0++) {
      const acc = (t0 & 1) ? 0.55 : 0.85;
      addTone(pulse, sr, t0, { f: 58, f1: 38, glide: 0.06, tau: 0.16, amp: acc, a: 0.008 });
      addTone(pulse, sr, t0 + 0.3, { f: 52, f1: 36, glide: 0.05, tau: 0.12, amp: acc * 0.6, a: 0.008 });
    }
    biquad(pulse, sr, 'lowpass', 160, 0.7);
    mixInto(out, pulse, 0, 0.55);
    // the toll: an inharmonic, far-away metal ring every 8 s (high on A minor, low on F)
    const toll = new Float32Array(n);
    for (let t0 = 0; t0 < n / sr; t0 += L / 2) {
      const f0 = (Math.round(t0 / (L / 2)) & 1) ? 174.6 : 220;
      for (const [r, a, tau] of [[1, 1, 3.2], [2.76, 0.5, 1.6], [5.4, 0.25, 0.8], [8.93, 0.12, 0.4]]) {
        addTone(toll, sr, t0 + 0.04 * ch, { f: f0 * r, tau, amp: a * 0.5, a: 0.004 });
      }
      addBurst(toll, sr, rng, t0, 0.2, { a: 0.001, tau: 0.05, color: 'pink', filters: [['bandpass', 900, 1.2]] });
    }
    biquad(toll, sr, 'lowpass', 2400, 0.7);
    mixInto(out, toll, 0, 0.16);
    // wind bed
    const wind = pink(n, rng);
    biquad(wind, sr, 'bandpass', 420, 0.8);
    normalize(wind, 1);
    for (let i = 0; i < n; i++) wind[i] *= 0.5 + 0.5 * Math.sin((TAU * 3 * i) / sr / L + ch * 2);
    mixInto(out, wind, 0, 0.09);
    chans.push(out);
  }
  P.play(chans, P.out);
}

export const TITLE_FX = {
  title_theme: { dur: 16, loop: 1.5, stereo: true, rms: 0.075, rate: 22050, lofi: 7000, fn: (P) => theme(P) },
  // the run begins: a deep hit with a metal clang and a falling rumble
  title_start: { dur: 2.6, peak: 0.6, rate: 22050, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 72, f1: 30, glide: 0.5, tau: 0.9, amp: 1, a: 0.004 });
    addBurst(x, sr, r, 0, 0.8, { a: 0.0008, tau: 0.25, color: 'brown', filters: [['lowpass', 500, 0.7]] });
    addMetal(x, sr, r, 0.005, { f: 330, amp: 0.45, tau: 0.9, body: 0.5, bodyF: 140 });
    addBurst(x, sr, r, 0, 0.35, { a: 0.0005, tau: 0.02, filters: [['bandpass', 2400, 1]] });
  }, 0.5, { tau: 0.9, lp: 2500, lpEnd: 300, slaps: [[0.2, 0.5], [0.45, 0.3], [0.8, 0.18]], wet: 0.5, slapWin: 0.5 }) },
};
