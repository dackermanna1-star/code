// Ground locomotion: stances, acceleration, jump, lean, prone body, landing & fall damage, footsteps.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import type { Stance } from '../../core/types';
import { clamp, DEG, angleDiff, wrapAngle } from '../../core/math';
import type { Character } from '../Character';
import {
  ACCEL,
  AIR_ACCEL,
  COYOTE_TIME,
  DECEL,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_VELOCITY,
  LEAN_OFFSET,
  LEAN_TIME,
  PRONE_LENGTH,
  PRONE_MAX_SLOPE_DEG,
  SWIM,
} from '../constants';
import { approachVelocity2, computeTargetSpeed, fallDamage } from './speed';
import { analyseObstacle, groundHit, leanClearance } from './probes';
import { startTraversal } from './Traversal';
import { emitFootsteps } from './footsteps';
import { applyCharacterDamage } from '../damage';
import { enterSwim } from './SwimMotor';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _neck = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _v2: [number, number] = [0, 0];
const PRONE_TURN_RATE = 100 * DEG;

/** Ground slope (deg) from the last ground normal. */
function slopeDeg(c: Character): number {
  return Math.acos(clamp(c.groundNormal.y, -1, 1)) / DEG;
}

/** Sample ground pitch along the body (prone), + = head end higher. */
export function samplePronePitch(c: Character, yaw: number): number {
  const half = PRONE_LENGTH / 2 - 0.15;
  const fx = -Math.sin(yaw) * half;
  const fz = -Math.cos(yaw) * half;
  const p = c.position;
  // Start low (prone bodies fit under 0.6 m ceilings) and ignore hits on the underside of overhangs.
  const top = p.y + 0.55;
  const a = groundHit(ctx.physics, c.body.collider, p.x + fx, top, p.z + fz, 1.6);
  const b = groundHit(ctx.physics, c.body.collider, p.x - fx, top, p.z - fz, 1.6);
  const ha = a && a.normal.y > 0.5 ? a.point.y : p.y;
  const hb = b && b.normal.y > 0.5 ? b.point.y : p.y;
  return clamp(Math.atan2(ha - hb, half * 2), -40 * DEG, 40 * DEG);
}

/** Try to change stance with collision checks. Returns true if the transition started. */
export function requestStance(c: Character, to: Stance): boolean {
  if (to === c.stance) return true;
  if (c.mode !== 'ground' || c.lifeState !== 'alive') return false;
  const body = c.body;
  if (to === 'stand') {
    if (!body.fits('stand', c.position)) return false;
    body.setShape('stand', c.position);
  } else if (to === 'crouch') {
    if (c.stance === 'prone' && !body.fits('crouch', c.position)) return false;
    body.setShape('crouch', c.position);
  } else {
    if (!c.isGrounded) return false;
    if (slopeDeg(c) > PRONE_MAX_SLOPE_DEG) return false;
    // Water too deep to lie down in.
    const w = ctx.world.getWaterHeight(c.position.x, c.position.z);
    if (w !== null && w - c.position.y > 0.45) return false;
    const pitch = samplePronePitch(c, c.yaw);
    if (!body.proneBodyFits(c.position, c.yaw, pitch)) return false;
    c.pronePitch = pitch;
    c.bodyYaw = c.yaw;
    body.setShape('prone', c.position, c.yaw);
  }
  c.beginStance(to);
  return true;
}

