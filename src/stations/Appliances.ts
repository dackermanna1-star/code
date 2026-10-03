// Countertop appliances: deep fryer, blender, toaster, microwave, and the freezer drawer.

import * as THREE from 'three';
import { HeatStation, Station, type ActionSpec } from './Station';
import type { FoodItem, RestPose } from '../game/FoodItem';
import { blend, tintOf, isContainerProduct, applyCold, type HeatMethod, type CookEvent } from '../food/process';
import { makeFood } from '../food/types';
import { getDef, hasDef } from '../food/catalog';
import type { Game } from '../game/Game';
import type { LoopHandle } from '../audio';
import { ease } from '../game/anim';

// ---------------------------------------------------------------------------------------------
export class FryerStation extends HeatStation {
  readonly id = 'fryer' as const;
  readonly label = 'Deep Fryer';
  readonly icon = 'fryer';
  readonly method: HeatMethod = 'deepfry';
  private down = 0;
  private wantDown = false;
  private lowerTimer = 0;
  private dripAcc = 0;

  constructor(game: Game) {
    super(game);
    this.capacity = 3;
    this.loopName = 'fryer';
    this.on = true;
    const f = game.kitchen.fryer;
    this.registerPart(f.basket, () => this.toggleBasket());
    const c = f.root.getWorldPosition(new THREE.Vector3());
    this.boxZone(c.clone().add(new THREE.Vector3(0, f.oilY + 0.04, 0)), [f.basketSize[0] + 0.08, 0.25, f.basketSize[1] + 0.08]);
  }

  private basketFloorWorld(): THREE.Vector3 {
    const f = this.game.kitchen.fryer;
    f.basket.updateMatrixWorld(true);
    return f.basket.localToWorld(new THREE.Vector3(0, f.basketFloorY, 0));
  }

  center(): THREE.Vector3 {
    return this.basketFloorWorld();
  }

  override hoverPoint(): THREE.Vector3 {
    const f = this.game.kitchen.fryer;
    return f.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, f.basketUpY + 0.18, 0));
  }

  restPose(item: FoodItem): RestPose {
    const i = this.contents.indexOf(item);
    const f = this.game.kitchen.fryer;
    const p = this.ring(i, this.contents.length, Math.min(f.basketSize[0], f.basketSize[1]) * 0.7, this.center(), 0.3);
    return { pos: p, rotY: i * 1.1 };
  }

  private toggleBasket() {
    if (this.game.camera.view !== 'fryer') {
      this.game.goTo('fryer');
      return;
    }
    this.wantDown = !this.wantDown;
    this.game.audio.play(this.wantDown ? 'fryer-drop' : 'fryer-lift');
    if (this.wantDown) this.burst();
  }

  private burst() {
    const f = this.game.kitchen.fryer;
    const oil = f.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, f.oilY, 0));
    setTimeout(() => {
      this.game.fx.bubbles(oil, f.basketSize[0] * 0.45, '#fff6d0', 6, true);
      this.game.fx.sizzle(oil, f.basketSize[0] * 0.4, 6);
    }, 250);
  }

  protected override onReceive() {
    this.lowerTimer = 0.45;
  }

  protected override heatingNow(): boolean {
    return this.contents.length > 0 && this.down > 0.75;
  }

  override action(): ActionSpec | null {
    return this.contents.length ? { label: this.wantDown ? 'Lift' : 'Fry!', icon: 'fryer' } : null;
  }

  override doAction() {
    this.toggleBasket();
  }

  protected override updateVisuals(dt: number, time: number) {
    const f = this.game.kitchen.fryer;
    if (this.lowerTimer > 0) {
      this.lowerTimer -= dt;
      if (this.lowerTimer <= 0 && !this.wantDown && this.contents.length) {
        this.wantDown = true;
        this.game.audio.play('fryer-drop');
        this.burst();
      }
    }
    if (!this.contents.length && this.wantDown) this.wantDown = false;
    this.down += ((this.wantDown ? 1 : 0) - this.down) * (1 - Math.exp(-6 * dt));
    f.basket.position.y = THREE.MathUtils.lerp(f.basketUpY, f.basketDownY, this.down) + (this.heat > 0.3 ? Math.sin(time * 40) * 0.0008 : 0);
    const lm = f.lamp.material as THREE.MeshStandardMaterial;
    lm.emissiveIntensity = this.contents.length ? 2 : 0.4;
    if (this.contents.length) this.arrange();
    // dripping when lifted after frying
    if (!this.wantDown && this.contents.some((i) => i.state.cook.deepfry > 0.2)) {
      this.dripAcc += dt;
      if (this.dripAcc > 0.15) {
        this.dripAcc = 0;
        const c = this.center();
        this.game.fx.particles.emit({ pos: c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, -0.01, (Math.random() - 0.5) * 0.08)), vel: new THREE.Vector3(0, -0.2, 0), acc: new THREE.Vector3(0, -4, 0), life: 0.3, size: 0.008, color: '#f2c14a', sprite: 4, fadeIn: 0, rot: Math.PI });
      }
    }
  }

  protected override emitFx(dt: number) {
    const f = this.game.kitchen.fryer;
    const oil = f.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, f.oilY, 0));
    const h = this.heat;
    if (Math.random() < dt * (3 + 30 * h)) this.game.fx.bubbles(oil, f.basketSize[0] * 0.5, '#fff6d0', 0.5 + h * 2, h > 0.4);
    if (h > 0.3 && Math.random() < dt * 10 * h) this.game.fx.steam(oil.clone().add(new THREE.Vector3(0, 0.03, 0)), h, f.basketSize[0] * 0.4);
    if (h > 0.3) this.game.fx.sizzle(oil, f.basketSize[0] * 0.4, h * 0.8);
    for (const item of this.contents) if (item.state.cook.burn > 0.2 && Math.random() < dt * 6) this.game.fx.smoke(item.position.clone().add(new THREE.Vector3(0, 0.05, 0)), item.state.cook.burn);
  }
}

