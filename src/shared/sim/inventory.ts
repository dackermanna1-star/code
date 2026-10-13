import { itemDef, tryItemDef, type WearSlot, WEAR_SLOTS } from '../data/items';

/**
 * Item stacks and containers. Pure logic shared by server (authoritative)
 * and client (UI prediction / validation hints). Every mutation is
 * all-or-nothing: either the whole operation applies or nothing changes —
 * this is what makes duplication bugs structurally hard.
 */

export interface ItemStack {
  id: string;
  n: number;
  /** Remaining durability (tools/weapons). */
  dur?: number;
  /** Loaded rounds (weapons with magazines). */
  ammo?: number;
  /** Ammo type currently loaded. */
  ammoType?: string;
}

export type SlotFilter = (stack: ItemStack, slot: number) => boolean;

export class Container {
  slots: (ItemStack | null)[];
  /** Bumped on every change (client sync). */
  rev = 0;

  constructor(readonly size: number, readonly filter?: SlotFilter) {
    this.slots = new Array(size).fill(null);
  }

  get(i: number) {
    return this.slots[i] ?? null;
  }

  accepts(stack: ItemStack, slot: number) {
    return !this.filter || this.filter(stack, slot);
  }

  isEmpty() {
    return this.slots.every((s) => !s);
  }

  touch() {
    this.rev++;
  }

