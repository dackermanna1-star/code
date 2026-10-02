/**
 * Gameplay one-shots: UI, item pickup / XP / level-up, eating & drinking, bows, explosions,
 * fuses, doors, chests, pistons, fire, liquids, player hurt / attacks, tools and throwables.
 */
import { addNoise, alloc, highpass, lowpass, midiHz, mix, peakEq, smoothRandom, softClip, sweep, TAU } from '../dsp/core';
import { reverbMono } from '../dsp/fx';
import {
  BAR,
  PLATE,
  bubble,
  bubbles,
  burst,
  clicks,
  crackle,
  creak,
  grains,
  ping,
  pluck,
  randomModes,
  ratioModes,
  strike,
  thump,
  whoosh,
  type Mode,
} from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { voice } from '../dsp/voice';
import { bodyThud, boom, debris, shatter, sizzle, slosh, splash, swish } from './kit';
import type { SoundSpec } from './types';

// ---------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------

/** Struck bell/bar tone (glockenspiel, chimes) into `out`. */
function chime(out: Float32Array, sr: number, t: number, f: number, amp: number, t60: number, ratios: readonly number[] = BAR, amps?: readonly number[]): void {
  strike(out, sr, t, ratioModes(f, ratios, t60, { tilt: 1.1, decayTilt: 0.9, amps }), amp, 0.0006);
}

function woodKnock(out: Float32Array, sr: number, r: Rand, t: number, f0: number, t60: number, amp: number): void {
  const m: Mode[] = [
    { f: f0, t60, a: 1 },
    { f: f0 * r.range(1.9, 2.3), t60: t60 * 0.7, a: 0.6 },
    { f: f0 * r.range(2.9, 3.6), t60: t60 * 0.5, a: 0.4 },
    { f: f0 * r.range(4.5, 5.5), t60: t60 * 0.35, a: 0.25 },
    ...randomModes(r, 5, 800, 3200, t60 * 0.15, t60 * 0.35, { tilt: 0.5, amp: 0.35 }),
  ];
  strike(out, sr, t, m, amp, 0.0004);
  burst(out, sr, r, t, 0.004, amp * 0.3, 500, 6000);
}

function metalClank(out: Float32Array, sr: number, r: Rand, t: number, f0: number, t60: number, amp: number): void {
  strike(out, sr, t, ratioModes(f0, PLATE, t60, { tilt: 0.4, decayTilt: 0.5, jitter: 0.02, r }), amp);
  strike(out, sr, t, randomModes(r, 4, 2500, 8000, t60 * 0.1, t60 * 0.3, { tilt: 0.3 }), amp * 0.35);
  burst(out, sr, r, t, 0.003, amp * 0.4, 1500, 11000);
}

/** Mechanical click (buttons, levers, latches, UI). */
function mechClick(out: Float32Array, sr: number, r: Rand, t: number, amp: number, bright = 1): void {
  burst(out, sr, r, t, 0.0025, amp, 1800 * bright, 10000);
  ping(out, sr, t, r.range(2600, 4200) * bright, 0.014, amp * 0.5);
  ping(out, sr, t, r.range(650, 1050) * bright, 0.022, amp * 0.35);
}

function hiss(out: Float32Array, sr: number, r: Rand, t0: number, dur: number, f0: number, f1: number, amp: number): void {
  const n = Math.ceil(dur * sr);
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 1);
  const h = b.slice();
  sweep(b, sr, 'bp', [0, f0, dur, f1], 1.4);
  highpass(h, sr, 2200);
  lowpass(h, sr, 11000);
  const fl = smoothRandom(r, sr, n, 16);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const e = Math.min(1, u / 0.02) * (0.75 + 0.25 * u) * (1 - Math.pow(u, 8));
    b[i] = (b[i] * 0.8 + h[i] * 0.25) * e * (0.8 + 0.2 * fl[i]);
  }
  mix(out, b, Math.round(t0 * sr), amp);
}

function explosion(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 4.0);
  burst(out, sr, r, 0.002, 0.09, 1.5, 150, 10000, 0.0003);
  burst(out, sr, r, 0.002, 0.4, 1.1, 50, 2200, 0.002);
  boom(out, sr, r, 0.002, r.range(42, 55), 2.2, 1.2);
  thump(out, sr, 0.002, 230, 85, 0.3, 0.9, 0.002);
  const n = Math.ceil(3.4 * sr);
  const b = new Float32Array(n);
  addNoise(b, r, 0, n, 0.6, 'brown');
  addNoise(b, r, 0, n, 0.35, 'pink');
  sweep(b, sr, 'lp', [0, 4500, 0.3, 1300, 1.5, 420, 3.4, 160], 0.8);
  const am = smoothRandom(r, sr, n, 7);
  for (let i = 0; i < n; i++) {
    const u = i / sr;
    b[i] *= (u < 0.008 ? u / 0.008 : Math.exp(-u / 0.85)) * (0.7 + 0.3 * am[i]);
  }
  mix(out, b, Math.round(0.002 * sr), 1.2);
  debris(out, sr, r, 0.06, 2.4, { amp: 0.55, fLo: 500, fHi: 6000, hard: 0.8, t60: 0.03, density: 1.5 });
  for (let k = 0; k < 7; k++) {
    const t = r.range(0.35, 2.3);
    const a = r.range(0.12, 0.35) * Math.exp(-t / 1.6);
    thump(out, sr, t, r.range(100, 170), 60, 0.12, a);
    grains(out, sr, r, { t0: t, t1: t + 0.08, rate: 900, fLo: 500, fHi: 4000, q: 1.6, amp: a });
  }
  const wet = reverbMono(out, sr, { t60: 1.6, size: 1.6, damp: 0.55, wet: 0.32, predelay: 0.06, tail: 0.5 });
  softClip(wet, 2.4);
  return wet;
}

