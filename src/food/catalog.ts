// The ingredient catalogue: pure data shared by visuals, recipes, taste and UI.
// To add an ingredient: add an entry here and a model in src/models/<category>.ts.

import type { Category, IngredientDef, SeasoningDef, Tag, Flavor, CutStyle, Texture, IngredientColors } from './types';
import { flavor } from './types';

interface Spec {
  name: string;
  plural?: string;
  adj?: string;
  tags: Tag[];
  flavor: Partial<Flavor>;
  taste: number;
  rawOk?: boolean;
  cookTime?: number;
  cut: CutStyle;
  peelable?: boolean;
  colors: IngredientColors;
  texture: Texture;
  size: number;
  blurb?: string;
}

function defs(category: Category, specs: Record<string, Spec>, pantry = true): IngredientDef[] {
  return Object.entries(specs).map(([id, s]) => ({
    id,
    name: s.name,
    plural: s.plural,
    adj: s.adj,
    category,
    tags: s.tags,
    flavor: flavor(s.flavor),
    taste: s.taste,
    rawOk: s.rawOk ?? true,
    cookTime: s.cookTime ?? 8,
    cut: s.cut,
    peelable: s.peelable,
    colors: s.colors,
    texture: s.texture,
    size: s.size,
    pantry,
    blurb: s.blurb,
  }));
}

const FRUIT = defs('fruit', {
  apple: {
    name: 'Apple', tags: ['fruit', 'sweet', 'juicy', 'crunchy', 'snack'], flavor: { sweet: 0.6, sour: 0.2 }, taste: 0.7,
    cookTime: 9, cut: 'round', peelable: true, texture: 'crunchy', size: 0.085,
    colors: { skin: '#d8322b', flesh: '#f6edc4', peeled: '#f3e6b6', cooked: '#b8742e', juice: '#f1dc8e' },
  },
  banana: {
    name: 'Banana', tags: ['fruit', 'sweet', 'tropical', 'breakfast'], flavor: { sweet: 0.75 }, taste: 0.75,
    cookTime: 7, cut: 'long', peelable: true, texture: 'soft', size: 0.19,
    colors: { skin: '#f5d03a', flesh: '#fbf1c7', peeled: '#fbf1c7', cooked: '#a8692a', juice: '#f7e9a8' },
  },
  orange: {
    name: 'Orange', tags: ['fruit', 'citrus', 'sweet', 'juicy'], flavor: { sweet: 0.55, sour: 0.35 }, taste: 0.7,
    cookTime: 8, cut: 'round', peelable: true, texture: 'juicy', size: 0.085,
    colors: { skin: '#f7931e', flesh: '#f9a33a', peeled: '#f6b562', cooked: '#c46a1c', juice: '#ffa630' },
  },
  lemon: {
    name: 'Lemon', tags: ['fruit', 'citrus', 'sour', 'juicy'], flavor: { sour: 0.95, sweet: 0.1 }, taste: -0.1,
    cookTime: 7, cut: 'round', texture: 'juicy', size: 0.075,
    colors: { skin: '#f8e046', flesh: '#f9ed8f', cooked: '#c9a032', juice: '#f6ef9a' },
  },
  strawberry: {
    name: 'Strawberry', plural: 'Strawberries', tags: ['fruit', 'berry', 'sweet', 'juicy', 'topping'], flavor: { sweet: 0.7, sour: 0.2 }, taste: 0.85,
    cookTime: 5, cut: 'round', texture: 'juicy', size: 0.045,
    colors: { skin: '#e3263a', flesh: '#f26a74', cooked: '#9a1a2a', juice: '#ee4b5e' },
  },
  watermelon: {
    name: 'Watermelon', tags: ['fruit', 'melon', 'sweet', 'juicy'], flavor: { sweet: 0.65 }, taste: 0.8,
    cookTime: 12, cut: 'round', texture: 'juicy', size: 0.26,
    colors: { skin: '#3f8f3a', flesh: '#f04a5a', cooked: '#a8402e', juice: '#f45d6a' },
  },
  pineapple: {
    name: 'Pineapple', tags: ['fruit', 'tropical', 'sweet', 'sour', 'juicy'], flavor: { sweet: 0.6, sour: 0.35 }, taste: 0.75,
    cookTime: 9, cut: 'round', peelable: true, texture: 'juicy', size: 0.2,
    colors: { skin: '#c98b2b', flesh: '#f8d64e', peeled: '#f6cf45', cooked: '#c8822a', juice: '#f6d548' },
  },
  grapes: {
    name: 'Grapes', plural: 'Grapes', adj: 'Grape', tags: ['fruit', 'berry', 'sweet', 'juicy', 'snack'], flavor: { sweet: 0.7, sour: 0.1 }, taste: 0.75,
    cookTime: 5, cut: 'bunch', texture: 'juicy', size: 0.14,
    colors: { skin: '#7b3fa0', flesh: '#c9e08a', cooked: '#4a2252', juice: '#8a3c9e' },
  },
  cherry: {
    name: 'Cherries', plural: 'Cherries', adj: 'Cherry', tags: ['fruit', 'berry', 'sweet', 'topping', 'garnish'], flavor: { sweet: 0.7, sour: 0.15 }, taste: 0.8,
    cookTime: 5, cut: 'bunch', texture: 'juicy', size: 0.06,
    colors: { skin: '#a3121f', flesh: '#c81a2c', cooked: '#5a0a14', juice: '#b0162a' },
  },
  peach: {
    name: 'Peach', plural: 'Peaches', tags: ['fruit', 'sweet', 'juicy'], flavor: { sweet: 0.7, sour: 0.1 }, taste: 0.8,
    cookTime: 7, cut: 'round', peelable: true, texture: 'juicy', size: 0.08,
    colors: { skin: '#f7a46b', flesh: '#fbbf6b', peeled: '#fbc276', cooked: '#c8742e', juice: '#f9b36b' },
  },
  pear: {
    name: 'Pear', tags: ['fruit', 'sweet', 'juicy'], flavor: { sweet: 0.6, sour: 0.05 }, taste: 0.7,
    cookTime: 8, cut: 'round', peelable: true, texture: 'juicy', size: 0.1,
    colors: { skin: '#b5cc3f', flesh: '#f4f0c8', peeled: '#f1edc0', cooked: '#b98a3a', juice: '#eef0b0' },
  },
  kiwi: {
    name: 'Kiwi', tags: ['fruit', 'sweet', 'sour', 'juicy', 'tropical'], flavor: { sweet: 0.5, sour: 0.35 }, taste: 0.7,
    cookTime: 6, cut: 'round', peelable: true, texture: 'juicy', size: 0.07,
    colors: { skin: '#8a6a3a', flesh: '#7cc242', peeled: '#86c84a', cooked: '#5a7a2a', juice: '#93c84a' },
  },
  blueberry: {
    name: 'Blueberries', plural: 'Blueberries', adj: 'Blueberry', tags: ['fruit', 'berry', 'sweet', 'topping', 'breakfast'], flavor: { sweet: 0.6, sour: 0.2 }, taste: 0.75,
    cookTime: 5, cut: 'bunch', texture: 'juicy', size: 0.08,
    colors: { skin: '#3b4b9a', flesh: '#6b5a8e', cooked: '#2a2050', juice: '#4b3f8e' },
  },
  mango: {
    name: 'Mango', plural: 'Mangoes', tags: ['fruit', 'tropical', 'sweet', 'juicy'], flavor: { sweet: 0.8, sour: 0.1 }, taste: 0.85,
    cookTime: 7, cut: 'round', peelable: true, texture: 'juicy', size: 0.12,
    colors: { skin: '#f2a23a', flesh: '#ffb52e', peeled: '#ffb830', cooked: '#c8781e', juice: '#ffb02e' },
  },
  coconut: {
    name: 'Coconut', tags: ['fruit', 'tropical', 'sweet', 'fat', 'crunchy'], flavor: { sweet: 0.4, fat: 0.5 }, taste: 0.55,
    cookTime: 10, cut: 'round', texture: 'crunchy', size: 0.12,
    colors: { skin: '#6b4423', flesh: '#fbf8ef', cooked: '#c89a5a', juice: '#f4f1e6' },
  },
  avocado: {
    name: 'Avocado', tags: ['fruit', 'fat'], flavor: { fat: 0.7, sweet: 0.05, umami: 0.1 }, taste: 0.5,
    cookTime: 6, cut: 'round', peelable: true, texture: 'creamy', size: 0.1,
    colors: { skin: '#3e5a24', flesh: '#c9dc6a', peeled: '#b9d25e', cooked: '#7a8a3a', juice: '#b9d26a' },
  },
});

