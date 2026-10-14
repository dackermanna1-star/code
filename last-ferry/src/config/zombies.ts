// The horde (DESIGN.md §8). Life, speed (m/s), bounty ($), head multiplier,
// and the footprint / height the logic uses for contacts and screen edges.
import type { ZombieKind } from './ids';

export interface ZombieDef {
  kind: ZombieKind;
  /** Display name (game-over line, debug). */
  name: string;
  /** Life in chapter 1, and the increase per chapter after the first. */
  life: number;
  lifeInc: number;
  /** Walking speed range (m/s). */
  speed: [number, number];
  bounty: number;
  /** Damage multiplier for head hits. */
  headMult: number;
  /** Half extent along x / z of the standing body (contacts, spawn/escape edges). */
  halfLength: number;
  halfDepth: number;
  /** Standing height (m). */
  height: number;
  /** Hunter damage per second while grabbing. */
  grabDps: number;
  /** Can rise again as a crawler after an ordinary 'down' death. */
  rises: boolean;
  /** Slowed / tripped by corpses. */
  slowedByCorpses: boolean;
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  shambler: {
    kind: 'shambler', name: 'Shambler', life: 70, lifeInc: 15, speed: [1.1, 1.6], bounty: 20, headMult: 3,
    halfLength: 0.32, halfDepth: 0.3, height: 1.78, grabDps: 18, rises: true, slowedByCorpses: true,
  },
  jogger: {
    kind: 'jogger', name: 'Jogger', life: 50, lifeInc: 10, speed: [4.5, 5.5], bounty: 40, headMult: 3,
    halfLength: 0.38, halfDepth: 0.28, height: 1.76, grabDps: 18, rises: true, slowedByCorpses: true,
  },
  bloater: {
    kind: 'bloater', name: 'Bloater', life: 160, lifeInc: 30, speed: [0.55, 0.7], bounty: 90, headMult: 2,
    halfLength: 0.62, halfDepth: 0.55, height: 1.95, grabDps: 18, rises: false, slowedByCorpses: true,
  },
  medic: {
    kind: 'medic', name: 'Paramedic', life: 60, lifeInc: 12, speed: [1.3, 1.3], bounty: 50, headMult: 3,
    halfLength: 0.32, halfDepth: 0.3, height: 1.8, grabDps: 18, rises: true, slowedByCorpses: true,
  },
  patient: {
    kind: 'patient', name: 'Patient', life: 70, lifeInc: 14, speed: [1.0, 1.15], bounty: 30, headMult: 3,
    halfLength: 0.32, halfDepth: 0.3, height: 1.74, grabDps: 18, rises: true, slowedByCorpses: true,
  },
  riot: {
    kind: 'riot', name: 'Riot brute', life: 400, lifeInc: 0, speed: [0.8, 0.8], bounty: 200, headMult: 3,
    halfLength: 0.5, halfDepth: 0.45, height: 1.95, grabDps: 24, rises: false, slowedByCorpses: true,
  },
  bigdave: {
    kind: 'bigdave', name: 'Big Dave', life: 2500, lifeInc: 0, speed: [0.55, 0.55], bounty: 1000, headMult: 2,
    halfLength: 1.05, halfDepth: 0.9, height: 3.0, grabDps: 30, rises: false, slowedByCorpses: false,
  },
};

/** Danger money: ordinary bounties grow this much per chapter after the first (ch.2 ×1.25, ch.3 ×1.5). */
export const BOUNTY_PER_CHAPTER = 0.25;
export const chapterBounty = (base: number, chapter: number) => Math.round(base * (1 + BOUNTY_PER_CHAPTER * Math.max(0, chapter - 1)));

/** Riot armour hit points (DESIGN §8). */
export const RIOT_PLATES = { helmet: 120, shield: 300, chest: 150 };
/** The Riot Squad (chapter 3 boss): the brutes' life and plates are multiplied. */
export const RIOT_SQUAD = { lifeMult: 5, plateMult: 2, speed: 1.15 };
/** Bosses' bounty overrides. */
export const BOSS_BOUNTY = { riot: 800, marathonMedal: 500 };

/** Big Dave (chapter 1 boss). */
export const BIG_DAVE = {
  belchEvery: 5,
  belchSeconds: 1.0,
  /** Gas lands this far ahead of him, in his lane. */
  belchAhead: 4,
  enrageAt: 0.5,
  enrageSeconds: 1.2,
  enragedSpeed: 0.9,
  popGasRadius: 4,
  popCrawlers: 6,
  /** His crawlers spill out behind him (−x, away from the gangway), slow. */
  crawlersBehind: 2.2,
  crawlerSpeed: [0.4, 0.55] as [number, number],
};

/**
 * The Marathon (chapter 2 boss): waves of joggers. They run at marathon pace
 * (slower than the sprinting joggers of the spawn phase), tuned with the bot.
 */
export const MARATHON = {
  total: 40,
  /** Pace groups: 4–6 runners bunched in one or two neighbouring lanes (line them up: kebabs, knock-back). */
  group: [4, 5] as [number, number],
  groupEvery: 3.5,
  /** Lanes of a group: centre ± this (m). */
  laneSpread: 0.75,
  pace: [3.5, 4.3] as [number, number],
  bounty: 30,
};

/** Paramedic team geometry: medics this far ahead / behind the stretcher centre. */
export const STRETCHER = { medicOffset: 1.15, height: 0.85, halfLength: 0.95, dropGetUp: 1.5 };
