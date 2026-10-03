// DEV-ONLY minimal stand-in for src/recipes.
import type { FoodState } from '../../food/types';
import { getDef, hasDef } from '../../food/catalog';
export type ReactionKind = 'love' | 'yum' | 'okay' | 'meh' | 'yuck' | 'gross' | 'spicy' | 'sour' | 'burnt' | 'frozen' | 'weird-good' | 'weird-bad' | 'sugar-rush' | 'tears';
export interface MealAnalysis { name: string; dishId: string | null; category: 'breakfast' | 'main' | 'side' | 'soup' | 'salad' | 'dessert' | 'drink' | 'snack' | 'silly'; taste: number; weirdness: number; flags: { burnt: number; raw: number; spicy: number; sour: number; sweet: number; salty: number; frozen: number; hot: number; crunchy: boolean; liquid: boolean; gross: boolean; sugarRush: boolean; onionTears: boolean; melty: boolean }; reaction: ReactionKind; inspect: boolean; blowFirst: boolean; bites: number; eatStyle: 'bite' | 'crunch' | 'slurp' | 'gulp' | 'lick' | 'chew'; quip: string }
export interface DishInfo { id: string; name: string; category: MealAnalysis['category']; hint: string }
export const DISHES: DishInfo[] = [{ id: 'pizza', name: 'Pizza', category: 'main', hint: 'Roll dough flat, add sauce and cheese, bake!' }];
export function nameFood(f: FoodState): string {
  if (f.id === 'assembly') return 'Mystery Stack';
  const n = hasDef(f.id) ? getDef(f.id).name : f.id;
  return f.form === 'whole' ? n : `${f.form[0].toUpperCase()}${f.form.slice(1)} ${n}`;
}
export function recognize(): DishInfo | null { return null; }
const R: ReactionKind[] = ['love', 'yum', 'spicy', 'sour', 'burnt', 'frozen', 'gross', 'weird-good', 'sugar-rush', 'tears', 'meh', 'yuck', 'okay', 'weird-bad'];
let n = 0;
export function analyzeMeal(f: FoodState): MealAnalysis {
  const reaction = (new URLSearchParams(location.search).get('reaction') as ReactionKind) || R[n++ % R.length];
  return { name: nameFood(f), dishId: null, category: 'silly', taste: 0.5, weirdness: 0.3, flags: { burnt: 0, raw: 0, spicy: 0, sour: 0, sweet: 0, salty: 0, frozen: 0, hot: 0, crunchy: true, liquid: false, gross: false, sugarRush: false, onionTears: false, melty: false }, reaction, inspect: n % 2 === 0, blowFirst: f.cook.temp > 0.6, bites: 3, eatStyle: 'bite', quip: 'Yum!' };
}
