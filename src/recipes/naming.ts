// Names for food: recognised dishes use their cookbook label; everything else gets a short,
// descriptive (and sometimes silly) name built from what it is and what happened to it.

import type { FoodState, Form } from '../food/types';
import { getDef, hasDef } from '../food/catalog';
import { leaves as leafStates } from '../food/process';
import { type Comp, type Ctx, buildCtx, fruit, massOfDef, veg } from './context';
import { matchDish } from './dishes';
import { adjOf, firstFit, fit, flavorWords, heaviest, joinWords, nameOf } from './words';

type Method = 'fry' | 'grill' | 'boil' | 'bake' | 'deepfry' | 'toast' | 'micro';

function dominantMethod(c: Comp): [Method, number] {
  const k = c.cook;
  const vals: [Method, number][] = [
    ['fry', k.fry],
    ['grill', k.grill],
    ['boil', k.boil],
    ['bake', k.bake],
    ['deepfry', k.deepfry],
    ['toast', k.toast],
    ['micro', k.micro * 0.6],
  ];
  return vals.reduce((a, b) => (b[1] > a[1] ? b : a));
}

const isTreat = (c: Comp) => !!c.def && c.def.tags.includes('frozen-treat');

/** "Burnt", "Frozen", "Grilled", "Deep-Fried"... or null. */
export function cookAdj(c: Comp): string | null {
  if (c.burn >= 0.45) return 'Burnt';
  if (c.freeze >= 0.5 && !isTreat(c)) return 'Frozen';
  const [m, v] = dominantMethod(c);
  if (v >= 0.3) {
    const d = c.def;
    if (d && !d.rawOk && c.done < 0.6) return c.id === 'steak' ? 'Rare' : 'Half-Cooked';
    switch (m) {
      case 'fry':
        return 'Fried';
      case 'grill':
        return 'Grilled';
      case 'boil':
        return 'Boiled';
      case 'bake':
        return d && (['meat', 'veg', 'seafood'].includes(d.category) || d.tags.includes('nut')) ? 'Roasted' : 'Baked';
      case 'deepfry':
        return 'Deep-Fried';
      case 'toast':
        return 'Toasted';
      case 'micro':
        return 'Microwaved';
    }
  }
  if (c.melt >= 0.5) return 'Melted';
  return null;
}

const PIECES: Record<string, string> = {
  broccoli: 'Broccoli Florets',
  dough: 'Dough Balls',
  grapes: 'Loose Grapes',
  peas: 'Peas',
  nuts: 'Peanuts',
  beans: 'Beans',
  blueberry: 'Blueberries',
  cherry: 'Cherries',
  marshmallow: 'Marshmallows',
  gummy: 'Gummy Bears',
  shrimp: 'Shrimp',
  crab: 'Crab Pieces',
};

