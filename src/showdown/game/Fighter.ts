import * as THREE from 'three';
import { RAPIER } from '../../physics/Physics';
import { SD } from '../core/SD';
import { ARENA_R, COLLIDE } from '../world/City';

export interface CrashInfo {
  speed: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  collider: RAPIER.Collider;
  /** 'wall' | 'ground' */
  kind: 'wall' | 'ground';
}

const _v = new THREE.Vector3();
const _d = { x: 0, y: 0, z: 0 };

/**
 * A body in the fight: capsule moved by Rapier's character controller, with
 * anime physics (snappy gravity, air dashes, hover) and launch/crash states.
 */
export class Fighter {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  grounded = true;
  /** knocked through the air: no control, crashes into what it hits */
  launched = false;
  /** hovering (Gojo floats on his technique) */
  hover = false;
  gravity = 24;
  /** extra weight while falling */
  fallMul = 1.35;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private ctrl: RAPIER.KinematicCharacterController;
  onCrash: ((c: CrashInfo) => void) | null = null;
  onLand: ((speed: number) => void) | null = null;
  /** seconds since leaving the ground */
  airTime = 0;
  private lastCrash = 0;

  constructor(
    readonly radius: number,
    readonly height: number,
    x: number,
    z: number,
  ) {
    const w = SD.physics.world;
    const half = Math.max(0.05, height / 2 - radius);
    this.pos.set(x, SD.city.groundY(x, z), z);
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, this.pos.y + height / 2, z));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(half, radius).setCollisionGroups(COLLIDE.fighter), this.body);
    this.ctrl = w.createCharacterController(0.02);
    this.ctrl.setUp({ x: 0, y: 1, z: 0 });
    this.ctrl.enableAutostep(0.35, 0.2, false);
    this.ctrl.enableSnapToGround(0.25);
    this.ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.ctrl.setApplyImpulsesToDynamicBodies(true);
    this.ctrl.setCharacterMass(90);
  }

  /** Teleport (no collision). */
  place(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.body.setTranslation({ x, y: y + this.height / 2, z }, true);
    SD.physics.world.propagateModifiedBodyPositionsToColliders();
  }

  /** Knocked away: no control until it lands or crashes. */
  launch(vx: number, vy: number, vz: number) {
    this.vel.set(vx, vy, vz);
    this.launched = true;
    this.grounded = false;
    this.lastCrash = 0;
  }

  get center() {
    return _v.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  /**
   * Integrates: `wish` is the desired horizontal velocity (ignored while
   * launched), accel how quickly the body gets there.
   */
  step(dt: number, wish: THREE.Vector3 | null, accel: number, airAccel = accel * 0.35) {
    const v = this.vel;
    if (!this.launched && wish) {
      const a = this.grounded ? accel : airAccel;
      const k = 1 - Math.exp(-a * dt);
      v.x += (wish.x - v.x) * k;
      v.z += (wish.z - v.z) * k;
    }
    if (this.launched) {
      // air drag on a thrown body
      const drag = Math.exp(-0.35 * dt);
      v.x *= drag;
      v.z *= drag;
    }
    if (!this.grounded || this.launched) {
      if (this.hover && !this.launched) v.y += (0 - v.y) * (1 - Math.exp(-5 * dt));
      else v.y -= this.gravity * (v.y < 0 ? this.fallMul : 1) * dt;
    }
    v.y = Math.max(v.y, -60);
    _d.x = v.x * dt;
    _d.y = v.y * dt;
    _d.z = v.z * dt;
    if (this.grounded && !this.launched && v.y <= 0) _d.y -= 0.05;
    this.ctrl.enableSnapToGround(this.launched || v.y > 0.5 ? 0 : 0.25);
    if (this.launched || v.y > 0.5) this.ctrl.disableSnapToGround();
    this.ctrl.computeColliderMovement(this.collider, _d, undefined, COLLIDE.fighter);
    const m = this.ctrl.computedMovement();
    const wasGround = this.grounded;
    const fall = -v.y;
    this.grounded = this.ctrl.computedGrounded() && v.y <= 0.5;
    // collisions: walls stop horizontal speed, a launched body crashes
    const n = this.ctrl.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = this.ctrl.computedCollision(i);
      if (!c) continue;
      const nx = c.normal1.x;
      const ny = c.normal1.y;
      const nz = c.normal1.z;
      const into = -(v.x * nx + v.y * ny + v.z * nz);
      if (into <= 0) continue;
      if (this.launched && into > 11 && SD.time - this.lastCrash > 0.25 && c.collider) {
        this.lastCrash = SD.time;
        const p = c.witness1;
        this.onCrash?.({ speed: into, point: new THREE.Vector3(p.x, p.y, p.z), normal: new THREE.Vector3(nx, ny, nz), collider: c.collider, kind: ny > 0.6 ? 'ground' : 'wall' });
      }
      // remove the velocity into the surface (with a little bounce when thrown)
      const bounce = this.launched ? 0.25 : 0;
      v.x += nx * into * (1 + bounce);
      v.y += ny * into * (1 + bounce);
      v.z += nz * into * (1 + bounce);
    }
    this.pos.x += m.x;
    this.pos.y += m.y;
    this.pos.z += m.z;
    // the ground is never below the street
    const gy = SD.city.groundY(this.pos.x, this.pos.z);
    if (this.pos.y < gy) {
      this.pos.y = gy;
      if (v.y < 0) v.y = 0;
      this.grounded = true;
    }
    // the fight stays in the intersection
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_R) {
      const k = ARENA_R / r;
      this.pos.x *= k;
      this.pos.z *= k;
      const out = (v.x * this.pos.x + v.z * this.pos.z) / ARENA_R;
      if (out > 0) {
        v.x -= (this.pos.x / ARENA_R) * out * 1.3;
        v.z -= (this.pos.z / ARENA_R) * out * 1.3;
      }
    }
    if (this.pos.y > 60) {
      this.pos.y = 60;
      if (v.y > 0) v.y = 0;
    }
    if (this.grounded) {
      if (!wasGround) {
        if (this.launched && fall > 14 && SD.time - this.lastCrash > 0.25) {
          this.lastCrash = SD.time;
          this.onCrash?.({ speed: fall, point: this.pos.clone(), normal: new THREE.Vector3(0, 1, 0), collider: this.collider, kind: 'ground' });
        }
        this.onLand?.(fall);
      }
      if (this.launched && Math.hypot(v.x, v.z) < 4) this.launched = false;
      if (this.launched) {
        // skid along the street
        const f = Math.exp(-6 * dt);
        v.x *= f;
        v.z *= f;
      }
      if (v.y < 0) v.y = 0;
      this.airTime = 0;
    } else this.airTime += dt;
    // teleport the capsule now so the next query sees it (see Showdown: propagateModifiedBodyPositionsToColliders)
    this.body.setTranslation({ x: this.pos.x, y: this.pos.y + this.height / 2, z: this.pos.z }, true);
  }

  dispose() {
    const w = SD.physics.world;
    w.removeCharacterController(this.ctrl);
    w.removeRigidBody(this.body);
  }
}
