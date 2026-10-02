/**
 * Base entity: transform, velocity, collision box, environment state, and Minecraft-like
 * movement physics (shared by players and mobs). Logic ticks at 20 TPS (`tick`), movement
 * at 60 Hz (`physicsStep`), visuals every frame (`updateVisual`).
 */
import * as THREE from 'three';
import { AABB, moveBox, boxCollides } from '../physics/aabb';
import type { World } from '../world/world';
import { BLOCKS, T_LIQUID } from '../world/blocks/registry';
import { behaviorOf } from '../world/blocks/behaviors';
import { GRAVITY } from '../core/constants';

export interface EntityGame {
  world: World;
  events: { emit(type: string, payload: any): void };
  [k: string]: any;
}

/** Per-second rates derived from Minecraft's per-tick constants. */
export const PHYS = {
  gravity: GRAVITY * 0.98, // b/s^2
  airDragY: -Math.log(0.98) * 20, // 1/s
  groundFriction: (slip: number) => -Math.log(slip * 0.91) * 20,
  airFriction: -Math.log(0.91) * 20,
  waterDrag: -Math.log(0.8) * 20,
  lavaDrag: -Math.log(0.5) * 20,
};

let NEXT_ID = 1;

export abstract class Entity {
  readonly id = NEXT_ID++;
  abstract readonly type: string;
  game!: EntityGame;
  world!: World;
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** Look yaw (radians, 0 = facing -Z/north, +PI/2 = facing -X/west) and pitch (+ = looking up). */
  yaw = 0;
  pitch = 0;
  prevYaw = 0;
  prevPitch = 0;
  width = 0.6;
  height = 1.8;
  eyeHeight = 1.62;
  stepHeight = 0;
  onGround = false;
  wasOnGround = false;
  collidedH = false;
  collidedV = false;
  inWater = false;
  inLava = false;
  /** Eye position is inside water. */
  eyesInWater = false;
  /** 0..1 how deep the entity is in fluid (feet to head). */
  fluidDepth = 0;
  inWeb = false;
  onClimbable = false;
  fallDistance = 0;
  fireTicks = 0;
  age = 0;
  removed = false;
  noGravity = false;
  noClip = false;
  /** Persistent across saves */
  persistent = true;
  readonly box = new AABB();
  /** Visual root (added to the scene by the entity renderer). */
  model: THREE.Object3D | null = null;
  /** Arbitrary component data for systems. */
  readonly data: Record<string, any> = {};
  /** Entity riding this one / ridden entity */
  vehicle: Entity | null = null;
  passenger: Entity | null = null;
  /** Physical "mass" in kg (used for knockback/physics interactions). */
  mass = 70;

  constructor() {}

  init(game: EntityGame, world: World) {
    this.game = game;
    this.world = world;
    this.updateBox();
    this.prevPos.copy(this.pos);
  }

