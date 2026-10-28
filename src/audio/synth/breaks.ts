// Procedural breakage generators (pure): shattering glass/ceramic, tempered-glass dicing,
// wood cracking/snapping/splintering, drywall punch-through and crumble, concrete chips,
// metal dents/tears/clangs, plastic cracks, fastener failures, crack crackles and tears.
// Each generator returns an un-normalised mono Float32Array; the bank normalises loudness.

import type { Rng } from "../../core/rng.ts";
import {
  Biquad,
  Noise,
  addMode,
  addModes,
  addNoiseBurst,
  addThump,
  bounces,
  buf,
  clamp,
  fadeOut,
  peakOf,
  poisson,
  resonate,
  stickSlip,
  type Resonance,
} from "./dsp.ts";
import { MODAL, addTickInto, addTink, impactModes, synthRattle } from "./modal.ts";

export interface G {
  sr: number;
  rng: Rng;
  noise: Noise;
}

const CERAMIC_R = [1, 2.75, 5.2] as const;
const CERAMIC_A = [1, 0.6, 0.35] as const;

/** Filtered noise shaped by an envelope function (evaluated per 32-sample block). */
export function noiseBed(g: G, dur: number, env: (t: number) => number, filt: { hp?: number; lp?: number; bp?: number; q?: number }, grit = 0): Float32Array {
  const { sr, noise } = g;
  const out = buf(sr, dur);
  const fs: Biquad[] = [];
  if (filt.hp) fs.push(new Biquad().highpass(sr, filt.hp));
  if (filt.lp) fs.push(new Biquad().lowpass(sr, filt.lp));
  if (filt.bp) fs.push(new Biquad().bandpass(sr, filt.bp, filt.q ?? 1));
  const nf = fs.length;
  let gr = 1;
  let e0 = env(0);
  let e1 = e0;
  for (let i = 0; i < out.length; i++) {
    if ((i & 31) === 0) {
      e0 = e1;
      e1 = env((i + 32) / sr);
    }
    let x = noise.white();
    if (grit > 0) {
      if (noise.u() < 0.03) gr = 0.2 + noise.u() * 1.8 * grit + (1 - grit);
      x *= gr;
    }
    for (let k = 0; k < nf; k++) x = fs[k].process(x);
    out[i] = x * (e0 + ((e1 - e0) * (i & 31)) / 32);
  }
  return out;
}

function mix(dst: Float32Array, src: Float32Array, at = 0, gain = 1): void {
  const s = Math.round(at);
  const end = Math.min(dst.length, s + src.length);
  for (let i = Math.max(0, s); i < end; i++) dst[i] += src[i - s] * gain;
}

/** Resonant wood "click": an impulse ringing 3 wood-body resonances (fibre failure). */
function woodClick(out: Float32Array, t: number, g: G, amp: number, bright = 1): void {
  const { sr, rng, noise } = g;
  const n0 = t * sr;
  const base = rng.range(380, 900) * bright;
  for (let k = 0; k < 3; k++) {
    const f = base * [1, 2.3, 3.9][k] * rng.range(0.92, 1.08);
    addMode(out, n0, sr, f, amp * [1, 0.6, 0.35][k], rng.range(45, 110) + f * 0.02, 0);
  }
  addNoiseBurst(out, n0, sr, noise, amp * 0.7, { attack: 0.0001, decay: 0.0009, hp: 700 * bright });
}

/** Gypsum/concrete crumb: a dull damped click. */
function crumb(out: Float32Array, t: number, g: G, amp: number, fLo: number, fHi: number): void {
  const { sr, rng, noise } = g;
  const f = noise.logRange(fLo, fHi);
  addMode(out, t * sr, sr, f, amp * 0.6, rng.range(180, 420), 0);
  addNoiseBurst(out, t * sr, sr, noise, amp * 0.9, { attack: 0.0002, decay: rng.range(0.0015, 0.004), bp: f * 1.8, q: 0.6 });
}

// ======================================================================= glass

/**
 * Annealed glass shatter. Large = window pane falling from sill/head height (0.9–2.2 m):
 * crack transient + pane "whump", fragmentation burst of high tinkles and bright noise, then
 * the physically timed floor-impact cluster (t = √(2h/g) ≈ 0.43–0.67 s) and settling tail.
 * Small = glassware smashed near the floor: everything lands at once.
 */
