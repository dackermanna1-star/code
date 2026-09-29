import { AccessoryId } from './BodyRenderer';
import { BodyDef, DOG, HUMAN, P, PT } from './skeleton';
import { SKINS } from './Skins';

export type Gait = 'shamble' | 'run' | 'brute' | 'dog' | 'crawl' | 'bloat';

export interface ZombieType {
  id: string;
  name: string;
  body: BodyDef;
  hp: number;
  speed: [number, number];
  scale: [number, number];
  /** Width multipliers per part type (x, y, z). */
  partScale?: Partial<Record<number, [number, number, number]>>;
  damage: number;
  attackTime: number;
  attackRange: number;
  structDamage: number;
  /** Money for a kill (the only source of income). */
  reward: number;
  /** Armor rating vs. weapon penetration; applies to armorParts. */
  armor: number;
  armorParts: number[];
  /** Penetration budget a bullet spends passing through. */
  toughness: number;
  /** 0..1 resistance to knockback/stagger. */
  knockResist: number;
  mass: number;
  skins: [number, number];
  accessories?: { acc: AccessoryId; part: number }[];
  /** Routes around barriers through gaps instead of attacking them. */
  smart: boolean;
  gait: Gait;
  explode?: { radius: number; damage: number };
  /** First day this type can appear. */
  firstDay: number;
  groan: 'normal' | 'runner' | 'brute' | 'dog' | 'bloat' | 'boss';
  eyeColor?: number;
}

export const ZTYPES: Record<string, ZombieType> = {
  walker: {
    id: 'walker', name: 'Walker', body: HUMAN, hp: 10, speed: [1.75, 2.65], scale: [0.94, 1.06], damage: 10, attackTime: 1.1, attackRange: 0.95,
    structDamage: 6, reward: 10, armor: 0, armorParts: [], toughness: 45, knockResist: 0, mass: 70, skins: SKINS.walker, smart: false,
    gait: 'shamble', firstDay: 1, groan: 'normal',
  },
  runner: {
    id: 'runner', name: 'Runner', body: HUMAN, hp: 8, speed: [5.3, 6.6], scale: [0.92, 1.0], damage: 8, attackTime: 0.75, attackRange: 0.95,
    structDamage: 5, reward: 15, armor: 0, armorParts: [], toughness: 40, knockResist: 0, mass: 62, skins: SKINS.runner, smart: true,
    gait: 'run', firstDay: 2, groan: 'runner',
  },
  tough: {
    id: 'tough', name: 'Fatty', body: HUMAN, hp: 32, speed: [1.15, 1.6], scale: [1.02, 1.1],
    partScale: { [PT.Torso]: [1.32, 1.0, 1.45], [PT.Pelvis]: [1.2, 1.0, 1.3], [PT.UArm]: [1.25, 1, 1.25], [PT.ULeg]: [1.2, 1, 1.2] },
    damage: 28, attackTime: 1.2, attackRange: 1.05, structDamage: 12, reward: 25, armor: 0, armorParts: [], toughness: 90, knockResist: 0.45,
    mass: 120, skins: SKINS.tough, smart: false, gait: 'shamble', firstDay: 3, groan: 'normal',
  },
  armored: {
    id: 'armored', name: 'Riot Zombie', body: HUMAN, hp: 24, speed: [1.55, 2.1], scale: [1.0, 1.06], damage: 14, attackTime: 1.05, attackRange: 1.0,
    structDamage: 9, reward: 35, armor: 100, armorParts: [P.Head, P.Torso, P.Pelvis], toughness: 140, knockResist: 0.3, mass: 95,
    skins: SKINS.armored, accessories: [{ acc: 'helmet', part: P.Head }, { acc: 'vest', part: P.Torso }], smart: false, gait: 'shamble',
    firstDay: 6, groan: 'normal',
  },
  exploder: {
    id: 'exploder', name: 'Bloater', body: HUMAN, hp: 14, speed: [2.0, 2.65], scale: [1.0, 1.05],
    partScale: { [PT.Torso]: [1.45, 1.05, 1.6], [PT.Pelvis]: [1.3, 1, 1.4], [PT.Head]: [1.12, 1.05, 1.12] },
    damage: 0, attackTime: 0.6, attackRange: 1.3, structDamage: 0, reward: 22, armor: 0, armorParts: [], toughness: 60, knockResist: 0.2, mass: 110,
    skins: SKINS.exploder, smart: false, gait: 'bloat', explode: { radius: 5.2, damage: 55 }, firstDay: 8, groan: 'bloat',
  },
  dog: {
    id: 'dog', name: 'Hound', body: DOG, hp: 7, speed: [6.6, 7.8], scale: [0.95, 1.1], damage: 8, attackTime: 0.55, attackRange: 0.9,
    structDamage: 3, reward: 18, armor: 0, armorParts: [], toughness: 30, knockResist: 0, mass: 30, skins: SKINS.dog, smart: true,
    gait: 'dog', firstDay: 4, groan: 'dog',
  },
  brute: {
    id: 'brute', name: 'Brute', body: HUMAN, hp: 190, speed: [1.65, 2.0], scale: [1.45, 1.55],
    partScale: { [PT.Torso]: [1.3, 1.0, 1.25], [PT.UArm]: [1.5, 1.05, 1.5], [PT.LArm]: [1.6, 1.1, 1.6], [PT.Head]: [0.92, 0.95, 0.95] },
    damage: 35, attackTime: 1.5, attackRange: 1.45, structDamage: 60, reward: 150, armor: 40, armorParts: [P.Torso], toughness: 320,
    knockResist: 0.85, mass: 280, skins: SKINS.brute, accessories: [{ acc: 'plate', part: P.UArmL }, { acc: 'plate', part: P.UArmR }],
    smart: false, gait: 'brute', firstDay: 10, groan: 'brute',
  },
  crawler: {
    id: 'crawler', name: 'Crawler', body: HUMAN, hp: 9, speed: [1.15, 1.7], scale: [0.95, 1.02], damage: 9, attackTime: 1.0, attackRange: 0.9,
    structDamage: 5, reward: 12, armor: 0, armorParts: [], toughness: 35, knockResist: 0.1, mass: 45, skins: SKINS.crawler, smart: false,
    gait: 'crawl', firstDay: 5, groan: 'normal',
  },
  boss: {
    id: 'boss', name: 'Abomination', body: HUMAN, hp: 2600, speed: [1.8, 2.0], scale: [2.15, 2.25],
    partScale: { [PT.Torso]: [1.35, 1.0, 1.3], [PT.UArm]: [1.6, 1.1, 1.6], [PT.LArm]: [1.7, 1.15, 1.7], [PT.ULeg]: [1.3, 1, 1.3], [PT.LLeg]: [1.3, 1, 1.3] },
    damage: 55, attackTime: 1.7, attackRange: 2.1, structDamage: 220, reward: 1500, armor: 80, armorParts: [P.Torso, P.Head], toughness: 900,
    knockResist: 0.97, mass: 900, skins: SKINS.boss, accessories: [{ acc: 'plate', part: P.UArmL }, { acc: 'plate', part: P.UArmR }, { acc: 'plate', part: P.Head }],
    smart: false, gait: 'brute', firstDay: 10, groan: 'boss',
  },
};

export const ZTYPE_LIST = Object.values(ZTYPES);
