/**
 * Tropical island sounds: wildlife (crab clicks, snake hiss, parrot squawks and wing flaps, sea
 * turtle breaths), ambient one-shots (exotic jungle birds, seagulls) and ambience beds (surf
 * breaking on the beach, the jungle's daytime chorus of cicadas and birds, the night chorus of
 * frogs, crickets and katydids).
 */
import { addNoise, alloc, highpass, lowpass, smoothRandom, sweep, TAU } from '../dsp/core';
import { reverbMono } from '../dsp/fx';
import { bubbles, clicks, grains, scatter, thump, whoosh } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { voice } from '../dsp/voice';
import type { LoopSpec, SoundSpec } from './types';

// ------------------------------------------------------------------------------- helpers
/** A sine tone with a log-interpolated pitch contour [t, Hz, ...] and amplitude contour. */
function tone(out: Float32Array, sr: number, t0: number, dur: number, f: readonly number[], a: readonly number[], harm = 0, fm = 0, fmRate = 0) {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(out.length - s0, Math.ceil(dur * sr));
  if (n <= 0 || s0 < 0) return;
  let ph = 0;
  const lerp = (pts: readonly number[], u: number, log: boolean) => {
    for (let i = 2; i < pts.length; i += 2) {
      if (u <= pts[i]) {
        const k = (u - pts[i - 2]) / Math.max(1e-6, pts[i] - pts[i - 2]);
        return log ? pts[i - 1] * Math.pow(pts[i + 1] / pts[i - 1], k) : pts[i - 1] + (pts[i + 1] - pts[i - 1]) * k;
      }
    }
    return pts[pts.length - 1];
  };
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const fr = lerp(f, u, true) * (1 + (fm ? fm * Math.sin((TAU * fmRate * i) / sr) : 0));
    ph += (TAU * fr) / sr;
    const amp = lerp(a, u, false);
    out[s0 + i] += (Math.sin(ph) + harm * Math.sin(2 * ph) + harm * 0.4 * Math.sin(3 * ph)) * amp;
  }
}

function stereo(sr: number, r: Rand, len: number, fn: (o: Float32Array, rr: Rand, ch: number) => void): Float32Array[] {
  const L = alloc(sr, len), R = alloc(sr, len);
  fn(L, r.fork(1), 0);
  fn(R, r.fork(2), 1);
  return [L, R];
}

// ------------------------------------------------------------------------------- creatures
function crabClicks(sr: number, r: Rand, hurt: boolean): Float32Array {
  const out = alloc(sr, hurt ? 0.5 : 0.7);
  const n = hurt ? 6 + r.int(4) : 3 + r.int(5);
  clicks(out, sr, r, { t0: 0.005, t1: hurt ? 0.25 : 0.5, rate: n / (hurt ? 0.25 : 0.5), fLo: 2500, fHi: 7000, t60Lo: 0.004, t60Hi: 0.02, amp: 0.8, modes: 3 });
  bubbles(out, sr, r, 0.02, hurt ? 0.3 : 0.6, hurt ? 30 : 14, 1800, 4500, 0.12, 0.2, 0.6);
  if (hurt) voice(out, sr, r, 0.01, { dur: 0.12, f0: [0, 2600, 0.12, 3200], amp: [0, 0, 0.01, 0.4, 0.12, 0], vowel: [0, 'i', 0.12, 'i'], scale: 2.6, breath: 0.6, rough: 0.5 });
  return out;
}

