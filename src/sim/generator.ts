import { ASPECTS, ASPECT_PALETTES, hueDistance, type AspectId } from '../core/ids';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { generateArena, type ArenaDef } from './arena';
import type { AbilityId, AbilitySlot, AccessoryId, FighterDef, PersonalityId, Side, Traits, WeaponId } from './types';
import { WEAPON_IDS } from './weapons';

/**
 * Battle generation.
 *
 * FAIRNESS: both fighters are drawn independently from the *same* distribution, and any pair
 * constraint (distinct colours, distinct names) is applied by symmetric rejection sampling of the
 * whole pair. Which fighter starts on the left is an independent coin flip. The two fighters are
 * therefore exchangeable, which makes P(fighter A wins) = P(fighter B wins) = 1/2 exactly, before
 * the fight begins, for any seed distribution — independent of the simulation details.
 */

export const ABILITY_POOLS: Record<AbilitySlot, readonly AbilityId[]> = {
  mobility: ['phantomStep', 'flashCut', 'voidGate', 'galeAscent', 'mirage'],
  ranged: ['barrage', 'crescentWave', 'seekerOrbs', 'starfall', 'thunderJudgment', 'spikeEruption', 'gravityOrb'],
  special: ['annihilationBeam', 'bindingChains', 'dimensionRend', 'titanSlam', 'bladeStorm', 'chronoStop'],
  defense: ['aegis', 'mirrorWard', 'counterStance', 'phaseShift', 'chronoRewind', 'secondWind'],
  ultimate: ['ascension', 'thousandCuts', 'supernova', 'heavensLance', 'blackHole', 'colossus', 'cataclysm'],
};

export const PERSONALITIES: readonly PersonalityId[] = ['berserker', 'duelist', 'trickster', 'tactician', 'sentinel', 'zealot'];

export const PERSONALITY_INFO: Record<PersonalityId, { name: string; blurb: string; base: Traits }> = {
  berserker: {
    name: 'Berserker', blurb: 'Relentless pressure; trades blows gladly.',
    base: { aggression: 0.8, patience: 0.28, risk: 0.6, trickery: 0.3, zoning: 0.15, defense: 0.5, adaptivity: 0.55, reaction: 8, precision: 0.82, temperature: 0.42 },
  },
  duelist: {
    name: 'Duelist', blurb: 'Precise footwork, deadly parries.',
    base: { aggression: 0.6, patience: 0.6, risk: 0.45, trickery: 0.4, zoning: 0.25, defense: 0.68, adaptivity: 0.6, reaction: 9, precision: 0.66, temperature: 0.4 },
  },
  trickster: {
    name: 'Trickster', blurb: 'Feints, vanishing acts and cruel mix-ups.',
    base: { aggression: 0.6, patience: 0.45, risk: 0.45, trickery: 0.95, zoning: 0.4, defense: 0.55, adaptivity: 0.6, reaction: 8, precision: 0.8, temperature: 0.45 },
  },
  tactician: {
    name: 'Tactician', blurb: 'Studies every habit, then exploits it.',
    base: { aggression: 0.5, patience: 0.75, risk: 0.4, trickery: 0.55, zoning: 0.45, defense: 0.6, adaptivity: 0.95, reaction: 9, precision: 0.72, temperature: 0.35 },
  },
  sentinel: {
    name: 'Sentinel', blurb: 'An immovable wall that punishes every mistake.',
    base: { aggression: 0.44, patience: 0.68, risk: 0.3, trickery: 0.25, zoning: 0.35, defense: 0.7, adaptivity: 0.55, reaction: 9, precision: 0.58, temperature: 0.42 },
  },
  zealot: {
    name: 'Zealot', blurb: 'Rains divine fire from afar; hates being cornered.',
    base: { aggression: 0.48, patience: 0.55, risk: 0.5, trickery: 0.45, zoning: 0.9, defense: 0.58, adaptivity: 0.6, reaction: 8, precision: 0.78, temperature: 0.42 },
  },
};

const ACCESSORIES: readonly AccessoryId[] = ['scarf', 'ponytail', 'headband', 'cape', 'horns', 'halo', 'longhair'];