export function updateGround(c: Character, dt: number): void {
  const intent = c.intent;
  const knocked = c.lifeState === 'knocked';
  const now = ctx.engine.simTime;

  // ── stance requests ──
  if (!knocked) {
    if (intent.stance && intent.stance !== c.stance) requestStance(c, intent.stance);
    // Prone on a slope that became too steep → crouch.
    if (c.stance === 'prone' && c.isGrounded && slopeDeg(c) > PRONE_MAX_SLOPE_DEG + 8) requestStance(c, 'crouch');
  }

  // ── jump buffer ──
  if (intent.jump) c.jumpBuffer = JUMP_BUFFER;
  else c.jumpBuffer = Math.max(0, c.jumpBuffer - dt);

  // ── body yaw ──
  if (c.stance === 'prone' && !knocked) {
    const want = c.yaw;
    const d = angleDiff(c.bodyYaw, want);
    if (Math.abs(d) > 0.01) {
      const step = clamp(d, -PRONE_TURN_RATE * dt, PRONE_TURN_RATE * dt);
      const ny = wrapAngle(c.bodyYaw + step);
      const pitch = samplePronePitch(c, ny);
      if (c.body.proneBodyFits(c.position, ny, pitch)) {
        c.bodyYaw = ny;
        c.pronePitch = pitch;
        c.body.setBodyYaw(ny);
      }
    }
  } else {
    c.bodyYaw = c.yaw;
  }

  // ── lean ──
  updateLean(c, dt);

  // ── horizontal target velocity ──
  const moveYaw = c.yaw;
  _fwd.set(-Math.sin(moveYaw), 0, -Math.cos(moveYaw));
  _right.set(Math.cos(moveYaw), 0, -Math.sin(moveYaw));
  let mx = intent.moveX;
  let my = intent.moveY;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  const w = c.activeWeapon;
  const firing = intent.fire && !!w && w.ammoInMag > 0 && w.def.class !== 'melee' && w.def.class !== 'throwable';
  const a = c.action;
  const sprintBlocked =
    c.isADS ||
    a.kind === 'useItem' ||
    a.kind === 'reload' ||
    a.kind === 'interact' ||
    c.lean !== 0 ||
    (c.stance === 'prone' && !knocked);
  // Sprint from prone stands up (PUBG behaviour).
  if (intent.sprint && !knocked && c.stance === 'prone' && my > 0.5 && c.stanceProgress >= 1) requestStance(c, 'stand');
  const sp = computeTargetSpeed({
    stance: c.stance,
    moveX: mx,
    moveY: my,
    sprint: intent.sprint,
    walk: intent.walk,
    aiming: c.isAiming,
    firing,
    weaponClass: w ? w.def.class : null,
    boost: c.boost,
    speedCap: c.actionSpeedCap(),
    sprintBlocked,
    knocked,
  });
  let speed = sp.speed;
  // Going prone takes the legs out: almost no movement during the drop.
  if (c.stance === 'prone' && c.stanceProgress < 1 && c.stanceFrom !== 'prone') speed *= 0.25;
  if (c.stanceFrom === 'prone' && c.stanceProgress < 0.6) speed *= 0.3;
  c.targetSpeed = speed;
  c.gait = sp.gait;
  c.isSprinting = sp.sprinting && c.isGrounded;
  let tx = 0;
  let tz = 0;
  if (speed > 0) {
    const dx = _fwd.x * my + _right.x * mx;
    const dz = _fwd.z * my + _right.z * mx;
    const l = Math.hypot(dx, dz) || 1;
    tx = (dx / l) * speed;
    tz = (dz / l) * speed;
  }
  const grounded = c.isGrounded;
  if (grounded) approachVelocity2(c.velocity.x, c.velocity.z, tx, tz, ACCEL, DECEL, dt, _v2);
  else approachVelocity2(c.velocity.x, c.velocity.z, tx, tz, AIR_ACCEL, AIR_ACCEL, dt, _v2);
  c.velocity.x = _v2[0];
  c.velocity.z = _v2[1];

  // ── jump / vault / climb ──
  const canGroundJump = grounded || c.coyoteTimer > 0;
  if (c.jumpBuffer > 0 && canGroundJump && !knocked && c.action.kind !== 'interact') {
    if (c.stance !== 'stand') {
      // Space while crouched/prone stands up (PUBG).
      requestStance(c, c.stance === 'prone' ? 'crouch' : 'stand');
      c.jumpBuffer = 0;
    } else {
      // Vault/climb if an obstacle is ahead (in the move direction if moving, else the facing).
      const hs = Math.hypot(c.velocity.x, c.velocity.z);
      if (hs > 0.5) _delta.set(c.velocity.x / hs, 0, c.velocity.z / hs);
      else _delta.copy(_fwd);
      // Only consider obstacles roughly in front of the view.
      if (_delta.dot(_fwd) < 0.3) _delta.copy(_fwd);
      const obstacle = grounded ? analyseObstacle(ctx.physics, c.body.collider, c.position, _delta) : null;
      c.jumpBuffer = 0;
      if (obstacle) {
        startTraversal(c, obstacle, _delta);
        return;
      }
      c.velocity.y = JUMP_VELOCITY;
      c.isGrounded = false;
      c.coyoteTimer = 0;
      c.lastJumpTime = now;
      c.fallStartY = c.position.y;
      ctx.events.emit('character:jump', { character: c });
      ctx.events.emit('noise', { kind: 'footstep', position: c.position.clone(), radius: 10, sourceId: c.id, teamId: c.teamId });
    }
  }

  // ── gravity ──
  c.velocity.y -= GRAVITY * dt;
  if (c.velocity.y < -80) c.velocity.y = -80;

  // ── collide & slide ──
  _prev.copy(c.position);
  _delta.set(c.velocity.x * dt, c.velocity.y * dt, c.velocity.z * dt);
  const wasGrounded = c.isGrounded;
  // While grounded, move horizontally only and let snap-to-ground follow slopes/steps down: a small
  // downward component makes Rapier's KCC intermittently report zero movement on cuboid/trimesh floors.
  if (wasGrounded && c.velocity.y <= 0) _delta.y = 0;
  const res = c.body.move(c.position, _delta, {
    autostep: wasGrounded && c.stance !== 'prone',
    snap: wasGrounded && c.velocity.y <= 0,
    withCharacters: true,
    stepUp: wasGrounded && c.stance !== 'prone' && c.velocity.y <= 0,
  });

  // Prone: the long body must fit after the move, else revert horizontally.
  if (c.stance === 'prone' && !knocked && (Math.abs(c.position.x - _prev.x) + Math.abs(c.position.z - _prev.z) > 1e-4)) {
    const pitch = samplePronePitch(c, c.bodyYaw);
    if (!c.body.proneBodyFits(c.position, c.bodyYaw, pitch)) {
      c.position.x = _prev.x;
      c.position.z = _prev.z;
      c.body.syncTo(c.position);
      c.velocity.x = c.velocity.z = 0;
    } else {
      c.pronePitch += (pitch - c.pronePitch) * Math.min(1, dt * 10);
    }
  }

  // Walls remove the velocity component pushing into them (slides keep the tangential part). Slopes and
  // steps are not walls: their shorter horizontal displacement must not feed back into the velocity.
  if (res.wallNormal) {
    const n = res.wallNormal;
    const nl = Math.hypot(n.x, n.z);
    if (nl > 1e-4) {
      const nx = n.x / nl, nz = n.z / nl;
      const into = c.velocity.x * nx + c.velocity.z * nz;
      if (into < 0) {
        c.velocity.x -= nx * into;
        c.velocity.z -= nz * into;
      }
    }
  }
  if (res.hitCeiling && c.velocity.y > 0) c.velocity.y = 0;

  if (res.grounded) {
    if (!wasGrounded) onLand(c, Math.max(0, -c.velocity.y));
    c.velocity.y = 0;
    c.isGrounded = true;
    c.airTime = 0;
    c.coyoteTimer = COYOTE_TIME;
    c.fallStartY = c.position.y;
    updateGroundInfo(c);
  } else {
    c.isGrounded = false;
    c.airTime += dt;
    c.coyoteTimer = Math.max(0, c.coyoteTimer - dt);
    if (c.position.y > c.fallStartY) c.fallStartY = c.position.y;
  }

  // ── water ──
  const water = ctx.world.getWaterHeight(c.position.x, c.position.z);
  if (water !== null && water - c.position.y > SWIM.enterDepth) {
    enterSwim(c, water);
    return;
  }

  // ── move state ──
  const hs = Math.hypot(c.velocity.x, c.velocity.z);
  if (knocked) c.moveState = 'knocked';
  else if (!c.isGrounded && c.airTime > 0.12) c.moveState = 'air';
  else if (hs < 0.25) c.moveState = 'idle';
  else if (c.isSprinting) c.moveState = 'sprint';
  else if (c.gait === 'walk' || hs < 2.2) c.moveState = 'walk';
  else c.moveState = 'run';

  if (c.isGrounded) emitFootsteps(c, hs, dt);
}

