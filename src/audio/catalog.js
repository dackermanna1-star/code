// Sound catalogue: recipes, variant counts, synthesis rates and mixing data.
//
// Mixing fields (one-shots):
//   cat     voice category (per-category concurrency caps)
//   level   dB at or inside `ref` metres; roll = distance exponent (1 = inverse law)
//   range   metres where the sound has faded out completely
//   agg     beyond this distance the event feeds the distant-battle bed instead of a voice
//   farDist distance where the pre-filtered "far" layer replaces the near recording
//   wet     reverb send scale; decay = seconds, used to rank fading voices for stealing
//   jitter  [pitch fraction, gain dB] random variation per event
//   bed     'small' | 'heavy': how aggregated far events are rendered by the bed
//   duck    radius (m) inside which the event ducks the mix and rings the ears
//   size    physical extent (m): close, large sources are panned less (they surround you)
import { CANNONS, GUNS, JET_GUNS, cannon, farLayer, gunshot, jetGun, jetGunTail } from './synth/weapons.js';
import {
  EXPLOSIONS,
  ammoCookoff,
  buildingCollapse,
  debrisFall,
  explosion,
  farExplosion,
  fireBurst,
  vehicleDestroyed,
} from './synth/explosions.js';
import { LAUNCHES, flareLaunch, grenadeLaunch, rocketLaunch, smokeLaunch } from './synth/launches.js';
import * as FX from './synth/effects.js';
import * as EN from './synth/engines.js';
import * as NA from './synth/nature.js';
import * as RA from './synth/radio.js';

export const FULL_RATE = 0;

export const CATEGORY_CAPS = { small: 22, heavy: 12, explosion: 14, impact: 10, misc: 10, flyby: 6, ui: 4 };

const syn = (fn, variants, rate = FULL_RATE) => ({ fn, variants, rate });

function gun(name, mix, variants = 4, farVariants = 2) {
  return {
    cat: 'small', bed: 'small', wet: 1, decay: 0.12, jitter: [0.035, 1.5], farDist: 320, ...mix,
    near: syn((rng, sr) => gunshot(GUNS[name], rng, sr), variants, 32000),
    far: { fn: farLayer(name), variants: farVariants },
  };
}

function heavyGun(name, mix, rate = 32000) {
  return {
    cat: 'heavy', bed: 'heavy', wet: 1, decay: 0.25, jitter: [0.03, 1.2], farDist: 700, ...mix,
    near: syn((rng, sr) => (GUNS[name] ? gunshot(GUNS[name], rng, sr) : cannon(CANNONS[name], rng, sr)), 3, rate),
    far: { fn: farLayer(name), variants: 2 },
  };
}

function launch(name, mix, variants, rate = 24000) {
  return {
    cat: 'heavy', bed: 'heavy', wet: 0.9, decay: 0.8, jitter: [0.04, 1.5], ...mix,
    near: syn((rng, sr) => rocketLaunch(LAUNCHES[name], rng, sr), variants, rate),
  };
}

function boom(name, mix, variants, rate) {
  return {
    cat: 'explosion', bed: 'heavy', wet: 1, jitter: [0.05, 1.5], ...mix,
    near: syn((rng, sr) => explosion(EXPLOSIONS[name], rng, sr), variants, rate),
    far: { fn: farExplosion(name), variants: 2 },
  };
}

function fx(cat, fn, variants, rate, mix) {
  return { cat, bed: null, wet: 0.6, decay: 0.2, jitter: [0.05, 1.5], ...mix, near: syn(fn, variants, rate) };
}

