// Procedural impulse responses for the convolution reverb, one per env.reverb type: sparse early
// reflections, a grainy (velvet-noise) decaying tail whose highs die first, short comb filters for
// a slightly metallic "algorithmic" colour, flutter between parallel walls and discrete slap
// echoes for big spaces. Built at 22050 Hz like the PS1 SPU reverb, then upsampled to the
// context rate (ConvolverNode needs a matching rate). Pure JS, safe to import in Node.
import { makeRng, hashStr, TAU, filterG, drain, comb, resampleLinear } from './dsp.js';

export const IR_SR = 22050;

// rt: decay to -60 dB (s) · pre: diffuse onset delay · er: [first, last, count] early reflections
// erg: early level · hf/hfEnd: tail brightness at the start/end · dens: grain impulses per second
// metal: comb colouration · flutter/ffb: flutter echo period/feedback · echoes: [[time, level]]
// diffuse: tail level · wet: overall return level (sqrt of IR energy)
export const REVERB = {
  tiny: { rt: 0.28, pre: 0.001, er: [0.0015, 0.014, 8], erg: 0.7, hf: 5200, hfEnd: 1500, dens: 3500, metal: 0.15, wet: 0.3 },
  room: { rt: 0.6, pre: 0.003, er: [0.003, 0.03, 10], erg: 0.6, hf: 6500, hfEnd: 1200, dens: 2500, metal: 0.2, wet: 0.42 },
  office: { rt: 0.75, pre: 0.004, er: [0.004, 0.04, 10], erg: 0.45, hf: 4200, hfEnd: 800, dens: 2500, metal: 0.1, wet: 0.38 },
  corridor: { rt: 1.35, pre: 0.003, er: [0.003, 0.05, 12], erg: 0.55, hf: 6000, hfEnd: 1100, dens: 2200, metal: 0.25, flutter: 0.0118, ffb: 0.5, wet: 0.6 },
  hall: { rt: 2.1, pre: 0.012, er: [0.01, 0.08, 14], erg: 0.45, hf: 5500, hfEnd: 900, dens: 2000, metal: 0.2, wet: 0.75 },
  warehouse: { rt: 3.7, pre: 0.022, er: [0.02, 0.12, 14], erg: 0.4, hf: 5000, hfEnd: 700, dens: 1600, metal: 0.35, echoes: [[0.105, 0.3], [0.185, 0.2], [0.29, 0.13], [0.43, 0.07]], wet: 0.95 },
  stairwell: { rt: 2.5, pre: 0.004, er: [0.004, 0.05, 16], erg: 0.6, hf: 7000, hfEnd: 1500, dens: 2200, metal: 0.45, flutter: 0.0165, ffb: 0.45, wet: 0.85 },
  tunnel: { rt: 2.9, pre: 0.006, er: [0.006, 0.06, 12], erg: 0.5, hf: 3600, hfEnd: 500, dens: 1800, metal: 0.3, flutter: 0.0095, ffb: 0.35, echoes: [[0.16, 0.22], [0.33, 0.12], [0.5, 0.06]], wet: 0.85 },
  tile: { rt: 1.6, pre: 0.002, er: [0.002, 0.03, 18], erg: 0.7, hf: 9000, hfEnd: 2500, dens: 3000, metal: 0.4, wet: 0.7 },
  auditorium: { rt: 3.2, pre: 0.02, er: [0.015, 0.1, 14], erg: 0.4, hf: 4600, hfEnd: 700, dens: 2200, metal: 0.15, wet: 0.85 },
  outdoor: { rt: 0.45, pre: 0.0, er: [0.02, 0.06, 3], erg: 0.12, hf: 3000, hfEnd: 800, dens: 1200, metal: 0, echoes: [[0.095, 0.07], [0.23, 0.05], [0.41, 0.035], [0.62, 0.02]], diffuse: 0.25, wet: 0.22 },
};
export const REVERB_TYPES = Object.keys(REVERB);

// Returns [left, right] Float32Arrays at outRate.
export function makeIR(type, outRate = 44100) { return drain(makeIRG(type, outRate)); }

