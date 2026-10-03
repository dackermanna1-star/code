import * as THREE from 'three';
import { G } from '../core/G';
import { CG, GROUPS, RAPIER, groups } from '../physics/Physics';
import { clamp, damp, lerp, Spring, vnoise2 } from '../core/math';
import { ARENA } from '../world/config';

const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

export class Player {
  readonly pos = new THREE.Vector3(ARENA.playerStart.x, 0, ARENA.playerStart.z);
  readonly vel = new THREE.Vector3();
  yaw = Math.PI; // facing +Z (down the road)
  pitch = 0;
  /** Temporary aim offsets from recoil (radians, added to pitch/yaw). */
  recoilPitch = 0;
  recoilYaw = 0;
  private recoilRecover = 8;
  hp = 100;
  maxHp = 100;
  alive = true;
  onGround = true;
  sprinting = false;
  crouching = false;
  moving = false;
  /** 0..1 multiplier from carried weapon weight. */
  weightMul = 1;
  /** Additional movement multiplier (ADS etc). */
  moveMul = 1;
  private body!: RAPIER.RigidBody;
  private collider!: RAPIER.Collider;
  private kcc!: RAPIER.KinematicCharacterController;
  private eyeHeight = 1.62;
  private bobPhase = 0;
  private bobAmt = 0;
  private landDip = new Spring(160, 16);
  private trauma = 0;
  private shakeT = 0;
  private hurtTimer = 0;
  private deathT = 0;
  fov = 78;
  fovMul = 1;
  private curFov = 78;
  readonly eye = new THREE.Vector3();
  readonly aimDir = new THREE.Vector3(0, 0, 1);
  lastDamageDir = 0;
  damageFlash = 0;
  private airTime = 0;
  footstepTimer = 0;
  sensitivity = 0.0022;
  invertY = false;
  onFootstep: ((sprint: boolean) => void) | null = null;
  onLand: ((speed: number) => void) | null = null;
  onHurt: ((amount: number) => void) | null = null;
  onDeath: (() => void) | null = null;
  /** Invulnerable (H). Backed by the saved settings so it survives reloads. */
  get godMode() {
    return !!G.progress?.data?.settings?.god;
  }
  set godMode(v: boolean) {
    const s = G.progress?.data?.settings;
    if (s) s.god = v;
  }

