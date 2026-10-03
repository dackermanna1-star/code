// The cookbook: dishes Mochi recognises, with a structural matcher and a dynamic label each.
// Order matters: the first matching dish wins, so specific dishes come before generic ones.

import type { FoodState } from '../food/types';
import {
  type Comp,
  type Ctx,
  type Pred,
  type Unit,
  and,
  breadSlice,
  buildCtx,
  cheese,
  cookedEgg,
  count,
  distinct,
  eggDish,
  fishy,
  formIn,
  fruit,
  has,
  ing,
  is,
  meat,
  not,
  only,
  or,
  sandwichBread,
  sea,
  share,
  toasted,
  veg,
} from './context';
import { burntScore, clashes, frozenScore, majorRaw, rawScore } from './quality';
import { adjOf, firstFit, flavorWords, heaviest, joinWords } from './words';

export type MealCategory = 'breakfast' | 'main' | 'side' | 'soup' | 'salad' | 'dessert' | 'drink' | 'snack' | 'silly';

export interface DishInfo {
  id: string;
  name: string;
  category: MealCategory;
  /** Gentle, kid-friendly recipe hint for the cookbook. */
  hint: string;
}

export interface DishDef extends DishInfo {
  match: (x: Ctx) => boolean;
  /** Name for this particular plate ("Blueberry Pancakes"); defaults to `name`. */
  label?: (x: Ctx) => string;
  /** Why it is not quite the dish yet ("Raw" pizza dough), or null. */
  needs?: (x: Ctx) => string | null;
  allowRaw?: (u: Unit) => boolean;
  /** Burnt is part of the dish (burnt toast). */
  burntOk?: boolean;
  /** Frozen is part of the dish. */
  cold?: boolean;
  /** Kid favourite: extra taste bonus. */
  fav?: boolean;
  /** A very simple dish (toast, boiled egg): smaller bonus. */
  simple?: boolean;
}

const DEFS: DishDef[] = [];
function dish(id: string, name: string, category: MealCategory, hint: string, match: (x: Ctx) => boolean, extra: Partial<DishDef> = {}) {
  DEFS.push({ id, name, category, hint, match, ...extra });
}

// ---------------------------------------------------------------------------------------------
// Shared bits

const anyOf = (x: Ctx, ...ids: string[]) => has(x, is(...ids));
const cooked = (min: number): Pred => (c) => c.done >= min;
const dried = (min: number): Pred => (c) => c.dry >= min;
const method = (m: keyof Comp['cook'], min: number): Pred => (c) => c.cook[m] >= min;
const boiledStarch = (id: string): Pred => (c) => c.id === id && c.cook.boil >= 0.6;
const fries: Pred = (c) => c.id === 'potato' && c.form === 'sticks' && (c.cook.deepfry >= 0.5 || c.cook.fry >= 0.6 || c.cook.bake >= 0.7 || c.cook.grill >= 0.7);
const withFries = (x: Ctx, name: string) => (has(x, fries) && x.comps.some((c) => !fries(c)) ? firstFit(`${name} & Fries`, name) : name);
const sweetOn = (x: Ctx, ...ids: string[]) => ids.some((id) => sea(x, id, 0.2));
const SWEET_FRUIT = ['strawberry', 'blueberry', 'banana', 'apple', 'cherry', 'peach', 'mango', 'pineapple', 'orange', 'pear', 'kiwi', 'grapes', 'watermelon', 'lemon', 'coconut'];
const fruitIds = (x: Ctx) => SWEET_FRUIT.filter((id) => x.ingredients.has(id));

// pizza
function pizzaBase(x: Ctx): Comp | null {
  const b = x.base;
  if (!b) return null;
  if ((b.id === 'dough' && b.form === 'flat') || (b.id === 'flatbread' && b.form === 'whole')) return b;
  return null;
}
const pizzaSauce = (x: Ctx) => sea(x, 'tomato-sauce', 0.2) || sea(x, 'ketchup', 0.5) || has(x, and(is('tomato'), not(formIn('whole'))));
const isPizza = (x: Ctx) => !!pizzaBase(x) && x.comps.length >= 2 && (has(x, cheese) || pizzaSauce(x));
const pizzaNeeds = (x: Ctx) => {
  const b = pizzaBase(x);
  return b && b.id === 'dough' && b.dry < 0.3 ? 'Raw' : null;
};

// burgers
const bun = (x: Ctx) => anyOf(x, 'bun');
const patty: Pred = is('patty');

// sandwiches
const fillings = (x: Ctx) => x.comps.filter((c) => !sandwichBread(c) && c.id !== 'butter');

// salads
const rawProduce: Pred = (c) => (fruit(c) || veg(c) || c.id === 'basil') && c.dry < 0.3 && c.cook.boil < 0.5;
function saladish(x: Ctx): boolean {
  return (
    x.layout !== null &&
    x.comps.length >= 2 &&
    !has(x, sandwichBread) &&
    !pizzaBase(x) &&
    !anyOf(x, 'tortilla', 'bun', 'hotdog-bun', 'pancake', 'cake', 'spaghetti', 'rice') &&
    share(x, rawProduce) >= 0.5
  );
}
const GUAC = ['avocado', 'lemon', 'onion', 'tomato', 'chili', 'garlic', 'basil', 'bell-pepper', 'corn'];