// ---------------------------------------------------------------------------------------------
export class BlenderStation extends Station {
  readonly id = 'blender' as const;
  readonly label = 'Blender';
  readonly icon = 'blender';
  override capacity = 5;
  private progress = 0;
  private running = 0; // seconds left of auto-blend
  private holding = false;
  private spin = 0;
  private loop: LoopHandle | null = null;
  private liquidLevel = 0;
  private liquidColor = new THREE.Color('#f4a0c0');

  constructor(game: Game) {
    super(game);
    const b = game.kitchen.blender;
    this.registerPart(b.button, () => this.doAction(true));
    const c = this.jarWorld(0.15);
    this.cylZone(c, b.jarInnerRadius + 0.05, b.jarTopY - b.jarBottomY + 0.12);
  }

  private jarWorld(y: number): THREE.Vector3 {
    const b = this.game.kitchen.blender;
    b.jar.updateMatrixWorld(true);
    return b.jar.localToWorld(new THREE.Vector3(0, y, 0));
  }

  center(): THREE.Vector3 {
    return this.jarWorld(this.game.kitchen.blender.jarBottomY + 0.01);
  }

  override hoverPoint(): THREE.Vector3 {
    return this.jarWorld(this.game.kitchen.blender.jarTopY + 0.12);
  }

  restPose(item: FoodItem): RestPose {
    const b = this.game.kitchen.blender;
    if (isContainerProduct(item.state) && this.contents.length === 1) return { pos: this.center(), rotY: 0, hidden: true };
    const i = this.contents.indexOf(item);
    const p = this.center();
    const a = i * 2.4 + this.spin;
    const r = b.jarInnerRadius * 0.35 * (1 - this.progress * 0.6);
    p.x += Math.cos(a) * r;
    p.z += Math.sin(a) * r;
    p.y += i * 0.045 * (1 - this.progress * 0.5);
    const fit = Math.min(1, (b.jarInnerRadius * 1.6) / Math.max(0.01, item.visual.radius * 2));
    return { pos: p, rotY: a, scale: fit * (1 - this.progress * 0.5) };
  }

  override hiddenPick(): FoodItem | null {
    const it = this.contents[0];
    return this.contents.length === 1 && it && isContainerProduct(it.state) ? it : null;
  }

  override accepts(item: FoodItem): boolean {
    if (this.hiddenPick()) return false;
    return super.accepts(item);
  }