export function shatterGlass(g: G, large: boolean): Float32Array {
  const { sr, rng, noise } = g;
  const dur = large ? rng.range(1.45, 1.7) : rng.range(0.75, 0.95);
  const out = buf(sr, dur);
  // 1. Crack: a crisp broadband click with a few high glints.
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.0001, decay: 0.0016, hp: 1800 });
  for (let i = 0; i < 5; i++) addTink(out, rng.range(0, 0.005) * sr, sr, rng.range(4500, 9500), 0.22, 7);
  if (large) {
    // Low plate modes of the pane at the moment it lets go.
    addModes(out, 0, sr, [
      { f: rng.range(105, 160), a: 0.55, alpha: 28 },
      { f: rng.range(230, 330), a: 0.38, alpha: 38 },
      { f: rng.range(420, 620), a: 0.25, alpha: 55 },
    ]);
  }
  // 2. Fragmentation burst (0–180 ms).
  addNoiseBurst(out, 0.002 * sr, sr, noise, 0.5, { attack: 0.003, decay: large ? 0.06 : 0.035, bp: 5500, q: 0.6, grit: 0.5 });
  const nBurst = large ? rng.int(18, 28) : rng.int(10, 16);
  for (let i = 0; i < nBurst; i++) {
    const t = Math.min(noise.exp(0.035), 0.18);
    addTink(out, t * sr, sr, noise.logRange(3500, 10500), 0.06 + 0.3 * rng.next() ** 2, rng.range(3, 6));
  }
  // 3. Floor impacts: shards land (with bounces), bigger shards lower and louder.
  const fallLo = large ? 0.42 : 0.0;
  const fallHi = large ? 0.68 : 0.07;
  const nFloor = large ? rng.int(48, 72) : rng.int(18, 28);
  for (let i = 0; i < nFloor; i++) {
    const size = noise.logRange(0.008, large ? 0.25 : 0.07);
    const t = Math.min(rng.range(fallLo, fallHi) + (rng.chance(0.15) ? rng.range(0, 0.25) : 0), dur - 0.2);
    const f = clamp(2600 * Math.pow(0.05 / size, 0.6), 1400, 11500) * rng.range(0.9, 1.1);
    const amp = (0.08 + 0.5 * Math.pow(size / 0.25, 0.6)) * rng.range(0.5, 1);
    for (const [bt, ba] of bounces(rng.range(1.4, 3.0), rng.range(0.22, 0.4), 3, 0.35)) {
      if (t + bt > dur - 0.05) break;
      addTink(out, (t + bt) * sr, sr, f * (1 + 0.02 * rng.gauss()), amp * ba, rng.range(2.5, 5));
    }
  }
  mix(out, noiseBed(g, dur, (t) => (t < fallLo ? 0 : Math.exp(-Math.max(0, t - fallLo - (fallHi - fallLo) * 0.5) / 0.09) * Math.min(1, (t - fallLo) / 0.04)), { bp: 4200, q: 0.5 }, 0.85), 0, 0.3);
  // 4. Settling tail: sparse small tinkles.
  poisson(noise, dur - 0.15, 40, (t) => (t > fallHi ? 30 * Math.exp(-(t - fallHi) / 0.35) : 0), (t) => addTink(out, t * sr, sr, noise.logRange(4000, 11000), 0.04 + 0.09 * rng.next(), 4));
  fadeOut(out, sr, 0.08);
  return out;
}

/**
 * Tempered glass dicing: a loud bang, a crazing crackle as the pane turns into cubes, then a
 * dense granular shower of hundreds of cubes hitting the floor (peak ≈ 0.45 s) and a tail.
 */
export function shatterTempered(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(1.7, 2.0);
  const out = buf(sr, dur);
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.0001, decay: 0.004, hp: 600 });
  addNoiseBurst(out, 0, sr, noise, 0.6, { attack: 0.001, decay: 0.035, hp: 400, lp: 9000, grit: 0.3 });
  addThump(out, 0, sr, rng.range(80, 120), 0.3, 0.04, 0.6, 0.008);
  const grain = (t: number, amp: number) => {
    const f = noise.logRange(2500, 9500);
    const a = rng.range(120, 320);
    addMode(out, t * sr, sr, f, amp, a, 0);
    const f2 = f * rng.range(2.1, 2.5);
    if (f2 < 16000) addMode(out, t * sr, sr, f2, amp * 0.45, a * 1.4, 0);
  };
  // Crazing crackle: the pane crazes almost instantly, cubes grind as the sheet collapses.
  poisson(noise, 0.4, 3500, (t) => 3000 * Math.exp(-t / 0.07) + 120, (t) => grain(t, 0.03 + 0.08 * rng.next() ** 2));
  // Shower: cubes falling from up to ~2 m land around 0.25–0.7 s, bounce, scatter.
  const peak = rng.range(0.42, 0.5);
  const dens = (t: number) => (t < 0.2 ? 0 : 2600 * Math.exp(-(((t - peak) / 0.12) ** 2)) + 700 * Math.exp(-Math.max(0, t - peak) / 0.35) * (t > peak ? 1 : (t - 0.2) / (peak - 0.2)));
  poisson(noise, dur - 0.15, 3400, dens, (t) => grain(t, 0.025 + 0.12 * rng.next() ** 2));
  mix(out, noiseBed(g, dur, (t) => dens(t) / 3300, { bp: 4500, q: 0.45 }, 0.9), 0, 0.22);
  fadeOut(out, sr, 0.1);
  return out;
}

// ======================================================================= ceramic

