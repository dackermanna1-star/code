/**
 * Composite physical models shared by several recipe files: glass shatter, water splash,
 * slime squelch, crumbling debris, low booms and body impacts.
 */
import { addNoise, applyDecay, clamp, highpass, lowpass, sweep, mix, alloc } from '../dsp/core';
import { bubble, bubbles, burst, clicks, grains, randomModes, strike, thump, whoosh } from '../dsp/models';
import type { Rand } from '../dsp/rand';

/** Glass breaking: bright crack, spray of shards, then decaying tinkle of falling pieces. */
export function shatter(out: Float32Array, sr: number, r: Rand, t0: number, size = 1, amp = 1): void {
  burst(out, sr, r, t0, 0.03 * size, 0.9 * amp, 2200, 15000);
  burst(out, sr, r, t0, 0.012, 0.6 * amp, 400, 5000);
  strike(out, sr, t0, randomModes(r, 12, 2000 / Math.sqrt(size), 9500, 0.05, 0.35, { tilt: 0.15 }), 0.45 * amp);
  // crash body: dense bright noise decaying ~120 ms
  const n = Math.ceil(0.35 * size * sr);
  const crash = new Float32Array(n);
  addNoise(crash, r, 0, n, 1);
  highpass(crash, sr, 2800);
  lowpass(crash, sr, 13000);
  applyDecay(crash, sr, 0.16 * size, 0, 0.001);
  mix(out, crash, Math.round(t0 * sr), 0.5 * amp);
  clicks(out, sr, r, { t0, t1: t0 + 0.07, rate: 700, fLo: 2600, fHi: 12000, t60Lo: 0.02, t60Hi: 0.16, amp: 0.55 * amp, modes: 3, tail: 1.5 });
  clicks(out, sr, r, {
    t0: t0 + 0.04,
    t1: t0 + 0.85 * size,
    rate: (t) => 260 * Math.exp(-(t - t0) / (0.17 * size)),
    fLo: 2200,
    fHi: 10500,
    t60Lo: 0.03,
    t60Hi: 0.3,
    amp: 0.4 * amp,
    modes: 3,
    tail: 2,
  });
}

/** Water splash: impact slap, sploosh body, bubbles, droplets falling back, spray. */
export function splash(out: Float32Array, sr: number, r: Rand, t0: number, size = 1, amp = 1): void {
  const s = Math.sqrt(size);
  burst(out, sr, r, t0, 0.035 * s, 0.6 * amp, 120, 2600 / s);
  thump(out, sr, t0, 140 / s, 70 / s, 0.12 * s, 0.35 * amp);
  whoosh(out, sr, r, t0, 0.45 * s, { f: [0, 1600 / s, 0.25, 700 / s, 1, 320 / s], amp: [0, 0, 0.04, 1, 0.35, 0.5, 1, 0], q: 1.1, gain: 0.85 * amp });
  bubbles(out, sr, r, t0 + 0.01, t0 + 0.3 * s, 260 * size, 450 / s, 2800, 0.22 * amp, 0.12);
  bubbles(out, sr, r, t0 + 0.12 * s, t0 + 0.8 * s, (t) => 120 * size * Math.exp(-(t - t0) / (0.25 * s)), 700, 4200, 0.16 * amp, 0.2);
  grains(out, sr, r, { t0, t1: t0 + 0.5 * s, rate: (t) => 1500 * Math.exp(-(t - t0) / 0.12), fLo: 3000, fHi: 10000, q: 1, amp: 0.12 * amp });
}

/** Small water movement (swim stroke, wading, slosh). */
export function slosh(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, amp = 1): void {
  whoosh(out, sr, r, t0, dur, { f: [0, 500, 0.4, 900, 1, 400], amp: [0, 0, 0.3, 1, 1, 0], q: 1.3, gain: 0.7 * amp, pink: true });
  bubbles(out, sr, r, t0 + dur * 0.1, t0 + dur * 0.9, 90 / Math.max(0.2, dur), 400, 2200, 0.2 * amp, 0.15);
  grains(out, sr, r, { t0: t0 + dur * 0.2, t1: t0 + dur, rate: 600, fLo: 1500, fHi: 6000, q: 1.5, amp: 0.06 * amp });
}

