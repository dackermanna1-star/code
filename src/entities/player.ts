// PlayerController: first-person movement translated from Noita's 2D controller.
// Walk, small jump, levitation with a ~3 s meter that refills quickly on the ground, swimming,
// crouching for low tunnels, and a kick. No fall damage (as in Noita).
import { GRAVITY } from '../config';
import { Input } from '../core/input';
import { VoxelWorld } from '../world/world';
import { Creature } from './creature';
import { moveBody, boxCollides } from './physics';

export const PLAYER_HW = 1.35;
export const PLAYER_H = 8.4;
export const PLAYER_CROUCH_H = 5.4;
export const EYE_OFFSET = 1.0; // eye is this far below the top of the body

export interface MoveTuning {
  walk: number;
  accelGround: number;
  accelAir: number;
  friction: number;
  jumpV: number;
  levUpMax: number;
  levAccel: number;
  levTime: number;
  levRechargeGround: number;
  levRechargeAir: number;
  maxFall: number;
}

export const DEFAULT_TUNING: MoveTuning = {
  walk: 19,
  accelGround: 140,
  accelAir: 60,
  friction: 11,
  jumpV: 21,
  levUpMax: 17,
  levAccel: 95,
  levTime: 3.0, // Noita fly_time_max
  levRechargeGround: 6, // fills an empty meter in 0.5 s
  levRechargeAir: 0,
  maxFall: 75,
};

