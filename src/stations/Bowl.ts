// Mixing bowl: drop things in, whisk in circles (or press Mix!) to turn them into batter,
// dough, beaten eggs, whipped cream, salads or mysterious mixtures.

import * as THREE from 'three';
import { Station, type ActionSpec } from './Station';
import type { FoodItem, RestPose } from '../game/FoodItem';
import { mixBowl, tintOf, isContainerProduct } from '../food/process';
import { makeFood } from '../food/types';

export class BowlStation extends Station {
  readonly id = 'bowl' as const;
  readonly label = 'Mixing Bowl';
  readonly icon = 'bowl';
  override capacity = 6;
  private progress = 0;
  private mixing = 0; // whisk speed 0..1
  private autoMix = 0;
  private whiskAngle = 0;
  private lastAngle: number | null = null;
  private whiskHome: { pos: THREE.Vector3; quat: THREE.Quaternion; parent: THREE.Object3D };
  private whiskIn = 0;
  private fillLevel = 0;
  private fillColor = new THREE.Color('#f6dc9a');
  private loopAcc = 0;
  private orbit = 0;

  constructor(game: import('../game/Game').Game) {
    super(game);
    const b = game.kitchen.bowl;
    const c = this.center();
    this.cylZone(c.clone().add(new THREE.Vector3(0, 0.06, 0)), b.innerRadius + 0.04, 0.2);
    const w = game.kitchen.whisk.root;
    this.whiskHome = { pos: w.position.clone(), quat: w.quaternion.clone(), parent: w.parent ?? game.scene };
    this.registerPart(w, () => this.doAction(true));
  }

