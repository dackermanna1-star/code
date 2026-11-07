// =============================================================================
// FOLEY LIBRARY - every one-shot sound of the experience, synthesised offline
// (once, lazily, cached per AudioContext) from physical building blocks:
// modal resonators for impacts on moulded plastic / composite / aluminium,
// filtered noise for air and friction, stick-slip creaks, crackles, bubbles.
//
//   def = { dur, level (playback gain), variants, build(b: SynthBuf, v: variant, rand) }
//
// Public vocabulary (ARCHITECTURE §6) + internal names used by the aircraft
// sound engine (prefixed by convention with a domain: gear_, td_, ptu ...).
// =============================================================================
import { SynthBuf } from './dsp.js';

// ---- material presets (frequency, amplitude, decay[s]) --------------------------------------
const PLASTIC_PANEL = [[210, 0.7, 0.07], [365, 0.5, 0.05], [640, 0.35, 0.035], [1120, 0.22, 0.022], [1900, 0.12, 0.012]];
const PLASTIC_SMALL = [[520, 0.6, 0.035], [1150, 0.45, 0.025], [2300, 0.3, 0.013], [3700, 0.15, 0.007]];
const LATCH = [[1800, 0.5, 0.018], [3100, 0.38, 0.011], [4800, 0.22, 0.007], [7200, 0.1, 0.004]];
const TICK = [[3200, 0.5, 0.008], [5100, 0.4, 0.005], [7600, 0.2, 0.003]];
const BUCKLE = [[2900, 0.5, 0.05], [4400, 0.42, 0.04], [6800, 0.3, 0.026], [9100, 0.15, 0.016], [11800, 0.07, 0.01]];
const STEEL = [[880, 0.4, 0.09], [1750, 0.32, 0.07], [3300, 0.22, 0.05], [5100, 0.12, 0.03]];
const DOOR_HEAVY = [[150, 0.6, 0.16], [330, 0.45, 0.1], [710, 0.3, 0.06], [1500, 0.16, 0.035]];
const COMPOSITE = [[290, 0.55, 0.035], [600, 0.38, 0.027], [1120, 0.22, 0.018], [2250, 0.1, 0.009]];

const scale = (list, k) => list.map(([f, a, d]) => [f * k, a, d]);

