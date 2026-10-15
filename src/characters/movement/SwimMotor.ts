// Swimming: surface swim, dive (C/Ctrl) & surface (Space), underwater swimming along the view pitch,
// breath handled in Character.updateBreath. Weapons are holstered while swimming.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { clamp } from '../../core/math';
import type { Character } from '../Character';
import { SPEED, SWIM, SWIM_ACCEL, STANCE_HEIGHT, EYE_HEIGHT } from '../constants';
import { approachVelocity2, computeTargetSpeed } from './speed';
import { emitFootsteps } from './footsteps';
import { groundHeightAt } from './probes';

const _delta = new THREE.Vector3();
const _v2: [number, number] = [0, 0];

export function enterSwim(c: Character, surface: number): void {
  c.mode = 'swim';
  c.moveState = 'swim';
  c.waterSurface = surface;
  c.lean = 0;
  c.isSprinting = false;
  c.isGrounded = false;
  if (c.stance !== 'stand') {
    c.stance = 'stand';
    c.stanceProgress = 1;
    c.stanceHeight = STANCE_HEIGHT.stand;
  }
  c.body.setShape('stand', c.position);
  // Water absorbs the fall.
  c.velocity.y *= 0.2;
  ctx.events.emit('character:swim', { character: c, position: c.position.clone() });
}

export function updateSwim(c: Character, dt: number): void {
  const intent = c.intent;
  const surface = ctx.world.getWaterHeight(c.position.x, c.position.z);
  if (surface === null) {
    leaveSwim(c);
    return;
  }
  c.waterSurface = surface;
  c.bodyYaw = c.yaw;
  const floatY = surface - SWIM.floatDepth;
  const submerged = c.position.y < floatY - 0.25;

  // Horizontal (and pitch-driven vertical when submerged).
  const knocked = c.lifeState === 'knocked';
  const sp = computeTargetSpeed({
    stance: 'stand',
    moveX: intent.moveX,
    moveY: intent.moveY,
    sprint: intent.sprint,
    walk: false,
    aiming: false,
    firing: false,
    weaponClass: null,
    boost: c.boost,
    speedCap: knocked ? SPEED.knocked : Infinity,
    sprintBlocked: knocked,
    swimming: true,
  });
  c.gait = sp.gait;
  c.isSprinting = sp.sprinting;
  c.targetSpeed = sp.speed;
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
  const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  let tx = 0, tz = 0, ty = 0;
  if (sp.speed > 0) {
    let mx = intent.moveX, my = intent.moveY;
    const l = Math.hypot(mx, my) || 1;
    mx /= l;
    my /= l;
    // Underwater, forward motion follows the view pitch.
    const pitchK = submerged || intent.dive ? Math.cos(c.pitch) : 1;
    tx = (fx * my * pitchK + rx * mx) * sp.speed;
    tz = (fz * my * pitchK + rz * mx) * sp.speed;
    if (submerged) ty = Math.sin(c.pitch) * my * sp.speed;
  }
  approachVelocity2(c.velocity.x, c.velocity.z, tx, tz, SWIM_ACCEL, SWIM_ACCEL, dt, _v2);
  c.velocity.x = _v2[0];
  c.velocity.z = _v2[1];

  // Vertical: dive / ascend / buoyancy.
  if (intent.dive && !knocked) ty = Math.min(ty, -SPEED.swimDiveVertical);
  else if (intent.ascend) ty = Math.max(ty, SPEED.swimDiveVertical);
  else if (!submerged || ty === 0) {
    // Buoyancy: rise to (and hold) the floating depth.
    const err = floatY - c.position.y;
    ty = clamp(err * 3, -1.5, submerged ? 1.2 : 2.0);
  }
  if (c.position.y > floatY && ty > 0) ty = (floatY - c.position.y) * 4;
  c.velocity.y += clamp(ty - c.velocity.y, -SWIM_ACCEL * dt * 1.5, SWIM_ACCEL * dt * 1.5);

  _delta.set(c.velocity.x * dt, c.velocity.y * dt, c.velocity.z * dt);
  c.body.move(c.position, _delta, { autostep: true, snap: false, withCharacters: true });

  c.underwater = c.position.y + EYE_HEIGHT.stand < surface - SWIM.eyeUnderwater;
  c.moveState = 'swim';

  // Leave the water when the ground is shallow enough to stand.
  const ground = groundHeightAt(ctx.physics, c.body.collider, c.position.x, c.position.y + 1.0, c.position.z, 3.0);
  if (ground !== null && surface - ground < SWIM.exitDepth && c.position.y - ground < 0.35) {
    c.position.y = Math.max(c.position.y, ground);
    leaveSwim(c);
    return;
  }
  emitFootsteps(c, Math.hypot(c.velocity.x, c.velocity.z), dt);
}

function leaveSwim(c: Character): void {
  c.mode = 'ground';
  c.underwater = false;
  c.moveState = 'idle';
  c.isGrounded = false;
  c.velocity.y = Math.min(c.velocity.y, 0);
  c.body.syncTo(c.position);
}