/** Name of a plain ingredient in its current form and state. */
export function ingredientName(c: Comp): string {
  const id = c.id;
  const form: Form = c.form;
  const name = nameOf(id);
  const a = adjOf(id);
  let adj = cookAdj(c);
  const pre = (noun: string) => (adj ? `${adj} ${noun}` : noun);
  // special cases
  if (id === 'bread') {
    if (form === 'sliced') return c.burn >= 0.45 ? 'Burnt Toast' : c.dry >= 0.3 ? 'Toast' : c.freeze >= 0.5 ? 'Frozen Bread' : 'Sliced Bread';
    if (form === 'diced') return c.dry >= 0.3 ? (c.burn >= 0.45 ? 'Burnt Croutons' : 'Croutons') : 'Bread Cubes';
    if (form === 'whole' && c.s.from?.length) return adj === 'Burnt' || adj === 'Frozen' ? `${adj} Fresh Bread` : 'Fresh Bread';
  }
  if (id === 'egg') {
    if (form === 'cracked') return c.cook.boil >= 0.5 ? 'Poached Egg' : adj === 'Burnt' ? 'Burnt Egg' : 'Cracked Egg';
    if (c.done >= 0.6) {
      const n: Partial<Record<Form, string>> = { whole: 'Boiled Egg', halved: 'Egg Halves', sliced: 'Sliced Egg', diced: 'Chopped Egg', mashed: 'Mashed Egg', flat: 'Squashed Egg' };
      if (n[form]) return adj === 'Burnt' || adj === 'Frozen' ? `${adj} ${n[form]}` : n[form]!;
    }
  }
  if (id === 'dough') {
    if (form === 'flat') return c.dry >= 0.3 ? pre('Flat Dough') : 'Pizza Base';
    if (form === 'pieces') return pre('Dough Balls');
  }
  if (id === 'potato' && form === 'mashed') return adj === 'Burnt' || adj === 'Frozen' ? `${adj} Mashed Potatoes` : 'Mashed Potatoes';
  if (id === 'patty' && form === 'minced') return pre('Ground Beef');
  if (id === 'cookie' && c.s.from?.length) {
    const n = c.inner.includes('chocolate') ? 'Choc Chip Cookies' : form === 'whole' ? 'Giant Cookie' : 'Cookies';
    return adj === 'Burnt' || adj === 'Frozen' ? `${adj} ${n}` : n;
  }
  if (id === 'donut' && c.s.from?.length) return adj === 'Burnt' || adj === 'Frozen' ? `${adj} Donut` : 'Fresh Donut';
  if (form === 'popped') return id === 'marshmallow' ? 'Puffy Marshmallows' : `Puffed ${name}`;
  if (adj === 'Baked' && ['cookie', 'donut', 'croissant', 'bread', 'baguette', 'bun', 'hotdog-bun'].includes(id) && c.dry < 1.2) adj = 'Warm';
  const disc = c.def?.cut === 'disc';
  let noun: string;
  switch (form) {
    case 'whole':
      noun = c.s.peeled && !adj ? `Peeled ${name}` : id === 'chicken' && adj ? 'Chicken' : name;
      break;
    case 'halved':
      noun = `${a} Halves`;
      break;
    case 'sliced':
      noun = adj || disc ? `${a} Slices` : `Sliced ${name}`;
      break;
    case 'sticks':
      noun = `${a} Sticks`;
      break;
    case 'strips':
      noun = `${a} Strips`;
      break;
    case 'diced':
      noun = adj ? `${a} Cubes` : `Diced ${name}`;
      break;
    case 'minced':
      noun = `Minced ${c.def && (c.def.category === 'meat' || c.def.category === 'seafood') ? a : name}`;
      break;
    case 'leaves':
      noun = `${a} Leaves`;
      break;
    case 'shredded':
      noun = `Shredded ${name}`;
      break;
    case 'grated':
      noun = `Grated ${name}`;
      break;
    case 'pieces':
      noun = PIECES[id] ?? `${a} Pieces`;
      break;
    case 'mashed':
      noun = `Mashed ${name}`;
      break;
    case 'flat':
      noun = `Squashed ${name}`;
      break;
    case 'cracked':
      noun = `Cracked ${name}`;
      break;
    default:
      noun = name;
  }
  return pre(noun);
}

// ---------------------------------------------------------------------------------------------
// Products

const SAVORY_DRINK = (id: string) => hasDef(id) && (getDef(id).tags.includes('meat') || getDef(id).tags.includes('seafood') || (getDef(id).category === 'veg' && !['carrot', 'corn', 'pumpkin'].includes(id)));
const isFruitId = (id: string) => hasDef(id) && getDef(id).category === 'fruit';

function drinkName(c: Comp): string {
  const inner = c.inner.filter((id) => id !== 'drink');
  const has = (...ids: string[]) => ids.some((id) => inner.includes(id));
  const dairy = has('milk', 'yogurt', 'cream', 'sweet-cream');
  const ice = has('ice-cream', 'scoops', 'icepop');
  const hot = c.temp >= 0.25 || c.cook.boil >= 0.3;
  const savory = inner.find(SAVORY_DRINK);
  if (savory && (dairy || ice)) return `${adjOf(savory)} Milkshake`;
  if (has('chocolate')) return hot ? 'Hot Chocolate' : ice ? 'Chocolate Milkshake' : dairy ? 'Chocolate Milk' : 'Chocolate Drink';
  if (ice) return `${flavorWords(inner, 1)[0] ?? 'Vanilla'} Milkshake`;
  const fruits = inner.filter(isFruitId);
  if (fruits.length) {
    if (fruits.length === 1 && !dairy && !savory) return fruits[0] === 'lemon' ? 'Lemonade' : `${hot ? 'Hot ' : ''}${adjOf(fruits[0])} Juice`;
    const w = flavorWords(fruits, 2);
    return firstFit(`${w.join(' ')} Smoothie`, `${w[0]} Smoothie`);
  }
  if (savory) return `${adjOf(savory)} Juice`;
  const w = flavorWords(inner, 1);
  if (w.length) return `${w[0]} Juice`;
  if (dairy) return hot ? 'Warm Milk' : 'Milk Drink';
  return 'Mystery Drink';
}

