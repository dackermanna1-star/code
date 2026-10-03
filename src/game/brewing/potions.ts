/**
 * Potion registry (vanilla potion types with long/strong variants), status-effect metadata
 * (display names, colours, beneficial/harmful), potion colours and stack helpers.
 *
 * Potion items (registered by the item workstream): `potion`, `splash_potion`, `lingering_potion`,
 * `tipped_arrow`, each with `stack.data.potion = '<potion type id>'` (e.g. 'long_swiftness').
 * Optional `stack.data.effects = [{id, duration, amplifier}]` adds custom effects (suspicious stew,
 * commands). Effect ids match `LivingEntity.addEffect` ids used by core code.
 */
import type { ItemStack } from '../items/registry';

export interface EffectInstance {
  id: string;
  /** Ticks (1 for instant effects). */
  duration: number;
  amplifier: number;
}

export interface EffectInfo {
  id: string;
  name: string;
  color: number;
  category: 'beneficial' | 'harmful' | 'neutral';
  instant?: boolean;
}

const EFFECTS: EffectInfo[] = [
  { id: 'speed', name: 'Speed', color: 0x7cafc6, category: 'beneficial' },
  { id: 'slowness', name: 'Slowness', color: 0x5a6c81, category: 'harmful' },
  { id: 'haste', name: 'Haste', color: 0xd9c043, category: 'beneficial' },
  { id: 'mining_fatigue', name: 'Mining Fatigue', color: 0x4a4217, category: 'harmful' },
  { id: 'strength', name: 'Strength', color: 0x932423, category: 'beneficial' },
  { id: 'instant_health', name: 'Instant Health', color: 0xf82423, category: 'beneficial', instant: true },
  { id: 'instant_damage', name: 'Instant Damage', color: 0x430a09, category: 'harmful', instant: true },
  { id: 'jump_boost', name: 'Jump Boost', color: 0x22ff4c, category: 'beneficial' },
  { id: 'nausea', name: 'Nausea', color: 0x551d4a, category: 'harmful' },
  { id: 'regeneration', name: 'Regeneration', color: 0xcd5cab, category: 'beneficial' },
  { id: 'resistance', name: 'Resistance', color: 0x99453a, category: 'beneficial' },
  { id: 'fire_resistance', name: 'Fire Resistance', color: 0xe49a3a, category: 'beneficial' },
  { id: 'water_breathing', name: 'Water Breathing', color: 0x2e5299, category: 'beneficial' },
  { id: 'invisibility', name: 'Invisibility', color: 0x7f8392, category: 'beneficial' },
  { id: 'blindness', name: 'Blindness', color: 0x1f1f23, category: 'harmful' },
  { id: 'night_vision', name: 'Night Vision', color: 0x1f1fa1, category: 'beneficial' },
  { id: 'hunger', name: 'Hunger', color: 0x587653, category: 'harmful' },
  { id: 'weakness', name: 'Weakness', color: 0x484d48, category: 'harmful' },
  { id: 'poison', name: 'Poison', color: 0x4e9331, category: 'harmful' },
  { id: 'wither', name: 'Wither', color: 0x352a27, category: 'harmful' },
  { id: 'health_boost', name: 'Health Boost', color: 0xf87d23, category: 'beneficial' },
  { id: 'absorption', name: 'Absorption', color: 0x2552a5, category: 'beneficial' },
  { id: 'saturation', name: 'Saturation', color: 0xf82423, category: 'beneficial', instant: true },
  { id: 'glowing', name: 'Glowing', color: 0x94a061, category: 'neutral' },
  { id: 'levitation', name: 'Levitation', color: 0xceffff, category: 'harmful' },
  { id: 'luck', name: 'Luck', color: 0x339900, category: 'beneficial' },
  { id: 'unluck', name: 'Bad Luck', color: 0xc0a44d, category: 'harmful' },
  { id: 'slow_falling', name: 'Slow Falling', color: 0xffefd1, category: 'beneficial' },
  { id: 'conduit_power', name: 'Conduit Power', color: 0x1dc2d1, category: 'beneficial' },
  { id: 'dolphins_grace', name: "Dolphin's Grace", color: 0x88a3be, category: 'beneficial' },
  { id: 'bad_omen', name: 'Bad Omen', color: 0x0b6138, category: 'neutral' },
  { id: 'hero_of_the_village', name: 'Hero of the Village', color: 0x44ff44, category: 'beneficial' },
  { id: 'darkness', name: 'Darkness', color: 0x292721, category: 'harmful' },
];
export const EFFECT_INFO = new Map<string, EffectInfo>(EFFECTS.map((e) => [e.id, e]));
export function effectInfo(id: string): EffectInfo {
  return EFFECT_INFO.get(id) ?? { id, name: id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), color: 0xaaaaaa, category: 'neutral' };
}

