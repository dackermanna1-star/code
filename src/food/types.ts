// Core data model for food in Munch Lab.
//
// Everything the player handles is a FoodState: a plain, serialisable description of
// "what this thing is right now". Visuals, recipes and character reactions are all
// derived from it, so new ingredients / cooking methods can be added by extending data.

/** Pantry categories (also used for the fridge tabs). `product` = made in the kitchen, never in the fridge. */
export type Category =
  | 'fruit'
  | 'veg'
  | 'meat'
  | 'seafood'
  | 'dairy'
  | 'bakery'
  | 'sweets'
  | 'pantry'
  | 'product';

/**
 * Physical form of an item. Knife cuts walk an item through its cut style's sequence
 * (see CUT_SEQUENCES); tools and appliances produce the special forms.
 */
export type Form =
  | 'whole'
  | 'halved' // two halves (round fruit/veg, buns, boiled eggs, discs)
  | 'sliced' // discs / coins / slices (wedges for disc-shaped items like pizza or cake)
  | 'sticks' // fries-style batons
  | 'strips' // long thin strips (meat, peppers)
  | 'diced' // small cubes / chunks
  | 'minced' // very small bits (ground meat, chopped herbs, garlic)
  | 'leaves' // separated leaves (lettuce, cabbage, basil)
  | 'shredded' // thin curly shreds
  | 'pieces' // natural sub-pieces: florets, single grapes, dough balls
  | 'grated' // short fine shreds (cheese, carrot)
  | 'cracked' // egg out of its shell
  | 'mashed' // soft mound / puree
  | 'flat' // rolled / squashed flat (pizza base from dough, or a silly squashed apple)
  | 'popped'; // corn -> popcorn, marshmallow puffs

/** How an ingredient responds to the knife. */
export type CutStyle =
  | 'round' // lathe-like, upright: apple, tomato, orange, onion...
  | 'long' // lathe-like, lying along X: carrot, cucumber, banana, sausage...
  | 'potato' // whole -> halved -> sliced -> sticks -> diced
  | 'block' // cheese, tofu, butter, ham
  | 'slab' // steak, fillets, chicken
  | 'leafy' // lettuce, cabbage, basil
  | 'bunch' // broccoli, grapes, peas, blueberries
  | 'bread' // loaves: slices -> croutons
  | 'bun' // burger / hotdog buns: whole -> halved (top + bottom)
  | 'egg' // raw: cracked. boiled: halved -> sliced -> diced
  | 'dough' // pieces; rolling pin -> flat
  | 'disc' // pancake, tortilla, pizza base, cake: halved -> sliced (wedges) -> diced
  | 'none'; // powders, liquids, tiny things

/** Knife progression per cut style. Index 0 is always the uncut form. */
export const CUT_SEQUENCES: Record<CutStyle, Form[]> = {
  round: ['whole', 'halved', 'sliced', 'diced', 'minced'],
  long: ['whole', 'sliced', 'diced', 'minced'],
  potato: ['whole', 'halved', 'sliced', 'sticks', 'diced'],
  block: ['whole', 'sliced', 'diced'],
  slab: ['whole', 'strips', 'diced', 'minced'],
  leafy: ['whole', 'leaves', 'shredded'],
  bunch: ['whole', 'pieces', 'diced'],
  bread: ['whole', 'sliced', 'diced'],
  bun: ['whole', 'halved'],
  egg: ['whole', 'cracked'],
  dough: ['whole', 'pieces'],
  disc: ['whole', 'halved', 'sliced', 'diced'],
  none: ['whole'],
};

/** Mouth-feel; drives drop / chew sounds and some reactions. */
export type Texture =
  | 'crunchy'
  | 'crispy'
  | 'juicy'
  | 'soft'
  | 'chewy'
  | 'creamy'
  | 'liquid'
  | 'fluffy'
  | 'powder';

