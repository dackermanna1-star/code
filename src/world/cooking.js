// Stove & oven recipes. Ingredients are grocery item ids that get consumed
// (one "use" each); `makes` is the dish item spawned on the counter.
// Recipes with `learn: true` must be unlocked by reading a cookbook first.
export const RECIPES = [
  { id: 'fried_egg', name: 'Fried Eggs', method: 'stove', cookware: 'pan', seconds: 8, ingredients: ['eggs'], makes: 'dish_fried_eggs', color: '#fff3c4' },
  { id: 'french_toast', name: 'French Toast', method: 'stove', cookware: 'pan', seconds: 10, ingredients: ['bread', 'eggs', 'milk'], makes: 'dish_french_toast', color: '#d9a05b' },
];
export function registerRecipes(list) { for (const r of list) if (!RECIPES.some((x) => x.id === r.id)) RECIPES.push(r); }
