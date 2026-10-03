// Stove stations: frying pan, grill pan, soup pot and the oven underneath.

import * as THREE from 'three';
import { HeatStation, type ActionSpec } from './Station';
import type { FoodItem, RestPose } from '../game/FoodItem';
import { panMerge, potMerge, tintOf, isContainerProduct, type HeatMethod } from '../food/process';
import type { PanProp, BurnerParts } from '../world/props/types';
import type { Game } from '../game/Game';
import type { LoopName } from '../audio';
import { getDef, hasDef } from '../food/catalog';

abstract class BurnerStation extends HeatStation {
  protected burner: BurnerParts;
  /** User switched the burner off with the knob. */
  protected userOff = false;
  private flicker = 0;

  constructor(game: Game, burnerIndex: number) {
    super(game);
    this.burner = game.kitchen.stove.burners[burnerIndex];
    this.registerPart(this.burner.knob, () => this.toggleKnob());
  }

  protected toggleKnob() {
    this.userOff = !this.userOff;
    this.game.audio.play('knob');
    if (!this.userOff && this.contents.length) this.game.audio.play('ignite');
  }

  protected override heatingNow(): boolean {
    return !this.userOff && this.contents.length > 0;
  }

  protected override onReceive() {
    if (!this.userOff && this.contents.length === 1 && this.heat < 0.2) this.game.audio.play('ignite', { volume: 0.7 });
    this.on = true;
  }

  protected burnerVisuals(dt: number, time: number) {
    this.flicker += dt;
    const h = this.heat;
    const f = h * (0.92 + Math.sin(time * 31 + this.flicker) * 0.05 + Math.sin(time * 17) * 0.03);
    this.burner.flame.scale.set(1, Math.max(0.0001, f), 1).multiplyScalar(h > 0.01 ? 1 : 0.0001);
    this.burner.flame.visible = h > 0.01;
    (this.burner.glow.material as THREE.MeshBasicMaterial).opacity = h * 0.55;
    const want = this.heatingNow() ? -1.9 : 0;
    this.burner.knob.rotation.z += (want - this.burner.knob.rotation.z) * (1 - Math.exp(-10 * dt));
  }
}

/** Frying pan & grill pan. */
export class PanStation extends BurnerStation {
  readonly id: 'pan' | 'grill';
  readonly label: string;
  readonly icon: string;
  readonly method: HeatMethod;
  private prop: PanProp;
  private shake = 0;
  private shakeVel = 0;
  private shakeStart: THREE.Vector3 | null = null;
  private panBase: THREE.Vector3;
  private mergeAcc = 0;

  constructor(game: Game, kind: 'pan' | 'grill') {
    super(game, kind === 'pan' ? 0 : 1);
    this.id = kind;
    this.label = kind === 'pan' ? 'Frying Pan' : 'Grill';
    this.icon = kind;
    this.method = kind === 'pan' ? 'fry' : 'grill';
    this.prop = kind === 'pan' ? game.kitchen.pan : game.kitchen.grill;
    this.capacity = kind === 'pan' ? 4 : 3;
    this.loopName = (kind === 'pan' ? 'sizzle' : 'grill') as LoopName;
    this.panBase = this.prop.root.position.clone();
    const c = this.center();
    this.cylZone(c.clone().add(new THREE.Vector3(0, 0.05, 0)), this.prop.innerRadius + 0.03, 0.14);
    this.registerPart(this.prop.handle, () => this.flipAll());
  }

