import * as THREE from 'three';
import { Spring } from '../core/Tween';
import { FoodPiece } from './FoodKit';
import { BunId, INGREDIENTS, LayerId, isPatty } from './Ingredients';
import type { BuiltBurger, BuiltLayer } from '../game/Scoring';

export interface StackItem {
  piece: FoodPiece;
  id: string;
  y: number;
  dx: number;
  dz: number;
  squash: Spring;
  melt?: { t: number; support: number };
  grow?: { t: number; dur: number };
  kind: 'bottom' | 'top' | 'layer';
  cook?: { top: number; bottom: number };
}

/**
 * A burger being assembled (and later served / eaten). Handles stacking
 * heights, squash-and-stretch on landing, the stack's wobble, cheese melt and
 * sauce growth, and exports a BuiltBurger for scoring.
 */
export class BurgerStack {
  readonly group = new THREE.Group();
  readonly items: StackItem[] = [];
  height = 0;
  bun: BunId | null = null;
  private wobX = new Spring(0, 180, 9);
  private wobZ = new Spring(0, 180, 9);

  get hasBottom() {
    return this.items.some((i) => i.kind === 'bottom');
  }
  get hasTop() {
    return this.items.some((i) => i.kind === 'top');
  }
  get layerCount() {
    return this.items.filter((i) => i.kind === 'layer').length;
  }
  get complete() {
    return this.hasTop;
  }

  /** Where the next piece would rest (local y). */
  topY(): number {
    return this.height;
  }

  /** Radius of the top-most solid piece (for cheese drape support). */
  topRadius(): number {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (INGREDIENTS[it.piece.id].category === 'sauce') continue;
      return it.piece.radius;
    }
    return 0.07;
  }

  /** Place a piece at the current top with an offset. Returns the item. */
  land(piece: FoodPiece, dx: number, dz: number, kind: StackItem['kind'], impact = 1): StackItem {
    const base = this.height;
    let y = base;
    // patties are modeled around their center
    if (isPatty(piece.id)) y += 0.0095;
    const item: StackItem = {
      piece,
      id: piece.id,
      y,
      dx,
      dz,
      squash: new Spring(1, 320, 11),
      kind,
      cook: piece.cook ? { ...piece.cook } : undefined,
    };
    if (kind === 'bottom' || kind === 'top') this.bun = piece.id as BunId;
    const cat = INGREDIENTS[piece.id].category;
    if (cat === 'cheese') {
      item.melt = { t: 0, support: Math.max(0.035, this.topRadius() * 0.82) };
      piece.setMelt?.(0.05, item.melt.support);
    }
    if (cat === 'sauce') {
      item.grow = { t: 0, dur: 0.55 };
      piece.setGrow?.(0);
    }
    piece.obj.position.set(dx, y, dz);
    this.group.add(piece.obj);
    this.items.push(item);
    this.height += kind === 'top' ? 0 : piece.thickness;
    if (kind === 'bottom') this.height = piece.thickness;
    // landing squash + stack wobble
    item.squash.value = 1 - 0.28 * impact;
    item.squash.velocity = -2 * impact;
    this.wobX.kick((Math.random() - 0.5) * 2.2 * impact + dz * 30);
    this.wobZ.kick((Math.random() - 0.5) * 2.2 * impact - dx * 30);
    // everything below compresses slightly
    for (const it of this.items) if (it !== item) it.squash.kick(-0.9 * impact);
    return item;
  }

  update(dt: number) {
    for (const it of this.items) {
      const s = it.squash.update(dt);
      it.piece.obj.scale.set(1 + (1 - s) * 0.5, s, 1 + (1 - s) * 0.5);
      if (it.melt && it.melt.t < 1) {
        it.melt.t = Math.min(1, it.melt.t + dt / 1.4);
        const e = 1 - Math.pow(1 - it.melt.t, 3);
        it.piece.setMelt?.(0.05 + e * 0.95, it.melt.support);
      }
      if (it.grow && it.grow.t < 1) {
        it.grow.t = Math.min(1, it.grow.t + dt / it.grow.dur);
        it.piece.setGrow?.(it.grow.t);
      }
    }
    this.group.rotation.x = this.wobX.update(dt) * 0.02;
    this.group.rotation.z = this.wobZ.update(dt) * 0.02;
  }

  /** Instantly finish animations (melt, sauce) — used when serving. */
  settle() {
    for (const it of this.items) {
      if (it.melt) {
        it.melt.t = 1;
        it.piece.setMelt?.(1, it.melt.support);
      }
      if (it.grow) {
        it.grow.t = 1;
        it.piece.setGrow?.(1);
      }
      it.squash.snap(1);
      it.piece.obj.scale.set(1, 1, 1);
    }
  }

  toBuilt(): BuiltBurger {
    const bottom = this.items.find((i) => i.kind === 'bottom');
    const top = this.items.find((i) => i.kind === 'top');
    const layers: BuiltLayer[] = this.items
      .filter((i) => i.kind === 'layer')
      .map((i) => ({ id: i.id as LayerId, dx: i.dx, dz: i.dz, cook: i.cook }));
    return {
      bun: bottom ? (bottom.id as BunId) : this.bun,
      bottom: bottom ? { dx: bottom.dx, dz: bottom.dz } : null,
      top: top ? { dx: top.dx, dz: top.dz, bun: top.id as BunId } : null,
      layers,
    };
  }

  dispose() {
    for (const it of this.items) it.piece.dispose();
    this.group.removeFromParent();
  }
}
