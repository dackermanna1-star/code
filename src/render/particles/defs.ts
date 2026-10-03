/**
 * Particle type table. Every simulated particle has one of these types; composite effects
 * (explosion, splash, firework ...) are built from them in effects.ts.
 */
import { SP, GLYPH_COUNT } from './atlas';

/** Render pools. */
export const enum Pool {
  /** Opaque block crumbs rendered into the G-buffer (instanced cubes). */
  Crumb = 0,
  /** Premultiplied alpha, back-to-front sorted (smoke, dust, sprites). */
  Alpha = 1,
  /** Premultiplied with alpha 0 = additive (fire, sparks, magic); unsorted. */
  Add = 2,
}

/** Fragment shading modes (must match shaders.ts). */
export const enum Mode {
  /** Lit volumetric puff: atlas .rg normal, .b thickness, .a density (eroded with age). */
  Puff = 0,
  /** Lit colour sprite (atlas rgb sRGB x tint) + optional self illumination. */
  Sprite = 1,
  /** Emissive mask: colour x emissive x atlas alpha. */
  Emit = 2,
  /** Flame: atlas .r heat -> blackbody ramp x emissive. */
  Flame = 3,
  /** Sun-lit floating mote (scattering, with shadow lookup): additive. */
  Mote = 4,
  /** Water droplet: sky reflection + refraction-like brightening. */
  Drop = 5,
}

export const enum Orient {
  Billboard = 0,
  /** Stretched along velocity (sparks, rain, drops). */
  Velocity = 1,
  /** Lies in the horizontal plane (rings, ripples, slash). */
  Horizontal = 2,
  /** Cylindrical billboard around world up (flames). */
  Upright = 3,
}

export const enum Motion {
  Physics = 0,
  /** Flies from its spawn point to the target (u0,u1,u2) along a curve (portal, enchant). */
  Attract = 1,
  /** Hangs under a block (growing), then falls (drips). */
  Drip = 2,
  /** Wandering (fireflies, motes, spores). */
  Wander = 3,
}

export const enum Ramp {
  None = 0,
  Flame = 1,
  Soul = 2,
  Lava = 3,
  Explosion = 4,
  Spark = 5,
  Portal = 6,
  EndRod = 7,
}

export const enum Land {
  None = 0,
  /** Disappear on contact. */
  Die = 1,
  /** Water droplet: tiny splash. */
  Splash = 2,
  /** Lava: small glowing landing + smoke. */
  Lava = 3,
  /** Blood: report the impact (decals) and die. */
  Blood = 4,
}

export interface PDef {
  name: string;
  pool: Pool;
  mode: Mode;
  orient: Orient;
  motion: Motion;
  sprite: number;
  /** Random sprite variants starting at `sprite`. */
  variants: number;
  life: [number, number];
  size: [number, number];
  /** Size multiplier at the end of life. */
  sizeEnd: number;
  /** Size growth curve exponent (<1 fast early growth, like smoke billowing). */
  sizePow: number;
  /** Downward acceleration (b/s²); negative = buoyant. */
  gravity: number;
  /** Linear drag (1/s). */
  drag: number;
  collide: boolean;
  bounce: number;
  land: Land;
  /** Base linear colour (variation applied at spawn). */
  color: [number, number, number];
  colorVar: number;
  alpha: number;
  fadeIn: number;
  fadeOut: number;
  /** Erode puffs with age (dissolve from the edges). */
  erode: boolean;
  /** Emissive intensity (HDR radiance multiplier). */
  emissive: number;
  /** Fraction of emission kept at the end of life. */
  emissiveEnd: number;
  ramp: Ramp;
  /** Max spin (rad/s). */
  spin: number;
  /** Velocity stretch (seconds of motion blur). */
  stretch: number;
  /** Coupling to wind (0..1). */
  wind: number;
  /** Lateral wobble amplitude (b/s). */
  wobble: number;
  /** Self illumination for lit sprites (keeps hearts/notes readable at night). */
  selfLit: number;
  /** Re-sample world light when crossing blocks. */
  trackLight: boolean;
  /** Dies when it leaves water (bubbles). */
  needsWater: boolean;
  /** Dies when it enters a liquid. */
  diesInLiquid: boolean;
  /** Soft particle depth fade distance (fraction of size). */
  soft: number;
}