  override action(): ActionSpec | null {
    if (!this.contents.length || this.hiddenPick()) return null;
    return { label: 'Blend!', icon: 'blender', hold: true, active: this.running > 0 || this.holding };
  }

  override doAction(down = true) {
    if (!this.contents.length || this.hiddenPick()) {
      this.game.audio.play('blender-button');
      return;
    }
    if (down) {
      this.game.audio.play('blender-button');
      this.running = Math.max(this.running, 2.4);
    }
  }

  override update(dt: number, time: number) {
    const b = this.game.kitchen.blender;
    const active = (this.running > 0 || this.holding) && this.contents.length > 0 && !this.hiddenPick();
    if (this.running > 0) this.running -= dt;
    // motor sound
    if (active && !this.loop) this.loop = this.game.audio.loop('blender', { volume: 0.8 });
    if (!active && this.loop) {
      this.loop.stop(0.25);
      this.loop = null;
    }
    const sp = active ? 1 : 0;
    this.spin += dt * 30 * sp;
    b.blades.rotation.y = this.spin;
    b.jar.position.x = active ? Math.sin(time * 70) * 0.002 : 0;
    b.jar.rotation.z = active ? Math.sin(time * 53) * 0.01 : 0;
    b.button.position.y = (b.button.userData.baseY ??= b.button.position.y) - (active ? 0.005 : 0);
    if (active) {
      this.progress = Math.min(1, this.progress + dt / 2.2);
      this.liquidColor.set(tintOf(this.contents.map((i) => i.state)));
      for (const it of this.contents) it.wobble(0.2);
      if (Math.random() < dt * 20) {
        const c = this.jarWorld(b.jarBottomY + 0.05 + this.progress * 0.12);
        this.game.fx.splash(c, '#' + this.liquidColor.getHexString(), 1, c.y - 0.05, 0.2);
      }
      this.arrange();
      if (this.progress >= 1) this.finish();
    }
    const product = this.hiddenPick();
    const want = product ? 0.75 : active ? this.progress * 0.7 : 0;
    this.liquidLevel += (want - this.liquidLevel) * (1 - Math.exp(-5 * dt));
    if (product) this.liquidColor.set(product.state.tint ?? '#f4a0c0');
    const liq = b.liquid;
    liq.visible = this.liquidLevel > 0.02;
    liq.scale.y = Math.max(0.001, this.liquidLevel * (b.jarTopY - b.jarBottomY));
    (liq.material as THREE.MeshStandardMaterial).color.copy(this.liquidColor);
    liq.rotation.y = this.spin * 0.2;
  }

  private finish() {
    const g = this.game;
    this.progress = 0;
    this.running = 0;
    const states = this.contents.map((i) => i.state);
    let res;
    try {
      res = blend(states);
    } catch (e) {
      console.warn('blend failed', e);
      res = { ...makeFood('drink'), from: states, tint: tintOf(states) };
    }
    for (const it of [...this.contents]) g.items.remove(it);
    const item = g.items.spawn(res, this.center());
    this.receive(item);
    g.fx.sparkle(this.hoverPoint(), 14);
    g.audio.play('magic');
    g.ui.floatLabel(item.name + '!', this.hoverPoint(), 'good');
    g.character.notice('combine', this.center());
  }

  override clear() {
    super.clear();
    this.progress = 0;
    this.liquidLevel = 0;
  }
}

// ---------------------------------------------------------------------------------------------
export class ToasterStation extends HeatStation {
  readonly id = 'toaster' as const;
  readonly label = 'Toaster';
  readonly icon = 'toaster';
  readonly method: HeatMethod = 'toast';
  private down = 0;
  private toasting = 0;
  private tickAcc = 0;

  constructor(game: Game) {
    super(game);
    this.capacity = 2;
    this.loopName = 'toaster';
    this.heatRate = 1.25;
    const t = game.kitchen.toaster;
    this.registerPart(t.lever, () => this.press());
    const c = t.root.getWorldPosition(new THREE.Vector3());
    this.boxZone(c.clone().add(new THREE.Vector3(0, 0.15, 0)), [0.36, 0.34, 0.24]);
  }

