// Dish-wide quality measures: how raw, burnt or frozen a dish is, and whether its flavours clash.

import type { IngredientDef } from '../food/types';
import { getDef, hasDef } from '../food/catalog';
import type { Ctx, Unit } from './context';
import { clamp } from './context';

/** How bad it is to eat this raw (0 = fine). */
export function rawSeverity(d: IngredientDef | null): number {
  if (!d || d.rawOk) return 0;
  if (d.id === 'cookie-dough') return 0.6;
  const t = d.tags;
  if (t.includes('meat') || t.includes('seafood') || t.includes('egg')) return 1;
  if (t.includes('dough') || t.includes('batter') || d.id === 'flour') return 0.85;
  return 0.75; // potato, rice, pasta, beans
}

/** 1 = completely raw, 0 = cooked through. */
export function rawness(done: number): number {
  return clamp((0.7 - done) / 0.5, 0, 1);
}

/** Taste of a raw-risky thing eaten raw. */
export function rawTaste(d: IngredientDef): number {
  const s = rawSeverity(d);
  return s >= 1 ? -0.85 : s >= 0.8 ? -0.65 : s >= 0.6 ? -0.3 : -0.55;
}

/** Mass-weighted rawness of things that must be cooked (0..1). */
export function rawScore(x: Ctx, allowRaw?: (u: Unit) => boolean): number {
  let s = 0;
  for (const u of x.units) {
    const sev = rawSeverity(u.def);
    if (!sev || (allowRaw && allowRaw(u))) continue;
    s += u.mass * sev * rawness(u.done);
  }
  return clamp(s / x.mass, 0, 1);
}

/** A big part of the dish is raw meat / fish / egg (a raw patty in a burger). */
export function majorRaw(x: Ctx, allowRaw?: (u: Unit) => boolean): boolean {
  return x.units.some((u) => rawSeverity(u.def) >= 1 && !(allowRaw && allowRaw(u)) && rawness(u.done) >= 0.6 && u.mass / x.mass >= 0.25);
}

export function burntScore(x: Ctx): number {
  return clamp(x.units.reduce((s, u) => s + u.mass * u.burn, 0) / x.mass, 0, 1);
}

/** Frozen-ness of things that are not meant to be frozen (treats and fruit are fine). */
export function frozenScore(x: Ctx): number {
  let s = 0;
  for (const u of x.units) {
    const d = u.def;
    if (!d || d.tags.includes('frozen-treat') || d.category === 'fruit' || u.via === 'icepop' || u.via === 'scoops') continue;
    s += u.mass * u.freeze;
  }
  return clamp(s / x.mass, 0, 1);
}

// ---------------------------------------------------------------------------------------------
// Flavour clashes

const SAVORY_VEG = new Set(['onion', 'garlic', 'broccoli', 'mushroom', 'eggplant', 'peas', 'lettuce', 'cucumber', 'tomato', 'bell-pepper']);
const SAVORY_SAUCES = ['ketchup', 'mustard', 'mayo', 'soy-sauce', 'hot-sauce', 'tomato-sauce'];
const SWEET_SAUCES = ['sprinkles', 'chocolate-syrup', 'whip', 'jam'];

export function isDessertId(id: string): boolean {
  if (!hasDef(id)) return false;
  const d = getDef(id);
  return d.tags.includes('dessert') || d.tags.includes('candy') || id === 'sweet-cream' || id === 'cookie-dough';
}

export interface Clash {
  /** Worst clash (0..1). >= 0.8 is gross (fish + chocolate). */
  worst: number;
  /** Sum of all clashes (for weirdness). */
  sum: number;
  gross: boolean;
}

/** Find flavour clashes between the ingredients (and seasonings) of a dish. */
export function clashes(x: Ctx): Clash {
  const ids = x.ingredients;
  const sweetSauce = SWEET_SAUCES.some((s) => (x.season[s] ?? 0) >= 0.3);
  const savorySauce = SAVORY_SAUCES.some((s) => (x.season[s] ?? 0) >= 0.3);
  const dessert = [...ids].some(isDessertId);
  const dessertish = dessert || sweetSauce;
  const has = (pred: (d: IngredientDef) => boolean) => [...ids].some((id) => hasDef(id) && pred(getDef(id)));
  const seafood = has((d) => d.tags.includes('seafood'));
  const meat = has((d) => d.tags.includes('meat'));
  const onlyBacon = has((d) => d.tags.includes('meat')) && [...ids].every((id) => !hasDef(id) || !getDef(id).tags.includes('meat') || id === 'bacon');
  const savoryVeg = [...ids].some((id) => SAVORY_VEG.has(id));
  const found: number[] = [];
  if (seafood && dessertish) found.push(0.9);
  if (meat && dessertish) found.push(onlyBacon ? 0.3 : 0.55);
  if (savoryVeg && dessertish) found.push(0.5);
  if (savorySauce && dessert) found.push(0.6);
  if (sweetSauce && !dessert && (seafood || meat || savoryVeg)) found.push(0.45);
  // candy & desserts with cheese or on a pizza base
  const cheesy = has((d) => d.tags.includes('cheese')) || (x.base?.id === 'dough' && x.base.form === 'flat' && (x.season['tomato-sauce'] ?? 0) >= 0.2);
  if (cheesy && [...ids].some((id) => isDessertId(id) && id !== 'cookie-dough')) found.push(0.5);
  // blended meat / fish
  if (x.units.some((u) => (u.via === 'drink' || u.via === 'icepop' || u.via === 'scoops') && !!u.def && (u.def.tags.includes('meat') || u.def.tags.includes('seafood')))) found.push(0.6);
  // curdled milk
  if (x.units.some((u) => u.via === 'drink' && u.id === 'lemon') && x.units.some((u) => u.via === 'drink' && ['milk', 'cream', 'yogurt', 'ice-cream'].includes(u.id))) found.push(0.25);
  const worst = found.length ? Math.max(...found) : 0;
  return { worst, sum: found.reduce((a, b) => a + b, 0), gross: worst >= 0.8 };
}
