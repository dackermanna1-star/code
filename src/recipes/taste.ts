// Mochi's taste: a kid-like foodie. Loves sweets, fries, cheese and pizza; meh on plain veggies
// and raw onion / garlic; hates raw meat & fish (sushi is fine), raw egg, raw dough / flour /
// potato / rice / pasta and burnt food; finds weird combinations funny.

import type { Flavor, FoodState } from '../food/types';
import { SEASONINGS, getDef, hasDef } from '../food/catalog';
import { isLiquid } from '../food/process';
import { type Comp, type Ctx, type Unit, buildCtx, clamp, fruit, has, is, sea, share, veg } from './context';
import { type DishDef, type MealCategory, matchDish } from './dishes';
import { burntScore, clashes, frozenScore, isDessertId, majorRaw, rawness, rawScore, rawTaste } from './quality';
import { describe } from './naming';
import { fit } from './words';

export type ReactionKind =
  | 'love'
  | 'yum'
  | 'okay'
  | 'meh'
  | 'yuck'
  | 'gross'
  | 'spicy'
  | 'sour'
  | 'burnt'
  | 'frozen'
  | 'weird-good'
  | 'weird-bad'
  | 'sugar-rush'
  | 'tears';

export interface MealAnalysis {
  name: string;
  dishId: string | null;
  category: MealCategory;
  /** -1 (awful) .. 1 (amazing). */
  taste: number;
  /** 0 (normal) .. 1 (very strange). */
  weirdness: number;
  flags: {
    burnt: number;
    raw: number;
    spicy: number;
    sour: number;
    sweet: number;
    salty: number;
    frozen: number;
    hot: number;
    crunchy: boolean;
    liquid: boolean;
    gross: boolean;
    sugarRush: boolean;
    onionTears: boolean;
    melty: boolean;
  };
  reaction: ReactionKind;
  /** Sniff and squint at it first. */
  inspect: boolean;
  /** Too hot: blow on it first. */
  blowFirst: boolean;
  bites: number;
  eatStyle: 'bite' | 'crunch' | 'slurp' | 'gulp' | 'lick' | 'chew';
  quip: string;
}

const SEASON_FLAVOR = new Map(SEASONINGS.map((s) => [s.id, s.flavor]));
const FLAVOR_KEYS: (keyof Flavor)[] = ['sweet', 'salty', 'sour', 'bitter', 'spicy', 'umami', 'fat'];
const MADE = new Set(['pancake', 'cake', 'flatbread', 'fried-egg', 'scrambled-eggs', 'omelet', 'popcorn', 'cookie', 'donut', 'bread']);
const SWEET_MADE = new Set(['pancake', 'cake', 'cookie', 'donut', 'popcorn']);
const EGG_MADE = new Set(['omelet', 'scrambled-eggs']);
const BASE_INNER = new Set(['flour', 'egg', 'milk', 'butter', 'batter', 'dough', 'cookie-dough', 'beaten-egg', 'cream', 'sweet-cream']);
const VIA_BONUS: Record<string, number> = { drink: 0.12, icepop: 0.18, scoops: 0.18, 'sweet-cream': 0.05, 'whipped-cream': 0.1, soup: 0.08, mixture: -0.08 };
const TREATS = new Set(['ice-cream', 'scoops', 'icepop']);
/** How raw-risky products taste once they are cooked (French toast's egg, a batter coating). */
const COOKED_TASTE: Record<string, number> = { batter: 0.6, 'beaten-egg': 0.7, 'cookie-dough': 0.8, dough: 0.55, flour: 0.3 };

// ---------------------------------------------------------------------------------------------
// Per-unit quality

function madeBonus(u: Unit): number {
  const extras = u.inner.filter((id) => id !== u.id && !BASE_INNER.has(id));
  if (!extras.length) return 0;
  if (SWEET_MADE.has(u.id)) {
    const good = extras.filter((id) => id === 'chocolate' || isFruitish(id) || isDessertId(id));
    return Math.min(0.15, good.length * 0.06);
  }
  if (EGG_MADE.has(u.id)) return Math.min(0.12, extras.length * 0.05);
  return 0;
}

function isFruitish(id: string): boolean {
  return ['apple', 'banana', 'orange', 'strawberry', 'watermelon', 'pineapple', 'grapes', 'cherry', 'peach', 'pear', 'kiwi', 'blueberry', 'mango', 'coconut'].includes(id);
}

