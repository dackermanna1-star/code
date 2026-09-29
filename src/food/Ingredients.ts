// Ingredient catalogue. Pure data — shared by gameplay, UI and 3D models.

export type BunId = 'bun_sesame' | 'bun_brioche' | 'bun_pretzel' | 'bun_charcoal';
export type PattyId = 'patty_beef' | 'patty_chicken' | 'patty_veggie';
export type CheeseId = 'cheese_american' | 'cheese_swiss' | 'cheese_cheddar' | 'cheese_pepperjack';
export type ToppingId =
  | 'lettuce'
  | 'tomato'
  | 'onion'
  | 'pickles'
  | 'bacon'
  | 'jalapenos'
  | 'mushrooms'
  | 'avocado'
  | 'egg'
  | 'onion_rings';
export type SauceId = 'ketchup' | 'mustard' | 'mayo' | 'bbq' | 'special' | 'sriracha';
export type LayerId = PattyId | CheeseId | ToppingId | SauceId;
export type IngredientId = BunId | LayerId;

export type Category = 'bun' | 'patty' | 'cheese' | 'topping' | 'sauce';
export type SoundKind = 'bun' | 'patty' | 'cheese' | 'leafy' | 'wet' | 'crisp' | 'sauce' | 'soft' | 'crunchy';

export interface IngredientDef {
  id: IngredientId;
  name: string;
  category: Category;
  unlockRank: number;
  /** stack height contribution (m) */
  thickness: number;
  /** accent color for UI chips */
  color: string;
  sound: SoundKind;
  /** relative popularity for order generation */
  weight: number;
  blurb: string;
}

export type Doneness = 'rare' | 'medium' | 'well';

export const DONENESS: Record<Doneness, { label: string; short: string; target: number; color: string }> = {
  rare: { label: 'Rare', short: 'R', target: 0.4, color: '#e25555' },
  medium: { label: 'Medium', short: 'M', target: 0.6, color: '#d9853b' },
  well: { label: 'Well Done', short: 'W', target: 0.8, color: '#7a4a2a' },
};
export const BURNT_AT = 1.0;

const I = (d: IngredientDef) => d;

