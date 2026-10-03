// A food item living in the kitchen: state + visual + toy-like motion.

import * as THREE from 'three';
import type { FoodState } from '../food/types';
import { FoodVisual } from '../food/visual';
import { makeBlobShadow } from '../render/setup';
import { Spring, Spring3, ease } from './anim';
import { FOOD_SCALE } from '../food/visual';
import { nameFood } from '../recipes';

export interface RestPose {
  pos: THREE.Vector3;
  rotY: number;
  /** Extra tilt (e.g. leaning in a toaster slot, flipped in a pan). */
  tilt?: THREE.Euler;
  /** Hide the item visual (e.g. soup shown as the pot's liquid). */
  hidden?: boolean;
  /** Scale multiplier (e.g. shrink to fit a slot). */
  scale?: number;
}

export interface Holder {
  readonly kind: string;
  readonly label: string;
  contents: FoodItem[];
  accepts(item: FoodItem): boolean;
  receive(item: FoodItem, at?: THREE.Vector3): void;
  release(item: FoodItem): void;
  restPose(item: FoodItem): RestPose;
  /** May items dropped onto items in this holder be combined into a dish? */
  readonly combines: boolean;
  /** World y of the surface items rest on (for blob shadows). */
  surfaceY(item: FoodItem): number;
}

type Mode = 'rest' | 'drag' | 'fly' | 'held';

let NEXT_ID = 1;

export class FoodItem {
  readonly id = NEXT_ID++;
  state: FoodState;
  readonly visual: FoodVisual;
  holder: Holder | null = null;
  readonly shadow: THREE.Mesh;
  mode: Mode = 'rest';
  /** Where the drag wants the item (world, bottom-centre). */
  readonly dragTarget = new THREE.Vector3();
  private readonly pos = new Spring3(260, 26);
  private readonly squash = new Spring(1, 300, 14);
  private readonly tiltX = new Spring(0, 120, 12);
  private readonly tiltZ = new Spring(0, 120, 12);
  private readonly lastPos = new THREE.Vector3();
  private rotY = 0;
  private extraTilt = new THREE.Euler();
  private flyT = 0;
  private flyDur = 0;
  private flyFrom = new THREE.Vector3();
  private flyTo = new THREE.Vector3();
  private flyHeight = 0.2;
  private onLand: (() => void) | null = null;
  private flySpin = 0;
  private wobbleT = 0;
  private scaleMul = 1;
  private hidden = false;
  name = '';
  /** Seconds since last "steam puff" (hot food). */
  steamAcc = Math.random();
  /** Freshly added items get a quick pop-in animation. */
  private spawnT = 0;

  constructor(state: FoodState, at?: THREE.Vector3) {
    this.state = state;
    this.visual = new FoodVisual(state);
    this.visual.root.userData.item = this;
    this.shadow = makeBlobShadow(0.1, 0.9);
    this.shadow.userData.noPick = true;
    if (at) this.pos.snap(at);
    this.lastPos.copy(this.pos.value);
    this.refreshName();
    this.updateShadowSize();
    this.syncTransform();
  }

  get root(): THREE.Group {
    return this.visual.root;
  }

  get position(): THREE.Vector3 {
    return this.pos.value;
  }

  refreshName() {
    try {
      this.name = nameFood(this.state);
    } catch {
      this.name = '';
    }
  }

  /** Replace the state (rebuilds the visual when needed). */
  setState(s: FoodState, rebuild = true) {
    this.state = s;
    if (rebuild) {
      this.visual.rebuild(s);
      this.updateShadowSize();
      this.squash.kick(-4);
    } else this.visual.applyState();
    this.refreshName();
  }

  /** Visual-only refresh after in-place state mutation (cooking). */
  refresh() {
    this.visual.applyState();
  }

  private updateShadowSize() {
    const r = Math.max(0.03, this.visual.radius * 1.25);
    this.shadow.scale.setScalar(r / 0.1);
  }

  snapTo(p: THREE.Vector3) {
    this.pos.snap(p);
    this.lastPos.copy(p);
  }

  /** Smoothly settle into the holder's rest pose. */
  settle(pose: RestPose) {
    this.mode = 'rest';
    this.pos.target.copy(pose.pos);
    this.rotY = pose.rotY;
    this.extraTilt.copy(pose.tilt ?? new THREE.Euler());
    this.hidden = !!pose.hidden;
    this.scaleMul = pose.scale ?? 1;
  }

  beginDrag() {
    this.mode = 'drag';
    this.hidden = false;
    this.scaleMul = 1;
    this.squash.kick(3);
    this.extraTilt.set(0, 0, 0);
  }