const NAME_START = ['Ka', 'Vy', 'Az', 'So', 'Tha', 'Ny', 'Ish', 'Ze', 'Ar', 'Kyr', 'Eli', 'Ra', 'Xa', 'Ul', 'Ser', 'Va', 'Dra', 'Io', 'Ae', 'Bel', 'Cy', 'Lu', 'Or', 'Sy', 'Tor', 'Vel', 'Yr', 'Mae', 'Riv', 'Zan', 'Hal', 'Fen', 'Jor', 'Kae', 'Nim', 'Oph', 'Quel', 'Sar'];
const NAME_MID = ['', '', '', 'e', 'a', 'o', 'i', 'ri', 'va', 'th', 'ra', 'lo', 'an', 'el', 'ar', 'is', 'ze', 'ny'];
const NAME_END = ['lith', 'ros', 'rel', 'ryn', 'lor', 'xa', 'ven', 'ius', 'ael', 'ra', 'ion', 'eth', 'or', 'an', 'is', 'yx', 'orn', 'iel', 'ash', 'ex', 'ira', 'ul', 'oth', 'ys', 'en', 'kai', 'vos', 'dris', 'mir', 'nar'];

const TITLE_ADJ: Record<AspectId, string[]> = {
  inferno: ['Ashen', 'Burning', 'Cinderborn', 'Blazing', 'Emberheart', 'Scorched'],
  radiance: ['Radiant', 'Golden', 'Dawnlit', 'Gleaming', 'Sunforged', 'Haloed'],
  verdant: ['Verdant', 'Thornbound', 'Evergreen', 'Wildheart', 'Bloomsworn', 'Rootborn'],
  frost: ['Glacial', 'Rimeborn', 'Pale', 'Winterbound', 'Frozen', 'Snowveiled'],
  tempest: ['Thundering', 'Stormwreathed', 'Howling', 'Galeborn', 'Skyrending', 'Voltaic'],
  void: ['Hollow', 'Starless', 'Abyssal', 'Silent', 'Umbral', 'Nameless'],
  chrono: ['Timeless', 'Eternal', 'Unwound', 'Everlasting', 'Hourless', 'Echoing'],
};
const TITLE_NOUN: Record<PersonalityId, string[]> = {
  berserker: ['Ravager', 'Fury', 'Juggernaut', 'Warbringer', 'Destroyer', 'Wrath'],
  duelist: ['Blade', 'Sword-Saint', 'Duelist', 'Edge', 'Swordmaster', 'Fencer'],
  trickster: ['Trickster', 'Phantom', 'Mirage', 'Jester', 'Shade', 'Deceiver'],
  tactician: ['Strategist', 'Oracle', 'Architect', 'Sage', 'Mind', 'Seer'],
  sentinel: ['Bulwark', 'Warden', 'Sentinel', 'Aegis', 'Guardian', 'Rampart'],
  zealot: ['Herald', 'Zealot', 'Invoker', 'Prophet', 'Conduit', 'Psalm'],
};
const TITLE_PLACE: Record<AspectId, string[]> = {
  inferno: ['the Last Ember', 'the Burning Throne', 'the Ninth Pyre', 'Ten Thousand Fires'],
  radiance: ['the First Dawn', 'the Gilded Gate', 'the Unsetting Sun', 'the Seventh Halo'],
  verdant: ['the World-Root', 'the Endless Grove', 'the Thorned Crown', 'the Green Silence'],
  frost: ['the White Silence', 'the Frozen Crown', 'the Long Winter', 'the Glass Sea'],
  tempest: ['the Shattered Sky', 'the Thousand Storms', 'the Thunder Throne', 'the Howling Peak'],
  void: ['the Hollow Star', 'the Silent Abyss', 'the Unlit Path', 'the Space Between'],
  chrono: ['the Broken Hour', 'the Last Second', 'the Eternal Moment', 'the Unwound Clock'],
};
const TITLE_ROLE: Record<PersonalityId, string[]> = {
  berserker: ['Breaker', 'Butcher-King', 'Devourer', 'Scourge'],
  duelist: ['Champion', 'Blade', 'Swordbearer', 'Duelist'],
  trickster: ['Thief', 'Liar', 'Ghost', 'Masque'],
  tactician: ['Keeper', 'Reader', 'Architect', 'Watcher'],
  sentinel: ['Warden', 'Shield', 'Keeper', 'Wall'],
  zealot: ['Herald', 'Voice', 'Hand', 'Flame'],
};