const VEG = defs('veg', {
  tomato: {
    name: 'Tomato', plural: 'Tomatoes', tags: ['veg', 'juicy', 'topping', 'layer'], flavor: { sweet: 0.3, sour: 0.3, umami: 0.3 }, taste: 0.5,
    cookTime: 7, cut: 'round', texture: 'juicy', size: 0.08,
    colors: { skin: '#e23b2e', flesh: '#f0574a', cooked: '#a8361e', juice: '#e8432f' },
  },
  carrot: {
    name: 'Carrot', tags: ['veg', 'root', 'crunchy', 'sweet'], flavor: { sweet: 0.4 }, taste: 0.45,
    cookTime: 9, cut: 'long', peelable: true, texture: 'crunchy', size: 0.2,
    colors: { skin: '#f07f1f', flesh: '#f39234', peeled: '#f8a03e', cooked: '#c8581a', juice: '#f39234' },
  },
  potato: {
    name: 'Potato', plural: 'Potatoes', tags: ['veg', 'root', 'starch', 'raw-risky'], flavor: { umami: 0.2, salty: 0.05 }, taste: 0.6,
    rawOk: false, cookTime: 9, cut: 'potato', peelable: true, texture: 'soft', size: 0.1,
    colors: { skin: '#c79a5b', flesh: '#f3e2a6', peeled: '#f3e2a6', cooked: '#dba548', juice: '#efe0b0' },
  },
  onion: {
    name: 'Onion', tags: ['veg', 'crunchy'], flavor: { spicy: 0.25, bitter: 0.2, sweet: 0.15 }, taste: 0.1,
    cookTime: 8, cut: 'round', peelable: true, texture: 'crunchy', size: 0.085,
    colors: { skin: '#cf8f45', flesh: '#f4ecd4', peeled: '#f1e7d0', cooked: '#b97a35', juice: '#efe6cf' },
  },
  garlic: {
    name: 'Garlic', plural: 'Garlic', tags: ['veg', 'herb'], flavor: { spicy: 0.3, umami: 0.3, bitter: 0.2 }, taste: -0.2,
    cookTime: 5, cut: 'round', peelable: true, texture: 'crunchy', size: 0.055,
    colors: { skin: '#f3eee3', flesh: '#f6f0d6', peeled: '#f4ecc8', cooked: '#c99a4a', juice: '#f1ead0' },
  },
  broccoli: {
    name: 'Broccoli', plural: 'Broccoli', tags: ['veg', 'crunchy'], flavor: { bitter: 0.3, umami: 0.1 }, taste: 0.25,
    cookTime: 7, cut: 'bunch', texture: 'crunchy', size: 0.14,
    colors: { skin: '#3f8a2e', flesh: '#8fc062', cooked: '#5a6a22', juice: '#5f9a3a' },
  },
  cucumber: {
    name: 'Cucumber', tags: ['veg', 'crunchy', 'juicy', 'layer'], flavor: { sweet: 0.1 }, taste: 0.4,
    cookTime: 6, cut: 'long', peelable: true, texture: 'crunchy', size: 0.22,
    colors: { skin: '#3d7a2a', flesh: '#cfe8a6', peeled: '#bfe08e', cooked: '#8a9a4a', juice: '#c8e6a0' },
  },
  lettuce: {
    name: 'Lettuce', plural: 'Lettuce', tags: ['veg', 'leafy', 'crunchy', 'layer'], flavor: { bitter: 0.1 }, taste: 0.3,
    cookTime: 4, cut: 'leafy', texture: 'crunchy', size: 0.16,
    colors: { skin: '#7cc045', flesh: '#c8e67a', cooked: '#6a7a2a', juice: '#9ccc5a' },
  },
  'bell-pepper': {
    name: 'Bell Pepper', tags: ['veg', 'crunchy', 'sweet', 'topping'], flavor: { sweet: 0.35 }, taste: 0.45,
    cookTime: 7, cut: 'round', texture: 'crunchy', size: 0.1,
    colors: { skin: '#e8352b', flesh: '#f06a4a', cooked: '#a8301e', juice: '#ea4a32' },
  },
  chili: {
    name: 'Chili Pepper', tags: ['veg', 'spicy'], flavor: { spicy: 1, sweet: 0.05 }, taste: 0.1,
    cookTime: 5, cut: 'long', texture: 'crunchy', size: 0.11,
    colors: { skin: '#d4231b', flesh: '#e85a3a', cooked: '#8a1a10', juice: '#d8321e' },
  },
  corn: {
    name: 'Corn', plural: 'Corn', tags: ['veg', 'grain', 'sweet', 'poppable'], flavor: { sweet: 0.45 }, taste: 0.55,
    cookTime: 8, cut: 'long', texture: 'crunchy', size: 0.2,
    colors: { skin: '#f5c842', flesh: '#f8d65a', cooked: '#d89a2a', juice: '#f6d35a' },
  },
  mushroom: {
    name: 'Mushroom', tags: ['veg', 'mushroom', 'topping'], flavor: { umami: 0.6 }, taste: 0.35,
    cookTime: 6, cut: 'round', texture: 'soft', size: 0.07,
    colors: { skin: '#efe6d8', flesh: '#f5efe3', cooked: '#8a6a3e', juice: '#c9b9a0' },
  },
  eggplant: {
    name: 'Eggplant', tags: ['veg', 'bitter'], flavor: { bitter: 0.2, umami: 0.1 }, taste: 0.35,
    cookTime: 9, cut: 'long', peelable: true, texture: 'soft', size: 0.22,
    colors: { skin: '#4b2a5c', flesh: '#efe6c2', peeled: '#e8dcb0', cooked: '#6a4a2e', juice: '#9a7a8a' },
  },
  pumpkin: {
    name: 'Pumpkin', tags: ['veg', 'sweet'], flavor: { sweet: 0.35 }, taste: 0.4,
    cookTime: 12, cut: 'round', texture: 'soft', size: 0.26,
    colors: { skin: '#f08a1c', flesh: '#f6a53a', cooked: '#c8601a', juice: '#f6a53a' },
  },
  peas: {
    name: 'Peas', plural: 'Peas', adj: 'Pea', tags: ['veg', 'sweet', 'topping', 'legume'], flavor: { sweet: 0.35 }, taste: 0.4,
    cookTime: 5, cut: 'bunch', texture: 'soft', size: 0.11,
    colors: { skin: '#6cb33f', flesh: '#8cc84b', cooked: '#5a8a2a', juice: '#8cc84b' },
  },
  basil: {
    name: 'Basil', plural: 'Basil', tags: ['herb', 'leafy', 'garnish', 'topping'], flavor: { bitter: 0.1, umami: 0.1 }, taste: 0.3,
    cookTime: 3, cut: 'leafy', texture: 'soft', size: 0.1,
    colors: { skin: '#3e8e2e', flesh: '#5aa83e', cooked: '#2a4a1a', juice: '#4a9a32' },
  },
});