/** Wet squelch (slime, magma cube, mud). */
export function squelch(out: Float32Array, sr: number, r: Rand, t0: number, size = 1, amp = 1): void {
  const s = Math.sqrt(size);
  const dur = 0.22 * s;
  // the wet body: a low "bloop" whose pitch rises then drops (cavity opening and closing)
  const n = Math.ceil(dur * sr);
  const b = new Float32Array(n);
  let ph = 0;
  const fA = r.range(110, 160) / s;
  const fB = fA * r.range(1.7, 2.4);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = u < 0.35 ? fA + (fB - fA) * (u / 0.35) : fB + (fA * 0.8 - fB) * ((u - 0.35) / 0.65);
    ph += (6.283185307 * f) / sr;
    const e = Math.min(1, i / (0.004 * sr)) * Math.exp(-u * 3.5);
    b[i] = Math.sin(ph + 0.6 * Math.sin(ph * 2)) * e;
  }
  mix(out, b, Math.round(t0 * sr), 0.7 * amp);
  // squishy filtered noise
  whoosh(out, sr, r, t0, dur * 1.1, { f: [0, 450 / s, 0.4, 1300 / s, 1, 500 / s], amp: [0, 0, 0.08, 1, 0.6, 0.4, 1, 0], q: 2.5, gain: 0.5 * amp });
  // wet clicks / popping bubbles
  bubbles(out, sr, r, t0 + 0.01, t0 + dur, 160, 500 / s, 2600 / s, 0.28 * amp, 0.35, 1.4);
  // suction release
  bubble(out, sr, t0 + dur * r.range(0.6, 0.9), r.range(300, 520) / s, 0.35 * amp, 0.5);
}

/** Debris: crumbling pieces falling and settling over `dur` (rocks, wood bits, dirt). */
export function debris(
  out: Float32Array,
  sr: number,
  r: Rand,
  t0: number,
  dur: number,
  o: { amp: number; fLo: number; fHi: number; hard?: number; t60?: number; density?: number },
): void {
  const d = o.density ?? 1;
  grains(out, sr, r, {
    t0,
    t1: t0 + dur,
    rate: (t) => 700 * d * Math.exp(-(t - t0) / (dur * 0.3)),
    fLo: o.fLo,
    fHi: o.fHi,
    q: 1.8,
    durLo: 0.002,
    durHi: 0.015,
    amp: o.amp,
    tail: 2.2,
  });
  if (o.hard) {
    clicks(out, sr, r, {
      t0: t0 + 0.02,
      t1: t0 + dur,
      rate: (t) => 90 * d * Math.exp(-(t - t0) / (dur * 0.35)),
      fLo: o.fLo * 1.3,
      fHi: o.fHi,
      t60Lo: (o.t60 ?? 0.02) * 0.4,
      t60Hi: o.t60 ?? 0.02,
      amp: o.amp * o.hard,
      modes: 2,
      tail: 1.7,
    });
  }
}

/** Big low boom with pitch drop (explosions, heavy landings, thunder). */
export function boom(out: Float32Array, sr: number, r: Rand, t0: number, f0: number, dur: number, amp: number): void {
  thump(out, sr, t0, f0 * 2.2, f0 * 0.6, dur, amp, 0.004);
  const n = Math.ceil(dur * sr);
  const b = alloc(sr, dur);
  addNoise(b, r, 0, n, 1, 'brown');
  lowpass(b, sr, f0 * 3);
  lowpass(b, sr, f0 * 3);
  applyDecay(b, sr, dur * 0.8, 0, 0.01);
  mix(out, b, Math.round(t0 * sr), amp * 1.2);
}

/** Body impact on the ground (falls, heavy steps): soft thud + cloth + material crunch. */
export function bodyThud(out: Float32Array, sr: number, r: Rand, t0: number, weight = 1, amp = 1): void {
  thump(out, sr, t0, 120 / Math.sqrt(weight), 55 / Math.sqrt(weight), 0.16 * Math.sqrt(weight), 0.6 * amp, 0.003);
  burst(out, sr, r, t0, 0.04 * weight, 0.5 * amp, 150, 2500);
  burst(out, sr, r, t0, 0.012, 0.3 * amp, 600, 5000);
  grains(out, sr, r, { t0, t1: t0 + 0.07, rate: 1100, fLo: 400, fHi: 3000, q: 1, amp: 0.4 * amp });
}

/** Air swish (sword swings, throws, wings). */
export function swish(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, fPeak: number, amp = 1, q = 1.6): void {
  whoosh(out, sr, r, t0, dur, {
    f: [0, fPeak * 0.35, 0.45, fPeak, 1, fPeak * 0.45],
    amp: [0, 0, 0.35, 1, 0.6, 0.55, 1, 0],
    q,
    gain: amp,
  });
}

/** Sizzle: steam / fizz hiss with micro-crackle. */
export function sizzle(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, amp = 1, bright = 1): void {
  const n = Math.ceil(dur * sr);
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 1);
  sweep(b, sr, 'bp', [0, 5200 * bright, dur, 3000 * bright], 0.9);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    b[i] *= clamp(u / 0.03, 0, 1) * Math.pow(1 - u, 1.6) * (0.75 + 0.25 * Math.sin(i * 0.0021 + Math.sin(i * 0.00037) * 4));
  }
  mix(out, b, Math.round(t0 * sr), 0.6 * amp);
  grains(out, sr, r, { t0, t1: t0 + dur * 0.8, rate: (t) => 900 * Math.max(0, 1 - (t - t0) / dur), fLo: 2500 * bright, fHi: 9000, q: 2, amp: 0.4 * amp, tail: 2.5 });
}