  setPos(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos);
    this.updateBox();
  }

  updateBox() {
    const w = this.width / 2;
    this.box.set(this.pos.x - w, this.pos.y, this.pos.z - w, this.pos.x + w, this.pos.y + this.height, this.pos.z + w);
  }

  get eyePos(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  /** Unit look direction from yaw/pitch. */
  lookDir(out = new THREE.Vector3()): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  distanceTo(e: Entity) {
    return this.pos.distanceTo(e.pos);
  }

  remove() {
    this.removed = true;
  }

  /** 20 TPS logic tick. */
  tick(): void {
    this.age++;
    if (this.fireTicks > 0) this.fireTicks--;
  }

  /** Called at 60 Hz before physics: subclasses set movement intent. */
  protected movementInput(_dt: number): { fx: number; fz: number; jump: boolean; speed: number } | null {
    return null;
  }

  /** Detect fluids/climbables/webs around the box. */
  updateEnvironment() {
    const w = this.world;
    const b = this.box;
    let water = false, lava = false, web = false;
    let depth = 0;
    const x0 = Math.floor(b.minX + 0.001), x1 = Math.floor(b.maxX - 0.001);
    const y0 = Math.floor(b.minY + 0.001), y1 = Math.floor(b.maxY - 0.001);
    const z0 = Math.floor(b.minZ + 0.001), z1 = Math.floor(b.maxZ - 0.001);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (let y = y0; y <= y1; y++) {
          const st = w.getBlock(x, y, z);
          if (!st) continue;
          const id = st >>> 4;
          const liq = T_LIQUID[id];
          if (liq) {
            const lvl = st & 7;
            const surface = y + (w.getBlock(x, y + 1, z) >>> 4 === id ? 1 : (8 - lvl) / 9);
            if (surface > b.minY) {
              if (liq === 1) water = true;
              else lava = true;
              depth = Math.max(depth, Math.min(1, (surface - b.minY) / this.height));
            }
          } else if (BLOCKS[id].name === 'cobweb') web = true;
          const beh = behaviorOf(id);
          beh?.onEntityInside?.(w, x, y, z, st, this);
        }
    this.inWater = water;
    this.inLava = lava;
    this.inWeb = web;
    this.fluidDepth = depth;
    const ey = this.pos.y + this.eyeHeight;
    const est = w.getBlock(Math.floor(this.pos.x), Math.floor(ey), Math.floor(this.pos.z));
    if (T_LIQUID[est >>> 4] === 1) {
      const lvl = est & 7;
      const top = Math.floor(ey) + (w.getBlock(Math.floor(this.pos.x), Math.floor(ey) + 1, Math.floor(this.pos.z)) >>> 4 === est >>> 4 ? 1 : (8 - lvl) / 9);
      this.eyesInWater = ey < top;
    } else this.eyesInWater = false;
    // climbable at feet
    const fst = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
    this.onClimbable = fst !== 0 && BLOCKS[fst >>> 4].climbable;
  }

  /** Block under the entity's feet (for friction & step sounds). */
  blockBelow(): number {
    const st = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
    return st;
  }

  /**
   * Minecraft-like movement integration at 60 Hz. `input` = desired horizontal direction
   * (world space, length <= 1), `speed` = target speed (b/s), `jump` = wants to jump.
   */
  travel(dt: number, fx: number, fz: number, speed: number, jump: boolean, flying = false, sneakEdge = false) {
    const v = this.vel;
    if (flying) {
      const lam = PHYS.airFriction * 2.2;
      v.x += (fx * speed - v.x) * (1 - Math.exp(-lam * dt));
      v.z += (fz * speed - v.z) * (1 - Math.exp(-lam * dt));
      v.y *= Math.exp(-lam * 1.6 * dt);
    } else if (this.inWater || this.inLava) {
      const drag = this.inLava ? PHYS.lavaDrag : PHYS.waterDrag;
      const target = speed * (this.inLava ? 0.25 : 0.45);
      const k = 1 - Math.exp(-drag * dt);
      v.x += (fx * target - v.x) * k;
      v.z += (fz * target - v.z) * k;
      v.y *= Math.exp(-drag * dt);
      v.y -= (this.inLava ? 6 : 8) * dt;
      if (jump) v.y += (this.inLava ? 14 : 22) * dt;
      // float upward slowly when idle in deep water (bubble column not modelled)
      if (this.collidedH && jump) v.y = Math.max(v.y, 6);
    } else {
      let slip = 0.6;
      if (this.onGround) {
        const below = this.blockBelow();
        if (below) slip = BLOCKS[below >>> 4].friction;
      }
      if (this.onGround) {
        const lam = PHYS.groundFriction(slip);
        // acceleration so that steady-state speed equals target on normal ground; slippery blocks accelerate slowly
        const accelScale = Math.min(1, Math.pow(0.6 / slip, 3));
        const k = 1 - Math.exp(-lam * dt);
        v.x += (fx * speed - v.x) * k * accelScale;
        v.z += (fz * speed - v.z) * k * accelScale;
        if (accelScale < 1) {
          // keep momentum on ice (low friction decay)
          const decay = Math.exp(-PHYS.groundFriction(slip) * dt);
          if (fx === 0 && fz === 0) { v.x *= decay; v.z *= decay; }
        }
      } else {
        // air control
        const lam = PHYS.airFriction;
        const air = 7.6 * (speed / 4.317);
        v.x += fx * air * dt;
        v.z += fz * air * dt;
        const d = Math.exp(-lam * dt);
        v.x *= d;
        v.z *= d;
      }
      if (this.onClimbable) {
        v.x = Math.max(-3, Math.min(3, v.x));
        v.z = Math.max(-3, Math.min(3, v.z));
        if (v.y < -3) v.y = -3;
        if ((this.collidedH || jump) && (fx !== 0 || fz !== 0 || jump)) v.y = 4.2;
        else if (sneakEdge && v.y < 0) v.y = 0;
        this.fallDistance = 0;
      }
      if (!this.noGravity) {
        v.y -= PHYS.gravity * dt;
        v.y *= Math.exp(-PHYS.airDragY * dt);
      }
      if (this.inWeb) {
        v.x *= 0.25; v.z *= 0.25; v.y *= 0.05;
        this.fallDistance = 0;
      }
    }
    // speed factor (soul sand, honey)
    let factor = 1;
    if (this.onGround && !flying) {
      const below = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.01), Math.floor(this.pos.z));
      const inside = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
      factor = Math.min(BLOCKS[below >>> 4].speedFactor, inside ? BLOCKS[inside >>> 4].speedFactor : 1);
    }
    let dx = v.x * dt * factor, dy = v.y * dt, dz = v.z * dt;
    // sneaking: don't walk off edges
    if (sneakEdge && this.onGround && !flying) {
      const test = (ox: number, oz: number) => {
        const b = this.box.clone().offset(ox, -0.62, oz);
        return !this.boxHasCollision(b);
      };
      while (dx !== 0 && test(dx, 0)) dx = Math.abs(dx) < 0.01 ? 0 : dx * 0.5;
      while (dz !== 0 && test(0, dz)) dz = Math.abs(dz) < 0.01 ? 0 : dz * 0.5;
      while (dx !== 0 && dz !== 0 && test(dx, dz)) { dx = Math.abs(dx) < 0.01 ? 0 : dx * 0.5; dz = Math.abs(dz) < 0.01 ? 0 : dz * 0.5; }
    }
    this.move(dx, dy, dz);
  }

  protected boxHasCollision(b: AABB): boolean {
    return boxCollides(this.world, b);
  }

  /** Move with collision; updates onGround/collided flags and fall distance. */
  move(dx: number, dy: number, dz: number) {
    this.wasOnGround = this.onGround;
    if (this.noClip) {
      this.pos.x += dx; this.pos.y += dy; this.pos.z += dz;
      this.updateBox();
      return;
    }
    const r = moveBox(this.world, this.box, dx, dy, dz, this.stepHeight, this.onGround);
    this.pos.set((this.box.minX + this.box.maxX) / 2, this.box.minY, (this.box.minZ + this.box.maxZ) / 2);
    this.collidedH = r.collidedX || r.collidedZ;
    this.collidedV = r.collidedY;
    this.onGround = r.onGround;
    if (r.collidedX) this.vel.x = 0;
    if (r.collidedZ) this.vel.z = 0;
    if (r.collidedY) {
      if (this.vel.y < 0 && this.onGround) this.onLanded(-this.vel.y);
      this.vel.y = 0;
    }
    if (this.onGround) {
      if (this.fallDistance > 0) {
        this.onFall(this.fallDistance);
        this.fallDistance = 0;
      }
    } else if (dy < 0 && !this.inWater && !this.onClimbable) {
      this.fallDistance -= dy;
    } else if (this.inWater) this.fallDistance = 0;
  }

  /** Landing with downward speed (b/s). */
  protected onLanded(_speed: number) {}
  /** Fall distance resolved when touching the ground. */
  protected onFall(dist: number) {
    const st = this.blockBelow();
    if (st) behaviorOf(st >>> 4)?.onEntityFall?.(this.world, Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z), st, this, dist);
  }

  /** 60 Hz movement step (default: passive physics body). */
  physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.updateEnvironment();
    const inp = this.movementInput(dt);
    if (inp) this.travel(dt, inp.fx, inp.fz, inp.speed, inp.jump);
    else this.travel(dt, 0, 0, 0, false);
  }

  /** Interpolated position for rendering. */
  renderPos(alpha: number, out = new THREE.Vector3()) {
    return out.copy(this.prevPos).lerp(this.pos, alpha);
  }

  /** Per-frame visual update (model transforms, animation). */
  updateVisual(_alpha: number, _dt: number) {}

  /** Damage hook; returns true if damage was applied. */
  hurt(_source: DamageSource, _amount: number): boolean {
    return false;
  }

  serialize(): any {
    return { type: this.type, p: this.pos.toArray(), v: this.vel.toArray(), yaw: this.yaw, pitch: this.pitch, d: this.data };
  }
  deserialize(o: any) {
    this.pos.fromArray(o.p);
    this.prevPos.copy(this.pos);
    this.vel.fromArray(o.v ?? [0, 0, 0]);
    this.yaw = o.yaw ?? 0;
    this.pitch = o.pitch ?? 0;
    Object.assign(this.data, o.d ?? {});
    this.updateBox();
  }
}

export type DamageType =
  | 'generic' | 'player' | 'mob' | 'arrow' | 'projectile' | 'fall' | 'fire' | 'lava' | 'drown' | 'starve' | 'void' | 'explosion'
  | 'magic' | 'wither' | 'poison' | 'cactus' | 'suffocate' | 'lightning' | 'thorns' | 'freeze' | 'anvil' | 'dragon' | 'kill' | 'sweet_berry';

export interface DamageSource {
  type: DamageType;
  /** The entity that caused the damage (attacker / shooter). */
  attacker?: Entity | null;
  /** Direct entity (arrow, fireball). */
  direct?: Entity | null;
  /** World position of the impact (for wounds/particles). */
  point?: THREE.Vector3;
  /** Direction of the hit (for knockback/ragdoll impulse). */
  dir?: THREE.Vector3;
  /** Physical impulse magnitude (N*s scaled) for ragdolls / stagger. */
  impulse?: number;
  /** Weapon item name (for impact characteristics). */
  weapon?: string;
  /** Bypasses armor (fall, drown, starve, void, magic). */
  bypassArmor?: boolean;
  crit?: boolean;
  fire?: boolean;
  projectile?: boolean;
  explosion?: boolean;
}
