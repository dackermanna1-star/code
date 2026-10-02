/**
 * Player inventory (Minecraft layout): slots 0-8 hotbar, 9-35 main, 36-39 armor (feet, legs, chest, head), 40 offhand.
 */
import { cloneStack, stackable, type ItemStack, serializeStack, deserializeStack, type ItemDef } from './items/registry';

export const HOTBAR = 0;
export const MAIN = 9;
export const ARMOR = 36; // 36 feet, 37 legs, 38 chest, 39 head
export const OFFHAND = 40;
export const INV_SIZE = 41;

export class Inventory {
  readonly slots: (ItemStack | null)[];
  selected = 0;
  /** Bumped on every change (UI refresh). */
  version = 0;

  constructor(readonly size = INV_SIZE) {
    this.slots = new Array(size).fill(null);
  }

  changed() {
    this.version++;
  }

  get(i: number) {
    return this.slots[i];
  }
  set(i: number, s: ItemStack | null) {
    this.slots[i] = s && s.count > 0 ? s : null;
    this.changed();
  }
  get held(): ItemStack | null {
    return this.slots[this.selected];
  }
  get offhand(): ItemStack | null {
    return this.slots[OFFHAND];
  }

  /** Add a stack; returns leftover count (0 = everything fit). Fills hotbar first like Minecraft. */
  add(s: ItemStack): number {
    let left = s.count;
    const order: number[] = [];
    for (let i = 0; i < 36; i++) order.push(i);
    // merge into existing stacks (hotbar first, then main)
    for (const i of order) {
      const t = this.slots[i];
      if (!t || !stackable(t, s)) continue;
      const room = t.item.maxStack - t.count;
      if (room <= 0) continue;
      const n = Math.min(room, left);
      t.count += n;
      left -= n;
      if (left === 0) break;
    }
    if (left > 0)
      for (const i of order) {
        if (this.slots[i]) continue;
        const n = Math.min(s.item.maxStack, left);
        const ns = cloneStack(s)!;
        ns.count = n;
        this.slots[i] = ns;
        left -= n;
        if (left === 0) break;
      }
    if (left !== s.count) this.changed();
    return left;
  }

  /** Count items of a type. */
  count(item: ItemDef): number {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.slots[i]?.item === item) n += this.slots[i]!.count;
    return n;
  }

  /** Remove up to n items of a type (returns removed count). */
  remove(item: ItemDef, n: number): number {
    let rem = 0;
    for (let i = 0; i < this.size && rem < n; i++) {
      const s = this.slots[i];
      if (!s || s.item !== item) continue;
      const k = Math.min(s.count, n - rem);
      s.count -= k;
      rem += k;
      if (s.count <= 0) this.slots[i] = null;
    }
    if (rem) this.changed();
    return rem;
  }

  /** Find a slot containing an item matching the predicate. */
  find(pred: (s: ItemStack) => boolean): number {
    for (let i = 0; i < this.size; i++) if (this.slots[i] && pred(this.slots[i]!)) return i;
    return -1;
  }

  /** Decrease the held stack by n. */
  consumeHeld(n = 1, slot = this.selected) {
    const s = this.slots[slot];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[slot] = null;
    this.changed();
  }

  clear() {
    this.slots.fill(null);
    this.changed();
  }

  serialize(): any {
    return { s: this.slots.map(serializeStack), sel: this.selected };
  }
  deserialize(o: any) {
    if (!o) return;
    for (let i = 0; i < this.size; i++) this.slots[i] = deserializeStack(o.s?.[i]);
    this.selected = o.sel ?? 0;
    this.changed();
  }
}