/** Ceramic shatter: crack, the object's own ring cut short, chunk clinks and a rattle. */
export function shatterCeramic(g: G, large: boolean): Float32Array {
  const { sr, rng, noise } = g;
  const dur = large ? rng.range(1.15, 1.4) : rng.range(0.6, 0.8);
  const out = buf(sr, dur);
  addNoiseBurst(out, 0, sr, noise, 0.9, { attack: 0.0001, decay: 0.002, hp: 900 });
  const body = impactModes(sr, rng, MODAL.ceramic, large ? rng.range(0.4, 0.7) : rng.range(0.07, 0.14), { alphaMul: 3.5 });
  let sumA = 0;
  for (const m of body) sumA += m.a;
  addModes(out, 0, sr, body, 0.7 / Math.max(sumA, 1e-3));
  addNoiseBurst(out, 0.001 * sr, sr, noise, large ? 0.6 : 0.35, { attack: 0.002, decay: large ? 0.05 : 0.025, bp: large ? 1800 : 3000, q: 0.7, grit: 0.8 });
  const n = large ? rng.int(10, 16) : rng.int(6, 12);
  for (let i = 0; i < n; i++) {
    const size = noise.logRange(0.012, large ? 0.22 : 0.06);
    const t0 = large ? rng.range(0.01, 0.3) : rng.range(0, 0.1);
    const f = clamp(750 * Math.pow(0.3 / size, 0.75), 400, 9000);
    const amp = (0.12 + 0.6 * Math.pow(size / 0.2, 0.7)) * rng.range(0.5, 1);
    const alphaMul = size > 0.08 ? 2 : 3.5;
    for (const [bt, ba] of bounces(rng.range(1.0, 2.6), rng.range(0.22, 0.38), 4, 0.25)) {
      if (t0 + bt > dur - 0.05) break;
      addTink(out, (t0 + bt) * sr, sr, f * (1 + 0.02 * rng.gauss()), amp * ba, alphaMul, CERAMIC_R, CERAMIC_A);
      addNoiseBurst(out, (t0 + bt) * sr, sr, noise, amp * ba * 0.25, { attack: 0.0001, decay: 0.0015, hp: 1200 });
    }
  }
  if (large) for (let i = 0; i < rng.int(2, 4); i++) addThump(out, rng.range(0.02, 0.25) * sr, sr, rng.range(110, 220), rng.range(0.25, 0.45), 0.03, 0.3, 0.008);
  mix(out, noiseBed(g, dur, (t) => Math.exp(-t / (large ? 0.18 : 0.1)) * Math.min(1, t / 0.005), { hp: 1500 }, 0.9), 0, 0.08);
  fadeOut(out, sr, 0.06);
  return out;
}

// ======================================================================= wood

/** Wood cracking under load: accelerating train of fibre-failure clicks over a faint creak. */
export function woodCrack(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.4, 0.65);
  const out = buf(sr, dur);
  const n = rng.int(10, 26);
  let t = 0.01;
  let iv = rng.range(0.03, 0.05);
  for (let i = 0; i < n && t < dur - 0.1; i++) {
    const prog = i / n;
    woodClick(out, t, g, 0.15 + 0.7 * prog ** 1.5 * rng.range(0.6, 1), rng.range(0.8, 1.4));
    t += iv * rng.range(0.5, 1.5);
    iv = Math.max(0.004, iv * rng.range(0.78, 0.95));
  }
  woodClick(out, t, g, 1, 1.1); // final crack
  const creak = stickSlip(sr, noise, dur * 0.8, (x) => 70 + 60 * x / dur + 15 * Math.sin(x * 23), (x) => 0.25 * Math.sin((Math.PI * x) / (dur * 0.8)), 0.12);
  resonate(out, 0, sr, creak, [
    { f: rng.range(350, 500), q: 12, g: 1 },
    { f: rng.range(800, 1100), q: 14, g: 0.6 },
    { f: rng.range(1500, 2100), q: 16, g: 0.3 },
  ], 0.5, 0.1);
  fadeOut(out, sr, 0.05);
  return out;
}

/** Full snap of a board/leg: pre-crackle, violent SNAP with body resonance + thump, splinters. */
export function woodSnap(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.55, 0.8);
  const out = buf(sr, dur);
  const tS = rng.range(0.04, 0.07);
  for (let i = 0; i < rng.int(3, 8); i++) woodClick(out, rng.range(0, tS - 0.004), g, rng.range(0.08, 0.3), rng.range(0.9, 1.4));
  addNoiseBurst(out, tS * sr, sr, noise, 1.0, { attack: 0.0001, decay: 0.003, hp: 400 });
  addModes(out, tS * sr, sr, [
    { f: rng.range(280, 420), a: 0.7, alpha: rng.range(18, 30) },
    { f: rng.range(650, 900), a: 0.7, alpha: rng.range(30, 45) },
    { f: rng.range(1300, 1800), a: 0.55, alpha: rng.range(45, 70) },
    { f: rng.range(2400, 3200), a: 0.35, alpha: rng.range(70, 110) },
  ]);
  addThump(out, tS * sr, sr, rng.range(85, 150), 0.45, 0.04, 0.4, 0.01);
  let t = tS + 0.01;
  for (let i = 0; i < rng.int(10, 24) && t < dur - 0.05; i++) {
    woodClick(out, t, g, 0.45 * Math.exp(-(t - tS) / 0.12) * rng.range(0.3, 1), rng.range(1, 1.8));
    t += noise.exp(0.018);
  }
  for (let i = 0; i < rng.int(1, 3); i++) addTickInto(out, rng.range(0.25, dur - 0.1) * sr, sr, rng, noise, MODAL.wood, rng.range(0.015, 0.04), rng.range(0.1, 0.25));
  fadeOut(out, sr, 0.06);
  return out;
}

