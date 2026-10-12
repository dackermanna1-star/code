// Procedural wands (Noita-like), starter wands, and shop pricing.
//
// Tier 1 = the Mines. 88% of Mines wands use one of Noita's 17 pre-made templates (wand_001..wand_017,
// stats verbatim from the wiki); the rest, and every higher tier, roll stats from per-tier ranges that grow
// with depth. Wands spawn with spells ONE tier below their own, with a recursive 10% chance for the
// projectile to come from a higher tier (so a Mines wand can rarely hold something it cannot afford).
// All times are frames, spread degrees, mana per second.

import { SPELLS, SPELL_LIST } from './spells';
import type { SpellDef, SpellInstance, WandStats } from './types';

export interface GeneratedWand {
  stats: WandStats;
  spells: SpellInstance[];
  alwaysCast: string[];
}

export interface WandGenOptions {
  /** Force the shuffle stat (e.g. false for "No More Shuffle"). */
  shuffle?: boolean;
  /**
   * Guarantee the main projectile is castable (its mana <= the wand's mana max). Without it the wand is
   * Noita-like and may hold a spell it cannot afford (e.g. a Black Hole rolled into a 160-mana wand).
   */
  forceSpells?: boolean;
}

export const MAX_SPELL_TIER = 6;

// ---------------------------------------------------------------------------- small rng helpers

const randInt = (rng: () => number, a: number, b: number): number => a + Math.min(b - a, Math.floor(rng() * (b - a + 1)));
/** Triangular-ish integer in [a, b] (average of two rolls), biased to the middle like Noita's budgets. */
const midInt = (rng: () => number, a: number, b: number): number => {
  const t = (rng() + rng()) / 2;
  return a + Math.min(b - a, Math.floor(t * (b - a + 1)));
};
const pickWeighted = <T>(rng: () => number, items: readonly (readonly [T, number])[]): T => {
  let total = 0;
  for (const [, w] of items) total += Math.max(0, w);
  let r = rng() * total;
  for (const [it, w] of items) {
    r -= Math.max(0, w);
    if (r < 0) return it;
  }
  return items[items.length - 1][0];
};
const seed32 = (rng: () => number): number => Math.floor(rng() * 4294967296) >>> 0;
const clampTier = (tier: number): number => Math.max(0, Math.min(MAX_SPELL_TIER, Math.round(tier)));

// ---------------------------------------------------------------------------- spell picking

/** Weight of a spell at a spawn tier (0 if it does not spawn there). */
export function spawnWeight(def: SpellDef, tier: number): number {
  const i = def.spawnTiers.indexOf(tier);
  return i < 0 ? 0 : (def.spawnWeights[i] ?? 0);
}

/**
 * A random spell id from a spawn tier, weighted by spawn probability (Noita GetRandomAction).
 * If nothing matches `filter` at that tier, lower tiers are tried, then higher ones.
 */
export function randomSpell(rng: () => number, tier: number, filter?: (def: SpellDef) => boolean): string {
  const t0 = clampTier(tier);
  const order: number[] = [t0];
  for (let d = 1; d <= MAX_SPELL_TIER; d++) {
    if (t0 - d >= 0) order.push(t0 - d);
    if (t0 + d <= MAX_SPELL_TIER) order.push(t0 + d);
  }
  for (const t of order) {
    const pool: [string, number][] = [];
    for (const def of SPELL_LIST) {
      if (filter && !filter(def)) continue;
      const w = spawnWeight(def, t);
      if (w > 0) pool.push([def.id, w]);
    }
    if (pool.length > 0) return pickWeighted(rng, pool);
  }
  return 'LIGHT_BULLET';
}

/** Spell types a wand can spawn with (Noita: projectiles, modifiers and multicasts only). */
const isWandProjectile = (d: SpellDef): boolean => d.type === 'projectile' || d.type === 'static';
const isModifier = (d: SpellDef): boolean => d.type === 'modifier';
const isMulticast = (d: SpellDef): boolean => d.type === 'multicast';

const instance = (id: string): SpellInstance => ({ id, uses: SPELLS[id]?.maxUses ?? -1 });

// ---------------------------------------------------------------------------- stats

type BaseStats = Omit<WandStats, 'name' | 'spriteSeed'>;

