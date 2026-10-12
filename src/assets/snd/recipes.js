// Sound catalogue: names, groups, defaults and the recipe for each sound.
// Shared by the main thread and the synthesis workers.

import { Mix, makeRng, hashString } from './dsp.js';
import { GUNS, SUPPRESSED, HANDLING, gunshot, suppressed } from './weapons.js';
import { FOLEY } from './foley.js';
import { MISC } from './misc.js';
import { ZOMBIE_FX } from './zombie.js';
import { HIT_FX } from './hitfx.js';
import { TITLE_FX } from './title.js';
import { SHOVE_FX } from './shove.js';

// ------------------------------------------------------------- catalogue ---

export const SOUND_GROUPS = {
  'Weapons fire': [
    'ak47', 'm4a1', 'm4a1_silenced', 'awp', 'deagle', 'usp', 'usp_silenced', 'glock', 'p228', 'elite',
    'fiveseven', 'mp5', 'mac10', 'tmp', 'ump45', 'p90', 'galil', 'famas', 'sg552', 'aug', 'scout',
    'g3sg1', 'sg550', 'm249', 'm3', 'xm1014',
  ],
  'Weapon handling': [
    'clipout', 'clipin', 'boltpull', 'boltrelease', 'slideback', 'sliderelease', 'pistol_clipout',
    'pistol_clipin', 'shotgun_insert', 'shotgun_pump', 'awp_bolt', 'dryfire_rifle', 'dryfire_pistol',
    'deploy', 'zoom', 'silencer_screw', 'knife_deploy', 'knife_slash', 'knife_hit', 'knife_hitwall',
    'knife_stab', 'pinpull', 'grenade_bounce', 'he_explode', 'flashbang_explode', 'smoke_explode',
    'ammo_pickup', 'buy',
  ],
  Player: [
    'step_sand', 'step_stone', 'step_wood', 'step_metal', 'land', 'jump', 'hit_flesh', 'hit_kevlar',
    'headshot', 'die', 'pain', 'fall_damage',
  ],
  World: ['ric', 'impact_sand', 'impact_wood', 'impact_metal', 'glass', 'shell', 'shotgun_shell'],
  Bomb: ['c4_beep', 'c4_plant_press', 'c4_planted', 'c4_disarm', 'c4_disarmed', 'c4_explode', 'defuser_on'],
  'UI / misc': ['menu_click', 'menu_select', 'radio_beep', 'hint', 'nvg_on', 'heartbeat'],
  'Zombie survival UI': ['zm_ready', 'zm_allready'],
  Ambience: ['ambience_wind', 'ambience_bird', 'distant_fly'],
  Squad: ['downed', 'downed_breath', 'revive_up', 'second_wind'], // zombie survival downed / revive (zdowned.js)
  Map: ['door_move', 'door_stop', 'button', 'hostage_use'],
  Zombies: ['zombie_idle', 'zombie_attack', 'zombie_pain', 'zombie_die', 'zombie_wave', 'gib', 'gib_land', 'headpop', 'horde_roar'],
  'Fire & launchers': ['fire_loop', 'fire_ignite', 'lighter', 'molotov_break', 'acid_loop', 'acid_splash', 'flame_loop', 'flame_start', 'flame_stop', 'fuel_in',
    'rpg_fire', 'm32_fire', 'rocket_fly', 'rocket_explode', 'rocket_load'],
  Bosses: ['boss_intro', 'boss_roar', 'boss_growl', 'boss_attack', 'boss_die', 'cleaver_swing', 'charge_go', 'charge_hit', 'charge_wall',
    'spitter_hurl', 'spit', 'spitter_burst', 'banshee_scream', 'banshee_charge', 'banshee_moan', 'banshee_attack', 'banshee_blink',
    'fireball_throw', 'fireball_hit', 'inferno_charge', 'slam', 'abom_raise'],
  'Zombie arsenal': ['minigun', 'minigun_spinup', 'minigun_spindown', 'aa12', 'barrett', 'chainsaw_idle', 'chainsaw_rev', 'chainsaw_cut',
    'tesla_fire', 'tesla_hit', 'medkit_use', 'medkit_heal', 'sup_pistol', 'sup_smg', 'sup_rifle', 'sup_heavy', 'attach_fit'],
  'Special infected': ['boomer_idle', 'boomer_vomit', 'boomer_burst', 'charger_roar', 'hunter_scream', 'hunter_pounce', 'smoker_cough',
    'tongue_shot', 'sprinter_shriek'],
  'Hit confirmation': ['hit_tick', 'hit_head', 'hit_kill'], // zombie survival (zfeedback.js)
  'Common roster': ['screamer_wail', 'screamer_shriek', 'bloater_pop'], // zombie survival (zroster.js)
  'Readable specials': ['save_sting'], // zombie survival (zthreats.js)
  'Melee shove': ['shove_swing', 'shove_hit'], // zombie survival (shove.js)
  'Title screen': ['title_theme', 'title_start'],
};