/** Splintering breakout (axe, hammer through a panel): dense fibrous crackle + crunch. */
export function woodSplinter(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.35, 0.55);
  const out = buf(sr, dur);
  addNoiseBurst(out, 0, sr, noise, 0.7, { attack: 0.0001, decay: 0.002, hp: 400 });
  addThump(out, 0, sr, rng.range(110, 180), 0.45, 0.03, 0.3, 0.008);
  addNoiseBurst(out, 0.002 * sr, sr, noise, 0.45, { attack: 0.003, decay: 0.05, bp: rng.range(1400, 2600), q: 0.8, grit: 0.85 });
  const n = rng.int(25, 60);
  for (let i = 0; i < n; i++) {
    const t = Math.min(noise.exp(0.07), dur - 0.06);
    woodClick(out, t, g, rng.range(0.08, 0.45) * Math.exp(-t / 0.15), rng.range(1, 2));
  }
  fadeOut(out, sr, 0.05);
  return out;
}

// ======================================================================= drywall / plaster

/**
 * Drywall punch-through: dull thud of the sheet, crunchy gypsum-core fracture, paper face
 * tearing, chunks crumbling into the stud cavity and a soft dust hiss.
 */
export function drywallPunch(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.75, 1.0);
  const out = buf(sr, dur);
  addThump(out, 0, sr, rng.range(85, 130), 1.0, 0.04, 0.35, 0.01);
  addNoiseBurst(out, 0, sr, noise, 0.85, { attack: 0.001, decay: rng.range(0.05, 0.08), bp: rng.range(700, 1300), q: 0.55, grit: 0.85 });
  addNoiseBurst(out, rng.range(0.002, 0.008) * sr, sr, noise, 0.25, { attack: 0.002, decay: 0.02, bp: rng.range(3000, 4800), q: 1.2, grit: 0.6 });
  poisson(noise, dur - 0.1, 420, (t) => (t < 0.02 ? 0 : 380 * Math.exp(-(t - 0.02) / 0.2)), (t) => crumb(out, t, g, rng.range(0.02, 0.16) * Math.exp(-t / 0.45), 250, 1600));
  mix(out, noiseBed(g, dur, (t) => (t < 0.02 ? 0 : Math.exp(-(t - 0.02) / 0.22)), { bp: 900, q: 0.5 }, 0.95), 0, 0.12);
  mix(out, noiseBed(g, dur, (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.35), { hp: 2800, lp: 9000 }), 0, 0.05);
  fadeOut(out, sr, 0.06);
  return out;
}

/** A large drywall/plaster section collapsing: several thuds, heavy crumble, dust. */
export function drywallCrumble(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(1.2, 1.7);
  const out = buf(sr, dur);
  let t = 0;
  for (let i = 0; i < rng.int(2, 4); i++) {
    addThump(out, t * sr, sr, rng.range(60, 120), rng.range(0.6, 1) * (i === 0 ? 1 : 0.7), 0.05, 0.35, 0.012);
    addNoiseBurst(out, t * sr, sr, noise, rng.range(0.5, 0.8), { attack: 0.002, decay: rng.range(0.06, 0.1), bp: rng.range(600, 1200), q: 0.5, grit: 0.9 });
    t += rng.range(0.08, 0.28);
  }
  poisson(noise, dur - 0.1, 520, (x) => 480 * Math.exp(-x / 0.4), (x) => crumb(out, x, g, rng.range(0.03, 0.2) * Math.exp(-x / 0.8), 200, 1500));
  mix(out, noiseBed(g, dur, (x) => Math.exp(-x / 0.4), { bp: 800, q: 0.5 }, 0.95), 0, 0.14);
  mix(out, noiseBed(g, dur, (x) => Math.min(1, x / 0.08) * Math.exp(-x / 0.6), { hp: 2500, lp: 9000 }), 0, 0.07);
  fadeOut(out, sr, 0.1);
  return out;
}

// ======================================================================= concrete

export function concreteChip(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.3, 0.5);
  const out = buf(sr, dur);
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.0001, decay: 0.004, bp: rng.range(2200, 3800), q: 0.6, grit: 0.7 });
  const m = impactModes(sr, rng, MODAL.concrete, rng.range(0.1, 0.25), { alphaMul: 1.5 });
  addModes(out, 0, sr, m, 0.4);
  addThump(out, 0, sr, rng.range(90, 140), 0.35, 0.02, 0.3, 0.006);
  const r = synthRattle(sr, rng, noise, MODAL.concrete, rng.int(3, 8), 0.06, dur);
  mix(out, r, 0.005 * sr, 0.7 / Math.max(peakOf(r), 1e-3) * 0.5);
  fadeOut(out, sr, 0.04);
  return out;
}

