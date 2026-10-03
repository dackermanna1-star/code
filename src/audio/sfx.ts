// One-shot sound effect recipes. Each recipe is a tiny script over the `Sig` gesture toolkit;
// renders are post-processed (DC block, tail trim) and loudness-normalised so every sound sits
// at a consistent, deliberate level (`loud` = dB offset from the SFX reference).

import type { SfxName } from './types';
import { Rng, TAU, Biquad, dcBlock, fadeIn, trimTail, normalizeLoudness, midiToHz, swell } from './dsp';
import { Sig, type Partial3 } from './synth';
import { PHRASES, synthSegments, randomVoiceParams } from './voice';

export interface SfxSpec {
  /** render window (s); the silent tail is trimmed afterwards */
  dur: number;
  /** loudness offset (dB) relative to SFX_REF_DB */
  loud?: number;
  /** number of distinct pre-rendered variants (default 3) */
  variants?: number;
  /** max overlapping instances before the oldest is dropped (default 6) */
  voices?: number;
  /** random pitch variation per play, ± semitones (default 0.6) */
  pv?: number;
  /** random gain variation per play, ± dB (default 1.5) */
  gv?: number;
  render: (s: Sig) => void;
}

/** Reference loudness for one-shots: max 100 ms K-weighted loudness (≈ LUFS-M max). */
export const SFX_REF_DB = -20;
export const SFX_PEAK_CAP = 0.7;

// ---------------------------------------------------------------------------------------------
// Shared material

const WOOD: readonly Partial3[] = [
  [1, 0.5, 0.05],
  [2.42, 0.3, 0.035],
  [3.93, 0.18, 0.022],
  [5.6, 0.1, 0.014],
];
const METAL: readonly Partial3[] = [
  [1, 0.5, 0.45],
  [1.006, 0.25, 0.5],
  [2.71, 0.35, 0.3],
  [4.17, 0.25, 0.18],
  [5.86, 0.14, 0.12],
  [8.1, 0.07, 0.07],
];
const GLASS: readonly Partial3[] = [
  [1, 0.5, 0.09],
  [1.53, 0.3, 0.07],
  [2.12, 0.22, 0.05],
  [3.4, 0.1, 0.03],
];
/** free bar (glockenspiel / chime) */
const BAR: readonly Partial3[] = [
  [1, 1, 0.9],
  [2.756, 0.28, 0.35],
  [5.404, 0.1, 0.13],
  [8.933, 0.04, 0.05],
];

/** Soft marimba note (sine + tuned 4th partial + mallet tick). */
function mar(s: Sig, t: number, midi: number, amp: number, tau = 0.4): void {
  const f = midiToHz(midi);
  s.modal(t, f, [[1, 1, tau], [3.93, 0.25, tau * 0.16], [9.2, 0.05, tau * 0.05]], { amp, attack: 0.0012 });
  s.noise(t, { dur: 0.006, type: 'bp', f: Math.min(f * 4, 6000), q: 1, attack: 0.0004, tau: 0.0015, amp: amp * 0.15 });
}

/** Raw (un-normalised) Mochi vocal for the eating/body sounds. */
function vocal(s: Sig, phrase: 'burp' | 'cough' | 'hiccup'): Float32Array {
  const raw = synthSegments(PHRASES[phrase](s.rng), s.sr, s.rng, randomVoiceParams(s.rng));
  new Biquad().lowpass(7000, 0.6, s.sr).apply(raw);
  new Biquad().highpass(110, 0.6, s.sr).apply(raw);
  return raw;
}

// ---------------------------------------------------------------------------------------------
// Recipes

