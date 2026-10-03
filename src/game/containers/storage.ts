/**
 * Slot storages: the backing "containers" of menu slots. The player's `Inventory`
 * already satisfies `SlotStorage` structurally (get/set/changed/version/size).
 */
import { serializeStack, deserializeStack, type ItemStack } from '../items/registry';

export interface SlotStorage {
  readonly size: number;
  /** Bumped on every change (UI refresh). */
  version: number;
  get(i: number): ItemStack | null;
  /** Store a stack (empty stacks are normalised to null) and mark changed. */
  set(i: number, s: ItemStack | null): void;
  /** Notify an in-place mutation (stack grown/shrunk). */
  changed(i?: number): void;
  /** Max stack size of this container (default 64). */
  maxStackSize?: number;
}

/** Array-backed container with change listeners. */
export class SimpleContainer implements SlotStorage {
  readonly slots: (ItemStack | null)[];
  version = 0;
  private listeners: ((c: SimpleContainer, slot?: number) => void)[] = [];

  constructor(readonly size: number, public maxStackSize = 64) {
    this.slots = new Array(size).fill(null);
  }

  onChange(fn: (c: SimpleContainer, slot?: number) => void) {
    this.listeners.push(fn);
    return this;
  }

  get(i: number) {
    const s = this.slots[i];
    if (s && s.count <= 0) {
      this.slots[i] = null;
      return null;
    }
    return s ?? null;
  }

  set(i: number, s: ItemStack | null) {
    this.slots[i] = s && s.count > 0 ? s : null;
    this.changed(i);
  }

  changed(i?: number) {
    if (i !== undefined && this.slots[i] && this.slots[i]!.count <= 0) this.slots[i] = null;
    this.version++;
    for (const l of this.listeners) l(this, i);
  }

  isEmpty() {
    return this.slots.every((s) => !s || s.count <= 0);
  }

  clear() {
    this.slots.fill(null);
    this.changed();
  }

  /** Remove everything and return the non-empty stacks. */
  takeAll(): ItemStack[] {
    const out = this.slots.filter((s): s is ItemStack => !!s && s.count > 0);
    this.slots.fill(null);
    this.changed();
    return out;
  }

  serialize() {
    return this.slots.map((s) => serializeStack(s && s.count > 0 ? s : null));
  }

  load(arr: any[] | undefined) {
    for (let i = 0; i < this.size; i++) this.slots[i] = deserializeStack(arr?.[i] ?? null);
    this.version++;
  }
}

/**
 * A storage bound to a serialised array (`items` of a block entity, the ender chest list in
 * `player.data`): keeps identity-stable live stacks, writes back on every change and picks up
 * external writes to the serialised array (compares element identity).
 */
export class SerializedStorage implements SlotStorage {
  version = 0;
  private live: (ItemStack | null)[];
  private ser: any[];
  private listeners: ((s: SerializedStorage, slot?: number) => void)[] = [];
  /** Called after every write-back (mark chunk modified etc.). */
  onFlush: (() => void) | null = null;

  constructor(private owner: any, private key: string, readonly size: number, public maxStackSize = 64) {
    if (!Array.isArray(owner[key])) owner[key] = [];
    const arr: any[] = owner[key];
    while (arr.length < size) arr.push(null);
    this.ser = arr.slice(0, size);
    this.live = this.ser.map((o) => deserializeStack(o));
  }

  get array(): any[] {
    return this.owner[this.key];
  }

  onChange(fn: (s: SerializedStorage, slot?: number) => void) {
    this.listeners.push(fn);
    return this;
  }

  private sync(i: number) {
    const arr = this.owner[this.key] as any[];
    const cur = arr ? arr[i] ?? null : null;
    if (cur !== this.ser[i]) {
      this.ser[i] = cur;
      this.live[i] = deserializeStack(cur);
    }
  }

  get(i: number): ItemStack | null {
    this.sync(i);
    const s = this.live[i];
    return s && s.count > 0 ? s : null;
  }

  set(i: number, s: ItemStack | null) {
    this.sync(i);
    this.live[i] = s && s.count > 0 ? s : null;
    this.changed(i);
  }

  changed(i?: number) {
    this.flush();
    this.version++;
    for (const l of this.listeners) l(this, i);
  }

  flush() {
    let arr = this.owner[this.key] as any[];
    if (!Array.isArray(arr)) arr = this.owner[this.key] = [];
    for (let i = 0; i < this.size; i++) {
      const s = this.live[i];
      const o = s && s.count > 0 ? serializeStack(s) : null;
      if (!s || s.count <= 0) this.live[i] = null;
      arr[i] = o;
      this.ser[i] = o;
    }
    this.onFlush?.();
  }

  isEmpty() {
    for (let i = 0; i < this.size; i++) if (this.get(i)) return false;
    return true;
  }
}

/** A read-through view combining several storages (double chest = upper + lower half). */
export class CompoundStorage implements SlotStorage {
  readonly size: number;
  constructor(readonly parts: SlotStorage[]) {
    this.size = parts.reduce((a, p) => a + p.size, 0);
  }
  get maxStackSize() {
    return this.parts[0]?.maxStackSize ?? 64;
  }
  get version() {
    let v = 0;
    for (const p of this.parts) v += p.version;
    return v;
  }
  set version(_v: number) {
    /* derived */
  }
  private locate(i: number): [SlotStorage, number] {
    for (const p of this.parts) {
      if (i < p.size) return [p, i];
      i -= p.size;
    }
    return [this.parts[this.parts.length - 1], this.parts[this.parts.length - 1].size - 1];
  }
  get(i: number) {
    const [p, j] = this.locate(i);
    return p.get(j);
  }
  set(i: number, s: ItemStack | null) {
    const [p, j] = this.locate(i);
    p.set(j, s);
  }
  changed(i?: number) {
    if (i === undefined) for (const p of this.parts) p.changed();
    else {
      const [p, j] = this.locate(i);
      p.changed(j);
    }
  }
}

/** Comparator output of a container (Minecraft `getRedstoneSignalFromContainer`). */
export function comparatorSignal(st: SlotStorage | null | undefined): number {
  if (!st) return 0;
  let f = 0;
  let any = false;
  const max = st.maxStackSize ?? 64;
  for (let i = 0; i < st.size; i++) {
    const s = st.get(i);
    if (!s) continue;
    f += s.count / Math.min(max, s.item.maxStack);
    any = true;
  }
  f /= st.size;
  return Math.floor(f * 14) + (any ? 1 : 0);
}