export interface PotionType {
  id: string;
  /** Base name for display: "Potion of <base>" (null = special names like "Awkward Potion"). */
  base: string;
  effects: EffectInstance[];
  /** Display name override (water bottle, awkward/thick/mundane). */
  name?: string;
}

const P: PotionType[] = [];
const reg = (id: string, base: string, effects: EffectInstance[], name?: string) => P.push({ id, base, effects, name });
const fx = (id: string, duration: number, amplifier = 0): EffectInstance => ({ id, duration, amplifier });

reg('water', 'Water', [], 'Water Bottle');
reg('mundane', 'Mundane', [], 'Mundane Potion');
reg('thick', 'Thick', [], 'Thick Potion');
reg('awkward', 'Awkward', [], 'Awkward Potion');
reg('night_vision', 'Night Vision', [fx('night_vision', 3600)]);
reg('long_night_vision', 'Night Vision', [fx('night_vision', 9600)]);
reg('invisibility', 'Invisibility', [fx('invisibility', 3600)]);
reg('long_invisibility', 'Invisibility', [fx('invisibility', 9600)]);
reg('leaping', 'Leaping', [fx('jump_boost', 3600)]);
reg('long_leaping', 'Leaping', [fx('jump_boost', 9600)]);
reg('strong_leaping', 'Leaping', [fx('jump_boost', 1800, 1)]);
reg('fire_resistance', 'Fire Resistance', [fx('fire_resistance', 3600)]);
reg('long_fire_resistance', 'Fire Resistance', [fx('fire_resistance', 9600)]);
reg('swiftness', 'Swiftness', [fx('speed', 3600)]);
reg('long_swiftness', 'Swiftness', [fx('speed', 9600)]);
reg('strong_swiftness', 'Swiftness', [fx('speed', 1800, 1)]);
reg('slowness', 'Slowness', [fx('slowness', 1800)]);
reg('long_slowness', 'Slowness', [fx('slowness', 4800)]);
reg('strong_slowness', 'Slowness', [fx('slowness', 400, 3)]);
reg('turtle_master', 'the Turtle Master', [fx('slowness', 400, 3), fx('resistance', 400, 2)]);
reg('long_turtle_master', 'the Turtle Master', [fx('slowness', 800, 3), fx('resistance', 800, 2)]);
reg('strong_turtle_master', 'the Turtle Master', [fx('slowness', 400, 5), fx('resistance', 400, 3)]);
reg('water_breathing', 'Water Breathing', [fx('water_breathing', 3600)]);
reg('long_water_breathing', 'Water Breathing', [fx('water_breathing', 9600)]);
reg('healing', 'Healing', [fx('instant_health', 1)]);
reg('strong_healing', 'Healing', [fx('instant_health', 1, 1)]);
reg('harming', 'Harming', [fx('instant_damage', 1)]);
reg('strong_harming', 'Harming', [fx('instant_damage', 1, 1)]);
reg('poison', 'Poison', [fx('poison', 900)]);
reg('long_poison', 'Poison', [fx('poison', 1800)]);
reg('strong_poison', 'Poison', [fx('poison', 432, 1)]);
reg('regeneration', 'Regeneration', [fx('regeneration', 900)]);
reg('long_regeneration', 'Regeneration', [fx('regeneration', 1800)]);
reg('strong_regeneration', 'Regeneration', [fx('regeneration', 450, 1)]);
reg('strength', 'Strength', [fx('strength', 3600)]);
reg('long_strength', 'Strength', [fx('strength', 9600)]);
reg('strong_strength', 'Strength', [fx('strength', 1800, 1)]);
reg('weakness', 'Weakness', [fx('weakness', 1800)]);
reg('long_weakness', 'Weakness', [fx('weakness', 4800)]);
reg('luck', 'Luck', [fx('luck', 6000)]);
reg('slow_falling', 'Slow Falling', [fx('slow_falling', 1800)]);
reg('long_slow_falling', 'Slow Falling', [fx('slow_falling', 4800)]);

export const POTIONS: readonly PotionType[] = P;
export const POTION_BY_ID = new Map<string, PotionType>(P.map((p) => [p.id, p]));
export const POTION_ITEMS = ['potion', 'splash_potion', 'lingering_potion'] as const;