export const SFX: Record<SfxName, SfxSpec> = {
  // --- basic interaction ---------------------------------------------------------------------
  tap: {
    dur: 0.09,
    loud: -8,
    pv: 1.2,
    render: (s) => {
      s.click(0, { f: s.rng.range(2000, 2800), q: 1.6, amp: 0.45, dur: 0.002 });
      s.thump(0, { f0: 520, f1: 330, drop: 0.008, tau: 0.016, amp: 0.55 });
      s.modal(0.0004, s.rng.range(1050, 1250), [[1, 0.16, 0.022], [2.3, 0.08, 0.012]]);
      s.lowpass(7500);
    },
  },
  pop: {
    dur: 0.17,
    loud: -3,
    pv: 1,
    render: (s) => {
      const f0 = s.rng.range(950, 1200);
      s.blip(0, { f0, f1: f0 * 0.34, glide: 0.022, dur: 0.15, tau: 0.035, attack: 0.0015, harm: [1, 0.22, 0.06], amp: 0.8 });
      s.click(0, { f: 3200, q: 2, amp: 0.12, dur: 0.0015 });
      s.lowpass(9000);
    },
  },
  pickup: {
    dur: 0.2,
    loud: -5,
    pv: 0.8,
    render: (s) => {
      const f0 = s.rng.range(300, 360);
      s.blip(0.004, { f0, f1: f0 * 2.1, glide: 0.035, dur: 0.16, tau: 0.05, attack: 0.004, harm: [1, 0.25, 0.08], amp: 0.7 });
      s.click(0, { f: 2600, q: 1.5, amp: 0.15 });
    },
  },
  'drop-soft': {
    dur: 0.3,
    loud: -4,
    render: (s) => {
      s.thump(0, { f0: 150, f1: 95, drop: 0.02, tau: 0.055, amp: 0.9 });
      s.noise(0, { dur: 0.07, color: 'pink', type: 'lp', f: 900, q: 0.7, attack: 0.001, tau: 0.018, amp: 0.45 });
      s.modal(0.001, s.rng.range(300, 360), [[1, 0.2, 0.04], [2.3, 0.1, 0.025]]);
      s.lowpass(5000);
    },
  },
  'drop-hard': {
    dur: 0.4,
    loud: -2,
    render: (s) => {
      s.click(0, { f: 3200, q: 1.2, amp: 0.35, dur: 0.002 });
      s.thump(0, { f0: 190, f1: 115, drop: 0.015, tau: 0.045, amp: 0.85 });
      s.modal(0.0005, s.rng.range(400, 470), WOOD, { amp: 0.8 });
      s.noise(0, { dur: 0.035, type: 'bp', f: 1500, q: 0.8, attack: 0.0005, tau: 0.008, amp: 0.3 });
      s.lowpass(8000);
    },
  },
  'drop-squish': {
    dur: 0.4,
    loud: -3,
    render: (s) => {
      s.noise(0, { dur: 0.3, color: 'pink', type: 'lp', f: 1900, f2: 260, q: 3.2, attack: 0.004, tau: 0.08, amp: 0.8 });
      s.thump(0, { f0: 230, f1: 75, drop: 0.05, tau: 0.07, amp: 0.55 });
      s.crackle(0.005, { span: 0.1, count: 5, f: [500, 1400], q: 3, amp: 0.25 });
      s.lowpass(4500);
    },
  },
  'drop-liquid': {
    dur: 0.55,
    loud: -3,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.22, type: 'bp', f: 1300, f2: 650, q: 1.1, attack: 0.002, tau: 0.05, amp: 0.55 });
      s.thump(0, { f0: 160, f1: 80, drop: 0.03, tau: 0.04, amp: 0.4 });
      const nb = r.int(3, 5);
      for (let k = 0; k < nb; k++)
        s.bubble(0.02 + r.next() * 0.25, { f: r.range(500, 1400), rise: r.range(0.5, 0.9), tau: r.range(0.018, 0.045), amp: r.range(0.15, 0.4) });
      s.lowpass(7000);
    },
  },
  'drop-crunchy': {
    dur: 0.32,
    loud: -3,
    render: (s) => {
      s.crackle(0, { span: 0.08, count: 10, f: [1500, 5200], q: 1.8, amp: 0.6, dur: [0.001, 0.004], skew: 1.6 });
      s.thump(0, { f0: 170, f1: 100, drop: 0.012, tau: 0.035, amp: 0.5 });
      s.noise(0, { dur: 0.06, type: 'bp', f: 2500, q: 0.7, attack: 0.0005, tau: 0.014, amp: 0.3 });
      s.lowpass(9000);
    },
  },
  'drop-metal': {
    dur: 1.1,
    loud: -3,
    voices: 4,
    render: (s) => {
      s.click(0, { f: 4200, q: 1.5, amp: 0.3, dur: 0.0015 });
      s.modal(0.0003, s.rng.range(480, 580), METAL, { amp: 0.7, spread: 0.01 });
      s.thump(0, { f0: 210, f1: 150, tau: 0.04, amp: 0.3 });
      s.lowpass(6000);
    },
  },

  // --- cooking actions -----------------------------------------------------------------------
  chop: {
    dur: 0.25,
    loud: -2,
    render: (s) => {
      const r = s.rng;
      s.click(0, { f: r.range(3800, 4600), q: 1.0, amp: 0.4, dur: 0.0015 });
      s.noise(0, { dur: 0.035, type: 'bp', f: r.range(1600, 2000), q: 1.4, attack: 0.0006, tau: 0.009, amp: 0.5 });
      s.thump(0, { f0: 175, f1: 118, drop: 0.012, tau: 0.045, amp: 0.95 });
      s.modal(0.0005, r.range(580, 660), [[1, 0.32, 0.035], [1.71, 0.2, 0.025], [2.63, 0.13, 0.018]]);
      s.lowpass(9500);
    },
  },
  slice: {
    dur: 0.3,
    loud: -4,
    render: (s) => {
      const r = s.rng;
      s.noise(0, {
        dur: 0.14,
        type: 'bp',
        f: r.range(2400, 2900),
        f2: r.range(6000, 7000),
        q: 1.6,
        env: (x) => Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.1)), 1.5),
        amp: 0.45,
      });
      s.thump(0.12, { f0: 220, f1: 150, drop: 0.01, tau: 0.03, amp: 0.55 });
      s.click(0.12, { f: 2500, q: 1.2, amp: 0.22 });
      s.lowpass(11000);
    },
  },
  squish: {
    dur: 0.38,
    loud: -3,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.3, color: 'pink', type: 'lp', f: r.range(1900, 2400), f2: 260, q: 4.5, attack: 0.012, tau: 0.09, amp: 0.8 });
      s.blip(0, { f0: 330, f1: 105, glide: 0.06, dur: 0.22, tau: 0.07, attack: 0.008, amp: 0.3 });
      s.crackle(0.015, { span: 0.12, count: 5, f: [500, 1400], q: 3, amp: 0.22 });
      s.lowpass(4000);
    },
  },
  peel: {
    dur: 0.5,
    loud: -5,
    render: (s) => {
      const r = s.rng;
      const n = r.int(34, 44);
      for (let k = 0; k < n; k++) {
        const x = k / n;
        s.click(0.01 + x * 0.33 + r.bi() * 0.003, {
          f: 1200 + x * 2200 + r.bi() * 300,
          q: 2.5,
          amp: (0.25 + 0.75 * Math.sin(Math.PI * x)) * r.range(0.3, 0.6),
          dur: r.range(0.0008, 0.002),
        });
      }
      s.noise(0, { dur: 0.38, type: 'bp', f: 1500, f2: 3500, q: 1.0, env: (x) => Math.sin(Math.PI * x), amp: 0.18 });
      s.lowpass(9000);
    },
  },
  roll: {
    dur: 0.75,
    loud: -6,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.7, color: 'brown', type: 'bp', f: 320, q: 0.9, env: (x) => swell(x, 0.15, 1.2), flutter: { rate: 40, depth: 0.6 }, amp: 0.8 });
      for (let t = 0.04; t < 0.6; t += r.range(0.09, 0.14)) s.thump(t, { f0: 110, f1: 85, tau: 0.03, amp: 0.25 * r.range(0.6, 1) });
      s.noise(0, { dur: 0.7, type: 'bp', f: 1800, q: 1.2, env: (x) => swell(x, 0.15, 1.2), flutter: { rate: 60, depth: 0.8 }, amp: 0.08 });
      s.lowpass(3500);
    },
  },
  mash: {
    dur: 0.55,
    loud: -3,
    render: (s) => {
      const r = s.rng;
      const ts = [0, 0.09 + r.bi() * 0.015, 0.2 + r.bi() * 0.02];
      ts.forEach((t, k) =>
        s.noise(t, { dur: 0.2, color: 'pink', type: 'lp', f: 1700 - k * 200, f2: 280, q: 3.6, attack: 0.008, tau: 0.06, amp: 0.7 - k * 0.15 }),
      );
      s.thump(0, { f0: 140, f1: 70, drop: 0.04, tau: 0.06, amp: 0.5 });
      s.crackle(0.02, { span: 0.3, count: 6, f: [400, 1200], q: 3, amp: 0.15 });
      s.lowpass(3800);
    },
  },
  crack: {
    dur: 0.42,
    loud: -3,
    render: (s) => {
      const r = s.rng;
      s.crackle(0, { span: 0.03, count: 6, f: [1800, 4500], q: 2.5, amp: 0.7, dur: [0.0012, 0.004], skew: 1.3 });
      s.modal(0, r.range(1750, 2050), [[1, 0.2, 0.02], [1.6, 0.14, 0.014], [2.4, 0.09, 0.01]]);
      s.thump(0, { f0: 270, f1: 180, tau: 0.02, amp: 0.3 });
      s.noise(0.09, { dur: 0.14, color: 'pink', type: 'lp', f: 1300, f2: 700, q: 2.2, attack: 0.02, tau: 0.05, amp: 0.2 });
      s.bubble(0.15, { f: r.range(800, 1000), rise: 0.5, tau: 0.03, amp: 0.22 });
    },
  },
  splash: {
    dur: 0.85,
    loud: -1,
    voices: 4,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.55, type: 'bp', f: 2700, f2: 1100, q: 0.75, attack: 0.004, tau: 0.13, amp: 0.65 });
      s.noise(0, { dur: 0.16, color: 'pink', type: 'lp', f: 650, q: 0.9, attack: 0.002, tau: 0.04, amp: 0.45 });
      s.thump(0, { f0: 130, f1: 70, tau: 0.05, amp: 0.35 });
      const nb = r.int(6, 9);
      for (let k = 0; k < nb; k++)
        s.bubble(0.03 + Math.pow(r.next(), 1.4) * 0.5, { f: r.range(700, 2200), rise: r.range(0.6, 1.0), tau: r.range(0.015, 0.04), amp: r.range(0.12, 0.3) });
      s.crackle(0.02, { span: 0.4, count: 24, f: [3000, 7000], q: 1.2, amp: 0.12, skew: 1.5 });
      s.lowpass(9000);
    },
  },
  pour: {
    dur: 1.0,
    loud: -4,
    voices: 3,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.95, type: 'bp', f: 1600, q: 0.8, env: (x) => swell(x, 0.15, 1.5), flutter: { rate: 45, depth: 0.55 }, amp: 0.3 });
      let t = 0.05;
      for (let k = 0; k < 4; k++) {
        s.noise(t, { dur: 0.1, color: 'pink', type: 'bp', f: 260, f2: 620, q: 5, attack: 0.01, tau: 0.03, amp: 0.4 - k * 0.05 });
        s.bubble(t + 0.02, { f: r.range(320, 520), rise: 1.0, tau: 0.04, amp: 0.4 - k * 0.06 });
        t += r.range(0.16, 0.22);
      }
      for (let k = 0; k < 14; k++) s.bubble(r.range(0.05, 0.8), { f: r.range(900, 2400), rise: 0.8, tau: r.range(0.008, 0.02), amp: r.range(0.05, 0.14) });
      s.lowpass(8000);
    },
  },
  flip: {
    dur: 0.48,
    loud: -4,
    render: (s) => {
      s.noise(0, { dur: 0.17, color: 'pink', type: 'bp', f: 480, f2: 1700, q: 1.4, env: (x) => swell(x, 0.6, 1.5), amp: 0.45 });
      s.noise(0.2, { dur: 0.06, color: 'pink', type: 'lp', f: 1800, q: 0.8, attack: 0.001, tau: 0.014, amp: 0.55 });
      s.thump(0.2, { f0: 160, f1: 100, drop: 0.012, tau: 0.035, amp: 0.5 });
      s.lowpass(8000);
    },
  },
  whoosh: {
    dur: 0.48,
    loud: -5,
    render: (s) => {
      const peakF = s.rng.range(1600, 2200);
      s.noise(0, {
        dur: 0.45,
        color: 'pink',
        type: 'bp',
        fcurve: (x) => 350 * Math.pow(peakF / 350, Math.sin(Math.PI * x * 0.9)),
        q: 1.1,
        env: (x) => swell(x, 0.5, 1.6),
        amp: 0.6,
      });
      s.lowpass(9000);
    },
  },
  swish: {
    dur: 0.26,
    loud: -6,
    render: (s) => {
      s.noise(0, { dur: 0.22, type: 'bp', f: s.rng.range(1400, 1800), f2: s.rng.range(4800, 5600), q: 1.8, env: (x) => swell(x, 0.35, 2), amp: 0.5 });
      s.lowpass(10000);
    },
  },

  // --- toy / ui-ish ----------------------------------------------------------------------------
  boing: {
    dur: 0.65,
    loud: -3,
    voices: 4,
    render: (s) => {
      const r = s.rng;
      const base = r.range(170, 200);
      s.tone(0, {
        dur: 0.6,
        f: (x) => {
          const t = x * 0.6;
          return base * (1 + 0.45 * (1 - Math.exp(-t / 0.05))) * (1 + 0.22 * Math.exp(-t / 0.16) * Math.sin(TAU * 15 * t));
        },
        harm: [1, 0.3, 0.12, 0.05],
        attack: 0.004,
        tau: 0.2,
        amp: 0.7,
      });
      s.modal(0, r.range(1300, 1500), [[1, 0.08, 0.06], [2.6, 0.04, 0.04]]);
      s.lowpass(5000);
    },
  },
  ding: {
    dur: 1.7,
    loud: -3,
    voices: 3,
    render: (s) => {
      const f = s.rng.range(1290, 1340);
      s.modal(0, f, [[1, 1, 0.75], [2.0, 0.16, 0.45], [2.756, 0.28, 0.32], [5.404, 0.1, 0.12], [8.933, 0.04, 0.05]], { amp: 0.6, attack: 0.001 });
      s.click(0, { f: 5500, q: 2, amp: 0.08, dur: 0.001 });
      s.lowpass(9000);
    },
  },
  click: {
    dur: 0.05,
    loud: -9,
    pv: 0.8,
    render: (s) => {
      s.click(0, { f: 3200, q: 2, amp: 0.6, dur: 0.0015 });
      s.blip(0, { f0: 1500, f1: 1150, glide: 0.006, dur: 0.025, tau: 0.006, attack: 0.0005, amp: 0.22 });
    },
  },
  knob: {
    dur: 0.08,
    loud: -11,
    pv: 1.5,
    render: (s) => {
      s.click(0, { f: 2100, q: 3, amp: 0.5, dur: 0.0012 });
      s.click(0.011, { f: 3800, q: 2, amp: 0.25, dur: 0.001 });
      s.thump(0, { f0: 620, f1: 420, tau: 0.007, amp: 0.2 });
    },
  },
  tick: {
    dur: 0.05,
    loud: -15,
    voices: 4,
    pv: 0.5,
    render: (s) => {
      s.click(0, { f: 4200, q: 4, amp: 0.5, dur: 0.001 });
      s.modal(0, 3100, [[1, 0.15, 0.006]]);
    },
  },

  // --- appliances -----------------------------------------------------------------------------
  'door-open': {
    dur: 0.6,
    loud: -6,
    render: (s) => {
      const r = s.rng;
      const cf = r.range(640, 700);
      s.click(0, { f: 2600, q: 1.8, amp: 0.4, dur: 0.0015 });
      s.thump(0, { f0: 320, f1: 210, tau: 0.015, amp: 0.3 });
      s.noise(0.03, { dur: 0.38, color: 'pink', type: 'bp', f: 600, f2: 1200, q: 0.9, env: (x) => swell(x, 0.35, 1.6), amp: 0.25 });
      s.tone(0.05, {
        dur: 0.16,
        f: (x) => cf * (1 + 0.15 * x),
        harm: [1, 0.4, 0.25, 0.15],
        env: (x) => Math.sin(Math.PI * x) ** 2,
        amp: 0.05,
        vib: { rate: 31, depth: 0.6 },
      });
      s.thump(0.32, { f0: 230, f1: 180, tau: 0.02, amp: 0.12 });
      s.lowpass(6000);
    },
  },
  'door-close': {
    dur: 0.5,
    loud: -4,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.12, color: 'pink', type: 'lp', f: 900, q: 0.7, env: (x) => swell(x, 0.85, 1), amp: 0.2 });
      s.thump(0.1, { f0: 140, f1: 90, drop: 0.015, tau: 0.05, amp: 0.85 });
      s.modal(0.1, r.range(360, 400), [[1, 0.3, 0.05], [2.3, 0.15, 0.03], [3.7, 0.08, 0.02]]);
      s.click(0.105, { f: 3000, q: 1.6, amp: 0.3, dur: 0.0012 });
      s.click(0.13, { f: 2400, q: 2.5, amp: 0.18, dur: 0.001 });
      s.lowpass(7000);
    },
  },
  'drawer-open': {
    dur: 0.62,
    loud: -5,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.42, color: 'pink', type: 'bp', f: 380, f2: 850, q: 0.9, env: (x) => swell(x, 0.25, 1.2), flutter: { rate: 70, depth: 0.6 }, amp: 0.4 });
      const nt = r.int(3, 5);
      for (let k = 0; k < nt; k++) s.modal(r.range(0.05, 0.4), r.range(2500, 4200), [[1, 0.1, 0.05], [2.4, 0.05, 0.03]], { amp: r.range(0.5, 1) });
      s.thump(0.42, { f0: 170, f1: 120, tau: 0.03, amp: 0.3 });
      s.click(0.42, { f: 2200, q: 2, amp: 0.18 });
      s.lowpass(7000);
    },
  },
  'drawer-close': {
    dur: 0.5,
    loud: -4,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.26, color: 'pink', type: 'bp', f: 600, f2: 340, q: 0.9, env: (x) => swell(x, 0.4, 1), flutter: { rate: 70, depth: 0.6 }, amp: 0.35 });
      s.thump(0.25, { f0: 150, f1: 100, drop: 0.012, tau: 0.045, amp: 0.85 });
      s.modal(0.25, r.range(330, 380), [[1, 0.25, 0.05], [2.4, 0.12, 0.03]]);
      s.click(0.252, { f: 2600, q: 1.5, amp: 0.25 });
      for (let k = 0; k < 3; k++) s.modal(0.26 + r.next() * 0.1, r.range(2600, 4400), [[1, 0.1, 0.05], [2.4, 0.05, 0.03]], { amp: r.range(0.4, 0.9) });
      s.lowpass(7000);
    },
  },
  'fridge-open': {
    dur: 0.8,
    loud: -5,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.05, color: 'pink', type: 'lp', f: 520, q: 1.4, attack: 0.001, tau: 0.012, amp: 0.55 });
      s.thump(0, { f0: 95, f1: 70, tau: 0.04, amp: 0.6 });
      s.noise(0.004, { dur: 0.03, type: 'bp', f: 1800, q: 2, attack: 0.001, tau: 0.007, amp: 0.16 });
      s.noise(0.03, { dur: 0.5, color: 'pink', type: 'bp', f: 900, f2: 2400, q: 0.8, env: (x) => swell(x, 0.3, 1.5), amp: 0.2 });
      s.modal(r.range(0.16, 0.22), r.range(1700, 1900), [[1, 0.12, 0.15], [2.5, 0.06, 0.08], [3.9, 0.03, 0.05]]);
      s.modal(r.range(0.2, 0.28), r.range(2100, 2300), [[1, 0.07, 0.12], [2.5, 0.04, 0.06]]);
      s.lowpass(7000);
    },
  },
  'fridge-close': {
    dur: 0.6,
    loud: -4,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.09, color: 'pink', type: 'lp', f: 700, q: 0.7, env: (x) => swell(x, 0.9, 1), amp: 0.2 });
      s.thump(0.08, { f0: 88, f1: 64, drop: 0.02, tau: 0.06, amp: 0.9 });
      s.noise(0.08, { dur: 0.07, color: 'pink', type: 'lp', f: 420, q: 0.9, attack: 0.002, tau: 0.02, amp: 0.5 });
      s.modal(0.1 + r.next() * 0.05, r.range(2000, 2400), [[1, 0.08, 0.12], [2.5, 0.04, 0.06]]);
      s.modal(0.14 + r.next() * 0.06, r.range(2500, 2800), [[1, 0.05, 0.1], [2.5, 0.03, 0.05]]);
      s.lowpass(6000);
    },
  },
  'oven-open': {
    dur: 0.95,
    loud: -4,
    render: (s) => {
      const r = s.rng;
      s.tone(0, { dur: 0.3, f: (x) => 520 - 100 * x, harm: [1, 0.5, 0.3, 0.2, 0.1], env: (x) => Math.sin(Math.PI * x) ** 2, vib: { rate: 23, depth: 0.5 }, amp: 0.05 });
      s.noise(0.1, { dur: 0.55, color: 'pink', type: 'lp', f: 700, f2: 1300, q: 0.7, env: (x) => swell(x, 0.4, 1.5), amp: 0.25 });
      s.thump(0.32, { f0: 125, f1: 90, tau: 0.05, amp: 0.65 });
      s.modal(0.32, r.range(230, 260), [[1, 0.4, 0.12], [2.4, 0.25, 0.08], [3.7, 0.15, 0.05]]);
      s.click(0.32, { f: 2400, q: 1.5, amp: 0.2 });
      s.lowpass(6000);
    },
  },
  'oven-close': {
    dur: 0.75,
    loud: -3,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.12, color: 'pink', type: 'lp', f: 900, q: 0.7, env: (x) => swell(x, 0.85, 1), amp: 0.2 });
      s.thump(0.1, { f0: 115, f1: 80, drop: 0.02, tau: 0.06, amp: 0.9 });
      s.modal(0.1, r.range(280, 320), [[1, 0.45, 0.18], [2.2, 0.3, 0.12], [3.3, 0.2, 0.08], [5.1, 0.1, 0.05]], { spread: 0.01 });
      s.click(0.1, { f: 2500, q: 1.4, amp: 0.3 });
      s.tone(0.14, { dur: 0.3, f: (x) => 600 - 40 * x, harm: [1, 0.3], vib: { rate: 12, depth: 0.4 }, attack: 0.01, tau: 0.08, amp: 0.04 });
      s.lowpass(6000);
    },
  },
  'microwave-beep': {
    dur: 0.2,
    loud: -7,
    pv: 0,
    gv: 0.5,
    render: (s) => {
      s.tone(0, { dur: 0.12, f: 1950, harm: [1, 0, 0.28, 0, 0.12], attack: 0.004, hold: 0.1, tau: 1, release: 0.012, amp: 0.5 });
      s.lowpass(6000);
    },
  },
  'microwave-ding': {
    dur: 1.5,
    loud: -4,
    voices: 2,
    pv: 0.2,
    render: (s) => {
      const f = 1760 * (1 + s.rng.bi() * 0.003);
      s.modal(0, f, [[1, 1, 0.85], [1.003, 0.5, 0.8], [2.4, 0.3, 0.35], [4.5, 0.12, 0.15]], { amp: 0.5, attack: 0.0008 });
      s.click(0, { f: 5000, q: 2, amp: 0.12 });
      s.lowpass(9000);
    },
  },
  'toaster-down': {
    dur: 0.5,
    loud: -5,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.13, type: 'bp', f: 1300, f2: 420, q: 5, env: (x) => swell(x, 0.3, 1), amp: 0.22 });
      s.tone(0, { dur: 0.13, f: (x) => 900 - 400 * x, harm: [1, 0.4, 0.2], env: (x) => Math.sin(Math.PI * x), amp: 0.06 });
      s.click(0.13, { f: 2800, q: 1.4, amp: 0.45 });
      s.modal(0.13, r.range(850, 950), [[1, 0.3, 0.05], [2.6, 0.2, 0.03]]);
      s.thump(0.13, { f0: 210, f1: 150, tau: 0.02, amp: 0.4 });
      s.lowpass(8000);
    },
  },
  'toaster-pop': {
    dur: 0.65,
    loud: -3,
    render: (s) => {
      const r = s.rng;
      s.click(0, { f: 3000, q: 1.4, amp: 0.45 });
      s.thump(0, { f0: 185, f1: 120, tau: 0.03, amp: 0.6 });
      s.tone(0.005, {
        dur: 0.45,
        f: (x) => {
          const t = x * 0.45;
          return 330 * (1 + 0.12 * Math.exp(-t / 0.1) * Math.sin(TAU * 18 * t));
        },
        harm: [1, 0.35, 0.15],
        attack: 0.003,
        tau: 0.12,
        amp: 0.25,
      });
      s.modal(0, r.range(680, 740), [[1, 0.3, 0.25], [2.7, 0.2, 0.15]]);
      s.noise(0.02, { dur: 0.14, color: 'pink', type: 'bp', f: 800, f2: 2000, q: 1.2, env: (x) => swell(x, 0.4, 1.5), amp: 0.18 });
      s.lowpass(7000);
    },
  },
  'blender-button': {
    dur: 0.16,
    loud: -6,
    render: (s) => {
      s.click(0, { f: 1800, q: 1.2, amp: 0.55 });
      s.thump(0, { f0: 270, f1: 200, tau: 0.02, amp: 0.5 });
      s.click(0.06, { f: 2400, q: 1.5, amp: 0.3 });
      s.lowpass(7000);
    },
  },
  'fryer-drop': {
    dur: 1.5,
    loud: 0,
    voices: 3,
    render: (s) => {
      s.click(0, { f: 3500, q: 1.5, amp: 0.3 });
      s.modal(0, s.rng.range(860, 940), [[1, 0.3, 0.15], [2.3, 0.25, 0.1], [3.8, 0.15, 0.06]]);
      s.noise(0.01, { dur: 1.35, type: 'hp', f: 2400, q: 0.7, attack: 0.025, tau: 0.38, flutter: { rate: 30, depth: 0.35 }, amp: 0.45 });
      s.noise(0.01, { dur: 1.0, color: 'pink', type: 'bp', f: 800, q: 0.8, attack: 0.02, tau: 0.3, flutter: { rate: 25, depth: 0.5 }, amp: 0.25 });
      s.crackle(0.015, { span: 1.2, count: 240, f: [2000, 8000], q: 1.1, amp: 0.35, skew: 2.2 });
      s.lowpass(10000);
    },
  },
  'fryer-lift': {
    dur: 1.1,
    loud: -3,
    voices: 3,
    render: (s) => {
      const r = s.rng;
      for (let k = 0; k < 3; k++)
        s.modal(k * 0.05 + r.next() * 0.03, r.range(820, 1100), [[1, 0.2, 0.08], [2.3, 0.15, 0.05], [3.8, 0.08, 0.03]], { amp: 1 - k * 0.25 });
      s.noise(0, { dur: 0.95, type: 'hp', f: 2600, q: 0.7, attack: 0.01, tau: 0.25, flutter: { rate: 30, depth: 0.4 }, amp: 0.3 });
      s.crackle(0.02, { span: 0.9, count: 80, f: [2000, 7000], q: 1.1, amp: 0.25, skew: 2 });
      for (let k = 0; k < 3; k++) s.bubble(0.3 + r.next() * 0.5, { f: r.range(1200, 2000), rise: 0.7, tau: 0.02, amp: 0.12 });
      s.lowpass(9500);
    },
  },
  ignite: {
    dur: 0.95,
    loud: -2,
    voices: 3,
    render: (s) => {
      const r = s.rng;
      for (let k = 0; k < 3; k++) s.click(k * 0.07 + Math.max(0, r.bi() * 0.008), { f: r.range(4000, 5000), q: 3, amp: 0.4, dur: 0.0008 });
      s.noise(0.16, { dur: 0.7, color: 'pink', type: 'lp', fcurve: (x) => 280 + 1300 * swell(x, 0.25, 1.5), q: 0.8, env: (x) => swell(x, 0.15, 1.6), amp: 0.7 });
      s.thump(0.17, { f0: 85, f1: 60, drop: 0.05, tau: 0.12, amp: 0.4, attack: 0.03 });
      s.crackle(0.2, { span: 0.4, count: 6, f: [1500, 3500], q: 2, amp: 0.12 });
      s.lowpass(7000);
    },
  },
  bell: {
    dur: 2.2,
    loud: -3,
    voices: 3,
    render: (s) => {
      const f = s.rng.range(1520, 1600);
      s.modal(
        0,
        f,
        [[1, 1, 1.1], [1.0045, 0.6, 1.0], [2.32, 0.45, 0.6], [2.335, 0.25, 0.55], [4.25, 0.18, 0.28], [6.63, 0.07, 0.15]],
        { amp: 0.55, attack: 0.0006 },
      );
      s.click(0, { f: 6000, q: 2, amp: 0.2, dur: 0.0012 });
      s.thump(0, { f0: 900, f1: 700, tau: 0.008, amp: 0.1 });
      s.lowpass(10000);
    },
  },
  trash: {
    dur: 0.85,
    loud: -4,
    render: (s) => {
      s.thump(0, { f0: 150, f1: 110, tau: 0.03, amp: 0.45 });
      s.click(0, { f: 2400, q: 1.5, amp: 0.25 });
      s.crackle(0.02, { span: 0.35, count: 32, f: [1500, 6000], q: 1.5, amp: 0.3 });
      s.noise(0.02, { dur: 0.36, type: 'bp', f: 2500, q: 0.8, env: (x) => swell(x, 0.2, 1.5), flutter: { rate: 50, depth: 0.7 }, amp: 0.2 });
      s.thump(0.26, { f0: 115, f1: 80, drop: 0.015, tau: 0.05, amp: 0.6 });
      s.click(0.5, { f: 2200, q: 1.6, amp: 0.3 });
      s.thump(0.5, { f0: 210, f1: 160, tau: 0.025, amp: 0.3 });
      s.lowpass(8000);
    },
  },

  // --- magic / feedback -------------------------------------------------------------------------
  sparkle: {
    dur: 1.0,
    loud: -5,
    voices: 4,
    pv: 0.3,
    render: (s) => {
      const r = s.rng;
      const root = r.pick([84, 86, 88]);
      const steps = [0, 2, 4, 7, 9, 12, 14, 16];
      const n = r.int(5, 7);
      const first = r.int(0, 1);
      let t = 0;
      for (let k = 0; k < n; k++) {
        const f = midiToHz(root + steps[Math.min(steps.length - 1, first + k)]);
        s.fm(t, { f, ratio: 3.5, index: 1.1, indexTau: 0.03, tau: 0.16, amp: 0.3 * (1 - k * 0.06), attack: 0.0015 });
        s.modal(t, f, [[1, 0.12, 0.3]]);
        t += r.range(0.035, 0.05);
      }
      s.noise(0.02, { dur: 0.7, type: 'hp', f: 6500, q: 0.7, env: (x) => swell(x, 0.25, 2), amp: 0.06 });
      s.lowpass(12000);
    },
  },
  combine: {
    dur: 1.0,
    loud: -3,
    voices: 3,
    pv: 0.3,
    render: (s) => {
      const r = s.rng;
      s.tone(0, { dur: 0.2, f: (x) => 300 * Math.pow(3.2, x), harm: [1, 0.3, 0.1], env: (x) => swell(x, 0.6, 1.5), amp: 0.35 });
      const root = r.pick([72, 74, 76]);
      [0, 4, 7, 12].forEach((iv, k) => s.modal(0.18 + k * 0.018, midiToHz(root + iv), BAR, { amp: 0.22, attack: 0.001 }));
      for (let k = 0; k < 3; k++)
        s.fm(0.3 + k * 0.06, { f: midiToHz(root + 24 + [0, 4, 7][k]), ratio: 3.5, index: 0.8, indexTau: 0.03, tau: 0.12, amp: 0.12 });
      s.lowpass(11000);
    },
  },
  magic: {
    dur: 1.45,
    loud: -4,
    voices: 2,
    pv: 0.3,
    render: (s) => {
      const r = s.rng;
      const root = r.pick([79, 81, 84]);
      const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
      let t = 0;
      for (let k = 0; k < 10; k++) {
        s.fm(t, { f: midiToHz(root + steps[k]), ratio: 2.01, index: 1.4, indexTau: 0.05, tau: 0.28, amp: 0.2, attack: 0.002 });
        t += 0.07 * (1 - k * 0.04);
      }
      s.noise(0, { dur: 1.3, type: 'bp', f: 3500, f2: 7000, q: 0.7, env: (x) => swell(x, 0.45, 1.5), am: { rate: 9, depth: 0.5 }, amp: 0.12 });
      [0, 7, 12].forEach((iv) =>
        s.tone(0.55, { dur: 0.85, f: midiToHz(root - 12 + iv), harm: [1, 0.15], attack: 0.12, tau: 0.35, amp: 0.1, vib: { rate: 5, depth: 0.08 } }),
      );
      s.lowpass(12000);
    },
  },
  discover: {
    dur: 1.6,
    loud: -1,
    voices: 1,
    pv: 0.15,
    gv: 0.5,
    render: (s) => {
      const r = s.rng;
      const arp = [79, 84, 88, 91];
      arp.forEach((m, k) => {
        mar(s, k * 0.09, m, 0.45);
        s.modal(k * 0.09, midiToHz(m + 12), BAR, { amp: 0.12 });
      });
      const tc = 0.42;
      [84, 88, 91, 96].forEach((m, k) => {
        s.modal(tc + k * 0.012, midiToHz(m), BAR, { amp: 0.2 });
        mar(s, tc, m - 12, 0.25, 0.6);
      });
      s.tone(tc, { dur: 1.1, f: midiToHz(72), harm: [1, 0.3, 0.1], attack: 0.03, tau: 0.45, amp: 0.15 });
      s.tone(tc, { dur: 1.1, f: midiToHz(79), harm: [1, 0.2], attack: 0.03, tau: 0.45, amp: 0.1 });
      for (let k = 0; k < 7; k++)
        s.fm(tc + 0.08 + r.next() * 0.65, { f: midiToHz(r.pick([96, 98, 100, 103, 105, 108])), ratio: 3.5, index: 0.9, indexTau: 0.025, tau: 0.1, amp: 0.08 });
      s.noise(tc, { dur: 0.9, type: 'hp', f: 7000, q: 0.7, env: (x) => swell(x, 0.15, 2), amp: 0.04 });
      s.lowpass(12000);
    },
  },

  // --- food fx ------------------------------------------------------------------------------------
  squeeze: {
    dur: 0.5,
    loud: -4,
    render: (s) => {
      const r = s.rng;
      let t = 0.01;
      const n = r.int(6, 9);
      for (let k = 0; k < n; k++) {
        const d = r.range(0.015, 0.035);
        s.noise(t, { dur: d, type: 'bp', f: r.range(800, 1200), q: 1.6, attack: 0.002, tau: d * 0.5, amp: r.range(0.3, 0.55) });
        t += d * r.range(0.6, 1.2) * (1 - k * 0.05);
      }
      s.noise(0, { dur: Math.min(0.45, t + 0.08), type: 'hp', f: 2500, q: 0.7, env: (x) => swell(x, 0.2, 1.5), amp: 0.1 });
      s.crackle(0.02, { span: t, count: 5, f: [900, 2200], q: 2.5, amp: 0.15 });
      s.lowpass(7000);
    },
  },
  shake: {
    dur: 0.5,
    loud: -6,
    render: (s) => {
      const r = s.rng;
      const gap = r.range(0.12, 0.14);
      for (let k = 0; k < 3; k++) {
        const t = k * gap;
        s.crackle(t, { span: 0.05, count: 14, f: [3500, 8000], q: 1.2, amp: k === 1 ? 0.3 : 0.24, dur: [0.0006, 0.002] });
        s.noise(t, { dur: 0.06, type: 'hp', f: 4000, q: 0.7, attack: 0.006, tau: 0.02, amp: 0.12 });
      }
      s.lowpass(11000);
    },
  },
  spray: {
    dur: 0.42,
    loud: -5,
    render: (s) => {
      s.noise(0, { dur: 0.38, type: 'bp', f: 6200, q: 0.6, hp: 2500, attack: 0.012, hold: 0.18, tau: 0.06, flutter: { rate: 40, depth: 0.15 }, amp: 0.5 });
      s.noise(0, { dur: 0.05, type: 'bp', f: 1500, q: 1, attack: 0.002, tau: 0.012, amp: 0.15 });
      s.lowpass(12000);
    },
  },
  sprinkle: {
    dur: 0.75,
    loud: -6,
    render: (s) => {
      const r = s.rng;
      s.crackle(0.005, { span: 0.62, count: r.int(18, 28), f: [3000, 9000], q: 4, amp: 0.25, dur: [0.0005, 0.0015], skew: 1.6 });
      for (let k = 0; k < 4; k++) s.modal(r.next() * 0.5, r.range(4000, 7000), [[1, 0.05, 0.02]]);
      s.lowpass(12000);
    },
  },
  plop: {
    dur: 0.36,
    loud: -3,
    render: (s) => {
      const r = s.rng;
      s.thump(0, { f0: 130, f1: 90, tau: 0.02, amp: 0.25 });
      s.bubble(0.004, { f: r.range(260, 320), rise: 1.0, tau: 0.06, amp: 0.8 });
      for (let k = 0; k < 3; k++) s.bubble(0.08 + r.next() * 0.15, { f: r.range(1000, 1600), rise: 0.7, tau: 0.012, amp: 0.12 });
      s.lowpass(6000);
    },
  },
  bubble: {
    dur: 0.25,
    loud: -5,
    pv: 2,
    render: (s) => {
      const r = s.rng;
      s.bubble(0, { f: r.range(350, 700), rise: r.range(0.5, 0.9), tau: 0.04, amp: 0.7 });
      if (r.chance(0.6)) s.bubble(r.range(0.04, 0.08), { f: r.range(600, 1000), rise: 0.7, tau: 0.025, amp: 0.35 });
      s.lowpass(5000);
    },
  },
  ice: {
    dur: 0.55,
    loud: -5,
    render: (s) => {
      const r = s.rng;
      const n = r.int(2, 3);
      let t = 0;
      for (let k = 0; k < n; k++) {
        s.modal(t, r.range(2400, 3600), GLASS, { amp: 0.6 * (1 - k * 0.25) });
        s.click(t, { f: 5000, q: 1.5, amp: 0.15 * (1 - k * 0.25) });
        s.thump(t, { f0: 420, f1: 380, tau: 0.008, amp: 0.1 });
        t += r.range(0.06, 0.11);
      }
      s.crackle(0, { span: 0.3, count: 5, f: [3000, 7000], q: 2, amp: 0.08 });
      s.lowpass(11000);
    },
  },
  freeze: {
    dur: 1.25,
    loud: -4,
    voices: 2,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 1.1, type: 'hp', f: 4500, q: 0.6, env: (x) => swell(x, 0.2, 1.5), amp: 0.15 });
      s.crackle(0.05, { span: 0.9, count: 40, f: [4000, 9000], q: 1.6, amp: 0.12 });
      [100, 98, 96, 93, 91, 88].forEach((m, k) =>
        s.modal(0.05 + k * 0.09 + r.bi() * 0.01, midiToHz(m), [[1, 0.2, 0.18], [2.32, 0.06, 0.08]], { amp: 1 - k * 0.08 }),
      );
      s.tone(0, { dur: 0.6, f: (x) => 300 - 120 * x, harm: [1, 0.2], attack: 0.04, tau: 0.2, amp: 0.15 });
      s.lowpass(12000);
    },
  },
  'steam-hiss': {
    dur: 0.95,
    loud: -5,
    render: (s) => {
      s.noise(0, { dur: 0.9, type: 'hp', f: 2200, q: 0.6, lp: 9000, env: (x) => swell(x, 0.12, 1.3), flutter: { rate: 12, depth: 0.25 }, amp: 0.5 });
      s.noise(0, { dur: 0.6, type: 'bp', f: 3500, q: 2, env: (x) => swell(x, 0.2, 2), amp: 0.08 });
    },
  },
  fire: {
    dur: 0.95,
    loud: -3,
    voices: 3,
    render: (s) => {
      s.noise(0, { dur: 0.85, color: 'brown', type: 'lp', fcurve: (x) => 250 + 1400 * swell(x, 0.3, 1.5), q: 0.7, env: (x) => swell(x, 0.12, 1.4), amp: 0.7 });
      s.noise(0, { dur: 0.7, color: 'pink', type: 'bp', f: 900, q: 0.7, env: (x) => swell(x, 0.2, 1.6), flutter: { rate: 20, depth: 0.5 }, amp: 0.25 });
      s.crackle(0.05, { span: 0.6, count: 10, f: [1500, 4000], q: 2, amp: 0.25 });
      s.thump(0, { f0: 75, f1: 55, tau: 0.2, amp: 0.3, attack: 0.04 });
      s.lowpass(6000);
    },
  },
  poof: {
    dur: 0.5,
    loud: -4,
    render: (s) => {
      s.noise(0, { dur: 0.42, color: 'pink', type: 'lp', f: 1500, f2: 450, q: 0.8, attack: 0.006, tau: 0.09, amp: 0.8 });
      s.blip(0, { f0: 230, f1: 120, glide: 0.04, dur: 0.15, tau: 0.05, attack: 0.004, amp: 0.25 });
      s.lowpass(4500);
    },
  },
  'explode-pop': {
    dur: 1.1,
    loud: 1,
    voices: 2,
    render: (s) => {
      const r = s.rng;
      s.thump(0, { f0: 130, f1: 45, drop: 0.05, tau: 0.17, amp: 1 });
      s.noise(0, { dur: 0.6, color: 'pink', type: 'lp', f: 2600, f2: 380, q: 0.8, attack: 0.002, tau: 0.12, amp: 0.8 });
      s.click(0, { f: 2000, q: 1.2, amp: 0.4 });
      s.blip(0.005, { f0: 620, f1: 200, glide: 0.03, dur: 0.12, tau: 0.04, amp: 0.3 });
      s.crackle(0.08, { span: 0.6, count: 30, f: [2500, 7000], q: 1.5, amp: 0.12, skew: 1.5 });
      for (let k = 0; k < 4; k++)
        s.fm(0.15 + r.next() * 0.4, { f: midiToHz(r.pick([88, 91, 96, 100])), ratio: 3.5, index: 0.8, indexTau: 0.02, tau: 0.08, amp: 0.06 });
      s.lowpass(8000);
    },
  },
  popcorn: {
    dur: 0.13,
    loud: -4,
    variants: 6,
    voices: 8,
    pv: 2,
    render: (s) => {
      const r = s.rng;
      s.click(0, { f: r.range(1400, 2600), q: 1.5, amp: 0.8, dur: 0.0025 });
      s.noise(0, { dur: 0.02, type: 'bp', f: r.range(1500, 2200), q: 1, attack: 0.0004, tau: 0.004, amp: 0.45 });
      s.blip(0, { f0: r.range(650, 800), f1: 420, glide: 0.006, dur: 0.04, tau: 0.012, attack: 0.0005, amp: 0.25 });
      s.lowpass(8000);
    },
  },

  // --- eating (Mochi) -----------------------------------------------------------------------------
  crunch: {
    dur: 0.4,
    loud: -2,
    variants: 4,
    render: (s) => {
      const r = s.rng;
      const n = r.int(5, 8);
      for (let k = 0; k < n; k++) {
        const t = Math.pow(r.next(), 1.3) * 0.2;
        const d = r.range(0.006, 0.016);
        s.noise(t, { dur: d, type: 'bp', f: r.range(1200, 4500), q: 1.0, attack: 0.0003, tau: d * 0.3, amp: r.range(0.25, 0.6) * (1 - t * 2.5) });
      }
      s.crackle(0, { span: 0.18, count: 12, f: [2500, 7000], q: 1.5, amp: 0.25, skew: 1.5 });
      s.thump(0, { f0: 150, f1: 100, tau: 0.03, amp: 0.4 });
      s.lowpass(9000);
    },
  },
  chew: {
    dur: 0.95,
    loud: -5,
    render: (s) => {
      const r = s.rng;
      let t = 0;
      for (let k = 0; k < 3; k++) {
        s.noise(t, { dur: 0.15, color: 'pink', type: 'lp', f: r.range(1300, 1600), f2: 380, q: 2.6, attack: 0.02, tau: 0.04, amp: 0.5 * (1 - k * 0.1) });
        s.blip(t + 0.01, { f0: 300, f1: 180, glide: 0.04, dur: 0.1, tau: 0.03, attack: 0.01, amp: 0.15 });
        s.crackle(t + 0.01, { span: 0.08, count: 3, f: [800, 2000], q: 2.5, amp: 0.1 });
        t += r.range(0.26, 0.31);
      }
      s.lowpass(4500);
    },
  },
  gulp: {
    dur: 0.42,
    loud: -4,
    render: (s) => {
      s.tone(0, { dur: 0.09, f: (x) => 190 + 260 * x, harm: [1, 0.25], attack: 0.006, tau: 0.04, amp: 0.55 });
      s.noise(0, { dur: 0.09, color: 'pink', type: 'bp', f: 300, f2: 550, q: 4, attack: 0.006, tau: 0.03, amp: 0.3 });
      s.thump(0.08, { f0: 120, f1: 70, drop: 0.03, tau: 0.05, amp: 0.65 });
      s.noise(0.08, { dur: 0.08, color: 'pink', type: 'lp', f: 600, q: 3, attack: 0.003, tau: 0.02, amp: 0.3 });
      s.lowpass(3500);
    },
  },
  slurp: {
    dur: 0.65,
    loud: -4,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.5, type: 'bp', f: 420, f2: 2600, q: 4, env: (x) => swell(x, 0.4, 1), flutter: { rate: 35, depth: 0.65 }, amp: 0.55 });
      for (let k = 0; k < 4; k++) s.bubble(0.25 + r.next() * 0.3, { f: r.range(500, 1100), rise: 0.8, tau: 0.02, amp: 0.15 });
      s.lowpass(6500);
    },
  },
  lick: {
    dur: 0.22,
    loud: -6,
    render: (s) => {
      s.noise(0, { dur: 0.09, type: 'bp', f: 1800, f2: 900, q: 3, attack: 0.012, tau: 0.03, amp: 0.4 });
      s.blip(0.01, { f0: 600, f1: 950, glide: 0.03, dur: 0.08, tau: 0.03, attack: 0.008, amp: 0.15 });
      s.click(0.09, { f: 2500, q: 2, amp: 0.15 });
      s.lowpass(7000);
    },
  },
  burp: { dur: 0.7, loud: -3, voices: 2, pv: 0.8, render: (s) => void s.mix(vocal(s, 'burp'), 0) },
  cough: { dur: 0.7, loud: -4, voices: 2, pv: 0.8, render: (s) => void s.mix(vocal(s, 'cough'), 0) },
  sniff: {
    dur: 0.45,
    loud: -6,
    render: (s) => {
      const r = s.rng;
      s.noise(0, { dur: 0.12, type: 'bp', f: r.range(2000, 2400), q: 1.3, lp: 5000, env: (x) => swell(x, 0.75, 1), amp: 0.35 });
      s.noise(0.19, { dur: 0.1, type: 'bp', f: r.range(2200, 2600), q: 1.3, lp: 5000, env: (x) => swell(x, 0.7, 1), amp: 0.42 });
      s.peaking(900, 1.2, -6);
    },
  },
  chomp: {
    dur: 0.36,
    loud: -2,
    render: (s) => {
      const r = s.rng;
      s.click(0, { f: r.range(3200, 3800), q: 2, amp: 0.55, dur: 0.0012 });
      s.modal(0, r.range(2500, 2700), [[1, 0.18, 0.015]]);
      s.thump(0.004, { f0: 185, f1: 100, drop: 0.015, tau: 0.03, amp: 0.6 });
      s.noise(0.004, { dur: 0.07, type: 'bp', f: 1500, q: 0.8, attack: 0.001, tau: 0.02, amp: 0.4 });
      s.crackle(0.006, { span: 0.04, count: 4, f: [1500, 4000], q: 1.8, amp: 0.3 });
      s.noise(0.1, { dur: 0.04, color: 'pink', type: 'lp', f: 900, q: 1, attack: 0.004, tau: 0.01, amp: 0.2 });
      s.lowpass(9000);
    },
  },
  hiccup: { dur: 0.35, loud: -4, voices: 2, pv: 0.8, render: (s) => void s.mix(vocal(s, 'hiccup'), 0) },

  // --- ui ---------------------------------------------------------------------------------------------
  'ui-open': {
    dur: 0.42,
    loud: -7,
    pv: 0.2,
    render: (s) => {
      mar(s, 0, 84, 0.5, 0.3);
      mar(s, 0.075, 91, 0.45, 0.3);
      s.noise(0, { dur: 0.16, type: 'bp', f: 1500, f2: 3200, q: 1.2, env: (x) => swell(x, 0.5, 1.5), amp: 0.05 });
    },
  },
  'ui-close': {
    dur: 0.42,
    loud: -8,
    pv: 0.2,
    render: (s) => {
      mar(s, 0, 91, 0.45, 0.3);
      mar(s, 0.075, 84, 0.5, 0.3);
      s.noise(0, { dur: 0.16, type: 'bp', f: 3200, f2: 1500, q: 1.2, env: (x) => swell(x, 0.5, 1.5), amp: 0.05 });
    },
  },
  page: {
    dur: 0.38,
    loud: -6,
    render: (s) => {
      const r = s.rng;
      [0, 0.045, 0.085, 0.12].forEach((t, k) =>
        s.noise(Math.max(0, t + r.bi() * 0.005), { dur: 0.05, type: 'bp', f: r.range(2600, 3600), q: 0.8, attack: 0.004, tau: 0.012, amp: 0.4 * (1 - k * 0.15) }),
      );
      s.noise(0.14, { dur: 0.2, type: 'bp', f: 3000, f2: 1800, q: 0.8, env: (x) => swell(x, 0.3, 1.5), amp: 0.2 });
      s.crackle(0, { span: 0.25, count: 8, f: [2500, 7000], q: 1.5, amp: 0.08 });
      s.lowpass(10000);
    },
  },
  camera: {
    dur: 0.36,
    loud: -5,
    render: (s) => {
      s.click(0, { f: 3000, q: 2, amp: 0.55 });
      s.tone(0.003, { dur: 0.05, f: 180, harm: [1, 0, 0.33, 0, 0.2, 0, 0.14], attack: 0.002, hold: 0.03, tau: 0.02, amp: 0.12 });
      s.click(0.075, { f: 2400, q: 1.8, amp: 0.45 });
      s.thump(0.075, { f0: 420, f1: 300, tau: 0.01, amp: 0.15 });
      s.tone(0.1, { dur: 0.14, f: (x) => 800 * Math.pow(2, x), harm: [1, 0.3], env: (x) => Math.sin(Math.PI * x), amp: 0.04 });
      s.lowpass(9000);
    },
  },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/** Renders one variant of a sound effect (mono, normalised). */
export function renderSfx(name: SfxName, sr: number, seed: number): Float32Array {
  const spec = SFX[name];
  if (!spec) return new Float32Array(1);
  const rng = new Rng(seed * 4099 + hashName(name));
  const s = new Sig(sr, spec.dur, rng);
  spec.render(s);
  dcBlock(s.d, sr, 12);
  fadeIn(s.d, Math.max(2, Math.round(0.0003 * sr)));
  const out = trimTail(s.d, sr, -60, 0.005);
  normalizeLoudness(out, sr, SFX_REF_DB + (spec.loud ?? 0), SFX_PEAK_CAP);
  return out;
}
