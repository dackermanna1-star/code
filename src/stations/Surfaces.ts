// Free counter space (parking food anywhere on the worktop) and the trash bin.

import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { FoodItem, Holder, RestPose } from '../game/FoodItem';
import { COUNTER } from '../world/layout';

export class Counter implements Holder {
  readonly kind = 'counter';
  readonly label = 'Counter';
  contents: FoodItem[] = [];
  readonly combines = true;
  private spots = new Map<FoodItem, THREE.Vector3>();

  constructor(private game: Game) {}

  /** Is this world point on the free worktop? */
  contains(p: THREE.Vector3): boolean {
    return p.x > COUNTER.x0 + 0.04 && p.x < COUNTER.x1 - 0.04 && p.z > COUNTER.zBack + 0.05 && p.z < COUNTER.zFront + 0.02;
  }

  accepts(): boolean {
    return this.contents.length < 14;
  }

  receive(item: FoodItem, at?: THREE.Vector3) {
    if (!this.contents.includes(item)) this.contents.push(item);
    item.holder = this;
    const p = (at ?? item.position).clone();
    p.x = THREE.MathUtils.clamp(p.x, COUNTER.x0 + 0.08, COUNTER.x1 - 0.08);
    p.z = THREE.MathUtils.clamp(p.z, COUNTER.zBack + 0.1, COUNTER.zFront - 0.06);
    p.y = COUNTER.topY;
    // nudge away from other parked items
    for (let k = 0; k < 8; k++) {
      let moved = false;
      for (const [other, q] of this.spots) {
        if (other === item) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        const min = (other.visual.radius + item.visual.radius) * 0.8;
        if (d < min) {
          const dir = d > 1e-4 ? new THREE.Vector2(p.x - q.x, p.z - q.z).normalize() : new THREE.Vector2(1, 0);
          p.x += dir.x * (min - d + 0.005);
          p.z += dir.y * (min - d + 0.005);
          moved = true;
        }
      }
      if (!moved) break;
    }
    p.x = THREE.MathUtils.clamp(p.x, COUNTER.x0 + 0.08, COUNTER.x1 - 0.08);
    p.z = THREE.MathUtils.clamp(p.z, COUNTER.zBack + 0.1, COUNTER.zFront - 0.06);
    this.spots.set(item, p);
    item.settle(this.restPose(item));
  }

  release(item: FoodItem) {
    this.contents = this.contents.filter((i) => i !== item);
    this.spots.delete(item);
    if (item.holder === this) item.holder = null;
  }

  restPose(item: FoodItem): RestPose {
    const p = this.spots.get(item) ?? item.position.clone().setY(COUNTER.topY);
    return { pos: p.clone(), rotY: (item.state.seed % 100) * 0.03 };
  }

  surfaceY(): number {
    return COUNTER.topY;
  }

  clear() {
    for (const it of [...this.contents]) this.game.items.remove(it);
    this.contents = [];
    this.spots.clear();
  }
}

export class Trash {
  readonly zone: THREE.Mesh;
  private open = 0;
  private openTarget = 0;

  constructor(private game: Game) {
    const t = game.kitchen.trash;
    const wp = t.root.getWorldPosition(new THREE.Vector3());
    this.zone = new THREE.Mesh(new THREE.CylinderGeometry(t.radius * 1.5, t.radius * 1.5, t.openingY + 0.3, 12), new THREE.MeshBasicMaterial());
    (this.zone.material as THREE.Material).visible = false;
    this.zone.position.copy(wp).add(new THREE.Vector3(0, (t.openingY + 0.3) / 2, 0));
    this.zone.userData.trash = this;
    game.scene.add(this.zone);
  }

  hover(on: boolean) {
    this.openTarget = on ? 1 : 0;
  }

  get mouth(): THREE.Vector3 {
    const t = this.game.kitchen.trash;
    return t.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, t.openingY, 0));
  }

  dispose(item: FoodItem) {
    this.openTarget = 1;
    this.game.audio.play('door-open', { pitch: 1.4, volume: 0.6 });
    item.flyTo(this.mouth.clone().add(new THREE.Vector3(0, -0.05, 0)), {
      height: 0.25,
      onLand: () => {
        this.game.fx.poof(this.mouth, '#ffffff', 0.8);
        this.game.audio.play('trash');
        this.game.items.remove(item);
        setTimeout(() => (this.openTarget = 0), 350);
      },
    });
  }

  update(dt: number) {
    this.open += (this.openTarget - this.open) * (1 - Math.exp(-12 * dt));
    const t = this.game.kitchen.trash;
    t.lid.rotation.x = -t.openAngle * this.open;
    t.pedal.rotation.x = 0.25 * this.open;
  }
}
