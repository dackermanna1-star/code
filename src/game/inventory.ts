// InventorySystem: 4 wands, 4 items (potions), 16 loose spells — Noita's layout.
import { Wand } from '../magic/casting';
import type { SpellInstance } from '../magic/types';
import { MATERIALS, KIND, Kind } from '../world/materials';

export const POTION_CAPACITY = 1000;

export interface Potion {
  kind: 'potion';
  /** material id -> units (1 unit = 1 voxel) */
  contents: Map<number, number>;
  capacity: number;
}

export type Item = Potion;

export function makePotion(mat: number | null, amount = POTION_CAPACITY): Potion {
  const p: Potion = { kind: 'potion', contents: new Map(), capacity: POTION_CAPACITY };
  if (mat !== null && amount > 0) p.contents.set(mat, amount);
  return p;
}

export function potionTotal(p: Potion): number {
  let t = 0;
  for (const v of p.contents.values()) t += v;
  return t;
}

export function potionMain(p: Potion): number | null {
  let best: number | null = null, bv = 0;
  for (const [m, v] of p.contents) if (v > bv) {
    bv = v;
    best = m;
  }
  return best;
}

export function potionName(p: Potion): string {
  const total = potionTotal(p);
  if (total <= 0) return 'Empty flask';
  const parts = [...p.contents.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const pct = Math.round((total / p.capacity) * 100);
  if (parts.length === 1) return `Flask of ${MATERIALS[parts[0][0]].display} (${pct}%)`;
  return `Flask of ${parts.slice(0, 2).map(([m]) => MATERIALS[m].display).join(' & ')} (${pct}%)`;
}

/** Take one unit, choosing materials in equal shares (Noita sprays mixtures evenly). */
export function potionTakeOne(p: Potion, rng: () => number): number | null {
  const keys = [...p.contents.keys()].filter((k) => (p.contents.get(k) ?? 0) > 0);
  if (!keys.length) return null;
  const m = keys[Math.floor(rng() * keys.length)];
  const v = p.contents.get(m)! - 1;
  if (v <= 0) p.contents.delete(m);
  else p.contents.set(m, v);
  return m;
}

export function potionAdd(p: Potion, m: number, n = 1): number {
  const space = p.capacity - potionTotal(p);
  const add = Math.min(space, n);
  if (add <= 0) return 0;
  p.contents.set(m, (p.contents.get(m) ?? 0) + add);
  return add;
}

/** Only liquids, powders and gases can be stored. */
export function canStore(m: number): boolean {
  const k = KIND[m];
  return k === Kind.LIQUID || k === Kind.POWDER;
}

export class Inventory {
  wands: (Wand | null)[] = [null, null, null, null];
  items: (Item | null)[] = [null, null, null, null];
  spells: (SpellInstance | null)[] = new Array(16).fill(null);
  /** 0..3 wand slots, 4..7 item slots */
  selected = 0;

  activeWand(): Wand | null {
    return this.selected < 4 ? this.wands[this.selected] : null;
  }
  activeItem(): Item | null {
    return this.selected >= 4 ? this.items[this.selected - 4] : null;
  }

  addWand(w: Wand): number {
    const i = this.wands.indexOf(null);
    if (i < 0) return -1;
    this.wands[i] = w;
    return i;
  }

  addItem(it: Item): number {
    const i = this.items.indexOf(null);
    if (i < 0) return -1;
    this.items[i] = it;
    return i;
  }

  addSpell(s: SpellInstance): number {
    const i = this.spells.indexOf(null);
    if (i < 0) return -1;
    this.spells[i] = s;
    return i;
  }

  select(i: number): void {
    if (i >= 0 && i < 8) this.selected = i;
  }

  cycle(dir: number): void {
    // cycle through non-empty slots
    for (let k = 1; k <= 8; k++) {
      const i = (this.selected + dir * k + 80) % 8;
      if ((i < 4 && this.wands[i]) || (i >= 4 && this.items[i - 4])) {
        this.selected = i;
        return;
      }
    }
  }
}