const D: Omit<PDef, 'name'> = {
  pool: Pool.Alpha, mode: Mode.Puff, orient: Orient.Billboard, motion: Motion.Physics,
  sprite: SP.SMOKE0, variants: 1, life: [1, 1], size: [0.2, 0.2], sizeEnd: 1, sizePow: 1,
  gravity: 0, drag: 0, collide: false, bounce: 0, land: Land.None,
  color: [1, 1, 1], colorVar: 0, alpha: 1, fadeIn: 0.05, fadeOut: 0.3, erode: false,
  emissive: 0, emissiveEnd: 1, ramp: Ramp.None, spin: 0, stretch: 0, wind: 0, wobble: 0, selfLit: 0,
  trackLight: true, needsWater: false, diesInLiquid: false, soft: 0.5,
};

const smokeSprites = { sprite: SP.SMOKE0, variants: 4 };

export const PARTICLE_DEFS: PDef[] = [];
export const PARTICLE_IDS: Record<string, number> = {};

function def(name: string, p: Partial<PDef>): number {
  const id = PARTICLE_DEFS.length;
  PARTICLE_DEFS.push({ ...D, ...p, name });
  PARTICLE_IDS[name] = id;
  return id;
}

/** Particle type ids (stable within a session). */
export const PT = {
  // ---- blocks
  block_crumb: def('block_crumb', { pool: Pool.Crumb, life: [0.7, 2.4], size: [0.05, 0.11], sizeEnd: 0.2, gravity: 22, drag: 0.4, collide: true, bounce: 0.32, spin: 14, fadeOut: 0.2 }),
  dust: def('dust', { ...smokeSprites, life: [0.9, 1.8], size: [0.35, 0.6], sizeEnd: 2.6, sizePow: 0.45, gravity: -0.3, drag: 3.2, alpha: 0.55, erode: true, spin: 0.8, wind: 0.6, fadeOut: 0.5 }),
  // ---- smoke & fire
  smoke: def('smoke', { ...smokeSprites, life: [1.4, 2.8], size: [0.22, 0.34], sizeEnd: 3.2, sizePow: 0.6, gravity: -0.9, drag: 1.4, color: [0.09, 0.09, 0.095], colorVar: 0.25, alpha: 0.6, erode: true, spin: 0.7, wind: 1, fadeOut: 0.5 }),
  large_smoke: def('large_smoke', { ...smokeSprites, life: [2.2, 4.5], size: [0.5, 0.8], sizeEnd: 3.4, sizePow: 0.55, gravity: -1.2, drag: 1.1, color: [0.06, 0.06, 0.062], colorVar: 0.3, alpha: 0.65, erode: true, spin: 0.5, wind: 1, fadeOut: 0.55 }),
  campfire_smoke: def('campfire_smoke', { ...smokeSprites, life: [8, 13], size: [0.6, 0.9], sizeEnd: 5, sizePow: 0.7, gravity: -0.35, drag: 0.35, color: [0.33, 0.33, 0.34], colorVar: 0.15, alpha: 0.42, erode: true, spin: 0.25, wind: 1, fadeIn: 0.08, fadeOut: 0.6 }),
  steam: def('steam', { ...smokeSprites, life: [1.2, 2.2], size: [0.4, 0.6], sizeEnd: 3, sizePow: 0.5, gravity: -1.6, drag: 1.5, color: [0.75, 0.77, 0.8], alpha: 0.45, erode: true, spin: 0.6, wind: 1, fadeOut: 0.6 }),
  poof: def('poof', { ...smokeSprites, life: [0.5, 1.1], size: [0.25, 0.45], sizeEnd: 2.2, sizePow: 0.4, gravity: -0.4, drag: 4, color: [0.7, 0.7, 0.72], colorVar: 0.1, alpha: 0.7, erode: true, spin: 1 }),
  flame: def('flame', { pool: Pool.Add, mode: Mode.Flame, orient: Orient.Upright, sprite: SP.FLAME0, variants: 4, life: [0.35, 0.8], size: [0.13, 0.2], sizeEnd: 0.35, sizePow: 2, gravity: -0.6, drag: 4, emissive: 7, emissiveEnd: 0.5, ramp: Ramp.Flame, fadeIn: 0.1, fadeOut: 0.35, trackLight: false, diesInLiquid: true, soft: 0.3 }),
  soul_flame: def('soul_flame', { pool: Pool.Add, mode: Mode.Flame, orient: Orient.Upright, sprite: SP.FLAME0, variants: 4, life: [0.35, 0.8], size: [0.13, 0.2], sizeEnd: 0.35, sizePow: 2, gravity: -0.6, drag: 4, emissive: 5, emissiveEnd: 0.5, ramp: Ramp.Soul, fadeIn: 0.1, fadeOut: 0.35, trackLight: false, diesInLiquid: true, soft: 0.3 }),
  ember: def('ember', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.GLOW, life: [0.8, 2.0], size: [0.03, 0.05], sizeEnd: 0.4, gravity: -1.5, drag: 1.2, emissive: 14, emissiveEnd: 0.1, ramp: Ramp.Spark, wobble: 0.6, wind: 0.8, trackLight: false, diesInLiquid: true, fadeOut: 0.4 }),
  lava_pop: def('lava_pop', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.GLOW, life: [1.0, 2.2], size: [0.1, 0.16], sizeEnd: 0.3, gravity: 16, drag: 0.3, collide: true, land: Land.Lava, emissive: 12, emissiveEnd: 0.25, ramp: Ramp.Lava, trackLight: false, fadeOut: 0.2 }),
  lava_drip: def('lava_drip', { pool: Pool.Add, mode: Mode.Emit, motion: Motion.Drip, orient: Orient.Velocity, sprite: SP.DROP, life: [6, 6], size: [0.07, 0.07], gravity: 18, collide: true, land: Land.Lava, emissive: 6, ramp: Ramp.Lava, stretch: 0.03, trackLight: false, fadeIn: 0.15, fadeOut: 0.02 }),
  landing_lava: def('landing_lava', { pool: Pool.Add, mode: Mode.Emit, orient: Orient.Horizontal, sprite: SP.GLOW, life: [1.0, 2.0], size: [0.12, 0.2], sizeEnd: 0.6, emissive: 7, emissiveEnd: 0.05, ramp: Ramp.Lava, trackLight: false, fadeIn: 0.02, fadeOut: 0.8 }),
  // ---- water
  drip_water: def('drip_water', { mode: Mode.Drop, motion: Motion.Drip, orient: Orient.Velocity, sprite: SP.DROP, life: [6, 6], size: [0.06, 0.06], gravity: 20, collide: true, land: Land.Splash, color: [0.6, 0.72, 0.85], alpha: 0.85, stretch: 0.03, fadeIn: 0.15, fadeOut: 0.02, diesInLiquid: true }),
  drip_obsidian: def('drip_obsidian', { pool: Pool.Add, mode: Mode.Emit, motion: Motion.Drip, orient: Orient.Velocity, sprite: SP.DROP, life: [6, 6], size: [0.06, 0.06], gravity: 18, collide: true, land: Land.Die, color: [0.5, 0.1, 1.0], emissive: 3, stretch: 0.03, trackLight: false, fadeIn: 0.15, fadeOut: 0.02 }),
  splash: def('splash', { mode: Mode.Drop, orient: Orient.Velocity, sprite: SP.DROP, life: [0.35, 0.8], size: [0.035, 0.07], gravity: 22, drag: 0.6, collide: true, land: Land.Die, color: [0.6, 0.72, 0.85], alpha: 0.8, stretch: 0.035, diesInLiquid: true, fadeOut: 0.15 }),
  rain_splash: def('rain_splash', { mode: Mode.Drop, orient: Orient.Velocity, sprite: SP.DROP, life: [0.18, 0.35], size: [0.025, 0.045], gravity: 24, collide: true, land: Land.Die, color: [0.6, 0.7, 0.82], alpha: 0.7, stretch: 0.03, trackLight: false, diesInLiquid: true, fadeOut: 0.3 }),
  ripple: def('ripple', { mode: Mode.Sprite, orient: Orient.Horizontal, sprite: SP.RING, life: [0.5, 0.9], size: [0.15, 0.25], sizeEnd: 5, sizePow: 0.5, color: [0.8, 0.85, 0.9], alpha: 0.45, selfLit: 0.15, trackLight: false, fadeIn: 0.02, fadeOut: 0.8, soft: 0.05 }),
  bubble: def('bubble', { mode: Mode.Sprite, sprite: SP.BUBBLE, life: [1.2, 3], size: [0.06, 0.11], gravity: -9, drag: 4, wobble: 0.6, color: [0.8, 0.9, 1.0], alpha: 0.75, selfLit: 0.2, needsWater: true, fadeIn: 0.05, fadeOut: 0.05 }),
  bubble_column: def('bubble_column', { mode: Mode.Sprite, sprite: SP.BUBBLE, life: [1.5, 3], size: [0.05, 0.1], gravity: -22, drag: 3, wobble: 0.35, color: [0.8, 0.9, 1.0], alpha: 0.75, selfLit: 0.2, needsWater: true, fadeIn: 0.05, fadeOut: 0.05 }),
  snowflake: def('snowflake', { mode: Mode.Sprite, sprite: SP.SNOWFLAKE, life: [3, 6], size: [0.05, 0.09], gravity: 1.2, drag: 1.0, wobble: 0.5, collide: true, land: Land.Die, color: [0.95, 0.97, 1.0], alpha: 0.9, spin: 1.5, selfLit: 0.1, wind: 0.8, fadeOut: 0.1 }),
  // ---- magic & portals
  portal: def('portal', { pool: Pool.Add, mode: Mode.Emit, motion: Motion.Attract, sprite: SP.GLOW, life: [1.6, 2.4], size: [0.06, 0.11], sizeEnd: 0.3, emissive: 5, ramp: Ramp.Portal, trackLight: false, fadeIn: 0.1, fadeOut: 0.2 }),
  enchant: def('enchant', { pool: Pool.Add, mode: Mode.Emit, motion: Motion.Attract, sprite: SP.GLYPH0, variants: GLYPH_COUNT, life: [1.5, 2.4], size: [0.1, 0.14], sizeEnd: 0.8, emissive: 1.4, color: [0.85, 0.82, 1.0], colorVar: 0.15, trackLight: false, fadeIn: 0.15, fadeOut: 0.15 }),
  potion_swirl: def('potion_swirl', { mode: Mode.Sprite, sprite: SP.SPARKLE, life: [0.6, 1.2], size: [0.1, 0.15], sizeEnd: 0.5, gravity: -1.5, drag: 2, wobble: 0.5, alpha: 0.9, selfLit: 0.6, spin: 2, fadeOut: 0.4 }),
  crit: def('crit', { pool: Pool.Add, mode: Mode.Emit, orient: Orient.Velocity, sprite: SP.STAR, life: [0.3, 0.8], size: [0.1, 0.16], sizeEnd: 0.2, gravity: 5, drag: 3.5, color: [1.0, 0.85, 0.55], emissive: 5, emissiveEnd: 0.3, stretch: 0.02, trackLight: false }),
  magic_crit: def('magic_crit', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.SPARKLE, life: [0.35, 0.9], size: [0.1, 0.16], sizeEnd: 0.2, gravity: 3, drag: 3.5, color: [0.35, 0.75, 1.0], emissive: 5, emissiveEnd: 0.3, spin: 4, trackLight: false }),
  heart: def('heart', { mode: Mode.Sprite, sprite: SP.HEART, life: [0.9, 1.3], size: [0.22, 0.28], gravity: -1.2, drag: 2.5, alpha: 1, selfLit: 0.45, fadeIn: 0.1, fadeOut: 0.3, soft: 0.1 }),
  damage_indicator: def('damage_indicator', { mode: Mode.Sprite, sprite: SP.HEART, life: [0.5, 0.8], size: [0.16, 0.2], gravity: 6, drag: 1.5, color: [0.35, 0.12, 0.12], alpha: 1, selfLit: 0.2, fadeOut: 0.3, soft: 0.1 }),
  angry_villager: def('angry_villager', { mode: Mode.Sprite, sprite: SP.ANGRY, life: [0.9, 1.3], size: [0.3, 0.36], gravity: -0.5, drag: 2, alpha: 1, selfLit: 0.3, fadeOut: 0.3, soft: 0.1 }),
  happy_villager: def('happy_villager', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.SPARKLE, life: [0.7, 1.3], size: [0.1, 0.14], sizeEnd: 0.4, gravity: -0.2, drag: 2, wobble: 0.3, color: [0.25, 1.0, 0.3], emissive: 2.5, spin: 2, trackLight: false }),
  note: def('note', { mode: Mode.Sprite, sprite: SP.NOTE, life: [0.7, 0.9], size: [0.22, 0.26], gravity: -2, drag: 4, alpha: 1, selfLit: 0.6, fadeOut: 0.3, soft: 0.1 }),
  end_rod: def('end_rod', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.GLOW, life: [2, 3.5], size: [0.08, 0.12], sizeEnd: 0.3, gravity: -0.05, drag: 1.2, wobble: 0.08, emissive: 6, emissiveEnd: 0.4, ramp: Ramp.EndRod, trackLight: false, fadeOut: 0.3 }),
  dragon_breath: def('dragon_breath', { pool: Pool.Add, mode: Mode.Emit, ...smokeSprites, life: [1, 2], size: [0.3, 0.45], sizeEnd: 2.5, sizePow: 0.5, drag: 2.5, color: [0.85, 0.2, 0.9], emissive: 1.6, emissiveEnd: 0.1, spin: 1, trackLight: false }),
  totem: def('totem', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.SQUARE, life: [1.2, 2.6], size: [0.06, 0.1], sizeEnd: 0.4, gravity: 3.5, drag: 1.8, wobble: 0.3, emissive: 3, emissiveEnd: 0.3, spin: 6, trackLight: false }),
  sweep_attack: def('sweep_attack', { mode: Mode.Sprite, orient: Orient.Horizontal, sprite: SP.CRESCENT, life: [0.22, 0.22], size: [1.6, 1.6], sizeEnd: 1.25, color: [0.95, 0.95, 0.95], alpha: 0.85, selfLit: 0.5, fadeIn: 0.05, fadeOut: 0.7, trackLight: false, soft: 0.05 }),
  // ---- impacts
  sparks: def('sparks', { pool: Pool.Add, mode: Mode.Emit, orient: Orient.Velocity, sprite: SP.STREAK, life: [0.25, 0.7], size: [0.025, 0.04], sizeEnd: 0.6, gravity: 18, drag: 0.8, collide: true, bounce: 0.35, emissive: 18, emissiveEnd: 0.15, ramp: Ramp.Spark, stretch: 0.03, trackLight: false, diesInLiquid: true }),
  blood: def('blood', { mode: Mode.Drop, orient: Orient.Velocity, sprite: SP.DROP, life: [0.6, 1.3], size: [0.04, 0.075], gravity: 22, drag: 0.5, collide: true, land: Land.Blood, color: [0.22, 0.004, 0.004], alpha: 1, stretch: 0.025, diesInLiquid: true, fadeOut: 0.1 }),
  // ---- explosion parts
  explosion_fire: def('explosion_fire', { ...smokeSprites, life: [0.5, 0.95], size: [1, 1.6], sizeEnd: 2.4, sizePow: 0.35, gravity: -2, drag: 4, color: [0.05, 0.045, 0.04], alpha: 0.85, erode: true, emissive: 40, emissiveEnd: 0, ramp: Ramp.Explosion, spin: 1.5, fadeIn: 0.02, fadeOut: 0.45 }),
  explosion_smoke: def('explosion_smoke', { ...smokeSprites, life: [3, 6], size: [1.2, 2], sizeEnd: 3, sizePow: 0.5, gravity: -1.6, drag: 1.2, color: [0.05, 0.048, 0.045], colorVar: 0.3, alpha: 0.75, erode: true, spin: 0.4, wind: 1, fadeIn: 0.06, fadeOut: 0.6 }),
  shockwave: def('shockwave', { pool: Pool.Add, mode: Mode.Emit, orient: Orient.Horizontal, sprite: SP.RING, life: [0.35, 0.35], size: [0.5, 0.5], sizeEnd: 30, sizePow: 0.6, color: [1, 0.75, 0.45], emissive: 6, emissiveEnd: 0, trackLight: false, fadeIn: 0.0, fadeOut: 0.9, soft: 0.05 }),
  dust_ring: def('dust_ring', { mode: Mode.Sprite, orient: Orient.Horizontal, sprite: SP.RING, life: [0.9, 0.9], size: [0.5, 0.5], sizeEnd: 22, sizePow: 0.45, color: [0.55, 0.5, 0.45], alpha: 0.55, selfLit: 0.0, fadeIn: 0.0, fadeOut: 0.8, soft: 0.05 }),
  // ---- ambience
  ash: def('ash', { mode: Mode.Sprite, sprite: SP.FLAKE, motion: Motion.Wander, life: [3, 6], size: [0.03, 0.05], gravity: 0.25, drag: 1, wobble: 0.3, color: [0.08, 0.07, 0.07], alpha: 0.9, spin: 2, fadeIn: 0.2, fadeOut: 0.3, soft: 0.1 }),
  white_ash: def('white_ash', { mode: Mode.Sprite, sprite: SP.FLAKE, motion: Motion.Wander, life: [3, 6], size: [0.03, 0.05], gravity: 0.3, drag: 1, wobble: 0.3, color: [0.62, 0.6, 0.6], alpha: 0.9, spin: 2, fadeIn: 0.2, fadeOut: 0.3, soft: 0.1 }),
  crimson_spore: def('crimson_spore', { mode: Mode.Sprite, sprite: SP.GLOW, motion: Motion.Wander, life: [3, 6], size: [0.04, 0.06], gravity: 0.2, drag: 1, wobble: 0.25, color: [0.75, 0.08, 0.06], alpha: 0.95, selfLit: 0.6, fadeIn: 0.2, fadeOut: 0.3, soft: 0.1 }),
  warped_spore: def('warped_spore', { mode: Mode.Sprite, sprite: SP.GLOW, motion: Motion.Wander, life: [3, 6], size: [0.04, 0.06], gravity: -0.15, drag: 1, wobble: 0.25, color: [0.08, 0.55, 0.6], alpha: 0.95, selfLit: 0.6, fadeIn: 0.2, fadeOut: 0.3, soft: 0.1 }),
  dust_mote: def('dust_mote', { pool: Pool.Add, mode: Mode.Mote, sprite: SP.GLOW, motion: Motion.Wander, life: [6, 12], size: [0.012, 0.022], drag: 1, wobble: 0.06, color: [1, 0.95, 0.85], alpha: 1, fadeIn: 0.25, fadeOut: 0.35, soft: 0.05 }),
  firefly: def('firefly', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.GLOW, motion: Motion.Wander, life: [6, 12], size: [0.06, 0.09], drag: 1, wobble: 0.5, color: [0.7, 1.0, 0.25], emissive: 4, trackLight: false, fadeIn: 0.15, fadeOut: 0.2 }),
  redstone: def('redstone', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.GLOW, life: [0.5, 1.0], size: [0.05, 0.08], sizeEnd: 0.3, gravity: -0.3, drag: 2, color: [1, 0.08, 0.04], emissive: 2.5, trackLight: false }),
  firework_spark: def('firework_spark', { pool: Pool.Add, mode: Mode.Emit, sprite: SP.GLOW, life: [1.1, 1.9], size: [0.07, 0.1], sizeEnd: 0.25, gravity: 3, drag: 1.4, emissive: 16, emissiveEnd: 0.05, trackLight: false, fadeOut: 0.4 }),
};

export type ParticleTypeName = keyof typeof PT;

export function particleId(name: string): number {
  const id = PARTICLE_IDS[name];
  return id === undefined ? -1 : id;
}
