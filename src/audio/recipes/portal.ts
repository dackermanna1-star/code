/**
 * Portal device sounds: the gun's two shots (blue a little brighter than orange), the portal
 * opening "vwoom", the soft airy pass-through, the fizzle on surfaces that won't take a portal,
 * the collapse when a portal is replaced, and the portal's ambient hum loop.
 */
import { addNoise, alloc, highpass, lowpass, mix, peakEq, smoothRandom, softClip, sweep, TAU } from '../dsp/core';
import { burst, ping, scatter, thump, whoosh } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { sizzle } from './kit';
import type { LoopSpec, SoundSpec } from './types';

/** Sine chirp with an exponential glide f0→f1 and an exponential decay. */
function chirp(out: Float32Array, sr: number, t0: number, dur: number, f0: number, f1: number, amp: number, harm = 0): void {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  if (n <= 0 || s0 < 0) return;
  const k = Math.exp(-6.9 / n);
  const na = Math.max(1, Math.round(0.002 * sr));
  let e = amp, ph = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 * Math.pow(f1 / f0, i / n);
    ph += (TAU * f) / sr;
    const a = i < na ? (amp * i) / na : e;
    if (i >= na) e *= k;
    out[s0 + i] += a * (Math.sin(ph) + harm * Math.sin(ph * 2.01) + harm * 0.5 * Math.sin(ph * 3.02));
  }
}

/** FM "shimmer": a carrier wobbled by a fast modulator, swelling in and out. */
function shimmer(out: Float32Array, sr: number, t0: number, dur: number, fc: number, fm: number, index: number, amp: number, rise = 0.1): void {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  if (n <= 0 || s0 < 0) return;
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const a = Math.min(1, u / rise) * Math.pow(1 - u, 1.6);
    pm += (TAU * fm) / sr;
    pc += (TAU * fc * (1 + 0.05 * u)) / sr;
    out[s0 + i] += amp * a * Math.sin(pc + index * Math.sin(pm));
  }
}

function gunShot(sr: number, r: Rand, orange: boolean): Float32Array {
  const out = alloc(sr, 0.75);
  const k = orange ? 0.82 : 1;
  // the "pew": a bright zap sweeping down, with a ghost octave
  chirp(out, sr, 0, 0.22, 2300 * k * r.range(0.96, 1.04), 380 * k, 0.5, 0.25);
  chirp(out, sr, 0.004, 0.32, 1150 * k, 170 * k, 0.32, 0.1);
  // electric crack + air
  burst(out, sr, r, 0, 0.05, 0.6, 1800, 12000);
  whoosh(out, sr, r, 0, 0.45, { f: [0, 5200 * k, 0.3, 2200 * k, 1, 800], amp: [0, 0.9, 0.08, 1, 1, 0], q: 3, gain: 0.5 });
  // body
  thump(out, sr, 0, 150 * k, 55, 0.18, 0.55);
  shimmer(out, sr, 0.01, 0.6, 660 * k, 97, 2.4, 0.12, 0.05);
  softClip(out, 1.3);
  return out;
}

function portalOpen(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 1.4);
  // swirling vortex: band-passed noise rising, then settling
  whoosh(out, sr, r, 0, 1.2, { f: [0, 250, 0.18, 1900, 0.5, 900, 1, 300], amp: [0, 0, 0.08, 1, 0.4, 0.6, 1, 0], q: [0, 4, 0.5, 2, 1, 6], gain: 0.9, pink: true });
  // the "vwoom": a low sine glide up
  chirp(out, sr, 0, 0.9, 48, 110, 0.75, 0.3);
  thump(out, sr, 0.03, 90, 45, 0.5, 0.5);
  // energy shimmer and sparkles
  shimmer(out, sr, 0.02, 1.1, 1320, 211, 3.2, 0.09, 0.15);
  scatter(r, 0.02, 0.7, 26, (t) => ping(out, sr, t, r.log(2400, 7600), r.range(0.05, 0.16), r.range(0.02, 0.06)));
  sizzle(out, sr, r, 0, 0.35, 0.18, 1.2);
  lowpass(out, sr, 9000);
  return out;
}

