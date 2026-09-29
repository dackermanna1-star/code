import * as THREE from 'three';
import { WARMER } from '../world/Layout';
import type { FoodPiece } from '../food/FoodKit';
import type { PattyId } from '../food/Ingredients';
import { Geo } from '../world/Builder';
import type { MaterialLib } from '../world/Materials';

export interface WarmPatty {
  piece: FoodPiece;
  kind: PattyId;
  target?: string;
  /** cook value of the two physical sides (a = initially bottom) */
  a: number;
  b: number;
  slot: number;
}

/** Heated holding tray between the grill and the build station. */
export class Warmer {
  readonly root = new THREE.Group();
  readonly items: (WarmPatty | null)[] = [];
  private slotPos: THREE.Vector3[] = [];
  readonly hitArea: THREE.Mesh;
  onChange?: () => void;

  constructor(mats: MaterialLib, private slots = 6) {
    const c = WARMER.center;
    this.root.position.copy(c);
    const pan = mats.steel;
    const w = WARMER.width;
    const d = WARMER.depth;
    // hotel pan: floor + walls + rolled rim
    const floor = new THREE.Mesh(Geo.box(w, 0.006, d), pan);
    floor.position.y = -0.03;
    floor.receiveShadow = true;
    this.root.add(floor);
    for (const [sx, sz, ww, dd] of [
      [0, d / 2, w, 0.008],
      [0, -d / 2, w, 0.008],
      [w / 2, 0, 0.008, d],
      [-w / 2, 0, 0.008, d],
    ] as const) {
      const wall = new THREE.Mesh(Geo.box(ww, 0.05, dd), pan);
      wall.position.set(sx, -0.008, sz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.root.add(wall);
    }
    const rim = new THREE.Mesh(Geo.rbox(w + 0.03, 0.01, d + 0.03, 0.005), mats.chrome);
    rim.position.y = 0.017;
    rim.scale.set(1, 1, 1);
    this.root.add(rim);
    // perforated liner glow (heat)
    const liner = new THREE.Mesh(Geo.box(w - 0.02, 0.002, d - 0.02), new THREE.MeshStandardMaterial({ color: 0x3a1a0a, emissive: 0xff4a10, emissiveIntensity: 0.25, roughness: 0.6 }));
    liner.position.y = -0.026;
    this.root.add(liner);
    this.hitArea = new THREE.Mesh(Geo.box(w, 0.08, d), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitArea.position.y = 0.0;
    this.root.add(this.hitArea);
    this.setSlots(slots);
  }

  setSlots(n: number) {
    this.slots = n;
    this.slotPos = [];
    const rows = n > 6 ? 3 : 2;
    const cols = 3;
    const sx = WARMER.width / cols;
    const sz = WARMER.depth / rows;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        this.slotPos.push(new THREE.Vector3(-WARMER.width / 2 + sx * (c + 0.5), -0.012, -WARMER.depth / 2 + sz * (r + 0.5)));
    while (this.items.length < n) this.items.push(null);
  }

  get capacity() {
    return this.slots;
  }
  get count() {
    return this.items.filter(Boolean).length;
  }
  get scale() {
    return this.slots > 6 ? 0.82 : 0.95;
  }

  slotWorld(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.slotPos[i]).add(this.root.position);
  }

  freeSlot(): number {
    for (let i = 0; i < this.slots; i++) if (!this.items[i]) return i;
    return -1;
  }

  nearestFree(p: THREE.Vector3): number {
    let best = -1;
    let bd = Infinity;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.slots; i++) {
      if (this.items[i]) continue;
      const d = this.slotWorld(i, tmp).distanceTo(p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  add(w: Omit<WarmPatty, 'slot'>, slot = this.freeSlot()): number {
    if (slot < 0) return -1;
    const item: WarmPatty = { ...w, slot };
    this.items[slot] = item;
    this.root.add(item.piece.obj);
    item.piece.obj.position.copy(this.slotPos[slot]).setY(this.slotPos[slot].y + 0.0095);
    item.piece.obj.scale.setScalar(this.scale);
    this.onChange?.();
    return slot;
  }

  take(slot: number): WarmPatty | null {
    const it = this.items[slot];
    if (!it) return null;
    this.items[slot] = null;
    this.onChange?.();
    return it;
  }

  /** Which occupied slot is under a world point (xz). */
  slotAt(p: THREE.Vector3): number {
    let best = -1;
    let bd = 0.09;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.slots; i++) {
      if (!this.items[i]) continue;
      const d = Math.hypot(this.slotWorld(i, tmp).x - p.x, tmp.z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  clear() {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it) {
        it.piece.obj.removeFromParent();
        it.piece.dispose();
      }
      this.items[i] = null;
    }
    this.onChange?.();
  }
}