export function concreteCrumble(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(1.0, 1.5);
  const out = buf(sr, dur);
  addThump(out, 0, sr, rng.range(55, 85), 1.0, 0.06, 0.4, 0.012);
  addNoiseBurst(out, 0, sr, noise, 0.8, { attack: 0.001, decay: 0.09, bp: rng.range(800, 1500), q: 0.45, grit: 0.95 });
  for (let i = 0; i < rng.int(4, 10); i++) {
    const t = rng.range(0.08, 0.6);
    const a = rng.range(0.2, 0.55);
    addThump(out, t * sr, sr, rng.range(90, 220), a, 0.02, 0.3, 0.006);
    addNoiseBurst(out, t * sr, sr, noise, a * 0.7, { attack: 0.0005, decay: 0.012, bp: rng.range(1200, 3000), q: 0.6, grit: 0.9 });
  }
  poisson(noise, dur - 0.05, 300, (x) => 260 * Math.exp(-x / 0.4), (x) => crumb(out, x, g, rng.range(0.03, 0.15) * Math.exp(-x / 0.7), 900, 4200));
  mix(out, noiseBed(g, dur, (x) => Math.min(1, x / 0.1) * Math.exp(-x / 0.55), { hp: 2200, lp: 8000 }), 0, 0.06);
  fadeOut(out, sr, 0.1);
  return out;
}

// ======================================================================= metal

function sheetBank(g: G, n: number, lo: number, hi: number, qLo = 25, qHi = 70): Resonance[] {
  const { rng, noise } = g;
  const b: Resonance[] = [];
  for (let i = 0; i < n; i++) b.push({ f: noise.logRange(lo, hi), q: rng.range(qLo, qHi), g: rng.range(0.4, 1) });
  return b;
}

/** Sheet-metal dent crunch: noise bursts through sheet resonances + an oil-can pop. */
export function metalDent(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.35, 0.6);
  const out = buf(sr, dur);
  const exc = buf(sr, 0.2);
  let t = 0;
  for (let i = 0; i < rng.int(3, 7); i++) {
    const len = rng.range(0.004, 0.025);
    const a = rng.range(0.4, 1) * (i === 0 ? 1 : 0.8);
    const s = Math.floor(t * sr);
    const n = Math.floor(len * sr);
    for (let k = 0; k < n && s + k < exc.length; k++) exc[s + k] += noise.white() * a * Math.sin((Math.PI * k) / n);
    t += rng.range(0.006, 0.03);
  }
  resonate(out, 0, sr, exc, sheetBank(g, rng.int(6, 10), 250, 3500), 2.2, 0.35);
  addNoiseBurst(out, 0, sr, noise, 0.35, { attack: 0.0002, decay: 0.012, hp: 900, grit: 0.7 });
  const tp = rng.range(0.01, 0.06);
  addNoiseBurst(out, tp * sr, sr, noise, 0.4, { attack: 0.0001, decay: 0.0015, hp: 2000 });
  addMode(out, tp * sr, sr, rng.range(90, 220), 0.18, rng.range(18, 30), 0);
  fadeOut(out, sr, 0.06);
  return out;
}

/** Thin sheet tearing: stick-slip squeal + ripping noise + release ping. */
export function metalTear(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.45, 0.75);
  const out = buf(sr, dur);
  const d = dur - 0.12;
  const f0 = rng.range(700, 1100);
  const f1 = rng.range(1600, 2600);
  const sl = stickSlip(sr, noise, d, (t) => f0 + (f1 - f0) * (t / d) + 120 * Math.sin(t * 40), (t) => Math.sin((Math.PI * t) / d) ** 0.6, 0.06, 0.3);
  resonate(out, 0, sr, sl, sheetBank(g, 6, 1200, 6000, 20, 50), 0.6, 0.2);
  mix(out, noiseBed(g, d, (t) => 0.6 * Math.sin((Math.PI * t) / d) * (0.6 + 0.4 * Math.sin(t * 90)), { bp: rng.range(2500, 4500), q: 0.7 }, 0.9), 0, 0.5);
  addMode(out, d * sr, sr, rng.range(1800, 3200), 0.35, 12, 0);
  addMode(out, d * sr, sr, rng.range(4500, 6500), 0.2, 20, 0);
  fadeOut(out, sr, 0.05);
  return out;
}