const MEAT = defs('meat', {
  steak: {
    name: 'Steak', tags: ['meat', 'beef', 'protein', 'raw-risky'], flavor: { umami: 0.8, salty: 0.2, fat: 0.4 }, taste: 0.85,
    rawOk: false, cookTime: 10, cut: 'slab', texture: 'chewy', size: 0.2,
    colors: { skin: '#b8323a', flesh: '#c4404a', cooked: '#6b3a22', juice: '#8a2a2a' },
  },
  drumstick: {
    name: 'Chicken Leg', tags: ['meat', 'poultry', 'protein', 'raw-risky'], flavor: { umami: 0.7, fat: 0.4, salty: 0.2 }, taste: 0.85,
    rawOk: false, cookTime: 11, cut: 'slab', texture: 'chewy', size: 0.15,
    colors: { skin: '#f0b8a0', flesh: '#f3c9b5', cooked: '#c8782e', juice: '#e8b8a0' },
  },
  chicken: {
    name: 'Whole Chicken', adj: 'Chicken', plural: 'Chicken', tags: ['meat', 'poultry', 'protein', 'raw-risky'], flavor: { umami: 0.7, fat: 0.4, salty: 0.2 }, taste: 0.85,
    rawOk: false, cookTime: 16, cut: 'slab', texture: 'chewy', size: 0.3,
    colors: { skin: '#f2c2a6', flesh: '#f6d5c2', cooked: '#c9792c', juice: '#ecc8b0' },
  },
  sausage: {
    name: 'Sausage', tags: ['meat', 'pork', 'sausage', 'protein', 'raw-risky'], flavor: { umami: 0.7, salty: 0.5, fat: 0.6 }, taste: 0.8,
    rawOk: false, cookTime: 8, cut: 'long', texture: 'chewy', size: 0.2,
    colors: { skin: '#df8576', flesh: '#e8a08e', cooked: '#9a4a2a', juice: '#c87a6a' },
  },
  bacon: {
    name: 'Bacon', plural: 'Bacon', tags: ['meat', 'pork', 'layer', 'protein', 'raw-risky'], flavor: { salty: 0.8, umami: 0.6, fat: 0.7 }, taste: 0.9,
    rawOk: false, cookTime: 6, cut: 'slab', texture: 'crispy', size: 0.22,
    colors: { skin: '#e88a8a', flesh: '#f0a0a0', cooked: '#a34a2a', juice: '#d88a7a' },
  },
  ham: {
    name: 'Ham', plural: 'Ham', tags: ['meat', 'pork', 'layer', 'protein'], flavor: { salty: 0.6, umami: 0.5, fat: 0.2 }, taste: 0.7,
    cookTime: 6, cut: 'block', texture: 'soft', size: 0.15,
    colors: { skin: '#f29aa8', flesh: '#f5b0ba', cooked: '#c8705a', juice: '#f0a0a8' },
  },
  patty: {
    name: 'Burger Patty', adj: 'Beef', plural: 'Burger Patties', tags: ['meat', 'beef', 'patty', 'protein', 'raw-risky'], flavor: { umami: 0.8, fat: 0.5, salty: 0.3 }, taste: 0.85,
    rawOk: false, cookTime: 8, cut: 'disc', texture: 'chewy', size: 0.11,
    colors: { skin: '#b8504f', flesh: '#c4605a', cooked: '#5e3420', juice: '#8a3a32' },
  },
});

