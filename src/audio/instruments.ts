// Music instrument samples, rendered per MIDI note (pure; cached as AudioBuffers at runtime).

import { Rng, Biquad, OnePole, Noise, TAU, clamp, midiToHz, addMode, addPluck, fadeOut, fadeIn, peak, scale, dcBlock } from './dsp';

export type Inst = 'uke' | 'marimba' | 'glock' | 'bass' | 'shaker' | 'kick' | 'brush';
export const INSTRUMENTS: readonly Inst[] = ['uke', 'marimba', 'glock', 'bass', 'shaker', 'kick', 'brush'];

/** Pitched instruments use the MIDI note; percussion uses `midi` as a variant index. */
export function renderNote(inst: Inst, midi: number, sr: number): Float32Array {
  const rng = new Rng(midi * 131 + inst.length * 7919);
  switch (inst) {
    case 'uke':
      return uke(midi, sr, rng);
    case 'marimba':
      return marimba(midi, sr, rng);
    case 'glock':
      return glock(midi, sr);
    case 'bass':
      return bass(midi, sr, rng);
    case 'shaker':
      return shaker(sr, rng, midi % 2 === 1);
    case 'kick':
      return kick(sr, rng);
    case 'brush':
      return brush(sr, rng);
  }
}

function finish(b: Float32Array, sr: number, peakTo: number, fadeSec: number): Float32Array {
  dcBlock(b, sr, 15);
  fadeIn(b, Math.max(2, Math.round(0.0004 * sr)));
  fadeOut(b, Math.round(fadeSec * sr));
  const p = peak(b);
  return p > 0 ? scale(b, peakTo / p) : b;
}

/** Nylon-string ukulele pluck (Karplus-Strong + body EQ). */
function uke(midi: number, sr: number, rng: Rng): Float32Array {
  const f = midiToHz(midi);
  const t60 = clamp(2.1 - (midi - 60) * 0.06, 0.9, 2.2);
  const dur = Math.min(1.5, t60);
  const b = new Float32Array(Math.round(dur * sr));
  addPluck(b, 0, sr, rng, { f, t60, bright: 0.42, pick: 0.21, amp: 1 });
  // a touch of the octave string colour + soft attack
  new Biquad().peaking(260, 1.0, 3, sr).apply(b);
  new Biquad().peaking(1100, 1.2, 1.5, sr).apply(b);
  new Biquad().highshelf(3500, -5, sr).apply(b);
  new Biquad().lowpass(7000, 0.6, sr).apply(b);
  const att = Math.round(0.0025 * sr);
  for (let i = 0; i < att && i < b.length; i++) b[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
  return finish(b, sr, 0.5, 0.12);
}

/** Soft rubber-mallet marimba. */
function marimba(midi: number, sr: number, rng: Rng): Float32Array {
  const f = midiToHz(midi);
  const tau = clamp(0.75 - (midi - 60) * 0.018, 0.22, 0.85);
  const dur = Math.min(1.4, tau * 5);
  const b = new Float32Array(Math.round(dur * sr));
  addMode(b, 0, sr, f, 1, tau, 0.0015);
  addMode(b, 0, sr, f * 1.0015, 0.18, tau * 1.4, 0.012); // resonator tube
  addMode(b, 0, sr, f * 3.93, 0.2, tau * 0.14, 0.001);
  addMode(b, 0, sr, f * 9.2, 0.035, tau * 0.05, 0.0008);
  // mallet thock
  const nz = new Noise(rng);
  const lp = new OnePole().set(Math.min(5000, f * 5), sr);
  const n = Math.round(0.006 * sr);
  for (let i = 0; i < n; i++) b[i] += lp.lp(nz.white()) * 0.25 * Math.exp(-i / (0.0012 * sr));
  return finish(b, sr, 0.5, 0.08);
}

/** Glockenspiel / music-box bar. */
function glock(midi: number, sr: number): Float32Array {
  const f = midiToHz(midi);
  const dur = 1.5;
  const b = new Float32Array(Math.round(dur * sr));
  addMode(b, 0, sr, f, 1, 0.55, 0.0008);
  addMode(b, 0, sr, f * 2.756, 0.22, 0.18, 0.0006);
  addMode(b, 0, sr, f * 5.404, 0.07, 0.07, 0.0005);
  addMode(b, 0, sr, f * 8.933, 0.025, 0.03, 0.0005);
  new Biquad().lowpass(9500, 0.7, sr).apply(b);
  return finish(b, sr, 0.5, 0.15);
}

/** Round plucked bass (sine-based "U-bass"). */
function bass(midi: number, sr: number, rng: Rng): Float32Array {
  const f = midiToHz(midi);
  const dur = 1.1;
  const n = Math.round(dur * sr);
  const b = new Float32Array(n);
  let ph = 0;
  const att = 0.006 * sr;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (TAU * f) / sr;
    const e = (i < att ? 0.5 - 0.5 * Math.cos((Math.PI * i) / att) : 1) * Math.exp(-t / 0.42);
    const h2 = 0.35 * Math.exp(-t / 0.12);
    const h3 = 0.12 * Math.exp(-t / 0.06);
    b[i] = e * (Math.sin(ph) + h2 * Math.sin(2 * ph) + h3 * Math.sin(3 * ph));
  }
  // finger pluck
  const nz = new Noise(rng);
  const lp = new OnePole().set(700, sr);
  for (let i = 0; i < Math.round(0.012 * sr); i++) b[i] += lp.lp(nz.white()) * 0.3 * Math.exp(-i / (0.003 * sr));
  new Biquad().lowpass(1400, 0.6, sr).apply(b);
  return finish(b, sr, 0.6, 0.1);
}