  center(): THREE.Vector3 {
    return this.prop.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, this.prop.surfaceY, 0));
  }

  restPose(item: FoodItem): RestPose {
    const i = this.contents.indexOf(item);
    const p = this.ring(i, this.contents.length, this.prop.innerRadius * 0.85, this.center(), 0.4);
    return { pos: p, rotY: i * 1.3 + (item.state.seed % 10) * 0.1 };
  }

  override tapItem(item: FoodItem) {
    if (this.game.camera.view !== this.id) {
      this.game.goTo(this.id);
      return;
    }
    this.flip(item);
  }

  private flip(item: FoodItem, delay = 0) {
    const g = this.game;
    setTimeout(() => {
      if (item.holder !== this || item.mode !== 'rest') return;
      const pose = this.restPose(item);
      item.flyTo(pose.pos, { dur: 0.5, height: 0.16, spin: 1, onLand: () => {
        item.settle(this.restPose(item));
        g.fx.sizzle(item.position, item.visual.radius, 3);
        g.audio.play('drop-squish', { volume: 0.6 });
      } });
      g.audio.play('flip');
    }, delay * 1000);
  }

  flipAll() {
    if (this.game.camera.view !== this.id) {
      this.game.goTo(this.id);
      return;
    }
    this.contents.forEach((it, i) => this.flip(it, i * 0.08));
  }

  override action(): ActionSpec | null {
    return this.contents.length ? { label: 'Flip!', icon: 'flip' } : null;
  }

  override doAction() {
    this.flipAll();
  }

  // drag the handle to toss the pan
  override gestureStart(point: THREE.Vector3, hit: THREE.Object3D | null): boolean {
    let o: THREE.Object3D | null = hit;
    while (o) {
      if (o === this.prop.handle) {
        this.shakeStart = point.clone();
        return true;
      }
      o = o.parent;
    }
    return false;
  }

  override gestureMove(point: THREE.Vector3) {
    if (!this.shakeStart) return;
    const d = THREE.MathUtils.clamp((point.x - this.shakeStart.x) * 0.6, -0.05, 0.05);
    this.shakeVel = (d - this.shake) * 30;
    this.shake = d;
    if (Math.abs(this.shakeVel) > 0.9) {
      for (const it of this.contents) if (it.mode === 'rest' && Math.random() < 0.3) it.flyTo(this.restPose(it).pos, { dur: 0.35, height: 0.05 + Math.random() * 0.06, onLand: () => it.settle(this.restPose(it)) });
      this.game.audio.play('swish', { volume: 0.3 });
    }
  }

  override gestureEnd() {
    this.shakeStart = null;
  }

  protected override updateVisuals(dt: number, time: number) {
    this.burnerVisuals(dt, time);
    if (!this.shakeStart) this.shake *= Math.exp(-10 * dt);
    this.prop.root.position.copy(this.panBase).add(new THREE.Vector3(this.shake, 0, 0));
    this.prop.oil.visible = this.contents.length > 0 && this.id === 'pan';
    const om = this.prop.oil.material as THREE.MeshStandardMaterial;
    om.opacity = 0.35 * Math.min(1, this.heat + 0.3);
    // merge stir-fries / omelets
    this.mergeAcc += dt;
    if (this.mergeAcc > 0.6 && this.heat > 0.5 && this.contents.length > 1) {
      this.mergeAcc = 0;
      this.tryMerge();
    }
  }

  private tryMerge() {
    const g = this.game;
    let res;
    try {
      res = panMerge(this.contents.map((i) => i.state));
    } catch (e) {
      console.warn('panMerge', e);
      return;
    }
    if (!res) return;
    const at = this.center();
    for (const it of [...this.contents]) g.items.remove(it);
    const item = g.items.spawn(res, at);
    this.receive(item);
    item.snapTo(this.restPose(item).pos);
    g.fx.sparkle(at.clone().add(new THREE.Vector3(0, 0.08, 0)), 12);
    g.audio.play('magic');
    g.ui.floatLabel(item.name + '!', at.clone().add(new THREE.Vector3(0, 0.14, 0)), 'good');
  }

  protected override emitFx(dt: number, time: number) {
    super.emitFx(dt, time);
    if (this.heat < 0.3) return;
    for (const it of this.contents) {
      if (it.mode !== 'rest') continue;
      if (this.id === 'pan') this.game.fx.sizzle(it.position, it.visual.radius * 0.9, this.heat);
      else if (Math.random() < dt * 6) this.game.fx.steam(it.position.clone().add(new THREE.Vector3(0, 0.02, 0)), 0.4, it.visual.radius * 0.6);
    }
  }
}

