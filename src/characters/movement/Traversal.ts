// Vault (over 0.5–1.1 m obstacles ≤ 1 m thick) and climb (onto ledges up to 2.1 m): scripted, pre-validated
// feet paths. The probes in probes.ts guarantee the body fits along the path, so no collision is needed here.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import { clamp, lerp, smoothstep } from '../../core/math';
import type { Character } from '../Character';
import type { ObstacleInfo } from './probes';
import { CAPSULE_RADIUS, VAULT } from '../constants';

const _h = new THREE.Vector3();

export function traversalDuration(info: ObstacleInfo, sprinting: boolean): number {
  if (info.kind === 'vault') return VAULT.vaultDuration * (0.8 + 0.2 * clamp(info.height / VAULT.maxHeight, 0, 1)) * (sprinting ? 0.88 : 1);
  return lerp(VAULT.lowClimbDuration, VAULT.climbDuration, clamp((info.height - 0.5) / (VAULT.climbMaxHeight - 0.5), 0, 1));
}

export function startTraversal(c: Character, info: ObstacleInfo, dir: THREE.Vector3): void {
  const hs = Math.hypot(c.velocity.x, c.velocity.z);
  c.traversal = {
    kind: info.kind,
    t: 0,
    duration: traversalDuration(info, c.isSprinting),
    start: c.position.clone(),
    end: info.end.clone(),
    info,
    dir: dir.clone().setY(0).normalize(),
    exitSpeed: info.kind === 'vault' ? Math.max(2.2, Math.min(hs, 5)) : 0,
  };
  c.mode = 'traversal';
  c.moveState = 'vault';
  c.lean = 0;
  c.isSprinting = false;
  if (c.action.kind === 'useItem' || c.action.kind === 'interact') c.cancelAction();
  c.bodyYaw = Math.atan2(-dir.x, -dir.z);
  if (c.stance !== 'stand') {
    c.stance = 'stand';
    c.stanceProgress = 1;
  }
  c.body.setShape('stand', c.position);
  ctx.events.emit('character:vault', { character: c, kind: info.kind, height: info.height });
  ctx.events.emit('noise', { kind: 'footstep', position: c.position.clone(), radius: 15, sourceId: c.id, teamId: c.teamId });
}

/**
 * Feet position along the traversal path at normalized time t (0..1).
 * Exported for unit tests.
 */
export function traversalPoint(
  kind: 'vault' | 'climb',
  start: THREE.Vector3,
  end: THREE.Vector3,
  dir: THREE.Vector3,
  faceDist: number,
  thickness: number,
  topY: number,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const total = Math.hypot(end.x - start.x, end.z - start.z);
  let s: number;
  let y: number;
  if (kind === 'vault') {
    // Horizontal progress: slight ease-in-out.
    const e = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
    s = total * e;
    const sRise = Math.max(0.05, faceDist - CAPSULE_RADIUS);
    const sFall = Math.min(total - 0.05, faceDist + thickness + CAPSULE_RADIUS - 0.05);
    const clearY = topY + 0.1;
    if (s <= sRise) {
      y = lerp(start.y, clearY, smoothstep(0, sRise, s));
    } else if (s <= sFall) {
      const k = (s - sRise) / Math.max(0.01, sFall - sRise);
      y = clearY + Math.sin(k * Math.PI) * 0.12;
    } else {
      const k = (s - sFall) / Math.max(0.01, total - sFall);
      y = lerp(clearY, end.y, k * k);
    }
  } else {
    // Climb: approach the wall, rise, then step onto the ledge.
    const wallS = Math.max(0, Math.min(faceDist - CAPSULE_RADIUS + 0.02, total));
    const riseEnd = 0.72;
    const sApproach = wallS * smoothstep(0, 0.25, t);
    const sOnto = smoothstep(riseEnd - 0.08, 1, t);
    s = sApproach + (total - wallS) * sOnto;
    const rise = smoothstep(0.05, riseEnd, t);
    y = lerp(start.y, end.y + 0.04, rise);
  }
  out.set(start.x + dir.x * s, y, start.z + dir.z * s);
  return out;
}

export function updateTraversal(c: Character, dt: number): void {
  const tr = c.traversal;
  if (!tr) {
    c.mode = 'ground';
    return;
  }
  tr.t = Math.min(1, tr.t + dt / tr.duration);
  traversalPoint(tr.kind, tr.start, tr.end, tr.dir, tr.info.faceDist, tr.info.thickness, tr.info.topY, tr.t, _h);
  if (dt > 0) c.velocity.set((_h.x - c.position.x) / dt, (_h.y - c.position.y) / dt, (_h.z - c.position.z) / dt);
  c.position.copy(_h);
  c.body.syncTo(c.position);
  c.moveState = 'vault';
  if (tr.t >= 1) {
    c.traversal = null;
    c.mode = 'ground';
    c.velocity.set(tr.dir.x * tr.exitSpeed, 0, tr.dir.z * tr.exitSpeed);
    c.isGrounded = tr.info.kind === 'climb' || Math.abs(tr.end.y - c.position.y) < 0.05;
    c.airTime = 0;
    c.fallStartY = c.position.y;
    if (tr.info.endStance === 'crouch') {
      c.body.setShape('crouch', c.position);
      c.beginStance('crouch');
    }
  }
}