/** Noita's Mines pre-made wands wand_001..wand_017 (seconds converted to frames). */
export const MINES_WAND_TEMPLATES: readonly BaseStats[] = [
  { shuffle: true, actionsPerRound: 1, castDelay: 2, rechargeTime: 27, manaMax: 220, manaChargeSpeed: 45, capacity: 7, spread: 8, speedMult: 1.034 },
  { shuffle: true, actionsPerRound: 1, castDelay: 2, rechargeTime: 25, manaMax: 250, manaChargeSpeed: 53, capacity: 5, spread: 2, speedMult: 0.982 },
  { shuffle: true, actionsPerRound: 1, castDelay: 2, rechargeTime: 90, manaMax: 180, manaChargeSpeed: 54, capacity: 6, spread: -3, speedMult: 0.995 },
  { shuffle: false, actionsPerRound: 1, castDelay: 23, rechargeTime: 16, manaMax: 190, manaChargeSpeed: 51, capacity: 3, spread: -1, speedMult: 0.934 },
  { shuffle: true, actionsPerRound: 1, castDelay: 6, rechargeTime: 4, manaMax: 210, manaChargeSpeed: 52, capacity: 5, spread: 6, speedMult: 0.825 },
  { shuffle: false, actionsPerRound: 1, castDelay: 13, rechargeTime: 23, manaMax: 250, manaChargeSpeed: 49, capacity: 6, spread: 3, speedMult: 0.986 },
  { shuffle: false, actionsPerRound: 1, castDelay: 26, rechargeTime: 40, manaMax: 170, manaChargeSpeed: 55, capacity: 3, spread: 1, speedMult: 0.955 },
  { shuffle: true, actionsPerRound: 1, castDelay: 10, rechargeTime: 26, manaMax: 160, manaChargeSpeed: 52, capacity: 7, spread: 2, speedMult: 0.988 },
  { shuffle: true, actionsPerRound: 1, castDelay: 3, rechargeTime: 49, manaMax: 160, manaChargeSpeed: 46, capacity: 6, spread: 3, speedMult: 0.854 },
  { shuffle: false, actionsPerRound: 1, castDelay: 3, rechargeTime: 26, manaMax: 210, manaChargeSpeed: 46, capacity: 3, spread: -1, speedMult: 1.056 },
  { shuffle: false, actionsPerRound: 1, castDelay: 20, rechargeTime: 26, manaMax: 250, manaChargeSpeed: 50, capacity: 2, spread: -2, speedMult: 1.024 },
  { shuffle: false, actionsPerRound: 1, castDelay: 14, rechargeTime: 50, manaMax: 250, manaChargeSpeed: 49, capacity: 6, spread: -2, speedMult: 0.996 },
  { shuffle: false, actionsPerRound: 1, castDelay: 4, rechargeTime: 45, manaMax: 220, manaChargeSpeed: 51, capacity: 5, spread: 1, speedMult: 0.97 },
  { shuffle: false, actionsPerRound: 1, castDelay: 6, rechargeTime: 12, manaMax: 210, manaChargeSpeed: 50, capacity: 2, spread: 1, speedMult: 0.988 },
  { shuffle: true, actionsPerRound: 1, castDelay: 24, rechargeTime: 53, manaMax: 170, manaChargeSpeed: 49, capacity: 11, spread: 1, speedMult: 0.905 },
  { shuffle: true, actionsPerRound: 1, castDelay: 26, rechargeTime: 18, manaMax: 750, manaChargeSpeed: 10, capacity: 9, spread: -3, speedMult: 1.077 },
  { shuffle: true, actionsPerRound: 1, castDelay: 2, rechargeTime: 14, manaMax: 190, manaChargeSpeed: 52, capacity: 6, spread: 5, speedMult: 0.988 },
];

interface TierRanges {
  capacity: [number, number];
  /** [spells/cast, weight] */
  actionsPerRound: readonly (readonly [number, number])[];
  castDelay: [number, number];
  rechargeTime: [number, number];
  manaMax: [number, number];
  manaChargeSpeed: [number, number];
  spread: [number, number];
  shuffleChance: number;
}

/** Procedural ranges per wand tier (tier 1 matches the Mines template ranges in research section 1.9). */
const TIER_RANGES: Record<number, TierRanges> = {
  1: { capacity: [2, 8], actionsPerRound: [[1, 1]], castDelay: [2, 26], rechargeTime: [4, 54], manaMax: [160, 250], manaChargeSpeed: [45, 55], spread: [-3, 8], shuffleChance: 0.5 },
  2: { capacity: [3, 10], actionsPerRound: [[1, 0.8], [2, 0.2]], castDelay: [-1, 22], rechargeTime: [3, 50], manaMax: [220, 420], manaChargeSpeed: [70, 160], spread: [-4, 6], shuffleChance: 0.5 },
  3: { capacity: [4, 12], actionsPerRound: [[1, 0.65], [2, 0.25], [3, 0.1]], castDelay: [-4, 18], rechargeTime: [0, 45], manaMax: [300, 560], manaChargeSpeed: [100, 230], spread: [-5, 5], shuffleChance: 0.45 },
  4: { capacity: [5, 14], actionsPerRound: [[1, 0.55], [2, 0.3], [3, 0.15]], castDelay: [-7, 15], rechargeTime: [-3, 40], manaMax: [380, 700], manaChargeSpeed: [140, 300], spread: [-6, 4], shuffleChance: 0.45 },
  5: { capacity: [6, 17], actionsPerRound: [[1, 0.45], [2, 0.3], [3, 0.17], [4, 0.08]], castDelay: [-10, 12], rechargeTime: [-6, 35], manaMax: [480, 880], manaChargeSpeed: [180, 380], spread: [-7, 3], shuffleChance: 0.4 },
  6: { capacity: [7, 20], actionsPerRound: [[1, 0.4], [2, 0.3], [3, 0.2], [4, 0.1]], castDelay: [-13, 10], rechargeTime: [-10, 30], manaMax: [600, 1100], manaChargeSpeed: [230, 480], spread: [-8, 2], shuffleChance: 0.4 },
};

