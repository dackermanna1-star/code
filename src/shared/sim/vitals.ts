import type { DamageType } from '../data/damage';

/**
 * Survival metabolism — pure and deterministic so it can be unit tested.
 * Design (docs/DESIGN.md §Survival): needs degrade progressively rather
 * than killing instantly; every condition has a clear counter (food, water,
 * clothing, fire, bandages, pills).
 */

export const MAX_HEALTH = 100;
export const MAX_CALORIES = 500;
export const MAX_HYDRATION = 250;

export interface Vitals {
  hp: number;
  cal: number;
  hyd: number;
  /** Bleeding points; each point bleeds over time. */
  bleed: number;
  /** Absorbed radiation (rads). */
  rad: number;
  /** Food poisoning points. */
  poison: number;
  /** Pending heal-over-time points. */
  hot: number;
  /** 0..1 */
  wet: number;
  /** Last computed felt temperature (°C). */
  temp: number;
}

export interface VitalsEnv {
  /** Ambient air temperature (°C) including time of day & weather. */
  airTemp: number;
  /** Total clothing warmth (°C). */
  warmth: number;
  /** Heat source nearby (campfire/furnace). */
  nearFire: boolean;
  inWater: boolean;
  raining: boolean;
  /** Radiation zone strength at position (rads/s). */
  radZone: number;
  /** Clothing radiation protection 0..1. */
  radProtection: number;
  /** 0 idle .. 1 sprinting. */
  exertion: number;
  metabolismRate: number;
}

export function newVitals(): Vitals {
  return { hp: 60, cal: 150, hyd: 80, bleed: 0, rad: 0, poison: 0, hot: 0, wet: 0, temp: 20 };
}

export const COMFORT_MIN = 8;
export const COMFORT_MAX = 32;

export interface VitalsResult {
  damage: Array<[DamageType, number]>;
  flags: string[];
}

export function feltTemperature(v: Vitals, env: VitalsEnv): number {
  let t = env.airTemp + env.warmth - v.wet * 12;
  if (env.nearFire) t = Math.max(t, Math.min(t + 18, 30));
  return t;
}

export function tickVitals(v: Vitals, env: VitalsEnv, dt: number): VitalsResult {
  const flags: string[] = [];
  const damage: Array<[DamageType, number]> = [];
  const m = env.metabolismRate;

  // Wetness
  if (env.inWater) v.wet = 1;
  else if (env.raining) v.wet = Math.min(1, v.wet + 0.01 * dt);
  else v.wet = Math.max(0, v.wet - (env.nearFire ? 0.08 : 0.015) * dt);
  if (v.wet > 0.05) flags.push('wet');

  // Temperature
  const t = feltTemperature(v, env);
  v.temp = t;
  let calDrain = 0.055 + env.exertion * 0.07;
  let hydDrain = 0.04 + env.exertion * 0.04;
  if (t < COMFORT_MIN) {
    flags.push('cold');
    calDrain += (COMFORT_MIN - t) * 0.008;
    if (t < -4) damage.push(['cold', (-4 - t) * 0.03 * dt]);
  } else if (t > COMFORT_MAX) {
    flags.push('hot');
    hydDrain += (t - COMFORT_MAX) * 0.01;
    if (t > 42) damage.push(['heat', (t - 42) * 0.04 * dt]);
  }

  v.cal = Math.max(0, v.cal - calDrain * m * dt);
  v.hyd = Math.max(0, v.hyd - hydDrain * m * dt);
  if (v.cal <= 0) {
    flags.push('starving');
    damage.push(['hunger', 0.2 * dt]);
  } else if (v.cal < 50) flags.push('hungry');
  if (v.hyd <= 0) {
    flags.push('dehydrated');
    damage.push(['thirst', 0.25 * dt]);
  } else if (v.hyd < 30) flags.push('thirsty');

  // Bleeding
  if (v.bleed > 0) {
    flags.push('bleeding');
    damage.push(['bleed', Math.min(v.bleed, 0.5 * dt)]);
    v.bleed = Math.max(0, v.bleed - 1.0 * dt);
  }

  // Food poisoning
  if (v.poison > 0) {
    flags.push('poisoned');
    damage.push(['hunger', 0.3 * dt]);
    v.poison = Math.max(0, v.poison - 1 * dt);
  }

  // Radiation
  const exposure = env.radZone * Math.max(0, 1 - env.radProtection);
  if (exposure > 0) {
    v.rad = Math.min(500, v.rad + exposure * dt);
    flags.push('radiation');
  } else v.rad = Math.max(0, v.rad - 0.25 * dt);
  if (v.rad > 40) {
    flags.push('irradiated');
    damage.push(['radiation', (v.rad - 40) * 0.006 * dt]);
  }

  // Heal over time (syringes / medkits) works even when bleeding.
  if (v.hot > 0) {
    const h = Math.min(v.hot, 2 * dt);
    v.hot -= h;
    v.hp = Math.min(MAX_HEALTH, v.hp + h);
  }

  // Natural regeneration when well fed, hydrated, not bleeding.
  if (v.cal > 100 && v.hyd > 60 && v.bleed <= 0 && v.poison <= 0 && v.rad < 40 && v.hp < MAX_HEALTH) {
    const rate = (env.nearFire ? 0.25 : 0.1) * dt;
    v.hp = Math.min(MAX_HEALTH, v.hp + rate);
    v.cal = Math.max(0, v.cal - rate * 0.5);
  }
  return { damage, flags };
}

/** Apply food: returns false if the player cannot eat (full). */
export function applyFood(v: Vitals, f: { calories: number; hydration: number; health?: number; poison?: number }): boolean {
  if (f.calories > 0 && f.hydration <= 0 && v.cal >= MAX_CALORIES - 1) return false;
  if (f.hydration > 0 && f.calories <= 0 && v.hyd >= MAX_HYDRATION - 1) return false;
  v.cal = Math.min(MAX_CALORIES, v.cal + f.calories);
  v.hyd = Math.min(MAX_HYDRATION, v.hyd + f.hydration);
  if (f.health) v.hot += f.health;
  if (f.poison) v.poison += f.poison;
  return true;
}
