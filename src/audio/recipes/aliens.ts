/**
 * Alien invasion sounds: the mothership's horn (a colossal brass-like "BRAAAM"), the invasion
 * drone (loop), plasma bolts, fly-by whines, the main beam's charge and blast, distant ship
 * explosions, the ion railgun, and the crash of a falling hulk.
 */
import { addNoise, alloc, highpass, lowpass, mix, smoothRandom, softClip, sweep, TAU } from '../dsp/core';
import { burst, scatter, thump, whoosh } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import type { LoopSpec, SoundSpec } from './types';

function saw(ph: number) {
  const x = ph / TAU;
  return 2 * (x - Math.floor(x + 0.5));
}

function rumble(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, lp: number, amp: number, attack = 0.02) {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  if (n <= 0) return;
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 1, 'brown');
  lowpass(b, sr, lp);
  const am = smoothRandom(r, sr, n, 4);
  const na = Math.max(1, Math.round(attack * sr));
  for (let i = 0; i < n; i++) {
    const u = i / n;
    out[s0 + i] += b[i] * amp * (i < na ? i / na : 1) * Math.pow(1 - u, 1.2) * (0.7 + 0.3 * am[i]);
  }
}

/** The horn: detuned low saws through a slowly opening filter, distorted, with sub. */
function horn(sr: number, r: Rand): Float32Array {
  const dur = 7.5;
  const out = alloc(sr, dur);
  const n = out.length;
  const f0 = 36 * r.range(0.97, 1.03);
  const det = [1, 1.004, 0.996, 2.003, 1.498, 0.5];
  const amps = [0.5, 0.45, 0.45, 0.22, 0.18, 0.4];
  const ph = det.map(() => r.range(0, TAU));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.35) * (t < dur - 2.5 ? 1 : Math.max(0, (dur - t) / 2.5));
    const bend = 1 - 0.035 * Math.exp(-t * 1.5);
    let s = 0;
    for (let k = 0; k < det.length; k++) {
      ph[k] += (TAU * f0 * det[k] * bend) / sr;
      s += (k === 5 ? Math.sin(ph[k]) : saw(ph[k])) * amps[k];
    }
    out[i] = s * env;
  }
  sweep(out, sr, 'lp', [0, 180, 0.6, 900, 3, 1400, 7.5, 600], 1.4);
  softClip(out, 2.4);
  rumble(out, sr, r, 0, dur, 70, 1.2, 0.2);
  return out;
}

/** Invasion ambience: a slow throbbing drone with distant engine wash. */
function drone(sr: number, r: Rand, len: number): Float32Array {
  const out = alloc(sr, len);
  const n = out.length;
  const f1 = Math.round(48 * len) / len, f2 = Math.round(48.5 * len) / len, lfo = Math.round(0.25 * len) / len;
  let p1 = 0, p2 = 0, pl = 0;
  for (let i = 0; i < n; i++) {
    p1 += (TAU * f1) / sr; p2 += (TAU * f2) / sr; pl += (TAU * lfo) / sr;
    out[i] = (Math.sin(p1) * 0.5 + Math.sin(p2) * 0.4 + saw(p1 * 2) * 0.06) * (0.75 + 0.25 * Math.sin(pl));
  }
  const wash = new Float32Array(n);
  addNoise(wash, r, 0, n, 1, 'pink');
  sweep(wash, sr, 'bp', 420, 0.8);
  const am = smoothRandom(r, sr, n, 0.4);
  for (let i = 0; i < n; i++) wash[i] *= 0.18 * (0.5 + 0.5 * am[i]);
  mix(out, wash, 0, 1);
  return out;
}

function plasma(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.6);
  const n = out.length;
  let ph = 0;
  const f0 = r.range(900, 1300);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    ph += (TAU * f0 * Math.pow(0.18, u)) / sr;
    out[i] = (Math.sin(ph) + 0.4 * Math.sin(ph * 2.7)) * Math.exp(-u * 6) * 0.6;
  }
  burst(out, sr, r, 0, 0.04, 0.5, 1200, 9000);
  whoosh(out, sr, r, 0, 0.5, { f: [0, 4000, 1, 900], amp: [0, 1, 1, 0], q: 2, gain: 0.3 });
  return out;
}

function flyby(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 2.6);
  const n = out.length;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const dop = 1.35 - 0.7 / (1 + Math.exp(-(u - 0.45) * 14));
    ph += (TAU * 310 * dop) / sr;
    const env = Math.exp(-Math.pow((u - 0.45) / 0.18, 2));
    out[i] = (saw(ph) * 0.25 + Math.sin(ph * 2.01) * 0.25) * env;
  }
  lowpass(out, sr, 3000);
  whoosh(out, sr, r, 0, 2.6, { f: [0, 600, 0.45, 2600, 1, 500], amp: [0, 0, 0.45, 1, 1, 0], q: 1.2, gain: 0.9, pink: true });
  return out;
}