  center(): THREE.Vector3 {
    const t = this.game.kitchen.toaster;
    return t.root.localToWorld(t.slots[0].clone());
  }

  override hoverPoint(): THREE.Vector3 {
    return this.center().add(new THREE.Vector3(0, 0.16, 0.02));
  }

  restPose(item: FoodItem): RestPose {
    const t = this.game.kitchen.toaster;
    const i = this.contents.indexOf(item);
    t.root.updateMatrixWorld(true);
    const slot = t.root.localToWorld(t.slots[Math.min(i, t.slots.length - 1)].clone());
    const h = item.visual.height;
    // stand flat things up in the slot
    const flatish = h < item.visual.radius * 0.9;
    const standH = flatish ? item.visual.radius * 2 : h;
    const sink = this.down * t.slotDepth * 0.85;
    slot.y += -standH * 0.45 - sink;
    const fit = Math.min(1, t.slotSize[0] / Math.max(0.01, item.visual.radius * 2));
    return { pos: slot, rotY: 0, tilt: flatish ? new THREE.Euler(Math.PI / 2, 0, 0) : undefined, scale: fit };
  }

  surfaceYFor(): number {
    return this.center().y;
  }

  private press() {
    if (this.game.camera.view !== 'toaster') {
      this.game.goTo('toaster');
      return;
    }
    if (!this.contents.length) {
      this.game.audio.play('click');
      return;
    }
    if (this.toasting > 0) {
      this.pop();
      return;
    }
    this.toasting = 6.5;
    this.on = true;
    this.game.audio.play('toaster-down');
  }

  private pop() {
    this.toasting = 0;
    this.on = false;
    this.game.audio.play('toaster-pop');
    setTimeout(() => this.game.audio.play('ding', { volume: 0.6 }), 120);
    this.down = 0;
    for (const it of this.contents) {
      const pose = this.restPose(it);
      it.flyTo(pose.pos, { dur: 0.55, height: 0.22, onLand: () => it.settle(this.restPose(it)) });
    }
  }

  override action(): ActionSpec | null {
    return this.contents.length ? { label: this.toasting > 0 ? 'Pop!' : 'Toast!', icon: 'toaster' } : null;
  }

  override doAction() {
    this.press();
  }

  protected override heatingNow(): boolean {
    return this.toasting > 0 && this.contents.length > 0;
  }

  protected override updateVisuals(dt: number) {
    const t = this.game.kitchen.toaster;
    const want = this.toasting > 0 ? 1 : 0;
    this.down += (want - this.down) * (1 - Math.exp(-12 * dt));
    t.lever.position.y = (t.lever.userData.baseY ??= t.lever.position.y) - t.leverTravel * this.down;
    (t.glow.material as THREE.MeshBasicMaterial).opacity = this.heat * 0.8;
    if (this.toasting > 0) {
      this.toasting -= dt;
      this.tickAcc += dt;
      if (this.tickAcc > 0.5) {
        this.tickAcc = 0;
        this.game.audio.play('tick', { volume: 0.25 });
      }
      if (this.toasting <= 0) this.pop();
    }
    if (this.contents.length) this.arrange();
  }

  protected override emitFx(dt: number, time: number) {
    super.emitFx(dt, time);
    if (this.heat > 0.4 && Math.random() < dt * 5) this.game.fx.steam(this.center().add(new THREE.Vector3(0, 0.02, 0)), 0.4, 0.06);
  }
}

// ---------------------------------------------------------------------------------------------
export class MicrowaveStation extends HeatStation {
  readonly id = 'microwave' as const;
  readonly label = 'Microwave';
  readonly icon = 'microwave';
  readonly method: HeatMethod = 'micro';
  private open = 0;
  private wantOpen = false;
  private running = 0;
  private plateAngle = 0;
  private closeTimer = 0;
  private hovering = false;

  constructor(game: Game) {
    super(game);
    this.capacity = 2;
    this.loopName = 'microwave';
    this.heatRate = 1.1;
    const m = game.kitchen.microwave;
    this.registerPart(m.door, () => this.toggleDoor());
    this.registerPart(m.button, () => this.start());
    const c = m.plate.getWorldPosition(new THREE.Vector3());
    this.boxZone(c.clone().add(new THREE.Vector3(0, 0.12, 0.05)), [0.5, 0.32, 0.42]);
    m.setDisplay(':)');
  }

