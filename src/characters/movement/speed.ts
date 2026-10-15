// Pure movement-speed model (DESIGN §3). No three.js / physics dependencies so it can be unit-tested.
import type { Stance, WeaponClass } from '../../core/types';
import { FALL_DAMAGE_MIN_SPEED, FALL_DAMAGE_PER_MPS, SPEED, SPEED_MULT, VEHICLE_EXIT_DMG_PER_MPS, VEHICLE_EXIT_SAFE_SPEED } from '../constants';

export type Gait = 'idle' | 'walk' | 'run' | 'sprint';

export interface SpeedInput {
  stance: Stance;
  /** Local move axes (-1..1): x strafe right, y forward. */
  moveX: number;
  moveY: number;
  sprint: boolean;
  walk: boolean;
  /** Over-the-shoulder aim or ADS. */
  aiming: boolean;
  firing: boolean;
  /** Class of the weapon in hands, null when holstered/unarmed. */
  weaponClass: WeaponClass | null;
  boost: number;
  /** Cap from a running action (healing), Infinity if none. */
  speedCap: number;
  /** True if sprinting is blocked (ADS, healing, reloading, lean…). */
  sprintBlocked: boolean;
  swimming?: boolean;
  knocked?: boolean;
}

export interface SpeedOutput {
  /** Target ground speed in m/s (0 when no input). */
  speed: number;
  gait: Gait;
  /** True if the character is actually sprinting. */
  sprinting: boolean;
}

/** Sprint is only possible moving forward (up to ~50° off forward, like PUBG's diagonal sprint). */
export function canSprintDirection(moveX: number, moveY: number): boolean {
  const len = Math.hypot(moveX, moveY);
  if (len < 0.2) return false;
  return moveY / len > 0.64;
}

/**
 * Direction multiplier: forward 1, strafe 0.85, back 0.65, blended by angle (cos² / sin² weighting).
 */
export function directionFactor(moveX: number, moveY: number): number {
  const len = Math.hypot(moveX, moveY);
  if (len < 1e-4) return 1;
  const c = moveY / len;
  const s = moveX / len;
  const fwdOrBack = c >= 0 ? 1 : SPEED_MULT.back;
  return c * c * fwdOrBack + s * s * SPEED_MULT.strafe;
}

export function boostFactor(boost: number): number {
  if (boost >= 90) return SPEED_MULT.boost90;
  if (boost >= 60) return SPEED_MULT.boost60;
  return 1;
}

export function weaponFactor(cls: WeaponClass | null): number {
  if (!cls) return 1;
  if (cls === 'lmg') return SPEED_MULT.lmgHeld;
  return SPEED_MULT.weaponHeld;
}

export function computeTargetSpeed(i: SpeedInput): SpeedOutput {
  const mag = Math.min(1, Math.hypot(i.moveX, i.moveY));
  if (mag < 0.05) return { speed: 0, gait: 'idle', sprinting: false };

  const wantSprint = i.sprint && !i.sprintBlocked && !i.aiming && canSprintDirection(i.moveX, i.moveY);
  let base: number;
  let gait: Gait;
  let sprinting = false;
  if (i.knocked) {
    base = SPEED.knocked;
    gait = 'walk';
  } else if (i.swimming) {
    sprinting = wantSprint;
    base = sprinting ? SPEED.swimFast : SPEED.swim;
    gait = sprinting ? 'sprint' : 'run';
  } else if (i.stance === 'prone') {
    base = i.walk ? SPEED.proneWalk : SPEED.prone;
    gait = 'walk';
  } else if (i.stance === 'crouch') {
    if (i.walk) {
      base = SPEED.crouchWalk;
      gait = 'walk';
    } else if (wantSprint) {
      base = SPEED.crouchSprint;
      gait = 'sprint';
      sprinting = true;
    } else {
      base = SPEED.crouchRun;
      gait = 'run';
    }
  } else if (i.walk) {
    base = SPEED.walk;
    gait = 'walk';
  } else if (wantSprint) {
    base = SPEED.sprint;
    gait = 'sprint';
    sprinting = true;
  } else {
    base = SPEED.run;
    gait = 'run';
  }

  let speed = base * mag;
  // Sprint is a forward gait; the other gaits get the direction penalties.
  if (!sprinting) speed *= directionFactor(i.moveX, i.moveY);
  if (!i.swimming && !i.knocked) {
    if (i.aiming) speed *= SPEED_MULT.aim;
    if (i.firing) speed *= SPEED_MULT.firing;
    speed *= weaponFactor(i.weaponClass);
  }
  speed *= boostFactor(i.boost);
  if (speed > i.speedCap) {
    speed = i.speedCap;
    if (gait === 'sprint' || gait === 'run') gait = speed > SPEED.walk + 0.2 ? 'run' : 'walk';
    sprinting = false;
  }
  return { speed, gait, sprinting };
}

/** Fall damage for a landing impact speed (m/s), DESIGN §3: (v - 9) * 10. */
export function fallDamage(impactSpeed: number): number {
  if (impactSpeed <= FALL_DAMAGE_MIN_SPEED) return 0;
  return (impactSpeed - FALL_DAMAGE_MIN_SPEED) * FALL_DAMAGE_PER_MPS;
}

/** Impact speed after free-falling from a height (m) under gravity g. */
export function impactSpeedFromHeight(h: number, g = 9.81): number {
  return Math.sqrt(Math.max(0, 2 * g * h));
}

/** Damage when bailing out of a moving vehicle at `speed` m/s. */
export function vehicleExitDamage(speed: number): number {
  if (speed <= VEHICLE_EXIT_SAFE_SPEED) return 0;
  return (speed - VEHICLE_EXIT_SAFE_SPEED) * VEHICLE_EXIT_DMG_PER_MPS;
}

/**
 * Move a 2D velocity toward a target with separate accel/decel limits (m/s²).
 * Uses decel when the target is slower than the current speed or points away.
 * Mutates and returns `out` = [vx, vz].
 */
export function approachVelocity2(
  vx: number,
  vz: number,
  tx: number,
  tz: number,
  accel: number,
  decel: number,
  dt: number,
  out: [number, number],
): [number, number] {
  const dx = tx - vx;
  const dz = tz - vz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) {
    out[0] = tx;
    out[1] = tz;
    return out;
  }
  const cur = Math.hypot(vx, vz);
  const tgt = Math.hypot(tx, tz);
  const dot = vx * tx + vz * tz;
  const rate = tgt + 1e-3 < cur || dot < 0 ? decel : accel;
  const step = rate * dt;
  if (step >= dist) {
    out[0] = tx;
    out[1] = tz;
  } else {
    out[0] = vx + (dx / dist) * step;
    out[1] = vz + (dz / dist) * step;
  }
  return out;
}
