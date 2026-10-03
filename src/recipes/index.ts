// Recipes & taste: what a plate of food is called, which cookbook dish it is, and what Mochi
// thinks of it. Pure logic over FoodState (see src/food/process.ts for how food changes).

export { DISHES, recognize, type DishInfo, type MealCategory } from './dishes';
export { nameFood } from './naming';
export { analyzeMeal, type MealAnalysis, type ReactionKind } from './taste';