/** Soup pot: things bob in boiling water; enough ingredients become soup. */
export class PotStation extends BurnerStation {
  readonly id = 'pot' as const;
  readonly label = 'Soup Pot';
  readonly icon = 'pot';
  readonly method: HeatMethod = 'boil';
  private waterColor = new THREE.Color('#bfe3ff');
  private soupColor = new THREE.Color('#bfe3ff');
  private soupAmt = 0;
  private mergeAcc = 0;
  private stirAngle = 0;
  private stirSpeed = 0;
  private lastStir: number | null = null;
  private baseOpacity: number;

  constructor(game: Game) {
    super(game, 2);
    this.capacity = 5;
    this.loopName = 'boil';
    const p = game.kitchen.pot;
    const c = p.root.getWorldPosition(new THREE.Vector3());
    this.cylZone(c.clone().add(new THREE.Vector3(0, p.rimY * 0.6, 0)), p.innerRadius + 0.03, p.rimY + 0.05);
    this.baseOpacity = (p.water.material as THREE.MeshStandardMaterial).opacity;
  }

  center(): THREE.Vector3 {
    const p = this.game.kitchen.pot;
    return p.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, p.waterY, 0));
  }

  override surfaceY(): number {
    return this.center().y;
  }

  override hoverPoint(): THREE.Vector3 {
    const p = this.game.kitchen.pot;
    return this.center().add(new THREE.Vector3(0, p.rimY - p.waterY + 0.1, 0));
  }

  restPose(item: FoodItem): RestPose {
    const c = this.center();
    if (isContainerProduct(item.state)) return { pos: c.clone().add(new THREE.Vector3(0, -0.04, 0)), rotY: 0, hidden: true };
    const visible = this.contents.filter((i) => !isContainerProduct(i.state));
    const i = visible.indexOf(item);
    const t = this.game.time;
    const p = this.ring(i, visible.length, this.game.kitchen.pot.innerRadius * 0.85, c, this.stirAngle);
    p.y -= item.visual.height * 0.45 - Math.sin(t * 3 + i * 1.7) * 0.004 * (0.3 + this.heat);
    return { pos: p, rotY: this.stirAngle * 0.5 + i };
  }

  override hiddenPick(): FoodItem | null {
    return this.contents.find((i) => isContainerProduct(i.state)) ?? null;
  }

  override action(): ActionSpec | null {
    return this.contents.length ? { label: 'Stir', icon: 'spoon' } : null;
  }

  override doAction() {
    this.stirSpeed = 4;
    this.game.audio.play('swish', { volume: 0.5 });
  }

  override gestureStart(point: THREE.Vector3): boolean {
    if (this.game.camera.view !== 'pot') return false;
    const c = this.center();
    if (Math.hypot(point.x - c.x, point.z - c.z) > this.game.kitchen.pot.innerRadius * 1.2) return false;
    this.lastStir = Math.atan2(point.z - c.z, point.x - c.x);
    return true;
  }

  override gestureMove(point: THREE.Vector3) {
    const c = this.center();
    const a = Math.atan2(point.z - c.z, point.x - c.x);
    if (this.lastStir !== null) {
      let d = a - this.lastStir;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.stirSpeed = THREE.MathUtils.clamp(this.stirSpeed + d * 12, -6, 6);
    }
    this.lastStir = a;
  }

  override gestureEnd() {
    this.lastStir = null;
  }

  protected override updateVisuals(dt: number, time: number) {
    this.burnerVisuals(dt, time);
    this.stirAngle += this.stirSpeed * dt;
    this.stirSpeed *= Math.exp(-1.5 * dt);
    if (this.contents.length) this.arrange();
    // water / soup colour
    const soup = this.hiddenPick();
    const want = soup ? 1 : 0;
    this.soupAmt += (want - this.soupAmt) * (1 - Math.exp(-2.5 * dt));
    if (soup) this.soupColor.set(soup.state.tint ?? '#e8a050');
    else if (this.contents.length) {
      // a little colour leaks into the water while things boil
      this.soupColor.set(tintOf(this.contents.map((i) => i.state)));
    }
    const p = this.game.kitchen.pot;
    const wm = p.water.material as THREE.MeshStandardMaterial;
    const leak = soup ? 1 : Math.min(0.25, this.contents.reduce((s, i) => s + Math.min(1, i.state.cook.boil), 0) * 0.08);
    const k = Math.max(this.soupAmt, leak);
    wm.color.copy(this.waterColor).lerp(this.soupColor, k);
    wm.opacity = THREE.MathUtils.lerp(this.baseOpacity, 0.96, k);
    const bm = p.waterBody.material as THREE.MeshStandardMaterial;
    if (bm !== wm) {
      bm.color.copy(wm.color);
      bm.opacity = wm.opacity;
    }
    // gentle rolling boil on the surface
    p.water.position.y = p.waterY + Math.sin(time * 9) * 0.0012 * this.heat;
    this.mergeAcc += dt;
    if (this.mergeAcc > 0.7 && this.heat > 0.6 && this.contents.length) {
      this.mergeAcc = 0;
      this.tryMerge();
    }
  }

  private tryMerge() {
    const g = this.game;
    let res;
    try {
      res = potMerge(this.contents.map((i) => i.state));
    } catch (e) {
      console.warn('potMerge', e);
      return;
    }
    if (!res) return;
    for (const it of [...this.contents]) g.items.remove(it);
    const item = g.items.spawn(res, this.center());
    this.receive(item);
    g.fx.sparkle(this.hoverPoint(), 12);
    g.audio.play('magic');
    g.ui.floatLabel(item.name + '!', this.hoverPoint(), 'good');
  }

  protected override emitFx(dt: number) {
    const c = this.center();
    const r = this.game.kitchen.pot.innerRadius * 0.85;
    if (this.heat > 0.2) {
      if (Math.random() < dt * 22 * this.heat) this.game.fx.bubbles(c, r, '#ffffff', this.heat);
      if (Math.random() < dt * 8 * this.heat) this.game.fx.steam(c.clone().add(new THREE.Vector3(0, 0.04, 0)), this.heat, r * 0.6);
      if (Math.random() < dt * 3 * this.heat) this.game.audio.play('bubble', { volume: 0.12 * this.heat, pitch: 0.8 + Math.random() * 0.6 });
    }
  }

  protected override loopVolume(): number {
    return 0.7;
  }

  /** Boiling keeps items hidden-soup aware; dropping splashes. */
  protected override onReceive(item: FoodItem) {
    super.onReceive();
    const c = this.center();
    if (!isContainerProduct(item.state)) {
      setTimeout(() => {
        this.game.fx.splash(c.clone(), '#cfeaff', 8, c.y, 0.6);
        this.game.audio.play('splash', { volume: 0.7 });
      }, 220);
    }
  }
}