function makeName(rng: Rng): string {
  for (let i = 0; i < 20; i++) {
    const n = rng.pick(NAME_START) + rng.pick(NAME_MID) + rng.pick(NAME_END);
    if (n.length >= 4 && n.length <= 9 && !/(.)\1\1/.test(n)) return n;
  }
  return 'Kaelith';
}

function makeTitle(rng: Rng, aspect: AspectId, p: PersonalityId): string {
  if (rng.chance(0.55)) return `the ${rng.pick(TITLE_ADJ[aspect])} ${rng.pick(TITLE_NOUN[p])}`;
  return `${rng.pick(TITLE_ROLE[p])} of ${rng.pick(TITLE_PLACE[aspect])}`;
}

function makeTraits(rng: Rng, p: PersonalityId): Traits {
  const b = PERSONALITY_INFO[p].base;
  const j = (v: number, amt = 0.08) => clamp(v + rng.range(-amt, amt), 0.05, 1);
  return {
    aggression: j(b.aggression),
    patience: j(b.patience),
    risk: j(b.risk),
    trickery: j(b.trickery),
    zoning: j(b.zoning),
    defense: j(b.defense),
    adaptivity: j(b.adaptivity),
    reaction: Math.round(clamp(b.reaction + rng.range(-0.6, 0.6), 7, 11)),
    precision: j(b.precision, 0.05),
    temperature: clamp(b.temperature + rng.range(-0.08, 0.08), 0.2, 0.8),
  };
}

export function generateFighter(rng: Rng): FighterDef {
  const aspect = rng.pick(ASPECTS);
  const personality = rng.pick(PERSONALITIES);
  const weapon: WeaponId = rng.pick(WEAPON_IDS);
  const abilities = {
    mobility: rng.pick(ABILITY_POOLS.mobility),
    ranged: rng.pick(ABILITY_POOLS.ranged),
    special: rng.pick(ABILITY_POOLS.special),
    defense: rng.pick(ABILITY_POOLS.defense),
    ultimate: rng.pick(ABILITY_POOLS.ultimate),
  };
  return {
    name: makeName(rng),
    title: makeTitle(rng, aspect, personality),
    aspect,
    weapon,
    personality,
    abilities,
    accessory: rng.pick(ACCESSORIES),
    traits: makeTraits(rng, personality),
    styleSeed: rng.nextU32(),
  };
}

export interface BattleSetup {
  seed: number;
  fighters: [FighterDef, FighterDef];
  /** Which side (x sign) each fighter starts on: -1 = left, 1 = right. */
  startSide: [-1 | 1, -1 | 1];
  arena: ArenaDef;
  /** Seeds for each fighter's private decision stream and the world stream. */
  rngSeeds: { world: number; brains: [number, number] };
}

/** Symmetric pair constraint: readable colours and distinct names. */
function pairOk(a: FighterDef, b: FighterDef, rng: Rng): boolean {
  if (a.aspect === b.aspect) return false;
  if (hueDistance(ASPECT_PALETTES[a.aspect].hue, ASPECT_PALETTES[b.aspect].hue) < 60) return false;
  if (a.name === b.name) return false;
  // Prefer different weapons, but allow mirror weapons sometimes (symmetric rule).
  if (a.weapon === b.weapon && rng.chance(0.65)) return false;
  return true;
}

export function createBattle(seed: number, overrides?: Partial<{ fighters: [FighterDef, FighterDef] }>): BattleSetup {
  const rng = new Rng(seed);
  const genRng = rng.fork('fighters');
  let a: FighterDef, b: FighterDef;
  if (overrides?.fighters) {
    [a, b] = overrides.fighters;
  } else {
    let guard = 0;
    do {
      a = generateFighter(genRng);
      b = generateFighter(genRng);
      guard++;
    } while (!pairOk(a, b, genRng) && guard < 200);
  }
  const arena = generateArena(rng.fork('arena'));
  const leftIs0 = rng.chance(0.5);
  const startSide: [-1 | 1, -1 | 1] = leftIs0 ? [-1, 1] : [1, -1];
  return {
    seed,
    fighters: [a, b],
    startSide,
    arena,
    rngSeeds: { world: rng.nextU32(), brains: [rng.nextU32(), rng.nextU32()] },
  };
}

/** The other side. */
export const other = (s: Side): Side => (s === 0 ? 1 : 0);