const SEAFOOD = defs('seafood', {
  salmon: {
    name: 'Salmon', plural: 'Salmon', tags: ['seafood', 'fish', 'protein', 'raw-risky', 'sushi-ok'], flavor: { umami: 0.6, fat: 0.5, salty: 0.1 }, taste: 0.75,
    rawOk: false, cookTime: 8, cut: 'slab', texture: 'soft', size: 0.18,
    colors: { skin: '#f7895a', flesh: '#f99b6c', cooked: '#d47a4a', juice: '#f0a080' },
  },
  fish: {
    name: 'Fish', plural: 'Fish', tags: ['seafood', 'fish', 'protein', 'raw-risky'], flavor: { umami: 0.6, salty: 0.2 }, taste: 0.55,
    rawOk: false, cookTime: 10, cut: 'long', texture: 'soft', size: 0.28,
    colors: { skin: '#8fb3c9', flesh: '#f3ece2', cooked: '#c99a5a', juice: '#d8d0c0' },
  },
  shrimp: {
    name: 'Shrimp', plural: 'Shrimp', tags: ['seafood', 'shellfish', 'protein', 'raw-risky'], flavor: { umami: 0.6, sweet: 0.2, salty: 0.3 }, taste: 0.75,
    rawOk: false, cookTime: 5, cut: 'bunch', texture: 'chewy', size: 0.12,
    colors: { skin: '#eaa69a', flesh: '#f3c0b0', cooked: '#f0703f', juice: '#e8a08a' },
  },
  crab: {
    name: 'Crab', tags: ['seafood', 'shellfish', 'protein', 'raw-risky'], flavor: { umami: 0.6, sweet: 0.2, salty: 0.3 }, taste: 0.7,
    rawOk: false, cookTime: 8, cut: 'bunch', texture: 'chewy', size: 0.2,
    colors: { skin: '#e2552f', flesh: '#fbf3ee', cooked: '#d9452a', juice: '#f0c0b0' },
  },
});

const DAIRY = defs('dairy', {
  egg: {
    name: 'Egg', tags: ['egg', 'protein', 'breakfast', 'raw-risky'], flavor: { umami: 0.4, fat: 0.3 }, taste: 0.6,
    rawOk: false, cookTime: 6, cut: 'egg', texture: 'soft', size: 0.06,
    colors: { skin: '#f3e2c8', flesh: '#fbfbf5', peeled: '#fbfbf5', cooked: '#d8a04a', juice: '#f8d070' },
  },
  milk: {
    name: 'Milk', plural: 'Milk', tags: ['dairy', 'liquid', 'drink'], flavor: { sweet: 0.2, fat: 0.3 }, taste: 0.5,
    cookTime: 6, cut: 'none', texture: 'liquid', size: 0.2,
    colors: { skin: '#f4f7fb', flesh: '#fbfaf5', cooked: '#e8d8b0', juice: '#fdfcf6' },
  },
  cheese: {
    name: 'Cheese', plural: 'Cheese', tags: ['dairy', 'cheese', 'layer', 'topping', 'melty', 'fat'], flavor: { salty: 0.5, umami: 0.5, fat: 0.6 }, taste: 0.8,
    cookTime: 4, cut: 'block', texture: 'soft', size: 0.12,
    colors: { skin: '#f7c843', flesh: '#f9d25a', cooked: '#e09a3a', juice: '#f6cf5a' },
  },
  mozzarella: {
    name: 'Mozzarella', plural: 'Mozzarella', tags: ['dairy', 'cheese', 'melty', 'topping'], flavor: { salty: 0.3, fat: 0.5, umami: 0.3 }, taste: 0.7,
    cookTime: 4, cut: 'round', texture: 'soft', size: 0.08,
    colors: { skin: '#fbf9f0', flesh: '#fdfbf3', cooked: '#e8b85a', juice: '#fbf8ea' },
  },
  butter: {
    name: 'Butter', plural: 'Butter', tags: ['dairy', 'fat', 'spread', 'melty'], flavor: { fat: 1, salty: 0.3 }, taste: 0.1,
    cookTime: 3, cut: 'block', texture: 'creamy', size: 0.1,
    colors: { skin: '#fbe08a', flesh: '#fde69a', cooked: '#e0a840', juice: '#fbe490' },
  },
  yogurt: {
    name: 'Yogurt', plural: 'Yogurt', tags: ['dairy', 'breakfast', 'sour'], flavor: { sour: 0.2, sweet: 0.2, fat: 0.2 }, taste: 0.55,
    cookTime: 5, cut: 'none', texture: 'creamy', size: 0.09,
    colors: { skin: '#ffffff', flesh: '#fbf8f0', cooked: '#e8dcc0', juice: '#f8f4ea' },
  },
  cream: {
    name: 'Cream', plural: 'Cream', tags: ['dairy', 'liquid', 'fat'], flavor: { fat: 0.8, sweet: 0.1 }, taste: 0.3,
    cookTime: 5, cut: 'none', texture: 'liquid', size: 0.13,
    colors: { skin: '#eef3fb', flesh: '#fffdf6', cooked: '#e8d8b0', juice: '#fffdf4' },
  },
  'ice-cream': {
    name: 'Ice Cream', plural: 'Ice Cream', tags: ['dairy', 'dessert', 'sweet', 'frozen-treat', 'melty'], flavor: { sweet: 0.9, fat: 0.5 }, taste: 0.95,
    cookTime: 2, cut: 'none', texture: 'creamy', size: 0.16,
    colors: { skin: '#f6b8cf', flesh: '#f9e2b0', cooked: '#e8c890', juice: '#f8d8d8' },
  },
});