function cookBonus(u: Unit): number {
  const d = u.def!;
  const t = d.tags;
  const done = u.done;
  if (t.includes('frozen-treat')) return done >= 0.3 || u.melt >= 0.5 ? -0.25 : 0;
  if (t.includes('cheese') || u.id === 'chocolate' || u.id === 'marshmallow') return u.melt >= 0.3 || done >= 0.3 ? 0.12 : 0;
  if (t.includes('candy')) return done >= 0.4 ? -0.15 : 0;
  if (t.includes('bread') || u.id === 'pancake') return u.dry >= 0.25 && u.dry <= 1.6 ? 0.15 : 0;
  if (u.id === 'lettuce' || u.id === 'basil') return done >= 0.4 ? -0.25 : 0;
  if (u.id === 'cucumber' || u.id === 'watermelon') return done >= 0.4 ? -0.2 : 0;
  if (u.id === 'onion' || u.id === 'garlic') return done >= 0.4 ? 0.3 : 0;
  if (d.category === 'veg') {
    if (u.dry >= 0.4 && u.dry <= 1.6) return 0.12;
    if (u.cook.boil >= 0.4 && u.via !== 'soup') return 0.04;
    return 0;
  }
  if (d.category === 'fruit') {
    if (u.cook.boil >= 0.5 && u.via !== 'soup' && u.via !== 'drink') return -0.2;
    if (u.dry >= 0.4 && u.dry <= 1.6) return 0.05;
    return 0;
  }
  if (u.id === 'nuts') return u.dry >= 0.3 ? 0.05 : 0;
  if (u.id === 'milk') return u.cook.boil >= 0.3 ? 0.05 : 0;
  return 0;
}

function frozenMod(u: Unit): number {
  const d = u.def!;
  if (d.tags.includes('frozen-treat') || u.via === 'icepop' || u.via === 'scoops') return 0;
  if (d.category === 'fruit') return 0.05;
  return -0.35 * u.freeze;
}

function unitQuality(u: Unit, dish: DishDef | null): number {
  const d = u.def;
  if (!d) return 0;
  let q = d.taste;
  if (MADE.has(u.id) && (u.s.from?.length ?? 0) > 0) q += madeBonus(u);
  if (u.via) {
    q += VIA_BONUS[u.via] ?? 0;
    // a squeeze of lemon is lovely in drinks and dips, just not on its own
    if (u.id === 'lemon') q += 0.35;
  }
  if (!d.rawOk) {
    if (dish?.allowRaw?.(u) && u.done < 0.35) q += 0.1;
    else {
      const r = rawness(u.done);
      q = (COOKED_TASTE[u.id] ?? q) * (1 - r) + rawTaste(d) * r;
      if (u.done >= 0.8 && u.done <= 1.6) q += 0.05;
    }
  } else q += cookBonus(u);
  if (u.dry > 1.6) q -= Math.min(0.35, (u.dry - 1.6) * 0.3);
  if (u.cook.boil > 2.5 && u.via !== 'soup' && !['rice', 'spaghetti', 'soup', 'drink'].includes(u.id)) q -= 0.15;
  q -= u.burn * 1.5;
  if (u.freeze >= 0.5) q += frozenMod(u);
  if (TREATS.has(u.id) && u.melt > 0.3) q -= 0.25 * u.melt;
  return clamp(q, -1, 1);
}

// ---------------------------------------------------------------------------------------------
// Flavour

function unitFlavor(u: Unit): Flavor {
  const base = { ...(u.def?.flavor ?? { sweet: 0, salty: 0, sour: 0, bitter: 0, spicy: 0, umami: 0, fat: 0 }) };
  if (MADE.has(u.id) && (u.s.from?.length ?? 0) > 0) {
    const ls = u.inner.filter((id) => id !== u.id);
    const fl = ls.map((id) => buildFlavorOf(id)).filter(Boolean) as Flavor[];
    if (fl.length) for (const k of FLAVOR_KEYS) base[k] = base[k] * 0.75 + (fl.reduce((s, f) => s + f[k], 0) / fl.length) * 0.25;
  }
  if ((u.id === 'onion' || u.id === 'garlic') && u.done >= 0.4) base.spicy *= 0.3;
  base.bitter += u.burn;
  return base;
}

function buildFlavorOf(id: string): Flavor | null {
  return hasDef(id) ? getDef(id).flavor : null;
}

