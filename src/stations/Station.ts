// Station framework: every appliance / surface that holds food.

import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { FoodItem, Holder, RestPose } from '../game/FoodItem';
import type { StationId } from '../world/layout';
import type { ViewName } from '../game/CameraRig';
import { enterStation, applyHeat, type HeatMethod, type CookEvent, type StationKind } from '../food/process';
import { getDef, hasDef } from '../food/catalog';
import { doneness } from '../food/types';
import type { LoopHandle, LoopName, SfxName } from '../audio';

export interface ActionSpec {
  label: string;
  icon: string;
  /** Hold-to-activate (blender) rather than tap. */
  hold?: boolean;
  active?: boolean;
}

export abstract class Station implements Holder {
  readonly kind = 'station';
  abstract readonly id: StationId;
  abstract readonly label: string;
  /** Short icon key for the HUD dock (see ui/icons.ts). */
  abstract readonly icon: string;
  contents: FoodItem[] = [];
  capacity = 4;
  combines = false;
  /** Invisible volumes used for picking the station and dropping into it. */
  readonly zones: THREE.Object3D[] = [];
  /** Interactive parts -> tap handler. */
  readonly parts = new Map<THREE.Object3D, () => void>();
  protected readonly game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  get view(): ViewName {
    return this.id as ViewName;
  }

  /** World-space centre of the drop area. */
  abstract center(): THREE.Vector3;

  surfaceY(_item: FoodItem): number {
    return this.center().y;
  }

  accepts(_item: FoodItem): boolean {
    return this.contents.length < this.capacity;
  }

  /** Called when an item arrives (dropped, flown in...). */
  receive(item: FoodItem, at?: THREE.Vector3) {
    if (!this.contents.includes(item)) this.contents.push(item);
    item.holder = this;
    try {
      const next = enterStation(item.state, this.id as StationKind);
      if (next !== item.state) item.setState(next, true);
    } catch (e) {
      console.warn('enterStation failed', e);
    }
    this.onReceive(item, at);
    this.arrange();
  }

  release(item: FoodItem) {
    const i = this.contents.indexOf(item);
    if (i >= 0) this.contents.splice(i, 1);
    if (item.holder === this) item.holder = null;
    this.onRelease(item);
    this.arrange();
  }

  protected onReceive(_item: FoodItem, _at?: THREE.Vector3) {}
  protected onRelease(_item: FoodItem) {}

  arrange() {
    for (const it of this.contents) if (it.mode === 'rest' || it.mode === 'held') it.settle(this.restPose(it));
  }

  /** Where an item sits in this station (before fit-to-size scaling). */
  protected abstract slot(item: FoodItem): RestPose;

  /** Largest footprint radius an item may have here (bigger items are shrunk to fit). */
  protected maxItemRadius(): number {
    return Infinity;
  }

  restPose(item: FoodItem): RestPose {
    const pose = this.slot(item);
    const lim = this.maxItemRadius();
    if (isFinite(lim)) pose.scale = Math.min(pose.scale ?? 1, lim / Math.max(0.01, item.visual.baseRadius));
    return pose;
  }

  /** Where a dragged item hovers when over this station. */
  hoverPoint(): THREE.Vector3 {
    return this.center().clone().add(new THREE.Vector3(0, 0.12, 0));
  }

  /** Called while a dragged item hovers over / leaves the station (open doors, etc.). */
  hover(_on: boolean) {}

  update(_dt: number, _time: number) {}

  /** Tap on one of this station's food items. */
  tapItem(item: FoodItem, _point: THREE.Vector3) {
    item.wobble(1);
    this.game.audio.play('tap', { pitch: 0.9 + Math.random() * 0.3 });
  }

  /** Tap on the station surface (not on food). Default: nothing. */
  tapSurface(_point: THREE.Vector3) {}

  /** Pointer pressed on the station (not on an item). Return true to capture a gesture. */
  gestureStart(_point: THREE.Vector3, _hit: THREE.Object3D | null): boolean {
    return false;
  }
  gestureMove(_point: THREE.Vector3, _ray: THREE.Ray) {}
  gestureEnd() {}

  /** Contextual HUD button for this station, or null. */
  action(): ActionSpec | null {
    return null;
  }
  doAction(_down = true) {}

  enterView() {}
  leaveView() {}

  /** Item hidden inside the station (e.g. soup in the pot) that should be picked when the pointer hits the station. */
  hiddenPick(): FoodItem | null {
    return null;
  }

  /** Utility: circular slot positions. */
  protected ring(i: number, n: number, radius: number, center: THREE.Vector3, rot = 0): THREE.Vector3 {
    if (n <= 1) return center.clone();
    const a = rot + (i / n) * Math.PI * 2;
    const r = n === 2 ? radius * 0.62 : radius * 0.68;
    return new THREE.Vector3(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r);
  }

  protected addZone(mesh: THREE.Mesh) {
    mesh.visible = false;
    mesh.userData.station = this;
    this.zones.push(mesh);
    this.game.scene.add(mesh);
  }

  /** Invisible box zone helper (world space). */
  protected boxZone(center: THREE.Vector3, size: [number, number, number]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
    m.position.copy(center);
    this.addZone(m);
    return m;
  }

  protected cylZone(center: THREE.Vector3, radius: number, height: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), new THREE.MeshBasicMaterial());
    m.position.copy(center);
    this.addZone(m);
    return m;
  }

  protected registerPart(obj: THREE.Object3D, fn: () => void) {
    this.parts.set(obj, fn);
    obj.traverse((o) => (o.userData.partOf = obj));
  }

  /** Remove everything (kitchen reset). */
  clear() {
    for (const it of [...this.contents]) this.game.items.remove(it);
    this.contents = [];
  }
}