function hiss(sr: number, r: Rand, dur: number, sharp: boolean): Float32Array {
  const out = alloc(sr, dur + 0.1);
  const att = sharp ? 0.01 : 0.12;
  whoosh(out, sr, r, 0.005, dur, { f: [0, r.range(4200, 5200), 0.5, r.range(5500, 6800), 1, r.range(4000, 5000)], amp: [0, 0, att / dur, 1, 0.75, 0.8, 1, 0], q: 0.9, gain: 1 });
  whoosh(out, sr, r, 0.005, dur, { f: [0, 2400, 1, 2000], amp: [0, 0, att / dur, 0.35, 1, 0], q: 1.5, gain: 0.4 });
  // breath pulsing
  const am = smoothRandom(r, sr, out.length, 6);
  for (let i = 0; i < out.length; i++) out[i] *= 0.8 + 0.2 * am[i];
  highpass(out, sr, 1500);
  if (sharp) thump(out, sr, 0.005, 180, 90, 0.08, 0.35);
  return out;
}

function squawk(sr: number, r: Rand, harsh: boolean): Float32Array {
  const dur = harsh ? r.range(0.25, 0.35) : r.range(0.18, 0.4);
  const out = alloc(sr, dur * 2 + 0.3);
  const calls = harsh ? 1 : 1 + r.int(2);
  let t = 0.005;
  for (let c = 0; c < calls; c++) {
    const d = dur * r.range(0.7, 1.1);
    const f = r.range(950, 1500) * (harsh ? 1.2 : 1);
    voice(out, sr, r, t, {
      dur: d, f0: [0, f * 0.9, d * 0.3, f * 1.25, d, f * 0.8], amp: [0, 0, 0.01, 1, d * 0.7, 0.8, d, 0],
      vowel: [0, 'ae', d * 0.5, 'a', d, 'ae'], scale: 2.4, tilt: 0.9, rough: harsh ? 0.85 : 0.55, breath: 0.35, nasal: 0.35, jitter: 0.04, maxHz: 9000,
    });
    t += d + r.range(0.05, 0.15);
  }
  // sometimes a whistle instead (the mimic)
  if (!harsh && r.chance(0.3)) {
    const out2 = alloc(sr, 0.9);
    tone(out2, sr, 0.01, 0.25, [0, 1400, 0.6, 2800, 1, 2600], [0, 0, 0.1, 0.5, 0.8, 0.5, 1, 0]);
    tone(out2, sr, 0.33, 0.45, [0, 2700, 0.4, 1500, 1, 900], [0, 0, 0.1, 0.5, 0.8, 0.45, 1, 0]);
    return out2;
  }
  return out;
}

function flaps(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.8);
  const n = 4 + r.int(3);
  for (let i = 0; i < n; i++) {
    const t = 0.01 + i * r.range(0.09, 0.12);
    whoosh(out, sr, r, t, 0.08, { f: [0, 900, 0.5, 1800, 1, 700], amp: [0, 0, 0.3, 1, 1, 0], q: 0.6, gain: 0.8 * (1 - i / (n + 1)), pink: true });
  }
  lowpass(out, sr, 4000);
  return out;
}

function turtleBreath(sr: number, r: Rand, hurt: boolean): Float32Array {
  const dur = hurt ? 0.4 : r.range(0.8, 1.3);
  const out = alloc(sr, dur + 0.2);
  if (hurt) voice(out, sr, r, 0.005, { dur, f0: [0, 140, dur, 95], amp: [0, 0, 0.02, 1, dur, 0], vowel: [0, 'uh', dur, 'o'], scale: 0.8, tilt: 1.8, rough: 0.7, breath: 0.5 });
  else whoosh(out, sr, r, 0.005, dur, { f: [0, 500, 0.3, 900, 1, 400], amp: [0, 0, 0.2, 1, 0.6, 0.7, 1, 0], q: 0.7, gain: 0.7, pink: true });
  lowpass(out, sr, 2500);
  return out;
}