// Default GoldSrc-style attenuation and per-play pitch jitter for each sound.
// `play()` uses these when the caller passes no `attenuation`.
const ATTN_DEFAULTS = {
  he_explode: 'loud', flashbang_explode: 'loud', c4_explode: 'loud', smoke_explode: 'normal',
  rocket_explode: 'loud', slam: 'loud', boss_roar: 'loud', horde_roar: 'loud', banshee_scream: 'loud', rpg_fire: 'loud', boss_die: 'loud', fire_loop: 'static', acid_loop: 'static',
  m4a1_silenced: 'normal', usp_silenced: 'normal', tmp: 'normal',
  minigun: 'loud', aa12: 'loud', barrett: 'loud', tesla_fire: 'loud', boomer_burst: 'loud', charger_roar: 'loud', hunter_scream: 'loud',
  chainsaw_idle: 'normal', chainsaw_rev: 'loud', attach_fit: 'idle', medkit_use: 'idle', medkit_heal: 'idle',
  step_sand: 'static', step_stone: 'static', step_wood: 'static', step_metal: 'static', land: 'static', jump: 'idle',
  shell: 'idle', shotgun_shell: 'idle', impact_sand: 'static', impact_wood: 'static', impact_metal: 'static',
  c4_beep: 'normal', ambience_bird: 'none', ambience_wind: 'none', distant_fly: 'idle',
  title_theme: 'none', title_start: 'none',
};
const JITTER = {
  step_sand: 0.03, step_stone: 0.03, step_wood: 0.03, step_metal: 0.03, land: 0.03, jump: 0.03,
  hit_flesh: 0.03, hit_kevlar: 0.03, headshot: 0.02, ric: 0.03, impact_sand: 0.03, impact_wood: 0.03,
  impact_metal: 0.03, glass: 0.03, shell: 0.04, shotgun_shell: 0.04, grenade_bounce: 0.04, knife_hit: 0.03,
  knife_hitwall: 0.03, knife_slash: 0.03, knife_stab: 0.02, die: 0.03, pain: 0.03, ambience_bird: 0.06,
  zombie_idle: 0.07, zombie_attack: 0.05, zombie_pain: 0.05, zombie_die: 0.04,
  boomer_idle: 0.06, charger_roar: 0.04, hunter_scream: 0.05, smoker_cough: 0.06, sprinter_shriek: 0.06, tesla_hit: 0.05, chainsaw_cut: 0.04,
  screamer_wail: 0.05,
};

export const DEFS = {};
for (const [name, g] of Object.entries(GUNS)) DEFS[name] = { ...g, fn: (P) => gunshot(P, g.p), attn: 'loud', jitter: 0.015 };
for (const [name, g] of Object.entries(SUPPRESSED)) DEFS[name] = { ...g, fn: (P) => suppressed(P, g.p), attn: 'normal', jitter: 0.015 };
for (const [name, d] of Object.entries({ ...HANDLING, ...FOLEY, ...MISC, ...ZOMBIE_FX, ...TITLE_FX })) DEFS[name] = { ...d };
DEFS.buy = { alias: 'ammo_pickup' };
for (const [name, d] of Object.entries(HIT_FX)) DEFS[name] = { ...d };
for (const [name, d] of Object.entries(SHOVE_FX)) DEFS[name] = { ...d };
// a recipe nobody listed above still gets made (the bank only renders catalogued names)
{
  const listed = new Set(Object.values(SOUND_GROUPS).flat());
  const rest = Object.keys(DEFS).filter((n) => !listed.has(n));
  if (rest.length) SOUND_GROUPS.Other = rest;
}

/** Every sound name in the bank. (`round_start` does not exist in 1.6 and is omitted.) */
export const SOUND_NAMES = Object.values(SOUND_GROUPS).flat();
for (const name of SOUND_NAMES) {
  const d = DEFS[name];
  if (!d) throw new Error('sounds: missing recipe for ' + name);
  const group = Object.keys(SOUND_GROUPS).find((k) => SOUND_GROUPS[k].includes(name));
  d.group = group;
  d.attn = ATTN_DEFAULTS[name] ?? d.attn ?? (group === 'UI / misc' || group === 'Ambience' ? 'none' : 'normal');
  d.jitter = JITTER[name] ?? d.jitter ?? 0;
}

/** Per-sound metadata: { group, variants, attn (default attenuation), jitter, loop }. */
export const SOUND_META = Object.fromEntries(SOUND_NAMES.map((n) => {
  const d = DEFS[n].alias ? { ...DEFS[DEFS[n].alias], ...DEFS[n] } : DEFS[n];
  return [n, { group: d.group, variants: d.variants || 1, attn: d.attn, jitter: d.jitter, loop: !!d.loop }];
}));

// -------------------------------------------------------------- synthesis ---

/** Sample rate a sound is synthesised at (dark, long beds use a lower rate). */
export function rateFor(name, bankRate) {
  const def = DEFS[name];
  return def.rate ? Math.min(def.rate, bankRate) : bankRate;
}

/** Run one recipe in plain JS. Returns { name, v, sr, channels: Float32Array[] }. */
export function synthesize(name, v, bankRate) {
  const def = DEFS[name];
  const sr = rateFor(name, bankRate);
  const length = Math.ceil((def.dur + (def.loop || 0)) * sr);
  const rng = makeRng((hashString(name) ^ Math.imul(v + 1, 0x9e3779b1)) >>> 0);
  const M = new Mix(sr, rng, length, def.stereo ? 2 : 1);
  M.variant = v;
  M.loopLen = def.dur;
  def.fn(M, v);
  return { name, v, sr, channels: M.channels };
}

/** Every (name, variant) to synthesise, with a rough cost estimate, biggest first. */
export function jobList(bankRate) {
  const jobs = [];
  for (const name of SOUND_NAMES) {
    const def = DEFS[name];
    if (def.alias) continue;
    const cost = (def.dur + (def.loop || 0)) * (def.stereo ? 2 : 1) * (rateFor(name, bankRate) / 44100) + 0.05;
    for (let v = 0; v < (def.variants || 1); v++) jobs.push({ name, v, cost });
  }
  return jobs.sort((a, b) => b.cost - a.cost);
}
