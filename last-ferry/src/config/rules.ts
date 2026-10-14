// Game-rule tunables (DESIGN.md §4–§6, §10). Seconds, metres, dollars.

/** §4.1 "Not dead till the head's gone". */
export const REANIMATION = {
  /** Twitching lasts this long before the body rises. */
  twitchSeconds: 2,
  /** 'rise' state (lying → crawling). */
  riseSeconds: 1.6,
  crawlerLifeFrac: 0.35,
  crawlerMinLife: 20,
  crawlSpeed: [0.55, 0.75] as [number, number],
  crawlerBounty: 15,
  /** Nails in a downed body that pin it for good. */
  nailsToPin: 3,
  /** Crawler standing height (low profile). */
  crawlerHeight: 0.55,
};

/** §4.2 Corpses are terrain. */
export const BARRICADE = {
  /** Grid cell size and the pile limit per cell. */
  cell: 0.75,
  perCell: 3,
  /** speed × 1 / (1 + slowK · n), n = corpses within `ahead` m ahead in the lane, capped at maxN. */
  slowK: 0.45,
  maxN: 4,
  ahead: 0.75,
  laneHalf: 0.42,
  /** Joggers: chance to trip per new corpse underfoot; seconds on the ground. */
  tripChance: 0.35,
  tripSeconds: 0.9,
  /** A killing blow pushes the body at most this far. */
  pushMax: 1.2,
  /** Explosions shove bodies at most this far. */
  blastShove: 2,
  /** Bodies past this |z| fall into the sea. */
  seaZ: 6.05,
};

/** §5 Fire. */
export const FIRE = {
  burnSeconds: 4,
  dps: 12,
  panicSpeed: 1.4,
  spreadRadius: 0.9,
  spreadPerSecond: 0.25,
  corpseRadius: 0.75,
  corpsePerSecond: 0.4,
  /** A burning corpse ignites zombies walking over it (radius, chance per second). */
  corpseToZombieRadius: 0.6,
  corpseToZombiePerSecond: 0.6,
  corpseAshSeconds: 6,
  /** A flare on the deck. */
  deckSeconds: 8,
  deckRadius: 1.1,
  /** Hunter damage per second standing in fire / held by a burning zombie. */
  hunterDps: 10,
};

/** §5 Gas. */
export const GAS = {
  radius: 2.5,
  seconds: 4,
  hunterDps: 15,
  explosionRadius: 3.5,
  explosionDamage: 150,
};

/** §4.3 The pier fights back. */
export const HORN = { stagger: 2.0, bossStagger: 1.0, crawlerPush: 1.0, shake: 0.3 };

export const FAVOUR = { max: 100, kill: 2, headshot: 3, nice: 15, tidy: 5 };

export const CANNON = {
  shells: 3,
  interval: 0.35,
  radius: 3,
  damage: 400,
  /** Targets: zombies left of the hunter within this many metres of his lane. */
  laneBand: 2,
  /** Shell flight time from the ferry's deck gun (s) and its muzzle. */
  flight: 0.75,
  gun: { x: 26, y: 7.5, z: 0.5 },
};

/** Explosions: the inner fraction of the radius gibs; the hunter takes this share of the damage (capped). */
export const BLAST = { gibInner: 0.6, hunterShare: 0.25, hunterMax: 40, zombieShove: 1.5 };

/** §6 Hunter & economy. */
export const HUNTER_RULES = {
  /** A zombie grabs when it reaches the hunter in his lane. */
  grabReachZ: 0.5,
  grabHoldX: 1.0,
  grabHoldZ: 0.75,
  /** Movement while held. */
  grabbedSpeed: 0.4,
  /** Grabbers shove the hunter toward the ferry (m/s each). */
  grabShove: 0.25,
  /** Jumping kicks grabbers off: pushed back and staggered. */
  shakeOffPush: 0.7,
  shakeOffStagger: 0.6,
  /** Crawler bite while the hunter can't kick it. */
  crawlerBiteDps: 8,
  /** Kick: crawler damage and knock-back. */
  kickDamage: 60,
  kickPush: 1.5,
  kickSeconds: 0.3,
  /** Landing ('stomp' state) and stomp reach. */
  stompSeconds: 0.22,
  stompReachX: 0.85,
  stompReachZ: 0.6,
  /** How often accumulated damage-over-time is reported as playerHurt (s). */
  hurtReportSeconds: 0.2,
};

export const MONEY = { headshotBonus: 15, niceBase: 25, tidy: 5 };

/** §10 Feel: hit-stop, slow motion, shake requested by the rules. */
export const FEEL = {
  hitstopHeadshot: 45,
  hitstopKebab: 70,
  niceSlowmo: { scale: 0.35, seconds: 0.6 },
  bossSlowmo: { scale: 0.25, seconds: 1.2 },
  hornShake: 0.3,
  craneShake: 0.35,
  /** Explosion shake = k · radius / (1 + distance / falloff). */
  blastShakeK: 0.12,
  blastShakeFalloff: 6,
};

/** Shotgun knock-back stagger (s). */
export const KNOCKBACK_STAGGER = 0.4;
/** Zombies groan every this many seconds (random in range) while on screen. */
export const GROAN_SECONDS: [number, number] = [4, 11];