/**
 * Semantic tags used by the recipe recogniser and the taste model.
 * Keep tags descriptive of the *ingredient*, not of a recipe.
 */
export type Tag =
  // broad groups
  | 'fruit'
  | 'veg'
  | 'meat'
  | 'poultry'
  | 'pork'
  | 'beef'
  | 'seafood'
  | 'fish'
  | 'shellfish'
  | 'dairy'
  | 'cheese'
  | 'egg'
  | 'grain'
  | 'bread'
  | 'pasta'
  | 'rice'
  | 'dough'
  | 'batter'
  | 'sweet'
  | 'dessert'
  | 'candy'
  | 'chocolate'
  | 'nut'
  | 'legume'
  | 'herb'
  | 'leafy'
  | 'root'
  | 'citrus'
  | 'berry'
  | 'tropical'
  | 'melon'
  | 'mushroom'
  // character
  | 'spicy'
  | 'sour'
  | 'bitter'
  | 'liquid'
  | 'drink'
  | 'spread'
  | 'fat'
  | 'protein'
  | 'starch'
  | 'crunchy'
  | 'juicy'
  | 'frozen-treat'
  | 'breakfast'
  | 'snack'
  | 'powder'
  // assembly roles
  | 'base' // can carry toppings: bread slice, tortilla, flat dough, pancake, toast, flatbread
  | 'bun' // burger / hotdog bun
  | 'patty'
  | 'sausage'
  | 'layer' // stacks nicely: cheese slice, ham, lettuce leaf, tomato slice, bacon
  | 'topping' // good scattered on things: pepperoni-like slices, herbs, berries
  | 'garnish'
  | 'wrapper' // nori, tortilla
  // safety / cooking
  | 'raw-risky' // shouldn't be eaten raw (meat, chicken, raw egg, flour, potato...)
  | 'sushi-ok' // raw is fine in sushi (salmon, fish, shrimp? no)
  | 'needs-boil' // pasta, rice: only edible after boiling
  | 'melty' // melts with heat: cheese, chocolate, butter, ice cream, marshmallow
  | 'poppable'; // corn

export interface Flavor {
  sweet: number; // 0..1
  salty: number;
  sour: number;
  bitter: number;
  spicy: number;
  umami: number;
  fat: number;
}

export interface IngredientColors {
  /** Outer colour (peel/skin/crust), hex like '#d8322b'. */
  skin: string;
  /** Inner colour (flesh/crumb), used for cut pieces and bites. */
  flesh: string;
  /** Colour of the skin once peeled, if peelable (defaults to flesh). */
  peeled?: string;
  /** Browning target colour when cooked (defaults to a golden brown). */
  cooked?: string;
  /** Colour this ingredient contributes to blends, soups and smoothies (defaults to flesh). */
  juice?: string;
}

export interface IngredientDef {
  id: string;
  name: string; // "Tomato"
  /** Plural / mass noun used in dish names ("Tomatoes", "Rice"). Defaults to name + 's'. */
  plural?: string;
  /** Short adjective form for names ("Tomato" -> "Tomato", "Strawberries" -> "Strawberry"). Defaults to name. */
  adj?: string;
  category: Category;
  tags: Tag[];
  flavor: Flavor;
  /** Base appeal (-1..1) when eaten as intended (cooked if it needs cooking). */
  taste: number;
  /** Fine to eat raw? false => raw reaction is "yuck" (meat, raw egg, flour, potato...). */
  rawOk: boolean;
  /** Seconds of standard heat until perfectly cooked (doneness 1). */
  cookTime: number;
  cut: CutStyle;
  peelable?: boolean;
  colors: IngredientColors;
  texture: Texture;
  /** Real-world-ish diameter / longest size in metres (before the global food scale). */
  size: number;
  /** Shown in the fridge? Products are false. */
  pantry?: boolean;
  /** Optional emoji-free one-liner for the cookbook / tooltips. */
  blurb?: string;
}

