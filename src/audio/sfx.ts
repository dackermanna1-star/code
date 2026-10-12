// Procedural SFX recipes. Each recipe writes into `k.out` starting at `k.t`, with `k.p` already
// holding the per-play pitch (requested pitch x random variation). Recipes aim for roughly
// unit-ish peaks; the per-sound mix level lives in SOUND_SPECS.

import type { Kit } from './synth';
import type { SoundName } from './types';

export interface SoundSpec {
  /** 0 (footsteps) .. 10 (player hurt / death / gods). Higher never loses its slot to lower. */
  readonly pri: number;
  /** Max fresh instances per 50 ms window; extra calls merge into the newest instance. */
  readonly max: number;
  /** Max simultaneous instances of this sound. */
  readonly poly: number;
  /** Audible range in world units (capped at 140). */
  readonly range: number;
  /** Mix level. */
  readonly vol: number;
  /** Reverb send. */
  readonly wet: number;
  /** Random pitch variation (± fraction). */
  readonly vary: number;
  /** Max gain growth when merging repeated hits (x base level). */
  readonly boost: number;
}

const S = (
  pri: number,
  max: number,
  poly: number,
  range: number,
  vol: number,
  wet: number,
  vary: number,
  boost = 2,
): SoundSpec => ({ pri, max, poly, range, vol, wet, vary, boost });

export const SOUND_SPECS: Readonly<Record<SoundName, SoundSpec>> = {
  //                     pri max poly range  vol   wet  vary
  cast_spark:        S(4, 3, 6, 100, 0.42, 0.25, 0.06),
  cast_generic:      S(4, 3, 6, 110, 0.45, 0.25, 0.06),
  cast_heavy:        S(5, 2, 4, 130, 0.3, 0.35, 0.05),
  cast_fire:         S(4, 3, 5, 110, 0.5, 0.3, 0.07),
  cast_bomb:         S(5, 2, 4, 110, 0.4, 0.3, 0.05),
  cast_dig:          S(3, 3, 5, 90, 0.4, 0.2, 0.08),
  cast_electric:     S(4, 3, 5, 120, 0.55, 0.25, 0.06),
  cast_ice:          S(4, 3, 5, 110, 0.45, 0.35, 0.06),
  cast_heal:         S(5, 2, 3, 100, 0.6, 0.4, 0.02),
  cast_teleport:     S(5, 2, 3, 120, 0.5, 0.4, 0.04),
  cast_material:     S(4, 3, 5, 100, 0.45, 0.25, 0.08),
  not_enough_mana:   S(6, 1, 2, 60, 0.3, 0.1, 0.03),

  impact_small:      S(1, 2, 6, 80, 0.32, 0.2, 0.15, 2.2),
  impact_dirt:       S(1, 2, 5, 80, 0.45, 0.25, 0.12, 2.2),
  explosion_small:   S(8, 4, 8, 140, 0.4, 0.5, 0.1, 1.8),
  explosion_big:     S(9, 2, 5, 140, 0.42, 0.6, 0.08, 1.6),
  dig:               S(2, 1, 3, 70, 0.4, 0.15, 0.12, 1.6),
  chainsaw:          S(3, 1, 2, 90, 0.45, 0.15, 0.05, 1.5),

  fire_ignite:       S(3, 2, 4, 100, 0.5, 0.3, 0.1),
  fire_crackle:      S(1, 1, 4, 70, 0.5, 0.2, 0.15, 1.8),
  water_splash:      S(2, 2, 4, 90, 0.5, 0.3, 0.12, 2),
  liquid_pour:       S(1, 1, 3, 70, 0.4, 0.25, 0.1, 1.6),
  steam_hiss:        S(2, 1, 3, 90, 0.35, 0.25, 0.1, 1.6),
  electric_zap:      S(3, 2, 4, 110, 0.6, 0.25, 0.1),
  freeze:            S(3, 2, 3, 100, 0.55, 0.35, 0.08),
  glass_break:       S(4, 2, 3, 110, 0.3, 0.35, 0.1),
  acid_sizzle:       S(2, 1, 3, 80, 0.5, 0.2, 0.1, 1.6),

  enemy_alert:       S(6, 2, 3, 120, 0.7, 0.35, 0.12),
  enemy_melee:       S(5, 2, 4, 90, 0.4, 0.25, 0.08),
  enemy_shoot:       S(5, 3, 5, 120, 0.35, 0.3, 0.08),
  enemy_hurt:        S(5, 3, 4, 100, 0.5, 0.3, 0.12),
  enemy_death:       S(6, 2, 4, 120, 0.5, 0.4, 0.1),
  creature_screech:  S(6, 1, 2, 140, 0.6, 0.5, 0.1),

  player_hurt:       S(10, 1, 2, 140, 0.65, 0.15, 0.06),
  player_death:      S(10, 1, 1, 140, 0.85, 0.5, 0),
  footstep:          S(0, 1, 2, 40, 0.3, 0.1, 0.12, 1.2),
  jump:              S(2, 1, 1, 60, 0.4, 0.1, 0.06),
  land:              S(3, 1, 1, 60, 0.22, 0.15, 0.08),
  levitate:          S(2, 1, 1, 60, 0.35, 0.15, 0.04),
  kick:              S(4, 1, 2, 70, 0.35, 0.15, 0.06),

  pickup_gold:       S(3, 2, 3, 60, 0.5, 0.15, 0.03, 1.5),
  pickup_item:       S(6, 1, 2, 60, 0.5, 0.2, 0.02),
  pickup_spell:      S(6, 1, 2, 60, 0.6, 0.35, 0.02),
  pickup_heart:      S(7, 1, 1, 60, 0.55, 0.35, 0),
  wand_edit:         S(5, 2, 3, 40, 0.45, 0.05, 0.08),
  potion_throw:      S(4, 1, 2, 80, 0.7, 0.2, 0.08),
  drink:             S(5, 1, 1, 40, 0.5, 0.1, 0.06),

  ui_click:          S(7, 2, 3, 140, 0.4, 0, 0.02),
  ui_hover:          S(2, 1, 2, 140, 0.3, 0, 0.03, 1),
  ui_open:           S(7, 1, 2, 140, 0.45, 0.1, 0.01),
  perk_pick:         S(8, 1, 1, 140, 0.55, 0.4, 0),
  heal:              S(7, 1, 1, 140, 0.65, 0.4, 0),
  holy_mountain:     S(9, 1, 1, 140, 0.6, 0.6, 0),
  gods_angry:        S(10, 1, 1, 140, 0.5, 0.5, 0),
  collapse:          S(8, 1, 2, 140, 0.6, 0.5, 0.06),
  teleport:          S(8, 1, 1, 140, 0.55, 0.45, 0.02),
  win:               S(10, 1, 1, 140, 0.8, 0.5, 0),
  gold_despawn:      S(0, 1, 2, 60, 0.25, 0.2, 0.08, 1.2),
};