function soupName(c: Comp): string {
  const solids = leafStates(c.s).filter((l) => hasDef(l.id) && !getDef(l.id).tags.includes('liquid') && getDef(l.id).category !== 'product');
  if (!solids.length) return 'Mystery Soup';
  const mass = new Map<string, number>();
  for (const l of solids) mass.set(l.id, (mass.get(l.id) ?? 0) + massOfDef(getDef(l.id)));
  const ranked = [...mass.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const cold = c.temp < 0.1 && c.cook.boil < 0.3;
  if (ranked[0] === 'tomato' && cold) return 'Gazpacho';
  const vegs = ranked.filter((id) => getDef(id).category === 'veg');
  if (vegs.length >= 3 && vegs.length === ranked.length) return 'Veggie Soup';
  const sweet = ranked.find((id) => getDef(id).tags.includes('dessert') || getDef(id).tags.includes('candy'));
  if (sweet) return firstFit(`${adjOf(sweet)} Soup`, 'Silly Soup');
  return firstFit(`${cold ? 'Cold ' : ''}${adjOf(ranked[0])} Soup`, `${adjOf(ranked[0])} Soup`);
}

const GUAC = ['avocado', 'lemon', 'onion', 'tomato', 'chili', 'garlic', 'basil', 'bell-pepper', 'corn', 'mixture'];

function mixtureName(c: Comp): string {
  const inner = c.inner.filter((id) => id !== 'mixture');
  if (inner.includes('avocado') && inner.every((id) => GUAC.includes(id))) return 'Guacamole';
  if (inner.includes('yogurt') && inner.some(isFruitId)) return 'Fruit Yogurt';
  const w = flavorWords(inner, 2);
  if (!w.length) return inner.includes('flour') ? 'Gloopy Paste' : 'Mystery Mix';
  return w.length === 1 ? `${w[0]} Mush` : firstFit(`${w[0]}-${w[1]} Mush`, `${w[0]} Mush`);
}

/** Name of a kitchen product (batter, smoothie, pancake...). */
export function productName(c: Comp): string {
  const inner = c.inner.filter((id) => id !== c.id);
  const w1 = () => flavorWords(inner, 1)[0];
  let n: string;
  switch (c.id) {
    case 'drink':
      n = drinkName(c);
      break;
    case 'soup':
      n = soupName(c);
      break;
    case 'mixture':
      n = mixtureName(c);
      break;
    case 'batter':
      n = w1() ? `${w1()} Batter` : 'Pancake Batter';
      break;
    case 'cookie-dough':
      n = inner.includes('chocolate') ? 'Choc Chip Cookie Dough' : 'Cookie Dough';
      break;
    case 'beaten-egg':
      n = inner.some((id) => !['egg', 'milk', 'cream', 'beaten-egg'].includes(id)) ? 'Omelet Mix' : 'Beaten Eggs';
      break;
    case 'sweet-cream':
      n = w1() ? `${w1()} Cream` : 'Sweet Cream';
      break;
    case 'whipped-cream':
      n = w1() ? `${w1()} Whipped Cream` : 'Whipped Cream';
      break;
    case 'pancake':
      n = inner.includes('chocolate') ? 'Chocolate Pancake' : w1() ? `${w1()} Pancake` : 'Pancake';
      break;
    case 'cake':
      n = inner.includes('chocolate') ? 'Chocolate Cake' : w1() ? `${w1()} Cake` : 'Cake';
      break;
    case 'scrambled-eggs':
      n = inner.includes('cheese') || inner.includes('mozzarella') ? 'Cheesy Scrambled Eggs' : 'Scrambled Eggs';
      break;
    case 'omelet':
      n = inner.includes('cheese') || inner.includes('mozzarella') ? 'Cheese Omelet' : w1() ? `${w1()} Omelet` : 'Omelet';
      break;
    case 'icepop':
      n = inner.includes('soup') ? 'Soup Pop' : w1() ? `${w1()} Ice Pop` : 'Ice Pop';
      break;
    case 'scoops':
      n = inner.includes('chocolate') ? 'Chocolate Ice Cream' : w1() ? `${w1()} Ice Cream` : 'Ice Cream';
      break;
    default:
      n = nameOf(c.id);
  }
  if (c.burn >= 0.45) return `Burnt ${n}`;
  if (c.freeze >= 0.5 && !isTreat(c) && c.id !== 'icepop' && c.id !== 'scoops') return `Frozen ${n}`;
  if (isTreat(c) && c.melt >= 0.5) return `Melty ${n}`;
  return n;
}

const PRODUCT_NAMED = new Set(['drink', 'soup', 'mixture', 'batter', 'cookie-dough', 'beaten-egg', 'sweet-cream', 'whipped-cream', 'pancake', 'cake', 'flatbread', 'fried-egg', 'scrambled-eggs', 'omelet', 'popcorn', 'icepop', 'scoops']);

/** Full name of one component. */
export function compName(c: Comp): string {
  if (PRODUCT_NAMED.has(c.id)) {
    if (c.form !== 'whole' && c.def?.cut === 'disc') return `${nameOf(c.id).replace(/s$/, '')} Slices`;
    return productName(c);
  }
  return ingredientName(c);
}

/** One-word-ish name for compound names ("Tomato", "Fries", "Egg"). */
export function shortWord(c: Comp): string {
  if (c.id === 'potato' && c.form === 'sticks' && c.dry >= 0.4) return 'Fries';
  if (c.id === 'potato' && c.form === 'mashed') return 'Mash';
  if (c.id === 'bread' && c.form === 'diced') return 'Crouton';
  if (c.id === 'bread' && c.form === 'sliced' && c.dry >= 0.3) return 'Toast';
  if (c.id === 'fried-egg' || c.id === 'egg') return 'Egg';
  if (c.id === 'scrambled-eggs') return 'Eggs';
  if (c.id === 'scoops') return 'Ice Cream';
  if (c.id === 'drink' || c.id === 'soup' || c.id === 'mixture') return productName(c);
  if (c.id === 'icepop') return 'Ice Pop';
  return adjOf(c.id);
}

// ---------------------------------------------------------------------------------------------
// Unrecognised dishes

const SEASON_ADJ: Record<string, string> = {
  salt: 'Salty',
  pepper: 'Peppery',
  sugar: 'Sugary',
  cinnamon: 'Cinnamon',
  'chili-flakes': 'Spicy',
  herbs: 'Herby',
  sprinkles: 'Sprinkly',
  ketchup: 'Ketchup',
  mustard: 'Mustard',
  mayo: 'Mayo',
  'hot-sauce': 'Fiery',
  'chocolate-syrup': 'Chocolate',
  honey: 'Honey',
  'soy-sauce': 'Soy',
  'olive-oil': 'Oily',
  'lemon-juice': 'Lemony',
  'tomato-sauce': 'Saucy',
  jam: 'Jammy',
  'peanut-butter': 'Peanut Butter',
  whip: 'Creamy',
};
const MILD = new Set(['salt', 'pepper', 'herbs', 'olive-oil']);

/** Adjective for the most notable seasoning on a dish, if any. */
export function seasonAdj(x: Ctx): string | null {
  let best: string | null = null;
  let amt = 0;
  for (const [id, a] of Object.entries(x.season)) {
    const need = MILD.has(id) ? 1.5 : 0.8;
    if (a >= need && a > amt && SEASON_ADJ[id]) {
      best = id;
      amt = a;
    }
  }
  return best ? SEASON_ADJ[best] : null;
}

const COAT_ADJ: Record<string, string> = { batter: 'Battered', 'beaten-egg': 'Eggy', 'sweet-cream': 'Creamy' };
const FLAT_KIND: Record<string, string> = {
  dough: 'Pizza',
  'cookie-dough': 'Cookie Pizza',
  tortilla: 'Wrap',
  flatbread: 'Flatbread',
  pancake: 'Pancakes',
  cake: 'Cake',
  cookie: 'Cookie',
  omelet: 'Omelet',
};
const BREAD_KIND: Record<string, string> = { bun: 'Burger', 'hotdog-bun': 'Hot Dog', bread: 'Sandwich', baguette: 'Sub', croissant: 'Croissant' };

function words(list: Comp[], n = 2): string[] {
  const ids = heaviest(list, n);
  return ids.map((id) => shortWord(list.find((c) => c.id === id)!));
}

/** Name of one top-level part of a plate (a nested dish keeps its dish name). */
function partName(p: FoodState): string {
  const x = buildCtx(p);
  const m = matchDish(x);
  if (m) return m.ok ? m.label : `${m.flaw} ${m.label}`;
  return describe(x, false);
}

function assemblyName(x: Ctx): string {
  const comps = x.comps;
  const base = x.base;
  const root = x.root;
  if (!comps.length) return 'Empty Plate';
  if (base && BREAD_KIND[base.id] && (base.form === 'halved' || base.form === 'sliced')) {
    const kind = BREAD_KIND[base.id];
    const fill = comps.filter((c) => c !== base && c.id !== base.id && c.id !== 'butter');
    if (!fill.length) return base.id === 'bread' ? 'Bread Sandwich' : `Empty ${kind}`;
    const w = words(fill);
    return firstFit(`${joinWords(w)} ${kind}`, `${w[0]} ${kind}`, kind);
  }
  if (base && FLAT_KIND[base.id]) {
    const kind = FLAT_KIND[base.id];
    const raw = base.id === 'dough' && base.dry < 0.3 ? 'Raw ' : '';
    let tops = comps.filter((c) => c !== base);
    if (kind.endsWith('Pizza') && tops.some((c) => c.id !== 'cheese' && c.id !== 'mozzarella')) tops = tops.filter((c) => c.id !== 'cheese' && c.id !== 'mozzarella');
    if (!tops.length) return raw + kind;
    const w = words(tops);
    return firstFit(`${raw}${joinWords(w)} ${kind}`, `${raw}${w[0]} ${kind}`, raw + kind);
  }
  const coat = comps.find((c) => COAT_ADJ[c.id] && c.form === 'flat');
  if (coat) {
    const others = comps.filter((c) => c !== coat);
    if (others.length === 1) return firstFit(`${COAT_ADJ[coat.id]} ${compName(others[0])}`, `${COAT_ADJ[coat.id]} ${shortWord(others[0])}`);
  }
  const produce = comps.filter((c) => (fruit(c) || veg(c) || c.id === 'basil') && c.dry < 0.3 && c.cook.boil < 0.5);
  const pm = produce.reduce((s, c) => s + c.mass, 0) / x.mass;
  if (pm >= 0.6 && comps.length >= 1) {
    const w = words(produce);
    if (comps.length === 1 || w.length === 1) return firstFit(`${w[0]} Salad`, 'Salad');
    return firstFit(`${joinWords(w)} Salad`, `${w[0]} Salad`, 'Salad');
  }
  const friedBits = comps.filter((c) => c.form !== 'whole' && Math.max(c.cook.fry, c.cook.grill) >= 0.3);
  if (comps.length >= 2 && friedBits.length === comps.length) {
    const w = words(friedBits);
    return firstFit(`${joinWords(w)} Stir-Fry`, `${w[0]} Stir-Fry`, 'Stir-Fry');
  }
  const parts = (root.parts ?? []).filter(Boolean);
  if (parts.length === 1) return partName(parts[0]);
  if (parts.length === 2) {
    const [a, b] = parts.map(partName);
    return firstFit(`${a} & ${b}`, `${a} & ${short(parts[1])}`, `${short(parts[0])} & ${short(parts[1])}`, `${short(parts[0])} Plate`);
  }
  if (parts.length === 3) {
    const s = parts.map(short);
    return firstFit(`${s[0]}, ${s[1]} & ${s[2]}`, `${s[0]} & ${s[1]} Plate`, `${s[0]} Plate`);
  }
  const w = words(comps);
  return firstFit(`${joinWords(w)} Platter`, `${w[0]} Platter`, 'Mixed Plate');
}

function short(p: FoodState): string {
  const x = buildCtx(p);
  const m = matchDish(x);
  if (m) return m.ok ? m.label : `${m.flaw} ${m.label}`;
  if (x.comps.length === 1) return shortWord(x.comps[0]);
  const w = words(x.comps, 1);
  return w[0] ?? 'Mystery';
}

/** Name of something that is not (or not yet) a known dish. */
export function describe(x: Ctx, withSeason = true): string {
  if (x.layout === null) {
    const c = x.comps[0];
    if (!c) return 'Mystery Food';
    let n = compName(c);
    const s = withSeason ? seasonAdj(x) : null;
    if (s && !n.includes(s)) n = firstFit(`${s} ${n}`, n);
    return n;
  }
  const name = assemblyName(x);
  const s = withSeason ? seasonAdj(x) : null;
  return s && !name.includes(s) ? firstFit(`${s} ${name}`, name) : name;
}

/** The name of a food: its dish label when it is a known dish, otherwise a descriptive name. */
export function nameFood(f: FoodState): string {
  try {
    const x = buildCtx(f);
    const m = matchDish(x);
    if (m) return fit(m.ok ? m.label : `${m.flaw} ${m.label}`);
    return fit(describe(x));
  } catch {
    return 'Mystery Food';
  }
}

