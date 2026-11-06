// Dead County audio — sound registry + offline renderer.
// Every sound is a recipe (see sfx-*.js) that builds a Web Audio graph inside an OfflineAudioContext.
// Variants are rendered once (in the background) into AudioBuffers and then played back cheaply.

import { Synth, mulberry32, hashString, finalizeBuffer, makeLoopBuffer, dataStats } from './dsp.js';
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
export const EXTRA_SOUND_NAMES = ['dog_bark', 'alarm_beep'];

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
// per-play timbre variation for sounds that repeat a lot
for (const d of Object.values(SOUND_DEFS)) {
  if (d.tv !== undefined) continue;
  if (d.group === 'step' || d.group === 'hit' || d.group === 'impact') d.tv = 0.35;
  else if (d.group === 'zvoice') d.tv = 0.25;
  else if (d.name.startsWith('swing_') || d.name === 'shell_drop') d.tv = 0.3;
  else d.tv = 0;
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
 * Render a set of variants of a sound in ONE OfflineAudioContext: each variant is built into its own
 * output channel (ChannelMerger → N-channel destination), so per-context costs (oscillator wavetables,
 * context setup) are paid once per sound instead of once per variant.
 * Returns {items: [{buffer, rawPeak, rawRms, nan}], ms}.
 */
export async function renderVariants(name, variants, baseRate = 48000) {
  const def = SOUND_DEFS[name];
  if (!def) throw new Error('unknown sound ' + name);
  const sr = rateFor(def, baseRate);
  const len = Math.max(64, Math.ceil(def.dur * sr));
  const N = variants.length;
  const t0 = performance.now();
  const ctx = offlineCtx(N, len, sr);
  let merger = null;
  if (N > 1) {
    merger = ctx.createChannelMerger(N);
    ctx.destination.channelInterpretation = 'discrete';
    merger.connect(ctx.destination);
  }
  variants.forEach((v, ch) => {
    const out = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 25;
    hp.Q.value = 0.6;
    out.connect(hp);
    if (merger) hp.connect(merger, 0, ch);
    else hp.connect(ctx.destination);
    const seed = (hashString(name) ^ Math.imul(v + 1, 0x9e3779b1)) >>> 0;
    const s = new Synth(ctx, out, mulberry32(seed));
    s.variant = v;
    def.render(s, v);
  });
  const raw = await ctx.startRendering();
  const items = variants.map((v, ch) => {
    const data = raw.getChannelData(ch);
    if (def.loop) {
      const st = dataStats(data);
      return { buffer: makeLoopBuffer(data, sr, def.loop.len, def.loop.xfade, def.loop.mode), rawPeak: st.peak, rawRms: st.rms, nan: st.nan };
    }
    return finalizeBuffer(data, sr);
  });
  return { items, ms: performance.now() - t0 };
}

/** Render one variant (tests / tools). Returns {buffer, rawPeak, rawRms, nan, ms}. */
export async function renderVariant(name, variant = 0, baseRate = 48000) {
  const r = await renderVariants(name, [variant], baseRate);
  return { ...r.items[0], ms: r.ms };
}

/** Render all variants of a sound. Returns {buffers, info[], ms} */
export async function renderSound(name, baseRate = 48000) {
  const def = SOUND_DEFS[name];
  const vs = [];
  for (let v = 0; v < def.variants; v++) vs.push(v);
  const r = await renderVariants(name, vs, baseRate);
  return { buffers: r.items.map((x) => x.buffer), info: r.items, ms: r.ms };
}
