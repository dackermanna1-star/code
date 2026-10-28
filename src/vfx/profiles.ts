// Particle effect profiles (PURE DATA — no Babylon imports).
//
// Every public VfxKind is a stack of LAYERS; each layer is a ParticleProfile rendered by one of
// five pooled particle groups (one Babylon ParticleSystem each):
//   puff   — soft alpha-blended billboards from the puff atlas (dust, smoke, mist, fluff)
//   bits   — small alpha-blended sprites from the bits atlas (chips, splinters, crumbs, paper,
//            feathers) — transient flying bits; persistent fragments are micro-debris instead
//   spark  — additive, velocity-stretched streaks (hot sparks)
//   glint  — additive twinkling stars (glass glitter, bulb pops)
//   drop   — alpha-blended, velocity-stretched droplets (water, liquids)
//
// Motion model per particle (integrated in particles.ts):
//   v ← air + (v − air)·e^(−drag·dt)        (linear relaxation toward the moving air: dust/smoke)
//   v.y += gravity·dt                        (for "air" particles gravity = −drag·settleSpeed)
//   v ← v / (1 + quadDrag·|v|·dt)            (quadratic drag for ballistic bits/sparks/drops)
//   + flutter (paper/feathers), turbulence (dust/smoke), ground contact (rest / bounce / die).
// Colours are sRGB (the particle shader linearises them); `lit` scales them by the local light
// level so dust does not glow in the dark; additive layers use `hdr` > 1 so bloom catches them.

import type { VfxKind } from "../core/context.ts";

export type GroupId = "puff" | "bits" | "spark" | "glint" | "drop";

export interface GroupDef {
  atlas: "puff" | "bits";
  blend: "alpha" | "add";
  stretched: boolean;
  /** Particle capacity at quality.particles = 1. */
  capacity: number;
}

export const GROUPS: Readonly<Record<GroupId, GroupDef>> = {
  puff: { atlas: "puff", blend: "alpha", stretched: false, capacity: 2600 },
  bits: { atlas: "bits", blend: "alpha", stretched: false, capacity: 2600 },
  spark: { atlas: "bits", blend: "add", stretched: true, capacity: 1400 },
  glint: { atlas: "bits", blend: "add", stretched: false, capacity: 1000 },
  drop: { atlas: "bits", blend: "alpha", stretched: true, capacity: 2600 },
};
export const GROUP_IDS: readonly GroupId[] = ["puff", "bits", "spark", "glint", "drop"];

/** Atlas cell indices (4×4 grids; cell 0 = top-left). */
export const PUFF_CELLS = { dust: [0, 1, 2, 3, 4, 5, 6, 7], smoke: [8, 9, 10, 11], fluff: [12, 13, 14, 15] } as const;
export const BITS_CELLS = {
  chips: [0, 1, 2, 3],
  splinters: [4, 5],
  crumbs: [6, 7],
  paper: [8, 9],
  feathers: [10, 11],
  drop: [12],
  streak: [13],
  star: [14],
  dot: [15],
} as const;

