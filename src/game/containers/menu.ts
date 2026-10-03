/**
 * Container menus: a list of slots over one or more storages plus a cursor ("carried")
 * stack, with Minecraft's exact click semantics (port of AbstractContainerMenu.doClick):
 *
 *  - PICKUP      left/right click: pick up / place / swap / merge, right = half / one
 *  - QUICK_MOVE  shift-click (per-menu `quickMoveStack` target regions, repeated like vanilla)
 *  - SWAP        number keys 1-9 (button 0..8) and F (button 40) while hovering
 *  - CLONE       middle click in creative (full stack to the cursor)
 *  - THROW       Q (button 0 = one) / Ctrl+Q (button 1 = whole stack)
 *  - QUICK_CRAFT drag distribution (left = even split, right = one each, middle = clone in creative)
 *  - PICKUP_ALL  double click: collect matching items to the cursor
 *
 * Menus are pure logic (no DOM) so they are unit-tested in node; `src/ui/containers` renders them.
 */
import type { ItemStack } from '../items/registry';
import type { Player } from '../../entity/player';
import { isEmpty, copyWithCount, splitStack, sameItem, sameItemSameTags } from './stacks';
import type { SlotStorage } from './storage';

export type ClickType = 'pickup' | 'quick_move' | 'swap' | 'clone' | 'throw' | 'quick_craft' | 'pickup_all';

/** Slot id used for clicks outside the window (drops the cursor stack). */
export const OUTSIDE = -999;

/** Side effects a menu needs from the game (kept abstract for tests). */
export interface MenuHost {
  readonly player: Player;
  /** Drop a stack in front of the player (thrown from the hand). */
  drop(stack: ItemStack): void;
  /** Event sink (`game.events.emit`). */
  emit(name: string, payload: any): void;
  /** The game (optional; real games only). */
  readonly game?: any;
}

/** One slot of a menu, bound to (storage, index). Subclasses implement special slots. */
export class Slot {
  /** Index in `menu.slots` (assigned by `addSlot`). */
  index = -1;
  menu!: ContainerMenu;
  /** Optional UI hints: background icon when empty ('helmet', 'chestplate', 'shield', 'lapis', 'bottle', 'fuel', ...). */
  hint?: string;
  /** Hidden slots are not rendered (creative tab switching). */
  hidden = false;

  constructor(readonly storage: SlotStorage, readonly slot: number, public x = 0, public y = 0) {}

  get item(): ItemStack | null {
    const s = this.storage.get(this.slot);
    return s && s.count > 0 ? s : null;
  }
  hasItem() {
    return !!this.item;
  }
  /** Store a stack (setByPlayer). */
  set(s: ItemStack | null) {
    this.storage.set(this.slot, s && s.count > 0 ? s : null);
  }
  setChanged() {
    this.storage.changed(this.slot);
  }
  mayPlace(_s: ItemStack): boolean {
    return true;
  }
  mayPickup(_player: Player): boolean {
    return true;
  }
  maxStackSize(): number {
    return this.storage.maxStackSize ?? 64;
  }
  maxStackFor(s: ItemStack): number {
    return Math.min(this.maxStackSize(), s.item.maxStack);
  }
  /** Remove up to n items (Container.removeItem). */
  remove(n: number): ItemStack | null {
    const s = this.item;
    if (!s || n <= 0) return null;
    const out = splitStack(s, n);
    if (s.count <= 0) this.storage.set(this.slot, null);
    else this.storage.changed(this.slot);
    return out.count > 0 ? out : null;
  }
  onTake(_player: Player, _stack: ItemStack) {
    this.setChanged();
  }
  /** Called by quick-move of result slots with the amount crafted. */
  onQuickCraft(original: ItemStack, current: ItemStack) {
    const n = original.count - current.count;
    if (n > 0) this.onQuickCraftAmount(original, n);
  }
  protected onQuickCraftAmount(_s: ItemStack, _n: number) {}
  /** Swap with hotbar (number keys): crafted amount bookkeeping for result slots. */
  onSwapCraft(_n: number) {}
  allowModification(player: Player) {
    const s = this.item;
    return this.mayPickup(player) && (!s || this.mayPlace(s));
  }
  tryRemove(count: number, decrement: number, player: Player): ItemStack | null {
    if (!this.mayPickup(player)) return null;
    const s = this.item;
    if (!this.allowModification(player) && s && decrement < s.count) return null;
    count = Math.min(count, decrement);
    const out = this.remove(count);
    return out && out.count > 0 ? out : null;
  }
  safeTake(count: number, decrement: number, player: Player): ItemStack | null {
    const r = this.tryRemove(count, decrement, player);
    if (r) this.onTake(player, r);
    return r;
  }
  /** Insert up to `increment` items from `stack` (mutates it); returns what is left (may be empty). */
  safeInsert(stack: ItemStack, increment = stack.count): ItemStack {
    if (stack.count <= 0 || !this.mayPlace(stack)) return stack;
    const cur = this.item;
    const n = Math.min(Math.min(increment, stack.count), this.maxStackFor(stack) - (cur?.count ?? 0));
    if (n <= 0) return stack;
    if (!cur) this.set(splitStack(stack, n));
    else if (sameItemSameTags(cur, stack)) {
      stack.count -= n;
      cur.count += n;
      this.setChanged();
    }
    return stack;
  }
  /** Whether the slot belongs to the player's own inventory (for UI grouping / shift-double-click). */
  get isPlayerInventory() {
    return (this.storage as any) === (this.menu?.host.player.inventory as any);
  }
}