export function potionType(id: string | undefined | null): PotionType | undefined {
  return id ? POTION_BY_ID.get(id) : undefined;
}
export function registerPotion(p: PotionType) {
  P.push(p);
  POTION_BY_ID.set(p.id, p);
}

/** Potion type id of a stack (defaults to water for bottles without data). */
export function potionOf(s: ItemStack | null | undefined): string {
  return (s?.data?.potion as string | undefined) ?? 'water';
}

/** All effects of a stack (potion type + custom effects). */
export function stackEffects(s: ItemStack | null | undefined): EffectInstance[] {
  if (!s) return [];
  const out: EffectInstance[] = [];
  const pt = potionType(s.data?.potion);
  if (pt) for (const e of pt.effects) out.push({ ...e });
  const custom = s.data?.effects as EffectInstance[] | undefined;
  if (Array.isArray(custom)) for (const e of custom) out.push({ id: e.id, duration: e.duration ?? 1, amplifier: e.amplifier ?? 0 });
  return out;
}

/** Vanilla PotionUtils.getColor: amplifier-weighted mix of the effect colours (water 0x385DC6). */
export function effectsColor(effects: EffectInstance[]): number {
  if (!effects.length) return 0x385dc6;
  let r = 0, g = 0, b = 0, n = 0;
  for (const e of effects) {
    const c = effectInfo(e.id).color;
    const w = e.amplifier + 1;
    r += (w * ((c >> 16) & 255)) / 255;
    g += (w * ((c >> 8) & 255)) / 255;
    b += (w * (c & 255)) / 255;
    n += w;
  }
  if (n === 0) return 0;
  return (Math.floor((r / n) * 255) << 16) | (Math.floor((g / n) * 255) << 8) | Math.floor((b / n) * 255);
}

/** Colour of a potion type (for item icons / particles / splash). */
export function potionColor(type: string | PotionType | null | undefined): number {
  const pt = typeof type === 'string' || !type ? potionType((type as string) ?? 'water') : type;
  if (!pt) return 0xf800f8;
  return effectsColor(pt.effects);
}
/** Colour of a potion stack (custom colour `data.color` wins). */
export function potionStackColor(s: ItemStack | null | undefined): number {
  if (s?.data?.color !== undefined) return s.data.color;
  return effectsColor(stackEffects(s));
}

/** "Potion of Swiftness" / "Splash Potion of Healing" / "Water Bottle" / "Awkward Potion". */
export function potionDisplayName(itemName: string, type: string | undefined): string {
  const pt = potionType(type ?? 'water');
  const kind = itemName === 'splash_potion' ? 'Splash ' : itemName === 'lingering_potion' ? 'Lingering ' : '';
  if (itemName === 'tipped_arrow') {
    if (!pt || !pt.effects.length) return 'Tipped Arrow';
    return `Arrow of ${pt.base}`;
  }
  if (!pt) return `${kind}Potion`;
  if (pt.id === 'water') return kind ? `${kind}Water Bottle` : 'Water Bottle';
  if (pt.name && !pt.effects.length) return kind ? `${kind}${pt.name}` : pt.name;
  return `${kind}Potion of ${pt.base}`;
}

/** m:ss duration text (vanilla MobEffectUtil.formatDuration); '**:**' for infinite. */
export function formatDuration(ticks: number): string {
  if (ticks < 0 || ticks > 32147 * 20 * 60) return '**:**';
  const s = Math.floor(ticks / 20);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Duration scale for the potion item kind (lingering clouds apply 1/4; tipped arrows 1/8). */
export function durationScale(itemName: string): number {
  return itemName === 'lingering_potion' ? 0.25 : itemName === 'tipped_arrow' ? 0.125 : 1;
}

/** Tooltip lines for effects: [text, colour]. */
export function effectTooltipLines(s: ItemStack, scale = durationScale(s.item.name)): [string, string][] {
  const eff = stackEffects(s);
  if (!eff.length) return [['No Effects', '#aaaaaa']];
  const out: [string, string][] = [];
  for (const e of eff) {
    const info = effectInfo(e.id);
    let t = info.name;
    if (e.amplifier > 0) t += ' ' + romanSmall(e.amplifier + 1);
    if (!info.instant && e.duration > 20) t += ` (${formatDuration(Math.floor(e.duration * scale))})`;
    out.push([t, info.category === 'harmful' ? '#ff5555' : '#5555ff']);
  }
  return out;
}

function romanSmall(n: number) {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n);
}
