// Continuous, intensity-driven loops (fire, liquid, levitation, chainsaw, steam, wind).
// Each recipe builds never-ending sources into `k.out` and returns an `apply` callback that maps
// intensity (0..1) to timbre. Overall loudness / panning is handled by the manager.

import type { Kit } from './synth';
import type { LoopKey } from './types';

export interface LoopRecipe {
  /** Map intensity (0..1, already smoothed by the caller) onto recipe parameters. */
  apply(intensity: number, now: number): void;
}

export interface LoopSpec {
  /** Mix level at intensity 1. */
  readonly level: number;
  /** Audible range when positioned. */
  readonly range: number;
  /** Reverb send. */
  readonly wet: number;
}

export const LOOP_SPECS: Readonly<Record<LoopKey, LoopSpec>> = {
  fire: { level: 0.4, range: 90, wet: 0.2 },
  liquid: { level: 0.38, range: 70, wet: 0.2 },
  levitate: { level: 0.28, range: 60, wet: 0.1 },
  chainsaw: { level: 0.32, range: 90, wet: 0.12 },
  steam: { level: 0.18, range: 80, wet: 0.2 },
  wind: { level: 0.35, range: 140, wet: 0.05 },
};

export const LOOP_KEYS = Object.keys(LOOP_SPECS) as LoopKey[];

const TC = 0.08;

function fire(k: Kit): LoopRecipe {
  // Roar: pink noise through a flickering lowpass.
  const roarG = k.gain(0.55);
  const roarLp = k.filter('lowpass', 700, 0, roarG);
  k.noiseForever('pink', roarLp);
  k.lfo(0.7, 160, roarLp.frequency);
  k.lfo(2.3, 90, roarLp.frequency);
  // Crackles (rate wobble hides the buffer loop).
  const crackG = k.gain(0.7);
  const crackBp = k.filter('bandpass', 2600, 0.6, crackG);
  const cr = k.noiseForever('crackle', crackBp);
  k.lfo(0.13, 0.12, cr.playbackRate);
  // Low body for big fires.
  const lowG = k.gain(0);
  const lowLp = k.filter('lowpass', 170, 2, lowG);
  k.noiseForever('brown', lowLp);
  return {
    apply(i, now) {
      roarLp.frequency.setTargetAtTime(450 + 1700 * i, now, TC);
      lowG.gain.setTargetAtTime(0.7 * i * i, now, TC);
      crackG.gain.setTargetAtTime(0.45 + 0.45 * i, now, TC);
    },
  };
}

function liquid(k: Kit): LoopRecipe {
  const g = k.gain(1);
  const bp = k.filter('bandpass', 500, 3, g);
  k.noiseForever('brown', bp);
  k.lfo(k.r(3, 5), 220, bp.frequency, 'triangle');
  k.lfo(0.37, 90, bp.frequency);
  // Small bubbles: narrow resonant band jumping around.
  const bubG = k.gain(0.22);
  const bub = k.filter('bandpass', 1400, 10, bubG);
  k.noiseForever('white', bub);
  k.lfo(9.3, 600, bub.frequency, 'square');
  k.lfo(0.71, 300, bub.frequency);
  return {
    apply(i, now) {
      bp.frequency.setTargetAtTime(380 + 320 * i, now, TC);
      bubG.gain.setTargetAtTime(0.12 + 0.2 * i, now, TC);
    },
  };
}

function levitate(k: Kit): LoopRecipe {
  // Soft jet hiss + a faint humming core.
  const airG = k.gain(0.75);
  const air = k.filter('bandpass', 900, 1.2, airG);
  k.noiseForever('pink', air);
  k.lfo(0.9, 120, air.frequency);
  const humG = k.gain(0.1, k.filter('lowpass', 900, 0));
  const hum = k.oscForever('triangle', 150, humG);
  k.lfo(5.5, 8, hum.detune);
  return {
    apply(i, now) {
      air.frequency.setTargetAtTime(650 + 900 * i, now, TC);
      hum.frequency.setTargetAtTime(130 + 70 * i, now, TC);
    },
  };
}

function chainsaw(k: Kit): LoopRecipe {
  const out = k.gain(0.42);
  const bp = k.filter('bandpass', 1000, 0.8, out);
  const sh = k.shaper(k.curves.hard, bp);
  const chop = k.am(0.7, 31, 0.3, sh, 'square');
  const pre = k.gain(0.55, chop);
  const o1 = k.oscForever('sawtooth', 75, pre);
  const o2 = k.oscForever('square', 151, pre);
  k.lfo(7, 4, o1.frequency);
  const gritG = k.gain(0.15);
  k.noiseForever('crunch', k.filter('bandpass', 2500, 1.5, gritG));
  return {
    apply(i, now) {
      o1.frequency.setTargetAtTime(70 + 55 * i, now, TC);
      o2.frequency.setTargetAtTime(141 + 111 * i, now, TC);
      bp.frequency.setTargetAtTime(800 + 700 * i, now, TC);
    },
  };
}

function steam(k: Kit): LoopRecipe {
  const g = k.am(0.32, 0.4, 0.08);
  const pk = k.filter('peaking', 6000, 1, g);
  pk.gain.value = 6;
  const hp = k.filter('highpass', 3000, 0, pk);
  k.noiseForever('white', hp);
  return {
    apply(i, now) {
      hp.frequency.setTargetAtTime(2400 + 1600 * i, now, TC);
    },
  };
}

function wind(k: Kit): LoopRecipe {
  const g = k.am(0.75, 0.11, 0.25);
  const bp = k.filter('bandpass', 400, 1.4, g);
  k.noiseForever('pink', bp);
  k.lfo(0.15, 120, bp.frequency);
  const whistleG = k.gain(0.05);
  const whistle = k.filter('bandpass', 5000, 3, whistleG);
  k.noiseForever('white', k.filter('highpass', 3000, 0, whistle));
  return {
    apply(i, now) {
      bp.frequency.setTargetAtTime(300 + 900 * i, now, TC);
      whistleG.gain.setTargetAtTime(0.02 + 0.08 * i * i, now, TC);
    },
  };
}

const BUILDERS: Readonly<Record<LoopKey, (k: Kit) => LoopRecipe>> = {
  fire,
  liquid,
  levitate,
  chainsaw,
  steam,
  wind,
};

export function buildLoop(key: LoopKey, k: Kit): LoopRecipe {
  return BUILDERS[key](k);
}