export function getQuickcraftHeader(mask: number) {
  return mask & 3;
}
export function getQuickcraftType(mask: number) {
  return (mask >> 2) & 3;
}
export function getQuickcraftMask(status: number, type: number) {
  return (status & 3) | ((type & 3) << 2);
}

/** Can `stack` be dropped into `slot` during a drag (Minecraft canItemQuickReplace). */
export function canItemQuickReplace(slot: Slot | null, stack: ItemStack, stackSizeMatters: boolean): boolean {
  const empty = !slot || !slot.hasItem();
  if (!empty && sameItemSameTags(stack, slot!.item)) return slot!.item!.count + (stackSizeMatters ? 0 : stack.count) <= stack.item.maxStack;
  return empty;
}

export function getQuickCraftPlaceCount(slotCount: number, type: number, stack: ItemStack): number {
  switch (type) {
    case 0:
      return Math.floor(stack.count / slotCount);
    case 1:
      return 1;
    case 2:
      return stack.item.maxStack;
    default:
      return stack.count;
  }
}

export class ContainerMenu {
  readonly slots: Slot[] = [];
  /** Cursor stack. */
  carried: ItemStack | null = null;
  /** Bumped when the carried stack changes (UI). */
  carriedVersion = 0;
  private quickcraftStatus = 0;
  private quickcraftType = -1;
  private readonly quickcraftSlots = new Set<Slot>();
  /** Window size in GUI pixels (set by subclasses; used by the screen). */
  width = 176;
  height = 166;
  title = '';
  closed = false;

  constructor(readonly host: MenuHost, readonly kind: string) {}

  get player(): Player {
    return this.host.player;
  }

  addSlot<T extends Slot>(slot: T): T {
    slot.index = this.slots.length;
    slot.menu = this;
    this.slots.push(slot);
    return slot;
  }