/** Shared cooking behaviour for pans, grill, pot, oven, fryer, toaster, microwave. */
export abstract class HeatStation extends Station {
  abstract readonly method: HeatMethod;
  /** 0..1 eased heat level (visual + speed). */
  heat = 0;
  /** Is the appliance switched on? */
  on = false;
  protected loopName: LoopName | null = null;
  protected loop: LoopHandle | null = null;
  protected heatRate = 1;
  private fxAcc = 0;
  private dinged = new WeakSet<FoodItem>();

  /** Whether heat currently reaches the food (door closed, basket lowered...). */
  protected heatingNow(): boolean {
    return this.on && this.contents.length > 0;
  }

  override update(dt: number, time: number) {
    const target = this.heatingNow() ? 1 : 0;
    this.heat += (target - this.heat) * (1 - Math.exp(-(target ? 2.5 : 1.5) * dt));
    this.updateVisuals(dt, time);
    // sound loop follows heat
    if (this.loopName) {
      if (this.heat > 0.05 && !this.loop) this.loop = this.game.audio.loop(this.loopName, { volume: 0 });
      if (this.loop) {
        this.loop.setVolume(this.loopVolume() * this.heat, 0.1);
        if (this.heat < 0.03) {
          this.loop.stop(0.3);
          this.loop = null;
        }
      }
    }
    if (this.heat < 0.15) return;
    const h = this.heat * this.heatRate;
    for (const item of [...this.contents]) {
      if (item.mode !== 'rest') continue;
      let events: CookEvent[] = [];
      try {
        events = applyHeat(item.state, this.method, dt, h);
      } catch (e) {
        console.warn('applyHeat failed', e);
      }
      this.handleEvents(item, events);
      item.refresh();
      // ding once when perfectly done
      if (!this.dinged.has(item) && doneness(item.state.cook) >= 1 && item.state.cook.burn < 0.05) {
        this.dinged.add(item);
        this.onDone(item);
      }
    }
    this.fxAcc += dt;
    if (this.fxAcc > 1 / 30) {
      this.emitFx(this.fxAcc, time);
      this.fxAcc = 0;
    }
  }

  protected loopVolume(): number {
    return 0.5 + Math.min(0.5, this.contents.length * 0.15);
  }

  protected onDone(item: FoodItem) {
    this.game.fx.sparkle(item.position.clone().add(new THREE.Vector3(0, item.visual.height * 0.8, 0)), 6);
  }

  /** Called with cooking events from process.applyHeat. */
  protected handleEvents(item: FoodItem, events: CookEvent[]) {
    for (const ev of events) {
      if (ev.rebuild) item.setState(item.state, true);
      const top = item.position.clone().add(new THREE.Vector3(0, item.visual.height + 0.03, 0));
      switch (ev.kind) {
        case 'transform':
          this.game.fx.sparkle(top, 12);
          this.game.audio.play('magic');
          item.wobble(1.2);
          break;
        case 'burning':
          this.game.character.notice('burning', item.position);
          break;
        case 'burnt':
          this.game.audio.play('poof', { volume: 0.6 });
          this.game.fx.smoke(top, 0.9, 3);
          break;
        case 'melted':
          item.wobble(0.6);
          break;
        case 'popped':
          this.game.fx.pop(top);
          this.game.audio.play('popcorn');
          item.wobble(1.5);
          break;
        case 'exploded':
          this.game.fx.splash(top, '#ffd34a', 18, this.surfaceY(item), 1.4);
          this.game.fx.poof(top, '#fff2c0', 1.2);
          this.game.audio.play('explode-pop');
          this.game.camera.shake(0.02, 0.4);
          break;
        default:
          break;
      }
      if (ev.label) this.game.ui.floatLabel(ev.label, top, ev.kind === 'burnt' ? 'bad' : ev.kind === 'transform' || ev.kind === 'done' ? 'good' : 'info');
    }
  }

  /** Station-specific continuous visuals (flames, glow, bubbles). */
  protected updateVisuals(_dt: number, _time: number) {}

  /** Food FX: steam from hot items, smoke from burning ones. */
  protected emitFx(dt: number, _time: number) {
    for (const item of this.contents) {
      if (item.mode !== 'rest' || !item.root.visible) continue;
      const c = item.state.cook;
      const top = item.position.clone().add(new THREE.Vector3(0, item.visual.height * 0.85, 0));
      if (c.burn > 0.15 && Math.random() < dt * (3 + c.burn * 8)) this.game.fx.smoke(top, Math.min(1, c.burn * 1.2), 0.6 + c.burn);
      else if (this.heat > 0.4 && Math.random() < dt * 4 * this.heat) this.game.fx.steam(top, 0.5 + this.heat * 0.5, item.visual.radius * 0.5);
    }
  }

  protected playLand(item: FoodItem) {
    const tex = hasDef(item.state.id) ? getDef(item.state.id).texture : 'soft';
    const map: Record<string, SfxName> = { liquid: 'drop-liquid', crunchy: 'drop-crunchy', crispy: 'drop-crunchy', juicy: 'drop-squish', creamy: 'drop-squish', powder: 'drop-soft' };
    this.game.audio.play(map[tex] ?? 'drop-soft');
  }

  override clear() {
    super.clear();
    this.on = false;
  }
}