/** The oven under the cooktop. */
export class OvenStation extends HeatStation {
  readonly id = 'oven' as const;
  readonly label = 'Oven';
  readonly icon = 'oven';
  readonly method: HeatMethod = 'bake';
  private open = 0;
  private wantOpen = false;
  private hovering = false;
  private closeTimer = 0;
  private timer = 0;

  constructor(game: Game) {
    super(game);
    this.capacity = 3;
    this.loopName = 'oven';
    const o = game.kitchen.stove.oven;
    this.registerPart(o.door, () => this.toggleDoor());
    this.registerPart(o.dial, () => this.toggleOn());
    const c = this.rackWorld(0);
    this.boxZone(c.clone().add(new THREE.Vector3(0, 0.12, 0.08)), [o.rackSize[0] + 0.1, 0.42, o.rackSize[1] + 0.3]);
  }

  private rackWorld(slide: number): THREE.Vector3 {
    const o = this.game.kitchen.stove.oven;
    const s = this.game.kitchen.stove.root;
    s.updateMatrixWorld(true);
    return s.localToWorld(o.rackCenter.clone().add(new THREE.Vector3(0, 0, slide)));
  }

  center(): THREE.Vector3 {
    return this.rackWorld(this.open * 0.12);
  }

  override hoverPoint(): THREE.Vector3 {
    return this.rackWorld(0.14).add(new THREE.Vector3(0, 0.12, 0));
  }