// ------------------------------------------------------------------------------- birds
function tropicalBird(sr: number, r: Rand, v: number): Float32Array {
  const out = alloc(sr, 2.2);
  switch (v % 4) {
    case 0: { // descending flute-like cascade
      const n = 4 + r.int(4);
      const f0 = r.range(2600, 3600);
      for (let i = 0; i < n; i++) {
        const f = f0 * Math.pow(0.9, i);
        tone(out, sr, 0.02 + i * 0.13, 0.11, [0, f * 1.05, 1, f * 0.95], [0, 0, 0.2, 0.5, 0.7, 0.4, 1, 0], 0.08);
      }
      break;
    }
    case 1: { // toucan / hornbill: rhythmic hoarse croaks
      const n = 3 + r.int(4);
      for (let i = 0; i < n; i++) {
        const out2 = alloc(sr, 0.2);
        voice(out2, sr, r, 0.002, { dur: 0.09, f0: [0, 520, 0.09, 430], amp: [0, 0, 0.005, 1, 0.09, 0], vowel: [0, 'a', 0.09, 'o'], scale: 1.6, rough: 0.8, breath: 0.3, tilt: 1 });
        for (let j = 0; j < out2.length; j++) { const k = Math.round((0.02 + i * 0.22) * sr) + j; if (k < out.length) out[k] += out2[j] * 0.8; }
      }
      break;
    }
    case 2: { // fast trill that rises
      const d = r.range(0.7, 1.1);
      tone(out, sr, 0.02, d, [0, 2200, 1, 3800], [0, 0, 0.1, 0.4, 0.85, 0.4, 1, 0], 0.15, 0.08, r.range(28, 40));
      break;
    }
    default: { // two-note dove-like hoot, repeated
      const f = r.range(520, 700);
      for (let i = 0; i < 3; i++) {
        tone(out, sr, 0.02 + i * 0.55, 0.18, [0, f, 1, f * 0.97], [0, 0, 0.2, 0.55, 0.8, 0.45, 1, 0], 0.25);
        tone(out, sr, 0.24 + i * 0.55, 0.26, [0, f * 0.84, 1, f * 0.8], [0, 0, 0.2, 0.5, 0.8, 0.4, 1, 0], 0.25);
      }
    }
  }
  return reverbMono(out, sr, { t60: 0.9, size: 1, damp: 0.5, wet: 0.25, tail: 0.3 });
}

function seagull(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 2.2);
  const n = 2 + r.int(3);
  let t = 0.01;
  for (let i = 0; i < n; i++) {
    const d = r.range(0.22, 0.38) * (i === 0 ? 1.3 : 1);
    const f = r.range(1500, 1900);
    voice(out, sr, r, t, {
      dur: d, f0: [0, f * 0.8, d * 0.2, f * 1.15, d, f * 0.75], amp: [0, 0, 0.02, 1, d * 0.6, 0.8, d, 0],
      vowel: [0, 'i', d * 0.3, 'ae', d, 'a'], scale: 2.2, tilt: 0.9, rough: 0.35, breath: 0.25, nasal: 0.5, jitter: 0.02, maxHz: 9000,
    });
    t += d + r.range(0.08, 0.18);
  }
  return reverbMono(out, sr, { t60: 1.2, size: 1.2, damp: 0.4, wet: 0.3, tail: 0.4 });
}