function shaker(sr: number, rng: Rng, accent: boolean): Float32Array {
  const dur = accent ? 0.16 : 0.11;
  const n = Math.round(dur * sr);
  const b = new Float32Array(n);
  const nz = new Noise(rng);
  const hp = new Biquad().highpass(4500, 0.7, sr);
  const bp = new Biquad().bandpass(7200, 0.7, sr);
  const att = 0.007 * sr;
  const tau = (accent ? 0.04 : 0.026) * sr;
  for (let i = 0; i < n; i++) {
    const e = i < att ? 0.5 - 0.5 * Math.cos((Math.PI * i) / att) : Math.exp(-(i - att) / tau);
    b[i] = bp.run(hp.run(nz.white())) * e;
  }
  return finish(b, sr, 0.5, 0.01);
}

function kick(sr: number, rng: Rng): Float32Array {
  const dur = 0.45;
  const n = Math.round(dur * sr);
  const b = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 48 + 80 * Math.exp(-t / 0.03);
    ph += (TAU * f) / sr;
    const e = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / 0.13);
    b[i] = Math.sin(ph) * e;
  }
  const nz = new Noise(rng);
  const lp = new OnePole().set(1500, sr);
  for (let i = 0; i < Math.round(0.004 * sr); i++) b[i] += lp.lp(nz.white()) * 0.15;
  return finish(b, sr, 0.7, 0.05);
}

function brush(sr: number, rng: Rng): Float32Array {
  const dur = 0.32;
  const n = Math.round(dur * sr);
  const b = new Float32Array(n);
  const nz = new Noise(rng);
  const bp = new Biquad().bandpass(2600, 0.5, sr);
  const lp = new Biquad().lowpass(6500, 0.7, sr);
  const bp2 = new Biquad().bandpass(4200, 0.8, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e1 = (t < 0.005 ? t / 0.005 : 1) * Math.exp(-t / 0.07);
    const e2 = Math.sin(Math.PI * Math.min(1, t / dur)) * 0.25;
    const w = nz.white();
    b[i] = lp.run(bp.run(w)) * e1 + bp2.run(w) * e2;
  }
  return finish(b, sr, 0.5, 0.03);
}
