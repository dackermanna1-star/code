/**
 * Villager trading interface. Merchants (villagers, wandering traders — mob workstream)
 * implement `Merchant`; the trading screen is opened with `openMerchant(game, merchant)`
 * (src/game/containers/system.ts) or `game.containers.openMerchant(merchant)`.
 *
 *   class Villager extends LivingEntity implements Merchant {
 *     getOffers(player) { return this.offers; }          // TradeOffer[] (mutable, persistent)
 *     onTrade(offer, player) { this.xp += offer.xp ?? 0; ... }  // after uses++ and payment
 *     interact(player) { openMerchant(this.game, this, player); return true; }
 *   }
 */
import { ITEM_BY_NAME, type ItemStack } from '../items/registry';
import { sameItem, deepEqual } from './stacks';

/** A trade item: a real ItemStack or a lightweight `{ item: 'emerald', count: 3 }` description. */
export type TradeItem = ItemStack | { item: string; count: number; damage?: number; ench?: Record<string, number>; data?: Record<string, any> };

export interface TradeOffer {
  /** First cost (base count; the effective price includes demand/special price). */
  buy: TradeItem;
  /** Optional second cost. */
  buyB?: TradeItem | null;
  /** Result. */
  sell: TradeItem;
  uses: number;
  maxUses: number;
  /** Villager XP granted per trade. */
  xp?: number;
  /** Price multiplier for demand (0.05 or 0.2 in vanilla). */
  priceMultiplier?: number;
  /** Added to the first cost count (discounts negative, e.g. Hero of the Village). */
  specialPrice?: number;
  demand?: number;
  /** Player receives 3-6 XP per trade (default true). */
  rewardExp?: boolean;
}

export interface Merchant {
  getOffers(player: any): TradeOffer[];
  onTrade(offer: TradeOffer, player: any): void;
  /** Title shown on the screen ("Farmer", "Wandering Trader"). */
  merchantName?: string;
  /** Villager level 1..5 (Novice .. Master) and XP for the progress bar (0 = hide). */
  merchantLevel?: number;
  merchantXp?: number;
  /** Optional: the merchant entity (distance checks). */
  pos?: { x: number; y: number; z: number; distanceTo?: any };
  removed?: boolean;
  /** Called when the trading screen closes. */
  onTradingClosed?(player: any): void;
}

export const MERCHANT_LEVELS = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
/** Villager XP needed to reach level n (index = level). */
export const MERCHANT_XP = [0, 10, 70, 150, 250];

/** Resolve a trade item to a stack (null if the item is not registered). */
export function tradeStack(t: TradeItem | null | undefined, count?: number): ItemStack | null {
  if (!t) return null;
  const def = typeof t.item === 'string' ? ITEM_BY_NAME.get(t.item) : t.item;
  if (!def) return null;
  const s: ItemStack = { item: def, count: count ?? t.count, damage: t.damage ?? 0 };
  if (t.ench) s.ench = { ...t.ench };
  if (t.data) s.data = JSON.parse(JSON.stringify(t.data));
  return s;
}

/** Effective first cost (MerchantOffer.getCostA): demand and special price adjust the count. */
export function costA(o: TradeOffer): ItemStack | null {
  const base = tradeStack(o.buy);
  if (!base) return null;
  const n = base.count;
  const demandExtra = Math.max(0, Math.floor(n * (o.demand ?? 0) * (o.priceMultiplier ?? 0)));
  base.count = Math.max(1, Math.min(base.item.maxStack, n + demandExtra + (o.specialPrice ?? 0)));
  return base;
}
export function costB(o: TradeOffer): ItemStack | null {
  return tradeStack(o.buyB ?? null);
}
export function outOfStock(o: TradeOffer) {
  return o.uses >= o.maxUses;
}

/** MerchantOffer.isRequiredItem: same item; required data must be a subset of the offered stack's data. */
export function isRequiredItem(offered: ItemStack | null, required: ItemStack | null): boolean {
  if (!required) return !offered || offered.count <= 0;
  if (!offered || !sameItem(offered, required)) return false;
  if (required.data) for (const k of Object.keys(required.data)) if (!deepEqual(required.data[k], offered.data?.[k])) return false;
  return true;
}

/** MerchantOffer.satisfiedBy */
export function satisfiedBy(o: TradeOffer, a: ItemStack | null, b: ItemStack | null): boolean {
  const ca = costA(o), cb = costB(o);
  if (!ca) return false;
  if (!a || !isRequiredItem(a, ca) || a.count < ca.count) return false;
  if (cb) {
    if (!b || !isRequiredItem(b, cb) || b.count < cb.count) return false;
  } else if (b && b.count > 0) {
    return false; // vanilla: with no second cost the second payment slot must be empty
  }
  return true;
}

/** Find the offer the payment slots satisfy (selected index first, like MerchantOffers.getRecipeFor). */
export function findOffer(offers: TradeOffer[], a: ItemStack | null, b: ItemStack | null, hint: number): { offer: TradeOffer; index: number } | null {
  if (!a && b) {
    a = b;
    b = null;
  }
  if (hint >= 0 && hint < offers.length && satisfiedBy(offers[hint], a, b)) return { offer: offers[hint], index: hint };
  for (let i = 0; i < offers.length; i++) if (satisfiedBy(offers[i], a, b)) return { offer: offers[i], index: i };
  return null;
}
