/**
 * Hunger, saturation and exhaustion (Minecraft Java 1.20 FoodData), as pure logic so it can be
 * unit tested. `Player.tickFood` delegates here. Also the vanilla food table.
 */

export type DifficultyName = 'peaceful' | 'easy' | 'normal' | 'hard';

export interface FoodState {
  food: number;
  saturation: number;
  exhaustion: number;
  /** FoodData.tickTimer */
  timer: number;
}

export interface FoodTickContext {
  health: number;
  maxHealth: number;
  difficulty: DifficultyName;
  naturalRegeneration: boolean;
  heal(amount: number): void;
  /** Apply 1 point of starvation damage. */
  starve(): void;
}

export const MAX_FOOD = 20;
export const MAX_EXHAUSTION = 40;

/** Vanilla exhaustion costs. */
export const EXHAUSTION = {
  swimPerMetre: 0.01,
  sprintPerMetre: 0.1,
  jump: 0.05,
  sprintJump: 0.2,
  attack: 0.1,
  mine: 0.005,
  regen: 6,
  /** Hunger effect, per tick and level. */
  hungerEffect: 0.005,
} as const;

/** Exhaustion added when taking damage of a type (DamageType.exhaustion in 1.20). */
export function damageExhaustion(type: string): number {
  switch (type) {
    case 'starve': case 'void': case 'drown': case 'suffocate': case 'fall': case 'magic': case 'wither':
    case 'poison': case 'freeze': case 'kill': case 'generic':
      return 0;
    default:
      return 0.1;
  }
}

export function addExhaustion(s: FoodState, n: number) {
  s.exhaustion = Math.min(MAX_EXHAUSTION, s.exhaustion + n);
}

/** FoodData.eat(nutrition, saturationModifier). */
export function eatFood(s: FoodState, nutrition: number, saturationModifier: number) {
  s.food = Math.min(MAX_FOOD, s.food + nutrition);
  s.saturation = Math.min(s.food, s.saturation + nutrition * saturationModifier * 2);
}

/** One game tick of FoodData.tick. */
export function foodTick(s: FoodState, ctx: FoodTickContext) {
  if (s.exhaustion > 4) {
    s.exhaustion -= 4;
    if (s.saturation > 0) s.saturation = Math.max(s.saturation - 1, 0);
    else if (ctx.difficulty !== 'peaceful') s.food = Math.max(s.food - 1, 0);
  }
  const hurt = ctx.health > 0 && ctx.health < ctx.maxHealth;
  if (ctx.naturalRegeneration && s.saturation > 0 && hurt && s.food >= 20) {
    s.timer++;
    if (s.timer >= 10) {
      const f = Math.min(s.saturation, 6);
      ctx.heal(f / 6);
      addExhaustion(s, f);
      s.timer = 0;
    }
  } else if (ctx.naturalRegeneration && s.food >= 18 && hurt) {
    s.timer++;
    if (s.timer >= 80) {
      ctx.heal(1);
      addExhaustion(s, EXHAUSTION.regen);
      s.timer = 0;
    }
  } else if (s.food <= 0) {
    s.timer++;
    if (s.timer >= 80) {
      const d = ctx.difficulty;
      if (ctx.health > 10 || d === 'hard' || (ctx.health > 1 && d === 'normal')) ctx.starve();
      s.timer = 0;
    }
  } else {
    s.timer = 0;
  }
}

export interface FoodEffect {
  effect: string;
  /** ticks */
  duration: number;
  amplifier: number;
  chance: number;
}
export interface FoodInfo {
  nutrition: number;
  /** Saturation modifier (saturation gained = nutrition * modifier * 2). */
  saturation: number;
  alwaysEdible?: boolean;
  eatTicks?: number;
  effects?: FoodEffect[];
  remainder?: string;
  drink?: boolean;
}

const fx = (effect: string, duration: number, amplifier = 0, chance = 1): FoodEffect => ({ effect, duration, amplifier, chance });

