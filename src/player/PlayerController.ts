import * as THREE from 'three';
import { RAPIER, GROUPS, QG, type RBody, type RCollider, type SurfaceMaterial } from '../physics/Physics';
import { ctx } from '../game/ctx';
import { clamp, dampTo } from '../core/math';

const _dir = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _n = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export interface MoveIntent {
  x: number; // strafe (-1..1), +right
  z: number; // forward (-1..1), +forward
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  dodge: boolean;
}

/**
 * First-person movement on a dynamic, rotation-locked capsule. Velocity is set
 * directly each physics step (tight, low-latency control) while still letting
 * the capsule shove props and be shoved by hits.
 */
export class PlayerController {
  readonly radius = 0.32;
  readonly standHalf = 0.56;
  readonly crouchHalf = 0.2;
  half = this.standHalf;
  body: RBody;
  collider: RCollider;

  yaw = 0;
  pitch = 0;
  grounded = false;
  wasGrounded = false;
  groundNormal = new THREE.Vector3(0, 1, 0);
  groundMaterial: SurfaceMaterial = 'wood';
  groundBody: RBody | null = null;
  coyote = 0;
  jumpBuffer = 0;
  crouching = false;
  sprinting = false;
  speedScale = 1; // modified by blocking/charging/carrying
  lastFallSpeed = 0;

  // dodge
  dodgeTimer = 0;
  dodgeCooldown = 0;
  dodgeDir = new THREE.Vector3();
  iframes = 0;

  // external knockback velocity (decays)
  knock = new THREE.Vector3();

  // interpolation
  prevCenter = new THREE.Vector3();
  currCenter = new THREE.Vector3();
  renderCenter = new THREE.Vector3();

  intent: MoveIntent = { x: 0, z: 0, sprint: false, crouch: false, jump: false, dodge: false };

  // camera feel
  eyeHeight = 1.62;
  bobPhase = 0;
  bobAmount = 0;
  landDip = 0;
  landDipVel = 0;
  horizSpeed = 0;
  onFootstep: ((material: SurfaceMaterial, intensity: number) => void) | null = null;
  onLand: ((speed: number, material: SurfaceMaterial) => void) | null = null;
  onJump: (() => void) | null = null;
  onDodge: (() => void) | null = null;
  private lastStepSign = 0;
  noclip = false;