  toJSON(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  load(arr: (ItemStack | null)[]) {
    for (let i = 0; i < this.size; i++) {
      const s = arr[i];
      this.slots[i] = s && tryItemDef(s.id) && s.n > 0 ? { ...s } : null;
    }
    this.touch();
  }
}

export function makeStack(id: string, n = 1): ItemStack {
  const d = itemDef(id);
  const s: ItemStack = { id, n };
  if (d.durability) s.dur = d.durability;
  if (d.weapon?.magazine) s.ammo = 0;
  return s;
}

/** Stacks are mergeable if same item and neither carries per-instance state. */
export function canMerge(a: ItemStack, b: ItemStack): boolean {
  if (a.id !== b.id) return false;
  const d = itemDef(a.id);
  if (d.stack <= 1) return false;
  return a.dur === undefined && b.dur === undefined;
}

/** Count of an item across containers. */
export function countItem(containers: Container[], id: string): number {
  let n = 0;
  for (const c of containers) for (const s of c.slots) if (s && s.id === id) n += s.n;
  return n;
}

/** How many of `stack` would fit into the container. */
export function spaceFor(c: Container, stack: ItemStack): number {
  const d = itemDef(stack.id);
  let space = 0;
  for (let i = 0; i < c.size; i++) {
    const s = c.slots[i];
    if (!c.accepts(stack, i)) continue;
    if (!s) space += d.stack;
    else if (canMerge(s, stack)) space += Math.max(0, d.stack - s.n);
  }
  return space;
}

/**
 * Add a stack, merging into existing stacks first. Returns the number of
 * items that did NOT fit (0 = all added). Mutates `c`.
 */
export function addStack(c: Container, stack: ItemStack, preferSlots?: number[]): number {
  const d = itemDef(stack.id);
  let left = stack.n;
  const order = preferSlots ? [...preferSlots, ...range(c.size).filter((i) => !preferSlots.includes(i))] : range(c.size);
  // merge
  for (const i of order) {
    if (left <= 0) break;
    const s = c.slots[i];
    if (s && canMerge(s, stack) && c.accepts(stack, i)) {
      const take = Math.min(left, d.stack - s.n);
      if (take > 0) {
        s.n += take;
        left -= take;
      }
    }
  }
  // empty slots
  for (const i of order) {
    if (left <= 0) break;
    if (!c.slots[i] && c.accepts(stack, i)) {
      const take = Math.min(left, d.stack);
      c.slots[i] = { ...stack, n: take };
      left -= take;
    }
  }
  if (left !== stack.n) c.touch();
  return left;
}

/** Add to the first container with space, spilling into the next. Returns leftover. */
export function addToAny(containers: Container[], stack: ItemStack): number {
  let left = stack.n;
  for (const c of containers) {
    if (left <= 0) break;
    left = addStack(c, { ...stack, n: left });
  }
  return left;
}

/** Remove `n` of an item across containers; all-or-nothing. */
export function removeItem(containers: Container[], id: string, n: number): boolean {
  if (n <= 0) return true;
  if (countItem(containers, id) < n) return false;
  let left = n;
  for (const c of containers) {
    for (let i = c.size - 1; i >= 0 && left > 0; i--) {
      const s = c.slots[i];
      if (s && s.id === id) {
        const take = Math.min(left, s.n);
        s.n -= take;
        left -= take;
        if (s.n <= 0) c.slots[i] = null;
        c.touch();
      }
    }
  }
  return true;
}

/** Remove a list of ingredients atomically. */
export function removeAll(containers: Container[], items: Array<[string, number]>): boolean {
  // Aggregate first so a list naming the same item twice is checked against its total.
  const need = new Map<string, number>();
  for (const [id, n] of items) need.set(id, (need.get(id) ?? 0) + Math.max(0, n));
  for (const [id, n] of need) if (countItem(containers, id) < n) return false;
  for (const [id, n] of need) if (!removeItem(containers, id, n)) throw new Error(`removeAll: inconsistent count for ${id}`);
  return true;
}

export function hasAll(containers: Container[], items: Array<[string, number]>, mult = 1): boolean {
  return items.every(([id, n]) => countItem(containers, id) >= n * mult);
}

export type MoveResult = { ok: true } | { ok: false; error: string };

/**
 * Move up to `count` items from src[si] to dst[di]. Behaviour:
 *   - empty target: move (split if count < stack)
 *   - same mergeable item: merge up to max stack
 *   - different item & full move: swap (if both slots accept the other stack)
 */
export function moveItem(src: Container, si: number, dst: Container, di: number, count?: number): MoveResult {
  if (!Number.isInteger(si) || !Number.isInteger(di) || si < 0 || di < 0 || si >= src.size || di >= dst.size) {
    return { ok: false, error: 'Invalid slot' };
  }
  const a = src.slots[si];
  if (!a) return { ok: false, error: 'Nothing to move' };
  if (src === dst && si === di) return { ok: true };
  const n = count === undefined ? a.n : Math.floor(count);
  if (!(n > 0) || n > a.n) return { ok: false, error: 'Invalid amount' };
  const moving: ItemStack = { ...a, n };
  if (!dst.accepts(moving, di)) return { ok: false, error: 'That item does not fit there' };
  const b = dst.slots[di];
  const d = itemDef(a.id);
  if (!b) {
    dst.slots[di] = moving;
    a.n -= n;
    if (a.n <= 0) src.slots[si] = null;
  } else if (canMerge(a, b)) {
    const take = Math.min(n, d.stack - b.n);
    if (take <= 0) return { ok: false, error: 'Stack is full' };
    b.n += take;
    a.n -= take;
    if (a.n <= 0) src.slots[si] = null;
  } else {
    if (n !== a.n) return { ok: false, error: 'Slot occupied' };
    if (!src.accepts(b, si)) return { ok: false, error: 'Cannot swap those items' };
    src.slots[si] = b;
    dst.slots[di] = a;
  }
  src.touch();
  if (dst !== src) dst.touch();
  return { ok: true };
}

/** Quick-move: send the whole stack into the first container in `targets` that has room. */
export function quickMove(src: Container, si: number, targets: Container[]): MoveResult {
  const a = src.slots[si];
  if (!a) return { ok: false, error: 'Nothing to move' };
  for (const t of targets) {
    if (t === src) continue;
    const before = a.n;
    const left = addStack(t, { ...a });
    if (left < before) {
      if (left <= 0) src.slots[si] = null;
      else a.n = left;
      src.touch();
      return { ok: true };
    }
  }
  return { ok: false, error: 'No room' };
}

/** Player inventory layout. */
export const MAIN_SLOTS = 24;
export const BELT_SLOTS = 6;

export function wearFilter(): SlotFilter {
  return (stack, slot) => {
    const d = tryItemDef(stack.id);
    return !!d?.clothing && d.clothing.slot === WEAR_SLOTS[slot];
  };
}

export function wearSlotIndex(slot: WearSlot) {
  return WEAR_SLOTS.indexOf(slot);
}

export class PlayerInventory {
  main = new Container(MAIN_SLOTS);
  belt = new Container(BELT_SLOTS);
  wear = new Container(WEAR_SLOTS.length, wearFilter());

  /** Search order for crafting & consumption: belt last so tools stay. */
  all(): Container[] {
    return [this.main, this.belt];
  }

  /**
   * Where newly acquired items go: tools, weapons, consumables and placeables
   * land on the belt (hotbar) first; bulk resources, ammo and components go to
   * the main inventory first so they never crowd the hotbar.
   */
  pickupOrder(itemId?: string): Container[] {
    const cat = itemId ? tryItemDef(itemId)?.category : undefined;
    const bulk = cat === 'resource' || cat === 'component' || cat === 'ammo' || cat === 'block';
    return bulk ? [this.main, this.belt] : [this.belt, this.main];
  }

  toJSON() {
    return { main: this.main.toJSON(), belt: this.belt.toJSON(), wear: this.wear.toJSON() };
  }

  load(j: { main?: (ItemStack | null)[]; belt?: (ItemStack | null)[]; wear?: (ItemStack | null)[] }) {
    if (j.main) this.main.load(j.main);
    if (j.belt) this.belt.load(j.belt);
    if (j.wear) this.wear.load(j.wear);
  }

  clear() {
    for (const c of [this.main, this.belt, this.wear]) {
      c.slots.fill(null);
      c.touch();
    }
  }
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i);
}
