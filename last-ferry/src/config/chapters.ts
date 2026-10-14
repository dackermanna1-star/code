// Chapters (DESIGN.md §9).

/** What a spawn track produces ('medics' = a paramedic team of three). */
export type SpawnKind = 'shambler' | 'jogger' | 'bloater' | 'medics' | 'riot';
export type BossKind = 'bigdave' | 'marathon' | 'riotsquad';

export interface ChapterDef {
  num: number;
  name: string;
  /** Clock shown on the chapter splash. */
  clock: string;
  /** Length of the spawn phase (s). */
  spawnSeconds: number;
  spawns: Array<[SpawnKind, number]>;
  boss: BossKind;
  bossName: string;
  /** The boss only arrives when the field is clear (or after `aloneTimeout` s). */
  bossAlone: boolean;
  /** Survivors boarding during the spawn phase (the level bar). */
  passengers: number;
  /** Rise delay range for downed bodies (s). */
  riseDelay: [number, number];
  /** timeOfDay range covered by the spawn phase. */
  timeOfDay: [number, number];
  /** Ordinary spawns that keep coming while the boss is alive: [kind, mean gap seconds]. */
  bossEscort: Array<[SpawnKind, number]>;
}

export const CHAPTERS: ChapterDef[] = [
  {
    num: 1, name: 'Last Light', clock: '18:40', spawnSeconds: 75,
    spawns: [['shambler', 48], ['bloater', 4], ['medics', 2]],
    boss: 'bigdave', bossName: 'Big Dave', bossAlone: false, passengers: 48,
    riseDelay: [9, 15], timeOfDay: [0, 0.3], bossEscort: [['shambler', 4.5]],
  },
  {
    num: 2, name: 'Blue Hour', clock: '19:25', spawnSeconds: 90,
    spawns: [['shambler', 40], ['jogger', 14], ['bloater', 4], ['medics', 3]],
    boss: 'marathon', bossName: 'The Marathon', bossAlone: true, passengers: 60,
    riseDelay: [7, 13], timeOfDay: [0.33, 0.62], bossEscort: [],
  },
  {
    num: 3, name: 'Lights Out', clock: '21:10', spawnSeconds: 100,
    spawns: [['shambler', 58], ['jogger', 28], ['bloater', 6], ['medics', 3], ['riot', 3]],
    boss: 'riotsquad', bossName: 'The Riot Squad', bossAlone: false, passengers: 72,
    riseDelay: [5, 9], timeOfDay: [0.66, 1], bossEscort: [['shambler', 1.7], ['jogger', 2.3], ['bloater', 15]],
  },
];

/** Seconds the chapter title is shown before spawning starts. */
export const SPLASH_SECONDS = 2.5;
/** A chapter ends this long after its bosses die. */
export const BETWEEN_SECONDS = 3;
/** "Boss alone": the boss comes anyway this long after the spawn phase if the field never clears. */
export const BOSS_ALONE_TIMEOUT = 25;
/**
 * The horde comes in surges: a spawn of one of these kinds sometimes brings a
 * pack (taken from the same schedule, so totals are unchanged, the gaps after
 * it just get longer). Pack members arrive `gap` seconds apart.
 */
export const PACKS: Partial<Record<SpawnKind, { chance: number; size: [number, number]; gap: [number, number] }>> = {
  shambler: { chance: 0.4, size: [2, 4], gap: [0.25, 1.1] },
  jogger: { chance: 0.3, size: [2, 3], gap: [0.3, 0.8] },
};

/** The Riot Squad's formation lanes. */
export const RIOT_SQUAD_Z = [-3, 0, 3];
