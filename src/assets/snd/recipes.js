// Sound catalogue: names, groups, defaults and the recipe for each sound.
// Shared by the main thread and the synthesis workers.

import { Mix, makeRng, hashString } from './dsp.js';
import { GUNS, SUPPRESSED, HANDLING, gunshot, suppressed } from './weapons.js';
import { FOLEY } from './foley.js';
import { MISC } from './misc.js';

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
  Ambience: ['ambience_wind', 'ambience_bird', 'distant_fly'],
};

/** Every sound name in the bank. (`round_start` does not exist in 1.6 and is omitted.) */
export const SOUND_NAMES = Object.values(SOUND_GROUPS).flat();

// Default GoldSrc-style attenuation and per-play pitch jitter for each sound.
// `play()` uses these when the caller passes no `attenuation`.
const ATTN_DEFAULTS = {
  he_explode: 'loud', flashbang_explode: 'loud', c4_explode: 'loud', smoke_explode: 'normal',
  m4a1_silenced: 'normal', usp_silenced: 'normal', tmp: 'normal',
  step_sand: 'static', step_stone: 'static', step_wood: 'static', step_metal: 'static', land: 'static', jump: 'idle',
  shell: 'idle', shotgun_shell: 'idle', impact_sand: 'static', impact_wood: 'static', impact_metal: 'static',
  c4_beep: 'normal', ambience_bird: 'none', ambience_wind: 'none', distant_fly: 'idle',
};
const JITTER = {
  step_sand: 0.03, step_stone: 0.03, step_wood: 0.03, step_metal: 0.03, land: 0.03, jump: 0.03,
  hit_flesh: 0.03, hit_kevlar: 0.03, headshot: 0.02, ric: 0.03, impact_sand: 0.03, impact_wood: 0.03,
  impact_metal: 0.03, glass: 0.03, shell: 0.04, shotgun_shell: 0.04, grenade_bounce: 0.04, knife_hit: 0.03,
  knife_hitwall: 0.03, knife_slash: 0.03, knife_stab: 0.02, die: 0.03, pain: 0.03, ambience_bird: 0.06,
};

export const DEFS = {};
for (const [name, g] of Object.entries(GUNS)) DEFS[name] = { ...g, fn: (P) => gunshot(P, g.p), attn: 'loud', jitter: 0.015 };
for (const [name, g] of Object.entries(SUPPRESSED)) DEFS[name] = { ...g, fn: (P) => suppressed(P, g.p), attn: 'normal', jitter: 0.015 };
for (const [name, d] of Object.entries({ ...HANDLING, ...FOLEY, ...MISC })) DEFS[name] = { ...d };
DEFS.buy = { alias: 'ammo_pickup' };
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
