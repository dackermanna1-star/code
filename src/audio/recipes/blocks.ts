/**
 * Block material sounds: break / place / step / hit / fall / land for every SoundGroup.
 *
 * Each material is a small physical description — contact transient, modal body (struck
 * resonators), low thump, granular crunch ("grit"), hard fragment clicks and rustle — and
 * every action is a choreography of impacts of that material (heel + toe for steps, crack +
 * crumbling debris for breaks, a heavy body for falls ...). Glass, liquids and slime use
 * dedicated models (shatter / splash / squelch).
 */
import type { SoundGroup } from '../../world/blocks/registry';
import { alloc, lowpass, highpass } from '../dsp/core';
import { burst, clicks, creak, grains, randomModes, ratioModes, strike, thump, whoosh, PLATE, BAR, type Mode } from '../dsp/models';
import type { Rand } from '../dsp/rand';
import { bodyThud, debris, shatter, slosh, splash, squelch } from './kit';
import type { SoundSpec } from './types';

export const SOUND_GROUPS = [
  'stone', 'wood', 'gravel', 'grass', 'sand', 'snow', 'glass', 'metal', 'wool', 'liquid', 'plant', 'crop', 'ladder',
  'netherrack', 'nether_bricks', 'soul_sand', 'nylium', 'stem', 'bone', 'slime', 'deepslate', 'anvil', 'lantern',
  'chain', 'scaffold', 'none',
] as const satisfies readonly SoundGroup[];

/** True if `g` has dedicated material sounds (groups added to the registry later fall back to stone). */
export const hasMaterialSounds = (g: string): boolean => (SOUND_GROUPS as readonly string[]).includes(g);

export const BLOCK_ACTIONS = ['break', 'place', 'step', 'hit', 'fall', 'land'] as const;
export type BlockAction = (typeof BLOCK_ACTIONS)[number];

interface Grit {
  amp: number;
  fLo: number;
  fHi: number;
  q: number;
  dLo: number;
  dHi: number;
  rate: number;
  time: number;
  tail?: number;
}
interface Frag {
  amp: number;
  fLo: number;
  fHi: number;
  t60Lo: number;
  t60Hi: number;
  rate: number;
  time: number;
  modes?: number;
}
interface Mat {
  /** [amp, hp, lp, dur] contact transient */
  click?: readonly [number, number, number, number];
  modal?: { amp: number; gen: (r: Rand, size: number) => Mode[]; attack?: number };
  /** [amp, f, dur] low body thump */
  thump?: readonly [number, number, number];
  grit?: Grit;
  frag?: Frag;
  rustle?: { amp: number; fLo: number; fHi: number; rate: number; time: number };
  extra?: (out: Float32Array, sr: number, r: Rand, t: number, s: number, size: number) => void;
  /** Extra layer only for `break` (splinters, ...). */
  breakExtra?: (out: Float32Array, sr: number, r: Rand, t: number) => void;
  debris?: { amp: number; fLo: number; fHi: number; hard?: number; t60?: number; dur: number };
  lp?: number;
  hp?: number;
}

// ---- mode generators -------------------------------------------------------------------

const stoneModes =
  (fLo: number, fHi: number, n: number, tLo: number, tHi: number, bLo: number, bHi: number, contact: number, bodyAmp = 0.7) =>
  (r: Rand, size: number): Mode[] => [
    ...randomModes(r, n, fLo / Math.sqrt(size), fHi, tLo, tHi, { tilt: 0.35, contact }),
    ...randomModes(r, 3, bLo / size, bHi / size, 0.03, 0.08, { tilt: 0, amp: bodyAmp }),
  ];

const woodModes =
  (lo: number, hi: number, t: number, hiAmp = 0.4) =>
  (r: Rand, size: number): Mode[] => {
    // plank modes: inharmonic (spread ratios) and well damped so it reads as a "tock", not a marimba
    const f0 = r.log(lo, hi) / size;
    return [
      { f: f0, t60: t * r.range(0.8, 1.2), a: 1 },
      { f: f0 * r.range(1.75, 2.6), t60: t * 0.7, a: 0.65 },
      { f: f0 * r.range(2.7, 4.3), t60: t * 0.5, a: 0.5 },
      { f: f0 * r.range(4.4, 6.2), t60: t * 0.35, a: 0.3 },
      ...randomModes(r, 7, 700, 3400, t * 0.12, t * 0.35, { tilt: 0.5, amp: hiAmp }),
    ];
  };

