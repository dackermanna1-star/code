import * as THREE from 'three';
import type { Shot } from '../core/CameraRig';
import type { Interactive } from '../core/Input';
import type { GameContext, StationId } from '../game/Context';

/** Base class for the four stations (order, grill, build, serve). */
export abstract class Station {
  abstract readonly id: StationId;
  abstract readonly shot: Shot;
  readonly root = new THREE.Group();
  readonly interactives: Interactive[] = [];
  active = false;

  constructor(protected ctx: GameContext) {}

  enter() {
    this.active = true;
    this.ctx.input.set([...this.interactives]);
  }

  exit() {
    this.active = false;
  }

  addInteractive(it: Interactive) {
    this.interactives.push(it);
    if (this.active) this.ctx.input.add(it);
  }

  removeInteractive(it: Interactive) {
    const i = this.interactives.indexOf(it);
    if (i >= 0) this.interactives.splice(i, 1);
    this.ctx.input.remove(it);
  }

  update(_dt: number) {}
  reset() {}
}
