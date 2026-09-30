import { Rng, hashString } from '../core/math';
import {
  BunId,
  BUNS,
  CHEESES,
  Doneness,
  INGREDIENTS,
  IngredientId,
  LayerId,
  PATTIES,
  PATTY_COOK,
  PattyId,
  SAUCES,
  TOPPINGS,
} from '../food/Ingredients';
import type { CustomerDef } from '../characters/Roster';

export interface OrderLayer {
  id: LayerId;
  doneness?: Doneness;
}

export interface Order {
  id: number;
  ticket: number;
  customerId: string;
  customerName: string;
  bun: BunId;
  layers: OrderLayer[];
  /** game seconds when the customer reached the counter */
  arrivedAt: number;
  orderedAt: number;
  status: 'waiting' | 'building' | 'ready' | 'served' | 'void';
}

export interface OrderContext {
  rank: number;
  day: number;
}

/** All ingredients available at a rank. */
export function available(rank: number) {
  const ok = (id: IngredientId) => INGREDIENTS[id].unlockRank <= rank;
  return {
    buns: BUNS.filter(ok),
    patties: PATTIES.filter(ok),
    cheeses: CHEESES.filter(ok),
    toppings: TOPPINGS.filter(ok),
    sauces: SAUCES.filter(ok),
  };
}

/**
 * Deterministic order for a customer at the current unlock tier, so regulars
 * keep ordering "their" burger (and players learn favourites), changing when
 * new ingredients unlock. A small daily variation keeps things fresh.
 */
export function generateOrder(c: CustomerDef, ctx: OrderContext, variation = 0): { bun: BunId; layers: OrderLayer[] } {
  const av = available(ctx.rank);
  const tier = av.buns.length + av.patties.length + av.cheeses.length + av.toppings.length + av.sauces.length;
  const rng = new Rng(hashString(`${c.id}|${tier}|${variation}`));
  const likes = new Set<IngredientId>(c.likes);
  const dislikes = new Set<IngredientId>(c.dislikes);
  const w = (id: IngredientId) => (dislikes.has(id) ? 0 : INGREDIENTS[id].weight * (likes.has(id) ? 4 : 1));

  // --- bun
  let bun: BunId = 'bun_sesame';
  if (c.bun && av.buns.includes(c.bun)) bun = c.bun;
  else if (av.buns.length > 1 && rng.chance(0.45)) bun = rng.weighted(av.buns, w);

  // --- complexity from rank + appetite
  const r = ctx.rank;
  const app = c.appetite;
  let patties = 1;
  if (r >= 3 && app > 0.55 && rng.chance(0.35 + app * 0.4)) patties = 2;
  if (r >= 9 && app > 0.85 && rng.chance(0.5)) patties = 3;
  const baseToppings = 1 + Math.min(4, Math.floor(r / 3)) + Math.round(app * 1.5);
  const toppingCount = Math.max(1, Math.min(av.toppings.length, Math.min(6, baseToppings + rng.int(-1, 1))));
  const sauceCount = Math.max(1, Math.min(av.sauces.length, 1 + (r >= 4 && rng.chance(0.55) ? 1 : 0) + (r >= 12 && rng.chance(0.3) ? 1 : 0)));

  // --- pick ingredients (no repeats)
  const pickMany = <T extends IngredientId>(pool: T[], n: number): T[] => {
    const out: T[] = [];
    const left = pool.filter((id) => w(id) > 0);
    for (let i = 0; i < n && left.length; i++) {
      const choice = rng.weighted(left, w);
      out.push(choice);
      left.splice(left.indexOf(choice), 1);
    }
    return out;
  };
  const toppings = pickMany(av.toppings, toppingCount);
  const sauces = pickMany(av.sauces, sauceCount);
  const wantsCheese = av.cheeses.length > 0 && !c.dislikes.some((d) => d.startsWith('cheese')) && rng.chance(0.78);
  const cheese = wantsCheese ? rng.weighted(av.cheeses, w) : null;

  const pattyKinds: PattyId[] = [];
  for (let i = 0; i < patties; i++) {
    const kind = av.patties.length > 1 && rng.chance(0.35) ? rng.weighted(av.patties, (p) => w(p) + 1) : likes.has('patty_chicken') && av.patties.includes('patty_chicken') ? 'patty_chicken' : av.patties[0];
    pattyKinds.push(kind);
  }
  const doneness = (kind: PattyId): Doneness => PATTY_COOK[kind].forced ?? rng.pick(c.doneness.length ? c.doneness : (['medium'] as Doneness[]));

  // --- assemble layer order
  const layers: OrderLayer[] = [];
  const under: IngredientId[] = [];
  const rest: IngredientId[] = [];
  for (const t of toppings) {
    if ((t === 'lettuce' || t === 'tomato') && rng.chance(0.45)) under.push(t);
    else rest.push(t);
  }
  const bottomSauce = sauces.length > 1 || rng.chance(0.3) ? sauces.shift()! : null;
  if (bottomSauce) layers.push({ id: bottomSauce as LayerId });
  for (const u of under) layers.push({ id: u as LayerId });
  const perPatty = Math.ceil(rest.length / patties);
  for (let i = 0; i < patties; i++) {
    const kind = pattyKinds[i];
    layers.push({ id: kind, doneness: doneness(kind) });
    if (cheese && (i === 0 || rng.chance(0.6))) layers.push({ id: cheese as LayerId });
    for (const t of rest.splice(0, perPatty)) layers.push({ id: t as LayerId });
  }
  for (const s of sauces) layers.push({ id: s as LayerId });
  return { bun, layers };
}

export function describeOrder(o: { bun: BunId; layers: OrderLayer[] }): string {
  return [INGREDIENTS[o.bun].name, ...o.layers.map((l) => (l.doneness ? `${INGREDIENTS[l.id].name} (${l.doneness})` : INGREDIENTS[l.id].name))].join(', ');
}