// soups & drinks
const mainComp = (x: Ctx, id: string) => share(x, is(id)) >= 0.5;
const AROMATICS = ['onion', 'garlic', 'basil', 'chili', 'lemon', 'bell-pepper'];
function soupMain(x: Ctx): string | null {
  let solids = x.units.filter((u) => u.via === 'soup' && u.def && !u.def.tags.includes('liquid') && u.def.category !== 'product');
  if (solids.some((u) => !AROMATICS.includes(u.id))) solids = solids.filter((u) => !AROMATICS.includes(u.id));
  const total = solids.reduce((s, u) => s + u.mass, 0);
  if (!total) return null;
  const [top] = heaviest(solids, 1);
  const topShare = solids.filter((u) => u.id === top).reduce((s, u) => s + u.mass, 0) / total;
  return topShare >= 0.3 ? top : null;
}
const isSoup = (x: Ctx) => mainComp(x, 'soup');
const isDrink = (x: Ctx) => mainComp(x, 'drink');
const drinkFruits = (x: Ctx) => [...new Set(x.units.filter((u) => u.via === 'drink' && u.def?.category === 'fruit').map((u) => u.id))];
const drinkDairy = (x: Ctx) => x.units.some((u) => u.via === 'drink' && ['milk', 'yogurt', 'cream', 'sweet-cream'].includes(u.id));
const hot = (x: Ctx) => x.comps.some((c) => c.temp >= 0.25 || c.cook.boil >= 0.3);

// ---------------------------------------------------------------------------------------------
// The dishes (priority order)

dish('burnt-toast', 'Burnt Toast', 'silly', 'Leave bread in the toaster for way, way too long...',
  (x) => has(x, and(is('bread'), (c) => c.burn >= 0.5)) && only(x, or(is('bread'), is('butter'))),
  { burntOk: true });

dish('sushi', 'Sushi', 'main', 'Boil rice, add raw salmon and wrap it with seaweed.',
  (x) => has(x, boiledStarch('rice')) && anyOf(x, 'salmon', 'fish') && anyOf(x, 'nori'),
  { allowRaw: (u) => u.id === 'salmon' || u.id === 'fish', label: (x) => (anyOf(x, 'salmon') ? 'Salmon Sushi' : 'Sushi') });

// pizza
dish('margherita', 'Margherita Pizza', 'main', 'Flat dough, tomato sauce, mozzarella and basil. Bake!',
  (x) => isPizza(x) && anyOf(x, 'basil') && anyOf(x, 'mozzarella', 'cheese') && pizzaSauce(x) && only(x, is('dough', 'flatbread', 'basil', 'mozzarella', 'cheese', 'tomato', 'garlic')),
  { needs: pizzaNeeds, fav: true });
dish('pepperoni-pizza', 'Pepperoni Pizza', 'main', 'Roll the dough flat, add sauce, cheese and sausage slices, then bake.',
  (x) => isPizza(x) && has(x, and(is('sausage'), formIn('sliced', 'diced', 'minced'))),
  { needs: pizzaNeeds, fav: true });
dish('pizza', 'Pizza', 'main', 'Roll dough flat with the rolling pin, add sauce and cheese, bake!',
  isPizza,
  {
    needs: pizzaNeeds,
    fav: true,
    label: (x) => {
      if (anyOf(x, 'pineapple') && anyOf(x, 'ham')) return 'Hawaiian Pizza';
      const tops = x.comps.filter((c) => c.slot !== 0 && !cheese(c) && c.id !== 'tomato' && c.id !== 'basil');
      if (!tops.length) return 'Cheese Pizza';
      const m = tops.find(meat) ?? tops.find(fishy);
      if (m) return firstFit(`${adjOf(m.id)} Pizza`, 'Pizza');
      if (tops.every((c) => veg(c) || fruit(c))) return tops.length === 1 ? firstFit(`${adjOf(tops[0].id)} Pizza`, 'Veggie Pizza') : 'Veggie Pizza';
      return firstFit(`${adjOf(tops[0].id)} Pizza`, 'Pizza');
    },
  });

// buns
dish('hot-dog', 'Hot Dog', 'main', 'Cook a sausage and tuck it into a hot dog bun.',
  (x) => anyOf(x, 'hotdog-bun', 'bun') && anyOf(x, 'sausage') && !has(x, patty),
  { fav: true, label: (x) => withFries(x, 'Hot Dog') });
dish('double-burger', 'Double Burger', 'main', 'Two grilled patties in one bun!',
  (x) => bun(x) && count(x, patty) >= 2,
  { fav: true, label: (x) => withFries(x, has(x, cheese) ? 'Double Cheeseburger' : 'Double Burger') });
dish('bacon-burger', 'Bacon Burger', 'main', 'Burger patty plus crispy bacon in a bun.',
  (x) => bun(x) && has(x, patty) && anyOf(x, 'bacon'),
  { fav: true, label: (x) => withFries(x, has(x, cheese) ? 'Bacon Cheeseburger' : 'Bacon Burger') });
dish('cheeseburger', 'Cheeseburger', 'main', 'Grill a patty, put it in a cut bun with cheese.',
  (x) => bun(x) && has(x, patty) && has(x, cheese),
  { fav: true, label: (x) => withFries(x, 'Cheeseburger') });