const BAKERY = defs('bakery', {
  bread: {
    name: 'Bread', plural: 'Bread', tags: ['bread', 'grain', 'starch', 'base'], flavor: { umami: 0.1, salty: 0.1, sweet: 0.05 }, taste: 0.45,
    cookTime: 5, cut: 'bread', texture: 'soft', size: 0.25,
    colors: { skin: '#c88a3e', flesh: '#f6e3b8', cooked: '#9a5a22', juice: '#e8d4a8' },
  },
  bun: {
    name: 'Burger Bun', adj: 'Bun', tags: ['bread', 'bun', 'grain', 'starch'], flavor: { sweet: 0.1 }, taste: 0.45,
    cookTime: 5, cut: 'bun', texture: 'soft', size: 0.11,
    colors: { skin: '#d98c3a', flesh: '#f8e6c0', cooked: '#9a5a22', juice: '#ead6a8' },
  },
  'hotdog-bun': {
    name: 'Hot Dog Bun', adj: 'Bun', tags: ['bread', 'bun', 'grain', 'starch'], flavor: { sweet: 0.1 }, taste: 0.45,
    cookTime: 5, cut: 'bun', texture: 'soft', size: 0.17,
    colors: { skin: '#d9913f', flesh: '#f8e6c0', cooked: '#9a5a22', juice: '#ead6a8' },
  },
  baguette: {
    name: 'Baguette', tags: ['bread', 'grain', 'starch'], flavor: { salty: 0.1 }, taste: 0.5,
    cookTime: 5, cut: 'long', texture: 'crispy', size: 0.32,
    colors: { skin: '#d09040', flesh: '#f6e3b8', cooked: '#9a5a22', juice: '#e8d4a8' },
  },
  tortilla: {
    name: 'Tortilla', tags: ['bread', 'grain', 'base', 'wrapper'], flavor: { salty: 0.05 }, taste: 0.35,
    cookTime: 4, cut: 'disc', texture: 'soft', size: 0.2,
    colors: { skin: '#f1dca6', flesh: '#f3e2b2', cooked: '#c8903a', juice: '#eedcae' },
  },
  croissant: {
    name: 'Croissant', tags: ['bread', 'breakfast', 'fat'], flavor: { sweet: 0.2, fat: 0.5 }, taste: 0.75,
    cookTime: 5, cut: 'bun', texture: 'fluffy', size: 0.14,
    colors: { skin: '#d98a2e', flesh: '#f8e4b4', cooked: '#8a4a1a', juice: '#ecd2a0' },
  },
  dough: {
    name: 'Dough', plural: 'Dough', tags: ['dough', 'grain', 'raw-risky'], flavor: { salty: 0.05 }, taste: 0.2,
    rawOk: false, cookTime: 9, cut: 'dough', texture: 'chewy', size: 0.1,
    colors: { skin: '#f3e3c3', flesh: '#f5e7c9', cooked: '#d89a48', juice: '#f0e2c4' },
  },
  flour: {
    name: 'Flour', plural: 'Flour', tags: ['grain', 'powder', 'raw-risky'], flavor: { bitter: 0.05 }, taste: -0.5,
    rawOk: false, cookTime: 6, cut: 'none', texture: 'powder', size: 0.15,
    colors: { skin: '#f2ebdd', flesh: '#fbf9f4', cooked: '#e0c890', juice: '#f8f5ee' },
  },
  rice: {
    name: 'Rice', plural: 'Rice', tags: ['grain', 'rice', 'starch', 'needs-boil'], flavor: { sweet: 0.05 }, taste: 0.45,
    rawOk: false, cookTime: 8, cut: 'none', texture: 'soft', size: 0.14,
    colors: { skin: '#efe6d2', flesh: '#fbf9f2', cooked: '#e8c890', juice: '#f6f3ea' },
  },
  spaghetti: {
    name: 'Spaghetti', plural: 'Spaghetti', tags: ['grain', 'pasta', 'starch', 'needs-boil'], flavor: { sweet: 0.05 }, taste: 0.5,
    rawOk: false, cookTime: 7, cut: 'none', texture: 'chewy', size: 0.25,
    colors: { skin: '#f1d78a', flesh: '#f5df98', cooked: '#d8a84a', juice: '#f3e0a8' },
  },
});