  /** Arc flight to a point, then land. */
  flyTo(to: THREE.Vector3, opts: { dur?: number; height?: number; onLand?: () => void; spin?: number } = {}) {
    this.mode = 'fly';
    this.flySpin = opts.spin ?? 0;
    this.hidden = false;
    this.flyFrom.copy(this.pos.value);
    this.flyTo.copy(to);
    this.flyT = 0;
    const d = this.flyFrom.distanceTo(to);
    this.flyDur = opts.dur ?? THREE.MathUtils.clamp(0.25 + d * 0.35, 0.3, 0.9);
    this.flyHeight = opts.height ?? Math.min(0.5, 0.08 + d * 0.25);
    this.onLand = opts.onLand ?? null;
  }

  /** Little toy wobble (tap feedback, cooking jiggle). */
  wobble(strength = 1) {
    this.squash.kick(-5 * strength);
    this.tiltX.kick((Math.random() - 0.5) * 6 * strength);
    this.tiltZ.kick((Math.random() - 0.5) * 6 * strength);
    this.wobbleT = 0.4;
  }

  land(strength = 1) {
    this.squash.kick(-7 * strength);
    this.tiltX.kick((Math.random() - 0.5) * 3 * strength);
    this.tiltZ.kick((Math.random() - 0.5) * 3 * strength);
  }

  popIn() {
    this.spawnT = 0.0001;
  }

  update(dt: number) {
    const p = this.pos;
    if (this.mode === 'fly') {
      this.flyT = Math.min(1, this.flyT + dt / this.flyDur);
      const k = ease.inOutQuad(this.flyT);
      p.value.lerpVectors(this.flyFrom, this.flyTo, k);
      p.value.y += Math.sin(k * Math.PI) * this.flyHeight;
      p.vel.set(0, 0, 0);
      p.target.copy(p.value);
      // spin a little in flight (or flip right over)
      if (this.flySpin) {
        this.tiltX.snap(k * Math.PI * 2 * this.flySpin);
      } else this.tiltX.target = Math.sin(k * Math.PI) * 0.4;
      if (this.flyT >= 1) {
        this.mode = 'rest';
        if (this.flySpin) this.tiltX.snap(0);
        this.flySpin = 0;
        this.tiltX.target = 0;
        this.land(1);
        const cb = this.onLand;
        this.onLand = null;
        cb?.();
      }
    } else if (this.mode === 'drag') {
      p.target.copy(this.dragTarget);
      p.update(dt);
      // lean into the motion like a held toy
      const vel = p.vel;
      this.tiltX.target = THREE.MathUtils.clamp(vel.z * 0.9, -0.6, 0.6);
      this.tiltZ.target = THREE.MathUtils.clamp(-vel.x * 0.9, -0.6, 0.6);
    } else {
      p.update(dt);
      this.tiltX.target = 0;
      this.tiltZ.target = 0;
    }
    this.squash.target = 1;
    this.squash.update(dt);
    this.tiltX.update(dt);
    this.tiltZ.update(dt);
    if (this.spawnT > 0) {
      this.spawnT += dt;
      if (this.spawnT > 0.45) this.spawnT = 0;
    }
    this.lastPos.copy(p.value);
    this.syncTransform();
  }

  private syncTransform() {
    const r = this.visual.root;
    r.position.copy(this.pos.value);
    const s = this.squash.value;
    const sy = THREE.MathUtils.clamp(s, 0.55, 1.5);
    const sxz = 1 / Math.sqrt(sy);
    let pop = 1;
    if (this.spawnT > 0) pop = ease.outBack(Math.min(1, this.spawnT / 0.4));
    const base = FOOD_SCALE * this.scaleMul * pop;
    r.scale.set(base * sxz, base * sy, base * sxz);
    r.rotation.set(this.tiltX.value + this.extraTilt.x, this.rotY + this.extraTilt.y, this.tiltZ.value + this.extraTilt.z, 'YXZ');
    r.visible = !this.hidden;
    // blob shadow on the surface below
    const sy0 = this.holder && this.mode === 'rest' ? this.holder.surfaceY(this) : this.shadowSurfaceY;
    this.shadow.position.set(this.pos.value.x, sy0 + 0.002, this.pos.value.z);
    const lift = Math.max(0, this.pos.value.y - sy0);
    const fade = THREE.MathUtils.clamp(1 - lift * 2.2, 0.25, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = (this.hidden ? 0 : 0.85) * fade;
    const grow = 1 + lift * 1.5;
    const k = Math.max(0.03, this.visual.radius * 1.25) / 0.1;
    this.shadow.scale.setScalar(k * grow);
    this.shadow.visible = !this.hidden;
  }

  /** Surface height used for the shadow while dragging/flying (set by the drag controller). */
  shadowSurfaceY = 0.92;

  dispose() {
    this.visual.dispose();
    this.shadow.removeFromParent();
    (this.shadow.material as THREE.Material).dispose();
    this.shadow.geometry.dispose();
  }
}