  restPose(item: FoodItem): RestPose {
    const i = this.contents.indexOf(item);
    const n = this.contents.length;
    const o = this.game.kitchen.stove.oven;
    const c = this.center();
    const x = n <= 1 ? 0 : -o.rackSize[0] * 0.3 + (i * o.rackSize[0] * 0.6) / (n - 1);
    return { pos: c.add(new THREE.Vector3(x, 0, 0)), rotY: i * 0.7 };
  }

  override hover(on: boolean) {
    this.hovering = on;
    if (on && !this.wantOpen) {
      this.wantOpen = true;
      this.game.audio.play('oven-open', { volume: 0.7 });
    }
  }

  private toggleDoor() {
    if (this.game.camera.view !== 'oven') {
      this.game.goTo('oven');
      return;
    }
    this.wantOpen = !this.wantOpen;
    this.game.audio.play(this.wantOpen ? 'oven-open' : 'oven-close');
    if (!this.wantOpen && this.contents.length) this.on = true;
  }

  private toggleOn() {
    this.on = !this.on;
    this.game.audio.play('knob');
  }

  protected override onReceive() {
    this.closeTimer = 0.9;
  }

  protected override heatingNow(): boolean {
    return this.on && this.contents.length > 0 && this.open < 0.2;
  }

  override action(): ActionSpec | null {
    return { label: this.wantOpen ? 'Close' : 'Open', icon: 'oven' };
  }

  override doAction() {
    this.toggleDoor();
  }

  override enterView() {
    if (!this.contents.length && !this.wantOpen) {
      this.wantOpen = true;
      this.game.audio.play('oven-open', { volume: 0.7 });
    }
  }

  override leaveView() {
    if (this.wantOpen && this.contents.length) {
      this.wantOpen = false;
      this.on = true;
      this.game.audio.play('oven-close', { volume: 0.6 });
    }
  }

  protected override onDone(item: FoodItem) {
    super.onDone(item);
    this.game.audio.play('ding');
    this.game.ui.floatLabel('Ready!', this.hoverPoint(), 'good');
  }

  protected override updateVisuals(dt: number) {
    const o = this.game.kitchen.stove.oven;
    if (this.closeTimer > 0 && !this.hovering) {
      this.closeTimer -= dt;
      if (this.closeTimer <= 0 && this.wantOpen && this.contents.length) {
        this.wantOpen = false;
        this.on = true;
        this.game.audio.play('oven-close');
      }
    }
    this.open += ((this.wantOpen ? 1 : 0) - this.open) * (1 - Math.exp(-7 * dt));
    o.door.rotation.x = o.openAngle * this.open;
    o.rack.position.z = (o.rack.userData.baseZ ??= o.rack.position.z) + this.open * 0.12;
    const gm = o.glow.material as THREE.MeshBasicMaterial & { emissiveIntensity?: number };
    if ('opacity' in gm) gm.opacity = Math.max(this.heat * 0.85, this.on ? 0.25 : 0);
    const lm = o.lamp.material as THREE.MeshStandardMaterial;
    if (lm.emissiveIntensity !== undefined) lm.emissiveIntensity = this.on ? 2 : 0;
    if (this.heatingNow()) this.timer += dt;
    else if (!this.on) this.timer = 0;
    o.dial.rotation.z = -Math.min(Math.PI * 1.6, this.timer * 0.12);
    if (this.contents.length) this.arrange();
  }
}

export function texColor(id: string): string {
  return hasDef(id) ? getDef(id).colors.flesh : '#e8d8b0';
}