  spawn() {
    const w = G.physics.world;
    this.pos.set(ARENA.playerStart.x, 0, ARENA.playerStart.z);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = -0.045;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.deathT = 0;
    this.trauma = 0;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y + 0.9, this.pos.z));
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(0.55, 0.33).setCollisionGroups(GROUPS.player).setFriction(0),
      this.body,
    );
    this.kcc = w.createCharacterController(0.03);
    this.kcc.enableAutostep(0.5, 0.2, true);
    this.kcc.enableSnapToGround(0.4);
    this.kcc.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(90);
    this.kcc.setSlideEnabled(true);
  }

  /** Physics objects were destroyed by a world reset. */
  despawn() {
    const w = G.physics.world;
    try {
      if (this.kcc) w.removeCharacterController(this.kcc);
      if (this.body) w.removeRigidBody(this.body);
    } catch {
      /* world already reset */
    }
  }

  addTrauma(t: number) {
    this.trauma = clamp(this.trauma + t, 0, 1);
  }

  addRecoil(pitch: number, yaw: number, recover = 8) {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
    this.recoilRecover = recover;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  damage(amount: number, from?: THREE.Vector3) {
    if (!this.alive || this.godMode) return;
    // Infinity: the attack never arrives
    if (G.gojo?.active) {
      G.gojo.blocked(from);
      return;
    }
    this.hp -= amount;
    this.damageFlash = Math.min(1, this.damageFlash + 0.35 + amount / 60);
    this.addTrauma(Math.min(0.45, 0.12 + amount / 80));
    this.hurtTimer = 0.25;
    if (from) {
      const dx = from.x - this.pos.x;
      const dz = from.z - this.pos.z;
      // angle relative to view: 0 = in front
      const a = Math.atan2(dx, dz);
      this.lastDamageDir = a - (this.yaw + Math.PI);
      // push the view slightly away from the hit
      this.recoilYaw += Math.sin(this.lastDamageDir) * -0.02;
      this.recoilPitch += 0.015;
    }
    this.onHurt?.(amount);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath?.();
    }
  }

  get forward() {
    return _fwd.set(Math.sin(this.yaw) * -1, 0, Math.cos(this.yaw) * -1);
  }

  update(dt: number) {
    const input = G.input;
    // look
    if (this.alive) {
      const [mx, my] = input.consumeMouse();
      const sens = this.sensitivity * (this.fovMul < 0.9 ? Math.max(0.25, this.fovMul) : 1);
      this.yaw -= mx * sens;
      this.pitch -= my * sens * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.5, 1.5);
    }
    // recoil recovery
    const rr = Math.exp(-this.recoilRecover * dt);
    this.recoilPitch *= rr;
    this.recoilYaw *= rr;

    // movement
    let ix = 0;
    let iz = 0;
    if (this.alive) {
      if (input.down('KeyW')) iz += 1;
      if (input.down('KeyS')) iz -= 1;
      if (input.down('KeyD')) ix += 1;
      if (input.down('KeyA')) ix -= 1;
    }
    const f = _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = _right.crossVectors(f, UP).normalize();
    _wish.set(0, 0, 0).addScaledVector(f, iz).addScaledVector(r, ix);
    if (_wish.lengthSq() > 1) _wish.normalize();
    this.moving = _wish.lengthSq() > 0.01;
    this.crouching = this.alive && (input.down('ControlLeft') || input.down('KeyC'));
    this.sprinting = this.alive && input.down('ShiftLeft') && iz > 0 && !this.crouching;
    let speed = this.sprinting ? 7.2 : this.crouching ? 2.6 : 4.7;
    speed *= this.weightMul * this.moveMul;
    const accel = this.onGround ? 55 : 10;
    const tvx = _wish.x * speed;
    const tvz = _wish.z * speed;
    this.vel.x = damp(this.vel.x, tvx, accel / Math.max(speed, 1), dt);
    this.vel.z = damp(this.vel.z, tvz, accel / Math.max(speed, 1), dt);
    if (this.onGround) {
      if (this.vel.y < 0) this.vel.y = -1;
      if (this.alive && input.pressed('Space')) {
        this.vel.y = 5.6;
        this.onGround = false;
      }
    } else {
      this.vel.y -= 19 * dt;
    }

    // KCC move
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    const filter = groups(CG.PLAYER, CG.WORLD | CG.BOUNDS | CG.STRUCT | CG.ZOMBIE | CG.CORPSE);
    this.kcc.computeColliderMovement(this.collider, desired, undefined, filter);
    const mv = this.kcc.computedMovement();
    const wasGround = this.onGround;
    this.onGround = this.kcc.computedGrounded();
    const t = this.body.translation();
    const nx = t.x + mv.x;
    const ny = t.y + mv.y;
    const nz = t.z + mv.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.pos.set(nx, ny - 0.9, nz);
    if (dt > 0) {
      // derive actual horizontal velocity from the resolved motion (so walls stop us)
      const ax = mv.x / dt;
      const az = mv.z / dt;
      this.vel.x = ax;
      this.vel.z = az;
      if (mv.y > desired.y + 1e-4 && this.vel.y < 0 && !this.onGround) this.vel.y = 0;
    }
    if (this.onGround && !wasGround) {
      const impact = Math.max(0, -this.vel.y);
      if (this.airTime > 0.25) {
        this.landDip.kick(-Math.min(3.2, impact * 0.5));
        this.onLand?.(impact);
      }
      this.vel.y = -1;
    }
    if (!this.onGround && this.vel.y < 0 && wasGround && desired.y < 0 && Math.abs(mv.y - desired.y) > 1e-3) {
      // stepping down edges
    }
    this.airTime = this.onGround ? 0 : this.airTime + dt;

    // footsteps + bob
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      const rate = this.sprinting ? 11.5 : this.crouching ? 6 : 8.8;
      const prev = this.bobPhase;
      this.bobPhase += dt * rate * Math.min(1, hs / 4);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI)) this.onFootstep?.(this.sprinting);
      this.bobAmt = damp(this.bobAmt, Math.min(1, hs / 5), 10, dt);
    } else {
      this.bobAmt = damp(this.bobAmt, 0, 8, dt);
    }
    this.landDip.update(dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6);
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.shakeT += dt;
    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    const cam = G.camera;
    const eyeH = this.alive ? lerp(1.62, 1.12, this.crouching ? 1 : 0) : 0.3;
    this.eyeHeight = damp(this.eyeHeight, eyeH, this.alive ? 12 : 3, dt);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 * this.bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.03 * this.bobAmt;
    const s = this.trauma * this.trauma;
    const t = this.shakeT * 22;
    const shYaw = (vnoise2(t, 1.3) - 0.5) * 0.09 * s;
    const shPitch = (vnoise2(t, 7.7) - 0.5) * 0.09 * s;
    const shRoll = (vnoise2(t, 13.1) - 0.5) * 0.12 * s;
    const f = _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = _right.crossVectors(f, UP).normalize();
    this.eye.set(this.pos.x, this.pos.y + this.eyeHeight + bobY + this.landDip.x * 0.06, this.pos.z).addScaledVector(r, bobX);
    if (!this.alive) {
      this.deathT += dt;
    }
    const roll = shRoll + (this.alive ? 0 : Math.min(1, this.deathT * 1.5) * 1.2);
    cam.position.copy(this.eye);
    const pitch = this.pitch + this.recoilPitch + shPitch;
    const yaw = this.yaw + this.recoilYaw + shYaw;
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
    this.curFov = damp(this.curFov, this.fov * this.fovMul * (this.sprinting && this.moving ? 1.06 : 1), 14, dt);
    if (Math.abs(cam.fov - this.curFov) > 0.01) {
      cam.fov = this.curFov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.aimDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
  }

  /** Direction the weapon fires (camera forward without shake roll). */
  getAim(out: THREE.Vector3) {
    return out.copy(this.aimDir);
  }
}