export interface ParticleProfile {
  id: string;
  group: GroupId;
  cells: readonly number[];
  /** Particles per burst at intensity 1 and quality 1. */
  count: number;
  /** count ∝ intensity^countExp */
  countExp: number;
  /** Hard cap per burst (before quality scaling). */
  maxCount: number;
  life: readonly [number, number];
  /** Start size (m) — sprite width; for stretched sprites the streak width. */
  size: readonly [number, number];
  /** size ∝ intensity^sizeExp */
  sizeExp: number;
  /** End-of-life size multiplier range (ease-out growth). */
  grow: readonly [number, number];
  /** Sprite scale multipliers (x = width, y = height; textures are drawn with their long axis vertical). */
  scaleX: readonly [number, number];
  scaleY: readonly [number, number];
  speed: readonly [number, number];
  speedExp: number;
  /** 0 = exactly along dir; 1 = full hemisphere around dir; >1 also backwards. */
  spread: number;
  /** Spawn sphere radius (m) at intensity 1. */
  radius: number;
  radiusExp: number;
  /** Spawn offset along the surface normal (m). */
  offset: number;
  drag: number;
  quadDrag: number;
  gravity: number;
  turb: number;
  flutter: number;
  /** Ground contact: 0 none, 1 rest/slide (dust settles), 2 bounce (bits/sparks). */
  collide: 0 | 1 | 2;
  bounce: number;
  /** Horizontal speed decay rate on the ground (1/s). */
  friction: number;
  /** Die on ground contact (droplets) — reports the landing for puddles. */
  dieOnGround: boolean;
  color: readonly [number, number, number];
  /** ± brightness variation per particle. */
  colorVar: number;
  /** How strongly a burst tint replaces the profile colour (0..1). */
  tintMix: number;
  alpha: number;
  fadeIn: number;
  fadeOut: number;
  /** Max |angular speed| (rad/s) of the sprite rotation. */
  spin: number;
  /** Stretched sprites: streak length = speed · stretch (s ≈ exposure time). */
  stretch: number;
  /** 0 = emissive (ignores lighting), 1 = fully scaled by the local light level. */
  lit: number;
  /** Colour multiplier (additive layers > 1 → bloom). */
  hdr: number;
  /** 0..1 twinkle (random alpha per frame). */
  flicker: number;
  /** Sparks: colour cools from white-yellow to dark red over life. */
  cool: number;
}

const D: Omit<ParticleProfile, "id" | "group" | "cells"> = {
  count: 10,
  countExp: 0.85,
  maxCount: 200,
  life: [1, 2],
  size: [0.05, 0.1],
  sizeExp: 0.25,
  grow: [1, 1],
  scaleX: [1, 1],
  scaleY: [1, 1],
  speed: [0.5, 1.5],
  speedExp: 0.25,
  spread: 0.8,
  radius: 0.04,
  radiusExp: 0.45,
  offset: 0.02,
  drag: 0,
  quadDrag: 0,
  gravity: -9.81,
  turb: 0,
  flutter: 0,
  collide: 0,
  bounce: 0,
  friction: 6,
  dieOnGround: false,
  color: [1, 1, 1],
  colorVar: 0.06,
  tintMix: 0.7,
  alpha: 1,
  fadeIn: 0.02,
  fadeOut: 0.3,
  spin: 0,
  stretch: 0,
  lit: 1,
  hdr: 1,
  flicker: 0,
  cool: 0,
};

function P(id: string, group: GroupId, cells: readonly number[], o: Partial<ParticleProfile>): ParticleProfile {
  return { ...D, ...o, id, group, cells };
}

/** Settling dust: relaxation rate c (1/s) and terminal settling speed (m/s) → gravity term. */
const settle = (drag: number, speed: number) => ({ drag, gravity: -drag * speed });