const metalModes =
  (lo: number, hi: number, t60: number, extraHi = 0.3) =>
  (r: Rand, size: number): Mode[] => [
    ...ratioModes(r.log(lo, hi) / size, PLATE, t60, { tilt: 0.35, decayTilt: 0.5, jitter: 0.02, r }),
    ...randomModes(r, 4, 2800, 8500, t60 * 0.12, t60 * 0.35, { tilt: 0.3, amp: extraHi }),
  ];

// ---- materials ---------------------------------------------------------------------------

type GenericGroup = Exclude<SoundGroup, 'none' | 'liquid' | 'slime'>;

const MATS: Record<GenericGroup, Mat> = {
  stone: {
    click: [0.6, 1500, 11000, 0.006],
    modal: { amp: 0.5, gen: stoneModes(1100, 7000, 12, 0.012, 0.045, 260, 600, 0.00005, 0.3) },
    thump: [0.12, 120, 0.05],
    grit: { amp: 0.7, fLo: 900, fHi: 6500, q: 2.2, dLo: 0.0015, dHi: 0.007, rate: 900, time: 0.065 },
    frag: { amp: 0.35, fLo: 2000, fHi: 8000, t60Lo: 0.006, t60Hi: 0.025, rate: 180, time: 0.07 },
    debris: { amp: 0.5, fLo: 800, fHi: 6000, hard: 0.7, t60: 0.025, dur: 0.45 },
  },
  deepslate: {
    click: [0.55, 1000, 9000, 0.006],
    modal: { amp: 0.55, gen: stoneModes(700, 5000, 12, 0.015, 0.055, 180, 420, 0.00008, 0.45) },
    thump: [0.18, 95, 0.07],
    grit: { amp: 0.6, fLo: 700, fHi: 4800, q: 2.2, dLo: 0.0015, dHi: 0.008, rate: 800, time: 0.07 },
    frag: { amp: 0.3, fLo: 1400, fHi: 6000, t60Lo: 0.006, t60Hi: 0.03, rate: 150, time: 0.07 },
    debris: { amp: 0.5, fLo: 600, fHi: 4800, hard: 0.7, t60: 0.03, dur: 0.5 },
  },
  netherrack: {
    click: [0.4, 900, 8000, 0.005],
    modal: { amp: 0.35, gen: (r, s) => randomModes(r, 7, 500 / s, 3000, 0.01, 0.03, { tilt: 0.3 }) },
    thump: [0.14, 110, 0.05],
    grit: { amp: 0.95, fLo: 800, fHi: 5000, q: 2, dLo: 0.0015, dHi: 0.008, rate: 1500, time: 0.085 },
    debris: { amp: 0.55, fLo: 700, fHi: 5000, hard: 0.45, t60: 0.012, dur: 0.42 },
  },
  nether_bricks: {
    click: [0.55, 2000, 12000, 0.003],
    modal: { amp: 0.75, gen: stoneModes(1500, 7500, 10, 0.03, 0.11, 450, 850, 0.00004, 0.35) },
    thump: [0.1, 150, 0.04],
    grit: { amp: 0.2, fLo: 1500, fHi: 6000, q: 2, dLo: 0.001, dHi: 0.004, rate: 300, time: 0.03 },
    frag: { amp: 0.25, fLo: 2500, fHi: 8000, t60Lo: 0.01, t60Hi: 0.04, rate: 90, time: 0.05 },
    debris: { amp: 0.35, fLo: 1500, fHi: 7000, hard: 0.9, t60: 0.04, dur: 0.45 },
  },
  wood: {
    click: [0.45, 600, 6000, 0.008],
    modal: { amp: 0.9, gen: woodModes(270, 430, 0.065, 0.75), attack: 0.0004 },
    thump: [0.1, 140, 0.04],
    grit: { amp: 0.18, fLo: 1500, fHi: 5500, q: 2, dLo: 0.001, dHi: 0.004, rate: 350, time: 0.03 },
    breakExtra: (out, sr, r, t) => splinter(out, sr, r, t, 0.6),
    debris: { amp: 0.3, fLo: 700, fHi: 4000, hard: 0.6, t60: 0.03, dur: 0.35 },
  },
  ladder: {
    click: [0.3, 900, 8000, 0.003],
    modal: { amp: 0.85, gen: woodModes(320, 520, 0.065, 0.45), attack: 0.0003 },
    thump: [0.06, 180, 0.03],
    grit: { amp: 0.1, fLo: 1500, fHi: 5000, q: 2, dLo: 0.001, dHi: 0.003, rate: 200, time: 0.02 },
    breakExtra: (out, sr, r, t) => splinter(out, sr, r, t, 0.45),
    debris: { amp: 0.25, fLo: 800, fHi: 4000, hard: 0.6, t60: 0.03, dur: 0.3 },
  },
  scaffold: {
    click: [0.3, 1000, 8000, 0.003],
    modal: { amp: 0.8, gen: (r, s) => ratioModes(r.log(420, 760) / s, [1, 2.01, 3.0, 4.05, 5.1], 0.09, { tilt: 0.5, decayTilt: 0.6 }) },
    thump: [0.05, 170, 0.03],
    extra: (out, sr, r, t, s, size) => {
      // lattice rattle: a couple of weaker secondary contacts
      const f = r.log(500, 900) / size;
      strike(out, sr, t + r.range(0.012, 0.025), ratioModes(f, [1, 2.02, 3.01], 0.07), 0.35 * s);
      if (r.chance(0.6)) strike(out, sr, t + r.range(0.03, 0.05), ratioModes(f * r.range(1.1, 1.4), [1, 2.0, 3.0], 0.05), 0.2 * s);
    },
    debris: { amp: 0.25, fLo: 800, fHi: 4000, hard: 0.8, t60: 0.05, dur: 0.35 },
  },
  stem: {
    click: [0.2, 600, 4000, 0.005],
    modal: { amp: 0.7, gen: woodModes(220, 340, 0.06, 0.45), attack: 0.001 },
    thump: [0.08, 120, 0.05],
    grit: { amp: 0.45, fLo: 500, fHi: 2800, q: 1.2, dLo: 0.003, dHi: 0.012, rate: 600, time: 0.05 },
    breakExtra: (out, sr, r, t) => splinter(out, sr, r, t, 0.35, 0.6),
    debris: { amp: 0.3, fLo: 500, fHi: 2800, hard: 0.2, t60: 0.02, dur: 0.35 },
  },
  bone: {
    click: [0.6, 1500, 10000, 0.003],
    modal: {
      amp: 0.8,
      gen: (r, s) => [...randomModes(r, 6, 800 / Math.sqrt(s), 4000, 0.015, 0.05, { tilt: 0.3 }), ...randomModes(r, 2, 400 / s, 650 / s, 0.03, 0.05, { tilt: 0, amp: 0.6 })],
    },
    thump: [0.06, 180, 0.03],
    frag: { amp: 0.25, fLo: 1500, fHi: 5000, t60Lo: 0.01, t60Hi: 0.03, rate: 90, time: 0.05 },
    debris: { amp: 0.3, fLo: 1200, fHi: 5000, hard: 1, t60: 0.03, dur: 0.4 },
  },
  gravel: {
    click: [0.25, 600, 6000, 0.004],
    thump: [0.12, 110, 0.05],
    grit: { amp: 1.0, fLo: 600, fHi: 5500, q: 1.8, dLo: 0.002, dHi: 0.012, rate: 1400, time: 0.13 },
    frag: { amp: 0.5, fLo: 1500, fHi: 7000, t60Lo: 0.004, t60Hi: 0.02, rate: 330, time: 0.12 },
    debris: { amp: 0.55, fLo: 600, fHi: 5000, hard: 0.8, t60: 0.015, dur: 0.5 },
  },
  grass: {
    click: [0.15, 400, 3000, 0.006],
    thump: [0.14, 100, 0.06],
    grit: { amp: 0.5, fLo: 400, fHi: 2600, q: 1.2, dLo: 0.003, dHi: 0.012, rate: 600, time: 0.07 },
    rustle: { amp: 0.6, fLo: 2200, fHi: 9000, rate: 2200, time: 0.1 },
    debris: { amp: 0.35, fLo: 400, fHi: 3000, dur: 0.35 },
  },
  sand: {
    thump: [0.12, 90, 0.05],
    grit: { amp: 0.7, fLo: 350, fHi: 2600, q: 0.8, dLo: 0.004, dHi: 0.02, rate: 3200, time: 0.15, tail: 1.5 },
    debris: { amp: 0.4, fLo: 350, fHi: 2600, dur: 0.4 },
    lp: 3800,
  },
  snow: {
    thump: [0.08, 120, 0.04],
    grit: { amp: 0.55, fLo: 1500, fHi: 6500, q: 3.5, dLo: 0.001, dHi: 0.004, rate: 2200, time: 0.13 },
    frag: { amp: 0.3, fLo: 900, fHi: 2600, t60Lo: 0.008, t60Hi: 0.03, rate: 100, time: 0.12, modes: 1 },
    debris: { amp: 0.35, fLo: 1000, fHi: 5500, dur: 0.35 },
    lp: 8500,
  },
  glass: {
    click: [0.5, 2000, 14000, 0.0025],
    modal: { amp: 0.5, gen: (r, s) => randomModes(r, 8, 2000 / Math.sqrt(s), 9000, 0.06, 0.3, { tilt: 0.2 }) },
    thump: [0.06, 160, 0.03],
    grit: { amp: 0.1, fLo: 2000, fHi: 8000, q: 2, dLo: 0.001, dHi: 0.003, rate: 200, time: 0.02 },
  },
  metal: {
    click: [0.5, 1500, 11000, 0.003],
    modal: { amp: 0.9, gen: metalModes(380, 650, 0.4, 0.4) },
    thump: [0.15, 120, 0.05],
    debris: { amp: 0.25, fLo: 2000, fHi: 8000, hard: 1, t60: 0.08, dur: 0.4 },
  },
  anvil: {
    click: [0.6, 1200, 11000, 0.003],
    modal: {
      amp: 1,
      gen: (r, s) => {
        const f = r.log(480, 700) / s;
        return [...ratioModes(f, BAR, 1.6, { tilt: 0.4, decayTilt: 0.4 }), ...ratioModes(f * 1.7, PLATE, 0.9, { tilt: 0.5, jitter: 0.02, r })];
      },
    },
    thump: [0.25, 90, 0.08],
    debris: { amp: 0.2, fLo: 2000, fHi: 8000, hard: 1, t60: 0.1, dur: 0.4 },
  },
  lantern: {
    click: [0.35, 2000, 12000, 0.002],
    modal: { amp: 0.6, gen: (r, s) => randomModes(r, 8, 900 / s, 5500, 0.08, 0.4, { tilt: 0.2 }) },
    frag: { amp: 0.35, fLo: 2500, fHi: 8000, t60Lo: 0.02, t60Hi: 0.08, rate: 250, time: 0.09, modes: 3 },
    extra: (out, sr, r, t, s) => strike(out, sr, t + 0.002, randomModes(r, 3, 3000, 8000, 0.2, 0.4, { tilt: 0 }), 0.2 * s),
    debris: { amp: 0.25, fLo: 2500, fHi: 9000, hard: 1, t60: 0.1, dur: 0.4 },
  },
  chain: {
    click: [0.3, 2500, 12000, 0.002],
    modal: { amp: 0.3, gen: (r, s) => randomModes(r, 4, 1200 / s, 4000, 0.05, 0.2, { tilt: 0.2 }) },
    frag: { amp: 0.7, fLo: 1800, fHi: 7500, t60Lo: 0.02, t60Hi: 0.1, rate: 450, time: 0.14, modes: 3 },
    thump: [0.05, 150, 0.03],
    debris: { amp: 0.3, fLo: 2000, fHi: 8000, hard: 1.2, t60: 0.08, dur: 0.45 },
  },
  wool: {
    thump: [0.3, 85, 0.08],
    grit: { amp: 0.6, fLo: 250, fHi: 1800, q: 0.7, dLo: 0.008, dHi: 0.04, rate: 900, time: 0.12, tail: 1.5 },
    debris: { amp: 0.25, fLo: 250, fHi: 1800, dur: 0.3 },
    lp: 2000,
  },
  plant: {
    rustle: { amp: 0.6, fLo: 2200, fHi: 9000, rate: 2200, time: 0.12 },
    frag: { amp: 0.3, fLo: 1200, fHi: 4000, t60Lo: 0.003, t60Hi: 0.012, rate: 70, time: 0.08, modes: 1 },
    thump: [0.04, 150, 0.025],
    debris: { amp: 0.35, fLo: 2000, fHi: 9000, dur: 0.3 },
  },
  crop: {
    rustle: { amp: 0.45, fLo: 2000, fHi: 8000, rate: 1500, time: 0.09 },
    frag: { amp: 0.6, fLo: 1000, fHi: 3500, t60Lo: 0.004, t60Hi: 0.015, rate: 120, time: 0.06, modes: 2 },
    grit: { amp: 0.3, fLo: 800, fHi: 3000, q: 1.5, dLo: 0.002, dHi: 0.008, rate: 500, time: 0.06 },
    thump: [0.05, 140, 0.03],
    debris: { amp: 0.3, fLo: 1200, fHi: 7000, hard: 0.5, t60: 0.01, dur: 0.3 },
  },
  soul_sand: {
    thump: [0.14, 85, 0.06],
    grit: { amp: 0.6, fLo: 350, fHi: 2800, q: 0.8, dLo: 0.004, dHi: 0.02, rate: 2400, time: 0.15, tail: 1.5 },
    extra: (out, sr, r, t, s, size) =>
      whoosh(out, sr, r, t, 0.4 * size, { f: [0, 280, 0.5, 520, 1, 240], amp: [0, 0, 0.3, 1, 1, 0], q: 4, gain: 0.6 * s }),
    debris: { amp: 0.35, fLo: 350, fHi: 2800, dur: 0.4 },
    lp: 4200,
  },
  nylium: {
    click: [0.25, 700, 6000, 0.004],
    thump: [0.14, 105, 0.05],
    grit: { amp: 0.8, fLo: 800, fHi: 4500, q: 1.8, dLo: 0.0015, dHi: 0.008, rate: 1300, time: 0.075 },
    rustle: { amp: 0.35, fLo: 1500, fHi: 6500, rate: 1100, time: 0.07 },
    debris: { amp: 0.45, fLo: 700, fHi: 4500, hard: 0.3, t60: 0.012, dur: 0.4 },
  },
};