dish('fish-burger', 'Fish Burger', 'main', 'Cook some fish and put it in a burger bun.',
  (x) => bun(x) && anyOf(x, 'fish', 'salmon') && !has(x, patty),
  { label: (x) => withFries(x, 'Fish Burger') });
dish('tofu-burger', 'Tofu Burger', 'main', 'A veggie burger: tofu in a bun with salad.',
  (x) => bun(x) && anyOf(x, 'tofu') && !has(x, patty) && !has(x, fishy),
  { label: (x) => withFries(x, 'Tofu Burger') });
dish('burger', 'Hamburger', 'main', 'Grill a burger patty and put it in a cut bun.',
  (x) => bun(x) && (has(x, patty) || anyOf(x, 'chicken', 'drumstick', 'steak')),
  {
    fav: true,
    label: (x) => withFries(x, has(x, patty) ? 'Hamburger' : anyOf(x, 'steak') ? 'Steak Burger' : 'Chicken Burger'),
  });

// sandwiches & toast
dish('pbj', 'PB&J Sandwich', 'breakfast', 'Spread peanut butter and jam on bread.',
  (x) => anyOf(x, 'bread', 'baguette', 'croissant') && sea(x, 'peanut-butter', 0.2) && sea(x, 'jam', 0.2),
  { fav: true });
dish('blt', 'BLT', 'main', 'Bacon, lettuce and tomato between bread slices.',
  (x) => has(x, sandwichBread) && anyOf(x, 'bacon') && anyOf(x, 'lettuce') && anyOf(x, 'tomato'));
dish('ham-cheese', 'Ham & Cheese Sandwich', 'main', 'Ham and cheese between two slices of bread.',
  (x) => has(x, sandwichBread) && anyOf(x, 'ham') && has(x, cheese),
  { label: (x) => (has(x, and(sandwichBread, dried(0.3))) ? 'Toasted Ham & Cheese' : 'Ham & Cheese Sandwich') });
dish('grilled-cheese', 'Grilled Cheese', 'main', 'Cheese between bread slices, toasted in the pan.',
  (x) => has(x, sandwichBread) && has(x, cheese) && only(x, or(sandwichBread, cheese, is('butter'))) && (has(x, and(sandwichBread, dried(0.25))) || has(x, and(cheese, (c) => c.melt >= 0.4))),
  { fav: true });
dish('french-toast', 'French Toast', 'breakfast', 'Pour beaten eggs over bread, then fry it.',
  (x) => has(x, breadSlice) && anyOf(x, 'beaten-egg', 'scrambled-eggs') && has(x, and(breadSlice, dried(0.25))));
dish('avocado-toast', 'Avocado Toast', 'breakfast', 'Toast bread, then add avocado.',
  (x) => has(x, toasted) && (anyOf(x, 'avocado') || has(x, (c) => c.id === 'mixture' && c.inner.includes('avocado'))));
dish('egg-toast', 'Egg on Toast', 'breakfast', 'Put a fried or scrambled egg on toast.',
  (x) => has(x, toasted) && has(x, eggDish) && only(x, or(is('bread', 'butter', 'cheese', 'bacon', 'avocado'), eggDish)));
dish('jam-toast', 'Jam Toast', 'breakfast', 'Toast a slice of bread and spread jam on it.',
  (x) => has(x, toasted) && sea(x, 'jam', 0.2) && only(x, is('bread', 'butter')));
dish('garlic-bread', 'Garlic Bread', 'side', 'Bread with chopped garlic (and butter), baked or toasted.',
  (x) => anyOf(x, 'garlic') && has(x, and(is('bread', 'baguette'), dried(0.3))) && only(x, is('bread', 'baguette', 'garlic', 'butter', 'cheese', 'mozzarella', 'basil')),
  { fav: true });
dish('toast', 'Toast', 'breakfast', 'Pop a slice of bread in the toaster.',
  (x) => has(x, toasted) && only(x, is('bread', 'butter')),
  {
    simple: true,
    label: (x) => {
      if (sea(x, 'peanut-butter', 0.2)) return 'Peanut Butter Toast';
      if (sea(x, 'honey', 0.2)) return 'Honey Toast';
      if (sea(x, 'cinnamon', 0.2) && sea(x, 'sugar', 0.2)) return 'Cinnamon Toast';
      if (sea(x, 'chocolate-syrup', 0.2)) return 'Chocolate Toast';
      if (anyOf(x, 'butter')) return 'Buttered Toast';
      return 'Toast';
    },
  });
dish('sandwich', 'Sandwich', 'main', 'Put anything you like between two slices of bread.',
  (x) => has(x, sandwichBread) && fillings(x).length > 0 && fillings(x).every((c) => !['drink', 'soup'].includes(c.id)),
  {
    label: (x) => {
      const f = fillings(x);
      const kind = anyOf(x, 'baguette') ? 'Sub' : anyOf(x, 'croissant') ? 'Croissant' : 'Sandwich';
      if (f.length >= 2 && f.every((c) => veg(c) || cheese(c) || c.id === 'basil')) return `Veggie ${kind}`;
      if (f.some(eggDish)) return `Egg ${kind}`;
      const words = heaviest(f, 2).map(adjOf);
      return firstFit(`${joinWords(words)} ${kind}`, `${words[0]} ${kind}`, kind);
    },
  });