export const PROFILES: Readonly<Record<string, ParticleProfile>> = Object.fromEntries(
  [
    // ---------------------------------------------------------------- dust family
    P("dust", "puff", PUFF_CELLS.dust, {
      count: 12, maxCount: 160, life: [1.4, 2.8], size: [0.07, 0.15], sizeExp: 0.3, grow: [2.6, 4.2], speed: [0.5, 1.8],
      spread: 0.85, radius: 0.05, radiusExp: 0.5, offset: 0.03, ...settle(3.5, 0.1), turb: 0.1, collide: 1,
      color: [0.66, 0.63, 0.58], colorVar: 0.08, alpha: 0.5, fadeIn: 0.06, fadeOut: 0.65, spin: 0.5,
    }),
    P("drywallCloud", "puff", PUFF_CELLS.dust, {
      count: 34, maxCount: 320, life: [5, 10], size: [0.16, 0.34], sizeExp: 0.35, grow: [3, 5.5], speed: [0.6, 2.6], speedExp: 0.3,
      spread: 0.95, radius: 0.1, radiusExp: 0.5, offset: 0.05, ...settle(2.4, 0.05), turb: 0.08, collide: 1,
      color: [0.88, 0.87, 0.84], colorVar: 0.05, tintMix: 0.5, alpha: 0.5, fadeIn: 0.03, fadeOut: 0.6, spin: 0.25,
    }),
    P("drywallFines", "puff", PUFF_CELLS.dust, {
      count: 18, maxCount: 200, life: [1.2, 2.6], size: [0.05, 0.1], grow: [3, 5], speed: [1.5, 4.2], spread: 0.6,
      radius: 0.04, ...settle(4.5, 0.09), turb: 0.15, collide: 1, color: [0.92, 0.91, 0.88], colorVar: 0.04, tintMix: 0.5,
      alpha: 0.55, fadeIn: 0.02, fadeOut: 0.7, spin: 0.6,
    }),
    P("gypsumCrumbs", "bits", BITS_CELLS.crumbs, {
      count: 12, maxCount: 160, life: [0.8, 1.6], size: [0.008, 0.02], sizeExp: 0.1, speed: [1, 3], spread: 0.8, radius: 0.05,
      quadDrag: 0.15, collide: 2, bounce: 0.12, friction: 8, color: [0.92, 0.91, 0.88], colorVar: 0.06, tintMix: 0.4, fadeOut: 0.3, spin: 12,
    }),
    P("concreteCloud", "puff", PUFF_CELLS.dust, {
      count: 16, maxCount: 220, life: [2.2, 4.5], size: [0.09, 0.2], sizeExp: 0.3, grow: [2.5, 4], speed: [0.9, 2.6], spread: 0.9,
      radius: 0.05, ...settle(3, 0.2), turb: 0.08, collide: 1, color: [0.67, 0.66, 0.64], colorVar: 0.05, tintMix: 0.5,
      alpha: 0.48, fadeIn: 0.04, fadeOut: 0.6, spin: 0.4,
    }),
    P("concreteCrumbs", "bits", [...BITS_CELLS.crumbs, ...BITS_CELLS.chips], {
      count: 10, maxCount: 140, life: [0.8, 1.6], size: [0.008, 0.025], sizeExp: 0.15, speed: [1.5, 4], spread: 0.8, radius: 0.03,
      quadDrag: 0.1, collide: 2, bounce: 0.2, friction: 8, color: [0.55, 0.55, 0.54], colorVar: 0.12, tintMix: 0.4, fadeOut: 0.3, spin: 14,
    }),
    // ---------------------------------------------------------------- wood
    P("woodChipBits", "bits", BITS_CELLS.chips, {
      count: 12, maxCount: 160, life: [1, 2], size: [0.008, 0.022], sizeExp: 0.15, scaleX: [0.6, 1.0], scaleY: [0.8, 1.4],
      speed: [1.2, 3.8], spread: 0.75, radius: 0.03, quadDrag: 0.25, collide: 2, bounce: 0.35, friction: 7,
      color: [0.72, 0.56, 0.36], colorVar: 0.2, tintMix: 0.6, fadeOut: 0.25, spin: 16,
    }),
    P("woodDust", "puff", PUFF_CELLS.dust, {
      count: 5, maxCount: 80, life: [1.2, 2.2], size: [0.05, 0.1], grow: [2.5, 3.5], speed: [0.4, 1.4], spread: 0.8,
      ...settle(4, 0.1), turb: 0.08, collide: 1, color: [0.68, 0.58, 0.45], colorVar: 0.06, tintMix: 0.5, alpha: 0.32,
      fadeIn: 0.05, fadeOut: 0.6, spin: 0.5,
    }),
    P("splinterBits", "bits", BITS_CELLS.splinters, {
      count: 9, countExp: 0.8, maxCount: 120, life: [1.2, 2.2], size: [0.025, 0.07], sizeExp: 0.2, scaleX: [0.22, 0.38],
      speed: [2, 5.5], spread: 0.7, radius: 0.03, quadDrag: 0.2, collide: 2, bounce: 0.3, friction: 7,
      color: [0.8, 0.66, 0.46], colorVar: 0.15, tintMix: 0.6, fadeOut: 0.2, spin: 20,
    }),
    // ---------------------------------------------------------------- sparks & glints
    P("sparkStreaks", "spark", BITS_CELLS.streak, {
      count: 20, countExp: 0.7, maxCount: 240, life: [0.22, 0.6], size: [0.008, 0.014], sizeExp: 0, speed: [3, 10], speedExp: 0.3,
      spread: 0.8, radius: 0.01, radiusExp: 0.3, offset: 0.01, quadDrag: 1.2, collide: 2, bounce: 0.45, friction: 4,
      color: [1, 0.62, 0.22], colorVar: 0.05, tintMix: 0, fadeOut: 0.3, stretch: 1 / 55, lit: 0, hdr: 3, cool: 1,
    }),
    P("sparkFlash", "glint", BITS_CELLS.star, {
      count: 1, countExp: 0, maxCount: 2, life: [0.06, 0.1], size: [0.1, 0.18], sizeExp: 0.3, speed: [0, 0], radius: 0, offset: 0.02,
      gravity: 0, color: [1, 0.86, 0.62], colorVar: 0, tintMix: 0, fadeIn: 0, fadeOut: 0.9, lit: 0, hdr: 3, spin: 2,
    }),
    P("glitter", "glint", [...BITS_CELLS.star, ...BITS_CELLS.dot], {
      count: 26, maxCount: 320, life: [0.8, 2.2], size: [0.008, 0.02], sizeExp: 0.1, speed: [1, 3.8], spread: 0.95, radius: 0.06,
      quadDrag: 0.2, collide: 2, bounce: 0.3, friction: 6, color: [0.92, 0.97, 1], colorVar: 0.05, tintMix: 0.2, alpha: 0.95,
      fadeOut: 0.35, lit: 0.8, hdr: 1.8, flicker: 0.9, spin: 1,
    }),
    P("glassBits", "bits", BITS_CELLS.chips, {
      count: 8, maxCount: 120, life: [0.8, 1.8], size: [0.006, 0.016], sizeExp: 0.1, speed: [1, 3], spread: 0.9, radius: 0.05,
      quadDrag: 0.15, collide: 2, bounce: 0.3, friction: 7, color: [0.78, 0.88, 0.86], colorVar: 0.05, tintMix: 0.3, alpha: 0.6,
      fadeOut: 0.3, spin: 16,
    }),
    // ---------------------------------------------------------------- water & liquids
    P("waterDrops", "drop", BITS_CELLS.drop, {
      count: 30, maxCount: 320, life: [0.5, 1.2], size: [0.006, 0.012], sizeExp: 0, speed: [2.5, 6], spread: 0.35, radius: 0.015,
      offset: 0.01, quadDrag: 0.5, collide: 1, dieOnGround: true, color: [0.86, 0.91, 0.96], colorVar: 0.04, tintMix: 0.8,
      alpha: 0.45, fadeOut: 0.1, stretch: 1 / 50,
    }),
    P("waterMist", "puff", PUFF_CELLS.dust, {
      count: 3, maxCount: 40, life: [0.8, 1.6], size: [0.08, 0.16], grow: [2, 3], speed: [0.5, 2], spread: 0.5,
      ...settle(3, 0.07), turb: 0.1, collide: 1, color: [0.86, 0.9, 0.95], colorVar: 0.03, tintMix: 0.5, alpha: 0.16,
      fadeIn: 0.1, fadeOut: 0.6, spin: 0.5,
    }),
    P("drip", "drop", BITS_CELLS.drop, {
      count: 1, countExp: 0.5, maxCount: 4, life: [1.5, 2.5], size: [0.008, 0.011], sizeExp: 0, speed: [0, 0.2], spread: 0.2,
      radius: 0.005, offset: 0, collide: 1, dieOnGround: true, color: [0.75, 0.83, 0.9], colorVar: 0.02, tintMix: 0.8,
      alpha: 0.7, fadeIn: 0, fadeOut: 0.05, stretch: 1 / 40,
    }),
    P("liquidDrops", "drop", BITS_CELLS.drop, {
      count: 22, maxCount: 240, life: [0.4, 1], size: [0.007, 0.016], sizeExp: 0.1, speed: [1.5, 4.5], spread: 0.9, radius: 0.03,
      quadDrag: 0.4, collide: 1, dieOnGround: true, color: [0.82, 0.62, 0.32], colorVar: 0.04, tintMix: 1, alpha: 0.8,
      fadeOut: 0.1, stretch: 1 / 45,
    }),
    // ---------------------------------------------------------------- smoke & extinguisher
    P("smokePuff", "puff", PUFF_CELLS.smoke, {
      count: 9, maxCount: 140, life: [2.2, 4.2], size: [0.08, 0.16], sizeExp: 0.3, grow: [3.5, 6.5], speed: [0.15, 0.6], spread: 0.6,
      radius: 0.03, drag: 1.6, gravity: 0.26, turb: 0.14, collide: 0, color: [0.17, 0.16, 0.15], colorVar: 0.04, tintMix: 0.3,
      alpha: 0.5, fadeIn: 0.12, fadeOut: 0.6, spin: 0.4,
    }),
    P("extCloud", "puff", PUFF_CELLS.dust, {
      count: 5, maxCount: 60, life: [1.2, 2.4], size: [0.05, 0.1], sizeExp: 0, grow: [7, 13], speed: [6, 10], speedExp: 0, spread: 0.16,
      radius: 0.01, offset: 0, ...settle(2, 0.015), turb: 0.25, collide: 1, color: [0.96, 0.96, 0.96], colorVar: 0.02, tintMix: 0.3,
      alpha: 0.42, fadeIn: 0.02, fadeOut: 0.7, spin: 0.6,
    }),
    // ---------------------------------------------------------------- soft goods & misc
    P("featherBits", "bits", BITS_CELLS.feathers, {
      count: 14, maxCount: 200, life: [4, 8], size: [0.03, 0.055], sizeExp: 0.1, scaleX: [0.5, 0.65], speed: [0.6, 2.4], spread: 1.2,
      radius: 0.08, ...settle(4.2, 0.3), turb: 0.08, flutter: 1.6, collide: 1, friction: 3, color: [0.96, 0.95, 0.92], colorVar: 0.04,
      tintMix: 0.3, fadeIn: 0.02, fadeOut: 0.12, spin: 2.5,
    }),
    P("foamCrumbs", "bits", BITS_CELLS.crumbs, {
      count: 16, maxCount: 200, life: [1.6, 3.2], size: [0.008, 0.02], sizeExp: 0.1, speed: [0.8, 2.6], spread: 0.9, radius: 0.06,
      quadDrag: 1.2, collide: 2, bounce: 0.15, friction: 6, color: [0.94, 0.84, 0.46], colorVar: 0.12, tintMix: 0.5, fadeOut: 0.25, spin: 10,
    }),
    P("paperScraps", "bits", BITS_CELLS.paper, {
      count: 9, maxCount: 140, life: [3, 6], size: [0.02, 0.045], sizeExp: 0.1, scaleX: [0.7, 1.3], speed: [0.8, 2.6], spread: 1,
      radius: 0.06, ...settle(3.2, 0.7), flutter: 2.5, collide: 1, friction: 4, color: [0.95, 0.94, 0.9], colorVar: 0.06,
      tintMix: 0.5, fadeIn: 0.02, fadeOut: 0.15, spin: 5,
    }),
    P("soilCrumbs", "bits", BITS_CELLS.crumbs, {
      count: 20, maxCount: 240, life: [0.8, 1.8], size: [0.006, 0.016], sizeExp: 0.1, speed: [0.8, 2.8], spread: 0.85, radius: 0.05,
      quadDrag: 0.25, collide: 2, bounce: 0.08, friction: 9, color: [0.28, 0.21, 0.15], colorVar: 0.2, tintMix: 0.4, fadeOut: 0.3, spin: 10,
    }),
    P("soilDust", "puff", PUFF_CELLS.dust, {
      count: 4, maxCount: 60, life: [1, 2], size: [0.05, 0.1], grow: [2.5, 3.5], speed: [0.4, 1.2], ...settle(3.5, 0.14), turb: 0.06,
      collide: 1, color: [0.42, 0.35, 0.28], colorVar: 0.05, tintMix: 0.4, alpha: 0.3, fadeIn: 0.05, fadeOut: 0.6, spin: 0.4,
    }),
    P("ceramicBits", "bits", BITS_CELLS.chips, {
      count: 12, maxCount: 160, life: [0.8, 1.7], size: [0.005, 0.015], sizeExp: 0.1, speed: [1.5, 4.2], spread: 0.8, radius: 0.03,
      quadDrag: 0.15, collide: 2, bounce: 0.35, friction: 7, color: [0.95, 0.95, 0.93], colorVar: 0.06, tintMix: 0.8, fadeOut: 0.25, spin: 18,
    }),
    P("ceramicDust", "puff", PUFF_CELLS.dust, {
      count: 4, maxCount: 60, life: [1, 2], size: [0.04, 0.09], grow: [2.5, 3.5], speed: [0.4, 1.5], ...settle(4, 0.1), turb: 0.06,
      collide: 1, color: [0.9, 0.89, 0.87], colorVar: 0.03, tintMix: 0.3, alpha: 0.28, fadeIn: 0.05, fadeOut: 0.6, spin: 0.5,
    }),
    P("plasticChips", "bits", BITS_CELLS.chips, {
      count: 10, maxCount: 140, life: [0.9, 1.8], size: [0.006, 0.016], sizeExp: 0.1, speed: [1.2, 3.6], spread: 0.8, radius: 0.03,
      quadDrag: 0.3, collide: 2, bounce: 0.45, friction: 6, color: [0.85, 0.85, 0.85], colorVar: 0.06, tintMix: 1, fadeOut: 0.25, spin: 18,
    }),
    P("fluffTufts", "puff", PUFF_CELLS.fluff, {
      count: 10, maxCount: 140, life: [3, 6], size: [0.035, 0.08], sizeExp: 0.2, grow: [1, 1.4], speed: [0.5, 1.8], spread: 0.9,
      radius: 0.06, ...settle(3.5, 0.25), flutter: 0.6, turb: 0.06, collide: 1, friction: 3, color: [0.95, 0.83, 0.58],
      colorVar: 0.06, tintMix: 0.6, alpha: 0.9, fadeIn: 0.03, fadeOut: 0.2, spin: 1.5,
    }),
    P("fluffDust", "puff", PUFF_CELLS.dust, {
      count: 5, maxCount: 70, life: [2, 4], size: [0.05, 0.1], grow: [2.5, 4], speed: [0.3, 1.2], ...settle(3, 0.07), turb: 0.08,
      collide: 1, color: [0.92, 0.86, 0.7], colorVar: 0.04, tintMix: 0.5, alpha: 0.22, fadeIn: 0.05, fadeOut: 0.6, spin: 0.4,
    }),
  ].map((p) => [p.id, p]),
);

