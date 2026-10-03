import { describe, expect, it } from 'vitest';
import { CUT_SEQUENCES, makeFood, type FoodState, type Form } from '../src/food/types';
import { getDef, hasDef, INGREDIENTS, SEASONINGS } from '../src/food/catalog';
import {
  addSeasoning,
  applyCold,
  applyHeat,
  applyRoom,
  blend,
  combine,
  cut,
  enterStation,
  flatten,
  HEAT_METHODS,
  mash,
  mixBowl,
  panMerge,
  peel,
  potMerge,
  TOOL_FORMS,
  type HeatMethod,
  type StationKind,
} from '../src/food/process';
import { analyzeMeal, DISHES, nameFood, recognize, type MealAnalysis, type ReactionKind } from '../src/recipes';

// ---------------------------------------------------------------------------------------------
// helpers

const F = (id: string, form: Form = 'whole') => makeFood(id, form);

function cook(f: FoodState, method: HeatMethod, secs: number, dt = 0.05, heat = 1): FoodState {
  for (let t = 0; t < secs - 1e-9; t += dt) applyHeat(f, method, dt, heat);
  return f;
}

function chill(f: FoodState, secs: number): FoodState {
  for (let t = 0; t < secs - 1e-9; t += 0.1) applyCold(f, 0.1);
  return f;
}

function cuts(f: FoodState, n: number): FoodState {
  for (let i = 0; i < n; i++) f = cut(f)!;
  return f;
}

function season(f: FoodState, id: string, amount = 1): FoodState {
  addSeasoning(f, id, amount);
  return f;
}

const REACTIONS: ReactionKind[] = ['love', 'yum', 'okay', 'meh', 'yuck', 'gross', 'spicy', 'sour', 'burnt', 'frozen', 'weird-good', 'weird-bad', 'sugar-rush', 'tears'];
const CATEGORIES = ['breakfast', 'main', 'side', 'soup', 'salad', 'dessert', 'drink', 'snack', 'silly'];
const STYLES = ['bite', 'crunch', 'slurp', 'gulp', 'lick', 'chew'];
const DISH_IDS = new Set(DISHES.map((d) => d.id));

/** Everything an analysis promises: valid enums, finite numbers in range, short names. */
function checkAnalysis(a: MealAnalysis) {
  expect(REACTIONS).toContain(a.reaction);
  expect(CATEGORIES).toContain(a.category);
  expect(STYLES).toContain(a.eatStyle);
  expect(a.taste).toBeGreaterThanOrEqual(-1);
  expect(a.taste).toBeLessThanOrEqual(1);
  expect(a.weirdness).toBeGreaterThanOrEqual(0);
  expect(a.weirdness).toBeLessThanOrEqual(1);
  for (const [k, v] of Object.entries(a.flags)) {
    if (typeof v === 'number') {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(1);
    } else expect(typeof v, k).toBe('boolean');
  }
  expect(Number.isInteger(a.bites)).toBe(true);
  expect(a.bites).toBeGreaterThanOrEqual(1);
  expect(a.bites).toBeLessThanOrEqual(5);
  expect(a.name.length).toBeGreaterThan(0);
  expect(a.name.length).toBeLessThanOrEqual(32);
  expect(a.quip.length).toBeGreaterThan(0);
  expect(a.quip.length).toBeLessThanOrEqual(16);
  if (a.dishId !== null) expect(DISH_IDS.has(a.dishId)).toBe(true);
}

const good = (r: ReactionKind) => r === 'love' || r === 'yum';

// ---------------------------------------------------------------------------------------------

describe('cookbook', () => {
  it('has a sensible list of unique dishes with hints', () => {
    expect(DISHES.length).toBeGreaterThanOrEqual(50);
    expect(DISHES.length).toBeLessThanOrEqual(90);
    expect(DISH_IDS.size).toBe(DISHES.length);
    for (const d of DISHES) {
      expect(d.name.length).toBeGreaterThan(1);
      expect(d.name.length).toBeLessThanOrEqual(32);
      expect(d.hint.length).toBeGreaterThan(10);
      expect(CATEGORIES).toContain(d.category);
    }
  });
});