// tortillas
dish('burrito', 'Burrito', 'main', 'Wrap rice and beans (or meat) in a tortilla.',
  (x) => anyOf(x, 'tortilla') && has(x, boiledStarch('rice')) && (anyOf(x, 'beans') || has(x, meat)));
dish('nachos', 'Nachos', 'snack', 'Cut a tortilla into chips and melt cheese on top.',
  (x) => has(x, and(is('tortilla'), formIn('halved', 'sliced', 'diced'))) && has(x, cheese),
  { fav: true });
dish('quesadilla', 'Quesadilla', 'main', 'Cheese on a tortilla, warmed until melty.',
  (x) => anyOf(x, 'tortilla') && has(x, cheese) && (has(x, and(is('tortilla'), dried(0.25))) || has(x, and(cheese, (c) => c.melt >= 0.4))));
dish('taco', 'Taco', 'main', 'Fill a tortilla with cooked meat, fish or beans and toppings.',
  (x) => has(x, and(is('tortilla'), formIn('whole', 'halved'))) && (has(x, meat) || has(x, fishy) || anyOf(x, 'beans', 'tofu')),
  {
    label: (x) => {
      const m = x.comps.find(meat) ?? x.comps.find(fishy);
      if (m) return firstFit(`${m.id === 'patty' ? 'Beef' : adjOf(m.id)} Taco`, 'Taco');
      return anyOf(x, 'beans') ? 'Bean Taco' : 'Tofu Taco';
    },
  });

dish('fish-and-chips', 'Fish & Chips', 'main', 'Deep-fry fish and potato sticks, serve together.',
  (x) => has(x, and(is('fish', 'salmon'), (c) => c.cook.deepfry >= 0.4 || c.cook.fry >= 0.5)) && has(x, and(is('potato'), formIn('sticks', 'sliced', 'halved'), dried(0.4))),
  { fav: true });

// pasta
const spaghetti = (x: Ctx) => anyOf(x, 'spaghetti');
const tomatoey = (x: Ctx) => sea(x, 'tomato-sauce', 0.2) || anyOf(x, 'tomato') || sea(x, 'ketchup', 0.5);
dish('carbonara', 'Spaghetti Carbonara', 'main', 'Boiled spaghetti with bacon, egg and cheese.',
  (x) => spaghetti(x) && anyOf(x, 'bacon') && (has(x, eggDish) || anyOf(x, 'beaten-egg', 'egg')),
  { fav: true });
dish('spaghetti-bolognese', 'Spaghetti Bolognese', 'main', 'Boiled spaghetti with tomato sauce and chopped beef.',
  (x) => spaghetti(x) && tomatoey(x) && has(x, or(patty, and(is('steak'), formIn('minced', 'diced', 'strips')))),
  { fav: true });
dish('spaghetti-pomodoro', 'Spaghetti Pomodoro', 'main', 'Boil spaghetti, then add tomato sauce.',
  (x) => spaghetti(x) && tomatoey(x) && !has(x, meat) && !has(x, fishy),
  { fav: true });

// pan dishes
dish('fried-rice', 'Fried Rice', 'main', 'Fry boiled rice with egg and veggies in the pan.',
  (x) => has(x, and(boiledStarch('rice'), (c) => Math.max(c.cook.fry, c.cook.grill) >= 0.2)) && x.comps.length >= 2);
dish('stir-fry', 'Stir-Fry', 'main', 'Chop veggies (and meat), fry them together in the pan.',
  (x) =>
    x.layout === 'pile' &&
    distinct(x, () => true) >= 2 &&
    only(x, (c) => (Math.max(c.cook.fry, c.cook.grill) >= 0.3 && (c.form !== 'whole' || c.def?.cut === 'bunch')) || eggDish(c) || boiledStarch('spaghetti')(c)) &&
    (has(x, veg) || has(x, meat) || anyOf(x, 'tofu')),
  {
    label: (x) => {
      if (anyOf(x, 'spaghetti')) return 'Noodle Stir-Fry';
      const m = x.comps.find(meat) ?? x.comps.find(fishy);
      if (m) return firstFit(`${m.id === 'patty' ? 'Beef' : adjOf(m.id)} Stir-Fry`, 'Stir-Fry');
      return anyOf(x, 'tofu') ? 'Tofu Stir-Fry' : 'Veggie Stir-Fry';
    },
  });
dish('tempura', 'Shrimp Tempura', 'main', 'Deep-fry shrimp until golden and crunchy.',
  (x) => has(x, and(is('shrimp'), method('deepfry', 0.4))) && share(x, is('shrimp')) >= 0.4);

// salads & dips
dish('caesar-salad', 'Caesar Salad', 'salad', 'Lettuce, croutons (diced bread) and cheese.',
  (x) => anyOf(x, 'lettuce') && has(x, and(is('bread', 'baguette'), formIn('diced'))) && (has(x, cheese) || sea(x, 'mayo', 0.2)));
dish('greek-salad', 'Greek Salad', 'salad', 'Chopped tomato, cucumber and cheese.',
  (x) => saladish(x) && anyOf(x, 'tomato') && anyOf(x, 'cucumber') && has(x, cheese));
dish('caprese', 'Caprese', 'salad', 'Tomato slices with mozzarella and basil.',
  (x) => anyOf(x, 'tomato') && anyOf(x, 'mozzarella') && only(x, is('tomato', 'mozzarella', 'basil')),
  { label: () => 'Caprese Salad' });