/** Wood splinter: fast stick-slip crackle through wood resonances. */
function splinter(out: Float32Array, sr: number, r: Rand, t: number, amp: number, soft = 1): void {
  const modes = randomModes(r, 6, 400, 3500, 0.01, 0.04, { tilt: 0.3 });
  creak(out, sr, r, t, r.range(0.05, 0.09), { rate: [0, 900 * soft, 0.5, 300, 1, 60], amp: [0, 1, 0.6, 0.6, 1, 0.1], modes, jitter: 0.6, gain: amp * 5, noise: 0.3 });
}

const gritShape = (dt: number, time: number): number => (dt < 0.004 ? Math.max(0.05, dt / 0.004) : Math.exp(-(dt - 0.004) / (time * 0.35)));

/** One impact of material `m` with strength `s` (0..1.2) and contact size (0.3..2). */
function impact(out: Float32Array, sr: number, r: Rand, t: number, m: Mat, s: number, size: number): void {
  if (m.click) burst(out, sr, r, t, m.click[3] * size, m.click[0] * s, m.click[1], m.click[2]);
  if (m.modal) strike(out, sr, t, m.modal.gen(r, size), m.modal.amp * s, m.modal.attack ?? 0);
  if (m.thump) thump(out, sr, t, (m.thump[1] * 1.8) / size, m.thump[1] / size, m.thump[2] * Math.sqrt(size), m.thump[0] * s);
  const g = m.grit;
  if (g) {
    const time = g.time * (0.55 + 0.45 * s) * Math.sqrt(size);
    grains(out, sr, r, {
      t0: t,
      t1: t + time * 2.5,
      rate: (tt) => g.rate * (0.4 + 0.6 * s) * gritShape(tt - t, time),
      shape: (tt) => Math.sqrt(gritShape(tt - t, time)),
      fLo: g.fLo,
      fHi: g.fHi,
      q: g.q,
      durLo: g.dLo,
      durHi: g.dHi,
      amp: g.amp * s,
      tail: g.tail ?? 2,
    });
  }
  const f = m.frag;
  if (f) {
    const time = f.time * (0.55 + 0.45 * s) * Math.sqrt(size);
    clicks(out, sr, r, {
      t0: t,
      t1: t + time * 2.5,
      rate: (tt) => f.rate * (0.4 + 0.6 * s) * gritShape(tt - t, time),
      fLo: f.fLo,
      fHi: f.fHi,
      t60Lo: f.t60Lo,
      t60Hi: f.t60Hi,
      amp: f.amp * s,
      modes: f.modes ?? 2,
    });
  }
  const ru = m.rustle;
  if (ru) {
    const time = ru.time * (0.6 + 0.4 * s) * Math.sqrt(size);
    grains(out, sr, r, {
      t0: t,
      t1: t + time * 2.2,
      rate: (tt) => ru.rate * (0.5 + 0.5 * s) * gritShape(tt - t, time),
      fLo: ru.fLo,
      fHi: ru.fHi,
      q: 1.3,
      durLo: 0.001,
      durHi: 0.005,
      amp: ru.amp * s,
      tail: 2.2,
    });
  }
  if (m.extra) m.extra(out, sr, r, t, s, size);
}