describe('Mochi eats realistic meals', () => {
  it('French fries: peel, cut to sticks, deep-fry', () => {
    let potato = peel(F('potato'))!;
    potato = cuts(potato, 3);
    expect(potato.form).toBe('sticks');
    cook(potato, 'deepfry', 5.5);
    expect(nameFood(potato)).toBe('French Fries');
    expect(recognize(potato)?.id).toBe('fries');
    const a = analyzeMeal(potato);
    checkAnalysis(a);
    expect(a.name).toBe('French Fries');
    expect(good(a.reaction)).toBe(true);
    expect(a.eatStyle).toBe('crunch');
    expect(a.blowFirst).toBe(true);
  });

  it('pizza: flatten dough, sauce + cheese + sliced sausage, bake', () => {
    let pizza = flatten(F('dough'))!;
    addSeasoning(pizza, 'tomato-sauce', 1);
    pizza = combine(pizza, F('cheese'));
    pizza = combine(pizza, cut(F('sausage'))!);
    expect(nameFood(pizza)).toMatch(/Raw .*Pizza/);
    expect(recognize(pizza)).toBeNull();
    cook(pizza, 'bake', 6);
    const dish = recognize(pizza);
    expect(dish?.id).toMatch(/pizza/);
    expect(nameFood(pizza)).toMatch(/Pizza/);
    const a = analyzeMeal(pizza);
    checkAnalysis(a);
    expect(a.dishId).toBe(dish!.id);
    expect(a.reaction).toBe('love');
    expect(a.category).toBe('main');

    let marg = flatten(F('dough'))!;
    addSeasoning(marg, 'tomato-sauce', 1);
    marg = combine(combine(marg, cut(F('mozzarella'))!), cut(F('basil'))!);
    cook(marg, 'bake', 6);
    expect(recognize(marg)?.id).toBe('margherita');
  });

  it('cheeseburger: bun halves + grilled patty + cheese + lettuce', () => {
    const patty = cook(F('patty'), 'grill', 8.5);
    let burger = combine(cut(F('bun'))!, patty);
    burger = combine(burger, cut(F('cheese'))!);
    burger = combine(burger, cut(F('lettuce'))!);
    expect(recognize(burger)?.name).toBe('Cheeseburger');
    expect(nameFood(burger)).toBe('Cheeseburger');
    const a = analyzeMeal(burger);
    checkAnalysis(a);
    expect(good(a.reaction)).toBe(true);
    // the same burger with a raw patty is not the dish and is gross
    const raw = combine(combine(cut(F('bun'))!, F('patty')), cut(F('cheese'))!);
    expect(recognize(raw)).toBeNull();
    expect(nameFood(raw)).toBe('Raw Cheeseburger');
    expect(analyzeMeal(raw).reaction).toBe('gross');
  });

  it('smoothie: strawberry + banana + milk in the blender', () => {
    const s = blend([F('strawberry'), F('banana'), F('milk')]);
    expect(recognize(s)?.id).toBe('smoothie');
    expect(nameFood(s)).toMatch(/Smoothie$/);
    expect(nameFood(s)).toContain('Strawberry');
    const a = analyzeMeal(s);
    checkAnalysis(a);
    expect(a.eatStyle).toBe('gulp');
    expect(a.flags.liquid).toBe(true);
    expect(good(a.reaction)).toBe(true);
    expect(nameFood(blend([F('orange')]))).toBe('Orange Juice');
  });

  it('raw chicken is gross, burnt toast is burnt', () => {
    const chicken = analyzeMeal(F('chicken'));
    checkAnalysis(chicken);
    expect(chicken.reaction).toBe('gross');
    expect(chicken.flags.raw).toBeGreaterThan(0.9);
    expect(chicken.inspect).toBe(true);

    const toast = cook(cut(F('bread'))!, 'toast', 24);
    expect(nameFood(toast)).toBe('Burnt Toast');
    const a = analyzeMeal(toast);
    checkAnalysis(a);
    expect(a.reaction).toBe('burnt');
    expect(a.dishId).toBe('burnt-toast');
    expect(a.flags.burnt).toBeGreaterThanOrEqual(0.5);

    const nice = cook(cut(F('bread'))!, 'toast', 7);
    expect(nameFood(nice)).toBe('Toast');
    expect(good(analyzeMeal(nice).reaction)).toBe(true);
  });

  it('chili is spicy, lemon is sour, raw onion makes tears, plain veggies are meh', () => {
    const chili = analyzeMeal(F('chili'));
    checkAnalysis(chili);
    expect(chili.reaction).toBe('spicy');
    expect(chili.flags.spicy).toBeGreaterThanOrEqual(0.6);
    const lemon = analyzeMeal(F('lemon'));
    expect(lemon.reaction).toBe('sour');
    expect(analyzeMeal(cuts(F('onion'), 3)).reaction).toBe('tears');
    expect(analyzeMeal(F('broccoli')).reaction).toBe('meh');
    // lemonade is balanced by sugar
    expect(good(analyzeMeal(blend([season(F('lemon'), 'sugar', 1.5)])).reaction)).toBe(true);
  });

  it('batter -> pan -> pancakes; egg -> pan -> fried egg; corn -> microwave -> popcorn', () => {
    const batter = enterStation(mixBowl([F('flour'), F('egg'), F('milk')]), 'pan');
    expect(analyzeMeal(batter).reaction).toBe('gross'); // raw batter
    cook(batter, 'fry', 3);
    expect(batter.id).toBe('pancake');
    expect(recognize(batter)?.id).toBe('pancakes');
    expect(good(analyzeMeal(batter).reaction)).toBe(true);
    expect(nameFood(season(batter, 'honey'))).toBe('Honey Pancakes');

    const egg = enterStation(F('egg'), 'pan');
    expect(nameFood(egg)).toBe('Cracked Egg');
    cook(egg, 'fry', 2.5);
    expect(nameFood(egg)).toBe('Fried Egg');
    expect(recognize(egg)?.id).toBe('fried-egg');

    const corn = cook(F('corn'), 'micro', 6, 0.05, 1.1);
    expect(nameFood(corn)).toBe('Popcorn');
    const a = analyzeMeal(corn);
    expect(a.eatStyle).toBe('crunch');
    expect(good(a.reaction)).toBe(true);
  });

  it('pot soup and hot chocolate', () => {
    const tomato = cook(F('tomato', 'diced'), 'boil', 4);
    const onion = cook(F('onion', 'diced'), 'boil', 4);
    const soup = potMerge([tomato, onion])!;
    expect(recognize(soup)?.id).toBe('tomato-soup');
    expect(nameFood(soup)).toBe('Tomato Soup');
    const a = analyzeMeal(soup);
    checkAnalysis(a);
    expect(a.eatStyle).toBe('slurp');
    expect(a.blowFirst).toBe(true);
    expect(a.category).toBe('soup');

    const cocoa = potMerge([cook(F('milk'), 'boil', 4), cook(F('chocolate'), 'boil', 4)])!;
    expect(nameFood(cocoa)).toBe('Hot Chocolate');
    expect(analyzeMeal(cocoa).dishId).toBe('hot-chocolate');
  });

  it('freezer: smoothie -> ice pop (licked), banana -> frozen banana, pizza -> brr', () => {
    const pop = chill(blend([F('strawberry'), F('banana'), F('milk')]), 12);
    expect(pop.id).toBe('icepop');
    expect(recognize(pop)?.id).toBe('ice-pop');
    expect(nameFood(pop)).toMatch(/Ice Pop$/);
    const a = analyzeMeal(pop);
    expect(a.eatStyle).toBe('lick');
    expect(good(a.reaction)).toBe(true);

    expect(recognize(chill(F('banana'), 10))?.id).toBe('frozen-banana');
    let pizza = flatten(F('dough'))!;
    addSeasoning(pizza, 'tomato-sauce', 1);
    pizza = cook(combine(pizza, F('cheese')), 'bake', 6);
    chill(pizza, 12);
    expect(nameFood(pizza)).toMatch(/^Frozen .*Pizza$/);
    expect(analyzeMeal(pizza).reaction).toBe('frozen');
  });

  it('recognises a wide range of dishes', () => {
    const bread = () => cut(F('bread'))!;
    const toast = () => cook(cut(F('bread'))!, 'toast', 7);
    const fries = () => cook(cuts(F('potato'), 3), 'deepfry', 5);
    const cases: [string, FoodState][] = [
      ['hot-dog', combine(F('hotdog-bun'), cook(F('sausage'), 'grill', 8))],
      ['bacon-burger', combine(combine(cut(F('bun'))!, cook(F('patty'), 'grill', 8)), cook(F('bacon'), 'fry', 6))],
      ['double-burger', combine(combine(cut(F('bun'))!, cook(F('patty'), 'grill', 8)), cook(F('patty'), 'grill', 8))],
      ['fish-burger', combine(cut(F('bun'))!, cook(F('fish'), 'fry', 10))],
      ['tofu-burger', combine(cut(F('bun'))!, F('tofu'))],
      ['grilled-cheese', cook(combine(bread(), cut(F('cheese'))!), 'fry', 3)],
      ['blt', combine(combine(combine(bread(), cook(F('bacon'), 'fry', 6)), cut(F('lettuce'))!), cuts(F('tomato'), 2))],
      ['ham-cheese', combine(combine(bread(), cut(F('ham'))!), cut(F('cheese'))!)],
      ['pbj', season(season(bread(), 'peanut-butter'), 'jam')],
      ['jam-toast', season(toast(), 'jam')],
      ['avocado-toast', combine(toast(), cuts(peel(F('avocado'))!, 2))],
      ['egg-toast', combine(toast(), cook(enterStation(F('egg'), 'pan'), 'fry', 2.5))],
      ['french-toast', cook(combine(bread(), mixBowl([F('egg'), F('milk')])), 'fry', 3)],
      ['garlic-bread', cook(combine(bread(), cuts(F('garlic'), 4)), 'bake', 3)],
      ['chips', cook(cuts(F('potato'), 2), 'deepfry', 4)],
      ['wedges', cook(cut(F('potato'))!, 'bake', 8)],
      ['mashed-potatoes', mixBowl([cook(F('potato'), 'boil', 10), F('butter')])],
      ['baked-potato', cook(F('potato'), 'bake', 10)],
      ['chocolate-cake', cook(mixBowl([F('flour'), F('egg'), F('milk'), F('chocolate')]), 'bake', 6)],
      ['carrot-cake', cook(mixBowl([F('flour'), F('egg'), F('milk'), cuts(F('carrot'), 2)]), 'bake', 6)],
      ['strawberry-cake', combine(cook(mixBowl([F('flour'), F('egg'), F('milk')]), 'bake', 6), cuts(F('strawberry'), 2))],
      ['cookies', cook(mixBowl([season(F('flour'), 'sugar'), F('butter'), F('egg'), F('chocolate')]), 'bake', 6)],
      ['donut', cook(F('dough'), 'deepfry', 6)],
      ['garden-salad', mixBowl([cut(F('lettuce'))!, cuts(F('tomato'), 3), cuts(F('cucumber'), 1)])],
      ['fruit-salad', mixBowl([cuts(F('apple'), 3), cuts(F('banana'), 1), F('blueberry')])],
      ['greek-salad', mixBowl([cuts(F('tomato'), 3), cuts(F('cucumber'), 2), cuts(F('cheese'), 2)])],
      ['caesar-salad', mixBowl([cut(F('lettuce'))!, cook(cuts(F('bread'), 2), 'bake', 2), cuts(F('cheese'), 2)])],
      ['caprese', combine(combine(cuts(F('tomato'), 2), cut(F('mozzarella'))!), cut(F('basil'))!)],
      ['guacamole', mixBowl([peel(F('avocado'))!, F('lemon'), cuts(F('onion'), 3)])],
      ['salsa', mixBowl([cuts(F('tomato'), 3), cuts(F('onion'), 3), cuts(F('chili'), 2)])],
      ['chicken-noodle-soup', potMerge([cook(F('drumstick'), 'boil', 12), cook(F('spaghetti'), 'boil', 8), cook(F('carrot'), 'boil', 9)])!],
      ['miso-soup', potMerge([cook(F('tofu'), 'boil', 6), cook(F('nori'), 'boil', 4)])!],
      ['pumpkin-soup', potMerge([cook(cuts(F('pumpkin'), 3), 'boil', 6), cook(F('onion'), 'boil', 8)])!],
      ['mushroom-soup', potMerge([cook(cuts(F('mushroom'), 3), 'boil', 4), cook(F('cream'), 'boil', 4)])!],
      ['potato-soup', potMerge([cook(cuts(F('potato'), 4), 'boil', 4), cook(cuts(F('onion'), 3), 'boil', 4)])!],
      ['fish-soup', potMerge([cook(cuts(F('fish'), 2), 'boil', 5), cook(cuts(F('carrot'), 2), 'boil', 4)])!],
      ['corn-soup', potMerge([cook(cuts(F('corn'), 2), 'boil', 4), cook(F('milk'), 'boil', 4)])!],
      ['veggie-soup', potMerge([cook(cuts(F('carrot'), 2), 'boil', 4), cook(cuts(F('peas'), 1), 'boil', 4), cook(cuts(F('broccoli'), 1), 'boil', 4)])!],
      ['milkshake', blend([F('ice-cream'), F('milk')])],
      ['juice', blend([F('apple')])],
      ['omelet', cook(panMerge([cook(enterStation(mixBowl([F('egg'), F('egg')]), 'pan'), 'fry', 0.3), cuts(F('cheese'), 2)])!, 'fry', 3)],
      ['scrambled-eggs', cook(enterStation(mixBowl([F('egg'), F('egg')]), 'pan'), 'fry', 3)],
      ['boiled-egg', cook(F('egg'), 'boil', 7)],
      ['stir-fry', panMerge([cook(cuts(F('bell-pepper'), 2), 'fry', 3), cook(cuts(F('onion'), 2), 'fry', 3), cook(cuts(F('steak'), 1), 'fry', 5)])!],
      ['fried-rice', panMerge([cook(cook(F('rice'), 'boil', 9), 'fry', 3), cook(F('peas'), 'fry', 3), enterStation(F('egg'), 'pan')])!],
      ['sushi', combine(combine(cook(F('rice'), 'boil', 8), cuts(F('salmon'), 1)), F('nori'))],
      ['tempura', cook(F('shrimp'), 'deepfry', 5)],
      ['spaghetti-pomodoro', season(cook(F('spaghetti'), 'boil', 8), 'tomato-sauce')],
      ['spaghetti-bolognese', season(combine(cook(F('spaghetti'), 'boil', 8), cook(cuts(F('patty'), 3), 'fry', 3)), 'tomato-sauce')],
      ['carbonara', combine(combine(cook(F('spaghetti'), 'boil', 8), cook(F('bacon'), 'fry', 6)), cook(F('egg'), 'boil', 7))],
      ['steak', cook(F('steak'), 'grill', 10)],
      ['roast-chicken', cook(F('drumstick'), 'bake', 12)],
      ['fried-chicken', cook(F('drumstick'), 'deepfry', 12)],
      ['fish-and-chips', combine(cook(F('fish'), 'deepfry', 10), fries())],
      ['grilled-salmon', cook(F('salmon'), 'grill', 8)],
      ['onion-rings', cook(cuts(F('onion'), 2), 'deepfry', 3)],
      ['popcorn', cook(F('corn'), 'micro', 5)],
      ['sundae', season(F('ice-cream'), 'chocolate-syrup')],
      ['banana-split', combine(cut(F('banana'))!, F('ice-cream'))],
      ['choco-strawberries', combine(F('strawberry'), cook(F('chocolate'), 'micro', 2))],
      ['smores', combine(combine(F('cookie'), cook(F('marshmallow'), 'micro', 1)), F('chocolate'))],
      ['nachos', cook(combine(cuts(F('tortilla'), 2), cuts(F('cheese'), 2)), 'bake', 3)],
      ['taco', combine(F('tortilla'), cook(cuts(F('steak'), 2), 'fry', 4))],
      ['quesadilla', cook(combine(F('tortilla'), cuts(F('cheese'), 2)), 'grill', 3)],
      ['burrito', combine(combine(F('tortilla'), cook(F('rice'), 'boil', 8)), cook(F('beans'), 'boil', 8))],
      ['grilled-corn', cook(F('corn'), 'grill', 8)],
      ['roasted-veggies', cook(combine(cuts(F('carrot'), 1), cuts(F('eggplant'), 1)), 'bake', 7)],
      ['baked-apple', cook(F('apple'), 'bake', 9)],
    ];
    const missing: string[] = [];
    for (const [id, f] of cases) {
      const got = recognize(f)?.id ?? null;
      if (got !== id) missing.push(`${id}: got ${got} (${nameFood(f)})`);
      const a = analyzeMeal(f);
      checkAnalysis(a);
      if (got === id && !['tears', 'sugar-rush', 'spicy'].includes(a.reaction)) expect(['love', 'yum', 'okay'], `${id} -> ${a.reaction} ${a.taste}`).toContain(a.reaction);
    }
    expect(missing).toEqual([]);
  });

  it('gives silly things fun names and reactions', () => {
    const fishChoc = analyzeMeal(combine(cook(F('fish'), 'grill', 10), F('chocolate')));
    expect(fishChoc.reaction).toBe('gross');
    expect(fishChoc.flags.gross).toBe(true);
    expect(fishChoc.dishId).toBeNull();
    expect(nameFood(blend([F('fish'), F('ice-cream'), F('milk')]))).toBe('Fish Milkshake');
    expect(nameFood(cook(F('ice-cream'), 'deepfry', 1))).toBe('Deep-Fried Ice Cream');
    expect(analyzeMeal(cook(F('banana'), 'boil', 8)).name).toMatch(/^Boiled Banana (Surprise|Special|Delight)$/);
    expect(nameFood(cook(cuts(F('carrot'), 1), 'fry', 2))).toBe('Fried Carrot Slices');
    expect(nameFood(cuts(F('tomato'), 2))).toBe('Sliced Tomato');
    expect(nameFood(cook(combine(flatten(F('dough'))!, cut(F('banana'))!), 'bake', 6))).toBe('Banana Pizza');
    const weird = ['salt', 'pepper', 'sugar', 'ketchup', 'mustard', 'jam'].reduce((f, s) => season(f, s), cook(F('steak'), 'grill', 10));
    expect(analyzeMeal(weird).reaction).toMatch(/^weird-/);
    expect(analyzeMeal(season(F('ice-cream'), 'chocolate-syrup', 1.2)).reaction).toBe('sugar-rush');
  });
});