function flavorProfile(x: Ctx): Flavor {
  const F: Flavor = { sweet: 0, salty: 0, sour: 0, bitter: 0, spicy: 0, umami: 0, fat: 0 };
  for (const u of x.units) {
    const fl = unitFlavor(u);
    for (const k of FLAVOR_KEYS) F[k] += u.mass * fl[k];
  }
  for (const k of FLAVOR_KEYS) F[k] /= x.mass;
  const div = 0.6 + 0.4 * x.mass;
  for (const [id, amt] of Object.entries(x.season)) {
    const sf = SEASON_FLAVOR.get(id);
    if (!sf) continue;
    const a = Math.min(amt, 6);
    for (const k of FLAVOR_KEYS) F[k] += (a * (sf[k] ?? 0)) / div;
  }
  return F;
}

// ---------------------------------------------------------------------------------------------
// Seasonings & pairings

const sauceOk = (x: Ctx, ...ids: string[]) => ids.some((id) => x.ingredients.has(id));
const friesLike = (c: Comp) => c.id === 'potato' && ['sticks', 'sliced', 'halved'].includes(c.form) && c.dry >= 0.4;

function seasoningBonus(x: Ctx, F: Flavor, dish: DishDef | null): number {
  const sweetDish = F.sweet >= 0.45 || share(x, (c) => isDessertId(c.id) || fruit(c)) >= 0.4;
  const savory = !sweetDish;
  const fries = has(x, friesLike) || has(x, is('potato'));
  const bunny = has(x, is('bun', 'hotdog-bun', 'sausage', 'patty'));
  const eggy = sauceOk(x, 'egg', 'fried-egg', 'scrambled-eggs', 'omelet');
  const bready = sauceOk(x, 'bread', 'baguette', 'croissant', 'pancake', 'tortilla', 'flatbread');
  const pancakey = sauceOk(x, 'pancake', 'cake', 'cookie', 'donut', 'ice-cream', 'scoops', 'popcorn');
  const fruity = share(x, fruit) >= 0.4;
  const asian = sauceOk(x, 'rice', 'tofu', 'nori', 'spaghetti') || dish?.id === 'stir-fry' || dish?.id === 'sushi';
  const pasta = sauceOk(x, 'spaghetti', 'dough', 'flatbread');
  const fishy = sauceOk(x, 'fish', 'salmon', 'shrimp', 'crab');
  const salady = dish?.category === 'salad' || share(x, veg) >= 0.5;
  const perDose = (id: string): number => {
    switch (id) {
      case 'salt':
        return savory ? 0.1 : -0.12;
      case 'pepper':
        return savory ? 0.04 : -0.1;
      case 'sugar':
        return sweetDish || fruity || pancakey ? 0.1 : -0.08;
      case 'cinnamon':
        return sweetDish || fruity || bready ? 0.08 : -0.05;
      case 'chili-flakes':
        return savory ? 0.02 : -0.15;
      case 'herbs':
        return savory ? 0.06 : -0.08;
      case 'sprinkles':
        return sweetDish || pancakey ? 0.12 : -0.2;
      case 'ketchup':
        return fries || bunny || eggy ? 0.15 : savory ? 0.02 : -0.3;
      case 'mustard':
        return bunny ? 0.1 : savory ? -0.02 : -0.3;
      case 'mayo':
        return fries || bready || salady || eggy ? 0.06 : savory ? 0 : -0.3;
      case 'hot-sauce':
        return savory ? 0 : -0.25;
      case 'chocolate-syrup':
        return sweetDish || fruity || pancakey ? 0.14 : -0.3;
      case 'honey':
        return sweetDish || fruity || pancakey || bready ? 0.12 : sauceOk(x, 'chicken', 'drumstick', 'carrot', 'ham') ? 0.04 : -0.1;
      case 'soy-sauce':
        return asian ? 0.12 : savory ? 0.02 : -0.3;
      case 'olive-oil':
        return salady || pasta || bready ? 0.05 : sweetDish ? -0.15 : 0;
      case 'lemon-juice':
        return fishy || salady || fruity ? 0.06 : 0;
      case 'tomato-sauce':
        return pasta || bready ? 0.1 : savory ? 0.02 : -0.25;
      case 'jam':
        return bready || pancakey || fruity || sweetDish ? 0.12 : savory ? -0.15 : 0;
      case 'peanut-butter':
        return bready || sauceOk(x, 'banana', 'apple', 'chocolate') ? 0.1 : sweetDish ? 0.04 : -0.1;
      case 'whip':
        return sweetDish || pancakey || fruity ? 0.12 : -0.2;
      default:
        return 0;
    }
  };
  let b = 0;
  for (const [id, amt] of Object.entries(x.season)) {
    if (!(amt > 0.05)) continue;
    b += perDose(id) * Math.min(amt, 2);
    if (amt > 3) b -= (amt - 3) * 0.06;
  }
  return clamp(b, -0.6, 0.3);
}