const SWEETS = defs('sweets', {
  chocolate: {
    name: 'Chocolate', plural: 'Chocolate', tags: ['sweet', 'chocolate', 'dessert', 'melty', 'candy'], flavor: { sweet: 0.8, bitter: 0.2, fat: 0.5 }, taste: 0.9,
    cookTime: 3, cut: 'block', texture: 'creamy', size: 0.14,
    colors: { skin: '#6b3a1f', flesh: '#5a2f18', cooked: '#3a1a0a', juice: '#5a2f18' },
  },
  marshmallow: {
    name: 'Marshmallows', plural: 'Marshmallows', adj: 'Marshmallow', tags: ['sweet', 'candy', 'melty'], flavor: { sweet: 0.9 }, taste: 0.7,
    cookTime: 3, cut: 'bunch', texture: 'fluffy', size: 0.07,
    colors: { skin: '#fdf3f5', flesh: '#fffafb', cooked: '#c8843a', juice: '#fbeef0' },
  },
  cookie: {
    name: 'Cookie', tags: ['sweet', 'dessert', 'snack', 'base'], flavor: { sweet: 0.7, fat: 0.4 }, taste: 0.85,
    cookTime: 5, cut: 'disc', texture: 'crispy', size: 0.09,
    colors: { skin: '#d9a35a', flesh: '#e8bf7a', cooked: '#7a4a1a', juice: '#c89a60' },
  },
  donut: {
    name: 'Donut', tags: ['sweet', 'dessert', 'breakfast'], flavor: { sweet: 0.8, fat: 0.5 }, taste: 0.9,
    cookTime: 5, cut: 'disc', texture: 'fluffy', size: 0.11,
    colors: { skin: '#d99a4a', flesh: '#f6deb0', cooked: '#7a4a1a', juice: '#e8b88a' },
  },
  candy: {
    name: 'Lollipop', tags: ['sweet', 'candy'], flavor: { sweet: 1 }, taste: 0.7,
    cookTime: 3, cut: 'none', texture: 'crunchy', size: 0.12,
    colors: { skin: '#f04aa0', flesh: '#f87ac0', cooked: '#a02a6a', juice: '#f05aa8' },
  },
  gummy: {
    name: 'Gummy Bears', plural: 'Gummy Bears', adj: 'Gummy', tags: ['sweet', 'candy', 'snack'], flavor: { sweet: 0.9, sour: 0.1 }, taste: 0.8,
    cookTime: 2, cut: 'bunch', texture: 'chewy', size: 0.08,
    colors: { skin: '#f0453a', flesh: '#f86a5a', cooked: '#a02a2a', juice: '#f0603a' },
  },
});

const PANTRY = defs('pantry', {
  tofu: {
    name: 'Tofu', plural: 'Tofu', tags: ['protein', 'legume'], flavor: { umami: 0.2 }, taste: 0.35,
    cookTime: 6, cut: 'block', texture: 'soft', size: 0.1,
    colors: { skin: '#f8f5ea', flesh: '#fbf8ee', cooked: '#d9a55a', juice: '#f4f0e0' },
  },
  nori: {
    name: 'Seaweed', plural: 'Seaweed', tags: ['wrapper', 'veg'], flavor: { umami: 0.5, salty: 0.4 }, taste: 0.3,
    cookTime: 3, cut: 'none', texture: 'crispy', size: 0.18,
    colors: { skin: '#1f3a24', flesh: '#2a4a2e', cooked: '#141a10', juice: '#2a4a2e' },
  },
  nuts: {
    name: 'Peanuts', plural: 'Peanuts', adj: 'Peanut', tags: ['nut', 'snack', 'crunchy', 'topping', 'fat'], flavor: { fat: 0.6, salty: 0.2, umami: 0.2 }, taste: 0.6,
    cookTime: 4, cut: 'bunch', texture: 'crunchy', size: 0.08,
    colors: { skin: '#c99a5a', flesh: '#e8c88a', cooked: '#8a5a2a', juice: '#d8b07a' },
  },
  beans: {
    name: 'Beans', plural: 'Beans', adj: 'Bean', tags: ['legume', 'protein', 'starch', 'needs-boil'], flavor: { umami: 0.3 }, taste: 0.4,
    rawOk: false, cookTime: 8, cut: 'bunch', texture: 'soft', size: 0.08,
    colors: { skin: '#8a2a2a', flesh: '#c9a08a', cooked: '#5a2018', juice: '#8a4a3a' },
  },
});