export const SOUNDS = {
  // Small arms
  rifle: gun('rifle', { level: -1, ref: 3, roll: 0.6, range: 1400 }),
  rifle_ak: gun('rifle_ak', { level: 0, ref: 3, roll: 0.6, range: 1400 }),
  lmg: gun('lmg', { level: -0.5, ref: 3, roll: 0.6, range: 1400 }, 3),
  gpmg: gun('gpmg', { level: 1, ref: 3, roll: 0.6, range: 1600, decay: 0.15 }, 3),
  sniper: gun('sniper', { level: 3, ref: 3, roll: 0.6, range: 2000, decay: 0.4, farDist: 400 }, 3, 2),
  pistol: gun('pistol', { level: -4, ref: 2, roll: 0.65, range: 700, decay: 0.08, farDist: 220 }, 3, 2),
  smg: gun('smg', { level: -3, ref: 2, roll: 0.65, range: 800, decay: 0.08, farDist: 240 }, 3, 2),
  hmg: gun('hmg', { level: 3, ref: 4, roll: 0.58, range: 2500, decay: 0.18, farDist: 450, cat: 'heavy', bed: 'heavy' }, 3),

  // Heavy direct fire
  autocannon: heavyGun('autocannon', { level: 4, ref: 5, roll: 0.58, range: 3000 }),
  aa_gun: heavyGun('aa_gun', { level: 4, ref: 5, roll: 0.58, range: 3000 }),
  heli_gun: heavyGun('heli_gun', { level: 3, ref: 5, roll: 0.58, range: 3000 }),
  jet_gun: {
    cat: 'heavy', bed: 'heavy', wet: 1, decay: 1, jitter: [0.02, 1], level: 6, ref: 10, roll: 0.55, range: 6000,
    burst: true, near: syn((rng, sr, v) => jetGun(JET_GUNS[v % JET_GUNS.length], rng, sr), 2, 32000),
  },
  jet_gun_tail: {
    internal: true, near: syn((rng, sr, v) => jetGunTail(JET_GUNS[v % JET_GUNS.length], rng, sr), 2, 32000),
  },
  tank_cannon: heavyGun('tank_cannon', { level: 11, ref: 6, roll: 0.55, range: 6000, decay: 1, farDist: 900, duck: 25 }, 24000),
  howitzer: heavyGun('howitzer', { level: 9, ref: 8, roll: 0.55, range: 8000, decay: 1.2, farDist: 1000, duck: 30 }, 24000),
  mortar: heavyGun('mortar', { level: 4, ref: 4, roll: 0.58, range: 3000, decay: 0.4, farDist: 700 }, 24000),

  // Launches
  rpg_launch: launch('rpg_launch', { level: 2, ref: 3, roll: 0.62, range: 1500 }, 2),
  atgm_launch: launch('atgm_launch', { level: 0, ref: 3, roll: 0.62, range: 1500 }, 2),
  missile_launch: launch('missile_launch', { level: 3, ref: 5, roll: 0.6, range: 3000 }, 2),
  sam_launch: launch('sam_launch', { level: 3, ref: 5, roll: 0.6, range: 3000 }, 2),
  mlrs_launch: launch('mlrs_launch', { level: 6, ref: 8, roll: 0.58, range: 5000, duck: 12 }, 2),
  rocket_pod: launch('rocket_pod', { level: 2, ref: 5, roll: 0.6, range: 2500 }, 2),
  grenade_launch: fx('heavy', grenadeLaunch, 3, 32000, { level: -6, ref: 2, roll: 0.7, range: 400, wet: 0.8 }),
  flare_launch: fx('misc', flareLaunch, 2, 24000, { level: -4, ref: 5, roll: 0.65, range: 1500, wet: 0.8, decay: 0.6 }),
  smoke_launch: fx('misc', smokeLaunch, 2, 24000, { level: -5, ref: 3, roll: 0.7, range: 800, wet: 0.8, decay: 0.3 }),

  // Explosions
  explosion_small: boom('explosion_small', { level: 5, ref: 4, roll: 0.6, range: 2000, decay: 0.3, farDist: 600 }, 4, 24000),
  explosion_medium: boom('explosion_medium', { level: 7, ref: 5, roll: 0.58, range: 3000, decay: 0.5, farDist: 800, duck: 15, size: 6 }, 3, 24000),
  explosion_large: boom('explosion_large', { level: 9, ref: 6, roll: 0.56, range: 4500, decay: 0.9, farDist: 1000, duck: 40, size: 12 }, 3, 24000),
  explosion_huge: boom('explosion_huge', { level: 12, ref: 10, roll: 0.55, range: 8000, decay: 1.5, farDist: 1500, duck: 90, size: 25 }, 2, 22050),
  explosion_air: boom('explosion_air', { level: 10, ref: 10, roll: 0.55, range: 6000, decay: 1.0, farDist: 1200, duck: 50, size: 20 }, 2, 22050),

  // Incoming, impacts, destruction, foley
  // The sim fires the whistle ~2 s before impact; opts.duration overrides the lead time.
  incoming_shell: fx('misc', FX.incomingShell, 2, 22050, { level: -2, ref: 20, roll: 0.7, range: 700, wet: 0.5, decay: 3, alignEnd: true, lead: 2 }),
  bomb_whistle: fx('misc', FX.bombWhistle, 1, 22050, { level: 0, ref: 30, roll: 0.7, range: 1200, wet: 0.5, decay: 3, alignEnd: true }),
  ricochet: fx('impact', FX.ricochet, 4, 32000, { level: -6, ref: 2, roll: 0.75, range: 300, decay: 0.3 }),
  impact_metal: fx('impact', FX.impactMetal, 3, 32000, { level: -2, ref: 2, roll: 0.7, range: 800, decay: 0.25 }),
  impact_dirt: fx('impact', FX.impactDirt, 4, 24000, { level: -10, ref: 2, roll: 0.75, range: 200, decay: 0.08 }),
  impact_concrete: fx('impact', FX.impactConcrete, 3, 32000, { level: -8, ref: 2, roll: 0.75, range: 300, decay: 0.1 }),
  impact_wood: fx('impact', FX.impactWood, 3, 32000, { level: -9, ref: 2, roll: 0.75, range: 250, decay: 0.1 }),
  building_collapse: fx('explosion', buildingCollapse, 1, 22050, {
    level: 6, ref: 15, roll: 0.58, range: 3000, wet: 1, decay: 2.5, duck: 30, bed: 'heavy', size: 30,
  }),
  tree_fall: fx('misc', FX.treeFall, 1, 22050, { level: -2, ref: 8, roll: 0.7, range: 800, wet: 0.8, decay: 1.5 }),
  vehicle_destroyed: {
    cat: 'explosion', bed: 'heavy', wet: 1, decay: 1.2, jitter: [0.04, 1.2], level: 9, ref: 6, roll: 0.56, range: 4500,
    farDist: 1000, duck: 40, size: 8, near: syn(vehicleDestroyed, 2, 22050), far: { fn: farExplosion('vehicle_destroyed'), variants: 2 },
  },
  ammo_cookoff: fx('explosion', ammoCookoff, 2, 22050, { level: 4, ref: 6, roll: 0.6, range: 3000, wet: 1, decay: 2.5, duck: 20, bed: 'heavy' }),
  fire_burst: fx('misc', fireBurst, 2, 22050, { level: -1, ref: 4, roll: 0.7, range: 800, wet: 0.7, decay: 0.6 }),
  parachute_open: fx('misc', FX.parachuteOpen, 2, 22050, { level: -8, ref: 3, roll: 0.8, range: 300, wet: 0.5, decay: 0.4 }),
  drone_dive: fx('misc', FX.droneDive, 2, 24000, { level: -4, ref: 3, roll: 0.75, range: 600, wet: 0.4, decay: 3, alignEnd: true }),
  jet_flyby: fx('heavy', FX.jetFlyby, 1, 22050, { level: 8, ref: 30, roll: 0.55, range: 6000, wet: 0.6, decay: 2.5 }),
  debris: fx('impact', debrisFall, 3, 24000, { level: -8, ref: 3, roll: 0.8, range: 400, decay: 0.4 }),
  shell_casings: fx('misc', FX.shellCasings, 3, FULL_RATE, { level: -16, ref: 1.5, roll: 0.9, range: 40, wet: 0.3, decay: 0.2 }),
  reload: fx('misc', FX.reload, 2, 32000, { level: -18, ref: 1.5, roll: 0.9, range: 40, wet: 0.3, decay: 0.3 }),
  whistle: fx('misc', FX.squadWhistle, 2, 32000, { level: -4, ref: 3, roll: 0.7, range: 500, wet: 0.8, decay: 0.6 }),
  ui_click: fx('ui', FX.uiClick, 1, FULL_RATE, { level: -10, spatial: false, wet: 0, jitter: [0.01, 0.5] }),
  ui_confirm: fx('ui', FX.uiConfirm, 1, FULL_RATE, { level: -8, spatial: false, wet: 0, jitter: [0, 0] }),
};

