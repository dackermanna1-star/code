import * as THREE from 'three';
import { CharacterModel } from '../characters/CharacterModel';
import { Animator, Gesture } from '../characters/Animator';
import { CustomerDef } from '../characters/Roster';
import { EXPRESSIONS } from '../characters/Face';
import { clamp, dampAngle, pick, rand } from '../core/math';
import type { Order } from './Order';
import type { Seat } from '../world/Layout';
import type { BurgerStack } from '../food/BurgerStack';
import { discard } from '../world/Builder';

export type CState =
  | 'outside'
  | 'toQueue'
  | 'queued'
  | 'atCounter'
  | 'ordering'
  | 'toWait'
  | 'waiting'
  | 'toPickup'
  | 'atPickup'
  | 'toSeat'
  | 'eating'
  | 'leaving'
  | 'gone';

export type EmoteKind = 'heart' | 'star' | 'angry' | 'dots' | 'sweat' | 'exclaim' | 'music' | 'note' | 'happy' | 'sad' | 'yum';

export interface CustomerContext {
  now(): number;
  openDoor(): void;
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[];
  emote(c: Customer, kind: EmoteKind): void;
  say(c: Customer, text: string, mood: 'happy' | 'neutral' | 'angry' | 'sad', duration?: number): void;
  footstep(c: Customer): void;
  crumbs(at: THREE.Vector3): void;
  comfort(): number;
  later(seconds: number, fn: () => void): void;
}

let NEXT_ID = 1;

export class Customer {
  readonly uid = NEXT_ID++;
  readonly model: CharacterModel;
  readonly anim: Animator;
  state: CState = 'outside';
  readonly pos = new THREE.Vector3();
  yaw = 0;
  private path: THREE.Vector3[] = [];
  private finalYaw: number | null = null;
  private onArrive: (() => void) | null = null;
  speed = 0;
  walkSpeed: number;
  order: Order | null = null;
  arrivedAt = 0;
  servedAt = 0;
  waitSpot = -1;
  queueSlot = -1;
  seat: Seat | null = null;
  tray: THREE.Object3D | null = null;
  burger: BurgerStack | null = null;
  private idleTimer = rand(2, 5);
  private eatTimer = 0;
  private biteTimer = 0;
  private emoteTimer = rand(6, 12);
  lookAt: THREE.Vector3 | null = null;
  highlighted = false;
  /** 0..1 (1 = totally content) */
  mood = 1;
  private wasInside = false;
  private outsideTarget: THREE.Vector3 | null = null;

  constructor(readonly def: CustomerDef, private ctx: CustomerContext) {
    this.model = new CharacterModel(def.app);
    this.anim = new Animator(this.model);
    this.anim.energy = def.p.energy;
    this.walkSpeed = 1.05 + def.p.energy * 0.18 + rand(-0.05, 0.05);
    this.anim.onFootstep = () => ctx.footstep(this);
  }

  get root() {
    return this.model.rig.root;
  }

  get headPos(): THREE.Vector3 {
    const v = new THREE.Vector3();
    this.model.rig.head.getWorldPosition(v);
    return v;
  }

  /** world position above the head for UI bubbles */
  bubbleAnchor(out = new THREE.Vector3()): THREE.Vector3 {
    this.model.rig.head.getWorldPosition(out);
    out.y += this.model.dims.headR * 1.6 + (this.def.app.hat === 'tophat' || this.def.app.hat === 'chef' ? 0.18 : 0.05);
    return out;
  }

  place(p: THREE.Vector3, yaw: number) {
    this.pos.copy(p);
    this.yaw = yaw;
    this.syncRoot();
  }