  center(): THREE.Vector3 {
    const m = this.game.kitchen.microwave;
    return m.plate.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, m.plateY - m.plate.position.y + 0.004, 0));
  }

  override hoverPoint(): THREE.Vector3 {
    return this.center().add(new THREE.Vector3(0, 0.1, 0.22));
  }

  restPose(item: FoodItem): RestPose {
    const i = this.contents.indexOf(item);
    const m = this.game.kitchen.microwave;
    const p = this.ring(i, this.contents.length, m.plateRadius * 0.9, this.center(), this.plateAngle);
    const fit = Math.min(1, 0.11 / Math.max(0.01, item.visual.height));
    return { pos: p, rotY: -this.plateAngle + i, scale: fit };
  }

  override hover(on: boolean) {
    this.hovering = on;
    if (on && !this.wantOpen && this.running <= 0) {
      this.wantOpen = true;
      this.game.audio.play('door-open', { volume: 0.6 });
    }
  }

  private toggleDoor() {
    if (this.game.camera.view !== 'microwave') {
      this.game.goTo('microwave');
      return;
    }
    if (this.running > 0) this.stop(false);
    this.wantOpen = !this.wantOpen;
    this.game.audio.play(this.wantOpen ? 'door-open' : 'door-close');
  }

  private start() {
    if (!this.contents.length) {
      this.game.audio.play('microwave-beep', { pitch: 0.7 });
      return;
    }
    if (this.running > 0) {
      this.stop(false);
      return;
    }
    if (this.wantOpen) {
      this.wantOpen = false;
      this.game.audio.play('door-close');
    }
    this.running = 6;
    this.on = true;
    this.game.audio.play('microwave-beep');
  }

  private stop(done: boolean) {
    this.running = 0;
    this.on = false;
    if (done) {
      this.game.audio.play('microwave-ding');
      this.game.kitchen.microwave.setDisplay('END');
    } else this.game.kitchen.microwave.setDisplay(':)');
  }

  protected override onReceive() {
    this.closeTimer = 0.8;
  }

  protected override heatingNow(): boolean {
    return this.running > 0 && this.open < 0.15;
  }

  override action(): ActionSpec | null {
    if (!this.contents.length) return null;
    return { label: this.running > 0 ? 'Stop' : 'Start', icon: 'microwave' };
  }

  override doAction() {
    this.start();
  }

  protected override updateVisuals(dt: number) {
    const m = this.game.kitchen.microwave;
    if (this.closeTimer > 0 && !this.hovering) {
      this.closeTimer -= dt;
      if (this.closeTimer <= 0 && this.contents.length) this.start();
    }
    if (!this.contents.length && this.running > 0) this.stop(false);
    this.open += ((this.wantOpen ? 1 : 0) - this.open) * (1 - Math.exp(-8 * dt));
    m.door.rotation.y = -m.openAngle * this.open;
    if (this.running > 0) {
      this.running -= dt;
      this.plateAngle += dt * 1.4;
      m.plate.rotation.y = this.plateAngle;
      m.setDisplay(`0:0${Math.max(0, Math.ceil(this.running))}`);
      if (this.running <= 0) this.stop(true);
    }
    const lm = m.light.material as THREE.MeshBasicMaterial;
    lm.opacity = this.running > 0 ? 0.55 : this.open > 0.3 ? 0.25 : 0;
    if (this.contents.length) this.arrange();
  }

  protected override handleEvents(item: FoodItem, events: CookEvent[]) {
    super.handleEvents(item, events);
  }
}

// ---------------------------------------------------------------------------------------------
export class FreezerStation extends Station {
  readonly id = 'freezer' as const;
  readonly label = 'Freezer';
  readonly icon = 'freezer';
  override capacity = 4;
  private open = 0;
  private wantOpen = false;
  private loop: LoopHandle | null = null;
  private fxAcc = 0;

