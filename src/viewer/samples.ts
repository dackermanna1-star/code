// Sample food states for the viewer (?dishes=1) and thumbnails.
import { makeFood, type FoodState, type Form } from '../food/types';

function f(id: string, form: Form = 'whole', mut?: (s: FoodState) => void): FoodState {
  const s = makeFood(id, form);
  mut?.(s);
  return s;
}
const cooked = (k: keyof FoodState['cook'], v = 1.1) => (s: FoodState) => {
  (s.cook as unknown as Record<string, number>)[k] = v;
};

export function sampleDishes(): { label: string; state: FoodState }[] {
  const burger: FoodState = {
    ...makeFood('assembly'),
    layout: 'stack',
    parts: [f('bun', 'halved'), f('patty', 'whole', cooked('grill')), f('cheese', 'sliced', (s) => (s.cook.melt = 0.4)), f('lettuce', 'leaves'), f('tomato', 'sliced')],
  };
  const sandwich: FoodState = {
    ...makeFood('assembly'),
    layout: 'stack',
    parts: [f('bread', 'sliced'), f('ham', 'sliced'), f('cheese', 'sliced'), f('lettuce', 'leaves')],
  };
  const pizza: FoodState = {
    ...makeFood('assembly'),
    layout: 'topped',
    parts: [
      f('dough', 'flat', (s) => {
        s.cook.bake = 1.1;
        s.season = { 'tomato-sauce': 1 };
      }),
      f('cheese', 'diced', (s) => {
        s.cook.bake = 1;
        s.cook.melt = 1;
      }),
      f('sausage', 'sliced', cooked('bake')),
      f('mushroom', 'sliced', cooked('bake')),
      f('basil', 'leaves'),
    ],
  };
  const pizzaCut: FoodState = { ...JSON.parse(JSON.stringify(pizza)), form: 'sliced' };
  const sandwichCut: FoodState = { ...JSON.parse(JSON.stringify(sandwich)), form: 'halved' };
  const fishChips: FoodState = { ...makeFood('assembly'), layout: 'pile', parts: [f('potato', 'sticks', (s) => { s.peeled = true; s.cook.deepfry = 1.1; }), f('fish', 'sliced', cooked('deepfry')), f('lemon', 'halved')] };
  const salad: FoodState = { ...makeFood('assembly'), layout: 'pile', parts: [f('lettuce', 'shredded'), f('tomato', 'diced'), f('cucumber', 'sliced'), f('carrot', 'shredded')] };
  const hotdog: FoodState = { ...makeFood('assembly'), layout: 'stack', parts: [f('hotdog-bun', 'halved'), f('sausage', 'whole', cooked('grill'))], season: { ketchup: 1, mustard: 1 } };
  const toast: FoodState = { ...makeFood('assembly'), layout: 'topped', parts: [f('bread', 'sliced', cooked('toast')), f('avocado', 'sliced'), f('egg', 'whole')] };
  return [
    { label: 'Burger', state: burger },
    { label: 'Sandwich', state: sandwich },
    { label: 'Pizza', state: pizza },
    { label: 'Pizza (sliced)', state: pizzaCut },
    { label: 'Sandwich (halved)', state: sandwichCut },
    { label: 'Fish & chips', state: fishChips },
    { label: 'Salad pile', state: salad },
    { label: 'Hot dog', state: hotdog },
    { label: 'Toast topped', state: toast },
  ];
}
