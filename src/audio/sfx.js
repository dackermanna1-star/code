// SFX registry. Every id in TECH §10 maps to a recipe here (plus footsteps, blips, the
// Colonel's murmur and the `amb_*` ambience events).
//
// Entry fields:
//   gen(S) → Float32Array | [L, R]   buffer recipe (S = { sr, R, opts, alloc, stereo })
//   graph(V, opts, eng)               live node-graph recipe (continuous / variable length)
//   peak   target peak dBFS of the synthesised buffer (default -6)
//   var    number of cached variants (default 3)   jit / vjit  per-play pitch (ratio) / level (dB) jitter
//   bus    'sfx' (default) | 'ui'     wet  reverb send multiplier (0 = dry)
//   max    concurrent voices of this id (default 4)   key(opts) → cache-key suffix (e.g. bell length)
import { UI_SFX } from './sfx_ui.js';
import { FOLEY_SFX } from './sfx_foley.js';
import { SCHOOL_SFX } from './sfx_school.js';
import { COLONEL_SFX } from './sfx_colonel.js';
import { WORLD_SFX } from './sfx_world.js';
import { STEP_SFX } from './footsteps.js';
import { BLIP_SFX, VOICE_SFX } from './voices.js';
import { RADIO_SFX } from './radio.js';

export const SFX = { ...UI_SFX, ...FOLEY_SFX, ...SCHOOL_SFX, ...COLONEL_SFX, ...WORLD_SFX, ...STEP_SFX, ...BLIP_SFX, ...VOICE_SFX, ...RADIO_SFX };

/** The contract list (TECH §10) — QA and the preview page iterate this. */
export const SFX_IDS = [
  'ui_move', 'ui_confirm', 'ui_cancel', 'ui_open', 'ui_close', 'page_turn',
  'item_get', 'objective', 'door_open_wood', 'door_close_wood', 'door_open_metal', 'door_close_metal',
  'door_locked', 'door_creak_slow', 'door_slam', 'key_unlock', 'chain_rattle', 'padlock', 'bolt_cutters',
  'locker_open', 'locker_close', 'locker_tap', 'gate_rattle', 'flashlight_click', 'battery_swap',
  'flashlight_flicker', 'flashlight_roll', 'camcorder_click', 'camcorder_whir', 'vhs_noise',
  'intercom_crackle', 'intercom_chime', 'school_bell', 'bell_short', 'fluor_on', 'fluor_off', 'colonel_breath',
  'colonel_breath_fast', 'colonel_drag', 'colonel_hm', 'colonel_jingle', 'colonel_lunge', 'colonel_grab',
  'colonel_sink', 'whistle', 'whistle_breath', 'squeak', 'glass_tone', 'glass_write', 'husk_rustle',
  'cicada_click', 'chalk', 'chair_scrape', 'desk_creak', 'paper_rustle', 'typewriter_key', 'trs80_key',
  'trs80_beep', 'safe_click', 'safe_open', 'stamp', 'pen_scratch', 'book_close', 'lever_pull', 'trapdoor',
  'drip', 'splash', 'pipe_knock', 'steam_hiss', 'coal_slide', 'boiler_door', 'lightning', 'thunder',
  'wind_gust', 'heartbeat', 'breath_hold', 'breath_release', 'tape_play', 'mixer_start', 'dumbwaiter',
  'crowd_murmur', 'applause_old', 'record_crackle', 'stinger_soft', 'stinger_hard', 'collapse_rumble',
  'dust_fall', 'footstep_heavy_above',
];
export const EVENT_IDS = Object.keys(SFX).filter((k) => k.startsWith('amb_'));