export class Player extends Creature {
  readonly isPlayer = true;
  tuning: MoveTuning = { ...DEFAULT_TUNING };
  levitation = DEFAULT_TUNING.levTime;
  levitationMax = DEFAULT_TUNING.levTime;
  crouching = false;
  /** smoothed eye height for step-ups */
  eyeY = 0;
  bob = 0;
  jumpHeldTime = 0;
  landedImpact = 0;
  speedMult = 1;
  levSpeedMult = 1;
  kickCooldown = 0;
  footstepTimer = 0;
  wasGround = true;
  gold = 0;
  noclip = false;
  breath = 1; // 0..1, drowning when 0
  levitating = false;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, PLAYER_HW, PLAYER_H, 100, 'player', 2);
    this.eyeY = y + PLAYER_H - EYE_OFFSET;
    this.mult.explosion = 0.35; // Noita: the player takes 0.35x explosion damage
    this.mult.holy = 1.5;
  }

  eyeHeight(): number {
    return this.body.h - EYE_OFFSET;
  }

  /** Look direction unit vector. */
  lookDir(out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const cp = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * cp;
    out.y = Math.sin(this.pitch);
    out.z = -Math.cos(this.yaw) * cp;
    return out;
  }

  look(input: Input): void {
    const s = input.sensitivity;
    this.yaw -= input.mouseDX * s;
    this.pitch -= input.mouseDY * s * (input.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.01;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }

  /** Fixed-step movement update. */
  update(world: VoxelWorld, input: Input, dt: number, events: { footstep(): void; jump(): void; land(v: number): void }): void {
    const b = this.body;
    const t = this.tuning;
    const frozen = this.status.frozen > 0 || this.status.stunned > 0;
    if (this.noclip) {
      this.noclipMove(input, dt);
      return;
    }
    // crouch
    const wantCrouch = input.held('crouch');
    if (wantCrouch && !this.crouching) {
      this.crouching = true;
      b.h = PLAYER_CROUCH_H;
    } else if (!wantCrouch && this.crouching) {
      if (!boxCollides(world, b.x - b.hw, b.y, b.z - b.hw, b.x + b.hw, b.y + PLAYER_H, b.z + b.hw)) {
        this.crouching = false;
        b.h = PLAYER_H;
      }
    }
    // wish direction
    let fx = 0, fz = 0;
    if (!frozen) {
      if (input.held('forward')) fz -= 1;
      if (input.held('back')) fz += 1;
      if (input.held('left')) fx -= 1;
      if (input.held('right')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = fx * cy + fz * sy;
    const wz = -fx * sy + fz * cy;
    const slimy = 1 - Math.min(0.4, this.status.slimy * 0.4);
    let speed = t.walk * this.speedMult * slimy * (this.crouching ? 0.5 : 1) * (this.status.onFire > 0 ? 1.15 : 1);
    const inLiquid = b.liquid > 0.35;
    if (inLiquid) speed *= 0.6;
    const accel = b.onGround ? t.accelGround : t.accelAir;
    const tvx = wx * speed, tvz = wz * speed;
    b.vx = approach(b.vx, tvx, accel * dt);
    b.vz = approach(b.vz, tvz, accel * dt);
    if (len === 0 && b.onGround) {
      // oiled feet have no traction
      const fr = this.status.oily > 0.2 ? 1.5 : t.friction;
      const k = Math.exp(-fr * dt);
      b.vx *= k;
      b.vz *= k;
    }
    // jump / levitate
    const jumpHeld = input.held('jump') && !frozen;
    if (jumpHeld) this.jumpHeldTime += dt;
    else this.jumpHeldTime = 0;
    this.levitating = false;
    if (input.hit('jump') && b.onGround && !frozen) {
      b.vy = t.jumpV;
      b.onGround = false;
      events.jump();
    } else if (jumpHeld && !b.onGround && this.levitation > 0 && this.status.levitationDisabled <= 0 && (this.jumpHeldTime > 0.12 || b.vy < 2)) {
      b.vy = approach(b.vy, t.levUpMax * this.levSpeedMult, t.levAccel * dt + GRAVITY * dt);
      this.levitation = Math.max(0, this.levitation - dt);
      this.levitating = true;
    }
    if (b.onGround && !this.levitating) this.levitation = Math.min(this.levitationMax, this.levitation + t.levRechargeGround * dt * (this.levitationMax / DEFAULT_TUNING.levTime > 1 ? 0.5 : 1));
    // gravity, buoyancy, drag
    if (inLiquid) {
      b.vy -= GRAVITY * 0.35 * dt;
      if (jumpHeld) b.vy = approach(b.vy, 11, 70 * dt);
      const drag = Math.exp(-2.5 * dt);
      b.vy *= drag;
      b.vx *= Math.exp(-1.2 * dt);
      b.vz *= Math.exp(-1.2 * dt);
    } else if (!this.levitating) {
      b.vy -= GRAVITY * dt;
    }
    if (b.vy < -t.maxFall) b.vy = -t.maxFall;
    const vyBefore = b.vy;
    moveBody(world, b, dt);
    if (b.onGround && !this.wasGround && vyBefore < -25) {
      this.landedImpact = Math.min(1, -vyBefore / 70);
      events.land(-vyBefore);
    }
    this.wasGround = b.onGround;
    // footsteps & view bob
    const hs = Math.hypot(b.vx, b.vz);
    if (b.onGround && hs > 2) {
      this.bob += hs * dt * 0.55;
      this.footstepTimer -= dt * hs;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 7;
        events.footstep();
      }
    }
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    // smooth eye height (step-ups)
    const targetEye = b.y + this.eyeHeight();
    if (targetEye > this.eyeY) this.eyeY = Math.min(targetEye, this.eyeY + Math.max(12 * dt, (targetEye - this.eyeY) * 0.35));
    else this.eyeY = targetEye;
    this.landedImpact *= Math.exp(-6 * dt);
  }

  private noclipMove(input: Input, dt: number): void {
    const b = this.body;
    const d = { x: 0, y: 0, z: 0 };
    this.lookDir(d);
    let f = 0, r = 0, u = 0;
    if (input.held('forward')) f += 1;
    if (input.held('back')) f -= 1;
    if (input.held('right')) r += 1;
    if (input.held('left')) r -= 1;
    if (input.held('jump')) u += 1;
    if (input.held('crouch')) u -= 1;
    const sp = 60;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    b.x += (d.x * f + rx * r) * sp * dt;
    b.y += (d.y * f + u) * sp * dt;
    b.z += (d.z * f + rz * r) * sp * dt;
    b.vx = b.vy = b.vz = 0;
    this.eyeY = b.y + this.eyeHeight();
  }
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}