/** Vanilla food properties (Foods.java). */
export const FOODS: Record<string, FoodInfo> = {
  apple: { nutrition: 4, saturation: 0.3 },
  baked_potato: { nutrition: 5, saturation: 0.6 },
  beef: { nutrition: 3, saturation: 0.3 },
  cooked_beef: { nutrition: 8, saturation: 0.8 },
  beetroot: { nutrition: 1, saturation: 0.6 },
  beetroot_soup: { nutrition: 6, saturation: 0.6, remainder: 'bowl' },
  bread: { nutrition: 5, saturation: 0.6 },
  carrot: { nutrition: 3, saturation: 0.6 },
  chicken: { nutrition: 2, saturation: 0.3, effects: [fx('hunger', 600, 0, 0.3)] },
  cooked_chicken: { nutrition: 6, saturation: 0.6 },
  chorus_fruit: { nutrition: 4, saturation: 0.3, alwaysEdible: true },
  cod: { nutrition: 2, saturation: 0.1 },
  cooked_cod: { nutrition: 5, saturation: 0.6 },
  cookie: { nutrition: 2, saturation: 0.1 },
  dried_kelp: { nutrition: 1, saturation: 0.3, eatTicks: 16 },
  enchanted_golden_apple: {
    nutrition: 4, saturation: 1.2, alwaysEdible: true,
    effects: [fx('regeneration', 400, 1), fx('resistance', 6000, 0), fx('fire_resistance', 6000, 0), fx('absorption', 2400, 3)],
  },
  golden_apple: { nutrition: 4, saturation: 1.2, alwaysEdible: true, effects: [fx('regeneration', 100, 1), fx('absorption', 2400, 0)] },
  golden_carrot: { nutrition: 6, saturation: 1.2 },
  glow_berries: { nutrition: 2, saturation: 0.1 },
  honey_bottle: { nutrition: 6, saturation: 0.1, eatTicks: 40, drink: true, remainder: 'glass_bottle' },
  melon_slice: { nutrition: 2, saturation: 0.3 },
  mushroom_stew: { nutrition: 6, saturation: 0.6, remainder: 'bowl' },
  mutton: { nutrition: 2, saturation: 0.3 },
  cooked_mutton: { nutrition: 6, saturation: 0.8 },
  poisonous_potato: { nutrition: 2, saturation: 0.3, effects: [fx('poison', 100, 0, 0.6)] },
  porkchop: { nutrition: 3, saturation: 0.3 },
  cooked_porkchop: { nutrition: 8, saturation: 0.8 },
  potato: { nutrition: 1, saturation: 0.3 },
  pufferfish: { nutrition: 1, saturation: 0.1, effects: [fx('poison', 1200, 1), fx('hunger', 300, 2), fx('nausea', 300, 0)] },
  pumpkin_pie: { nutrition: 8, saturation: 0.3 },
  rabbit: { nutrition: 3, saturation: 0.3 },
  cooked_rabbit: { nutrition: 5, saturation: 0.6 },
  rabbit_stew: { nutrition: 10, saturation: 0.6, remainder: 'bowl' },
  rotten_flesh: { nutrition: 4, saturation: 0.1, effects: [fx('hunger', 600, 0, 0.8)] },
  salmon: { nutrition: 2, saturation: 0.1 },
  cooked_salmon: { nutrition: 6, saturation: 0.8 },
  spider_eye: { nutrition: 2, saturation: 0.8, effects: [fx('poison', 100, 0)] },
  suspicious_stew: { nutrition: 6, saturation: 0.6, alwaysEdible: true, remainder: 'bowl' },
  sweet_berries: { nutrition: 2, saturation: 0.1 },
  tropical_fish: { nutrition: 1, saturation: 0.1 },
};

/** Total XP needed to go from `level` to `level + 1` (vanilla getXpNeededForNextLevel). */
export function xpForLevel(level: number): number {
  if (level >= 30) return 112 + (level - 30) * 9;
  if (level >= 15) return 37 + (level - 15) * 5;
  return 7 + level * 2;
}

/** Total XP points accumulated at the start of `level`. */
export function totalXpForLevel(level: number): number {
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return 2.5 * level * level - 40.5 * level + 360;
  return 4.5 * level * level - 162.5 * level + 2220;
}

/** XP dropped by a player on death (vanilla: level * 7, capped at 100). */
export function deathXp(level: number): number {
  return Math.min(level * 7, 100);
}

/** ExperienceOrb.getExperienceValue: the largest orb size not exceeding `value`. */
export function orbValue(value: number): number {
  const sizes = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3];
  for (const s of sizes) if (value >= s) return s;
  return 1;
}

/** Split an XP amount into orb values. */
export function splitXp(amount: number): number[] {
  const out: number[] = [];
  let a = Math.floor(amount);
  while (a > 0) {
    const v = orbValue(a);
    out.push(v);
    a -= v;
  }
  return out;
}