function gulp(out: Float32Array, sr: number, r: Rand, t: number, amp: number): void {
  bubble(out, sr, t, r.range(170, 250), amp, 0.45, 0.28);
  thump(out, sr, t, 140, 85, 0.08, amp * 0.5, 0.006);
  bubbles(out, sr, r, t + 0.02, t + 0.12, 60, 400, 1500, amp * 0.25, 0.3);
}

function chomp(out: Float32Array, sr: number, r: Rand, t: number, amp: number): void {
  grains(out, sr, r, { t0: t, t1: t + 0.09, rate: (tt) => 2600 * Math.exp(-(tt - t) / 0.03), fLo: 900, fHi: 5500, q: 1.8, durLo: 0.001, durHi: 0.006, amp, tail: 2 });
  clicks(out, sr, r, { t0: t, t1: t + 0.06, rate: 140, fLo: 1500, fHi: 4500, t60Lo: 0.004, t60Hi: 0.015, amp: amp * 0.5 });
  thump(out, sr, t, 180, 110, 0.05, amp * 0.35);
  bubble(out, sr, t + r.range(0.02, 0.06), r.range(700, 1200), amp * 0.12, 0.3);
}

function bowRelease(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.6);
  burst(out, sr, r, 0.002, 0.004, 0.5, 500, 5000);
  pluck(out, sr, r, 0.002, r.range(105, 135), { dur: 0.35, t60: 0.22, bright: 0.75, pick: 0.13, amp: 0.9 });
  thump(out, sr, 0.002, 190, 120, 0.05, 0.35);
  whoosh(out, sr, r, 0.01, 0.28, { f: [0, 900, 0.3, 2600, 1, 1400], amp: [0, 0, 0.15, 1, 1, 0], q: 2, gain: 0.45 });
  return out;
}

function arrowThock(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.4);
  woodKnock(out, sr, r, 0.002, r.range(550, 850), 0.04, 0.9);
  burst(out, sr, r, 0.002, 0.003, 0.7, 1500, 9000);
  // shaft quiver
  const n = Math.round(0.16 * sr);
  const q = new Float32Array(n);
  addNoise(q, r, 0, n, 1);
  lowpass(q, sr, 900);
  const fq = r.range(38, 55);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    q[i] *= Math.max(0, Math.sin((TAU * fq * i) / sr)) * (1 - u) * (1 - u);
  }
  mix(out, q, Math.round(0.01 * sr), 0.4);
  thump(out, sr, 0.002, 160, 100, 0.05, 0.3);
  return out;
}

function snap(sr: number, r: Rand): Float32Array {
  const out = alloc(sr, 0.6);
  burst(out, sr, r, 0.002, 0.004, 1, 1200, 12000);
  creak(out, sr, r, 0.003, 0.05, { rate: [0, 1200, 1, 200], amp: [0, 1, 1, 0.2], modes: randomModes(r, 5, 800, 4000, 0.01, 0.04, { tilt: 0.2 }), jitter: 0.5, gain: 3 });
  clicks(out, sr, r, { t0: 0.02, t1: 0.4, rate: (t) => 120 * Math.exp(-t / 0.12), fLo: 2000, fHi: 8000, t60Lo: 0.02, t60Hi: 0.12, amp: 0.4, modes: 3 });
  ping(out, sr, 0.003, r.range(3000, 4500), 0.15, 0.25);
  return out;
}

function doorCreak(out: Float32Array, sr: number, r: Rand, t: number, dur: number, low: boolean): void {
  const modes = randomModes(r, 7, low ? 160 : 220, low ? 1500 : 2200, 0.03, 0.09, { tilt: 0.3 });
  const a = low ? r.range(18, 30) : r.range(35, 55);
  creak(out, sr, r, t, dur, {
    rate: [0, a, 0.3, a * r.range(1.8, 2.6), 0.75, a * r.range(1.2, 1.8), 1, a * 0.7],
    amp: [0, 0.3, 0.15, 1, 0.8, 0.8, 1, 0],
    modes,
    jitter: 0.3,
    gain: low ? 3.5 : 3,
    noise: 0.25,
  });
  if (!low && r.chance(0.7)) {
    // thin hinge squeal
    const sq = randomModes(r, 3, 900, 2600, 0.05, 0.1, { tilt: 0 });
    creak(out, sr, r, t + dur * 0.15, dur * 0.6, { rate: [0, 380, 0.5, 620, 1, 450], amp: [0, 0, 0.3, 0.5, 1, 0], modes: sq, jitter: 0.05, gain: 0.35 });
  }
}

function attackHit(out: Float32Array, sr: number, r: Rand, t: number, amp: number, weight: number): void {
  thump(out, sr, t, 170 / weight, 90 / weight, 0.08 * weight, amp * 0.45, 0.002);
  burst(out, sr, r, t, 0.025 * weight, amp * 0.9, 400, 5000);
  burst(out, sr, r, t, 0.006, amp * 0.5, 1500, 9000);
  grains(out, sr, r, { t0: t, t1: t + 0.04, rate: 1800, fLo: 800, fHi: 4000, q: 1, amp: amp * 0.45 });
}

function sparkle(out: Float32Array, sr: number, r: Rand, t0: number, t1: number, rate: number, amp: number, fLo = 3000, fHi = 9500): void {
  clicks(out, sr, r, { t0, t1, rate, fLo, fHi, t60Lo: 0.06, t60Hi: 0.4, amp, modes: 2, tail: 1.6 });
}

