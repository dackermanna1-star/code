import { it } from 'vitest';
import { makeFood, type FoodState } from '../src/food/types';
import { applyHeat, addSeasoning, blend, combine, cut, flatten, mixBowl, potMerge, type HeatMethod } from '../src/food/process';
import { analyzeMeal, nameFood } from '../src/recipes';

const F = (id: string, form: FoodState['form'] = 'whole') => makeFood(id, form);
const cook = (f: FoodState, m: HeatMethod, s: number) => { for (let t = 0; t < s; t += 0.05) applyHeat(f, m, 0.05); return f; };
const cuts = (f: FoodState, n: number) => { for (let i = 0; i < n; i++) f = cut(f)!; return f; };
const sea = (f: FoodState, id: string, a = 1) => { addSeasoning(f, id, a); return f; };

it('explore2', () => {
  const rows: [string, FoodState][] = [];
  const add = (label: string, f: FoodState) => rows.push([label, f]);
  add('honey broccoli', sea(F('broccoli'), 'honey', 1.2));
  add('salty fries cubes', sea(cook(cuts(F('potato'), 4), 'fry', 3), 'salt', 2));
  add('steak + fries pile', combine(cook(F('steak'), 'grill', 10), cook(cuts(F('potato'), 3), 'deepfry', 5)));
  add('burger + fries', combine(combine(combine(cut(F('bun'))!, cook(F('patty'), 'grill', 8)), cut(F('cheese'))!), cook(cuts(F('potato'), 3), 'deepfry', 5)));
  add('apple + banana pile', combine(F('apple'), F('banana')));
  add('3 thing pile', combine(combine(F('apple'), F('steak')), F('gummy')));
  add('5 thing pile', combine(combine(combine(combine(F('apple'), F('steak')), F('gummy')), F('carrot')), F('cookie')));
  add('banana sandwich', combine(cut(F('bread'))!, cuts(F('banana'), 1)));
  add('fish jam burger', sea(combine(cut(F('bun'))!, cook(F('fish'), 'grill', 10)), 'jam'));
  add('bread bread', combine(cut(F('bread'))!, cut(F('bread'))!));
  add('gummy pizza', cook(combine(combine(flatten(F('dough'))!, F('gummy')), F('cheese')), 'bake', 6));
  add('pancake stack', combine(combine(F('pancake'), F('pancake')), F('pancake')));
  add('tortilla banana', combine(F('tortilla'), cuts(F('banana'), 1)));
  add('cake + strawberries', combine(cook(mixBowl([F('flour'), F('egg'), F('milk')]), 'bake', 6), cuts(F('strawberry'), 2)));
  add('nested', combine(combine(F('apple'), F('pear')), combine(cut(F('bun'))!, cook(F('patty'), 'grill', 8))));
  add('battered fish', cook(combine(F('fish'), mixBowl([F('flour'), F('egg'), F('milk')])), 'deepfry', 6));
  add('chocolate fish soup', potMerge([cook(F('fish'), 'boil', 10), cook(F('chocolate'), 'boil', 10)])!);
  add('carrot juice', blend([F('carrot')]));
  add('broccoli juice', blend([F('broccoli'), F('apple')]));
  add('gazpacho', blend([F('tomato'), F('cucumber')]));
  add('mystery mix', mixBowl([F('steak'), F('banana'), F('bread')]));
  add('meat smoothie', blend([F('steak'), F('bread')]));
  add('lots of seasonings', ['salt', 'pepper', 'sugar', 'ketchup', 'mustard', 'jam'].reduce((f, s) => sea(f, s), cook(F('steak'), 'grill', 10)));
  add('micro lettuce', cook(F('lettuce'), 'micro', 4));
  add('deepfried icecream 1s', cook(F('ice-cream'), 'deepfry', 1));
  add('grilled watermelon', cook(cuts(F('watermelon'), 2), 'grill', 6));
  add('frozen steak', (() => { const f = cook(F('steak'), 'grill', 10); f.cook.freeze = 1; return f; })());
  add('lemonade', blend([sea(F('lemon'), 'sugar', 1.5)]));
  add('guac', mixBowl([F('avocado'), F('lemon'), cuts(F('onion'), 3)]));
  add('long names', combine(combine(cuts(F('bell-pepper'), 2), cuts(F('watermelon'), 2)), cuts(F('marshmallow'), 1)));
  add('fried rice', (() => { const r = cook(F('rice'), 'boil', 9); cook(r, 'fry', 3); return combine(r, cook(cuts(F('carrot'), 2), 'fry', 3)); })());
  add('chips', cook(cuts(F('potato'), 2), 'deepfry', 4));
  add('wedges', cook(cut(F('potato'))!, 'bake', 8));
  add('ham cheese', combine(combine(cut(F('bread'))!, cut(F('ham'))!), cut(F('cheese'))!));
  add('blt', combine(combine(combine(cut(F('bread'))!, cook(F('bacon'), 'fry', 6)), cut(F('lettuce'))!), cuts(F('tomato'), 2)));
  add('bacon burger', combine(combine(cut(F('bun'))!, cook(F('patty'), 'grill', 8)), cook(F('bacon'), 'fry', 6)));
  add('double', combine(combine(cut(F('bun'))!, cook(F('patty'), 'grill', 8)), cook(F('patty'), 'grill', 8)));
  add('tofu burger', combine(cut(F('bun'))!, F('tofu')));
  add('fish burger', combine(cut(F('bun'))!, cook(F('fish'), 'fry', 10)));
  add('carbonara', combine(combine(cook(F('spaghetti'), 'boil', 8), cook(F('bacon'), 'fry', 6)), cook(F('egg'), 'boil', 7)));
  add('bolognese', sea(combine(cook(F('spaghetti'), 'boil', 8), cook(cuts(F('patty'), 3), 'fry', 3)), 'tomato-sauce'));
  add('chicken noodle', potMerge([cook(F('drumstick'), 'boil', 12), cook(F('spaghetti'), 'boil', 8), cook(F('carrot'), 'boil', 9)])!);
  add('miso', potMerge([cook(F('tofu'), 'boil', 6), cook(F('nori'), 'boil', 4)])!);
  add('pumpkin soup', potMerge([cook(cuts(F('pumpkin'), 3), 'boil', 6), cook(F('onion'), 'boil', 8)])!);
  add('burrito', combine(combine(F('tortilla'), cook(F('rice'), 'boil', 8)), cook(F('beans'), 'boil', 8)));
  add('hawaiian', cook(combine(combine(combine(flatten(F('dough'))!, F('cheese')), cuts(F('pineapple'), 3)), cuts(F('ham'), 2)), 'bake', 6));
  add('veggie pizza', cook(combine(combine(combine(sea(flatten(F('dough'))!, 'tomato-sauce'), F('cheese')), cuts(F('mushroom'), 2)), cuts(F('bell-pepper'), 2)), 'bake', 6));
  for (const [label, f] of rows) {
    const a = analyzeMeal(f);
    console.log(`${label.padEnd(22)} | ${nameFood(f).padEnd(30)} | ${a.name.padEnd(32)} | ${(a.dishId ?? '-').padEnd(18)} | ${a.reaction.padEnd(10)} t=${a.taste.toFixed(2)} w=${a.weirdness.toFixed(2)} ${a.eatStyle} ${a.category} "${a.quip}"`);
  }
});
it('weird-good probes', () => {
  const rows: [string, FoodState][] = [
    ['fries + ice cream', combine(cook(cuts(F('potato'), 3), 'deepfry', 5), F('ice-cream'))],
    ['choc bacon', sea(cook(F('bacon'), 'fry', 6), 'chocolate-syrup')],
    ['deep fried banana', cook(F('banana'), 'deepfry', 3)],
    ['deep fried candy squashed', cook(flatten(F('chocolate'))!, 'deepfry', 1)],
    ['boiled banana honey', sea(cook(F('banana'), 'boil', 8), 'honey')],
    ['pancake 4 sauces', ['honey', 'sprinkles', 'chocolate-syrup', 'whip'].reduce((f, s) => sea(f, s), F('pancake'))],
    ['5 good things pile', combine(combine(combine(combine(F('strawberry'), F('banana')), F('cookie')), F('marshmallow')), F('gummy'))],
  ];
  for (const [label, f] of rows) {
    const a = analyzeMeal(f);
    console.log(`${label.padEnd(26)} | ${a.name.padEnd(32)} | ${a.reaction.padEnd(10)} t=${a.taste.toFixed(2)} w=${a.weirdness.toFixed(2)}`);
  }
});
