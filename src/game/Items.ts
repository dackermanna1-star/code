// Spawning, updating and removing food items.

import * as THREE from 'three';
import type { Game } from './Game';
import { FoodItem } from './FoodItem';
import type { FoodState } from '../food/types';
import { applyRoom } from '../food/process';
import { HeatStation } from '../stations/Station';

export const MAX_ITEMS = 40;

export class ItemManager {
  list: FoodItem[] = [];
  private roomAcc = 0;

  constructor(private game: Game) {}

  spawn(state: FoodState, at: THREE.Vector3, pop = true): FoodItem {
    const it = new FoodItem(state, at);
    this.game.scene.add(it.root);
    this.game.scene.add(it.shadow);
    this.list.push(it);
    if (pop) it.popIn();
    this.enforceLimit();
    return it;
  }

  /** Too many things lying around: the oldest parked item quietly disappears. */
  private enforceLimit() {
    if (this.list.length <= MAX_ITEMS) return;
    const victim = this.list.find((i) => i.holder?.kind === 'counter' && i.mode === 'rest') ?? this.list.find((i) => i.mode === 'rest' && i.holder?.kind !== 'station');
    if (victim) {
      this.game.fx.poof(victim.position.clone().add(new THREE.Vector3(0, 0.05, 0)), '#ffffff', 0.7);
      this.remove(victim);
    }
  }

  remove(item: FoodItem) {
    item.holder?.release(item);
    const i = this.list.indexOf(item);
    if (i >= 0) this.list.splice(i, 1);
    if (this.game.interaction.dragItem === item) this.game.interaction.cancelDrag();
    item.dispose();
  }

  /** Walk up from a picked object to its FoodItem. */
  fromObject(o: THREE.Object3D | null): FoodItem | null {
    while (o) {
      if (o.userData.item) return o.userData.item as FoodItem;
      o = o.parent;
    }
    return null;
  }

  update(dt: number) {
    for (const it of this.list) it.update(dt);
    // room-temperature effects (cooling, thawing, melting) for food not on a heat source
    this.roomAcc += dt;
    if (this.roomAcc >= 0.25) {
      const step = this.roomAcc;
      this.roomAcc = 0;
      for (const it of this.list) {
        const h = it.holder;
        if (h instanceof HeatStation && h.heat > 0.2) continue;
        if (h && (h as { id?: string }).id === 'freezer') continue;
        const before = JSON.stringify(it.state.cook);
        try {
          const ev = applyRoom(it.state, step);
          if (ev.some((e) => e.rebuild)) it.setState(it.state, true);
        } catch {
          /* ignore */
        }
        if (JSON.stringify(it.state.cook) !== before) it.refresh();
      }
    }
    // hot food steams wherever it is
    for (const it of this.list) {
      if (!it.root.visible) continue;
      const t = it.state.cook.temp;
      const inHeat = it.holder instanceof HeatStation && (it.holder as HeatStation).heat > 0.2;
      if (t > 0.45 && !inHeat) {
        it.steamAcc += dt * t * 3;
        if (it.steamAcc > 1) {
          it.steamAcc = 0;
          this.game.fx.steam(it.position.clone().add(new THREE.Vector3(0, it.visual.height * 0.9, 0)), t * 0.6, it.visual.radius * 0.4);
        }
      }
      if (it.state.cook.freeze > 0.6 && Math.random() < dt * 1.5) this.game.fx.glint(it.position.clone().add(new THREE.Vector3(0, it.visual.height * 0.6, 0)), it.visual.radius * 0.6);
    }
  }

  /** After the scene's world matrices are updated. */
  postUpdate() {
    for (const it of this.list) it.visual.update();
  }

  clear() {
    for (const it of [...this.list]) this.remove(it);
  }
}