export interface Layer {
  /** Profile id. */
  p: string;
  /** Count multiplier for this layer. */
  n?: number;
  /** Intensity multiplier for this layer (affects count/size/speed scaling). */
  i?: number;
}

/** What a one-shot `burst(kind, …)` spawns. */
export const KIND_LAYERS: Readonly<Record<VfxKind, readonly Layer[]>> = {
  dust: [{ p: "dust" }],
  drywallDust: [{ p: "drywallCloud" }, { p: "drywallFines" }, { p: "gypsumCrumbs", n: 0.8 }],
  concreteDust: [{ p: "concreteCloud" }, { p: "concreteCrumbs" }],
  woodChips: [{ p: "woodChipBits" }, { p: "woodDust" }],
  splinters: [{ p: "splinterBits" }, { p: "woodChipBits", n: 0.4 }],
  sparks: [{ p: "sparkStreaks" }, { p: "sparkFlash" }],
  glassGlitter: [{ p: "glitter" }, { p: "glassBits" }],
  water: [{ p: "waterDrops" }, { p: "waterMist" }],
  waterDrip: [{ p: "drip" }],
  smoke: [{ p: "smokePuff" }],
  feathers: [{ p: "featherBits" }],
  foam: [{ p: "foamCrumbs" }],
  paper: [{ p: "paperScraps" }],
  soil: [{ p: "soilCrumbs" }, { p: "soilDust" }],
  ceramicChips: [{ p: "ceramicBits" }, { p: "ceramicDust" }],
  plasticBits: [{ p: "plasticChips" }],
  insulationFluff: [{ p: "fluffTufts" }, { p: "fluffDust" }],
  liquid: [{ p: "liquidDrops" }],
  extinguisher: [{ p: "extCloud", n: 3 }],
};