// Projectile flybys keyed by internal buffer name; level is at 1 m miss distance.
export const FLYBYS = {
  bullet_crack: { level: -2, range: 60, roll: 0.75, near: syn(FX.bulletCrack, 4) },
  bullet_whizz: { level: -6, range: 30, roll: 1, near: syn(FX.bulletWhizz, 3, 32000) },
  heavy_crack: { level: 2, range: 120, roll: 0.75, near: syn(FX.heavyCrack, 3) },
  heavy_whizz: { level: -2, range: 60, roll: 1, near: syn(FX.heavyWhizz, 2, 24000) },
  shell_rip: { level: 6, range: 300, roll: 0.75, near: syn(FX.shellRip, 2, 24000) },
  shell_whoosh: { level: 4, range: 250, roll: 0.9, near: syn(FX.shellWhoosh, 2, 24000) },
  rocket_whoosh: { level: 4, range: 250, roll: 0.9, near: syn(FX.rocketWhoosh, 2, 24000) },
};

// Continuous loops for setLoops(). rate/gain map intensity 0..1 to playbackRate and gain.
export const LOOPS = {
  tank: { level: 2, ref: 8, roll: 0.75, range: 1500, wet: 0.4, rate: [0.8, 1.25], gain: [0.55, 1], near: syn(EN.tankLoop, 2, 22050) },
  ifv: { level: 0, ref: 6, roll: 0.75, range: 1200, wet: 0.4, rate: [0.85, 1.25], gain: [0.55, 1], near: syn(EN.ifvLoop, 1, 22050) },
  apc: { level: -1, ref: 6, roll: 0.75, range: 1000, wet: 0.4, rate: [0.85, 1.3], gain: [0.55, 1], near: syn(EN.apcLoop, 1, 22050) },
  truck: { level: -3, ref: 5, roll: 0.8, range: 800, wet: 0.4, rate: [0.85, 1.35], gain: [0.5, 1], near: syn(EN.truckLoop, 1, 22050) },
  heli: { level: 6, ref: 20, roll: 0.7, range: 4000, wet: 0.5, rate: [0.97, 1.03], gain: [0.8, 1], near: syn(EN.heliLoop, 1, 22050) },
  jet: { level: 8, ref: 40, roll: 0.65, range: 8000, wet: 0.5, rate: [0.9, 1.15], gain: [0.6, 1], near: syn(EN.jetLoop, 1, 24000) },
  plane: { level: 3, ref: 40, roll: 0.7, range: 6000, wet: 0.5, rate: [0.97, 1.03], gain: [0.8, 1], near: syn(EN.planeLoop, 1, 22050) },
  drone: { level: 0, ref: 2, roll: 0.9, range: 400, wet: 0.3, rate: [0.8, 1.45], gain: [0.6, 1], near: syn(EN.droneLoop, 1, 24000) },
  uav: { level: -4, ref: 10, roll: 0.8, range: 1500, wet: 0.4, rate: [0.9, 1.15], gain: [0.7, 1], near: syn(EN.uavLoop, 1, 22050) },
  fire: { level: -6, ref: 3, roll: 0.9, range: 250, wet: 0.3, rate: [0.95, 1.05], gain: [0.4, 1], near: syn(EN.fireLoop, 1, 22050) },
  spaag_radar: { level: -18, ref: 3, roll: 1, range: 120, wet: 0.2, rate: [1, 1], gain: [1, 1], near: syn(EN.radarLoop, 1, 16000) },
};