/** Heavy metal object clang with beating partials and a couple of secondary bounces. */
export function metalClang(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(1.8, 2.6);
  const out = buf(sr, dur);
  const p = rng.chance(0.5) ? MODAL.metal : MODAL.metalThin;
  const modes = impactModes(sr, rng, p, rng.range(0.5, 1.0));
  addModes(out, 0, sr, modes);
  const ref = Math.max(peakOf(out), 1e-3);
  addNoiseBurst(out, 0, sr, noise, ref * 0.3, { attack: 0.0001, decay: 0.003, hp: 1500 });
  addThump(out, 0, sr, rng.range(70, 110), ref * 0.4, 0.04, 0.3, 0.008);
  let t = rng.range(0.18, 0.3);
  for (let i = 0; i < rng.int(1, 3); i++) {
    const a = 0.45 / (i + 1.5);
    for (const m of modes) addMode(out, t * sr, sr, m.f * rng.range(0.995, 1.005), m.a * a * rng.range(0.5, 1.4), m.alpha * 1.4, 0);
    t += rng.range(0.08, 0.16) / (i + 1);
  }
  fadeOut(out, sr, 0.3);
  return out;
}

// ======================================================================= plastic

export function plasticCrack(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.15, 0.3);
  const out = buf(sr, dur);
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.0001, decay: 0.0012, hp: 1500 });
  for (let i = 0; i < rng.int(5, 12); i++) {
    const t = Math.min(noise.exp(0.012), 0.05);
    addMode(out, t * sr, sr, rng.range(2000, 6500), rng.range(0.1, 0.35), rng.range(400, 900), 0);
  }
  const body = impactModes(sr, rng, MODAL.plastic, rng.range(0.12, 0.3), { alphaMul: 1.4 });
  addModes(out, 0, sr, body, 0.25);
  fadeOut(out, sr, 0.03);
  return out;
}

export function plasticSnap(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.25, 0.45);
  const out = buf(sr, dur);
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.0001, decay: 0.002, hp: 900 });
  const body = impactModes(sr, rng, MODAL.plastic, rng.range(0.25, 0.5));
  addModes(out, 0, sr, body, 0.5);
  addThump(out, 0, sr, rng.range(180, 320), 0.3, 0.012, 0.3, 0.005);
  for (let i = 0; i < rng.int(1, 3); i++) {
    const t0 = rng.range(0.06, 0.18);
    const size = rng.range(0.02, 0.06);
    let modes;
    for (const [bt, ba] of bounces(rng.range(1, 2), 0.5, 4, 0.3)) {
      if (t0 + bt > dur - 0.03) break;
      modes = addTickInto(out, (t0 + bt) * sr, sr, rng, noise, MODAL.plastic, size, 0.25 * ba, modes);
    }
  }
  fadeOut(out, sr, 0.03);
  return out;
}

// ======================================================================= fasteners (bonds)

/** Screw ripping out: a thread creak then a pitched metallic ping. */
export function bondScrew(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.45);
  const cr = stickSlip(sr, noise, rng.range(0.02, 0.04), () => rng.range(500, 900), () => 0.6, 0.15);
  resonate(out, 0, sr, cr, [{ f: rng.range(1800, 2600), q: 20, g: 1 }, { f: rng.range(3500, 4800), q: 25, g: 0.5 }], 0.6, 0.05);
  const t = rng.range(0.02, 0.045);
  const f0 = rng.range(2400, 4800);
  for (let k = 0; k < 3; k++) addMode(out, t * sr, sr, f0 * [1, 2.756, 5.404][k], [0.6, 0.3, 0.12][k], rng.range(10, 22) + k * 12, 0);
  addNoiseBurst(out, t * sr, sr, noise, 0.4, { attack: 0.0001, decay: 0.001, hp: 2000 });
  fadeOut(out, sr, 0.03);
  return out;
}

/** Nail pulled until it lets go: rising squeal, snap and a short ring. */
export function bondNail(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const sq = rng.range(0.08, 0.2);
  const out = buf(sr, sq + 0.35);
  const f0 = rng.range(650, 900);
  const f1 = rng.range(1300, 1900);
  const s = stickSlip(sr, noise, sq, (t) => f0 + (f1 - f0) * (t / sq), (t) => 0.3 + 0.7 * (t / sq), 0.04, 0.3);
  resonate(out, 0, sr, s, [{ f: rng.range(1500, 2200), q: 18, g: 1 }, { f: rng.range(2800, 3800), q: 22, g: 0.6 }, { f: rng.range(5000, 6500), q: 25, g: 0.3 }], 0.5, 0.05);
  woodClick(out, sq, g, 0.8, 1.2);
  addMode(out, sq * sr, sr, rng.range(2200, 3800), 0.35, 18, 0);
  fadeOut(out, sr, 0.03);
  return out;
}

/** Glue joint letting go: dry crack with a few crackles. */
export function bondGlue(g: G): Float32Array {
  const { sr, rng } = g;
  const out = buf(sr, 0.3);
  woodClick(out, 0, g, 1, rng.range(1.1, 1.6));
  for (let i = 0; i < rng.int(2, 5); i++) woodClick(out, rng.range(0.005, 0.08), g, rng.range(0.1, 0.35), rng.range(1.2, 2));
  fadeOut(out, sr, 0.03);
  return out;
}