export const SOUND_NAMES = Object.keys(SOUND_SPECS) as SoundName[];

type Recipe = (k: Kit) => void;

// ------------------------------------------------------------------ shared fragments
function debris(k: Kit, n: number, from: number, to: number, vol: number): void {
  for (let i = 0; i < n; i++) {
    const at = k.r(from, to);
    const v = vol * k.r(0.3, 1) * (1 - (at - from) / Math.max(0.001, to - from) * 0.6);
    if (k.chance(0.6)) k.click(at, v, k.r(500, 3000), k.out, k.r(0.008, 0.03));
    else k.burst('brown', at, k.r(0.04, 0.09), v * 1.4, 'lowpass', k.r(500, 1100), 200, 0, k.out, 0.002);
  }
}

function thump(k: Kit, at: number, f0: number, f1: number, dur: number, vol: number): void {
  k.tone('sine', f0, f1, at, dur, vol, k.out, 0.002);
}

const RECIPES: Readonly<Record<SoundName, Recipe>> = {
  // ---------------------------------------------------------------- casting
  cast_spark(k) {
    // Short bright zap: falling square chirp + saw edge + tiny hiss.
    const lp = k.filter('lowpass', 7000, 0);
    k.tone('square', 2500 * k.r(0.95, 1.05), 650, 0, 0.075, 0.28, lp, 0.001);
    k.tone('sawtooth', 1700, 480, 0.005, 0.05, 0.14, lp, 0.001);
    k.burst('white', 0, 0.035, 0.22, 'highpass', 5000, 3000, 0, k.out, 0.001);
  },
  cast_generic(k) {
    k.tone('triangle', 1100, 260, 0, 0.14, 0.45, k.out, 0.002);
    k.tone('square', 550, 130, 0, 0.1, 0.07, k.filter('lowpass', 2500, 0));
    k.burst('pink', 0, 0.16, 0.3, 'bandpass', 2600, 700, 2, k.out, 0.004);
  },
  cast_heavy(k) {
    const lp = k.filter('lowpass', 1800, 6);
    k.sweep(lp.frequency, 0, 2600, 180, 0.32);
    k.tone('sawtooth', 260, 68, 0, 0.32, 0.5, lp, 0.002);
    thump(k, 0, 150, 45, 0.3, 0.65);
    k.burst('pink', 0, 0.26, 0.35, 'bandpass', 1300, 280, 1.2, k.out, 0.005);
  },
  cast_fire(k) {
    // "Fwoomp": swelling band of noise rising in pitch, crackles riding on top.
    k.burst('pink', 0, 0.36, 0.55, 'bandpass', 450, 2200, 1.4, k.out, 0.05);
    k.burst('crackle', 0.03, 0.32, 0.45, 'highpass', 2000, 2000, 0, k.out, 0.01);
    thump(k, 0, 170, 70, 0.22, 0.32);
  },
  cast_bomb(k) {
    // Hollow mortar "thoonk" + fuse hiss.
    thump(k, 0, 230, 62, 0.2, 0.75);
    k.tone('square', 115, 50, 0, 0.06, 0.12, k.filter('lowpass', 900, 0));
    k.click(0, 0.35, 900, k.out, 0.015);
    k.burst('white', 0.06, 0.45, 0.07, 'highpass', 5000, 7500, 0, k.out, 0.05);
  },
  cast_dig(k) {
    // Gritty chunky buzz.
    const sh = k.shaper(k.curves.hard, k.gain(0.22));
    k.tone('square', 145, 85, 0, 0.13, 0.7, sh, 0.002);
    k.burst('crunch', 0, 0.12, 0.4, 'bandpass', 1500, 550, 1.2, k.out, 0.002);
  },
  cast_electric(k) {
    const bp = k.filter('bandpass', 1800, 1.1, k.gain(0.9));
    const o1 = k.tone('sawtooth', 120, 120, 0, 0.22, 0.55, bp, 0.001);
    k.jitter(o1.frequency, 0, 0.22, 120 * k.p, 0.5, 16);
    const o2 = k.tone('square', 240, 240, 0, 0.2, 0.25, bp, 0.001);
    k.jitter(o2.frequency, 0, 0.2, 240 * k.p, 0.4, 11);
    k.burst('crackle', 0, 0.22, 0.6, 'highpass', 3000, 3000, 0, k.out, 0.001);
    k.burst('white', 0, 0.05, 0.25, 'highpass', 6000, 6000, 0, k.out, 0.001);
  },
  cast_ice(k) {
    // Glassy inharmonic partials + crystalline "shhk".
    k.bell(1900 * k.r(0.92, 1.08), 0, 0.38, 0.17, k.out, 1.2);
    k.bell(2650 * k.r(0.92, 1.08), 0.03, 0.3, 0.11, k.out, 1.2);
    k.burst('white', 0, 0.18, 0.25, 'highpass', 7000, 3500, 0, k.out, 0.003);
    k.tone('triangle', 1600, 3200, 0, 0.1, 0.08);
  },
  cast_heal(k) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => k.tone('sine', f, f, i * 0.06, 0.42, 0.18, k.out, 0.012));
    k.burst('white', 0, 0.45, 0.05, 'bandpass', 6000, 9500, 4, k.out, 0.12);
  },
  cast_teleport(k) {
    k.fm(200, 1.5, 3, 0, 0.36, 0.35, k.out, 1600, 0.5, 0.01);
    k.burst('pink', 0, 0.36, 0.22, 'bandpass', 400, 4200, 3, k.out, 0.05);
  },
  cast_material(k) {
    // Liquid "blorp".
    const o = k.tone('sine', 380, 140, 0, 0.18, 0.55, k.out, 0.004);
    k.lfo(k.r(22, 32), 45 * k.p, o.frequency, 'sine', 0, 0.18);
    k.burst('brown', 0, 0.2, 0.45, 'bandpass', 620, 300, 3, k.out, 0.004);
  },
  not_enough_mana(k) {
    // Dull short "thunk": empty wand.
    k.tone('sine', 125, 72, 0, 0.11, 0.8, k.out, 0.002);
    k.tone('triangle', 250, 140, 0, 0.05, 0.18, k.out, 0.002);
    k.burst('brown', 0, 0.08, 0.55, 'lowpass', 480, 200, 0, k.out, 0.002);
  },

  // ---------------------------------------------------------------- impacts / terrain
  impact_small(k) {
    const f = k.r(1400, 4200);
    k.burst(k.chance(0.5) ? 'white' : 'crunch', 0, k.r(0.03, 0.06), 0.45, 'bandpass', f, f * 0.6, 1.5, k.out, 0.001);
    k.tone('sine', k.r(240, 420), 120, 0, 0.05, 0.22, k.out, 0.001);
  },
  impact_dirt(k) {
    k.burst('brown', 0, 0.14, 0.75, 'lowpass', 650, 150, 0, k.out, 0.002);
    thump(k, 0, 115, 50, 0.1, 0.35);
    for (let i = 0, n = k.ri(3, 6); i < n; i++) k.click(k.r(0.02, 0.18), k.r(0.05, 0.18), k.r(600, 2200), k.out, 0.02);
  },
  explosion_small(k) {
    const v = k.r(0.85, 1.1);
    thump(k, 0, 125, 30, 0.5, 0.95 * v);
    k.tone('triangle', 78, 28, 0, 0.35, 0.4 * v, k.out, 0.002);
    const sat = k.shaper(k.curves.soft, k.gain(0.8));
    k.burst('crunch', 0, 0.8, 0.9 * v, 'lowpass', 7500, 220, 2, sat, 0.002);
    k.burst('brown', 0.01, 1.0, 0.7 * v, 'lowpass', 1400, 100, 0, k.out, 0.01);
    debris(k, k.ri(3, 6), 0.08, 0.6, 0.12);
  },
  explosion_big(k) {
    const v = k.r(0.9, 1.05);
    thump(k, 0, 98, 22, 1.2, 1.0 * v);
    k.tone('square', 62, 24, 0, 0.35, 0.16, k.filter('lowpass', 300, 0), 0.002);
    const sat = k.shaper(k.curves.soft, k.gain(0.85));
    k.burst('crunch', 0, 1.8, 1.0 * v, 'lowpass', 6500, 120, 3, sat, 0.002);
    k.burst('white', 0, 0.22, 0.32, 'highpass', 3000, 1000, 0, k.out, 0.001);
    // Rumble tail.
    const rg = k.gain(0);
    const rf = k.filter('lowpass', 160, 3, rg);
    k.noise('brown', 0.05, 3.3, rf, 0.8);
    k.swell(rg.gain, 0.05, 0.25, 0.9 * v, 0.6, 2.4);
    k.tone('sine', 44, 30, 0.1, 2.6, 0.35, k.out, 0.3);
    // Cave slap-back.
    thump(k, 0.27, 82, 28, 0.6, 0.3);
    k.burst('brown', 0.27, 0.8, 0.3, 'lowpass', 900, 100, 0, k.out, 0.01);
    debris(k, k.ri(8, 14), 0.15, 2.3, 0.1);
  },
  dig(k) {
    const sh = k.shaper(k.curves.crush, k.gain(0.45));
    k.burst('crunch', 0, 0.1, 0.65, 'bandpass', k.r(700, 1300), 400, 1.5, sh, 0.002);
    k.tone('square', k.r(60, 80), 48, 0, 0.09, 0.4, k.filter('lowpass', 500, 0), 0.002);
    k.click(0, 0.2, 2000);
  },
  chainsaw(k) {
    const out = k.gain(0.33);
    const bp = k.filter('bandpass', 1100, 0.8, out);
    const sh = k.shaper(k.curves.hard, bp);
    const chop = k.am(0.65, 32, 0.35, sh, 'square', 0, 0.26);
    const env = k.gain(0, chop);
    k.osc('sawtooth', 95 * k.p, 0, 0.26, env);
    k.osc('square', 192 * k.p, 0, 0.26, env);
    k.perc(env.gain, 0, 0.01, 0.6, 0.12, 0.12);
    k.burst('crunch', 0, 0.25, 0.22, 'bandpass', 2500, 2500, 1.5, k.out, 0.01);
  },

  // ---------------------------------------------------------------- elements / materials
  fire_ignite(k) {
    k.burst('pink', 0, 0.42, 0.6, 'bandpass', 300, 1800, 1.2, k.out, 0.05);
    k.burst('brown', 0, 0.3, 0.5, 'lowpass', 400, 150, 0, k.out, 0.02);
    k.burst('crackle', 0.05, 0.4, 0.5, 'highpass', 1500, 1500, 0, k.out, 0.01);
  },
  fire_crackle(k) {
    for (let i = 0, n = k.ri(3, 7); i < n; i++) {
      k.click(k.r(0, 0.3), k.r(0.12, 0.5), k.r(1200, 5000), k.out, k.r(0.004, 0.015));
    }
    k.burst('crackle', 0, 0.3, 0.3, 'bandpass', 2500, 2500, 0.7, k.out, 0.01);
  },
  water_splash(k) {
    k.burst('white', 0, 0.3, 0.55, 'bandpass', k.r(1400, 2000), 500, 1.1, k.out, 0.004);
    k.burst('pink', 0, 0.2, 0.4, 'lowpass', 1200, 300, 0, k.out, 0.004);
    for (let i = 0, n = k.ri(2, 5); i < n; i++) {
      const f = k.r(600, 1400);
      k.tone('sine', f, f * 1.8, k.r(0.03, 0.25), 0.04, 0.12, k.out, 0.002);
    }
  },
  liquid_pour(k) {
    const g = k.gain(0);
    const bp = k.filter('bandpass', 500, 4, g);
    k.noise('brown', 0, 0.6, bp);
    k.lfo(k.r(6, 11), 250, bp.frequency, 'triangle', 0, 0.6);
    k.swell(g.gain, 0, 0.05, 1.3, 0.3, 0.25);
    for (let i = 0, n = k.ri(3, 6); i < n; i++) {
      const f = k.r(300, 700);
      k.tone('sine', f, f * 1.5, k.r(0.02, 0.5), 0.05, 0.1, k.out, 0.003);
    }
  },
  steam_hiss(k) {
    const g = k.gain(0);
    const hp = k.filter('highpass', 1800, 0, g);
    k.noise('white', 0, 0.8, hp);
    k.sweep(hp.frequency, 0, 1800, 4500, 0.8);
    k.swell(g.gain, 0, 0.06, 0.4, 0.2, 0.5);
  },
  electric_zap(k) {
    const out = k.gain(0.6);
    const gate = k.am(0.5, k.r(40, 80), 0.5, out, 'square', 0, 0.2);
    const bp = k.filter('bandpass', 2000, 0.9, gate);
    const o = k.tone('sawtooth', 70, 70, 0, 0.18, 0.75, bp, 0.001);
    k.jitter(o.frequency, 0, 0.18, 70 * k.p, 0.6, 12);
    k.tone('square', 140, 140, 0, 0.15, 0.3, bp, 0.001);
    k.burst('white', 0, 0.16, 0.4, 'highpass', 4000, 4000, 0, gate, 0.001);
    k.burst('crackle', 0, 0.2, 0.5, 'highpass', 2500, 2500, 0, k.out, 0.001);
  },
  freeze(k) {
    k.burst('white', 0, 0.5, 0.35, 'bandpass', 7000, 2500, 3, k.out, 0.005);
    for (let i = 0, n = k.ri(6, 10); i < n; i++) {
      const at = k.r(0, 0.45);
      k.click(at, 0.3 * (1 - at), k.r(3000, 8000), k.out, 0.006);
    }
    k.bell(k.r(2200, 3000), 0, 0.5, 0.1);
    k.tone('sine', 3000, 1400, 0, 0.3, 0.06);
  },
  glass_break(k) {
    k.burst('white', 0, 0.25, 0.5, 'highpass', 3000, 5000, 0, k.out, 0.001);
    k.click(0, 0.6, 3500, k.out, 0.01);
    for (let i = 0, n = k.ri(4, 7); i < n; i++) {
      k.bell(k.r(2500, 6000), k.r(0, 0.12), k.r(0.1, 0.35), k.r(0.05, 0.14), k.out, 1.4);
    }
  },
  acid_sizzle(k) {
    const g = k.gain(0);
    const bp = k.filter('bandpass', 4500, 1.5, g);
    k.noise('crackle', 0, 0.6, bp, k.r(0.9, 1.4));
    k.swell(g.gain, 0, 0.03, 1.1, 0.25, 0.3);
    k.burst('white', 0, 0.5, 0.15, 'highpass', 6000, 6000, 0, k.out, 0.05);
    for (let i = 0; i < 2; i++) k.tone('sine', k.r(180, 260), 420, k.r(0, 0.3), 0.05, 0.12, k.out, 0.003);
  },

  // ---------------------------------------------------------------- enemies
  enemy_alert(k) {
    // Rising "huh?!" grunt through an 'a' formant.
    const fm = k.formant('a', k.gain(1.2), 8, k.r(0.9, 1.2));
    const o = k.tone('sawtooth', 160, 270, 0, 0.22, 0.6, fm, 0.012);
    k.lfo(k.r(6, 9), 15, o.detune, 'sine', 0, 0.22);
    k.burst('pink', 0, 0.1, 0.15, 'bandpass', 1500, 1500, 2, k.out, 0.005);
  },
  enemy_melee(k) {
    k.burst('pink', 0, 0.14, 0.45, 'bandpass', 400, 1800, 2, k.out, 0.04);
    thump(k, 0.1, 140, 60, 0.12, 0.55);
    k.burst('brown', 0.1, 0.1, 0.5, 'lowpass', 900, 200, 0, k.out, 0.002);
  },
  enemy_shoot(k) {
    const sh = k.shaper(k.curves.soft, k.gain(0.5));
    k.tone('square', 700, 180, 0, 0.12, 0.6, sh, 0.001);
    k.tone('sawtooth', 350, 120, 0, 0.1, 0.3, sh, 0.001);
    k.burst('crunch', 0, 0.08, 0.3, 'highpass', 1500, 800, 0, k.out, 0.001);
  },
  enemy_hurt(k) {
    const fm = k.formant(k.pick(['e', 'a'] as const), k.gain(0.55), 8, k.r(0.9, 1.15));
    k.tone('sawtooth', 210, 130, 0, 0.16, 0.7, fm, 0.005);
    k.burst('pink', 0, 0.08, 0.3, 'lowpass', 2000, 600, 0, k.out, 0.002);
    thump(k, 0, 120, 70, 0.08, 0.3);
  },
  enemy_death(k) {
    const fm = k.formant('o', k.gain(0.5), 7, k.r(0.85, 1.1));
    const o = k.tone('sawtooth', 220, 55, 0, 0.6, 0.7, fm, 0.01);
    k.lfo(k.r(7, 11), 40, o.detune, 'sine', 0, 0.6);
    k.burst('brown', 0.05, 0.35, 0.55, 'lowpass', 1200, 200, 2, k.out, 0.005);
    k.burst('pink', 0.05, 0.2, 0.3, 'bandpass', 900, 400, 2, k.out, 0.005);
    thump(k, 0.02, 100, 45, 0.25, 0.4);
  },
  creature_screech(k) {
    const out = k.shaper(k.curves.soft, k.gain(0.45));
    const bp = k.filter('bandpass', 1800, 1.2, out);
    k.fm(650, 1.41, 2.5, 0, 0.65, 0.6, bp, 1350, 1.1, 0.03, 'sawtooth');
    k.fm(660, 0.73, 1.8, 0.02, 0.6, 0.35, bp, 1180, 0.8, 0.04, 'sine');
    k.tone('square', 1300, 900, 0.1, 0.5, 0.08, bp, 0.05);
    k.burst('white', 0, 0.6, 0.12, 'bandpass', 3000, 3000, 2, bp, 0.03);
  },

  // ---------------------------------------------------------------- player
  player_hurt(k) {
    thump(k, 0, 185, 80, 0.18, 0.8);
    const fm = k.formant('u', k.gain(0.5), 7);
    k.tone('sawtooth', 190, 120, 0, 0.18, 0.6, fm, 0.004);
    k.burst('brown', 0, 0.12, 0.6, 'lowpass', 1500, 300, 0, k.out, 0.002);
    k.burst('crunch', 0, 0.05, 0.25, 'bandpass', 2500, 1200, 1, k.out, 0.001);
  },
  player_death(k) {
    const fm = k.formant('o', k.gain(0.45), 6);
    const o = k.tone('sawtooth', 260, 40, 0, 1.6, 0.6, fm, 0.01);
    k.lfo(6, 30, o.detune, 'sine', 0, 1.6);
    k.tone('sine', 120, 30, 0, 1.8, 0.6, k.out, 0.01);
    k.burst('brown', 0, 2.2, 0.5, 'lowpass', 600, 60, 0, k.out, 0.05);
    k.tone('triangle', 110, 104, 0.1, 2.2, 0.12, k.out, 0.2);
    k.tone('triangle', 116.5, 110, 0.1, 2.2, 0.1, k.out, 0.2);
    k.bell(98, 0.3, 2.6, 0.25, k.out, 0.6);
  },
  footstep(k) {
    const c = k.r(450, 900);
    k.burst('brown', 0, k.r(0.05, 0.08), 0.65, 'lowpass', c, c * 0.5, 0, k.out, 0.003);
    k.burst('crunch', 0, 0.03, 0.12, 'bandpass', k.r(1500, 3000), 1200, 1.5, k.out, 0.001);
  },
  jump(k) {
    k.burst('pink', 0, 0.14, 0.35, 'bandpass', 300, 1100, 1.5, k.out, 0.02);
    k.tone('sine', 220, 330, 0, 0.08, 0.12, k.out, 0.005);
    k.burst('brown', 0, 0.05, 0.3, 'lowpass', 600, 300, 0, k.out, 0.002);
  },
  land(k) {
    k.burst('brown', 0, 0.14, 0.8, 'lowpass', 700, 160, 0, k.out, 0.002);
    thump(k, 0, 95, 45, 0.13, 0.5);
    k.burst('crunch', 0, 0.05, 0.15, 'bandpass', 1800, 900, 1, k.out, 0.001);
  },
  levitate(k) {
    k.burst('pink', 0, 0.3, 0.32, 'bandpass', 600, 1500, 1.2, k.out, 0.06);
    k.tone('sine', 300, 450, 0, 0.25, 0.08, k.out, 0.05);
  },
  kick(k) {
    k.burst('pink', 0, 0.1, 0.35, 'bandpass', 500, 1600, 1.5, k.out, 0.02);
    thump(k, 0.07, 160, 60, 0.12, 0.7);
    k.burst('brown', 0.07, 0.08, 0.5, 'lowpass', 1000, 300, 0, k.out, 0.002);
  },

  // ---------------------------------------------------------------- pickups / items
  pickup_gold(k) {
    const lp = k.filter('lowpass', 5000, 0);
    const f = 1318.5 * k.r(0.98, 1.03);
    k.tone('square', f, f, 0, 0.06, 0.13, lp, 0.001);
    k.tone('square', f * 1.335, f * 1.335, 0.055, 0.18, 0.12, lp, 0.001);
    k.tone('sine', f * 2, f * 2, 0.055, 0.15, 0.06, k.out, 0.001);
  },
  pickup_item(k) {
    k.tone('triangle', 520, 520, 0, 0.12, 0.35, k.out, 0.002);
    k.tone('triangle', 780, 780, 0.08, 0.2, 0.3, k.out, 0.002);
    k.click(0, 0.15, 2000);
  },
  pickup_spell(k) {
    const base = 659.25;
    [1, 1.26, 1.5, 2, 2.52].forEach((r, i) => k.fm(base * r, 2, 0.6, i * 0.045, 0.45, 0.13, k.out, base * r, 0.1, 0.004));
    k.burst('white', 0, 0.6, 0.06, 'bandpass', 8000, 5000, 3, k.out, 0.05);
  },
  pickup_heart(k) {
    [261.63, 329.63, 392, 523.25].forEach((f, i) => {
      const o = k.tone('triangle', f, f, i * 0.07, 0.6, 0.22, k.out, 0.01);
      k.lfo(5.5, 12, o.detune, 'sine', i * 0.07, 0.6);
    });
    k.tone('sine', 130.8, 130.8, 0, 0.8, 0.2, k.out, 0.05);
  },
  wand_edit(k) {
    k.click(0, 0.4, k.r(2200, 3200), k.out, 0.01);
    k.tone('square', 1100, 900, 0, 0.018, 0.08, k.out, 0.001);
    k.click(0.035, 0.2, 1500, k.out, 0.01);
  },
  potion_throw(k) {
    k.burst('pink', 0, 0.25, 0.35, 'bandpass', 600, 1800, 2, k.out, 0.05);
    k.bell(2400 * k.r(0.95, 1.05), 0, 0.15, 0.06, k.out, 1);
    k.burst('brown', 0.02, 0.2, 0.2, 'bandpass', 500, 300, 3, k.out, 0.01);
  },
  drink(k) {
    const n = k.ri(2, 3);
    for (let i = 0; i < n; i++) {
      const at = i * k.r(0.2, 0.26);
      k.tone('sine', 260, 140, at, 0.1, 0.45, k.out, 0.01);
      k.burst('brown', at, 0.1, 0.35, 'bandpass', 700, 350, 3, k.out, 0.01);
    }
  },

  // ---------------------------------------------------------------- UI / meta
  ui_click(k) {
    k.tone('square', 1000, 900, 0, 0.025, 0.14, k.filter('lowpass', 4000, 0), 0.001);
    k.click(0, 0.12, 3000, k.out, 0.006);
  },
  ui_hover(k) {
    k.tone('sine', 1600, 1650, 0, 0.022, 0.08, k.out, 0.002);
  },
  ui_open(k) {
    k.tone('triangle', 400, 400, 0, 0.08, 0.22, k.out, 0.003);
    k.tone('triangle', 600, 600, 0.06, 0.12, 0.22, k.out, 0.003);
    k.burst('pink', 0, 0.15, 0.08, 'bandpass', 800, 2400, 1.5, k.out, 0.03);
  },
  perk_pick(k) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => k.tone('triangle', f, f, i * 0.03, 1.2, 0.12, k.out, 0.01));
    [1567.98, 2093, 2637, 3136].forEach((f, i) => k.bell(f, 0.1 + i * 0.08, 0.8, 0.07));
    k.burst('white', 0, 1.0, 0.05, 'bandpass', 9000, 6000, 4, k.out, 0.2);
  },
  heal(k) {
    [392, 493.88, 587.33, 783.99].forEach((f, i) => {
      const o = k.tone('sine', f, f * 1.003, i * 0.08, 0.7, 0.16, k.out, 0.04);
      k.lfo(6, 8, o.detune, 'sine', i * 0.08, 0.7);
    });
    k.burst('white', 0, 0.8, 0.04, 'bandpass', 5000, 10000, 5, k.out, 0.3);
  },
  holy_mountain(k) {
    // Ethereal choir: detuned saws through an "ah" formant bank, slow swell, D major.
    const dur = 5.8;
    const outG = k.gain(0);
    k.swell(outG.gain, 0, 1.2, 0.55, 2.0, 2.5);
    const voice = k.formant('a', outG, 6);
    const mix = k.gain(0.12, voice);
    const vib = k.ctx.createGain();
    vib.gain.value = 7;
    k.osc('sine', 5.2, 0, dur, vib);
    for (const f of [146.83, 220, 293.66, 369.99, 440]) {
      for (const det of [-9, 0, 8]) {
        const o = k.osc('sawtooth', f * k.p, 0, dur, mix);
        o.detune.value = det + k.r(-3, 3);
        vib.connect(o.detune);
      }
    }
    k.tone('sine', 73.42, 73.42, 0, dur, 0.18, k.out, 1.2);
    [1174.66, 1479.98, 1760].forEach((f, i) => k.bell(f, 0.6 + i * 0.5, 2.5, 0.04, k.out, 0.4));
  },
  gods_angry(k) {
    // Dissonant low swell with an opening filter, rumble and a late thunder crack.
    const out = k.gain(0);
    k.swell(out.gain, 0, 2.2, 0.75, 1.0, 1.8);
    const lp = k.filter('lowpass', 150, 8, out);
    k.sweep(lp.frequency, 0, 150, 1400, 3.0);
    const sh = k.shaper(k.curves.soft, lp);
    const mix = k.am(0.16, k.r(3, 5), 0.05, sh, 'sine', 0, 5);
    for (const f of [55, 58.27, 77.78, 82.41, 116.54]) {
      const o = k.osc('sawtooth', f * k.p, 0, 5, mix);
      o.detune.value = k.r(-12, 12);
    }
    k.burst('brown', 0, 5, 0.6, 'lowpass', 120, 80, 4, k.out, 2.0);
    k.tone('sine', 36, 30, 0, 5, 0.5, k.out, 1.8);
    k.burst('crunch', 2.0, 1.2, 0.4, 'lowpass', 4000, 200, 0, k.out, 0.01);
  },
  collapse(k) {
    const g = k.gain(0);
    const lp = k.filter('lowpass', 220, 3, g);
    k.noise('brown', 0, 3.2, lp, 0.9);
    k.sweep(lp.frequency, 0, 260, 90, 3.0);
    k.swell(g.gain, 0, 0.2, 0.9, 1.4, 1.5);
    k.tone('sine', 50, 32, 0, 3, 0.4, k.out, 0.2);
    k.burst('crunch', 0, 0.4, 0.5, 'lowpass', 3000, 400, 2, k.out, 0.005);
    debris(k, k.ri(15, 24), 0.05, 2.6, 0.16);
  },
  teleport(k) {
    k.fm(150, 2.01, 4, 0, 0.4, 0.3, k.out, 1800, 0.3, 0.02);
    k.fm(1800, 1.5, 0.5, 0.35, 0.45, 0.2, k.out, 300, 3, 0.01);
    k.burst('pink', 0, 0.8, 0.3, 'bandpass', 300, 5000, 2, k.out, 0.3);
    [2093, 2637, 3136].forEach((f, i) => k.bell(f, 0.3 + i * 0.07, 0.6, 0.04));
  },
  win(k) {
    [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      k.tone('triangle', f, f, i * 0.11, 0.6, 0.18, k.out, 0.005),
    );
    const g = k.gain(0);
    k.swell(g.gain, 0.8, 0.5, 0.35, 1.5, 1.5);
    const lp = k.filter('lowpass', 1800, 0, g);
    const mix = k.gain(0.15, lp);
    for (const f of [130.81, 261.63, 329.63, 392, 523.25]) {
      for (const det of [-6, 6]) {
        const o = k.osc('sawtooth', f, 0.8, 3.6, mix);
        o.detune.value = det;
      }
    }
    [2093, 2637, 3136, 4186].forEach((f, i) => k.bell(f, 0.9 + i * 0.12, 1.2, 0.05));
  },
  gold_despawn(k) {
    k.tone('sine', 1800, 900, 0, 0.09, 0.15, k.out, 0.002);
    k.tone('triangle', 2700, 1350, 0.02, 0.07, 0.06, k.out, 0.002);
  },
};

/** Build `name` into the kit's current voice. */
export function renderSound(k: Kit, name: SoundName): void {
  RECIPES[name](k);
}
