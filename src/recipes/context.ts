// Feature extraction shared by the recipe recogniser, the namer and Mochi's taste model.
//
// A dish is looked at three ways:
//  - comps:  the things you can see (assembly parts flattened; products such as a pancake or a
//            smoothie stay whole)
//  - units:  what actually gets eaten for taste (blended products are opened up into the
//            ingredients that went in, so a fish smoothie tastes of fish)
//  - ingredients: every ingredient id involved (comps, units and product histories)

import type { AssemblyLayout, CookState, FoodState, Form, IngredientDef, Tag } from '../food/types';
import { doneness, emptyCook } from '../food/types';
import { defOf, dryDoneness, isAssembly, isProduct, leaves as leafStates, seasonTotals } from '../food/process';

export interface Comp {
  s: FoodState;
  id: string;
  def: IngredientDef | null;
  form: Form;
  cook: CookState;
  /** Total doneness (boiling included). */
  done: number;
  /** Dry-heat doneness (what browns and burns). */
  dry: number;
  burn: number;
  freeze: number;
  melt: number;
  temp: number;
  mass: number;
  /** Ingredient ids inside (itself, plus product history). */
  inner: string[];
  /** Top-level part index in the root assembly (0 = base), -1 for nested deeper / single items. */
  slot: number;
}

export interface Unit extends Comp {
  /** Product it was blended into (drink, soup...), or null. */
  via: string | null;
}

export interface Ctx {
  root: FoodState;
  layout: AssemblyLayout | null;
  /** First part of a stacked / topped dish. */
  base: Comp | null;
  comps: Comp[];
  units: Unit[];
  /** Every ingredient id involved. */
  ingredients: Set<string>;
  season: Record<string, number>;
  mass: number;
}

/** Products that are really their ingredients in a glass / bowl. */
export const BLENDS = new Set(['drink', 'soup', 'mixture', 'icepop', 'scoops', 'sweet-cream', 'whipped-cream']);

const fin = (x: unknown, fb = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : fb);
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

export function massOfDef(d: IngredientDef | null): number {
  return d ? clamp(0.6 + d.size * 4, 0.7, 1.8) : 1;
}

function safeCook(c: CookState | undefined): CookState {
  const out = emptyCook();
  if (!c) return out;
  for (const k of Object.keys(out) as (keyof CookState)[]) out[k] = fin(c[k]);
  return out;
}

/** Every id in a state's history (products along the way included). */
function allIds(s: FoodState, out: Set<string>, depth = 0): Set<string> {
  if (!s || depth > 10) return out;
  if (s.id !== 'assembly') out.add(s.id);
  for (const p of s.parts ?? []) allIds(p, out, depth + 1);
  for (const p of s.from ?? []) allIds(p, out, depth + 1);
  return out;
}

function makeComp(s: FoodState, slot: number): Comp {
  const def = defOf(s);
  const cook = safeCook(s.cook);
  const inner = allIds(s, new Set<string>([s.id]));
  return {
    s,
    id: s.id,
    def,
    form: s.form,
    cook,
    done: doneness(cook),
    dry: dryDoneness(cook),
    burn: clamp(cook.burn, 0, 1),
    freeze: clamp(cook.freeze, 0, 1),
    melt: clamp(cook.melt, 0, 1),
    temp: clamp(cook.temp, -1, 1),
    mass: massOfDef(def) * clamp(fin(s.amount, 1), 0.1, 1),
    inner: [...inner],
    slot,
  };
}

/** Open a blended product into the units that are eaten. */
function unitsOf(c: Comp): Unit[] {
  const from = (c.s.from ?? []).filter(Boolean);
  if (from.length && BLENDS.has(c.id)) {
    const ls = leafStates(c.s).filter((l) => !isAssembly(l));
    if (ls.length) {
      const masses = ls.map((l) => massOfDef(defOf(l)));
      const total = masses.reduce((a, b) => a + b, 0) || 1;
      return ls.map((l, i) => {
        const u = makeComp(l, c.slot) as Unit;
        u.via = c.id;
        u.mass = (c.mass * masses[i]) / total;
        if (c.id === 'soup') u.done += c.cook.boil + 0.4;
        u.burn = Math.max(u.burn, c.burn);
        u.freeze = Math.max(u.freeze, c.freeze);
        u.melt = c.melt;
        u.temp = c.temp;
        return u;
      });
    }
  }
  const u = c as Unit;
  u.via = null;
  const out: Unit[] = [u];
  // mashed things that remember what was mashed in (mashed potatoes with butter)
  if (from.length && !isProduct(c.s) && c.form === 'mashed') {
    for (const l of from) {
      const e = makeComp(l, c.slot) as Unit;
      e.via = c.id;
      e.mass *= 0.4;
      out.push(e);
    }
  }
  return out;
}