// ------------------------------------------------------------------------------- beds
/** Waves breaking on a sandy beach: swell, crash, foam wash and backwash (period ~5..8 s). */
function surf(sr: number, r: Rand, len: number, o: Float32Array) {
  const n = o.length;
  // constant distant sea
  const sea = new Float32Array(n);
  addNoise(sea, r, 0, n, 0.25, 'brown');
  addNoise(sea, r, 0, n, 0.05, 'pink');
  lowpass(sea, sr, 700);
  for (let i = 0; i < n; i++) o[i] += sea[i];
  let t = r.range(0, 2);
  while (t < len + 2) {
    const per = r.range(5.5, 8);
    const big = r.range(0.6, 1);
    const start = t - 0.0;
    // swell: rising rumble
    whoosh(o, sr, r, Math.max(0, start), Math.min(len - Math.max(0, start), 1.4), { f: [0, 250, 1, 900], amp: [0, 0, 1, 0.5 * big], q: 0.6, gain: 1, pink: true });
    // crash
    const tc = start + 1.4;
    if (tc < len) {
      whoosh(o, sr, r, tc, Math.min(len - tc, 1.6), { f: [0, 2600, 0.15, 1800, 1, 600], amp: [0, 0, 0.03, 1, 0.3, 0.7, 1, 0], q: 0.45, gain: 1.3 * big, pink: true });
      // foam fizz and the wash up the sand
      const tw = tc + 0.3;
      if (tw < len) {
        grains(o, sr, r, { t0: tw, t1: Math.min(len, tw + 2.6), rate: (u) => 2500 * Math.exp(-(u - tw) / 1.1), fLo: 3000, fHi: 11000, q: 1.2, durLo: 0.001, durHi: 0.006, amp: 0.25 * big, tail: 2 });
        whoosh(o, sr, r, tw, Math.min(len - tw, 2.8), { f: [0, 4500, 1, 2500], amp: [0, 0, 0.1, 0.45, 1, 0], q: 0.5, gain: 0.6 * big });
      }
    }
    t += per;
  }
}

function cicadas(o: Float32Array, sr: number, r: Rand, len: number, amp: number) {
  const n = o.length;
  const k = 2 + r.int(2);
  for (let c = 0; c < k; c++) {
    const b = new Float32Array(n);
    addNoise(b, r, 0, n, 1, 'white');
    const fc = r.range(4800, 7500);
    sweep(b, sr, 'bp', fc, 6);
    // buzzing AM + slow swells
    const rate = r.range(140, 220);
    const swell = smoothRandom(r, sr, n, 0.25);
    const ph = r.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const s = 0.5 + 0.5 * Math.sin((TAU * rate * i) / sr + ph);
      const sw = Math.max(0, swell[i] * 0.8 + 0.25);
      o[i] += b[i] * s * sw * sw * amp;
    }
  }
}

function chirps(o: Float32Array, sr: number, r: Rand, len: number, rate: number, amp: number) {
  scatter(r, 0.1, len - 0.5, rate, (t) => {
    const f = r.range(2500, 5500);
    const d = r.range(0.04, 0.12);
    const up = r.chance(0.5);
    tone(o, sr, t, d, [0, up ? f * 0.8 : f * 1.2, 1, up ? f * 1.2 : f * 0.8], [0, 0, 0.3, amp * r.range(0.3, 1), 1, 0]);
    if (r.chance(0.5)) tone(o, sr, t + d + 0.03, d, [0, f, 1, f * 1.1], [0, 0, 0.3, amp * 0.6, 1, 0]);
  });
}

function frogs(o: Float32Array, sr: number, r: Rand, len: number) {
  // several frogs, each with its own croak rhythm and pitch
  const k = 3 + r.int(3);
  for (let f = 0; f < k; f++) {
    const f0 = r.range(280, 900);
    const pulses = 1 + r.int(3);
    const per = r.range(0.6, 1.6);
    const amp = r.range(0.08, 0.2);
    let t = r.range(0, per);
    while (t < len - 0.3) {
      for (let p = 0; p < pulses; p++) {
        const d = r.range(0.05, 0.09);
        tone(o, sr, t + p * (d + 0.035), d, [0, f0 * 1.1, 1, f0 * 0.85], [0, 0, 0.15, amp, 0.7, amp * 0.6, 1, 0], 0.6, 0.25, r.range(60, 110));
      }
      t += per * r.range(0.8, 1.25);
    }
  }
}

function crickets(o: Float32Array, sr: number, r: Rand, len: number) {
  for (let c = 0; c < 3; c++) {
    const f = r.range(3800, 5200);
    const period = r.range(0.4, 0.8);
    const pulses = 2 + r.int(3);
    const amp = r.range(0.06, 0.14);
    let t = r.range(0, period);
    while (t < len) {
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.round((t + p * 0.03) * sr);
        const n = Math.round(0.016 * sr);
        for (let i = 0; i < n && s0 + i < o.length; i++) o[s0 + i] += Math.sin((TAU * f * i) / sr) * Math.sin((Math.PI * i) / n) * amp;
      }
      t += period;
    }
  }
}