  /** Adds the 27 main + 9 hotbar player inventory slots at Minecraft's usual offsets. */
  addPlayerInventory(x: number, y: number, hotbarGap = 4) {
    const inv = this.player.inventory as unknown as SlotStorage;
    const start = this.slots.length;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, 9 + r * 9 + c, x + c * 18, y + r * 18));
    for (let c = 0; c < 9; c++) this.addSlot(new Slot(inv, c, x + c * 18, y + 58 + (hotbarGap - 4)));
    return start;
  }

  setCarried(s: ItemStack | null) {
    this.carried = s && s.count > 0 ? s : null;
    this.carriedVersion++;
  }
  getCarried(): ItemStack | null {
    if (this.carried && this.carried.count <= 0) this.carried = null;
    return this.carried;
  }

  // ------------------------------------------------------------------ overridables
  /** Shift-click behaviour; returns a copy of the original stack if something moved, else null. */
  quickMoveStack(_index: number): ItemStack | null {
    return null;
  }
  /** The menu is still usable (block present, player in range). */
  stillValid(): boolean {
    return true;
  }
  /** Double-click collection may take from this slot (not from result slots). */
  canTakeItemForPickAll(_stack: ItemStack | null, _slot: Slot): boolean {
    return true;
  }
  canDragTo(_slot: Slot): boolean {
    return true;
  }
  /** Buttons (enchant options, trade selection, ...). Returns true if handled. */
  clickMenuButton(_id: number): boolean {
    return false;
  }
  /** Per-tick update while open (screens call it at 20 TPS). */
  tick() {}
  /** Closing: return the cursor stack (and temporary grids) to the player. */
  removed() {
    const c = this.getCarried();
    if (c) {
      this.placeItemBackInInventory(c);
      this.setCarried(null);
    }
    this.closed = true;
  }

  // ------------------------------------------------------------------ helpers
  placeItemBackInInventory(s: ItemStack) {
    if (s.count <= 0) return;
    const left = this.player.inventory.add(s);
    if (left > 0) this.host.drop(copyWithCount(s, left));
  }

  /** Return all stacks of a storage to the player (crafting grids on close). */
  clearContainer(st: SlotStorage) {
    for (let i = 0; i < st.size; i++) {
      const s = st.get(i);
      if (!s) continue;
      st.set(i, null);
      this.placeItemBackInInventory(s);
    }
  }

  /** Minecraft moveItemStackTo: merge into matching stacks first, then empty slots. Mutates `stack`. */
  moveItemStackTo(stack: ItemStack, start: number, end: number, reverse: boolean): boolean {
    let moved = false;
    let i = reverse ? end - 1 : start;
    if (stack.item.maxStack > 1) {
      while (stack.count > 0 && (reverse ? i >= start : i < end)) {
        const slot = this.slots[i];
        const cur = slot.item;
        if (cur && sameItemSameTags(stack, cur)) {
          const max = slot.maxStackFor(stack);
          const total = cur.count + stack.count;
          if (total <= max) {
            stack.count = 0;
            cur.count = total;
            slot.setChanged();
            moved = true;
          } else if (cur.count < max) {
            stack.count -= max - cur.count;
            cur.count = max;
            slot.setChanged();
            moved = true;
          }
        }
        i += reverse ? -1 : 1;
      }
    }
    if (stack.count > 0) {
      i = reverse ? end - 1 : start;
      while (reverse ? i >= start : i < end) {
        const slot = this.slots[i];
        if (!slot.hasItem() && slot.mayPlace(stack)) {
          const max = slot.maxStackFor(stack);
          slot.set(splitStack(stack, Math.min(stack.count, max)));
          moved = true;
          break;
        }
        i += reverse ? -1 : 1;
      }
    }
    return moved;
  }

  private resetQuickCraft() {
    this.quickcraftStatus = 0;
    this.quickcraftSlots.clear();
  }

  /** Slots currently part of a drag (for UI previews). */
  get dragSlots(): ReadonlySet<Slot> {
    return this.quickcraftSlots;
  }

  /** Main entry point (AbstractContainerMenu.clicked). */
  clicked(slotId: number, button: number, type: ClickType) {
    try {
      this.doClick(slotId, button, type);
    } finally {
      this.carriedVersion++;
    }
  }

  private doClick(slotId: number, button: number, type: ClickType) {
    const player = this.player;
    const inv = player.inventory;
    if (type === 'quick_craft') {
      const prev = this.quickcraftStatus;
      this.quickcraftStatus = getQuickcraftHeader(button);
      if ((prev !== 1 || this.quickcraftStatus !== 2) && prev !== this.quickcraftStatus) {
        this.resetQuickCraft();
      } else if (!this.getCarried()) {
        this.resetQuickCraft();
      } else if (this.quickcraftStatus === 0) {
        this.quickcraftType = getQuickcraftType(button);
        if (this.quickcraftType === 0 || this.quickcraftType === 1 || (this.quickcraftType === 2 && player.creative)) {
          this.quickcraftStatus = 1;
          this.quickcraftSlots.clear();
        } else this.resetQuickCraft();
      } else if (this.quickcraftStatus === 1) {
        const slot = this.slots[slotId];
        const carried = this.getCarried()!;
        if (slot && canItemQuickReplace(slot, carried, true) && slot.mayPlace(carried) && (this.quickcraftType === 2 || carried.count > this.quickcraftSlots.size) && this.canDragTo(slot)) {
          this.quickcraftSlots.add(slot);
        }
      } else if (this.quickcraftStatus === 2) {
        if (this.quickcraftSlots.size) {
          if (this.quickcraftSlots.size === 1) {
            const k = [...this.quickcraftSlots][0].index;
            const t = this.quickcraftType;
            this.resetQuickCraft();
            this.doClick(k, t, 'pickup');
            return;
          }
          const proto = this.getCarried();
          if (!proto) {
            this.resetQuickCraft();
            return;
          }
          const template = copyWithCount(proto, proto.count);
          let remaining = proto.count;
          const n = this.quickcraftSlots.size;
          for (const slot of this.quickcraftSlots) {
            const carried = this.getCarried();
            if (!carried) break;
            if (canItemQuickReplace(slot, carried, true) && slot.mayPlace(carried) && (this.quickcraftType === 2 || carried.count >= n) && this.canDragTo(slot)) {
              const j = slot.item?.count ?? 0;
              const l = Math.min(template.item.maxStack, slot.maxStackFor(template));
              const i1 = Math.min(getQuickCraftPlaceCount(n, this.quickcraftType, template) + j, l);
              remaining -= i1 - j;
              slot.set(copyWithCount(template, i1));
            }
          }
          template.count = remaining;
          this.setCarried(template);
        }
        this.resetQuickCraft();
      } else {
        this.resetQuickCraft();
      }
      return;
    }
    if (this.quickcraftStatus !== 0) {
      this.resetQuickCraft();
      return;
    }
    if ((type === 'pickup' || type === 'quick_move') && (button === 0 || button === 1)) {
      const primary = button === 0;
      if (slotId === OUTSIDE) {
        const c = this.getCarried();
        if (c) {
          if (primary) {
            this.host.drop(c);
            this.setCarried(null);
          } else {
            this.host.drop(splitStack(c, 1));
            if (c.count <= 0) this.setCarried(null);
          }
        }
        return;
      }
      if (type === 'quick_move') {
        if (slotId < 0) return;
        const slot = this.slots[slotId];
        if (!slot || !slot.mayPickup(player)) return;
        let moved = this.quickMoveStack(slotId);
        let guard = 0;
        while (moved && slot.item && sameItem(slot.item, moved) && guard++ < 256) moved = this.quickMoveStack(slotId);
        return;
      }
      if (slotId < 0) return;
      const slot = this.slots[slotId];
      if (!slot) return;
      const inSlot = slot.item;
      const carried = this.getCarried();
      if (!inSlot) {
        if (carried) {
          const n = primary ? carried.count : 1;
          this.setCarried(slot.safeInsert(carried, n));
        }
      } else if (slot.mayPickup(player)) {
        if (!carried) {
          const n = primary ? inSlot.count : Math.floor((inSlot.count + 1) / 2);
          const taken = slot.tryRemove(n, Number.MAX_SAFE_INTEGER, player);
          if (taken) {
            this.setCarried(taken);
            slot.onTake(player, taken);
          }
        } else if (slot.mayPlace(carried)) {
          if (sameItemSameTags(inSlot, carried)) {
            const n = primary ? carried.count : 1;
            this.setCarried(slot.safeInsert(carried, n));
          } else if (carried.count <= slot.maxStackFor(carried)) {
            this.setCarried(inSlot);
            slot.set(carried);
          }
        } else if (sameItemSameTags(inSlot, carried)) {
          const taken = slot.tryRemove(inSlot.count, carried.item.maxStack - carried.count, player);
          if (taken) {
            carried.count += taken.count;
            slot.onTake(player, taken);
          }
        }
      }
      slot.setChanged();
      return;
    }
    if (type === 'swap') {
      const slot = this.slots[slotId];
      if (!slot) return;
      if (!(button >= 0 && button < 9) && button !== 40) return;
      const hot = inv.get(button);
      const inSlot = slot.item;
      if (!hot && !inSlot) return;
      if (!hot) {
        if (slot.mayPickup(player)) {
          inv.set(button, inSlot);
          slot.onSwapCraft(inSlot!.count);
          slot.set(null);
          slot.onTake(player, inSlot!);
        }
      } else if (!inSlot) {
        if (slot.mayPlace(hot)) {
          const max = slot.maxStackFor(hot);
          if (hot.count > max) {
            slot.set(splitStack(hot, max));
            inv.changed();
          } else {
            inv.set(button, null);
            slot.set(hot);
          }
        }
      } else if (slot.mayPickup(player) && slot.mayPlace(hot)) {
        const max = slot.maxStackFor(hot);
        if (hot.count > max) {
          slot.set(splitStack(hot, max));
          slot.onTake(player, inSlot);
          inv.changed();
          const left = inv.add(inSlot);
          if (left > 0) this.host.drop(copyWithCount(inSlot, left));
        } else {
          inv.set(button, inSlot);
          slot.set(hot);
          slot.onTake(player, inSlot);
        }
      }
      return;
    }
    if (type === 'clone') {
      if (player.creative && !this.getCarried() && slotId >= 0) {
        const s = this.slots[slotId]?.item;
        if (s) this.setCarried(copyWithCount(s, s.item.maxStack));
      }
      return;
    }
    if (type === 'throw') {
      if (!this.getCarried() && slotId >= 0) {
        const slot = this.slots[slotId];
        const s = slot?.item;
        if (!s) return;
        const n = button === 0 ? 1 : s.count;
        const taken = slot.safeTake(n, Number.MAX_SAFE_INTEGER, player);
        if (taken) this.host.drop(taken);
      }
      return;
    }
    if (type === 'pickup_all') {
      if (slotId < 0) return;
      const slot = this.slots[slotId];
      const carried = this.getCarried();
      if (carried && slot && (!slot.hasItem() || !slot.mayPickup(player))) {
        const start = button === 0 ? 0 : this.slots.length - 1;
        const step = button === 0 ? 1 : -1;
        for (let pass = 0; pass < 2; pass++) {
          for (let j = start; j >= 0 && j < this.slots.length && carried.count < carried.item.maxStack; j += step) {
            const s8 = this.slots[j];
            const it = s8.item;
            if (it && canItemQuickReplace(s8, carried, true) && s8.mayPickup(player) && this.canTakeItemForPickAll(carried, s8)) {
              if (pass !== 0 || it.count !== it.item.maxStack) {
                const taken = s8.safeTake(it.count, carried.item.maxStack - carried.count, player);
                if (taken) carried.count += taken.count;
              }
            }
          }
        }
      }
      return;
    }
  }

  /** Projected drag result for UI previews: slot -> count, plus remaining cursor count. */
  dragPreview(slots: Slot[], type: number): { counts: Map<Slot, number>; remaining: number } | null {
    const c = this.getCarried();
    if (!c || !slots.length) return null;
    const counts = new Map<Slot, number>();
    let remaining = c.count;
    for (const slot of slots) {
      const j = slot.item?.count ?? 0;
      const l = Math.min(c.item.maxStack, slot.maxStackFor(c));
      const i1 = Math.min(getQuickCraftPlaceCount(slots.length, type, c) + j, l);
      remaining -= i1 - j;
      counts.set(slot, i1);
    }
    return { counts, remaining: type === 2 ? c.count : Math.max(0, remaining) };
  }
}

/** A slot that only accepts items matching a predicate (fuel, lapis, potions ...). */
export class FilterSlot extends Slot {
  constructor(storage: SlotStorage, slot: number, x: number, y: number, private accept: (s: ItemStack) => boolean, private max = 64, hint?: string) {
    super(storage, slot, x, y);
    this.hint = hint;
  }
  override mayPlace(s: ItemStack) {
    return this.accept(s);
  }
  override maxStackSize() {
    return Math.min(this.max, this.storage.maxStackSize ?? 64);
  }
}

/** Output-only slot (furnace/brewing results etc.). */
export class OutputSlot extends Slot {
  override mayPlace() {
    return false;
  }
}

export { isEmpty };
