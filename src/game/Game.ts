// The game: owns the renderer, scene, systems and the main loop.

import * as THREE from 'three';
import { createRenderer, setupLights, focusShadow, type Lights } from '../render/setup';
import { CameraRig, type ViewName } from './CameraRig';
import { Animator } from './anim';
import { buildKitchen } from '../world/kitchen';
import { buildPlaceholderKitchen } from '../world/placeholder';
import type { KitchenRefs, BottleProp } from '../world/props/types';
import { Effects } from '../fx/Effects';
import { Decals } from '../fx/Decals';
import { ItemManager } from './Items';
import { Interaction } from './Interaction';
import { Counter, Trash } from '../stations/Surfaces';
import type { Station } from '../stations/Station';
import { createStations, type StationMap } from '../stations';
import { Character } from '../character/Character';
import { Hud } from '../ui/Hud';
import { audio, type Audio } from '../audio';
import { LAYOUT, VIEWS, type StationId } from '../world/layout';
import type { FoodItem } from './FoodItem';
import type { SeasoningDef } from '../food/types';
import { makeBottleFallback } from '../world/fallbackBottle';
import { Discoveries } from './Discoveries';
import { Quality } from './Quality';

let bottleBuilder: ((def: SeasoningDef) => BottleProp) | null = null;
/** Lazily resolved so the game runs even before the detailed props exist. */
export function setBottleBuilder(fn: (def: SeasoningDef) => BottleProp) {
  bottleBuilder = fn;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly lights: Lights;
  readonly camera: CameraRig;
  readonly anim = new Animator();
  readonly kitchen: KitchenRefs;
  readonly fx = new Effects();
  readonly decals: Decals;
  readonly items: ItemManager;
  readonly counter: Counter;
  readonly trash: Trash;
  readonly stations: StationMap;
  readonly stationList: Station[];
  readonly character: Character;
  readonly ui: Hud;
  readonly audio: Audio = audio;
  readonly interaction: Interaction;
  readonly discoveries = new Discoveries();
  readonly quality: Quality;
  time = 0;
  private last = performance.now();
  private running = false;
  private shadowFocus = new THREE.Vector3();
  readonly container: HTMLElement;
  paused = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = createRenderer();
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#f6e6cf');
    this.scene.fog = new THREE.Fog('#f6e6cf', 9, 20);
    this.lights = setupLights(this.scene, this.renderer, { shadowSize: 2048 });
    this.camera = new CameraRig(container.clientWidth / Math.max(1, container.clientHeight));

    let kitchen: KitchenRefs;
    try {
      kitchen = buildKitchen();
    } catch (e) {
      console.info('Using placeholder kitchen:', (e as Error).message);
      kitchen = buildPlaceholderKitchen();
    }
    this.kitchen = kitchen;
    this.scene.add(kitchen.root);
    this.scene.add(this.fx.group);
    this.decals = new Decals(this);

    this.items = new ItemManager(this);
    this.counter = new Counter(this);
    this.trash = new Trash(this);
    this.character = new Character(this);
    this.scene.add(this.character.root);
    this.stations = createStations(this);
    this.stationList = Object.values(this.stations);
    this.interaction = new Interaction(this, this.renderer.domElement);
    this.ui = new Hud(this);
    this.quality = new Quality(this);
    this.camera.onArrive = (v) => this.onArrive(v);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.kitchen.chalkboard.write("Today's Special", 'Anything you like!');
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(1 / 20, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const w = this.container.clientWidth, h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.setAspect(w / h);
  }

  /** The station whose close-up is on screen (null in the overview). */
  currentStation(): Station | null {
    const v = this.camera.view;
    if (v === 'table') return this.stations.plate;
    return (this.stations as Record<string, Station>)[v] ?? null;
  }

  goTo(view: ViewName) {
    if (view === this.camera.view) return;
    const prev = this.currentStation();
    prev?.leaveView();
    this.camera.go(view);
    this.audio.play('camera', { volume: 0.35 });
    const next = this.currentStation();
    next?.enterView();
    this.ui.setView(view, next);
    this.character.onViewChange(view);
  }

  back() {
    this.goTo('overview');
  }

  private onArrive(_v: ViewName) {
    this.ui.onArrive();
  }

  /** Feed an item directly to Mochi. */
  feed(item: FoodItem) {
    item.holder?.release(item);
    if (this.camera.view !== 'table' && this.camera.view !== 'plate') this.goTo('plate');
    this.character.feed(item);
  }

  makeBottle(def: SeasoningDef): BottleProp {
    try {
      if (bottleBuilder) return bottleBuilder(def);
    } catch (e) {
      console.warn('bottle builder failed', e);
    }
    return makeBottleFallback(def);
  }

  /** Clean the whole kitchen. */
  reset() {
    this.interaction.cancelDrag();
    for (const st of this.stationList) st.clear();
    this.counter.clear();
    this.items.clear();
    this.fx.clear();
    this.goTo('overview');
  }

  private frame(dt: number) {
    if (this.paused) dt = 0;
    this.time += dt;
    const t = this.time;
    this.anim.update(dt);
    this.interaction.update(dt);
    this.camera.update(dt, t);
    for (const st of this.stationList) st.update(dt, t);
    this.trash.update(dt);
    this.items.update(dt);
    this.character.update(dt, t);
    this.kitchen.ambient.update(dt, t);
    this.fx.update(dt, t);
    this.updateShadowFocus(dt);
    this.scene.updateMatrixWorld();
    this.items.postUpdate();
    this.character.postUpdate();
    this.renderer.render(this.scene, this.camera.camera);
    this.ui.update(dt);
    this.quality.update(dt);
  }

  /** Keep the shadow map tight around what the camera looks at. */
  private updateShadowFocus(dt: number) {
    const v = this.camera.view;
    const target = this.camera.target;
    const want = v === 'overview' ? new THREE.Vector3(VIEWS.overview.target.x + this.camera.panX, 0.9, -0.3) : target.clone();
    this.shadowFocus.lerp(want, 1 - Math.exp(-4 * dt));
    focusShadow(this.lights.sun, this.shadowFocus, v === 'overview' ? 3.4 : 0.9);
  }
}

export { LAYOUT };
export type { StationId };