export const AMBIENT = {
  wind: syn(NA.wind, 1, 16000),
  rain_light: syn(NA.rainLight, 1, 24000),
  rain_heavy: syn(NA.rainHeavy, 1, 24000),
  rumble: syn(NA.battleRumble, 1, 8000),
  crickets: syn(NA.crickets, 1, 22050),
  bird: syn(NA.birdCall, 4, 24000),
  thunder_near: syn((rng, sr) => NA.thunder(rng, sr, true), 1, 16000),
  thunder_far: syn((rng, sr) => NA.thunder(rng, sr, false), 1, 16000),
};

export const RADIO = {
  squelch_open: syn(RA.squelchOpen, 3, 16000),
  squelch_close: syn(RA.squelchClose, 3, 16000),
  static: syn(RA.radioStatic, 1, 16000),
  babble_0: syn((rng, sr) => RA.babble(rng, sr, 0), 3, 16000),
  babble_1: syn((rng, sr) => RA.babble(rng, sr, 1), 3, 16000),
};

const linear = (db) => Math.pow(10, db / 20);

for (const def of Object.values(SOUNDS)) {
  if (def.internal) continue;
  def.spatial = def.spatial ?? true;
  def.agg = def.agg ?? def.range * 0.6;
  def.duck = def.duck ?? 0;
  def.size = def.size ?? 0;
  def.levelLin = linear(def.level);
}

for (const def of Object.values(FLYBYS)) {
  Object.assign(def, { cat: 'flyby', ref: 1, wet: 0.35, decay: 0.15, jitter: [0.06, 1.5], spatial: true, levelLin: linear(def.level) });
}

for (const def of Object.values(LOOPS)) def.levelLin = linear(def.level);

// flyby(kind, point, speed) -> [subsonic buffer, supersonic buffer]
export const FLYBY_KINDS = {
  bullet: ['bullet_whizz', 'bullet_crack'],
  heavy: ['heavy_whizz', 'heavy_crack'],
  shell: ['shell_whoosh', 'shell_rip'],
  rocket: ['rocket_whoosh', 'rocket_whoosh'],
};
