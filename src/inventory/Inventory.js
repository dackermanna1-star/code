// Inventory model. Everything is plain arrays of item stacks (see items.js for the stack shape) so
// it serialises directly to JSON.
//
// A "container descriptor" is the unit the UI works with:
//   { key, name, slots: Array<stack|null>, kind, owner?, accepts?(stack, index) => bool, onChange?() }
//   kind: 'hotbar' | 'equipment' | 'clothing' (pockets / backpack contents) | 'world' (furniture)
//         | 'floor' | 'corpse' | 'vehicle'
// Any two descriptors can exchange items with moveStack().

import { getItemDef, itemWeight, canStack } from '../items/items.js';

// Bulky items that never fit a pocket / vest pouch, whatever their weight (bags take anything).
const BULKY = new Set(['plank', 'log', 'tarp', 'sheet_metal', 'metal_pipe', 'pot', 'saw', 'pumpkin', 'water_jug', 'campfire_kit', 'gas_can', 'lantern']);

/**
 * true if a stack is small enough for a pocket / vest pouch (clothing storage that is not a bag on the back).
 * Jackets, boots, bags, long guns, two-handed / heavy weapons and bulky material need a backpack (or your hands).
 */
export function fitsPocket(stack) {
  if (!stack) return true;
  const def = getItemDef(stack.id);
  if (def.capacity) return false;
  if (def.clothing) return (def.weight || 0) <= 0.25; // caps, bandanas, gloves, masks
  if (BULKY.has(stack.id)) return false;
  if (def.firearm) return (def.weight || 0) <= 1.3; // handguns
  if (def.melee && (def.melee.twoHanded || (def.weight || 0) > 1.0)) return false;
  const unit = itemWeight(stack) / Math.max(1, stack.count || 1); // includes liquid
  return unit <= 1.5;
}

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
        const bag = slot === 'back';
        out.push({
          key: 'equip:' + slot, name: def.name, kind: 'clothing', owner: st, slots: st.contents, pocket: !bag,
          accepts: (stack) => stack !== st && !containsDeep(stack, st) && (bag || fitsPocket(stack)),
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

  /**
   * Move what is inside `stack` (a clothing item / bag that just left the equipment) into the storage that is
   * still worn, so pocket contents don't vanish into a jacket sitting in your backpack. Whatever does not fit
   * stays inside. Returns the number of stacks moved.
   */
  spillContents(stack) {
    if (!stack || !stack.contents) return 0;
    const storage = this.storageDescs().filter((d) => d.owner !== stack && !containsDeep(stack, d.owner));
    let moved = 0;
    for (let i = 0; i < stack.contents.length; i++) {
      const c = stack.contents[i];
      if (!c) continue;
      // merge into existing stacks first
      for (const d of storage) {
        for (let j = 0; j < d.slots.length && c.count > 0; j++) {
          const s = d.slots[j];
          if (s && canStack(s, c)) {
            const mv = Math.min((getItemDef(c.id).stack || 1) - s.count, c.count);
            if (mv > 0) { s.count += mv; c.count -= mv; }
          }
        }
      }
      if (c.count <= 0) { stack.contents[i] = null; moved++; continue; }
      for (const d of storage) {
        if (d.accepts && !d.accepts(c, 0)) continue;
        const j = d.slots.indexOf(null);
        if (j >= 0) { d.slots[j] = c; stack.contents[i] = null; moved++; break; }
      }
    }
    if (moved) this.changed();
    return moved;
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