describe('names', () => {
  it('names every ingredient in every form and state, briefly', () => {
    const states: ((f: FoodState) => FoodState)[] = [
      (f) => f,
      (f) => cook(f, 'fry', 4, 0.5),
      (f) => cook(f, 'boil', 8, 0.5),
      (f) => cook(f, 'bake', 30, 0.5),
      (f) => chill(f, 10),
      (f) => season(season(f, 'ketchup', 2), 'sprinkles', 2),
    ];
    for (const d of INGREDIENTS) {
      const forms = new Set<Form>([...CUT_SEQUENCES[d.cut], ...TOOL_FORMS]);
      for (const form of forms) {
        for (const st of states) {
          const f = st(F(d.id, form));
          const n = nameFood(f);
          expect(n.length, `${d.id}/${form}: ${n}`).toBeGreaterThan(0);
          expect(n.length, `${d.id}/${form}: ${n}`).toBeLessThanOrEqual(32);
          expect(n).not.toMatch(/undefined|NaN|null/);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Fuzz: random kitchens never throw and always produce renderable, analysable food.

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

const SPECIAL_FORMS: Record<string, string[]> = { egg: ['halved', 'sliced', 'diced'], baguette: ['halved'] };

function renderProblems(f: FoodState, depth = 0): string[] {
  const out: string[] = [];
  if (!f || depth > 14) return ['missing / too deep'];
  if (!Number.isFinite(f.seed)) out.push('seed');
  for (const [k, v] of Object.entries(f.cook ?? {})) if (!Number.isFinite(v)) out.push(`cook.${k}`);
  for (const [k, v] of Object.entries(f.season ?? {})) if (!Number.isFinite(v)) out.push(`season.${k}`);
  if (f.id === 'assembly') {
    if (!f.parts?.length) out.push('empty assembly');
    if (!['stack', 'topped', 'pile'].includes(f.layout ?? '')) out.push(`layout ${f.layout}`);
    if (!['whole', 'halved', 'sliced'].includes(f.form)) out.push(`assembly form ${f.form}`);
    for (const p of f.parts ?? []) out.push(...renderProblems(p, depth + 1));
  } else if (!hasDef(f.id)) out.push(`id ${f.id}`);
  else {
    const d = getDef(f.id);
    if (!(CUT_SEQUENCES[d.cut].includes(f.form) || TOOL_FORMS.includes(f.form) || (SPECIAL_FORMS[f.id] ?? []).includes(f.form))) out.push(`${f.id}/${f.form}`);
    if (f.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(f.tint)) out.push(`tint ${f.tint}`);
  }
  for (const p of f.from ?? []) if (!p || (p.id !== 'assembly' && !hasDef(p.id))) out.push('from');
  return out;
}

describe('fuzz', () => {
  it('random operation sequences never throw and keep food renderable', () => {
    const pantry = INGREDIENTS.filter((d) => d.pantry).map((d) => d.id);
    const stations: StationKind[] = ['board', 'bowl', 'pan', 'grill', 'pot', 'oven', 'fryer', 'blender', 'toaster', 'microwave', 'freezer', 'plate', 'counter'];
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed * 7919);
      const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
      let items: FoodState[] = Array.from({ length: 4 }, () => F(pick(pantry)));
      for (let step = 0; step < 60; step++) {
        const i = Math.floor(r() * items.length);
        const f = items[i];
        const op = Math.floor(r() * 16);
        let next: FoodState | null = null;
        switch (op) {
          case 0:
            next = cut(f);
            break;
          case 1:
            next = peel(f);
            break;
          case 2:
            next = flatten(f);
            break;
          case 3:
            next = mash(f);
            break;
          case 4:
            next = combine(f, items[(i + 1) % items.length]);
            break;
          case 5:
            next = enterStation(f, pick(stations));
            break;
          case 6:
          case 7:
            applyHeat(f, pick(HEAT_METHODS), r() * 3, r() * 1.5);
            break;
          case 8:
            applyCold(f, r() * 6);
            break;
          case 9:
            applyRoom(f, r() * 20);
            break;
          case 10:
            addSeasoning(f, pick(SEASONINGS).id, r() * 2);
            break;
          case 11:
            next = mixBowl(items.slice(0, 1 + Math.floor(r() * 3)));
            break;
          case 12:
            next = blend(items.slice(0, 1 + Math.floor(r() * 3)));
            break;
          case 13:
            next = potMerge(items.slice(0, 1 + Math.floor(r() * 3)));
            break;
          case 14:
            next = panMerge(items.slice(0, 2 + Math.floor(r() * 2)));
            break;
          default:
            items.push(F(pick(pantry)));
        }
        if (next) items[i] = next;
        if (items.length > 6) items = items.slice(-6);
        for (const it of items) {
          const probs = renderProblems(it);
          expect(probs, JSON.stringify(it).slice(0, 300)).toEqual([]);
          const n = nameFood(it);
          expect(n.length).toBeGreaterThan(0);
          expect(n.length).toBeLessThanOrEqual(40);
          if (step % 5 === 0) {
            checkAnalysis(analyzeMeal(it));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  }, 60_000);
});
