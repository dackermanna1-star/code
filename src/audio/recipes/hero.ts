/**
 * Hero (one-punch) sounds: the normal punch (air crack + sonic boom + deep body), barrage jabs,
 * the serious wind-up, the serious punch (a long rolling boom and wind), the planet-cracking
 * quake, and the heavy landing after a super leap.
 */
import { addNoise, alloc, highpass, lowpass, mix, smoothRandom, softClip, sweep, TAU } from '../dsp/core';
import { burst, crackle, scatter, thump, whoosh } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import type { SoundSpec } from './types';

/** Rolling low rumble (brown noise, slowly modulated) from t0 for dur s. */
function rumble(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, lp: number, amp: number, attack = 0.01) {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  if (n <= 0) return;
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 1, 'brown');
  lowpass(b, sr, lp);
  const am = smoothRandom(r, sr, n, 6);
  const na = Math.max(1, Math.round(attack * sr));
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const env = (i < na ? i / na : 1) * Math.pow(1 - u, 1.4);
    out[s0 + i] += b[i] * env * amp * (0.7 + 0.3 * am[i]);
  }
}

/** Sharp N-wave crack (sonic boom). */
function crack(out: Float32Array, sr: number, t0: number, amp: number, dur = 0.012) {
  const s0 = Math.round(t0 * sr);
  const n = Math.ceil(dur * sr);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const u = i / n;
    out[s0 + i] += amp * (1 - 2 * u) * (u < 0.05 ? u / 0.05 : 1);
  }
}

function normalPunch(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 2.2);
  whoosh(out, sr, r, 0, 0.12, { f: [0, 900, 1, 3500], amp: [0, 0, 0.6, 1, 1, 0.4], q: 2, gain: 0.6 });
  crack(out, sr, 0.09, 1.0);
  crack(out, sr, 0.1, -0.6, 0.02);
  thump(out, sr, 0.09, 95, 32, 0.6, 1.0);
  burst(out, sr, r, 0.09, 0.15, 0.6, 200, 6000);
  rumble(out, sr, r, 0.09, 2.0, 160, 1.6);
  whoosh(out, sr, r, 0.1, 1.6, { f: [0, 2400, 0.3, 900, 1, 300], amp: [0, 1, 0.2, 0.5, 1, 0], q: 1.2, gain: 0.5, pink: true });
  softClip(out, 1.6);
  return out;
}

function jab(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.35);
  crack(out, sr, 0.01, 0.8 * r.range(0.8, 1.1));
  thump(out, sr, 0.01, r.range(110, 150), 45, 0.18, 0.8);
  burst(out, sr, r, 0.01, 0.06, 0.5, 400, 7000);
  whoosh(out, sr, r, 0, 0.25, { f: [0, 3000, 1, 600], amp: [0, 1, 1, 0], q: 1.5, gain: 0.35 });
  softClip(out, 1.4);
  return out;
}

function charge(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 1.0);
  rumble(out, sr, r, 0, 1.0, 120, 0.8, 0.5);
  whoosh(out, sr, r, 0, 0.95, { f: [0, 200, 1, 2200], amp: [0, 0, 0.8, 1, 1, 0.2], q: 3, gain: 0.7, pink: true });
  // a tightening tone
  const n = out.length;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    ph += (TAU * (60 + 160 * u * u)) / sr;
    out[i] += Math.sin(ph) * 0.25 * u * (1 - Math.max(0, (u - 0.9) * 10));
  }
  return out;
}

function seriousPunch(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 6.0);
  crack(out, sr, 0.02, 1.0, 0.02);
  crack(out, sr, 0.05, -0.8, 0.03);
  thump(out, sr, 0.02, 70, 22, 1.6, 1.4);
  burst(out, sr, r, 0.02, 0.3, 0.8, 120, 5000);
  rumble(out, sr, r, 0.02, 5.8, 110, 2.4, 0.02);
  rumble(out, sr, r, 0.3, 5.5, 60, 1.6, 0.3);
  // the air itself tearing: a long wind roar
  whoosh(out, sr, r, 0.05, 4.5, { f: [0, 3000, 0.15, 1500, 1, 180], amp: [0, 1, 0.1, 0.9, 1, 0], q: 0.9, gain: 0.8, pink: true });
  crackle(out, sr, r, 0.1, 2.5, { rate: 40, amp: 0.25, fLo: 300, fHi: 3000, pops: 0.3 });
  softClip(out, 1.8);
  return out;
}

function quake(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 9.0);
  thump(out, sr, 0.0, 60, 18, 3.0, 1.5);
  rumble(out, sr, r, 0.0, 9.0, 80, 2.6, 0.05);
  rumble(out, sr, r, 0.5, 8.5, 45, 2.0, 1.0);
  // rock splitting
  scatter(r, 0.2, 7.5, (t) => 14 * (1 - t / 8), (t) => {
    burst(out, sr, r, t, r.range(0.02, 0.08), r.range(0.1, 0.45), 300, 4000);
    thump(out, sr, t, r.range(60, 120), 30, r.range(0.1, 0.4), r.range(0.1, 0.4));
  });
  highpass(out, sr, 18);
  softClip(out, 1.6);
  return out;
}

function landing(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 1.8);
  thump(out, sr, 0, 75, 28, 0.7, 1.4);
  burst(out, sr, r, 0, 0.12, 0.7, 150, 3500);
  rumble(out, sr, r, 0.01, 1.7, 140, 1.4);
  scatter(r, 0.05, 1.0, 30, (t) => burst(out, sr, r, t, 0.03, r.range(0.05, 0.2), 400, 3000));
  softClip(out, 1.5);
  return out;
}

export function heroSounds(): Record<string, SoundSpec> {
  return {
    'hero.punch': { cat: 'players', n: 3, level: 1, pv: 0.05, send: 0.8, loud: -10, gen: (sr, r) => normalPunch(sr, r) },
    'hero.jab': { cat: 'players', n: 4, level: 0.7, pv: 0.1, send: 0.4, max: 8, gen: (sr, r) => jab(sr, r) },
    'hero.charge': { cat: 'players', n: 2, level: 0.8, pv: 0.03, gen: (sr, r) => charge(sr, r) },
    'hero.serious': { cat: 'players', n: 2, level: 1, pv: 0.03, send: 1, loud: -8, div: 2, gen: (sr, r) => seriousPunch(sr, r) },
    'hero.quake': { cat: 'blocks', n: 1, level: 1, pv: 0, send: 1, loud: -9, div: 2, gen: (sr, r) => quake(sr, r) },
    'hero.land': { cat: 'players', n: 2, level: 0.9, pv: 0.06, send: 0.7, gen: (sr, r) => landing(sr, r) },
  };
}