function rollSpeedMult(rng: () => number): number {
  const r = rng();
  if (r < 0.015) return 0.5;
  if (r < 0.03) return 2.0;
  return Math.round((0.8 + rng() * 0.4) * 1000) / 1000;
}

function rollStats(rng: () => number, tier: number): BaseStats {
  if (tier === 1 && rng() < 0.88) {
    return { ...MINES_WAND_TEMPLATES[randInt(rng, 0, MINES_WAND_TEMPLATES.length - 1)] };
  }
  const R = TIER_RANGES[tier];
  const capacity = midInt(rng, R.capacity[0], R.capacity[1]);
  const actionsPerRound = Math.min(capacity, pickWeighted(rng, R.actionsPerRound));
  return {
    shuffle: rng() < R.shuffleChance,
    actionsPerRound,
    castDelay: randInt(rng, R.castDelay[0], R.castDelay[1]),
    // Multicasting wands pay for it with recharge time (Noita's budget trade-off).
    rechargeTime: randInt(rng, R.rechargeTime[0], R.rechargeTime[1]) + 6 * (actionsPerRound - 1),
    manaMax: Math.round(randInt(rng, R.manaMax[0], R.manaMax[1]) / 5) * 5,
    manaChargeSpeed: randInt(rng, R.manaChargeSpeed[0], R.manaChargeSpeed[1]),
    capacity,
    spread: randInt(rng, R.spread[0], R.spread[1]),
    speedMult: rollSpeedMult(rng),
  };
}

// ---------------------------------------------------------------------------- spells

function pickProjectile(rng: () => number, spellTier: number, manaMax: number, force: boolean): string {
  // 10% (repeated) chance to pull the projectile from a higher tier.
  let t = spellTier;
  while (t < MAX_SPELL_TIER && rng() < 0.1) t++;
  let id = randomSpell(rng, t, isWandProjectile);
  if (force) {
    for (let i = 0; i < 16 && (SPELLS[id]?.mana ?? 0) > manaMax; i++) id = randomSpell(rng, spellTier, isWandProjectile);
    if ((SPELLS[id]?.mana ?? 0) > manaMax) id = 'LIGHT_BULLET';
  }
  return id;
}

function fillSpells(rng: () => number, tier: number, stats: BaseStats, force: boolean): SpellInstance[] {
  const cap = stats.capacity;
  const spellTier = Math.max(0, tier - 1);
  const count = randInt(rng, Math.max(1, Math.ceil(cap * 0.4)), cap);
  const main = pickProjectile(rng, spellTier, stats.manaMax, force);

  const front: string[] = [];
  // Sometimes a modifier (or two) in front of the projectiles...
  if (count >= 2 && rng() < 0.3 + 0.03 * tier) {
    front.push(randomSpell(rng, spellTier, isModifier));
    if (count >= 4 && rng() < 0.35) front.push(randomSpell(rng, spellTier, isModifier));
  }
  // ...and sometimes a multicast right before them.
  if (count - front.length >= 3 && rng() < 0.12 + 0.03 * tier) front.push(randomSpell(rng, spellTier, isMulticast));

  const projectileSlots = Math.max(1, count - front.length);
  // Deeper wands occasionally mix in a second projectile type.
  const second = tier >= 3 && projectileSlots >= 3 && rng() < 0.3 ? pickProjectile(rng, spellTier, stats.manaMax, force) : null;
  const ids = [...front];
  for (let i = 0; i < projectileSlots; i++) ids.push(second && i >= Math.ceil(projectileSlots / 2) ? second : main);
  return ids.slice(0, cap).map(instance);
}

