// Inventory model. Everything is plain arrays of item stacks (see items.js for the stack shape) so
// it serialises directly to JSON.
//
// A "container descriptor" is the unit the UI works with:
//   { key, name, slots: Array<stack|null>, kind, owner?, accepts?(stack, index) => bool, onChange?() }
//   kind: 'hotbar' | 'equipment' | 'clothing' (pockets / backpack contents) | 'world' (furniture)
//         | 'floor' | 'corpse' | 'vehicle'
// Any two descriptors can exchange items with moveStack().

import { getItemDef, itemWeight, canStack } from '../items/items.js';

export const EQUIP_SLOTS = ['head', 'face', 'torso', 'jacket', 'vest', 'hands', 'legs', 'feet', 'back'];
export const EQUIP_LABELS = {
  head: 'Head', face: 'Face', torso: 'Shirt', jacket: 'Jacket', vest: 'Vest',
  hands: 'Hands', legs: 'Legs', feet: 'Feet', back: 'Back',
};
export const HOTBAR_SIZE = 9;

export class PlayerInventory {
  constructor() {
    this.hotbar = new Array(HOTBAR_SIZE).fill(null);
    this.equipment = new Array(EQUIP_SLOTS.length).fill(null);
    this.selected = 0;
    this.maxWeight = 22; // kg before being over-encumbered (set by player strength)
    this.version = 0; // bumped on every change (UI refresh hint)
    this.onChange = null;
  }

  get selectedStack() { return this.hotbar[this.selected]; }

  getEquipped(slot) {
    return this.equipment[EQUIP_SLOTS.indexOf(slot)];
  }
  setEquipped(slot, stack) {
    this.equipment[EQUIP_SLOTS.indexOf(slot)] = stack;
    this.changed();
  }

  changed() {
    this.version++;
    if (this.onChange) this.onChange();
  }

  hotbarDesc() {
    return { key: 'hotbar', name: 'Hotbar', kind: 'hotbar', slots: this.hotbar, onChange: () => this.changed() };
  }
  equipmentDesc() {
    return {
      key: 'equipment', name: 'Equipment', kind: 'equipment', slots: this.equipment,
      accepts: (stack, index) => {
        const def = getItemDef(stack.id);
        return !!def.clothing && def.clothing.slot === EQUIP_SLOTS[index] && (stack.count || 1) === 1;
      },
      onChange: () => this.changed(),
    };
  }

  /** All storage containers the player carries (pockets of each equipped clothing item, backpack). */
  storageDescs() {
    const out = [];
    EQUIP_SLOTS.forEach((slot, i) => {
      const st = this.equipment[i];
      if (st && st.contents) {
        const def = getItemDef(st.id);
        out.push({
          key: 'equip:' + slot, name: def.name, kind: 'clothing', owner: st, slots: st.contents,
          accepts: (stack) => stack !== st && !containsDeep(stack, st),
          onChange: () => this.changed(),
        });
      }
    });
    return out;
  }

  /** hotbar + storage (what addItem / count / remove search) */
  allDescs() {
    return [this.hotbarDesc(), ...this.storageDescs()];
  }

  totalWeight() {
    let w = 0;
    for (const s of this.hotbar) w += itemWeight(s);
    for (const s of this.equipment) w += itemWeight(s);
    return w;
  }