  private syncRoot() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  /** Walk a list of waypoints. */
  walk(points: THREE.Vector3[], onArrive?: () => void, finalYaw: number | null = null) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive ?? null;
    this.finalYaw = finalYaw;
    this.anim.sit = 0;
  }

  /** Walk to a point inside, using the nav grid. */
  goTo(target: THREE.Vector3, onArrive?: () => void, finalYaw: number | null = null) {
    this.walk(this.ctx.path(this.pos, target), onArrive, finalYaw);
  }

  get moving() {
    return this.path.length > 0;
  }

  setExpression(name: keyof typeof EXPRESSIONS) {
    this.model.face.setExpression(name);
  }

  private gestureTimer = 0;
  gesture(g: Gesture, duration = 0) {
    this.anim.setGesture(g);
    this.gestureTimer = duration;
  }

  private defaultGesture(): Gesture {
    if (this.state === 'toSeat' || (this.state === 'atPickup' && this.tray)) return 'hold';
    if (this.state === 'eating') return 'eat';
    return 'none';
  }

  /** Waiting time since the customer reached the counter. */
  waitTime(): number {
    if (!this.arrivedAt) return 0;
    const end = this.servedAt || this.ctx.now();
    return end - this.arrivedAt;
  }

  update(dt: number) {
    // --- locomotion
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      const desired = last ? Math.min(this.walkSpeed, d * 2.5 + 0.35) : this.walkSpeed;
      this.speed += (desired - this.speed) * Math.min(1, dt * 5);
      if (d > 0.001) {
        const heading = Math.atan2(dx, dz);
        this.yaw = dampAngle(this.yaw, heading, 9, dt);
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
      }
      if (d < 0.06) {
        this.path.shift();
        if (!this.path.length) {
          this.speed = 0;
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      }
    } else {
      this.speed = Math.max(0, this.speed - dt * 4);
      if (this.finalYaw !== null) this.yaw = dampAngle(this.yaw, this.finalYaw, 6, dt);
    }
    // door crossing
    const inside = this.pos.z < 6.0;
    if (inside !== this.wasInside && Math.abs(this.pos.x - 1.2) < 1.3) this.ctx.openDoor();
    if (Math.abs(this.pos.z - 6.0) < 1.4 && Math.abs(this.pos.x - 1.2) < 1.2 && this.moving) this.ctx.openDoor();
    this.wasInside = inside;

    if (this.gestureTimer > 0) {
      this.gestureTimer -= dt;
      if (this.gestureTimer <= 0) this.anim.setGesture(this.defaultGesture());
    }
    this.anim.speed = this.speed;
    this.syncRoot();
    this.root.updateMatrixWorld();

    // --- behavior per state
    const now = this.ctx.now();
    switch (this.state) {
      case 'queued':
      case 'atCounter':
      case 'waiting':
        this.updateWaiting(dt);
        break;
      case 'eating':
        this.updateEating(dt);
        break;
    }
    this.anim.lookTarget = this.lookAt;
    this.anim.update(dt);
    void now;
  }

  private updateWaiting(dt: number) {
    if (this.moving) return;
    const wait = this.waitTime();
    const patience = this.def.p.patience * (1 + this.ctx.comfort() * 0.35);
    const grace = 60 * patience;
    const span = 160 * patience;
    this.mood = clamp(1 - Math.max(0, wait - grace) / span);
    this.anim.mood = this.mood * 2 - 1.2;
    const base: keyof typeof EXPRESSIONS = this.mood > 0.85 ? 'content' : this.mood > 0.6 ? 'neutral' : this.mood > 0.35 ? 'impatient' : 'annoyed';
    if (this.anim.gesture === 'none' || this.anim.gesture === 'crossArms' || this.anim.gesture === 'tapFoot' || this.anim.gesture === 'checkWatch')
      this.model.face.setExpression(base);
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.idleTimer = rand(3.5, 8);
      const r = Math.random();
      if (this.mood > 0.85) {
        const g = pick<Gesture>(['none', 'none', 'think', 'rubBelly', 'none']);
        this.gesture(g, rand(1.5, 3));
        if (Math.random() < 0.2) this.ctx.emote(this, pick<EmoteKind>(['music', 'yum', 'note']));
      } else if (this.mood > 0.55) {
        this.gesture(r < 0.4 ? 'checkWatch' : r < 0.7 ? 'tapFoot' : 'crossArms', rand(2, 3.5));
      } else {
        this.gesture(r < 0.4 ? 'crossArms' : r < 0.7 ? 'tapFoot' : 'handsHips', rand(2.5, 4));
      }
    }
    this.emoteTimer -= dt;
    if (this.emoteTimer <= 0) {
      this.emoteTimer = rand(7, 14) * (0.5 + this.mood);
      if (this.mood < 0.35) this.ctx.emote(this, Math.random() < 0.5 ? 'angry' : 'sweat');
      else if (this.mood < 0.6) this.ctx.emote(this, 'dots');
      if (this.mood < 0.4 && Math.random() < 0.35) this.ctx.say(this, pick(this.def.lines.waiting), 'angry', 2.2);
    }
  }

  startEating(duration: number) {
    this.state = 'eating';
    this.eatTimer = duration;
    this.biteTimer = rand(0.8, 1.6);
    this.gesture('eat');
    this.model.face.setExpression('chewing');
    this.model.face.chew = 1;
  }

  private updateEating(dt: number) {
    this.eatTimer -= dt;
    this.biteTimer -= dt;
    if (this.biteTimer <= 0) {
      this.biteTimer = rand(1.8, 3.2);
      if (this.burger) {
        const s = Math.max(0.05, this.burger.group.scale.x - 0.12);
        this.burger.group.scale.setScalar(s);
        const p = new THREE.Vector3();
        this.burger.group.getWorldPosition(p);
        this.ctx.crumbs(p);
      }
      if (Math.random() < 0.25) this.ctx.emote(this, pick<EmoteKind>(['yum', 'heart', 'happy']));
    }
    if (this.eatTimer <= 0 && this.onDoneEating) {
      const cb = this.onDoneEating;
      this.onDoneEating = null;
      cb();
    }
  }
  onDoneEating: (() => void) | null = null;

  dispose() {
    this.root.removeFromParent();
    // cleared mid-meal (closing time): the food and tray go too
    this.burger?.dispose();
    this.burger = null;
    if (this.tray) discard(this.tray);
    this.tray = null;
    this.model.dispose();
  }
}