function portalEnter(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.9);
  // the soft, airy "whumf" of passing through
  whoosh(out, sr, r, 0, 0.75, { f: [0, 300, 0.35, 1400, 1, 260], amp: [0, 0, 0.3, 1, 1, 0], q: 1.6, gain: 0.85, pink: true });
  chirp(out, sr, 0.05, 0.6, 70, 140, 0.45, 0.2);
  shimmer(out, sr, 0.1, 0.7, 880, 133, 1.6, 0.05, 0.3);
  lowpass(out, sr, 6000);
  return out;
}

function fizzle(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.9);
  sizzle(out, sr, r, 0, 0.55, 0.7, 1.4);
  chirp(out, sr, 0, 0.35, 900 * r.range(0.95, 1.05), 160, 0.28, 0.4);
  scatter(r, 0, 0.45, 60, (t) => burst(out, sr, r, t, 0.006, r.range(0.05, 0.25), 1500, 9000));
  burst(out, sr, r, 0, 0.03, 0.5, 900, 7000);
  highpass(out, sr, 160);
  return out;
}

function portalClose(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 1.0);
  whoosh(out, sr, r, 0, 0.6, { f: [0, 2400, 1, 200], amp: [0, 1, 0.6, 0.6, 1, 0], q: 3, gain: 0.7, pink: true });
  chirp(out, sr, 0, 0.5, 520, 60, 0.4, 0.3);
  sizzle(out, sr, r, 0.05, 0.4, 0.35, 1);
  thump(out, sr, 0.42, 120, 40, 0.3, 0.45);
  return out;
}

/** Portal hum: a low drone with a slow beat, breathing air and a faint high whine. */
function portalHum(sr: number, r: Rand, len: number): Float32Array {
  const out = alloc(sr, len);
  const n = out.length;
  const am = smoothRandom(r, sr, n, 1.3);
  let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
  // integer cycles per loop so the drone itself is seamless before the crossfade
  const f1 = Math.round(62 * len) / len, f2 = Math.round(62.7 * len) / len, f3 = Math.round(124.5 * len) / len, f4 = Math.round(1870 * len) / len;
  for (let i = 0; i < n; i++) {
    p1 += (TAU * f1) / sr; p2 += (TAU * f2) / sr; p3 += (TAU * f3) / sr; p4 += (TAU * f4) / sr;
    const a = 0.8 + 0.2 * am[i];
    out[i] += a * (0.5 * Math.sin(p1) + 0.42 * Math.sin(p2) + 0.22 * Math.sin(p3)) + 0.012 * Math.sin(p4 + 0.6 * Math.sin(p1 * 0.5));
  }
  const air = new Float32Array(n);
  addNoise(air, r, 0, n, 1, 'pink');
  sweep(air, sr, 'bp', 700, 1.2);
  const am2 = smoothRandom(r, sr, n, 0.9);
  for (let i = 0; i < n; i++) air[i] *= 0.12 * (0.6 + 0.4 * am2[i]);
  mix(out, air, 0, 1);
  peakEq(out, sr, 62, 2, 3);
  return out;
}

export function portalSounds(): Record<string, SoundSpec> {
  return {
    'portal.gun.blue': { cat: 'players', n: 3, level: 0.75, pv: 0.04, send: 0.6, gen: (sr, r) => gunShot(sr, r, false) },
    'portal.gun.orange': { cat: 'players', n: 3, level: 0.75, pv: 0.04, send: 0.6, gen: (sr, r) => gunShot(sr, r, true) },
    'portal.open': { cat: 'blocks', n: 3, level: 0.85, pv: 0.05, gen: (sr, r) => portalOpen(sr, r) },
    'portal.enter': { cat: 'players', n: 3, level: 0.55, pv: 0.06, send: 0.3, gen: (sr, r) => portalEnter(sr, r) },
    'portal.fizzle': { cat: 'blocks', n: 3, level: 0.7, pv: 0.08, gen: (sr, r) => fizzle(sr, r) },
    'portal.close': { cat: 'blocks', n: 2, level: 0.7, pv: 0.05, gen: (sr, r) => portalClose(sr, r) },
  };
}

export function portalLoops(): Record<string, LoopSpec> {
  return {
    'loop.portal.hum': { cat: 'blocks', dur: 4, xf: 0.4, level: 0.55, gen: (sr, r, len) => portalHum(sr, r, len) },
  };
}