  center(): THREE.Vector3 {
    const b = this.game.kitchen.bowl;
    return b.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, b.bottomY, 0));
  }

  override hoverPoint(): THREE.Vector3 {
    const b = this.game.kitchen.bowl;
    return this.center().add(new THREE.Vector3(0, b.rimY - b.bottomY + 0.08, 0));
  }

  restPose(item: FoodItem): RestPose {
    const i = this.contents.indexOf(item);
    const n = this.contents.length;
    const b = this.game.kitchen.bowl;
    const c = this.center();
    if (isContainerProduct(item.state) && n === 1) return { pos: c.clone(), rotY: 0, hidden: true };
    const layer = Math.floor(i / 4);
    const p = this.ring(i % 4, Math.min(4, n - layer * 4), b.innerRadius * 0.62, c, this.orbit + layer * 0.7);
    p.y += layer * 0.035 + 0.005;
    return { pos: p, rotY: this.orbit + i, scale: 1 - this.progress * 0.35 };
  }

  override hiddenPick(): FoodItem | null {
    const it = this.contents[0];
    return this.contents.length === 1 && it && isContainerProduct(it.state) ? it : null;
  }

  override action(): ActionSpec | null {
    if (this.contents.length === 0) return null;
    if (this.contents.length === 1 && isContainerProduct(this.contents[0].state)) return null;
    return { label: 'Mix!', icon: 'whisk' };
  }

  override doAction() {
    if (!this.contents.length) {
      this.game.ui.floatLabel('Add something!', this.hoverPoint(), 'info');
      return;
    }
    this.autoMix = 1.6;
  }

  override gestureStart(point: THREE.Vector3): boolean {
    if (this.game.camera.view !== 'bowl' || !this.contents.length) return false;
    const c = this.center();
    if (Math.hypot(point.x - c.x, point.z - c.z) > this.game.kitchen.bowl.innerRadius * 1.3) return false;
    this.lastAngle = Math.atan2(point.z - c.z, point.x - c.x);
    return true;
  }

  override gestureMove(point: THREE.Vector3) {
    const c = this.center();
    const a = Math.atan2(point.z - c.z, point.x - c.x);
    if (this.lastAngle !== null) {
      let d = a - this.lastAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const speed = Math.min(1, Math.abs(d) * 4);
      this.mixing = Math.max(this.mixing, speed);
      this.whiskAngle = a;
      this.progress += Math.abs(d) / (Math.PI * 2) / 3.2; // ~3 circles
    }
    this.lastAngle = a;
  }

  override gestureEnd() {
    this.lastAngle = null;
  }

  override update(dt: number, time: number) {
    const b = this.game.kitchen.bowl;
    if (this.autoMix > 0) {
      this.autoMix -= dt;
      this.mixing = 1;
      this.whiskAngle += dt * 9;
      this.progress += dt / 1.6;
    }
    const active = this.mixing > 0.05 && this.contents.length > 0 && !(this.contents.length === 1 && isContainerProduct(this.contents[0].state));
    this.mixing *= Math.exp(-3 * dt);
    // whisk follows into the bowl while mixing
    this.whiskIn += ((active ? 1 : 0) - this.whiskIn) * (1 - Math.exp(-8 * dt));
    this.animateWhisk(time);
    if (active) {
      this.orbit += dt * 6 * this.mixing;
      this.arrange();
      this.loopAcc += dt;
      if (this.loopAcc > 0.22) {
        this.loopAcc = 0;
        this.game.audio.play('squish', { volume: 0.35, pitch: 0.8 + Math.random() * 0.5 });
        this.game.fx.splash(this.center().add(new THREE.Vector3(0, 0.04, 0)), '#' + this.fillColor.getHexString(), 2, this.center().y, 0.35);
      }
      for (const it of this.contents) it.wobble(0.15);
      if (this.progress >= 1) this.finishMix();
    }
    // batter level in the bowl
    const product = this.hiddenPick();
    const target = product ? 1 : active ? this.progress : 0;
    this.fillLevel += (target - this.fillLevel) * (1 - Math.exp(-4 * dt));
    const fill = b.fill;
    fill.visible = this.fillLevel > 0.02;
    if (fill.visible) {
      if (product) this.fillColor.set(product.state.tint ?? '#f6dc9a');
      (fill.material as THREE.MeshStandardMaterial).color.copy(this.fillColor);
      const y = b.bottomY + 0.01 + this.fillLevel * (b.rimY - b.bottomY) * 0.45;
      fill.position.y = y;
      // the bowl widens towards the rim
      const k = 0.55 + 0.45 * Math.min(1, (y - b.bottomY) / Math.max(0.01, b.rimY - b.bottomY));
      fill.scale.setScalar(k);
      fill.rotation.z = time * 0.6 * (active ? 3 : 0.2);
    }
  }

  private animateWhisk(time: number) {
    const w = this.game.kitchen.whisk.root;
    const k = this.whiskIn;
    if (k < 0.01) {
      if (w.parent !== this.whiskHome.parent) {
        this.whiskHome.parent.attach(w);
      }
      w.position.copy(this.whiskHome.pos);
      w.quaternion.copy(this.whiskHome.quat);
      return;
    }
    if (w.parent !== this.game.scene) this.game.scene.attach(w);
    const c = this.center();
    const r = this.game.kitchen.bowl.innerRadius * 0.45;
    const a = this.whiskAngle + Math.sin(time * 20) * 0.1;
    const inBowl = new THREE.Vector3(c.x + Math.cos(a) * r * 0.6, c.y + 0.06, c.z + Math.sin(a) * r * 0.6);
    const home = this.whiskHome.parent.localToWorld(this.whiskHome.pos.clone());
    w.position.lerpVectors(home, inBowl, k);
    // whisk stands upright-ish, head down into the bowl (tool lies along +X; head at +X end)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -Math.PI / 2 + 0.35, 'YXZ'));
    w.quaternion.slerpQuaternions(this.whiskHome.quat, q, k);
  }

  private finishMix() {
    const g = this.game;
    this.progress = 0;
    this.autoMix = 0;
    this.mixing = 0;
    const states = this.contents.map((i) => i.state);
    let result;
    try {
      result = mixBowl(states);
    } catch (e) {
      console.warn('mixBowl failed', e);
      result = { ...makeFood('mixture'), from: states };
    }
    this.fillColor.set(result.tint ?? tintOf(states));
    for (const it of [...this.contents]) g.items.remove(it);
    const item = g.items.spawn(result, this.center());
    this.receive(item);
    item.snapTo(this.restPose(item).pos);
    g.fx.sparkle(this.hoverPoint(), 14);
    g.audio.play('magic');
    g.ui.floatLabel(item.name + '!', this.hoverPoint().add(new THREE.Vector3(0, 0.05, 0)), 'good');
    g.character.notice('combine', this.center());
  }

  override clear() {
    super.clear();
    this.progress = 0;
    this.fillLevel = 0;
  }
}
