// Storage containers: physical slot-based (fridge, mirror cabinet, display shelves)
// or abstract (closet storage, pantry, wardrobe) that only show up in UI.
import * as THREE from 'three';
import { G } from '../game.js';

export const CONTAINERS = {};

export class Container {
  constructor(id, name, { parent = null, slots = [], slotSize = [0.25, 0.25, 0.25], accepts = () => true, capacity = null, icon = '📦', isOpen = () => true } = {}) {
    this.id = id;
    this.name = name;
    this.parent = parent;
    this.slots = slots.map((s) => (s.isVector3 ? s : new THREE.Vector3(...s)));
    this.slotSize = slotSize;
    this.accepts = accepts;
    this.capacity = capacity ?? (this.slots.length || 999);
    this.physical = this.slots.length > 0;
    this.icon = icon;
    this.isOpen = isOpen;
    CONTAINERS[id] = this;
  }
  items() { return G.items.inLoc(this.id); }
  count() { return this.items().length; }
  full() { return this.count() >= this.capacity; }
  freeSlot() {
    if (!this.physical) return this.full() ? -1 : 0;
    const used = new Set(this.items().map((i) => i.data.slot));
    for (let i = 0; i < this.slots.length; i++) if (!used.has(i)) return i;
    return -1;
  }
  canStore(inst) { return this.accepts(inst.def) && this.freeSlot() >= 0; }
}