/** Spot weld snapping: sharp bright impulse + short metallic ring. */
export function bondWeld(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.7);
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.0001, decay: 0.0012, hp: 1200 });
  const f0 = rng.range(900, 1700);
  for (const [r, a] of [[1, 0.5], [1.47, 0.4], [2.09, 0.3], [2.56, 0.25], [3.71, 0.18]] as const) addMode(out, 0, sr, f0 * r * rng.range(0.97, 1.03), a, rng.range(7, 14) + f0 * r * 0.002, 0);
  fadeOut(out, sr, 0.1);
  return out;
}

/** Mortar/grout joint failing: gritty crunch + a few crumbs. */
export function bondMortar(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.4);
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.001, decay: rng.range(0.025, 0.045), bp: rng.range(900, 2000), q: 0.6, grit: 0.95 });
  for (let i = 0; i < rng.int(3, 6); i++) crumb(out, rng.range(0.01, 0.25), g, rng.range(0.1, 0.35), 700, 3500);
  fadeOut(out, sr, 0.03);
  return out;
}

/** Heavy bolt shearing: steel "tunk" + thump. */
export function bondBolt(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.9);
  addNoiseBurst(out, 0, sr, noise, 0.8, { attack: 0.0001, decay: 0.002, hp: 800 });
  const f0 = rng.range(550, 1000);
  for (let k = 0; k < 4; k++) addMode(out, 0, sr, f0 * [1, 2.756, 5.404, 8.933][k], [0.7, 0.4, 0.2, 0.1][k], rng.range(5, 9) + k * 6, 0);
  addThump(out, 0, sr, rng.range(100, 150), 0.5, 0.03, 0.3, 0.006);
  fadeOut(out, sr, 0.12);
  return out;
}

/** Plastic snap-fit releasing: two quick clicks. */
export function bondClip(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.12);
  for (let i = 0; i < 2; i++) {
    const t = i * rng.range(0.008, 0.025);
    addMode(out, t * sr, sr, rng.range(2200, 5500), i ? 0.5 : 1, rng.range(500, 900), 0);
    addNoiseBurst(out, t * sr, sr, noise, 0.5, { attack: 0.0001, decay: 0.0008, hp: 1500 });
  }
  fadeOut(out, sr, 0.01);
  return out;
}

/** Press-fit part popping off (knob, keycap, lid): soft "pok". */
export function bondPress(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.12);
  addNoiseBurst(out, 0, sr, noise, 1.0, { attack: 0.0005, decay: 0.008, bp: rng.range(350, 900), q: 2 });
  addMode(out, 0, sr, rng.range(500, 1100), 0.5, 120, 0);
  addMode(out, 0.002 * sr, sr, rng.range(2500, 4000), 0.15, 500, 0);
  fadeOut(out, sr, 0.01);
  return out;
}

/** Hinge failing: metal snap plus screws tearing out of wood. */
export function bondHinge(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.6);
  addNoiseBurst(out, 0, sr, noise, 0.9, { attack: 0.0001, decay: 0.0015, hp: 900 });
  const f0 = rng.range(700, 1300);
  for (const [r, a] of [[1, 0.5], [2.756, 0.3], [5.404, 0.15]] as const) addMode(out, 0, sr, f0 * r, a, rng.range(10, 18), 0);
  for (let i = 0; i < rng.int(2, 4); i++) woodClick(out, rng.range(0.003, 0.09), g, rng.range(0.3, 0.7), rng.range(0.9, 1.4));
  fadeOut(out, sr, 0.05);
  return out;
}

/** Latch/lock breaking: click-clack of the bolt + a snap. */
export function bondLatch(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.35);
  for (let i = 0; i < 2; i++) {
    const t = i * rng.range(0.03, 0.06);
    addMode(out, t * sr, sr, rng.range(2000, 4500), i ? 0.5 : 0.8, rng.range(200, 400), 0);
    addMode(out, t * sr, sr, rng.range(5000, 7000), 0.25, 500, 0);
    addNoiseBurst(out, t * sr, sr, noise, 0.5, { attack: 0.0001, decay: 0.001, hp: 1500 });
  }
  addMode(out, 0.01 * sr, sr, rng.range(800, 1400), 0.3, 25, 0);
  fadeOut(out, sr, 0.03);
  return out;
}

/** Drawer slide / rail coming apart: metallic clatter. */
export function bondSlider(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.45);
  for (let i = 0; i < rng.int(4, 8); i++) {
    const t = rng.range(0, 0.18);
    const f = rng.range(900, 3200);
    addMode(out, t * sr, sr, f, rng.range(0.2, 0.6), rng.range(25, 60), 0);
    addMode(out, t * sr, sr, f * 2.3, rng.range(0.1, 0.25), 80, 0);
    addNoiseBurst(out, t * sr, sr, noise, 0.2, { attack: 0.0001, decay: 0.001, hp: 1500 });
  }
  fadeOut(out, sr, 0.05);
  return out;
}

// ======================================================================= crack crackles