/** Things made in the kitchen. Never in the fridge; created by stations and tools. */
const PRODUCTS = defs('product', {
  batter: {
    name: 'Batter', plural: 'Batter', tags: ['batter', 'raw-risky', 'liquid'], flavor: { sweet: 0.1 }, taste: -0.3,
    rawOk: false, cookTime: 6, cut: 'none', texture: 'liquid', size: 0.14,
    colors: { skin: '#f6dc9a', flesh: '#f6dc9a', cooked: '#d89a48', juice: '#f6dc9a' },
  },
  'cookie-dough': {
    name: 'Cookie Dough', plural: 'Cookie Dough', tags: ['dough', 'sweet', 'raw-risky'], flavor: { sweet: 0.6, fat: 0.4 }, taste: 0.4,
    rawOk: false, cookTime: 8, cut: 'dough', texture: 'chewy', size: 0.1,
    colors: { skin: '#e2b878', flesh: '#e8c088', cooked: '#b8782e', juice: '#e2b878' },
  },
  'beaten-egg': {
    name: 'Beaten Eggs', plural: 'Beaten Eggs', adj: 'Egg', tags: ['egg', 'raw-risky', 'liquid', 'breakfast'], flavor: { umami: 0.4, fat: 0.3 }, taste: -0.4,
    rawOk: false, cookTime: 4, cut: 'none', texture: 'liquid', size: 0.14,
    colors: { skin: '#f8c94a', flesh: '#f8c94a', cooked: '#f0c040', juice: '#f8c94a' },
  },
  'sweet-cream': {
    name: 'Sweet Cream', plural: 'Sweet Cream', tags: ['dairy', 'sweet', 'liquid'], flavor: { sweet: 0.6, fat: 0.5 }, taste: 0.4,
    cookTime: 5, cut: 'none', texture: 'liquid', size: 0.14,
    colors: { skin: '#fbf3dc', flesh: '#fbf3dc', cooked: '#e8d0a0', juice: '#fbf3dc' },
  },
  'whipped-cream': {
    name: 'Whipped Cream', plural: 'Whipped Cream', tags: ['dairy', 'sweet', 'dessert', 'topping'], flavor: { sweet: 0.4, fat: 0.6 }, taste: 0.6,
    cookTime: 2, cut: 'none', texture: 'fluffy', size: 0.14,
    colors: { skin: '#fffdf8', flesh: '#fffdf8', cooked: '#e8d8b0', juice: '#fffdf8' },
  },
  pancake: {
    name: 'Pancakes', plural: 'Pancakes', adj: 'Pancake', tags: ['breakfast', 'sweet', 'base', 'grain'], flavor: { sweet: 0.4, fat: 0.2 }, taste: 0.8,
    cookTime: 4, cut: 'disc', texture: 'fluffy', size: 0.15,
    colors: { skin: '#e3a34a', flesh: '#f7dca0', cooked: '#8a4a1a', juice: '#e8c080' },
  },
  cake: {
    name: 'Cake', tags: ['dessert', 'sweet', 'grain'], flavor: { sweet: 0.8, fat: 0.4 }, taste: 0.9,
    cookTime: 4, cut: 'disc', texture: 'fluffy', size: 0.2,
    colors: { skin: '#f8e3b8', flesh: '#f3d38a', cooked: '#8a4a1a', juice: '#f0d8a0' },
  },
  flatbread: {
    name: 'Flatbread', tags: ['bread', 'grain', 'base'], flavor: { salty: 0.1 }, taste: 0.5,
    cookTime: 4, cut: 'disc', texture: 'chewy', size: 0.22,
    colors: { skin: '#e8c27a', flesh: '#f3dfae', cooked: '#8a4a1a', juice: '#e8d0a0' },
  },
  'fried-egg': {
    name: 'Fried Egg', tags: ['egg', 'protein', 'breakfast', 'layer', 'topping'], flavor: { umami: 0.5, fat: 0.4, salty: 0.1 }, taste: 0.75,
    cookTime: 3, cut: 'disc', texture: 'soft', size: 0.14,
    colors: { skin: '#fdfdf6', flesh: '#fdfdf6', cooked: '#a8743a', juice: '#f8e0a0' },
  },
  'scrambled-eggs': {
    name: 'Scrambled Eggs', plural: 'Scrambled Eggs', adj: 'Egg', tags: ['egg', 'protein', 'breakfast'], flavor: { umami: 0.5, fat: 0.4, salty: 0.1 }, taste: 0.75,
    cookTime: 3, cut: 'none', texture: 'fluffy', size: 0.13,
    colors: { skin: '#f9d65a', flesh: '#f9d65a', cooked: '#a8743a', juice: '#f9d65a' },
  },
  omelet: {
    name: 'Omelet', tags: ['egg', 'protein', 'breakfast'], flavor: { umami: 0.5, fat: 0.4, salty: 0.1 }, taste: 0.8,
    cookTime: 3, cut: 'disc', texture: 'soft', size: 0.17,
    colors: { skin: '#f6cf55', flesh: '#f8dc7a', cooked: '#a8743a', juice: '#f6cf55' },
  },
  popcorn: {
    name: 'Popcorn', plural: 'Popcorn', tags: ['snack', 'crunchy', 'grain'], flavor: { salty: 0.1, sweet: 0.1, fat: 0.2 }, taste: 0.8,
    cookTime: 2, cut: 'none', texture: 'crunchy', size: 0.14,
    colors: { skin: '#fdf3d6', flesh: '#fdf3d6', cooked: '#8a5a2a', juice: '#f8e8b8' },
  },
  icepop: {
    name: 'Ice Pop', tags: ['frozen-treat', 'sweet', 'dessert'], flavor: { sweet: 0.6 }, taste: 0.85,
    cookTime: 2, cut: 'none', texture: 'crunchy', size: 0.15,
    colors: { skin: '#f0607a', flesh: '#f0607a', cooked: '#c0405a', juice: '#f0607a' },
  },
  scoops: {
    name: 'Ice Cream Scoops', plural: 'Ice Cream', adj: 'Ice Cream', tags: ['dairy', 'dessert', 'sweet', 'frozen-treat', 'melty'], flavor: { sweet: 0.8, fat: 0.5 }, taste: 0.9,
    cookTime: 2, cut: 'none', texture: 'creamy', size: 0.15,
    colors: { skin: '#fbf0d8', flesh: '#fbf0d8', cooked: '#e8c890', juice: '#fbf0d8' },
  },
  drink: {
    name: 'Drink', tags: ['drink', 'liquid'], flavor: {}, taste: 0.5,
    cookTime: 5, cut: 'none', texture: 'liquid', size: 0.15,
    colors: { skin: '#f4a0c0', flesh: '#f4a0c0', cooked: '#c08a6a', juice: '#f4a0c0' },
  },
  soup: {
    name: 'Soup', tags: ['liquid'], flavor: { salty: 0.1, umami: 0.2 }, taste: 0.5,
    cookTime: 6, cut: 'none', texture: 'liquid', size: 0.16,
    colors: { skin: '#e8a050', flesh: '#e8a050', cooked: '#a86a2a', juice: '#e8a050' },
  },
  mixture: {
    name: 'Mixture', tags: [], flavor: {}, taste: 0.2,
    cookTime: 6, cut: 'none', texture: 'creamy', size: 0.14,
    colors: { skin: '#d8c090', flesh: '#d8c090', cooked: '#9a6a3a', juice: '#d8c090' },
  },
}, false);