function finishMat(out: Float32Array, sr: number, m: Mat): Float32Array {
  if (m.lp) lowpass(out, sr, m.lp);
  if (m.hp) highpass(out, sr, m.hp);
  return out;
}

function genericAction(m: Mat, action: BlockAction, sr: number, r: Rand): Float32Array {
  const j = () => r.range(0.85, 1.12);
  switch (action) {
    case 'step': {
      const out = alloc(sr, 0.34);
      impact(out, sr, r, 0.004, m, 0.6 * j(), 0.8);
      impact(out, sr, r, 0.004 + r.range(0.045, 0.085), m, 0.35 * j(), 0.6);
      return finishMat(out, sr, m);
    }
    case 'land': {
      const out = alloc(sr, 0.4);
      impact(out, sr, r, 0.004, m, 0.85 * j(), 1.0);
      impact(out, sr, r, 0.004 + r.range(0.012, 0.03), m, 0.6 * j(), 0.9);
      return finishMat(out, sr, m);
    }
    case 'fall': {
      const out = alloc(sr, 0.55);
      bodyThud(out, sr, r, 0.003, 1.2, 0.3);
      impact(out, sr, r, 0.004, m, 1.1, 1.3);
      impact(out, sr, r, 0.004 + r.range(0.02, 0.04), m, 0.5, 1.1);
      return finishMat(out, sr, m);
    }
    case 'hit': {
      const out = alloc(sr, 0.22);
      impact(out, sr, r, 0.003, m, 0.75 * j(), 0.55);
      return finishMat(out, sr, m);
    }
    case 'place': {
      const out = alloc(sr, 0.42);
      impact(out, sr, r, 0.004, m, 0.95 * j(), 1.1);
      impact(out, sr, r, 0.004 + r.range(0.025, 0.045), m, 0.22, 0.7);
      return finishMat(out, sr, m);
    }
    case 'break': {
      const out = alloc(sr, 0.95);
      impact(out, sr, r, 0.004, m, 1.0, 1.0);
      impact(out, sr, r, 0.004 + r.range(0.018, 0.045), m, 0.5, 0.65);
      if (m.breakExtra) m.breakExtra(out, sr, r, 0.006);
      const d = m.debris;
      const dd = d ? d.dur : 0.35;
      if (d) debris(out, sr, r, 0.025, d.dur, { amp: d.amp, fLo: d.fLo, fHi: d.fHi, hard: d.hard, t60: d.t60 });
      const k = 2 + r.int(3);
      for (let i = 0; i < k; i++) impact(out, sr, r, r.range(0.08, dd), m, r.range(0.1, 0.28), r.range(0.3, 0.6));
      return finishMat(out, sr, m);
    }
  }
}