dish('salsa', 'Salsa', 'side', 'Chop tomato and onion (and a little chili). Mix!',
  (x) => anyOf(x, 'tomato') && anyOf(x, 'onion') && only(x, is('tomato', 'onion', 'chili', 'bell-pepper', 'basil', 'garlic', 'lemon', 'corn')) && has(x, and(is('tomato'), not(formIn('whole')))));
dish('guacamole', 'Guacamole', 'side', 'Mash avocado with lemon, onion and tomato.',
  (x) =>
    has(x, (c) => c.id === 'mixture' && c.inner.includes('avocado') && c.inner.every((id) => id === 'mixture' || GUAC.includes(id))) ||
    (has(x, and(is('avocado'), formIn('mashed'))) && only(x, is(...GUAC))));
dish('fruit-salad', 'Fruit Salad', 'salad', 'Chop two or more fruits and mix them in a bowl.',
  (x) => saladish(x) && distinct(x, fruit) >= 2 && share(x, fruit) >= 0.6);
dish('garden-salad', 'Garden Salad', 'salad', 'Chop lettuce, tomato and cucumber and toss them together.',
  (x) => saladish(x) && distinct(x, or(veg, is('basil'))) >= 2 && share(x, or(veg, fruit, is('basil'))) >= 0.6);

// desserts
const scoop = is('ice-cream', 'scoops');
dish('banana-split', 'Banana Split', 'dessert', 'Banana with ice cream on top (and sauce!).',
  (x) => anyOf(x, 'banana') && has(x, scoop),
  { cold: true, fav: true });
dish('sundae', 'Ice Cream Sundae', 'dessert', 'Ice cream with chocolate sauce, sprinkles or fruit.',
  (x) => has(x, scoop) && (sweetOn(x, 'chocolate-syrup', 'sprinkles', 'whip', 'jam', 'honey', 'peanut-butter') || anyOf(x, 'cherry', 'nuts', 'strawberry', 'chocolate', 'cookie', 'marshmallow', 'blueberry', 'gummy', 'candy', 'donut', 'whipped-cream')),
  { cold: true, fav: true });
dish('smores', "S'mores", 'dessert', 'Cookie + toasted marshmallow + chocolate.',
  (x) => anyOf(x, 'cookie') && anyOf(x, 'marshmallow') && (anyOf(x, 'chocolate') || sea(x, 'chocolate-syrup', 0.2)),
  { fav: true });
dish('choco-strawberries', 'Chocolate Strawberries', 'dessert', 'Strawberries with melted chocolate.',
  (x) => anyOf(x, 'strawberry') && (anyOf(x, 'chocolate') || sea(x, 'chocolate-syrup', 0.2)) && only(x, is('strawberry', 'chocolate')),
  { fav: true });
dish('frozen-banana', 'Frozen Banana', 'dessert', 'Put a banana in the freezer (chocolate optional).',
  (x) => has(x, and(is('banana'), (c) => c.freeze >= 0.6)) && only(x, is('banana', 'chocolate', 'nuts')),
  { cold: true, label: (x) => (anyOf(x, 'chocolate') || sea(x, 'chocolate-syrup', 0.2) ? 'Choco Frozen Banana' : 'Frozen Banana') });
dish('ice-pop', 'Ice Pop', 'dessert', 'Blend a smoothie and freeze it.',
  (x) => mainComp(x, 'icepop'),
  {
    cold: true,
    fav: true,
    label: (x) => {
      if (x.ingredients.has('soup')) return 'Soup Pop';
      const w = flavorWords(x.ingredients, 1);
      return firstFit(w.length ? `${w[0]} Ice Pop` : 'Ice Pop', 'Ice Pop');
    },
  });
dish('baked-apple', 'Baked Apple', 'dessert', 'Bake a whole apple in the oven (try cinnamon!).',
  (x) => has(x, and(is('apple'), formIn('whole', 'halved'), dried(0.5))) && share(x, is('apple')) >= 0.5,
  { label: (x) => (sea(x, 'cinnamon', 0.2) ? 'Cinnamon Baked Apple' : 'Baked Apple') });

// pancakes, cakes, cookies, donuts
const pancakes = (x: Ctx) => share(x, is('pancake')) >= 0.35;
dish('pancakes', 'Pancakes', 'breakfast', 'Mix flour, egg and milk, then pour the batter in the pan.',
  pancakes,
  {
    fav: true,
    label: (x) => {
      if (ing(x, 'chocolate') || sea(x, 'chocolate-syrup', 0.2)) return 'Chocolate Pancakes';
      const f = fruitIds(x);
      if (f.length) return firstFit(`${adjOf(f.includes('blueberry') ? 'blueberry' : f[0])} Pancakes`, 'Fruity Pancakes');
      if (sea(x, 'honey', 0.2)) return 'Honey Pancakes';
      if (count(x, is('pancake')) >= 3) return 'Pancake Stack';
      return 'Pancakes';
    },
  });