function charge(sr: number, r: Rand): Float32Array {
  const dur = 6;
  const out = alloc(sr, dur);
  const n = out.length;
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = 40 + 480 * u * u;
    p1 += (TAU * f) / sr;
    p2 += (TAU * f * 1.51) / sr;
    const tremolo = 0.6 + 0.4 * Math.sin(TAU * (4 + 18 * u) * (i / sr));
    out[i] = (Math.sin(p1) * 0.5 + saw(p2) * 0.15) * u * tremolo;
  }
  rumble(out, sr, r, 0, dur, 90, 0.9, 3);
  whoosh(out, sr, r, 0, dur, { f: [0, 200, 1, 5000], amp: [0, 0, 0.7, 0.5, 1, 1], q: 4, gain: 0.5, pink: true });
  return out;
}

function beam(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 6);
  thump(out, sr, 0, 55, 20, 2.5, 1.6);
  burst(out, sr, r, 0, 0.4, 1.0, 80, 6000);
  rumble(out, sr, r, 0, 6, 120, 2.6, 0.01);
  const n = Math.round(3.2 * sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    ph += (TAU * (70 + Math.sin(i / sr * 30) * 8)) / sr;
    out[i] += saw(ph) * 0.35 * (1 - u) * Math.min(1, i / (0.05 * sr));
  }
  whoosh(out, sr, r, 0, 4, { f: [0, 3000, 0.2, 1200, 1, 200], amp: [0, 1, 0.3, 0.8, 1, 0], q: 0.8, gain: 0.9, pink: true });
  softClip(out, 2);
  return out;
}

function farBoom(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 4);
  thump(out, sr, 0.0, 60, 25, 1.4, 1.2);
  rumble(out, sr, r, 0, 4, 160, 2.2, 0.03);
  scatter(r, 0.1, 2.2, 6, (t) => burst(out, sr, r, t, r.range(0.05, 0.2), r.range(0.1, 0.35), 100, 1500));
  softClip(out, 1.6);
  return out;
}

function railgun(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 1.4);
  const n = out.length;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    ph += (TAU * (2600 * Math.pow(0.08, Math.min(1, u * 4)) + 80)) / sr;
    out[i] = Math.sin(ph) * Math.exp(-u * 7) * 0.5;
  }
  burst(out, sr, r, 0, 0.03, 1, 2000, 14000);
  thump(out, sr, 0, 130, 45, 0.3, 0.9);
  whoosh(out, sr, r, 0.01, 1.2, { f: [0, 7000, 1, 700], amp: [0, 1, 0.1, 0.6, 1, 0], q: 1.4, gain: 0.5 });
  highpass(out, sr, 40);
  softClip(out, 1.5);
  return out;
}

function crash(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 5);
  thump(out, sr, 0, 70, 22, 2.0, 1.5);
  burst(out, sr, r, 0, 0.3, 1, 100, 5000);
  rumble(out, sr, r, 0, 5, 140, 2.4, 0.01);
  scatter(r, 0.05, 3, (t) => 30 * Math.exp(-t), (t) => burst(out, sr, r, t, r.range(0.01, 0.06), r.range(0.1, 0.4), 800, 7000));
  softClip(out, 1.7);
  return out;
}

export function alienSounds(): Record<string, SoundSpec> {
  return {
    'alien.horn': { cat: 'hostile', n: 1, level: 1, send: 1, loud: -8, div: 2, gen: (sr, r) => horn(sr, r) },
    'alien.plasma': { cat: 'hostile', n: 4, level: 0.6, pv: 0.12, max: 10, gen: (sr, r) => plasma(sr, r) },
    'alien.flyby': { cat: 'hostile', n: 3, level: 0.7, pv: 0.12, max: 5, gen: (sr, r) => flyby(sr, r) },
    'alien.charge': { cat: 'hostile', n: 1, level: 0.9, send: 1, div: 2, gen: (sr, r) => charge(sr, r) },
    'alien.beam': { cat: 'hostile', n: 2, level: 1, send: 1, loud: -8, div: 2, gen: (sr, r) => beam(sr, r) },
    'alien.boom': { cat: 'hostile', n: 3, level: 1, pv: 0.15, send: 1, max: 8, div: 2, gen: (sr, r) => farBoom(sr, r) },
    'alien.railgun': { cat: 'players', n: 3, level: 0.8, pv: 0.05, gen: (sr, r) => railgun(sr, r) },
    'alien.crash': { cat: 'hostile', n: 2, level: 1, pv: 0.1, send: 1, div: 2, gen: (sr, r) => crash(sr, r) },
  };
}

export function alienLoops(): Record<string, LoopSpec> {
  return {
    'loop.alien.drone': { cat: 'hostile', dur: 8, xf: 0.6, level: 0.7, gen: (sr, r, len) => drone(sr, r, len) },
  };
}
