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
  /** Per-chapter override of KIND_FROM (fraction of the spawn phase a kind starts at). */
  from?: Partial<Record<SpawnKind, number>>;
}

export const CHAPTERS: ChapterDef[] = [
  {
    num: 1, name: 'Last Light', clock: '18:40', spawnSeconds: 75,
    spawns: [['shambler', 64], ['jogger', 11], ['bloater', 5], ['medics', 2]],
    boss: 'bigdave', bossName: 'Big Dave', bossAlone: false, passengers: 48,
    riseDelay: [9, 15], timeOfDay: [0, 0.3], bossEscort: [['shambler', 3.2], ['jogger', 6]],
    // A taste of what's coming: the first joggers in the last stretch.
    from: { jogger: 0.5 },
  },
  {
    num: 2, name: 'Blue Hour', clock: '19:25', spawnSeconds: 90,
    spawns: [['shambler', 52], ['jogger', 32], ['bloater', 5], ['medics', 3]],
    boss: 'marathon', bossName: 'The Marathon', bossAlone: true, passengers: 60,
    riseDelay: [7, 13], timeOfDay: [0.33, 0.62], bossEscort: [],
  },
  {
    num: 3, name: 'Lights Out', clock: '21:10', spawnSeconds: 100,
    spawns: [['shambler', 64], ['jogger', 40], ['bloater', 6], ['medics', 3], ['riot', 6]],
    boss: 'riotsquad', bossName: 'The Riot Squad', bossAlone: false, passengers: 72,
    riseDelay: [5, 9], timeOfDay: [0.66, 1], bossEscort: [['shambler', 1.7], ['jogger', 2.3], ['bloater', 15]],
  },
];

/**
 * Mop-up: after the bosses the pier is held once no zombie that could reach the
 * gangway is left. Crawlers further back than this x don't count: they can't
 * crawl that far during the break (BETWEEN + SPLASH) and carry over into the
 * next chapter like the bodies do.
 */
export const MOPUP_CRAWLER_X = 2;
/** Seconds the chapter title is shown before spawning starts. */
export const SPLASH_SECONDS = 2.5;
/** A chapter ends this long after the pier is clear (bosses dead and the stragglers mopped up). */
export const BETWEEN_SECONDS = 3;
/** "Boss alone": the boss comes anyway this long after the spawn phase if the field never clears. */
export const BOSS_ALONE_TIMEOUT = 25;
/**
 * A crescendo: each chapter's schedule is built when it starts, spawn times
 * drawn from a density that rises through the spawn phase,
 * ∝ base + slope · u (u = 0 … 1 of the phase), with each spawn jittered within
 * its slot. The last stretch is the busiest and the boss lands on the peak.
 */
export const RAMP = { base: 0.3, slope: 1.6, jitter: 0.35 };
/** Kinds that only start turning up part-way through the spawn phase (fraction of it). */
export const KIND_FROM: Partial<Record<SpawnKind, number>> = { jogger: 0.08, medics: 0.15, bloater: 0.2, riot: 0.35 };
/**
 * Surges: from `from` of the phase on, a spawn of one of these kinds may pull
 * the next few of its kind into a pack (centred on their mean time, so the
 * crescendo keeps its shape and totals are unchanged). The chance grows from
 * chance[0] at `from` to chance[1] at the end. Members arrive `gap` s apart.
 */
export const PACKS: Partial<Record<SpawnKind, { from: number; chance: [number, number]; size: [number, number]; gap: [number, number] }>> = {
  shambler: { from: 0.3, chance: [0.2, 0.65], size: [2, 4], gap: [0.25, 1.1] },
  jogger: { from: 0.25, chance: [0.3, 0.8], size: [2, 4], gap: [0.3, 0.8] },
};

/** The Riot Squad's formation lanes. */
export const RIOT_SQUAD_Z = [-3, 0, 3];

/** Money for a game that starts at a later chapter (debug / ?chapter=N / sims): about what a run has by then. */
export const CHAPTER_START_MONEY = [0, 0, 3000, 12000];
