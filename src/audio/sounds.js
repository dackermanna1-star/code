// Dead County audio — sound registry + offline renderer.
// Every sound is a recipe (see sfx-*.js) that builds a Web Audio graph inside an OfflineAudioContext.
// Variants are rendered once (in the background) into AudioBuffers and then played back cheaply.

import { Synth, mulberry32, hashString, finalizeBuffer, makeLoopBuffer, bufferStats } from './dsp.js';
import { WEAPON_SOUNDS } from './sfx-weapons.js';
import { CREATURE_SOUNDS } from './sfx-creatures.js';
import { WORLD_SOUNDS } from './sfx-world.js';
import { AMBIENT_SOUNDS, PIANO_SAMPLES } from './sfx-ambient.js';

/** Public sound names (docs/ARCHITECTURE.md "Audio"). */
export const SOUND_NAMES = `gun_pistol gun_revolver gun_shotgun gun_rifle gun_ar gun_ak gun_smg gun_sniper gun_22
gun_suppressed crossbow bow dry_fire reload_mag_out reload_mag_in reload_shell pump bolt break_open break_close cock
gun_jam swing_light swing_heavy hit_flesh hit_flesh_heavy hit_blunt hit_blade headshot hit_wood hit_metal hit_stone
hit_glass glass_break bullet_impact bullet_impact_metal ricochet shell_drop footstep_grass footstep_dirt footstep_stone
footstep_wood footstep_metal footstep_gravel footstep_water footstep_sand footstep_leaves footstep_cloth jump land
land_hard zombie_groan zombie_idle zombie_alert zombie_attack zombie_hurt zombie_death zombie_scream zombie_bloater_pop
zombie_brute_roar zombie_runner_shriek zombie_bash bite player_hurt player_hurt_heavy player_death cough breath_heavy
heartbeat eat drink bandage pills zipper item_pickup item_drop equip ui_click ui_hover ui_open ui_close craft door_open
door_close door_locked door_break door_bash container_open container_metal_open car_alarm helicopter thunder explosion
fire_loop molotov_break flare_loop lighter match wood_chop barricade_hammer pry splash birds crickets owl wolf_howl
distant_scream distant_gunshot radio_static flashlight_click block_break shove stomp throw sleep_start level_up`
  .split(/\s+/)
  .filter(Boolean);

/** Extra public names beyond the contract. */
export const EXTRA_SOUND_NAMES = ['dog_bark'];

export const SOUND_DEFS = { ...WEAPON_SOUNDS, ...CREATURE_SOUNDS, ...WORLD_SOUNDS, ...AMBIENT_SOUNDS };

const PRIO_BY_CAT = { ui: 0, inner: 2, sfx: 3, amb: 3, music: 1 };
for (const [name, d] of Object.entries(SOUND_DEFS)) {
  d.name = name;
  d.variants ??= 3;
  d.level ??= 0.5;
  d.cat ??= 'sfx';
  d.sr ??= 'mid';
  d.ref ??= 2;
  d.roll ??= 1;
  d.maxDist ??= 40;
  d.cap ??= 4;
  d.send ??= 0.1;
  d.pv ??= 0.05;
  d.vv ??= 0.1;
  d.prio ??= PRIO_BY_CAT[d.cat] ?? 3;
  d.groupCap ??= 12;
}
// ambience beds are needed early for the atmosphere
for (const n of ['amb_wind', 'amb_rain', 'amb_crickets']) SOUND_DEFS[n].prio = 1;

export { PIANO_SAMPLES };

/** All names that get rendered (public + internal). */
export const ALL_RENDER_NAMES = Object.keys(SOUND_DEFS);

/** Sample rate used for a def given the base (context) rate. */
export function rateFor(def, base) {
  if (def.sr === 'vlo') return Math.max(11025, Math.round(base / 4));
  if (def.sr === 'lo') return Math.max(16000, Math.round(base / 2));
  if (def.sr === 'mid') return Math.max(22050, Math.round((base * 2) / 3));
  return base;
}

function offlineCtx(ch, len, sr) {
  const C = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  return new C(ch, len, sr);
}

/**
 * Render one variant of a sound. Returns {buffer, rawPeak, rawRms, nan, ms}.
 */
export async function renderVariant(name, variant = 0, baseRate = 48000) {
  const def = SOUND_DEFS[name];
  if (!def) throw new Error('unknown sound ' + name);
  const sr = rateFor(def, baseRate);
  const len = Math.max(64, Math.ceil(def.dur * sr));
  const t0 = performance.now();
  const ctx = offlineCtx(1, len, sr);
  const out = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 25;
  hp.Q.value = 0.6;
  out.connect(hp);
  hp.connect(ctx.destination);
  const seed = (hashString(name) ^ Math.imul(variant + 1, 0x9e3779b1)) >>> 0;
  const s = new Synth(ctx, out, mulberry32(seed));
  s.variant = variant;
  def.render(s, variant);
  const raw = await ctx.startRendering();
  const st = bufferStats(raw);
  let buffer;
  if (def.loop) buffer = makeLoopBuffer(raw, def.loop.len, def.loop.xfade, def.loop.mode);
  else buffer = finalizeBuffer(raw).buffer;
  return { buffer, rawPeak: st.peak, rawRms: st.rms, nan: st.nan, ms: performance.now() - t0 };
}

/** Render all variants of a sound (in parallel). Returns {buffers, info[]} */
export async function renderSound(name, baseRate = 48000) {
  const def = SOUND_DEFS[name];
  const jobs = [];
  for (let v = 0; v < def.variants; v++) jobs.push(renderVariant(name, v, baseRate));
  const res = await Promise.all(jobs);
  return { buffers: res.map((r) => r.buffer), info: res };
}