const cake = (x: Ctx) => share(x, is('cake')) >= 0.35;
dish('carrot-cake', 'Carrot Cake', 'dessert', 'Put carrot in the cake batter, then bake.', (x) => cake(x) && ing(x, 'carrot'), { fav: true });
dish('chocolate-cake', 'Chocolate Cake', 'dessert', 'Add chocolate to cake batter and bake it.', (x) => cake(x) && (ing(x, 'chocolate') || sea(x, 'chocolate-syrup', 0.2)), { fav: true });
dish('strawberry-cake', 'Strawberry Cake', 'dessert', 'Bake a cake and top it with strawberries.', (x) => cake(x) && ing(x, 'strawberry'), { fav: true });
dish('cake', 'Cake', 'dessert', 'Bake batter in the oven.',
  cake,
  {
    fav: true,
    label: (x) => {
      const f = fruitIds(x);
      if (f.length) return firstFit(`${adjOf(f[0])} Cake`, 'Fruit Cake');
      if (sea(x, 'sprinkles', 0.2)) return 'Party Cake';
      return 'Vanilla Cake';
    },
  });
dish('cookies', 'Cookies', 'dessert', 'Flour, butter, sugar and egg make cookie dough. Bake it!',
  (x) => has(x, (c) => c.id === 'cookie' && (c.s.from?.length ?? 0) > 0) && share(x, is('cookie')) >= 0.4,
  { fav: true, label: (x) => (ing(x, 'chocolate') ? 'Choc Chip Cookies' : x.comps.some((c) => c.id === 'cookie' && c.form === 'whole') ? 'Giant Cookie' : 'Cookies') });
dish('donut', 'Donut', 'dessert', 'Drop dough in the deep fryer.',
  (x) => has(x, (c) => c.id === 'donut' && (c.s.from?.length ?? 0) > 0) && share(x, is('donut')) >= 0.4,
  { fav: true, label: (x) => (sea(x, 'sprinkles', 0.2) ? 'Sprinkle Donut' : sea(x, 'chocolate-syrup', 0.2) ? 'Chocolate Donut' : 'Donut') });

// eggs
dish('omelet', 'Omelet', 'breakfast', 'Beaten eggs and chopped fillings in the frying pan.',
  (x) => share(x, is('omelet')) >= 0.4,
  {
    label: (x) => {
      const inner = new Set(x.comps.filter(is('omelet')).flatMap((c) => c.inner));
      if (inner.has('ham') && (inner.has('cheese') || inner.has('mozzarella'))) return 'Ham & Cheese Omelet';
      if (inner.has('cheese') || inner.has('mozzarella')) return 'Cheese Omelet';
      const w = flavorWords([...inner], 1);
      if ([...inner].some((id) => ['tomato', 'onion', 'bell-pepper', 'mushroom', 'broccoli', 'peas', 'basil', 'chili'].includes(id))) return 'Veggie Omelet';
      return w.length ? firstFit(`${w[0]} Omelet`, 'Omelet') : 'Omelet';
    },
  });
dish('scrambled-eggs', 'Scrambled Eggs', 'breakfast', 'Beat eggs in the bowl, then cook them in the pan.',
  (x) => share(x, is('scrambled-eggs')) >= 0.4 && only(x, or(is('scrambled-eggs', 'bacon', 'sausage', 'tomato', 'mushroom', 'ham', 'bread', 'butter'), cheese)),
  { label: (x) => (anyOf(x, 'bacon') ? 'Eggs & Bacon' : ing(x, 'cheese', 'mozzarella') ? 'Cheesy Scrambled Eggs' : 'Scrambled Eggs') });
dish('fried-egg', 'Fried Egg', 'breakfast', 'Crack an egg into the hot frying pan.',
  (x) => anyOf(x, 'fried-egg') && only(x, or(is('fried-egg', 'bacon', 'sausage', 'tomato', 'mushroom', 'beans', 'ham'), cheese)),
  { simple: true, label: (x) => (anyOf(x, 'bacon') ? 'Bacon & Eggs' : anyOf(x, 'sausage') ? 'Sausage & Egg' : count(x, is('fried-egg')) >= 2 ? 'Fried Eggs' : 'Fried Egg') });
dish('boiled-egg', 'Boiled Egg', 'breakfast', 'Put an egg in the boiling pot for a while.',
  (x) => has(x, cookedEgg) && share(x, cookedEgg) >= 0.5,
  { simple: true, label: (x) => (count(x, cookedEgg) >= 2 ? 'Boiled Eggs' : 'Boiled Egg') });

// potatoes
dish('fries', 'French Fries', 'side', 'Peel a potato, cut it into sticks, deep-fry!',
  (x) => has(x, fries) && share(x, or(is('potato'), cheese)) >= 0.6,
  { fav: true, label: (x) => (has(x, cheese) ? 'Cheesy Fries' : 'French Fries') });
dish('chips', 'Potato Chips', 'snack', 'Slice a potato and deep-fry the slices.',
  (x) => has(x, and(is('potato'), formIn('sliced'), (c) => c.cook.deepfry >= 0.5 || c.cook.fry >= 0.8)) && share(x, is('potato')) >= 0.6,
  { fav: true });
dish('wedges', 'Potato Wedges', 'side', 'Cut a potato in half and roast or deep-fry it.',
  (x) =>
    has(x, and(is('potato'), (c) => (c.form === 'halved' && (c.cook.deepfry >= 0.5 || c.cook.bake >= 0.6 || c.cook.fry >= 0.6 || c.cook.grill >= 0.6)) || (c.form === 'sliced' && c.cook.bake >= 0.6))) &&
    share(x, is('potato')) >= 0.6,
  { fav: true });