const cache = new WeakMap<FoodState, { key: string; ctx: Ctx }>();

/** Build (or reuse) the analysis context of a state. */
export function buildCtx(root: FoodState): Ctx {
  let key = '';
  try {
    key = JSON.stringify(root);
  } catch {
    key = String(Math.random());
  }
  const hit = cache.get(root);
  if (hit && hit.key === key) return hit.ctx;
  const comps: Comp[] = [];
  const visit = (s: FoodState, slot: number, depth: number) => {
    if (!s || depth > 12) return;
    if (isAssembly(s)) {
      (s.parts ?? []).forEach((p, i) => visit(p, depth === 0 ? i : slot, depth + 1));
      return;
    }
    comps.push(makeComp(s, depth <= 1 ? slot : -1));
  };
  visit(root, -1, 0);
  const units = comps.flatMap(unitsOf);
  const ingredients = new Set<string>();
  for (const c of comps) for (const id of c.inner) ingredients.add(id);
  for (const u of units) ingredients.add(u.id);
  const layout = isAssembly(root) ? root.layout ?? 'pile' : null;
  const base = layout === 'stack' || layout === 'topped' ? comps.find((c) => c.slot === 0) ?? null : null;
  const ctx: Ctx = {
    root,
    layout,
    base,
    comps,
    units,
    ingredients,
    season: seasonTotals(root),
    mass: comps.reduce((s, c) => s + c.mass, 0) || 1,
  };
  cache.set(root, { key, ctx });
  return ctx;
}

// ---------------------------------------------------------------------------------------------
// Predicates

export type Pred = (c: Comp) => boolean;

export const is = (...ids: string[]): Pred => (c) => ids.includes(c.id);
export const tagged = (t: Tag): Pred => (c) => !!c.def && c.def.tags.includes(t);
export const catOf = (c: Comp): string => c.def?.category ?? '';
export const inCat = (...cats: string[]): Pred => (c) => cats.includes(catOf(c));
export const formIn = (...forms: Form[]): Pred => (c) => forms.includes(c.form);
export const and = (...ps: Pred[]): Pred => (c) => ps.every((p) => p(c));
export const or = (...ps: Pred[]): Pred => (c) => ps.some((p) => p(c));
export const not = (p: Pred): Pred => (c) => !p(c);

export const has = (x: Ctx, p: Pred) => x.comps.some(p);
export const count = (x: Ctx, p: Pred) => x.comps.filter(p).length;
export const only = (x: Ctx, p: Pred) => x.comps.length > 0 && x.comps.every(p);
export const share = (x: Ctx, p: Pred) => x.comps.filter(p).reduce((s, c) => s + c.mass, 0) / x.mass;
export const ing = (x: Ctx, ...ids: string[]) => ids.some((id) => x.ingredients.has(id));
export const sea = (x: Ctx, id: string, min = 0.25) => (x.season[id] ?? 0) >= min;
export const distinct = (x: Ctx, p: Pred) => new Set(x.comps.filter(p).map((c) => c.id)).size;

/** A hard-cooked egg comp. */
export const cookedEgg: Pred = (c) => c.id === 'egg' && c.form !== 'cracked' && c.done >= 0.6;
/** Any egg that has been cooked into something edible. */
export const eggDish: Pred = (c) => ['fried-egg', 'scrambled-eggs', 'omelet'].includes(c.id) || cookedEgg(c) || (c.id === 'egg' && c.form === 'cracked' && c.done >= 0.5);
export const fruit: Pred = inCat('fruit');
export const veg: Pred = (c) => catOf(c) === 'veg';
export const meat: Pred = tagged('meat');
export const fishy: Pred = tagged('seafood');
export const cheese: Pred = tagged('cheese');
export const breadSlice: Pred = (c) => c.id === 'bread' && c.form === 'sliced';
export const toasted: Pred = (c) => breadSlice(c) && c.dry >= 0.3;
export const sandwichBread: Pred = (c) =>
  breadSlice(c) || (c.id === 'baguette' && c.form === 'halved') || (c.id === 'croissant' && c.form === 'halved');
export const condiment: Pred = (c) => ['butter', 'cheese', 'mozzarella', 'basil'].includes(c.id);