export const INGREDIENTS: IngredientDef[] = [...FRUIT, ...VEG, ...MEAT, ...SEAFOOD, ...DAIRY, ...BAKERY, ...SWEETS, ...PANTRY, ...PRODUCTS];

const BY_ID = new Map<string, IngredientDef>(INGREDIENTS.map((d) => [d.id, d]));

/** Look up an ingredient or product definition. Throws for unknown ids (they are programming errors). */
export function getDef(id: string): IngredientDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown ingredient id "${id}"`);
  return d;
}

export function hasDef(id: string): boolean {
  return BY_ID.has(id);
}

export function hasTag(id: string, tag: Tag): boolean {
  const d = BY_ID.get(id);
  return !!d && d.tags.includes(tag);
}

/** Fridge tabs, in display order. */
export const PANTRY_TABS: { category: Category; label: string }[] = [
  { category: 'fruit', label: 'Fruit' },
  { category: 'veg', label: 'Veggies' },
  { category: 'meat', label: 'Meat' },
  { category: 'seafood', label: 'Seafood' },
  { category: 'dairy', label: 'Dairy & Eggs' },
  { category: 'bakery', label: 'Bakery' },
  { category: 'sweets', label: 'Sweets' },
  { category: 'pantry', label: 'Pantry' },
];

export function pantryItems(category: Category): IngredientDef[] {
  return INGREDIENTS.filter((d) => d.pantry && d.category === category);
}

// ---------------------------------------------------------------------------------------------
// Seasonings (the spice rack). Applied by shaking / squeezing / pouring / spreading over food.

function seas(
  id: string,
  name: string,
  kind: SeasoningDef['kind'],
  bottle: SeasoningDef['bottle'],
  color: string,
  label: string,
  fl: Partial<import('./types').Flavor>,
  tags: Tag[] = [],
  color2?: string,
): SeasoningDef {
  return { id, name, kind, bottle, color, label, flavor: fl, tags, color2 };
}

export const SEASONINGS: SeasoningDef[] = [
  seas('salt', 'Salt', 'shake', 'shaker', '#ffffff', '#4aa3df', { salty: 0.5 }),
  seas('pepper', 'Pepper', 'shake', 'grinder', '#3a3330', '#3a3330', { spicy: 0.15, bitter: 0.1 }),
  seas('sugar', 'Sugar', 'shake', 'shaker', '#fffaf2', '#f26d9b', { sweet: 0.5 }, ['sweet']),
  seas('cinnamon', 'Cinnamon', 'shake', 'shaker', '#a0522d', '#c8763a', { sweet: 0.15, bitter: 0.05 }, ['sweet']),
  seas('chili-flakes', 'Chili Flakes', 'shake', 'shaker', '#c8321e', '#e0442a', { spicy: 0.6 }, ['spicy']),
  seas('herbs', 'Herbs', 'shake', 'shaker', '#4a8a2e', '#5aa83e', { bitter: 0.05, umami: 0.1 }, ['herb']),
  seas('sprinkles', 'Sprinkles', 'shake', 'shaker', '#ff5fa8', '#ffd23f', { sweet: 0.3 }, ['sweet', 'candy'], '#5fd3ff'),
  seas('ketchup', 'Ketchup', 'squeeze', 'squeeze', '#c8201a', '#e8302a', { sweet: 0.3, sour: 0.2, umami: 0.2 }),
  seas('mustard', 'Mustard', 'squeeze', 'squeeze', '#f2c21b', '#f2c21b', { sour: 0.3, spicy: 0.2 }),
  seas('mayo', 'Mayo', 'squeeze', 'squeeze', '#fbf6e0', '#f4e9b8', { fat: 0.5, sour: 0.1 }),
  seas('hot-sauce', 'Hot Sauce', 'squeeze', 'bottle', '#e2381b', '#2a8a3a', { spicy: 0.8, sour: 0.2 }, ['spicy']),
  seas('chocolate-syrup', 'Chocolate Syrup', 'squeeze', 'squeeze', '#4a2412', '#6b3a1f', { sweet: 0.6, fat: 0.2 }, ['sweet', 'chocolate']),
  seas('honey', 'Honey', 'squeeze', 'squeeze', '#e8a521', '#f2c14a', { sweet: 0.7 }, ['sweet']),
  seas('soy-sauce', 'Soy Sauce', 'pour', 'bottle', '#2a1508', '#c8321e', { salty: 0.6, umami: 0.5 }),
  seas('olive-oil', 'Olive Oil', 'pour', 'bottle', '#c8b84a', '#6a8a2a', { fat: 0.4 }, ['fat']),
  seas('lemon-juice', 'Lemon Juice', 'pour', 'bottle', '#f4ea8a', '#f8e046', { sour: 0.6 }, ['sour']),
  seas('tomato-sauce', 'Tomato Sauce', 'spread', 'jar', '#c8301e', '#e8432f', { umami: 0.3, sour: 0.2, sweet: 0.1 }),
  seas('jam', 'Jam', 'spread', 'jar', '#b0183a', '#e3263a', { sweet: 0.6, sour: 0.1 }, ['sweet']),
  seas('peanut-butter', 'Peanut Butter', 'spread', 'jar', '#b97a35', '#d89a4a', { fat: 0.5, sweet: 0.2, salty: 0.2, umami: 0.2 }, ['nut']),
  seas('whip', 'Whipped Cream', 'spray', 'can', '#fffdf8', '#5fb0e8', { sweet: 0.4, fat: 0.4 }, ['sweet', 'dairy']),
];

const SEAS_BY_ID = new Map(SEASONINGS.map((s) => [s.id, s]));
export function getSeasoning(id: string): SeasoningDef {
  const s = SEAS_BY_ID.get(id);
  if (!s) throw new Error(`Unknown seasoning id "${id}"`);
  return s;
}