export interface EmitterLayer {
  p: string;
  /** Particles per second at rate 1 (quality 1). */
  rate: number;
  /** Optional clumping: emit in bursts of this many at rate/clump bursts per second (sparks). */
  clump?: number;
}

/**
 * Continuous emitters. `rate` passed to `vfx.emitter()` is a strength multiplier: 1 = nominal
 * (a burst mains pipe, a fire extinguisher at full blast, an electrical fire's smoke).
 */
export const EMITTER_LAYERS: Readonly<Record<VfxKind, readonly EmitterLayer[]>> = {
  dust: [{ p: "dust", rate: 8 }],
  drywallDust: [{ p: "drywallCloud", rate: 5 }, { p: "gypsumCrumbs", rate: 6 }],
  concreteDust: [{ p: "concreteCloud", rate: 6 }, { p: "concreteCrumbs", rate: 6 }],
  woodChips: [{ p: "woodChipBits", rate: 20 }],
  splinters: [{ p: "splinterBits", rate: 12 }],
  sparks: [{ p: "sparkStreaks", rate: 30, clump: 10 }, { p: "sparkFlash", rate: 3, clump: 1 }],
  glassGlitter: [{ p: "glitter", rate: 25 }],
  water: [{ p: "waterDrops", rate: 260 }, { p: "waterMist", rate: 14 }],
  waterDrip: [{ p: "drip", rate: 3 }],
  smoke: [{ p: "smokePuff", rate: 10 }],
  feathers: [{ p: "featherBits", rate: 12 }],
  foam: [{ p: "foamCrumbs", rate: 20 }],
  paper: [{ p: "paperScraps", rate: 8 }],
  soil: [{ p: "soilCrumbs", rate: 30 }],
  ceramicChips: [{ p: "ceramicBits", rate: 20 }],
  plasticBits: [{ p: "plasticChips", rate: 15 }],
  insulationFluff: [{ p: "fluffTufts", rate: 6 }],
  liquid: [{ p: "liquidDrops", rate: 90 }],
  extinguisher: [{ p: "extCloud", rate: 45 }],
};