export const INGREDIENTS: Record<IngredientId, IngredientDef> = {
  // Buns
  bun_sesame: I({ id: 'bun_sesame', name: 'Sesame Bun', category: 'bun', unlockRank: 1, thickness: 0, color: '#e9a23b', sound: 'bun', weight: 6, blurb: 'The golden classic, dotted with toasted sesame.' }),
  bun_brioche: I({ id: 'bun_brioche', name: 'Brioche Bun', category: 'bun', unlockRank: 5, thickness: 0, color: '#c9701f', sound: 'bun', weight: 3, blurb: 'Buttery, glossy and a little bit fancy.' }),
  bun_pretzel: I({ id: 'bun_pretzel', name: 'Pretzel Bun', category: 'bun', unlockRank: 10, thickness: 0, color: '#8a4b22', sound: 'bun', weight: 2, blurb: 'Chewy, salty and bronzed to perfection.' }),
  bun_charcoal: I({ id: 'bun_charcoal', name: 'Charcoal Bun', category: 'bun', unlockRank: 16, thickness: 0, color: '#2b2b2e', sound: 'bun', weight: 1.5, blurb: 'Jet black and impossibly soft. Very trendy.' }),
  // Patties
  patty_beef: I({ id: 'patty_beef', name: 'Beef Patty', category: 'patty', unlockRank: 1, thickness: 0.02, color: '#7a3b22', sound: 'patty', weight: 10, blurb: 'Hand-formed, juicy, the heart of every stack.' }),
  patty_chicken: I({ id: 'patty_chicken', name: 'Crispy Chicken', category: 'patty', unlockRank: 8, thickness: 0.022, color: '#d9a04a', sound: 'patty', weight: 4, blurb: 'Crunchy breaded fillet. Always cook it well done!' }),
  patty_veggie: I({ id: 'patty_veggie', name: 'Garden Patty', category: 'patty', unlockRank: 13, thickness: 0.02, color: '#6f8a3a', sound: 'patty', weight: 3, blurb: 'Peas, corn and beans pressed with love.' }),
  // Cheese
  cheese_american: I({ id: 'cheese_american', name: 'American Cheese', category: 'cheese', unlockRank: 1, thickness: 0.003, color: '#f5a623', sound: 'cheese', weight: 7, blurb: 'Melts like a dream.' }),
  cheese_swiss: I({ id: 'cheese_swiss', name: 'Swiss Cheese', category: 'cheese', unlockRank: 4, thickness: 0.003, color: '#f1e3a6', sound: 'cheese', weight: 3, blurb: 'Nutty, mild and full of holes.' }),
  cheese_cheddar: I({ id: 'cheese_cheddar', name: 'Sharp Cheddar', category: 'cheese', unlockRank: 11, thickness: 0.003, color: '#e8891c', sound: 'cheese', weight: 3, blurb: 'Bold, tangy and bright orange.' }),
  cheese_pepperjack: I({ id: 'cheese_pepperjack', name: 'Pepper Jack', category: 'cheese', unlockRank: 18, thickness: 0.003, color: '#f3ead0', sound: 'cheese', weight: 2, blurb: 'Creamy with a peppery kick.' }),
  // Toppings
  lettuce: I({ id: 'lettuce', name: 'Lettuce', category: 'topping', unlockRank: 1, thickness: 0.009, color: '#6cbf45', sound: 'leafy', weight: 8, blurb: 'Crisp, ruffled and fresh from the cooler.' }),
  tomato: I({ id: 'tomato', name: 'Tomato', category: 'topping', unlockRank: 1, thickness: 0.008, color: '#e0402b', sound: 'wet', weight: 7, blurb: 'Juicy vine-ripened slices.' }),
  onion: I({ id: 'onion', name: 'Red Onion', category: 'topping', unlockRank: 1, thickness: 0.006, color: '#b15a9e', sound: 'crisp', weight: 5, blurb: 'Sharp, sweet and crunchy rings.' }),
  pickles: I({ id: 'pickles', name: 'Pickles', category: 'topping', unlockRank: 2, thickness: 0.005, color: '#8ab63f', sound: 'wet', weight: 6, blurb: 'Crinkle-cut dill chips with a snap.' }),
  bacon: I({ id: 'bacon', name: 'Bacon', category: 'topping', unlockRank: 3, thickness: 0.008, color: '#c0493a', sound: 'crunchy', weight: 6, blurb: 'Crispy, smoky strips. Everybody loves bacon.' }),
  jalapenos: I({ id: 'jalapenos', name: 'Jalapeños', category: 'topping', unlockRank: 7, thickness: 0.005, color: '#3f9b3a', sound: 'wet', weight: 3, blurb: 'Fiery green rings. Handle with care.' }),
  mushrooms: I({ id: 'mushrooms', name: 'Mushrooms', category: 'topping', unlockRank: 9, thickness: 0.008, color: '#9c7250', sound: 'soft', weight: 3, blurb: 'Sautéed in butter until golden.' }),
  avocado: I({ id: 'avocado', name: 'Avocado', category: 'topping', unlockRank: 14, thickness: 0.009, color: '#8fbf4a', sound: 'soft', weight: 3, blurb: 'Creamy fanned slices of green gold.' }),
  egg: I({ id: 'egg', name: 'Fried Egg', category: 'topping', unlockRank: 17, thickness: 0.012, color: '#ffd23f', sound: 'soft', weight: 2, blurb: 'Sunny side up with a runny yolk.' }),
  onion_rings: I({ id: 'onion_rings', name: 'Onion Rings', category: 'topping', unlockRank: 12, thickness: 0.016, color: '#d9a04a', sound: 'crunchy', weight: 3, blurb: 'Beer-battered and extra crunchy.' }),
  // Sauces
  ketchup: I({ id: 'ketchup', name: 'Ketchup', category: 'sauce', unlockRank: 1, thickness: 0.003, color: '#d8261c', sound: 'sauce', weight: 8, blurb: 'Sweet tomato classic.' }),
  mustard: I({ id: 'mustard', name: 'Mustard', category: 'sauce', unlockRank: 1, thickness: 0.003, color: '#f2c21b', sound: 'sauce', weight: 6, blurb: 'Tangy yellow zig-zags.' }),
  mayo: I({ id: 'mayo', name: 'Mayo', category: 'sauce', unlockRank: 2, thickness: 0.003, color: '#f6f0dc', sound: 'sauce', weight: 5, blurb: 'Rich and creamy.' }),
  bbq: I({ id: 'bbq', name: 'BBQ Sauce', category: 'sauce', unlockRank: 6, thickness: 0.003, color: '#6b2a14', sound: 'sauce', weight: 4, blurb: 'Smoky, sticky and sweet.' }),
  special: I({ id: 'special', name: 'Sizzle Sauce', category: 'sauce', unlockRank: 12, thickness: 0.003, color: '#f08a5d', sound: 'sauce', weight: 4, blurb: 'Top secret house recipe.' }),
  sriracha: I({ id: 'sriracha', name: 'Sriracha', category: 'sauce', unlockRank: 15, thickness: 0.003, color: '#e8411c', sound: 'sauce', weight: 3, blurb: 'Garlicky chili heat.' }),
};

export const BUNS: BunId[] = ['bun_sesame', 'bun_brioche', 'bun_pretzel', 'bun_charcoal'];
export const PATTIES: PattyId[] = ['patty_beef', 'patty_chicken', 'patty_veggie'];
export const CHEESES: CheeseId[] = ['cheese_american', 'cheese_swiss', 'cheese_cheddar', 'cheese_pepperjack'];
export const TOPPINGS: ToppingId[] = ['lettuce', 'tomato', 'onion', 'pickles', 'bacon', 'jalapenos', 'mushrooms', 'avocado', 'egg', 'onion_rings'];
export const SAUCES: SauceId[] = ['ketchup', 'mustard', 'mayo', 'bbq', 'special', 'sriracha'];

export const isPatty = (id: IngredientId): id is PattyId => INGREDIENTS[id].category === 'patty';
export const isSauce = (id: IngredientId): id is SauceId => INGREDIENTS[id].category === 'sauce';
export const isBun = (id: IngredientId): id is BunId => INGREDIENTS[id].category === 'bun';

/** Cooking behaviour for each patty type. */
export const PATTY_COOK: Record<PattyId, { rate: number; forced?: Doneness }> = {
  patty_beef: { rate: 1.0 },
  patty_chicken: { rate: 0.8, forced: 'well' },
  patty_veggie: { rate: 1.2 },
};

export function unlockedIngredients(rank: number): IngredientId[] {
  return (Object.keys(INGREDIENTS) as IngredientId[]).filter((id) => INGREDIENTS[id].unlockRank <= rank);
}