function lavaPop(out: Float32Array, sr: number, r: Rand, t: number, amp: number): void {
  bubble(out, sr, t, r.range(170, 320), amp, 0.55, 0.22);
  const n = Math.round(0.05 * sr);
  const s0 = Math.round(t * sr);
  let ph = 0;
  const f0 = r.range(110, 150);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const u = i / n;
    ph += (TAU * f0 * (1 + 1.4 * u)) / sr;
    out[s0 + i] += Math.sin(ph) * Math.sin(Math.PI * u) * amp * 0.6;
  }
  sizzle(out, sr, r, t + 0.01, r.range(0.12, 0.2), amp * 0.35, 1);
  crackle(out, sr, r, t, 0.1, { rate: 60, amp: amp * 0.25 });
}

// ---------------------------------------------------------------------------------------

export function sfxSounds(): Record<string, SoundSpec> {
  return {
    // ---------------- UI ----------------
    'ui.click': {
      cat: 'ui',
      n: 2,
      level: 0.38,
      pv: 0.02,
      send: 0,
      gen: (sr, r) => {
        const out = alloc(sr, 0.09);
        mechClick(out, sr, r, 0.001, 1, 1.1);
        mechClick(out, sr, r, 0.001 + r.range(0.005, 0.008), 0.35, 0.9);
        thump(out, sr, 0.001, 420, 300, 0.025, 0.25);
        return out;
      },
    },

    // ---------------- pickups & progression ----------------
    'random.pop': {
      cat: 'players',
      n: 3,
      level: 0.42,
      pv: 0.14,
      max: 6,
      gen: (sr, r) => {
        const out = alloc(sr, 0.12);
        const f0 = r.range(300, 380);
        const f1 = f0 * r.range(3.2, 4.0);
        const tau = r.range(0.009, 0.014);
        let ph = 0;
        const n = Math.round(0.1 * sr);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const f = f0 + (f1 - f0) * (1 - Math.exp(-t / tau));
          ph += (TAU * f) / sr;
          const e = Math.min(1, t / 0.0012) * Math.exp(-t / 0.022);
          out[i] += (Math.sin(ph) + 0.18 * Math.sin(2 * ph)) * e;
        }
        burst(out, sr, r, 0, 0.002, 0.2, 800, 7000);
        return out;
      },
    },
    'random.orb': {
      cat: 'players',
      n: 3,
      level: 0.32,
      pv: 0.18,
      max: 6,
      gen: (sr, r) => {
        const out = alloc(sr, 0.7);
        const f = r.range(1500, 2000);
        chime(out, sr, 0.001, f, 1, 0.55, BAR, [1, 0.32, 0.12, 0.05]);
        chime(out, sr, 0.001, f * 2.01, 0.25, 0.3, [1], [1]);
        burst(out, sr, r, 0.001, 0.003, 0.25, 4000, 14000);
        return out;
      },
    },
    'random.levelup': {
      cat: 'players',
      n: 2,
      level: 0.6,
      pv: 0.01,
      gen: (sr, r) => {
        const out = alloc(sr, 2.0);
        const root = r.pick([74, 76, 77]);
        const steps = [0, 4, 7, 12, 16, 19];
        for (let i = 0; i < steps.length; i++) {
          const t = 0.004 + i * 0.048;
          const f = midiHz(root + steps[i]);
          pluck(out, sr, r, t, f, { dur: 1.4, t60: 1.1, bright: 0.85, pick: 0.2, amp: 0.45 });
          chime(out, sr, t, f, 0.35, 0.9, [1, 2.0, 3.01, 4.2], [1, 0.25, 0.08, 0.04]);
        }
        // shimmering top chord with gentle vibrato
        const tEnd = 0.004 + steps.length * 0.048;
        for (const s of [12, 16, 19, 24]) {
          const f = midiHz(root + s);
          const n = Math.round(1.4 * sr);
          const s0 = Math.round(tEnd * sr);
          let ph = r.next() * TAU;
          for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / sr;
            ph += (TAU * f * (1 + 0.004 * Math.sin(TAU * 5.5 * t))) / sr;
            out[s0 + i] += Math.sin(ph) * Math.min(1, t / 0.05) * Math.exp(-t / 0.45) * 0.12;
          }
        }
        sparkle(out, sr, r, 0.05, 1.2, 30, 0.12, 5000, 11000);
        return reverbMono(out, sr, { t60: 1.2, size: 0.8, damp: 0.3, wet: 0.25, tail: 0.3 });
      },
    },

    // ---------------- eating / drinking ----------------
    'random.eat': {
      cat: 'players',
      n: 3,
      level: 0.5,
      pv: 0.15,
      gen: (sr, r) => {
        const out = alloc(sr, 0.35);
        chomp(out, sr, r, 0.003, 1);
        if (r.chance(0.6)) chomp(out, sr, r, r.range(0.1, 0.15), 0.6);
        return out;
      },
    },
    'random.drink': {
      cat: 'players',
      n: 3,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.35);
        gulp(out, sr, r, 0.004, 1);
        return out;
      },
    },
    'random.burp': {
      cat: 'players',
      n: 2,
      level: 0.55,
      pv: 0.1,
      gen: (sr, r) => {
        const dur = r.range(0.42, 0.58);
        const out = alloc(sr, dur + 0.1);
        voice(out, sr, r, 0.004, {
          dur,
          f0: [0, 92, 0.08, 108, dur, 68],
          amp: [0, 0, 0.015, 1, dur * 0.7, 0.8, dur, 0],
          vowel: [0, 'uh', dur * 0.5, 'o', dur, 'U'],
          scale: 0.95,
          tilt: 1.4,
          breath: 0.18,
          rough: 0.85,
          jitter: 0.045,
          shimmer: 0.3,
          maxHz: 4000,
        });
        return out;
      },
    },

    // ---------------- bows & arrows ----------------
    'random.bow': { cat: 'players', n: 3, level: 0.7, pv: 0.1, gen: (sr, r) => bowRelease(sr, r) },
    'entity.arrow.shoot': { cat: 'players', n: 3, level: 0.7, pv: 0.1, gen: (sr, r) => bowRelease(sr, r) },
    'random.bowhit': { cat: 'players', n: 4, level: 0.6, pv: 0.12, gen: (sr, r) => arrowThock(sr, r) },
    'entity.arrow.hit': { cat: 'players', n: 4, level: 0.6, pv: 0.12, gen: (sr, r) => arrowThock(sr, r) },

    // ---------------- breaking / explosions ----------------
    'random.break': { cat: 'players', n: 3, level: 0.75, pv: 0.08, gen: (sr, r) => snap(sr, r) },
    'entity.item.break': { cat: 'players', n: 3, level: 0.75, pv: 0.08, gen: (sr, r) => snap(sr, r) },
    'random.explode': { cat: 'blocks', n: 4, level: 1, pv: 0.06, max: 6, loud: -9, gen: (sr, r) => explosion(sr, r) },
    'random.fuse': {
      cat: 'hostile',
      n: 2,
      level: 0.8,
      pv: 0.04,
      gen: (sr, r) => {
        const dur = r.range(1.4, 1.7);
        const out = alloc(sr, dur + 0.05);
        hiss(out, sr, r, 0.002, dur, r.range(3200, 3700), r.range(3900, 4500), 1);
        grains(out, sr, r, { t0: 0.01, t1: dur, rate: 260, fLo: 3500, fHi: 10000, q: 2, amp: 0.25 });
        crackle(out, sr, r, 0.01, dur, { rate: 22, amp: 0.25, fLo: 2500, fHi: 8000 });
        burst(out, sr, r, 0.002, 0.02, 0.3, 1000, 9000);
        return out;
      },
    },

    // ---------------- doors, chests, buttons, pistons ----------------
    'random.door_open': {
      cat: 'blocks',
      n: 3,
      level: 0.75,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.75);
        mechClick(out, sr, r, 0.003, 0.5, 0.8);
        doorCreak(out, sr, r, 0.02, r.range(0.32, 0.48), false);
        woodKnock(out, sr, r, r.range(0.36, 0.5), r.range(150, 210), 0.08, 0.25);
        return out;
      },
    },
    'random.door_close': {
      cat: 'blocks',
      n: 3,
      level: 0.8,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        if (r.chance(0.5)) doorCreak(out, sr, r, 0.002, r.range(0.08, 0.12), false);
        const t = r.range(0.03, 0.06);
        woodKnock(out, sr, r, t, r.range(140, 190), 0.14, 1);
        thump(out, sr, t, 150, 85, 0.08, 0.3);
        mechClick(out, sr, r, t + 0.004, 0.5, 0.8);
        woodKnock(out, sr, r, t + r.range(0.025, 0.04), r.range(160, 220), 0.06, 0.25);
        return out;
      },
    },
    'random.chest_open': {
      cat: 'blocks',
      n: 3,
      level: 0.7,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 1.0);
        mechClick(out, sr, r, 0.003, 0.6, 0.7);
        doorCreak(out, sr, r, 0.03, r.range(0.55, 0.75), true);
        woodKnock(out, sr, r, 0.01, r.range(130, 175), 0.16, 0.35);
        return out;
      },
    },
    'random.chest_close': {
      cat: 'blocks',
      n: 3,
      level: 0.75,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        whoosh(out, sr, r, 0.002, 0.08, { f: [0, 300, 1, 900], amp: [0, 0, 0.6, 1, 1, 0], q: 0.7, gain: 0.25, pink: true });
        const t = 0.07;
        woodKnock(out, sr, r, t, r.range(120, 165), 0.18, 1);
        thump(out, sr, t, 130, 75, 0.1, 0.35);
        mechClick(out, sr, r, t + 0.006, 0.6, 0.7);
        return out;
      },
    },
    'random.click': {
      cat: 'blocks',
      n: 3,
      level: 0.45,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 0.1);
        mechClick(out, sr, r, 0.001, 1, 1);
        mechClick(out, sr, r, 0.001 + r.range(0.01, 0.018), 0.4, 0.85);
        return out;
      },
    },
    'tile.piston.out': {
      cat: 'blocks',
      n: 3,
      level: 0.6,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.55);
        whoosh(out, sr, r, 0.002, 0.16, { f: [0, 300, 0.6, 1400, 1, 600], amp: [0, 0, 0.7, 1, 1, 0], q: 0.9, gain: 0.5, pink: true });
        const t = 0.11;
        woodKnock(out, sr, r, t, r.range(140, 200), 0.09, 0.9);
        thump(out, sr, t, 130, 75, 0.1, 0.7);
        metalClank(out, sr, r, t + 0.003, r.range(500, 700), 0.15, 0.25);
        grains(out, sr, r, { t0: t, t1: t + 0.05, rate: 700, fLo: 800, fHi: 4000, q: 2, amp: 0.25 });
        return out;
      },
    },
    'tile.piston.in': {
      cat: 'blocks',
      n: 3,
      level: 0.6,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.55);
        whoosh(out, sr, r, 0.002, 0.18, { f: [0, 1200, 0.6, 450, 1, 250], amp: [0, 0, 0.2, 1, 1, 0], q: 0.9, gain: 0.45, pink: true });
        const t = 0.1;
        woodKnock(out, sr, r, t, r.range(170, 230), 0.07, 0.7);
        thump(out, sr, t, 150, 90, 0.08, 0.5);
        metalClank(out, sr, r, t + 0.003, r.range(600, 800), 0.12, 0.2);
        return out;
      },
    },

    // ---------------- fire ----------------
    'item.flintandsteel.use': {
      cat: 'blocks',
      n: 3,
      level: 0.6,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.3);
        burst(out, sr, r, 0.002, 0.014, 0.9, 2500, 13000);
        whoosh(out, sr, r, 0.002, 0.03, { f: [0, 3000, 1, 7000], amp: [0, 0, 0.3, 1, 1, 0], q: 1.5, gain: 0.4 });
        ping(out, sr, 0.003, r.range(4000, 6000), 0.03, 0.3);
        sparkle(out, sr, r, 0.004, 0.1, 280, 0.35, 4000, 11000);
        return out;
      },
    },
    'fire.ignite': {
      cat: 'blocks',
      n: 3,
      level: 0.65,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.75);
        burst(out, sr, r, 0.002, 0.014, 0.9, 2500, 13000);
        ping(out, sr, 0.003, r.range(4000, 6000), 0.03, 0.3);
        sparkle(out, sr, r, 0.004, 0.1, 280, 0.3, 4000, 11000);
        whoosh(out, sr, r, 0.05, r.range(0.45, 0.6), { f: [0, 250, 0.3, 950, 1, 380], amp: [0, 0, 0.25, 1, 0.6, 0.5, 1, 0], q: 0.8, gain: 0.8, pink: true });
        crackle(out, sr, r, 0.1, 0.5, { rate: 25, amp: 0.3 });
        return out;
      },
    },
    'fire.fire': {
      cat: 'blocks',
      n: 3,
      level: 0.6,
      pv: 0.1,
      gen: (sr, r) => {
        const dur = r.range(1.2, 1.7);
        const out = alloc(sr, dur + 0.1);
        const n = Math.ceil(dur * sr);
        const b = new Float32Array(n);
        addNoise(b, r, 0, n, 1, 'brown');
        lowpass(b, sr, 450);
        const am = smoothRandom(r, sr, n, 9);
        for (let i = 0; i < n; i++) {
          const u = i / n;
          b[i] *= (0.6 + 0.4 * am[i]) * Math.sin(Math.PI * Math.min(1, u * 1.2)) ** 0.5;
        }
        mix(out, b, 0, 0.45);
        crackle(out, sr, r, 0.02, dur * 0.95, { rate: 26, amp: 1 });
        return out;
      },
    },
    'block.furnace.fire_crackle': {
      cat: 'blocks',
      n: 3,
      level: 0.5,
      pv: 0.08,
      gen: (sr, r) => {
        const dur = r.range(1.2, 1.6);
        const out = alloc(sr, dur + 0.1);
        const n = Math.ceil(dur * sr);
        const b = new Float32Array(n);
        addNoise(b, r, 0, n, 1, 'brown');
        lowpass(b, sr, 380);
        const am = smoothRandom(r, sr, n, 5);
        for (let i = 0; i < n; i++) b[i] *= (0.65 + 0.35 * am[i]) * Math.sin(Math.PI * (i / n));
        mix(out, b, 0, 0.35);
        crackle(out, sr, r, 0.02, dur * 0.9, { rate: 16, amp: 0.9, fLo: 1200, fHi: 5000 });
        peakEq(out, sr, r.range(500, 700), 3, 5);
        return out;
      },
    },

    // ---------------- liquids ----------------
    'liquid.splash': {
      cat: 'players',
      n: 3,
      level: 0.8,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 1.5);
        splash(out, sr, r, 0.003, r.range(1.3, 1.6), 1);
        return out;
      },
    },
    'entity.generic.splash': {
      cat: 'players',
      n: 3,
      level: 0.7,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 1.2);
        splash(out, sr, r, 0.003, r.range(0.8, 1.0), 1);
        return out;
      },
    },
    'liquid.swim': {
      cat: 'players',
      n: 4,
      level: 0.4,
      pv: 0.12,
      gen: (sr, r) => {
        const out = alloc(sr, 0.75);
        slosh(out, sr, r, 0.005, r.range(0.45, 0.6), 1);
        return out;
      },
    },
    'liquid.lavapop': {
      cat: 'blocks',
      n: 3,
      level: 0.5,
      pv: 0.12,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        lavaPop(out, sr, r, 0.003, 1);
        return out;
      },
    },
    'bucket.fill': {
      cat: 'players',
      n: 3,
      level: 0.6,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.8);
        metalClank(out, sr, r, 0.003, r.range(420, 560), 0.2, 0.3);
        slosh(out, sr, r, 0.02, 0.5, 0.9);
        // rising container resonance as it fills
        const n = Math.round(0.5 * sr);
        const b = new Float32Array(n);
        addNoise(b, r, 0, n, 1, 'pink');
        sweep(b, sr, 'bp', [0, 500, 0.5, 1100], 6);
        for (let i = 0; i < n; i++) b[i] *= Math.sin((Math.PI * i) / n);
        mix(out, b, Math.round(0.03 * sr), 0.35);
        bubbles(out, sr, r, 0.03, 0.5, 120, 500, 1800, 0.18, 0.3);
        return out;
      },
    },
    'bucket.empty': {
      cat: 'players',
      n: 3,
      level: 0.6,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 1.0);
        metalClank(out, sr, r, 0.003, r.range(420, 560), 0.2, 0.25);
        slosh(out, sr, r, 0.01, 0.3, 0.6);
        splash(out, sr, r, 0.12, 0.7, 0.8);
        return out;
      },
    },
    'random.fizz': {
      cat: 'blocks',
      n: 3,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.9);
        sizzle(out, sr, r, 0.003, r.range(0.55, 0.75), 1, 1.1);
        crackle(out, sr, r, 0.005, 0.4, { rate: 40, amp: 0.25 });
        return out;
      },
    },
    'entity.generic.burn': {
      cat: 'players',
      n: 3,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.55);
        sizzle(out, sr, r, 0.003, r.range(0.3, 0.45), 0.8, 0.9);
        crackle(out, sr, r, 0.005, 0.35, { rate: 35, amp: 0.4 });
        return out;
      },
    },
    'entity.generic.extinguish': {
      cat: 'players',
      n: 3,
      level: 0.6,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 1.1);
        sizzle(out, sr, r, 0.003, r.range(0.8, 1.0), 1, 1.2);
        whoosh(out, sr, r, 0.003, 0.7, { f: [0, 6000, 1, 3500], amp: [0, 0, 0.05, 1, 1, 0], q: 0.8, gain: 0.3 });
        return out;
      },
    },
    'entity.generic.small_fall': {
      cat: 'players',
      n: 3,
      level: 0.6,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        bodyThud(out, sr, r, 0.003, 1, 1);
        return out;
      },
    },
    'entity.generic.big_fall': {
      cat: 'players',
      n: 3,
      level: 0.8,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        bodyThud(out, sr, r, 0.003, 1.6, 1);
        clicks(out, sr, r, { t0: 0.003, t1: 0.05, rate: 300, fLo: 900, fHi: 3500, t60Lo: 0.006, t60Hi: 0.02, amp: 0.5 });
        return out;
      },
    },

    // ---------------- player ----------------
    'game.player.hurt': {
      cat: 'players',
      n: 3,
      level: 0.8,
      pv: 0.07,
      gen: (sr, r) => {
        const dur = r.range(0.2, 0.26);
        const out = alloc(sr, dur + 0.12);
        const f = r.range(195, 225);
        voice(out, sr, r, 0.006, {
          dur,
          f0: [0, f, 0.04, f * 1.08, dur, f * 0.6],
          amp: [0, 0, 0.012, 1, dur * 0.55, 0.7, dur, 0],
          vowel: r.chance(0.5) ? [0, 'uh', dur * 0.5, 'U', dur, 'u'] : [0, 'U', dur, 'u'],
          scale: 1.0,
          tilt: 1.3,
          breath: [0, 0.5, 0.03, 0.12, dur, 0.4],
          rough: 0.15,
          jitter: 0.01,
          maxHz: 6500,
        });
        burst(out, sr, r, 0.002, 0.006, 0.25, 200, 1500);
        thump(out, sr, 0.002, 130, 80, 0.06, 0.25);
        return out;
      },
    },
    'game.player.die': {
      cat: 'players',
      n: 2,
      level: 0.85,
      gen: (sr, r) => {
        const dur = r.range(0.55, 0.7);
        const out = alloc(sr, dur + 0.15);
        voice(out, sr, r, 0.006, {
          dur,
          f0: [0, 175, 0.08, 190, dur, 105],
          amp: [0, 0, 0.015, 1, dur * 0.6, 0.7, dur, 0],
          vowel: [0, 'uh', dur * 0.4, 'o', dur, 'u'],
          scale: 1.0,
          tilt: 1.4,
          breath: [0, 0.4, 0.05, 0.15, dur * 0.7, 0.2, dur, 0.7],
          rough: [0, 0.15, dur, 0.5],
          jitter: 0.015,
        });
        return out;
      },
    },
    'game.player.hurt.fall.small': {
      cat: 'players',
      n: 3,
      level: 0.6,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        bodyThud(out, sr, r, 0.003, 1, 1);
        return out;
      },
    },
    'game.player.hurt.fall.big': {
      cat: 'players',
      n: 3,
      level: 0.85,
      pv: 0.07,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        bodyThud(out, sr, r, 0.003, 1.7, 1);
        clicks(out, sr, r, { t0: 0.004, t1: 0.06, rate: 350, fLo: 900, fHi: 3500, t60Lo: 0.006, t60Hi: 0.02, amp: 0.6 });
        burst(out, sr, r, 0.004, 0.03, 0.4, 600, 3500);
        return out;
      },
    },
    'game.player.attack.strong': {
      cat: 'players',
      n: 4,
      level: 0.7,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        swish(out, sr, r, 0.002, r.range(0.1, 0.14), r.range(1300, 1700), 0.6);
        attackHit(out, sr, r, r.range(0.055, 0.075), 1, 1);
        return out;
      },
    },
    'game.player.attack.weak': {
      cat: 'players',
      n: 3,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.3);
        swish(out, sr, r, 0.002, r.range(0.08, 0.11), r.range(1000, 1300), 0.4);
        attackHit(out, sr, r, r.range(0.045, 0.06), 0.45, 0.7);
        return out;
      },
    },
    'game.player.attack.sweep': {
      cat: 'players',
      n: 3,
      level: 0.65,
      pv: 0.07,
      gen: (sr, r) => {
        const out = alloc(sr, 0.5);
        const d = r.range(0.28, 0.36);
        swish(out, sr, r, 0.002, d, r.range(1500, 2000), 1, 1.4);
        whoosh(out, sr, r, 0.03, d * 0.8, { f: [0, 2500, 0.5, 4200, 1, 2000], amp: [0, 0, 0.4, 1, 1, 0], q: 5, gain: 0.2 });
        return out;
      },
    },
    'game.player.attack.crit': {
      cat: 'players',
      n: 3,
      level: 0.75,
      pv: 0.07,
      gen: (sr, r) => {
        const out = alloc(sr, 0.45);
        swish(out, sr, r, 0.002, 0.1, 1700, 0.5);
        const t = 0.06;
        attackHit(out, sr, r, t, 1.1, 0.9);
        burst(out, sr, r, t, 0.006, 0.8, 3000, 14000);
        sparkle(out, sr, r, t, t + 0.12, 220, 0.25, 4000, 11000);
        softClip(out, 1.5);
        return out;
      },
    },
    'game.player.attack.nodamage': {
      cat: 'players',
      n: 3,
      level: 0.4,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.3);
        swish(out, sr, r, 0.002, r.range(0.12, 0.16), r.range(800, 1100), 0.6, 1.2);
        burst(out, sr, r, 0.07, 0.03, 0.2, 150, 1200);
        return out;
      },
    },
    'item.shield.block': {
      cat: 'players',
      n: 3,
      level: 0.7,
      pv: 0.07,
      gen: (sr, r) => {
        const out = alloc(sr, 0.7);
        woodKnock(out, sr, r, 0.003, r.range(120, 170), 0.12, 1);
        thump(out, sr, 0.003, 140, 80, 0.1, 0.6);
        metalClank(out, sr, r, 0.004, r.range(380, 560), 0.35, 0.4);
        return out;
      },
    },
    'item.armor.equip': {
      cat: 'players',
      n: 3,
      level: 0.5,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.5);
        clicks(out, sr, r, { t0: 0.004, t1: 0.25, rate: (t) => 400 * Math.exp(-t / 0.1), fLo: 2000, fHi: 7000, t60Lo: 0.02, t60Hi: 0.07, amp: 0.6, modes: 3 });
        grains(out, sr, r, { t0: 0.004, t1: 0.3, rate: 900, fLo: 300, fHi: 3000, q: 0.9, durLo: 0.004, durHi: 0.02, amp: 0.3 });
        metalClank(out, sr, r, 0.01, r.range(700, 1000), 0.1, 0.2);
        return out;
      },
    },

    // ---------------- tools ----------------
    'item.hoe.till': {
      cat: 'blocks',
      n: 3,
      level: 0.6,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        whoosh(out, sr, r, 0.003, 0.25, { f: [0, 400, 0.5, 1500, 1, 600], amp: [0, 0, 0.15, 1, 1, 0], q: 0.9, gain: 0.6, pink: true });
        grains(out, sr, r, { t0: 0.003, t1: 0.22, rate: 1300, fLo: 400, fHi: 2500, q: 1.4, amp: 0.6 });
        thump(out, sr, 0.003, 130, 85, 0.07, 0.5);
        clicks(out, sr, r, { t0: 0.01, t1: 0.15, rate: 60, fLo: 1500, fHi: 4500, t60Lo: 0.005, t60Hi: 0.015, amp: 0.3 });
        return out;
      },
    },
    'item.shears.use': {
      cat: 'players',
      n: 3,
      level: 0.5,
      pv: 0.07,
      gen: (sr, r) => {
        const out = alloc(sr, 0.25);
        whoosh(out, sr, r, 0.002, 0.035, { f: [0, 2500, 1, 6500], amp: [0, 0, 0.5, 1, 1, 0], q: 2, gain: 0.4 });
        burst(out, sr, r, 0.032, 0.008, 0.7, 3000, 12000);
        strike(out, sr, 0.032, randomModes(r, 4, 2500, 7000, 0.03, 0.08, { tilt: 0.2 }), 0.5);
        return out;
      },
    },
    'item.bonemeal.use': {
      cat: 'players',
      n: 3,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.5);
        grains(out, sr, r, { t0: 0.003, t1: 0.3, rate: (t) => 2200 * Math.exp(-t / 0.1), fLo: 2000, fHi: 9000, q: 1.2, amp: 0.55 });
        grains(out, sr, r, { t0: 0.003, t1: 0.12, rate: 700, fLo: 800, fHi: 3000, q: 1.5, amp: 0.4 });
        sparkle(out, sr, r, 0.02, 0.35, 45, 0.25, 5000, 10000);
        return out;
      },
    },
    'item.fishing.cast': {
      cat: 'players',
      n: 2,
      level: 0.5,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.8);
        swish(out, sr, r, 0.002, 0.22, 1200, 0.7);
        whoosh(out, sr, r, 0.1, 0.55, { f: [0, 4800, 1, 2600], amp: [0, 0, 0.1, 1, 1, 0], q: 9, gain: 0.25 });
        for (let t = 0.12; t < 0.5; t += r.range(0.03, 0.045)) ping(out, sr, t, r.range(1600, 2600), 0.008, 0.15);
        return out;
      },
    },
    'item.fishing.bobber_splash': {
      cat: 'players',
      n: 3,
      level: 0.55,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.6);
        splash(out, sr, r, 0.003, r.range(0.3, 0.4), 0.9);
        bubble(out, sr, 0.01, r.range(450, 600), 0.4, 0.2);
        return out;
      },
    },
    'item.fishing.retrieve': {
      cat: 'players',
      n: 2,
      level: 0.45,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 0.55);
        for (let t = 0.003; t < 0.38; t += r.range(0.018, 0.026)) {
          ping(out, sr, t, r.range(1800, 2800), 0.006, 0.3);
          burst(out, sr, r, t, 0.0015, 0.15, 2000, 8000);
        }
        swish(out, sr, r, 0.05, 0.3, 1600, 0.3);
        bubbles(out, sr, r, 0.25, 0.45, 40, 800, 2500, 0.1);
        return out;
      },
    },

    // ---------------- throwables & potions ----------------
    'entity.splash_potion.throw': {
      cat: 'players',
      n: 2,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.4);
        swish(out, sr, r, 0.002, 0.28, 1100, 0.8);
        return out;
      },
    },
    'entity.splash_potion.break': {
      cat: 'players',
      n: 3,
      level: 0.7,
      pv: 0.08,
      gen: (sr, r) => {
        const out = alloc(sr, 1.0);
        shatter(out, sr, r, 0.003, 0.6, 0.85);
        splash(out, sr, r, 0.01, 0.35, 0.5);
        return out;
      },
    },
    'entity.ender_pearl.throw': {
      cat: 'players',
      n: 2,
      level: 0.5,
      pv: 0.1,
      gen: (sr, r) => {
        const out = alloc(sr, 0.45);
        swish(out, sr, r, 0.002, 0.3, 1300, 0.8);
        sparkle(out, sr, r, 0.05, 0.3, 20, 0.12, 3000, 7000);
        return out;
      },
    },
    'entity.ender_eye.launch': {
      cat: 'players',
      n: 2,
      level: 0.6,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 1.0);
        whoosh(out, sr, r, 0.002, 0.65, { f: [0, 400, 1, 3200], amp: [0, 0, 0.3, 1, 1, 0], q: 2, gain: 0.7 });
        thump(out, sr, 0.002, 140, 70, 0.15, 0.4);
        const root = r.pick([79, 81, 84]);
        for (let i = 0; i < 4; i++) chime(out, sr, 0.05 + i * 0.07, midiHz(root + [0, 5, 7, 12][i]), 0.18, 0.6, [1, 2.76, 5.4], [1, 0.3, 0.1]);
        return reverbMono(out, sr, { t60: 1.2, size: 0.9, damp: 0.3, wet: 0.3, tail: 0.3 });
      },
    },
    'entity.ender_eye.death': {
      cat: 'players',
      n: 2,
      level: 0.6,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 0.9);
        shatter(out, sr, r, 0.003, 0.4, 0.6);
        bubble(out, sr, 0.003, r.range(600, 800), 0.5, 0.3);
        sparkle(out, sr, r, 0.01, 0.5, 40, 0.2);
        return out;
      },
    },

    // ---------------- anvils, enchanting, brewing ----------------
    'random.anvil_use': {
      cat: 'blocks',
      n: 3,
      level: 0.6,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 1.4);
        const f = r.range(620, 880);
        strike(out, sr, 0.003, ratioModes(f, BAR, 1.1, { tilt: 0.5, decayTilt: 0.5, contact: 0.00008 }), 1);
        strike(out, sr, 0.003, ratioModes(f * 1.63, PLATE, 0.6, { tilt: 0.6, jitter: 0.02, r }), 0.4);
        burst(out, sr, r, 0.003, 0.003, 0.6, 2000, 12000);
        if (r.chance(0.6)) strike(out, sr, r.range(0.18, 0.26), ratioModes(f, BAR, 0.8, { tilt: 0.5 }), 0.35);
        return out;
      },
    },
    'random.anvil_land': {
      cat: 'blocks',
      n: 2,
      level: 0.9,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 2.2);
        const f = r.range(380, 520);
        strike(out, sr, 0.003, ratioModes(f, BAR, 1.9, { tilt: 0.45, decayTilt: 0.45 }), 1);
        strike(out, sr, 0.003, ratioModes(f * 1.71, PLATE, 1.1, { tilt: 0.55, jitter: 0.02, r }), 0.55);
        thump(out, sr, 0.003, 110, 55, 0.2, 0.9);
        burst(out, sr, r, 0.003, 0.006, 0.8, 1200, 12000);
        debris(out, sr, r, 0.01, 0.4, { amp: 0.25, fLo: 600, fHi: 4000, hard: 0.6, t60: 0.02 });
        return out;
      },
    },
    'block.enchantment_table.use': {
      cat: 'blocks',
      n: 3,
      level: 0.55,
      pv: 0.05,
      gen: (sr, r) => {
        const out = alloc(sr, 1.8);
        whoosh(out, sr, r, 0.003, 1.3, { f: [0, 1500, 0.7, 6000, 1, 4000], amp: [0, 0, 0.4, 1, 1, 0], q: 1.4, gain: 0.45 });
        sparkle(out, sr, r, 0.05, 1.3, 50, 0.4, 3000, 10000);
        const root = r.pick([72, 74, 76]);
        for (let i = 0; i < 3; i++) chime(out, sr, 0.15 + i * 0.12, midiHz(root + [0, 7, 14][i]), 0.15, 1.2, [1, 2.0, 3.0], [1, 0.2, 0.05]);
        grains(out, sr, r, { t0: 0.02, t1: 0.5, rate: 300, fLo: 1000, fHi: 4000, q: 0.9, durLo: 0.005, durHi: 0.02, amp: 0.15 });
        return reverbMono(out, sr, { t60: 1.6, size: 1, damp: 0.25, wet: 0.35, tail: 0.3 });
      },
    },
    'block.brewing_stand.brew': {
      cat: 'blocks',
      n: 3,
      level: 0.5,
      pv: 0.06,
      gen: (sr, r) => {
        const out = alloc(sr, 1.6);
        bubbles(out, sr, r, 0.01, 1.3, 70, 600, 2600, 0.5, 0.25);
        for (let i = 0; i < 3; i++) ping(out, sr, r.range(0.05, 1.2), r.range(3000, 5500), 0.12, 0.15);
        slosh(out, sr, r, 0.02, 0.6, 0.35);
        sparkle(out, sr, r, 0.1, 1.2, 12, 0.12, 5000, 10000);
        return out;
      },
    },
  };
}