/** Generate a wand of the given tier (1 = Mines ... 6 = deepest; 0 is treated as 1). */
export function generateWand(rng: () => number, tier: number, opts: WandGenOptions = {}): GeneratedWand {
  const t = Math.max(1, Math.min(6, Math.round(tier)));
  const base = rollStats(rng, t);
  if (opts.shuffle !== undefined) base.shuffle = opts.shuffle;
  const spells = fillSpells(rng, t, base, opts.forceSpells ?? false);
  // ~5% of wands carry an Always Cast (usually a modifier).
  const alwaysCast: string[] = [];
  if (rng() < 0.05) {
    alwaysCast.push(randomSpell(rng, Math.max(0, t - 1), rng() < 0.75 ? isModifier : isWandProjectile));
  }
  const stats: WandStats = { ...base, name: '', spriteSeed: seed32(rng) };
  stats.name = wandName(stats);
  return { stats, spells, alwaysCast };
}

/** The first starting wand ("Starter Wand", research section 1.9). */
export function starterWand(rng: () => number): GeneratedWand {
  const capacity = randInt(rng, 2, 3);
  const stats: WandStats = {
    name: 'Starter Wand',
    shuffle: false,
    actionsPerRound: 1,
    castDelay: randInt(rng, 9, 15), // 0.15-0.25 s
    rechargeTime: randInt(rng, 20, 28), // 0.33-0.47 s
    manaMax: randInt(rng, 80, 130),
    manaChargeSpeed: randInt(rng, 25, 40),
    capacity,
    spread: 0,
    speedMult: 1,
    spriteSeed: seed32(rng),
  };
  const r = rng();
  const id = r < 0.5 ? 'LIGHT_BULLET' : r < 0.5 + 1 / 6 ? 'RUBBER_BALL' : r < 0.5 + 2 / 6 ? 'SLOW_BULLET' : 'SPITTER';
  const copies = Math.min(capacity, randInt(rng, 1, 3));
  return { stats, spells: Array.from({ length: copies }, () => instance(id)), alwaysCast: [] };
}

/** The second starting wand ("Starter Bomb Wand"): one explosive spell; always a Bomb on the first run. */
export function starterBombWand(rng: () => number, firstRun = false): GeneratedWand {
  const stats: WandStats = {
    name: 'Bomb Wand',
    shuffle: true,
    actionsPerRound: 1,
    castDelay: randInt(rng, 3, 8), // 0.05-0.13 s
    rechargeTime: randInt(rng, 1, 10), // 0.02-0.17 s
    manaMax: randInt(rng, 80, 110),
    manaChargeSpeed: randInt(rng, 5, 20),
    capacity: 1,
    spread: 0,
    speedMult: 1,
    spriteSeed: seed32(rng),
  };
  const id = firstRun
    ? 'BOMB'
    : pickWeighted(rng, [['BOMB', 0.6], ['DYNAMITE', 0.1], ['ROCKET', 0.1], ['MINE', 0.1], ['GRENADE', 0.1]] as const);
  return { stats, spells: [instance(id)], alwaysCast: [] };
}

// ---------------------------------------------------------------------------- names & prices

/** A short descriptive name derived from the stats (deterministic). */
export function wandName(stats: WandStats): string {
  let adj: string;
  if (stats.actionsPerRound >= 3) adj = 'Storm';
  else if (stats.actionsPerRound === 2) adj = 'Twin';
  else if (stats.castDelay <= 4 && stats.rechargeTime <= 20) adj = 'Rapid';
  else if (stats.manaMax >= 600 || stats.manaMax >= stats.manaChargeSpeed * 20) adj = 'Arcane';
  else if (stats.manaChargeSpeed >= 250) adj = 'Thirsting';
  else if (stats.castDelay >= 20) adj = 'Ponderous';
  else if (stats.shuffle) adj = 'Wild';
  else adj = 'Steady';
  const c = stats.capacity;
  const noun = c <= 3 ? 'Wand' : c <= 6 ? 'Rod' : c <= 10 ? 'Staff' : c <= 15 ? 'Sceptre' : 'Greatstaff';
  return `${adj} ${noun}`;
}

/** Holy Mountain spell price at a shop tier (Noita: base price * 0.3 + 70 per level, rounded to 10). */
export function spellPrice(id: string, tier: number): number {
  const base = SPELLS[id]?.price ?? 100;
  return Math.max(10, Math.floor((base * 0.3 + 70 * Math.max(0, tier)) / 10) * 10);
}

/** Shop price of a wand from its stats (heuristic value of everything that makes a wand good). */
export function wandPrice(stats: WandStats): number {
  let v = 0;
  v += stats.capacity * 20;
  v += (stats.actionsPerRound - 1) * 90;
  v += stats.manaMax * 0.25;
  v += stats.manaChargeSpeed * 0.6;
  v += stats.shuffle ? 0 : 60;
  v += Math.max(0, 30 - stats.castDelay) * 2;
  v += Math.max(0, 60 - stats.rechargeTime) * 1.5;
  v -= Math.max(0, stats.spread) * 3;
  return Math.max(50, Math.round(v / 10) * 10);
}