function pairBonus(x: Ctx): number {
  const I = x.ingredients;
  const any = (...ids: string[]) => ids.some((id) => I.has(id));
  let b = 0;
  const choc = I.has('chocolate') || sea(x, 'chocolate-syrup', 0.2);
  if (choc && any('strawberry', 'banana', 'cherry', 'orange', 'peach', 'pear', 'coconut')) b += 0.12;
  if (any('cheese', 'mozzarella') && any('bread', 'potato', 'spaghetti', 'tortilla', 'dough', 'bun', 'baguette', 'flatbread')) b += 0.06;
  if (any('tomato') && any('mozzarella') && any('basil')) b += 0.08;
  if (sea(x, 'peanut-butter', 0.2) && sea(x, 'jam', 0.2)) b += 0.12;
  if (sea(x, 'peanut-butter', 0.2) && any('banana')) b += 0.08;
  if (sea(x, 'cinnamon', 0.2) && any('apple', 'banana', 'pear')) b += 0.08;
  if (any('marshmallow') && choc) b += 0.08;
  if (any('bacon') && any('egg', 'fried-egg', 'scrambled-eggs', 'omelet', 'pancake')) b += 0.06;
  if (any('ice-cream', 'scoops') && any('cookie', 'donut', 'cake', 'banana', 'strawberry', 'chocolate', 'nuts', 'cherry')) b += 0.06;
  if (any('butter') && any('bread', 'corn', 'potato', 'pancake')) b += 0.05;
  if (sea(x, 'salt', 0.3) && has(x, friesLike)) b += 0.06;
  return Math.min(b, 0.25);
}

// ---------------------------------------------------------------------------------------------
// Quips