export const FOLEY = {
  // --------------------------------------------------------------------------- bins (Sky Interior pivot bins)
  bin_open: {
    dur: 1.25, level: 0.85, variants: 2,
    build(b) {
      b.modes(0, TICK, 0.45).noise(0, 0.01, { gain: 0.25, decay: 0.002, hp: 2000 });
      b.modes(0.035, LATCH, 0.7).thump(0.035, { f0: 320, f1: 210, decay: 0.02, gain: 0.35 });
      b.noise(0.08, 0.85, { env: 'swell', color: 'pink', bp: 480, bpq: 0.7, gain: 0.35, curve: 0.8 });
      b.creak(0.12, 0.66, { rate: 38, rateEnd: 19, res: [[420, 6], [980, 8], [2100, 9]], gain: 0.13 });
      b.thump(0.9, { f0: 150, f1: 90, decay: 0.05, gain: 0.65, click: 0.1 });
      b.modes(0.9, PLASTIC_PANEL, 0.45);
      b.crackle(0.905, 0.14, { density: 500, bp: 1800, gain: 0.16, env: 'decay' });
      b.modes(1.02, scale(PLASTIC_PANEL, 1.07), 0.08);
    },
  },
  bin_close: {
    dur: 0.95, level: 1.0, variants: 2,
    build(b) {
      b.noise(0, 0.38, { env: 'swell', color: 'pink', bp: 420, bpq: 0.7, gain: 0.35, curve: 1.6 });
      b.creak(0.02, 0.3, { rate: 30, rateEnd: 45, res: [[420, 6], [980, 8]], gain: 0.08 });
      b.thump(0.38, { f0: 170, f1: 68, decay: 0.075, gain: 1.0, click: 0.35, clickLp: 3500 });
      b.modes(0.38, scale(PLASTIC_PANEL, 0.92), 0.85);
      b.modes(0.384, LATCH, 0.6);
      b.crackle(0.39, 0.17, { density: 700, bp: 2200, gain: 0.2, env: 'decay' });
      b.modes(0.43, scale(LATCH, 1.12), 0.12);
    },
  },
  // --------------------------------------------------------------------------- tray tables
  tray_open: {
    dur: 0.65, level: 0.75, variants: 2,
    build(b) {
      b.modes(0, scale(TICK, 0.8), 0.45).noise(0.0, 0.06, { gain: 0.06, bp: 2400, decay: 0.02 });
      b.noise(0.1, 0.22, { env: 'swell', color: 'pink', bp: 900, gain: 0.12 });
      b.thump(0.31, { f0: 170, f1: 100, decay: 0.03, gain: 0.45, click: 0.25 });
      b.modes(0.31, PLASTIC_SMALL, 0.85);
      b.modes(0.4, scale(PLASTIC_SMALL, 1.04), 0.2);
      b.crackle(0.315, 0.1, { density: 400, bp: 2600, gain: 0.08, env: 'decay' });
    },
  },
  tray_close: {
    dur: 0.55, level: 0.75, variants: 2,
    build(b) {
      b.noise(0, 0.2, { env: 'swell', color: 'pink', bp: 800, gain: 0.1 });
      b.modes(0.21, scale(PLASTIC_SMALL, 1.1), 0.6).thump(0.21, { f0: 200, f1: 130, decay: 0.02, gain: 0.3 });
      b.modes(0.29, scale(LATCH, 1.3), 0.6).noise(0.29, 0.01, { gain: 0.2, hp: 3000, decay: 0.002 });
    },
  },
  // --------------------------------------------------------------------------- seatbelt
  belt_buckle: {
    dur: 0.75, level: 0.7, variants: 2,
    build(b) {
      b.noise(0, 0.16, { env: 'swell', bp: 2600, bpq: 0.9, gain: 0.12 });
      b.modes(0.17, BUCKLE, 0.7).thump(0.17, { f0: 650, f1: 420, decay: 0.008, gain: 0.25, click: 0 });
      b.modes(0.205, scale(BUCKLE, 1.13), 0.5);
      b.noise(0.3, 0.32, { env: 'swell', bp: 3200, bpq: 1.3, gain: 0.07 });
    },
  },
  belt_unbuckle: {
    dur: 0.8, level: 0.7, variants: 2,
    build(b) {
      b.modes(0, scale(BUCKLE, 0.72), 0.7).noise(0, 0.01, { gain: 0.2, hp: 2500, decay: 0.002 });
      b.modes(0.05, scale(BUCKLE, 1.05), 0.35);
      b.modes(0.09, scale(BUCKLE, 0.95), 0.18);
      b.noise(0.14, 0.3, { env: 'swell', bp: 2800, bpq: 1.2, gain: 0.09 });
      b.thump(0.5, { f0: 220, f1: 130, decay: 0.03, gain: 0.3, click: 0.1 });
      b.modes(0.5, scale(BUCKLE, 0.6), 0.12);
    },
  },
  // --------------------------------------------------------------------------- small controls
  switch_click: {
    dur: 0.18, level: 0.6, variants: 2,
    build(b) {
      b.modes(0, TICK, 0.7).noise(0, 0.006, { gain: 0.3, hp: 2500, decay: 0.0015 });
      b.modes(0.075, scale(TICK, 1.15), 0.35);
    },
  },
  button_press: {
    dur: 0.2, level: 0.6, variants: 2,
    build(b) {
      b.thump(0, { f0: 420, f1: 260, decay: 0.012, gain: 0.35, click: 0.1 });
      b.modes(0, [[1900, 0.4, 0.012], [3300, 0.3, 0.008], [5200, 0.15, 0.004]], 0.55);
      b.modes(0.09, [[2200, 0.3, 0.008], [3600, 0.2, 0.005]], 0.25);
    },
  },
  gasper: {
    dur: 1.25, level: 0.55, variants: 2,
    build(b) {
      b.modes(0, [[2800, 0.4, 0.01], [4500, 0.3, 0.006]], 0.5);
      b.crackle(0, 0.08, { density: 900, bp: 3000, gain: 0.25, env: 'decay' });
      b.noise(0.04, 1.2, { hp: 1600, lp: 9000, gain: 0.22, env: (u) => Math.min(1, u * 4) * Math.min(1, (1 - u) * 5) });
      b.noise(0.04, 1.2, { bp: 3400, bpq: 4, gain: 0.05, env: (u) => Math.min(1, u * 3) * Math.min(1, (1 - u) * 5) });
    },
  },
  // --------------------------------------------------------------------------- window shades
  shade_down: {
    dur: 0.6, level: 0.6, variants: 2,
    build(b) {
      b.modes(0, scale(TICK, 0.7), 0.2);
      b.creak(0.02, 0.44, { rate: 900, jitter: 0.6, res: [[1800, 2], [3600, 3]], gain: 0.08, env: 'swell' });
      b.noise(0.02, 0.44, { env: 'flat', attack: 0.04, decay: 0.05, bp: 2500, bpq: 1.0, gain: 0.07 });
      b.modes(0.47, [[900, 0.5, 0.03], [1900, 0.4, 0.02], [3200, 0.25, 0.01]], 0.7);
      b.thump(0.47, { f0: 260, f1: 180, decay: 0.015, gain: 0.2, click: 0.1 });
    },
  },
  shade_up: {
    dur: 0.55, level: 0.6, variants: 2,
    build(b) {
      b.modes(0, [[1300, 0.3, 0.015], [2600, 0.2, 0.008]], 0.3);
      b.creak(0.03, 0.38, { rate: 1100, jitter: 0.6, res: [[2000, 2], [3900, 3]], gain: 0.07, env: 'swell' });
      b.noise(0.03, 0.38, { env: 'flat', attack: 0.04, decay: 0.05, bp: 2800, bpq: 1.0, gain: 0.07 });
      b.modes(0.42, [[1150, 0.45, 0.025], [2400, 0.35, 0.015], [3900, 0.2, 0.008]], 0.55);
    },
  },
  // --------------------------------------------------------------------------- lavatory
  lav_door: {
    dur: 0.95, level: 0.85, variants: 2,
    build(b) {
      b.modes(0, LATCH, 0.4);
      b.creak(0.05, 0.36, { rate: 45, res: [[380, 5], [950, 7]], gain: 0.1 });
      b.noise(0.05, 0.4, { env: 'swell', color: 'pink', bp: 520, gain: 0.25 });
      b.thump(0.44, { f0: 190, f1: 110, decay: 0.04, gain: 0.6, click: 0.2 });
      b.modes(0.44, [[260, 0.6, 0.05], [520, 0.45, 0.04], [1100, 0.3, 0.025], [2100, 0.15, 0.012]], 0.75);
      b.crackle(0.45, 0.18, { density: 450, bp: 2000, gain: 0.12, env: 'decay' });
    },
  },
  lav_lock: {
    dur: 0.35, level: 0.8, variants: 2,
    build(b) {
      b.noise(0, 0.12, { env: 'swell', bp: 2200, bpq: 1.4, gain: 0.2 });
      b.creak(0, 0.12, { rate: 500, res: [[1600, 3], [3100, 4]], gain: 0.05 });
      b.modes(0.12, [[1600, 0.5, 0.02], [2800, 0.45, 0.015], [4500, 0.3, 0.01]], 0.8);
      b.thump(0.12, { f0: 520, f1: 300, decay: 0.01, gain: 0.3, click: 0.2 });
      b.modes(0.155, scale(TICK, 0.6), 0.2);
    },
  },
  toilet_flush: {
    dur: 3.6, level: 1.0, variants: 1,
    build(b) {
      b.modes(0, [[1900, 0.4, 0.012], [3300, 0.3, 0.008]], 0.3);
      b.noise(0.12, 0.45, { hp: 3000, lp: 9000, gain: 0.12, env: 'swell' }); // rinse spray
      b.thump(0.32, { f0: 115, f1: 55, decay: 0.09, gain: 0.85, click: 0.4, clickLp: 1500 }); // valve opens
      b.modes(0.32, [[210, 0.4, 0.08], [470, 0.3, 0.05], [980, 0.2, 0.03]], 0.4);
      const sustain = (u) => Math.min(1, u * 22) * (u < 0.45 ? 1 : Math.exp(-(u - 0.45) * 7));
      b.noise(0.33, 2.2, { color: 'pink', hp: 140, lp: 7500, lpEnd: 1800, gain: 1.0, env: sustain }); // the WHOOSH
      b.noise(0.33, 2.2, { color: 'brown', lp: 320, gain: 0.9, env: sustain });
      b.noise(0.33, 1.6, { bp: 1350, bpq: 5, gain: 0.35, env: sustain });       // pipe whistle
      b.noise(0.36, 1.3, { bp: 620, bpq: 3, gain: 0.25, env: sustain });
      b.thump(1.95, { f0: 160, f1: 80, decay: 0.06, gain: 0.7, click: 0.3 }); // valve closes
      b.modes(1.95, [[700, 0.5, 0.05], [1400, 0.3, 0.03], [2600, 0.15, 0.015]], 0.35);
      b.noise(2.0, 1.3, { hp: 2200, gain: 0.05, decay: 0.35 });
      b.bubbles(2.05, 0.7, { rate: 50, fMin: 600, fMax: 2500, gain: 0.3 });
      b.saturate(1.3);
    },
  },
  tap_water: {
    dur: 2.4, level: 0.6, variants: 2,
    build(b) {
      b.modes(0, [[1500, 0.4, 0.02], [2900, 0.3, 0.012]], 0.4);
      const flow = (u, t) => Math.min(1, t / 0.08) * Math.min(1, (2.2 - t) / 0.18);
      b.noise(0.03, 2.15, { color: 'pink', bp: 2500, bpq: 0.5, gain: 0.32, env: flow });
      b.noise(0.03, 2.15, { hp: 4500, gain: 0.05, env: flow });
      b.bubbles(0.05, 2.1, { rate: 280, fMin: 600, fMax: 4200, gain: 0.55 });
      b.modes(2.2, [[1700, 0.35, 0.02], [3100, 0.25, 0.01]], 0.35);
    },
  },
  // --------------------------------------------------------------------------- galley
  drawer: {
    dur: 0.75, level: 0.8, variants: 2,
    build(b) {
      b.modes(0, STEEL, 0.45).thump(0, { f0: 260, f1: 170, decay: 0.015, gain: 0.25 });
      b.creak(0.03, 0.38, { rate: 230, jitter: 0.5, res: [[600, 3], [1500, 4], [3200, 5]], gain: 0.07 });
      b.noise(0.03, 0.38, { env: 'swell', bp: 1200, gain: 0.1 });
      b.thump(0.42, { f0: 230, f1: 140, decay: 0.04, gain: 0.55, click: 0.25 });
      b.modes(0.42, STEEL, 0.4);
      b.modes(0.44, [[3500, 0.3, 0.07], [5200, 0.25, 0.05], [6900, 0.12, 0.04]], 0.22);
      b.modes(0.47, [[3900, 0.25, 0.06], [5800, 0.18, 0.04]], 0.12);
    },
  },
  cart: {
    dur: 2.5, level: 0.8, variants: 2,
    build(b) {
      b.modes(0, [[700, 0.5, 0.04], [1500, 0.4, 0.03], [3000, 0.2, 0.015]], 0.5).thump(0, { f0: 200, f1: 120, decay: 0.03, gain: 0.4 });
      const roll = (u, t) => Math.min(1, t / 0.3) * Math.min(1, (2.05 - t) / 0.35);
      b.noise(0.1, 1.95, { color: 'brown', lp: 220, gain: 0.32, env: roll });
      b.creak(0.1, 1.95, { rate: 22, jitter: 0.6, res: [[180, 3], [420, 4], [900, 6]], gain: 0.15, env: 'swell' });
      b.crackle(0.12, 1.9, { density: 110, bp: 3000, gain: 0.22, env: 'swell' });
      for (let i = 0; i < 9; i++) b.modes(0.2 + b.rand() * 1.7, scale([[2600, 0.3, 0.06], [4100, 0.2, 0.045], [6300, 0.1, 0.03]], 0.8 + b.rand() * 0.5), 0.1 + b.rand() * 0.12);
      b.modes(2.1, [[650, 0.5, 0.04], [1400, 0.4, 0.03]], 0.5).thump(2.1, { f0: 190, f1: 110, decay: 0.035, gain: 0.45 });
    },
  },
  oven_door: {
    dur: 0.8, level: 0.8, variants: 2,
    build(b) {
      b.modes(0, [[900, 0.5, 0.06], [2100, 0.4, 0.04], [3600, 0.25, 0.025]], 0.55).thump(0, { f0: 240, f1: 150, decay: 0.03, gain: 0.4 });
      b.creak(0.07, 0.32, { rate: 55, res: [[700, 6], [1700, 8]], gain: 0.08 });
      b.thump(0.42, { f0: 170, f1: 100, decay: 0.05, gain: 0.6, click: 0.2 });
      b.modes(0.42, [[500, 0.4, 0.1], [1250, 0.3, 0.07], [2700, 0.2, 0.04], [4300, 0.1, 0.02]], 0.5);
    },
  },
  // --------------------------------------------------------------------------- doors
  cabin_door: {
    dur: 3.8, level: 1.0, variants: 1,
    build(b) {
      b.creak(0, 0.6, { rate: 40, res: [[300, 4], [800, 5]], gain: 0.12 });
      b.modes(0.05, STEEL, 0.25);
      b.thump(0.62, { f0: 95, f1: 50, decay: 0.12, gain: 1.0, click: 0.3, clickLp: 1800 });
      b.modes(0.62, DOOR_HEAVY, 0.7);
      b.noise(0.7, 0.9, { env: 'swell', color: 'pink', lp: 900, gain: 0.35 });
      b.noise(0.9, 2.1, { env: 'swell', color: 'brown', lp: 220, gain: 0.5 });
      b.creak(0.95, 2.0, { rate: 25, rateEnd: 36, res: [[160, 4], [420, 5], [1100, 7]], gain: 0.1 });
      b.thump(3.02, { f0: 115, f1: 62, decay: 0.1, gain: 0.95, click: 0.3 });
      b.modes(3.02, [[230, 0.4, 0.12], [610, 0.3, 0.08], [1500, 0.2, 0.04], [2900, 0.1, 0.02]], 0.6);
      b.modes(3.12, LATCH, 0.2);
    },
  },
  cockpit_knock: {
    dur: 0.8, level: 0.9, variants: 2,
    build(b) {
      const ts = [0, 0.19 + b.rand() * 0.02, 0.385 + b.rand() * 0.03];
      ts.forEach((t, i) => {
        const g = i === 2 ? 0.9 : 1;
        b.thump(t, { f0: 270, f1: 175, decay: 0.022, gain: 0.9 * g, click: 0.22, clickLp: 3000 });
        b.modes(t, scale(COMPOSITE, 1 + b.rand() * 0.04), 0.65 * g);
      });
    },
  },
  // --------------------------------------------------------------------------- seats
  footstep: {
    dur: 0.25, level: 0.55, variants: 6,
    build(b) {
      b.thump(0, { f0: 105 + b.rand() * 20, f1: 62, decay: 0.035, gain: 0.85, click: 0.04, clickLp: 900 });
      b.noise(0.0, 0.16, { color: 'pink', lp: 1300, gain: 0.45, attack: 0.006, decay: 0.03 });
      b.noise(0.05, 0.1, { color: 'pink', bp: 1800, gain: 0.08, attack: 0.01, decay: 0.03 }); // heel-to-toe brush
      b.modes(0.002, [[92, 0.35, 0.06], [178, 0.3, 0.04], [330, 0.15, 0.025]], 0.3);   // floor panel flex
    },
  },
  footstep_vinyl: {
    dur: 0.25, level: 0.55, variants: 4,
    build(b) {
      b.thump(0, { f0: 160, f1: 95, decay: 0.025, gain: 0.6, click: 0.35, clickLp: 4500 });
      b.modes(0, [[420, 0.3, 0.02], [1100, 0.2, 0.012], [2400, 0.1, 0.006]], 0.35);
      b.noise(0.06, 0.06, { lp: 3000, gain: 0.12, decay: 0.012 });
    },
  },
  seat_sit: {
    dur: 0.9, level: 0.75, variants: 2,
    build(b) {
      b.noise(0, 0.38, { env: 'swell', color: 'pink', bp: 2100, gain: 0.12 });
      b.crackle(0, 0.38, { density: 140, bp: 2600, gain: 0.06 });
      b.noise(0.16, 0.5, { env: 'swell', color: 'brown', lp: 380, gain: 0.7, curve: 0.6 });
      b.thump(0.2, { f0: 92, f1: 58, decay: 0.07, gain: 0.7, click: 0 });
      b.creak(0.24, 0.26, { rate: 50, res: [[520, 5], [1300, 6]], gain: 0.1 });
      b.modes(0.36, scale(BUCKLE, 0.8), 0.06);
    },
  },
  seat_stand: {
    dur: 0.9, level: 0.7, variants: 2,
    build(b) {
      b.noise(0, 0.5, { env: 'swell', color: 'pink', bp: 2000, gain: 0.13 });
      b.crackle(0.02, 0.45, { density: 160, bp: 2400, gain: 0.06 });
      b.noise(0.12, 0.45, { env: 'swell', color: 'brown', lp: 300, gain: 0.35, curve: 1.4 });
      b.creak(0.2, 0.22, { rate: 45, res: [[480, 5], [1250, 6]], gain: 0.1 });
      b.modes(0.55, scale(BUCKLE, 0.75), 0.07);
    },
  },
  armrest: {
    dur: 0.45, level: 0.65, variants: 2,
    build(b) {
      b.creak(0, 0.12, { rate: 70, res: [[600, 5], [1500, 7]], gain: 0.08 });
      b.thump(0.12, { f0: 190, f1: 120, decay: 0.02, gain: 0.4, click: 0.2 });
      b.modes(0.12, [[320, 0.5, 0.04], [740, 0.35, 0.03], [1600, 0.2, 0.015], [3100, 0.08, 0.006]], 0.6);
      b.modes(0.125, scale(TICK, 0.55), 0.15);
    },
  },
  recline: {
    dur: 0.75, level: 0.65, variants: 2,
    build(b) {
      b.modes(0, [[2500, 0.4, 0.008], [3900, 0.3, 0.006]], 0.45);
      b.thump(0.05, { f0: 210, f1: 130, decay: 0.03, gain: 0.35, click: 0.1 });
      b.modes(0.05, [[600, 0.3, 0.03], [1300, 0.25, 0.02]], 0.35);
      b.creak(0.07, 0.45, { rate: 80, rateEnd: 40, res: [[450, 5], [1100, 6]], gain: 0.13 });
      b.noise(0.07, 0.45, { env: 'swell', bp: 800, gain: 0.05 });
      b.thump(0.53, { f0: 145, f1: 95, decay: 0.04, gain: 0.5, click: 0.1 });
      b.modes(0.53, PLASTIC_PANEL, 0.25);
    },
  },
  paper: {
    dur: 0.75, level: 0.55, variants: 3,
    build(b) {
      const d = 0.45 + b.rand() * 0.25;
      b.crackle(0, d, { density: 700 + b.rand() * 600, bp: 3200 + b.rand() * 1200, q: 0.7, gain: 0.85 });
      b.noise(0, d, { env: 'swell', color: 'pink', hp: 1400, gain: 0.08 });
      b.crackle(d * 0.3, d * 0.5, { density: 300, bp: 1600, q: 0.9, gain: 0.3 });
    },
  },
  // --------------------------------------------------------------------------- chimes (played through the PA)
  chime_pa: { dur: 2.8, level: 0.55, variants: 1, build(b) { chimeTone(b, 0, 880); chimeTone(b, 0.62, 740); } },
  chime_seatbelt: { dur: 2.4, level: 0.55, variants: 1, build(b) { chimeTone(b, 0, 659.3, 1.25); } },
  chime_call: { dur: 1.8, level: 0.5, variants: 1, build(b) { chimeTone(b, 0, 987.8, 0.85); } },
  chime_triple: { dur: 3.2, level: 0.5, variants: 1, build(b) { for (let i = 0; i < 3; i++) { chimeTone(b, i * 0.62, 880, 0.75); chimeTone(b, i * 0.62 + 0.3, 740, 0.75); } } },
  // PA handset key / unkey (very faint pop + carrier hiss) - authentic detail
  mic_key: {
    dur: 0.35, level: 0.22, variants: 2,
    build(b) { b.thump(0, { f0: 180, f1: 90, decay: 0.012, gain: 0.6, click: 0.4, clickLp: 3000 }); b.noise(0.01, 0.3, { bp: 1800, bpq: 0.6, gain: 0.05, decay: 0.12 }); },
  },
  // --------------------------------------------------------------------------- aircraft one-shots (internal)
  joint_thump: {           // tyre over a runway/taxiway joint or centreline light
    dur: 0.35, level: 1.0, variants: 4,
    build(b) {
      b.thump(0, { f0: 70 + b.rand() * 12, f1: 38, decay: 0.05, gain: 1.0, click: 0.05, clickLp: 600 });
      b.thump(0.018, { f0: 120, f1: 70, decay: 0.03, gain: 0.35, click: 0 });
      b.noise(0, 0.12, { color: 'brown', lp: 260, gain: 0.5, decay: 0.03 });
    },
  },
  touchdown: {
    dur: 1.6, level: 1.0, variants: 1,
    build(b) {
      b.thump(0, { f0: 85, f1: 34, decay: 0.16, gain: 1.0, click: 0.25, clickLp: 900 });
      b.thump(0.07, { f0: 75, f1: 36, decay: 0.12, gain: 0.7, click: 0.15, clickLp: 900 });
      b.noise(0, 0.6, { color: 'brown', lp: 200, gain: 0.8, decay: 0.15 });
      b.noise(0.0, 0.25, { bp: 1900, bpq: 1.4, gain: 0.12, decay: 0.05 });  // tyre chirp through the hull
      b.noise(0.07, 0.2, { bp: 1700, bpq: 1.4, gain: 0.09, decay: 0.04 });
      b.crackle(0.02, 0.6, { density: 300, bp: 1500, gain: 0.25, env: 'decay' }); // rattles of the cabin
      b.modes(0.03, scale(PLASTIC_PANEL, 0.9), 0.3);
      b.modes(0.05, scale(LATCH, 0.8), 0.12);
    },
  },
  gear_clunk: {            // uplock release / door actuators
    dur: 0.9, level: 1.0, variants: 2,
    build(b) {
      b.thump(0, { f0: 90, f1: 45, decay: 0.09, gain: 1.0, click: 0.2, clickLp: 700 });
      b.modes(0, [[160, 0.5, 0.1], [340, 0.3, 0.06], [720, 0.15, 0.03]], 0.35);
      b.noise(0, 0.5, { color: 'brown', lp: 250, gain: 0.5, decay: 0.12 });
      b.thump(0.22, { f0: 70, f1: 40, decay: 0.07, gain: 0.45, click: 0 });
    },
  },
  gear_lock: {             // gear up-and-locked / down-and-locked thump
    dur: 0.8, level: 1.0, variants: 2,
    build(b) {
      b.thump(0, { f0: 75, f1: 38, decay: 0.11, gain: 1.0, click: 0.15, clickLp: 600 });
      b.noise(0, 0.4, { color: 'brown', lp: 200, gain: 0.6, decay: 0.1 });
      b.modes(0.005, [[140, 0.4, 0.12], [290, 0.25, 0.07]], 0.3);
      b.crackle(0.01, 0.25, { density: 250, bp: 1700, gain: 0.08, env: 'decay' });
    },
  },
  reverser_clunk: {
    dur: 0.8, level: 0.8, variants: 1,
    build(b) { b.thump(0, { f0: 100, f1: 50, decay: 0.08, gain: 1.0, click: 0.2, clickLp: 600 }); b.noise(0, 0.5, { color: 'brown', lp: 300, gain: 0.4, decay: 0.15 }); },
  },
  spoiler_thump: {
    dur: 0.8, level: 0.7, variants: 1,
    build(b) { b.thump(0, { f0: 80, f1: 42, decay: 0.07, gain: 1.0, click: 0.1, clickLp: 500 }); b.noise(0, 0.6, { color: 'brown', lp: 260, gain: 0.5, decay: 0.2 }); },
  },
  lightoff: {              // engine light-off: soft deep "whump" and a rumble swell
    dur: 2.6, level: 1.0, variants: 2,
    build(b) {
      b.thump(0, { f0: 62, f1: 30, decay: 0.25, gain: 0.8, click: 0 });
      b.noise(0, 2.5, { color: 'brown', lp: 160, gain: 0.9, env: (u) => Math.min(1, u * 9) * Math.exp(-u * 2.2) });
      b.noise(0.05, 2.0, { color: 'pink', lp: 700, gain: 0.15, env: (u) => Math.min(1, u * 6) * Math.exp(-u * 2.5) });
    },
  },
  bag_thump: {             // baggage thrown into the hold under the floor
    dur: 0.7, level: 0.7, variants: 4,
    build(b) {
      b.thump(0, { f0: 110 + b.rand() * 40, f1: 55, decay: 0.06, gain: 1.0, click: 0.12, clickLp: 700 });
      b.modes(0, [[170, 0.4, 0.07], [390, 0.25, 0.04]], 0.3);
      if (b.rand() < 0.6) b.thump(0.18 + b.rand() * 0.15, { f0: 95, f1: 55, decay: 0.05, gain: 0.45, click: 0.05 });
      b.filter('lowpass', 900);
    },
  },
  rattle_bin: {            // bins / latches rattling in a bump
    dur: 0.5, level: 0.45, variants: 4,
    build(b) {
      for (let i = 0; i < 3 + Math.floor(b.rand() * 4); i++) b.modes(b.rand() * 0.25, scale(LATCH, 0.7 + b.rand() * 0.5), 0.2 + b.rand() * 0.25);
      b.modes(0, scale(PLASTIC_PANEL, 0.9 + b.rand() * 0.2), 0.3);
      b.crackle(0, 0.3, { density: 350, bp: 2000, gain: 0.18, env: 'decay' });
    },
  },
  creak_panel: {           // sidewall / bin panel flexing
    dur: 0.6, level: 0.4, variants: 4,
    build(b) { b.creak(0, 0.3 + b.rand() * 0.25, { rate: 40 + b.rand() * 60, res: [[300 + b.rand() * 300, 5], [900 + b.rand() * 600, 7], [2100, 9]], gain: 0.25 }); },
  },
  rattle_cart: {           // galley carts / inserts (cans, glassware) in turbulence
    dur: 0.7, level: 0.5, variants: 4,
    build(b) {
      b.thump(0, { f0: 180, f1: 110, decay: 0.03, gain: 0.35, click: 0.1 });
      for (let i = 0; i < 4 + Math.floor(b.rand() * 5); i++) b.modes(b.rand() * 0.35, scale([[2600, 0.3, 0.06], [4100, 0.2, 0.045], [6300, 0.1, 0.03]], 0.7 + b.rand() * 0.6), 0.15 + b.rand() * 0.2);
      b.modes(0.01, STEEL, 0.25);
      b.crackle(0, 0.4, { density: 250, bp: 3000, gain: 0.15, env: 'decay' });
    },
  },
  brake_creak: {           // carbon brakes groan as the aircraft stops
    dur: 1.0, level: 0.6, variants: 2,
    build(b) { b.creak(0, 0.8, { rate: 32, rateEnd: 18, res: [[140, 5], [310, 6], [650, 7]], gain: 0.4 }); b.thump(0.75, { f0: 70, f1: 40, decay: 0.08, gain: 0.5, click: 0 }); b.filter('lowpass', 1200); },
  },
  ptu: {                   // 737 power transfer unit: the famous "barking dog" growl
    dur: 4.6, level: 0.9, variants: 2,
    build(b) {
      const bursts = [[0, 1.0, 46, 58], [1.25, 0.65, 50, 57], [2.15, 1.7, 44, 60]];
      for (const [t, d, f0, f1] of bursts) {
        b.tone(t, d, { f: f0, fEnd: f1, harm: [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.22, 0.16, 0.1, 0.07], gain: 0.35, attack: 0.08, release: 0.15, vib: 0.03, vibRate: 7.5 });
        b.noise(t, d, { color: 'pink', bp: 420, bpq: 1.2, gain: 0.25, env: 'flat', attack: 0.08, decay: 0.15 });
      }
      b.filter('lowpass', 900).filter('peaking', 180, 1.0, 4).saturate(2.2);
    },
  },
};

/** Boeing-style electronic chime tone: bell-like, strong fundamental, soft attack, long decay. */
function chimeTone(b, t0, f, decay = 1.1) {
  b.modes(t0, [
    [f, 1.0, decay], [f * 1.0012, 0.22, decay * 0.95],   // slight beating: warmth
    [f * 2, 0.22, decay * 0.45], [f * 3, 0.07, decay * 0.3], [f * 4.2, 0.03, decay * 0.18],
  ], 0.5, { attack: 0.006, detune: 0 });
}

/** Render one variant of a foley sound into an AudioBuffer. */
export function renderFoley(ctx, name, variant = 0) {
  const def = FOLEY[name];
  if (!def) return null;
  const sb = new SynthBuf(ctx.sampleRate, def.dur, 1000 + variant * 7919 + hash(name));
  def.build(sb, variant);
  sb.normalize(0.9);
  return sb.toBuffer(ctx);
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 100000; }