  /** Iterate every carried stack (hotbar, equipment, nested contents). cb(stack, slots, index) */
  forEachStack(cb) {
    const visit = (slots) => {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s) continue;
        cb(s, slots, i);
        if (s.contents) visit(s.contents);
      }
    };
    visit(this.hotbar);
    visit(this.equipment);
  }

  /** Find stacks matching predicate (id string or fn). Returns [{stack, slots, index}] */
  find(pred) {
    const fn = typeof pred === 'string' ? (s) => s.id === pred : pred;
    const out = [];
    this.forEachStack((stack, slots, index) => { if (fn(stack)) out.push({ stack, slots, index }); });
    return out;
  }

  count(pred) {
    let n = 0;
    for (const f of this.find(pred)) n += f.stack.count || 1;
    return n;
  }

  has(pred, n = 1) { return this.count(pred) >= n; }

  /** Remove up to n items matching pred. Returns number removed. */
  remove(pred, n = 1) {
    let left = n;
    for (const f of this.find(pred)) {
      if (left <= 0) break;
      const take = Math.min(left, f.stack.count || 1);
      f.stack.count = (f.stack.count || 1) - take;
      left -= take;
      if (f.stack.count <= 0) f.slots[f.index] = null;
    }
    if (left !== n) this.changed();
    return n - left;
  }

  /** Remove a specific stack object wherever it is. */
  removeStack(stack) {
    let done = false;
    this.forEachStack((s, slots, i) => {
      if (!done && s === stack) { slots[i] = null; done = true; }
    });
    if (done) this.changed();
    return done;
  }

  /**
   * Add a stack to the inventory. Merges with existing stacks, then fills empty slots.
   * Weapons/tools prefer the hotbar; everything else prefers pockets/backpack.
   * Returns the leftover stack (null if fully added). Mutates `stack.count`.
   */
  addItem(stack) {
    if (!stack) return null;
    const def = getItemDef(stack.id);
    const preferHotbar = !!(def.melee || def.firearm || def.category === 'weapon' || def.category === 'tool' || def.throwable);
    const storage = this.storageDescs();
    const order = preferHotbar ? [this.hotbarDesc(), ...storage] : [...storage, this.hotbarDesc()];
    // merge
    for (const d of order) {
      for (let i = 0; i < d.slots.length && stack.count > 0; i++) {
        const s = d.slots[i];
        if (s && canStack(s, stack)) {
          const room = (def.stack || 1) - s.count;
          const mv = Math.min(room, stack.count);
          if (mv > 0) { s.count += mv; stack.count -= mv; }
        }
      }
    }
    // empty slots
    if (stack.count > 0) {
      for (const d of order) {
        if (d.accepts && !d.accepts(stack, 0)) continue;
        const i = d.slots.indexOf(null);
        if (i >= 0) { d.slots[i] = stack; this.changed(); return null; }
      }
    }
    this.changed();
    return stack.count > 0 ? stack : null;
  }

  toJSON() {
    return { hotbar: this.hotbar, equipment: this.equipment, selected: this.selected };
  }
  load(data) {
    this.hotbar = data.hotbar || new Array(HOTBAR_SIZE).fill(null);
    this.equipment = data.equipment || new Array(EQUIP_SLOTS.length).fill(null);
    while (this.hotbar.length < HOTBAR_SIZE) this.hotbar.push(null);
    while (this.equipment.length < EQUIP_SLOTS.length) this.equipment.push(null);
    this.selected = data.selected || 0;
    this.changed();
  }
}

/** true if `needle` is (recursively) inside container item `hay` */
export function containsDeep(hay, needle) {
  if (!hay || !hay.contents) return false;
  for (const c of hay.contents) {
    if (c === needle) return true;
    if (containsDeep(c, needle)) return true;
  }
  return false;
}

function accepts(desc, stack, index) {
  if (!stack) return true;
  if (desc.accepts && !desc.accepts(stack, index)) return false;
  if (desc.owner && (stack === desc.owner || containsDeep(stack, desc.owner))) return false;
  return true;
}

/**
 * Move `count` items (default whole stack) from src.slots[si] to dst.slots[di].
 * Merges same items, swaps different items (whole stacks only). Returns true if anything moved.
 */
export function moveStack(src, si, dst, di, count = Infinity) {
  const a = src.slots[si];
  if (!a) return false;
  if (src === dst && si === di) return false;
  const b = dst.slots[di];
  const def = getItemDef(a.id);
  const n = Math.min(count, a.count || 1);
  if (!b) {
    if (!accepts(dst, a, di)) return false;
    if (n >= (a.count || 1)) {
      dst.slots[di] = a;
      src.slots[si] = null;
    } else {
      const part = { ...structuredCloneSafe(a), count: n };
      a.count -= n;
      dst.slots[di] = part;
    }
  } else if (canStack(a, b)) {
    const room = (def.stack || 1) - b.count;
    const mv = Math.min(room, n);
    if (mv <= 0) return false;
    b.count += mv;
    a.count -= mv;
    if (a.count <= 0) src.slots[si] = null;
  } else {
    if (n < (a.count || 1)) return false;
    if (!accepts(dst, a, di) || !accepts(src, b, si)) return false;
    dst.slots[di] = a;
    src.slots[si] = b;
  }
  src.onChange?.();
  if (dst !== src) dst.onChange?.();
  return true;
}

/** Shift-click: move a stack into the first target descriptor that can take it. Returns true if moved (fully or partly). */
export function quickMove(src, si, targets) {
  const a = src.slots[si];
  if (!a) return false;
  let moved = false;
  for (const t of targets) {
    if (t === src) continue;
    for (let i = 0; i < t.slots.length && src.slots[si]; i++) {
      if (t.slots[i] && canStack(t.slots[i], a)) moved = moveStack(src, si, t, i) || moved;
    }
  }
  for (const t of targets) {
    if (t === src || !src.slots[si]) continue;
    for (let i = 0; i < t.slots.length; i++) {
      if (!t.slots[i] && accepts(t, a, i)) {
        moved = moveStack(src, si, t, i) || moved;
        break;
      }
    }
  }
  return moved;
}

/** Split a stack in half within its container (into the first empty slot). */
export function splitStack(desc, i) {
  const a = desc.slots[i];
  if (!a || (a.count || 1) < 2) return false;
  const j = desc.slots.indexOf(null);
  if (j < 0) return false;
  return moveStack(desc, i, desc, j, Math.floor(a.count / 2));
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}
