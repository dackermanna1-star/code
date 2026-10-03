// Little word helpers for dish names: ingredient adjectives, flavour words, joining & fitting.

import { getDef, hasDef } from '../food/catalog';
import type { Comp, Ctx } from './context';

export const MAX_NAME = 32;

/** "Strawberry", "Grape", "Beef" (patty), "Chicken". */
export function adjOf(id: string): string {
  if (id === 'drumstick') return 'Chicken';
  if (id === 'patty') return 'Beef';
  if (!hasDef(id)) return cap(id);
  const d = getDef(id);
  return d.adj ?? d.name;
}

export function nameOf(id: string): string {
  return hasDef(id) ? getDef(id).name : cap(id);
}

export function pluralOf(id: string): string {
  if (!hasDef(id)) return cap(id) + 's';
  const d = getDef(id);
  return d.plural ?? d.name + 's';
}

export function cap(s: string): string {
  return s
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** "A", "A & B", "A, B & C". */
export function joinWords(words: string[]): string {
  const w = [...new Set(words.filter(Boolean))];
  if (w.length <= 1) return w[0] ?? '';
  if (w.length === 2) return `${w[0]} & ${w[1]}`;
  return `${w.slice(0, -1).join(', ')} & ${w[w.length - 1]}`;
}

/** Trim a name to fit a label: drop leading words, then cut at a word boundary. */
export function fit(name: string, max = MAX_NAME): string {
  let s = (name || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Mystery Food';
  if (s.length <= max) return s;
  const words = s.split(' ');
  while (words.join(' ').length > max && words.length > 2) words.shift();
  s = words.join(' ').replace(/^[&,]\s*/, '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max).replace(/[\s,&]+\S*$/, '');
  return cut.length >= 3 ? cut : s.slice(0, max);
}

/** Try names in order; the first that fits wins (otherwise the last, fitted). */
export function firstFit(...names: string[]): string {
  for (const n of names) if (n && n.length <= MAX_NAME) return n;
  return fit(names[names.length - 1] ?? '');
}

/** Ingredients that are the "plain base" of things and make boring flavour words. */
const BASE_IDS = new Set([
  'flour', 'egg', 'milk', 'cream', 'butter', 'batter', 'beaten-egg', 'sweet-cream', 'whipped-cream', 'dough', 'cookie-dough',
  'ice-cream', 'yogurt', 'soup', 'drink', 'mixture', 'scoops', 'icepop', 'rice', 'spaghetti', 'bread',
]);

function flavorRank(id: string): number {
  if (!hasDef(id)) return 0;
  const d = getDef(id);
  if (id === 'chocolate') return 5;
  if (d.category === 'fruit') return 4;
  if (d.category === 'sweets') return 3;
  if (d.tags.includes('nut')) return 2.5;
  if (d.category === 'meat' || d.category === 'seafood') return 2;
  if (d.category === 'veg' || d.category === 'dairy') return 1.5;
  return 1;
}

/** Up to `max` interesting flavour adjectives among some ingredient ids ("Strawberry", "Banana"). */
export function flavorWords(ids: Iterable<string>, max = 2, exclude: string[] = []): string[] {
  const list = [...new Set(ids)].filter((id) => hasDef(id) && !BASE_IDS.has(id) && !exclude.includes(id) && getDef(id).category !== 'product');
  list.sort((a, b) => flavorRank(b) - flavorRank(a));
  return list.slice(0, max).map(adjOf);
}

/** Ids of the units / comps of a ctx matching a filter, heaviest first. */
export function heaviest(list: Comp[], max = 2): string[] {
  const byId = new Map<string, number>();
  for (const c of list) byId.set(c.id, (byId.get(c.id) ?? 0) + c.mass);
  return [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

/** All ingredient ids of a ctx except the given ones. */
export function ingredientIds(x: Ctx, exclude: string[] = []): string[] {
  return [...x.ingredients].filter((id) => !exclude.includes(id));
}