function liquidAction(action: BlockAction, sr: number, r: Rand): Float32Array {
  switch (action) {
    case 'step': {
      const out = alloc(sr, 0.5);
      slosh(out, sr, r, 0, r.range(0.25, 0.35), 0.8);
      return out;
    }
    case 'hit': {
      const out = alloc(sr, 0.5);
      splash(out, sr, r, 0.002, 0.3, 0.7);
      return out;
    }
    case 'land':
    case 'place': {
      const out = alloc(sr, 0.9);
      splash(out, sr, r, 0.002, 0.6, 0.9);
      return out;
    }
    case 'fall':
    case 'break': {
      const out = alloc(sr, 1.2);
      splash(out, sr, r, 0.002, 1.0, 1);
      return out;
    }
  }
}

function slimeAction(action: BlockAction, sr: number, r: Rand): Float32Array {
  const size = action === 'step' || action === 'hit' ? 0.6 : action === 'fall' || action === 'break' ? 1.5 : 1;
  const out = alloc(sr, 0.7);
  squelch(out, sr, r, 0.003, size * r.range(0.85, 1.15), action === 'step' || action === 'hit' ? 0.6 : 1);
  if (action === 'break' || action === 'fall') squelch(out, sr, r, r.range(0.07, 0.12), size * 0.6, 0.45);
  return out;
}