// The same as a generator that yields every few milliseconds of work (main-thread slicing).
export function* makeIRG(type, outRate = 44100) {
  const p = REVERB[type] || REVERB.room;
  const r = makeRng(hashStr('ir:' + type));
  const lastEcho = (p.echoes || []).reduce((m, e) => Math.max(m, e[0]), 0);
  const n = Math.ceil((Math.max(p.pre + p.rt * 1.1, lastEcho + 0.15) + 0.02) * IR_SR);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const h = new Float32Array(n);
    // diffuse tail: soft noise plus sparse velvet impulses (the grain), exponential decay
    const s0 = Math.round(p.pre * IR_SR), k60 = 6.9078 / p.rt, build = Math.max(0.003, Math.min(0.06, p.rt * 0.04));
    const vel = p.dens / IR_SR, diffuse = p.diffuse ?? 1;
    for (let i = s0; i < n; i++) {
      const t = (i - s0) / IR_SR;
      let v = (r() + r() + r() - 1.5) * 1.2;
      if (r() < vel) v += r() < 0.5 ? -3 : 3;
      h[i] = v * Math.exp(-k60 * t) * Math.min(1, t / build) * diffuse;
      if ((i & 16383) === 16383) yield;
    }
    yield;
    // frequency-dependent decay: a 2-pole lowpass closing from hf to hfEnd along the tail
    let y1 = 0, y2 = 0, a = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        const fc = p.hfEnd + (p.hf - p.hfEnd) * Math.exp(-i / IR_SR / (p.rt * 0.35));
        a = 1 - Math.exp((-TAU * fc) / IR_SR);
      }
      y1 += a * (h[i] - y1); y2 += a * (y1 - y2);
      h[i] = y2;
      if ((i & 32767) === 32767) yield;
    }
    yield;
    if (p.metal) {
      comb(h, (0.0037 + c * 0.0011) * IR_SR, p.metal);
      comb(h, (0.0061 + c * 0.0007) * IR_SR, p.metal * 0.7);
    }
    if (p.flutter) comb(h, p.flutter * (1 + 0.04 * c) * IR_SR, p.ffb);
    yield;
    // early reflections and slap echoes, smeared a little so they are not pure digital clicks
    const er = new Float32Array(n), ec = new Float32Array(n);
    const [e0, e1, ne] = p.er;
    for (let j = 0; j < ne; j++) {
      const t = e0 + (e1 - e0) * Math.pow(r(), 0.8);
      const i = Math.round(t * IR_SR);
      if (i < n) er[i] += p.erg * Math.pow(e0 / t, 0.7) * (0.6 + 0.4 * r()) * (r() < 0.5 ? -1 : 1);
    }
    for (const [te, ae] of p.echoes || []) {
      const base = Math.round((te + (r() - 0.5) * 0.008) * IR_SR);
      for (let q = 0; q < 14; q++) {
        const i = base + Math.round(r() * 0.016 * IR_SR);
        if (i < n) ec[i] += ae * Math.exp(-q / 5) * (r() < 0.5 ? -1 : 1) * 2.2;
      }
    }
    yield* filterG(er, [['lp', 4200, 0.6]], IR_SR);
    yield* filterG(ec, [['lp', 2400, 0.6], ['hp', 150]], IR_SR);
    for (let i = 0; i < n; i++) h[i] += er[i] + ec[i];
    yield* filterG(h, [['hp', 80, 0.6]], IR_SR);
    // fade the last 60 ms so the IR ends cleanly
    const nf = Math.min(n, Math.round(0.06 * IR_SR));
    for (let i = 0; i < nf; i++) h[n - 1 - i] *= i / nf;
    chans.push(resampleLinear(h, IR_SR, outRate));
    yield;
  }
  // energy normalisation: sqrt(sum h^2) == wet (averaged over both channels)
  let e = 0;
  for (const h of chans) for (let i = 0; i < h.length; i++) e += h[i] * h[i];
  const k = e > 0 ? p.wet / Math.sqrt(e / 2) : 0;
  for (const h of chans) for (let i = 0; i < h.length; i++) h[i] *= k;
  return chans;
}
