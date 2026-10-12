// Level table from the original (py-sealhunter levels.py, one player).
import type { EnemyType } from './enemies';

export interface LevelDef {
  num: number;
  name: string;
  /** Spawn duration in ticks before the boss (3000 = 60 s). */
  ticks: number;
  enemies: Array<[EnemyType, number, { straight?: boolean }?]>;
  bosses: Array<{ type: EnemyType; z?: number }>;
  /** Boss waits until the field is empty. */
  bossAlone: boolean;
  /** While the boss lives, cheap enemies (bounty/10) keep coming. */
  cheapEnemies: boolean;
}

export const LEVEL_TICKS = 3000;

export const LEVELS: LevelDef[] = [
  {
    num: 1, name: 'Level 1', ticks: LEVEL_TICKS,
    enemies: [['seal', 29, { straight: true }]],
    bosses: [{ type: 'fatseal', z: -0.5 }],
    bossAlone: false, cheapEnemies: false,
  },
  {
    num: 2, name: 'Level 2', ticks: LEVEL_TICKS,
    enemies: [['seal', 16], ['activist', 9]],
    bosses: Array.from({ length: 9 }, () => ({ type: 'penguin' as const })),
    bossAlone: true, cheapEnemies: false,
  },
  {
    num: 3, name: 'Level 3', ticks: LEVEL_TICKS,
    enemies: [['seal', 20], ['activist', 13], ['penguin', 12]],
    bosses: [{ type: 'bear', z: 0 }],
    bossAlone: true, cheapEnemies: false,
  },
  {
    num: 4, name: 'Level 4', ticks: LEVEL_TICKS,
    enemies: [['seal', 25], ['activist', 15], ['penguin', 13], ['fatseal', 3]],
    bosses: [{ type: 'turtle', z: 0 }],
    bossAlone: false, cheapEnemies: true,
  },
  {
    num: 5, name: 'Level 5', ticks: LEVEL_TICKS,
    enemies: [['seal', 30], ['activist', 16], ['penguin', 15], ['fatseal', 4], ['bear', 2]],
    bosses: [{ type: 'walrus', z: 0 }],
    bossAlone: true, cheapEnemies: false,
  },
  {
    num: 6, name: 'Last seal on the planet', ticks: 100,
    enemies: [],
    bosses: [{ type: 'cub', z: 0 }],
    bossAlone: true, cheapEnemies: false,
  },
];
