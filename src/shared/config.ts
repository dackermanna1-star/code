/**
 * World rules, chosen when a world is created and stored with it.
 * Gameplay systems read from this object, never from hard-coded constants,
 * so balance can be tuned without code changes. (The simulation is structured as an
 * integrated server; see docs/ARCHITECTURE.md.)
 */
export interface WorldConfig {
  /** World seed. String seeds are hashed. */
  seed: string;
  /** Allow cheat commands (/give, /time, /tp ...). Chosen when the world is created. */
  cheats: boolean;
  /** Autosave interval (seconds). */
  saveIntervalSec: number;
  /** Chunk streaming radius (chunks). */
  viewDistance: number;
  /** Entities within this many blocks are replicated to the renderer. */
  entityRange: number;
  /** Max milliseconds per simulation tick spent generating new chunks. */
  genBudgetMs: number;
  /** Real minutes for a full day/night cycle. */
  dayLengthMin: number;
  /** Fraction of the cycle that is night. */
  nightFraction: number;
  /** Multiplier on gathered resources. */
  gatherRate: number;
  /** Multiplier on crafting speed (2 = twice as fast). */
  craftSpeed: number;
  /** Multiplier on survival stat drain. */
  metabolismRate: number;
  lootRespawnMin: number;
  corpseLifetimeSec: number;
  bagCooldownSec: number;
  /** Respawning at a bag resets other bags within this radius (blocks). */
  bagResetRange: number;
  /** Minutes after placement during which an owner may demolish a piece. */
  demolishWindowMin: number;
  /** Seconds after taking damage before a piece can be repaired. */
  repairBlockSec: number;
  decay: { enabled: boolean; scale: number };
  upkeep: { enabled: boolean; periodSec: number };
  /** Items given on every spawn. */
  startItems: Array<[string, number]>;
  /** Animals kept alive around the player. */
  animalDensity: number;
  /** Hostile NPC scavengers at points of interest. */
  hostileNpcs: boolean;
}

export const DEFAULT_CONFIG: WorldConfig = {
  seed: 'corrode',
  cheats: false,
  saveIntervalSec: 60,
  viewDistance: 7,
  entityRange: 112,
  genBudgetMs: 25,
  dayLengthMin: 40,
  nightFraction: 0.3,
  gatherRate: 1,
  craftSpeed: 1,
  metabolismRate: 1,
  lootRespawnMin: 20,
  corpseLifetimeSec: 900,
  bagCooldownSec: 300,
  bagResetRange: 50,
  demolishWindowMin: 10,
  repairBlockSec: 30,
  decay: { enabled: true, scale: 1 },
  upkeep: { enabled: true, periodSec: 60 },
  startItems: [['rock', 1], ['torch', 1], ['bandage', 1]],
  animalDensity: 1,
  hostileNpcs: true,
};

export function mergeConfig(base: WorldConfig, over: Partial<WorldConfig>): WorldConfig {
  const out: WorldConfig = { ...base, ...over } as WorldConfig;
  out.decay = { ...base.decay, ...(over.decay ?? {}) };
  out.upkeep = { ...base.upkeep, ...(over.upkeep ?? {}) };
  return out;
}

/** The subset of config the client needs. */
export interface ClientRules {
  dayLengthMin: number;
  nightFraction: number;
  viewDistance: number;
  cheats: boolean;
}