function glassAction(action: BlockAction, sr: number, r: Rand): Float32Array {
  if (action !== 'break') return genericAction(MATS.glass, action, sr, r);
  const out = alloc(sr, 1.2);
  shatter(out, sr, r, 0.003, r.range(0.9, 1.15), 1);
  return out;
}

/** Renders one block sound (used by the registry). */
export function renderBlock(group: SoundGroup, action: BlockAction, sr: number, r: Rand): Float32Array {
  if (group === 'none') return new Float32Array(Math.round(sr * 0.01));
  if (group === 'liquid') return liquidAction(action, sr, r);
  if (group === 'slime') return slimeAction(action, sr, r);
  if (group === 'glass') return glassAction(action, sr, r);
  if (group === 'metal' && action === 'break') {
    const out = genericAction(MATS.metal, 'break', sr, r);
    // a final ringing clank as the block gives way
    strike(out, sr, r.range(0.05, 0.1), metalModes(300, 520, 0.6)(r, 0.9), 0.5);
    return out;
  }
  return genericAction(MATS[group], action, sr, r);
}

const LEVEL: Record<BlockAction, number> = { break: 0.95, place: 0.8, step: 0.32, hit: 0.3, fall: 0.55, land: 0.42 };
const COUNT: Record<BlockAction, number> = { break: 3, place: 3, step: 4, hit: 3, fall: 2, land: 3 };

/** Sound specs `block.<group>.<action>` for every group except 'none'. */
export function blockSounds(): Record<string, SoundSpec> {
  const o: Record<string, SoundSpec> = {};
  for (const g of SOUND_GROUPS) {
    if (g === 'none') continue;
    for (const a of BLOCK_ACTIONS) {
      o[`block.${g}.${a}`] = {
        cat: 'blocks',
        n: COUNT[a],
        level: LEVEL[a],
        pv: a === 'step' ? 0.07 : 0.05,
        max: a === 'step' ? 6 : 8,
        gen: (sr, r) => renderBlock(g, a, sr, r),
      };
    }
  }
  return o;
}