  constructor(game: Game) {
    super(game);
    const f = game.kitchen.fridge;
    this.registerPart(f.drawer, () => this.toggle());
    f.drawer.updateMatrixWorld(true);
    const c = f.drawer.localToWorld(new THREE.Vector3(0, f.drawerFloorY + 0.12, f.drawerTravel * 0.5));
    this.boxZone(c, [f.drawerSize[0] + 0.1, 0.4, f.drawerSize[1] + f.drawerTravel]);
  }

  center(): THREE.Vector3 {
    const f = this.game.kitchen.fridge;
    f.drawer.updateMatrixWorld(true);
    return f.drawer.localToWorld(new THREE.Vector3(0, f.drawerFloorY, 0));
  }

  override hoverPoint(): THREE.Vector3 {
    return this.center().add(new THREE.Vector3(0, 0.2, 0.05));
  }

  restPose(item: FoodItem): RestPose {
    const i = this.contents.indexOf(item);
    const f = this.game.kitchen.fridge;
    const n = this.contents.length;
    const c = this.center();
    const x = n <= 1 ? 0 : -f.drawerSize[0] * 0.3 + (i * f.drawerSize[0] * 0.6) / (n - 1);
    return { pos: c.add(new THREE.Vector3(x, 0, (i % 2 ? 0.05 : -0.05))), rotY: i * 0.8 };
  }

  private toggle() {
    if (this.game.camera.view !== 'freezer') {
      this.game.goTo('freezer');
      return;
    }
    this.wantOpen = !this.wantOpen;
    this.game.audio.play(this.wantOpen ? 'drawer-open' : 'drawer-close');
  }

  override hover(on: boolean) {
    if (on && !this.wantOpen) {
      this.wantOpen = true;
      this.game.audio.play('drawer-open', { volume: 0.6 });
    }
  }

  override enterView() {
    if (!this.wantOpen) {
      this.wantOpen = true;
      this.game.audio.play('drawer-open');
    }
  }

  override leaveView() {
    if (this.wantOpen) {
      this.wantOpen = false;
      this.game.audio.play('drawer-close', { volume: 0.6 });
    }
  }

  override action(): ActionSpec | null {
    return { label: this.wantOpen ? 'Close' : 'Open', icon: 'freezer' };
  }

  override doAction() {
    this.toggle();
  }

  override update(dt: number) {
    const f = this.game.kitchen.fridge;
    this.open += ((this.wantOpen ? 1 : 0) - this.open) * (1 - Math.exp(-7 * dt));
    f.drawer.position.z = (f.drawer.userData.baseZ ??= f.drawer.position.z) + f.drawerTravel * this.open;
    (f.interiorLight.material as THREE.MeshBasicMaterial).opacity = this.open * 0.6;
    if (this.contents.length) this.arrange();
    // chill everything inside
    for (const it of this.contents) {
      if (it.mode !== 'rest') continue;
      let ev: CookEvent[] = [];
      try {
        ev = applyCold(it.state, dt * (this.open > 0.5 ? 0.7 : 1.2));
      } catch {
        /* ignore */
      }
      for (const e of ev) {
        if (e.rebuild) it.setState(it.state, true);
        const top = it.position.clone().add(new THREE.Vector3(0, it.visual.height + 0.05, 0));
        if (e.kind === 'frozen' || e.kind === 'transform') {
          this.game.fx.sparkle(top, 10, '#dff4ff');
          this.game.audio.play(e.kind === 'transform' ? 'magic' : 'freeze');
        }
        if (e.label) this.game.ui.floatLabel(e.label, top, 'good');
      }
      it.refresh();
    }
    // cold mist
    if (this.open > 0.3) {
      this.fxAcc += dt;
      if (this.fxAcc > 0.06) {
        this.fxAcc = 0;
        this.game.fx.frost(this.center().add(new THREE.Vector3(0, 0.06, 0)), f.drawerSize[0] * 0.4, this.open);
      }
      if (!this.loop) this.loop = this.game.audio.loop('freezer', { volume: 0.5 });
    } else if (this.loop) {
      this.loop.stop(0.4);
      this.loop = null;
    }
  }
}

export function colorOf(id: string) {
  return hasDef(id) ? getDef(id).colors.flesh : '#dddddd';
}

export { ease };