function onLand(c: Character, impactSpeed: number): void {
  const now = ctx.engine.simTime;
  c.lastLandTime = now;
  c.lastLandImpact = impactSpeed;
  updateGroundInfo(c);
  if (impactSpeed > 2.5) {
    ctx.events.emit('character:land', { character: c, impactSpeed, surface: c.groundSurface });
    ctx.events.emit('noise', { kind: 'footstep', position: c.position.clone(), radius: impactSpeed > 6 ? 25 : 12, sourceId: c.id, teamId: c.teamId });
  }
  const dmg = fallDamage(impactSpeed);
  if (dmg > 0 && c.lifeState !== 'dead') {
    applyCharacterDamage(c, { type: 'fall', amount: dmg, point: c.position.clone() });
  }
}

/** Ground normal + surface below the feet (one short ray). */
export function updateGroundInfo(c: Character): void {
  const hit = groundHit(ctx.physics, c.body.collider, c.position.x, c.position.y + 0.3, c.position.z, 0.8);
  if (hit) {
    c.groundNormal.copy(hit.normal);
    const info = hit.info;
    if (info && info.kind !== 'terrain') c.groundSurface = info.surface;
    else c.groundSurface = ctx.world.getSurface(c.position.x, c.position.z) ?? info?.surface ?? 'grass';
  } else {
    c.groundNormal.set(0, 1, 0);
  }
}

function updateLean(c: Character, dt: number): void {
  const intent = c.intent;
  let target = 0;
  const allowed = c.lifeState === 'alive' && c.stance !== 'prone' && !c.isSprinting && c.mode === 'ground' && c.action.kind !== 'interact';
  if (allowed && intent.lean !== 0) {
    // Head/shoulder clearance toward the lean side.
    c.rightVector(_right);
    const eyeH = c.stance === 'crouch' ? 1.05 : 1.5;
    _neck.set(c.position.x, c.position.y + eyeH, c.position.z);
    const clear = leanClearance(ctx.physics, c.body.collider, _neck, _right, intent.lean, LEAN_OFFSET);
    target = intent.lean * clear;
  }
  const rate = dt / LEAN_TIME;
  const d = target - c.lean;
  c.lean = Math.abs(d) <= rate ? target : c.lean + Math.sign(d) * rate;
}
