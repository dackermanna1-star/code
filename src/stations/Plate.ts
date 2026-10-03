// Mochi's plate: build a meal here (things dropped on it combine), then serve it.

import * as THREE from 'three';
import { Station, type ActionSpec } from './Station';
import type { FoodItem, RestPose } from '../game/FoodItem';
import type { Game } from '../game/Game';

export class PlateStation extends Station {
  readonly id = 'plate' as const;
  readonly label = "Mochi's Plate";
  readonly icon = 'plate';
  override capacity = 1;
  override combines = true;

  constructor(game: Game) {
    super(game);
    const p = game.kitchen.plate;
    const c = this.center();
    this.cylZone(c.clone().add(new THREE.Vector3(0, 0.06, 0)), p.radius + 0.03, 0.16);
    this.registerPart(game.kitchen.bell.root, () => this.ring());
  }

  center(): THREE.Vector3 {
    const p = this.game.kitchen.plate;
    return p.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, p.surfaceY, 0));
  }

  override get view() {
    return 'plate' as const;
  }

  restPose(item: FoodItem): RestPose {
    // keep big meals on the plate
    const fit = Math.min(1, (this.game.kitchen.plate.radius * 0.95) / Math.max(0.02, item.visual.radius));
    return { pos: this.center(), rotY: 0.3, scale: fit };
  }

  override hoverPoint(): THREE.Vector3 {
    return this.center().add(new THREE.Vector3(0, 0.12, 0));
  }

  /** Ring the bell: Mochi eats whatever is on the plate. */
  ring() {
    const g = this.game;
    const bell = g.kitchen.bell;
    g.audio.play('bell');
    const base = (bell.plunger.userData.baseY ??= bell.plunger.position.y) as number;
    g.anim.run(0.18, (k) => (bell.plunger.position.y = base - Math.sin(k * Math.PI) * 0.007));
    g.fx.sparkle(bell.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0)), 4, '#fff1a0', 0.03);
    this.serve();
  }

  serve() {
    const g = this.game;
    const item = this.contents[0];
    if (!item) {
      g.character.notice('empty-plate', this.center());
      return;
    }
    if (g.camera.view !== 'plate' && g.camera.view !== 'table') g.goTo('plate');
    g.feed(item);
  }

  override action(): ActionSpec | null {
    return this.contents.length ? { label: 'Serve!', icon: 'bell' } : null;
  }

  override doAction() {
    this.ring();
  }

  protected override onReceive(item: FoodItem) {
    this.game.character.notice('plate', item.position);
  }
}