dish('mashed-potatoes', 'Mashed Potatoes', 'side', 'Boil a potato, then mash it (butter makes it creamy).',
  (x) => has(x, and(is('potato'), formIn('mashed'), cooked(0.5))) && share(x, or(is('potato', 'butter'), cheese)) >= 0.6,
  { label: (x) => (ing(x, 'cheese') ? 'Cheesy Mash' : 'Mashed Potatoes') });
dish('baked-potato', 'Baked Potato', 'side', 'Bake a whole potato in the oven.',
  (x) => has(x, and(is('potato'), formIn('whole', 'halved'), (c) => c.cook.bake >= 0.6 || c.cook.micro >= 1 || c.cook.grill >= 0.8)) && share(x, is('potato')) >= 0.5,
  { label: (x) => (has(x, cheese) || anyOf(x, 'bacon') ? 'Loaded Baked Potato' : 'Baked Potato') });

// mains
dish('steak', 'Grilled Steak', 'main', 'Grill a steak until it is perfectly done.',
  (x) => has(x, and(is('steak'), dried(0.6))) && share(x, is('steak')) >= 0.35,
  {
    label: (x) => {
      const s = x.comps.find(is('steak'))!;
      const base = s.cook.bake > s.cook.grill + s.cook.fry ? 'Roast Beef' : s.cook.deepfry > 0.5 ? 'Crispy Steak' : 'Grilled Steak';
      return has(x, fries) ? firstFit(`Steak & Fries`, base) : base;
    },
  });
dish('fried-chicken', 'Fried Chicken', 'main', 'Deep-fry chicken until golden.',
  (x) => has(x, and(is('chicken', 'drumstick'), method('deepfry', 0.5))) && share(x, is('chicken', 'drumstick')) >= 0.35,
  { fav: true });
dish('roast-chicken', 'Roast Chicken', 'main', 'Roast chicken in the oven (or grill it).',
  (x) => has(x, and(is('chicken', 'drumstick'), dried(0.6))) && share(x, is('chicken', 'drumstick')) >= 0.35,
  { label: (x) => (x.comps.some((c) => (c.id === 'chicken' || c.id === 'drumstick') && c.cook.bake >= c.cook.grill + c.cook.fry) ? 'Roast Chicken' : 'Grilled Chicken') });
dish('grilled-salmon', 'Grilled Salmon', 'main', 'Grill or bake a salmon fillet.',
  (x) => has(x, and(is('salmon'), dried(0.6))) && share(x, is('salmon')) >= 0.35,
  { label: (x) => (x.comps.some((c) => c.id === 'salmon' && c.cook.bake > c.cook.grill + c.cook.fry) ? 'Baked Salmon' : sea(x, 'lemon-juice', 0.2) || anyOf(x, 'lemon') ? 'Lemon Salmon' : 'Grilled Salmon') });

// soups
const soupIs = (id: string) => (x: Ctx) => isSoup(x) && soupMain(x) === id;
dish('miso-soup', 'Miso Soup', 'soup', 'Boil tofu and seaweed together.', (x) => isSoup(x) && ing(x, 'tofu') && ing(x, 'nori'));
dish('chicken-noodle-soup', 'Chicken Noodle Soup', 'soup', 'Boil chicken, spaghetti and veggies in the pot.', (x) => isSoup(x) && ing(x, 'chicken', 'drumstick') && ing(x, 'spaghetti'));
dish('fish-soup', 'Fish Soup', 'soup', 'Boil fish or seafood with some veggies.', (x) => isSoup(x) && ing(x, 'fish', 'salmon', 'shrimp', 'crab'));
dish('pumpkin-soup', 'Pumpkin Soup', 'soup', 'Boil pumpkin with a few friends in the pot.', soupIs('pumpkin'));
dish('mushroom-soup', 'Mushroom Soup', 'soup', 'Boil mushrooms (cream makes it extra good).', soupIs('mushroom'));
dish('corn-soup', 'Corn Chowder', 'soup', 'Boil corn and potato together.', soupIs('corn'));
dish('potato-soup', 'Potato Soup', 'soup', 'Boil potatoes with onion or leek.', soupIs('potato'));
dish('tomato-soup', 'Tomato Soup', 'soup', 'Boil tomatoes and onion in the soup pot.', soupIs('tomato'),
  { label: (x) => (hot(x) ? 'Tomato Soup' : 'Gazpacho'), cold: true });
dish('veggie-soup', 'Veggie Soup', 'soup', 'Boil lots of chopped veggies together.',
  (x) => isSoup(x) && new Set(x.units.filter((u) => u.via === 'soup' && u.def?.category === 'veg').map((u) => u.id)).size >= 2 && !x.units.some((u) => u.def?.tags.includes('meat')));

// drinks
dish('hot-chocolate', 'Hot Chocolate', 'drink', 'Heat milk and chocolate in the pot.',
  (x) => isDrink(x) && (ing(x, 'chocolate') || sea(x, 'chocolate-syrup', 0.3)) && ing(x, 'milk', 'cream', 'sweet-cream') && hot(x),
  { fav: true, label: (x) => (ing(x, 'marshmallow') ? 'Marshmallow Cocoa' : 'Hot Chocolate') });