/** Glass cracking (no break yet): a fast "zip" of tiny clicks like ice, plus a glint. */
export function crackGlass(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  const n = rng.int(6, 20);
  const span = rng.range(0.01, 0.06);
  for (let i = 0; i < n; i++) {
    const t = span * (i / n) ** 0.7;
    addMode(out, t * sr, sr, rng.range(4000, 10000), rng.range(0.15, 0.5), rng.range(300, 700), 0);
  }
  addNoiseBurst(out, 0, sr, noise, 0.8, { attack: 0.0001, decay: 0.0012, hp: 2500 });
  addTink(out, 0, sr, rng.range(2500, 5000), 0.25, 2.5);
  fadeOut(out, sr, 0.03);
  return out;
}

export function crackCeramic(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.3);
  for (let i = 0; i < rng.int(2, 5); i++) {
    const t = rng.range(0, 0.04);
    addMode(out, t * sr, sr, rng.range(2000, 6000), rng.range(0.3, 0.7), rng.range(200, 500), 0);
    addNoiseBurst(out, t * sr, sr, noise, 0.4, { attack: 0.0001, decay: 0.001, hp: 1500 });
  }
  addTink(out, 0, sr, rng.range(1500, 3000), 0.2, 3, CERAMIC_R, CERAMIC_A);
  fadeOut(out, sr, 0.03);
  return out;
}

export function crackWood(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.35);
  const d = rng.range(0.03, 0.07);
  const cr = stickSlip(sr, noise, d, () => rng.range(90, 160), (t) => Math.sin((Math.PI * t) / d), 0.15);
  resonate(out, 0, sr, cr, [{ f: rng.range(400, 600), q: 10, g: 1 }, { f: rng.range(900, 1300), q: 12, g: 0.6 }], 0.8, 0.05);
  for (let i = 0; i < rng.int(2, 6); i++) woodClick(out, d + rng.range(0, 0.06), g, rng.range(0.3, 0.9), rng.range(1, 1.5));
  fadeOut(out, sr, 0.03);
  return out;
}

export function crackPlastic(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.15);
  for (let i = 0; i < rng.int(1, 3); i++) {
    const t = rng.range(0, 0.03);
    addMode(out, t * sr, sr, rng.range(2500, 6000), rng.range(0.4, 1), rng.range(500, 1000), 0);
    addNoiseBurst(out, t * sr, sr, noise, 0.6, { attack: 0.0001, decay: 0.0008, hp: 1800 });
  }
  for (let i = 0; i < rng.int(2, 6); i++) addMode(out, rng.range(0.003, 0.05) * sr, sr, rng.range(3000, 8000), rng.range(0.05, 0.2), 900, 0);
  fadeOut(out, sr, 0.02);
  return out;
}

/** Dull crack (drywall, plaster, concrete): short gritty crunch. */
export function crackDull(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.25);
  addNoiseBurst(out, 0, sr, noise, 1, { attack: 0.0005, decay: rng.range(0.012, 0.03), bp: rng.range(700, 2200), q: 0.6, grit: 0.9 });
  for (let i = 0; i < rng.int(2, 5); i++) crumb(out, rng.range(0, 0.06), g, rng.range(0.2, 0.5), 400, 2500);
  fadeOut(out, sr, 0.03);
  return out;
}

// ======================================================================= tears

/** Fabric ripping: irregular micro-bursts of fibre failure (stick-slip of threads). */
export function tearCloth(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.3, 0.55);
  const out = buf(sr, dur);
  const d = dur - 0.05;
  const env = (t: number) => Math.min(1, t / 0.03) * (t < d * 0.8 ? 1 : Math.max(0, (d - t) / (d * 0.2))) * (0.7 + 0.3 * Math.sin(t * 37));
  const exc = buf(sr, d);
  poisson(noise, d, 900, (t) => (250 + 500 * Math.sin((Math.PI * t) / d)) * env(t), (t) => {
    const s = Math.floor(t * sr);
    const n = Math.floor(rng.range(0.0005, 0.002) * sr);
    const a = rng.range(0.3, 1);
    for (let k = 0; k < n && s + k < exc.length; k++) exc[s + k] += noise.white() * a * (1 - k / n);
  });
  const bp = new Biquad().bandpass(sr, rng.range(1800, 3200), 0.7);
  const hp = new Biquad().highpass(sr, 900);
  for (let i = 0; i < exc.length; i++) out[i] += hp.process(bp.process(exc[i])) * 1.5;
  fadeOut(out, sr, 0.03);
  return out;
}

export function tearPaper(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.2, 0.4);
  const out = buf(sr, dur);
  const d = dur - 0.03;
  poisson(noise, d, 1400, (t) => 900 * Math.sin((Math.PI * t) / d) ** 0.5, (t) => {
    addNoiseBurst(out, t * sr, sr, noise, rng.range(0.2, 0.8), { attack: 0.0001, decay: rng.range(0.0004, 0.0012), hp: 2200, lp: 10000 });
    if (rng.chance(0.15)) addMode(out, t * sr, sr, rng.range(3000, 7000), rng.range(0.1, 0.3), 800, 0);
  });
  fadeOut(out, sr, 0.02);
  return out;
}
