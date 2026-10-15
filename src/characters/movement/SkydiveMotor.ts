// Freefall + parachute flight model (DESIGN §1). Entered via setMoveState('freefall') by the match module.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { angleDiff, clamp, lerp, wrapAngle } from '../../core/math';
import type { Character } from '../Character';
import { SKYDIVE, STANCE_HEIGHT } from '../constants';
import { groundHeightAt } from './probes';
import { enterSwim } from './SwimMotor';
import { updateGroundInfo } from './GroundMotor';
import { applyCharacterDamage } from '../damage';
import { fallDamage } from './speed';

const _delta = new THREE.Vector3();

export function enterSkydive(c: Character, chuteOpen: boolean): void {
  c.mode = 'skydive';
  c.traversal = null;
  c.vehicle = null;
  c.lean = 0;
  c.isGrounded = false;
  c.isSprinting = false;
  c.stance = 'stand';
  c.stanceProgress = 1;
  c.stanceHeight = STANCE_HEIGHT.stand;
  c.body.setEnabled(true);
  c.body.setShape('stand', c.position);
  c.visual?.setVisible(true);
  c.sky.phase = chuteOpen ? 'parachute' : 'freefall';
  c.sky.time = 0;
  c.sky.chuteOpen = chuteOpen ? 1 : 0;
  c.moveState = chuteOpen ? 'parachute' : 'freefall';
  c.bodyYaw = c.yaw;
  if (!chuteOpen) ctx.events.emit('character:parachute', { character: c, phase: 'jump' });
}

/** Height above the ground/water/roofs below (m). */
function heightAboveGround(c: Character): number {
  const p = c.position;
  let ground = ctx.world.getHeight(p.x, p.z);
  const w = ctx.world.getWaterHeight(p.x, p.z);
  if (w !== null && w > ground) ground = w;
  let agl = p.y - ground;
  if (agl < 260) {
    // Roofs and props: physics ray (only near the ground to keep it cheap).
    const hit = groundHeightAt(ctx.physics, c.body.collider, p.x, p.y - 0.05, p.z, agl + 2);
    if (hit !== null && p.y - hit < agl) agl = p.y - hit;
  }
  return agl;
}

/** Target velocities for the current input (exported for tests/tuning). */
export function skydiveTargets(
  phase: 'freefall' | 'parachute',
  moveX: number,
  moveY: number,
  pitch: number,
): { forward: number; strafe: number; descent: number } {
  if (phase === 'freefall') {
    const dive = clamp(-pitch / 1.1, 0, 1);
    if (moveY > 0.1) {
      return {
        forward: lerp(SKYDIVE.freefallGlideForward, SKYDIVE.diveForward, dive) * moveY,
        strafe: moveX * SKYDIVE.freefallStrafe,
        descent: lerp(SKYDIVE.freefallVertical, SKYDIVE.diveVertical, dive),
      };
    }
    if (moveY < -0.1) return { forward: -3, strafe: moveX * SKYDIVE.freefallStrafe, descent: SKYDIVE.freefallBrakeVertical };
    return { forward: SKYDIVE.freefallNeutralForward, strafe: moveX * SKYDIVE.freefallStrafe, descent: SKYDIVE.freefallVertical };
  }
  if (moveY > 0.1) return { forward: SKYDIVE.chuteForward, strafe: moveX * SKYDIVE.chuteStrafe, descent: SKYDIVE.chuteForwardDescent };
  if (moveY < -0.1) return { forward: SKYDIVE.chuteBrakeForward, strafe: moveX * SKYDIVE.chuteStrafe, descent: SKYDIVE.chuteBrakeDescent };
  return { forward: SKYDIVE.chuteNeutralForward, strafe: moveX * SKYDIVE.chuteStrafe, descent: SKYDIVE.chuteNeutralDescent };
}

export function updateSkydive(c: Character, dt: number): void {
  const intent = c.intent;
  const sky = c.sky;
  sky.time += dt;
  sky.agl = heightAboveGround(c);

  // Auto-deploy at 120 m AGL.
  if (sky.phase === 'freefall' && sky.agl <= SKYDIVE.autoDeployAgl) c.deployParachute();
  if (sky.phase === 'parachute') sky.chuteOpen = Math.min(1, sky.chuteOpen + dt / SKYDIVE.chuteOpenTime);

  // Body yaw follows the camera yaw (unless free-looking).
  if (!intent.freeLook) {
    const rate = sky.phase === 'freefall' ? SKYDIVE.freefallTurnRate : SKYDIVE.chuteTurnRate;
    const d = angleDiff(c.bodyYaw, c.yaw);
    c.bodyYaw = wrapAngle(c.bodyYaw + clamp(d, -rate * dt, rate * dt));
  }

  const tgt = skydiveTargets(sky.phase, intent.moveX, intent.moveY, c.pitch);
  const fx = -Math.sin(c.bodyYaw), fz = -Math.cos(c.bodyYaw);
  const rx = Math.cos(c.bodyYaw), rz = -Math.sin(c.bodyYaw);
  const tvx = fx * tgt.forward + rx * tgt.strafe;
  const tvz = fz * tgt.forward + rz * tgt.strafe;
  // Canopy opening: strong deceleration while the chute inflates.
  const accel = sky.phase === 'freefall' ? SKYDIVE.freefallAccel : lerp(30, SKYDIVE.chuteAccel, sky.chuteOpen);
  const vAccel = sky.phase === 'freefall' ? SKYDIVE.freefallAccel : lerp(40, 6, sky.chuteOpen);
  const step = accel * dt;
  const dx = tvx - c.velocity.x, dz = tvz - c.velocity.z;
  const dl = Math.hypot(dx, dz);
  if (dl <= step) {
    c.velocity.x = tvx;
    c.velocity.z = tvz;
  } else {
    c.velocity.x += (dx / dl) * step;
    c.velocity.z += (dz / dl) * step;
  }
  const dy = -tgt.descent - c.velocity.y;
  c.velocity.y += clamp(dy, -vAccel * dt, vAccel * dt);

  _delta.set(c.velocity.x * dt, c.velocity.y * dt, c.velocity.z * dt);
  const res = c.body.move(c.position, _delta, { autostep: false, snap: false, withCharacters: false });
  c.moveState = sky.phase === 'freefall' ? 'freefall' : 'parachute';

  // Water landing.
  const w = ctx.world.getWaterHeight(c.position.x, c.position.z);
  if (w !== null && c.position.y < w - 0.3) {
    land(c, true);
    enterSwim(c, w);
    return;
  }
  if (res.grounded || sky.agl < 0.05) land(c, false);
}

function land(c: Character, water: boolean): void {
  const wasChute = c.sky.phase === 'parachute';
  const impact = -c.velocity.y;
  c.mode = 'ground';
  c.isGrounded = !water;
  c.airTime = 0;
  c.lastLandTime = ctx.engine.simTime;
  c.lastLandImpact = impact;
  c.velocity.y = 0;
  c.velocity.x *= 0.35;
  c.velocity.z *= 0.35;
  c.moveState = 'idle';
  c.bodyYaw = c.yaw;
  if (!water) updateGroundInfo(c);
  if (wasChute) ctx.events.emit('character:parachute', { character: c, phase: 'land' });
  ctx.events.emit('character:land', { character: c, impactSpeed: impact, surface: water ? 'water' : c.groundSurface });
  if (!wasChute && !water && impact > 9) {
    // Freefall into the ground (e.g. a roof below the auto-deploy height) — handled as a normal fall.
    applyCharacterDamage(c, { type: 'fall', amount: fallDamage(impact) });
  }
}