export const VFX_KINDS = Object.keys(KIND_LAYERS) as VfxKind[];

/** Validate the tables (used by unit tests). Returns a list of problems. */
export function validateProfiles(): string[] {
  const errs: string[] = [];
  for (const p of Object.values(PROFILES)) {
    if (!GROUPS[p.group]) errs.push(`${p.id}: unknown group ${p.group}`);
    if (!p.cells.length) errs.push(`${p.id}: no cells`);
    for (const c of p.cells) if (c < 0 || c > 15) errs.push(`${p.id}: bad cell ${c}`);
    if (!(p.life[0] > 0 && p.life[1] >= p.life[0])) errs.push(`${p.id}: bad life`);
    if (!(p.size[0] > 0 && p.size[1] >= p.size[0])) errs.push(`${p.id}: bad size`);
    if (p.alpha <= 0 || p.alpha > 1) errs.push(`${p.id}: bad alpha`);
    if (p.fadeIn + p.fadeOut > 1) errs.push(`${p.id}: fades overlap`);
    if (GROUPS[p.group]?.stretched && !(p.stretch > 0)) errs.push(`${p.id}: stretched group needs stretch`);
  }
  for (const [k, layers] of Object.entries(KIND_LAYERS)) for (const l of layers) if (!PROFILES[l.p]) errs.push(`kind ${k}: unknown profile ${l.p}`);
  for (const [k, layers] of Object.entries(EMITTER_LAYERS)) for (const l of layers) if (!PROFILES[l.p]) errs.push(`emitter ${k}: unknown profile ${l.p}`);
  return errs;
}