  constructor(spawn: THREE.Vector3) {
    const { world } = ctx.physics;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y + this.half + this.radius, spawn.z)
      .lockRotations()
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setLinearDamping(0);
    this.body = world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.capsule(this.half, this.radius)
      .setCollisionGroups(GROUPS.PLAYER)
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0)
      .setDensity(240); // ~85 kg
    this.collider = world.createCollider(colDesc, this.body);
    ctx.physics.register(this.collider, { kind: 'player', material: 'flesh' });
    this.capture();
    this.prevCenter.copy(this.currCenter);
  }

  get feetY(): number {
    return this.renderCenter.y - this.half - this.radius;
  }

  teleport(p: THREE.Vector3, yaw?: number): void {
    this.body.setTranslation({ x: p.x, y: p.y + this.half + this.radius, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.capture();
    this.prevCenter.copy(this.currCenter);
    this.renderCenter.copy(this.currCenter);
    if (yaw !== undefined) this.yaw = yaw;
  }

  addKnockback(v: THREE.Vector3): void {
    this.knock.add(v);
    if (this.knock.length() > 9) this.knock.setLength(9);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    // camera forward (including pitch)
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  flatForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private groundCheck(): void {
    const t = this.body.translation();
    _tmp.set(t.x, t.y, t.z);
    _dir.set(0, -1, 0);
    const r = this.radius * 0.92;
    const hit = ctx.physics.world.castShape(
      { x: _tmp.x, y: _tmp.y, z: _tmp.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: -1, z: 0 },
      ctx.physics.ball(r),
      0,
      this.half + 0.35,
      true,
      undefined,
      QG.MOVE,
      this.collider,
      this.body,
    );
    this.wasGrounded = this.grounded;
    this.grounded = false;
    this.groundBody = null;
    if (hit) {
      const restToi = this.half + this.radius - r; // toi when resting on flat ground
      const n = hit.normal2;
      _n.set(n.x, n.y, n.z);
      if (_n.y < 0) _n.negate();
      const vy = this.body.linvel().y;
      if (hit.time_of_impact <= restToi + 0.09 && _n.y > 0.55 && vy < 3.5) {
        this.grounded = true;
        this.groundNormal.copy(_n);
        const owner = ctx.physics.ownerOf(hit.collider);
        this.groundMaterial = owner?.material ?? 'wood';
        this.groundBody = hit.collider.parent();
      }
      // close to ground while descending a ramp: snap
      if (!this.grounded && this.wasGrounded && hit.time_of_impact <= restToi + 0.3 && _n.y > 0.55 && vy <= 0.5 && this.jumpCooldown <= 0) {
        this.grounded = true;
        this.groundNormal.copy(_n);
        const owner = ctx.physics.ownerOf(hit.collider);
        this.groundMaterial = owner?.material ?? 'wood';
        // pull down onto the ramp
        this.snapDown = hit.time_of_impact - restToi;
      }
    }
  }
  private snapDown = 0;
  private jumpCooldown = 0;

  private setCrouch(c: boolean): void {
    if (c === this.crouching) return;
    if (!c) {
      // check headroom
      const t = this.body.translation();
      const rise = this.standHalf - this.crouchHalf;
      const shape = new RAPIER.Capsule(this.standHalf, this.radius * 0.95);
      const blocked = ctx.physics.world.intersectionWithShape(
        { x: t.x, y: t.y + rise + 0.02, z: t.z },
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
        undefined,
        QG.WORLD,
        this.collider,
        this.body,
      );
      if (blocked) return;
      this.collider.setHalfHeight(this.standHalf);
      this.body.setTranslation({ x: t.x, y: t.y + rise, z: t.z }, true);
      this.half = this.standHalf;
      this.currCenter.y += rise;
      this.prevCenter.y += rise;
    } else {
      const t = this.body.translation();
      const drop = this.standHalf - this.crouchHalf;
      this.collider.setHalfHeight(this.crouchHalf);
      if (this.grounded) {
        this.body.setTranslation({ x: t.x, y: t.y - drop, z: t.z }, true);
        this.currCenter.y -= drop;
        this.prevCenter.y -= drop;
      }
      this.half = this.crouchHalf;
    }
    this.crouching = c;
  }

  fixedUpdate(dt: number): void {
    const it = this.intent;
    if (this.noclip) {
      this.flyMove(dt);
      return;
    }
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.snapDown = 0;
    this.groundCheck();
    const lv = this.body.linvel();
    _vel.set(lv.x, lv.y, lv.z);

    // landing
    if (this.grounded && !this.wasGrounded) {
      const fall = -this.lastFallSpeed;
      if (fall > 2.5) {
        this.landDipVel -= Math.min(fall * 0.09, 1.1);
        this.onLand?.(fall, this.groundMaterial);
      }
    }
    this.lastFallSpeed = _vel.y;

    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (it.jump) this.jumpBuffer = 0.14;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    this.setCrouch(it.crouch);

    // wish direction in world space
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    _wish.set(-sy * it.z + cy * it.x, 0, -cy * it.z - sy * it.x);
    const wishLen = _wish.length();
    if (wishLen > 1) _wish.multiplyScalar(1 / wishLen);

    this.sprinting = it.sprint && it.z > 0.3 && !this.crouching;
    let speed = this.crouching ? 2.3 : this.sprinting ? 7.4 : 4.4;
    if (it.z < -0.1) speed *= 0.82; // backpedal
    speed *= this.speedScale;

    // dodge
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (it.dodge && this.dodgeCooldown <= 0 && this.grounded) {
      if (wishLen > 0.1) this.dodgeDir.copy(_wish).normalize();
      else this.flatForward(this.dodgeDir).negate();
      this.dodgeTimer = 0.2;
      this.dodgeCooldown = 0.65;
      this.iframes = 0.28;
      this.onDodge?.();
    }

    const hv = _tmp.set(_vel.x, 0, _vel.z);
    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      const k = this.dodgeTimer > 0.06 ? 11 : 6;
      hv.copy(this.dodgeDir).multiplyScalar(k);
    } else {
      const target = _dir.copy(_wish).multiplyScalar(speed);
      const accel = this.grounded ? (wishLen > 0.05 ? 55 : 42) : 9;
      // move hv toward target by at most accel*dt
      const dx = target.x - hv.x;
      const dz = target.z - hv.z;
      const dl = Math.sqrt(dx * dx + dz * dz);
      const maxD = accel * dt;
      if (dl <= maxD) hv.set(target.x, 0, target.z);
      else hv.set(hv.x + (dx / dl) * maxD, 0, hv.z + (dz / dl) * maxD);
    }

    // knockback decays
    const kd = this.grounded ? 9 : 2.5;
    this.knock.multiplyScalar(Math.max(0, 1 - kd * dt));
    if (this.knock.lengthSq() < 0.0004) this.knock.set(0, 0, 0);

    let vy = _vel.y;
    if (this.grounded) {
      // slope following: project horizontal velocity onto ground plane
      const n = this.groundNormal;
      const vn = hv.x * n.x + hv.z * n.z; // since hv.y = 0
      vy = -vn / Math.max(n.y, 0.3);
      if (this.snapDown > 0) vy -= this.snapDown / dt * 0.5;
      vy -= 0.6; // stick to ground
    }

    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && this.jumpCooldown <= 0 && !this.crouching) {
      vy = 5.6;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpCooldown = 0.25;
      this.onJump?.();
    }

    this.body.setLinvel({ x: hv.x + this.knock.x, y: vy + this.knock.y, z: hv.z + this.knock.z }, true);
    this.knock.y = 0;
    this.horizSpeed = Math.hypot(hv.x, hv.z);
  }

  private flyMove(dt: number): void {
    const f = this.forward(_dir);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const sp = this.intent.sprint ? 14 : 6;
    _wish.copy(f).multiplyScalar(this.intent.z).add(_tmp.set(cy, 0, -sy).multiplyScalar(this.intent.x));
    if (this.intent.jump) _wish.y += 1;
    if (this.intent.crouch) _wish.y -= 1;
    _wish.multiplyScalar(sp);
    this.body.setLinvel({ x: _wish.x, y: _wish.y, z: _wish.z }, true);
    this.body.setGravityScale(0, true);
  }

  setNoclip(on: boolean): void {
    this.noclip = on;
    this.collider.setCollisionGroups(on ? 0 : GROUPS.PLAYER);
    this.body.setGravityScale(on ? 0 : 1, true);
  }

  /** after physics step */
  capture(): void {
    this.prevCenter.copy(this.currCenter);
    const t = this.body.translation();
    this.currCenter.set(t.x, t.y, t.z);
  }

  /** per render frame */
  updateVisual(dt: number, alpha: number): void {
    this.renderCenter.lerpVectors(this.prevCenter, this.currCenter, alpha);
    const targetEye = this.crouching ? 0.98 : 1.62;
    this.eyeHeight = dampTo(this.eyeHeight, targetEye, 14, dt);

    // landing dip spring
    const k = 90;
    const c = 13;
    this.landDipVel += (-k * this.landDip - c * this.landDipVel) * dt;
    this.landDip += this.landDipVel * dt;
    this.landDip = clamp(this.landDip, -0.35, 0.2);

    // head bob
    const moving = this.grounded && this.horizSpeed > 0.6 && this.dodgeTimer <= 0;
    this.bobAmount = dampTo(this.bobAmount, moving ? clamp(this.horizSpeed / 7.4, 0.25, 1) : 0, 8, dt);
    if (moving) {
      const freq = this.sprinting ? 1.45 : this.crouching ? 0.9 : 1.15;
      this.bobPhase += dt * freq * Math.PI * 2 * clamp(this.horizSpeed / 4.4, 0.6, 1.5) * 0.5;
      const s = Math.sin(this.bobPhase * 2);
      const sign = s >= 0 ? 1 : -1;
      if (sign !== this.lastStepSign && sign < 0) {
        this.onFootstep?.(this.groundMaterial, clamp(this.horizSpeed / 7.4, 0.3, 1));
      }
      this.lastStepSign = sign;
    }
  }

  /** camera offsets from head bob */
  bobOffset(out: THREE.Vector3): { roll: number } {
    const a = this.bobAmount;
    const s2 = Math.sin(this.bobPhase * 2);
    const s1 = Math.cos(this.bobPhase);
    out.set(s1 * 0.035 * a, -Math.abs(s2) * 0.055 * a + this.landDip, 0);
    return { roll: s1 * 0.012 * a };
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.renderCenter.x, this.feetY + this.eyeHeight, this.renderCenter.z);
  }

  /** Exact (non-interpolated) eye position for gameplay queries. */
  eyePositionPhysics(out: THREE.Vector3): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x, t.y - this.half - this.radius + this.eyeHeight, t.z);
  }
}