export type SeasoningKind = 'shake' | 'squeeze' | 'pour' | 'spread' | 'spray';

export interface SeasoningDef {
  id: string;
  name: string;
  kind: SeasoningKind;
  /** Bottle style for the spice rack model. */
  bottle: 'shaker' | 'squeeze' | 'bottle' | 'jar' | 'can' | 'grinder';
  color: string; // main colour of the seasoning itself
  color2?: string; // secondary (specks, label)
  label: string; // label colour of the bottle
  flavor: Partial<Flavor>; // contribution per unit amount (1 unit = one good dose)
  tags: Tag[];
}

/**
 * Accumulated cooking. Method values are "doneness units": 1.0 means perfectly cooked by
 * that method (the ingredient's cookTime decides how fast each unit accrues).
 */
export interface CookState {
  fry: number; // frying pan
  grill: number; // grill pan (stripes)
  boil: number; // pot
  bake: number; // oven
  deepfry: number; // deep fryer (golden crust)
  toast: number; // toaster
  micro: number; // microwave
  /** 0..1, burnt-ness. Starts rising once total doneness passes ~1.7. */
  burn: number;
  /** 0..1, how frozen. */
  freeze: number;
  /** Current temperature: -1 frozen .. 0 room .. 1 piping hot. Relaxes towards 0 over time. */
  temp: number;
  /** 0..1 melted (cheese, chocolate, ice cream, butter, marshmallow). */
  melt: number;
}

/**
 * Layout of an assembled dish (id 'assembly').
 *  - stack: parts[0] is the bottom layer (burger, sandwich, cake layers)
 *  - topped: parts[0] is the base, the rest are scattered on top (pizza, toast, salad on tortilla)
 *  - pile: parts heaped together on a plate (fish & chips, stir-fry leftovers)
 */
export type AssemblyLayout = 'stack' | 'topped' | 'pile';

export interface FoodState {
  /** IngredientDef id, product id, or 'assembly'. */
  id: string;
  form: Form;
  peeled?: boolean;
  cook: CookState;
  /** Seasoning amounts applied directly to this item (SeasoningDef id -> units). */
  season: Record<string, number>;
  /** Products (batter, soup, smoothie, cake...) remember what went into them. */
  from?: FoodState[];
  /** Assemblies: the stacked / topped / piled parts. */
  parts?: FoodState[];
  layout?: AssemblyLayout;
  /** Colour override for products (hex), e.g. a pink smoothie or a chocolate cake. */
  tint?: string;
  /** Stable random seed for visual variation. */
  seed: number;
  /** How much of the item is left (1 = untouched). Eating reduces it. */
  amount?: number;
}

export function emptyCook(): CookState {
  return { fry: 0, grill: 0, boil: 0, bake: 0, deepfry: 0, toast: 0, micro: 0, burn: 0, freeze: 0, temp: 0, melt: 0 };
}

let seedCounter = 1;
export function newSeed(): number {
  seedCounter = (seedCounter * 1103515245 + 12345 + Date.now()) % 2147483647;
  return Math.abs(seedCounter) % 1000003;
}

export function makeFood(id: string, form: Form = 'whole', extra: Partial<FoodState> = {}): FoodState {
  return { id, form, cook: emptyCook(), season: {}, seed: newSeed(), ...extra };
}

/** Total "dry heat" doneness (everything except boiling and freezing). */
export function doneness(c: CookState): number {
  return c.fry + c.grill + c.bake + c.deepfry + c.toast + c.micro * 0.6 + c.boil;
}

export function cloneFood(f: FoodState): FoodState {
  return JSON.parse(JSON.stringify(f));
}

export const ZERO_FLAVOR: Flavor = { sweet: 0, salty: 0, sour: 0, bitter: 0, spicy: 0, umami: 0, fat: 0 };

export function flavor(p: Partial<Flavor>): Flavor {
  return { ...ZERO_FLAVOR, ...p };
}
