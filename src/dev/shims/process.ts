// DEV-ONLY minimal stand-in for src/food/process.ts (used with MUNCH_SHIMS=1 before the real engine exists).
import { CUT_SEQUENCES, makeFood, type FoodState, type Form } from '../../food/types';
import { getDef, hasDef } from '../../food/catalog';
export type HeatMethod = 'fry' | 'grill' | 'boil' | 'bake' | 'deepfry' | 'toast' | 'micro';
export type StationKind = string;
export interface CookEvent { kind: 'done' | 'burning' | 'burnt' | 'transform' | 'melted' | 'popped' | 'exploded' | 'frozen' | 'thawed'; rebuild?: boolean; label?: string }
export function applyHeat(f: FoodState, m: HeatMethod, dt: number, heat = 1): CookEvent[] {
  const ct = hasDef(f.id) ? getDef(f.id).cookTime : 8;
  (f.cook as unknown as Record<string, number>)[m] += (heat * dt) / ct;
  f.cook.temp = Math.min(1, f.cook.temp + dt);
  const d = f.cook.fry + f.cook.grill + f.cook.bake + f.cook.deepfry + f.cook.toast;
  if (d > 1.7) f.cook.burn = Math.min(1, f.cook.burn + dt / ct);
  for (const p of f.parts ?? []) applyHeat(p, m, dt, heat);
  return [];
}
export function applyCold(f: FoodState, dt: number): CookEvent[] { f.cook.freeze = Math.min(1, f.cook.freeze + dt / 8); f.cook.temp = -1; return []; }
export function applyRoom(f: FoodState, dt: number): CookEvent[] { f.cook.temp *= Math.exp(-dt / 25); return []; }
export function enterStation(f: FoodState): FoodState { return f; }
export function canCut(f: FoodState) { return cut(f) !== null; }
export function cut(f: FoodState): FoodState | null {
  if (f.id === 'assembly') return f.form === 'whole' ? { ...f, form: 'halved' } : f.form === 'halved' ? { ...f, form: 'sliced' } : null;
  const seq = CUT_SEQUENCES[hasDef(f.id) ? getDef(f.id).cut : 'none'];
  const i = seq.indexOf(f.form);
  if (i < 0 || i >= seq.length - 1) return null;
  return { ...f, form: seq[i + 1] as Form };
}
export function canPeel(f: FoodState) { return hasDef(f.id) && !!getDef(f.id).peelable && !f.peeled; }
export function peel(f: FoodState) { return canPeel(f) ? { ...f, peeled: true } : null; }
export function flatten(f: FoodState) { return f.form === 'flat' ? null : { ...f, form: 'flat' as Form }; }
export function mash(f: FoodState) { return f.id === 'assembly' || f.form === 'mashed' ? null : { ...f, form: 'mashed' as Form }; }
export function combine(base: FoodState, added: FoodState): FoodState {
  if (base.id === 'assembly') return { ...base, parts: [...(base.parts ?? []), added] };
  const layout = base.id === 'bun' || base.id === 'bread' ? 'stack' : base.form === 'flat' ? 'topped' : 'pile';
  return { ...makeFood('assembly'), layout, parts: [base, added] };
}
const CONTAINER = new Set(['drink', 'soup', 'batter', 'beaten-egg', 'sweet-cream', 'whipped-cream', 'mixture', 'scoops']);
export function isContainerProduct(f: FoodState) { return CONTAINER.has(f.id); }
export function isLiquid(f: FoodState) { return ['drink', 'soup', 'milk', 'cream', 'batter', 'beaten-egg', 'sweet-cream'].includes(f.id); }
export function tintOf(c: FoodState[]): string { return c.length && hasDef(c[0].id) ? getDef(c[0].id).colors.juice ?? getDef(c[0].id).colors.flesh : '#e8a050'; }
export function mixBowl(c: FoodState[]): FoodState { return { ...makeFood('mixture'), from: c, tint: tintOf(c) }; }
export function blend(c: FoodState[]): FoodState { return { ...makeFood('drink'), from: c, tint: tintOf(c) }; }
export function potMerge(c: FoodState[]): FoodState | null { return c.length >= 2 && c.every((x) => x.cook.boil > 0.5) ? { ...makeFood('soup'), from: c, tint: tintOf(c) } : null; }
export function panMerge(): FoodState | null { return null; }
export function addSeasoning(f: FoodState, id: string, amt: number) { f.season[id] = (f.season[id] ?? 0) + amt; }
export function leaves(f: FoodState): FoodState[] { return f.parts ? f.parts.flatMap(leaves) : [f]; }