function katydids(o: Float32Array, sr: number, r: Rand, len: number) {
  // rhythmic raspy "ch-ch-ch" bursts
  scatter(r, 0.2, len - 0.5, 0.8, (t) => {
    const n = 3 + r.int(3);
    for (let i = 0; i < n; i++) whoosh(o, sr, r, t + i * 0.09, 0.05, { f: [0, 7000, 1, 6000], amp: [0, 0, 0.2, 1, 1, 0], q: 2, gain: 0.12 });
  });
}

export function islandSounds(): Record<string, SoundSpec> {
  return {
    'mob.crab.say': { cat: 'neutral', n: 3, level: 0.5, pv: 0.1, gen: (sr, r) => crabClicks(sr, r, false) },
    'mob.crab.hurt': { cat: 'neutral', n: 3, level: 0.7, pv: 0.08, gen: (sr, r) => crabClicks(sr, r, true) },
    'mob.snake.hiss': { cat: 'hostile', n: 3, level: 0.75, pv: 0.08, gen: (sr, r) => hiss(sr, r, r.range(0.9, 1.5), false) },
    'mob.snake.hurt': { cat: 'hostile', n: 3, level: 0.8, pv: 0.08, gen: (sr, r) => hiss(sr, r, r.range(0.25, 0.4), true) },
    'mob.parrot.say': { cat: 'neutral', n: 6, level: 0.7, pv: 0.1, gen: (sr, r) => squawk(sr, r, false) },
    'mob.parrot.hurt': { cat: 'neutral', n: 3, level: 0.8, pv: 0.08, gen: (sr, r) => squawk(sr, r, true) },
    'mob.parrot.fly': { cat: 'neutral', n: 3, level: 0.45, pv: 0.15, max: 6, gen: (sr, r) => flaps(sr, r) },
    'mob.turtle.say': { cat: 'neutral', n: 3, level: 0.35, pv: 0.1, gen: (sr, r) => turtleBreath(sr, r, false) },
    'mob.turtle.hurt': { cat: 'neutral', n: 2, level: 0.7, pv: 0.08, gen: (sr, r) => turtleBreath(sr, r, true) },
    'ambient.tropical_bird': { cat: 'ambient', n: 8, level: 0.4, pv: 0.06, max: 3, gen: (sr, r, v) => tropicalBird(sr, r, v) },
    'ambient.seagull': { cat: 'ambient', n: 4, level: 0.45, pv: 0.08, max: 2, gen: (sr, r) => seagull(sr, r) },
  };
}

export function islandLoops(): Record<string, LoopSpec> {
  return {
    'loop.island.surf': {
      cat: 'ambient', dur: 12, xf: 2, stereo: true, div: 2,
      gen: (sr, r, len) => stereo(sr, r, len, (o, rr) => surf(sr, rr, len, o)),
    },
    'loop.jungle.day': {
      cat: 'ambient', dur: 12, xf: 1.5, stereo: true,
      gen: (sr, r, len) => stereo(sr, r, len, (o, rr) => {
        cicadas(o, sr, rr, len, 0.06);
        chirps(o, sr, rr, len, 1.6, 0.18);
        const leaves = new Float32Array(o.length);
        addNoise(leaves, rr, 0, leaves.length, 0.05, 'pink');
        lowpass(leaves, sr, 1800);
        for (let i = 0; i < o.length; i++) o[i] += leaves[i];
      }),
    },
    'loop.jungle.night': {
      cat: 'ambient', dur: 10, xf: 1.5, stereo: true,
      gen: (sr, r, len) => stereo(sr, r, len, (o, rr) => {
        frogs(o, sr, rr, len);
        crickets(o, sr, rr, len);
        katydids(o, sr, rr, len);
      }),
    },
  };
}