dish('milkshake', 'Milkshake', 'drink', 'Blend ice cream with milk.',
  (x) => isDrink(x) && ing(x, 'ice-cream', 'scoops'),
  {
    fav: true,
    cold: true,
    label: (x) => {
      const w = ing(x, 'chocolate') || sea(x, 'chocolate-syrup', 0.3) ? ['Chocolate'] : flavorWords(x.ingredients, 1);
      return firstFit(`${w[0] ?? 'Vanilla'} Milkshake`, 'Milkshake');
    },
  });
dish('smoothie', 'Fruit Smoothie', 'drink', 'Blend fruit with milk or yogurt.',
  (x) => isDrink(x) && drinkFruits(x).length >= 1 && (drinkDairy(x) || drinkFruits(x).length >= 2),
  {
    fav: true,
    cold: true,
    label: (x) => {
      const f = flavorWords(drinkFruits(x), 2);
      return firstFit(`${f.join(' ')} Smoothie`, `${f[0]} Smoothie`, 'Fruit Smoothie');
    },
  });
dish('juice', 'Fruit Juice', 'drink', 'Put one kind of fruit in the blender.',
  (x) => isDrink(x) && !drinkDairy(x) && (drinkFruits(x).length === 1 || (drinkFruits(x).length === 0 && x.units.some((u) => u.id === 'carrot'))),
  {
    simple: true,
    cold: true,
    label: (x) => {
      const f = drinkFruits(x)[0] ?? 'carrot';
      if (f === 'lemon') return 'Lemonade';
      return firstFit(`${adjOf(f)} Juice`, 'Fruit Juice');
    },
  });

// snacks & sides
dish('popcorn', 'Popcorn', 'snack', 'Put corn in the microwave and watch it pop!',
  (x) => mainComp(x, 'popcorn'),
  { fav: true, label: (x) => (sea(x, 'chocolate-syrup', 0.2) ? 'Chocolate Popcorn' : sea(x, 'sugar', 0.3) || sea(x, 'honey', 0.3) ? 'Sweet Popcorn' : anyOf(x, 'butter') ? 'Butter Popcorn' : 'Popcorn') });
dish('onion-rings', 'Onion Rings', 'snack', 'Slice an onion and deep-fry it.',
  (x) => has(x, and(is('onion'), formIn('sliced', 'halved'), (c) => c.cook.deepfry >= 0.4 || c.cook.fry >= 0.9)) && share(x, is('onion')) >= 0.5);
dish('grilled-corn', 'Grilled Corn', 'side', 'Grill a corn cob until golden.',
  (x) => has(x, and(is('corn'), formIn('whole', 'sliced'), dried(0.5))) && share(x, is('corn')) >= 0.5,
  { label: (x) => (anyOf(x, 'butter') ? 'Buttered Corn' : 'Grilled Corn') });
dish('roasted-veggies', 'Roasted Veggies', 'side', 'Chop veggies and roast them in the oven.',
  (x) => {
    const roast = and(veg, not(is('potato', 'corn')), (c) => c.cook.bake >= 0.5 || c.cook.grill >= 0.5);
    if (share(x, roast) < 0.6) return false;
    return distinct(x, roast) >= 2 || has(x, and(roast, not(formIn('whole'))));
  },
  { label: (x) => (x.comps.some((c) => c.cook.grill > c.cook.bake) ? 'Grilled Veggies' : 'Roasted Veggies') });

// ---------------------------------------------------------------------------------------------
// Recognition

/** Every dish in the cookbook. */
export const DISHES: DishInfo[] = DEFS.map(({ id, name, category, hint }) => ({ id, name, category, hint }));
export const DISH_DEFS: readonly DishDef[] = DEFS;

export interface Match {
  dish: DishDef;
  /** Properly made (not raw / burnt / frozen). */
  ok: boolean;
  /** Prefix for a dish that is not quite right ("Burnt", "Raw", "Frozen"), or null. */
  flaw: string | null;
  label: string;
}

/** Find the dish a context looks like (structurally), and whether it is properly made. */
export function matchDish(x: Ctx): Match | null {
  const clash = clashes(x);
  if (clash.worst >= 0.45) return null;
  for (const d of DEFS) {
    let ok = false;
    try {
      ok = d.match(x);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    let label = d.name;
    try {
      label = d.label?.(x) || d.name;
    } catch {
      label = d.name;
    }
    let flaw: string | null = null;
    try {
      flaw = d.needs?.(x) ?? null;
    } catch {
      flaw = null;
    }
    if (!flaw && !d.burntOk && burntScore(x) >= 0.5) flaw = 'Burnt';
    if (!flaw && (rawScore(x, d.allowRaw) >= 0.35 || majorRaw(x, d.allowRaw))) flaw = 'Raw';
    if (!flaw && !d.cold && frozenScore(x) >= 0.6) flaw = 'Frozen';
    return { dish: d, ok: !flaw, flaw, label };
  }
  return null;
}

/** The cookbook dish this food is (only when properly made), or null. */
export function recognize(f: FoodState): DishInfo | null {
  try {
    const m = matchDish(buildCtx(f));
    if (!m || !m.ok) return null;
    const { id, name, category, hint } = m.dish;
    return { id, name, category, hint };
  } catch {
    return null;
  }
}