const QUIPS: Record<ReactionKind, string[]> = {
  love: ['Yum!!', 'I love it!', 'Best ever!', 'So good!!', 'Wow!!', 'More please!', 'Yummy!!', 'Mmm-hmm!'],
  yum: ['Yum!', 'Tasty!', 'Nom nom!', 'Mmm!', 'Nice!', 'Delish!', 'Good one!'],
  okay: ['Not bad!', 'Okay!', 'Pretty good.', 'Mm, fine!', 'Sure!'],
  meh: ['Meh...', 'Hmm...', 'So-so.', 'Eh...', 'Kinda plain.'],
  yuck: ['Yuck!', 'Bleh!', 'Nope!', 'Ew...', 'Blech!'],
  gross: ['Eww!!', 'Gross!', 'Bleeeh!', 'No way!', 'Icky!!'],
  spicy: ['Spicy!!', 'Hot hot hot!', 'Fire!!', 'Water!!', 'Yowza!'],
  sour: ['Sour!!', 'So sour!', 'Pucker!', 'Eek, sour!'],
  burnt: ['Burnt!', 'Too crispy!', 'Charcoal?!', 'Smoky...', 'Ack, burnt!'],
  frozen: ['Brr!', 'Brain freeze!', 'So cold!', 'Brrr!!', 'Icy!'],
  'weird-good': ['Weird... yum!', 'Huh, tasty!', 'Odd but good!', 'Wacky yum!'],
  'weird-bad': ['Hmm...?', 'What is it?', 'Weird...', 'Uhh...?', 'Strange!'],
  'sugar-rush': ['Sugar rush!', 'Wheee!!', 'So sweet!!', 'Zoom zoom!'],
  tears: ['*sniff*', 'Teary eyes!', 'Onions!!', 'My eyes!'],
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickQuip(reaction: ReactionKind, seed: number, name: string, extra: string[]): string {
  const pool = [...QUIPS[reaction], ...extra];
  return pool[(hashStr(name + reaction) + Math.abs(Math.floor(seed))) % pool.length];
}

// ---------------------------------------------------------------------------------------------
// Analysis

const SILLY = [' Surprise', ' Special', ' Delight'];

function crunchyComp(c: Comp): boolean {
  const t = c.def?.texture;
  if (c.cook.deepfry >= 0.4 || c.cook.toast >= 0.3) return true;
  if (['popcorn', 'cookie', 'nuts', 'nori'].includes(c.id)) return true;
  if (c.id === 'bread' && c.form === 'diced' && c.dry >= 0.3) return true;
  if (c.freeze >= 0.7 && !(c.def?.tags.includes('frozen-treat') ?? false)) return true;
  if (c.burn >= 0.5) return true;
  return (t === 'crunchy' || t === 'crispy') && c.done < 1.2 && c.cook.boil < 0.5;
}

function categoryFor(x: Ctx, F: Flavor, weird: number, liquid: boolean): MealCategory {
  if (['batter', 'beaten-egg', 'cookie-dough', 'flour'].includes(x.root.id)) return 'silly';
  if (x.root.id === 'drink' || (liquid && x.root.id !== 'soup')) return 'drink';
  if (x.root.id === 'soup') return 'soup';
  if (weird >= 0.55) return 'silly';
  const raw = x.comps.filter((c) => (fruit(c) || veg(c)) && c.dry < 0.3 && c.cook.boil < 0.5);
  if (x.layout === 'pile' && raw.length >= 2 && raw.reduce((s, c) => s + c.mass, 0) / x.mass >= 0.6) return 'salad';
  const sweet = share(x, (c) => isDessertId(c.id) || fruit(c) || !!c.def?.tags.includes('sweet'));
  if (F.sweet >= 0.5 && sweet >= 0.5) return 'dessert';
  if (share(x, (c) => !!c.def && (c.def.tags.includes('breakfast') || c.def.tags.includes('egg'))) >= 0.4) return 'breakfast';
  if (share(x, (c) => !!c.def && (c.def.tags.includes('snack') || c.def.tags.includes('candy'))) >= 0.5 || (x.comps.length === 1 && fruit(x.comps[0]))) return 'snack';
  if (share(x, (c) => !!c.def && (c.def.tags.includes('meat') || c.def.tags.includes('seafood') || c.def.tags.includes('protein'))) >= 0.3) return 'main';
  if (share(x, (c) => veg(c) || !!c.def?.tags.includes('starch')) >= 0.5) return 'side';
  return 'main';
}

/** Everything Mochi thinks about a meal. Never throws. */
export function analyzeMeal(f: FoodState): MealAnalysis {
  try {
    return analyze(f);
  } catch {
    return fallback();
  }
}

function fallback(): MealAnalysis {
  return {
    name: 'Mystery Food',
    dishId: null,
    category: 'silly',
    taste: 0,
    weirdness: 0.5,
    flags: { burnt: 0, raw: 0, spicy: 0, sour: 0, sweet: 0, salty: 0, frozen: 0, hot: 0, crunchy: false, liquid: false, gross: false, sugarRush: false, onionTears: false, melty: false },
    reaction: 'weird-bad',
    inspect: true,
    blowFirst: false,
    bites: 2,
    eatStyle: 'bite',
    quip: 'Hmm...?',
  };
}

function analyze(f: FoodState): MealAnalysis {
  const x = buildCtx(f);
  const m = matchDish(x);
  const dish = m?.ok ? m.dish : null;
  const clash = clashes(x);
  const raw = rawScore(x, m?.dish.allowRaw);
  const burnt = burntScore(x);
  const frozen = frozenScore(x);
  const F = flavorProfile(x);

  // --- taste
  let q = 0;
  let um = 0;
  const many = x.comps.length > 1;
  for (const u of x.units) {
    const condiment = many && u.id === 'butter';
    const w = condiment ? u.mass * 0.35 : u.mass;
    q += w * (condiment ? 0.55 - u.burn : unitQuality(u, m?.dish ?? null));
    um += w;
  }
  let taste = um > 0 ? q / um : 0;
  taste += seasoningBonus(x, F, dish);
  taste += pairBonus(x);
  taste -= clash.worst * 0.9 + Math.max(0, clash.sum - clash.worst) * 0.3;
  if (dish) taste += dish.simple ? 0.12 : 0.2 + (dish.fav ? 0.1 : 0);
  const distinctIngredients = [...x.ingredients].filter((id) => !['drink', 'soup', 'mixture', 'batter', 'beaten-egg', 'sweet-cream', 'whipped-cream', 'cookie-dough'].includes(id)).length;
  if (clash.worst < 0.3) {
    if (distinctIngredients === 2) taste += 0.03;
    else if (distinctIngredients === 3) taste += 0.05;
    else if (distinctIngredients >= 4 && distinctIngredients <= 6) taste += 0.07;
    else if (distinctIngredients >= 8) taste -= 0.05;
  }
  const seasonKinds = Object.values(x.season).filter((a) => a >= 0.2).length;
  const plainVeg = !dish && seasonKinds === 0 && x.units.every((u) => u.def?.category === 'veg' && u.def.flavor.sweet < 0.3);
  if (F.spicy > 0.3) taste -= (F.spicy - 0.3) * 0.4;
  const sourUnbalanced = F.sour >= 0.35 && F.sweet < F.sour * 0.7;
  if (sourUnbalanced) taste -= (F.sour - 0.35) * 0.6;
  else if (F.sour >= 0.4) taste += 0.1; // sweet & sour
  if (F.salty > 0.8) taste -= (F.salty - 0.8) * 0.6;
  if (F.sweet > 1.3) taste -= (F.sweet - 1.3) * 0.3;
  if (plainVeg) taste = Math.min(taste, 0.1);
  taste = clamp(taste, -1, 1);

  // --- weirdness
  let weird = clash.sum;
  for (const u of x.units) {
    const d = u.def;
    if (!d) continue;
    if (d.category === 'fruit' && u.cook.boil >= 0.5 && u.via !== 'soup' && u.via !== 'drink') weird += 0.5;
    if ((d.tags.includes('dessert') || d.tags.includes('candy') || d.category === 'fruit') && u.id !== 'donut' && u.cook.deepfry >= 0.3) weird += 0.4;
    if ((u.id === 'lettuce' || u.id === 'cucumber' || u.id === 'watermelon') && u.done >= 0.4) weird += 0.2;
    if (u.freeze >= 0.5 && !d.tags.includes('frozen-treat') && d.category !== 'fruit' && u.via !== 'icepop' && u.via !== 'scoops') weird += 0.3;
    if (u.form === 'flat' && !['dough', 'cookie-dough', 'batter', 'beaten-egg', 'sweet-cream'].includes(u.id)) weird += 0.25;
  }
  if (x.units.some((u) => u.via === 'soup' && isDessertId(u.id))) weird += 0.3;
  // sweet + savoury (fries dipped in ice cream, chocolate bacon): odd, often good
  const dessertish = [...x.ingredients].some(isDessertId) || ['sprinkles', 'chocolate-syrup', 'whip', 'jam'].some((s) => sea(x, s, 0.3));
  const savoryMain = x.units.some((u) => !!u.def && (u.def.tags.includes('meat') || u.def.tags.includes('seafood') || (u.id === 'potato' && u.dry >= 0.3)));
  if (dessertish && savoryMain && clash.worst < 0.45) weird += 0.35;
  if (seasonKinds >= 4) weird += seasonKinds >= 6 ? 0.45 : 0.3;
  if (!dish && distinctIngredients >= 5) weird += distinctIngredients >= 7 ? 0.35 : 0.2;
  if (dish) weird *= 0.4;
  weird = clamp(weird, 0, 1);

  // --- flags
  const liquid = (() => {
    try {
      return x.layout === null && isLiquid(f);
    } catch {
      return false;
    }
  })();
  const temp = x.comps.reduce((s, c) => s + c.mass * c.temp, 0) / x.mass;
  const rawOnion = (u: Unit) => u.id === 'onion' && u.done < 0.3 && !u.via;
  const onionTears = x.units.filter(rawOnion).reduce((s, u) => s + u.mass, 0) / x.mass >= 0.25;
  const sweetThings =
    x.units.filter((u) => isDessertId(u.id) || !!u.def?.tags.includes('candy')).length +
    ['sugar', 'sprinkles', 'chocolate-syrup', 'honey', 'jam', 'whip'].filter((s) => sea(x, s, 0.3)).length;
  const sugarRush = F.sweet >= 0.85 && taste >= 0.5 && sweetThings >= 2;
  const melty = x.units.some((u) => !!u.def?.tags.includes('melty') && u.melt >= 0.3);

  // --- reaction
  let reaction: ReactionKind;
  if (burnt >= 0.5) reaction = 'burnt';
  else if (raw >= 0.4 || majorRaw(x, m?.dish.allowRaw) || (clash.gross && taste < 0.1)) reaction = 'gross';
  else if (F.spicy >= 0.6) reaction = 'spicy';
  else if (F.sour >= 0.6 && F.sweet < F.sour * 0.7) reaction = 'sour';
  else if (frozen >= 0.6) reaction = 'frozen';
  else if (onionTears) reaction = 'tears';
  else if (sugarRush) reaction = 'sugar-rush';
  else if (weird >= 0.55) reaction = taste >= 0.15 ? 'weird-good' : 'weird-bad';
  else if (taste >= 0.75) reaction = 'love';
  else if (taste >= 0.45) reaction = 'yum';
  else if (taste >= 0.15) reaction = 'okay';
  else if (taste >= -0.2) reaction = 'meh';
  else if (taste >= -0.6) reaction = 'yuck';
  else reaction = 'gross';

  // --- eating
  const crunchy = x.comps.filter(crunchyComp).reduce((s, c) => s + c.mass, 0) / x.mass >= 0.35;
  const chewy = x.comps.filter((c) => c.def?.texture === 'chewy' && c.id !== 'pancake').reduce((s, c) => s + c.mass, 0) / x.mass >= 0.4;
  let eatStyle: MealAnalysis['eatStyle'];
  if (liquid) eatStyle = f.id === 'soup' || ['batter', 'beaten-egg', 'sweet-cream'].includes(f.id) ? 'slurp' : 'gulp';
  else if (share(x, (c) => TREATS.has(c.id)) >= 0.4) eatStyle = 'lick';
  else if (crunchy) eatStyle = 'crunch';
  else if (chewy) eatStyle = 'chew';
  else eatStyle = 'bite';
  let bites = liquid ? 1 : x.mass < 0.9 ? 1 : x.mass < 1.5 ? 2 : x.mass < 2.6 ? 3 : x.mass < 4 ? 4 : 5;
  if (reaction === 'gross' || reaction === 'burnt') bites = 1;
  else if (reaction === 'yuck' || reaction === 'weird-bad') bites = Math.min(bites, 2);

  // --- name
  let name: string;
  if (m) name = m.ok ? m.label : `${m.flaw} ${m.label}`;
  else {
    name = describe(x);
    const single = x.layout === null ? x.comps[0] : null;
    if (single && single.def && !single.def.rawOk && rawness(single.done) >= 0.8 && single.def.category !== 'product') name = `Raw ${name}`;
    if (single && weird >= 0.4 && single.def?.category !== 'product') {
      const s = SILLY[Math.abs(Math.floor(f.seed ?? 0)) % SILLY.length];
      if ((name + s).length <= 32) name += s;
    }
  }
  name = fit(name);

  const extraQuips: string[] = [];
  if ((reaction === 'love' || reaction === 'yum') && eatStyle === 'crunch') extraQuips.push('Crunchy!', 'Crunch crunch!');
  if ((reaction === 'love' || reaction === 'yum') && (eatStyle === 'gulp' || eatStyle === 'slurp')) extraQuips.push('Slurp!', 'Ahh!');
  if ((reaction === 'love' || reaction === 'yum') && temp >= 0.5) extraQuips.push('Warm & yum!');
  if ((reaction === 'love' || reaction === 'yum') && melty) extraQuips.push('So melty!');
  if (reaction === 'love' && dish?.id.includes('pizza')) extraQuips.push('Pizza party!');

  const inspect = weird >= 0.3 || raw >= 0.2 || burnt >= 0.3 || frozen >= 0.6 || (!dish && distinctIngredients >= 4);
  return {
    name,
    dishId: dish ? dish.id : null,
    category: dish ? dish.category : categoryFor(x, F, weird, liquid),
    taste: Number.isFinite(taste) ? taste : 0,
    weirdness: weird,
    flags: {
      burnt,
      raw,
      spicy: clamp(F.spicy, 0, 1),
      sour: clamp(F.sour, 0, 1),
      sweet: clamp(F.sweet, 0, 1),
      salty: clamp(F.salty, 0, 1),
      frozen,
      hot: clamp(temp, 0, 1),
      crunchy: eatStyle === 'crunch',
      liquid,
      gross: reaction === 'gross' || clash.gross,
      sugarRush: reaction === 'sugar-rush',
      onionTears: reaction === 'tears' || onionTears,
      melty,
    },
    reaction,
    inspect,
    blowFirst: temp >= 0.6,
    bites,
    eatStyle,
    quip: pickQuip(reaction, f.seed ?? 0, name, extraQuips),
  };
}
