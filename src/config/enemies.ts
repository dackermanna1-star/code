// Enemy table from the original game data (py-sealhunter ENEMIES).
// life = base + perLevel * levelNumber. Speeds are original px/tick and are
// converted to m/s by the enemy code (SPD_X / SPD_Z).

export type EnemyType = 'seal' | 'fatseal' | 'activist' | 'cub' | 'penguin' | 'bear' | 'turtle' | 'walrus';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  life: [base: number, perLevel: number];
  bossLife?: number;
  /** px/tick, random in range. */
  speed: [number, number];
  bounty: number;
  bossBonus: number;
  headshotBonus: number;
  headshotMultiplier: number;
  /** Knocks the hunter down on contact. */
  canPress: boolean;
  /** Half extents of the ground footprint (m): along x, along depth. */
  halfLength: number;
  halfDepth: number;
  /** Overall height (m), used for sorting and effects. */
  height: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  seal: {
    type: 'seal', name: 'Brown seal', life: [26, 21], speed: [0.5, 1.1],
    bounty: 50, bossBonus: 0, headshotBonus: 10, headshotMultiplier: 2, canPress: false,
    halfLength: 0.62, halfDepth: 0.32, height: 1.15,
  },
  fatseal: {
    type: 'fatseal', name: 'Fat seal', life: [0, 250], bossLife: 1250, speed: [0.7, 0.7],
    bounty: 200, bossBonus: 200, headshotBonus: 0, headshotMultiplier: 1.5, canPress: true,
    halfLength: 1.45, halfDepth: 0.85, height: 1.75,
  },
  activist: {
    type: 'activist', name: 'Activist', life: [30, 35], speed: [1.1, 2.0],
    bounty: 100, bossBonus: 0, headshotBonus: 15, headshotMultiplier: 2, canPress: false,
    halfLength: 0.4, halfDepth: 0.3, height: 1.85,
  },
  cub: {
    type: 'cub', name: 'Seal cub', life: [10, 5], speed: [0.44, 0.74],
    bounty: 25, bossBonus: 0, headshotBonus: 0, headshotMultiplier: 1, canPress: true,
    halfLength: 0.45, halfDepth: 0.25, height: 0.5,
  },
  penguin: {
    type: 'penguin', name: 'Penguin', life: [0, 25], speed: [0.64, 1.1],
    bounty: 100, bossBonus: 0, headshotBonus: 10, headshotMultiplier: 2, canPress: true,
    halfLength: 0.32, halfDepth: 0.3, height: 1.4,
  },
  bear: {
    type: 'bear', name: 'Polar bear', life: [1700, 0], bossLife: 2000, speed: [0.8, 7.4],
    bounty: 500, bossBonus: 0, headshotBonus: 0, headshotMultiplier: 2, canPress: true,
    halfLength: 1.7, halfDepth: 0.75, height: 2.3,
  },
  turtle: {
    type: 'turtle', name: 'Turtle', life: [2500, 0], bossLife: 2500, speed: [0.6, 0.6],
    bounty: 500, bossBonus: 0, headshotBonus: 0, headshotMultiplier: 1, canPress: false,
    halfLength: 1.75, halfDepth: 1.1, height: 2.0,
  },
  walrus: {
    // The original life value is unknown (the port flags its own value as
    // invalid); 6000 keeps the final boss alive through several minigun belts.
    type: 'walrus', name: 'Walrus', life: [6000, 0], bossLife: 6000, speed: [0.25, 0.25],
    bounty: 5000, bossBonus: 0, headshotBonus: 0, headshotMultiplier: 1.25, canPress: false,
    halfLength: 1.8, halfDepth: 1.2, height: 3.1,
  },
};
